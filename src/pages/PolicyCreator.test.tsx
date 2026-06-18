// @vitest-environment jsdom
import { afterEach, describe, it, expect } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PolicyCreator from "./PolicyCreator";

afterEach(() => {
  cleanup();
  localStorage.clear();
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
  it("renders the topbar and the library", () => {
    const { container } = renderPage();
    expect(screen.getByText("AEDLP Policy Creator")).toBeTruthy();
    expect(screen.getByText("Detector library & custom-policy assembler")).toBeTruthy();
    expect(container.querySelectorAll(".lib-row").length).toBe(105);
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

  it("keeps the AI competitor finder out of the UI while its feature flag is off", () => {
    const { container } = renderPage();

    // Hidden by default — no entry point anywhere, and never in the policy draft.
    expect(screen.queryByRole("button", { name: "Find competitors with AI" })).toBeNull();
    expect(container.querySelector(".lib-recipients-bar")).toBeNull();
    expect(container.querySelector(".cf-panel")).toBeNull();

    // Even on the Recipients view, where the entry point used to sit by the packs.
    fireEvent.click(screen.getByRole("button", { name: /Recipients/ }));
    expect(container.querySelector(".col-lib .lib-recipients-bar")).toBeNull();
    expect(screen.queryByRole("button", { name: "Find competitors with AI" })).toBeNull();

    // The library reflows with no gap: the count sits directly on the list, the
    // same as every other view that never had the recipients bar.
    const libCount = container.querySelector(".col-lib .lib-count") as HTMLElement;
    expect(libCount.nextElementSibling?.classList.contains("lib-list")).toBe(true);
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
