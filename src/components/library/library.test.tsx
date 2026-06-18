// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { useMemo, useState } from "react";
import { render, screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react";
import { AEDLP_DATA } from "../../data/library";
import { filterDetectors } from "../../lib/search";
import { LibraryPanel, type LibraryFilters } from "./LibraryPanel";
import { LibraryRow } from "./LibraryRow";
import type { Detector } from "../../types";

afterEach(cleanup);

/** Mirrors the page wiring (base = filters minus type) so we can drive the panel. */
function Harness(props: { onToggle?: (d: Detector) => void; onTest?: (d: Detector) => void; added?: Set<string> }) {
  const { onToggle = () => {}, onTest = () => {}, added = new Set<string>() } = props;
  const [filters, setFilters] = useState<LibraryFilters>({
    query: "",
    type: "all",
    category: "all",
    region: "all",
    industry: "all",
  });
  const base = useMemo(
    () =>
      filterDetectors(AEDLP_DATA.detectors, {
        query: filters.query,
        type: "all",
        category: filters.category,
        region: filters.region,
        industry: filters.industry,
      }),
    [filters.query, filters.category, filters.region, filters.industry],
  );
  const results = useMemo(
    () => (filters.type === "all" ? base : base.filter((d) => d.conditionType === filters.type)),
    [base, filters.type],
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    base.forEach((d) => {
      c[d.conditionType] = (c[d.conditionType] || 0) + 1;
    });
    return c;
  }, [base]);
  return (
    <LibraryPanel
      filters={filters}
      setFilters={setFilters}
      results={results}
      counts={counts}
      total={base.length}
      addedIds={added}
      onToggle={onToggle}
      onTest={onTest}
    />
  );
}

const byId = new Map(AEDLP_DATA.detectors.map((d) => [d.id, d] as const));
const det = (id: string) => byId.get(id)!;

describe("LibraryPanel filtering", () => {
  it("renders all detectors with the right total and per-type tab counts", () => {
    const { container } = render(<Harness />);
    expect(container.querySelector(".lib-count")?.textContent).toContain("110 of 110 detectors");
    const tabs = Array.from(container.querySelectorAll(".type-tab")).map((t) => t.textContent);
    expect(tabs).toEqual(
      expect.arrayContaining(["All110", "Regex62", "Keywords15", "Pattern11", "Recipients5", "File types17"]),
    );
  });

  it("filters by search query and updates the count and matching note", () => {
    const { container } = render(<Harness />);
    const search = container.querySelector("input.search") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "SSN" } });
    expect(container.querySelector(".lib-count")?.textContent).toContain("1 of 1 detectors");
    expect(container.querySelector(".lib-count")?.textContent).toContain("SSN");
    expect(container.querySelectorAll(".lib-row")).toHaveLength(1);
  });

  it("filters by type tab", () => {
    const { container } = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Keywords/ }));
    expect(container.querySelector(".lib-count")?.textContent).toContain("15 of 110 detectors");
    expect(container.querySelectorAll(".lib-row")).toHaveLength(15);
  });

  it("shows Clear filters only when a filter is active and resets it", () => {
    const { container } = render(<Harness />);
    expect(screen.queryByText("Clear filters")).toBeNull();
    const categorySelect = container.querySelectorAll("select.filter-select")[0] as HTMLSelectElement;
    fireEvent.change(categorySelect, { target: { value: "Credentials & secrets" } });
    expect(screen.getByText("Clear filters")).toBeTruthy();
    fireEvent.click(screen.getByText("Clear filters"));
    expect(screen.queryByText("Clear filters")).toBeNull();
    expect(container.querySelector(".lib-count")?.textContent).toContain("110 of 110 detectors");
  });

  it("renders the empty state when nothing matches", () => {
    const { container } = render(<Harness />);
    const search = container.querySelector("input.search") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "zzzznomatch" } });
    expect(container.querySelector(".lib-empty")).not.toBeNull();
    expect(container.textContent).toContain("No detectors match");
  });
});

