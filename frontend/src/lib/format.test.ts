import { describe, it, expect } from "vitest";
import { humanize, truncate } from "./format";

describe("humanize", () => {
  it("converts snake_case to Title Case", () => {
    expect(humanize("force_flat")).toBe("Force Flat");
    expect(humanize("position_value_exceeds_cap")).toBe(
      "Position Value Exceeds Cap",
    );
  });

  it("uppercases known acronyms", () => {
    expect(humanize("vwap_pullback_long")).toBe("VWAP Pullback Long");
    expect(humanize("or_high")).toBe("OR High");
  });

  it("returns empty string for null/undefined", () => {
    expect(humanize(null)).toBe("");
    expect(humanize(undefined)).toBe("");
  });
});

describe("truncate", () => {
  it("returns the string unchanged if shorter than max", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("truncates with ellipsis when longer", () => {
    expect(truncate("a".repeat(50), 10)).toBe("aaaaaaaaa…");
  });
});
