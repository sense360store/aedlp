import { CopyButton } from "../ui";
import { OutField } from "./OutField";
import { actions } from "../../data/patternLibrary";
import {
  buildArchitectGuide, SCAN_LOCATIONS, OUTLOOK_NOTES, GATEWAY_NOTES, ATTACH_NOTES, TESTING_NOTES
} from "./guidance";
import type { OutputCtx, RecommendedAction } from "../../types";

export function ArchitectCopyPasteOutput({ ctx }: { ctx: OutputCtx }) {
  const full = buildArchitectGuide(ctx);
  return (
    <div>
      <div className="row between" style={{ marginBottom: 12 }}>
        <span className="hint">Primary output — paste each field into a Custom Policy in AEDLP Architect.</span>
        <CopyButton value={() => full} label="Copy full guide" big />
      </div>

      <div className="out-field">
        <div className="out-label">
          <span className="ol-name">Policy name</span>
          <CopyButton value={() => ctx.policyName} />
        </div>
        <input className="input" value={ctx.policyName} onChange={(e) => ctx.setPolicyName(e.target.value)} />
      </div>

      <OutField name="Condition type" value="Regex match" mono={false} />
      <OutField name="Regex pattern" value={ctx.baseRegex} />
      {ctx.effectiveRegex !== ctx.baseRegex && (
        <OutField name={`Regex — ${ctx.boundaryLabel}`} value={ctx.effectiveRegex} />
      )}
      <OutField name="Context keywords" value={ctx.keywords.length ? ctx.keywords.join("\n") : "(none)"} mono={false} />

      <div className="out-field">
        <div className="out-label">
          <span className="ol-name">Suggested action</span>
          <CopyButton value={() => ctx.actionLabel} />
        </div>
        <select className="select" value={ctx.action}
          onChange={(e) => ctx.setAction(e.target.value as RecommendedAction)}>
          {(Object.entries(actions) as [RecommendedAction, typeof actions[RecommendedAction]][]).map(([id, a]) => (
            <option key={id} value={id}>{a.label}{!a.gateway ? " (not supported on Gateway)" : ""}</option>
          ))}
        </select>
      </div>

      <OutField name="Suggested scan locations" value={SCAN_LOCATIONS} mono={false} />

      <details className="out-field" style={{ marginTop: 16 }}>
        <summary style={{ cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: "var(--text-2)" }}>
          Compatibility &amp; testing notes (Outlook, Gateway, attachments)
        </summary>
        <div style={{ marginTop: 10 }}>
          <OutField name="Outlook Add-in notes" value={OUTLOOK_NOTES} mono={false} />
          <OutField name="Gateway notes" value={GATEWAY_NOTES} mono={false} />
          <OutField name="Attachment scanning notes" value={ATTACH_NOTES} mono={false} />
          <OutField name="Testing notes" value={TESTING_NOTES} mono={false} />
        </div>
      </details>
    </div>
  );
}
