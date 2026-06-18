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

// find header column indices in a row of cells (indexed by column position)
export function locateColumns(cells: unknown[]): Columns {
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

export async function parseCSV(file: Blob, onProgress?: (p: number) => void): Promise<ParsedResult> {
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

export function isCSV(file: File): boolean {
  return /\.csv$/i.test(file.name) || file.type === "text/csv";
}
