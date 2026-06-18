// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { CompetitorFinder } from "./CompetitorFinder";
import { makeCompetitorCondition } from "../../lib/competitors";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function httpJson(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const SAMPLE = {
  suggestions: [
    { name: "Globex", domain: "globex-industries.example", confidence: "high", verified: true, rationale: "Direct rival in widgets." },
    { name: "Initech", domain: "initech-systems.example", confidence: "medium", verified: false, rationale: "Adjacent player." },
  ],
  notes: "Found 2 competitor suggestions (1 with a live mail/DNS record).",
};

function openAndSearch() {
  fireEvent.click(screen.getByRole("button", { name: "Find competitors with AI" }));
  fireEvent.change(screen.getByLabelText("Company or customer name"), { target: { value: "Acme" } });
  fireEvent.click(screen.getByRole("button", { name: "Find" }));
}

describe("CompetitorFinder", () => {
  it("shows the permanent privacy note when opened", () => {
    render(<CompetitorFinder onAdd={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Find competitors with AI" }));
    expect(screen.getByText(/Only the company name and industry you type are sent/i)).toBeTruthy();
    expect(screen.getByText(/extractor stay in your browser and are never sent/i)).toBeTruthy();
  });

  it("asks for a fuller name and does not call the API when the company is 2 chars or fewer", () => {
    render(<CompetitorFinder onAdd={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Find competitors with AI" }));
    fireEvent.change(screen.getByLabelText("Company or customer name"), { target: { value: "ba" } });
    fireEvent.click(screen.getByRole("button", { name: "Find" }));

    // "ba" is too short to disambiguate — prompt for a fuller name, never call out.
    expect(screen.getByText(/Enter a fuller name/i)).toBeTruthy();
    expect(screen.getByText(/British Airways/i)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();

    // Typing a fuller name clears the prompt so a real lookup can proceed.
    fireEvent.change(screen.getByLabelText("Company or customer name"), {
      target: { value: "British Airways" },
    });
    expect(screen.queryByText(/Enter a fuller name/i)).toBeNull();
  });

  it("expands an inline panel (not a modal dialog) and toggles via the trigger", () => {
    render(<CompetitorFinder onAdd={() => {}} />);
    const trigger = screen.getByRole("button", { name: "Find competitors with AI" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    // It is an inline region, never a focus-trapping modal dialog.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("region", { name: /find competitor domains/i })).toBeTruthy();

    // Clicking the trigger again collapses the panel.
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(/Only the company name and industry you type are sent/i)).toBeNull();
  });

  it("collapses the panel on Escape", () => {
    render(<CompetitorFinder onAdd={() => {}} />);
    const trigger = screen.getByRole("button", { name: "Find competitors with AI" });
    fireEvent.click(trigger);
    expect(screen.getByText(/Only the company name and industry you type are sent/i)).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText(/Only the company name and industry you type are sent/i)).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("collapses the panel via the visible Close button", () => {
    render(<CompetitorFinder onAdd={() => {}} />);
    const trigger = screen.getByRole("button", { name: "Find competitors with AI" });
    fireEvent.click(trigger);
    // The foot's "Close" is distinct from the header's "Close competitor finder".
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText(/Only the company name and industry you type are sent/i)).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("structures the panel as a pinned head/foot with a single scrolling body", () => {
    const { container } = render(<CompetitorFinder onAdd={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Find competitors with AI" }));

    const panel = container.querySelector(".cf-panel") as HTMLElement;
    const head = container.querySelector(".cf-head") as HTMLElement;
    const body = container.querySelector(".cf-body") as HTMLElement;
    const foot = container.querySelector(".cf-foot") as HTMLElement;
    expect(panel).toBeTruthy();

    // Head, body and foot are direct children of the panel: the head and foot
    // stay pinned while .cf-body is the one element that scrolls. That is what
    // keeps every control reachable inside the viewport-bounded panel.
    expect(head?.parentElement).toBe(panel);
    expect(body?.parentElement).toBe(panel);
    expect(foot?.parentElement).toBe(panel);

    // The inputs and the privacy note live inside the scrollable body.
    expect(body.querySelector("input")).toBeTruthy();
    expect(body.textContent).toMatch(/Only the company name and industry you type are sent/i);

    // The Add control is pinned in the foot, never inside the scrolling body,
    // so a long results list can never push it off-screen.
    const addBtn = screen.getByRole("button", { name: /to policy/i });
    expect(foot.contains(addBtn)).toBe(true);
    expect(body.contains(addBtn)).toBe(false);
  });

  it("keeps the results list in its own capped scroll region within the body", async () => {
    fetchMock.mockResolvedValue(httpJson(200, SAMPLE));
    const { container } = render(<CompetitorFinder onAdd={() => {}} />);
    openAndSearch();
    await waitFor(() => expect(screen.getByText("globex-industries.example")).toBeTruthy());

    const body = container.querySelector(".cf-body") as HTMLElement;
    const results = container.querySelector(".cf-results") as HTMLElement;
    expect(results).toBeTruthy();

    // The results scroll within the body (their own region) and hold every
    // suggestion row — the cap is via scroll, not truncation.
    expect(body.contains(results)).toBe(true);
    expect(results.querySelectorAll(".cf-row").length).toBe(SAMPLE.suggestions.length);

    // The footer Add control sits outside the results scroll region.
    const addBtn = screen.getByRole("button", { name: /to policy/i });
    expect(results.contains(addBtn)).toBe(false);
  });

  it("renders suggestions with confidence and verified/unverified flags", async () => {
    fetchMock.mockResolvedValue(httpJson(200, SAMPLE));
    render(<CompetitorFinder onAdd={() => {}} />);
    openAndSearch();

    await waitFor(() => expect(screen.getByText("globex-industries.example")).toBeTruthy());
    expect(screen.getByText("Globex")).toBeTruthy();
    expect(screen.getByText("high")).toBeTruthy();
    expect(screen.getByText("medium")).toBeTruthy();
    expect(screen.getByText("Verified")).toBeTruthy();
    expect(screen.getByText("Unverified")).toBeTruthy();
    expect(screen.getByText(/Direct rival in widgets/)).toBeTruthy();
  });

  it("shows the model-suggested + DNS-checked confirmation note with results", async () => {
    fetchMock.mockResolvedValue(httpJson(200, SAMPLE));
    render(<CompetitorFinder onAdd={() => {}} />);
    openAndSearch();
    await waitFor(() => expect(screen.getByText("globex-industries.example")).toBeTruthy());
    expect(
      screen.getByText(/Domains are model-suggested and DNS-checked\. Confirm before use\./i),
    ).toBeTruthy();
  });

  it("requires explicit selection before Add and never auto-applies", async () => {
    const onAdd = vi.fn();
    fetchMock.mockResolvedValue(httpJson(200, SAMPLE));
    render(<CompetitorFinder onAdd={onAdd} />);
    openAndSearch();

    await waitFor(() => expect(screen.getByText("globex-industries.example")).toBeTruthy());

    // Results arrived but nothing selected → onAdd not called, Add disabled.
    expect(onAdd).not.toHaveBeenCalled();
    const addBtn = screen.getByRole("button", { name: /to policy/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(true);

    // Select the first suggestion, then Add.
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);
    expect((addBtn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(addBtn);

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith(["globex-industries.example"]);
    // Panel collapsed after adding.
    expect(screen.queryByText(/Only the company name and industry you type are sent/i)).toBeNull();
  });

  it("select-all picks every reviewed suggestion and deselect-all clears them", async () => {
    fetchMock.mockResolvedValue(httpJson(200, SAMPLE));
    render(<CompetitorFinder onAdd={() => {}} />);
    openAndSearch();
    await waitFor(() => expect(screen.getByText("globex-industries.example")).toBeTruthy());

    const checks = () => screen.getAllByRole("checkbox") as HTMLInputElement[];
    // Nothing is pre-selected — adding stays deliberate.
    expect(checks().every((c) => !c.checked)).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(checks().every((c) => c.checked)).toBe(true);
    expect(screen.getByText("2/2 selected")).toBeTruthy();
    // The footer Add now offers the whole set.
    expect(screen.getByRole("button", { name: /Add 2 to policy/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Deselect all" }));
    expect(checks().every((c) => !c.checked)).toBe(true);
  });

  it("copies the whole reviewed set (all N, newline and comma) for the AEDLP domains field", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    fetchMock.mockResolvedValue(httpJson(200, SAMPLE));
    render(<CompetitorFinder onAdd={() => {}} />);
    openAndSearch();
    await waitFor(() => expect(screen.getByText("globex-industries.example")).toBeTruthy());

    const all = SAMPLE.suggestions.map((s) => s.domain);
    // Copy-all copies every suggestion, not just a selected subset.
    fireEvent.click(screen.getByRole("button", { name: "Copy all domains" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(all.join("\n")));

    fireEvent.click(screen.getByRole("button", { name: "Comma-separated" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(all.join(", ")));
  });

  it("renders a plain message on 401", async () => {
    fetchMock.mockResolvedValue(httpJson(401, { error: "Unauthorized." }));
    render(<CompetitorFinder onAdd={() => {}} />);
    openAndSearch();
    await waitFor(() => expect(screen.getByText(/not authorised/i)).toBeTruthy());
  });

  it("renders a plain message on 429", async () => {
    fetchMock.mockResolvedValue(httpJson(429, { error: "rate" }));
    render(<CompetitorFinder onAdd={() => {}} />);
    openAndSearch();
    await waitFor(() => expect(screen.getByText(/Rate limit reached/i)).toBeTruthy());
  });

  it("surfaces a connection error without throwing", async () => {
    fetchMock.mockRejectedValue(new Error("network"));
    render(<CompetitorFinder onAdd={() => {}} />);
    openAndSearch();
    await waitFor(() => expect(screen.getByText(/Could not reach the lookup service/i)).toBeTruthy());
  });
});

describe("makeCompetitorCondition", () => {
  it("builds a stable, reviewable recipient-domain condition", () => {
    const cond = makeCompetitorCondition(["globex.example", "initech.example"]);
    expect(cond.conditionType).toBe("recipient_domain");
    expect(cond.id).toBe("rcp-competitor-lookup");
    if (cond.conditionType === "recipient_domain") {
      expect(cond.domains).toEqual(["globex.example", "initech.example"]);
    }
    expect(cond.recommendedAction).toBe("warn_require_justification");
  });
});
