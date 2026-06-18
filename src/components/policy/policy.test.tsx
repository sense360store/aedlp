// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AEDLP_DATA } from "../../data/library";
import { PolicyDraft, type PolicyDraftState, type DraftSetters } from "./PolicyDraft";
import { TestPanel } from "./TestPanel";
import type { Condition, Detector, KeywordDetector, RegexDetector } from "../../types";

afterEach(cleanup);

const byId = new Map(AEDLP_DATA.detectors.map((d) => [d.id, d] as const));
const det = (id: string) => byId.get(id)!;
const snippet = (id: string) => AEDLP_DATA.sampleSnippets.find((s) => s.id === id)!.text;

function makeCond(d: Detector): Condition {
  return d.conditionType === "regular_expression" ? { ...d, boundary: "as_is", _effectiveRegex: d.regex } : { ...d };
}

const noopSetters: DraftSetters = {
  name: () => {},
  description: () => {},
  tags: () => {},
  action: () => {},
  scan: () => {},
  resetName: () => {},
  resetDesc: () => {},
  resetTags: () => {},
};
const emptySug = { name: "", description: "", tags: [] as string[] };
const baseDraft: PolicyDraftState = {
  name: "",
  description: "",
  tags: [],
  action: "warn",
  scan: { body: true, subject: true, attachments: true },
  nameDirty: false,
  descDirty: false,
  tagsDirty: false,
  actionDirty: false,
};

describe("PolicyDraft", () => {
  it("renders the empty state with no conditions", () => {
    const { container } = render(
      <PolicyDraft
        draft={baseDraft}
        set={noopSetters}
        conditions={[]}
        operator="OR"
        setOperator={() => {}}
        onRemove={() => {}}
        onToggleBoundary={() => {}}
        onClear={() => {}}
        suggestions={emptySug}
      />,
    );
    expect(container.querySelector(".pd-empty")).not.toBeNull();
    expect(container.textContent).toContain("No conditions yet");
    // Copy all only appears when there is at least one condition
    expect(screen.queryByRole("button", { name: "Copy all" })).toBeNull();
  });

  it("Copy all produces the full export text block", async () => {
    const aws = makeCond(det("aws-access-key"));
    const kw = makeCond(det("kw-hr-personnel"));
    const draft: PolicyDraftState = {
      ...baseDraft,
      name: "Test policy",
      description: "Desc",
      tags: ["alpha", "beta"],
      action: "block",
      scan: { body: true, subject: true, attachments: false },
    };
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });

    render(
      <PolicyDraft
        draft={draft}
        set={noopSetters}
        conditions={[aws, kw]}
        operator="OR"
        setOperator={() => {}}
        onRemove={() => {}}
        onToggleBoundary={() => {}}
        onClear={() => {}}
        suggestions={emptySug}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy all" }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const text = writeText.mock.calls[0][0] as string;
    expect(text).toContain("Policy name:\nTest policy");
    expect(text).toContain("Rule description:\nDesc");
    expect(text).toContain("Tags:\nalpha, beta");
    expect(text).toContain("Action:\nBlock");
    expect(text).toContain("Scan locations:\nEmail body, Email subject");
    expect(text).not.toContain("Attachment text");
    expect(text).toContain("Condition logic:\nMatch if ANY of the conditions match");
    expect(text).toContain("Condition 1 — AWS Access Key ID (Regex):");
    expect(text).toContain((det("aws-access-key") as RegexDetector).regex);
    expect(text).toContain("Condition 2 — HR — Sensitive Personnel (Keywords):");
    expect(text).toContain((det("kw-hr-personnel") as KeywordDetector).keywords.join("\n"));
  });

  it("shows the AND/OR logic toggle only with more than one condition", () => {
    const one = render(
      <PolicyDraft
        draft={baseDraft}
        set={noopSetters}
        conditions={[makeCond(det("aws-access-key"))]}
        operator="OR"
        setOperator={() => {}}
        onRemove={() => {}}
        onToggleBoundary={() => {}}
        onClear={() => {}}
        suggestions={emptySug}
      />,
    );
    expect(one.container.querySelector(".logic-toggle")).toBeNull();
    cleanup();
    const two = render(
      <PolicyDraft
        draft={baseDraft}
        set={noopSetters}
        conditions={[makeCond(det("aws-access-key")), makeCond(det("gb-iban"))]}
        operator="OR"
        setOperator={() => {}}
        onRemove={() => {}}
        onToggleBoundary={() => {}}
        onClear={() => {}}
        suggestions={emptySug}
      />,
    );
    expect(two.container.querySelector(".logic-toggle")).not.toBeNull();
    // joiner pill between rows shows the operator
    expect(two.container.querySelector(".joiner-pill")?.textContent).toBe("OR");
  });

  it("regex condition exposes a word-boundary toggle; non-regex does not", () => {
    const onToggleBoundary = vi.fn();
    const regexRender = render(
      <PolicyDraft
        draft={baseDraft}
        set={noopSetters}
        conditions={[makeCond(det("aws-access-key"))]}
        operator="OR"
        setOperator={() => {}}
        onRemove={() => {}}
        onToggleBoundary={onToggleBoundary}
        onClear={() => {}}
        suggestions={emptySug}
      />,
    );
    const checkbox = regexRender.container.querySelector(".cond-boundary input[type=checkbox]") as HTMLInputElement;
    expect(checkbox).not.toBeNull();
    fireEvent.click(checkbox);
    expect(onToggleBoundary).toHaveBeenCalledWith("aws-access-key", true);
    cleanup();

    const kwRender = render(
      <PolicyDraft
        draft={baseDraft}
        set={noopSetters}
        conditions={[makeCond(det("kw-hr-personnel"))]}
        operator="OR"
        setOperator={() => {}}
        onRemove={() => {}}
        onToggleBoundary={() => {}}
        onClear={() => {}}
        suggestions={emptySug}
      />,
    );
    expect(kwRender.container.querySelector(".cond-boundary")).toBeNull();
  });

  it("gives a recipient-domain condition select/copy-all controls with an expandable list", async () => {
    const rcp = makeCond(det("rcp-competitors-aerospace"));
    if (rcp.conditionType !== "recipient_domain") throw new Error("expected a recipient detector");
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });

    const { container } = render(
      <MemoryRouter>
        <PolicyDraft
          draft={baseDraft}
          set={noopSetters}
          conditions={[rcp]}
          operator="OR"
          setOperator={() => {}}
          onRemove={() => {}}
          onToggleBoundary={() => {}}
          onClear={() => {}}
          suggestions={emptySug}
        />
      </MemoryRouter>,
    );
    const row = container.querySelector(".cond-row") as HTMLElement;
    // Compact in the draft: a few chips plus a "+N domains — show all" expander.
    expect(row.querySelectorAll(".prev-chip.pick")).toHaveLength(8);
    fireEvent.click(within(row).getByRole("button", { name: /show all/i }));
    expect(row.querySelectorAll(".prev-chip.pick")).toHaveLength(rcp.domains.length);

    // Copy-all yields the entire domain list, ready for the AEDLP field.
    fireEvent.click(within(row).getByRole("button", { name: "Copy all domains" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(rcp.domains.join("\n")));
  });

  it("the remove button calls onRemove with the condition id", () => {
    const onRemove = vi.fn();
    const { container } = render(
      <PolicyDraft
        draft={baseDraft}
        set={noopSetters}
        conditions={[makeCond(det("aws-access-key"))]}
        operator="OR"
        setOperator={() => {}}
        onRemove={onRemove}
        onToggleBoundary={() => {}}
        onClear={() => {}}
        suggestions={emptySug}
      />,
    );
    fireEvent.click(container.querySelector(".icon-x")!);
    expect(onRemove).toHaveBeenCalledWith("aws-access-key");
  });
});

