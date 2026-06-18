import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { zipSync, strToU8 } from "fflate";
import { CSV_FALLBACK_MESSAGE, pickSheet, TARGET_SHEET, trustedDomainsFromParsed, type ParsedResult } from "./extract";
import {
  DEFAULT_LIMITS,
  readSheetNamesStream,
  readSheetHeadersStream,
  parseWorkbookStream,
  selectSheet,
  type StreamStats,
} from "./xlsx-stream";
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
const numCell = (ref: string, n: number) => `<c r="${ref}"><v>${n}</v></c>`;

/* Multi-sheet .xlsx package builder — mirrors a real enforcer export (several
   sheets, the contact columns complete only on one of them). Sheets keep workbook
   order; cells use inline strings so no shared-strings table is needed. */
function zipXlsxMulti(sheets: { name: string; rowsXml: string }[], level: ZipLevel = 6): Uint8Array {
  const sheetRels = sheets
    .map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS_R}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
    .join("");
  const sheetTags = sheets.map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("");
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
        `<workbook xmlns="${NS}" xmlns:r="${NS_R}"><sheets>${sheetTags}</sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` + `<Relationships xmlns="${NS_PKG}">${sheetRels}</Relationships>`,
    ),
  };
  sheets.forEach((s, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<worksheet xmlns="${NS}"><sheetData>${s.rowsXml}</sheetData></worksheet>`,
    );
  });
  return zipSync(files, { level });
}

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

  it("throws a friendly error that lists the headers found when no email column exists", async () => {
    const rowsXml =
      `<row r="1">${inlineCell("A1", "alpha")}${inlineCell("B1", "beta")}</row>` +
      `<row r="2">${inlineCell("A2", "gamma")}${inlineCell("B2", "delta")}</row>`; // no emails anywhere
    const bytes = zipXlsx({ sheetName: "sheet", rowsXml });
    await expect(parseWorkbookStream(new File([bytes], "bad.xlsx"), "sheet")).rejects.toThrow(
      /recipient email column.*Columns found: alpha, beta/,
    );
  });
});

describe("parseWorkbookStream robust header detection (aliases + email-scan fallback)", () => {
  it("matches aliased headers (recipient_address / contact_type) and reads the contact column", async () => {
    const rowsXml =
      `<row r="1">${inlineCell("A1", "recipient_address")}${inlineCell("B1", "contact_type")}</row>` +
      `<row r="2">${inlineCell("A2", "partner@vendor.com")}${inlineCell("B2", "external")}</row>` +
      `<row r="3">${inlineCell("A3", "jdoe@gmail.com")}${inlineCell("B3", "freemail")}</row>`;
    const bytes = zipXlsx({ sheetName: "unauthorised_contacts", rowsXml });
    const res = await parseWorkbookStream(new File([bytes], "aliased.xlsx"), "unauthorised_contacts");
    expect([...res.map.keys()].sort()).toEqual(["gmail.com", "vendor.com"]);
    expect(res.typeTotals.get("external")).toBe(1);
    expect(trustedDomainsFromParsed(res)).toEqual(["vendor.com"]); // external default
  });

  it("falls back to the email-bearing column when the header is unrecognised", async () => {
    const rowsXml =
      `<row r="1">${inlineCell("A1", "col_one")}${inlineCell("B1", "col_two")}</row>` +
      `<row r="2">${inlineCell("A2", "ref-001")}${inlineCell("B2", "partner@vendor.com")}</row>` +
      `<row r="3">${inlineCell("A3", "ref-002")}${inlineCell("B3", "rep@vendor.com")}</row>`;
    const bytes = zipXlsx({ sheetName: "sheet", rowsXml });
    const res = await parseWorkbookStream(new File([bytes], "fallback.xlsx"), "sheet");
    expect([...res.map.keys()]).toEqual(["vendor.com"]);
    expect(res.map.get("vendor.com")?.total).toBe(2);
  });
});

describe("parseWorkbookStream — cells without an r= reference (positional fallback)", () => {
  // Some enforcer exports write cells with no r="B1" column reference. The reader
  // must then fall back to positional order; previously every such cell was
  // dropped, so the header parsed to nothing — the "Columns found: 0" bug. Mirrors
  // the real unauthorised_contacts header: a leading unnamed/index column, then the
  // six labels, with a couple of data rows carrying the index in the first column.
  const noRef = (text: string) => `<c t="inlineStr"><is><t>${text}</t></is></c>`;
  const noRefNum = (n: number) => `<c><v>${n}</v></c>`;
  const blankCell = `<c/>`; // the leading unnamed index column (empty, no ref)

  const rowsXml =
    `<row r="1">${blankCell}${noRef("user_ad")}${noRef("contact_ad")}${noRef("user_name")}${noRef("contact_name")}${noRef("contact_type")}${noRef("explanation")}</row>` +
    `<row r="2">${noRefNum(0)}${noRef("me@corp.com")}${noRef("partner@vendor.com")}${noRef("Me")}${noRef("Partner")}${noRef("external")}${noRef("note")}</row>` +
    `<row r="3">${noRefNum(1)}${noRef("me@corp.com")}${noRef("jdoe@gmail.com")}${noRef("Me")}${noRef("J")}${noRef("freemail")}${noRef("note")}</row>`;

  it("reads contact_ad from a header whose cells omit r= (leading blank column preserved)", async () => {
    const bytes = zipXlsx({ sheetName: "unauthorised_contacts", rowsXml });
    const res = await parseWorkbookStream(new File([bytes], "norefs.xlsx"), "unauthorised_contacts");
    expect(res.scanned).toBe(2);
    // domains come from contact_ad (col 2), never user_ad (col 1 → corp.com)
    expect([...res.map.keys()].sort()).toEqual(["gmail.com", "vendor.com"]);
    expect(res.map.has("corp.com")).toBe(false);
    expect(res.typeTotals.get("external")).toBe(1);
    expect(res.typeTotals.get("freemail")).toBe(1);
    expect(trustedDomainsFromParsed(res)).toEqual(["vendor.com"]); // external default
  });
});

describe("parseWorkbookStream — fail fast on a wrong-shape file (never OOM / hang)", () => {
  it("rejects a multi-MB no-email sheet after reading only a bounded prefix", async () => {
    // ~6 MB sheet, tens of thousands of rows, with NO email column anywhere. The
    // reader must give up within the header-scan window and STOP — not stream the
    // whole file, which is the bug (~59s + an out-of-memory tab crash).
    const N = 60_000;
    const parts: string[] = [`<row r="1">${inlineCell("A1", "alpha")}${inlineCell("B1", "beta")}</row>`];
    for (let i = 0; i < N; i++) {
      const r = i + 2;
      parts.push(`<row r="${r}">${inlineCell("A" + r, "val" + i)}${inlineCell("B" + r, "x" + i)}</row>`);
    }
    // STORED (level 0) so the decompressed sheet really is multi-MB on disk.
    const bytes = zipXlsx({ sheetName: "sheet", rowsXml: parts.join(""), level: 0 });
    expect(bytes.length).toBeGreaterThan(4_000_000);

    let sheetBytes = -1;
    const t0 = Date.now();
    await expect(
      parseWorkbookStream(new File([bytes], "wrong.xlsx"), "sheet", { onStats: (s) => (sheetBytes = s.sheetBytes) }),
    ).rejects.toThrow(/recipient email column.*Columns found: alpha, beta/);
    const elapsed = Date.now() - t0;

    // Bounded work (deterministic): onStats fired on the failure path, and only a
    // small prefix of the multi-MB sheet was ever decompressed before bailing out.
    expect(sheetBytes).toBeGreaterThanOrEqual(0); // stats reported even on the throw
    expect(sheetBytes).toBeLessThan(2_000_000);
    expect(sheetBytes * 3).toBeLessThan(bytes.length);
    // And it did not hang (generous ceiling — the bug took ~59s; bounded work above
    // is the real proof, this just guards against a regression to streaming in full).
    expect(elapsed).toBeLessThan(5_000);
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

describe("multi-sheet workbook — selecting the sheet that actually holds the contact rows", () => {
  // A workbook mirroring a real enforcer export: three sheets, but the contact
  // columns are only complete on unauthorised_contacts. The breaches sheet is the
  // decoy — it has recipient_ads (a broad address alias) AND contact_type, but no
  // contact_ad, so it must NOT be chosen. Each header has a leading unnamed/index
  // column (no A1 cell); data rows carry the index in column A.
  const contactsRows =
    `<row r="1">${inlineCell("B1", "user_ad")}${inlineCell("C1", "contact_ad")}${inlineCell("D1", "user_name")}${inlineCell("E1", "contact_name")}${inlineCell("F1", "contact_type")}${inlineCell("G1", "explanation")}</row>` +
    `<row r="2">${numCell("A2", 0)}${inlineCell("B2", "me@corp.com")}${inlineCell("C2", "partner@vendor.com")}${inlineCell("D2", "Me")}${inlineCell("E2", "Partner")}${inlineCell("F2", "external")}${inlineCell("G2", "note")}</row>` +
    `<row r="3">${numCell("A3", 1)}${inlineCell("B3", "me@corp.com")}${inlineCell("C3", "ally@trusted.io")}${inlineCell("D3", "Me")}${inlineCell("E3", "Ally")}${inlineCell("F3", "external")}${inlineCell("G3", "note")}</row>` +
    `<row r="4">${numCell("A4", 2)}${inlineCell("B4", "me@corp.com")}${inlineCell("C4", "jdoe@gmail.com")}${inlineCell("D4", "Me")}${inlineCell("E4", "J")}${inlineCell("F4", "freemail")}${inlineCell("G4", "note")}</row>`;
  const breachesRows =
    `<row r="1">${inlineCell("B1", "sender_ad")}${inlineCell("C1", "recipient_ads")}${inlineCell("D1", "contact_type")}${inlineCell("E1", "subject")}</row>` +
    `<row r="2">${numCell("A2", 0)}${inlineCell("B2", "ceo@corp.com")}${inlineCell("C2", "leak@evil.com")}${inlineCell("D2", "external")}${inlineCell("E2", "hi")}</row>` +
    `<row r="3">${numCell("A3", 1)}${inlineCell("B3", "cfo@corp.com")}${inlineCell("C3", "dump@evil.com")}${inlineCell("D3", "external")}${inlineCell("E3", "yo")}</row>`;
  const statsRows =
    `<row r="1">${inlineCell("B1", "Statistics:")}</row>` + `<row r="2">${numCell("A2", 0)}${inlineCell("B2", "total users: 100")}</row>`;

  const fixture = (contactSheetName = "unauthorised_contacts") =>
    new File(
      [
        zipXlsxMulti([
          { name: "breaches", rowsXml: breachesRows },
          { name: contactSheetName, rowsXml: contactsRows },
          { name: "high_level_statistics", rowsXml: statsRows },
        ]),
      ],
      "enforcer.xlsx",
    );

  it("readSheetHeadersStream returns each sheet's header row (with the leading blank column) in workbook order", async () => {
    const headers = await readSheetHeadersStream(fixture());
    expect(headers.map((h) => h.name)).toEqual(["breaches", "unauthorised_contacts", "high_level_statistics"]);
    expect(headers.find((h) => h.name === "unauthorised_contacts")?.header).toEqual([
      "",
      "user_ad",
      "contact_ad",
      "user_name",
      "contact_name",
      "contact_type",
      "explanation",
    ]);
    const breaches = headers.find((h) => h.name === "breaches")?.header ?? [];
    expect(breaches).toContain("recipient_ads");
    expect(breaches).not.toContain("contact_ad"); // the decoy has no contact_ad
  });

  it("selects unauthorised_contacts and returns domains from contact_ad (never user_ad, never the breaches decoy)", async () => {
    const file = fixture();
    const { target, names } = await selectSheet(file);
    expect(target).toBe("unauthorised_contacts");
    expect(names).toEqual(["breaches", "unauthorised_contacts", "high_level_statistics"]);

    const res = await parseWorkbookStream(file, target, { allSheetNames: names });
    expect(res.sheetName).toBe("unauthorised_contacts");
    expect(res.scanned).toBe(3);
    // domains come from contact_ad…
    expect([...res.map.keys()].sort()).toEqual(["gmail.com", "trusted.io", "vendor.com"]);
    // …never the sender column (user_ad → corp.com) and never the breaches sheet
    // (recipient_ads → evil.com).
    expect(res.map.has("corp.com")).toBe(false);
    expect(res.map.has("evil.com")).toBe(false);
    expect(trustedDomainsFromParsed(res)).toEqual(["trusted.io", "vendor.com"]); // external default
  });

  it("locates the contact sheet by its columns even when it is NOT named like the contact sheet", async () => {
    // No /unauth/ name anywhere, so selection must scan headers and pick the sheet
    // carrying contact_ad + contact_type — not the breaches recipient_ads decoy.
    const file = fixture("Sheet2");
    const { target } = await selectSheet(file);
    expect(target).toBe("Sheet2");
    const res = await parseWorkbookStream(file, target);
    expect([...res.map.keys()].sort()).toEqual(["gmail.com", "trusted.io", "vendor.com"]);
    expect(res.map.has("evil.com")).toBe(false);
  });

  it("honours an explicit sheet override (the user's manual pick)", async () => {
    const { target } = await selectSheet(fixture(), "breaches");
    expect(target).toBe("breaches");
  });

  it("raises the friendly banner listing the sheets when no sheet holds the contact columns", async () => {
    const file = new File(
      [
        zipXlsxMulti([
          { name: "breaches", rowsXml: breachesRows },
          { name: "high_level_statistics", rowsXml: statsRows },
        ]),
      ],
      "enforcer.xlsx",
    );
    await expect(selectSheet(file)).rejects.toThrow(
      /recipient email column.*multiple sheets \(breaches, high_level_statistics\)/,
    );
  });
});

describe("memory guardrails & fast rejection (large / wrong-shape / too-large files)", () => {
  it("rejects a LARGE wrong-shape sheet fast — bounded work, never scans the whole sheet", async () => {
    // A big sheet whose header carries no email column and whose 20k data rows are
    // not emails either. The old path kept parsing every row (denseRow on each) to
    // the end — a ~minute hang on a 250MB file. Detection must give up after its
    // scan window and stop, so only a couple dozen rows are ever examined.
    const N = 20_000;
    const parts: string[] = [`<row r="1">${inlineCell("A1", "col_one")}${inlineCell("B1", "col_two")}</row>`];
    for (let i = 0; i < N; i++) {
      const r = i + 2;
      parts.push(`<row r="${r}">${inlineCell("A" + r, "ref-" + i)}${inlineCell("B" + r, "note")}</row>`);
    }
    const bytes = zipXlsx({ sheetName: "sheet", rowsXml: parts.join(""), level: 0 });

    let stats: StreamStats | null = null;
    await expect(
      parseWorkbookStream(new File([bytes], "wrong-shape-huge.xlsx"), "sheet", {
        onStats: (s) => {
          stats = s;
        },
      }),
    ).rejects.toThrow(/recipient email column.*Columns found: col_one, col_two/);

    // The proof it did NOT hang: it examined only the header-scan window (~25 rows),
    // not all 20,000, and accumulated nothing.
    expect(stats).not.toBeNull();
    const s = stats!;
    expect(s.rowsExamined).toBeLessThan(50);
    expect(s.rowsExamined).toBeLessThan(N / 100);
    expect(s.scannedRows).toBe(0);
  });

  it("aborts with the CSV-fallback banner when the shared-strings table exceeds the memory ceiling", async () => {
    // A workbook whose shared-strings table is larger than the (here, tiny) ceiling
    // must abort BEFORE materialising it, with the friendly export-as-CSV banner —
    // never an OOM.
    const strings = Array.from({ length: 200 }, (_, i) => `shared-string-value-${i}-with-some-padding`);
    const rowsXml = `<row r="1"><c r="A1" t="s"><v>0</v></c></row>`;
    const bytes = zipXlsx({ sheetName: "unauthorised_contacts", rowsXml, sharedStrings: strings });
    const file = new File([bytes], "huge-shared-strings.xlsx");

    await expect(
      parseWorkbookStream(file, "unauthorised_contacts", { limits: { maxMetaBytes: 1024 } }),
    ).rejects.toThrow(CSV_FALLBACK_MESSAGE);

    // Under the real (large) default ceiling this small file is fine — it fails only
    // for lack of an email column, NOT as a too-large error.
    await expect(parseWorkbookStream(file, "unauthorised_contacts")).rejects.toThrow(/recipient email column/);
  });

  it("aborts with the CSV-fallback banner when a single row would grow the buffer past the ceiling", async () => {
    // A pathological/malformed sheet with one enormous, never-closed <row>: the
    // rolling buffer must not grow without bound — it aborts at the ceiling.
    const big = "x".repeat(20_000);
    const rowsXml = `<row r="1"><c r="A1" t="inlineStr"><is><t>${big}</t></is>`; // intentionally unclosed
    const bytes = zipXlsx({ sheetName: "s", rowsXml });
    await expect(
      parseWorkbookStream(new File([bytes], "huge-row.xlsx"), "s", { limits: { maxRowBufferChars: 2000 } }),
    ).rejects.toThrow(CSV_FALLBACK_MESSAGE);
  });

  it("reports rows processed through onRows", async () => {
    const seen: number[] = [];
    await parseWorkbookStream(fileFromSample(), "unauthorised_contacts", { onRows: (n) => seen.push(n) });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBeGreaterThanOrEqual(3); // header + 3 data rows examined
  });
});

describe("size guard is a high backstop, not the gate (large shared-strings tables parse)", () => {
  // Build a workbook with a genuinely large shared-strings table: tens of thousands
  // of DISTINCT contact emails (so the string table is sizeable) that nonetheless
  // de-dupe to a handful of domains — exactly the shape of a real enforcer export,
  // where the table is the largest part of the file but the result is tiny.
  const DOMAINS = ["alpha.com", "bravo.com", "charlie.com", "delta.com", "echo.com"];
  const EMAILS = 60_000;
  function bigSharedStringsXlsx() {
    // shared strings: header labels (0,1), the type values (2,3), then 60k unique emails
    const strings = ["contact_ad", "contact_type", "external", "freemail"];
    for (let i = 0; i < EMAILS; i++) strings.push(`contact.person.${i}@${DOMAINS[i % DOMAINS.length]}`);
    const parts: string[] = [`<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>`];
    for (let i = 0; i < EMAILS; i++) {
      const r = i + 2;
      const addrIdx = 4 + i; // unique email per row
      const typeIdx = i % 2 === 0 ? 2 : 3; // external / freemail
      parts.push(`<row r="${r}"><c r="A${r}" t="s"><v>${addrIdx}</v></c><c r="B${r}" t="s"><v>${typeIdx}</v></c></row>`);
    }
    return zipXlsx({ sheetName: "unauthorised_contacts", rowsXml: parts.join(""), sharedStrings: strings });
  }

  it("the raised default ceiling is a true backstop (>= 1 GB), well past any normal export", () => {
    // Documents the fix: the cap is no longer a 256 MB gate that refuses 115/250 MB
    // files — it only catches the pathological multi-GB case.
    expect(DEFAULT_LIMITS.maxMetaBytes).toBeGreaterThanOrEqual(1024 * 1024 * 1024);
  });

  it("parses a workbook with a multi-MB shared-strings table under the DEFAULT cap (not refused)", async () => {
    const file = new File([bigSharedStringsXlsx()], "big-shared-strings.xlsx");
    // Parsed with the real default limits — NOT refused, even though the string
    // table is far larger than the old 256 MB-era thinking would have been wary of.
    const res = await parseWorkbookStream(file, "unauthorised_contacts");
    expect(res.scanned).toBe(EMAILS);
    expect(res.map.size).toBe(DOMAINS.length); // 60k unique emails -> 5 domains
    expect([...res.map.keys()].sort()).toEqual([...DOMAINS].sort());
    expect(res.typeTotals.get("external")).toBe(EMAILS / 2);
    expect(res.typeTotals.get("freemail")).toBe(EMAILS / 2);
  });

  it("still refuses only when the table genuinely exceeds the ceiling (low cap trips the same file)", async () => {
    // Prove the ceiling is what governs refusal: drop it far below the table size
    // and the very same file aborts to the calm CSV-fallback banner.
    const file = new File([bigSharedStringsXlsx()], "big-shared-strings.xlsx");
    await expect(
      parseWorkbookStream(file, "unauthorised_contacts", { limits: { maxMetaBytes: 64 * 1024 } }),
    ).rejects.toThrow(CSV_FALLBACK_MESSAGE);
  });
});

describe("never OOM: aborts cleanly to the banner under memory pressure", () => {
  // A probe reporting the tab is near its heap ceiling must unwind to the friendly
  // CSV-fallback banner rather than let the parse push the tab into a hard OOM.
  const underPressure = () => 0.99; // >= MAX_HEAP_FRACTION

  it("aborts during shared-strings streaming when memory pressure is detected", async () => {
    // A workbook that carries a shared-strings table (the abort fires in pass 1).
    const strings = Array.from({ length: 500 }, (_, i) => `string-${i}`);
    const rowsXml = `<row r="1"><c r="A1" t="s"><v>0</v></c></row>`;
    const file = new File([zipXlsx({ sheetName: "unauthorised_contacts", rowsXml, sharedStrings: strings })], "p.xlsx");
    await expect(
      parseWorkbookStream(file, "unauthorised_contacts", { memoryProbe: underPressure }),
    ).rejects.toThrow(CSV_FALLBACK_MESSAGE);
  });

  it("aborts during sheet streaming when memory pressure is detected (inline-string file, no shared table)", async () => {
    // Inline strings -> no shared-strings entry, so the abort must fire in pass 2
    // (the sheet stream loop) instead.
    const rowsXml =
      `<row r="1">${inlineCell("A1", "contact_ad")}${inlineCell("B1", "contact_type")}</row>` +
      `<row r="2">${inlineCell("A2", "partner@vendor.com")}${inlineCell("B2", "external")}</row>`;
    const file = new File([zipXlsx({ sheetName: "unauthorised_contacts", rowsXml })], "p-inline.xlsx");
    await expect(
      parseWorkbookStream(file, "unauthorised_contacts", { memoryProbe: underPressure }),
    ).rejects.toThrow(CSV_FALLBACK_MESSAGE);

    // …and with a healthy probe the same file parses fine (the probe is the only
    // difference), so the guard does not false-positive.
    const ok = await parseWorkbookStream(file, "unauthorised_contacts", { memoryProbe: () => 0.1 });
    expect([...ok.map.keys()]).toEqual(["vendor.com"]);
  });
});
