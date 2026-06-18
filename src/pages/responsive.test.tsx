// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import PolicyCreator from "./PolicyCreator";
import Extractor from "./Extractor";
import { setGlobalDismiss } from "../lib/wizard";

// Keep the wizard front door out of the way so we render straight into the app.
beforeEach(() => setGlobalDismiss(true));
afterEach(() => {
  cleanup();
  localStorage.clear();
});

function renderAppAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<PolicyCreator />} />
        <Route path="/trusted-domain-extractor" element={<Extractor />} />
      </Routes>
    </MemoryRouter>,
  );
}

// jsdom has no layout engine, so these guard the DOM hooks the responsive CSS
// depends on: the truncating brand-text wrapper, full (non-clipped) type-tab
// labels, and primary-nav links that keep an accessible name when collapsed to
// icons at narrow widths.
describe("narrow-width layout hooks", () => {
  it("wraps the topbar title in the shrinkable .brand-text block", () => {
    const { container } = renderAppAt("/");
    const text = container.querySelector(".brand-text");
    expect(text).toBeTruthy();
    expect(text?.querySelector(".brand-title")?.textContent).toBe("AEDLP Policy Creator");
  });

  it("does the same on the extractor page", () => {
    const { container } = renderAppAt("/trusted-domain-extractor");
    expect(container.querySelector(".brand-text .brand-title")?.textContent).toBe(
      "Trusted Domain Extractor",
    );
  });

  it("renders every type tab with its full label (the row scrolls, never clips)", () => {
    renderAppAt("/");
    for (const label of ["All", "Regex", "Keywords", "Pattern", "Recipients", "File types"]) {
      expect(screen.getByRole("button", { name: new RegExp(label) })).toBeTruthy();
    }
  });

  it("keeps full accessible names on the icon-collapsible primary nav", () => {
    renderAppAt("/");
    expect(screen.getByRole("link", { name: "Policy Creator" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Trusted domains" })).toBeTruthy();
    // Customer-setup keeps its label reachable when the CSS hides the text.
    expect(
      screen.getByRole("button", { name: "Customer setup — open the policy wizard" }),
    ).toBeTruthy();
  });
});
