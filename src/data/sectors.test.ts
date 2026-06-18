import { describe, it, expect } from "vitest";
import { AEDLP_DATA, competitorPacks } from "./library";
import {
  constructionDetectors,
  conRegex,
  conKeywords,
  conKeywordPatterns,
  conPacks,
} from "./sector-construction";
import { travelDetectors, travRegex, travKeywords, travKeywordPatterns, travPacks } from "./sector-travel";
import { filterDetectors } from "../lib/search";
import { runConditionTest } from "../lib/match";
import { qualifyingIndustries } from "../lib/wizard";

/**
 * Sector expansion guard: Construction & real estate, and Travel & transport.
 *
 * Two new wide industries are registered in the taxonomy (exactly as
 * "Aerospace & defense" was) and populated with vetted, example-only detectors
 * — 4 regex, 2 keyword, 2 keyword_pattern and 2 recipient_domain competitor
 * packs. These tests pin the supplied definitions so a later edit cannot
 * silently break a pattern, duplicate an id, leak a competitor pack across
 * industries (the PR #9 Cross-industry bug), or drop a new industry from the
 * wizard dropdown / library filter.
 */

const sectorRegex = [...conRegex, ...travRegex];
const sectorKeywords = [...conKeywords, ...travKeywords];
const sectorKeywordPatterns = [...conKeywordPatterns, ...travKeywordPatterns];
const sectorPacks = [...conPacks, ...travPacks];
const sectorDetectors = [...constructionDetectors, ...travelDetectors];

const NEW_IDS = [
  "gb-land-registry-title",
  "uk-planning-ref",
  "kw-construction-terms",
  "kp-construction-tender",
  "rcp-competitors-construction",
  "airline-pnr",
  "airline-ticket-number",
  "kw-travel-terms",
  "kp-passenger-identity",
  "rcp-competitors-airlines",
];

