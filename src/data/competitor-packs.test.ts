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
  it("adds 2 recipient_domain detectors with the expected ids", () => {
    expect(competitorPacks).toHaveLength(2);
    expect(competitorPacks.every((d) => d.conditionType === "recipient_domain")).toBe(true);
    expect(competitorPacks.map((d) => d.id)).toEqual([
      "rcp-competitors-aerospace",
      "rcp-competitors-financial",
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
    // Five recipient_domain detectors total: freemail, disposable, the generic
    // placeholder, and the two new packs.
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
      ]),
    );
    expect(rcpIds).toHaveLength(5);
  });

  it("tags each pack with its industry and exposes it in the taxonomy", () => {
    expect(AEDLP_DATA.industries).toContain("Aerospace & defense");
    expect(AEDLP_DATA.industries).toContain("Financial services");
    const live = (id: string) => AEDLP_DATA.detectors.find((d) => d.id === id)!;
    expect(live("rcp-competitors-aerospace").industries).toContain("Aerospace & defense");
    expect(live("rcp-competitors-financial").industries).toContain("Financial services");
  });

  it("returns each pack under its industry filter and the recipient type filter", () => {
    const aeroIds = new Set(
      filterDetectors(AEDLP_DATA.detectors, { industry: "Aerospace & defense" }).map((d) => d.id),
    );
    expect(aeroIds.has("rcp-competitors-aerospace")).toBe(true);

    const finIds = new Set(
      filterDetectors(AEDLP_DATA.detectors, { industry: "Financial services" }).map((d) => d.id),
    );
    expect(finIds.has("rcp-competitors-financial")).toBe(true);

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
