/* ============================================================
   Find competitors — a clearly-scoped lookup surface.

   The user types a company name (and optional industry); the app
   asks Claude (via /api/competitors, from its own knowledge) for that
   company's competitors and their primary corporate email domains,
   verifies the domains, and shows them here for review. The user
   checks the ones they want and clicks Add, which curates them into a
   recipient-domain condition. Nothing is auto-applied, and unverified
   or unchecked rows are never added silently.

   This is an *inline* expanding panel on the Recipients surface — it
   lives WITH the other ways to build a recipient-domain list (the
   static packs, the trusted-domain handoff), not a modal popup. It
   opens beneath the "Find competitors with AI" trigger, so the lookup
   is one of the recipient-list builders. Escape and a visible Close
   both collapse it, and focus returns to the trigger on close.

   Only the company name and industry typed here leave the browser.
   Uploaded files and the extractor stay entirely local — this surface
   does not touch any extractor parsing path.
   ============================================================ */
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import { Badge } from "../ui/Badge";
import { Callout } from "../ui/Callout";
import { CopyButton } from "../ui/CopyButton";
import { fetchCompetitors, type CompetitorSuggestion, type Confidence } from "../../lib/competitors";

type Status = "idle" | "loading" | "done" | "error";

const CONFIDENCE_TONE: Record<Confidence, string> = { high: "ok", medium: "warn", low: "neutral" };

export interface CompetitorFinderProps {
  /** Curate the chosen domains into a recipient-domain condition. */
  onAdd: (domains: string[]) => void;
  /** Class for the trigger button (defaults to a small button). */
  triggerClassName?: string;
  /** Trigger label. The Recipients surface uses the default "with AI" wording. */
  triggerLabel?: string;
}

export function CompetitorFinder({
  onAdd,
  triggerClassName = "btn sm",
  triggerLabel = "Find competitors with AI",
}: CompetitorFinderProps) {
  const [open, setOpen] = useState(false);
  const [company, setCompany] = useState("");
  const [industry, setIndustry] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<CompetitorSuggestion[]>([]);
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // True when the typed name is too short to look up (≤ 2 chars), so we prompt
  // for a fuller name instead of spending a lookup on an ambiguous abbreviation.
  const [shortName, setShortName] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const titleId = useId();
  const panelId = useId();

  // Focus the company field when the panel expands.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Escape collapses the panel while it is open. It is a non-modal panel,
  // so we listen on window but never trap focus.
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
    setShortName(false);
  }

  function close() {
    reset();
    setOpen(false);
    // Return focus to the trigger so keyboard users keep their place.
    triggerRef.current?.focus();
  }

  async function find() {
    if (status === "loading") return;
    const trimmed = company.trim();
    if (!trimmed) return;
    // Two characters or fewer can't be disambiguated (e.g. "BA" → British Airways?
    // Bank of America?). Ask for a fuller name before spending a lookup on it.
    if (trimmed.length <= 2) {
      setShortName(true);
      setStatus("idle");
      setError("");
      setSuggestions([]);
      setNotes("");
      setSelected(new Set());
      return;
    }
    setShortName(false);
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

  // Select-all / deselect-all over the reviewed suggestions. Like every other
  // recipient-domain surface, this only drives selection — nothing is added to
  // the policy until the user clicks Add.
  const allDomains = suggestions.map((s) => s.domain);
  const allSelected = allDomains.length > 0 && selected.size === allDomains.length;
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allDomains));
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
        ref={triggerRef}
        className={`${triggerClassName} cf-trigger`}
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-controls={panelId}
        title="Find competitor domains for a company, suggested by AI"
      >
        <Icon name="sparkle" size={13} />
        {triggerLabel}
        <Icon name="chevronDown" size={13} className={`cf-chev ${open ? "open" : ""}`} />
      </button>

      {open && (
        <section className="cf-panel" id={panelId} role="region" aria-labelledby={titleId}>
          <div className="cf-head">
            <div className="cf-title-wrap">
              <div className="cf-title" id={titleId}>
                <Icon name="sparkle" size={15} />
                Find competitor domains with AI
              </div>
              <div className="cf-sub">Suggest → review → curate → add to a recipient-domain condition</div>
            </div>
            <button className="iconbtn" onClick={close} aria-label="Close competitor finder" title="Close">
              <Icon name="x" size={16} />
            </button>
          </div>

          <div className="cf-body">
            {/* Permanent privacy note — must stay on this surface. */}
            <Callout tone="info" icon="info" title="What gets sent">
              Only the company name and industry you type are sent to the lookup service, which asks Claude
              to suggest competitor domains from its own knowledge. Uploaded files and the extractor stay in
              your browser and are never sent.
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
                  onChange={(e) => {
                    setCompany(e.target.value);
                    if (shortName) setShortName(false);
                  }}
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

            {shortName && (
              <Callout tone="warn" icon="info" title="Enter a fuller name">
                That’s too short to look up. Type the full company name — for example, “British Airways”
                rather than “BA”.
              </Callout>
            )}

            {status === "loading" && (
              <div className="cf-loading">
                <span className="spinner" />
                <span>Finding competitors and verifying domains…</span>
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
                {/* Prefer the server's note (e.g. a "took too long — narrow your query"
                    message) when present; otherwise show the standard hint. */}
                <div className="small muted">
                  {notes || "Try a more specific company name, or add an industry."}
                </div>
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
                <div className="dsl-tools">
                  <button
                    type="button"
                    className="btn xs ghost dsl-toggle"
                    onClick={toggleAll}
                    aria-pressed={allSelected}
                  >
                    <Icon name={allSelected ? "x" : "check"} size={12} />
                    {allSelected ? "Deselect all" : "Select all"}
                  </button>
                  <span className="dsl-count muted small">
                    {selected.size}/{allDomains.length} selected
                  </span>
                  <span className="dsl-spacer" />
                  <CopyButton value={() => allDomains.join("\n")} label="Copy all domains" className="dsl-copy" icon="list" />
                  <CopyButton value={() => allDomains.join(", ")} label="Comma-separated" className="dsl-copy" icon="copy" />
                </div>
                <div className="cf-disclaimer small muted">
                  Domains are model-suggested and DNS-checked. Confirm before use.
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
                Close
              </button>
              <button className="btn primary" onClick={add} disabled={selected.size === 0}>
                <Icon name="plus" size={14} />
                Add {selected.size > 0 ? selected.size : ""} to policy
              </button>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
