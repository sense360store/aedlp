// Regex helpers — boundary wrapping, client-side testing, highlight + tokenization.
// In production, POST /regex/test could replace runRegexTest for server-side validation.
import { boundaryStrategies } from "../data/patternLibrary";
import type { BoundaryStrategy, RegexTestResult } from "../types";

/** Remove a recognized wrapper so switching strategies is idempotent. */
export function stripWrapper(rx: string): string {
  let r = rx;
  if (r.startsWith("(^|\\s|:)") && r.endsWith("($|\\s)")) {
    r = r.slice("(^|\\s|:)".length, r.length - "($|\\s)".length);
  } else if (r.startsWith("\\b") && r.endsWith("\\b")) {
    r = r.slice(2, r.length - 2);
  }
  return r;
}

export function buildEffectiveRegex(baseRegex: string, strategy: BoundaryStrategy["id"]): string {
  const strat = boundaryStrategies.find((s) => s.id === strategy) ?? boundaryStrategies[0];
  if (strategy === "as_is") return baseRegex;
  const core = stripWrapper(baseRegex);
  return strat.prefix + core + strat.suffix;
}

export function runRegexTest(pattern: string, sample: string, caseInsensitive: boolean): RegexTestResult {
  if (!pattern) return { ok: false, error: "Empty pattern.", matches: [], count: 0 };
  let re: RegExp;
  try {
    re = new RegExp(pattern, caseInsensitive ? "gi" : "g");
  } catch (e) {
    return { ok: false, error: (e as Error).message, matches: [], count: 0 };
  }
  const matches: { value: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  let guard = 0;
  while ((m = re.exec(sample)) !== null) {
    matches.push({ value: m[0], index: m.index });
    if (m.index === re.lastIndex) re.lastIndex++; // zero-width guard
    if (++guard > 5000) break;
  }
  return { ok: true, error: null, matches, count: matches.length };
}

export interface Segment { text: string; mark: boolean; }

export function buildHighlightSegments(
  sample: string,
  matches: { value: string; index: number }[]
): Segment[] {
  if (!matches.length) return [{ text: sample, mark: false }];
  const sorted = [...matches].sort((a, b) => a.index - b.index);
  const segs: Segment[] = [];
  let cursor = 0;
  for (const mt of sorted) {
    if (mt.index < cursor) continue;
    if (mt.index > cursor) segs.push({ text: sample.slice(cursor, mt.index), mark: false });
    segs.push({ text: sample.slice(mt.index, mt.index + mt.value.length), mark: true });
    cursor = mt.index + mt.value.length;
  }
  if (cursor < sample.length) segs.push({ text: sample.slice(cursor), mark: false });
  return segs;
}

export interface Token { cls: string; text: string; }

/** Lightweight regex token highlighter for the effective-regex preview. */
export function tokenizeRegex(rx: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const push = (cls: string, text: string) => out.push({ cls, text });
  while (i < rx.length) {
    const c = rx[i];
    if (c === "\\") { push("tok-escape", rx.slice(i, i + 2)); i += 2; continue; }
    if (c === "[") {
      let j = i + 1;
      while (j < rx.length && rx[j] !== "]") { if (rx[j] === "\\") j++; j++; }
      push("tok-class", rx.slice(i, j + 1)); i = j + 1; continue;
    }
    if (c === "(" || c === ")" || c === "|") { push("tok-group", c); i++; continue; }
    if (c === "^" || c === "$") { push("tok-anchor", c); i++; continue; }
    if ("*+?".includes(c)) { push("tok-quant", c); i++; continue; }
    if (c === "{") { let j = i + 1; while (j < rx.length && rx[j] !== "}") j++; push("tok-quant", rx.slice(i, j + 1)); i = j + 1; continue; }
    if (c === ".") { push("tok-meta", c); i++; continue; }
    push("tok-literal", c); i++;
  }
  return out;
}
