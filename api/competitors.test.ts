import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";

/* ---- shared mock fns (hoisted so the vi.mock factories can close over them) ---- */
const { anthropicCreate, redisIncr, redisExpire, resolveMx, resolve4 } = vi.hoisted(() => ({
  anthropicCreate: vi.fn(),
  redisIncr: vi.fn(),
  redisExpire: vi.fn(),
  resolveMx: vi.fn(),
  resolve4: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: anthropicCreate };
  },
}));

vi.mock("@upstash/redis", () => ({
  Redis: class {
    incr = redisIncr;
    expire = redisExpire;
    static fromEnv() {
      return new this();
    }
  },
}));

vi.mock("node:dns", () => ({
  promises: { resolveMx, resolve: resolve4 },
}));

import handler, {
  buildNotes,
  cleanDomain,
  parseModelSuggestions,
  stripFences,
  verifySuggestions,
  type CompetitorSuggestion,
  type CompetitorsResponse,
  type RawSuggestion,
} from "./competitors";

/* ---- request / response test doubles ---- */
function makeRes() {
  const state: { statusCode: number; body: unknown; headers: Record<string, string> } = {
    statusCode: 0,
    body: undefined,
    headers: {},
  };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      state.body = payload;
      return res;
    },
    setHeader(key: string, value: string) {
      state.headers[key] = value;
      return res;
    },
    end() {
      return res;
    },
  };
  return { res: res as unknown as VercelResponse, state };
}

function makeReq(opts: {
  method?: string;
  headers?: Record<string, string | string[]>;
  body?: unknown;
}): VercelRequest {
  return {
    method: opts.method ?? "POST",
    headers: opts.headers ?? {},
    body: opts.body,
    socket: { remoteAddress: "203.0.113.7" },
  } as unknown as VercelRequest;
}

const KEY = "test-shared-secret";
const goodHeaders = { "x-aedlp-key": KEY };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.COMPETITORS_SHARED_SECRET = KEY;
  process.env.ANTHROPIC_API_KEY = "sk-test";
  process.env.UPSTASH_REDIS_REST_URL = "https://store.example";
  process.env.UPSTASH_REDIS_REST_TOKEN = "token";
  // Default: under the rate limit, domains resolve, model returns one competitor.
  redisIncr.mockResolvedValue(1);
  redisExpire.mockResolvedValue(1);
  resolveMx.mockResolvedValue([{ exchange: "mail.example", priority: 10 }]);
  resolve4.mockResolvedValue(["93.184.216.34"]);
  anthropicCreate.mockResolvedValue({
    stop_reason: "end_turn",
    content: [
      {
        type: "text",
        text: JSON.stringify([
          { name: "Globex", domain: "globex-industries.example", confidence: "high", rationale: "Direct rival." },
        ]),
      },
    ],
  });
});

