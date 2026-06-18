/* ============================================================
   Streaming .xlsx reader. An .xlsx file is a zip; the old path read
   the whole file, parsed the whole workbook with SheetJS, then
   materialised every row again via sheet_to_json — three copies of
   the data held at once, which exhausts a browser tab on large
   enforcer exports.

   This reader instead:
     • treats the file as a zip and, using fflate's streaming
       unzipper, inflates ONLY the workbook metadata, the shared
       strings, and the one target sheet (every other entry, incl.
       the big sheets, is skipped without being decompressed);
     • parses the target sheet XML row-by-row out of a small rolling
       buffer, reading only the contact_ad / contact_type columns and
       aggregating domains incrementally — the full row set is never
       held in memory.

   Peak memory is therefore bounded by one decompression chunk plus
   the (small) domain map, independent of the row count. Everything
   runs locally; nothing is uploaded.
   ============================================================ */
import { Unzip, UnzipInflate, UnzipPassThrough } from "fflate";
import {
  chooseSheetByHeaders,
  columnsNotFoundError,
  createColumnResolver,
  isUnauthSheetName,
  makeAccumulator,
  tooLargeError,
  type ParsedResult,
  type ResolvedColumns,
  type SheetHeader,
} from "./extract";
import { debug, headerLabels, type ParseDiagnostics } from "./diagnostics";

/* ---------------- memory guardrails (a high backstop, not the gate) ----------------
   The sheet rows stream with bounded memory (one decompression chunk + the running
   domain set), and the shared-strings table is now parsed as a stream too (one <si>
   at a time out of a rolling buffer — see createSharedStringsParser). So an ordinary
   large export — 115 MB, 250 MB — streams and parses normally; it is no longer
   refused up front.

   Two things still are not *inherently* bounded and could OOM a pathological/huge
   file, so we keep a HIGH last-resort ceiling on each:
     • the shared-strings table — every reader must hold the resolved strings to
       look up string cells by index, so the array itself grows with the file. We
       allow it up to a generous 1 GB of text (well past any normal export) and
       abort only beyond that;
     • a single worksheet row, if the XML is malformed and never closes a <row>.
   Crossing either cap means "even streaming this is unsafe": we abort BEFORE
   exhausting memory and surface the calm CSV-fallback banner (CSV streams
   line-by-line with flat memory). The caps are overridable so tests can trip them
   with small fixtures.

   Belt-and-braces on top of the byte caps, a memory PRESSURE probe (where the
   engine exposes one — performance.memory in Chromium) is sampled mid-stream; if
   the tab is genuinely close to its heap limit we abort to the same banner rather
   than crash. It is a no-op where unavailable (Firefox/Safari/Node), where the
   byte caps remain the guard. */
export interface StreamLimits {
  /** Max decompressed bytes for the shared-strings table (and the small workbook
   *  metadata entries). A normal 250 MB export is comfortably under this; beyond it
   *  even streaming is unsafe, so we abort with the CSV-fallback banner. */
  maxMetaBytes: number;
  /** Max chars allowed to accumulate in the rolling row buffer (i.e. the size of
   *  one worksheet row). A row larger than this is pathological; abort rather than
   *  let the buffer grow unbounded. */
  maxRowBufferChars: number;
}

export const DEFAULT_LIMITS: StreamLimits = {
  maxMetaBytes: 1024 * 1024 * 1024, // 1 GB of shared-strings text — a high backstop, not a gate
  maxRowBufferChars: 16 * 1024 * 1024, // ~16M chars for a single row
};

function resolveLimits(limits?: Partial<StreamLimits>): StreamLimits {
  return { ...DEFAULT_LIMITS, ...limits };
}

/* ---------------- memory-pressure probe ----------------
   Returns the tab's current heap usage as a fraction in [0,1], or a negative
   number when the engine does not expose one. `performance.memory` is a
   non-standard Chromium extension, so this is best-effort: it adds a real
   "never OOM" net where present and costs nothing where absent. */
export type MemoryProbe = () => number;

