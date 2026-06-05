import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

const runPooledGateMock = vi.fn();
vi.mock("@/api/validation", () => ({
  runPooledGate: (...a: unknown[]) => runPooledGateMock(...a),
}));
vi.mock("@/api/insights", () => ({
  getClaudeAnalysis: () => Promise.resolve(null),
  postClaudeAnalysis: () => Promise.resolve(null),
  getClaudeSettings: () =>
    Promise.resolve({ claude_enabled: true, disabled_reason: null, configured: true }),
  patchClaudeSettings: () => Promise.resolve(null),
}));

// Error-state injection (015 pattern: rejecting a real mutation leaks an
// unhandled internal thenable in this react-query version).
const hookOverride: { current: object | null } = { current: null };
vi.mock("@/hooks/useStudies", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/hooks/useStudies")>();
  return {
    ...real,
    usePooledGate: (...args: Parameters<typeof real.usePooledGate>) =>
      hookOverride.current ?? real.usePooledGate(...args),
  };
});

const ci = (point: number, low: number, high: number) => ({ point, low, high });

const MC = {
  shuffle: {
    max_drawdown_pct: { observed: 0.09, p5: 0.06, p25: 0.08, p50: 0.1, p75: 0.13, p95: 0.16 },
    max_drawdown_dollars: { observed: 900, p5: 700, p25: 850, p50: 1000, p75: 1200, p95: 1500 },
    longest_losing_streak: { observed: 5, p5: 4, p25: 5, p50: 6, p75: 7, p95: 9 },
    longest_underwater_trades: { observed: 41, p5: 28, p25: 40, p50: 54, p75: 71, p95: 97 },
  },
  cone: { horizon_trades: 2607, steps: [
    { trade_index: 1, p5: 24900, p25: 24950, p50: 25000, p75: 25050, p95: 25100 },
    { trade_index: 2607, p5: 23100, p25: 25820, p50: 27940, p75: 30060, p95: 33310 },
  ]},
  terminal_equity: { observed: 27385, p5: 23100, p25: 25820, p50: 27940, p75: 30060, p95: 33310 },
  ruin: [{ threshold_pct: 5, probability: 0.31 }, { threshold_pct: 10, probability: 0.09 }],
  iterations: 2000, seed: 20260604, trade_count: 2607, starting_equity: 25000,
  low_confidence: false,
};

const GATE_FAST = {
  computed_at: "2026-06-05T09:00:00Z",
  mode: "fast" as const,
  passed: false,
  alpha: 0.05,
  pooled_trades: 2607,
  windows_total: 12,
  windows_with_trades: 12,
  windows_positive: 9,
  total_net_pnl_dollars: 2385,
  expectancy_dollars_ci: ci(0.91, -0.53, 2.56),
  expectancy_r_ci: ci(0.0346, -0.0287, 0.0941),
  sign_test_p: 0.073,
  monte_carlo: MC,
  per_window_p: null,
  fisher: null,
  seed: 20260605,
};

const GATE_FULL = {
  ...GATE_FAST,
  mode: "full" as const,
  per_window_p: [
    { window_index: 0, p_value: 0.0729, significant: false },
    { window_index: 1, p_value: 0.001, significant: true },
  ],
  fisher: { x2: 85.0, df: 24, p: 9.53e-9 },
};

function study(gate: object | null) {
  return {
    id: "study-1",
    kind: "walk_forward",
    status: "finished",
    progress_completed: 24,
    progress_total: 24,
    result: { mode: "rolling", windows: [], mean_oos: {}, pooled_gate: gate ?? undefined },
    failure_reason: null,
    created_at: "2026-06-05T00:00:00Z",
  } as never;
}

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: 0 }, mutations: { retry: 0 } },
  });
  return render(createElement(QueryClientProvider, { client }, ui));
}

beforeEach(() => {
  runPooledGateMock.mockClear();
  hookOverride.current = null;
});

