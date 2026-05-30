import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useLayoutMode, type LayoutMode } from "./layout-mode";

const STORAGE_KEY = "isb-layout";

beforeEach(() => {
  localStorage.clear();
});

describe("useLayoutMode (T-LAYOUT-1..T-LAYOUT-4 per states.md)", () => {
  it("defaults to 'overview' on first visit (T-LAYOUT-1)", () => {
    const { result } = renderHook(() => useLayoutMode());
    expect(result.current.layout).toBe<LayoutMode>("overview");
  });

  it("setLayout('focus') updates state, persists, and is reflected in storage (T-LAYOUT-2)", () => {
    const { result } = renderHook(() => useLayoutMode());
    act(() => result.current.setLayout("focus"));
    expect(result.current.layout).toBe("focus");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("focus");
  });

  it("reads persisted value on mount (T-LAYOUT-3)", () => {
    localStorage.setItem(STORAGE_KEY, "focus");
    const { result } = renderHook(() => useLayoutMode());
    expect(result.current.layout).toBe("focus");
  });

  it("ignores invalid stored values and falls back to 'overview'", () => {
    localStorage.setItem(STORAGE_KEY, "fullscreen");
    const { result } = renderHook(() => useLayoutMode());
    expect(result.current.layout).toBe("overview");
  });

  it("toggle helper flips between overview and focus", () => {
    const { result } = renderHook(() => useLayoutMode());
    act(() => result.current.toggle());
    expect(result.current.layout).toBe("focus");
    act(() => result.current.toggle());
    expect(result.current.layout).toBe("overview");
  });
});