interface JSHeapInfo {
  usedJSHeapSize: number;
  jsHeapSizeLimit: number;
}

export const defaultMemoryProbe: MemoryProbe = () => {
  const mem =
    typeof performance !== "undefined" ? (performance as unknown as { memory?: JSHeapInfo }).memory : undefined;
  if (!mem || !mem.jsHeapSizeLimit) return -1;
  return mem.usedJSHeapSize / mem.jsHeapSizeLimit;
};

/** Abort once the heap is this close to its ceiling — early enough to unwind
 *  cleanly to the banner rather than hit the hard OOM and lose the tab. */
export const MAX_HEAP_FRACTION = 0.92;

/** Throw the CSV-fallback (too-large) error if the tab is under memory pressure. */
function assertMemoryOk(probe: MemoryProbe): void {
  if (probe() >= MAX_HEAP_FRACTION) throw tooLargeError();
}

const WORKBOOK_PATH = "xl/workbook.xml";
const WORKBOOK_RELS_PATH = "xl/_rels/workbook.xml.rels";
const SHARED_STRINGS_RE = /(^|\/)sharedStrings\.xml$/i;

// Read the source file in modest slices so we never hold the whole
// compressed file at once and so decompression output stays chunked.
const READ_CHUNK = 256 * 1024;

// Absolute upper bound on rows examined before the contact columns resolve. A
// well-formed export resolves on its header row, so this only ever trips on a
// malformed/wrong-shape file (e.g. a huge run of blank rows ahead of any header):
// it bounds the work so such a file fails fast to the banner instead of streaming
// in full and exhausting the tab.
const MAX_UNRESOLVED_ROWS = 50_000;

/* ---------------- low-level zip streaming ---------------- */
interface StreamZipOptions {
  onRead?: (bytesRead: number) => void;
  shouldStop?: () => boolean;
}

// Stream `file` through fflate, delivering decompressed chunks for entries
// whose name passes `want`. Entries that are not wanted are skipped without
// being inflated. Resolves when the archive ends or `shouldStop` returns true.
async function streamZip(
  file: Blob,
  want: (name: string) => boolean,
  onChunk: (name: string, chunk: Uint8Array, final: boolean) => void,
  opts: StreamZipOptions = {},
): Promise<void> {
  const unzip = new Unzip();
  unzip.register(UnzipInflate); // DEFLATE entries (the usual case)
  unzip.register(UnzipPassThrough); // STORED (uncompressed) entries
  let captured: Error | null = null;
  unzip.onfile = (uf) => {
    if (!want(uf.name)) return; // not started => fflate skips its bytes
    uf.ondata = (err, chunk, final) => {
      if (captured) return;
      if (err) {
        captured = err;
        return;
      }
      try {
        onChunk(uf.name, chunk, final);
      } catch (e) {
        captured = e instanceof Error ? e : new Error(String(e));
      }
    };
    uf.start();
  };

  const size = file.size;
  for (let off = 0; off < size; off += READ_CHUNK) {
    const end = Math.min(off + READ_CHUNK, size);
    const bytes = new Uint8Array(await file.slice(off, end).arrayBuffer());
    try {
      unzip.push(bytes, end >= size);
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }
    if (captured) throw captured;
    opts.onRead?.(end);
    if (opts.shouldStop?.()) return;
  }
  if (captured) throw captured;
}

