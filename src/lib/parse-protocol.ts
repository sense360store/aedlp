/* ============================================================
   Message protocol shared between the UI (parseClient.ts) and the
   parsing Web Worker (parse.worker.ts). Type-only module — no runtime
   code, so importing it never pulls the worker into the main bundle.
   ============================================================ */
import type { ParsedResult } from "./extract";
import type { ParseDiagnostics } from "./diagnostics";

export interface ParseRequest {
  kind: "parse";
  file: File;
  sheetName?: string;
}

export type ParseResponse =
  | { kind: "progress"; p: number; rows?: number }
  | { kind: "sheet"; names: string[] }
  | { kind: "result"; result: ParsedResult }
  // A failure carries the privacy-safe diagnostics (structure only) so the UI
  // can show the failure banner and offer the local "Download diagnostic".
  | { kind: "error"; message: string; diagnostics: ParseDiagnostics };
