/* ============================================================
   GenAI competitor lookup — Vercel serverless function (Node).

   This is the ONE backend endpoint in an otherwise fully static,
   client-side app. It takes a company name (and optional industry),
   asks Claude — grounded on live web search — for that company's main
   competitors and their primary corporate email domains, verifies the
   domains server-side, and returns reviewable suggestions.

   The only data that leaves the browser is the company name the user
   types. Nothing here is auto-applied: the front end shows the results
   for review and the user curates them into a recipient-domain
   condition by hand.

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

const MODEL = "claude-sonnet-4-6";
const MAX_DOMAINS_VERIFIED = 15; // bound the verification work
const RATE_PER_MINUTE = 10;
const RATE_PER_DAY = 100;
const DNS_TIMEOUT_MS = 2500;

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

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("dns timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

/** Lightweight liveness check: an MX record, else any A/AAAA record. */
export async function verifyDomain(domain: string): Promise<boolean> {
  try {
    const mx = await withTimeout(dns.resolveMx(domain), DNS_TIMEOUT_MS);
    if (Array.isArray(mx) && mx.length > 0) return true;
  } catch {
    /* no MX — fall through to address lookup */
  }
  try {
    const addrs = await withTimeout(dns.resolve(domain), DNS_TIMEOUT_MS);
    return Array.isArray(addrs) && addrs.length > 0;
  } catch {
    return false;
  }
}

/** Verify up to MAX_DOMAINS_VERIFIED suggestions. Unverified ones are flagged, never dropped. */
export async function verifySuggestions(items: RawSuggestion[]): Promise<CompetitorSuggestion[]> {
  const capped = items.slice(0, MAX_DOMAINS_VERIFIED);
  const verified = await Promise.all(
    capped.map(async (s) => ({ ...s, verified: await verifyDomain(s.domain) })),
  );
  // Keep any beyond the cap, marked unverified so nothing silently disappears.
  const overflow = items.slice(MAX_DOMAINS_VERIFIED).map((s) => ({ ...s, verified: false }));
  return [...verified, ...overflow];
}

/* ---------------- Claude call ---------------- */

const SYSTEM_PROMPT = [
  "You research a named company's main competitors and return their PRIMARY corporate email domains.",
  "Ground every answer in live web search results, not prior memory or assumptions.",
  "Rules:",
  "- Use the web_search tool to find current information before answering.",
  "- Return only primary corporate email domains (the domain a company uses for staff email and its main site), not marketing micro-sites or country sub-domains.",
  "- Do not invent domains. If unsure of a competitor's real domain, omit it or mark its confidence low.",
  "- Exclude the named company itself.",
  "- For each competitor give: name, domain, confidence (exactly one of high, medium, low), and a one-line rationale.",
  "Respond with STRICT JSON ONLY: a single JSON array of objects with keys name, domain, confidence, rationale.",
  "No prose, no explanation, no markdown, no code fences — just the array.",
].join("\n");

export function buildUserPrompt(company: string, industry?: string): string {
  return (
    `Company: ${company}` +
    (industry ? `\nIndustry: ${industry}` : "") +
    `\n\nResearch this company's main competitors and return their primary corporate email domains as a strict JSON array.`
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

async function researchCompetitors(
  anthropic: Anthropic,
  company: string,
  industry: string | undefined,
): Promise<RawSuggestion[]> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: buildUserPrompt(company, industry) },
  ];

  let response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    thinking: { type: "adaptive", display: "omitted" },
    system: SYSTEM_PROMPT,
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6 }],
    messages,
  });

  // Server-side web-search loop can pause; resume until it completes.
  let guard = 0;
  while (response.stop_reason === "pause_turn" && guard < 4) {
    guard += 1;
    messages.push({ role: "assistant", content: response.content });
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      thinking: { type: "adaptive", display: "omitted" },
      system: SYSTEM_PROMPT,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6 }],
      messages,
    });
  }

  return parseModelSuggestions(extractText(response.content));
}

/* ---------------- handler ---------------- */

function send(res: VercelResponse, status: number, body: unknown): void {
  res.status(status).json(body);
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

  // 5 + 6. Research via Claude, verify domains, respond.
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return send(res, 503, { error: "Lookup is temporarily unavailable. Please try again shortly." });
    }
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const raw = await researchCompetitors(anthropic, company, industry);
    const suggestions = await verifySuggestions(raw);

    const verifiedCount = suggestions.filter((s) => s.verified).length;
    const notes = suggestions.length
      ? `Found ${suggestions.length} competitor suggestion${suggestions.length === 1 ? "" : "s"}` +
        ` (${verifiedCount} with a live mail/DNS record). Domains are model-generated from web search —` +
        ` review and curate before adding to a policy.`
      : "No competitor suggestions were returned. Try a more specific company name or add an industry.";

    const payload: CompetitorsResponse = { suggestions, notes };
    return send(res, 200, payload);
  } catch {
    // Never leak the request or key in errors.
    return send(res, 502, { error: "The competitor lookup failed. Please try again." });
  }
}
