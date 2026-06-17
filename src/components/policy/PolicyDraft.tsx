/* ============================================================
   Policy draft (right column, upper). Auto-suggested name,
   description, tags and action; the assembled condition list with
   the AND/OR logic toggle and per-regex word-boundary toggle.
   Ported from handoff project/app/policy.jsx.
   ============================================================ */
import { useState } from "react";
import { Icon } from "../ui/Icon";
import { CopyButton } from "../ui/CopyButton";
import { RegexHighlight } from "../ui/RegexHighlight";
import { typeTone, typeShort } from "../../lib/tones";
import { conditionCopyValue } from "../../lib/match";
import { slugify } from "../../lib/suggest";
import { AEDLP_DATA } from "../../data/library";
import type { Condition, RecommendedAction } from "../../types";

export type ScanKey = "body" | "subject" | "attachments";

export interface PolicyDraftState {
  name: string;
  description: string;
  tags: string[];
  action: RecommendedAction;
  scan: Record<ScanKey, boolean>;
  nameDirty: boolean;
  descDirty: boolean;
  tagsDirty: boolean;
  actionDirty: boolean;
}

export interface DraftSuggestions {
  name: string;
  description: string;
  tags: string[];
}

export interface DraftSetters {
  name: (v: string) => void;
  description: (v: string) => void;
  tags: (v: string[]) => void;
  action: (v: string) => void;
  scan: (k: ScanKey, val: boolean) => void;
  resetName: () => void;
  resetDesc: () => void;
  resetTags: () => void;
}

/* ---------- a suggestable field (auto-fills, regenerates, editable) ---------- */
interface SuggestFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suggestion: string;
  dirty: boolean;
  onReset: () => void;
  multiline?: boolean;
  copyValue?: string;
  placeholder?: string;
}

