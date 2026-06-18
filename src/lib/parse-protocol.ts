/* ============================================================
   Message protocol shared between the UI (parseClient.ts) and the
   parsing Web Worker (parse.worker.ts). Type-only module — no runtime
   code, so importing it never pulls the worker into the main bundle.
   ============================================================ */
import type { ParsedResult } from "./extract";

export interface ParseRequest {
  kind: "parse";
  file: File;
  sheetName?: string;
}

export type ParseResponse =
  | { kind: "progress"; p: number; rows?: number }
  | { kind: "sheet"; names: string[] }
  | { kind: "result"; result: ParsedResult }
  | { kind: "error"; message: string };
