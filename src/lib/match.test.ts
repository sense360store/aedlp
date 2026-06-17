import { describe, it, expect } from "vitest";
import { AEDLP_DATA } from "../data/library";
import {
  runConditionTest,
  conditionCopyValue,
  evaluateKeywordPattern,
  serializeKeywordPattern,
} from "./match";
import { buildEffectiveRegex } from "./regex";
import type {
  Detector,
  RegexDetector,
  KeywordDetector,
  KeywordPatternDetector,
  RecipientDomainDetector,
  FileExtensionDetector,
} from "../types";

const byId = new Map(AEDLP_DATA.detectors.map((d) => [d.id, d] as const));
function det(id: string): Detector {
  const d = byId.get(id);
  if (!d) throw new Error(`missing detector ${id}`);
  return d;
}
function snippet(id: string): string {
  const s = AEDLP_DATA.sampleSnippets.find((x) => x.id === id);
  if (!s) throw new Error(`missing snippet ${id}`);
  return s.text;
}
// the prototype test panel always runs case-insensitively
const trips = (detId: string, snipId: string) => runConditionTest(det(detId), snippet(snipId), true).matched;

describe("per-snippet condition outcomes (prototype engine parity)", () => {
  it("HR offer trips the NI number and salary disclosure", () => {
    expect(trips("gb-national-insurance-number", "snip-hr")).toBe(true);
    expect(trips("kp-salary-disclosure", "snip-hr")).toBe(true);
  });

  it("finance / wire trips the UK IBAN and the BEC pattern", () => {
    expect(trips("gb-iban", "snip-finance")).toBe(true);
    expect(trips("kp-bec-wire-fraud", "snip-finance")).toBe(true);
  });

  it("leaked credentials trips the AWS key and Google API key", () => {
    expect(trips("aws-access-key", "snip-secrets")).toBe(true);
    expect(trips("google-api-key", "snip-secrets")).toBe(true);
  });

  it("patient record trips the NHS number and patient identity pattern", () => {
    expect(trips("gb-nhs-number", "snip-health")).toBe(true);
    expect(trips("kp-phi-identity", "snip-health")).toBe(true);
  });

  it("send to personal account trips freemail and disposable", () => {
    expect(trips("rcp-freemail", "snip-recipients")).toBe(true);
    expect(trips("rcp-disposable", "snip-recipients")).toBe(true);
    // The competitor domain appears as "...at globex-industries.example" with no
    // "@", so the local@domain recipient regex cannot match it. This mirrors the
    // prototype engine exactly; competitor matching is covered separately below.
    expect(trips("rcp-competitors", "snip-recipients")).toBe(false);
  });

  it("attachment-heavy trips the relevant file-extension families", () => {
    expect(trips("fe-cad-3d", "snip-attachments")).toBe(true);
    expect(trips("fe-spreadsheets", "snip-attachments")).toBe(true);
    expect(trips("fe-source-code", "snip-attachments")).toBe(true);
    expect(trips("fe-keys-certs", "snip-attachments")).toBe(true);
    expect(trips("fe-mailbox", "snip-attachments")).toBe(true);
    // "project-handoff.zip." is followed by a period, which defeats the
    // (?![\w.]) lookahead, so fe-archives does not trip on this snippet.
    // Archive matching is covered against a clean filename below.
    expect(trips("fe-archives", "snip-attachments")).toBe(false);
  });

  it("clean newsletter trips none of the sensitive detectors", () => {
    for (const id of [
      "gb-national-insurance-number",
      "gb-iban",
      "aws-access-key",
      "gb-nhs-number",
      "rcp-freemail",
      "fe-spreadsheets",
      "kp-salary-disclosure",
      "kp-bec-wire-fraud",
    ]) {
      expect(trips(id, "snip-clean")).toBe(false);
    }
  });
});

describe("recipient and file matching on direct input", () => {
  it("competitor domains match an actual recipient address", () => {
    const d = det("rcp-competitors");
    expect(runConditionTest(d, "Sending the roadmap to contact@globex-industries.example", true).matched).toBe(true);
    expect(runConditionTest(d, "Send to client@trusted-partner.com", true).matched).toBe(false);
  });

  it("archive family matches a filename not followed by a dot", () => {
    const d = det("fe-archives");
    expect(runConditionTest(d, "Everything is bundled in project-handoff.zip", true).matched).toBe(true);
    expect(runConditionTest(d, "No attachments on this one.", true).matched).toBe(false);
  });
});

describe("keyword_pattern AND proximity (sliding window)", () => {
  const p = det("kp-salary-disclosure") as KeywordPatternDetector; // operator AND, proximity 12

  it("matches when both groups fall inside the proximity window", () => {
    const r = evaluateKeywordPattern(p, "Your base pay and bonus offer details.", true);
    expect(r.matched).toBe(true);
    expect(r.reason).toContain("co-occur within");
  });

  it("does not match when the groups are outside the window", () => {
    const r = evaluateKeywordPattern(p, "base pay " + "filler ".repeat(20) + "offer", true);
    expect(r.matched).toBe(false);
    expect(r.reason).toContain("(> 12)");
  });

  it("does not match when a whole group is absent", () => {
    const neg = p.negativeExamples?.[0] ?? ""; // "The salary survey report is published industry-wide."
    const r = evaluateKeywordPattern(p, neg, true);
    expect(r.matched).toBe(false);
    expect(r.reason).toContain("Not all groups present");
  });

  it("OR patterns match when any group is present", () => {
    const orPattern = { groups: [["alpha"], ["omega"]], operator: "OR" as const, proximity: null };
    expect(evaluateKeywordPattern(orPattern, "only alpha here", true).matched).toBe(true);
    expect(evaluateKeywordPattern(orPattern, "nothing relevant", true).matched).toBe(false);
  });
});

describe("serializeKeywordPattern and conditionCopyValue", () => {
  it("serializes an AND pattern with the proximity operator", () => {
    const p = det("kp-salary-disclosure") as KeywordPatternDetector;
    expect(serializeKeywordPattern(p)).toBe(
      `("salary" OR "compensation" OR "remuneration" OR "base pay") AND~12 ("offer" OR "package" OR "bonus" OR "equity grant")`,
    );
  });

  it("returns the correct copy value for every condition type", () => {
    const rgx = det("aws-access-key") as RegexDetector;
    expect(conditionCopyValue(rgx)).toBe(rgx.regex);

    const kw = det("kw-hr-personnel") as KeywordDetector;
    expect(conditionCopyValue(kw)).toBe(kw.keywords.join("\n"));

    const rcp = det("rcp-disposable") as RecipientDomainDetector;
    expect(conditionCopyValue(rcp)).toBe(rcp.domains.join("\n"));

    const fe = det("fe-archives") as FileExtensionDetector;
    expect(conditionCopyValue(fe)).toBe(fe.extensions.join(", "));

    const kp = det("kp-salary-disclosure") as KeywordPatternDetector;
    expect(conditionCopyValue(kp)).toBe(serializeKeywordPattern(kp));
  });

  it("uses the boundary-wrapped effective regex when present", () => {
    const base = det("us-social-security-number") as RegexDetector;
    const effective = buildEffectiveRegex(base.regex, "word");
    const cond = { ...base, boundary: "word" as const, _effectiveRegex: effective };
    expect(conditionCopyValue(cond)).toBe(effective);
    // and the wrapped pattern still detects the value
    expect(runConditionTest(cond, "SSN: 575-39-7494", true).matched).toBe(true);
  });
});
