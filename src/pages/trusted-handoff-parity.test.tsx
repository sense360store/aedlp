// @vitest-environment jsdom
//
// Regression — the missed one. Two surfaces can produce a trusted-domain
// allow-list: the Trusted Domain Extractor page (its "Use in Policy Creator"
// handoff) and the wizard's optional step-two upload (Phase B). They MUST hand
// off through the same contract — the same localStorage key
// (aedlp_trusted_domains), the same shape (a serialised string[]), and the same
// content for the same input — so a recipient-domain condition and the trusted
// bar read one list regardless of where it came from.
//
// Each path is already covered on its own (Extractor.test.tsx,
// PolicyCreator.test.tsx). What was missing, and what let the two drift, is a
// test that feeds the SAME parsed export through BOTH and asserts the persisted
// value is identical. Only the Web Worker boundary (parseFile) is mocked — both
// real pages run their real selection + persistence (the extractor's default
// whitelist, trustedDomainsFromParsed, and the shared saveTrustedDomains), so a
// divergence here is the app's, never the fixture's.
//
// Write parity is necessary but NOT sufficient, and that gap is exactly what
// shipped broken: the wizard persisted the list correctly, yet it never
// surfaced, because the Trusted Domains page only read the store when you
// re-parsed a file — landing on it with a saved list showed the empty dropzone.
// The second describe below pins the READ side of the same contract: after a
// wizard upload + finish, opening the Trusted Domains page must show exactly
// those domains in its curate UI. That cross-page read-back is what the original
// write-only assertion missed for the wizard entry point.
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

vi.mock("../lib/parseClient", () => ({ parseFile: vi.fn() }));
import { parseFile } from "../lib/parseClient";
import Extractor from "./Extractor";
import PolicyCreator from "./PolicyCreator";
import { TRUSTED_LS_KEY } from "../lib/trusted";
import type { ParsedResult } from "../lib/extract";

const mockParseFile = vi.mocked(parseFile);

afterEach(() => {
  cleanup();
  localStorage.clear();
  mockParseFile.mockReset();
});

// One parsed enforcer export, fed to BOTH pages. Two external domains (the
// trusted third parties) plus one freemail domain that the external-default
// selection must drop — so parity is proven over the shared default, not merely
// over "every domain in the file".
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
const EXPECTED = ["partner.com", "vendor.io"]; // external, de-duped, sorted; freemail dropped

function resolveWithParsed() {
  mockParseFile.mockImplementation(async (_f, opts) => {
    opts?.onProgress?.(1);
    return { kind: "result", result: PARSED };
  });
}

// Upload the export on the Trusted Domains page and take the documented handoff
// ("Use in Policy Creator") with NO manual curation — the page's out-of-the-box
// default, which is the same no-curation default the wizard applies. Returns the
// RAW stored string so the comparison is over the exact serialisation, not a
// re-parse that could mask a shape difference.
async function storeViaExtractorPage(): Promise<string | null> {
  const { container } = render(
    <MemoryRouter initialEntries={["/trusted-domain-extractor"]}>
      <Routes>
        <Route path="/trusted-domain-extractor" element={<Extractor />} />
        <Route path="/" element={<div>POLICY_CREATOR_STUB</div>} />
      </Routes>
    </MemoryRouter>,
  );
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["x"], "enforcer.xlsx")] } });
  await waitFor(() => expect(container.querySelector(".file-bar")).not.toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Use in Policy Creator" }));
  await screen.findByText("POLICY_CREATOR_STUB"); // navigated → handoff written
  return localStorage.getItem(TRUSTED_LS_KEY);
}

// Upload the SAME export through the wizard's optional step two and finish.
async function storeViaWizardUpload(): Promise<string | null> {
  render(
    <MemoryRouter>
      <PolicyCreator />
    </MemoryRouter>,
  );
  // Step one (the wizard shows on a clean first load).
  fireEvent.change(screen.getByPlaceholderText(/Globex Corporation/), { target: { value: "Globex" } });
  fireEvent.change(screen.getByLabelText("Industry"), { target: { value: "Financial services" } });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  // Step two: upload, then finish into the Policy Creator.
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["x"], "enforcer.xlsx")] } });
  await screen.findByText(/2 trusted domains found/i);
  fireEvent.click(screen.getByRole("button", { name: "Start in Policy Creator" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  return localStorage.getItem(TRUSTED_LS_KEY);
}

describe("Trusted-domain handoff parity — wizard upload === Trusted Domains page", () => {
  it("persists to the same key, with the same serialised shape and content", async () => {
    resolveWithParsed();

    const fromExtractor = await storeViaExtractorPage();
    cleanup();
    localStorage.clear(); // a clean slate so the wizard's write stands alone
    const fromWizard = await storeViaWizardUpload();

    // Both paths wrote something through the shared key…
    expect(fromExtractor).not.toBeNull();
    expect(fromWizard).not.toBeNull();
    // …and wrote it byte-identically: same shape (a JSON string[]) and same
    // content. Raw-string equality is the strongest "same key + same shape"
    // assertion — it would fail on any serialisation or ordering drift.
    expect(fromWizard).toBe(fromExtractor);
    // And the shared value is the expected external-default allow-list.
    expect(JSON.parse(fromWizard as string)).toEqual(EXPECTED);
  });
});

// Open the Trusted Domains page fresh on its own route. Used after the wizard
// has already written the list, to prove the page READS it back on mount.
function renderTrustedDomainsPage() {
  return render(
    <MemoryRouter initialEntries={["/trusted-domain-extractor"]}>
      <Routes>
        <Route path="/trusted-domain-extractor" element={<Extractor />} />
        <Route path="/" element={<div>POLICY_CREATOR_STUB</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Trusted-domain handoff parity — the Trusted Domains page surfaces the wizard's list", () => {
  it("reads the store on mount and renders exactly the wizard-saved domains, not an empty dropzone", async () => {
    resolveWithParsed();

    // The wizard upload + finish is the ONLY write; the list now lives in the
    // shared store exactly as the wizard reported it.
    const fromWizard = await storeViaWizardUpload();
    expect(fromWizard).not.toBeNull();
    expect(JSON.parse(fromWizard as string)).toEqual(EXPECTED);
    cleanup(); // unmount the Policy Creator — the saved list stays in localStorage

    // Navigate to the Trusted Domains page as the user would after finishing.
    const { container } = renderTrustedDomainsPage();

    // It must open straight onto the restored list, never the empty dropzone
    // that previously hid it.
    await waitFor(() => expect(container.querySelector(".file-bar")).not.toBeNull());
    expect(container.querySelector(".dropzone")).toBeNull();

    // The curate UI shows exactly the N domains the wizard reported — same list,
    // same order — so the user can find and refine them.
    const rows = Array.from(container.querySelectorAll(".dom-row .dom-name")).map((n) => n.textContent);
    expect(rows).toEqual(EXPECTED);
    const whitelist = container.querySelector("textarea.mono") as HTMLTextAreaElement;
    expect(whitelist.value.split("\n")).toEqual(EXPECTED);

    // And what the page would re-hand-off is byte-identical to the wizard's
    // write — same key, same serialised string[] — so the read/write loop closes
    // on the exact value, not merely an equivalent one.
    fireEvent.click(screen.getByRole("button", { name: "Use in Policy Creator" }));
    await screen.findByText("POLICY_CREATOR_STUB");
    expect(localStorage.getItem(TRUSTED_LS_KEY)).toBe(fromWizard);
  });
});
