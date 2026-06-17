/* ============================================================
   Legacy SheetJS workbook reader — the implementation that the
   streaming reader (xlsx-stream.ts) replaced. It is intentionally
   NOT imported by the app or the worker (so SheetJS stays out of the
   production bundle); it exists only so the test-suite can prove the
   streaming reader is byte-for-byte equivalent to the old path on the
   sample enforcer export.
   ============================================================ */
import * as XLSX from "xlsx";
import { locateColumns, makeAccumulator, type AccResult, type Columns, type ParsedResult } from "./extract";

export async function readSheetNamesLegacy(file: Blob): Promise<{ names: string[]; buf: Uint8Array }> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: "array", bookSheets: true });
  return { names: wb.SheetNames, buf };
}

function aggregateRows(rows: unknown[][]): AccResult {
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

export async function parseWorkbookLegacy(file: Blob, sheetName: string, preBuf?: Uint8Array): Promise<ParsedResult> {
  const buf = preBuf || new Uint8Array(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: "array", sheets: sheetName, dense: true });
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error('Sheet "' + sheetName + '" could not be read.');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: "" });
  const r = aggregateRows(rows);
  return { ...r, sheetName };
}
