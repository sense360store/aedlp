import { Card, Badge, CopyButton, RegexHighlight } from "./ui";
import { Icon } from "./ui/Icon";
import { boundaryStrategies } from "../data/patternLibrary";
import type { BoundaryStrategy } from "../types";

export function BoundaryControls({ strategy, setStrategy, effectiveRegex }: {
  strategy: BoundaryStrategy["id"]; setStrategy: (v: BoundaryStrategy["id"]) => void; effectiveRegex: string;
}) {
  return (
    <Card step="4" title="Boundary & substring controls"
      desc="Wrappers reduce accidental substring matches inside URLs or long IDs.">
      <div className="check-list">
        {boundaryStrategies.map((s) => {
          const sel = strategy === s.id;
          return (
            <button key={s.id} className="alt-item"
              style={sel ? { borderColor: "var(--accent)", background: "var(--accent-weak)" } : undefined}
              onClick={() => setStrategy(s.id)}>
              <span className="check-box"
                style={sel ? { background: "var(--accent)", borderColor: "var(--accent)", color: "#fff" } : undefined}>
                {sel && <Icon name="check" size={12} />}
              </span>
              <div className="grow">
                <div className="alt-name">{s.label}</div>
                <div className="alt-meta">{s.desc}</div>
              </div>
              {(s.prefix || s.suffix)
                ? <Badge mono>{s.prefix || "…"} {s.suffix || "…"}</Badge>
                : <Badge mono>raw</Badge>}
            </button>
          );
        })}
      </div>

      <div className="section-label" style={{ marginTop: 16 }}>Effective regex preview</div>
      <div className="effective-regex"><RegexHighlight pattern={effectiveRegex} /></div>
      <div className="row between" style={{ marginTop: 8 }}>
        <span className="hint">This is the pattern used for testing and copy/paste output.</span>
        <CopyButton value={() => effectiveRegex} label="Copy effective" />
      </div>
    </Card>
  );
}