describe("LibraryRow previews and expansion", () => {
  it("renders a highlighted regex preview", () => {
    const { container } = render(<LibraryRow d={det("aws-access-key")} added={false} onToggle={() => {}} onTest={() => {}} />);
    expect(container.querySelector(".prev-code .tok")).not.toBeNull();
  });

  it("renders keyword chips", () => {
    const { container } = render(<LibraryRow d={det("kw-hr-personnel")} added={false} onToggle={() => {}} onTest={() => {}} />);
    expect(container.querySelectorAll(".prev-chip").length).toBeGreaterThan(0);
  });

  it("renders recipient domain chips (mono) and file extension chips (ext)", () => {
    const rcp = render(<LibraryRow d={det("rcp-disposable")} added={false} onToggle={() => {}} onTest={() => {}} />);
    expect(rcp.container.querySelector(".prev-chip.mono")).not.toBeNull();
    const fe = render(<LibraryRow d={det("fe-archives")} added={false} onToggle={() => {}} onTest={() => {}} />);
    expect(fe.container.querySelector(".prev-chip.ext")).not.toBeNull();
  });

  it("renders a competitor pack like a recipient detector: chips, inspector, copy value, curate note", async () => {
    const d = det("rcp-competitors-aerospace");
    const { container } = render(<LibraryRow d={d} added={false} onToggle={() => {}} onTest={() => {}} />);

    // Collapsed preview shows mono domain chips led by the first domain.
    expect(container.querySelector(".prev-chip.mono")?.textContent).toBe("boeing.com");

    // Expand to the inspector: all 25 domains render (under the 48 cap) with the count.
    fireEvent.click(container.querySelector(".lib-row-main")!);
    const insp = container.querySelector(".inspector") as HTMLElement;
    expect(insp).not.toBeNull();
    expect(insp.querySelectorAll(".prev-chip.mono")).toHaveLength(25);
    expect(insp.textContent).toContain("match any (25)");

    // The curate-before-deploy steer is visible so the user curates first.
    expect(insp.textContent).toContain("Remove your own organisation");

    // Copy-all mirrors the other recipient detectors: the full domain list.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    const expected = d.conditionType === "recipient_domain" ? d.domains.join("\n") : "";
    fireEvent.click(within(insp).getByRole("button", { name: "Copy all domains" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expected));
  });

  it("gives a recipient detector select-all + copy-all controls in its expanded view", async () => {
    const d = det("rcp-competitors-aerospace");
    if (d.conditionType !== "recipient_domain") throw new Error("expected a recipient detector");
    const { container } = render(<LibraryRow d={d} added={false} onToggle={() => {}} onTest={() => {}} />);
    fireEvent.click(container.querySelector(".lib-row-main")!);
    const insp = container.querySelector(".inspector") as HTMLElement;

    // Defaults to all selected, so copy-all and copy-selected agree until you deselect.
    expect(within(insp).getByText(`${d.domains.length}/${d.domains.length} selected`)).toBeTruthy();
    const chips = insp.querySelectorAll<HTMLButtonElement>(".prev-chip.pick");
    expect(chips).toHaveLength(d.domains.length);
    expect(Array.from(chips).every((c) => c.getAttribute("aria-pressed") === "true")).toBe(true);

    // Deselecting one chip surfaces a "Copy selected" affordance for the subset.
    fireEvent.click(chips[0]);
    expect(within(insp).getByText(`${d.domains.length - 1}/${d.domains.length} selected`)).toBeTruthy();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    fireEvent.click(within(insp).getByRole("button", { name: `Copy selected (${d.domains.length - 1})` }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(d.domains.slice(1).join("\n")));

    // Copy-all still copies the FULL list regardless of the selection.
    fireEvent.click(within(insp).getByRole("button", { name: "Copy all domains" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(d.domains.join("\n")));

    // Deselect-all clears, select-all restores the whole set.
    fireEvent.click(within(insp).getByRole("button", { name: "Select all" }));
    expect(within(insp).getByText(`${d.domains.length}/${d.domains.length} selected`)).toBeTruthy();
  });

  it("expands a long recipient list so the whole set is visible, not just the first chips", () => {
    const d = det("rcp-freemail");
    if (d.conditionType !== "recipient_domain") throw new Error("expected a recipient detector");
    expect(d.domains.length).toBeGreaterThan(60);
    const { container } = render(<LibraryRow d={d} added={false} onToggle={() => {}} onTest={() => {}} />);
    fireEvent.click(container.querySelector(".lib-row-main")!);
    const insp = container.querySelector(".inspector") as HTMLElement;

    // Collapsed: a capped number of chips plus a "+N domains — show all" control.
    expect(insp.querySelectorAll(".prev-chip.pick")).toHaveLength(60);
    const more = within(insp).getByRole("button", { name: /show all/i });
    expect(more.textContent).toContain(`+${d.domains.length - 60}`);

    // Expanded: every domain renders so it can be seen and copied.
    fireEvent.click(more);
    expect(insp.querySelectorAll(".prev-chip.pick")).toHaveLength(d.domains.length);
    expect(within(insp).getByRole("button", { name: "Show fewer" })).toBeTruthy();
  });

  it("renders a serialized keyword_pattern preview", () => {
    const { container } = render(<LibraryRow d={det("kp-salary-disclosure")} added={false} onToggle={() => {}} onTest={() => {}} />);
    expect(container.querySelector(".prev-code.pattern")?.textContent).toContain("AND~12");
  });

  it("expands to the inspector and fires onToggle / onTest", () => {
    const onToggle = vi.fn();
    const onTest = vi.fn();
    const { container } = render(
      <LibraryRow d={det("aws-access-key")} added={false} onToggle={onToggle} onTest={onTest} />,
    );
    expect(container.querySelector(".inspector")).toBeNull();
    fireEvent.click(container.querySelector(".lib-row-main")!);
    expect(container.querySelector(".inspector")).not.toBeNull();
    expect(container.textContent).toContain("Should match");

    fireEvent.click(screen.getByRole("button", { name: "Test this" }));
    expect(onTest).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("reflects the added state in the row button", () => {
    render(<LibraryRow d={det("aws-access-key")} added onToggle={() => {}} onTest={() => {}} />);
    expect(screen.getByRole("button", { name: "Added" })).toBeTruthy();
  });
});
