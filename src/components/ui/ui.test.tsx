// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { Badge } from "./Badge";
import { Card } from "./Card";
import { Callout } from "./Callout";
import { CopyButton } from "./CopyButton";
import { RegexHighlight } from "./RegexHighlight";
import { tokenizeRegex } from "../../lib/regex";

afterEach(cleanup);

describe("Badge", () => {
  it("renders tone, mono and the dot", () => {
    const { container } = render(
      <Badge tone="ok" mono dot>
        5
      </Badge>,
    );
    const span = container.querySelector("span.badge")!;
    expect(span.className).toBe("badge ok mono");
    expect(span.querySelector("span.dot")).not.toBeNull();
    expect(span.textContent).toContain("5");
  });
});

describe("Card", () => {
  it("renders the head with icon, title, desc and body", () => {
    const { container } = render(
      <Card title="T" desc="D" icon="shield">
        body
      </Card>,
    );
    expect(container.querySelector("section.card")).not.toBeNull();
    expect(container.querySelector(".card-icon svg")).not.toBeNull();
    expect(container.querySelector(".card-title")?.textContent).toBe("T");
    expect(container.querySelector(".card-desc")?.textContent).toBe("D");
    expect(container.querySelector(".card-body")?.textContent).toBe("body");
  });

  it("omits the head when there is no title or right slot", () => {
    const { container } = render(<Card>body</Card>);
    expect(container.querySelector(".card-head")).toBeNull();
    expect(container.querySelector(".card-body")?.textContent).toBe("body");
  });
});

describe("Callout", () => {
  it("defaults the icon from the tone and renders the title", () => {
    const { container } = render(
      <Callout tone="warn" title="Heads up">
        msg
      </Callout>,
    );
    expect(container.querySelector(".callout.warn")).not.toBeNull();
    expect(container.querySelector("svg.c-icon")).not.toBeNull();
    expect(container.querySelector(".c-title")?.textContent).toBe("Heads up");
    expect(container.querySelector(".c-body")?.textContent).toContain("msg");
  });
});

describe("CopyButton", () => {
  it("renders the label and copy icon", () => {
    render(<CopyButton value="hello" />);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("copybtn");
    expect(btn.textContent).toContain("Copy");
  });

  it("supports the big variant and a custom class", () => {
    render(<CopyButton value="x" big className="icon-copy" label="Copy all" />);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("big");
    expect(btn.className).toContain("icon-copy");
    expect(btn.textContent).toContain("Copy all");
  });

  it("flips to the copied state after a successful copy", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });

    render(<CopyButton value={() => "lazy value"} />);
    const btn = screen.getByRole("button");
    expect(btn.className).not.toContain("copied");
    fireEvent.click(btn);
    await waitFor(() => expect(btn.className).toContain("copied"));
    expect(btn.textContent).toContain("Copied");
  });
});

describe("RegexHighlight", () => {
  it("renders one span per token with the matching tok-* class", () => {
    const pattern = "\\b[A-Z]{2}\\d{3}\\b";
    const { container } = render(<RegexHighlight pattern={pattern} />);
    const spans = Array.from(container.querySelectorAll("span.tok"));
    const toks = tokenizeRegex(pattern);
    expect(spans).toHaveLength(toks.length);
    expect(spans.map((s) => s.className)).toEqual(toks.map((t) => "tok " + t.cls));
    expect(spans.map((s) => s.textContent).join("")).toBe(pattern);
  });
});
