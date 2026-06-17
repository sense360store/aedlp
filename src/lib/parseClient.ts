/* ============================================================
   Main-thread client for the parsing Web Worker. Spawns a worker per
   parse (so its heap is reclaimed when the parse finishes), forwards
   progress, and resolves with either the aggregated result or a
   request to pick a sheet. The worker is wired with Vite's worker
   support so it gets its own module bundle.
   ============================================================ */
import type { ParsedResult } from "./extract";
import type { ParseResponse } from "./parse-protocol";

export type ParseOutcome = { kind: "result"; result: ParsedResult } | { kind: "sheet"; names: string[] };

export interface ParseOptions {
  sheetName?: string;
  onProgress?: (p: number) => void;
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
          break;
        case "sheet":
          finish(() => resolve({ kind: "sheet", names: msg.names }));
          break;
        case "result":
          finish(() => resolve({ kind: "result", result: msg.result }));
          break;
        case "error":
          finish(() => reject(new Error(msg.message)));
          break;
      }
    };
    worker.onerror = (e) => finish(() => reject(new Error(e.message || "The file could not be parsed.")));
    worker.postMessage({ kind: "parse", file, sheetName: opts.sheetName });
  });
}
