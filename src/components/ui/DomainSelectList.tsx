/* ============================================================
   DomainSelectList — a reusable, selectable recipient-domain list.

   Every recipient-domain surface (the library inspector, a policy-
   draft recipient condition, and the competitor review list) shares
   the same three controls this component provides:

     • Select all / Deselect all — toggle the whole set, then deselect
       the few you do not want (e.g. your own organisation).
     • Copy all domains — copies the FULL list (all N, never just the
       visible chips) as a newline list, with a comma-separated variant,
       ready to paste into the AEDLP allowed/blocked-domains field. A
       "Copy selected" variant appears once a strict subset is picked.
     • Expand — the "+N domains" affordance reveals the whole set inline
       instead of truncating to the first few chips.

   Copy feedback is handled by CopyButton (it flips to "Copied").
   This component only reads and copies; it never mutates the detector
   data or the curate-before-deploy flow.
   ============================================================ */
import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import { CopyButton } from "./CopyButton";

export interface DomainSelectListProps {
  /** The full domain list to display, select within, and copy. */
  domains: string[];
  /** How many chips to show before the "+N domains" expander appears. */
  collapsedCount?: number;
}

export function DomainSelectList({ domains, collapsedCount = 12 }: DomainSelectListProps) {
  // De-duplicate defensively while preserving the supplied order.
  const list = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const d of domains) {
      if (d && !seen.has(d)) {
        seen.add(d);
        out.push(d);
      }
    }
    return out;
  }, [domains]);

  // Selection defaults to "everything selected": this is a copy surface, so
  // the common move is to deselect a few then copy the rest. Re-seed whenever
  // the underlying list changes (e.g. a lookup replaces the condition) using
  // the documented derive-state-during-render pattern.
  const signature = list.join("\n");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(list));
  const [seeded, setSeeded] = useState(signature);
  const [expanded, setExpanded] = useState(false);
  if (signature !== seeded) {
    setSelected(new Set(list));
    setSeeded(signature);
    setExpanded(false);
  }

  const total = list.length;
  const allSelected = total > 0 && selected.size === total;
  const subsetSelected = selected.size > 0 && selected.size < total;

  const visible = expanded ? list : list.slice(0, collapsedCount);
  const hidden = total - visible.length;

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(list));
  const toggle = (d: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });

  return (
    <div className="dsl">
      <div className="dsl-tools">
        <button
          type="button"
          className="btn xs ghost dsl-toggle"
          onClick={toggleAll}
          aria-pressed={allSelected}
          disabled={total === 0}
        >
          <Icon name={allSelected ? "x" : "check"} size={12} />
          {allSelected ? "Deselect all" : "Select all"}
        </button>
        <span className="dsl-count muted small">
          {selected.size}/{total} selected
        </span>
        <span className="dsl-spacer" />
        <CopyButton value={() => list.join("\n")} label="Copy all domains" className="dsl-copy" icon="list" />
        <CopyButton value={() => list.join(", ")} label="Comma-separated" className="dsl-copy" icon="copy" />
        {subsetSelected && (
          <CopyButton
            value={() => list.filter((d) => selected.has(d)).join("\n")}
            label={`Copy selected (${selected.size})`}
            className="dsl-copy"
            icon="copy"
          />
        )}
      </div>

      <div className="prev-chips full dsl-chips" role="group" aria-label="Domains">
        {visible.map((d) => {
          const on = selected.has(d);
          return (
            <button
              key={d}
              type="button"
              className={`prev-chip mono pick ${on ? "on" : "off"}`}
              aria-pressed={on}
              onClick={() => toggle(d)}
              title={on ? `Deselect ${d}` : `Select ${d}`}
            >
              {d}
            </button>
          );
        })}
        {hidden > 0 && (
          <button type="button" className="dsl-more" onClick={() => setExpanded(true)}>
            +{hidden} {hidden === 1 ? "domain" : "domains"} — show all
          </button>
        )}
        {expanded && total > collapsedCount && (
          <button type="button" className="dsl-more" onClick={() => setExpanded(false)}>
            Show fewer
          </button>
        )}
      </div>
    </div>
  );
}