// Collect the (small) entries matched by `want` into decoded strings. A single
// entry exceeding `maxEntryBytes` (decompressed) trips the too-large guardrail —
// this is what stops a giant shared-strings table from exhausting memory.
async function readEntries(
  file: Blob,
  want: (name: string) => boolean,
  stopWhen?: (done: Set<string>) => boolean,
  onRead?: (bytesRead: number) => void,
  maxEntryBytes = Infinity,
): Promise<Map<string, string>> {
  const buffers = new Map<string, Uint8Array[]>();
  const sizes = new Map<string, number>();
  const done = new Set<string>();
  await streamZip(
    file,
    want,
    (name, chunk, final) => {
      let arr = buffers.get(name);
      if (!arr) {
        arr = [];
        buffers.set(name, arr);
      }
      if (chunk.length) {
        const size = (sizes.get(name) || 0) + chunk.length;
        if (size > maxEntryBytes) throw tooLargeError(); // abort before materialising it
        sizes.set(name, size);
        arr.push(chunk);
      }
      if (final) done.add(name);
    },
    { onRead, shouldStop: stopWhen ? () => stopWhen(done) : undefined },
  );
  const decoder = new TextDecoder("utf-8");
  const out = new Map<string, string>();
  for (const [name, chunks] of buffers) {
    let total = 0;
    for (const c of chunks) total += c.length;
    const merged = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) {
      merged.set(c, o);
      o += c.length;
    }
    out.set(name, decoder.decode(merged));
  }
  return out;
}

/* ---------------- tiny XML helpers ---------------- */
function unescapeXml(s: string): string {
  if (s.indexOf("&") < 0) return s;
  return s.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (whole, ent: string) => {
    switch (ent) {
      case "amp":
        return "&";
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "quot":
        return '"';
      case "apos":
        return "'";
      default:
        if (ent[0] === "#") {
          const code = ent[1] === "x" || ent[1] === "X" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
          return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : whole;
        }
        return whole;
    }
  });
}

function getAttr(tag: string, attr: string): string {
  const re = new RegExp("(?:^|\\s)" + attr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '\\s*=\\s*"([^"]*)"');
  const m = tag.match(re);
  return m ? unescapeXml(m[1]) : "";
}

// "C671" -> 2 (0-based column index)
function colIndexFromRef(letters: string): number {
  let n = 0;
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64); // 'A' = 65
  return n - 1;
}

/* ---------------- workbook metadata ---------------- */
function parseWorkbookXml(xml: string): { names: string[]; nameToRid: Map<string, string> } {
  const names: string[] = [];
  const nameToRid = new Map<string, string>();
  const re = /<sheet\b[^>]*\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const tag = m[0];
    const name = getAttr(tag, "name");
    if (!name) continue;
    names.push(name);
    const rid = getAttr(tag, "r:id") || getAttr(tag, "id");
    if (rid) nameToRid.set(name, rid);
  }
  return { names, nameToRid };
}

function parseRels(xml: string): Map<string, string> {
  const ridToTarget = new Map<string, string>();
  const re = /<Relationship\b[^>]*\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const tag = m[0];
    const id = getAttr(tag, "Id");
    const target = getAttr(tag, "Target");
    if (id && target) ridToTarget.set(id, target);
  }
  return ridToTarget;
}

// rels Targets are relative to the xl/ directory (the .rels lives in xl/_rels/).
function resolveXlPath(target: string): string {
  const t = target.replace(/^\.\//, "");
  return t.startsWith("/") ? t.slice(1) : "xl/" + t;
}

/* ---------------- shared strings (streamed) ----------------
   The shared-strings table can be the single largest part of a big workbook, so
   we never decode it into one giant string and re-scan it. Instead we pull one
   <si> element at a time out of a small rolling buffer as decompressed chunks
   arrive, append the resolved string to the result array, and drop the consumed
   prefix. Peak transient memory is therefore one chunk + one partial <si> on top
   of the result array — not three full copies of the table (merged bytes + decoded
   string + parsed array) as a batch decode would hold. Output is identical to a
   single-shot parse of the whole entry. */
function createSharedStringsParser() {
  const out: string[] = [];
  let buffer = "";
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g;
  const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
  const drain = () => {
    siRe.lastIndex = 0;
    let consumed = 0;
    let m: RegExpExecArray | null;
    while ((m = siRe.exec(buffer))) {
      consumed = siRe.lastIndex;
      const inner = m[1];
      if (inner === undefined) {
        out.push(""); // <si/>
        continue;
      }
      let text = "";
      tRe.lastIndex = 0;
      let tm: RegExpExecArray | null;
      while ((tm = tRe.exec(inner))) text += tm[1];
      out.push(unescapeXml(text));
    }
    // Slice off everything up to the last complete <si> (this also discards the
    // leading <?xml…?><sst…> preamble); only a partial trailing <si> is carried
    // forward into the next chunk.
    if (consumed > 0) buffer = buffer.slice(consumed);
  };
  return {
    push(text: string) {
      buffer += text;
      drain();
    },
    result(): string[] {
      return out;
    },
  };
}

// Merge decompressed chunks of a small entry and decode them in one shot. Used
// only for the tiny workbook.xml / workbook.xml.rels entries (the big
// shared-strings entry is streamed, never merged — see createSharedStringsParser).
function decodeChunks(chunks: Uint8Array[]): string {
  let total = 0;
  for (const c of chunks) total += c.length;
  const merged = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    merged.set(c, o);
    o += c.length;
  }
  return new TextDecoder("utf-8").decode(merged);
}

