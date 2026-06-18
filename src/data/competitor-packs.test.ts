import { describe, it, expect } from "vitest";
import { AEDLP_DATA, competitorPacks } from "./library";
import { filterDetectors } from "../lib/search";
import { runConditionTest, conditionCopyValue } from "../lib/match";
import type { Condition } from "../types";

/**
 * Competitor domain packs guard (batch 1: Aerospace & Defence, Financial
 * Services).
 *
 * These are INDUSTRY starting lists shipped as recipient_domain detectors —
 * the major players in a sector, not a customer-specific blocklist. They reuse
 * the existing recipient-domain behaviour; the only new product surface is that
 * they carry a real (non-.example) corporate domain list and an industry tag.
 *
 * The tests below pin the supplied lists verbatim so a later edit cannot
 * silently change a domain, duplicate an id, drop the curate-before-deploy
 * steer, or knock a pack out of its industry filter. The generic placeholder
 * rcp-competitors must stay on the reserved .example TLD (additive, not a
 * replacement).
 */

// The vetted lists, pinned exactly as supplied in competitor-packs-batch1.ts.
const AEROSPACE_DOMAINS = [
  "boeing.com", "airbus.com", "lockheedmartin.com", "rtx.com", "northropgrumman.com",
  "gd.com", "gdit.com", "baesystems.com", "leonardo.com", "thalesgroup.com",
  "saab.com", "rolls-royce.com", "safran-group.com", "l3harris.com", "leidos.com",
  "geaerospace.com", "embraer.com", "dassault-aviation.com", "bombardier.com",
  "rheinmetall.com", "elbitsystems.com", "collinsaerospace.com", "prattwhitney.com",
  "honeywell.com", "textron.com",
];
const FINANCIAL_DOMAINS = [
  "jpmorgan.com", "jpmorganchase.com", "chase.com", "bankofamerica.com", "citi.com",
  "wellsfargo.com", "gs.com", "morganstanley.com", "hsbc.com", "barclays.com",
  "lloydsbanking.com", "natwest.com", "santander.com", "db.com", "bnpparibas.com",
  "ubs.com", "sc.com", "socgen.com", "credit-agricole.com", "blackrock.com",
  "schroders.com", "schwab.com",
];

