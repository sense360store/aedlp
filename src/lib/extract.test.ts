import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { emailDomain, isCSV, parseCSV, readSheetNames, parseWorkbook, pickSheet, TARGET_SHEET } from "./extract";

const SAMPLE_XLSX = "handoff/aedlp-policy-creator/project/uploads/enforcer-simulated testnodata 2026-05-12.xlsx";

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

describe("parseWorkbook (SheetJS) on the sample enforcer export", () => {
  const fileFromSample = () => new File([readFileSync(SAMPLE_XLSX)], "enforcer.xlsx");

  it("finds the unauthorised_contacts sheet", async () => {
    const { names } = await readSheetNames(fileFromSample());
    expect(names).toContain("unauthorised_contacts");
    const target = pickSheet(names);
    expect(TARGET_SHEET.test(target)).toBe(true);
    expect(target).toBe("unauthorised_contacts");
  });

  it("parses rows, unique domains and type totals", async () => {
    const res = await parseWorkbook(fileFromSample(), "unauthorised_contacts");
    expect(res.sheetName).toBe("unauthorised_contacts");
    expect(res.scanned).toBe(3);
    expect(res.map.size).toBe(3);
    expect([...res.map.keys()].sort()).toEqual(["gmail.com", "hotmail.com", "soteria365.com"]);
    expect(res.typeTotals.get("external")).toBe(1);
    expect(res.typeTotals.get("freemail")).toBe(2);
  });
});
