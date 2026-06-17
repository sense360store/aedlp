import { describe, it, expect } from "vitest";
import { stripWrapper, buildEffectiveRegex, runRegexTest, buildHighlightSegments, tokenizeRegex } from "./regex";

describe("regex helpers", () => {
  it("stripWrapper removes only a matched \\b...\\b wrapper", () => {
    expect(stripWrapper("\\bfoo\\b")).toBe("foo");
    expect(stripWrapper("foo")).toBe("foo");
    expect(stripWrapper("\\bfoo")).toBe("\\bfoo");
  });

  it("buildEffectiveRegex applies boundary strategies", () => {
    expect(buildEffectiveRegex("foo", "as_is")).toBe("foo");
    expect(buildEffectiveRegex("foo", "")).toBe("foo");
    expect(buildEffectiveRegex("foo", "unknown")).toBe("foo");
    expect(buildEffectiveRegex("foo", "word")).toBe("\\bfoo\\b");
    // already-wrapped stays wrapped (strip then re-wrap)
    expect(buildEffectiveRegex("\\bGB\\b", "word")).toBe("\\bGB\\b");
  });

  it("buildEffectiveRegex(word) and stripWrapper round-trip", () => {
    expect(stripWrapper(buildEffectiveRegex("foo", "word"))).toBe("foo");
    expect(stripWrapper(buildEffectiveRegex("\\d{3}-\\d{4}", "word"))).toBe("\\d{3}-\\d{4}");
  });

  it("runRegexTest counts matches and reports errors", () => {
    const r = runRegexTest("\\d{3}", "a 123 b 456", false);
    expect(r.ok).toBe(true);
    expect(r.count).toBe(2);
    expect(r.matches[0]).toEqual({ value: "123", index: 2 });

    expect(runRegexTest("", "x", false)).toEqual({ ok: false, error: "Empty pattern.", matches: [], count: 0 });

    const bad = runRegexTest("(", "x", false);
    expect(bad.ok).toBe(false);
    expect(typeof bad.error).toBe("string");
    expect(bad.count).toBe(0);
  });

  it("runRegexTest honours the case-insensitive flag", () => {
    expect(runRegexTest("abc", "ABC abc", false).count).toBe(1);
    expect(runRegexTest("abc", "ABC abc", true).count).toBe(2);
  });

  it("buildHighlightSegments splits around matches", () => {
    const segs = buildHighlightSegments("abXYcd", [{ value: "XY", index: 2 }]);
    expect(segs).toEqual([
      { text: "ab", mark: false },
      { text: "XY", mark: true },
      { text: "cd", mark: false },
    ]);
    expect(buildHighlightSegments("abc", [])).toEqual([{ text: "abc", mark: false }]);
  });

  it("tokenizeRegex classifies tokens", () => {
    expect(tokenizeRegex("\\d+")).toEqual([
      { cls: "tok-escape", text: "\\d" },
      { cls: "tok-quant", text: "+" },
    ]);
    const t = tokenizeRegex("a[bc].");
    expect(t.map((x) => x.cls)).toEqual(["tok-literal", "tok-class", "tok-meta"]);
    expect(t[1].text).toBe("[bc]");
  });
});
