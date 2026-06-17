/* A single library row: collapsed summary plus expandable inspector.
   Ported from handoff project/app/library.jsx. */
import { useState } from "react";
import { Icon } from "../ui/Icon";
import { CopyButton } from "../ui/CopyButton";
import { typeTone, typeShort, riskTone } from "../../lib/tones";
import { conditionCopyValue } from "../../lib/match";
import type { Detector } from "../../types";
import { ContentPreview } from "./ContentPreview";
import { Inspector } from "./Inspector";

export interface LibraryRowProps {
  d: Detector;
  added: boolean;
  onToggle: (d: Detector) => void;
  onTest: (d: Detector) => void;
}

const isListType = (t: Detector["conditionType"]) =>
  t === "keyword" || t === "recipient_domain" || t === "file_extension";

export function LibraryRow({ d, added, onToggle, onTest }: LibraryRowProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`lib-row ${open ? "open" : ""} ${added ? "added" : ""}`}>
      <div className="lib-row-main" onClick={() => setOpen((o) => !o)}>
        <button className="row-caret" aria-label="Expand">
          <Icon name="chevron" size={14} />
        </button>
        <div className="row-head">
          <div className="row-title-line">
            <span className="row-name">{d.displayName}</span>
            <span className={`type-pill ${typeTone(d.conditionType)}`}>{typeShort(d.conditionType)}</span>
          </div>
          <div className="row-sub">
            <span className="row-cat">{d.category}</span>
            <span className="dot-sep">·</span>
            <span className="muted">
              {d.regionLabel}
              {d.industry ? " · " + d.industry : ""}
            </span>
            <span className={`risk-tag ${riskTone(d.falsePositiveRisk)}`} title="False-positive risk">
              FP {d.falsePositiveRisk}
            </span>
          </div>
          <div className="row-preview">{!open && <ContentPreview d={d} />}</div>
        </div>
        <div className="row-actions" onClick={(e) => e.stopPropagation()}>
          <CopyButton
            value={() => conditionCopyValue(d)}
            label=""
            className="icon-copy"
            icon={isListType(d.conditionType) ? "list" : "copy"}
          />
          <button className={`btn xs ${added ? "added-btn" : "primary"}`} onClick={() => onToggle(d)}>
            <Icon name={added ? "check" : "plus"} size={13} />
            {added ? "Added" : "Add"}
          </button>
        </div>
      </div>
      {open && (
        <div className="lib-row-body">
          <Inspector d={d} />
          <div className="insp-actions">
            <button className={`btn sm ${added ? "added-btn" : "primary"}`} onClick={() => onToggle(d)}>
              <Icon name={added ? "check" : "plus"} size={14} />
              {added ? "Added to policy" : "Add to policy"}
            </button>
            <button className="btn sm" onClick={() => onTest(d)}>
              <Icon name="flask" size={13} />
              Test this
            </button>
            <CopyButton
              value={() => conditionCopyValue(d)}
              label={
                d.conditionType === "keyword"
                  ? "Copy keywords"
                  : d.conditionType === "keyword_pattern"
                    ? "Copy pattern"
                    : d.conditionType === "recipient_domain"
                      ? "Copy domains"
                      : d.conditionType === "file_extension"
                        ? "Copy extensions"
                        : "Copy regex"
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
