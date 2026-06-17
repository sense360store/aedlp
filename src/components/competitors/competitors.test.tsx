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
  fireEvent.click(screen.getByRole("button", { name: "Find competitors" }));
  fireEvent.change(screen.getByLabelText("Company or customer name"), { target: { value: "Acme" } });
  fireEvent.click(screen.getByRole("button", { name: "Find" }));
}

describe("CompetitorFinder", () => {
  it("shows the permanent privacy note when opened", () => {
    render(<CompetitorFinder onAdd={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Find competitors" }));
    expect(screen.getByText(/Only the company name and industry you type are sent/i)).toBeTruthy();
    expect(screen.getByText(/extractor stay in your browser and are never sent/i)).toBeTruthy();
  });

  it("expands an inline panel (not a modal dialog) and toggles via the trigger", () => {
    render(<CompetitorFinder onAdd={() => {}} />);
    const trigger = screen.getByRole("button", { name: "Find competitors" });
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
    const trigger = screen.getByRole("button", { name: "Find competitors" });
    fireEvent.click(trigger);
    expect(screen.getByText(/Only the company name and industry you type are sent/i)).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText(/Only the company name and industry you type are sent/i)).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("collapses the panel via the visible Close button", () => {
    render(<CompetitorFinder onAdd={() => {}} />);
    const trigger = screen.getByRole("button", { name: "Find competitors" });
    fireEvent.click(trigger);
    // The foot's "Close" is distinct from the header's "Close competitor finder".
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText(/Only the company name and industry you type are sent/i)).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
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
