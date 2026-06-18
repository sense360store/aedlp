// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { setGlobalDismiss } from "../lib/wizard";

// Flip the one remaining hidden surface (the test panel) back on to prove its
// gating is wired to the flag — re-enabling stays the single edit the flag
// promises. The component and its own tests are unchanged; this only exercises
// the entry points. (The competitor finder is no longer gated — it is a
// first-class feature; its visibility is covered in PolicyCreator.test.tsx.)
vi.mock("../lib/features", () => ({
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

describe("PolicyCreator with FEATURE_TEST_PANEL re-enabled", () => {
  // The wizard front door is orthogonal to this flag — suppress it so the
  // library/test surfaces are the landing view.
  beforeEach(() => setGlobalDismiss(true));

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
});
