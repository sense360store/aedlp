import { Card, Callout, CopyButton } from "./ui";
import { Icon } from "./ui/Icon";
import type { Detector } from "../types";

export function RegexEditor(props: {
  detector: Detector; regexDraft: string; setRegexDraft: (v: string) => void;
  onReset: () => void; dirty: boolean;
  caseInsensitive: boolean; setCaseInsensitive: (v: boolean) => void;
  valid: boolean; error: string | null; onLoadExample: (v: string) => void;
}) {
  const { detector, regexDraft, setRegexDraft, onReset, dirty,
    caseInsensitive, setCaseInsensitive, valid, error, onLoadExample } = props;
  return (
    <Card step="3" title="Regex editor" desc="Edit the curated pattern, then run tests below."
      right={<CopyButton value={() => regexDraft} label="Copy regex" />}>
      <Callout tone="warn" title="Prototype regex behavior">
        Testing here uses browser JavaScript <code>RegExp</code>. AEDLP regex-engine compatibility (flavor, lookaround,
        Unicode, limits) must be confirmed before production use.
      </Callout>

      <div className="field" style={{ marginTop: 14 }}>
        <div className="row between">
          <label className="label">Pattern</label>
          <label className="toggle">
            <input type="checkbox" checked={caseInsensitive} onChange={(e) => setCaseInsensitive(e.target.checked)} />
            <span className="track" />Case-insensitive
          </label>
        </div>
        <textarea className={`regex-editor ${valid ? "" : "invalid"}`} spellCheck={false}
          value={regexDraft} onChange={(e) => setRegexDraft(e.target.value)} rows={3} />
        {valid
          ? <div className="hint" style={{ color: "var(--ok)" }}><Icon name="check" size={12} /> Valid JavaScript regex.</div>
          : <div className="hint" style={{ color: "var(--danger)" }}><Icon name="alert" size={12} /> {error}</div>}
      </div>

      <div className="btn-row" style={{ marginTop: 12 }}>
        <button className="btn sm" onClick={onReset} disabled={!dirty}>
          <Icon name="reset" size={14} />Reset to curated pattern
        </button>
      </div>

      {detector.notes.length > 0 && (
        <>
          <div className="section-label" style={{ marginTop: 18 }}>Notes &amp; false-positive guidance</div>
          <div className="note-list">
            {detector.notes.map((n, i) => (
              <div key={i} className="note-item"><Icon name="info" size={14} className="n-icon" /><div>{n}</div></div>
            ))}
          </div>
        </>
      )}

      <div className="section-label" style={{ marginTop: 18 }}>Examples</div>
      <div className="ex-list">
        {detector.positiveExamples.map((ex, i) => (
          <div key={`p${i}`} className="ex-row pos">
            <Icon name="check" size={14} className="ex-mark" style={{ color: "var(--ok)" }} />
            <span className="ex-text">{ex}</span>
            <button className="copybtn ex-load" onClick={() => onLoadExample(ex)}>Load</button>
          </div>
        ))}
        {detector.negativeExamples.map((ex, i) => (
          <div key={`n${i}`} className="ex-row neg">
            <Icon name="x" size={14} className="ex-mark" style={{ color: "var(--danger)" }} />
            <span className="ex-text">{ex}</span>
            <button className="copybtn ex-load" onClick={() => onLoadExample(ex)}>Load</button>
          </div>
        ))}
      </div>

      <Callout tone="info" title="Performance" icon="info">
        Broad or backtracking-heavy patterns increase attachment scan time. Keep patterns specific and prefer boundary
        wrappers over over-permissive classes.
      </Callout>
    </Card>
  );
}
