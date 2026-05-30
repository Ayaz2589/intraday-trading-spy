import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  fireToast,
  subscribe,
  getSnapshot,
  TOAST_DURATION_MS,
} from "./toast-controller";

beforeEach(() => {
  vi.useFakeTimers();
  // Reset state by firing a clear via internal dismissal — easiest is to
  // fire then advance past dismissal.
  fireToast("__reset__");
  vi.advanceTimersByTime(TOAST_DURATION_MS + 10);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("toast-controller (T-TOAST-1..T-TOAST-4 per states.md)", () => {
  it("fireToast sets the visible message (T-TOAST-1)", () => {
    fireToast("Hello");
    expect(getSnapshot().message).toBe("Hello");
  });

  it("clears the message after TOAST_DURATION_MS (T-TOAST-2)", () => {
    fireToast("Hello");
    expect(getSnapshot().message).toBe("Hello");
    vi.advanceTimersByTime(TOAST_DURATION_MS + 1);
    expect(getSnapshot().message).toBeNull();
  });

  it("a second fireToast replaces the message and resets the timer (T-TOAST-3)", () => {
    fireToast("A");
    vi.advanceTimersByTime(500);
    expect(getSnapshot().message).toBe("A");
    fireToast("B");
    expect(getSnapshot().message).toBe("B");
    // Advance only what would have been the original dismiss window — B
    // should still be visible since its timer reset.
    vi.advanceTimersByTime(TOAST_DURATION_MS - 500 + 10);
    expect(getSnapshot().message).toBe("B");
    // Now advance to dismiss B.
    vi.advanceTimersByTime(500);
    expect(getSnapshot().message).toBeNull();
  });

  it("rapid fires collapse to a single visible toast (T-TOAST-4)", () => {
    fireToast("A");
    vi.advanceTimersByTime(30);
    fireToast("B");
    vi.advanceTimersByTime(30);
    fireToast("C");
    expect(getSnapshot().message).toBe("C");
  });

  it("subscribers are notified on state change", () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    fireToast("X");
    expect(listener).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(TOAST_DURATION_MS + 1);
    // One more call for the auto-dismiss.
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    fireToast("Y");
    expect(listener).toHaveBeenCalledTimes(2); // no further calls
  });
});
