/* ============================================================
   Reviewable competitor-suggestion list — the suggest → review →
   curate UI, shared by the two surfaces that run the GenAI lookup:
   the standalone CompetitorFinder panel (Policy Creator) and the
   Customer setup wizard's competitor step.

   It is purely presentational: given the suggestions and the current
   selection it renders the count, the select-all / copy tools, the
   DNS disclaimer and one selectable row per suggestion (confidence
   chip + verified / unverified flag, never dropping unverified rows).
   Selection lives in the parent so each surface decides what "curate"
   means — the panel adds on its own button, the wizard carries the
   picks up on finish. Nothing here is ever auto-applied.
   ============================================================ */
import { Icon } from "../ui/Icon";
import { Badge } from "../ui/Badge";
import { CopyButton } from "../ui/CopyButton";
import type { CompetitorSuggestion, Confidence } from "../../lib/competitors";

const CONFIDENCE_TONE: Record<Confidence, string> = { high: "ok", medium: "warn", low: "neutral" };

export interface CompetitorResultListProps {
  /** The reviewed suggestions returned by the lookup. */
  suggestions: CompetitorSuggestion[];
  /** Currently-selected domains (owned by the parent). */
  selected: Set<string>;
  /** Replace the selection — used for both per-row toggles and select-all. */
  onSelectedChange: (next: Set<string>) => void;
  /** Optional server notes shown beneath the list. */
  notes?: string;
}

export function CompetitorResultList({ suggestions, selected, onSelectedChange, notes = "" }: CompetitorResultListProps) {
  const allDomains = suggestions.map((s) => s.domain);
  const allSelected = allDomains.length > 0 && selected.size === allDomains.length;

  const toggle = (domain: string) => {
    const next = new Set(selected);
    if (next.has(domain)) next.delete(domain);
    else next.add(domain);
    onSelectedChange(next);
  };
  const toggleAll = () => onSelectedChange(allSelected ? new Set() : new Set(allDomains));

  return (
    <>
      <div className="cf-results-head">
        <span className="section-label">
          {suggestions.length} suggestion{suggestions.length === 1 ? "" : "s"}
        </span>
        <span className="small muted">Select the domains to add</span>
      </div>
      <div className="dsl-tools">
        <button type="button" className="btn xs ghost dsl-toggle" onClick={toggleAll} aria-pressed={allSelected}>
          <Icon name={allSelected ? "x" : "check"} size={12} />
          {allSelected ? "Deselect all" : "Select all"}
        </button>
        <span className="dsl-count muted small">
          {selected.size}/{allDomains.length} selected
        </span>
        <span className="dsl-spacer" />
        <CopyButton value={() => allDomains.join("\n")} label="Copy all domains" className="dsl-copy" icon="list" />
        <CopyButton value={() => allDomains.join(", ")} label="Comma-separated" className="dsl-copy" icon="copy" />
      </div>
      <div className="cf-disclaimer small muted">
        Domains are model-suggested and DNS-checked. Confirm before use.
      </div>
      <div className="cf-results">
        {suggestions.map((s) => (
          <label key={s.domain} className={`cf-row ${selected.has(s.domain) ? "on" : ""}`}>
            <input
              type="checkbox"
              className="cf-check"
              checked={selected.has(s.domain)}
              onChange={() => toggle(s.domain)}
              aria-label={`Select ${s.name} (${s.domain})`}
            />
            <div className="cf-row-main">
              <div className="cf-row-top">
                <span className="cf-name">{s.name}</span>
                <Badge tone={CONFIDENCE_TONE[s.confidence]}>{s.confidence}</Badge>
                {s.verified ? (
                  <Badge tone="ok" dot>
                    Verified
                  </Badge>
                ) : (
                  <Badge tone="neutral" dot>
                    Unverified
                  </Badge>
                )}
              </div>
              <div className="cf-domain mono">{s.domain}</div>
              {s.rationale && <div className="cf-rationale">{s.rationale}</div>}
            </div>
          </label>
        ))}
      </div>
      {notes && <div className="cf-notes">{notes}</div>}
    </>
  );
}
