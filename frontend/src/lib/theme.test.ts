import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useTheme, applyTheme } from "./theme";

const STORAGE_KEY = "isb-theme";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.classList.remove("theme-no-anim");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("applyTheme", () => {
  it("sets data-theme='dark' on <html> for dark theme (T-THEME-2)", () => {
    applyTheme("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("sets data-theme='light' on <html> for light theme (T-THEME-2)", () => {
    applyTheme("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("applies .theme-no-anim class during the swap (T-THEME-4)", async () => {
    applyTheme("light");
    expect(
      document.documentElement.classList.contains("theme-no-anim"),
    ).toBe(true);
    // Wait two animation frames so the suppression class is removed.
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r(undefined))),
    );
    expect(
      document.documentElement.classList.contains("theme-no-anim"),
    ).toBe(false);
  });
});

describe("useTheme", () => {
  it("defaults to 'dark' when localStorage is empty (T-THEME-1)", () => {
    // Even when matchMedia would prefer light, default is 'dark' per the
    // spec — system preference is NOT consulted.
    vi.spyOn(window, "matchMedia").mockImplementation((q) => ({
      matches: q.includes("light"),
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    }));
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
  });

  it("reads stored value over the default (T-THEME-3)", () => {
    localStorage.setItem(STORAGE_KEY, "light");
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");
  });

  it("toggle flips theme, persists to isb-theme, and updates data-theme (T-THEME-2)", () => {
    localStorage.setItem(STORAGE_KEY, "light");
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggle());
    expect(result.current.theme).toBe("dark");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("ignores invalid stored values and falls back to 'dark'", () => {
    localStorage.setItem(STORAGE_KEY, "neon");
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
  });
});
