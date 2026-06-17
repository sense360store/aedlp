import { describe, it, expect } from "vitest";
import { riskTone, typeTone, typeShort } from "./tones";

describe("tone and label helpers", () => {
  it("maps risk bands to tones", () => {
    expect(riskTone("low")).toBe("ok");
    expect(riskTone("medium")).toBe("warn");
    expect(riskTone("high")).toBe("danger");
    expect(riskTone("unknown")).toBe("neutral");
  });

  it("maps condition types to tones", () => {
    expect(typeTone("regular_expression")).toBe("info");
    expect(typeTone("keyword")).toBe("violet");
    expect(typeTone("keyword_pattern")).toBe("teal");
    expect(typeTone("recipient_domain")).toBe("amber");
    expect(typeTone("file_extension")).toBe("green");
    expect(typeTone("all")).toBe("neutral");
  });

  it("returns the short label for a condition type, or the input when unknown", () => {
    expect(typeShort("regular_expression")).toBe("Regex");
    expect(typeShort("recipient_domain")).toBe("Recipients");
    expect(typeShort("all")).toBe("all");
  });
});
