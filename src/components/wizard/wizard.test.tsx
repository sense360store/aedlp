// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { Wizard } from "./Wizard";
import { industryHint } from "../../lib/wizard";
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

  it("shows the list-scope note until an industry is picked, then its coverage hint", () => {
    setup();
    // Before a choice the dropdown explains why the list is short…
    expect(screen.getByText(/Only industries with their own detectors are listed/i)).toBeTruthy();

    // …and selecting one replaces it with that sector's short coverage hint.
    fireEvent.change(screen.getByLabelText("Industry"), { target: { value: "Financial services" } });
    const hint = industryHint("Financial services");
    expect(hint).not.toBe("");
    expect(screen.getByText(hint)).toBeTruthy();
    expect(screen.queryByText(/Only industries with their own detectors are listed/i)).toBeNull();

    // The hint tracks the current selection rather than pinning to the first.
    fireEvent.change(screen.getByLabelText("Industry"), { target: { value: "Technology & SaaS" } });
    expect(screen.getByText(industryHint("Technology & SaaS"))).toBeTruthy();
    expect(screen.queryByText(hint)).toBeNull();
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
    expect(screen.getByText("Build domain lists (optional)")).toBeTruthy();
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
    expect(onFinish).toHaveBeenCalledWith({ customer: "Globex", industry: "Financial services" }, false, null, null);
    expect(mockParseFile).not.toHaveBeenCalled();
  });

  it("finishing with no file uploaded also carries no trusted list", () => {
    const { onFinish } = setup();
    goToStepTwo();
    fireEvent.click(screen.getByRole("button", { name: "Start in Policy Creator" }));
    expect(onFinish).toHaveBeenCalledWith({ customer: "Globex", industry: "Financial services" }, false, null, null);
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
    expect(onFinish).toHaveBeenCalledWith({ customer: "Globex", industry: "Financial services" }, false, EXTRACTED, null);
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
    expect(onFinish).toHaveBeenCalledWith({ customer: "Globex", industry: "Financial services" }, false, null, null);
  });

  it("carries the don't-show-again choice through a step-two finish", async () => {
    mockParseFile.mockResolvedValue({ kind: "result", result: PARSED });
    const { onFinish } = setup();
    goToStepTwo();
    fireEvent.click(screen.getByRole("checkbox"));
    uploadFile(new File(["data"], "enforcer.xlsx"));
    await screen.findByText(/2 trusted domains found/i);
    fireEvent.click(screen.getByRole("button", { name: "Start in Policy Creator" }));
    expect(onFinish).toHaveBeenCalledWith({ customer: "Globex", industry: "Financial services" }, true, EXTRACTED, null);
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

/* ============ step two: competitor lookup (the BLOCK-LIST output) ============ */
describe("Wizard step two — competitor lookup (block-list)", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  function httpJson(status: number, body: unknown): Response {
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  }
  const CF_SAMPLE = {
    suggestions: [
      { name: "Globex Rival", domain: "globex-rival.example", confidence: "high", verified: true, rationale: "Direct competitor." },
      { name: "Initech", domain: "initech.example", confidence: "medium", verified: false, rationale: "Adjacent." },
    ],
    notes: "Found 2 competitor suggestions.",
  };

  it("offers an explicit, company-named lookup button and does NOT auto-run on Next", () => {
    fetchMock.mockResolvedValue(httpJson(200, CF_SAMPLE));
    setup();
    goToStepTwo("Globex", "Financial services");
    // The button names the company entered in step one…
    expect(screen.getByRole("button", { name: "Find competitors for Globex" })).toBeTruthy();
    // …and reaching the step via Next never spends the paid call on its own.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("runs the lookup with the wizard's company + industry only when the button is clicked", async () => {
    fetchMock.mockResolvedValue(httpJson(200, CF_SAMPLE));
    setup();
    goToStepTwo("Globex", "Financial services");
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Find competitors for Globex" }));
    await screen.findByText("globex-rival.example");

    // Fired exactly once, carrying the company + industry from step one.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ company: "Globex", industry: "Financial services" });
    // Unverified rows are flagged, never dropped.
    expect(screen.getByText("Verified")).toBeTruthy();
    expect(screen.getByText("Unverified")).toBeTruthy();
  });

  it("carries the SELECTED competitor domains up on finish as a separate block-list (trusted stays null)", async () => {
    fetchMock.mockResolvedValue(httpJson(200, CF_SAMPLE));
    const { onFinish } = setup();
    goToStepTwo("Globex", "Financial services");
    fireEvent.click(screen.getByRole("button", { name: "Find competitors for Globex" }));
    await screen.findByText("globex-rival.example");

    // Curate one competitor domain, then finish.
    fireEvent.click(screen.getByRole("checkbox", { name: /Select Globex Rival/ }));
    fireEvent.click(screen.getByRole("button", { name: "Start in Policy Creator" }));

    // 4th arg = curated competitor block-list; 3rd arg (trusted allow-list) = null (no upload).
    expect(onFinish).toHaveBeenCalledWith(
      { customer: "Globex", industry: "Financial services" },
      false,
      null,
      ["globex-rival.example"],
    );
  });

  it("hands up null competitors when the lookup ran but nothing was selected (no auto-add)", async () => {
    fetchMock.mockResolvedValue(httpJson(200, CF_SAMPLE));
    const { onFinish } = setup();
    goToStepTwo("Globex", "Financial services");
    fireEvent.click(screen.getByRole("button", { name: "Find competitors for Globex" }));
    await screen.findByText("globex-rival.example");
    // Nothing ticked → finishing carries no block-list (null), not an empty array.
    fireEvent.click(screen.getByRole("button", { name: "Start in Policy Creator" }));
    expect(onFinish).toHaveBeenCalledWith(
      { customer: "Globex", industry: "Financial services" },
      false,
      null,
      null,
    );
  });
});

/* ===================== accessibility: focus management ===================== */
describe("Wizard accessibility — dialog focus", () => {
  // A trigger button + a wizard whose open state it controls, so we can assert
  // focus moves into the dialog on open and returns to the trigger on close.
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button data-testid="trigger" onClick={() => setOpen(true)}>
          Open
        </button>
        <Wizard
          open={open}
          industries={INDUSTRIES}
          onFinish={() => setOpen(false)}
          onSkip={() => setOpen(false)}
        />
      </>
    );
  }

  it("moves focus into the dialog (the first field) on open", () => {
    setup();
    expect(document.activeElement).toBe(screen.getByPlaceholderText(/Globex Corporation/));
  });

  it("is a labelled modal dialog whose title/description ids resolve", () => {
    setup();
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const labelId = dialog.getAttribute("aria-labelledby")!;
    const descId = dialog.getAttribute("aria-describedby")!;
    expect(document.getElementById(labelId)?.textContent).toMatch(/Set up a policy/i);
    expect(document.getElementById(descId)).not.toBeNull();
  });

  it("traps Tab inside the dialog, wrapping last→first and first→last", () => {
    setup();
    fillStepOne("Globex", "Financial services"); // enables Next so it is focusable
    const dialog = screen.getByRole("dialog");
    const close = screen.getByRole("button", { name: "Close" });
    const next = screen.getByRole("button", { name: "Next" });

    // Tab off the last focusable wraps to the first (the close button).
    next.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(close);

    // Shift+Tab off the first focusable wraps to the last (Next).
    close.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(next);
  });

  it("reclaims focus into the dialog if it has escaped on Tab", () => {
    setup();
    const dialog = screen.getByRole("dialog");
    (document.activeElement as HTMLElement)?.blur(); // focus now on <body>
    expect(dialog.contains(document.activeElement)).toBe(false);
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
  });

  it("returns focus to the trigger when closed via Escape", () => {
    render(<Harness />);
    const trigger = screen.getByTestId("trigger");
    trigger.focus();
    fireEvent.click(trigger);

    // Opened: focus has moved into the dialog…
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByPlaceholderText(/Globex Corporation/));

    // …and Escape closes it and hands focus back to the trigger.
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("focuses the dropzone on step two, and it is keyboard-operable (Enter/Space)", () => {
    setup();
    goToStepTwo();
    const dz = document.querySelector(".wiz-dropzone") as HTMLElement;
    expect(dz.getAttribute("role")).toBe("button");
    expect(dz.getAttribute("tabindex")).toBe("0");
    expect(dz.getAttribute("aria-label")).toMatch(/enforcer export/i);
    // Focus lands on the dropzone (first control of step two), not the close icon.
    expect(document.activeElement).toBe(dz);

    // Enter and Space both activate it, opening the hidden file picker.
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, "click").mockImplementation(() => {});
    fireEvent.keyDown(dz, { key: "Enter" });
    fireEvent.keyDown(dz, { key: " " });
    expect(clickSpy).toHaveBeenCalledTimes(2);
    clickSpy.mockRestore();
  });
});
