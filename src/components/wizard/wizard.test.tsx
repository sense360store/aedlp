// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { Wizard } from "./Wizard";
import type { ParseOutcome } from "../../lib/parseClient";
import type { ParsedResult } from "../../lib/extract";

// Step two reuses the extractor's worker client; mock it so the page reaches a
// deterministic state in jsdom (no real Worker). trustedDomainsFromParsed and
// isCSV stay REAL — only the worker boundary is mocked.
vi.mock("../../lib/parseClient", () => ({ parseFile: vi.fn() }));
import { parseFile } from "../../lib/parseClient";
const mockParseFile = vi.mocked(parseFile);

afterEach(cleanup);
beforeEach(() => mockParseFile.mockReset());

const INDUSTRIES = ["Financial services", "Healthcare & life sciences", "Technology & SaaS"];

// A parsed export with two external domains (the trusted third parties) and one
// freemail domain (excluded by the external-default selection).
const PARSED: ParsedResult = {
  map: new Map([
    ["partner.com", { types: new Map([["external", 2]]), total: 2 }],
    ["vendor.io", { types: new Map([["external", 1]]), total: 1 }],
    ["gmail.com", { types: new Map([["freemail", 3]]), total: 3 }],
  ]),
  scanned: 6,
  typeTotals: new Map([
    ["external", 3],
    ["freemail", 3],
  ]),
  sheetName: "unauthorised_contacts",
};
const EXTRACTED = ["partner.com", "vendor.io"]; // external, sorted

function setup(open = true) {
  const onFinish = vi.fn();
  const onSkip = vi.fn();
  const utils = render(<Wizard open={open} industries={INDUSTRIES} onFinish={onFinish} onSkip={onSkip} />);
  return { ...utils, onFinish, onSkip };
}

