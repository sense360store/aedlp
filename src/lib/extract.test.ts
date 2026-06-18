import { describe, it, expect } from "vitest";
import {
  emailDomain,
  isCSV,
  locateColumns,
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

  it("throws a friendly error that lists the headers found when there is no email column", async () => {
    const csv = "a,b,c\n1,2,3\n"; // no column of email addresses anywhere
    const file = new File([csv], "bad.csv", { type: "text/csv" });
    await expect(parseCSV(file)).rejects.toThrow(/recipient email column.*Columns found: a, b, c/);
  });
});

describe("locateColumns — header alias matching", () => {
  it("matches known aliases case-, whitespace- and separator-insensitively", () => {
    expect(locateColumns(["User Address", " Contact Address ", "Contact Type"])).toEqual({ type: 2, addr: 1 });
    expect(locateColumns(["recipient-address", "direction"])).toEqual({ type: 1, addr: 0 });
    expect(locateColumns(["EMAIL"])).toEqual({ type: -1, addr: 0 }); // type column is optional
  });
  it("resolves the contact column, never the sender/user column, when both carry addresses", () => {
    // user_ad is address-bearing too, but only contact_ad is a recipient alias.
    expect(locateColumns(["user_ad", "contact_ad", "contact_type"])).toEqual({ type: 2, addr: 1 });
  });
  it("returns addr -1 for an address column it cannot name (the email-scan fallback then takes over)", () => {
    expect(locateColumns(["from", "to", "note"]).addr).toBe(-1);
  });
});

describe("parseCSV — robust column detection (real-world + aliased enforcer headers)", () => {
  it("parses an export with the real enforcer headers (contact_ad / contact_type), using the contact column", async () => {
    // The exact header row of the sample enforcer export's unauthorised_contacts sheet.
    const csv = [
      ",user_ad,contact_ad,user_name,contact_name,contact_type,explanation",
      "0,me@corp.com,someone@hotmail.com,J Smith,person@hotmail.com,freemail,blank_subject",
      "1,me2@corp.com,rep@soteria365.com,D Smith,person2@soteria365.com,external,low_ratio",
    ].join("\n");
    const res = await parseCSV(new File([csv], "export.csv", { type: "text/csv" }));
    // Domains come from contact_ad (the external contact), never user_ad (our sender).
    expect([...res.map.keys()].sort()).toEqual(["hotmail.com", "soteria365.com"]);
    expect(res.map.has("corp.com")).toBe(false);
    expect(trustedDomainsFromParsed(res)).toEqual(["soteria365.com"]); // external default
  });

  it("accepts aliased headers — 'Recipient Address' / 'Direction' with odd casing and spacing", async () => {
    const csv = [
      "Recipient Address,Direction",
      "partner@vendor.com,external",
      "rep@vendor.com,external", // same domain -> de-duped
      "ally@trusted-partner.io,external",
      "jdoe@gmail.com,freemail",
    ].join("\n");
    const res = await parseCSV(new File([csv], "export.csv", { type: "text/csv" }));
    expect(trustedDomainsFromParsed(res)).toEqual(["trusted-partner.io", "vendor.com"]);
  });

  it("works with a single email column and no contact-type column at all", async () => {
    const csv = ["email", "a@one.com", "b@two.com", "c@one.com"].join("\n");
    const res = await parseCSV(new File([csv], "export.csv", { type: "text/csv" }));
    expect([...res.map.keys()].sort()).toEqual(["one.com", "two.com"]);
    // No type info -> the default selection keeps every extracted domain.
    expect(trustedDomainsFromParsed(res).sort()).toEqual(["one.com", "two.com"]);
  });

  it("falls back to the email-looking column when no header alias matches", async () => {
    const csv = ["id,who,blob", "1,partner@vendor.com,note", "2,rep@vendor.com,note", "3,not-an-email,note"].join("\n");
    const res = await parseCSV(new File([csv], "export.csv", { type: "text/csv" }));
    expect([...res.map.keys()]).toEqual(["vendor.com"]);
    expect(res.map.get("vendor.com")?.total).toBe(2);
  });

  it("steers the fallback to the recipient column over the sender column when both hold emails", async () => {
    // Neither header is a known alias, so the email-scan runs; the hint must steer
    // it to the recipient column, not the sender one.
    const csv = ["sender_box,recipient_box", "me@corp.com,partner@vendor.com", "me@corp.com,rep@vendor.com"].join("\n");
    const res = await parseCSV(new File([csv], "export.csv", { type: "text/csv" }));
    expect([...res.map.keys()]).toEqual(["vendor.com"]);
    expect(res.map.has("corp.com")).toBe(false);
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
