import { describe, it, expect } from "vitest";
import { AEDLP_DATA } from "../data/library";
import { scoreDetector, filterDetectors } from "./search";

describe("search and filter", () => {
  it("filters by condition type", () => {
    const regexOnly = filterDetectors(AEDLP_DATA.detectors, { type: "regular_expression" });
    expect(regexOnly).toHaveLength(33);
    expect(regexOnly.every((d) => d.conditionType === "regular_expression")).toBe(true);
  });

  it("filters by category", () => {
    const creds = filterDetectors(AEDLP_DATA.detectors, { category: "Credentials & secrets" });
    expect(creds.length).toBeGreaterThan(0);
    expect(creds.every((d) => d.category === "Credentials & secrets")).toBe(true);
  });

  it("filters by industry including Cross-industry detectors", () => {
    const fin = filterDetectors(AEDLP_DATA.detectors, { industry: "Financial services" });
    expect(fin.length).toBeGreaterThan(0);
    expect(
      fin.every(
        (d) => (d.industries || []).includes("Financial services") || (d.industries || []).includes("Cross-industry"),
      ),
    ).toBe(true);
  });

  it("with no query, sorts alphabetically by display name", () => {
    const all = filterDetectors(AEDLP_DATA.detectors, {});
    expect(all).toHaveLength(AEDLP_DATA.detectors.length);
    const names = all.map((d) => d.displayName);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("ranks an exact alias hit first", () => {
    const res = filterDetectors(AEDLP_DATA.detectors, { query: "SSN" });
    expect(res[0].id).toBe("us-social-security-number");
  });

  it("scoreDetector rewards exact name and alias matches", () => {
    const ssn = det("us-social-security-number");
    expect(scoreDetector(ssn, "US Social Security Number")).toBeGreaterThan(scoreDetector(ssn, "zzzzzz"));
    expect(scoreDetector(ssn, "")).toBe(1);
    expect(scoreDetector(ssn, "zzzzzz")).toBe(0);
  });
});

function det(id: string) {
  const d = AEDLP_DATA.detectors.find((x) => x.id === id);
  if (!d) throw new Error(`missing detector ${id}`);
  return d;
}
