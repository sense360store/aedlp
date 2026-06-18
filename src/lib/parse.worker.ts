/* ============================================================
   Parsing Web Worker. All file parsing — both .csv and .xlsx — runs
   here, off the main thread, so the heavy work has its own memory
   budget and a failure surfaces as an error message instead of taking
   down the browser tab.

   For an .xlsx it locates the sheet that actually holds the contact rows
   (see selectSheet) rather than assuming the first sheet, then streams it.
   It reports progress and posts back either the aggregated result (the
   domain -> {types,total} map plus rows scanned and per-type totals) or an
   error (a friendly banner when no sheet held the contact columns).
   ============================================================ */
import { isCSV, parseCSV, type ParsedResult } from "./extract";
import { parseWorkbookStream, selectSheet } from "./xlsx-stream";
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
  const file = req.file;
  try {
    let result: ParsedResult;
    let lastP = 0;
    const onProgress = (p: number) => {
      lastP = p;
      post({ kind: "progress", p });
    };
    // Row counts ride the same progress channel, tagged with the latest byte
    // fraction so the UI can show "N rows processed" alongside the bar.
    const onRows = (rows: number) => post({ kind: "progress", p: lastP, rows });
    if (isCSV(file)) {
      result = await parseCSV(file, onProgress, onRows);
    } else {
      // Locate the sheet that actually holds the contact rows (never assume the
      // first sheet); the same selection drives the page and the wizard upload.
      const { target, names } = await selectSheet(file, req.sheetName);
      result = await parseWorkbookStream(file, target, { onProgress, onRows, allSheetNames: names });
    }
    post({ kind: "result", result });
  } catch (err) {
    post({ kind: "error", message: (err as Error)?.message || String(err) });
  }
};
