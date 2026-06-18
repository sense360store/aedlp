// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// The wizard's optional step two reuses the extractor's worker client; mock it
// so uploads resolve deterministically in jsdom (no real Worker). Only the
// worker boundary is mocked — the trusted-domain extraction and handoff are real.
vi.mock("../lib/parseClient", () => ({ parseFile: vi.fn() }));
import { parseFile } from "../lib/parseClient";
import PolicyCreator from "./PolicyCreator";
import {
  setGlobalDismiss,
  recordCompletedAccount,
  loadWizardState,
  qualifyingIndustries,
} from "../lib/wizard";
import type { ParsedResult } from "../lib/extract";
import { AEDLP_DATA } from "../data/library";

const mockParseFile = vi.mocked(parseFile);

afterEach(() => {
  cleanup();
  localStorage.clear();
  mockParseFile.mockReset();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <PolicyCreator />
    </MemoryRouter>,
  );
}

/** Search for a detector by display name, then click Add in the first row. */
function addByName(container: HTMLElement, name: string) {
  const search = container.querySelector("input.search") as HTMLInputElement;
  fireEvent.change(search, { target: { value: name } });
  const row = container.querySelector<HTMLElement>(".lib-row")!;
  fireEvent.click(within(row).getByRole("button", { name: "Add" }));
}

