import { describe, it, expect } from "vitest";
import { AEDLP_DATA } from "./library";
import {
  ukPiiDetectors,
  ukPiiRegexDetectors,
  ukPiiKeywordPatternDetectors,
} from "./uk-pii-detectors";
import { runRegexTest } from "../lib/regex";
import { evaluateKeywordPattern } from "../lib/match";

/**
 * UK PII batch guard. Pins the five new detectors so a later edit cannot
 * silently break a pattern, drop a detector, or change its taxonomy.
 *   • 3 regular_expression: gb-postcode, gb-mobile, gb-dob
 *   • 2 keyword_pattern:    kp-gb-identity-bundle, kp-gb-special-category
 * The app's Test panel always evaluates case-insensitively (see TestPanel),
 * so the matching tests mirror that.
 */
const UK_PII_IDS = [
  "gb-postcode",
  "gb-mobile",
  "gb-dob",
  "kp-gb-identity-bundle",
  "kp-gb-special-category",
];

describe("UK PII detector batch", () => {
  it("registers the five detectors in the library", () => {
    const ids = new Set(AEDLP_DATA.detectors.map((d) => d.id));
    for (const id of UK_PII_IDS) expect(ids.has(id)).toBe(true);
    expect(ukPiiDetectors.map((d) => d.id)).toEqual(UK_PII_IDS);
  });

  it("keeps every detector id unique across the whole library", () => {
    const ids = AEDLP_DATA.detectors.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("tags all five GB / United Kingdom / Personal data (PII)", () => {
    for (const id of UK_PII_IDS) {
      const d = AEDLP_DATA.detectors.find((x) => x.id === id);
      expect(d, id).toBeTruthy();
      expect(d!.country).toBe("GB");
      expect(d!.regionLabel).toBe("United Kingdom");
      expect(d!.category).toBe("Personal data (PII)");
    }
  });

  it("surfaces all five under the United Kingdom region and PII category filters", () => {
    const uk = AEDLP_DATA.detectors.filter((d) => d.regionLabel === "United Kingdom");
    const pii = AEDLP_DATA.detectors.filter((d) => d.category === "Personal data (PII)");
    for (const id of UK_PII_IDS) {
      expect(uk.some((d) => d.id === id), `region: ${id}`).toBe(true);
      expect(pii.some((d) => d.id === id), `category: ${id}`).toBe(true);
    }
  });

  describe("regex detectors compile and match their examples", () => {
    for (const d of ukPiiRegexDetectors) {
      it(`${d.id} compiles, matches every positive example, rejects negatives`, () => {
        // compiles cleanly
        expect(() => new RegExp(d.regex, "gi")).not.toThrow();
        for (const ex of d.positiveExamples) {
          const r = runRegexTest(d.regex, ex, true);
          expect(r.ok, `${d.id} ok for "${ex}"`).toBe(true);
          expect(r.count, `${d.id} should match "${ex}"`).toBeGreaterThan(0);
        }
        for (const ex of d.negativeExamples ?? []) {
          const r = runRegexTest(d.regex, ex, true);
          expect(r.count, `${d.id} should NOT match "${ex}"`).toBe(0);
        }
      });
    }
  });

  describe("keyword patterns trip on both groups, not on one", () => {
    for (const d of ukPiiKeywordPatternDetectors) {
      it(`${d.id} matches when both groups co-occur and not when only one does`, () => {
        for (const ex of d.positiveExamples) {
          const r = evaluateKeywordPattern(d, ex, true);
          expect(r.ok, `${d.id} ok for "${ex}"`).toBe(true);
          expect(r.matched, `${d.id} should trip on "${ex}"`).toBe(true);
        }
        for (const ex of d.negativeExamples ?? []) {
          const r = evaluateKeywordPattern(d, ex, true);
          expect(r.matched, `${d.id} should NOT trip on "${ex}"`).toBe(false);
        }
      });
    }
  });
});
