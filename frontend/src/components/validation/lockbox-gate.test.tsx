import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { LockboxGate } from "./lockbox-gate";
import type { LockboxStatus } from "@/api/types";

function _status(over: Partial<LockboxStatus> = {}): LockboxStatus {
  return {
    lockbox_start: "2025-01-01", lockbox_end: "2026-12-31", state: "unspent",
    config_fingerprint: null, run_id: null, result: null, history: [], ...over,
  };
}

describe("LockboxGate", () => {
  it("offers the one-shot run when unspent, with the lockbox tooltip", () => {
    const onRun = vi.fn();
    render(<LockboxGate status={_status()} onRun={onRun} />);
    expect(document.querySelector('[data-help-key="lockbox"]')).toBeTruthy();
    const btn = screen.getByRole("button", { name: /run.*lockbox/i });
    fireEvent.click(btn);
    expect(onRun).toHaveBeenCalledWith(false);
  });

  it("shows the recorded result when spent", () => {
    render(
      <LockboxGate
        status={_status({ state: "spent", config_fingerprint: "abc123", result: { total_net_pnl_dollars: 123.45 } })}
        onRun={vi.fn()}
      />
    );
    expect(screen.getByTestId("lockbox-state")).toHaveTextContent(/spent/i);
    expect(screen.getByText(/123\.45/)).toBeInTheDocument();
  });

  it("shows a contaminated banner when burned, with the burned tooltip", () => {
    render(<LockboxGate status={_status({ state: "burned" })} onRun={vi.fn()} />);
    expect(screen.getByTestId("lockbox-state")).toHaveTextContent(/burned|contaminated/i);
    expect(document.querySelector('[data-help-key="burned_lockbox"]')).toBeTruthy();
  });

  // Validation-page rework: the gate renders flat inside the route's Lockbox
  // section — no nested card repeating the section title.
  it("renders flat — no nested card or duplicate Lockbox heading", () => {
    render(<LockboxGate status={_status()} onRun={vi.fn()} />);
    expect(document.querySelector("section.card")).toBeNull();
    expect(screen.queryByRole("heading", { name: /lockbox/i })).toBeNull();
  });

  it("renders the state as a design-system chip", () => {
    render(<LockboxGate status={_status()} onRun={vi.fn()} />);
    const chip = screen.getByTestId("lockbox-state");
    expect(chip.className).toContain("chip");
    expect(chip).toHaveTextContent(/unspent/i);
  });

  it("renders a leading form cell passed as children in the header row", () => {
    render(
      <LockboxGate status={_status()} onRun={vi.fn()}>
        <div data-testid="config-slot" />
      </LockboxGate>,
    );
    expect(screen.getByTestId("config-slot")).toBeInTheDocument();
  });
});
