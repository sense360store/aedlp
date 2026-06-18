/* Accessible, portal-rendered description tooltip.

   A small info-icon button reveals its content on hover and on keyboard focus,
   and on touch (a tap focuses the button, which reveals it). The popover is
   rendered into <body> via a portal and positioned with fixed coordinates from
   the trigger's bounding box, so it escapes the library row's overflow:hidden
   and the column's scroll clipping. Dismissed on blur and on Escape.

   Follows the ARIA tooltip pattern: the trigger references a role="tooltip"
   element via aria-describedby while it is shown. */
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

export interface InfoTipProps {
  /** Primary tooltip text — e.g. the detector's description. Blank → renders nothing. */
  text: string;
  /** Optional compact secondary line (e.g. false-positive risk + recommended action). */
  meta?: ReactNode;
  /** Accessible name for the trigger button. */
  label?: string;
}

interface TipPos {
  top: number;
  left: number;
}

export function InfoTip({ text, meta, label = "Show description" }: InfoTipProps) {
  const trimmed = (text ?? "").trim();
  // Hover and focus are tracked apart so a stray pointer-leave never hides a tip
  // that was opened with the keyboard; it stays until blur or Escape.
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const open = hovered || focused;
  const [pos, setPos] = useState<TipPos | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const tipId = useId();

  // Anchor the popover to the trigger, flipping above when there is no room below
  // and clamping into the viewport so it is never cut off at narrow widths.
  const place = useCallback(() => {
    const btn = btnRef.current;
    const tip = tipRef.current;
    if (!btn || !tip) return;
    const r = btn.getBoundingClientRect();
    const margin = 8;
    const gap = 8;
    const tipW = tip.offsetWidth;
    const tipH = tip.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = r.left + r.width / 2 - tipW / 2;
    left = Math.max(margin, Math.min(left, vw - tipW - margin));
    let top = r.bottom + gap;
    if (top + tipH > vh - margin && r.top - gap - tipH >= margin) {
      top = r.top - gap - tipH;
    }
    setPos({ top, left });
  }, []);

  // Position before paint so the popover never flashes at the wrong spot.
  useLayoutEffect(() => {
    if (open) place();
    else setPos(null);
  }, [open, place]);

  // Keep it anchored while shown if the page (or a scroll container) moves.
  useEffect(() => {
    if (!open) return;
    const onMove = () => place();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, place]);

  if (!trimmed) return null;

  const style: CSSProperties = pos
    ? { top: pos.top, left: pos.left }
    : { top: 0, left: 0, visibility: "hidden" };

  return (
    <span className="info-tip">
      <button
        ref={btnRef}
        type="button"
        className="info-tip-btn"
        aria-label={label}
        aria-describedby={open ? tipId : undefined}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        // Keep a tap/click from toggling the row open — the tip already shows on focus.
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            e.stopPropagation();
            setHovered(false);
            setFocused(false);
            btnRef.current?.blur();
          }
        }}
      >
        <Icon name="info" size={14} />
      </button>
      {open &&
        createPortal(
          <div ref={tipRef} id={tipId} role="tooltip" className="info-tip-pop" style={style}>
            <span className="info-tip-text">{trimmed}</span>
            {meta && <span className="info-tip-meta">{meta}</span>}
          </div>,
          document.body,
        )}
    </span>
  );
}
