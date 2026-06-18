import { describe, it, expect } from "vitest";
import {
  emailDomain,
  isCSV,
  parseCSV,
  pickSheet,
  TARGET_SHEET,
  trustedDomainsFromParsed,
  type ParsedResult,
} from "./extract";

describe("emailDomain", () => {
  it("extracts and normalises the domain", () => {
    expect(emailDomain("jdoe.personal@Gmail.com")).toBe("gmail.com");
    expect(emailDomain("  USER@FOO.Org  ")).toBe("foo.org");
    expect(emailDomain("name@host.com>")).toBe("host.com");
    expect(emailDomain("name@host.com, please")).toBe("host.com");
  });
  it("returns empty for non-addresses", () => {
    expect(emailDomain("no-at-sign")).toBe("");
    expect(emailDomain("a@b")).toBe(""); // no dot in domain
    expect(emailDomain("")).toBe("");
    expect(emailDomain(null)).toBe("");
    expect(emailDomain(undefined)).toBe("");
  });
});

describe("isCSV", () => {
  it("detects CSV by extension or mime", () => {
    expect(isCSV(new File([""], "export.csv"))).toBe(true);
    expect(isCSV(new File([""], "export.CSV"))).toBe(true);
    expect(isCSV(new File([""], "data", { type: "text/csv" }))).toBe(true);
    expect(isCSV(new File([""], "export.xlsx"))).toBe(false);
  });
});

describe("pickSheet", () => {
  it("prefers a sheet matching /unauth/i, else honours a preferred name, else the first", () => {
    const names = ["breaches", "unauthorised_contacts", "high_level_statistics"];
    expect(pickSheet(names)).toBe("unauthorised_contacts");
    expect(TARGET_SHEET.test(pickSheet(names))).toBe(true);
    expect(pickSheet(["a", "b", "c"])).toBe("a");
    expect(pickSheet(["a", "b", "c"], "b")).toBe("b");
    expect(pickSheet(["a", "b", "c"], "missing")).toBe("a");
  });
});

describe("parseCSV (streaming)", () => {
  it("aggregates domains by contact type and reports progress", async () => {
    const csv = [
      "user_ad,contact_ad,contact_type,explanation",
      "me@corp.com,partner@vendor.com,external,ok",
      "me@corp.com,jdoe@gmail.com,freemail,personal",
      "me@corp.com,another@gmail.com,freemail,personal",
      "me@corp.com,bad-no-at,external,junk",
    ].join("\n");
    const file = new File([csv], "export.csv", { type: "text/csv" });
    const progresses: number[] = [];
    const res = await parseCSV(file, (p) => progresses.push(p));

    expect(res.sheetName).toBe("(csv)");
    expect(res.scanned).toBe(4); // every data row is counted, even the junk one
    expect(res.map.size).toBe(2);
    expect(res.map.get("gmail.com")?.total).toBe(2);
    expect(res.map.get("vendor.com")?.total).toBe(1);
    expect(res.map.has("")).toBe(false);
    expect(res.typeTotals.get("freemail")).toBe(2);
    expect(res.typeTotals.get("external")).toBe(1); // junk row has no domain, so not totalled
    expect(progresses[progresses.length - 1]).toBe(1);
  });

  it("throws when the header columns are missing", async () => {
    const csv = "a,b,c\n1,2,3\n";
    const file = new File([csv], "bad.csv", { type: "text/csv" });
    await expect(parseCSV(file)).rejects.toThrow(/contact_type/);
  });
});

describe("trustedDomainsFromParsed (wizard default selection)", () => {
  it("takes the external contacts' domains from a real CSV parse, de-duped and sorted", async () => {
    const csv = [
      "contact_ad,contact_type",
      "partner@vendor.com,external",
      "rep@vendor.com,external", // same domain again -> de-duped
      "ally@trusted-partner.io,external",
      "jdoe@gmail.com,freemail", // freemail is not a trusted third party
    ].join("\n");
    const res = await parseCSV(new File([csv], "export.csv", { type: "text/csv" }));
    // External default, sorted, unique — gmail.com (freemail) excluded.
    expect(trustedDomainsFromParsed(res)).toEqual(["trusted-partner.io", "vendor.com"]);
  });

  const parsed = (entries: [string, [string, number][]][], typeTotals: [string, number][]): ParsedResult => ({
    map: new Map(entries.map(([dom, types]) => [dom, { types: new Map(types), total: types.reduce((s, [, n]) => s + n, 0) }])),
    scanned: 0,
    typeTotals: new Map(typeTotals),
    sheetName: "(test)",
  });

  it("prefers external, then falls back to the first type present, then to all", () => {
    // No external -> first type present (freemail) wins.
    expect(
      trustedDomainsFromParsed(
        parsed([["gmail.com", [["freemail", 2]]], ["acme.com", [["other", 1]]]], [["freemail", 2], ["other", 1]]),
      ),
    ).toEqual(["gmail.com"]);
  });

  it("returns an empty list when the sheet yielded no usable domains", () => {
    expect(trustedDomainsFromParsed(parsed([], []))).toEqual([]);
  });

  it("only keeps domains that actually have an external contact", () => {
    const res = parsed(
      [
        ["partner.com", [["external", 3]]],
        ["gmail.com", [["freemail", 5]]], // present, but no external -> excluded
      ],
      [["external", 3], ["freemail", 5]],
    );
    expect(trustedDomainsFromParsed(res)).toEqual(["partner.com"]);
  });
});
