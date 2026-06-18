// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Flip both hidden surfaces back on to prove the gating is wired to the flags
// (and that re-enabling is the single edit the flags promise). The components
// and their own tests are unchanged — this only exercises the entry points.
vi.mock("../lib/features", () => ({
  FEATURE_COMPETITOR_FINDER: true,
  FEATURE_TEST_PANEL: true,
}));

import PolicyCreator from "./PolicyCreator";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <PolicyCreator />
    </MemoryRouter>,
  );
}

describe("PolicyCreator with the hidden surfaces re-enabled", () => {
  it("renders the test panel when FEATURE_TEST_PANEL is on", () => {
    const { container } = renderPage();
    expect(container.querySelector(".test-panel")).not.toBeNull();
    expect(screen.getByText("Test panel")).toBeTruthy();
  });

  it("restores the per-row Test action when FEATURE_TEST_PANEL is on", () => {
    const { container } = renderPage();
    const search = container.querySelector("input.search") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "AWS Access Key ID" } });
    fireEvent.click(container.querySelector(".lib-row-main")!);
    expect(screen.getByRole("button", { name: "Test this" })).toBeTruthy();
  });

  it("surfaces the competitor finder on the Recipients view when FEATURE_COMPETITOR_FINDER is on", () => {
    const { container } = renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Recipients/ }));
    expect(container.querySelector(".col-lib .lib-recipients-bar")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Find competitors with AI" })).toBeTruthy();
  });
});
