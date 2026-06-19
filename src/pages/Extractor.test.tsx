// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// The real parser/worker is covered in src/lib/xlsx-stream.test.ts against the
// sample workbook. Here we mock the worker client so the page reaches the ready
// state deterministically (no real Worker in jsdom) and we can test the
// curation UI. isCSV/emailDomain come from the real (pure) extract module.
vi.mock("../lib/parseClient", () => {
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
    parseFile: vi.fn(async (_file: File, opts?: { onProgress?: (p: number) => void }) => {
      opts?.onProgress?.(1);
      return { kind: "result", result: makeParsed() };
    }),
  };
});

import Extractor from "./Extractor";
import { COMPETITOR_LS_KEY } from "../lib/competitors";

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

describe("Extractor page — trusted-list hygiene", () => {
  function rowFlags(container: HTMLElement): string[] {
    // Row badges live inside the scroll region; the summary bar's count chips
    // (also .dom-flag) sit outside it, so scoping to .dom-scroll isolates rows.
    return Array.from(container.querySelectorAll<HTMLElement>(".dom-scroll .dom-flag")).map(
      (el) => el.textContent || "",
    );
  }
  const hygieneBar = (container: HTMLElement) => container.querySelector(".hygiene-bar") as HTMLElement | null;

  it("flags freemail domains on the allow-list and counts the risky ones", async () => {
    const { container } = renderPage();
    await selectFile(container);

    // The default "external" view holds only the clean domain — nothing to flag.
    expect(hygieneBar(container)).toBeNull();

    // Switch to "all": the two freemail domains are now in scope and flagged.
    clickAllSegment(container);
    expect(rowFlags(container).filter((t) => t === "freemail")).toHaveLength(2);
    // The clean external domain is not flagged.
    expect(rowFlags(container)).not.toContain("competitor");

    const bar = hygieneBar(container)!;
    expect(bar).not.toBeNull();
    expect(bar.textContent).toContain("2 of 3 look risky for an allow-list");
    expect(bar.textContent).toContain("2 freemail");
  });

  it("'Remove all flagged' clears the flagged domains and Undo restores them", async () => {
    const { container } = renderPage();
    await selectFile(container);
    clickAllSegment(container);

    expect(whitelistLines(container)).toEqual(["gmail.com", "hotmail.com", "soteria365.com"]);

    fireEvent.click(screen.getByRole("button", { name: "Remove all flagged" }));

    // Only the clean domain remains; the flagged freemail domains are gone.
    expect(whitelistLines(container)).toEqual(["soteria365.com"]);
    expect(rowFlags(container)).toHaveLength(0);
    const bar = hygieneBar(container)!;
    expect(bar.textContent).toContain("Removed 2 flagged domains");

    // Undo is non-destructive: it brings the removed domains straight back.
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(whitelistLines(container)).toEqual(["gmail.com", "hotmail.com", "soteria365.com"]);
    expect(rowFlags(container).filter((t) => t === "freemail")).toHaveLength(2);
  });

  it("flags a trusted domain that is on the session's competitor block-list", async () => {
    // Seed the curated competitor block-list the Policy Creator would have written.
    localStorage.setItem(COMPETITOR_LS_KEY, JSON.stringify(["soteria365.com"]));
    const { container } = renderPage();
    await selectFile(container);
    clickAllSegment(container);

    // Now every domain is risky: two freemail + the one competitor.
    expect(rowFlags(container)).toContain("competitor");
    expect(rowFlags(container).filter((t) => t === "freemail")).toHaveLength(2);
    expect(hygieneBar(container)!.textContent).toContain("3 of 3 look risky for an allow-list");

    fireEvent.click(screen.getByRole("button", { name: "Remove all flagged" }));
    expect(whitelistLines(container)).toEqual([]);
  });
});
