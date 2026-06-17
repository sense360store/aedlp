import { describe, it, expect } from "vitest";
import { AEDLP_DATA } from "../data/library";
import { suggestName, suggestAction, suggestTags, suggestDescription, slugify, uniq } from "./suggest";
import type { Detector } from "../types";

const byId = new Map(AEDLP_DATA.detectors.map((d) => [d.id, d] as const));
function det(id: string): Detector {
  const d = byId.get(id);
  if (!d) throw new Error(`missing detector ${id}`);
  return d;
}

describe("suggestion engine", () => {
  it("slugify normalises and uniq de-duplicates", () => {
    expect(slugify("Credentials & secrets")).toBe("credentials-and-secrets");
    expect(slugify("Payment card data (PCI)")).toBe("payment-card-data-pci");
    expect(uniq([1, 1, 2, 3, 3])).toEqual([1, 2, 3]);
  });

  it("single-detector set", () => {
    const one = [det("aws-access-key")];
    expect(suggestName(one)).toBe("Detect AWS Access Key ID");
    expect(suggestAction(one)).toBe("block");
    expect(suggestTags(one)).toEqual(["credentials-and-secrets", "regex"]);
    expect(suggestDescription(one, "block")).toBe(
      "Flags outbound email containing AWS Access Key ID. Combines 1 regex condition. Suggested action: block.",
    );
  });

  it("multi-detector set, highest-rank action wins", () => {
    const multi = [det("gb-national-insurance-number"), det("kp-bec-wire-fraud")];
    expect(suggestName(multi)).toBe("Detect Government ID & Financial data");
    expect(suggestAction(multi)).toBe("warn_require_justification");
    expect(suggestTags(multi)).toEqual([
      "government-id",
      "united-kingdom",
      "regex",
      "financial-data",
      "financial-services",
      "pattern",
    ]);
    expect(suggestDescription(multi, suggestAction(multi))).toBe(
      "Flags outbound email containing UK National Insurance Number, Wire Transfer / BEC Indicators. " +
        "Focused on United Kingdom. Combines 1 regex, 1 pattern conditions. Suggested action: warn & require justification.",
    );
  });

  it("suggestAction picks the highest rank across a mixed set", () => {
    // silently_track (1) < warn (2) < warn_require_justification (3) < block (4)
    const set = [det("us-phone-number"), det("kw-hr-personnel"), det("aws-access-key")];
    expect(suggestAction(set)).toBe("block");
  });

  it("suggestName collapses to a single category, two, or N+", () => {
    expect(suggestName([det("aws-access-key"), det("github-pat")])).toBe("Detect Credentials & secrets");
    expect(suggestName([det("aws-access-key"), det("gb-iban")])).toBe(
      "Detect Credentials & secrets & Financial data",
    );
  });

  it("empty set returns defaults", () => {
    expect(suggestName([])).toBe("");
    expect(suggestAction([])).toBe("warn");
    expect(suggestTags([])).toEqual([]);
    expect(suggestDescription([], "warn")).toBe("");
  });

  it("suggestTags flags high false-positive risk and caps at nine", () => {
    const tags = suggestTags([det("us-social-security-number")]); // FP risk high
    expect(tags).toContain("tune-fp");
    expect(tags.length).toBeLessThanOrEqual(9);
  });
});
