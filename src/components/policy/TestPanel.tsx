/* ============================================================
   Test panel (right column, lower). Runs each condition against a
   sample with browser RegExp (NOT the AEDLP production engine) and
   shows a policy verdict under the current operator.
   Ported from handoff project/app/test.jsx.
   ============================================================ */
import { useMemo, useState } from "react";
import { Icon } from "../ui/Icon";
import { Badge } from "../ui/Badge";
import { typeTone, typeShort } from "../../lib/tones";
import { runConditionTest } from "../../lib/match";
import { buildHighlightSegments } from "../../lib/regex";
import { AEDLP_DATA } from "../../data/library";
import type { Condition, Detector } from "../../types";

// The prototype tests with `{ ...c, regex: conditionCopyValue(c) }` so regex
// conditions use their boundary-wrapped effective pattern. Only regex conditions
// read `regex`, so overriding it just for that variant is behaviourally identical.
function testCondition(c: Condition): Condition {
  return c.conditionType === "regular_expression" ? { ...c, regex: c._effectiveRegex || c.regex } : c;
}

/* ---------- per-condition result ---------- */
function CondResult({ c, sample }: { c: Condition; sample: string }) {
  const [open, setOpen] = useState(false);
  const res = useMemo(() => runConditionTest(testCondition(c), sample, true), [c, sample]);
  const matched = res.ok && res.matched;
  const over = res.ok && res.count > 25;
  const segs = res.ok && res.matches && res.matches.length ? buildHighlightSegments(sample, res.matches) : null;
  const tone = !res.ok ? "danger" : matched ? (over ? "warn" : "ok") : "neutral";

  return (
    <div className={`tres ${matched ? "hit" : ""}`}>
      <div className="tres-head" onClick={() => setOpen((o) => !o)}>
        <span className={`tres-dot ${tone}`}></span>
        <div className="tres-titles">
          <span className="tres-name">{c.displayName}</span>
          <span className="tres-reason">{res.reason}</span>
        </div>
        <span className={`type-pill sm ${typeTone(c.conditionType)}`}>{typeShort(c.conditionType)}</span>
        {matched && (
          <Badge tone={over ? "warn" : "ok"} dot>
            {res.count}
          </Badge>
        )}
        {(segs || (res.matchedKeywords && res.matchedKeywords.length)) && (
          <button className="row-caret sm" aria-label="Toggle match details">
            <Icon name={open ? "chevronDown" : "chevron"} size={13} />
          </button>
        )}
      </div>
      {open && (
        <div className="tres-body">
          {over && (
            <div className="tres-warn">
              <Icon name="alert" size={12} />
              High match count — this condition may be too broad. Add context keywords or word boundaries.
            </div>
          )}
          {segs && (
            <div className="tres-highlight">
              {segs.map((s, i) => (s.mark ? <mark key={i}>{s.text}</mark> : <span key={i}>{s.text}</span>))}
            </div>
          )}
          {res.matchedKeywords && res.matchedKeywords.length > 0 && (
            <div className="match-pills">
              {res.matchedKeywords.map((m, i) => (
                <span key={i} className="match-pill">
                  {m}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export interface TestPanelProps {
  conditions: Condition[];
  operator: string;
  sample: string;
  setSample: (s: string) => void;
  focus: Detector | null;
  clearFocus: () => void;
}

export function TestPanel({ conditions, operator, sample, setSample, focus, clearFocus }: TestPanelProps) {
  const testList = useMemo<Condition[]>(() => {
    if (focus && !conditions.some((c) => c.id === focus.id)) return [{ ...focus, id: "_focus_" + focus.id }, ...conditions];
    return conditions;
  }, [focus, conditions]);

  // policy verdict across the real (added) conditions
  const verdict = useMemo(() => {
    if (!conditions.length || !sample.trim()) return null;
    const flags = conditions.map((c) => {
      const r = runConditionTest(testCondition(c), sample, true);
      return r.ok && r.matched;
    });
    const triggers = operator === "AND" ? flags.every(Boolean) : flags.some(Boolean);
    const hits = flags.filter(Boolean).length;
    return { triggers, hits, total: conditions.length };
  }, [conditions, operator, sample]);

  return (
    <div className="test-panel">
      <div className="tp-head">
        <div className="tp-title">
          <Icon name="flask" size={15} />
          Test panel
        </div>
        {verdict && (
          <Badge tone={verdict.triggers ? "ok" : "neutral"} dot>
            {verdict.triggers ? "Policy triggers" : "No trigger"} · {verdict.hits}/{verdict.total}
          </Badge>
        )}
      </div>

      <div className="tp-samples">
        <span className="muted small">Samples:</span>
        {AEDLP_DATA.sampleSnippets.map((s) => (
          <button key={s.id} className="snip-chip" onClick={() => setSample(s.text)}>
            {s.label}
          </button>
        ))}
        {sample && (
          <button className="snip-chip clear" onClick={() => setSample("")}>
            <Icon name="x" size={11} />
            Clear
          </button>
        )}
      </div>

      <textarea
        className="textarea mono tp-sample"
        rows={5}
        placeholder="Paste email body or attachment text to test against your conditions…"
        value={sample}
        onChange={(e) => setSample(e.target.value)}
      />

      {focus && !conditions.some((c) => c.id === focus.id) && (
        <div className="tp-focus-note">
          <Icon name="target" size={12} />
          Testing <b>{focus.displayName}</b> (not yet added)
          <button className="btn xs ghost" onClick={clearFocus}>
            <Icon name="x" size={11} />
            Done
          </button>
        </div>
      )}

      {testList.length === 0 ? (
        <div className="tp-empty">
          <Icon name="flask" size={22} />
          <div className="small muted">
            Add conditions, then paste a sample to see per-condition matches and whether the policy triggers.
          </div>
        </div>
      ) : !sample.trim() ? (
        <div className="tp-hint muted small">Paste a sample above or pick a built-in sample to run the test.</div>
      ) : (
        <div className="tres-list">
          {testList.map((c) => (
            <CondResult key={c.id} c={c} sample={sample} />
          ))}
        </div>
      )}
    </div>
  );
}
