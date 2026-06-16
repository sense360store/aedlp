import { useState } from "react";
import { Badge } from "../ui";
import { Icon } from "../ui/Icon";
import { testingChecklist } from "../../data/patternLibrary";

export function TestingChecklist() {
  const [done, setDone] = useState<Record<number, boolean>>({});
  const toggle = (i: number) => setDone((d) => ({ ...d, [i]: !d[i] }));
  const count = testingChecklist.filter((_, i) => done[i]).length;
  const total = testingChecklist.length;
  return (
    <div>
      <div className="row between" style={{ marginBottom: 8 }}>
        <span className="hint">Work through before production rollout.</span>
        <Badge tone={count === total ? "ok" : "neutral"} dot>{count}/{total} done</Badge>
      </div>
      <div className="check-list">
        {testingChecklist.map((item, i) => (
          <button key={i} className={`check-item ${done[i] ? "done" : ""}`} onClick={() => toggle(i)}>
            <span className="check-box">{done[i] && <Icon name="check" size={12} />}</span>
            <span className="check-text">{item}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