/* ---------------- cell parsing ---------------- */
function cellText(attrs: string, inner: string, strings: string[]): string {
  const tM = /(?:^|\s)t="([^"]+)"/.exec(attrs);
  const t = tM ? tM[1] : "";
  if (t === "s") {
    const vM = /<v>([\s\S]*?)<\/v>/.exec(inner);
    if (!vM) return "";
    const idx = parseInt(vM[1], 10);
    return Number.isFinite(idx) ? strings[idx] ?? "" : "";
  }
  if (t === "inlineStr") {
    let text = "";
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let tm: RegExpExecArray | null;
    while ((tm = tRe.exec(inner))) text += tm[1];
    return unescapeXml(text);
  }
  // numeric / boolean / formula-string / date -> raw <v>
  const vM = /<v>([\s\S]*?)<\/v>/.exec(inner);
  return vM ? unescapeXml(vM[1]) : "";
}

// Parse the cells of one <row>. When `wantA`/`wantB` are given only those two
// columns are resolved (the hot path for data rows); otherwise every cell is
// resolved (used once, to locate the header columns).
function parseCells(rowXml: string, strings: string[], wantA = -1, wantB = -1): Map<number, string> {
  const out = new Map<number, string>();
  const onlyTwo = wantA >= 0 || wantB >= 0;
  const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let m: RegExpExecArray | null;
  // Cells normally carry an r="B1" reference giving their absolute column. Some
  // exporters omit it, so fall back to positional order (the running column),
  // resyncing whenever an explicit reference does appear. Without this, a header
  // whose cells lack r="" parsed to an empty map — the "Columns found: 0" bug.
  let autoCol = 0;
  while ((m = cellRe.exec(rowXml))) {
    const attrs = m[1];
    const inner = m[2];
    const refM = /(?:^|\s)r="([A-Z]+)\d+"/.exec(attrs);
    const col = refM ? colIndexFromRef(refM[1]) : autoCol;
    autoCol = col + 1;
    if (onlyTwo && col !== wantA && col !== wantB) continue;
    out.set(col, inner === undefined ? "" : cellText(attrs, inner, strings));
  }
  return out;
}

// Expand a row's cells into a dense array indexed by column position, so a header
// row with a leading unnamed/index column (no A cell) lines up as ["", ...labels].
function denseRow(rowXml: string, strings: string[]): string[] {
  const cells = parseCells(rowXml, strings);
  let maxCol = -1;
  for (const k of cells.keys()) if (k > maxCol) maxCol = k;
  const dense: string[] = new Array(maxCol + 1).fill("");
  for (const [k, v] of cells) dense[k] = v;
  return dense;
}

/* ---------------- workbook metadata (shared by every reader) ---------------- */
interface WorkbookMeta {
  names: string[];
  nameToRid: Map<string, string>;
  ridToTarget: Map<string, string>;
  sharedStrings: string[];
}

