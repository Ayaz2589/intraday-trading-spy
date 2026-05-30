import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Toast } from "./toast";
import { fireToast, TOAST_DURATION_MS } from "@/lib/toast-controller";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  // Drain any pending dismiss timers so state is reset for the next test.
  act(() => {
    vi.advanceTimersByTime(TOAST_DURATION_MS * 2);
  });
  vi.useRealTimers();
});

describe("<Toast> singleton portal", () => {
  it("renders nothing when no toast is active", () => {
    const { container } = render(<Toast />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the message when fireToast is called", () => {
    render(<Toast />);
    act(() => {
      fireToast("Hello world");
    });
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("auto-dismisses after TOAST_DURATION_MS", () => {
    render(<Toast />);
    act(() => {
      fireToast("Bye");
    });
    expect(screen.getByText("Bye")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS + 50);
    });
    expect(screen.queryByText("Bye")).toBeNull();
  });

  it("replace policy: a second fireToast swaps the visible message", () => {
    render(<Toast />);
    act(() => {
      fireToast("A");
    });
    expect(screen.getByText("A")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(500);
      fireToast("B");
    });
    expect(screen.queryByText("A")).toBeNull();
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("has a spinning accent ring (.toast-spinner) as a busy indicator", () => {
    const { container } = render(<Toast />);
    act(() => {
      fireToast("Working…");
    });
    expect(container.querySelector(".toast-spinner")).not.toBeNull();
  });
});
