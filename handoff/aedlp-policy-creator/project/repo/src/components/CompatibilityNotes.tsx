import { Card, Badge, Callout } from "./ui";
import { Icon } from "./ui/Icon";
import { compatibilityNotes } from "../data/patternLibrary";
import type { Detector } from "../types";

export function CompatibilityNotes() {
  return (
    <Card title="Compatibility & support" desc="Persistent constraints for AEDLP Custom Policies.">
      <div className="note-list">
        {compatibilityNotes.map((n, i) => (
          <div key={i} className="note-item">
            <Icon name={n.icon} size={15} className="n-icon" />
            <div dangerouslySetInnerHTML={{ __html: n.text }} />
          </div>
        ))}
      </div>
    </Card>
  );
}

export function DetectorMeta({ detector }: { detector: Detector | null }) {
  if (!detector) return null;
  const c = detector.compatibility;
  const rows: [string, string][] = [
    ["Regex engine", c.regexEngine],
    ["Lookbehind", c.lookbehind],
    ["Unicode classes", c.unicodeClasses],
    ["Case-insensitive flag", c.caseInsensitiveFlag]
  ];
  return (
    <Card title="Detector metadata" desc={`${detector.displayName} · v${detector.version}`}>
      <div className="section-label">Engine compatibility (to confirm)</div>
      <div className="note-list">
        {rows.map(([k, v]) => (
          <div key={k} className="note-item" style={{ alignItems: "center" }}>
            <div className="grow"><b>{k}</b></div>
            <Badge tone={v === "supported" || v === "aedlp_confirmed" ? "ok" : v === "unsupported" ? "danger" : "warn"} dot>
              {v.replace(/_/g, " ")}
            </Badge>
          </div>
        ))}
      </div>
      <Callout tone="warn" icon="alert">
        All engine attributes are <b>unconfirmed</b> in this prototype. Verify in the AEDLP Custom Policy Tester.
      </Callout>
    </Card>
  );
}
