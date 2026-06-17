/* ============================================================
   AEDLP Policy Creator — page shell + library wiring.
   Topbar and library filtering mirror the prototype App.jsx.
   The policy draft and test panel (right column) arrive in Phase 4.
   ============================================================ */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/ui/Icon";
import { useTheme } from "../theme";
import { AEDLP_DATA } from "../data/library";
import { filterDetectors } from "../lib/search";
import { LibraryPanel, type LibraryFilters } from "../components/library/LibraryPanel";
import type { Condition, Detector } from "../types";

function makeCondition(d: Detector): Condition {
  if (d.conditionType === "regular_expression") {
    return { ...d, boundary: "as_is", _effectiveRegex: d.regex };
  }
  return { ...d };
}

export default function PolicyCreator() {
  const [theme, setTheme] = useTheme();

  const [filters, setFilters] = useState<LibraryFilters>({
    query: "",
    type: "all",
    category: "all",
    region: "all",
    industry: "all",
  });
  const [added, setAdded] = useState<Condition[]>([]);
  const [, setFocus] = useState<Detector | null>(null);

  /* ----- library filtering (base = filters minus type, so the tabs can count) ----- */
  const base = useMemo(
    () =>
      filterDetectors(AEDLP_DATA.detectors, {
        query: filters.query,
        type: "all",
        category: filters.category,
        region: filters.region,
        industry: filters.industry,
      }),
    [filters.query, filters.category, filters.region, filters.industry],
  );
  const results = useMemo(
    () => (filters.type === "all" ? base : base.filter((d) => d.conditionType === filters.type)),
    [base, filters.type],
  );
  const typeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    base.forEach((d) => {
      c[d.conditionType] = (c[d.conditionType] || 0) + 1;
    });
    return c;
  }, [base]);
  const addedIds = useMemo(() => new Set(added.map((c) => c.id)), [added]);

  /* ----- selection (the policy draft consumes this in Phase 4) ----- */
  const onToggle = (d: Detector) =>
    setAdded((prev) =>
      prev.some((c) => c.id === d.id) ? prev.filter((c) => c.id !== d.id) : [...prev, makeCondition(d)],
    );
  const onTest = (d: Detector) => {
    setFocus(d);
    const el = document.getElementById("test-anchor");
    if (el) window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - 80, behavior: "smooth" });
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Icon name="shield" size={17} />
          </div>
          <div>
            <div className="brand-title">AEDLP Policy Creator</div>
            <div className="brand-sub">Detector library &amp; custom-policy assembler</div>
          </div>
        </div>
        <div className="topbar-spacer"></div>
        <Link
          className="btn sm ghost"
          to="/trusted-domain-extractor"
          title="Extract trusted domains from an enforcer export"
        >
          <Icon name="database" size={14} />
          Domain Extractor
        </Link>
        <span className="added-pill">
          <Icon name="layers" size={13} />
          {added.length} in policy
        </span>
        <span className="topbar-tag">copy &amp; paste · no API</span>
        <button
          className="iconbtn"
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          title="Toggle theme"
          aria-label="Toggle theme"
        >
          <Icon name={theme === "light" ? "moon" : "sun"} size={16} />
        </button>
      </header>

      <main className="main">
        <div className="col-lib">
          <LibraryPanel
            filters={filters}
            setFilters={setFilters}
            results={results}
            counts={typeCounts}
            total={base.length}
            addedIds={addedIds}
            onToggle={onToggle}
            onTest={onTest}
          />
        </div>

        <div className="col-policy"></div>
      </main>
    </div>
  );
}
