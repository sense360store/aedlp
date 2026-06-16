import { useState } from "react";
import { Card, Badge } from "../ui";
import { Icon } from "../ui/Icon";
import { ArchitectCopyPasteOutput } from "./ArchitectCopyPasteOutput";
import { ApiParameterPayloadOutput } from "./ApiParameterPayloadOutput";
import { TestingChecklist } from "./TestingChecklist";
import type { OutputCtx } from "../../types";

export function OutputPanel({ ctx, conditionReady }: { ctx: OutputCtx; conditionReady: boolean }) {
  const [tab, setTab] = useState<"architect" | "api" | "checklist">("architect");

  if (!conditionReady) {
    return (
      <Card title="Implementation output" desc="Copy/paste-ready values for AEDLP Architect.">
        <div className="soon-panel">
          <span className="soon-pill">Coming soon</span>
          <div style={{ fontWeight: 600, color: "var(--text-2)" }}>Output is available for regex detectors</div>
          <div className="small">Select a regular-expression detector to generate Architect copy/paste output.</div>
        </div>
      </Card>
    );
  }

  const tabs = [
    { id: "architect", label: "Architect", icon: "doc" },
    { id: "api", label: "API payload", icon: "code" },
    { id: "checklist", label: "Checklist", icon: "list" }
  ] as const;

  return (
    <Card title="Implementation output" desc="Copy/paste-ready values for AEDLP Architect."
      right={<Badge tone="info" dot>Primary</Badge>}>
      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            <Icon name={t.icon} size={14} />{t.label}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 14 }}>
        {tab === "architect" && <ArchitectCopyPasteOutput ctx={ctx} />}
        {tab === "api" && <ApiParameterPayloadOutput effectiveRegex={ctx.effectiveRegex} />}
        {tab === "checklist" && <TestingChecklist />}
      </div>
    </Card>
  );
}
