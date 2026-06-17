/* ============================================================
   Matching engine. Ported from handoff project/app/lib.jsx,
   behaviour preserved exactly. Browser RegExp is NOT the AEDLP
   production engine; results must be confirmed in the AEDLP
   Custom Policy Tester. No Luhn validation is performed.
   ============================================================ */
import type { Condition, KeywordMatchMode, PatternOperator } from "../types";
import { runRegexTest, type RegexMatch, type RegexResult } from "./regex";

/* ---------- keyword matching ---------- */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildKeywordRegex(keywords: string[], wholeWord: boolean): string {
  const parts = keywords.filter(Boolean).map(escapeRegex);
  if (!parts.length) return "";
  const alt = parts.sort((a, b) => b.length - a.length).join("|");
  return wholeWord ? "(?<![\\w])(?:" + alt + ")(?![\\w])" : "(?:" + alt + ")";
}

export interface KeywordResult extends RegexResult {
  matchedKeywords: string[];
}

export interface KeywordTestOpts {
  caseInsensitive: boolean;
  wholeWord: boolean;
}

export function runKeywordTest(keywords: string[], sample: string, opts: KeywordTestOpts): KeywordResult {
  // use a boundary that also works for phrases / hyphenated terms
  const parts = keywords.filter(Boolean).map(escapeRegex).sort((a, b) => b.length - a.length);
  if (!parts.length) return { ok: false, error: "No keywords defined.", matches: [], count: 0, matchedKeywords: [] };
  const src = (opts.wholeWord ? "\\b(?:" : "(?:") + parts.join("|") + (opts.wholeWord ? ")\\b" : ")");
  const res = runRegexTest(src, sample, opts.caseInsensitive);
  if (!res.ok) {
    // fallback without boundaries if a phrase broke the boundary regex
    const r2 = runRegexTest("(?:" + parts.join("|") + ")", sample, opts.caseInsensitive);
    if (!r2.ok) return { ...res, matchedKeywords: [] };
    const seen2 = new Set<string>();
    for (const m of r2.matches) seen2.add(opts.caseInsensitive ? m.value.toLowerCase() : m.value);
    return { ...r2, matchedKeywords: [...seen2] };
  }
  const seen = new Set<string>();
  for (const m of res.matches) seen.add(opts.caseInsensitive ? m.value.toLowerCase() : m.value);
  return { ...res, matchedKeywords: [...seen] };
}

/* ---------- keyword pattern: serialize + evaluate ---------- */
export interface KeywordPatternLike {
  groups: string[][];
  operator: PatternOperator;
  proximity: number | null;
  matchMode?: KeywordMatchMode;
}

export interface PatternResult {
  ok: boolean;
  matched: boolean;
  matches: RegexMatch[];
  count: number;
  reason: string;
}

export function serializeKeywordPattern(p: KeywordPatternLike): string {
  const groupStr = (g: string[]) =>
    g.length === 1 ? `"${g[0]}"` : "(" + g.map((t) => `"${t}"`).join(" OR ") + ")";
  const joiner = p.operator === "AND" ? (p.proximity ? ` AND~${p.proximity} ` : " AND ") : " OR ";
  return p.groups.map(groupStr).join(joiner);
}

export function wordIndexAt(sample: string, charIndex: number): number {
  const before = sample.slice(0, charIndex);
  const m = before.match(/\S+/g);
  return m ? m.length : 0;
}

// smallest window (in words) covering at least one hit from every group
export function coveringWindow(hitsByGroup: number[][]): number {
  const events: Array<[number, number]> = [];
  hitsByGroup.forEach((arr, g) => arr.forEach((w) => events.push([w, g])));
  if (hitsByGroup.some((a) => a.length === 0)) return Infinity;
  events.sort((a, b) => a[0] - b[0]);
  const need = hitsByGroup.length;
  const count: Record<number, number> = {};
  let have = 0;
  let left = 0;
  let best = Infinity;
  for (let right = 0; right < events.length; right++) {
    const g = events[right][1];
    count[g] = (count[g] || 0) + 1;
    if (count[g] === 1) have++;
    while (have === need) {
      best = Math.min(best, events[right][0] - events[left][0]);
      const lg = events[left][1];
      count[lg]--;
      if (count[lg] === 0) have--;
      left++;
    }
  }
  return best;
}

export function evaluateKeywordPattern(
  p: KeywordPatternLike,
  sample: string,
  caseInsensitive: boolean,
): PatternResult {
  const groupResults = p.groups.map((g) =>
    runKeywordTest(g, sample, { caseInsensitive, wholeWord: p.matchMode ? p.matchMode.wholeWord : true }),
  );
  const groupHasHit = groupResults.map((r) => r.ok && r.count > 0);
  const allHits: RegexMatch[] = [];
  groupResults.forEach((r) => {
    if (r.ok) allHits.push(...r.matches);
  });

  if (p.operator === "OR") {
    const matched = groupHasHit.some(Boolean);
    return {
      ok: true,
      matched,
      matches: matched ? allHits : [],
      count: allHits.length,
      reason: matched ? "At least one group matched." : "No group matched.",
    };
  }
  // AND
  if (!groupHasHit.every(Boolean)) {
    const missing = p.groups.filter((_, i) => !groupHasHit[i]).map((g) => g[0]);
    return {
      ok: true,
      matched: false,
      matches: [],
      count: 0,
      reason: `Not all groups present (missing: ${missing.map((m) => `"${m}"…`).join(", ")}).`,
    };
  }
  if (!p.proximity) {
    return { ok: true, matched: true, matches: allHits, count: allHits.length, reason: "All groups present." };
  }
  // proximity check
  const hitsByGroup = groupResults.map((r) => (r.ok ? r.matches.map((m) => wordIndexAt(sample, m.index)) : []));
  const win = coveringWindow(hitsByGroup);
  const matched = win <= p.proximity;
  return {
    ok: true,
    matched,
    matches: matched ? allHits : [],
    count: matched ? allHits.length : 0,
    reason: matched
      ? `All groups co-occur within ${win} word${win === 1 ? "" : "s"} (≤ ${p.proximity}).`
      : `Groups present but ${
          win === Infinity ? "do not co-occur" : `nearest co-occurrence is ${win} words apart`
        } (> ${p.proximity}).`,
  };
}

