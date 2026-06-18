// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Wizard } from "./Wizard";

afterEach(cleanup);

const INDUSTRIES = ["Financial services", "Healthcare & life sciences", "Technology & SaaS"];

function setup(open = true) {
  const onFinish = vi.fn();
  const onSkip = vi.fn();
  const utils = render(
    <Wizard open={open} industries={INDUSTRIES} onFinish={onFinish} onSkip={onSkip} />,
  );
  return { ...utils, onFinish, onSkip };
}

describe("Wizard component", () => {
  it("renders nothing when closed", () => {
    const { container } = setup(false);
    expect(container.querySelector(".wiz")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders a labelled dialog when open", () => {
    setup();
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByText("Set up a policy for a customer")).toBeTruthy();
  });

  it("offers exactly the supplied industries plus a disabled placeholder", () => {
    setup();
    const select = screen.getByLabelText("Industry") as HTMLSelectElement;
    const values = [...select.options].map((o) => o.value);
    expect(values).toEqual(["", ...INDUSTRIES]);
    expect(select.options[0].disabled).toBe(true);
  });

  it("disables Start until a customer name AND an industry are chosen", () => {
    setup();
    const start = screen.getByRole("button", { name: /Start in Policy Creator/ }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText(/Globex Corporation/), { target: { value: "Globex" } });
    expect(start.disabled).toBe(true); // industry still unset

    fireEvent.change(screen.getByLabelText("Industry"), { target: { value: "Financial services" } });
    expect(start.disabled).toBe(false);
  });

  it("calls onFinish with the trimmed account and the don't-show-again flag", () => {
    const { onFinish } = setup();
    fireEvent.change(screen.getByPlaceholderText(/Globex Corporation/), { target: { value: "  Globex  " } });
    fireEvent.change(screen.getByLabelText("Industry"), { target: { value: "Technology & SaaS" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Start in Policy Creator/ }));
    expect(onFinish).toHaveBeenCalledWith({ customer: "Globex", industry: "Technology & SaaS" }, true);
  });

  it("finishes on Enter in the customer field when valid", () => {
    const { onFinish } = setup();
    fireEvent.change(screen.getByLabelText("Industry"), { target: { value: "Financial services" } });
    const input = screen.getByPlaceholderText(/Globex Corporation/);
    fireEvent.change(input, { target: { value: "Globex" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onFinish).toHaveBeenCalledWith({ customer: "Globex", industry: "Financial services" }, false);
  });

  it("treats Skip, Close and Escape the same — all call onSkip and never onFinish", () => {
    // Skip
    let h = setup();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(h.onSkip).toHaveBeenCalledWith(false);
    expect(h.onFinish).not.toHaveBeenCalled();
    cleanup();

    // Close (the X)
    h = setup();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(h.onSkip).toHaveBeenCalledWith(false);
    cleanup();

    // Escape
    h = setup();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(h.onSkip).toHaveBeenCalledWith(false);
    expect(h.onFinish).not.toHaveBeenCalled();
  });

  it("carries the don't-show-again choice through Skip", () => {
    const { onSkip } = setup();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(onSkip).toHaveBeenCalledWith(true);
  });

  it("dismisses (as Skip) when the backdrop is pressed, but not when the dialog is", () => {
    const { container, onSkip } = setup();
    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(onSkip).not.toHaveBeenCalled();
    fireEvent.mouseDown(container.querySelector(".wiz-overlay")!);
    expect(onSkip).toHaveBeenCalledWith(false);
  });
});
