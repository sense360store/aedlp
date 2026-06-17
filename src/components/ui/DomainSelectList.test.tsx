// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { DomainSelectList } from "./DomainSelectList";

afterEach(cleanup);

function stubClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  return writeText;
}

const DOMAINS = ["a.com", "b.com", "c.com"];

describe("DomainSelectList", () => {
  it("starts with everything selected and renders a toggle chip per domain", () => {
    const { container } = render(<DomainSelectList domains={DOMAINS} />);
    const chips = container.querySelectorAll<HTMLButtonElement>(".prev-chip.pick");
    expect(chips).toHaveLength(3);
    expect(Array.from(chips).every((c) => c.getAttribute("aria-pressed") === "true")).toBe(true);
    expect(screen.getByText("3/3 selected")).toBeTruthy();
  });

  it("copies the full list as both newline- and comma-separated text", async () => {
    const writeText = stubClipboard();
    render(<DomainSelectList domains={DOMAINS} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy all domains" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("a.com\nb.com\nc.com"));
    fireEvent.click(screen.getByRole("button", { name: "Comma-separated" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("a.com, b.com, c.com"));
  });

  it("flips to a Copied confirmation after a successful copy", async () => {
    stubClipboard();
    render(<DomainSelectList domains={DOMAINS} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy all domains" }));
    await waitFor(() => expect(screen.getByText("Copied")).toBeTruthy());
  });

  it("select-all / deselect-all toggles the whole set", () => {
    const { container } = render(<DomainSelectList domains={DOMAINS} />);
    // Defaults to all selected, so the control first reads "Deselect all".
    fireEvent.click(screen.getByRole("button", { name: "Deselect all" }));
    expect(screen.getByText("0/3 selected")).toBeTruthy();
    const chips = container.querySelectorAll<HTMLButtonElement>(".prev-chip.pick");
    expect(Array.from(chips).every((c) => c.getAttribute("aria-pressed") === "false")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(screen.getByText("3/3 selected")).toBeTruthy();
  });

  it("offers Copy selected for a strict subset and copies only those", async () => {
    const writeText = stubClipboard();
    const { container } = render(<DomainSelectList domains={DOMAINS} />);
    // No subset yet → no Copy selected button.
    expect(screen.queryByRole("button", { name: /Copy selected/ })).toBeNull();
    const chips = container.querySelectorAll<HTMLButtonElement>(".prev-chip.pick");
    fireEvent.click(chips[1]); // deselect b.com
    fireEvent.click(screen.getByRole("button", { name: "Copy selected (2)" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("a.com\nc.com"));
  });

  it("expands past the collapsed cap (a full 30-item result) to show every domain", () => {
    const many = Array.from({ length: 30 }, (_, i) => `d${i}.example`);
    const { container } = render(<DomainSelectList domains={many} collapsedCount={12} />);
    expect(container.querySelectorAll(".prev-chip.pick")).toHaveLength(12);
    const more = screen.getByRole("button", { name: /show all/i });
    expect(more.textContent).toContain("+18");
    fireEvent.click(more);
    expect(container.querySelectorAll(".prev-chip.pick")).toHaveLength(30);
    fireEvent.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(container.querySelectorAll(".prev-chip.pick")).toHaveLength(12);
  });

  it("copy-all copies all N even while collapsed — not just the visible chips", async () => {
    const writeText = stubClipboard();
    const many = Array.from({ length: 30 }, (_, i) => `d${i}.example`);
    render(<DomainSelectList domains={many} collapsedCount={5} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy all domains" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(many.join("\n")));
  });

  it("re-seeds the selection to all when the domain list changes", () => {
    const { rerender } = render(<DomainSelectList domains={DOMAINS} />);
    fireEvent.click(screen.getByRole("button", { name: "Deselect all" }));
    expect(screen.getByText("0/3 selected")).toBeTruthy();
    rerender(<DomainSelectList domains={["x.com", "y.com"]} />);
    expect(screen.getByText("2/2 selected")).toBeTruthy();
  });
});
