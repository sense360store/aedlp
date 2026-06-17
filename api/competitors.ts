/* ============================================================
   GenAI competitor lookup — Vercel serverless function (Node).

   This is the ONE backend endpoint in an otherwise fully static,
   client-side app. It takes a company name (and optional industry),
   asks Claude — from its own knowledge, no web search — for that
   company's main competitors and their primary corporate email
   domains, verifies those domains server-side by DNS, and returns
   reviewable suggestions.

   Why no web search: grounding the lookup on live web search did not
   finish inside Vercel's 60s Hobby ceiling, so the function kept
   aborting at its internal deadline and returning empty results. A
   plain model-knowledge call answers in a few seconds. DNS
   verification (below) is now the primary safeguard against a wrong or
   hallucinated domain — every suggestion is flagged verified or not,
   and unverified rows are kept (flagged), never dropped.

   The only data that leaves the browser is the company name (and
   optional industry) the user types. Nothing here is auto-applied: the
   front end shows the results for review and the user curates them into
   a recipient-domain condition by hand.

   Time budget: vercel.json caps this function at 60s (the Hobby
   ceiling). The model call returns well inside that; the handler still
   runs under an internal ~45s deadline (AbortController) as a backstop
   and, if it ever fires, returns a clean partial JSON response asking
   for a narrower query rather than letting Vercel hard-kill it with a
   504.

   Secrets used (server env, never echoed):
     - ANTHROPIC_API_KEY            Claude API key
     - COMPETITORS_SHARED_SECRET    must match the x-aedlp-key header
     - Upstash / Vercel-KV REST vars for the rate-limit store
   ============================================================ */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";
import { Redis } from "@upstash/redis";
import { promises as dns } from "node:dns";

/* ---------------- shared wire types ---------------- */

export type Confidence = "high" | "medium" | "low";

/** One reviewable competitor suggestion returned to the browser. */
export interface CompetitorSuggestion {
  name: string;
  domain: string;
  confidence: Confidence;
  verified: boolean;
  rationale: string;
}

/** A normalised, pre-verification suggestion parsed from the model. */
export interface RawSuggestion {
  name: string;
  domain: string;
  confidence: Confidence;
  rationale: string;
}

export interface CompetitorsResponse {
  suggestions: CompetitorSuggestion[];
  notes: string;
}

/* ---------------- tunables ---------------- */

// Lookup model. The default path uses no tools — just the model's own
// knowledge — so any current model works. Sonnet 4.6 is the pick for its
// stronger recall of real corporate domains (fewer wrong guesses for DNS
// verification to catch) while still answering in a few seconds. For a faster,
// cheaper lookup, switch to the dated Haiku id "claude-haiku-4-5-20251001" —
// always the dated id, never the bare "claude-haiku-4-5".
const MODEL = "claude-sonnet-4-6";

// The single, easy-to-find ceiling on how many competitor suggestions we ask for
// and return. It is a CEILING, not a target: the prompts below tell the model to
// return only genuine competitors and never pad the list to reach it.
const MAX_COMPETITORS = 30; // cap how many suggestions we ask for / return
// Output cap sized for the ceiling: comfortably fits MAX_COMPETITORS compact rows
// (name + domain + confidence + a one-line rationale) as strict JSON without
// truncating. A real 30-row reply is ~1.5k tokens, so this leaves wide headroom
// while staying small enough that generation finishes well inside the time budget.
const MAX_OUTPUT_TOKENS = 4096;
// Verify every suggestion we'd return. DNS checks run in parallel under
// VERIFY_BUDGET_MS, so tracking the cap costs no extra wall-clock; keeping this at
// the cap preserves the original behaviour where nothing is returned unverified
// merely because the verification bound was lower than the list.
const MAX_DOMAINS_VERIFIED = MAX_COMPETITORS; // bound the verification work
const RATE_PER_MINUTE = 10;
const RATE_PER_DAY = 100;
const DNS_TIMEOUT_MS = 1500; // short per-domain DNS timeout

// Internal time budget, all measured from the start of the work phase. We keep a
// hard deadline below Vercel's 60s ceiling and reserve room to verify + respond,
// so the function returns a clean payload instead of timing out.
const OVERALL_BUDGET_MS = 45_000; // hard internal deadline (AbortController)
const VERIFY_BUDGET_MS = 8_000; // overall cap on DNS verification
const RESPONSE_RESERVE_MS = 1_500; // headroom to serialize + send the response

