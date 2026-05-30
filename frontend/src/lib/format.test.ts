import { describe, it, expect } from "vitest";
import { humanize, truncate, formatRunTitle, runIdHash } from "./format";

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

describe("runIdHash", () => {
  it("extracts the 8-char hex tail from a run id", () => {
    expect(runIdHash("20260528-220714-7697908e")).toBe("7697908e");
  });

  it("returns the original string if there is no hex tail", () => {
    expect(runIdHash("custom-label")).toBe("custom-label");
  });
});

describe("formatRunTitle", () => {
  const now = new Date("2026-05-30T15:00:00");

  it('renders "Today HH:MM" for same-day runs', () => {
    expect(formatRunTitle("2026-05-30T10:07:00", now)).toMatch(/^Today /);
  });

  it('renders "Yesterday HH:MM" for runs from the prior day', () => {
    expect(formatRunTitle("2026-05-29T10:07:00", now)).toMatch(/^Yesterday /);
  });

  it("omits the year for same-year runs and includes it otherwise", () => {
    expect(formatRunTitle("2026-03-15T10:07:00", now)).not.toMatch(/2026/);
    expect(formatRunTitle("2025-03-15T10:07:00", now)).toMatch(/2025/);
  });

  it("returns the raw input on unparsable dates", () => {
    expect(formatRunTitle("not-a-date", now)).toBe("not-a-date");
  });
});
