/* ============================================================
   Competitor-lookup client helpers.

   The Find-competitors surface is the one place this app talks to a
   backend: it POSTs the typed company name to /api/competitors, which
   asks Claude (grounded on web search) for competitor domains and
   verifies them. Only the company name leaves the browser — uploaded
   files and the extractor stay entirely local.

   Nothing here is auto-applied. The user reviews the returned
   suggestions and curates the ones they pick into a recipient-domain
   condition, reusing the same recipient-domain handoff as the
   trusted-domain extractor.
   ============================================================ */
import type { Condition } from "../types";

export type Confidence = "high" | "medium" | "low";

/** One reviewable suggestion as returned by /api/competitors. */
export interface CompetitorSuggestion {
  name: string;
  domain: string;
  confidence: Confidence;
  verified: boolean;
  rationale: string;
}

/** Discriminated result of a lookup — either suggestions or a plain message. */
export type LookupResult =
  | { ok: true; suggestions: CompetitorSuggestion[]; notes: string }
  | { ok: false; message: string };

/** Stable id so re-adding a lookup replaces the condition instead of stacking it. */
export const COMPETITOR_CONDITION_ID = "rcp-competitor-lookup";

const CONFIDENCES: ReadonlySet<string> = new Set(["high", "medium", "low"]);

function coerceSuggestion(v: unknown): CompetitorSuggestion | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const domain = typeof o.domain === "string" ? o.domain.trim().toLowerCase() : "";
  if (!domain) return null;
  const confidence = typeof o.confidence === "string" && CONFIDENCES.has(o.confidence)
    ? (o.confidence as Confidence)
    : "low";
  return {
    name: typeof o.name === "string" && o.name.trim() ? o.name.trim() : domain,
    domain,
    confidence,
    verified: o.verified === true,
    rationale: typeof o.rationale === "string" ? o.rationale : "",
  };
}

/** Map a fetch/HTTP outcome to a plain, user-facing message. */
function messageForStatus(status: number): string {
  switch (status) {
    case 400:
      return "Enter a company name to look up.";
    case 401:
      return "Competitor lookup is not authorised in this deployment.";
    case 429:
      return "Rate limit reached. Please wait a moment and try again.";
    case 503:
      return "The lookup service is temporarily unavailable. Please try again shortly.";
    default:
      return "The competitor lookup failed. Please try again.";
  }
}

/**
 * Call the lookup endpoint. The shared secret is read from the build-time env
 * var and sent as the x-aedlp-key header. Never throws — every failure path
 * resolves to { ok: false, message }.
 */
export async function fetchCompetitors(
  company: string,
  industry: string,
  signal?: AbortSignal,
): Promise<LookupResult> {
  const trimmed = company.trim();
  if (!trimmed) return { ok: false, message: messageForStatus(400) };

  let res: Response;
  try {
    res = await fetch("/api/competitors", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-aedlp-key": import.meta.env.VITE_COMPETITORS_SHARED_SECRET ?? "",
      },
      body: JSON.stringify({ company: trimmed, industry: industry.trim() || undefined }),
      signal,
    });
  } catch {
    return { ok: false, message: "Could not reach the lookup service. Check your connection and try again." };
  }

  if (!res.ok) return { ok: false, message: messageForStatus(res.status) };

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return { ok: false, message: "The lookup service returned an unexpected response." };
  }

  const obj = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const rawList = Array.isArray(obj.suggestions) ? obj.suggestions : [];
  const suggestions = rawList
    .map(coerceSuggestion)
    .filter((s): s is CompetitorSuggestion => s !== null);
  const notes = typeof obj.notes === "string" ? obj.notes : "";
  return { ok: true, suggestions, notes };
}

/**
 * Build a recipient-domain condition from the user-selected competitor domains.
 * This is a flag/review list (recommended action "warn & require justification")
 * curated from research — never dropped straight into a blocking policy.
 */
export function makeCompetitorCondition(domains: string[]): Condition {
  return {
    id: COMPETITOR_CONDITION_ID,
    conditionType: "recipient_domain",
    displayName: "Competitor domains (from lookup)",
    aliases: ["competitor", "competitor domains", "rival", "lookup competitors"],
    description:
      "Recipient address on a competitor's domain, curated from the competitor lookup. Review and tune before deploying — domains are model-generated from web search.",
    country: "GLOBAL",
    regionLabel: "Global",
    category: "Recipients & destinations",
    industry: "Cross-industry",
    industries: ["Cross-industry"],
    contextKeywords: [],
    domains,
    matchMode: { caseInsensitive: true, wholeWord: true },
    positiveExamples: ["Sending the roadmap to contact@" + (domains[0] ?? "competitor.example")],
    negativeExamples: ["Send to client@trusted-partner.com"],
    recommendedAction: "warn_require_justification",
    falsePositiveRisk: "low",
    notes: [
      "Curated from the competitor lookup — verify each domain before relying on it.",
      "Domains are suggested by Claude from live web search and may be wrong or out of date.",
    ],
  };
}
