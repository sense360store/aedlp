/* Per-type collapsed preview for a library row.
   Ported from handoff project/app/library.jsx. */
import { RegexHighlight } from "../ui/RegexHighlight";
import { serializeKeywordPattern } from "../../lib/match";
import type { Detector } from "../../types";

export function ContentPreview({ d }: { d: Detector }) {
  if (d.conditionType === "regular_expression")
    return (
      <code className="prev-code">
        <RegexHighlight pattern={d.regex} />
      </code>
    );
  if (d.conditionType === "keyword")
    return (
      <div className="prev-chips">
        {d.keywords.slice(0, 6).map((k) => (
          <span key={k} className="prev-chip">
            {k}
          </span>
        ))}
        {d.keywords.length > 6 && <span className="prev-more">+{d.keywords.length - 6}</span>}
      </div>
    );
  if (d.conditionType === "recipient_domain")
    return (
      <div className="prev-chips">
        {d.domains.slice(0, 5).map((k) => (
          <span key={k} className="prev-chip mono">
            {k}
          </span>
        ))}
        {d.domains.length > 5 && <span className="prev-more">+{d.domains.length - 5} domains</span>}
      </div>
    );
  if (d.conditionType === "file_extension")
    return (
      <div className="prev-chips">
        {d.extensions.slice(0, 8).map((k) => (
          <span key={k} className="prev-chip ext">
            {k}
          </span>
        ))}
        {d.extensions.length > 8 && <span className="prev-more">+{d.extensions.length - 8} more</span>}
      </div>
    );
  return <code className="prev-code pattern">{serializeKeywordPattern(d)}</code>;
}
