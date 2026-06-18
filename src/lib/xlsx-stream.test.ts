import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { zipSync, strToU8 } from "fflate";
import { pickSheet, TARGET_SHEET, trustedDomainsFromParsed, type ParsedResult } from "./extract";
import { readSheetNamesStream, parseWorkbookStream } from "./xlsx-stream";
import { parseWorkbookLegacy, readSheetNamesLegacy } from "./extract-legacy";

const SAMPLE_XLSX = "handoff/aedlp-policy-creator/project/uploads/enforcer-simulated testnodata 2026-05-12.xlsx";
const fileFromSample = () => new File([readFileSync(SAMPLE_XLSX)], "enforcer.xlsx");

/* Canonical, order-independent view of a parse result for comparison. */
function canon(res: ParsedResult) {
  return {
    sheetName: res.sheetName,
    scanned: res.scanned,
    domains: [...res.map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dom, rec]) => ({
        dom,
        total: rec.total,
        types: [...rec.types.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      })),
    typeTotals: [...res.typeTotals.entries()].sort((a, b) => a[0].localeCompare(b[0])),
  };
}

/* ---------------- minimal .xlsx package builder for synthetic tests ---------------- */
const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PKG = "http://schemas.openxmlformats.org/package/2006/relationships";

type ZipLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
function zipXlsx(opts: { sheetName: string; rowsXml: string; sharedStrings?: string[]; level?: ZipLevel }): Uint8Array {
  const { sheetName, rowsXml, sharedStrings, level = 6 } = opts;
  const hasSS = !!sharedStrings;
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `</Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="${NS_PKG}">` +
        `<Relationship Id="rId1" Type="${NS_R}/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="${NS}" xmlns:r="${NS_R}"><sheets>` +
        `<sheet name="${sheetName}" sheetId="1" r:id="rId1"/>` +
        `</sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="${NS_PKG}">` +
        `<Relationship Id="rId1" Type="${NS_R}/worksheet" Target="worksheets/sheet1.xml"/>` +
        (hasSS ? `<Relationship Id="rId2" Type="${NS_R}/sharedStrings" Target="sharedStrings.xml"/>` : "") +
        `</Relationships>`,
    ),
    // sheet1 is written before sharedStrings, mirroring real Excel output
    "xl/worksheets/sheet1.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<worksheet xmlns="${NS}"><sheetData>${rowsXml}</sheetData></worksheet>`,
    ),
  };
  if (hasSS) {
    files["xl/sharedStrings.xml"] = strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<sst xmlns="${NS}" count="${sharedStrings!.length}" uniqueCount="${sharedStrings!.length}">` +
        sharedStrings!.map((s) => `<si><t>${s}</t></si>`).join("") +
        `</sst>`,
    );
  }
  return zipSync(files, { level });
}

const inlineCell = (ref: string, text: string) => `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`;

/* ============================================================ */

describe("readSheetNamesStream", () => {
  it("lists the sheets of the sample workbook in order and pickSheet finds the target", async () => {
    const { names } = await readSheetNamesStream(fileFromSample());
    expect(names).toEqual(["breaches", "unauthorised_contacts", "high_level_statistics"]);
    // matches the legacy SheetJS sheet listing exactly
    const legacy = await readSheetNamesLegacy(fileFromSample());
    expect(names).toEqual(legacy.names);

    const target = pickSheet(names);
    expect(target).toBe("unauthorised_contacts");
    expect(TARGET_SHEET.test(target)).toBe(true);
  });
});

describe("parseWorkbookStream on the sample enforcer export", () => {
  it("parses rows, unique domains and type totals (pinned to current behaviour)", async () => {
    const res = await parseWorkbookStream(fileFromSample(), "unauthorised_contacts");
    expect(res.sheetName).toBe("unauthorised_contacts");
    expect(res.scanned).toBe(3);
    expect(res.map.size).toBe(3);
    expect([...res.map.keys()].sort()).toEqual(["gmail.com", "hotmail.com", "soteria365.com"]);
    expect(res.typeTotals.get("external")).toBe(1);
    expect(res.typeTotals.get("freemail")).toBe(2);
    // the lone external domain and the two freemail domains landed correctly
    expect(res.map.get("soteria365.com")?.types.get("external")).toBe(1);
    expect(res.map.get("gmail.com")?.types.get("freemail")).toBe(1);
    expect(res.map.get("hotmail.com")?.types.get("freemail")).toBe(1);
  });

  it("is byte-for-byte equivalent to the old SheetJS path", async () => {
    const streamed = await parseWorkbookStream(fileFromSample(), "unauthorised_contacts");
    const legacy = await parseWorkbookLegacy(fileFromSample(), "unauthorised_contacts");
    expect(canon(streamed)).toEqual(canon(legacy));
  });

  it("reports progress ending at 1", async () => {
    const seen: number[] = [];
    await parseWorkbookStream(fileFromSample(), "unauthorised_contacts", { onProgress: (p) => seen.push(p) });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBe(1);
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...seen)).toBeLessThanOrEqual(1);
  });

  it("reduces to the wizard's trusted-domain default (external contacts only)", async () => {
    const res = await parseWorkbookStream(fileFromSample(), "unauthorised_contacts");
    // soteria365.com is the lone external contact; gmail/hotmail are freemail.
    expect(trustedDomainsFromParsed(res)).toEqual(["soteria365.com"]);
  });
});

describe("parseWorkbookStream column/blank-row handling (inline strings)", () => {
  it("skips leading and interspersed blank rows and counts only non-blank data rows", async () => {
    const rowsXml =
      `<row r="1"><c r="A1"/></row>` + // styled-but-empty leading row -> blank
      `<row r="2"/>` + // self-closing blank row
      `<row r="3">${inlineCell("A3", "contact_ad")}${inlineCell("B3", "contact_type")}</row>` + // header
      `<row r="4">${inlineCell("A4", "alice@acme.com")}${inlineCell("B4", "external")}</row>` +
      `<row r="5"/>` + // blank between data rows -> not scanned
      `<row r="6">${inlineCell("A6", "bob@acme.com")}${inlineCell("B6", "external")}</row>` +
      `<row r="7">${inlineCell("A7", "carol@gmail.com")}${inlineCell("B7", "freemail")}</row>` +
      `<row r="8">${inlineCell("A8", "not-an-email")}${inlineCell("B8", "external")}</row>`; // counted, no domain
    const bytes = zipXlsx({ sheetName: "unauthorised_contacts", rowsXml });
    const res = await parseWorkbookStream(new File([bytes], "inline.xlsx"), "unauthorised_contacts");

    expect(res.scanned).toBe(4); // rows 4,6,7,8 — blanks 1,2,5 excluded
    expect([...res.map.keys()].sort()).toEqual(["acme.com", "gmail.com"]);
    expect(res.map.get("acme.com")?.total).toBe(2);
    expect(res.map.get("gmail.com")?.total).toBe(1);
    expect(res.typeTotals.get("external")).toBe(2); // row 8 has no domain, so not totalled
    expect(res.typeTotals.get("freemail")).toBe(1);
  });

  it("throws a clear error when the contact columns are absent", async () => {
    const rowsXml =
      `<row r="1">${inlineCell("A1", "alpha")}${inlineCell("B1", "beta")}</row>` +
      `<row r="2">${inlineCell("A2", "x@y.com")}${inlineCell("B2", "z")}</row>`;
    const bytes = zipXlsx({ sheetName: "sheet", rowsXml });
    await expect(parseWorkbookStream(new File([bytes], "bad.xlsx"), "sheet")).rejects.toThrow(/contact_type/);
  });
});

describe("parseWorkbookStream on a very large workbook", () => {
  it("aggregates hundreds of thousands of rows with bounded peak memory (never materialises the row set)", async () => {
    const N = 250_000;
    const domains = ["alpha.com", "bravo.com", "charlie.com", "delta.com", "echo.com"];
    // shared strings: header labels (0,1), 5 emails (2..6), two contact types (7,8)
    const strings = ["contact_ad", "contact_type", ...domains.map((d, i) => `u${i}@${d}`), "external", "freemail"];

    const parts: string[] = [`<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>`];
    for (let i = 0; i < N; i++) {
      const r = i + 2;
      const addrIdx = 2 + (i % domains.length); // cycles through the 5 emails
      const typeIdx = i % 2 === 0 ? 7 : 8; // even -> external, odd -> freemail
      parts.push(`<row r="${r}"><c r="A${r}" t="s"><v>${addrIdx}</v></c><c r="B${r}" t="s"><v>${typeIdx}</v></c></row>`);
    }
    // STORED (level 0) so each decompression chunk ~ one read slice: this makes the
    // peak-buffer assertion independent of the compression ratio.
    const bytes = zipXlsx({ sheetName: "unauthorised_contacts", rowsXml: parts.join(""), sharedStrings: strings, level: 0 });

    let stats: { scannedRows: number; maxBufferChars: number; sheetBytes: number } | null = null;
    const res = await parseWorkbookStream(new File([bytes], "huge.xlsx"), "unauthorised_contacts", {
      onStats: (s) => {
        stats = s;
      },
    });

    // correct aggregation across all rows
    expect(res.scanned).toBe(N);
    expect(res.map.size).toBe(domains.length); // only the 5 unique domains are retained
    expect([...res.map.keys()].sort()).toEqual([...domains].sort());
    expect(res.typeTotals.get("external")).toBe(N / 2);
    expect(res.typeTotals.get("freemail")).toBe(N / 2);
    const totalAcrossDomains = [...res.map.values()].reduce((sum, rec) => sum + rec.total, 0);
    expect(totalAcrossDomains).toBe(N);

    // peak-memory proof via the streaming code path (not wall-clock):
    // the whole sheet is many MB, yet the rolling buffer never holds more than
    // a small fraction of it, and the result keeps O(unique domains) state — not
    // O(rows) — so the full row set was never materialised.
    expect(stats).not.toBeNull();
    const s = stats!;
    expect(s.scannedRows).toBe(N);
    expect(s.sheetBytes).toBeGreaterThan(4_000_000);
    expect(s.maxBufferChars).toBeLessThan(512 * 1024);
    expect(s.maxBufferChars * 20).toBeLessThan(s.sheetBytes);
    expect(res.map.size * 1000).toBeLessThan(res.scanned);
  });
});