describe("Sector batch (Construction & real estate, Travel & transport)", () => {
  it("adds 10 detectors with the expected ids and shapes (5 per sector)", () => {
    expect(constructionDetectors).toHaveLength(5);
    expect(travelDetectors).toHaveLength(5);
    expect(sectorRegex).toHaveLength(4);
    expect(sectorKeywords).toHaveLength(2);
    expect(sectorKeywordPatterns).toHaveLength(2);
    expect(sectorPacks).toHaveLength(2);
    expect(sectorRegex.every((d) => d.conditionType === "regular_expression")).toBe(true);
    expect(sectorKeywords.every((d) => d.conditionType === "keyword")).toBe(true);
    expect(sectorKeywordPatterns.every((d) => d.conditionType === "keyword_pattern")).toBe(true);
    expect(sectorPacks.every((d) => d.conditionType === "recipient_domain")).toBe(true);
    expect(sectorDetectors.map((d) => d.id).sort()).toEqual([...NEW_IDS].sort());
  });

  it("every new id is unique across the whole library", () => {
    const allIds = AEDLP_DATA.detectors.map((d) => d.id);
    expect(new Set(allIds).size).toBe(allIds.length);
    for (const id of NEW_IDS) {
      expect(allIds.filter((x) => x === id), id).toHaveLength(1);
    }
  });

  it("every new regex compiles and matches all of its positiveExamples", () => {
    for (const d of sectorRegex) {
      const re = new RegExp(d.regex);
      expect(d.positiveExamples.length).toBeGreaterThan(0);
      for (const example of d.positiveExamples) {
        expect(re.test(example), `${d.id} should match ${JSON.stringify(example)}`).toBe(true);
      }
    }
  });

  it("keyword detectors trip on their terms and stay quiet otherwise", () => {
    for (const d of sectorKeywords) {
      for (const example of d.positiveExamples) {
        expect(runConditionTest(d, example, true).matched, `${d.id} +${JSON.stringify(example)}`).toBe(true);
      }
      for (const example of d.negativeExamples ?? []) {
        expect(runConditionTest(d, example, true).matched, `${d.id} -${JSON.stringify(example)}`).toBe(false);
      }
    }
  });

  it("keyword_pattern detectors trip only when both groups co-occur within the window", () => {
    for (const d of sectorKeywordPatterns) {
      for (const example of d.positiveExamples) {
        expect(runConditionTest(d, example, true).matched, `${d.id} +${JSON.stringify(example)}`).toBe(true);
      }
      for (const example of d.negativeExamples ?? []) {
        expect(runConditionTest(d, example, true).matched, `${d.id} -${JSON.stringify(example)}`).toBe(false);
      }
    }

    // Explicit AND/proximity checks: one group alone must not trip, and both
    // groups present but beyond the proximity window must not trip either.
    const tender = sectorKeywordPatterns.find((d) => d.id === "kp-construction-tender")!;
    expect(runConditionTest(tender, "The tender pricing is commercially sensitive, do not distribute.", true).matched).toBe(true);
    // group 1 only (tender/pricing) — no confidentiality marker:
    expect(runConditionTest(tender, "The tender pricing has been submitted to the client.", true).matched).toBe(false);
    // group 2 only (confidentiality marker) — no tender/pricing term:
    expect(runConditionTest(tender, "This document is commercially sensitive.", true).matched).toBe(false);
    // both groups present but far apart (> 15 words) — must not trip:
    expect(
      runConditionTest(
        tender,
        "The tender for the new depot was reviewed by the regional team across several sites and later all of it was marked strictly private.",
        true,
      ).matched,
    ).toBe(false);

    const pax = sectorKeywordPatterns.find((d) => d.id === "kp-passenger-identity")!;
    expect(runConditionTest(pax, "Passenger manifest includes passport and date of birth for each traveller.", true).matched).toBe(true);
    // group 1 only (passenger/manifest) — no identity element:
    expect(runConditionTest(pax, "The passenger manifest was finalised before departure.", true).matched).toBe(false);
    // group 2 only (identity element) — no passenger/traveller term:
    expect(runConditionTest(pax, "Please bring your passport to the desk.", true).matched).toBe(false);
    // both groups present but far apart (> 15 words) — must not trip:
    expect(
      runConditionTest(
        pax,
        "The passenger boarded the aircraft early in the morning and only very much later that day did anyone bother to ask about a passport.",
        true,
      ).matched,
    ).toBe(false);
  });

  it("registers both new industries and tags every sector detector under its own", () => {
    expect(AEDLP_DATA.industries).toContain("Construction & real estate");
    expect(AEDLP_DATA.industries).toContain("Travel & transport");
    const live = (id: string) => AEDLP_DATA.detectors.find((x) => x.id === id)!;
    for (const d of constructionDetectors) {
      expect(live(d.id).industries, d.id).toContain("Construction & real estate");
    }
    for (const d of travelDetectors) {
      expect(live(d.id).industries, d.id).toContain("Travel & transport");
    }
    // Sector detectors are filterable under their own industry.
    const conIds = new Set(filterDetectors(AEDLP_DATA.detectors, { industry: "Construction & real estate" }).map((d) => d.id));
    for (const d of constructionDetectors) expect(conIds.has(d.id), d.id).toBe(true);
    const travIds = new Set(filterDetectors(AEDLP_DATA.detectors, { industry: "Travel & transport" }).map((d) => d.id));
    for (const d of travelDetectors) expect(travIds.has(d.id), d.id).toBe(true);
  });

  it("scopes each competitor pack to its own industry only — no Cross-industry leak", () => {
    const live = (id: string) => AEDLP_DATA.detectors.find((d) => d.id === id)!;
    // Explicit industries arrays, exactly one vertical each (the PR #9 guard).
    expect(live("rcp-competitors-construction").industries).toEqual(["Construction & real estate"]);
    expect(live("rcp-competitors-airlines").industries).toEqual(["Travel & transport"]);
    for (const id of ["rcp-competitors-construction", "rcp-competitors-airlines"]) {
      expect(live(id).industries, `${id} must not be Cross-industry`).not.toContain("Cross-industry");
    }

    const idsFor = (industry: string) =>
      new Set(filterDetectors(AEDLP_DATA.detectors, { industry }).map((d) => d.id));

    // Each pack appears under its own industry...
    expect(idsFor("Construction & real estate").has("rcp-competitors-construction")).toBe(true);
    expect(idsFor("Travel & transport").has("rcp-competitors-airlines")).toBe(true);

    // ...and NEVER under another industry (the other sector or unrelated ones,
    // including the Cross-industry umbrella).
    for (const industry of [
      "Travel & transport",
      "Aerospace & defense",
      "Financial services",
      "Healthcare & life sciences",
      "Cross-industry",
    ]) {
      expect(idsFor(industry).has("rcp-competitors-construction"), `construction under ${industry}`).toBe(false);
    }
    for (const industry of [
      "Construction & real estate",
      "Aerospace & defense",
      "Financial services",
      "Healthcare & life sciences",
      "Cross-industry",
    ]) {
      expect(idsFor(industry).has("rcp-competitors-airlines"), `airlines under ${industry}`).toBe(false);
    }
  });

  it("both packs join competitorPacks and flag mail SENT TO a listed domain only", () => {
    const ids = competitorPacks.map((d) => d.id);
    expect(ids).toContain("rcp-competitors-construction");
    expect(ids).toContain("rcp-competitors-airlines");
    for (const d of sectorPacks) {
      for (const example of d.positiveExamples) {
        expect(runConditionTest(d, example, true).matched, `${d.id} +${example}`).toBe(true);
      }
      for (const example of d.negativeExamples ?? []) {
        expect(runConditionTest(d, example, true).matched, `${d.id} -${example}`).toBe(false);
      }
    }
  });

  it("surfaces both new industries in the wizard dropdown and the library filter", () => {
    // Library industry filter is driven directly by AEDLP_DATA.industries.
    expect(AEDLP_DATA.industries).toContain("Construction & real estate");
    expect(AEDLP_DATA.industries).toContain("Travel & transport");
    // Wizard dropdown derives from the data: both ship a competitor pack, so
    // both qualify (and each lands on a non-empty filter).
    const qualifying = qualifyingIndustries();
    expect(qualifying).toContain("Construction & real estate");
    expect(qualifying).toContain("Travel & transport");
    expect(filterDetectors(AEDLP_DATA.detectors, { industry: "Construction & real estate" }).length).toBeGreaterThan(0);
    expect(filterDetectors(AEDLP_DATA.detectors, { industry: "Travel & transport" }).length).toBeGreaterThan(0);
  });

  it("keeps the vetted notes intact, including the IAG/group caution on airlines", () => {
    const live = (id: string) => AEDLP_DATA.detectors.find((d) => d.id === id)!;
    for (const d of sectorPacks) {
      expect(d.notes?.some((n) => /remove your own organisation/i.test(n)), `${d.id} curate steer`).toBe(true);
    }
    const airlines = live("rcp-competitors-airlines");
    expect(airlines.notes?.some((n) => /IAG/.test(n)), "IAG caution preserved").toBe(true);
    expect(airlines.notes?.some((n) => /joint-venture|alliance/i.test(n))).toBe(true);
    expect(sectorDetectors.every((d) => (d.notes?.length ?? 0) > 0)).toBe(true);
  });
});
