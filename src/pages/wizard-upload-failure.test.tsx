// @vitest-environment jsdom
//
// The malformed-file path: the worker client (parseFile) rejects. This lives in
// its own file with a PLAIN rejecting module mock rather than a vi.fn —
// vitest's vi.fn instruments rejected return values and reports the rejection as
// an unhandled error even when the component awaits and catches it (which it
// does; the parse runs in a Web Worker and a failure surfaces as a rejection).
// A plain function mock sidesteps that instrumentation while exercising the real
// catch path. The happy/empty paths (which use vi.fn for call assertions) live
// in wizard.test.tsx and PolicyCreator.test.tsx.
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../lib/parseClient", () => ({
  parseFile: async () => {
    throw new Error("not a zip");
  },
}));

import { Wizard } from "../components/wizard/Wizard";
import PolicyCreator from "./PolicyCreator";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function toStepTwo() {
  fireEvent.change(screen.getByPlaceholderText(/Globex Corporation/), { target: { value: "Globex" } });
  fireEvent.change(screen.getByLabelText("Industry"), { target: { value: "Financial services" } });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
}
function uploadFile(file: File) {
  fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
}

describe("Wizard step two — malformed file (component)", () => {
  it("lands cleanly with a quiet message, no error wall, and finishes with no trusted list", async () => {
    const onFinish = vi.fn();
    render(<Wizard open industries={["Financial services"]} onFinish={onFinish} onSkip={vi.fn()} />);
    toStepTwo();
    uploadFile(new File(["garbage"], "broken.xlsx"));

    // A quiet note — not the extractor's .callout error wall.
    await screen.findByText(/Couldn’t read that file/i);
    expect(document.querySelector(".wiz-note.quiet")).not.toBeNull();
    expect(document.querySelector(".callout")).toBeNull();

    // Finishing still works and carries neither a trusted list nor competitors.
    fireEvent.click(screen.getByRole("button", { name: "Start in Policy Creator" }));
    expect(onFinish).toHaveBeenCalledWith({ customer: "Globex", industry: "Financial services" }, false, null, null);
  });
});

describe("Policy Creator — malformed wizard upload (page)", () => {
  it("lands cleanly with the Phase A pre-fill and writes no trusted list", async () => {
    const { container } = render(
      <MemoryRouter>
        <PolicyCreator />
      </MemoryRouter>,
    );
    toStepTwo();
    uploadFile(new File(["garbage"], "broken.xlsx"));

    await screen.findByText(/Couldn’t read that file/i);
    fireEvent.click(screen.getByRole("button", { name: "Start in Policy Creator" }));

    // Landed with the Phase A pre-filter + pre-fill; nothing persisted, no crash.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect((container.querySelector('select[aria-label="Filter by industry"]') as HTMLSelectElement).value).toBe(
      "Financial services",
    );
    expect((container.querySelector(".policy-draft input.pf-input") as HTMLInputElement).value).toBe(
      "Globex, Financial services DLP",
    );
    expect(localStorage.getItem("aedlp_trusted_domains")).toBeNull();
  });
});
