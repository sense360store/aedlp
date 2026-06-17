/* ============================================================
   Trusted-domain handoff between the two pages.
   The Trusted Domain Extractor curates an allow-list of permitted
   recipient domains and writes it to localStorage; the Policy Creator
   reads it back and (on an explicit user action) loads it into a
   recipient-domain condition.

   This is a TRUSTED / ALLOWED list — domains mail is permitted to go
   to — not a flag/block list like the seed freemail / disposable /
   competitor recipient detectors. Labels reflect that everywhere it
   surfaces; the matching engine itself is unchanged.

   Only persistence is localStorage; no backend, no network.
   ============================================================ */
import type { Condition } from "../types";

/** localStorage key shared with the extractor (kept from the prototype). */
export const TRUSTED_LS_KEY = "aedlp_trusted_domains";

/** Stable id so re-loading replaces the condition instead of stacking it. */
export const TRUSTED_CONDITION_ID = "rcp-trusted-extract";

/** Read the saved trusted-domain list. Never throws on missing/garbage data. */
export function loadTrustedDomains(): string[] {
  try {
    const raw = localStorage.getItem(TRUSTED_LS_KEY);
    if (!raw) return [];
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Persist the curated list for the Policy Creator to pick up. */
export function saveTrustedDomains(domains: string[]): void {
  localStorage.setItem(TRUSTED_LS_KEY, JSON.stringify(domains));
}

/**
 * Build a recipient-domain condition from the curated allow-list. Labelled as
 * a trusted/allowed list (recommended action "silently track") so it is never
 * confused with the seed block lists.
 */
export function makeTrustedCondition(domains: string[]): Condition {
  return {
    id: TRUSTED_CONDITION_ID,
    conditionType: "recipient_domain",
    displayName: "Trusted / allowed recipient domains (from extract)",
    aliases: ["trusted domains", "allow-list", "allowed recipients", "whitelist"],
    description:
      "Allow-list of trusted recipient domains curated in the Trusted Domain Extractor. Mail to these domains is permitted — it should not trip the unauthorised-email condition.",
    country: "GLOBAL",
    regionLabel: "Global",
    category: "Recipients & destinations",
    industry: "Cross-industry",
    industries: ["Cross-industry"],
    contextKeywords: [],
    domains,
    matchMode: { caseInsensitive: true, wholeWord: true },
    positiveExamples: ["Sending the report to client@trusted-partner.com"],
    negativeExamples: ["Sending to someone@unknown-domain.example"],
    recommendedAction: "silently_track",
    falsePositiveRisk: "low",
    notes: [
      "This is a trusted / allowed list (not a block list) — it represents permitted recipient domains.",
      "Curated in the Trusted Domain Extractor and carried over via your browser (localStorage).",
    ],
  };
}