/* ---------- recipient-domain matching ---------- */
export function buildRecipientRegex(domains: string[]): string {
  const parts = (domains || [])
    .map((d) => String(d).replace(/^@/, ""))
    .filter(Boolean)
    .map(escapeRegex)
    .sort((a, b) => b.length - a.length);
  if (!parts.length) return "";
  return "[A-Za-z0-9._%+\\-]+@(?:" + parts.join("|") + ")\\b";
}

export function runRecipientTest(domains: string[], sample: string): KeywordResult {
  const pattern = buildRecipientRegex(domains);
  if (!pattern) return { ok: false, error: "No domains defined.", matches: [], count: 0, matchedKeywords: [] };
  const res = runRegexTest(pattern, sample, true);
  if (!res.ok) return { ...res, matchedKeywords: [] };
  const seen = new Set<string>();
  for (const m of res.matches) {
    const at = m.value.split("@")[1];
    if (at) seen.add("@" + at.toLowerCase());
  }
  return { ...res, matchedKeywords: [...seen] };
}

/* ---------- file type / extension matching ---------- */
export function buildFileExtensionRegex(extensions: string[]): string {
  const parts = (extensions || [])
    .map((e) => String(e).replace(/^\./, ""))
    .filter(Boolean)
    .map(escapeRegex)
    .sort((a, b) => b.length - a.length);
  if (!parts.length) return "";
  // a filename token (allowing dots, hyphens, underscores) ending in one of the extensions
  return "[\\w\\-.]+\\.(?:" + parts.join("|") + ")(?![\\w.])";
}

export function runFileExtensionTest(extensions: string[], sample: string): KeywordResult {
  const pattern = buildFileExtensionRegex(extensions);
  if (!pattern) return { ok: false, error: "No extensions defined.", matches: [], count: 0, matchedKeywords: [] };
  const res = runRegexTest(pattern, sample, true);
  if (!res.ok) return { ...res, matchedKeywords: [] };
  const seen = new Set<string>();
  for (const m of res.matches) {
    const dot = m.value.lastIndexOf(".");
    if (dot >= 0) seen.add(m.value.slice(dot).toLowerCase());
  }
  return { ...res, matchedKeywords: [...seen] };
}

/* ---------- unified condition test ---------- */
export interface ConditionResult {
  ok: boolean;
  matched: boolean;
  count: number;
  matches: RegexMatch[];
  reason: string;
  error?: string | null;
  matchedKeywords?: string[];
}

export function runConditionTest(cond: Condition, sample: string, caseInsensitive: boolean): ConditionResult {
  if (cond.conditionType === "regular_expression") {
    const r = runRegexTest(cond.regex, sample, caseInsensitive);
    return {
      ...r,
      matched: r.ok && r.count > 0,
      reason: r.ok ? (r.count ? `${r.count} match${r.count > 1 ? "es" : ""}.` : "No matches.") : r.error ?? "",
    };
  }
  if (cond.conditionType === "keyword") {
    const r = runKeywordTest(cond.keywords, sample, cond.matchMode || { caseInsensitive: true, wholeWord: true });
    return {
      ...r,
      matched: r.ok && r.count > 0,
      reason: r.ok
        ? r.count
          ? `${r.matchedKeywords.length} term${r.matchedKeywords.length > 1 ? "s" : ""} matched.`
          : "No terms matched."
        : r.error ?? "",
    };
  }
  if (cond.conditionType === "recipient_domain") {
    const r = runRecipientTest(cond.domains, sample);
    return {
      ...r,
      matched: r.ok && r.count > 0,
      reason: r.ok
        ? r.count
          ? `${r.count} listed recipient${r.count > 1 ? "s" : ""}.`
          : "No listed recipients."
        : r.error ?? "",
    };
  }
  if (cond.conditionType === "file_extension") {
    const r = runFileExtensionTest(cond.extensions, sample);
    return {
      ...r,
      matched: r.ok && r.count > 0,
      reason: r.ok
        ? r.count
          ? `${r.count} attachment${r.count > 1 ? "s" : ""} of a flagged type (${r.matchedKeywords.join(", ")}).`
          : "No flagged file types."
        : r.error ?? "",
    };
  }
  // keyword_pattern
  return evaluateKeywordPattern(cond, sample, caseInsensitive);
}

/* ---------- copy value for a content item ---------- */
export function conditionCopyValue(cond: Condition): string {
  if (cond.conditionType === "regular_expression") return cond._effectiveRegex || cond.regex;
  if (cond.conditionType === "keyword") return (cond.keywords || []).join("\n");
  if (cond.conditionType === "recipient_domain") return (cond.domains || []).join("\n");
  if (cond.conditionType === "file_extension") return (cond.extensions || []).join(", ");
  return serializeKeywordPattern(cond);
}
