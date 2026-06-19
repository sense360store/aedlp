import { describe, it, expect } from "vitest";
import {
  normalizeDomain,
  buildHygieneSets,
  flagsForDomain,
  analyzeDomains,
  type HygieneFlag,
} from "./hygiene";
import { AEDLP_RECIPIENT_DOMAINS } from "../data/recipients";

// A few anchors from the shipped packs, used across the cases below.
const FREEMAIL = "gmail.com"; // freemail only
const DISPOSABLE = "yopmail.com"; // in BOTH packs (every disposable entry is also freemail)
const CLEAN = "soteria365.example"; // on no list
const COMPETITOR = "globex-rival.example";

describe("normalizeDomain", () => {
  it("case-folds, trims and strips a single leading @", () => {
    expect(normalizeDomain("  GMAIL.com ")).toBe("gmail.com");
    expect(normalizeDomain("@Gmail.com")).toBe("gmail.com");
    expect(normalizeDomain("@@x.com")).toBe("@x.com"); // only one leading @ is stripped
  });

  it("returns an empty string for empty / non-string input", () => {
    expect(normalizeDomain("")).toBe("");
    expect(normalizeDomain("   ")).toBe("");
    expect(normalizeDomain(null)).toBe("");
    expect(normalizeDomain(undefined)).toBe("");
  });
});

describe("buildHygieneSets", () => {
  it("loads the freemail and disposable packs and an optional competitor list", () => {
    const sets = buildHygieneSets([COMPETITOR, "@Rival.example"]);
    expect(sets.freemail.has(FREEMAIL)).toBe(true);
    expect(sets.disposable.has(DISPOSABLE)).toBe(true);
    // Competitor entries are normalised on the way in.
    expect(sets.competitor.has(COMPETITOR)).toBe(true);
    expect(sets.competitor.has("rival.example")).toBe(true);
  });

  it("defaults to an empty competitor set", () => {
    expect(buildHygieneSets().competitor.size).toBe(0);
  });

  it("matches the full shipped pack sizes (deduped)", () => {
    const sets = buildHygieneSets();
    expect(sets.freemail.size).toBe(new Set(AEDLP_RECIPIENT_DOMAINS.freemail).size);
    expect(sets.disposable.size).toBe(new Set(AEDLP_RECIPIENT_DOMAINS.disposable).size);
  });
});

describe("flagsForDomain", () => {
  const sets = buildHygieneSets([COMPETITOR]);

  it("flags a freemail-only domain as freemail", () => {
    expect(flagsForDomain(FREEMAIL, sets)).toEqual<HygieneFlag[]>(["freemail"]);
  });

  it("flags a domain on both packs with both labels, in stable order", () => {
    expect(flagsForDomain(DISPOSABLE, sets)).toEqual<HygieneFlag[]>(["freemail", "disposable"]);
  });

  it("flags a competitor domain as competitor", () => {
    expect(flagsForDomain(COMPETITOR, sets)).toEqual<HygieneFlag[]>(["competitor"]);
  });

  it("normalises before comparing (case + leading @)", () => {
    expect(flagsForDomain("@GMAIL.COM", sets)).toEqual<HygieneFlag[]>(["freemail"]);
  });

  it("returns no flags for a clean domain", () => {
    expect(flagsForDomain(CLEAN, sets)).toEqual([]);
    expect(flagsForDomain("", sets)).toEqual([]);
  });
});

describe("analyzeDomains", () => {
  it("flags exactly the freemail / disposable / competitor domains in a mixed list", () => {
    const list = [CLEAN, FREEMAIL, DISPOSABLE, COMPETITOR, "acme-corp.example"];
    const report = analyzeDomains(list, buildHygieneSets([COMPETITOR]));

    expect(report.total).toBe(5);
    expect(report.flaggedCount).toBe(3);
    expect(new Set(report.flagged)).toEqual(new Set([FREEMAIL, DISPOSABLE, COMPETITOR]));

    // The clean domains carry no entry in the flags map.
    expect(report.flags.has(CLEAN)).toBe(false);
    expect(report.flags.has("acme-corp.example")).toBe(false);
    expect(report.flags.get(FREEMAIL)).toEqual(["freemail"]);
    expect(report.flags.get(DISPOSABLE)).toEqual(["freemail", "disposable"]);
    expect(report.flags.get(COMPETITOR)).toEqual(["competitor"]);
  });

  it("tallies per flag, counting a multi-list domain toward each", () => {
    const report = analyzeDomains([FREEMAIL, DISPOSABLE, COMPETITOR], buildHygieneSets([COMPETITOR]));
    // DISPOSABLE is on both packs, so freemail=2 (gmail + yopmail), disposable=1.
    expect(report.counts).toEqual({ freemail: 2, disposable: 1, competitor: 1 });
  });

  it("counts each distinct domain once even when the input repeats or varies in case", () => {
    const report = analyzeDomains([FREEMAIL, "GMAIL.com", "@gmail.com", CLEAN], buildHygieneSets());
    expect(report.total).toBe(2); // gmail.com (3 spellings) + the clean one
    expect(report.flaggedCount).toBe(1);
  });

  it("is empty for an empty input", () => {
    const report = analyzeDomains([], buildHygieneSets());
    expect(report).toEqual({
      flags: new Map(),
      flagged: [],
      total: 0,
      flaggedCount: 0,
      counts: { freemail: 0, disposable: 0, competitor: 0 },
    });
  });
});