describe("PooledGatePanel", () => {
  it("renders the not-yet-computed state with both run buttons", async () => {
    const { PooledGatePanel } = await import("./PooledGatePanel");
    wrap(createElement(PooledGatePanel, { study: study(null) }));
    expect(screen.getByRole("button", { name: /run gate/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run full gate/i })).toBeInTheDocument();
    expect(screen.queryByTestId("gate-banner")).not.toBeInTheDocument();
  });

  it("renders NOT PASSED with the rule spelled out", async () => {
    const { PooledGatePanel } = await import("./PooledGatePanel");
    wrap(createElement(PooledGatePanel, { study: study(GATE_FAST) }));
    const banner = screen.getByTestId("gate-banner");
    expect(banner).toHaveTextContent(/GATE: NOT PASSED/);
    expect(banner).toHaveTextContent(/-0\.53/);
    expect(banner).toHaveTextContent(/2\.56/);
    expect(banner).toHaveTextContent(/includes zero/i);
  });

  it("renders PASSED when the CI excludes zero", async () => {
    const { PooledGatePanel } = await import("./PooledGatePanel");
    const passed = { ...GATE_FAST, passed: true, expectancy_dollars_ci: ci(2.0, 0.5, 3.5) };
    wrap(createElement(PooledGatePanel, { study: study(passed) }));
    expect(screen.getByTestId("gate-banner")).toHaveTextContent(/GATE: PASSED/);
  });

  it("shows the stat row and the pooled MC strip", async () => {
    const { PooledGatePanel } = await import("./PooledGatePanel");
    wrap(createElement(PooledGatePanel, { study: study(GATE_FAST) }));
    const stats = screen.getByTestId("gate-stats");
    expect(stats).toHaveTextContent("2,607");
    expect(stats).toHaveTextContent(/9\s*\/\s*12/);
    expect(stats).toHaveTextContent(/0\.073/);
    expect(screen.getAllByTestId("mc-distribution-strip").length).toBeGreaterThan(0);
    expect(screen.getByTestId("gate-ruin")).toHaveTextContent(/−5%|−10%|-5%|-10%/);
  });

  it("shows per-window p-values and the Fisher line for a full result", async () => {
    const { PooledGatePanel } = await import("./PooledGatePanel");
    wrap(createElement(PooledGatePanel, { study: study(GATE_FULL) }));
    expect(screen.getByTestId("gate-fisher")).toHaveTextContent(/9\.5e-9|9\.53e-9/i);
    const chips = screen.getByTestId("gate-window-ps");
    expect(chips).toHaveTextContent(/w0/i);
    expect(chips).toHaveTextContent(/0\.0729/);
  });

  it("runs the fast gate via the API", async () => {
    runPooledGateMock.mockResolvedValue(GATE_FAST);
    const { PooledGatePanel } = await import("./PooledGatePanel");
    wrap(createElement(PooledGatePanel, { study: study(null) }));
    fireEvent.click(screen.getByRole("button", { name: /^run gate/i }));
    await waitFor(() =>
      expect(runPooledGateMock).toHaveBeenCalledWith("study-1", "fast")
    );
  });

  it("shows an indeterminate running state after starting the full gate", async () => {
    runPooledGateMock.mockResolvedValue({ study_id: "study-1", status: "running" });
    const { PooledGatePanel } = await import("./PooledGatePanel");
    wrap(createElement(PooledGatePanel, { study: study(GATE_FAST) }));
    fireEvent.click(screen.getByRole("button", { name: /run full gate/i }));
    await waitFor(() =>
      expect(screen.getByText(/computing per-window tests/i)).toBeInTheDocument()
    );
  });

  it("renders the API's plain-English refusal", async () => {
    hookOverride.current = {
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error("this study has no persisted validation windows — re-run the study"),
      mutate: vi.fn(),
    };
    const { PooledGatePanel } = await import("./PooledGatePanel");
    wrap(createElement(PooledGatePanel, { study: study(null) }));
    expect(screen.getByText(/re-run the study/i)).toBeInTheDocument();
  });

  it("pairs the gate concepts with HelpTooltips", async () => {
    const { PooledGatePanel } = await import("./PooledGatePanel");
    const { container } = wrap(
      createElement(PooledGatePanel, { study: study(GATE_FULL) })
    );
    for (const key of ["pooled_gate", "sign_test", "fisher_combined"]) {
      expect(container.querySelector(`[data-help-key="${key}"]`)).toBeTruthy();
    }
  });
});

describe("PooledGatePanel — Claude's read (US3)", () => {
  it("hosts the study-scope ClaudeReadCard beneath a computed gate", async () => {
    const { PooledGatePanel } = await import("./PooledGatePanel");
    wrap(createElement(PooledGatePanel, { study: study(GATE_FAST) }));
    expect(await screen.findByTestId("claude-read")).toBeInTheDocument();
  });

  it("does not offer Claude's read before the gate is computed", async () => {
    const { PooledGatePanel } = await import("./PooledGatePanel");
    wrap(createElement(PooledGatePanel, { study: study(null) }));
    expect(screen.queryByTestId("claude-read")).not.toBeInTheDocument();
  });
});

describe("PooledGatePanel — determinism label (US4)", () => {
  it("labels gate numbers as seeded and reproducible", async () => {
    const { PooledGatePanel } = await import("./PooledGatePanel");
    wrap(createElement(PooledGatePanel, { study: study(GATE_FAST) }));
    expect(screen.getByText(/seeded.*reproducible|reproducible.*seeded/i)).toBeInTheDocument();
  });
});