// Read the small metadata entries (workbook.xml, its rels) and STREAM-parse the
// shared-strings table — never a sheet — in a single pass over the zip. Shared by
// the sheet-name lister, the header scanner and the full streaming parser so they
// agree on names/paths/strings. The shared strings are parsed incrementally (one
// <si> at a time) so the table is never held as one giant string; the byte cap and
// the memory probe abort to the CSV-fallback banner before the heap is exhausted.
async function readWorkbookMeta(
  file: Blob,
  onRead?: (bytesRead: number) => void,
  maxMetaBytes: number = DEFAULT_LIMITS.maxMetaBytes,
  probe: MemoryProbe = defaultMemoryProbe,
): Promise<WorkbookMeta> {
  const wbChunks: Uint8Array[] = [];
  const relsChunks: Uint8Array[] = [];
  let wbBytes = 0;
  let relsBytes = 0;
  const ss = createSharedStringsParser();
  let ssBytes = 0;
  const ssDecoder = new TextDecoder("utf-8");

  await streamZip(
    file,
    (n) => n === WORKBOOK_PATH || n === WORKBOOK_RELS_PATH || SHARED_STRINGS_RE.test(n),
    (name, chunk, final) => {
      if (name === WORKBOOK_PATH) {
        if (chunk.length) {
          wbBytes += chunk.length;
          if (wbBytes > maxMetaBytes) throw tooLargeError();
          wbChunks.push(chunk);
        }
        return;
      }
      if (name === WORKBOOK_RELS_PATH) {
        if (chunk.length) {
          relsBytes += chunk.length;
          if (relsBytes > maxMetaBytes) throw tooLargeError();
          relsChunks.push(chunk);
        }
        return;
      }
      // shared strings — stream-parse <si> out of a rolling buffer
      if (chunk.length) {
        ssBytes += chunk.length;
        if (ssBytes > maxMetaBytes) throw tooLargeError(); // abort before the array runs past the ceiling
        assertMemoryOk(probe); // …or before the tab is genuinely out of memory
      }
      ss.push(ssDecoder.decode(chunk, { stream: !final }));
    },
    { onRead },
  );

  const wbXml = decodeChunks(wbChunks);
  const relsXml = decodeChunks(relsChunks);
  if (!wbXml || !relsXml) throw new Error("This file is not a readable .xlsx workbook.");
  const { names, nameToRid } = parseWorkbookXml(wbXml);
  const ridToTarget = parseRels(relsXml);
  return { names, nameToRid, ridToTarget, sharedStrings: ss.result() };
}

// Resolve a sheet name to its decompressed entry path via the workbook rels.
function sheetPathFor(meta: WorkbookMeta, sheetName: string): string | undefined {
  const rid = meta.nameToRid.get(sheetName);
  const target = rid ? meta.ridToTarget.get(rid) : undefined;
  return target ? resolveXlPath(target) : undefined;
}

// Stream just the first non-blank row of one sheet (the header), stopping the
// moment it is parsed — every other entry is skipped without being inflated and
// the target sheet is inflated only up to its header, so this stays cheap even on
// a multi-hundred-MB workbook.
async function readFirstRow(file: Blob, sheetPath: string, sharedStrings: string[]): Promise<string[]> {
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let header: string[] | null = null;
  const rowRe = /<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g;
  const scan = () => {
    rowRe.lastIndex = 0;
    let consumed = 0;
    let m: RegExpExecArray | null;
    while ((m = rowRe.exec(buffer))) {
      consumed = rowRe.lastIndex;
      const body = m[1];
      const nonBlank = body !== undefined && (body.indexOf("<v>") >= 0 || body.indexOf("<is>") >= 0);
      if (nonBlank) {
        header = denseRow(m[0], sharedStrings);
        return;
      }
    }
    if (consumed > 0) buffer = buffer.slice(consumed);
  };
  await streamZip(
    file,
    (n) => n === sheetPath,
    (_name, chunk, final) => {
      if (header !== null) return;
      buffer += decoder.decode(chunk, { stream: !final });
      scan();
    },
    { shouldStop: () => header !== null },
  );
  return header ?? [];
}

/* ---------------- public API ---------------- */
export async function readSheetNamesStream(file: Blob): Promise<{ names: string[] }> {
  const entries = await readEntries(file, (n) => n === WORKBOOK_PATH, (done) => done.has(WORKBOOK_PATH));
  const wbXml = entries.get(WORKBOOK_PATH);
  if (!wbXml) throw new Error("This file is not a readable .xlsx workbook.");
  const { names } = parseWorkbookXml(wbXml);
  if (!names.length) throw new Error("This workbook has no sheets.");
  return { names };
}