describe("Competitor domain packs (batch 1)", () => {
  it("adds the competitor packs with the expected ids (batch 1 + sector batch)", () => {
    expect(competitorPacks).toHaveLength(4);
    expect(competitorPacks.every((d) => d.conditionType === "recipient_domain")).toBe(true);
    expect(competitorPacks.map((d) => d.id)).toEqual([
      "rcp-competitors-aerospace",
      "rcp-competitors-financial",
      "rcp-competitors-construction",
      "rcp-competitors-airlines",
    ]);
    // Match mode mirrors the other recipient detectors.
    for (const d of competitorPacks) {
      expect(d.matchMode).toEqual({ caseInsensitive: true, wholeWord: true });
      expect(d.category).toBe("Recipients & destinations");
      expect(d.recommendedAction).toBe("block");
    }
  });

  it("ships the vetted domain lists verbatim (counts and order preserved)", () => {
    const byId = new Map(competitorPacks.map((d) => [d.id, d] as const));
    const aero = byId.get("rcp-competitors-aerospace")!;
    const fin = byId.get("rcp-competitors-financial")!;
    expect(aero.domains).toEqual(AEROSPACE_DOMAINS);
    expect(fin.domains).toEqual(FINANCIAL_DOMAINS);
    expect(aero.domains).toHaveLength(25);
    expect(fin.domains).toHaveLength(22);
    // Real corporate domains by design — none of these packs uses .example.
    for (const d of [aero, fin]) {
      expect(d.domains.some((x) => x.endsWith(".example"))).toBe(false);
    }
  });

  it("every pack id is unique across the whole library", () => {
    const allIds = AEDLP_DATA.detectors.map((d) => d.id);
    expect(new Set(allIds).size).toBe(allIds.length);
    for (const d of competitorPacks) {
      expect(allIds.filter((id) => id === d.id)).toHaveLength(1);
    }
  });

  it("is additive: the generic rcp-competitors placeholder stays on .example", () => {
    const placeholder = AEDLP_DATA.detectors.find((d) => d.id === "rcp-competitors");
    expect(placeholder?.conditionType).toBe("recipient_domain");
    if (placeholder?.conditionType === "recipient_domain") {
      expect(placeholder.domains.every((x) => x.endsWith(".example"))).toBe(true);
    }
    // Seven recipient_domain detectors total: freemail, disposable, the generic
    // placeholder, and the four competitor packs (aerospace, financial,
    // construction, airlines).
    const rcpIds = AEDLP_DATA.detectors
      .filter((d) => d.conditionType === "recipient_domain")
      .map((d) => d.id);
    expect(rcpIds).toEqual(
      expect.arrayContaining([
        "rcp-freemail",
        "rcp-disposable",
        "rcp-competitors",
        "rcp-competitors-aerospace",
        "rcp-competitors-financial",
        "rcp-competitors-construction",
        "rcp-competitors-airlines",
      ]),
    );
    expect(rcpIds).toHaveLength(7);
  });

  it("tags each pack with its industry and exposes it in the taxonomy", () => {
    expect(AEDLP_DATA.industries).toContain("Aerospace & defense");
    expect(AEDLP_DATA.industries).toContain("Financial services");
    const live = (id: string) => AEDLP_DATA.detectors.find((d) => d.id === id)!;
    // Scoped to their own industry only. The "Recipients & destinations" category
    // default would otherwise inject "Cross-industry", which makes a detector
    // match every industry filter — so pin the arrays exactly and assert the
    // leak is absent.
    expect(live("rcp-competitors-aerospace").industries).toEqual(["Aerospace & defense"]);
    expect(live("rcp-competitors-financial").industries).toEqual(["Financial services"]);
    for (const id of ["rcp-competitors-aerospace", "rcp-competitors-financial"]) {
      expect(live(id).industries, `${id} must not be Cross-industry`).not.toContain("Cross-industry");
    }
  });

  it("surfaces each pack ONLY under its own industry filter, never another", () => {
    const idsFor = (industry: string) =>
      new Set(filterDetectors(AEDLP_DATA.detectors, { industry }).map((d) => d.id));

    // Each pack appears under its own industry...
    const aeroIds = idsFor("Aerospace & defense");
    expect(aeroIds.has("rcp-competitors-aerospace")).toBe(true);
    const finIds = idsFor("Financial services");
    expect(finIds.has("rcp-competitors-financial")).toBe(true);

    // ...and NOT under the other pack's industry.
    expect(finIds.has("rcp-competitors-aerospace"), "aerospace under Financial services").toBe(false);
    expect(aeroIds.has("rcp-competitors-financial"), "financial under Aerospace & defense").toBe(false);

    // Regression guard for the Cross-industry leak: before the explicit industries
    // array, the "Recipients & destinations" category default injected
    // "Cross-industry", and filterDetectors treats Cross-industry as matching
    // every industry — so each pack showed up under unrelated filters (and under
    // the Cross-industry filter itself). It must not.
    for (const industry of ["Healthcare & life sciences", "Technology & SaaS", "Cross-industry"]) {
      const ids = idsFor(industry);
      expect(ids.has("rcp-competitors-aerospace"), `aerospace under ${industry}`).toBe(false);
      expect(ids.has("rcp-competitors-financial"), `financial under ${industry}`).toBe(false);
    }

    // Both still group with the other recipient-domain detectors under the type filter.
    const recipientIds = new Set(
      filterDetectors(AEDLP_DATA.detectors, { type: "recipient_domain" }).map((d) => d.id),
    );
    expect(recipientIds.has("rcp-competitors-aerospace")).toBe(true);
    expect(recipientIds.has("rcp-competitors-financial")).toBe(true);
  });

  it("reuses recipient-domain matching: flags mail SENT TO a listed domain only", () => {
    for (const d of competitorPacks) {
      for (const example of d.positiveExamples) {
        expect(runConditionTest(d as Condition, example, true).matched, `${d.id} +${example}`).toBe(true);
      }
      for (const example of d.negativeExamples ?? []) {
        expect(runConditionTest(d as Condition, example, true).matched, `${d.id} -${example}`).toBe(false);
      }
    }
  });

  it("copies the full domain list like the other recipient detectors", () => {
    const byId = new Map(competitorPacks.map((d) => [d.id, d] as const));
    expect(conditionCopyValue(byId.get("rcp-competitors-aerospace")! as Condition)).toBe(
      AEROSPACE_DOMAINS.join("\n"),
    );
    expect(conditionCopyValue(byId.get("rcp-competitors-financial")! as Condition)).toBe(
      FINANCIAL_DOMAINS.join("\n"),
    );
  });

  it("keeps the curate-before-deploy steer in every pack's notes", () => {
    for (const d of competitorPacks) {
      expect((d.notes?.length ?? 0)).toBeGreaterThan(0);
      expect(
        d.notes?.some((n) => /remove your own organisation/i.test(n)),
        `${d.id} should steer the user to curate`,
      ).toBe(true);
    }
  });
});
