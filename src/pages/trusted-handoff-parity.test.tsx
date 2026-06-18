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
