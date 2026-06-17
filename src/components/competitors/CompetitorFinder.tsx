/* ============================================================
   Find competitors — a clearly-scoped lookup surface.

   The user types a company name (and optional industry); the app
   asks Claude (via /api/competitors, grounded on web search) for that
   company's competitors and their primary corporate email domains,
   verifies the domains, and shows them here for review. The user
   checks the ones they want and clicks Add, which curates them into a
   recipient-domain condition. Nothing is auto-applied, and unverified
   or unchecked rows are never added silently.

   Only the company name typed here leaves the browser. Uploaded files
   and the extractor stay entirely local — this surface does not touch
   any extractor parsing path.
   ============================================================ */
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import { Badge } from "../ui/Badge";
import { Callout } from "../ui/Callout";
import { fetchCompetitors, type CompetitorSuggestion, type Confidence } from "../../lib/competitors";

type Status = "idle" | "loading" | "done" | "error";

const CONFIDENCE_TONE: Record<Confidence, string> = { high: "ok", medium: "warn", low: "neutral" };

export interface CompetitorFinderProps {
  /** Curate the chosen domains into a recipient-domain condition. */
  onAdd: (domains: string[]) => void;
  /** Class for the trigger button (defaults to a small button). */
  triggerClassName?: string;
}

export function CompetitorFinder({ onAdd, triggerClassName = "btn sm" }: CompetitorFinderProps) {
  const [open, setOpen] = useState(false);
  const [company, setCompany] = useState("");
  const [industry, setIndustry] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<CompetitorSuggestion[]>([]);
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const titleId = useId();

  // Focus the company field when the modal opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Close on Escape while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function reset() {
    abortRef.current?.abort();
    abortRef.current = null;
    setCompany("");
    setIndustry("");
    setStatus("idle");
    setError("");
    setSuggestions([]);
    setNotes("");
    setSelected(new Set());
  }

  function close() {
    reset();
    setOpen(false);
  }

  async function find() {
    if (!company.trim() || status === "loading") return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStatus("loading");
    setError("");
    setSuggestions([]);
    setNotes("");
    setSelected(new Set());

    const result = await fetchCompetitors(company, industry, ctrl.signal);
    if (ctrl.signal.aborted) return;
    if (result.ok) {
      setSuggestions(result.suggestions);
      setNotes(result.notes);
      setStatus("done");
    } else {
      setError(result.message);
      setStatus("error");
    }
  }

  function toggle(domain: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  }

  function add() {
    const domains = suggestions.filter((s) => selected.has(s.domain)).map((s) => s.domain);
    if (!domains.length) return;
    onAdd(domains);
    close();
  }

  return (
    <>
      <button
        type="button"
        className={triggerClassName}
        onClick={() => setOpen(true)}
        title="Find competitor domains for a company"
      >
        <Icon name="building" size={13} />
        Find competitors
      </button>

      {open && (
        <div className="cf-overlay" onMouseDown={close}>
          <div
            className="cf-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="cf-head">
              <div className="cf-title-wrap">
                <div className="cf-title" id={titleId}>
                  <Icon name="building" size={15} />
                  Find competitor domains
                </div>
                <div className="cf-sub">Suggest → review → curate → add to a recipient-domain condition</div>
              </div>
              <button className="iconbtn" onClick={close} aria-label="Close" title="Close">
                <Icon name="x" size={16} />
              </button>
            </div>

            <div className="cf-body">
              {/* Permanent privacy note — must stay on this surface. */}
              <Callout tone="info" icon="info" title="What gets sent">
                Only the company name you type is sent to the lookup service. Uploaded files and the extractor
                stay in your browser and are never sent.
              </Callout>

              <div className="cf-form">
                <div className="cf-field grow">
                  <label className="cf-label" htmlFor={`${titleId}-company`}>
                    Company or customer name
                  </label>
                  <input
                    id={`${titleId}-company`}
                    ref={inputRef}
                    className="input"
                    placeholder="e.g. Globex Corporation"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void find();
                      }
                    }}
                  />
                </div>
                <div className="cf-field">
                  <label className="cf-label" htmlFor={`${titleId}-industry`}>
                    Industry <span className="muted">(optional)</span>
                  </label>
                  <input
                    id={`${titleId}-industry`}
                    className="input"
                    placeholder="e.g. aerospace"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void find();
                      }
                    }}
                  />
                </div>
                <button
                  className="btn primary cf-find"
                  onClick={() => void find()}
                  disabled={!company.trim() || status === "loading"}
                >
                  <Icon name="search" size={14} />
                  {status === "loading" ? "Searching…" : "Find"}
                </button>
              </div>

              {status === "loading" && (
                <div className="cf-loading">
                  <span className="spinner" />
                  <span>Researching competitors and verifying domains…</span>
                </div>
              )}

              {status === "error" && (
                <Callout tone="danger" icon="alert" title="Lookup failed">
                  {error}
                </Callout>
              )}

              {status === "done" && suggestions.length === 0 && (
                <div className="cf-empty">
                  <Icon name="search" size={22} />
                  <div className="cf-empty-t">No competitor suggestions</div>
                  <div className="small muted">Try a more specific company name, or add an industry.</div>
                </div>
              )}

              {status === "done" && suggestions.length > 0 && (
                <>
                  <div className="cf-results-head">
                    <span className="section-label">
                      {suggestions.length} suggestion{suggestions.length === 1 ? "" : "s"}
                    </span>
                    <span className="small muted">Select the domains to add</span>
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
              )}
            </div>

            <div className="cf-foot">
              <span className="small muted">
                {selected.size} selected · nothing is added until you click Add
              </span>
              <div className="cf-foot-actions">
                <button className="btn ghost" onClick={close}>
                  Cancel
                </button>
                <button className="btn primary" onClick={add} disabled={selected.size === 0}>
                  <Icon name="plus" size={14} />
                  Add {selected.size > 0 ? selected.size : ""} to policy
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
