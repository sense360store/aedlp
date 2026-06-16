import { useState } from "react";
import { Icon } from "./Icon";
import type { ReactNode } from "react";
import type { Risk, Confidence } from "../../types";

/* ---------- clipboard ---------- */
export function copyText(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => resolve(true)).catch(() => resolve(fallbackCopy(text)));
    } else {
      resolve(fallbackCopy(text));
    }
  });
}
function fallbackCopy(text: string): boolean {
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta); return ok;
  } catch { return false; }
}

/* ---------- tone helpers ---------- */
export type Tone = "neutral" | "ok" | "warn" | "danger" | "info";
export const riskTone = (r: Risk): Tone => (({ low: "ok", medium: "warn", high: "danger" } as const)[r] ?? "neutral");
export const confTone = (c: Confidence): Tone => (({ low: "neutral", medium: "info", high: "ok" } as const)[c] ?? "neutral");

/* ---------- Badge ---------- */
export function Badge({ tone = "neutral", mono, children, dot }: {
  tone?: Tone; mono?: boolean; children: ReactNode; dot?: boolean;
}) {
  return <span className={`badge ${tone} ${mono ? "mono" : ""}`}>{dot && <span className="dot" />}{children}</span>;
}

/* ---------- Card ---------- */
export function Card({ step, title, desc, right, children, headBorder = true, className = "" }: {
  step?: string; title?: string; desc?: string; right?: ReactNode;
  children: ReactNode; headBorder?: boolean; className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || step) && (
        <div className={`card-head ${headBorder ? "" : "no-border"}`}>
          {step && <div className="card-step-badge">{step}</div>}
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

/* ---------- Callout ---------- */
export function Callout({ tone = "info", title, icon, children }: {
  tone?: Tone; title?: string; icon?: string; children: ReactNode;
}) {
  const ic = icon || (tone === "warn" ? "alert" : tone === "danger" ? "danger" : "info");
  return (
    <div className={`callout ${tone}`}>
      <Icon name={ic} size={16} className="c-icon" />
      <div className="c-body">{title && <div className="c-title">{title}</div>}<div>{children}</div></div>
    </div>
  );
}

/* ---------- CopyButton ---------- */
export function CopyButton({ value, label = "Copy", big, className = "" }: {
  value: string | (() => string); label?: string; big?: boolean; className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const onClick = async () => {
    const ok = await copyText(typeof value === "function" ? value() : value);
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1400); }
  };
  return (
    <button className={`copybtn ${big ? "big" : ""} ${copied ? "copied" : ""} ${className}`} onClick={onClick}>
      <Icon name={copied ? "check" : "copy"} size={big ? 15 : 13} />
      {copied ? "Copied" : label}
    </button>
  );
}

/* ---------- RegexHighlight ---------- */
import { tokenizeRegex } from "../../lib/regex";
export function RegexHighlight({ pattern }: { pattern: string }) {
  return <>{tokenizeRegex(pattern).map((t, i) => <span key={i} className={`tok ${t.cls}`}>{t.text}</span>)}</>;
}
