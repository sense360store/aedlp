/* The detector library browser (left column of the Policy Creator).
   Ported from handoff project/app/library.jsx. */
import type { Dispatch, SetStateAction } from "react";
import { Icon } from "../ui/Icon";
import type { Detector } from "../../types";
import { LibraryToolbar } from "./LibraryToolbar";
import { LibraryRow } from "./LibraryRow";
import { CompetitorFinder } from "../competitors/CompetitorFinder";

export interface LibraryFilters {
  query: string;
  type: string;
  category: string;
  region: string;
  industry: string;
}

export interface LibraryPanelProps {
  filters: LibraryFilters;
  setFilters: Dispatch<SetStateAction<LibraryFilters>>;
  results: Detector[];
  counts: Record<string, number>;
  total: number;
  addedIds: Set<string>;
  onToggle: (d: Detector) => void;
  /** Per-row "Test this" entry point. Omitted (test panel hidden) → no button. */
  onTest?: (d: Detector) => void;
  /** Curate AI-looked-up competitor domains into a recipient-domain condition. */
  onAddCompetitors?: (domains: string[]) => void;
}

export function LibraryPanel({
  filters,
  setFilters,
  results,
  counts,
  total,
  addedIds,
  onToggle,
  onTest,
  onAddCompetitors,
}: LibraryPanelProps) {
  // The competitor lookup lives WITH the other ways to build a recipient-domain
  // list, so surface it on the Recipients view — next to the static packs.
  const showRecipientTools = onAddCompetitors && filters.type === "recipient_domain";
  return (
    <div className="library">
      <LibraryToolbar
        q={filters.query}
        setQ={(v) => setFilters((f) => ({ ...f, query: v }))}
        type={filters.type}
        setType={(v) => setFilters((f) => ({ ...f, type: v }))}
        category={filters.category}
        setCategory={(v) => setFilters((f) => ({ ...f, category: v }))}
        region={filters.region}
        setRegion={(v) => setFilters((f) => ({ ...f, region: v }))}
        industry={filters.industry}
        setIndustry={(v) => setFilters((f) => ({ ...f, industry: v }))}
        counts={counts}
        total={total}
      />

      <div className="lib-count">
        <span>
          <b>{results.length}</b> of {total} detectors
        </span>
        {filters.query && <span className="muted">matching “{filters.query}”</span>}
      </div>

      {showRecipientTools && (
        <div className="lib-recipients-bar">
          <span className="lrb-text">
            <Icon name="sparkle" size={14} />
            No pack fits? Look up a company’s competitors and curate them into a recipient-domain condition.
          </span>
          <CompetitorFinder onAdd={onAddCompetitors} triggerClassName="btn sm cf-entry" />
        </div>
      )}

      <div className="lib-list">
        {results.length === 0 ? (
          <div className="lib-empty">
            <Icon name="search" size={26} />
            <div className="lib-empty-t">No detectors match</div>
            <div className="small muted">Try a different search term or clear the filters.</div>
          </div>
        ) : (
          results.map((d) => (
            <LibraryRow key={d.id} d={d} added={addedIds.has(d.id)} onToggle={onToggle} onTest={onTest} />
          ))
        )}
      </div>
    </div>
  );
}
