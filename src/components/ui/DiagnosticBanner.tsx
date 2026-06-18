/* ============================================================
   Failure banner for the file parser, shared by the Trusted Domains page
   and the wizard upload so both report a parse failure the same way.

   It shows ONLY what the parser structurally saw — file name + size,
   sheet names, the chosen sheet's header row, the row count and the
   specific reason it stopped — never a cell value or email address (the
   data is customer contacts and nothing is uploaded).

   The "Download diagnostic" button generates the report IN THE BROWSER
   (Blob + object URL) and triggers a local download the user can choose
   to send. Its contents are structure-only too (see formatDiagnosticReport).
   ============================================================ */
import { Icon } from "./Icon";
import {
  diagnosticFileName,
  formatDiagnosticReport,
  stopReasonLabel,
  type ParseDiagnostics,
} from "../../lib/diagnostics";

function fmtBytes(n: number): string {
  if (!n) return "";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return v.toFixed(v < 10 && i > 0 ? 1 : 0) + " " + u[i];
}

// Generate the diagnostic file in the browser and trigger a local download.
// Nothing leaves the machine — it is a Blob + object URL the user saves.
function downloadDiagnostic(diag: ParseDiagnostics) {
  const blob = new Blob([formatDiagnosticReport(diag)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = diagnosticFileName(diag);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function DiagnosticBanner({ diagnostics }: { diagnostics: ParseDiagnostics }) {
  const d = diagnostics;
  const sizePart = d.fileSize ? ` · ${fmtBytes(d.fileSize)}` : "";
  return (
    <div className="diag-banner" role="alert">
      <div className="diag-head">
        <Icon name="alert" size={16} className="diag-icon" />
        <span className="diag-title">Couldn’t read that file</span>
      </div>
      {d.errorMessage && <div className="diag-msg">{d.errorMessage}</div>}
      <dl className="diag-grid">
        <dt>File</dt>
        <dd className="mono">
          {(d.fileName || "(unknown)") + sizePart}
        </dd>
        {d.stopReason && (
          <>
            <dt>Reason</dt>
            <dd>{stopReasonLabel(d.stopReason)}</dd>
          </>
        )}
        {d.sheetNames.length > 0 && (
          <>
            <dt>Sheets</dt>
            <dd className="mono">{d.sheetNames.join(", ")}</dd>
          </>
        )}
        {d.chosenSheet && (
          <>
            <dt>Sheet read</dt>
            <dd className="mono">{d.chosenSheet}</dd>
          </>
        )}
        {d.headerRow.length > 0 && (
          <>
            <dt>Header row</dt>
            <dd className="mono">{d.headerRow.join(", ")}</dd>
          </>
        )}
        {d.rowCount != null && (
          <>
            <dt>Rows scanned</dt>
            <dd>{d.rowCount.toLocaleString()}</dd>
          </>
        )}
      </dl>
      <div className="diag-actions">
        <button className="btn sm" onClick={() => downloadDiagnostic(d)}>
          <Icon name="download" size={13} />
          Download diagnostic
        </button>
        <span className="diag-note">
          Saved locally — contains no contact data (headers &amp; counts only). Nothing is uploaded.
        </span>
      </div>
    </div>
  );
}
