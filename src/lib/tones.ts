/* ============================================================
   Tone / label helpers for badges and pills.
   Ported from handoff project/app/lib.jsx.
   ============================================================ */
import { AEDLP_DATA } from "../data/library";

const RISK_TONE: Record<string, string> = { low: "ok", medium: "warn", high: "danger" };
const TYPE_TONE: Record<string, string> = {
  regular_expression: "info",
  keyword: "violet",
  keyword_pattern: "teal",
  recipient_domain: "amber",
  file_extension: "green",
};

export function riskTone(r: string): string {
  return RISK_TONE[r] || "neutral";
}

export function typeTone(t: string): string {
  return TYPE_TONE[t] || "neutral";
}

export function typeShort(t: string): string {
  return (AEDLP_DATA.conditionTypes.find((c) => c.id === t) || { short: t }).short;
}
