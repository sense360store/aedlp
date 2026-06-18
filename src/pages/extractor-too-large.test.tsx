// @vitest-environment jsdom
//
// The too-large guardrail surfaced in the Trusted Domains page: when the worker
// aborts a huge file (rather than OOM the tab), the page must present the calm
// "export as CSV" guidance — an info banner, not the red "couldn't read" wall.
// Uses a plain rejecting module mock (see wizard-upload-failure.test.tsx for why
// a plain function rather than vi.fn) and vi.hoisted so the thrown message is in
// scope for the hoisted vi.mock factory.
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { TOO_LARGE } = vi.hoisted(() => ({
  TOO_LARGE: "This file is very large. Export just the unauthorised_contacts sheet as CSV and upload that.",
}));

vi.mock("../lib/parseClient", () => ({
  parseFile: async () => {
    throw new Error(TOO_LARGE);
  },
}));

import Extractor from "./Extractor";
import { CSV_FALLBACK_MESSAGE } from "../lib/extract";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("Extractor — too-large file guardrail", () => {
  it("shows the calm 'export as CSV' info banner (not a read-failure wall)", async () => {
    // Guard the hoisted literal against drift from the real exported constant.
    expect(TOO_LARGE).toBe(CSV_FALLBACK_MESSAGE);

    const { container } = render(
      <MemoryRouter>
        <Extractor />
      </MemoryRouter>,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "huge.xlsx")] } });

    await screen.findByText(/too large to read in the browser/i);
    const callout = container.querySelector(".callout");
    expect(callout).not.toBeNull();
    // It is the calm info banner, not the warn/error wall…
    expect(callout!.className).toContain("info");
    expect(callout!.className).not.toContain("warn");
    // …and it carries the exact export-as-CSV guidance.
    expect(callout!.textContent).toContain(CSV_FALLBACK_MESSAGE);
  });
});
