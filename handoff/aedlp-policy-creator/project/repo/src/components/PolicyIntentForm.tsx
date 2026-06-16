import { Card } from "./ui";
import { Icon } from "./ui/Icon";
import { dataTypes, regions, detectionTypes } from "../data/patternLibrary";
import type { ConditionType } from "../types";

export function PolicyIntentForm(props: {
  query: string; setQuery: (v: string) => void;
  dataType: string | null; setDataType: (v: string | null) => void;
  region: string | null; setRegion: (v: string | null) => void;
  detectionType: ConditionType; setDetectionType: (v: ConditionType) => void;
  resultsCount: number; examples: string[]; onPickExample: (v: string) => void;
}) {
  const { query, setQuery, dataType, setDataType, region, setRegion,
    detectionType, setDetectionType, resultsCount, examples, onPickExample } = props;
  return (
    <Card step="1" title="Policy intent" desc="Describe what you want to detect. We search a curated detector library.">
      <div className="field">
        <label className="label" htmlFor="intent-q">Natural-language request</label>
        <div className="search-wrap">
          <Icon name="search" size={15} className="search-icon" />
          <input id="intent-q" className="input" placeholder="e.g. UK driving licence, US SSN, French national ID…"
            value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
        </div>
        <div className="row wrap" style={{ gap: 6, marginTop: 2 }}>
          <span className="hint">Try:</span>
          {examples.map((ex) => (
            <button key={ex} className="badge" style={{ cursor: "pointer" }} onClick={() => onPickExample(ex)}>{ex}</button>
          ))}
        </div>
        {query.trim() && (
          <div className="hint" style={{ marginTop: 2 }}>
            {resultsCount > 0
              ? `${resultsCount} matching detector${resultsCount > 1 ? "s" : ""} found.`
              : "No curated detector matched — refine the request or build a custom regex below."}
          </div>
        )}
      </div>

      <div className="divider" />

      <div className="field">
        <label className="label">Data type</label>
        <div className="chip-grid">
          {dataTypes.map((t) => (
            <button key={t} className={`chip ${dataType === t ? "sel" : ""}`}
              onClick={() => setDataType(dataType === t ? null : t)}>{t}</button>
          ))}
        </div>
      </div>

      <div className="field" style={{ marginTop: 14 }}>
        <label className="label">Region</label>
        <div className="chip-grid">
          {regions.map((r) => (
            <button key={r} className={`chip ${region === r ? "sel" : ""}`}
              onClick={() => setRegion(region === r ? null : r)}>{r}</button>
          ))}
        </div>
      </div>

      <div className="field" style={{ marginTop: 14 }}>
        <label className="label">Detection type</label>
        <div className="chip-grid">
          {detectionTypes.map((dt) => (
            <button key={dt.id} className={`chip ${detectionType === dt.id ? "sel" : ""} ${dt.ready ? "" : "disabled"}`}
              disabled={!dt.ready} onClick={() => dt.ready && setDetectionType(dt.id)}>
              {dt.label}{!dt.ready && <span className="soon">Soon</span>}
            </button>
          ))}
        </div>
        <div className="hint">Phase one fully supports <b>Regular expression</b>. Other condition types are on the roadmap.</div>
      </div>
    </Card>
  );
}
