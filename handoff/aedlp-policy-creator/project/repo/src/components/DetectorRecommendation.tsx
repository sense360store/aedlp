import { Card, Badge, riskTone, confTone } from "./ui";
import { Icon } from "./ui/Icon";
import { actions } from "../data/patternLibrary";
import type { Detector } from "../types";
import type { ReactNode } from "react";

function MetaCell({ k, children }: { k: string; children: ReactNode }) {
  return <div className="meta-cell"><div className="meta-key">{k}</div><div className="meta-val">{children}</div></div>;
}

export function DetectorRecommendation({ detector, alternatives, onSelectAlternative }: {
  detector: Detector | null; alternatives: Detector[]; onSelectAlternative: (id: string) => void;
}) {
  if (!detector) {
    return (
      <Card step="2" title="Recommended detector" desc="The best match from the curated library appears here.">
        <div className="detector-empty">
          <Icon name="target" size={28} />
          <div style={{ fontWeight: 600, color: "var(--text-2)" }}>No detector selected yet</div>
          <div className="small">Enter a request above — for example “UK driving licence” or “credit card”.</div>
        </div>
      </Card>
    );
  }
  const a = actions[detector.recommendedAction];
  return (
    <Card step="2" title="Recommended detector"
      desc="Prefer curated detectors. Generate new regex only when no approved detector exists."
      right={<Badge tone="info" dot>Curated</Badge>}>
      <div>
        <div className="detector-card-top">
          <div className="grow">
            <div className="detector-name">{detector.displayName}</div>
            <div className="detector-region">
              <Badge mono>{detector.country}</Badge>{detector.regionLabel} · {detector.category}
            </div>
          </div>
        </div>
        <p className="detector-desc">{detector.description}</p>

        <div className="meta-grid">
          <MetaCell k="Detection type">
            <Badge tone={detector.conditionType === "regular_expression" ? "info" : "neutral"}>
              {detector.conditionType === "regular_expression" ? "Regular expression" : detector.conditionType.replace(/_/g, " ")}
            </Badge>
          </MetaCell>
          <MetaCell k="Status">
            <Badge tone="warn">{detector.status}</Badge><span className="muted small">v{detector.version}</span>
          </MetaCell>
          <MetaCell k="Confidence"><Badge tone={confTone(detector.confidence)} dot>{detector.confidence}</Badge></MetaCell>
          <MetaCell k="False-positive risk"><Badge tone={riskTone(detector.falsePositiveRisk)} dot>{detector.falsePositiveRisk}</Badge></MetaCell>
          <MetaCell k="Recommended action"><Badge tone="info">{a.label}</Badge></MetaCell>
          <MetaCell k="Attachment scanning">
            {detector.supportsAttachmentScanning
              ? <Badge tone="ok" dot>Supported</Badge>
              : <Badge tone="danger" dot>No</Badge>}
          </MetaCell>
        </div>

        {alternatives.length > 0 && (
          <>
            <div className="section-label" style={{ marginTop: 16 }}>Other matches</div>
            <div className="alt-list">
              {alternatives.map((alt) => (
                <button key={alt.id} className="alt-item" onClick={() => onSelectAlternative(alt.id)}>
                  <Badge mono>{alt.country}</Badge>
                  <div className="grow">
                    <div className="alt-name">{alt.displayName}</div>
                    <div className="alt-meta">{alt.category}</div>
                  </div>
                  <Icon name="chevron" size={15} className="muted" />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

export function ComingSoon({ step, title, what }: { step: string; title: string; what: string }) {
  return (
    <Card step={step} title={title}>
      <div className="soon-panel">
        <span className="soon-pill">Coming soon</span>
        <div style={{ fontWeight: 600, color: "var(--text-2)" }}>{what} is on the roadmap</div>
        <div className="small">Phase one focuses on regular-expression detectors. This condition type will build on the same workflow.</div>
      </div>
    </Card>
  );
}
