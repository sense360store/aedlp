/* ============================================================
   Trusted-domain list hygiene — pure, local cross-checks.

   An extracted trusted (allow-list) of recipient domains can wrongly
   include personal-webmail / freemail domains, disposable / temporary-mail
   services, or actual competitor domains — none of which belong on an
   allow-list of permitted recipients. This module flags those so the user
   can strip them before the list is handed to the unauthorised-email
   condition.

   It is a PURE set-intersection against lists the app already holds:
     • the Personal Webmail / Freemail pack   (data/recipients.ts)
     • the Disposable / Temporary Email pack  (data/recipients.ts)
     • the curated competitor block-list, if the user built one this
       session (lib/competitors.ts session store)

   No network, no GenAI, no backend — every input is already in the
   browser. Domains are normalised (case-folded, leading "@" stripped)
   on both sides before comparison.
   ============================================================ */
import { AEDLP_RECIPIENT_DOMAINS } from "../data/recipients";

/** The three reasons a domain does not belong on a trusted allow-list. */
export type HygieneFlag = "freemail" | "disposable" | "competitor";

/** Stable display order for the flags (freemail → disposable → competitor). */
export const HYGIENE_FLAGS: readonly HygieneFlag[] = ["freemail", "disposable", "competitor"];

/** The normalised comparison sets a cross-check runs against. */
export interface HygieneSets {
  freemail: ReadonlySet<string>;
  disposable: ReadonlySet<string>;
  competitor: ReadonlySet<string>;
}

/** Outcome of cross-checking a whole list. */
export interface HygieneReport {
  /** original domain string → the flags it matched, for flagged domains only. */
  flags: Map<string, HygieneFlag[]>;
  /** the flagged domains, as their original strings, in first-seen order. */
  flagged: string[];
  /** total distinct domains analysed (the denominator in "X of N"). */
  total: number;
  /** number of distinct flagged domains (the numerator in "X of N"). */
  flaggedCount: number;
  /** per-flag tallies — a domain on two lists counts toward each. */
  counts: Record<HygieneFlag, number>;
}

/**
 * Normalise a domain for set comparison: trim, lower-case and drop a single
 * leading "@" (so "@Gmail.com", "gmail.com" and " GMAIL.COM " all compare
 * equal). Returns "" for empty / non-string input.
 */
export function normalizeDomain(input: unknown): string {
  let s = String(input ?? "").trim().toLowerCase();
  if (s.startsWith("@")) s = s.slice(1);
  return s.trim();
}

/** Build a normalised, de-duplicated Set from any iterable of domain strings. */
function toNormalizedSet(domains: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const d of domains) {
    const n = normalizeDomain(d);
    if (n) out.add(n);
  }
  return out;
}

/**
 * Build the comparison sets from the in-app freemail / disposable packs plus an
 * optional competitor block-list curated this session. Pass the session
 * competitor domains (see lib/competitors.loadCompetitorBlocklist) when one
 * exists; omit it and the competitor set is simply empty.
 */
export function buildHygieneSets(competitor: Iterable<string> = []): HygieneSets {
  return {
    freemail: toNormalizedSet(AEDLP_RECIPIENT_DOMAINS.freemail),
    disposable: toNormalizedSet(AEDLP_RECIPIENT_DOMAINS.disposable),
    competitor: toNormalizedSet(competitor),
  };
}

/**
 * The flags one domain matches, in {@link HYGIENE_FLAGS} order. Empty array
 * when the domain is clean. A domain can match more than one list (e.g. several
 * throwaway services are in both the freemail and disposable packs).
 */
export function flagsForDomain(domain: string, sets: HygieneSets): HygieneFlag[] {
  const n = normalizeDomain(domain);
  if (!n) return [];
  const flags: HygieneFlag[] = [];
  if (sets.freemail.has(n)) flags.push("freemail");
  if (sets.disposable.has(n)) flags.push("disposable");
  if (sets.competitor.has(n)) flags.push("competitor");
  return flags;
}

/**
 * Cross-check a whole list of trusted domains against the sets. Distinct
 * domains are counted once (so "X of N" is honest even if the input repeats),
 * but the report keys `flags` by the FIRST original string seen for each
 * domain, so a caller can map a flag straight back to the row it rendered.
 *
 * Pure and synchronous — no network, no GenAI.
 */
export function analyzeDomains(domains: Iterable<string>, sets: HygieneSets): HygieneReport {
  const flags = new Map<string, HygieneFlag[]>();
  const flagged: string[] = [];
  const counts: Record<HygieneFlag, number> = { freemail: 0, disposable: 0, competitor: 0 };
  const seen = new Set<string>();
  let total = 0;
  for (const original of domains) {
    const n = normalizeDomain(original);
    if (!n || seen.has(n)) continue; // count each distinct domain once
    seen.add(n);
    total++;
    const f = flagsForDomain(n, sets);
    if (f.length) {
      flags.set(original, f);
      flagged.push(original);
      for (const t of f) counts[t]++;
    }
  }
  return { flags, flagged, total, flaggedCount: flagged.length, counts };
}

/** Human-readable label for a flag (for badges / aria text). */
export const FLAG_LABEL: Record<HygieneFlag, string> = {
  freemail: "freemail",
  disposable: "disposable",
  competitor: "competitor",
};

/** Why each flag is risky on an allow-list — used for the per-badge tooltip. */
export const FLAG_REASON: Record<HygieneFlag, string> = {
  freemail:
    "Personal / consumer webmail domain — sending to personal accounts is usually a leak signal, not a trusted destination.",
  disposable:
    "Known disposable / temporary-mail service — almost never a legitimate business recipient.",
  competitor:
    "On the competitor block-list curated this session — the opposite of a trusted recipient.",
};
