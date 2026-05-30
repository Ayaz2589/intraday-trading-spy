import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Read the live CSS file and parse it to verify the design-token contract
// declared in specs/004-design-system-adoption/contracts/tokens.md.
const cssPath = path.resolve(__dirname, "globals.css");
const cssText = fs.readFileSync(cssPath, "utf8");

// Extract the contents of a CSS block (everything between `{` and the matching
// closing `}`) given a regex matching the selector line.
function block(selectorRegex: RegExp): string {
  const match = cssText.match(selectorRegex);
  if (!match) {
    throw new Error(
      `Could not find selector matching ${selectorRegex} in globals.css`,
    );
  }
  const start = (match.index ?? 0) + match[0].length;
  let depth = 0;
  let i = start;
  for (; i < cssText.length; i++) {
    if (cssText[i] === "{") depth++;
    else if (cssText[i] === "}") {
      if (depth === 0) break;
      depth--;
    }
  }
  return cssText.slice(start, i);
}

function tokenIn(blockText: string, name: string): string | null {
  // Match `--name: value;` (value may span multiple lines until `;`).
  const re = new RegExp(`--${name}:\\s*([^;]+);`, "i");
  const m = blockText.match(re);
  return m ? m[1].trim() : null;
}

describe("design tokens (contract from specs/004/contracts/tokens.md)", () => {
  describe("theme-stable tokens (defined in :root)", () => {
    const root = block(/:root\s*\{/);

    it("brand accent palette", () => {
      expect(tokenIn(root, "accent")).toBe("#2563eb");
      expect(tokenIn(root, "accent-hover")).toBe("#3b82f6");
      expect(tokenIn(root, "accent-press")).toBe("#1d4ed8");
      expect(tokenIn(root, "accent-contrast")).toBe("#ffffff");
    });

    it("info color stays constant across themes", () => {
      expect(tokenIn(root, "info")).toBe("#38bdf8");
    });

    it("motion tokens", () => {
      expect(tokenIn(root, "ease")).toBe("cubic-bezier(0.22, 1, 0.36, 1)");
      expect(tokenIn(root, "speed")).toBe("180ms");
    });

    it("font families", () => {
      expect(tokenIn(root, "font-sans")).toMatch(/Plus Jakarta Sans/);
      expect(tokenIn(root, "font-mono")).toMatch(/JetBrains Mono/);
    });

    it("typography scale tokens", () => {
      expect(tokenIn(root, "fs-2xs")).toBe("10.5px");
      expect(tokenIn(root, "fs-xs")).toBe("11.5px");
      expect(tokenIn(root, "fs-sm")).toBe("13px");
      expect(tokenIn(root, "fs-base")).toBe("14px");
      expect(tokenIn(root, "fs-md")).toBe("15px");
      expect(tokenIn(root, "fs-lg")).toBe("18px");
      expect(tokenIn(root, "fs-xl")).toBe("22px");
    });

    it("spacing tokens (4px base scale)", () => {
      expect(tokenIn(root, "sp-1")).toBe("4px");
      expect(tokenIn(root, "sp-2")).toBe("8px");
      expect(tokenIn(root, "sp-3")).toBe("12px");
      expect(tokenIn(root, "sp-4")).toBe("16px");
      expect(tokenIn(root, "sp-5")).toBe("20px");
      expect(tokenIn(root, "sp-6")).toBe("24px");
      expect(tokenIn(root, "sp-8")).toBe("32px");
    });

    it("radii tokens", () => {
      expect(tokenIn(root, "r-xs")).toBe("6px");
      expect(tokenIn(root, "r-sm")).toBe("8px");
      expect(tokenIn(root, "r-md")).toBe("12px");
      expect(tokenIn(root, "r-lg")).toBe("16px");
      expect(tokenIn(root, "r-pill")).toBe("999px");
    });
  });

  describe("dark theme tokens (cascade: :root → [data-theme=\"dark\"])", () => {
    // The :root, [data-theme="dark"] combined block houses bg / surface /
    // text / border tokens; some semantic tokens (P&L) live in the
    // standalone :root block since dark is the default theme (only light
    // overrides them).
    const dark = block(/(?::root\s*,\s*)?\[data-theme="dark"\]\s*\{/);
    const root = block(/:root\s*\{/);
    const darkValue = (name: string) => tokenIn(dark, name) ?? tokenIn(root, name);

    it("application backgrounds", () => {
      expect(darkValue("bg-app")).toBe("#0a0d15");
      expect(darkValue("bg-rail")).toBe("#0c1019");
    });

    it("surfaces", () => {
      expect(darkValue("surface")).toBe("#121723");
      expect(darkValue("surface-2")).toBe("#182030");
      expect(darkValue("surface-3")).toBe("#1f293c");
    });

    it("borders", () => {
      expect(darkValue("border")).toBe("rgba(148, 163, 184, 0.12)");
      expect(darkValue("border-strong")).toBe("rgba(148, 163, 184, 0.22)");
      expect(darkValue("border-accent")).toBe("rgba(37, 99, 235, 0.5)");
    });

    it("text colors", () => {
      expect(darkValue("text")).toBe("#eef2f8");
      expect(darkValue("text-muted")).toBe("#9aa7bd");
      expect(darkValue("text-faint")).toBe("#66738c");
    });

    it("P&L semantic colors (cascade from :root since dark is primary)", () => {
      expect(darkValue("profit")).toBe("#14b884");
      expect(darkValue("loss")).toBe("#f04f6a");
      expect(darkValue("warn")).toBe("#f5a524");
    });

    it("chart background", () => {
      expect(darkValue("chart-bg")).toBe("#0c111c");
    });

    it("grid", () => {
      expect(darkValue("grid")).toBe("rgba(148, 163, 184, 0.08)");
    });
  });

  describe("light theme tokens", () => {
    const light = block(/\[data-theme="light"\]\s*\{/);

    it("application backgrounds", () => {
      expect(tokenIn(light, "bg-app")).toBe("#eef1f6");
      expect(tokenIn(light, "bg-rail")).toBe("#f4f6fb");
    });

    it("surfaces", () => {
      expect(tokenIn(light, "surface")).toBe("#ffffff");
      expect(tokenIn(light, "surface-2")).toBe("#f6f8fc");
      expect(tokenIn(light, "surface-3")).toBe("#eef2f8");
    });

    it("borders", () => {
      expect(tokenIn(light, "border")).toBe("rgba(15, 23, 42, 0.09)");
      expect(tokenIn(light, "border-strong")).toBe("rgba(15, 23, 42, 0.16)");
      expect(tokenIn(light, "border-accent")).toBe("rgba(37, 99, 235, 0.4)");
    });

    it("text colors", () => {
      expect(tokenIn(light, "text")).toBe("#111726");
      expect(tokenIn(light, "text-muted")).toBe("#56627a");
      expect(tokenIn(light, "text-faint")).toBe("#8a96ab");
    });

    it("P&L semantic colors (slightly darker than dark theme)", () => {
      expect(tokenIn(light, "profit")).toBe("#0f9e6e");
      expect(tokenIn(light, "loss")).toBe("#e23b58");
      expect(tokenIn(light, "warn")).toBe("#d98309");
    });

    it("chart background", () => {
      expect(tokenIn(light, "chart-bg")).toBe("#fbfcfe");
    });
  });

  describe("infrastructure rules", () => {
    it("loads Plus Jakarta Sans + JetBrains Mono via Google Fonts @import", () => {
      expect(cssText).toMatch(/@import\s+url\(['"]https:\/\/fonts\.googleapis\.com/);
      expect(cssText).toMatch(/Plus\+Jakarta\+Sans/);
      expect(cssText).toMatch(/JetBrains\+Mono/);
      expect(cssText).toMatch(/display=swap/);
    });

    it("preserves Tailwind v4's @import directive", () => {
      expect(cssText).toMatch(/@import\s+["']tailwindcss["']/);
    });

    it("redefines the dark variant using data-theme attribute", () => {
      expect(cssText).toMatch(
        /@custom-variant\s+dark\s*\(\s*&:where\(\[data-theme="dark"\]/,
      );
    });

    it("includes the theme-no-anim flicker-suppression rule", () => {
      expect(cssText).toMatch(/\.theme-no-anim\s*\*/);
      expect(cssText).toMatch(/transition\s*:\s*none\s*!important/);
    });

    it("includes a @supports fallback for backdrop-filter", () => {
      expect(cssText).toMatch(/@supports\s+not\s*\(\s*backdrop-filter/);
    });

    it("collapses stat-row to 2 columns at ≤1180px with Rejections spanning both (FR-012, finding U1)", () => {
      expect(cssText).toMatch(
        /@media\s*\(\s*max-width:\s*1180px\s*\)[\s\S]*?\.stat-row\s*\{[^}]*grid-template-columns:\s*1fr\s+1fr/,
      );
      expect(cssText).toMatch(
        /@media\s*\(\s*max-width:\s*1180px\s*\)[\s\S]*?\.stat-row\s*>\s*\.card:last-child\s*\{[^}]*grid-column:\s*span\s+2/,
      );
    });

    it("hides the sidebar and stacks to one column at ≤860px (FR-012)", () => {
      expect(cssText).toMatch(
        /@media\s*\(\s*max-width:\s*860px\s*\)[\s\S]*?\.sidebar\s*\{[^}]*display:\s*none/,
      );
      expect(cssText).toMatch(
        /@media\s*\(\s*max-width:\s*860px\s*\)[\s\S]*?\.app\s*\{[^}]*grid-template-columns:\s*1fr/,
      );
    });
  });
});