describe("PolicyCreator page", () => {
  // These exercises target the library / draft, not the front door, so suppress
  // the wizard and land straight in the plain library — the pre-wizard default.
  beforeEach(() => setGlobalDismiss(true));

  it("renders the topbar and the library", () => {
    const { container } = renderPage();
    expect(screen.getByText("AEDLP Policy Creator")).toBeTruthy();
    expect(screen.getByText("Detector library & custom-policy assembler")).toBeTruthy();
    expect(container.querySelectorAll(".lib-row").length).toBe(107);
    expect(container.querySelector(".added-pill")?.textContent).toContain("0 in policy");
  });

  it("updates the in-policy count when a detector is added", () => {
    const { container } = renderPage();
    addByName(container, "AWS Access Key ID");
    expect(container.querySelector(".added-pill")?.textContent).toContain("1 in policy");
    const row = container.querySelector<HTMLElement>(".lib-row")!;
    expect(within(row).getByRole("button", { name: "Added" })).toBeTruthy();
  });

  it("auto-suggests name, action and the Auto tag when a detector is added", () => {
    const { container } = renderPage();
    addByName(container, "AWS Access Key ID");
    const nameInput = container.querySelector(".policy-draft input.pf-input") as HTMLInputElement;
    expect(nameInput.value).toBe("Detect AWS Access Key ID");
    const actionSelect = container.querySelector(".policy-draft select.pf-input") as HTMLSelectElement;
    expect(actionSelect.value).toBe("block");
    expect(container.querySelector(".policy-draft .pf-auto")).not.toBeNull();
  });

  it("drops the Auto tag and shows the Suggestion reset when the name is edited", () => {
    const { container } = renderPage();
    addByName(container, "AWS Access Key ID");
    const nameInput = container.querySelector(".policy-draft input.pf-input") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "My custom name" } });
    expect(nameInput.value).toBe("My custom name");
    const namePf = nameInput.closest(".pf") as HTMLElement;
    expect(within(namePf).queryByText("Auto")).toBeNull();
    expect(within(namePf).getByText("Suggestion")).toBeTruthy();
  });

  it("flips the AND/OR logic from the draft while the test panel is hidden", () => {
    const { container } = renderPage();
    addByName(container, "AWS Access Key ID");
    addByName(container, "UK IBAN");

    // The test panel is gone (FEATURE_TEST_PANEL off), but the operator toggle
    // still lives in the policy draft and drives the joiner pill.
    expect(container.querySelector(".test-panel")).toBeNull();
    expect(container.querySelector(".joiner-pill")?.textContent).toBe("OR");
    fireEvent.click(screen.getByRole("button", { name: "ALL" }));
    expect(container.querySelector(".joiner-pill")?.textContent).toBe("AND");
  });

  it("keeps the test panel and the per-row Test action out of the UI while the flag is off", () => {
    const { container } = renderPage();
    addByName(container, "AWS Access Key ID");

    // No panel, no scroll anchor, no sample box.
    expect(container.querySelector(".test-panel")).toBeNull();
    expect(container.querySelector("#test-anchor")).toBeNull();
    expect(screen.queryByText("Test panel")).toBeNull();

    // The policy column reflows with no empty gap: the draft is its only child
    // (the gated panel/anchor leave nothing behind, not even a spacer node).
    const colPolicy = container.querySelector(".col-policy") as HTMLElement;
    expect(colPolicy.children).toHaveLength(1);
    expect(colPolicy.firstElementChild?.classList.contains("policy-draft")).toBe(true);

    // Expanding a library row no longer offers a dead "Test this" control.
    fireEvent.click(container.querySelector(".lib-row-main")!);
    expect(container.querySelector(".inspector")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Test this" })).toBeNull();
  });

  it("surfaces the AI competitor finder on the Recipients view as a first-class, un-gated feature", () => {
    const { container } = renderPage();

    // Not on a non-recipient view (it builds a recipient-domain condition)…
    expect(container.querySelector(".lib-recipients-bar")).toBeNull();
    expect(screen.queryByRole("button", { name: "Find competitors with AI" })).toBeNull();

    // …but it is a normal, visible feature on the Recipients view — no flag to flip.
    fireEvent.click(screen.getByRole("button", { name: /Recipients/ }));
    expect(container.querySelector(".col-lib .lib-recipients-bar")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Find competitors with AI" })).toBeTruthy();
  });

  it("renders the persistent nav with both destinations, Policy Creator active", () => {
    renderPage();
    const toPolicy = screen.getByRole("link", { name: "Policy Creator" });
    const toExtractor = screen.getByRole("link", { name: "Trusted domains" });
    expect(toPolicy.getAttribute("href")).toBe("/");
    expect(toExtractor.getAttribute("href")).toBe("/trusted-domain-extractor");
    // On "/" the Policy Creator link is the current page.
    expect(toPolicy.getAttribute("aria-current")).toBe("page");
  });

  it("surfaces the saved trusted-domain list for a recipient condition and loads it on demand", () => {
    localStorage.setItem("aedlp_trusted_domains", JSON.stringify(["partner.com", "vendor.com"]));
    const { container } = renderPage();

    // Hidden until the draft has a recipient-domain condition.
    expect(container.querySelector(".trusted-bar")).toBeNull();

    addByName(container, "Personal Webmail"); // rcp-freemail (recipient_domain)
    const bar = container.querySelector(".trusted-bar");
    expect(bar).not.toBeNull();
    expect(bar?.textContent).toContain("2");
    expect(bar?.textContent).toMatch(/ready from your last extract/i);

    // Loading is explicit — nothing happens until "Use" is clicked.
    expect(screen.queryByText("Trusted / allowed recipient domains (from extract)")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Use" }));

    expect(screen.getByText("Trusted / allowed recipient domains (from extract)")).toBeTruthy();
    expect(container.textContent).toContain("partner.com");
    expect(container.textContent).toContain("vendor.com");
  });

  it("shows a quiet prompt and no error when there is no saved trusted-domain list", () => {
    const { container } = renderPage(); // localStorage empty
    addByName(container, "Personal Webmail");

    const bar = container.querySelector(".trusted-bar");
    expect(bar).not.toBeNull();
    expect(bar?.className).toContain("quiet");
    expect(bar?.textContent).not.toMatch(/ready from your last extract/i);
    // It quietly offers to build a list; there is no "Use" action to load nothing.
    expect(screen.getByRole("link", { name: /enforcer export/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Use" })).toBeNull();
  });
});

/* The front door: no wizard suppression here, so the page makes its real
   landing decision from localStorage on each render. */
describe("PolicyCreator wizard front door", () => {
  const industryFilter = (c: HTMLElement) =>
    c.querySelector('select[aria-label="Filter by industry"]') as HTMLSelectElement;
  const nameField = (c: HTMLElement) =>
    c.querySelector(".policy-draft input.pf-input") as HTMLInputElement;
  const descField = (c: HTMLElement) =>
    c.querySelector(".policy-draft textarea.pf-input") as HTMLTextAreaElement;

  // Complete step one then skip the optional upload — the pure Phase A path
  // (no file), which must land identically to the original single-step wizard.
  function complete(container: HTMLElement, customer: string, industry: string) {
    fireEvent.change(screen.getByPlaceholderText(/Globex Corporation/), { target: { value: customer } });
    fireEvent.change(screen.getByLabelText("Industry"), { target: { value: industry } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip this step" }));
    return container;
  }

  it("shows the wizard on first load (no saved state)", () => {
    renderPage();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Set up a policy for a customer")).toBeTruthy();
  });

  it("Skip drops into the library unchanged — full library, no filter, no prefill", () => {
    const { container } = renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(container.querySelectorAll(".lib-row").length).toBe(107);
    expect(industryFilter(container).value).toBe("all");
    expect(nameField(container).value).toBe("");
    expect(container.querySelector(".added-pill")?.textContent).toContain("0 in policy");
  });

  it("offers only qualifying industries in the dropdown, derived from data", () => {
    const { container } = renderPage();
    const select = within(container.querySelector(".wiz")!).getByLabelText("Industry") as HTMLSelectElement;
    const opts = [...select.options].map((o) => o.value).filter(Boolean);
    expect(opts).toEqual(qualifyingIndustries());
    expect(opts).toContain("Financial services"); // a pack industry
    expect(opts).not.toContain("Cross-industry"); // the umbrella
    expect(opts).not.toContain("Education"); // too few of its own detectors
    opts.forEach((o) => expect(AEDLP_DATA.industries).toContain(o));
  });

  it("completing step one pre-filters the industry and pre-fills metadata, adding no conditions", () => {
    const { container } = renderPage();
    complete(container, "Globex", "Financial services");

    expect(screen.queryByRole("dialog")).toBeNull();
    // Industry pre-filter active (and clearable — it is a normal filter value).
    expect(industryFilter(container).value).toBe("Financial services");
    // Metadata pre-filled in the agreed format.
    expect(nameField(container).value).toBe("Globex, Financial services DLP");
    expect(descField(container).value).toBe("DLP policy for Globex (Financial services).");
    const tagBox = container.querySelector(".tag-box")!;
    expect(tagBox.textContent).toContain("globex");
    expect(tagBox.textContent).toContain("financial-services");
    // Nothing added to conditions.
    expect(container.querySelector(".added-pill")?.textContent).toContain("0 in policy");
    expect(container.querySelector(".cond-row")).toBeNull();
  });

  it("keeps the pre-filter clearable back to All industries (a pre-filter, not a lock)", () => {
    const { container } = renderPage();
    complete(container, "Globex", "Financial services");
    fireEvent.change(industryFilter(container), { target: { value: "all" } });
    expect(industryFilter(container).value).toBe("all");
  });

  it("keeps the pre-filled policy name when a detector is added afterwards", () => {
    const { container } = renderPage();
    complete(container, "Globex", "Financial services");
    addByName(container, "AWS Access Key ID");
    // The wizard's metadata is deliberate, so an add does not overwrite it.
    expect(nameField(container).value).toBe("Globex, Financial services DLP");
    expect(container.querySelector(".added-pill")?.textContent).toContain("1 in policy");
  });

  it("skips the wizard and reapplies the account on return", () => {
    recordCompletedAccount({ customer: "Initech", industry: "Technology & SaaS" });
    const { container } = renderPage();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(industryFilter(container).value).toBe("Technology & SaaS");
    expect(nameField(container).value).toBe("Initech, Technology & SaaS DLP");
  });

  it("suppresses the wizard when the global don't-show-again preference is set", () => {
    setGlobalDismiss(true);
    const { container } = renderPage();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(container.querySelectorAll(".lib-row").length).toBe(107);
    expect(industryFilter(container).value).toBe("all");
  });

  it("re-opens the wizard from the topbar control, clearing the global preference", () => {
    setGlobalDismiss(true);
    renderPage();
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Customer setup/ }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(loadWizardState().globalDismiss).toBe(false);
  });

  it("falls back to showing the wizard when stored state is corrupt", () => {
    localStorage.setItem("aedlp_wizard_last", "{ not json");
    localStorage.setItem("aedlp_wizard_global_dismiss", "garbage");
    renderPage();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});

/* Phase B: the optional second step that pre-loads a trusted-domain list from an
   enforcer export and carries it into the landing through the existing handoff. */
describe("PolicyCreator wizard step two (optional enforcer-export upload)", () => {
  const TRUSTED_KEY = "aedlp_trusted_domains";
  const industryFilter = (c: HTMLElement) =>
    c.querySelector('select[aria-label="Filter by industry"]') as HTMLSelectElement;
  const nameField = (c: HTMLElement) => c.querySelector(".policy-draft input.pf-input") as HTMLInputElement;

  // Two external domains (trusted third parties) + one freemail (excluded).
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
  const EXTRACTED = ["partner.com", "vendor.io"];

  function stepOne(customer = "Globex", industry = "Financial services") {
    fireEvent.change(screen.getByPlaceholderText(/Globex Corporation/), { target: { value: customer } });
    fireEvent.change(screen.getByLabelText("Industry"), { target: { value: industry } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
  }
  function uploadFile(container: HTMLElement, file: File) {
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
  }

  it("skipping step two matches Phase A exactly — pre-fill applied, no trusted list written", () => {
    const { container } = renderPage();
    stepOne("Globex", "Financial services");
    fireEvent.click(screen.getByRole("button", { name: "Skip this step" }));

    // Phase A landing: industry pre-filter + pre-filled name, no conditions.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(industryFilter(container).value).toBe("Financial services");
    expect(nameField(container).value).toBe("Globex, Financial services DLP");
    expect(container.querySelector(".added-pill")?.textContent).toContain("0 in policy");
    // No trusted list touched, and the handoff shows the quiet "build one" prompt.
    expect(localStorage.getItem(TRUSTED_KEY)).toBeNull();
    expect(mockParseFile).not.toHaveBeenCalled();
  });

  it("a parsed export pre-loads the trusted list via the extractor key and surfaces it through the handoff", async () => {
    mockParseFile.mockResolvedValue({ kind: "result", result: PARSED });
    const { container } = renderPage();
    stepOne("Globex", "Financial services");
    uploadFile(container, new File(["data"], "enforcer.xlsx"));

    await screen.findByText(/2 trusted domains found/i);
    fireEvent.click(screen.getByRole("button", { name: "Start in Policy Creator" }));

    // Landed (Phase A pre-fill still applied)…
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(industryFilter(container).value).toBe("Financial services");
    expect(nameField(container).value).toBe("Globex, Financial services DLP");
    // …and the extracted list was persisted under the SAME extractor storage key.
    expect(JSON.parse(localStorage.getItem(TRUSTED_KEY) || "null")).toEqual(EXTRACTED);

    // It is available to a recipient-domain condition through the existing handoff
    // (never auto-added): add one, the bar shows the list, "Use" loads it.
    fireEvent.change(industryFilter(container), { target: { value: "all" } });
    const search = container.querySelector("input.search") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "Personal Webmail" } });
    const row = container.querySelector<HTMLElement>(".lib-row")!;
    fireEvent.click(within(row).getByRole("button", { name: "Add" }));

    const bar = container.querySelector(".trusted-bar");
    expect(bar?.textContent).toContain("2");
    expect(bar?.textContent).toMatch(/ready from your last extract/i);
    expect(screen.queryByText("Trusted / allowed recipient domains (from extract)")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Use" }));
    expect(screen.getByText("Trusted / allowed recipient domains (from extract)")).toBeTruthy();
    expect(container.textContent).toContain("partner.com");
    expect(container.textContent).toContain("vendor.io");
  });

  it("accepts a CSV through the same worker path and stores the extracted domains", async () => {
    mockParseFile.mockResolvedValue({ kind: "result", result: PARSED });
    const { container } = renderPage();
    stepOne();
    uploadFile(container, new File(["data"], "enforcer.csv"));
    await screen.findByText(/2 trusted domains found/i);
    fireEvent.click(screen.getByRole("button", { name: "Start in Policy Creator" }));
    expect(JSON.parse(localStorage.getItem(TRUSTED_KEY) || "null")).toEqual(EXTRACTED);
  });

  // A malformed file (parser rejecting) landing cleanly is covered at both the
  // component and page level in wizard-upload-failure.test.tsx (plain rejecting
  // mock — see the note there). The empty-result path below is the sibling case
  // and asserts the same "clean landing, storage untouched" property here.

  it("does not overwrite an existing trusted list when the upload yields nothing", async () => {
    localStorage.setItem(TRUSTED_KEY, JSON.stringify(["keep-me.com"]));
    mockParseFile.mockResolvedValue({
      kind: "result",
      result: { map: new Map(), scanned: 0, typeTotals: new Map(), sheetName: "(empty)" },
    });
    const { container } = renderPage();
    stepOne();
    uploadFile(container, new File(["data"], "enforcer.csv"));
    await screen.findByText(/No usable trusted domains/i);
    fireEvent.click(screen.getByRole("button", { name: "Start in Policy Creator" }));
    // The earlier list is untouched (we only write when there's a usable list).
    expect(JSON.parse(localStorage.getItem(TRUSTED_KEY) || "null")).toEqual(["keep-me.com"]);
  });

  it("re-running the wizard for an account may re-upload (no file contents persisted)", () => {
    recordCompletedAccount({ customer: "Initech", industry: "Technology & SaaS" });
    renderPage();
    // Returns straight to the library (Phase A state remembered), no dialog…
    expect(screen.queryByRole("dialog")).toBeNull();
    // …and only the Phase A keys persist — no file/upload content is stored.
    const keys = Object.keys(localStorage);
    expect(keys.some((k) => k.startsWith("aedlp_wizard_"))).toBe(true);
    expect(keys).not.toContain(TRUSTED_KEY); // nothing uploaded this run
  });
});

/* The two distinct outputs of the wizard's step two: a trusted ALLOW-LIST (upload,
   persisted to the store) and a competitor BLOCK-LIST (GenAI lookup, added as a
   separate condition). They must never cross-contaminate. */
describe("PolicyCreator wizard — trusted allow-list vs competitor block-list", () => {
  const TRUSTED_KEY = "aedlp_trusted_domains";
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  function httpJson(status: number, body: unknown): Response {
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  }

  // Upload fixture → trusted allow-list (external domains, freemail excluded).
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
  const TRUSTED = ["partner.com", "vendor.io"];
  const CF_SAMPLE = {
    suggestions: [
      { name: "Globex Rival", domain: "globex-rival.example", confidence: "high", verified: true, rationale: "Direct competitor." },
      { name: "Initech", domain: "initech.example", confidence: "medium", verified: false, rationale: "Adjacent." },
    ],
    notes: "Found 2 competitor suggestions.",
  };

  function stepOne(customer = "Globex", industry = "Financial services") {
    fireEvent.change(screen.getByPlaceholderText(/Globex Corporation/), { target: { value: customer } });
    fireEvent.change(screen.getByLabelText("Industry"), { target: { value: industry } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
  }
  function uploadFile(container: HTMLElement, file: File) {
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
  }

  it("lands curated competitors as a SEPARATE block-list condition, never in the trusted store", async () => {
    mockParseFile.mockResolvedValue({ kind: "result", result: PARSED });
    fetchMock.mockResolvedValue(httpJson(200, CF_SAMPLE));
    const { container } = renderPage();

    // Step one, then build BOTH lists on step two.
    stepOne("Globex", "Financial services");
    uploadFile(container, new File(["data"], "enforcer.xlsx"));
    await screen.findByText(/2 trusted domains found/i); // allow-list ready

    fireEvent.click(screen.getByRole("button", { name: "Find competitors for Globex" }));
    await screen.findByText("globex-rival.example"); // block-list suggestions
    fireEvent.click(screen.getByRole("checkbox", { name: /Select Globex Rival/ }));

    fireEvent.click(screen.getByRole("button", { name: "Start in Policy Creator" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    // The trusted store holds ONLY the uploaded allow-list — the competitor domain
    // never leaks into it. The two lists do not cross-contaminate.
    const trusted = JSON.parse(localStorage.getItem(TRUSTED_KEY) || "null");
    expect(trusted).toEqual(TRUSTED);
    expect(trusted).not.toContain("globex-rival.example");

    // The competitor block-list is auto-added on finish as its own condition…
    expect(screen.getByText(/Competitor domains .* block-list \(from lookup\)/)).toBeTruthy();
    expect(container.textContent).toContain("globex-rival.example");
    // …and it is the only condition added (the allow-list waits behind its "Use" bar).
    expect(container.querySelector(".added-pill")?.textContent).toContain("1 in policy");
  });

  it("keeps allow-list and block-list as two distinct conditions when both are loaded", async () => {
    mockParseFile.mockResolvedValue({ kind: "result", result: PARSED });
    fetchMock.mockResolvedValue(httpJson(200, CF_SAMPLE));
    const { container } = renderPage();

    stepOne("Globex", "Financial services");
    uploadFile(container, new File(["data"], "enforcer.xlsx"));
    await screen.findByText(/2 trusted domains found/i);
    fireEvent.click(screen.getByRole("button", { name: "Find competitors for Globex" }));
    await screen.findByText("globex-rival.example");
    fireEvent.click(screen.getByRole("checkbox", { name: /Select Globex Rival/ }));
    fireEvent.click(screen.getByRole("button", { name: "Start in Policy Creator" }));

    // The competitor block-list is in the draft; the trusted bar offers the allow-list.
    expect(screen.getByText(/Competitor domains .* block-list \(from lookup\)/)).toBeTruthy();
    expect(screen.queryByText("Trusted / allowed recipient domains (from extract)")).toBeNull();

    // Loading the trusted allow-list adds it as a SECOND, separate condition.
    fireEvent.click(screen.getByRole("button", { name: "Use" }));
    expect(screen.getByText("Trusted / allowed recipient domains (from extract)")).toBeTruthy();
    expect(container.querySelector(".added-pill")?.textContent).toContain("2 in policy");

    // Each list keeps its own domains — they were never merged.
    const conditions = [...container.querySelectorAll<HTMLElement>(".cond-row")];
    const blockRow = conditions.find((r) => /block-list/.test(r.textContent || ""))!;
    const allowRow = conditions.find((r) => /Trusted \/ allowed/.test(r.textContent || ""))!;
    expect(blockRow.textContent).toContain("globex-rival.example");
    expect(blockRow.textContent).not.toContain("partner.com");
    expect(allowRow.textContent).toContain("partner.com");
    expect(allowRow.textContent).not.toContain("globex-rival.example");
  });
});
