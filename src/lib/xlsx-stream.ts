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
  locateColumns,
  makeAccumulator,
  type ParsedResult,
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

/* ---------------- public API ---------------- */
export async function readSheetNamesStream(file: Blob): Promise<{ names: string[] }> {
  const entries = await readEntries(file, (n) => n === WORKBOOK_PATH, (done) => done.has(WORKBOOK_PATH));
  const wbXml = entries.get(WORKBOOK_PATH);
  if (!wbXml) throw new Error("This file is not a readable .xlsx workbook.");
  const { names } = parseWorkbookXml(wbXml);
  if (!names.length) throw new Error("This workbook has no sheets.");
  return { names };
}

export interface StreamStats {
  scannedRows: number;
  maxBufferChars: number; // peak chars held in the rolling row buffer
  sheetBytes: number; // total decompressed bytes of the target sheet
}

export interface WorkbookStreamOptions {
  onProgress?: (p: number) => void;
  onStats?: (stats: StreamStats) => void;
}

export async function parseWorkbookStream(
  file: Blob,
  sheetName: string,
  options: WorkbookStreamOptions = {},
): Promise<ParsedResult> {
  const { onProgress, onStats } = options;
  const size = file.size || 0;

  // ---- pass 1: workbook metadata + shared strings (small entries only) ----
  const meta = await readEntries(
    file,
    (n) => n === WORKBOOK_PATH || n === WORKBOOK_RELS_PATH || SHARED_STRINGS_RE.test(n),
    undefined,
    (read) => {
      if (size) onProgress?.(Math.min(0.49, read / (size * 2)));
    },
  );
  const wbXml = meta.get(WORKBOOK_PATH);
  const relsXml = meta.get(WORKBOOK_RELS_PATH);
  if (!wbXml || !relsXml) throw new Error("This file is not a readable .xlsx workbook.");

  const { nameToRid } = parseWorkbookXml(wbXml);
  const ridToTarget = parseRels(relsXml);
  const rid = nameToRid.get(sheetName);
  const target = rid ? ridToTarget.get(rid) : undefined;
  if (!target) throw new Error('Sheet "' + sheetName + '" could not be read.');
  const sheetPath = resolveXlPath(target);

  let sharedStrings: string[] = [];
  for (const [name, xml] of meta) {
    if (SHARED_STRINGS_RE.test(name)) {
      sharedStrings = parseSharedStrings(xml);
      break;
    }
  }

  // ---- pass 2: stream the target sheet row-by-row ----
  const acc = makeAccumulator();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let headerFound = false;
  let headerExhausted = false;
  let colType = -1;
  let colAddr = -1;
  let headerCandidates = 0;
  let maxBufferChars = 0;
  let sheetBytes = 0;
  let sheetDone = false;
  const rowRe = /<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g;

  const handleRow = (rowXml: string, body: string | undefined) => {
    // A row is "blank" (and never counted) unless it holds a value cell, which
    // mirrors SheetJS's blankrows:false behaviour the old path relied on.
    const nonBlank = body !== undefined && (body.indexOf("<v>") >= 0 || body.indexOf("<is>") >= 0);
    if (!headerFound) {
      if (headerExhausted || !nonBlank) return;
      const cells = parseCells(rowXml, sharedStrings);
      let maxCol = -1;
      for (const k of cells.keys()) if (k > maxCol) maxCol = k;
      const dense: string[] = new Array(maxCol + 1).fill("");
      for (const [k, v] of cells) dense[k] = v;
      const loc = locateColumns(dense);
      headerCandidates++;
      if (loc.type >= 0 && loc.addr >= 0) {
        headerFound = true;
        colType = loc.type;
        colAddr = loc.addr;
      } else if (headerCandidates >= 25) {
        headerExhausted = true; // header must be within the first 25 non-blank rows
      }
      return;
    }
    if (!nonBlank) return; // blank data row -> not scanned
    const cells = parseCells(rowXml, sharedStrings, colType, colAddr);
    acc.add(cells.get(colType) ?? "", cells.get(colAddr) ?? "");
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

  if (!headerFound) {
    throw new Error('Could not find "contact_type" and "contact_ad" columns in this sheet.');
  }
  onProgress?.(1);
  const r = acc.result();
  onStats?.({ scannedRows: r.scanned, maxBufferChars, sheetBytes });
  return { ...r, sheetName };
}
