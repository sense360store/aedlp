/* Card primitive. Ported from handoff project/app/lib.jsx. */
import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export interface CardProps {
  title?: ReactNode;
  desc?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
  className?: string;
  icon?: IconName;
}

export function Card({ title, desc, right, children, className = "", icon }: CardProps) {
  return (
    <section className={`card ${className}`}>
      {(title || right) && (
        <div className="card-head">
          {icon && (
            <div className="card-icon">
              <Icon name={icon} size={16} />
            </div>
          )}
          <div className="card-titles">
            {title && <div className="card-title">{title}</div>}
            {desc && <div className="card-desc">{desc}</div>}
          </div>
          {right}
        </div>
      )}
      <div className="card-body">{children}</div>
    </section>
  );
}