// Read the header row of every sheet, in workbook order. Used to locate the
// contact sheet by its columns when a name match is unavailable.
export async function readSheetHeadersStream(file: Blob, limits?: Partial<StreamLimits>): Promise<SheetHeader[]> {
  const meta = await readWorkbookMeta(file, undefined, resolveLimits(limits).maxMetaBytes);
  const out: SheetHeader[] = [];
  for (const name of meta.names) {
    const path = sheetPathFor(meta, name);
    out.push({ name, header: path ? await readFirstRow(file, path, meta.sharedStrings) : [] });
  }
  return out;
}

/**
 * Decide which sheet to parse, the SAME way for the Trusted Domains page and the
 * wizard upload (both go through the worker → here). An explicit `override` (the
 * user's sheet pick) always wins. Otherwise:
 *   1. prefer a sheet named like "unauthorised_contacts" (cheap — no header read);
 *   2. a single-sheet workbook is parsed as-is (the email-scan fallback still
 *      applies inside parseWorkbookStream);
 *   3. otherwise inspect every sheet's header and pick the one carrying the real
 *      required pair (contact_ad + contact_type), never the breaches sheet's
 *      recipient_ads decoy.
 * When several sheets exist and none qualifies, raise the friendly banner listing
 * the sheets found and the best-guess sheet's headers, rather than silently
 * scanning the wrong sheet.
 */
export async function selectSheet(
  file: Blob,
  override?: string,
  limits?: Partial<StreamLimits>,
  diag?: ParseDiagnostics,
): Promise<{ target: string; names: string[] }> {
  const { names } = await readSheetNamesStream(file);
  if (diag) {
    diag.kind = "xlsx";
    diag.sheetNames = names;
  }
  debug("xlsx:sheets", { sheetNames: names });
  if (override) {
    if (diag) diag.chosenSheet = override;
    debug("xlsx:sheet-override", { chosen: override });
    return { target: override, names };
  }
  const named = names.find(isUnauthSheetName);
  if (named) {
    if (diag) diag.chosenSheet = named;
    debug("xlsx:sheet-by-name", { chosen: named });
    return { target: named, names };
  }
  if (names.length === 1) {
    if (diag) diag.chosenSheet = names[0];
    return { target: names[0], names };
  }

  const headers = await readSheetHeadersStream(file, limits);
  // Record every sheet's header labels (structure only) so a failed multi-sheet
  // selection can report what each sheet actually contained.
  if (diag) diag.sheets = headers.map((h) => ({ name: h.name, header: headerLabels(h.header) }));
  const { chosen, bestGuess } = chooseSheetByHeaders(headers);
  if (chosen) {
    if (diag) diag.chosenSheet = chosen;
    debug("xlsx:sheet-by-headers", { chosen });
    return { target: chosen, names };
  }

  const guess = headers.find((h) => h.name === bestGuess)?.header ?? [];
  const found = guess.map((c) => String(c ?? "").trim()).filter((s) => s !== "");
  if (diag) {
    diag.chosenSheet = bestGuess || null;
    diag.headerRow = found;
  }
  debug("xlsx:no-contact-sheet", { sheetNames: names, bestGuess, headers: found });
  throw columnsNotFoundError(found, "sheet", names);
}

export interface StreamStats {
  scannedRows: number;
  maxBufferChars: number; // peak chars held in the rolling row buffer
  sheetBytes: number; // total decompressed bytes of the target sheet
  rowsExamined: number; // rows looked at, incl. the header-detection window (bounds proof)
}

