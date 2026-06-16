import { useState } from "react";
import { Card, Callout } from "./ui";
import { Icon } from "./ui/Icon";

export function ContextKeywords({ keywords, setKeywords }: {
  keywords: string[]; setKeywords: (v: string[]) => void;
}) {
  const [val, setVal] = useState("");
  const add = () => {
    const t = val.trim();
    if (t && !keywords.some((k) => k.toLowerCase() === t.toLowerCase())) setKeywords([...keywords, t]);
    setVal("");
  };
  return (
    <Card step="5" title="Context keywords" desc="Pair with the regex to cut false positives on broad identifiers.">
      <Callout tone="info" icon="info">
        Context keywords help when a numeric or alphanumeric identifier is too broad on its own. In Architect, combine
        them with the regex condition using <b>AND</b>.
      </Callout>
      <div className="kw-list" style={{ marginTop: 12 }}>
        {keywords.length === 0 && <span className="hint">No keywords yet — add a few below.</span>}
        {keywords.map((k) => (
          <span key={k} className="kw">{k}
            <button onClick={() => setKeywords(keywords.filter((x) => x !== k))} aria-label={`Remove ${k}`}>
              <Icon name="x" size={11} />
            </button>
          </span>
        ))}
      </div>
      <div className="kw-add">
        <input className="input" placeholder="Add a keyword…" value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <button className="btn" onClick={add}><Icon name="plus" size={14} />Add</button>
      </div>
    </Card>
  );
}
