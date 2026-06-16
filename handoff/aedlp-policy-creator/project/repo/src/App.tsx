import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./components/ui/Icon";
import { PolicyIntentForm } from "./components/PolicyIntentForm";
import { DetectorRecommendation, ComingSoon } from "./components/DetectorRecommendation";
import { RegexEditor } from "./components/RegexEditor";
import { BoundaryControls } from "./components/BoundaryControls";
import { ContextKeywords } from "./components/ContextKeywords";
import { RegexTestPanel } from "./components/RegexTestPanel";
import { OutputPanel } from "./components/output/OutputPanel";
import { CompatibilityNotes, DetectorMeta } from "./components/CompatibilityNotes";
import { detectors, actions, boundaryStrategies } from "./data/patternLibrary";
import { searchDetectors } from "./lib/search";
import { buildEffectiveRegex } from "./lib/regex";
import type { BoundaryStrategy, ConditionType, OutputCtx, RecommendedAction } from "./types";

/*
 * In production, the static data + handlers below map to:
 *   GET  /patterns/search   GET /patterns/:id
 *   POST /regex/test        POST /policy/recommend
 *   POST /policy/render-instructions   POST /policy/export
 *   GET  /parameters/:id    PUT /parameters/:id
 */

const STEPS = [
  { id: "step-1", n: 1, label: "Intent" },
  { id: "step-2", n: 2, label: "Detector" },
  { id: "step-3", n: 3, label: "Regex" },
  { id: "step-4", n: 4, label: "Boundaries" },
  { id: "step-5", n: 5, label: "Keywords" },
  { id: "step-6", n: 6, label: "Test" },
  { id: "step-out", n: 7, label: "Output" }
];

const EXAMPLES = ["UK driving licence", "US SSN", "credit card", "NHS number", "Zoom link"];

function useTheme(): [string, (t: string) => void] {
  const [theme, setTheme] = useState<string>(() => localStorage.getItem("aedlp-theme") || "light");
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("aedlp-theme", theme);
  }, [theme]);
  return [theme, setTheme];
}

