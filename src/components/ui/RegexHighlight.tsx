/* RegexHighlight primitive. Ported from handoff project/app/lib.jsx.
   Renders tokenizeRegex output with the tok-* classes from styles.css. */
import { tokenizeRegex } from "../../lib/regex";

export interface RegexHighlightProps {
  pattern: string;
}

export function RegexHighlight({ pattern }: RegexHighlightProps) {
  const toks = tokenizeRegex(pattern);
  return (
    <>
      {toks.map((t, idx) => (
        <span key={idx} className={"tok " + t.cls}>
          {t.text}
        </span>
      ))}
    </>
  );
}
