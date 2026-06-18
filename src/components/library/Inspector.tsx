/* Expanded inspector body per condition type.
   Ported from handoff project/app/library.jsx. */
import { Icon } from "../ui/Icon";
import { CopyButton } from "../ui/CopyButton";
import { DomainSelectList } from "../ui/DomainSelectList";
import { RegexHighlight } from "../ui/RegexHighlight";
import { serializeKeywordPattern } from "../../lib/match";
import type { Detector } from "../../types";

export function Inspector({ d }: { d: Detector }) {
  return (
    <div className="inspector">
      {d.description && <p className="insp-desc">{d.description}</p>}

      {d.conditionType === "regular_expression" && (
        <>
          <div className="insp-label">
            Regex pattern
            <CopyButton value={() => d.regex} label="Copy" />
          </div>
          <div className="insp-code">
            <RegexHighlight pattern={d.regex} />
          </div>
          {d.contextKeywords && d.contextKeywords.length > 0 && (
            <div className="insp-row">
              <span className="insp-k">Context keywords (combine with AND)</span>
              <div className="prev-chips">
                {d.contextKeywords.map((k) => (
                  <span key={k} className="prev-chip">
                    {k}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {d.conditionType === "keyword" && (
        <>
          <div className="insp-label">
            Keywords — match any ({d.keywords.length})
            <CopyButton value={() => d.keywords.join("\n")} label="Copy list" />
          </div>
          <div className="prev-chips full">
            {d.keywords.map((k) => (
              <span key={k} className="prev-chip">
                {k}
              </span>
            ))}
          </div>
          <div className="insp-meta-line">
            Match: {d.matchMode.caseInsensitive ? "case-insensitive" : "case-sensitive"} ·{" "}
            {d.matchMode.wholeWord ? "whole word" : "partial"} · any term
          </div>
        </>
      )}

      {d.conditionType === "recipient_domain" && (
        <>
          <div className="insp-label">Recipient domains — match any ({d.domains.length})</div>
          <DomainSelectList domains={d.domains} collapsedCount={60} />
          <div className="insp-meta-line">Flags a recipient address on any listed domain · case-insensitive</div>
        </>
      )}

      {d.conditionType === "file_extension" && (
        <>
          <div className="insp-label">
            File extensions — match any ({d.extensions.length})
            <CopyButton value={() => d.extensions.join(", ")} label="Copy list" />
          </div>
          <div className="prev-chips full">
            {d.extensions.map((k) => (
              <span key={k} className="prev-chip ext">
                {k}
              </span>
            ))}
          </div>
          <div className="insp-meta-line">
            Family: <b>{d.family}</b> · flags an attachment whose filename ends in any listed extension ·
            case-insensitive
          </div>
          {d.industries && d.industries.length > 0 && (
            <div className="insp-row">
              <span className="insp-k">Industries</span>
              <div className="prev-chips">
                {d.industries.map((k) => (
                  <span key={k} className="prev-chip">
                    {k}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {d.conditionType === "keyword_pattern" && (
        <>
          <div className="insp-label">
            Pattern expression
            <CopyButton value={() => serializeKeywordPattern(d)} label="Copy" />
          </div>
          <div className="insp-code pattern">{serializeKeywordPattern(d)}</div>
          <div className="insp-groups">
            {d.groups.map((g, i) => (
              <div key={i} className="insp-group">
                <span className="insp-group-n">Group {i + 1}</span>
                <div className="prev-chips">
                  {g.map((k) => (
                    <span key={k} className="prev-chip">
                      {k}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="insp-meta-line">
            Logic: <b>{d.operator}</b> across groups
            {d.operator === "AND" && d.proximity ? ` · within ${d.proximity} words` : ""} · OR within each group
          </div>
        </>
      )}

      {/* examples */}
      <div className="insp-examples">
        <div className="ex-col">
          <div className="ex-head pos">
            <Icon name="check" size={12} />
            Should match
          </div>
          {d.positiveExamples.map((ex, i) => (
            <div key={i} className="ex-line">
              {ex}
            </div>
          ))}
        </div>
        {d.negativeExamples && d.negativeExamples.length > 0 && (
          <div className="ex-col">
            <div className="ex-head neg">
              <Icon name="x" size={12} />
              Should not match
            </div>
            {d.negativeExamples.map((ex, i) => (
              <div key={i} className="ex-line">
                {ex}
              </div>
            ))}
          </div>
        )}
      </div>

      {d.notes && d.notes.length > 0 && (
        <div className="insp-notes">
          {d.notes.map((n, i) => (
            <div key={i} className="insp-note">
              <Icon name="info" size={13} />
              {n}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
