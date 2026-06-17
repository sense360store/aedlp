// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

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

describe("Extractor page", () => {
  it("renders the idle state with the topbar, intro and dropzone", () => {
    const { container } = renderPage();
    expect(screen.getByText("Trusted Domain Extractor")).toBeTruthy();
    expect(screen.getByText("Extract trusted third-party domains")).toBeTruthy();
    expect(container.querySelector(".dropzone")).not.toBeNull();
    const link = screen.getByRole("link", { name: /Policy Creator/ });
    expect(link.getAttribute("href")).toBe("/");
  });

  it("reaches the ready state with the right stats and persists the whitelist", async () => {
    const { container } = renderPage();
    await selectFile(container);

    expect(container.querySelector(".file-sub")?.textContent).toContain("unauthorised_contacts");
    expect(container.querySelector(".ext-stats .stat-num")?.textContent).toBe("3"); // rows scanned

    // default external filter shows only the external domain
    expect(container.querySelectorAll(".dom-row")).toHaveLength(1);

    // switch to "all" -> every domain is in scope
    clickAllSegment(container);
    expect(container.querySelectorAll(".dom-row")).toHaveLength(3);

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem("aedlp_trusted_domains") || "[]");
      expect(stored).toEqual(["gmail.com", "hotmail.com", "soteria365.com"]);
    });
  });

  it("deselecting a domain drops it from the persisted whitelist", async () => {
    const { container } = renderPage();
    await selectFile(container);
    clickAllSegment(container);

    fireEvent.click(container.querySelector(".dom-row .chk") as HTMLButtonElement);
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem("aedlp_trusted_domains") || "[]");
      expect(stored).toHaveLength(2);
    });
  });

  it("manually added domains appear with an added tag and enter the whitelist", async () => {
    const { container } = renderPage();
    await selectFile(container);

    const addInput = container.querySelector(".add-row input") as HTMLInputElement;
    fireEvent.change(addInput, { target: { value: "partner.com" } });
    fireEvent.keyDown(addInput, { key: "Enter" });

    await waitFor(() => expect(container.textContent).toContain("partner.com"));
    expect(container.querySelector(".dom-tag")?.textContent).toBe("added");
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem("aedlp_trusted_domains") || "[]");
      expect(stored).toContain("partner.com");
    });
  });
});