/* ---------------- input validation ---------------- */

/** Parse the request body (object or JSON string) without throwing. */
export function readBody(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const v: unknown = JSON.parse(raw);
      if (v && typeof v === "object") return v as Record<string, unknown>;
    } catch {
      /* fall through to empty */
    }
  }
  return {};
}

/** Return a trimmed company name, or null when missing/empty. */
export function readCompany(body: Record<string, unknown>): string | null {
  const c = body.company;
  if (typeof c !== "string") return null;
  const trimmed = c.trim();
  return trimmed.length ? trimmed.slice(0, 200) : null;
}

export function readIndustry(body: Record<string, unknown>): string | undefined {
  const i = body.industry;
  if (typeof i !== "string") return undefined;
  const trimmed = i.trim();
  return trimmed.length ? trimmed.slice(0, 120) : undefined;
}

/* ---------------- model-output parsing (defensive) ---------------- */

/** Strip a single ```json … ``` (or bare ```) fence if the model added one. */
export function stripFences(raw: string): string {
  const s = raw.trim();
  const fenced = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : s;
}

/** Reduce a freeform domain/email/URL to a bare lowercase host, or "" if unusable. */
export function cleanDomain(input: unknown): string {
  if (typeof input !== "string") return "";
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/^mailto:/, "");
  d = d.replace(/^[^@]*@/, ""); // drop any local-part / leading @
  d = d.replace(/[/?#].*$/, ""); // drop path / query / fragment
  d = d.replace(/^www\./, "").replace(/\.+$/, "");
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(d) ? d : "";
}

function normalizeConfidence(input: unknown): Confidence {
  const v = typeof input === "string" ? input.trim().toLowerCase() : "";
  if (v === "high" || v === "medium" || v === "low") return v;
  return "low"; // conservative default when the model omits / garbles it
}

function normalizeItem(item: unknown): RawSuggestion | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  const domain = cleanDomain(o.domain ?? o.email_domain ?? o.website);
  if (!domain) return null;
  const name = typeof o.name === "string" && o.name.trim() ? o.name.trim() : domain;
  const rationale =
    typeof o.rationale === "string"
      ? o.rationale.trim()
      : typeof o.reason === "string"
        ? o.reason.trim()
        : "";
  return { name, domain, confidence: normalizeConfidence(o.confidence), rationale };
}

/**
 * Parse the model's reply into normalised suggestions. Tolerates code fences,
 * prose around the JSON, and the array being wrapped in an object. Returns []
 * rather than throwing on anything it cannot understand. De-dupes by domain.
 */
export function parseModelSuggestions(raw: string): RawSuggestion[] {
  if (!raw || !raw.trim()) return [];
  const cleaned = stripFences(raw);

  const tryParse = (text: string): unknown => {
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  };

  let data: unknown = tryParse(cleaned);
  if (data === undefined) {
    // Locate the outermost array embedded in noisy output.
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start !== -1 && end > start) data = tryParse(cleaned.slice(start, end + 1));
  }

  let arr: unknown[] | null = null;
  if (Array.isArray(data)) {
    arr = data;
  } else if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    const nested = o.competitors ?? o.suggestions ?? o.results;
    if (Array.isArray(nested)) arr = nested;
  }
  if (!arr) return [];

  const out: RawSuggestion[] = [];
  const seen = new Set<string>();
  for (const item of arr) {
    const norm = normalizeItem(item);
    if (norm && !seen.has(norm.domain)) {
      seen.add(norm.domain);
      out.push(norm);
    }
  }
  return out;
}

/* ---------------- rate-limit store ---------------- */

/**
 * Build the Upstash client. Prefer the native Upstash env names; fall back to
 * the Vercel-KV names the connected store may inject instead. Throws when
 * neither pair is present so the caller can fail closed.
 */
export function getRedis(): Redis {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return Redis.fromEnv();
  }
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (url && token) return new Redis({ url, token });
  throw new Error("rate-limit store not configured");
}

export function clientIp(req: VercelRequest): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length) return xff.split(",")[0].trim();
  if (Array.isArray(xff) && xff.length) return xff[0];
  return req.socket?.remoteAddress ?? "unknown";
}

