/* ============================================================
   Trusted Domain Extractor — shared parsing primitives &
   the streaming CSV fast-path. Ported from handoff
   project/app/extractor-parse.jsx.

   The heavy file work (large .xlsx and .csv) runs inside a Web
   Worker (see parse.worker.ts) so it has its own memory budget and
   a failure surfaces as an error instead of killing the tab. The
   .xlsx path streams the zip entry-by-entry and the sheet row-by-row
   (see xlsx-stream.ts) — it never materialises the whole workbook.
   Everything runs in the browser; nothing is uploaded.
   ============================================================ */
import { debug, headerLabels, type ParseDiagnostics } from "./diagnostics";

export const TARGET_SHEET = /unauth/i; // unauthorised_contacts

/* Header aliases. Enforcer exports differ in how they label the recipient and
   contact-type columns — and some have been seen truncated (e.g. "contact_ad") —
   so we match a SET of known names rather than one hard-coded pair, and the match
   is case-, whitespace- and separator-insensitive (see canonHeader): "Contact
   Address", "contact-address" and "contact_address" all compare equal.

   The address aliases deliberately list only recipient/contact-side names, never
   the sender/user column, so an export that carries BOTH the internal sender and
   the external contact (the unauthorised_contacts sheet has user_ad AND contact_ad)
   always resolves to the contact. When none of these match, parsing falls back to
   scanning the data for a column that looks like email addresses (see
   createColumnResolver). */
export const COL_ADDR_ALIASES = [
  "contact_ad", // the enforcer's own label for the contact address (sometimes truncated to this)
  "contact_address",
  "contact_ads",
  "contact_email",
  "contact_emails",
  "recipient_address",
  "recipient_ad",
  "recipient_ads",
  "recipient_email",
  "recipient",
  "email_address",
  "email",
  "smtp_address",
  "address",
];

/* The contact-type / direction column is OPTIONAL: when an export has no such
   column the extractor still works, treating every recipient as untyped. */
export const COL_TYPE_ALIASES = [
  "contact_type",
  "contact_direction",
  "direction",
  "category",
  "classification",
  "type",
];

/* The contact-side address aliases ONLY — deliberately narrower than
   COL_ADDR_ALIASES (it excludes the recipient_, email, address and smtp names).
   This is the set used to IDENTIFY THE RIGHT SHEET in a multi-sheet enforcer
   export: the breaches sheet carries recipient_ads + contact_type, so the broad
   alias set would mis-select it; the real contact rows live on the sheet that has
   a contact_ad column. Column RESOLUTION within the chosen sheet still uses the
   full COL_ADDR_ALIASES set (and the email-scan fallback) — only sheet SELECTION
   keys on this narrow pair. */
export const COL_ADDR_CONTACT = [
  "contact_ad",
  "contact_address",
  "contact_ads",
  "contact_email",
  "contact_emails",
];

export interface DomainRec {
  types: Map<string, number>;
  total: number;
}

export interface ParsedResult {
  map: Map<string, DomainRec>;
  scanned: number;
  typeTotals: Map<string, number>;
  sheetName: string;
  sheetNames?: string[];
}

export interface Columns {
  type: number;
  addr: number;
}

export interface AccResult {
  map: Map<string, DomainRec>;
  scanned: number;
  typeTotals: Map<string, number>;
}

export interface Accumulator {
  add(type: unknown, addr: unknown): void;
  result(): AccResult;
}

/* The friendly banner shown ONLY in the genuine extreme case: a file whose text
   content is so large that even streaming it would exhaust the browser tab (its
   shared-strings table runs past the ~1 GB streaming ceiling, a single row is
   pathologically huge, or the tab is already under memory pressure). Ordinary
   large exports — 115 MB, 250 MB — now stream and parse normally; this is the
   last-resort backstop, not the gate. CSV streams line-by-line with flat memory
   and has no such limit, so that is the escape hatch we point the user at. Kept
   as an exported constant so the UI can recognise this exact message and present
   it as calm guidance rather than a hard "couldn't read" error. */
export const CSV_FALLBACK_MESSAGE =
  "This file is too large to process safely in the browser — its text content exceeds the ~1 GB streaming limit. Export just the unauthorised_contacts sheet as CSV and upload that instead.";

