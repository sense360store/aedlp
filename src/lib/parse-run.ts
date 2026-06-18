/* ============================================================
   Parse orchestration with privacy-safe diagnostics.

   This is the single place the Trusted Domains page and the wizard upload
   both go through (the Web Worker is a thin wrapper around it — see
   parse.worker.ts), so they get identical behaviour AND identical
   diagnostics. It is a plain async function with no Worker/DOM
   dependency, so it can be exercised directly in tests.

   It builds a ParseDiagnostics record (structure only — never a cell
   value), routes the file to the CSV or .xlsx reader, and returns either
   the aggregated result or the error message — always alongside the
   diagnostics gathered so far.
   ============================================================ */
import { isCSV, parseCSV, type ParsedResult } from "./extract";
import { parseWorkbookStream, selectSheet } from "./xlsx-stream";
import { classifyStopReason, debug, newDiagnostics, type ParseDiagnostics } from "./diagnostics";

export interface ParseRunOutcome {
  /** Diagnostics gathered during the attempt — present on success and failure. */
  diagnostics: ParseDiagnostics;
  /** The aggregated result, present only on success. */
  result?: ParsedResult;
  /** The error message, present only on failure. */
  error?: string;
}

// Monotonic-ish clock that degrades gracefully where performance is absent.
function now(): number {
  try {
    if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now();
  } catch {
    /* fall through */
  }
  return Date.now();
}

export async function runParseWithDiagnostics(
  file: File,
  sheetName?: string,
  onProgress?: (p: number) => void,
  onRows?: (rows: number) => void,
): Promise<ParseRunOutcome> {
  const csv = isCSV(file);
  const diag = newDiagnostics({ fileName: file.name, fileSize: file.size, kind: csv ? "csv" : "xlsx" });
  const started = now();
  debug("start", { fileName: file.name, fileSize: file.size, kind: diag.kind });
  try {
    let result: ParsedResult;
    if (csv) {
      result = await parseCSV(file, onProgress, onRows, diag);
    } else {
      // Locate the sheet that actually holds the contact rows (never assume the
      // first sheet); the same selection drives the page and the wizard upload.
      const { target, names } = await selectSheet(file, sheetName, undefined, diag);
      result = await parseWorkbookStream(file, target, { onProgress, onRows, allSheetNames: names, diag });
    }
    diag.rowCount = result.scanned;
    diag.elapsedMs = Math.round(now() - started);
    debug("done", { rows: result.scanned, sheet: diag.chosenSheet, elapsedMs: diag.elapsedMs });
    return { diagnostics: diag, result };
  } catch (e) {
    const message = (e as Error)?.message || String(e);
    diag.errorMessage = message;
    diag.stopReason = classifyStopReason(message);
    diag.elapsedMs = Math.round(now() - started);
    debug("failed", { reason: diag.stopReason, sheet: diag.chosenSheet, elapsedMs: diag.elapsedMs });
    return { diagnostics: diag, error: message };
  }
}