function fillStepOne(customer = "Globex", industry = "Financial services") {
  fireEvent.change(screen.getByPlaceholderText(/Globex Corporation/), { target: { value: customer } });
  fireEvent.change(screen.getByLabelText("Industry"), { target: { value: industry } });
}
function goToStepTwo(customer?: string, industry?: string) {
  fillStepOne(customer, industry);
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
}
function uploadFile(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

/* ============================ step one ============================ */
describe("Wizard step one", () => {
  it("renders nothing when closed", () => {
    const { container } = setup(false);
    expect(container.querySelector(".wiz")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders a labelled dialog open on step one", () => {
    setup();
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByText("Set up a policy for a customer")).toBeTruthy();
    expect(screen.getByText("Step 1 of 2")).toBeTruthy();
  });

  it("offers exactly the supplied industries plus a disabled placeholder", () => {
    setup();
    const select = screen.getByLabelText("Industry") as HTMLSelectElement;
    const values = [...select.options].map((o) => o.value);
    expect(values).toEqual(["", ...INDUSTRIES]);
    expect(select.options[0].disabled).toBe(true);
  });

  it("disables Next until a customer name AND an industry are chosen", () => {
    setup();
    const next = screen.getByRole("button", { name: "Next" }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText(/Globex Corporation/), { target: { value: "Globex" } });
    expect(next.disabled).toBe(true); // industry still unset

    fireEvent.change(screen.getByLabelText("Industry"), { target: { value: "Financial services" } });
    expect(next.disabled).toBe(false);
  });

  it("advances to step two (not finish) on Next and on Enter in the customer field", () => {
    const { onFinish } = setup();
    fillStepOne("Globex", "Financial services");
    const input = screen.getByPlaceholderText(/Globex Corporation/);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("Upload an enforcer export (optional)")).toBeTruthy();
    expect(screen.getByText("Step 2 of 2")).toBeTruthy();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it("treats Skip, Close and Escape the same on step one — all call onSkip, never onFinish", () => {
    let h = setup();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(h.onSkip).toHaveBeenCalledWith(false);
    expect(h.onFinish).not.toHaveBeenCalled();
    cleanup();

    h = setup();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(h.onSkip).toHaveBeenCalledWith(false);
    cleanup();

    h = setup();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(h.onSkip).toHaveBeenCalledWith(false);
    expect(h.onFinish).not.toHaveBeenCalled();
  });

  it("carries the don't-show-again choice through Skip", () => {
    const { onSkip } = setup();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(onSkip).toHaveBeenCalledWith(true);
  });

  it("dismisses (as Skip) when the backdrop is pressed, but not when the dialog is", () => {
    const { container, onSkip } = setup();
    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(onSkip).not.toHaveBeenCalled();
    fireEvent.mouseDown(container.querySelector(".wiz-overlay")!);
    expect(onSkip).toHaveBeenCalledWith(false);
  });
});

/* ============================ step two ============================ */
describe("Wizard step two (optional enforcer-export upload)", () => {
  it("shows an optional upload step with a dropzone and a clear skip", () => {
    setup();
    goToStepTwo();
    expect(document.querySelector(".wiz-dropzone")).not.toBeNull();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.getAttribute("accept")).toBe(".xlsx,.csv");
    expect(screen.getByRole("button", { name: "Skip this step" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
  });

  it("'Skip this step' finishes with the account and NO trusted list (Phase A)", () => {
    const { onFinish } = setup();
    goToStepTwo("Globex", "Financial services");
    fireEvent.click(screen.getByRole("button", { name: "Skip this step" }));
    expect(onFinish).toHaveBeenCalledWith({ customer: "Globex", industry: "Financial services" }, false, null);
    expect(mockParseFile).not.toHaveBeenCalled();
  });

  it("finishing with no file uploaded also carries no trusted list", () => {
    const { onFinish } = setup();
    goToStepTwo();
    fireEvent.click(screen.getByRole("button", { name: "Start in Policy Creator" }));
    expect(onFinish).toHaveBeenCalledWith({ customer: "Globex", industry: "Financial services" }, false, null);
  });

  it("Back returns to step one without finishing", () => {
    const { onFinish } = setup();
    goToStepTwo();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Set up a policy for a customer")).toBeTruthy();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it("parses an uploaded export via the worker client and carries the extracted domains on finish", async () => {
    mockParseFile.mockResolvedValue({ kind: "result", result: PARSED });
    const { onFinish } = setup();
    goToStepTwo("Globex", "Financial services");
    uploadFile(new File(["data"], "enforcer.xlsx"));

    // Lands in the ready state with the extracted-domain summary + preview.
    await screen.findByText(/2 trusted domains found/i);
    expect(mockParseFile).toHaveBeenCalledTimes(1);
    expect((mockParseFile.mock.calls[0][0] as File).name).toBe("enforcer.xlsx");
    expect(screen.getByText("partner.com")).toBeTruthy();
    expect(screen.getByText("vendor.io")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Start in Policy Creator" }));
    expect(onFinish).toHaveBeenCalledWith({ customer: "Globex", industry: "Financial services" }, false, EXTRACTED);
  });

  it("shows the existing progress indicator while parsing", async () => {
    let resolveParse!: (o: ParseOutcome) => void;
    const pending = new Promise<ParseOutcome>((res) => {
      resolveParse = res;
    });
    mockParseFile.mockImplementation((_f, opts) => {
      opts?.onProgress?.(0.5);
      return pending;
    });
    setup();
    goToStepTwo();
    uploadFile(new File(["data"], "enforcer.xlsx"));

    // While the worker is in flight the spinner + progress bar (the existing
    // extractor indicator) are shown, tracking the reported progress.
    await waitFor(() => expect(document.querySelector(".spinner")).not.toBeNull());
    expect((document.querySelector(".prog-bar") as HTMLElement).style.width).toBe("50%");

    // Let it finish; the progress UI gives way to the ready summary.
    resolveParse({ kind: "result", result: PARSED });
    await screen.findByText(/2 trusted domains found/i);
    expect(document.querySelector(".spinner")).toBeNull();
  });

  it("offers a sheet picker when the parser can't choose, then parses the chosen sheet", async () => {
    mockParseFile
      .mockResolvedValueOnce({ kind: "sheet", names: ["breaches", "contacts"] })
      .mockResolvedValueOnce({ kind: "result", result: PARSED });
    setup();
    goToStepTwo();
    uploadFile(new File(["data"], "enforcer.xlsx"));

    await screen.findByText(/Pick the sheet/i);
    fireEvent.click(screen.getByRole("button", { name: /contacts/ }));
    await screen.findByText(/2 trusted domains found/i);
    expect(mockParseFile.mock.calls[1][1]?.sheetName).toBe("contacts");
  });

  // A malformed file (the worker client rejecting) is covered in
  // wizard-upload-failure.test.tsx — a plain rejecting module mock there avoids
  // vitest's vi.fn rejected-promise tracking, which flags the (handled)
  // rejection regardless. The empty-sheet path below is the sibling case.

  it("treats a parsed-but-empty sheet as no usable list", async () => {
    mockParseFile.mockResolvedValue({
      kind: "result",
      result: { map: new Map(), scanned: 0, typeTotals: new Map(), sheetName: "(empty)" },
    });
    const { onFinish } = setup();
    goToStepTwo();
    uploadFile(new File(["data"], "enforcer.csv"));

    await screen.findByText(/No usable trusted domains/i);
    fireEvent.click(screen.getByRole("button", { name: "Start in Policy Creator" }));
    expect(onFinish).toHaveBeenCalledWith({ customer: "Globex", industry: "Financial services" }, false, null);
  });

  it("carries the don't-show-again choice through a step-two finish", async () => {
    mockParseFile.mockResolvedValue({ kind: "result", result: PARSED });
    const { onFinish } = setup();
    goToStepTwo();
    fireEvent.click(screen.getByRole("checkbox"));
    uploadFile(new File(["data"], "enforcer.xlsx"));
    await screen.findByText(/2 trusted domains found/i);
    fireEvent.click(screen.getByRole("button", { name: "Start in Policy Creator" }));
    expect(onFinish).toHaveBeenCalledWith({ customer: "Globex", industry: "Financial services" }, true, EXTRACTED);
  });

  it("Escape on step two cancels the whole wizard (onSkip), never finishing", () => {
    const { onFinish, onSkip } = setup();
    goToStepTwo();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onSkip).toHaveBeenCalledWith(false);
    expect(onFinish).not.toHaveBeenCalled();
  });

  it("never makes a network call carrying the file (local-only guarantee)", async () => {
    // The real parser is the local Web Worker (no network by construction; see
    // xlsx-stream.test.ts). This guards the UI layer: the wizard issues no
    // fetch/XHR of its own while handling the file.
    mockParseFile.mockResolvedValue({ kind: "result", result: PARSED });
    const realFetch = globalThis.fetch;
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const xhrOpen = vi.spyOn(XMLHttpRequest.prototype, "open");
    try {
      const { onFinish } = setup();
      goToStepTwo();
      uploadFile(new File(["data"], "enforcer.xlsx"));
      await screen.findByText(/2 trusted domains found/i);
      fireEvent.click(screen.getByRole("button", { name: "Start in Policy Creator" }));
      expect(onFinish).toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(xhrOpen).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = realFetch;
      xhrOpen.mockRestore();
    }
  });
});
