// Detector search / recommendation.
// In production, this maps to GET /patterns/search?q=... and POST /policy/recommend.
import type { Detector } from "../types";

export function scoreDetector(d: Detector, q: string): number {
  const query = q.trim().toLowerCase();
  if (!query) return 0;
  const terms = query.split(/\s+/);
  let score = 0;
  const hay = [d.displayName, d.category, d.regionLabel, d.country, ...(d.aliases || [])]
    .join(" ")
    .toLowerCase();
  if (d.displayName.toLowerCase() === query) score += 100;
  if ((d.aliases || []).some((a) => a.toLowerCase() === query)) score += 80;
  if (d.displayName.toLowerCase().includes(query)) score += 40;
  if ((d.aliases || []).some((a) => a.includes(query))) score += 30;
  for (const t of terms) if (hay.includes(t)) score += 8;
  return score;
}

export function searchDetectors(detectors: Detector[], q: string): Detector[] {
  return detectors
    .map((d) => ({ d, score: scoreDetector(d, q) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.d);
}