export interface RateVerdict {
  ok: boolean;
  scope?: "minute" | "day";
  retryAfter?: number;
}

/**
 * Fixed-window counters per client IP: RATE_PER_MINUTE/min and RATE_PER_DAY/day.
 * The TTL is set only on the first increment of each window. Throws on store
 * errors so the handler can fail closed (503) rather than skip the limit.
 */
export async function checkRateLimit(redis: Redis, ip: string): Promise<RateVerdict> {
  const minuteKey = `aedlp:cl:m:${ip}`;
  const minute = await redis.incr(minuteKey);
  if (minute === 1) await redis.expire(minuteKey, 60);
  if (minute > RATE_PER_MINUTE) return { ok: false, scope: "minute", retryAfter: 60 };

  const dayKey = `aedlp:cl:d:${ip}`;
  const day = await redis.incr(dayKey);
  if (day === 1) await redis.expire(dayKey, 86400);
  if (day > RATE_PER_DAY) return { ok: false, scope: "day", retryAfter: 3600 };

  return { ok: true };
}

/* ---------------- domain verification ---------------- */

/**
 * Lightweight liveness check: an MX record, else any A/AAAA record. Both lookups
 * share a single per-domain timeout — on timeout (or any error) it resolves false
 * (treated as "unverified") and never rejects, so it is safe under Promise.allSettled.
 */
export function verifyDomain(domain: string, timeoutMs: number = DNS_TIMEOUT_MS): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    const settle = (v: boolean) => {
      clearTimeout(timer);
      resolve(v);
    };
    void (async () => {
      try {
        const mx = await dns.resolveMx(domain);
        if (Array.isArray(mx) && mx.length > 0) return settle(true);
      } catch {
        /* no MX — fall through to an address lookup */
      }
      try {
        const addrs = await dns.resolve(domain);
        settle(Array.isArray(addrs) && addrs.length > 0);
      } catch {
        settle(false);
      }
    })();
  });
}

/**
 * Verify up to MAX_DOMAINS_VERIFIED domains in parallel, but never let
 * verification push past its time budget. Every suggestion starts flagged
 * unverified and is flipped to verified only if its DNS check resolves in time —
 * so a slow or exhausted budget degrades to "unverified", never to a hang. Nothing
 * is ever dropped: suggestions beyond the cap stay, flagged unverified.
 */
export async function verifySuggestions(
  items: RawSuggestion[],
  budgetMs: number,
): Promise<CompetitorSuggestion[]> {
  const capped = items.slice(0, MAX_DOMAINS_VERIFIED);
  const overflow = items.slice(MAX_DOMAINS_VERIFIED).map((s) => ({ ...s, verified: false }));
  const results: CompetitorSuggestion[] = capped.map((s) => ({ ...s, verified: false }));

  if (budgetMs > 0 && capped.length > 0) {
    const perDomain = Math.min(DNS_TIMEOUT_MS, budgetMs);
    const checks = capped.map((s, i) =>
      verifyDomain(s.domain, perDomain).then(
        (verified) => {
          results[i] = { ...results[i], verified };
        },
        () => {
          /* leave it flagged unverified */
        },
      ),
    );
    // Overall cap: whichever settles first wins — all the checks, or the budget.
    let capTimer: ReturnType<typeof setTimeout> | undefined;
    const cap = new Promise<void>((resolve) => {
      capTimer = setTimeout(resolve, budgetMs);
    });
    await Promise.race([Promise.allSettled(checks).then(() => undefined), cap]);
    clearTimeout(capTimer);
  }

  return [...results, ...overflow];
}

/* ---------------- Claude call ---------------- */

const SYSTEM_PROMPT = [
  "You identify a named company's main competitors and return their PRIMARY corporate email domains, using only your own knowledge.",
  "Answer directly and quickly — do not use any tools or web search, and do not stall.",
  "Rules:",
  `- Return at most ${MAX_COMPETITORS} competitors — the most significant ones first. This is a ceiling, not a target.`,
  `- Return only genuine competitors. Never pad the list to reach ${MAX_COMPETITORS}: a short, accurate list is far better than a long one stretched with weak, tangential, or invented entries. Returning just two or three is correct when that is all there genuinely are.`,
  "- Return only primary corporate email domains (the domain a company uses for staff email and its main site), not marketing micro-sites or country sub-domains.",
  "- Do not invent domains. If you are unsure of a competitor's real domain, omit that competitor or mark its confidence low — the domains are DNS-verified downstream, so a wrong guess will be flagged.",
  "- Exclude the named company itself.",
  "- For each competitor give: name, domain, confidence (exactly one of high, medium, low), and a one-line rationale.",
  "Respond with STRICT JSON ONLY: a single JSON array of objects with keys name, domain, confidence, rationale.",
  "No prose, no explanation, no markdown, no code fences — just the array.",
].join("\n");

