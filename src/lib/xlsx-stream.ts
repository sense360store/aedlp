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
  type ParsedResult,
  type ResolvedColumns,
  type SheetHeader,
} from "./extract";

const WORKBOOK_PATH = "xl/workbook.xml";
const WORKBOOK_RELS_PATH = "xl/_rels/workbook.xml.rels";
const SHARED_STRINGS_RE = /(^|\/)sharedStrings\.xml$/i;

// Read the source file in modest slices so we never hold the whole
// compressed file at once and so decompression output stays chunked.
const READ_CHUNK = 256 * 1024;

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

// Collect the (small) entries matched by `want` into decoded strings.
async function readEntries(
  file: Blob,
  want: (name: string) => boolean,
  stopWhen?: (done: Set<string>) => boolean,
  onRead?: (bytesRead: number) => void,
): Promise<Map<string, string>> {
  const buffers = new Map<string, Uint8Array[]>();
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
      if (chunk.length) arr.push(chunk);
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

/* ---------------- shared strings ---------------- */
function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = siRe.exec(xml))) {
    const inner = m[1];
    if (inner === undefined) {
      out.push(""); // <si/>
      continue;
    }
    let text = "";
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let tm: RegExpExecArray | null;
    while ((tm = tRe.exec(inner))) text += tm[1];
    out.push(unescapeXml(text));
  }
  return out;
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
  while ((m = cellRe.exec(rowXml))) {
    const attrs = m[1];
    const inner = m[2];
    const refM = /(?:^|\s)r="([A-Z]+)\d+"/.exec(attrs);
    if (!refM) continue;
    const col = colIndexFromRef(refM[1]);
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

// Read and parse only the small metadata entries (workbook.xml, its rels, and the
// shared strings) — never a sheet. Shared by the sheet-name lister, the header
// scanner and the full streaming parser so they agree on names/paths/strings.
async function readWorkbookMeta(file: Blob, onRead?: (bytesRead: number) => void): Promise<WorkbookMeta> {
  const meta = await readEntries(
    file,
    (n) => n === WORKBOOK_PATH || n === WORKBOOK_RELS_PATH || SHARED_STRINGS_RE.test(n),
    undefined,
    onRead,
  );
  const wbXml = meta.get(WORKBOOK_PATH);
  const relsXml = meta.get(WORKBOOK_RELS_PATH);
  if (!wbXml || !relsXml) throw new Error("This file is not a readable .xlsx workbook.");
  const { names, nameToRid } = parseWorkbookXml(wbXml);
  const ridToTarget = parseRels(relsXml);
  let sharedStrings: string[] = [];
  for (const [name, xml] of meta) {
    if (SHARED_STRINGS_RE.test(name)) {
      sharedStrings = parseSharedStrings(xml);
      break;
    }
  }
  return { names, nameToRid, ridToTarget, sharedStrings };
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
export async function readSheetHeadersStream(file: Blob): Promise<SheetHeader[]> {
  const meta = await readWorkbookMeta(file);
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
export async function selectSheet(file: Blob, override?: string): Promise<{ target: string; names: string[] }> {
  const { names } = await readSheetNamesStream(file);
  if (override) return { target: override, names };
  const named = names.find(isUnauthSheetName);
  if (named) return { target: named, names };
  if (names.length === 1) return { target: names[0], names };

  const headers = await readSheetHeadersStream(file);
  const { chosen, bestGuess } = chooseSheetByHeaders(headers);
  if (chosen) return { target: chosen, names };

  const guess = headers.find((h) => h.name === bestGuess)?.header ?? [];
  const found = guess.map((c) => String(c ?? "").trim()).filter((s) => s !== "");
  throw columnsNotFoundError(found, "sheet", names);
}

export interface StreamStats {
  scannedRows: number;
  maxBufferChars: number; // peak chars held in the rolling row buffer
  sheetBytes: number; // total decompressed bytes of the target sheet
}

export interface WorkbookStreamOptions {
  onProgress?: (p: number) => void;
  onStats?: (stats: StreamStats) => void;
  /** All sheet names in the workbook, listed in the failure banner so a user of a
   *  multi-sheet file sees every sheet that was present. */
  allSheetNames?: string[];
}

export async function parseWorkbookStream(
  file: Blob,
  sheetName: string,
  options: WorkbookStreamOptions = {},
): Promise<ParsedResult> {
  const { onProgress, onStats, allSheetNames } = options;
  const size = file.size || 0;

  // ---- pass 1: workbook metadata + shared strings (small entries only) ----
  const meta = await readWorkbookMeta(file, (read) => {
    if (size) onProgress?.(Math.min(0.49, read / (size * 2)));
  });
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
  let sheetDone = false;
  const rowRe = /<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g;

  const apply = (r: ResolvedColumns) => {
    resolved = true;
    colType = r.type;
    colAddr = r.addr;
    // Data rows the resolver buffered while detecting (only the email-scan
    // fallback buffers; an alias hit resolves on the header row with none).
    for (const row of r.replay) acc.add(colType >= 0 ? row[colType] : "", row[colAddr]);
  };

  const handleRow = (rowXml: string, body: string | undefined) => {
    // A row is "blank" (and never counted) unless it holds a value cell, which
    // mirrors SheetJS's blankrows:false behaviour the old path relied on.
    const nonBlank = body !== undefined && (body.indexOf("<v>") >= 0 || body.indexOf("<is>") >= 0);
    if (!resolved) {
      if (!nonBlank) return;
      const r = resolver.feed(denseRow(rowXml, sharedStrings));
      if (r) apply(r);
      return;
    }
    if (!nonBlank) return; // blank data row -> not scanned
    const cells = parseCells(rowXml, sharedStrings, colAddr, colType);
    acc.add(colType >= 0 ? cells.get(colType) ?? "" : "", cells.get(colAddr) ?? "");
  };

  const feed = (text: string) => {
    if (!text) return;
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
    }
    if (consumed > 0) buffer = buffer.slice(consumed);
  };

  await streamZip(
    file,
    (n) => n === sheetPath,
    (_name, chunk, final) => {
      sheetBytes += chunk.length;
      feed(decoder.decode(chunk, { stream: !final }));
      if (final) sheetDone = true;
    },
    {
      onRead: (read) => {
        if (size) onProgress?.(Math.min(0.99, 0.5 + read / (size * 2)));
      },
      shouldStop: () => sheetDone,
    },
  );

  if (!resolved) {
    const r = resolver.finalize();
    if (r) apply(r);
    else throw columnsNotFoundError(resolver.foundHeaders(), "sheet", allSheetNames);
  }
  onProgress?.(1);
  const r = acc.result();
  onStats?.({ scannedRows: r.scanned, maxBufferChars, sheetBytes });
  return { ...r, sheetName };
}
