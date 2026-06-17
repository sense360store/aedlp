/* ============================================================
   AEDLP Policy Creator — full page. Library (left) drives the
   policy draft and test panel (right). Copy/paste oriented, no API.
   Name / description / tags / action auto-suggested.
   State model and wiring ported from handoff project/app/App.jsx.
   ============================================================ */
import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/ui/Icon";
import { TopNav } from "../components/ui/TopNav";
import { useTheme } from "../theme";
import { AEDLP_DATA } from "../data/library";
import { filterDetectors } from "../lib/search";
import { buildEffectiveRegex } from "../lib/regex";
import { loadTrustedDomains, makeTrustedCondition, TRUSTED_CONDITION_ID } from "../lib/trusted";
import { makeCompetitorCondition, COMPETITOR_CONDITION_ID } from "../lib/competitors";
import { suggestAction, suggestDescription, suggestName, suggestTags } from "../lib/suggest";
import { LibraryPanel, type LibraryFilters } from "../components/library/LibraryPanel";
import {
  PolicyDraft,
  type PolicyDraftState,
  type DraftSetters,
  type DraftSuggestions,
} from "../components/policy/PolicyDraft";
import { TestPanel } from "../components/policy/TestPanel";
import type { Condition, Detector, RecommendedAction } from "../types";

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
  const [operator, setOperator] = useState<string>("OR");
  const [sample, setSample] = useState("");
  const [focus, setFocus] = useState<Detector | null>(null);
  // Trusted-domain list handed over from the extractor (localStorage). Read
  // once on mount and on explicit refresh — never written from this page.
  const [trusted, setTrusted] = useState<string[]>([]);
  useEffect(() => setTrusted(loadTrustedDomains()), []);
  const [draft, setDraft] = useState<PolicyDraftState>({
    name: "",
    description: "",
    tags: [],
    action: "warn",
    scan: { body: true, subject: true, attachments: true },
    nameDirty: false,
    descDirty: false,
    tagsDirty: false,
    actionDirty: false,
  });

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

  /* ----- suggestions ----- */
  const suggestions = useMemo<DraftSuggestions>(
    () => ({
      name: suggestName(added),
      description: suggestDescription(added, draft.actionDirty ? draft.action : suggestAction(added)),
      tags: suggestTags(added),
    }),
    [added, draft.action, draft.actionDirty],
  );

  /* auto-fill non-dirty fields when the condition set changes */
  useEffect(() => {
    setDraft((d) => {
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
  const onToggle = (d: Detector) =>
    setAdded((prev) =>
      prev.some((c) => c.id === d.id) ? prev.filter((c) => c.id !== d.id) : [...prev, makeCondition(d)],
    );
  const onRemove = (id: string) => setAdded((prev) => prev.filter((c) => c.id !== id));
  const onClear = () => setAdded([]);
  const onToggleBoundary = (id: string, on: boolean) =>
    setAdded((prev) =>
      prev.map((c) =>
        c.id === id && c.conditionType === "regular_expression"
          ? { ...c, boundary: on ? "word" : "as_is", _effectiveRegex: on ? buildEffectiveRegex(c.regex, "word") : c.regex }
          : c,
      ),
    );
  const onTest = (d: Detector) => {
    setFocus(d);
    const el = document.getElementById("test-anchor");
    if (el) window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - 80, behavior: "smooth" });
  };

  /* ----- trusted-domain handoff ----- */
  const onRefreshTrusted = () => setTrusted(loadTrustedDomains());
  /* Load (or replace) the curated allow-list as a recipient-domain condition.
     A deliberate user action — the list is never injected automatically. */
  const onUseTrusted = () => {
    if (!trusted.length) return;
    const cond = makeTrustedCondition(trusted);
    setAdded((prev) =>
      prev.some((c) => c.id === TRUSTED_CONDITION_ID)
        ? prev.map((c) => (c.id === TRUSTED_CONDITION_ID ? cond : c))
        : [...prev, cond],
    );
  };

  /* ----- competitor-lookup handoff -----
     The Find-competitors surface returns reviewed, user-selected domains;
     load (or replace) them as a recipient-domain condition. Like the trusted
     handoff, this only ever runs on an explicit user action. */
  const onAddCompetitors = (domains: string[]) => {
    if (!domains.length) return;
    const cond = makeCompetitorCondition(domains);
    setAdded((prev) =>
      prev.some((c) => c.id === COMPETITOR_CONDITION_ID)
        ? prev.map((c) => (c.id === COMPETITOR_CONDITION_ID ? cond : c))
        : [...prev, cond],
    );
  };

  const set: DraftSetters = {
    name: (v) => setDraft((d) => ({ ...d, name: v, nameDirty: true })),
    description: (v) => setDraft((d) => ({ ...d, description: v, descDirty: true })),
    tags: (v) => setDraft((d) => ({ ...d, tags: v, tagsDirty: true })),
    action: (v) =>
      setDraft((d) => ({
        ...d,
        action: v as RecommendedAction,
        actionDirty: true,
        description: d.descDirty ? d.description : suggestDescription(added, v as RecommendedAction),
      })),
    scan: (k, val) => setDraft((d) => ({ ...d, scan: { ...d.scan, [k]: val } })),
    resetName: () => setDraft((d) => ({ ...d, nameDirty: false, name: suggestName(added) })),
    resetDesc: () => setDraft((d) => ({ ...d, descDirty: false, description: suggestDescription(added, d.action) })),
    resetTags: () => setDraft((d) => ({ ...d, tagsDirty: false, tags: suggestTags(added) })),
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
        <TopNav />
        <div className="topbar-spacer"></div>
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
            onAddCompetitors={onAddCompetitors}
          />
        </div>

        <div className="col-policy">
          <PolicyDraft
            draft={draft}
            set={set}
            conditions={added}
            operator={operator}
            setOperator={setOperator}
            onRemove={onRemove}
            onToggleBoundary={onToggleBoundary}
            onClear={onClear}
            suggestions={suggestions}
            trustedCount={trusted.length}
            trustedDomains={trusted}
            onUseTrusted={onUseTrusted}
            onRefreshTrusted={onRefreshTrusted}
          />
          <div id="test-anchor"></div>
          <TestPanel
            conditions={added}
            operator={operator}
            sample={sample}
            setSample={setSample}
            focus={focus}
            clearFocus={() => setFocus(null)}
          />
        </div>
      </main>
    </div>
  );
}
