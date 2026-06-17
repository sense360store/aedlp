// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// The real parser is covered in src/lib/extract.test.ts against the sample
// workbook. Here we mock it so the page reaches the ready state deterministically
// (no dependency on jsdom File.arrayBuffer) and we can test the curation UI.
vi.mock("../lib/extract", () => {
  const makeParsed = () => ({
    map: new Map([
      ["soteria365.com", { types: new Map([["external", 1]]), total: 1 }],
      ["hotmail.com", { types: new Map([["freemail", 1]]), total: 1 }],
      ["gmail.com", { types: new Map([["freemail", 1]]), total: 1 }],
    ]),
    scanned: 3,
    typeTotals: new Map([
      ["external", 1],
      ["freemail", 2],
    ]),
    sheetName: "unauthorised_contacts",
  });
  return {
    TARGET_SHEET: /unauth/i,
    isCSV: () => false,
    parseCSV: vi.fn(),
    readSheetNames: vi.fn(async () => ({ names: ["unauthorised_contacts"], buf: new Uint8Array() })),
    pickSheet: () => "unauthorised_contacts",
    parseWorkbook: vi.fn(async () => makeParsed()),
    emailDomain: (s: unknown) => {
      const v = String(s ?? "").trim().toLowerCase();
      const at = v.lastIndexOf("@");
      if (at < 0) return "";
      const d = v.slice(at + 1);
      return d.includes(".") ? d : "";
    },
  };
});

import Extractor from "./Extractor";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <Extractor />
    </MemoryRouter>,
  );
}

async function selectFile(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["x"], "enforcer.xlsx")] } });
  await waitFor(() => expect(container.querySelector(".file-bar")).not.toBeNull());
}

function clickAllSegment(container: HTMLElement) {
  const allSeg = Array.from(container.querySelectorAll<HTMLButtonElement>(".seg button")).find((b) =>
    b.textContent?.startsWith("all"),
  )!;
  fireEvent.click(allSeg);
}

function whitelistLines(container: HTMLElement): string[] {
  const ta = container.querySelector("textarea.mono") as HTMLTextAreaElement;
  return ta.value ? ta.value.split("\n") : [];
}

describe("Extractor page", () => {
  it("renders the idle state with the persistent nav, intro and dropzone", () => {
    const { container } = renderPage();
    expect(screen.getByText("Trusted Domain Extractor")).toBeTruthy();
    expect(screen.getByText("Extract trusted third-party domains")).toBeTruthy();
    expect(container.querySelector(".dropzone")).not.toBeNull();

    // Both nav destinations are reachable from the extractor page.
    expect(screen.getByRole("link", { name: "Policy Creator" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "Trusted domains" }).getAttribute("href")).toBe(
      "/trusted-domain-extractor",
    );
  });

  it("reaches the ready state with the right stats and builds the whitelist (no silent write)", async () => {
    const { container } = renderPage();
    await selectFile(container);

    expect(container.querySelector(".file-sub")?.textContent).toContain("unauthorised_contacts");
    expect(container.querySelector(".ext-stats .stat-num")?.textContent).toBe("3"); // rows scanned

    // default external filter shows only the external domain
    expect(container.querySelectorAll(".dom-row")).toHaveLength(1);

    // switch to "all" -> every domain is in scope
    clickAllSegment(container);
    expect(container.querySelectorAll(".dom-row")).toHaveLength(3);
    expect(whitelistLines(container)).toEqual(["gmail.com", "hotmail.com", "soteria365.com"]);

    // The handoff is explicit now: nothing is persisted until the user asks.
    expect(localStorage.getItem("aedlp_trusted_domains")).toBeNull();
  });

  it("deselecting a domain drops it from the whitelist", async () => {
    const { container } = renderPage();
    await selectFile(container);
    clickAllSegment(container);

    expect(whitelistLines(container)).toHaveLength(3);
    fireEvent.click(container.querySelector(".dom-row .chk") as HTMLButtonElement);
    expect(whitelistLines(container)).toHaveLength(2);
  });

  it("manually added domains appear with an added tag and enter the whitelist", async () => {
    const { container } = renderPage();
    await selectFile(container);

    const addInput = container.querySelector(".add-row input") as HTMLInputElement;
    fireEvent.change(addInput, { target: { value: "partner.com" } });
    fireEvent.keyDown(addInput, { key: "Enter" });

    await waitFor(() => expect(container.textContent).toContain("partner.com"));
    expect(container.querySelector(".dom-tag")?.textContent).toBe("added");
    expect(whitelistLines(container)).toContain("partner.com");
  });

  it("the explicit 'Use in Policy Creator' handoff writes the list and navigates", async () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/trusted-domain-extractor"]}>
        <Routes>
          <Route path="/trusted-domain-extractor" element={<Extractor />} />
          <Route path="/" element={<div>POLICY_CREATOR_STUB</div>} />
        </Routes>
      </MemoryRouter>,
    );
    await selectFile(container);
    clickAllSegment(container);

    fireEvent.click(screen.getByRole("button", { name: "Use in Policy Creator" }));

    // Navigated to the Policy Creator route…
    expect(screen.getByText("POLICY_CREATOR_STUB")).toBeTruthy();
    // …and the curated allow-list was persisted under the shared key.
    const stored = JSON.parse(localStorage.getItem("aedlp_trusted_domains") || "null");
    expect(stored).toEqual(["gmail.com", "hotmail.com", "soteria365.com"]);
  });
});
