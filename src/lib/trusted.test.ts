// @vitest-environment jsdom
import { afterEach, describe, it, expect } from "vitest";
import {
  TRUSTED_LS_KEY,
  TRUSTED_CONDITION_ID,
  loadTrustedDomains,
  saveTrustedDomains,
  makeTrustedCondition,
} from "./trusted";

afterEach(() => localStorage.clear());

describe("trusted-domain handoff helpers", () => {
  it("round-trips a saved list under the shared key", () => {
    saveTrustedDomains(["a.com", "b.com"]);
    expect(localStorage.getItem(TRUSTED_LS_KEY)).toBe(JSON.stringify(["a.com", "b.com"]));
    expect(loadTrustedDomains()).toEqual(["a.com", "b.com"]);
  });

  it("returns [] for missing or malformed data without throwing", () => {
    expect(loadTrustedDomains()).toEqual([]);
    localStorage.setItem(TRUSTED_LS_KEY, "not json");
    expect(loadTrustedDomains()).toEqual([]);
    localStorage.setItem(TRUSTED_LS_KEY, JSON.stringify({ not: "an array" }));
    expect(loadTrustedDomains()).toEqual([]);
    // non-string members are dropped
    localStorage.setItem(TRUSTED_LS_KEY, JSON.stringify(["ok.com", 5, null, "fine.com"]));
    expect(loadTrustedDomains()).toEqual(["ok.com", "fine.com"]);
  });

  it("builds a trusted/allowed recipient-domain condition with a stable id", () => {
    const c = makeTrustedCondition(["x.com", "y.com"]);
    expect(c.id).toBe(TRUSTED_CONDITION_ID);
    expect(c.conditionType).toBe("recipient_domain");
    // An allow-list, so the lowest-rank action — never a block.
    expect(c.recommendedAction).toBe("silently_track");
    expect(c.displayName.toLowerCase()).toContain("trusted");
    if (c.conditionType === "recipient_domain") {
      expect(c.domains).toEqual(["x.com", "y.com"]);
    }
  });
});
