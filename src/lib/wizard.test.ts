// @vitest-environment jsdom
import { afterEach, describe, it, expect } from "vitest";
import {
  qualifyingIndustries,
  wizardPolicyName,
  wizardPolicyDescription,
  wizardPolicyTags,
  accountKey,
  loadWizardState,
  setGlobalDismiss,
  clearGlobalDismiss,
  recordCompletedAccount,
  decideLanding,
  MIN_INDUSTRY_DETECTORS,
} from "./wizard";
import { AEDLP_DATA } from "../data/library";
import { filterDetectors } from "./search";

afterEach(() => localStorage.clear());

describe("qualifyingIndustries (derived from the library)", () => {
  const qualifying = qualifyingIndustries();

  it("returns a non-empty subset of the real taxonomy, in taxonomy order", () => {
    expect(qualifying.length).toBeGreaterThan(0);
    for (const ind of qualifying) expect(AEDLP_DATA.industries).toContain(ind);
    // Order preserved (a stable filter of AEDLP_DATA.industries).
    const expectedOrder = AEDLP_DATA.industries.filter((i) => qualifying.includes(i));
    expect(qualifying).toEqual(expectedOrder);
  });

  it("excludes the Cross-industry umbrella (it matches every vertical)", () => {
    expect(qualifying).not.toContain("Cross-industry");
  });

  it("excludes verticals with too few of their own detectors", () => {
    // Education ships 2 industry-specific detectors — below the bar.
    const educationSpecific = AEDLP_DATA.detectors.filter((d) =>
      (d.industries || []).includes("Education"),
    ).length;
    expect(educationSpecific).toBeLessThan(MIN_INDUSTRY_DETECTORS);
    expect(qualifying).not.toContain("Education");
  });

  it("includes verticals that carry enough of their own detectors", () => {
    // Financial services and Aerospace & defense each ship well over the
    // threshold of their own detectors, so both still qualify now that the
    // static competitor packs are gone.
    expect(qualifying).toContain("Financial services");
    expect(qualifying).toContain("Aerospace & defense");
  });

  it("never offers a choice that lands on a vertical with nothing of its own", () => {
    // Each qualifying industry must contribute at least one of its OWN detectors
    // on top of the cross-industry baseline.
    for (const ind of qualifying) {
      const own = AEDLP_DATA.detectors.filter((d) => (d.industries || []).includes(ind));
      expect(own.length, `${ind} should have its own detectors`).toBeGreaterThan(0);
      // And the live filter returns a real, non-empty result.
      expect(filterDetectors(AEDLP_DATA.detectors, { industry: ind }).length).toBeGreaterThan(0);
    }
  });
});

describe("policy field prefill", () => {
  const acc = { customer: "Globex", industry: "Financial services" };

  it("names the policy '<Customer>, <Industry> DLP'", () => {
    expect(wizardPolicyName(acc)).toBe("Globex, Financial services DLP");
  });

  it("writes a one-line description for the customer + industry", () => {
    expect(wizardPolicyDescription(acc)).toBe("DLP policy for Globex (Financial services).");
  });

  it("tags with the slugged customer and industry, de-duplicated and trimmed", () => {
    expect(wizardPolicyTags(acc)).toEqual(["globex", "financial-services"]);
    expect(wizardPolicyName({ customer: "  Globex  ", industry: "Financial services" })).toBe(
      "Globex, Financial services DLP",
    );
    // Collapses to one tag when the customer is named after its industry.
    expect(wizardPolicyTags({ customer: "Legal", industry: "Legal" })).toEqual(["legal"]);
  });
});

describe("localStorage persistence", () => {
  it("keys every wizard key under aedlp_wizard_*", () => {
    setGlobalDismiss(true);
    recordCompletedAccount({ customer: "Initech", industry: "Technology & SaaS" });
    for (const k of Object.keys(localStorage)) expect(k.startsWith("aedlp_wizard_")).toBe(true);
  });

  it("remembers a completed account keyed by customer+industry, and the last pointer", () => {
    const acc = { customer: "Initech", industry: "Technology & SaaS" };
    recordCompletedAccount(acc);
    const state = loadWizardState();
    expect(state.last).toEqual(acc);
    expect(state.accounts[accountKey(acc)]).toMatchObject(acc);
    expect(typeof state.accounts[accountKey(acc)].completedAt).toBe("number");
  });

  it("trims on write and ignores a blank account", () => {
    recordCompletedAccount({ customer: "  Initech  ", industry: "Technology & SaaS" });
    expect(loadWizardState().last).toEqual({ customer: "Initech", industry: "Technology & SaaS" });
    recordCompletedAccount({ customer: "   ", industry: "Technology & SaaS" });
    // Still the trimmed valid one — the blank write was ignored.
    expect(loadWizardState().last).toEqual({ customer: "Initech", industry: "Technology & SaaS" });
  });

  it("sets and clears the global preference", () => {
    setGlobalDismiss(true);
    expect(loadWizardState().globalDismiss).toBe(true);
    clearGlobalDismiss();
    expect(loadWizardState().globalDismiss).toBe(false);
  });
});

describe("decideLanding precedence", () => {
  it("shows the wizard on first load (no state)", () => {
    expect(decideLanding()).toEqual({ kind: "wizard" });
  });

  it("reapplies the last completed account when present", () => {
    const acc = { customer: "Initech", industry: "Technology & SaaS" };
    recordCompletedAccount(acc);
    expect(decideLanding()).toEqual({ kind: "library", account: acc });
  });

  it("lets the global preference win over a completed account (plain library)", () => {
    recordCompletedAccount({ customer: "Initech", industry: "Technology & SaaS" });
    setGlobalDismiss(true);
    expect(decideLanding()).toEqual({ kind: "library", account: null });
  });

  it("falls back to the wizard on corrupt state", () => {
    localStorage.setItem("aedlp_wizard_last", "{ not json");
    localStorage.setItem("aedlp_wizard_accounts", "also broken");
    localStorage.setItem("aedlp_wizard_global_dismiss", "not-one");
    expect(decideLanding()).toEqual({ kind: "wizard" });
    // And a corrupt accounts blob reads back as an empty map, not a throw.
    expect(loadWizardState().accounts).toEqual({});
  });
});
