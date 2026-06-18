import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Resolve paths relative to the repo root (this file lives in src/).
const repo = (p: string) => fileURLToPath(new URL("../" + p, import.meta.url));
const html = readFileSync(repo("index.html"), "utf8");

/* The front-door document: title, description, theme-color, and a brand favicon
   wired to real files in public/ (which Vite copies verbatim into the build, so
   "the build picks up the favicon files" reduces to "the files exist and
   index.html references them"). */
describe("index.html favicon + document metadata", () => {
  it("ships the three brand favicon assets in public/", () => {
    for (const f of ["favicon.svg", "favicon-32.png", "apple-touch-icon.png"]) {
      expect(existsSync(repo("public/" + f)), `public/${f} should exist`).toBe(true);
    }
  });

  it("does not keep the default Vite favicon", () => {
    expect(html).not.toMatch(/vite\.svg/);
    expect(existsSync(repo("public/vite.svg"))).toBe(false);
  });

  it("wires the icon, 32px fallback and apple-touch-icon link tags", () => {
    expect(html).toMatch(/<link[^>]+rel="icon"[^>]+type="image\/svg\+xml"[^>]+href="\/favicon\.svg"/);
    expect(html).toMatch(/<link[^>]+rel="icon"[^>]+sizes="32x32"[^>]+href="\/favicon-32\.png"/);
    expect(html).toMatch(/<link[^>]+rel="apple-touch-icon"[^>]+sizes="180x180"[^>]+href="\/apple-touch-icon\.png"/);
  });

  it("sets the title, a non-empty description and a theme-color", () => {
    expect(html).toMatch(/<title>AEDLP Policy Creator<\/title>/);
    expect(html).toMatch(/<meta[^>]+name="description"[^>]+content="[^"]+"/);
    expect(html).toMatch(/<meta[^>]+name="theme-color"[^>]+content="#[0-9a-fA-F]{3,8}"/);
  });

  it("references no logo files outside public/ (assets are not hardcoded in code)", () => {
    // index.html only points at the public/ favicon files by absolute path.
    const refs = [...html.matchAll(/href="(\/[^"]+\.(?:svg|png))"/g)].map((m) => m[1]);
    for (const r of refs) {
      expect(existsSync(repo("public" + r)), `${r} should resolve under public/`).toBe(true);
    }
  });
});
