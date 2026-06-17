/* ============================================================
   Suggestion engine: name / description / tags / action.
   Ported from handoff project/app/lib.jsx, behaviour preserved.
   ============================================================ */
import type { Detector, RecommendedAction } from "../types";
import { AEDLP_DATA } from "../data/library";

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[()/]/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

export function suggestName(items: Detector[]): string {
  if (!items.length) return "";
  if (items.length === 1) return "Detect " + items[0].displayName;
  const cats = uniq(items.map((i) => i.category));
  if (cats.length === 1) return "Detect " + cats[0];
  if (cats.length === 2) return "Detect " + cats[0] + " & " + cats[1];
  return "Detect " + cats.slice(0, 2).join(", ") + " +" + (cats.length - 2);
}

export function suggestDescription(items: Detector[], action: RecommendedAction): string {
  if (!items.length) return "";
  const names = items.map((i) => i.displayName);
  const list = names.length <= 3 ? names.join(", ") : names.slice(0, 3).join(", ") + ` and ${names.length - 3} more`;
  const regions = uniq(items.map((i) => i.regionLabel).filter((r) => r && r !== "Global"));
  const regionTxt = regions.length ? ` Focused on ${regions.join(", ")}.` : "";
  const typeCount: Record<string, number> = {};
  items.forEach((i) => {
    typeCount[i.conditionType] = (typeCount[i.conditionType] || 0) + 1;
  });
  const typeTxt = AEDLP_DATA.conditionTypes
    .filter((t) => typeCount[t.id])
    .map((t) => `${typeCount[t.id]} ${t.short.toLowerCase()}`)
    .join(", ");
  const act = AEDLP_DATA.actions[action] ? AEDLP_DATA.actions[action].label.toLowerCase() : "warn";
  return `Flags outbound email containing ${list}.${regionTxt} Combines ${typeTxt} condition${
    items.length > 1 ? "s" : ""
  }. Suggested action: ${act}.`;
}

export function suggestTags(items: Detector[]): string[] {
  if (!items.length) return [];
  const tags: string[] = [];
  items.forEach((i) => {
    tags.push(slugify(i.category));
    if (i.regionLabel && i.regionLabel !== "Global") tags.push(slugify(i.regionLabel));
    if (i.industry) tags.push(slugify(i.industry));
    const t = AEDLP_DATA.conditionTypes.find((c) => c.id === i.conditionType);
    if (t) tags.push(t.short.toLowerCase());
  });
  if (items.some((i) => i.falsePositiveRisk === "high")) tags.push("tune-fp");
  return uniq(tags).slice(0, 9);
}

export function suggestAction(items: Detector[]): RecommendedAction {
  if (!items.length) return "warn";
  let best: RecommendedAction = "warn";
  let rank = 0;
  items.forEach((i) => {
    const a = AEDLP_DATA.actions[i.recommendedAction];
    if (a && a.rank > rank) {
      rank = a.rank;
      best = i.recommendedAction;
    }
  });
  return best;
}