export interface WorkbookStreamOptions {
  onProgress?: (p: number) => void;
  /** Live row count as the sheet streams, for "N rows processed" progress. */
  onRows?: (rows: number) => void;
  onStats?: (stats: StreamStats) => void;
  /** All sheet names in the workbook, listed in the failure banner so a user of a
   *  multi-sheet file sees every sheet that was present. */
  allSheetNames?: string[];
  /** Override the memory guardrails (defaults to DEFAULT_LIMITS). Mainly for tests
   *  that trip a cap with a small fixture. */
  limits?: Partial<StreamLimits>;
  /** Override the heap-pressure probe (defaults to performance.memory where the
   *  engine exposes it, else a no-op). Mainly for tests that simulate a tab close
   *  to its memory ceiling and assert a clean abort. */
  memoryProbe?: MemoryProbe;
  /** Privacy-safe diagnostics record to fill as the sheet streams (header labels,
   *  row/byte counts) — structure only, never a cell value. */
  diag?: ParseDiagnostics;
}

export async function parseWorkbookStream(
  file: Blob,
  sheetName: string,
  options: WorkbookStreamOptions = {},
): Promise<ParsedResult> {
  const { onProgress, onRows, onStats, allSheetNames, diag } = options;
  const limits = resolveLimits(options.limits);
  const probe = options.memoryProbe ?? defaultMemoryProbe;
  const size = file.size || 0;
  if (diag) {
    diag.kind = "xlsx";
    if (!diag.chosenSheet) diag.chosenSheet = sheetName;
  }

  // ---- pass 1: workbook metadata + streamed shared strings ----
  // The shared-strings table streams in one <si> at a time (never materialised as a
  // single string); the high byte cap and the memory probe are the last-resort OOM
  // guards — a table past the ceiling aborts to the CSV-fallback banner.
  const meta = await readWorkbookMeta(
    file,
    (read) => {
      if (size) onProgress?.(Math.min(0.49, read / (size * 2)));
    },
    limits.maxMetaBytes,
    probe,
  );
  const sheetPath = sheetPathFor(meta, sheetName);
  if (!sheetPath) throw new Error('Sheet "' + sheetName + '" could not be read.');
  const sharedStrings = meta.sharedStrings;

  // ---- pass 2: stream the target sheet row-by-row ----
  const acc = makeAccumulator();
  const resolver = createColumnResolver();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let resolved = false;
  let colType = -1;
  let colAddr = -1;
  let maxBufferChars = 0;
  let sheetBytes = 0;
  let rowsExamined = 0;
  let reported = 0;
  let lastDebugBytes = 0;
  let sheetDone = false;
  // Set when detection exhausts its scan window without finding an address column.
  // We then stop immediately instead of parsing every remaining row of a huge
  // sheet — the bound that turns a wrong-shape file's ~minute hang into an
  // instant, friendly rejection.
  let aborted = false;
  let unresolvedRows = 0; // rows examined before the columns resolved (bounded)
  const rowRe = /<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g;

  const apply = (r: ResolvedColumns) => {
    resolved = true;
    colType = r.type;
    colAddr = r.addr;
    debug("xlsx:columns", { sheet: sheetName, headers: diag?.headerRow ?? [], addr: r.addr, type: r.type });
    // Data rows the resolver buffered while detecting (only the email-scan
    // fallback buffers; an alias hit resolves on the header row with none).
    for (const row of r.replay) acc.add(colType >= 0 ? row[colType] : "", row[colAddr]);
  };

  const handleRow = (rowXml: string, body: string | undefined) => {
    rowsExamined++;
    // A row is "blank" (and never counted) unless it holds a value cell, which
    // mirrors SheetJS's blankrows:false behaviour the old path relied on.
    const nonBlank = body !== undefined && (body.indexOf("<v>") >= 0 || body.indexOf("<is>") >= 0);
    if (!resolved) {
      // Bound the header search: a malformed/huge file with no detectable header
      // must not stream unbounded (counts blank rows too, to catch a giant blank
      // prefix). A well-formed export resolves on row 1, long before this trips.
      if (++unresolvedRows > MAX_UNRESOLVED_ROWS) {
        aborted = true;
        return;
      }
      if (!nonBlank) return;
      const dense = denseRow(rowXml, sharedStrings);
      // The first non-blank row is the header row — record its labels (only).
      if (diag && diag.headerRow.length === 0) {
        const labels = headerLabels(dense);
        if (labels.length) diag.headerRow = labels;
      }
      const r = resolver.feed(dense);
      if (r) {
        apply(r);
        return;
      }
      // Detection has given up within the bounded scan window: stop now instead of
      // streaming the rest of a wrong-shape file (this is the OOM / ~59s guard).
      if (resolver.exhausted()) aborted = true;
      return;
    }
    if (!nonBlank) return; // blank data row -> not scanned
    const cells = parseCells(rowXml, sharedStrings, colAddr, colType);
    acc.add(colType >= 0 ? cells.get(colType) ?? "" : "", cells.get(colAddr) ?? "");
  };

  const feed = (text: string) => {
    if (!text || aborted) return;
    buffer += text;
    // peak resident buffer = the just-appended chunk plus any partial-row tail
    // carried over; this never grows with the row count because every complete
    // row is drained immediately below.
    if (buffer.length > maxBufferChars) maxBufferChars = buffer.length;
    rowRe.lastIndex = 0;
    let consumed = 0;
    let m: RegExpExecArray | null;
    while ((m = rowRe.exec(buffer))) {
      handleRow(m[0], m[1]);
      consumed = rowRe.lastIndex;
      if (aborted) break; // stop draining the moment detection gives up
    }
    if (consumed > 0) buffer = buffer.slice(consumed);
    // A single row larger than the cap means a malformed/pathological sheet; abort
    // before the buffer grows without bound. (After draining, `buffer` holds only
    // the still-incomplete trailing row.)
    if (buffer.length > limits.maxRowBufferChars) throw tooLargeError();
    if (onRows && rowsExamined - reported >= 2048) {
      reported = rowsExamined;
      onRows(rowsExamined);
      debug("xlsx:rows", { sheet: sheetName, rows: rowsExamined });
    }
  };

  await streamZip(
    file,
    (n) => n === sheetPath,
    (_name, chunk, final) => {
      if (aborted) return;
      assertMemoryOk(probe); // abort cleanly if the tab is near its heap ceiling — never OOM
      sheetBytes += chunk.length;
      if (diag) diag.bytesRead = sheetBytes;
      if (sheetBytes - lastDebugBytes >= 4 * 1024 * 1024) {
        lastDebugBytes = sheetBytes;
        debug("xlsx:bytes", { sheet: sheetName, sheetBytes });
      }
      feed(decoder.decode(chunk, { stream: !final }));
      if (final) sheetDone = true;
    },
    {
      onRead: (read) => {
        if (size) onProgress?.(Math.min(0.99, 0.5 + read / (size * 2)));
      },
      shouldStop: () => sheetDone || aborted,
    },
  );

  if (!resolved) {
    // finalize() succeeds only if the email-scan fallback found a column within the
    // bounded buffer; on the fail-fast abort (or a genuine miss) raise the banner.
    const r = aborted ? null : resolver.finalize();
    if (r) apply(r);
    else {
      if (diag && diag.headerRow.length === 0) diag.headerRow = resolver.foundHeaders();
      // Report the (bounded) work done even on the failure path, so callers and
      // tests can confirm only a small prefix of a wrong-shape file was ever read.
      onStats?.({ scannedRows: 0, maxBufferChars, sheetBytes, rowsExamined });
      debug("xlsx:no-columns", { sheet: sheetName, headers: diag?.headerRow ?? [], rowsExamined });
      throw columnsNotFoundError(resolver.foundHeaders(), "sheet", allSheetNames);
    }
  }
  onProgress?.(1);
  const r = acc.result();
  onRows?.(rowsExamined);
  onStats?.({ scannedRows: r.scanned, maxBufferChars, sheetBytes, rowsExamined });
  if (diag) {
    diag.rowCount = r.scanned;
    diag.bytesRead = sheetBytes;
    diag.chosenSheet = sheetName;
  }
  debug("xlsx:done", { sheet: sheetName, rows: r.scanned, sheetBytes });
  return { ...r, sheetName };
}
