/* Privacy tests for parse diagnostics: the downloadable report AND the on-screen
   banner must carry STRUCTURE ONLY — column header labels, names, counts, sizes,
   timings and the error message — and NEVER a data-cell value (an email address
   or any contact field). These run the real shared parser, so the guarantee is
   proven end-to-end, not against a hand-built object.

   No jsdom needed: the banner is rendered to static markup with react-dom/server,
   so we assert its exact output in the default node environment. */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { runParseWithDiagnostics } from "./parse-run";
import {
  classifyStopReason,
  formatDiagnosticReport,
  newDiagnostics,
  NO_CONTACT_DATA_NOTE,
} from "./diagnostics";
import { DiagnosticBanner } from "../components/ui/DiagnosticBanner";

const csvFile = (text: string, name = "contacts.csv") => new File([text], name, { type: "text/csv" });

// Looks-like-an-email matcher — used to prove no address survives into diagnostics.
const EMAILISH = /[^\s,@"]+@[^\s,@"]+\.[a-z]{2,}/i;

// The structural fields a diagnostic report is allowed to contain — anything else
// would be a leak of data.
const ALLOWED_KEYS = new Set([
  "_note",
  "timestamp",
  "appVersion",
  "fileName",
  "fileSize",
  "kind",
  "sheetNames",
  "sheets",
  "chosenSheet",
  "headerRow",
  "rowCount",
  "bytesRead",
  "elapsedMs",
  "stopReason",
  "errorMessage",
]);

describe("parse diagnostics — privacy (no contact data leaks)", () => {
  it("a SUCCESSFUL parse records structure (headers, counts) but no email address or cell value", async () => {
    // A real export whose cells are the customer's contacts. These addresses and
    // names must not appear anywhere in the diagnostics.
    const csv =
      "id,contact_address,contact_type\n" +
      "1,alice@secret-partner.example,external\n" +
      "2,bob@hidden-customer.example,external\n" +
      "3,carol@confidential.example,freemail\n";
    const { result, error, diagnostics } = await runParseWithDiagnostics(csvFile(csv));

    expect(error).toBeUndefined();
    expect(result!.map.size).toBe(3);

    // Structure WAS captured…
    expect(diagnostics.kind).toBe("csv");
    expect(diagnostics.headerRow).toEqual(["id", "contact_address", "contact_type"]);
    expect(diagnostics.rowCount).toBe(3);

    // …but neither the diagnostics object nor the downloadable report carries a
    // single address, local-part or recipient domain.
    const report = formatDiagnosticReport(diagnostics);
    expect(report).not.toMatch(EMAILISH);
    for (const secret of [
      "alice",
      "bob",
      "carol",
      "secret-partner.example",
      "hidden-customer.example",
      "confidential.example",
    ]) {
      expect(report).not.toContain(secret);
    }
  });

  it("a FAILED parse reports the headers + reason but never the data cells (report AND banner)", async () => {
    // No column is an email column, so the parse fails. The data cells carry
    // distinctive sentinels that must never surface.
    const csv =
      "ref,display_name,memo\n" +
      "R1,ALICE_SECRET_NAME,MEMO_SECRET_ONE\n" +
      "R2,BOB_SECRET_NAME,MEMO_SECRET_TWO\n";
    const { error, diagnostics } = await runParseWithDiagnostics(csvFile(csv, "export.csv"));

    expect(error).toMatch(/recipient email column/i);
    expect(diagnostics.stopReason).toBe("no-email-column");
    expect(diagnostics.headerRow).toEqual(["ref", "display_name", "memo"]);

    const SECRETS = ["ALICE_SECRET_NAME", "BOB_SECRET_NAME", "MEMO_SECRET_ONE", "MEMO_SECRET_TWO"];

    // The downloadable diagnostic: headers present, sentinels absent.
    const report = formatDiagnosticReport(diagnostics);
    expect(report).toContain("ref");
    expect(report).toContain("display_name");
    for (const secret of SECRETS) expect(report).not.toContain(secret);

    // The on-screen banner: same guarantee on what the user actually sees.
    const html = renderToStaticMarkup(<DiagnosticBanner diagnostics={diagnostics} />);
    expect(html).toContain("export.csv");
    expect(html).toContain("display_name"); // header label is shown
    expect(html).toMatch(/no contact data/i); // the reassurance is shown
    expect(html).toContain("Download diagnostic");
    for (const secret of SECRETS) expect(html).not.toContain(secret);
  });

  it("the downloadable report is JSON, carries the no-contact-data note, and only structural keys", () => {
    const report = formatDiagnosticReport(
      newDiagnostics({ fileName: "x.csv", fileSize: 1234, headerRow: ["a", "b"], rowCount: 9 }),
    );
    const parsed = JSON.parse(report) as Record<string, unknown>;
    expect(parsed._note).toBe(NO_CONTACT_DATA_NOTE);
    expect(String(parsed._note)).toMatch(/no contact data/i);
    for (const key of Object.keys(parsed)) expect(ALLOWED_KEYS.has(key)).toBe(true);
  });

  it("classifyStopReason maps the failures the parser can raise", () => {
    expect(classifyStopReason("Could not find a recipient email column in this sheet.")).toBe("no-email-column");
    expect(classifyStopReason("This file is not a readable .xlsx workbook.")).toBe("unreadable");
    expect(classifyStopReason("not a zip")).toBe("unreadable");
    expect(classifyStopReason("Array buffer allocation failed")).toBe("too-large");
  });
});
