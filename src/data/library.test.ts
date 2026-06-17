import { describe, it, expect } from "vitest";
import { AEDLP_DATA } from "./library";
import type { ConditionType } from "../types";

/**
 * Library count guard: the prototype data.js ported 71 detectors; Phase 1
 * adds 22 regex detectors (UK, EU core, US), Phase 2 adds 10 more
 * (Aerospace, Defence & Export Control: 4 regex, 4 keyword, 2 keyword_pattern),
 * and the batch-1 competitor packs add 2 recipient_domain detectors
 * (Aerospace & Defence, Financial Services) for a total of 105. This pins the
 * count and condition-type coverage so a later edit cannot silently drop or
 * duplicate a detector.
 */
describe("AEDLP_DATA library (prototype parity)", () => {
  it("holds the prototype set plus the Phase 1, Phase 2 and competitor-pack expansions (105 detectors)", () => {
    expect(AEDLP_DATA.detectors).toHaveLength(105);
  });

  it("covers all five condition types", () => {
    const types = new Set<ConditionType>(AEDLP_DATA.detectors.map((d) => d.conditionType));
    expect([...types].sort()).toEqual([
      "file_extension",
      "keyword",
      "keyword_pattern",
      "recipient_domain",
      "regular_expression",
    ]);
  });

  it("matches the prototype per-type counts", () => {
    const counts: Record<string, number> = {};
    for (const d of AEDLP_DATA.detectors) {
      counts[d.conditionType] = (counts[d.conditionType] || 0) + 1;
    }
    expect(counts).toEqual({
      regular_expression: 59,
      keyword: 15,
      keyword_pattern: 9,
      recipient_domain: 5,
      file_extension: 17,
    });
  });

  it("keeps the freemail list whole and competitors on the reserved .example TLD", () => {
    const freemail = AEDLP_DATA.detectors.find((d) => d.id === "rcp-freemail");
    const competitors = AEDLP_DATA.detectors.find((d) => d.id === "rcp-competitors");
    expect(freemail?.conditionType).toBe("recipient_domain");
    expect(competitors?.conditionType).toBe("recipient_domain");
    if (freemail?.conditionType === "recipient_domain") {
      expect(freemail.domains.length).toBeGreaterThan(1000);
    }
    if (competitors?.conditionType === "recipient_domain") {
      expect(competitors.domains.every((d) => d.endsWith(".example"))).toBe(true);
    }
  });

  it("derives industries for every detector and exposes the metadata blocks", () => {
    expect(AEDLP_DATA.detectors.every((d) => (d.industries?.length ?? 0) > 0)).toBe(true);
    expect(AEDLP_DATA.conditionTypes).toHaveLength(5);
    expect(Object.keys(AEDLP_DATA.actions).sort()).toEqual([
      "block",
      "silently_track",
      "warn",
      "warn_require_justification",
    ]);
    expect(AEDLP_DATA.boundaryStrategies.map((b) => b.id)).toEqual(["as_is", "word"]);
    expect(AEDLP_DATA.sampleSnippets.length).toBeGreaterThan(0);
    expect(AEDLP_DATA.categories.length).toBeGreaterThan(0);
    expect(AEDLP_DATA.regions.length).toBeGreaterThan(0);
    expect(AEDLP_DATA.industries.length).toBeGreaterThan(0);
  });
});
