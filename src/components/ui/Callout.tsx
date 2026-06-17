/* Callout primitive. Ported from handoff project/app/lib.jsx. */
import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export interface CalloutProps {
  tone?: string;
  title?: ReactNode;
  icon?: IconName;
  children?: ReactNode;
}

export function Callout({ tone = "info", title, icon, children }: CalloutProps) {
  const ic: IconName = icon || (tone === "warn" ? "alert" : tone === "danger" ? "danger" : "info");
  return (
    <div className={`callout ${tone}`}>
      <Icon name={ic} size={16} className="c-icon" />
      <div className="c-body">
        {title && <div className="c-title">{title}</div>}
        <div>{children}</div>
      </div>
    </div>
  );
}
