/* ============================================================
   Parsing Web Worker. All file parsing — both .csv and .xlsx — runs
   here, off the main thread, so the heavy work has its own memory
   budget and a failure surfaces as an error message instead of taking
   down the browser tab.

   It reports progress and posts back either the aggregated result (the
   domain -> {types,total} map plus rows scanned and per-type totals),
   a request for the UI to pick a sheet, or an error.
   ============================================================ */
import { isCSV, parseCSV, pickSheet, TARGET_SHEET, type ParsedResult } from "./extract";
import { parseWorkbookStream, readSheetNamesStream } from "./xlsx-stream";
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
    if (isCSV(file)) {
      result = await parseCSV(file, (p) => post({ kind: "progress", p }));
    } else {
      const { names } = await readSheetNamesStream(file);
      const target = req.sheetName || pickSheet(names);
      // No obvious target sheet and more than one to choose from -> ask the UI.
      if (!req.sheetName && names.length > 1 && !TARGET_SHEET.test(target)) {
        post({ kind: "sheet", names });
        return;
      }
      result = await parseWorkbookStream(file, target, {
        onProgress: (p) => post({ kind: "progress", p }),
      });
    }
    post({ kind: "result", result });
  } catch (err) {
    post({ kind: "error", message: (err as Error)?.message || String(err) });
  }
};
