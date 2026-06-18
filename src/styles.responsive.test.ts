import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// styles.css drives the responsive behaviour (jsdom has no layout engine, so we
// assert the rules that make the narrow-width layout work are present and scoped
// to the mobile breakpoint without touching the desktop layout). Mirrors the
// file-content approach in index-html.test.ts.
const css = readFileSync(fileURLToPath(new URL("./styles.css", import.meta.url)), "utf8");

/** Bodies of every `@media (max-width: <bp>px)` block, concatenated. (There can
    be more than one block per breakpoint.) */
function mediaBlock(bp: number): string {
  const needle = `@media (max-width: ${bp}px)`;
  const bodies: string[] = [];
  let from = 0;
  for (;;) {
    const start = css.indexOf(needle, from);
    if (start === -1) break;
    const open = css.indexOf("{", start);
    let depth = 0;
    for (let i = open; i < css.length; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") {
        depth--;
        if (depth === 0) {
          bodies.push(css.slice(open + 1, i));
          from = i + 1;
          break;
        }
      }
    }
  }
  expect(bodies.length, `expected a @media (max-width: ${bp}px) block`).toBeGreaterThan(0);
  return bodies.join("\n");
}

describe("responsive layout rules", () => {
  it("lets the brand title truncate instead of overlapping the controls", () => {
    expect(css).toMatch(/\.brand-text\s*\{[^}]*min-width:\s*0/);
    expect(css).toMatch(/\.brand-title\s*\{[^}]*text-overflow:\s*ellipsis/);
  });

  it("stacks the two-column layout into one at the desktop breakpoint", () => {
    expect(mediaBlock(1120)).toMatch(/\.main\s*\{[^}]*grid-template-columns:\s*1fr/);
  });

  it("collapses the topbar nav at the mobile breakpoint", () => {
    const m = mediaBlock(600);
    // Subtitle + meta tag hidden, nav links go icon-only.
    expect(m).toMatch(/\.brand-sub\s*\{[^}]*display:\s*none/);
    expect(m).toMatch(/\.topnav-link span\s*\{[^}]*display:\s*none/);
  });

  it("scrolls the type-tab control rather than clipping the long labels", () => {
    const m = mediaBlock(600);
    expect(m).toMatch(/\.type-tabs\s*\{[^}]*overflow-x:\s*auto/);
    // Tabs size to their content (full label) instead of being squashed to flex:1.
    expect(m).toMatch(/\.type-tab\s*\{[^}]*flex:\s*0 0 auto/);
  });
});
