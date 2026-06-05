import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

const edgeMock = vi.fn();
const distMock = vi.fn();
vi.mock("@/api/insights", () => ({
  getEdgeTimeseries: (...a: unknown[]) => edgeMock(...a),
  getConfigDistribution: (...a: unknown[]) => distMock(...a),
  getClaudeAnalysis: () => Promise.resolve(null),
  postClaudeAnalysis: () => Promise.resolve(null),
  getClaudeSettings: () =>
    Promise.resolve({ claude_enabled: true, disabled_reason: null, configured: true }),
  patchClaudeSettings: () => Promise.resolve(null),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
  return render(createElement(QueryClientProvider, { client }, ui));
}

const EDGE = {
  points: [
    {
      run_id: "r1", study_id: "s1", window_index: 0, config_name: "wf-rr3",
      range_start: "2019-01-02", range_end: "2019-06-28", trades: 227,
      net_pnl: 118, expectancy_dollars: 0.52, expectancy_r: 0.018, pnl_std: 39.5,
      account_value: 1000,
    },
    {
      run_id: "r2", study_id: "s1", window_index: 1, config_name: "wf-rr3",
      range_start: "2019-07-01", range_end: "2019-12-31", trades: 216,
      net_pnl: -90, expectancy_dollars: -0.42, expectancy_r: -0.015, pnl_std: 38.1,
      account_value: 1000,
    },
  ],
  snapshot_fingerprint: "fp1",
  regimes: [],
};
const DIST = {
  rows: [
    {
      config_name: "wf-rr3", windows: 12, windows_positive: 9,
      pnl_q25: -50, pnl_q50: 124, pnl_q75: 420,
      expectancy_q25: -0.3, expectancy_q50: 0.6, expectancy_q75: 1.9,
      total_trades: 2607,
    },
  ],
  snapshot_fingerprint: "fp1",
};

describe("InsightsPage", () => {
  it("renders the split layout: charts column + right rail", async () => {
    edgeMock.mockResolvedValue(EDGE);
    distMock.mockResolvedValue(DIST);
    const { InsightsPage } = await import("./InsightsPage");
    wrap(createElement(InsightsPage));
    await waitFor(() => expect(screen.getByTestId("edge-timeseries")).toBeInTheDocument());
    expect(screen.getByTestId("config-distribution")).toBeInTheDocument();
    expect(screen.getByTestId("insights-right-rail")).toBeInTheDocument();
  });

  it("wires empty states through", async () => {
    edgeMock.mockResolvedValue({ points: [], snapshot_fingerprint: "empty" });
    distMock.mockResolvedValue({ rows: [], snapshot_fingerprint: "empty" });
    const { InsightsPage } = await import("./InsightsPage");
    wrap(createElement(InsightsPage));
    await waitFor(() =>
      expect(screen.getByText(/no out-of-sample windows yet/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/no configs to compare yet/i)).toBeInTheDocument();
  });
});

describe("InsightsPage — Claude rail (US3)", () => {
  it("hosts the ClaudeReadCard in the right rail", async () => {
    edgeMock.mockResolvedValue(EDGE);
    distMock.mockResolvedValue(DIST);
    const { InsightsPage } = await import("./InsightsPage");
    wrap(createElement(InsightsPage));
    await waitFor(() => expect(screen.getByTestId("claude-read")).toBeInTheDocument());
    expect(screen.getByTestId("insights-right-rail")).toContainElement(
      screen.getByTestId("claude-read")
    );
  });
});

describe("InsightsPage — headline stat strip (016-polish)", () => {
  it("summarizes the OOS archive: windows, trades, configs, positive share, span", async () => {
    edgeMock.mockResolvedValue(EDGE);
    distMock.mockResolvedValue(DIST);
    const { InsightsPage } = await import("./InsightsPage");
    wrap(createElement(InsightsPage));
    await waitFor(() => expect(screen.getByTestId("insights-stats")).toBeInTheDocument());
    const stats = screen.getByTestId("insights-stats");
    expect(stats).toHaveTextContent("2");        // OOS windows
    expect(stats).toHaveTextContent("443");      // total OOS trades (227+216)
    expect(stats).toHaveTextContent(/1\s*config/i);
    expect(stats).toHaveTextContent(/1\s*\/\s*2 positive/i);
    expect(stats).toHaveTextContent(/2019-01-02/);
    expect(stats).toHaveTextContent(/2019-12-31/);
  });
});
