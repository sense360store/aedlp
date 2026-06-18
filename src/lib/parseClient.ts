/* ============================================================
   Main-thread client for the parsing Web Worker. Spawns a worker per
   parse (so its heap is reclaimed when the parse finishes), forwards
   progress, and resolves with either the aggregated result or a
   request to pick a sheet. The worker is wired with Vite's worker
   support so it gets its own module bundle.
   ============================================================ */
import type { ParsedResult } from "./extract";
import type { ParseResponse } from "./parse-protocol";
import { baselineDiagnostics, type ParseDiagnostics } from "./diagnostics";

export type ParseOutcome = { kind: "result"; result: ParsedResult } | { kind: "sheet"; names: string[] };

/**
 * Rejection carrying the privacy-safe diagnostics (structure only) for a failed
 * parse, so the page and the wizard can render the failure banner and offer the
 * local "Download diagnostic" from the same place they already catch the error.
 */
export class ParseFailure extends Error {
  readonly diagnostics: ParseDiagnostics;
  constructor(message: string, diagnostics: ParseDiagnostics) {
    super(message);
    this.name = "ParseFailure";
    this.diagnostics = diagnostics;
  }
}

export interface ParseOptions {
  sheetName?: string;
  onProgress?: (p: number) => void;
  /** Live count of rows processed, for "N rows" streaming progress. */
  onRows?: (rows: number) => void;
}

export function parseFile(file: File, opts: ParseOptions = {}): Promise<ParseOutcome> {
  return new Promise<ParseOutcome>((resolve, reject) => {
    const worker = new Worker(new URL("./parse.worker.ts", import.meta.url), { type: "module" });
    const finish = (settle: () => void) => {
      worker.terminate();
      settle();
    };
    worker.onmessage = (e: MessageEvent<ParseResponse>) => {
      const msg = e.data;
      switch (msg.kind) {
        case "progress":
          opts.onProgress?.(msg.p);
          if (typeof msg.rows === "number") opts.onRows?.(msg.rows);
          break;
        case "sheet":
          finish(() => resolve({ kind: "sheet", names: msg.names }));
          break;
        case "result":
          finish(() => resolve({ kind: "result", result: msg.result }));
          break;
        case "error":
          finish(() => reject(new ParseFailure(msg.message, msg.diagnostics)));
          break;
      }
    };
    worker.onerror = (e) => {
      // The worker died before it could send its own diagnostics; build a
      // baseline one from the File so the banner + download still work.
      const message = e.message || "The file could not be parsed.";
      finish(() => reject(new ParseFailure(message, baselineDiagnostics(file, message))));
    };
    worker.postMessage({ kind: "parse", file, sheetName: opts.sheetName });
  });
}
