/* Badge primitive. Ported from handoff project/app/lib.jsx. */
import type { ReactNode } from "react";

export interface BadgeProps {
  tone?: string;
  mono?: boolean;
  dot?: boolean;
  children?: ReactNode;
}

export function Badge({ tone = "neutral", mono, children, dot }: BadgeProps) {
  return (
    <span className={`badge ${tone} ${mono ? "mono" : ""}`}>
      {dot && <span className="dot"></span>}
      {children}
    </span>
  );
}
