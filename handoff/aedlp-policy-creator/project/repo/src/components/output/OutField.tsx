import { CopyButton } from "../ui";
import type { CSSProperties } from "react";

export function OutField({ name, value, mono = true }: { name: string; value: string; mono?: boolean }) {
  const style: CSSProperties | undefined = mono ? undefined : { fontFamily: "var(--font-sans)" };
  return (
    <div className="out-field">
      <div className="out-label">
        <span className="ol-name">{name}</span>
        <CopyButton value={() => value} />
      </div>
      <div className="out-value" style={style}>{value}</div>
    </div>
  );
}