describe("TestPanel", () => {
  it("shows a per-condition result and a triggering verdict for a matching sample", () => {
    const { container } = render(
      <TestPanel
        conditions={[makeCond(det("aws-access-key"))]}
        operator="OR"
        sample={snippet("snip-secrets")}
        setSample={() => {}}
        focus={null}
        clearFocus={() => {}}
      />,
    );
    expect(container.querySelectorAll(".tres")).toHaveLength(1);
    expect(container.querySelector(".tres.hit")).not.toBeNull();
    expect(container.querySelector(".tres-dot.ok")).not.toBeNull();
    expect(container.querySelector(".badge")?.textContent).toContain("Policy triggers");
    expect(container.querySelector(".badge")?.textContent).toContain("1/1");
  });

  it("reports no trigger when the sample does not match", () => {
    const { container } = render(
      <TestPanel
        conditions={[makeCond(det("aws-access-key"))]}
        operator="OR"
        sample={snippet("snip-clean")}
        setSample={() => {}}
        focus={null}
        clearFocus={() => {}}
      />,
    );
    expect(container.querySelector(".badge")?.textContent).toContain("No trigger");
    expect(container.querySelector(".badge")?.textContent).toContain("0/1");
  });

  it("shows the focus note when testing a detector that is not yet added", () => {
    const { container } = render(
      <TestPanel
        conditions={[]}
        operator="OR"
        sample=""
        setSample={() => {}}
        focus={det("gb-iban")}
        clearFocus={() => {}}
      />,
    );
    expect(container.querySelector(".tp-focus-note")).not.toBeNull();
    expect(container.textContent).toContain("Testing");
    expect(container.textContent).toContain("UK IBAN");
  });
});