/** The too-large guardrail error (see CSV_FALLBACK_MESSAGE). Thrown the moment a
 *  memory ceiling is about to be crossed, so the tab can never OOM. */
export function tooLargeError(): Error {
  return new Error(CSV_FALLBACK_MESSAGE);
}

/** True when an error is the too-large guardrail (so the UI can show the calm
 *  "export as CSV" guidance instead of a generic read failure). */
export function isTooLargeError(err: unknown): boolean {
  return err instanceof Error ? err.message === CSV_FALLBACK_MESSAGE : err === CSV_FALLBACK_MESSAGE;
}

export function norm(s: unknown): string {
  return String(s == null ? "" : s).trim().toLowerCase();
}

// pull the domain out of an email-ish string
export function emailDomain(s: unknown): string {
  if (!s) return "";
  const v = String(s).trim().toLowerCase();
  const at = v.lastIndexOf("@");
  if (at < 0) return "";
  let dom = v.slice(at + 1);
  dom = dom.replace(/[\s,;<>"')\]].*$/, "").replace(/\.+$/, "").trim();
  if (!dom || dom.indexOf(".") < 0) return "";
  return dom;
}

/* Canonicalise a header cell for alias matching: trim, lower-case, and fold any
   run of spaces / underscores / hyphens / dots / slashes into a single underscore
   (then strip leading/trailing underscores). This is what lets "Contact Address",
   "contact-address" and "contact_address" all match the "contact_address" alias. */
function canonHeader(s: unknown): string {
  return String(s == null ? "" : s)
    .trim()
    .toLowerCase()
    .replace(/[\s._\-/]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// index of the first column whose canonical header equals one of `aliases`
// (alias order is priority order), or -1
function aliasIndex(headerCanon: string[], aliases: string[]): number {
  for (const a of aliases) {
    const i = headerCanon.indexOf(a);
    if (i >= 0) return i;
  }
  return -1;
}

// Locate the contact columns in a header row by alias. `addr` is -1 when no known
// address alias is present (the caller then falls back to scanning for an email
// column); `type` is -1 when there is no contact-type/direction column.
export function locateColumns(cells: unknown[]): Columns {
  const canon = cells.map(canonHeader);
  return { type: aliasIndex(canon, COL_TYPE_ALIASES), addr: aliasIndex(canon, COL_ADDR_ALIASES) };
}

// accumulate rows -> Map(domain -> { types:Map(type->count), total })
export function makeAccumulator(): Accumulator {
  const map = new Map<string, DomainRec>();
  let scanned = 0;
  const typeTotals = new Map<string, number>();
  return {
    add(type: unknown, addr: unknown) {
      scanned++;
      const dom = emailDomain(addr);
      if (!dom) return;
      const t = norm(type) || "(blank)";
      typeTotals.set(t, (typeTotals.get(t) || 0) + 1);
      let rec = map.get(dom);
      if (!rec) {
        rec = { types: new Map(), total: 0 };
        map.set(dom, rec);
      }
      rec.total++;
      rec.types.set(t, (rec.types.get(t) || 0) + 1);
    },
    result() {
      return { map, scanned, typeTotals };
    },
  };
}

/* ---------------- robust column resolution (shared by the CSV and .xlsx readers) ----------------
   One place decides which column holds the recipient address and which (optional)
   holds the contact type, so the Trusted Domains page and the wizard upload behave
   identically. It tries the header aliases first and, only when none match, falls
   back to scanning the data for an email-bearing column. */

export interface ResolvedColumns {
  /** index of the contact-type/direction column, or -1 when there is none. */
  type: number;
  /** index of the recipient/email column (always >= 0 once resolved). */
  addr: number;
  /** rows buffered during detection that are data rows to accumulate now. Empty
   *  for an alias hit (resolved on the header row itself); non-empty only when the
   *  email-scan fallback had to buffer rows in order to find the column. */
  replay: unknown[][];
}

export interface ColumnResolver {
  /** Feed one non-blank row of cells (indexed by column position). Returns the
   *  resolved columns the moment they are known — after which feed() must not be
   *  called again — or null. A null result means EITHER "keep feeding" OR "given
   *  up": call exhausted() to tell them apart so the caller can fail fast. */
  feed(cells: unknown[]): ResolvedColumns | null;
  /** Force a decision from whatever has been buffered, for when the stream ends
   *  before feed() resolved. Returns the columns, or null when no email column
   *  could be found at all (the caller then raises columnsNotFoundError). */
  finalize(): ResolvedColumns | null;
  /** True once detection has given up within the bounded scan window — the email
   *  column was not found in the first {@link HEADER_SCAN_LIMIT} non-blank rows.
   *  The streaming readers consult this to fail fast (raise the banner) instead of
   *  reading the rest of a wrong-shape file, which would OOM the tab. */
  exhausted(): boolean;
  /** The non-empty header labels seen (the first non-blank buffered row), for the
   *  "columns found" banner when resolution fails. */
  foundHeaders(): string[];
}

// The header (or, for the fallback, enough email evidence) must appear within the
// first N non-blank rows — the same bound the old single-pass header search used.
const HEADER_SCAN_LIMIT = 25;

// Token hints for the email-scan fallback: when more than one column looks like
// email, prefer a recipient/contact column over a sender/user one. Matched against
// the canonical (underscore-joined) header, so tokens are bounded by `_` or ends.
const ADDR_HINT = /(^|_)(recipient|contact|external|destination|to)(_|$)/;
const SENDER_HINT = /(^|_)(sender|user|internal|source|owner|from)(_|$)/;

export function createColumnResolver(): ColumnResolver {
  const buffer: unknown[][] = [];
  let fed = 0;
  let scanExhausted = false;

  // the labels row = the first buffered row that has any non-empty cell
  const headerRow = (): unknown[] => buffer.find((r) => r.some((c) => String(c ?? "").trim() !== "")) ?? [];

  // No alias matched within the scan window: pick the column whose values most
  // look like email addresses (nudged toward a recipient/contact header over a
  // sender/user one), and treat the rows carrying an address there as data.
  const fallback = (): ResolvedColumns | null => {
    let width = 0;
    for (const r of buffer) if (r.length > width) width = r.length;
    const hCanon = headerRow().map(canonHeader);
    let bestCol = -1;
    let bestScore = -Infinity;
    let bestCount = 0;
    for (let c = 0; c < width; c++) {
      let count = 0;
      for (const r of buffer) if (emailDomain(r[c]) !== "") count++;
      if (count === 0) continue;
      const h = hCanon[c] || "";
      const score = count + (ADDR_HINT.test(h) ? 1e6 : 0) - (SENDER_HINT.test(h) ? 1e6 : 0);
      if (score > bestScore || (score === bestScore && count > bestCount)) {
        bestScore = score;
        bestCount = count;
        bestCol = c;
      }
    }
    if (bestCol < 0) return null; // nothing in the buffer looked like an email address
    const type = aliasIndex(hCanon, COL_TYPE_ALIASES);
    const replay = buffer.filter((r) => emailDomain(r[bestCol]) !== "");
    return { type, addr: bestCol, replay };
  };

  return {
    feed(cells) {
      if (scanExhausted) return null;
      const loc = locateColumns(cells);
      if (loc.addr >= 0) return { type: loc.type, addr: loc.addr, replay: [] }; // alias hit on this header row
      buffer.push(cells);
      if (++fed >= HEADER_SCAN_LIMIT) {
        scanExhausted = true;
        return fallback();
      }
      return null;
    },
    finalize() {
      if (scanExhausted) return null;
      scanExhausted = true;
      return fallback();
    },
    exhausted() {
      return scanExhausted;
    },
    foundHeaders() {
      return headerRow()
        .map((c) => String(c ?? "").trim())
        .filter((s) => s !== "");
    },
  };
}

// Friendly, specific error for the genuinely-unresolvable case: keep the calm
// banner but list the headers the sheet actually had, so the user can see what it
// contains and which column is missing. For a multi-sheet workbook where no sheet
// held the contact columns, `sheetNames` is also listed so the user sees every
// sheet that was in the file (and `found` is the best-guess sheet's headers).
export function columnsNotFoundError(found: string[], where: "sheet" | "CSV" = "sheet", sheetNames?: string[]): Error {
  const cols = found.length ? `Columns found: ${found.join(", ")}.` : "No column headers were found.";
  const loc = where === "CSV" ? "the CSV header" : "this sheet";
  const sheets =
    sheetNames && sheetNames.length > 1
      ? ` This file has multiple sheets (${sheetNames.join(", ")}); none held the expected contact columns.`
      : "";
  return new Error(
    `Could not find a recipient email column in ${loc}. ${cols}${sheets} ` +
      `Expected a column such as contact_address, recipient_address or email — or any column of email addresses.`,
  );
}

/* ---------------- CSV streaming path ---------------- */
function splitCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += c;
    } else {
      if (c === '"') q = true;
      else if (c === ",") {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
  }
  out.push(cur);
  return out;
}

export async function parseCSV(
  file: Blob,
  onProgress?: (p: number) => void,
  onRows?: (rows: number) => void,
  diag?: ParseDiagnostics,
): Promise<ParsedResult> {
  const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
  const acc = makeAccumulator();
  const resolver = createColumnResolver();
  let buf = "";
  let cols: Columns | null = null;
  // Set once the header scan window closes without finding an email column: there
  // is nothing left to find, so stop reading instead of scanning the whole file
  // (the bound that makes a wrong-shape file reject fast even at hundreds of MB).
  let aborted = false;
  let read = 0;
  let rowsSeen = 0; // data lines processed once the header is known (for row progress)
  let reported = 0;
  let lastDebugBytes = 0;
  const total = file.size || 0;
  if (diag) {
    diag.kind = "csv";
    diag.sheetNames = ["(csv)"];
    diag.chosenSheet = "(csv)";
  }
  const addRow = (cells: unknown[]) => acc.add(cols!.type >= 0 ? cells[cols!.type] : "", cells[cols!.addr]);
  const apply = (r: ResolvedColumns) => {
    cols = { type: r.type, addr: r.addr };
    debug("csv:columns", { headers: diag?.headerRow ?? [], addr: r.addr, type: r.type, replay: r.replay.length });
    for (const row of r.replay) addRow(row); // data rows the resolver buffered while detecting
  };
  const handle = (line: string) => {
    if (line === "" || aborted) return;
    const cells = splitCSVLine(line);
    if (!cols) {
      // The first non-blank line is the header row — record its labels (only),
      // never the data lines the resolver buffers below it.
      if (diag && diag.headerRow.length === 0) {
        const labels = headerLabels(cells);
        if (labels.length) diag.headerRow = labels;
      }
      const r = resolver.feed(cells);
      if (r) apply(r);
      // No email column within the bounded scan window: stop now instead of
      // reading the rest of a wrong-shape file (fail fast to the banner).
      else if (resolver.exhausted()) aborted = true;
      // else: not the header yet (or stray line) — keep scanning
      return;
    }
    rowsSeen++;
    addRow(cells);
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (value) {
      read += value.length;
      buf += value;
      let nl: number;
      while (!aborted && (nl = buf.indexOf("\n")) >= 0) {
        let line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        handle(line);
      }
      if (total) onProgress?.(Math.min(0.99, read / total));
      if (diag) diag.bytesRead = read;
      if (read - lastDebugBytes >= 4 * 1024 * 1024) {
        lastDebugBytes = read;
        debug("csv:bytes", { bytesRead: read, rows: rowsSeen });
      }
      if (onRows && rowsSeen - reported >= 2048) {
        reported = rowsSeen;
        onRows(rowsSeen);
      }
    }
    if (done || aborted) {
      if (done && !aborted && buf.trim()) handle(buf.replace(/\r$/, ""));
      break;
    }
  }
  if (aborted) await reader.cancel().catch(() => {});
  if (!cols) {
    // finalize() returns null once the resolver is exhausted (incl. the fail-fast
    // abort), so a wrong-shape file raises the banner here either way.
    const r = resolver.finalize();
    if (r) apply(r);
    else {
      if (diag && diag.headerRow.length === 0) diag.headerRow = resolver.foundHeaders();
      throw columnsNotFoundError(resolver.foundHeaders(), "CSV");
    }
  }
  onProgress?.(1);
  onRows?.(rowsSeen);
  const r = acc.result();
  if (diag) {
    diag.rowCount = r.scanned;
    diag.bytesRead = read;
  }
  debug("csv:done", { rows: r.scanned, bytesRead: read });
  return { ...r, sheetName: "(csv)", sheetNames: ["(csv)"] };
}

/**
 * Default trusted-domain selection from a parsed enforcer export, mirroring the
 * Trusted Domain Extractor's out-of-the-box view: the external contacts' domains
 * (the candidate trusted third parties), de-duplicated and sorted. When a sheet
 * carries no "external" contacts we fall back to the first contact type present,
 * then to everything — the same precedence the extractor's type filter defaults
 * to. Returns [] when the sheet yielded no usable domains.
 *
 * This is the no-curation default the wizard hands to the Policy Creator; the
 * user can still review and refine it on the extractor page afterwards. It is
 * intentionally the same shape the extractor saves, so the handoff is identical.
 */
export function trustedDomainsFromParsed(parsed: ParsedResult): string[] {
  const types = [...parsed.typeTotals.keys()];
  const typeFilter = types.includes("external") ? "external" : types[0] || "all";
  const out: string[] = [];
  for (const [dom, rec] of parsed.map.entries()) {
    const count = typeFilter === "all" ? rec.total : rec.types.get(typeFilter) || 0;
    if (typeFilter !== "all" && count === 0) continue;
    out.push(dom);
  }
  return out.sort();
}

/* ---------------- sheet selection (shared by the streaming reader) ---------------- */
export function pickSheet(names: string[], preferred?: string): string {
  if (preferred && names.includes(preferred)) return preferred;
  return names.find((n) => TARGET_SHEET.test(n)) || names[0];
}

// Tier-1 sheet match: the enforcer's contact rows conventionally live on a sheet
// named "unauthorised_contacts". Match case-insensitively and tolerant of
// surrounding whitespace (TARGET_SHEET also keeps looser spellings working).
export function isUnauthSheetName(name: string): boolean {
  return TARGET_SHEET.test(String(name ?? "").trim());
}

// Does this header row carry the real required pair — a contact-side address
// column (contact_ad…) AND a contact-type column? This is what distinguishes the
// unauthorised_contacts sheet from the breaches sheet (which has recipient_ads +
// contact_type but no contact_ad). Case-, whitespace- and separator-insensitive,
// and tolerant of a leading unnamed/index column (an empty header matches nothing).
export function hasRequiredPair(cells: unknown[]): boolean {
  const canon = cells.map(canonHeader);
  return aliasIndex(canon, COL_ADDR_CONTACT) >= 0 && aliasIndex(canon, COL_TYPE_ALIASES) >= 0;
}

export interface SheetHeader {
  name: string;
  header: unknown[];
}

export interface SheetChoice {
  /** the auto-selected sheet (a name from `sheets`), or null when none qualifies. */
  chosen: string | null;
  /** the sheet to attempt/report when `chosen` is null — the most contact-like one. */
  bestGuess: string;
}

// Pick the sheet that holds the unauthorised-contact rows from a multi-sheet
// workbook, by inspecting each sheet's header row:
//   1. prefer a sheet named like "unauthorised_contacts" (case-insensitive);
//   2. otherwise the first sheet whose header carries the real required pair
//      (contact_ad + contact_type).
// When neither matches, `chosen` is null and `bestGuess` names the most
// contact-like sheet (one with a contact-type column, else the first), so the
// caller can surface a useful banner instead of silently scanning the wrong sheet.
export function chooseSheetByHeaders(sheets: SheetHeader[]): SheetChoice {
  const chosen =
    sheets.find((s) => isUnauthSheetName(s.name))?.name ??
    sheets.find((s) => hasRequiredPair(s.header))?.name ??
    null;
  const bestGuess =
    chosen ?? sheets.find((s) => locateColumns(s.header).type >= 0)?.name ?? sheets[0]?.name ?? "";
  return { chosen, bestGuess };
}

export function isCSV(file: File): boolean {
  return /\.csv$/i.test(file.name) || file.type === "text/csv";
}