export function buildUserPrompt(company: string, industry?: string): string {
  return (
    `Company: ${company}` +
    (industry ? `\nIndustry: ${industry}` : "") +
    `\n\nFrom your own knowledge, list this company's main competitors and their primary corporate email domains as a strict JSON array (at most ${MAX_COMPETITORS} entries — a ceiling, not a target; list only genuine competitors and do not pad). Exclude ${company} itself.`
  );
}

/** Concatenate the text blocks of the final assistant message. */
export function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/** The shared, tightly-bounded request shape for the lookup (no tools — model knowledge only). */
function buildRequest(messages: Anthropic.MessageParam[]): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: SYSTEM_PROMPT,
    messages,
  };
}

/**
 * Ask the model — from its own knowledge, no tools — for the company's
 * competitors and their primary corporate domains, and parse the strict-JSON
 * reply. A single, fast request: the only thing that can cut it short is the
 * caller's abort signal (our internal deadline), handled one level up.
 */
async function researchCompetitors(
  anthropic: Anthropic,
  company: string,
  industry: string | undefined,
  signal: AbortSignal,
): Promise<RawSuggestion[]> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: buildUserPrompt(company, industry) },
  ];
  const response = await anthropic.messages.create(buildRequest(messages), { signal, maxRetries: 1 });
  return parseModelSuggestions(extractText(response.content)).slice(0, MAX_COMPETITORS);
}

/** Compose the review note shown beneath the results (or the timed-out fallback). */
export function buildNotes(
  suggestions: CompetitorSuggestion[],
  verifiedCount: number,
  timedOut: boolean,
): string {
  if (timedOut) {
    return suggestions.length
      ? `The lookup ran long, so it returned early with ${suggestions.length} partial ` +
          `result${suggestions.length === 1 ? "" : "s"}. For a complete list, try a narrower or more ` +
          `specific company name. Domains are model-suggested and DNS-checked — review before adding to a policy.`
      : "The lookup took too long and was stopped before any results came back. Try a narrower, more specific company name (and add an industry), then search again.";
  }
  return suggestions.length
    ? `Found ${suggestions.length} competitor suggestion${suggestions.length === 1 ? "" : "s"}` +
        ` (${verifiedCount} with a live mail/DNS record). Domains are model-suggested and DNS-checked —` +
        ` review and curate before adding to a policy.`
    : "No competitor suggestions were returned. Try a more specific company name or add an industry.";
}

/* ---------------- handler ---------------- */

function send(res: VercelResponse, status: number, body: unknown): void {
  res.status(status).json(body);
}

/**
 * Log the real cause of a failed lookup to the function logs. The browser only
 * ever sees the generic message from the handler's catch, so this is what makes
 * the next failure debuggable. Anthropic SDK errors (`APIError`) carry the HTTP
 * status, the API error `type`, and the structured response body that names the
 * rejected model / tool / parameter — exactly what we need to tell an invalid
 * model id from an unknown tool type. An aborted request (our internal deadline)
 * is surfaced distinctly. The `typeof` guards keep this safe when the SDK's
 * static error classes aren't present (e.g. under a unit-test mock).
 */
