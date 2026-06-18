import { describe, it, expect } from "vitest";
import { AEDLP_DATA, phase1Detectors } from "./library";
import { filterDetectors } from "../lib/search";

/**
 * Phase 1 expansion guard (UK, EU core, US).
 *
 * These detectors are FORMAT-ONLY patterns for the in-browser tester: no Luhn
 * on cards, no checksum validation on national IDs (see each detector's notes).
 * The tests below pin the supplied definitions so a later edit cannot silently
 * break a pattern, duplicate an id, or let the two new countries (NL, IT) fall
 * through the region filter.
 */
describe("Phase 1 detectors", () => {
  it("adds 22 regular-expression detectors", () => {
    expect(phase1Detectors).toHaveLength(22);
    expect(phase1Detectors.every((d) => d.conditionType === "regular_expression")).toBe(true);
  });

  it("every new detector id is unique across the whole library", () => {
    const allIds = AEDLP_DATA.detectors.map((d) => d.id);
    // No id appears twice anywhere in the assembled library.
    expect(new Set(allIds).size).toBe(allIds.length);
    // Each Phase 1 id is present exactly once.
    for (const d of phase1Detectors) {
      expect(allIds.filter((id) => id === d.id)).toHaveLength(1);
    }
  });

  it("every new detector regex compiles and matches all of its positiveExamples", () => {
    for (const d of phase1Detectors) {
      const re = new RegExp(d.regex);
      expect(d.positiveExamples.length).toBeGreaterThan(0);
      for (const example of d.positiveExamples) {
        expect(re.test(example), `${d.id} should match ${JSON.stringify(example)}`).toBe(true);
      }
    }
  });

  it("exposes the new countries (NL, IT) in the region filter", () => {
    expect(AEDLP_DATA.regions).toContain("Italy");
    expect(AEDLP_DATA.regions).toContain("Netherlands");
  });

  it("resolves NL and IT through the same region derivation as the existing EU countries", () => {
    // Every detector's regionLabel must be a known region, so nothing falls
    // through the filter. This is exactly how FR/DE/ES/IE/EU already resolve.
    const regionSet = new Set(AEDLP_DATA.regions);
    for (const d of AEDLP_DATA.detectors) {
      expect(regionSet.has(d.regionLabel), `${d.id} regionLabel ${d.regionLabel}`).toBe(true);
    }

    // The two new country codes map to their region labels just like the
    // existing EU members do.
    const codeToRegion: Record<string, string> = {};
    for (const d of AEDLP_DATA.detectors) codeToRegion[d.country] = d.regionLabel;
    expect(codeToRegion.IT).toBe("Italy");
    expect(codeToRegion.NL).toBe("Netherlands");
    for (const code of ["FR", "DE", "ES", "IE", "EU", "IT", "NL"]) {
      expect(regionSet.has(codeToRegion[code]), `${code} -> ${codeToRegion[code]}`).toBe(true);
    }
  });

  it("returns the new EU-core detectors when filtering by their region", () => {
    const italy = filterDetectors(AEDLP_DATA.detectors, { region: "Italy" });
    const netherlands = filterDetectors(AEDLP_DATA.detectors, { region: "Netherlands" });
    expect(italy.map((d) => d.id)).toContain("it-codice-fiscale");
    expect(netherlands.map((d) => d.id)).toContain("nl-bsn");
    expect(italy.every((d) => d.regionLabel === "Italy")).toBe(true);
    expect(netherlands.every((d) => d.regionLabel === "Netherlands")).toBe(true);
  });

  it("keeps the no-checksum disclaimers in the new detectors' notes", () => {
    // The format-only nature must remain visible. Spot-check the cards (no Luhn)
    // and a national ID (no checksum), plus assert every new detector documents
    // its limitation in notes.
    const byId = new Map(phase1Detectors.map((d) => [d.id, d] as const));
    expect(byId.get("cc-visa")?.notes?.some((n) => /Luhn/i.test(n))).toBe(true);
    expect(byId.get("nl-bsn")?.notes?.some((n) => /checksum|11-test/i.test(n))).toBe(true);
    expect(phase1Detectors.every((d) => (d.notes?.length ?? 0) > 0)).toBe(true);
  });
});
