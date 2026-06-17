/* Library toolbar: search, type tabs, and category/region/industry filters.
   Ported from handoff project/app/library.jsx. */
import { AEDLP_DATA } from "../../data/library";
import { Icon } from "../ui/Icon";
import { typeTone } from "../../lib/tones";

export interface LibraryToolbarProps {
  q: string;
  setQ: (v: string) => void;
  type: string;
  setType: (v: string) => void;
  category: string;
  setCategory: (v: string) => void;
  region: string;
  setRegion: (v: string) => void;
  industry: string;
  setIndustry: (v: string) => void;
  counts: Record<string, number>;
  total: number;
}

export function LibraryToolbar({
  q,
  setQ,
  type,
  setType,
  category,
  setCategory,
  region,
  setRegion,
  industry,
  setIndustry,
  counts,
  total,
}: LibraryToolbarProps) {
  const types = [{ id: "all", short: "All", label: "All types" }, ...AEDLP_DATA.conditionTypes];
  return (
    <div className="lib-toolbar">
      <div className="search-wrap">
        <Icon name="search" size={16} className="search-icon" />
        <input
          className="input search"
          placeholder="Search detectors, keywords, aliases…  (e.g. SSN, AWS key, salary)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
        />
        {q && (
          <button className="search-clear" onClick={() => setQ("")} aria-label="Clear">
            <Icon name="x" size={14} />
          </button>
        )}
      </div>

      <div className="type-tabs">
        {types.map((t) => (
          <button
            key={t.id}
            className={`type-tab ${type === t.id ? "active" : ""}`}
            onClick={() => setType(t.id)}
          >
            {t.id !== "all" && <span className={`type-dot ${typeTone(t.id)}`}></span>}
            {t.short}
            <span className="type-count">{t.id === "all" ? total : counts[t.id] || 0}</span>
          </button>
        ))}
      </div>

      <div className="filter-row">
        <div className="filter-field">
          <Icon name="funnel" size={13} className="muted" />
          <select
            className="filter-select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Filter by category"
          >
            <option value="all">All categories</option>
            {AEDLP_DATA.categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-field">
          <Icon name="grid" size={13} className="muted" />
          <select
            className="filter-select"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            aria-label="Filter by region"
          >
            <option value="all">All regions</option>
            {AEDLP_DATA.regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-field">
          <Icon name="building" size={13} className="muted" />
          <select
            className="filter-select"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            aria-label="Filter by industry"
          >
            <option value="all">All industries</option>
            {AEDLP_DATA.industries.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>
        {(category !== "all" || region !== "all" || industry !== "all") && (
          <button
            className="btn xs ghost"
            onClick={() => {
              setCategory("all");
              setRegion("all");
              setIndustry("all");
            }}
          >
            <Icon name="x" size={12} />
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
