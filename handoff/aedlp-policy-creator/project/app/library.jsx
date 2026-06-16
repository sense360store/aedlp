/* ============================================================
   AEDLP Policy Creator — content library browser
   ============================================================ */
const { useState: useStateL } = React;

/* ---------- toolbar: search + type tabs + filters ---------- */
const LibraryToolbar = ({ q, setQ, type, setType, category, setCategory, region, setRegion, industry, setIndustry, counts, total }) => {
  const types = [{ id: "all", short: "All", label: "All types" }, ...AEDLP_DATA.conditionTypes];
  return (
    <div className="lib-toolbar">
      <div className="search-wrap">
        <Icon name="search" size={16} className="search-icon" />
        <input className="input search" placeholder="Search detectors, keywords, aliases…  (e.g. SSN, AWS key, salary)"
          value={q} onChange={e => setQ(e.target.value)} autoComplete="off" />
        {q && <button className="search-clear" onClick={() => setQ("")} aria-label="Clear"><Icon name="x" size={14} /></button>}
      </div>

      <div className="type-tabs">
        {types.map(t =>
          <button key={t.id} className={`type-tab ${type === t.id ? "active" : ""}`} onClick={() => setType(t.id)}>
            {t.id !== "all" && <span className={`type-dot ${typeTone(t.id)}`}></span>}
            {t.short}
            <span className="type-count">{t.id === "all" ? total : (counts[t.id] || 0)}</span>
          </button>)}
      </div>

      <div className="filter-row">
        <div className="filter-field">
          <Icon name="funnel" size={13} className="muted" />
          <select className="filter-select" value={category} onChange={e => setCategory(e.target.value)}>
            <option value="all">All categories</option>
            {AEDLP_DATA.categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="filter-field">
          <Icon name="grid" size={13} className="muted" />
          <select className="filter-select" value={region} onChange={e => setRegion(e.target.value)}>
            <option value="all">All regions</option>
            {AEDLP_DATA.regions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="filter-field">
          <Icon name="building" size={13} className="muted" />
          <select className="filter-select" value={industry} onChange={e => setIndustry(e.target.value)}>
            <option value="all">All industries</option>
            {AEDLP_DATA.industries.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>
        {(category !== "all" || region !== "all" || industry !== "all") &&
          <button className="btn xs ghost" onClick={() => { setCategory("all"); setRegion("all"); setIndustry("all"); }}>
            <Icon name="x" size={12} />Clear filters
          </button>}
      </div>
    </div>
  );
};

/* ---------- pattern / value preview per type ---------- */
const ContentPreview = ({ d }) => {
  if (d.conditionType === "regular_expression")
    return <code className="prev-code"><RegexHighlight pattern={d.regex} /></code>;
  if (d.conditionType === "keyword")
    return <div className="prev-chips">
      {d.keywords.slice(0, 6).map(k => <span key={k} className="prev-chip">{k}</span>)}
      {d.keywords.length > 6 && <span className="prev-more">+{d.keywords.length - 6}</span>}
    </div>;
  if (d.conditionType === "recipient_domain")
    return <div className="prev-chips">
      {d.domains.slice(0, 5).map(k => <span key={k} className="prev-chip mono">{k}</span>)}
      {d.domains.length > 5 && <span className="prev-more">+{d.domains.length - 5} domains</span>}
    </div>;
  if (d.conditionType === "file_extension")
    return <div className="prev-chips">
      {d.extensions.slice(0, 8).map(k => <span key={k} className="prev-chip ext">{k}</span>)}
      {d.extensions.length > 8 && <span className="prev-more">+{d.extensions.length - 8} more</span>}
    </div>;
  return <code className="prev-code pattern">{serializeKeywordPattern(d)}</code>;
};

/* ---------- expanded inspector ---------- */
const Inspector = ({ d }) => {
  return (
    <div className="inspector">
      {d.description && <p className="insp-desc">{d.description}</p>}

      {d.conditionType === "regular_expression" && <>
        <div className="insp-label">Regex pattern<CopyButton value={() => d.regex} label="Copy" /></div>
        <div className="insp-code"><RegexHighlight pattern={d.regex} /></div>
        {d.contextKeywords && d.contextKeywords.length > 0 &&
          <div className="insp-row">
            <span className="insp-k">Context keywords (combine with AND)</span>
            <div className="prev-chips">{d.contextKeywords.map(k => <span key={k} className="prev-chip">{k}</span>)}</div>
          </div>}
      </>}

      {d.conditionType === "keyword" && <>
        <div className="insp-label">Keywords — match any ({d.keywords.length})
          <CopyButton value={() => d.keywords.join("\n")} label="Copy list" /></div>
        <div className="prev-chips full">{d.keywords.map(k => <span key={k} className="prev-chip">{k}</span>)}</div>
        <div className="insp-meta-line">Match: {d.matchMode.caseInsensitive ? "case-insensitive" : "case-sensitive"} · {d.matchMode.wholeWord ? "whole word" : "partial"} · any term</div>
      </>}

      {d.conditionType === "recipient_domain" && (() => {
        const cap = 48;
        return <>
          <div className="insp-label">Recipient domains — match any ({d.domains.length})
            <CopyButton value={() => d.domains.join("\n")} label="Copy list" /></div>
          <div className="prev-chips full">
            {d.domains.slice(0, cap).map(k => <span key={k} className="prev-chip mono">{k}</span>)}
            {d.domains.length > cap && <span className="prev-more">+{d.domains.length - cap} more — copy list to see all</span>}
          </div>
          <div className="insp-meta-line">Flags a recipient address on any listed domain · case-insensitive</div>
        </>;
      })()}

      {d.conditionType === "file_extension" && <>
        <div className="insp-label">File extensions — match any ({d.extensions.length})
          <CopyButton value={() => d.extensions.join(", ")} label="Copy list" /></div>
        <div className="prev-chips full">{d.extensions.map(k => <span key={k} className="prev-chip ext">{k}</span>)}</div>
        <div className="insp-meta-line">Family: <b>{d.family}</b> · flags an attachment whose filename ends in any listed extension · case-insensitive</div>
        {d.industries && d.industries.length > 0 &&
          <div className="insp-row">
            <span className="insp-k">Industries</span>
            <div className="prev-chips">{d.industries.map(k => <span key={k} className="prev-chip">{k}</span>)}</div>
          </div>}
      </>}

      {d.conditionType === "keyword_pattern" && <>
        <div className="insp-label">Pattern expression<CopyButton value={() => serializeKeywordPattern(d)} label="Copy" /></div>
        <div className="insp-code pattern">{serializeKeywordPattern(d)}</div>
        <div className="insp-groups">
          {d.groups.map((g, i) => <div key={i} className="insp-group">
            <span className="insp-group-n">Group {i + 1}</span>
            <div className="prev-chips">{g.map(k => <span key={k} className="prev-chip">{k}</span>)}</div>
          </div>)}
        </div>
        <div className="insp-meta-line">
          Logic: <b>{d.operator}</b> across groups{d.operator === "AND" && d.proximity ? ` · within ${d.proximity} words` : ""} · OR within each group
        </div>
      </>}

      {/* examples */}
      <div className="insp-examples">
        <div className="ex-col">
          <div className="ex-head pos"><Icon name="check" size={12} />Should match</div>
          {d.positiveExamples.map((ex, i) => <div key={i} className="ex-line">{ex}</div>)}
        </div>
        {d.negativeExamples && d.negativeExamples.length > 0 &&
          <div className="ex-col">
            <div className="ex-head neg"><Icon name="x" size={12} />Should not match</div>
            {d.negativeExamples.map((ex, i) => <div key={i} className="ex-line">{ex}</div>)}
          </div>}
      </div>

      {d.notes && d.notes.length > 0 &&
        <div className="insp-notes">
          {d.notes.map((n, i) => <div key={i} className="insp-note"><Icon name="info" size={13} />{n}</div>)}
        </div>}
    </div>
  );
};

/* ---------- a single library row ---------- */
const LibraryRow = ({ d, added, onToggle, onTest }) => {
  const [open, setOpen] = useStateL(false);
  return (
    <div className={`lib-row ${open ? "open" : ""} ${added ? "added" : ""}`}>
      <div className="lib-row-main" onClick={() => setOpen(o => !o)}>
        <button className="row-caret" aria-label="Expand"><Icon name="chevron" size={14} /></button>
        <div className="row-head">
          <div className="row-title-line">
            <span className="row-name">{d.displayName}</span>
            <span className={`type-pill ${typeTone(d.conditionType)}`}>{typeShort(d.conditionType)}</span>
          </div>
          <div className="row-sub">
            <span className="row-cat">{d.category}</span>
            <span className="dot-sep">·</span>
            <span className="muted">{d.regionLabel}{d.industry ? " · " + d.industry : ""}</span>
            <span className={`risk-tag ${riskTone(d.falsePositiveRisk)}`} title="False-positive risk">FP {d.falsePositiveRisk}</span>
          </div>
          <div className="row-preview">{!open && <ContentPreview d={d} />}</div>
        </div>
        <div className="row-actions" onClick={e => e.stopPropagation()}>
          <CopyButton value={() => conditionCopyValue(d)} label="" className="icon-copy"
            icon={d.conditionType === "keyword" || d.conditionType === "recipient_domain" || d.conditionType === "file_extension" ? "list" : "copy"} />
          <button className={`btn xs ${added ? "added-btn" : "primary"}`} onClick={() => onToggle(d)}>
            <Icon name={added ? "check" : "plus"} size={13} />{added ? "Added" : "Add"}
          </button>
        </div>
      </div>
      {open && <div className="lib-row-body">
        <Inspector d={d} />
        <div className="insp-actions">
          <button className={`btn sm ${added ? "added-btn" : "primary"}`} onClick={() => onToggle(d)}>
            <Icon name={added ? "check" : "plus"} size={14} />{added ? "Added to policy" : "Add to policy"}
          </button>
          <button className="btn sm" onClick={() => onTest(d)}><Icon name="flask" size={13} />Test this</button>
          <CopyButton value={() => conditionCopyValue(d)} label={d.conditionType === "keyword" ? "Copy keywords" : d.conditionType === "keyword_pattern" ? "Copy pattern" : d.conditionType === "recipient_domain" ? "Copy domains" : d.conditionType === "file_extension" ? "Copy extensions" : "Copy regex"} />
        </div>
      </div>}
    </div>
  );
};

/* ---------- the library panel ---------- */
const LibraryPanel = ({ filters, setFilters, results, counts, total, addedIds, onToggle, onTest }) => {
  return (
    <div className="library">
      <LibraryToolbar
        q={filters.query} setQ={v => setFilters(f => ({ ...f, query: v }))}
        type={filters.type} setType={v => setFilters(f => ({ ...f, type: v }))}
        category={filters.category} setCategory={v => setFilters(f => ({ ...f, category: v }))}
        region={filters.region} setRegion={v => setFilters(f => ({ ...f, region: v }))}
        industry={filters.industry} setIndustry={v => setFilters(f => ({ ...f, industry: v }))}
        counts={counts} total={total} />

      <div className="lib-count">
        <span><b>{results.length}</b> of {total} detectors</span>
        {filters.query && <span className="muted">matching “{filters.query}”</span>}
      </div>

      <div className="lib-list">
        {results.length === 0
          ? <div className="lib-empty">
              <Icon name="search" size={26} />
              <div className="lib-empty-t">No detectors match</div>
              <div className="small muted">Try a different search term or clear the filters.</div>
            </div>
          : results.map(d =>
              <LibraryRow key={d.id} d={d} added={addedIds.has(d.id)} onToggle={onToggle} onTest={onTest} />)}
      </div>
    </div>
  );
};

Object.assign(window, { LibraryPanel });
