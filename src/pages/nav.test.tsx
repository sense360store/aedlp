// @vitest-environment jsdom
import { afterEach, describe, it, expect } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import PolicyCreator from "./PolicyCreator";
import Extractor from "./Extractor";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function renderAppAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<PolicyCreator />} />
        <Route path="/trusted-domain-extractor" element={<Extractor />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("primary navigation", () => {
  it("routes from the Policy Creator to the extractor", () => {
    renderAppAt("/");
    expect(screen.getByText("Detector library & custom-policy assembler")).toBeTruthy();

    fireEvent.click(screen.getByRole("link", { name: "Trusted domains" }));
    expect(screen.getByText("Extract trusted third-party domains")).toBeTruthy();
  });

  it("routes from the extractor back to the Policy Creator", () => {
    renderAppAt("/trusted-domain-extractor");
    expect(screen.getByText("Extract trusted third-party domains")).toBeTruthy();

    fireEvent.click(screen.getByRole("link", { name: "Policy Creator" }));
    expect(screen.getByText("Detector library & custom-policy assembler")).toBeTruthy();
  });
});