export default function App() {
  const [theme, setTheme] = useTheme();

  // intent
  const [query, setQuery] = useState("UK driving licence");
  const [dataType, setDataType] = useState<string | null>("Government ID");
  const [region, setRegion] = useState<string | null>("United Kingdom");
  const [detectionType, setDetectionType] = useState<ConditionType>("regular_expression");

  // selection
  const matches = useMemo(() => searchDetectors(detectors, query), [query]);
  const [selectedId, setSelectedId] = useState("gb-driving-licence-number");
  const lastQuery = useRef(query);
  useEffect(() => {
    if (lastQuery.current !== query) {
      lastQuery.current = query;
      if (matches.length) setSelectedId(matches[0].id);
    }
  }, [query, matches]);

  const detector = useMemo(
    () => detectors.find((d) => d.id === selectedId) ?? matches[0] ?? null,
    [selectedId, matches]
  );
  const alternatives = useMemo(
    () => matches.filter((m) => detector && m.id !== detector.id).slice(0, 4),
    [matches, detector]
  );

  const conditionReady =
    !!detector && detector.conditionType === "regular_expression" && detectionType === "regular_expression";

  // editor state
  const [regexDraft, setRegexDraft] = useState(detector?.regex ?? "");
  const [strategy, setStrategy] = useState<BoundaryStrategy["id"]>("as_is");
  const [caseInsensitive, setCaseInsensitive] = useState(false);
  const [keywords, setKeywords] = useState<string[]>(detector?.contextKeywords ?? []);
  const [sampleText, setSampleText] = useState(detector ? detector.positiveExamples.join("\n") : "");
  const [policyName, setPolicyName] = useState(detector ? "Detect " + detector.displayName : "");
  const [action, setAction] = useState<RecommendedAction>(detector?.recommendedAction ?? "warn");

  // reset editable state when detector changes
  const lastDet = useRef<string | null>(null);
  useEffect(() => {
    if (detector && lastDet.current !== detector.id) {
      lastDet.current = detector.id;
      setRegexDraft(detector.regex ?? "");
      setKeywords(detector.contextKeywords);
      setSampleText(detector.positiveExamples.join("\n"));
      setPolicyName("Detect " + detector.displayName);
      setAction(detector.recommendedAction);
      setStrategy("as_is");
    }
  }, [detector]);

  const effectiveRegex = useMemo(() => buildEffectiveRegex(regexDraft, strategy), [regexDraft, strategy]);
  const { valid, error } = useMemo(() => {
    try { new RegExp(effectiveRegex, "g"); return { valid: true, error: null as string | null }; }
    catch (e) { return { valid: false, error: (e as Error).message }; }
  }, [effectiveRegex]);
  const dirty = !!detector && regexDraft !== (detector.regex ?? "");
  const stratLabel = boundaryStrategies.find((s) => s.id === strategy)?.label ?? "";

  const ctx: OutputCtx = {
    policyName, setPolicyName, baseRegex: regexDraft, effectiveRegex,
    boundaryLabel: stratLabel, keywords,
    action, setAction, actionLabel: actions[action].label
  };

  // scroll spy
  const [active, setActive] = useState("step-1");
  useEffect(() => {
    const onScroll = () => {
      let cur = STEPS[0].id;
      for (const s of STEPS) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= 140) cur = s.id;
      }
      setActive(cur);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const goStep = (id: string) => {
    const el = document.getElementById(id);
    if (el) window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - 120, behavior: "smooth" });
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><Icon name="shield" size={17} /></div>
          <div>
            <div className="brand-title">AEDLP Policy Creator</div>
            <div className="brand-sub">Prototype rule builder for Adaptive Email DLP Custom Policies</div>
          </div>
        </div>
        <div className="topbar-spacer" />
        <span className="topbar-tag">prototype · mock data</span>
        <button className="iconbtn" onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          title="Toggle theme" aria-label="Toggle theme">
          <Icon name={theme === "light" ? "moon" : "sun"} size={16} />
        </button>
      </header>

      <nav className="stepper">
        {STEPS.map((s, i) => (
          <span key={s.id} style={{ display: "contents" }}>
            {i > 0 && <span className="step-sep" />}
            <button className={`step ${active === s.id ? "active" : ""}`} onClick={() => goStep(s.id)}>
              <span className="step-num">{s.n}</span><span className="step-label">{s.label}</span>
            </button>
          </span>
        ))}
      </nav>

      <main className="main">
        <div className="col-left">
          <div id="step-1">
            <PolicyIntentForm
              query={query} setQuery={setQuery} dataType={dataType} setDataType={setDataType}
              region={region} setRegion={setRegion} detectionType={detectionType} setDetectionType={setDetectionType}
              resultsCount={matches.length} examples={EXAMPLES} onPickExample={setQuery} />
          </div>

          <div id="step-2">
            <DetectorRecommendation detector={detector} alternatives={alternatives} onSelectAlternative={setSelectedId} />
          </div>

          {conditionReady && detector ? (
            <>
              <div id="step-3">
                <RegexEditor detector={detector} regexDraft={regexDraft} setRegexDraft={setRegexDraft}
                  onReset={() => setRegexDraft(detector.regex ?? "")} dirty={dirty}
                  caseInsensitive={caseInsensitive} setCaseInsensitive={setCaseInsensitive}
                  valid={valid} error={error} onLoadExample={setSampleText} />
              </div>
              <div id="step-4">
                <BoundaryControls strategy={strategy} setStrategy={setStrategy} effectiveRegex={effectiveRegex} />
              </div>
              <div id="step-5">
                <ContextKeywords keywords={keywords} setKeywords={setKeywords} />
              </div>
              <div id="step-6">
                <RegexTestPanel effectiveRegex={effectiveRegex} caseInsensitive={caseInsensitive}
                  sampleText={sampleText} setSampleText={setSampleText} detector={detector} valid={valid} />
              </div>
            </>
          ) : (
            <div id="step-3">
              <ComingSoon step="3" title="Regex editor"
                what={detector ? `${detector.displayName} (${detector.conditionType.replace(/_/g, " ")})` : "This condition type"} />
            </div>
          )}
        </div>

        <div className="col-right">
          <div id="step-out"><OutputPanel ctx={ctx} conditionReady={conditionReady} /></div>
          <DetectorMeta detector={detector} />
          <CompatibilityNotes />
        </div>
      </main>
    </div>
  );
}