function SuggestField({ label, value, onChange, suggestion, dirty, onReset, multiline, copyValue, placeholder }: SuggestFieldProps) {
  const canReset = dirty && suggestion && suggestion !== value;
  return (
    <div className="pf">
      <div className="pf-head">
        <span className="pf-label">{label}</span>
        <div className="pf-tools">
          {!dirty && value && (
            <span className="pf-auto">
              <Icon name="sparkle" size={11} />
              Auto
            </span>
          )}
          {canReset && (
            <button className="pf-reset" onClick={onReset} title="Reset to suggestion">
              <Icon name="reset" size={12} />
              Suggestion
            </button>
          )}
          <CopyButton value={() => (copyValue !== undefined ? copyValue : value)} label="" className="icon-copy" />
        </div>
      </div>
      {multiline ? (
        <textarea
          className="input pf-input"
          rows={3}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className="input pf-input"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

/* ---------- tags editor ---------- */
interface TagsFieldProps {
  tags: string[];
  setTags: (v: string[]) => void;
  suggestion: string[];
  dirty: boolean;
  onReset: () => void;
}

function TagsField({ tags, setTags, suggestion, dirty, onReset }: TagsFieldProps) {
  const [val, setVal] = useState("");
  const add = () => {
    const t = slugify(val.trim());
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setVal("");
  };
  const canReset = dirty && suggestion && suggestion.join(",") !== tags.join(",");
  return (
    <div className="pf">
      <div className="pf-head">
        <span className="pf-label">Tags</span>
        <div className="pf-tools">
          {!dirty && tags.length > 0 && (
            <span className="pf-auto">
              <Icon name="sparkle" size={11} />
              Auto
            </span>
          )}
          {canReset && (
            <button className="pf-reset" onClick={onReset}>
              <Icon name="reset" size={12} />
              Suggestion
            </button>
          )}
          <CopyButton value={() => tags.join(", ")} label="" className="icon-copy" />
        </div>
      </div>
      <div className="tag-box">
        {tags.map((t) => (
          <span key={t} className="tag-chip">
            {t}
            <button onClick={() => setTags(tags.filter((x) => x !== t))} aria-label={"Remove " + t}>
              <Icon name="x" size={10} />
            </button>
          </span>
        ))}
        <input
          className="tag-input"
          placeholder={tags.length ? "Add tag…" : "Add a tag…"}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
      </div>
    </div>
  );
}

/* ---------- one assembled condition ---------- */
interface ConditionRowProps {
  c: Condition;
  index: number;
  total: number;
  operator: string;
  onRemove: (id: string) => void;
  onToggleBoundary: (id: string, on: boolean) => void;
}

function ConditionRow({ c, index, total, operator, onRemove, onToggleBoundary }: ConditionRowProps) {
  const isRegex = c.conditionType === "regular_expression";
  const value = conditionCopyValue(c);
  return (
    <div className="cond-row">
      <div className="cond-top">
        <span className="cond-idx">{index + 1}</span>
        <div className="cond-titles">
          <div className="cond-name">{c.displayName}</div>
          <div className="cond-meta">
            <span className={`type-pill sm ${typeTone(c.conditionType)}`}>{typeShort(c.conditionType)}</span>
            <span className="muted small">{c.category}</span>
          </div>
        </div>
        <div className="cond-tools">
          <CopyButton
            value={() => value}
            label=""
            className="icon-copy"
            icon={
              c.conditionType === "keyword" || c.conditionType === "recipient_domain" || c.conditionType === "file_extension"
                ? "list"
                : "copy"
            }
          />
          <button className="icon-x" onClick={() => onRemove(c.id)} title="Remove">
            <Icon name="trash" size={13} />
          </button>
        </div>
      </div>
      <div className="cond-value">
        {c.conditionType === "regular_expression" ? (
          <code>
            <RegexHighlight pattern={value} />
          </code>
        ) : c.conditionType === "keyword_pattern" ? (
          <code className="pattern">{value}</code>
        ) : c.conditionType === "recipient_domain" ? (
          <div className="prev-chips">
            {c.domains.slice(0, 8).map((k) => (
              <span key={k} className="prev-chip mono">
                {k}
              </span>
            ))}
            {c.domains.length > 8 && <span className="prev-more">+{c.domains.length - 8} domains</span>}
          </div>
        ) : c.conditionType === "file_extension" ? (
          <div className="prev-chips">
            {c.extensions.slice(0, 12).map((k) => (
              <span key={k} className="prev-chip ext">
                {k}
              </span>
            ))}
            {c.extensions.length > 12 && <span className="prev-more">+{c.extensions.length - 12} more</span>}
          </div>
        ) : (
          <div className="prev-chips">
            {c.keywords.slice(0, 8).map((k) => (
              <span key={k} className="prev-chip">
                {k}
              </span>
            ))}
            {c.keywords.length > 8 && <span className="prev-more">+{c.keywords.length - 8}</span>}
          </div>
        )}
      </div>
      {isRegex && (
        <label className="cond-boundary">
          <input
            type="checkbox"
            checked={c.boundary === "word"}
            onChange={(e) => onToggleBoundary(c.id, e.target.checked)}
          />
          <span className="mini-check">{c.boundary === "word" && <Icon name="check" size={10} />}</span>
          Wrap with <code className="mini-code">\b…\b</code> word boundaries
        </label>
      )}
      {index < total - 1 && (
        <div className="cond-joiner">
          <span className="joiner-pill">{operator}</span>
        </div>
      )}
    </div>
  );
}

/* ---------- policy draft panel ---------- */
const SCAN_OPTS: [ScanKey, string][] = [
  ["body", "Body"],
  ["subject", "Subject"],
  ["attachments", "Attachments"],
];
const LOC_LABEL: Record<string, string> = {
  body: "Email body",
  subject: "Email subject",
  attachments: "Attachment text",
};

export interface PolicyDraftProps {
  draft: PolicyDraftState;
  set: DraftSetters;
  conditions: Condition[];
  operator: string;
  setOperator: (op: string) => void;
  onRemove: (id: string) => void;
  onToggleBoundary: (id: string, on: boolean) => void;
  onClear: () => void;
  suggestions: DraftSuggestions;
}

export function PolicyDraft({
  draft,
  set,
  conditions,
  operator,
  setOperator,
  onRemove,
  onToggleBoundary,
  onClear,
  suggestions,
}: PolicyDraftProps) {
  const empty = conditions.length === 0;

  const fullExport = () => {
    const lines: string[] = [];
    lines.push("Policy name:\n" + (draft.name || "(unnamed)"));
    lines.push("\nRule description:\n" + (draft.description || "(none)"));
    lines.push("\nTags:\n" + (draft.tags.length ? draft.tags.join(", ") : "(none)"));
    lines.push("\nAction:\n" + AEDLP_DATA.actions[draft.action].label);
    const loc = Object.entries(draft.scan)
      .filter(([, v]) => v)
      .map(([k]) => LOC_LABEL[k]);
    lines.push("\nScan locations:\n" + (loc.length ? loc.join(", ") : "(none)"));
    lines.push("\nCondition logic:\nMatch if " + (operator === "AND" ? "ALL" : "ANY") + " of the conditions match");
    conditions.forEach((c, i) => {
      lines.push(`\nCondition ${i + 1} — ${c.displayName} (${typeShort(c.conditionType)}):`);
      lines.push(conditionCopyValue(c));
    });
    return lines.join("\n");
  };

  return (
    <div className="policy-draft">
      <div className="pd-head">
        <div className="pd-title-wrap">
          <div className="pd-title">
            <Icon name="doc" size={15} />
            Policy draft
          </div>
          <div className="pd-sub">
            {conditions.length} condition{conditions.length === 1 ? "" : "s"} · paste each field into AEDLP
          </div>
        </div>
        {!empty && <CopyButton value={fullExport} label="Copy all" big />}
      </div>

      <div className="pd-body">
        <SuggestField
          label="Policy name"
          value={draft.name}
          onChange={set.name}
          placeholder="Name this policy…"
          suggestion={suggestions.name}
          dirty={draft.nameDirty}
          onReset={() => set.resetName()}
        />

        <SuggestField
          label="Rule description"
          value={draft.description}
          onChange={set.description}
          multiline
          placeholder="What does this rule detect?"
          suggestion={suggestions.description}
          dirty={draft.descDirty}
          onReset={() => set.resetDesc()}
        />

        <TagsField
          tags={draft.tags}
          setTags={set.tags}
          suggestion={suggestions.tags}
          dirty={draft.tagsDirty}
          onReset={() => set.resetTags()}
        />

        <div className="pf-grid">
          <div className="pf">
            <div className="pf-head">
              <span className="pf-label">Action</span>
              {!draft.actionDirty && (
                <span className="pf-auto">
                  <Icon name="sparkle" size={11} />
                  Auto
                </span>
              )}
            </div>
            <select className="input pf-input" value={draft.action} onChange={(e) => set.action(e.target.value)}>
              {Object.entries(AEDLP_DATA.actions).map(([id, a]) => (
                <option key={id} value={id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <div className="pf">
            <div className="pf-head">
              <span className="pf-label">Scan locations</span>
            </div>
            <div className="scan-opts">
              {SCAN_OPTS.map(([k, lbl]) => (
                <label key={k} className={`scan-opt ${draft.scan[k] ? "on" : ""}`}>
                  <input type="checkbox" checked={draft.scan[k]} onChange={(e) => set.scan(k, e.target.checked)} />
                  {lbl}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="pd-divider"></div>

        {/* conditions */}
        <div className="pd-cond-head">
          <span className="section-label">Conditions ({conditions.length})</span>
          {conditions.length > 1 && (
            <div className="logic-toggle">
              <span className="muted small">Match</span>
              {["AND", "OR"].map((op) => (
                <button
                  key={op}
                  className={`logic-btn ${operator === op ? "active" : ""}`}
                  onClick={() => setOperator(op)}
                >
                  {op === "AND" ? "ALL" : "ANY"}
                </button>
              ))}
            </div>
          )}
          {!empty && (
            <button className="btn xs ghost" onClick={onClear}>
              <Icon name="trash" size={12} />
              Clear
            </button>
          )}
        </div>

        {empty ? (
          <div className="pd-empty">
            <Icon name="layers" size={24} />
            <div className="pd-empty-t">No conditions yet</div>
            <div className="small muted">
              Add regex, keyword sets, or keyword patterns from the library. Name, description, tags and action are
              suggested automatically.
            </div>
          </div>
        ) : (
          <div className="cond-list">
            {conditions.map((c, i) => (
              <ConditionRow
                key={c.id}
                c={c}
                index={i}
                total={conditions.length}
                operator={operator}
                onRemove={onRemove}
                onToggleBoundary={onToggleBoundary}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
