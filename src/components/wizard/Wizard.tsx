/* ============================================================
   Wizard front door (Phase A) — a light overlay/step on top of the
   Policy Creator, not a new route.

   Step one only: customer name + industry. Finishing lands the user in
   the Policy Creator with the industry pre-filter active and the policy
   name / description / tags pre-filled (all editable, nothing added to
   conditions). Skip — and Close / Escape / a backdrop press, which all
   behave the same for this phase — drop straight into the normal
   library with no filter and no pre-fill.

   Presented modal-style so the wizard, not the library, is the focus on
   first load; intentionally light otherwise (the spreadsheet-upload step
   is Phase B). Built entirely from existing styles.css tokens.
   ============================================================ */
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import type { WizardAccount } from "../../lib/wizard";

export interface WizardProps {
  /** Whether the wizard overlay is shown. */
  open: boolean;
  /** Industries offered in the dropdown (derived from the library). */
  industries: string[];
  /** Land in the Policy Creator with this account's pre-filter + metadata. */
  onFinish: (account: WizardAccount, dontShowAgain: boolean) => void;
  /** Drop into the normal library; Close, Escape and backdrop route here too. */
  onSkip: (dontShowAgain: boolean) => void;
}

export function Wizard({ open, industries, onFinish, onSkip }: WizardProps) {
  const [customer, setCustomer] = useState("");
  const [industry, setIndustry] = useState("");
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const descId = useId();

  // Fresh start every time the wizard opens; focus the first field.
  useEffect(() => {
    if (!open) return;
    setCustomer("");
    setIndustry("");
    setDontShowAgain(false);
    inputRef.current?.focus();
  }, [open]);

  // Escape behaves like Skip / Close for this phase, honouring the checkbox.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSkip(dontShowAgain);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dontShowAgain, onSkip]);

  if (!open) return null;

  const valid = customer.trim() !== "" && industry !== "";
  const finish = () => {
    if (valid) onFinish({ customer: customer.trim(), industry }, dontShowAgain);
  };
  const skip = () => onSkip(dontShowAgain);

  return (
    <div
      className="wiz-overlay"
      // A press that STARTS on the backdrop dismisses (same as Skip); presses
      // inside the dialog do not, so a drag-select can't close it by accident.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) skip();
      }}
    >
      <div className="wiz" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descId}>
        <div className="wiz-head">
          <div className="wiz-mark">
            <Icon name="sparkle" size={16} />
          </div>
          <div className="wiz-titles">
            <div className="wiz-title" id={titleId}>
              Set up a policy for a customer
            </div>
            <div className="wiz-sub" id={descId}>
              Pre-filter the library to their industry and pre-fill the policy details. You can change or clear
              everything afterwards.
            </div>
          </div>
          <button className="iconbtn wiz-close" onClick={skip} aria-label="Close" title="Close (same as Skip)">
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="wiz-body">
          <label className="wiz-field">
            <span className="wiz-label">Customer name</span>
            <input
              ref={inputRef}
              className="input"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder="e.g. Globex Corporation"
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  finish();
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

        <div className="wiz-foot">
          <label className="wiz-dsa">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
            />
            Don’t show this wizard again
          </label>
          <div className="wiz-actions">
            <button className="btn ghost" onClick={skip}>
              Skip
            </button>
            <button className="btn primary" disabled={!valid} onClick={finish}>
              <Icon name="check" size={14} />
              Start in Policy Creator
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
