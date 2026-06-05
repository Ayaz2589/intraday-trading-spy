import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

const computeMonteCarloMock = vi.fn();
vi.mock("@/api/validation", () => ({
  computeMonteCarlo: (b: unknown) => computeMonteCarloMock(b),
}));

// The error-state test injects a controlled hook result instead of rejecting
// a real mutation: this react-query version creates an internal thenable per
// mutation (React `use()` support) that floats unhandled when the mutation
// errors, and vitest attributes that rejection to the test even after its
// assertions pass (empirically bisected — see 015 quickstart notes).
const hookOverride: { current: object | null } = { current: null };
vi.mock("@/hooks/useStudies", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/hooks/useStudies")>();
  return {
    ...real,
    useMonteCarlo: () => hookOverride.current ?? real.useMonteCarlo(),
  };
});

const dist = (observed: number, p5: number, p25: number, p50: number, p75: number, p95: number) => ({
  observed, p5, p25, p50, p75, p95,
});

const FIXTURE = {
  shuffle: {
    max_drawdown_pct: dist(0.091, 0.068, 0.089, 0.104, 0.126, 0.162),
    max_drawdown_dollars: dist(2275, 1700, 2225, 2600, 3150, 4050),
    longest_losing_streak: dist(5, 4, 5, 6, 7, 9),
    longest_underwater_trades: dist(41, 28, 40, 54, 71, 97),
  },
  cone: {
    horizon_trades: 312,
    steps: [
      { trade_index: 1, p5: 24850, p25: 24940, p50: 25010, p75: 25080, p95: 25170 },
      { trade_index: 312, p5: 23100, p25: 25820, p50: 27940, p75: 30060, p95: 33310 },
    ],
  },
  terminal_equity: dist(27940, 23100, 25820, 27940, 30060, 33310),
  ruin: [
    { threshold_pct: 5, probability: 0.38 },
    { threshold_pct: 10, probability: 0.12 },
    { threshold_pct: 20, probability: 0.014 },
  ],
  iterations: 2000,
  seed: 20260604,
  trade_count: 312,
  starting_equity: 25000,
  low_confidence: false,
};

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: 0 }, mutations: { retry: 0 } },
  });
  return render(createElement(QueryClientProvider, { client }, ui));
}

beforeEach(() => {
  computeMonteCarloMock.mockClear();
  hookOverride.current = null;
});

describe("RunMonteCarloSection", () => {
  it("runs the simulation for the run and renders the panel", async () => {
    computeMonteCarloMock.mockResolvedValue(FIXTURE);
    const { RunMonteCarloSection } = await import("./run-monte-carlo-section");
    wrap(createElement(RunMonteCarloSection, { runId: "run-1" as never }));

    fireEvent.click(screen.getByRole("button", { name: /run simulation/i }));

    await waitFor(() =>
      expect(screen.getByTestId("monte-carlo-panel")).toBeInTheDocument()
    );
    expect(computeMonteCarloMock).toHaveBeenCalledWith({ run_id: "run-1" });
  });

  it("shows a pending state while computing", async () => {
    let resolve: (v: unknown) => void = () => {};
    computeMonteCarloMock.mockReturnValue(new Promise((r) => (resolve = r)));
    const { RunMonteCarloSection } = await import("./run-monte-carlo-section");
    wrap(createElement(RunMonteCarloSection, { runId: "run-1" as never }));

    fireEvent.click(screen.getByRole("button", { name: /run simulation/i }));
    await waitFor(() => expect(screen.getByText(/simulating/i)).toBeInTheDocument());
    resolve(FIXTURE);
  });

  it("renders the API's plain-English reason on error", async () => {
    hookOverride.current = {
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error(
        "this run has 1 trade — at least 2 are needed to simulate reorderings"
      ),
      mutate: vi.fn(),
    };
    const { RunMonteCarloSection } = await import("./run-monte-carlo-section");
    wrap(createElement(RunMonteCarloSection, { runId: "run-1" as never }));

    expect(screen.getByText(/at least 2 are needed/i)).toBeInTheDocument();
    // The launch button stays available for a retry after reading the reason.
    expect(screen.getByRole("button", { name: /run simulation/i })).toBeInTheDocument();
  });

  it("explains the concept with a HelpTooltip in the header", async () => {
    const { RunMonteCarloSection } = await import("./run-monte-carlo-section");
    const { container } = wrap(
      createElement(RunMonteCarloSection, { runId: "run-1" as never })
    );
    expect(
      container.querySelector('[data-help-key="monte_carlo_simulation"]')
    ).toBeTruthy();
  });
});
