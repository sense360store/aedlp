// @vitest-environment jsdom
import { afterEach, describe, it, expect } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PolicyCreator from "./PolicyCreator";

afterEach(cleanup);

describe("PolicyCreator page", () => {
  it("renders the topbar and the library", () => {
    const { container } = render(
      <MemoryRouter>
        <PolicyCreator />
      </MemoryRouter>,
    );
    expect(screen.getByText("AEDLP Policy Creator")).toBeTruthy();
    expect(screen.getByText("Detector library & custom-policy assembler")).toBeTruthy();
    expect(container.querySelectorAll(".lib-row").length).toBe(71);
    expect(container.querySelector(".added-pill")?.textContent).toContain("0 in policy");
  });

  it("updates the in-policy count when a detector is added", () => {
    const { container } = render(
      <MemoryRouter>
        <PolicyCreator />
      </MemoryRouter>,
    );
    const firstRow = container.querySelector<HTMLElement>(".lib-row")!;
    fireEvent.click(within(firstRow).getByRole("button", { name: "Add" }));
    expect(container.querySelector(".added-pill")?.textContent).toContain("1 in policy");
    // the row now reflects the added state
    expect(within(firstRow).getByRole("button", { name: "Added" })).toBeTruthy();
  });
});
