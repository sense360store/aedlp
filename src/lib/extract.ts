/* ============================================================
   Trusted Domain Extractor — file parsing & aggregation.
   Ported from handoff project/app/extractor-parse.jsx. Handles
   .xlsx / .xls via SheetJS and a streaming fast-path for very
   large .csv exports (low memory). Everything runs in the browser;
   nothing is uploaded.
   ============================================================ */
import * as XLSX from "xlsx";

export const TARGET_SHEET = /unauth/i; // unauthorised_contacts
const COL_TYPE = ["contact_type"]; // external / freemail / ...
const COL_ADDR = ["contact_ad", "contact_address", "contact_email"];

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

interface Columns {
  type: number;
  addr: number;
}

interface AccResult {
  map: Map<string, DomainRec>;
  scanned: number;
  typeTotals: Map<string, number>;
}

interface Accumulator {
  add(type: unknown, addr: unknown): void;
  result(): AccResult;
}

function norm(s: unknown): string {
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

// find header column indices in a row of cells
function locateColumns(cells: unknown[]): Columns {
  const lc = cells.map(norm);
  const find = (names: string[]) => {
    for (const n of names) {
      const i = lc.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  return { type: find(COL_TYPE), addr: find(COL_ADDR) };
}

// accumulate rows -> Map(domain -> { types:Map(type->count), total })
function makeAccumulator(): Accumulator {
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

export async function parseCSV(file: File, onProgress?: (p: number) => void): Promise<ParsedResult> {
  const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
  const acc = makeAccumulator();
  let buf = "";
  let cols: Columns | null = null;
  let read = 0;
  const total = file.size || 0;
  const handle = (line: string) => {
    if (line === "") return;
    const cells = splitCSVLine(line);
    if (!cols) {
      const loc = locateColumns(cells);
      if (loc.type >= 0 && loc.addr >= 0) cols = loc;
      // not the header yet (or stray line) — keep scanning a few lines
      return;
    }
    acc.add(cells[cols.type], cells[cols.addr]);
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (value) {
      read += value.length;
      buf += value;
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        let line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        handle(line);
      }
      if (total) onProgress?.(Math.min(0.99, read / total));
    }
    if (done) {
      if (buf.trim()) handle(buf.replace(/\r$/, ""));
      break;
    }
  }
  if (!cols) throw new Error('Could not find "contact_type" and "contact_ad" columns in the CSV header.');
  onProgress?.(1);
  const r = acc.result();
  return { ...r, sheetName: "(csv)", sheetNames: ["(csv)"] };
}

/* ---------------- XLSX / XLS path (SheetJS) ---------------- */
export function pickSheet(names: string[], preferred?: string): string {
  if (preferred && names.includes(preferred)) return preferred;
  return names.find((n) => TARGET_SHEET.test(n)) || names[0];
}

export async function readSheetNames(file: File): Promise<{ names: string[]; buf: Uint8Array }> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: "array", bookSheets: true });
  return { names: wb.SheetNames, buf };
}

function aggregateRows(rows: unknown[][]): AccResult {
  // rows: array of arrays. find header row within first 25 rows.
  let headerIdx = -1;
  let cols: Columns | null = null;
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const loc = locateColumns(rows[i] || []);
    if (loc.type >= 0 && loc.addr >= 0) {
      headerIdx = i;
      cols = loc;
      break;
    }
  }
  if (!cols) throw new Error('Could not find "contact_type" and "contact_ad" columns in this sheet.');
  const acc = makeAccumulator();
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    acc.add(r[cols.type], r[cols.addr]);
  }
  return acc.result();
}

export async function parseWorkbook(file: File, sheetName: string, preBuf?: Uint8Array): Promise<ParsedResult> {
  const buf = preBuf || new Uint8Array(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: "array", sheets: sheetName, dense: true });
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error('Sheet "' + sheetName + '" could not be read.');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: "" });
  const r = aggregateRows(rows);
  return { ...r, sheetName };
}

export function isCSV(file: File): boolean {
  return /\.csv$/i.test(file.name) || file.type === "text/csv";
}
