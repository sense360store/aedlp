/* ============================================================
   Wizard front door — a light overlay/step on top of the Policy
   Creator, not a new route.

   Step one (Phase A): customer name + industry.
   Step two (Phase B, OPTIONAL): upload an enforcer export. It reuses
   the extractor's streaming Web Worker parser (parseFile) and progress
   indicator — no new parser, no backend, nothing leaves the browser —
   and pre-loads the trusted-domain list from the file. The step is
   genuinely skippable; finishing with no file behaves exactly like
   Phase A (industry pre-filter + pre-filled metadata, no trusted list).

   Finishing hands the chosen account up to the page, plus the extracted
   trusted-domain list (or null). The page persists those through the
   SAME extractor storage key, so the list surfaces through the existing
   handoff exactly as if it had been curated on the Trusted Domains page.
   It is never auto-added to a condition.

   Close / Escape / a backdrop press cancel the whole wizard (same as
   Phase A's Skip) on either step; "Skip" (step one) skips the wizard and
   "Skip this step" (step two) finishes without a trusted list. Built
   entirely from existing styles.css tokens (light/dark, narrow widths).
   ============================================================ */
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";
import { Icon } from "../ui/Icon";
import { parseFile } from "../../lib/parseClient";
import { isCSV, trustedDomainsFromParsed } from "../../lib/extract";
import type { WizardAccount } from "../../lib/wizard";

export interface WizardProps {
  /** Whether the wizard overlay is shown. */
  open: boolean;
  /** Industries offered in the dropdown (derived from the library). */
  industries: string[];
  /**
   * Land in the Policy Creator with this account's pre-filter + metadata.
   * `trustedDomains` carries the list extracted from an uploaded enforcer
   * export (non-empty), or null when the upload was skipped / unusable.
   */
  onFinish: (account: WizardAccount, dontShowAgain: boolean, trustedDomains: string[] | null) => void;
  /** Drop into the normal library; Close, Escape and backdrop route here too. */
  onSkip: (dontShowAgain: boolean) => void;
}

type Step = 1 | 2;

/* Step-two upload state machine. "empty"/"error" both land cleanly (no trusted
   list, a quiet note) — never an error wall. */
type UploadStage = "idle" | "parsing" | "sheet" | "ready" | "empty" | "error";

/* Focusable descendants of a node, in DOM order, excluding disabled and
   visually hidden elements (e.g. the dropzone's display:none <input type=file>).
   Drives the focus trap and the per-step focus move. The computed-style check
   keeps the hidden file input out in both real browsers and jsdom. */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => {
    if (el.hasAttribute("disabled") || el.getAttribute("aria-hidden") === "true") return false;
    const s = getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden";
  });
}

