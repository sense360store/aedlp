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

  it("computes the policy verdict and flips it between ANY and ALL", () => {
    const { container } = renderPage();
    addByName(container, "AWS Access Key ID"); // matches the leaked-credentials sample
    addByName(container, "UK IBAN"); // does not
    fireEvent.click(screen.getByRole("button", { name: "Leaked credentials" }));

    const verdict = () => container.querySelector(".test-panel .badge")?.textContent ?? "";
    // default operator is OR (ANY) -> triggers, 1 of 2
    expect(verdict()).toContain("Policy triggers");
    expect(verdict()).toContain("1/2");

    fireEvent.click(screen.getByRole("button", { name: "ALL" }));
    expect(verdict()).toContain("No trigger");
    expect(verdict()).toContain("1/2");
  });

  it("surfaces the AI competitor finder on the library Recipients view, inline and not in the policy draft", () => {
    const { container } = renderPage();

    // The lookup now lives WITH the other ways to build a recipient-domain list,
    // on the Recipients surface — not buried in the policy-draft conditions corner.
    expect(screen.queryByRole("button", { name: "Find competitors with AI" })).toBeNull();
    expect(container.querySelector(".policy-draft .cf-panel")).toBeNull();

    // Switch to the Recipients view: a clear entry point appears next to the packs.
    fireEvent.click(screen.getByRole("button", { name: /Recipients/ }));
    expect(container.querySelector(".col-lib .lib-recipients-bar")).not.toBeNull();
    const trigger = screen.getByRole("button", { name: "Find competitors with AI" });

    // It expands inline within the library column — never a modal overlay, and
    // never inside the policy draft.
    fireEvent.click(trigger);
    expect(container.querySelector(".col-lib .cf-panel")).not.toBeNull();
    expect(container.querySelector(".policy-draft .cf-panel")).toBeNull();
    expect(container.querySelector(".cf-overlay")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    const panel = container.querySelector(".cf-panel") as HTMLElement;
    expect(panel.querySelector(".cf-body")).not.toBeNull();
    expect(panel.querySelector(".cf-foot")).not.toBeNull();
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
