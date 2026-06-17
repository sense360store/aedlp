/* ============================================================
   Library search and filtering. Ported from handoff
   project/app/lib.jsx, behaviour preserved exactly.
   ============================================================ */
import type { Detector } from "../types";

export interface DetectorFilters {
  query?: string;
  type?: string;
  category?: string;
  region?: string;
  industry?: string;
}

export function scoreDetector(d: Detector, q: string): number {
  const query = q.trim().toLowerCase();
  if (!query) return 1;
  const terms = query.split(/\s+/);
  let score = 0;
  const hay = [
    d.displayName,
    d.category,
    d.regionLabel,
    d.country,
    d.industry,
    "family" in d ? d.family : undefined,
    ...(d.aliases || []),
    ...("keywords" in d ? d.keywords : []),
    ...("domains" in d ? d.domains : []),
    ...("extensions" in d ? d.extensions : []),
    ...("groups" in d ? d.groups.flat() : []),
  ]
    .join(" ")
    .toLowerCase();
  if (d.displayName.toLowerCase() === query) score += 100;
  if ((d.aliases || []).some((a) => a.toLowerCase() === query)) score += 80;
  if (d.displayName.toLowerCase().includes(query)) score += 40;
  for (const t of terms) {
    if (hay.includes(t)) score += 8;
  }
  return score;
}

export function filterDetectors(
  detectors: Detector[],
  { query, type, category, region, industry }: DetectorFilters,
): Detector[] {
  let pool = detectors;
  if (type && type !== "all") pool = pool.filter((d) => d.conditionType === type);
  if (category && category !== "all") pool = pool.filter((d) => d.category === category);
  if (region && region !== "all") pool = pool.filter((d) => d.regionLabel === region);
  if (industry && industry !== "all")
    pool = pool.filter(
      (d) => (d.industries || []).includes(industry) || (d.industries || []).includes("Cross-industry"),
    );
  const q = (query || "").trim();
  if (!q) return [...pool].sort((a, b) => a.displayName.localeCompare(b.displayName));
  return pool
    .map((d) => ({ d, s: scoreDetector(d, q) }))
    .filter((x) => x.s > 1)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.d);
}
