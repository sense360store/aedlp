import { useState } from "react";
import { Card, Badge } from "./ui";
import { Icon } from "./ui/Icon";
import { runRegexTest, buildHighlightSegments } from "../lib/regex";
import type { Detector, RegexTestResult } from "../types";

export function RegexTestPanel(props: {
  effectiveRegex: string; caseInsensitive: boolean;
  sampleText: string; setSampleText: (v: string) => void;
  detector: Detector; valid: boolean;
}) {
  const { effectiveRegex, caseInsensitive, sampleText, setSampleText, detector, valid } = props;
  const [result, setResult] = useState<RegexTestResult | null>(null);
  const run = () => setResult(runRegexTest(effectiveRegex, sampleText, caseInsensitive));
  const loadPos = () => { setSampleText(detector.positiveExamples.join("\n")); setResult(null); };
  const loadNeg = () => { setSampleText(detector.negativeExamples.join("\n")); setResult(null); };

  const segs = result && result.ok ? buildHighlightSegments(sampleText, result.matches) : null;

  let status: { tone: "ok" | "warn" | "danger"; text: string; icon: string } | null = null;
  if (result) {
    if (!result.ok) status = { tone: "danger", text: "Invalid pattern: " + result.error, icon: "danger" };
    else if (result.count === 0) status = { tone: "warn", text: "No matches found.", icon: "alert" };
    else if (result.count > 25) status = { tone: "warn", text: `${result.count} matches — pattern may be too broad.`, icon: "alert" };
    else status = { tone: "ok", text: `${result.count} match${result.count > 1 ? "es" : ""} found.`, icon: "check" };
  }

  return (
    <Card step="6" title="Test panel" desc="Paste sample email or attachment text and run a client-side test.">
      <div className="field">
        <label className="label">Sample text</label>
        <textarea className="textarea mono" placeholder="Paste email body or attachment text here…"
          value={sampleText} onChange={(e) => setSampleText(e.target.value)} rows={5} />
      </div>
      <div className="btn-row" style={{ marginTop: 10 }}>
        <button className="btn primary" onClick={run} disabled={!valid}><Icon name="flask" size={14} />Run test</button>
        <button className="btn sm" onClick={loadPos}><Icon name="check" size={13} />Load positive example</button>
        <button className="btn sm" onClick={loadNeg}><Icon name="x" size={13} />Load negative example</button>
      </div>

      {result && status && (
        <div className="test-result">
          <div className="test-result-head">
            <Badge tone={status.tone} dot><Icon name={status.icon} size={12} /></Badge>
            <span className="test-status" style={{ color: `var(--${status.tone})` }}>{status.text}</span>
            <span className="grow" />
            <Badge mono>{caseInsensitive ? "gi" : "g"}</Badge>
          </div>
          {result.ok && sampleText && segs && (
            <div className="highlighted">
              {segs.map((s, i) => (s.mark ? <mark key={i}>{s.text}</mark> : <span key={i}>{s.text}</span>))}
            </div>
          )}
          {result.ok && result.count > 0 && (
            <div className="match-pills">
              {result.matches.slice(0, 30).map((m, i) => <span key={i} className="match-pill">{m.value || "∅"}</span>)}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
