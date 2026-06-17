import { describe, it, expect } from "vitest";
import {
  AEDLP_DATA,
  phase2Detectors,
  phase2Regex,
  phase2Keywords,
  phase2KeywordPatterns,
} from "./library";
import { filterDetectors } from "../lib/search";
import { runConditionTest } from "../lib/match";

/**
 * Phase 2 expansion guard (Aerospace, Defence & Export Control).
 *
 * These detectors flag the PUBLIC markings and identifiers stamped on
 * controlled material (ITAR/EAR/CUI banners, DoD distribution statements,
 * ECCN labels, CAGE/NSN identifiers, UK export-control terms) — not any
 * controlled technical content. They are format-only patterns for the
 * in-browser tester (no checksum / list-membership validation; see notes).
 *
 * The tests below pin the supplied definitions so a later edit cannot
 * silently break a pattern, duplicate an id, or drop the new
 * "Aerospace & defense" industry from the filter.
 */
describe("Phase 2 detectors", () => {
  it("adds 10 detectors: 4 regex, 4 keyword, 2 keyword_pattern", () => {
    expect(phase2Detectors).toHaveLength(10);
    expect(phase2Regex).toHaveLength(4);
    expect(phase2Keywords).toHaveLength(4);
    expect(phase2KeywordPatterns).toHaveLength(2);
    expect(phase2Regex.every((d) => d.conditionType === "regular_expression")).toBe(true);
    expect(phase2Keywords.every((d) => d.conditionType === "keyword")).toBe(true);
    expect(phase2KeywordPatterns.every((d) => d.conditionType === "keyword_pattern")).toBe(true);
  });

  it("every new detector id is unique across the whole library", () => {
    const allIds = AEDLP_DATA.detectors.map((d) => d.id);
    expect(new Set(allIds).size).toBe(allIds.length);
    for (const d of phase2Detectors) {
      expect(allIds.filter((id) => id === d.id)).toHaveLength(1);
    }
  });

  it("every new regex compiles and matches all of its positiveExamples", () => {
    for (const d of phase2Regex) {
      const re = new RegExp(d.regex);
      expect(d.positiveExamples.length).toBeGreaterThan(0);
      for (const example of d.positiveExamples) {
        expect(re.test(example), `${d.id} should match ${JSON.stringify(example)}`).toBe(true);
      }
    }
  });

  it("keyword detectors trip on their terms and stay quiet otherwise", () => {
    for (const d of phase2Keywords) {
      for (const example of d.positiveExamples) {
        expect(runConditionTest(d, example, true).matched, `${d.id} +${JSON.stringify(example)}`).toBe(true);
      }
      for (const example of d.negativeExamples ?? []) {
        expect(runConditionTest(d, example, true).matched, `${d.id} -${JSON.stringify(example)}`).toBe(false);
      }
    }
  });

  it("keyword_pattern detectors trip only when both groups co-occur", () => {
    for (const d of phase2KeywordPatterns) {
      for (const example of d.positiveExamples) {
        expect(runConditionTest(d, example, true).matched, `${d.id} +${JSON.stringify(example)}`).toBe(true);
      }
      for (const example of d.negativeExamples ?? []) {
        expect(runConditionTest(d, example, true).matched, `${d.id} -${JSON.stringify(example)}`).toBe(false);
      }
    }

    // Explicit single-group checks for the AND/proximity logic: a sample with
    // only one group present must not trip, even though one group does match.
    const tdp = phase2KeywordPatterns.find((d) => d.id === "kp-export-controlled-technical-data")!;
    expect(runConditionTest(tdp, "The attached technical data package is ITAR controlled.", true).matched).toBe(true);
    expect(runConditionTest(tdp, "Please review the attached technical data and schematic.", true).matched).toBe(false);
    expect(runConditionTest(tdp, "This item is ITAR controlled and export controlled.", true).matched).toBe(false);
  });

  it("registers Aerospace & defense and makes the new detectors filterable under it", () => {
    expect(AEDLP_DATA.industries).toContain("Aerospace & defense");
    // Every Phase 2 detector resolves to the new industry via the derivation.
    for (const d of phase2Detectors) {
      const live = AEDLP_DATA.detectors.find((x) => x.id === d.id)!;
      expect(live.industries, d.id).toContain("Aerospace & defense");
    }
    // Filtering by the new industry returns all of them.
    const filteredIds = new Set(
      filterDetectors(AEDLP_DATA.detectors, { industry: "Aerospace & defense" }).map((d) => d.id),
    );
    for (const d of phase2Detectors) {
      expect(filteredIds.has(d.id), d.id).toBe(true);
    }
  });

  it("keeps the format-only / export-control disclaimers in the new detectors' notes", () => {
    expect(phase2Detectors.every((d) => (d.notes?.length ?? 0) > 0)).toBe(true);
    const byId = new Map(phase2Detectors.map((d) => [d.id, d] as const));
    expect(byId.get("us-cage-code")?.notes?.some((n) => /not checked here|registry/i.test(n))).toBe(true);
    expect(byId.get("eccn-classification")?.notes?.some((n) => /CCL|AEDLP/i.test(n))).toBe(true);
  });
});