afterEach(() => {
  delete process.env.COMPETITORS_SHARED_SECRET;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

describe("pure parsing helpers", () => {
  it("parses a well-formed JSON array", () => {
    const out = parseModelSuggestions(
      '[{"name":"Globex","domain":"globex.com","confidence":"high","rationale":"Rival"}]',
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: "Globex", domain: "globex.com", confidence: "high", rationale: "Rival" });
  });

  it("tolerates ```json fenced output", () => {
    const out = parseModelSuggestions(
      '```json\n[{"name":"Initech","domain":"initech.com","confidence":"medium","rationale":"x"}]\n```',
    );
    expect(out).toHaveLength(1);
    expect(out[0].domain).toBe("initech.com");
    expect(out[0].confidence).toBe("medium");
  });

  it("tolerates prose around the JSON array", () => {
    const out = parseModelSuggestions(
      'Here are the competitors I found:\n[{"name":"Contoso","domain":"contoso.com","confidence":"low","rationale":"y"}]\nHope this helps!',
    );
    expect(out).toHaveLength(1);
    expect(out[0].domain).toBe("contoso.com");
  });

  it("accepts an object-wrapped array and defaults missing/garbled confidence to low", () => {
    const out = parseModelSuggestions('{"competitors":[{"name":"Acme","domain":"acme.com"}]}');
    expect(out).toHaveLength(1);
    expect(out[0].confidence).toBe("low");
  });

  it("cleans domains and de-dupes by host", () => {
    const out = parseModelSuggestions(
      JSON.stringify([
        { name: "A", domain: "https://www.Globex.com/about", confidence: "high", rationale: "" },
        { name: "A dup", domain: "globex.com", confidence: "high", rationale: "" },
        { name: "B", domain: "contact@beta.io", confidence: "medium", rationale: "" },
      ]),
    );
    expect(out.map((s) => s.domain)).toEqual(["globex.com", "beta.io"]);
  });

  it("returns [] for unparseable / non-array output", () => {
    expect(parseModelSuggestions("Sorry, I can't help with that.")).toEqual([]);
    expect(parseModelSuggestions("")).toEqual([]);
    expect(parseModelSuggestions('{"foo":"bar"}')).toEqual([]);
  });

  it("stripFences and cleanDomain behave", () => {
    expect(stripFences("```\nhello\n```")).toBe("hello");
    expect(cleanDomain("HTTPS://WWW.Example.COM/x")).toBe("example.com");
    expect(cleanDomain("not a domain")).toBe("");
    expect(cleanDomain("@globex.example")).toBe("globex.example");
  });
});

describe("handler — auth and validation", () => {
  it("rejects a non-POST method with 405", async () => {
    const { res, state } = makeRes();
    await handler(makeReq({ method: "GET", headers: goodHeaders }), res);
    expect(state.statusCode).toBe(405);
    expect(anthropicCreate).not.toHaveBeenCalled();
  });

  it("rejects a missing x-aedlp-key with 401 and does nothing else", async () => {
    const { res, state } = makeRes();
    await handler(makeReq({ headers: {}, body: { company: "Globex" } }), res);
    expect(state.statusCode).toBe(401);
    expect(redisIncr).not.toHaveBeenCalled();
    expect(anthropicCreate).not.toHaveBeenCalled();
  });

  it("rejects a wrong x-aedlp-key with 401", async () => {
    const { res, state } = makeRes();
    await handler(makeReq({ headers: { "x-aedlp-key": "nope" }, body: { company: "Globex" } }), res);
    expect(state.statusCode).toBe(401);
    expect(anthropicCreate).not.toHaveBeenCalled();
  });

  it("rejects an empty company with 400", async () => {
    const { res, state } = makeRes();
    await handler(makeReq({ headers: goodHeaders, body: { company: "   " } }), res);
    expect(state.statusCode).toBe(400);
    expect(anthropicCreate).not.toHaveBeenCalled();
  });
});

describe("handler — rate limiting", () => {
  it("returns 429 with Retry-After when over the per-minute limit", async () => {
    redisIncr.mockResolvedValueOnce(11); // 11th request in the minute window
    const { res, state } = makeRes();
    await handler(makeReq({ headers: goodHeaders, body: { company: "Globex" } }), res);
    expect(state.statusCode).toBe(429);
    expect(state.headers["Retry-After"]).toBe("60");
    expect(anthropicCreate).not.toHaveBeenCalled();
  });

  it("returns 429 when over the daily cap", async () => {
    redisIncr.mockResolvedValueOnce(1); // minute ok
    redisIncr.mockResolvedValueOnce(101); // day over cap
    const { res, state } = makeRes();
    await handler(makeReq({ headers: goodHeaders, body: { company: "Globex" } }), res);
    expect(state.statusCode).toBe(429);
    expect(anthropicCreate).not.toHaveBeenCalled();
  });

  it("fails closed with 503 when the store is unreachable", async () => {
    redisIncr.mockRejectedValueOnce(new Error("store down"));
    const { res, state } = makeRes();
    await handler(makeReq({ headers: goodHeaders, body: { company: "Globex" } }), res);
    expect(state.statusCode).toBe(503);
    expect(anthropicCreate).not.toHaveBeenCalled();
  });
});

describe("handler — happy path", () => {
  it("returns verified competitor suggestions and notes", async () => {
    const { res, state } = makeRes();
    await handler(makeReq({ headers: goodHeaders, body: { company: "Initech", industry: "software" } }), res);

    expect(state.statusCode).toBe(200);
    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    const payload = state.body as CompetitorsResponse;
    expect(payload.suggestions).toHaveLength(1);
    expect(payload.suggestions[0]).toMatchObject({
      name: "Globex",
      domain: "globex-industries.example",
      confidence: "high",
      verified: true,
    });
    expect(typeof payload.notes).toBe("string");
    expect(payload.notes).toContain("1");
  });

  it("flags unverified domains instead of dropping them", async () => {
    resolveMx.mockRejectedValue(new Error("no mx"));
    resolve4.mockRejectedValue(new Error("nxdomain"));
    const { res, state } = makeRes();
    await handler(makeReq({ headers: goodHeaders, body: { company: "Initech" } }), res);

    const payload = state.body as CompetitorsResponse;
    expect(payload.suggestions).toHaveLength(1);
    expect(payload.suggestions[0].verified).toBe(false);
  });

  it("returns 502 when the model call throws", async () => {
    anthropicCreate.mockRejectedValueOnce(new Error("upstream"));
    const { res, state } = makeRes();
    await handler(makeReq({ headers: goodHeaders, body: { company: "Initech" } }), res);
    expect(state.statusCode).toBe(502);
  });

  it("returns a clean 200 with a hint note when the model returns no usable suggestions", async () => {
    // No web search and no tools: a single model call. If it answers with nothing
    // parseable (e.g. a refusal), the handler still returns 200 with empty results
    // and a note nudging toward a more specific query — never a 5xx.
    anthropicCreate.mockResolvedValue({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "I'm not able to determine that." }],
    });
    const { res, state } = makeRes();
    await handler(makeReq({ headers: goodHeaders, body: { company: "Globex" } }), res);

    expect(state.statusCode).toBe(200);
    // Exactly one call now — there is no web-search pause/resume loop to drive.
    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    const payload = state.body as CompetitorsResponse;
    expect(payload.suggestions).toEqual([]);
    expect(payload.notes).toMatch(/no competitor suggestions|more specific/i);
  });

  it("makes a single, tool-free model call on the happy path (no web-search loop)", async () => {
    const { res, state } = makeRes();
    await handler(makeReq({ headers: goodHeaders, body: { company: "Initech" } }), res);

    expect(state.statusCode).toBe(200);
    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    // The request carries no tools — the lookup runs purely on model knowledge.
    const request = anthropicCreate.mock.calls[0][0] as { tools?: unknown };
    expect(request.tools).toBeUndefined();
  });
});

