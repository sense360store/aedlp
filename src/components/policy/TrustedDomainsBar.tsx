/* ============================================================
   Trusted-domain handoff surfaced inside the policy draft. Shown
   only when the draft already contains a recipient-domain condition.
   Lets the user view, load ("use") and refresh the list curated in
   the Trusted Domain Extractor, or deep-link out to build/refine one.

   Loading into a condition is always an explicit user action — never
   automatic. The list is a trusted/allowed list (permitted domains),
   labelled as such so it is not mistaken for a block list.
   ============================================================ */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../ui/Icon";

export interface TrustedDomainsBarProps {
  /** How many domains are saved from the last extract. */
  count: number;
  /** The saved domains (for the inline preview). */
  domains: string[];
  /** Load the saved list into a recipient-domain condition. */
  onUse: () => void;
  /** Re-read the saved list from this browser. */
  onRefresh: () => void;
}

const EXTRACTOR_PATH = "/trusted-domain-extractor";

export function TrustedDomainsBar({ count, domains, onUse, onRefresh }: TrustedDomainsBarProps) {
  const [open, setOpen] = useState(false);

  // No saved list: a quiet prompt to build one, never an error.
  if (count === 0) {
    return (
      <div className="trusted-bar quiet">
        <Icon name="database" size={15} />
        <span className="tb-text">No extracted trusted-domain list in this browser yet.</span>
        <Link className="tb-link" to={EXTRACTOR_PATH}>
          <Icon name="upload" size={13} />
          Build one from an enforcer export
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="trusted-bar">
        <Icon name="database" size={15} />
        <span className="tb-text">
          Trusted domains: <b>{count.toLocaleString()}</b> ready from your last extract
        </span>
        <span className="tb-actions">
          <button className="btn xs ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            <Icon name="list" size={12} />
            {open ? "Hide" : "View"}
          </button>
          <button className="btn xs primary" onClick={onUse} title="Load these domains into a recipient-domain condition">
            <Icon name="plus" size={12} />
            Use
          </button>
          <button className="btn xs ghost" onClick={onRefresh} title="Re-read the saved list from this browser">
            <Icon name="reset" size={12} />
            Refresh
          </button>
        </span>
      </div>

      <div className="tb-note">
        This is a <b>trusted / allowed</b> list — mail to these domains is permitted (it should not trip the
        unauthorised-email condition), unlike the freemail, disposable and competitor block lists.
      </div>

      <div className="tb-foot">
        <Link className="tb-link" to={EXTRACTOR_PATH}>
          <Icon name="upload" size={13} />
          Build or refine from an enforcer export
        </Link>
      </div>

      {open && (
        <div className="tb-preview prev-chips">
          {domains.slice(0, 60).map((d) => (
            <span key={d} className="prev-chip mono">
              {d}
            </span>
          ))}
          {domains.length > 60 && <span className="prev-more">+{(domains.length - 60).toLocaleString()} more</span>}
        </div>
      )}
    </div>
  );
}
