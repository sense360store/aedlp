import { describe, it, expect } from "vitest";
import { AEDLP_DATA } from "./library";
import type { ConditionType } from "../types";

/**
 * Library count guard. Build-up to the current total of 107:
 *   - prototype data.js port, less the generic .example competitor placeholder
 *     that used to ship with it (removed in the competitor-pack cleanup): 70
 *   - Phase 1 regex (UK, EU core, US): 22
 *   - Phase 2 (Aerospace, Defence & Export Control: 4 regex, 4 keyword,
 *     2 keyword_pattern): 10
 *   - UK PII batch (3 regex: gb-postcode, gb-mobile, gb-dob; 2 keyword_pattern:
 *     kp-gb-identity-bundle, kp-gb-special-category): 5
 * The two static competitor packs (Aerospace, Financial) were removed in the
 * same cleanup; competitor domains now come only from the GenAI lookup. This
 * pins the count and condition-type coverage so a later edit cannot silently
 * drop or duplicate a detector.
 */
describe("AEDLP_DATA library (prototype parity)", () => {
  it("holds the prototype set plus the Phase 1, Phase 2 and UK PII expansions, less the removed competitor packs (107 detectors)", () => {
    expect(AEDLP_DATA.detectors).toHaveLength(107);
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
      regular_expression: 62,
      keyword: 15,
      keyword_pattern: 11,
      recipient_domain: 2,
      file_extension: 17,
    });
  });

  it("keeps the freemail + disposable recipient detectors and ships no competitor-domain pack", () => {
    const recipients = AEDLP_DATA.detectors.filter((d) => d.conditionType === "recipient_domain");

    // Only the two non-competitor recipient detectors remain.
    expect(recipients.map((d) => d.id).sort()).toEqual(["rcp-disposable", "rcp-freemail"]);

    const freemail = recipients.find((d) => d.id === "rcp-freemail");
    if (freemail?.conditionType === "recipient_domain") {
      expect(freemail.domains.length).toBeGreaterThan(1000);
    }

    // No recipient_domain detector is a static competitor-domain pack any more —
    // the GenAI lookup is the only way to add competitor domains now.
    const looksLikeCompetitorPack = (id: string, name: string) =>
      /competitor/i.test(id) || /competitor/i.test(name);
    expect(
      recipients.filter((d) => looksLikeCompetitorPack(d.id, d.displayName)).map((d) => d.id),
    ).toEqual([]);
    expect(AEDLP_DATA.detectors.some((d) => /^rcp-competitors/.test(d.id))).toBe(false);
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
