/* ============================================================
   Privacy-safe parse diagnostics — STRUCTURE ONLY.

   The Trusted Domain Extractor and the wizard upload parse customer
   contact exports entirely in the browser; the tool's guarantee is that
   nothing is uploaded. These diagnostics keep that promise: everything
   recorded here is structural — file/sheet names, column HEADER labels,
   row/byte counts, sizes, timings and the error message. A data-cell
   value (an email address or any contact field) is NEVER captured, so
   the on-screen failure banner and the downloadable report can be shared
   freely without leaking the very data the tool keeps local.

   Nothing in this module performs I/O or touches the network. The
   download itself is generated in the browser (see DiagnosticBanner).
   ============================================================ */

// Build-time app version / commit, injected by Vite's `define` (see
// vite.config.ts); falls back to "unknown" when the define is absent (e.g. a
// bare unit-test run). typeof keeps the reference safe when undefined.
export const APP_VERSION: string = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "unknown";

/** Why the parse stopped. "" means it succeeded. */
export type StopReason = "" | "no-email-column" | "too-large" | "unreadable" | "empty";

/** One sheet's structure: its name and its header labels (never its data). */
export interface SheetDiagnostic {
  name: string;
  header: string[];
}

/**
 * Everything the parser learned about a file, STRUCTURE ONLY. Safe to show on
 * screen and to write to a downloadable file — there are no cell values here.
 */
export interface ParseDiagnostics {
  /** ISO timestamp the parse was attempted. */
  timestamp: string;
  /** app version / commit when the build injected one, else "unknown". */
  appVersion: string;
  fileName: string;
  fileSize: number;
  kind: "csv" | "xlsx" | "unknown";
  /** every sheet name found (xlsx); ["(csv)"] for a CSV. */
  sheetNames: string[];
  /** header labels of each sheet inspected (only populated for the multi-sheet
   *  selection path); structure, never data. */
  sheets: SheetDiagnostic[];
  /** the sheet actually scanned, or null when selection never resolved. */
  chosenSheet: string | null;
  /** header labels of the chosen sheet / CSV (structure, never data). */
  headerRow: string[];
  /** rows scanned, when the parse got far enough to count them. */
  rowCount: number | null;
  /** bytes read from the target sheet (xlsx) or the CSV stream. */
  bytesRead: number | null;
  /** wall-clock parse time in ms. */
  elapsedMs: number;
  /** machine-readable reason the parse stopped; "" on success. */
  stopReason: StopReason;
  /** the human banner/error message; "" on success. */
  errorMessage: string;
}

/** The explicit promise written into every downloaded diagnostic file. */
export const NO_CONTACT_DATA_NOTE =
  "This diagnostic contains NO contact data — no email addresses and no spreadsheet " +
  "cell values, only file/sheet names, column header labels, row/byte counts, sizes, " +
  "timings and the error message. It was generated locally in your browser; nothing was uploaded.";

/** A fresh diagnostics record, with structural defaults the parser then fills. */
export function newDiagnostics(init: Partial<ParseDiagnostics> = {}): ParseDiagnostics {
  return {
    timestamp: new Date().toISOString(),
    appVersion: APP_VERSION,
    fileName: "",
    fileSize: 0,
    kind: "unknown",
    sheetNames: [],
    sheets: [],
    chosenSheet: null,
    headerRow: [],
    rowCount: null,
    bytesRead: null,
    elapsedMs: 0,
    stopReason: "",
    errorMessage: "",
    ...init,
  };
}

/**
 * Minimal diagnostics built on the UI side from the File alone, for the rare
 * case where the worker crashed before sending its own (or a test stubbed the
 * client). Still structure-only.
 */
export function baselineDiagnostics(file: { name: string; size: number } | null, message: string): ParseDiagnostics {
  const isCsv = !!file && /\.csv$/i.test(file.name);
  return newDiagnostics({
    fileName: file?.name ?? "(unknown)",
    fileSize: file?.size ?? 0,
    kind: file ? (isCsv ? "csv" : "xlsx") : "unknown",
    errorMessage: message,
    stopReason: classifyStopReason(message),
  });
}

/**
 * The diagnostics carried by a failed parse: a ParseFailure rejection carries
 * its own (read by structure, not `instanceof`, so module mocks of the parse
 * client still work); anything else falls back to a baseline built from the File.
 */
export function diagnosticsFromError(
  err: unknown,
  file: { name: string; size: number } | null,
  message: string,
): ParseDiagnostics {
  const carried = (err as { diagnostics?: ParseDiagnostics } | null | undefined)?.diagnostics;
  return carried ?? baselineDiagnostics(file, message);
}

/** The non-empty, trimmed labels of a header row — never its empty index column. */
export function headerLabels(cells: readonly unknown[]): string[] {
  return cells.map((c) => String(c ?? "").trim()).filter((s) => s !== "");
}

/** Map a parser error message to a stop reason for the banner. */
export function classifyStopReason(message: string): StopReason {
  const m = (message || "").toLowerCase();
  if (/recipient email column|email column|email-bearing column/.test(m)) return "no-email-column";
  // "very large" is the worker's CSV-fallback guardrail message (see extract.ts).
  if (/very large|too large|allocation failed|out of memory|maximum call stack|array buffer/.test(m)) return "too-large";
  // everything else that prevented a read: bad zip, no sheets, unreadable workbook.
  return "unreadable";
}

/** A short, human label for a stop reason (used by the banner). */
export function stopReasonLabel(reason: StopReason): string {
  switch (reason) {
    case "no-email-column":
      return "No email / recipient column was found";
    case "too-large":
      return "The file was too large to process in the browser";
    case "unreadable":
      return "The file could not be read";
    case "empty":
      return "No usable contacts were found";
    default:
      return "";
  }
}

const DEBUG_TAG = "[trusted-domain-parse]";

/**
 * console.debug instrumentation for the parse path. Quiet by default (debug
 * level), so it only shows when DevTools is open. STRUCTURE ONLY — callers must
 * pass headers, counts, sizes, names, indices and timings, never a cell value.
 */
export function debug(event: string, fields?: Record<string, unknown>): void {
  try {
    if (typeof console !== "undefined" && typeof console.debug === "function") {
      console.debug(DEBUG_TAG, event, fields ?? {});
    }
  } catch {
    /* no console available — never let instrumentation break a parse */
  }
}

/** A filesystem-safe name for the downloaded diagnostic. */
export function diagnosticFileName(diag: ParseDiagnostics): string {
  const stamp = (diag.timestamp || new Date().toISOString()).replace(/[:.]/g, "-");
  return `trusted-domain-diagnostic-${stamp}.json`;
}

/**
 * The downloadable report: pretty JSON of the diagnostics, prefixed with the
 * explicit no-contact-data note. Because it serialises only the ParseDiagnostics
 * structural fields, it cannot carry a cell value by construction.
 */
export function formatDiagnosticReport(diag: ParseDiagnostics): string {
  return JSON.stringify({ _note: NO_CONTACT_DATA_NOTE, ...diag }, null, 2);
}
