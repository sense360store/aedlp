// @vitest-environment jsdom
import { afterEach, describe, it, expect } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { InfoTip } from "./InfoTip";

afterEach(cleanup);

describe("InfoTip", () => {
  it("renders nothing when there is no text (no empty tooltip)", () => {
    const { container } = render(<InfoTip text="   " />);
    expect(container.querySelector(".info-tip-btn")).toBeNull();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("exposes a focusable button that reveals the text on focus and hides on blur", () => {
    render(<InfoTip text="Detects US Social Security numbers in free text." />);
    const btn = screen.getByRole("button", { name: "Show description" });
    // A real <button> is in the tab order — reachable by keyboard.
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.getAttribute("tabindex")).not.toBe("-1");

    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.focus(btn);
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toContain("Detects US Social Security numbers in free text.");
    // The trigger points assistive tech at the tooltip while it is shown.
    expect(btn.getAttribute("aria-describedby")).toBe(tip.getAttribute("id"));

    fireEvent.blur(btn);
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(btn.getAttribute("aria-describedby")).toBeNull();
  });

  it("dismisses on Escape", () => {
    render(<InfoTip text="Some description." />);
    const btn = screen.getByRole("button");
    fireEvent.focus(btn);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.keyDown(btn, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("shows on hover and hides when the pointer leaves", () => {
    render(<InfoTip text="Hover reveals me." />);
    const btn = screen.getByRole("button");
    fireEvent.mouseEnter(btn);
    expect(screen.getByRole("tooltip").textContent).toContain("Hover reveals me.");
    fireEvent.mouseLeave(btn);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("renders the optional meta line alongside the text", () => {
    render(<InfoTip text="Covers AWS access keys." meta="FP risk: low · Warn" />);
    fireEvent.focus(screen.getByRole("button"));
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toContain("Covers AWS access keys.");
    expect(tip.textContent).toContain("FP risk: low · Warn");
  });
});
