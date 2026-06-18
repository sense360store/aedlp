/* ============================================================
   Parsing Web Worker. All file parsing — both .csv and .xlsx — runs
   here, off the main thread, so the heavy work has its own memory
   budget and a failure surfaces as an error message instead of taking
   down the browser tab.

   The orchestration (sheet selection, streaming, memory guardrails, and
   privacy-safe diagnostics) lives in runParseWithDiagnostics so it can be
   tested without a Worker; this file only bridges it to postMessage. It
   reports progress (byte fraction + a live row count) and posts back
   either the aggregated result, or — on failure — the error message
   together with the structure-only diagnostics that drive the on-screen
   banner and the local "Download diagnostic".
   ============================================================ */
import { runParseWithDiagnostics } from "./parse-run";
import type { ParseRequest, ParseResponse } from "./parse-protocol";

// `self` is the worker global scope; type it minimally to avoid pulling in
// conflicting lib definitions.
const ctx = self as unknown as {
  postMessage(message: ParseResponse): void;
  onmessage: ((e: MessageEvent<ParseRequest>) => void) | null;
};

const post = (message: ParseResponse) => ctx.postMessage(message);

ctx.onmessage = async (e) => {
  const req = e.data;
  if (!req || req.kind !== "parse") return;
  // Row counts ride the same progress channel, tagged with the latest byte
  // fraction so the UI can show "N rows processed" alongside the bar.
  let lastP = 0;
  const onProgress = (p: number) => {
    lastP = p;
    post({ kind: "progress", p });
  };
  const onRows = (rows: number) => post({ kind: "progress", p: lastP, rows });
  const { result, error, diagnostics } = await runParseWithDiagnostics(req.file, req.sheetName, onProgress, onRows);
  if (result) post({ kind: "result", result });
  else post({ kind: "error", message: error || "The file could not be parsed.", diagnostics });
};