function logLookupError(err: unknown): void {
  // Our own deadline aborts the in-flight request; APIUserAbortError extends
  // APIError, so check the abort case before the general API-error case.
  const isAbort =
    (err instanceof Error && err.name === "AbortError") ||
    (typeof Anthropic.APIUserAbortError === "function" && err instanceof Anthropic.APIUserAbortError);
  if (isAbort) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[competitors] lookup aborted (internal deadline fired): ${message}`);
    return;
  }
  if (typeof Anthropic.APIError === "function" && err instanceof Anthropic.APIError) {
    let body: string;
    try {
      body = JSON.stringify(err.error);
    } catch {
      body = String(err.error);
    }
    console.error(
      `[competitors] Anthropic APIError name=${err.name} status=${String(err.status)} ` +
        `type=${String(err.type)} message=${err.message} body=${body}`,
    );
    return;
  }
  if (err instanceof Error) {
    console.error(`[competitors] lookup failed name=${err.name} message=${err.message}`);
    return;
  }
  console.error(`[competitors] lookup failed with a non-Error value: ${String(err)}`);
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // 1. Method.
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { error: "Method not allowed." });
  }

  // 2. Auth gate — do nothing else if the shared secret is missing or wrong.
  const expected = process.env.COMPETITORS_SHARED_SECRET;
  const provided = req.headers["x-aedlp-key"];
  if (!expected || typeof provided !== "string" || provided !== expected) {
    return send(res, 401, { error: "Unauthorized." });
  }

  // 3. Input.
  const body = readBody(req.body);
  const company = readCompany(body);
  if (!company) {
    return send(res, 400, { error: "A company name is required." });
  }
  const industry = readIndustry(body);

  // 4. Rate limit (fail closed → 503 if the store is unreachable).
  let verdict: RateVerdict;
  try {
    verdict = await checkRateLimit(getRedis(), clientIp(req));
  } catch {
    return send(res, 503, { error: "Lookup is temporarily unavailable. Please try again shortly." });
  }
  if (!verdict.ok) {
    if (verdict.retryAfter) res.setHeader("Retry-After", String(verdict.retryAfter));
    const window = verdict.scope === "day" ? "daily" : "per-minute";
    return send(res, 429, { error: `Rate limit reached (${window}). Please wait and try again.` });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return send(res, 503, { error: "Lookup is temporarily unavailable. Please try again shortly." });
  }

  // 5 + 6. Research via Claude under an internal deadline, verify domains, respond.
  // The AbortController fires at OVERALL_BUDGET_MS and cancels the in-flight Claude
  // call; we then return a clean partial response instead of a Vercel 504.
  const startedAt = Date.now();
  const controller = new AbortController();
  // The abort must fire near the budget, never at ~0: a zero/negative/garbled
  // OVERALL_BUDGET_MS would otherwise cancel the Claude call on the same tick it
  // starts (an instant, mysterious failure). Clamp to a sane positive delay.
  const abortAfterMs =
    Number.isFinite(OVERALL_BUDGET_MS) && OVERALL_BUDGET_MS > 0 ? OVERALL_BUDGET_MS : 45_000;
  const deadlineTimer = setTimeout(() => controller.abort(), abortAfterMs);
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    let raw: RawSuggestion[] = [];
    let timedOut = false;
    const lookupStart = Date.now();
    try {
      raw = await researchCompetitors(anthropic, company, industry, controller.signal);
    } catch (err) {
      // Our deadline firing is an expected outcome — degrade gracefully. Any other
      // failure is a real upstream error and bubbles to the 502 path below.
      if (controller.signal.aborted) timedOut = true;
      else throw err;
    }
    const lookupMs = Date.now() - lookupStart;

    // Verify with whatever time is left; never push past the deadline.
    const verifyStart = Date.now();
    const remaining = abortAfterMs - (Date.now() - startedAt) - RESPONSE_RESERVE_MS;
    const verifyBudget = controller.signal.aborted ? 0 : Math.min(VERIFY_BUDGET_MS, Math.max(0, remaining));
    const suggestions = await verifySuggestions(raw, verifyBudget);
    const verifyMs = Date.now() - verifyStart;

    const verifiedCount = suggestions.filter((s) => s.verified).length;
    // Timing goes to the function logs so we can see where the budget is spent.
    console.log(
      `[competitors] model=${MODEL} lookup=${lookupMs}ms verify=${verifyMs}ms ` +
        `total=${Date.now() - startedAt}ms suggestions=${suggestions.length} ` +
        `verified=${verifiedCount} timedOut=${timedOut}`,
    );

    const payload: CompetitorsResponse = {
      suggestions,
      notes: buildNotes(suggestions, verifiedCount, timedOut),
    };
    return send(res, 200, payload);
  } catch (err) {
    // Log the real cause to the function logs; the browser only ever sees the
    // generic message, and we never leak the request or the API key.
    logLookupError(err);
    return send(res, 502, { error: "The competitor lookup failed. Please try again." });
  } finally {
    clearTimeout(deadlineTimer);
  }
}
