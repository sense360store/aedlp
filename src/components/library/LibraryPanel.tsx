/* The detector library browser (left column of the Policy Creator).
   Ported from handoff project/app/library.jsx. */
import type { Dispatch, SetStateAction } from "react";
import { Icon } from "../ui/Icon";
import type { Detector } from "../../types";
import { LibraryToolbar } from "./LibraryToolbar";
import { LibraryRow } from "./LibraryRow";

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
  onTest: (d: Detector) => void;
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
}: LibraryPanelProps) {
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
