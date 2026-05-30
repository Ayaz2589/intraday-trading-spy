import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useSidebarMode, type SidebarMode } from "./sidebar-mode";

const STORAGE_KEY = "isb-sidebar";

beforeEach(() => {
  localStorage.clear();
});

describe("useSidebarMode", () => {
  it("defaults to 'expanded' on first visit", () => {
    const { result } = renderHook(() => useSidebarMode());
    expect(result.current.mode).toBe<SidebarMode>("expanded");
  });

  it("setMode('collapsed') updates state and persists", () => {
    const { result } = renderHook(() => useSidebarMode());
    act(() => result.current.setMode("collapsed"));
    expect(result.current.mode).toBe("collapsed");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("collapsed");
  });

  it("reads persisted value on mount", () => {
    localStorage.setItem(STORAGE_KEY, "collapsed");
    const { result } = renderHook(() => useSidebarMode());
    expect(result.current.mode).toBe("collapsed");
  });

  it("ignores invalid stored values and falls back to 'expanded'", () => {
    localStorage.setItem(STORAGE_KEY, "hidden");
    const { result } = renderHook(() => useSidebarMode());
    expect(result.current.mode).toBe("expanded");
  });

  it("toggle flips between expanded and collapsed", () => {
    const { result } = renderHook(() => useSidebarMode());
    act(() => result.current.toggle());
    expect(result.current.mode).toBe("collapsed");
    act(() => result.current.toggle());
    expect(result.current.mode).toBe("expanded");
  });
});
