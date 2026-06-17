/* CopyButton primitive. Ported from handoff project/app/lib.jsx.
   Accepts a string or a lazy () => string, and flips to a "Copied"
   state for 1.4s after a successful copy. */
import { useState, type MouseEvent } from "react";
import { Icon, type IconName } from "./Icon";
import { copyText } from "./clipboard";

export interface CopyButtonProps {
  value: string | (() => string);
  label?: string;
  big?: boolean;
  className?: string;
  icon?: IconName;
}

export function CopyButton({ value, label = "Copy", big, className = "", icon = "copy" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const onClick = async (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const ok = await copyText(typeof value === "function" ? value() : value);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }
  };
  return (
    <button className={`copybtn ${big ? "big" : ""} ${copied ? "copied" : ""} ${className}`} onClick={onClick}>
      <Icon name={copied ? "check" : icon} size={big ? 15 : 13} />
      {copied ? "Copied" : label}
    </button>
  );
}
