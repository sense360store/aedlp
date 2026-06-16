/* ============================================================
   AEDLP Policy Creator — app shell + state
   Library (left) → Policy draft + Test (right). Copy/paste oriented;
   no API/connector. Name / description / tags / action auto-suggested.
   ============================================================ */
const { useState: useS, useEffect: useE, useMemo, useRef: useR } = React;

function useTheme() {
  const [theme, setTheme] = useS(() => localStorage.getItem("aedlp-theme") || "light");
  useE(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("aedlp-theme", theme);
  }, [theme]);
  return [theme, setTheme];
}

function makeCondition(d) {
  const c = { ...d };
  if (d.conditionType === "regular_expression") { c.boundary = "as_is"; c._effectiveRegex = d.regex; }
  return c;
}

function App() {
  const D = AEDLP_DATA;
  const [theme, setTheme] = useTheme();

  const [filters, setFilters] = useS({ query: "", type: "all", category: "all", region: "all", industry: "all" });
  const [added, setAdded] = useS([]);
  const [operator, setOperator] = useS("OR");
  const [sample, setSample] = useS("");
  const [focus, setFocus] = useS(null);

  const [draft, setDraft] = useS({
    name: "", description: "", tags: [], action: "warn",
    scan: { body: true, subject: true, attachments: true },
    nameDirty: false, descDirty: false, tagsDirty: false, actionDirty: false
  });

  /* ----- library filtering ----- */
  const base = useMemo(() => filterDetectors(D.detectors, { ...filters, type: "all" }),
    [filters.query, filters.category, filters.region, filters.industry, D.detectors]);
  const results = useMemo(() =>
    filters.type === "all" ? base : base.filter(d => d.conditionType === filters.type),
    [base, filters.type]);
  const typeCounts = useMemo(() => {
    const c = {}; base.forEach(d => c[d.conditionType] = (c[d.conditionType] || 0) + 1); return c;
  }, [base]);
  const addedIds = useMemo(() => new Set(added.map(c => c.id)), [added]);

  /* ----- suggestions ----- */
  const suggestions = useMemo(() => ({
    name: suggestName(added),
    description: suggestDescription(added, draft.actionDirty ? draft.action : suggestAction(added)),
    tags: suggestTags(added)
  }), [added, draft.action, draft.actionDirty]);

  /* auto-fill non-dirty fields when the condition set changes */
  useE(() => {
    setDraft(d => {
      const next = { ...d };
      const sa = suggestAction(added);
      if (!d.actionDirty) next.action = sa;
      if (!d.nameDirty) next.name = suggestName(added);
      if (!d.tagsDirty) next.tags = suggestTags(added);
      if (!d.descDirty) next.description = suggestDescription(added, next.action);
      return next;
    });
  }, [added]);

  /* ----- mutators ----- */
  const onToggle = (d) => {
    setAdded(prev => prev.some(c => c.id === d.id)
      ? prev.filter(c => c.id !== d.id)
      : [...prev, makeCondition(d)]);
  };
  const onRemove = (id) => setAdded(prev => prev.filter(c => c.id !== id));
  const onClear = () => setAdded([]);
  const onToggleBoundary = (id, on) => setAdded(prev => prev.map(c =>
    c.id === id ? { ...c, boundary: on ? "word" : "as_is", _effectiveRegex: on ? buildEffectiveRegex(c.regex, "word") : c.regex } : c));
  const onTest = (d) => { setFocus(d); const el = document.getElementById("test-anchor"); if (el) window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - 80, behavior: "smooth" }); };

  const set = {
    name: v => setDraft(d => ({ ...d, name: v, nameDirty: true })),
    description: v => setDraft(d => ({ ...d, description: v, descDirty: true })),
    tags: v => setDraft(d => ({ ...d, tags: v, tagsDirty: true })),
    action: v => setDraft(d => ({ ...d, action: v, actionDirty: true, description: d.descDirty ? d.description : suggestDescription(added, v) })),
    scan: (k, val) => setDraft(d => ({ ...d, scan: { ...d.scan, [k]: val } })),
    resetName: () => setDraft(d => ({ ...d, nameDirty: false, name: suggestName(added) })),
    resetDesc: () => setDraft(d => ({ ...d, descDirty: false, description: suggestDescription(added, d.action) })),
    resetTags: () => setDraft(d => ({ ...d, tagsDirty: false, tags: suggestTags(added) }))
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><Icon name="shield" size={17} /></div>
          <div>
            <div className="brand-title">AEDLP Policy Creator</div>
            <div className="brand-sub">Detector library &amp; custom-policy assembler</div>
          </div>
        </div>
        <div className="topbar-spacer"></div>
        <a className="btn sm ghost" href="Trusted Domain Extractor.html" title="Extract trusted domains from an enforcer export">
          <Icon name="database" size={14} />Domain Extractor
        </a>
        <span className="added-pill"><Icon name="layers" size={13} />{added.length} in policy</span>
        <span className="topbar-tag">copy &amp; paste · no API</span>
        <button className="iconbtn" onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          title="Toggle theme" aria-label="Toggle theme">
          <Icon name={theme === "light" ? "moon" : "sun"} size={16} />
        </button>
      </header>

      <main className="main">
        <div className="col-lib">
          <LibraryPanel
            filters={filters} setFilters={setFilters}
            results={results} counts={typeCounts} total={base.length}
            addedIds={addedIds} onToggle={onToggle} onTest={onTest} />
        </div>

        <div className="col-policy">
          <PolicyDraft
            draft={draft} set={set} conditions={added}
            operator={operator} setOperator={setOperator}
            onRemove={onRemove} onToggleBoundary={onToggleBoundary} onClear={onClear}
            suggestions={suggestions} />
          <div id="test-anchor"></div>
          <TestPanel
            conditions={added} operator={operator}
            sample={sample} setSample={setSample}
            focus={focus} clearFocus={() => setFocus(null)} />
        </div>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