describe("handler — competitor ceiling (raised to 30)", () => {
  const makeItems = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      name: `Competitor ${i}`,
      domain: `competitor${i}.example`,
      confidence: "medium",
      rationale: "Overlapping product line.",
    }));

  const modelReturns = (items: unknown[]) =>
    anthropicCreate.mockResolvedValue({
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify(items) }],
    });

  it("returns a full 30-item reply without truncating, and DNS-verifies every row", async () => {
    modelReturns(makeItems(30));
    const { res, state } = makeRes();
    await handler(makeReq({ headers: goodHeaders, body: { company: "Globex" } }), res);

    expect(state.statusCode).toBe(200);
    const payload = state.body as CompetitorsResponse;
    expect(payload.suggestions).toHaveLength(30);
    // Nothing is dropped or left unchecked: the verification bound tracks the cap,
    // so all 30 are genuinely DNS-verified rather than auto-flagged unverified.
    expect(payload.suggestions.every((s) => s.verified)).toBe(true);
  });

  it("enforces the ceiling: a longer reply is capped at 30, never more", async () => {
    modelReturns(makeItems(40));
    const { res, state } = makeRes();
    await handler(makeReq({ headers: goodHeaders, body: { company: "Globex" } }), res);

    const payload = state.body as CompetitorsResponse;
    expect(payload.suggestions).toHaveLength(30);
  });

  it("raises the output-token budget and tells the model the cap is a ceiling, not a target", async () => {
    const { res } = makeRes();
    await handler(makeReq({ headers: goodHeaders, body: { company: "Globex" } }), res);

    const request = anthropicCreate.mock.calls[0][0] as { max_tokens: number; system: string };
    // Enough headroom for 30 compact rows with rationales (the old budget was 1536).
    expect(request.max_tokens).toBeGreaterThanOrEqual(3000);
    expect(request.system).toContain("30");
    expect(request.system).toMatch(/ceiling, not a target/i);
    expect(request.system).toMatch(/never pad/i);
  });
});

describe("buildNotes", () => {
  const sample: CompetitorSuggestion = {
    name: "Globex",
    domain: "globex.example",
    confidence: "high",
    verified: true,
    rationale: "rival",
  };

  it("summarises a normal result as model-suggested + DNS-checked (no 'web search')", () => {
    const note = buildNotes([sample], 1, false);
    expect(note).toMatch(/Found 1 competitor suggestion/);
    expect(note).toMatch(/model-suggested and DNS-checked/i);
    expect(note).not.toMatch(/web search/i);
  });

  it("nudges toward a narrower query when the internal deadline backstop fires", () => {
    expect(buildNotes([], 0, true)).toMatch(/too long|narrower/i);
  });

  it("explains an empty, non-timed-out result", () => {
    expect(buildNotes([], 0, false)).toMatch(/No competitor suggestions/i);
  });
});

describe("verifySuggestions — non-blocking", () => {
  const item: RawSuggestion = {
    name: "Globex",
    domain: "globex.example",
    confidence: "high",
    rationale: "rival",
  };

  it("skips DNS entirely and flags unverified when the budget is exhausted", async () => {
    const out = await verifySuggestions([item], 0);
    expect(out).toEqual([{ ...item, verified: false }]);
    // With no budget, verification must not even touch DNS — it can never block.
    expect(resolveMx).not.toHaveBeenCalled();
    expect(resolve4).not.toHaveBeenCalled();
  });

  it("verifies in parallel and never drops suggestions when there is budget", async () => {
    const out = await verifySuggestions([item], 5000);
    expect(out).toEqual([{ ...item, verified: true }]);
    expect(resolveMx).toHaveBeenCalledTimes(1);
  });
});