export function Wizard({ open, industries, onFinish, onSkip }: WizardProps) {
  const [step, setStep] = useState<Step>(1);
  const [customer, setCustomer] = useState("");
  const [industry, setIndustry] = useState("");
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // Step-two upload state.
  const [stage, setStage] = useState<UploadStage>("idle");
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState("");
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [domains, setDomains] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState("");

  // The dialog box (focus-trap scope), its body (where step-two focus lands),
  // the step-one text field, the close button and the hidden file input.
  const dialogRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const customerRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Guards against a slow parse resolving after the user moved on / reopened.
  const parseToken = useRef(0);
  const titleId = useId();
  const descId = useId();

  // Remember whatever had focus when the wizard opened (the trigger) and return
  // focus to it on close — the standard dialog contract. Declared before the
  // focus-moving effects so it reads the trigger before we move focus inward.
  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement as HTMLElement | null;
    return () => {
      if (trigger && document.contains(trigger)) trigger.focus();
    };
  }, [open]);

  // Fresh start on every open AND close transition. Resetting on close too means
  // a reopen never flashes the previous step before settling back on step one.
  useEffect(() => {
    setStep(1);
    setCustomer("");
    setIndustry("");
    setDontShowAgain(false);
    setStage("idle");
    setProgress(0);
    setFileName("");
    setSheetNames([]);
    setPendingFile(null);
    setDomains([]);
    setErrorMsg("");
    parseToken.current++;
  }, [open]);

  // Move focus into the dialog on open and whenever the step changes, so a
  // keyboard user always lands inside the current step (and the trap has an
  // anchor). Step one focuses its first field; step two focuses the first
  // control in the body (the dropzone / first action), never the close button.
  useEffect(() => {
    if (!open) return;
    if (step === 1) {
      customerRef.current?.focus();
      return;
    }
    const first = bodyRef.current && focusableWithin(bodyRef.current)[0];
    (first ?? closeRef.current ?? dialogRef.current)?.focus();
  }, [open, step]);

  // Escape cancels the whole wizard on either step (same as Skip / Close),
  // honouring the checkbox — the modal's universal "get me out" gesture.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSkip(dontShowAgain);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dontShowAgain, onSkip]);

  const runParse = useCallback(async (f: File, sheetName?: string) => {
    const token = ++parseToken.current;
    setErrorMsg("");
    setProgress(0);
    setFileName(f.name);
    setPendingFile(f);
    setStage("parsing");
    try {
      const outcome = await parseFile(f, { sheetName, onProgress: (p) => token === parseToken.current && setProgress(p) });
      if (token !== parseToken.current) return; // superseded (reopened / replaced)
      if (outcome.kind === "sheet") {
        setSheetNames(outcome.names);
        setStage("sheet");
        return;
      }
      const doms = trustedDomainsFromParsed(outcome.result);
      setDomains(doms);
      setStage(doms.length ? "ready" : "empty");
    } catch (e) {
      if (token !== parseToken.current) return;
      setDomains([]);
      setErrorMsg((e as Error)?.message || String(e));
      setStage("error");
    }
  }, []);

  if (!open) return null;

  const valid1 = customer.trim() !== "" && industry !== "";
  const account = (): WizardAccount => ({ customer: customer.trim(), industry });
  const next = () => {
    if (valid1) setStep(2);
  };
  const skipWizard = () => onSkip(dontShowAgain);
  // Commit-timing contract for the trusted-domain list (see onWizardFinish):
  // the list is handed up — and so persisted to the shared store — ONLY when the
  // user finishes with "Start in Policy Creator" AND a file fully parsed into a
  // non-empty list (stage "ready"). "Skip this step" (withList=false), and any
  // half-finished state (parsing / sheet-pick / empty / error), hand up null and
  // persist nothing. Close / Escape / backdrop route through onSkip, never here.
  const finish = (withList: boolean) => onFinish(account(), dontShowAgain, withList && stage === "ready" ? domains : null);
  const parsing = stage === "parsing";

  const replaceFile = () => {
    parseToken.current++;
    setStage("idle");
    setProgress(0);
    setFileName("");
    setSheetNames([]);
    setPendingFile(null);
    setDomains([]);
    setErrorMsg("");
  };

  // Trap Tab within the dialog so focus can't leak to the page behind it: wrap
  // from the last focusable to the first (and back), and reclaim focus if it has
  // escaped the dialog entirely (e.g. the focused control unmounted mid-parse).
  const onTrapKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key !== "Tab" || !dialogRef.current) return;
    const f = focusableWithin(dialogRef.current);
    if (f.length === 0) {
      e.preventDefault();
      return;
    }
    const first = f[0];
    const last = f[f.length - 1];
    const active = document.activeElement;
    const outside = !dialogRef.current.contains(active);
    if (e.shiftKey) {
      if (active === first || outside) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last || outside) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="wiz-overlay"
      // A press that STARTS on the backdrop cancels (same as Skip); presses
      // inside the dialog do not, so a drag-select can't close it by accident.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) skipWizard();
      }}
    >
      <div
        ref={dialogRef}
        className="wiz"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        onKeyDown={onTrapKeyDown}
      >
        <div className="wiz-head">
          <div className="wiz-mark">
            <Icon name={step === 1 ? "sparkle" : "upload"} size={16} />
          </div>
          <div className="wiz-titles">
            <div className="wiz-step-badge">Step {step} of 2</div>
            {step === 1 ? (
              <>
                <div className="wiz-title" id={titleId}>
                  Set up a policy for a customer
                </div>
                <div className="wiz-sub" id={descId}>
                  Pre-filter the library to their industry and pre-fill the policy details. You can change or clear
                  everything afterwards.
                </div>
              </>
            ) : (
              <>
                <div className="wiz-title" id={titleId}>
                  Upload an enforcer export (optional)
                </div>
                <div className="wiz-sub" id={descId}>
                  Pre-load a trusted-domain list from an export — the same .xlsx/.csv the Trusted Domains tool takes.
                  It’s parsed locally in your browser; nothing is uploaded. This step is optional.
                </div>
              </>
            )}
          </div>
          <button
            ref={closeRef}
            className="iconbtn wiz-close"
            onClick={skipWizard}
            aria-label="Close"
            title="Close (cancel setup)"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {step === 1 ? (
          <div className="wiz-body">
            <label className="wiz-field">
              <span className="wiz-label">Customer name</span>
              <input
                ref={customerRef}
                className="input"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                placeholder="e.g. Globex Corporation"
                autoComplete="off"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    next();
                  }
                }}
              />
            </label>

            <label className="wiz-field">
              <span className="wiz-label">Industry</span>
              <select
                className="input wiz-select"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                aria-label="Industry"
              >
                <option value="" disabled>
                  Select an industry…
                </option>
                {industries.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
              <span className="wiz-hint">Only industries with their own detectors or a competitor pack are listed.</span>
            </label>
          </div>
        ) : (
          <div className="wiz-body" ref={bodyRef}>
            {stage === "idle" && (
              <UploadDropzone inputRef={fileInputRef} onFile={(f) => void runParse(f).catch(() => {})} />
            )}

            {stage === "parsing" && (
              <div className="parsing wiz-parsing">
                <div className="spinner"></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Reading {fileName}…</div>
                  <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                    {pendingFile && isCSV(pendingFile) ? "Streaming rows locally" : "Streaming workbook locally"} ·
                    nothing is uploaded
                  </div>
                  <div className="prog-track">
                    <div className="prog-bar" style={{ width: (progress * 100).toFixed(0) + "%" }}></div>
                  </div>
                </div>
              </div>
            )}

            {stage === "sheet" && (
              <div className="wiz-sheet">
                <div className="wiz-label">Pick the sheet that holds the contact rows</div>
                <div className="export-grid">
                  {sheetNames.map((n) => (
                    <button
                      key={n}
                      className="btn sm"
                      onClick={() => pendingFile && void runParse(pendingFile, n).catch(() => {})}
                    >
                      <Icon name="layers" size={13} />
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {stage === "ready" && (
              <>
                <div className="file-bar">
                  <div className="file-ic">
                    <Icon name="check" size={18} />
                  </div>
                  <div className="file-meta">
                    <div className="file-name">{fileName}</div>
                    <div className="file-sub">
                      {domains.length.toLocaleString()} trusted domain{domains.length === 1 ? "" : "s"} found
                    </div>
                  </div>
                  <button className="btn sm" onClick={replaceFile}>
                    <Icon name="reset" size={13} />
                    Replace
                  </button>
                </div>
                <div className="wiz-note">
                  These load with your setup; you can review, curate and use them in a recipient-domain condition from
                  the Policy Creator. Nothing is added automatically.
                </div>
                <div className="wiz-preview prev-chips">
                  {domains.slice(0, 40).map((d) => (
                    <span key={d} className="prev-chip mono">
                      {d}
                    </span>
                  ))}
                  {domains.length > 40 && <span className="prev-more">+{(domains.length - 40).toLocaleString()} more</span>}
                </div>
              </>
            )}

            {(stage === "empty" || stage === "error") && (
              <>
                <div className="wiz-note quiet">
                  <Icon name="info" size={14} />
                  <span>
                    {stage === "empty"
                      ? "No usable trusted domains were found in that file."
                      : `Couldn’t read that file${errorMsg ? `: ${errorMsg}` : "."}`}{" "}
                    You can continue without a trusted list, or try another file.
                  </span>
                </div>
                <div className="export-grid">
                  <button className="btn sm" onClick={replaceFile}>
                    <Icon name="upload" size={13} />
                    Try another file
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <div className="wiz-foot">
          <label className="wiz-dsa">
            <input type="checkbox" checked={dontShowAgain} onChange={(e) => setDontShowAgain(e.target.checked)} />
            Don’t show this wizard again
          </label>
          <div className="wiz-actions">
            {step === 1 ? (
              <>
                <button className="btn ghost" onClick={skipWizard}>
                  Skip
                </button>
                <button className="btn primary" disabled={!valid1} onClick={next}>
                  Next
                  <Icon name="chevron" size={14} />
                </button>
              </>
            ) : (
              <>
                <button className="btn ghost" onClick={() => setStep(1)} disabled={parsing}>
                  Back
                </button>
                <button className="btn ghost" onClick={() => finish(false)} disabled={parsing}>
                  Skip this step
                </button>
                <button className="btn primary" onClick={() => finish(true)} disabled={parsing}>
                  <Icon name="check" size={14} />
                  Start in Policy Creator
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* A light dropzone for step two, reusing the extractor's .dropzone tokens.
   Click to browse or drag a file in; accepts the same .xlsx/.csv. */
function UploadDropzone({
  inputRef,
  onFile,
}: {
  inputRef: RefObject<HTMLInputElement>;
  onFile: (f: File) => void;
}) {
  const [drag, setDrag] = useState(false);
  const open = () => inputRef.current?.click();
  return (
    <div
      className={"dropzone wiz-dropzone" + (drag ? " drag" : "")}
      role="button"
      tabIndex={0}
      aria-label="Upload an enforcer export — .xlsx or .csv, parsed locally in your browser"
      onClick={open}
      onKeyDown={(e) => {
        // Enter / Space activate the dropzone like a button (keyboard parity).
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
    >
      <div className="dz-icon">
        <Icon name="upload" size={22} />
      </div>
      <div className="dz-title">Drop an enforcer export here</div>
      <div className="dz-sub">.xlsx or .csv — or click to browse. Parsed locally; nothing is uploaded.</div>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.csv"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
