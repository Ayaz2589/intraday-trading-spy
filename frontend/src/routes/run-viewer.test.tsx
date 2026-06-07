import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { HELP_CONTENT } from "@/components/help-content";

const priceChartCalls: Array<{ markers: unknown[] }> = [];
vi.mock("@/components/price-chart", () => ({
  PriceChart: (props: { markers: unknown[] }) => {
    priceChartCalls.push({ markers: props.markers });
    return (
      <div data-testid="price-chart-mock">
        <span data-help-key="vwap" />
        <span data-help-key="opening_range" />
        <span data-help-key="force_flat_exit" />
      </div>
    );
  },
}));

const { RunViewer } = await import("./run-viewer");

vi.mock("lightweight-charts", () => {
  const series = {
    setData: vi.fn(),
    setMarkers: vi.fn(),
    createPriceLine: vi.fn(),
  };
  const chart = {
    addSeries: vi.fn(() => series),
    timeScale: vi.fn(() => ({ fitContent: vi.fn() })),
    remove: vi.fn(),
  };
  return {
    createChart: vi.fn(() => chart),
    CandlestickSeries: "Candlestick",
    LineSeries: "Line",
  };
});

const summary = {
  total_trades: 4,
  wins: 1,
  losses: 2,
  win_rate: 0.25,
  average_win_r: 2.0,
  average_loss_r: -1.0,
  average_r: 0.399,
  total_r: 1.596,
  profit_factor: 1.0,
  max_drawdown_r: -2.0,
  best_trade_r: 2.0,
  worst_trade_r: -1.0,
  longest_consecutive_loss_streak: 2,
  rejected_signal_count: 0,
  rejection_breakdown: {},
};

const manifest = {
  run_id: "r1",
  run_started_at: "2026-01-02T10:00:00+00:00",
  run_ended_at: "2026-01-02T10:00:01+00:00",
  code_version: "abc12345",
  config_snapshot: {},
  data_fingerprint: {
    sha256: "deadbeefcafebabe",
    bar_count: 0,
    earliest_timestamp: "x",
    latest_timestamp: "y",
    session_count: 1,
  },
  summary,
};

function mockFetchAll() {
  vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
    const u = String(url);
    if (u === "/api/runs")
      return Promise.resolve(
        new Response(
          JSON.stringify([
            { run_id: "r1", started_at: "x", summary },
          ]),
        ),
      );
    if (u.endsWith("/journal")) return Promise.resolve(new Response("[]"));
    if (u.endsWith("/summary"))
      return Promise.resolve(new Response(JSON.stringify(summary)));
    if (u.endsWith("/manifest"))
      return Promise.resolve(new Response(JSON.stringify(manifest)));
    return Promise.resolve(new Response("[]"));
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  priceChartCalls.length = 0;
});

describe("RunViewer route", () => {
  it("renders header + summary + rejections + journal on happy path", async () => {
    mockFetchAll();
    render(
      <MemoryRouter initialEntries={["/runs/r1"]}>
        <Routes>
          <Route path="/runs/:run_id" element={<RunViewer />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getAllByText("r1").length).toBeGreaterThan(0);
    });
    expect(screen.getByText("Summary")).toBeInTheDocument();
    // "Rejections" rendered twice (the title shows in both the sidebar
    // Summary column and the RejectionBreakdownCard heading).
    expect(screen.getAllByText(/Rejections/i).length).toBeGreaterThan(0);
  });

  it("M1 — when one endpoint 404s, the other sections still render", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const u = String(url);
      if (u === "/api/runs")
        return Promise.resolve(
          new Response(
            JSON.stringify([
              { run_id: "r1", started_at: "x", summary },
            ]),
          ),
        );
      if (u.endsWith("/journal"))
        return Promise.resolve(
          new Response(JSON.stringify({ error: "run_not_found" }), {
            status: 404,
          }),
        );
      if (u.endsWith("/summary"))
        return Promise.resolve(new Response(JSON.stringify(summary)));
      if (u.endsWith("/manifest"))
        return Promise.resolve(new Response(JSON.stringify(manifest)));
      return Promise.resolve(new Response("[]"));
    });
    render(
      <MemoryRouter initialEntries={["/runs/r1"]}>
        <Routes>
          <Route path="/runs/:run_id" element={<RunViewer />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText(/run_not_found/)).toBeInTheDocument(),
    );
    // Header + summary still rendered ("r1" appears in sidebar + header).
    expect(screen.getAllByText("r1").length).toBeGreaterThan(0);
    expect(screen.getByText("Summary")).toBeInTheDocument();
  });

  it("US4 — every HELP_CONTENT key has a rendered HelpTooltip", async () => {
    const journal = [
      {
        row_seq: 0,
        timestamp: "2026-01-02T09:30:00-05:00",
        status: "executed",
        actual_entry: 525.1,
        reason: "entry",
      },
      {
        row_seq: 1,
        timestamp: "2026-01-02T10:00:00-05:00",
        status: "force_flat",
        exit_reason: "force_flat",
        actual_exit: 525.2,
        realized_r: 0,
        realized_pnl: 0,
        reason: "force-flat exit",
      },
    ];
    const summaryWithAllRejections = {
      ...summary,
      rejected_signal_count: 3,
      rejection_breakdown: {
        position_value_exceeds_cap: 2,
        cooldown_active: 1,
        daily_loss_limit_reached: 1,
      },
    };
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const u = String(url);
      if (u === "/api/runs")
        return Promise.resolve(
          new Response(
            JSON.stringify([
              { run_id: "r1", started_at: "x", summary: summaryWithAllRejections },
            ]),
          ),
        );
      if (u.endsWith("/journal"))
        return Promise.resolve(new Response(JSON.stringify(journal)));
      if (u.endsWith("/summary"))
        return Promise.resolve(
          new Response(JSON.stringify(summaryWithAllRejections)),
        );
      if (u.endsWith("/manifest"))
        return Promise.resolve(new Response(JSON.stringify(manifest)));
      if (u.endsWith("/bars"))
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                symbol: "SPY",
                timestamp: "2026-01-02T09:30:00-05:00",
                open: 525,
                high: 525.5,
                low: 524.8,
                close: 525.1,
                volume: 1000,
              },
            ]),
          ),
        );
      return Promise.resolve(new Response("[]"));
    });
    render(
      <MemoryRouter initialEntries={["/runs/r1"]}>
        <Routes>
          <Route path="/runs/:run_id" element={<RunViewer />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getAllByText("r1").length).toBeGreaterThan(0);
    });
    const missing: string[] = [];
    // Feature 007 added auth/runtime concept keys (otp, session, etc.)
    // that aren't rendered by the legacy run-viewer. Coverage for those
    // lives in the structural test associated with the new authenticated
    // routes (Feature 007 task T128). Filter to the run-viewer's scope.
    const feature007Keys = new Set([
      "otp",
      "session",
      "saved_config",
      "strategy_registry",
      "backtest_queue",
      "run_status",
      "cloud_push",
      "data_download_job",
      "connection_status",
      // Feature 009 data-foundation keys render in DataCoveragePanel, not the
      // run-viewer; their tooltip coverage lives in data-coverage-panel.test.tsx.
      "data_coverage",
      "regime_completeness",
      "backfill",
      "data_source",
      // Feature 011 validation keys render in the Validation route's components
      // (walk-forward-table / sensitivity-surface / significance-panel /
      // lockbox-gate), not the run-viewer; coverage lives in those tests.
      "walk_forward",
      "in_sample",
      "out_of_sample",
      "is_oos_gap",
      "parameter_sensitivity",
      "plateau_vs_peak",
      "bootstrap_ci",
      "permutation_test",
      "lockbox",
      "burned_lockbox",
      // Feature 012 config-management keys render on the Strategies route's
      // config-manager (create/list/edit knobs), not the run-viewer; coverage
      // lives in config-manager.test.tsx + help-content.test.ts.
      "active_config",
      "duplicate_vs_edit",
      "delete_safe",
      "buying_power",
      // Feature 013 data-observability keys render on the Data route
      // (heatmap / job history / lineage); coverage lives in
      // CacheHeatmap/CacheSummary/JobHistoryTable tests + help-content.test.ts.
      "cache_heatmap",
      "backfill_job_history",
      "data_lineage",
      // Feature 014 keys render on the validation pages / child-run badge
      // (this fixture run is standalone, so the badge doesn't mount);
      // coverage lives in run-study-badge / WindowRows / StudiesTable tests.
      "child_run",
      "study_drilldown",
      "rerun_study",
      // Feature 015 Monte Carlo keys render in the run-detail Monte Carlo
      // panel (post-click), not the legacy run-viewer; coverage lives in
      // monte-carlo-panel.test.tsx + run-monte-carlo-section.test.tsx.
      "monte_carlo_simulation",
      "shuffle_method",
      "max_drawdown_distribution",
      "losing_streak",
      "underwater_period",
      "mc_iterations_seed",
      "forward_cone",
      "risk_of_ruin",
      "mc_in_sample_caveat",
      // Feature 016 keys render on validation/insights pages.
      "pooled_gate",
      "sign_test",
      "fisher_combined",
      "edge_timeseries",
      "window_distribution",
      "claude_advisory",
      "snapshot_pin",
      "claude_experiment_draft",
      // Feature 018 recommendation-engine keys render on the Strategies
      // health badge + Insights Recommendations panel; coverage lives in
      // HealthBadge / RecommendationsPanel tests + help-content.test.ts.
      "health_verdict",
      "recommendation_classes",
      "evidence_pack",
      "trial_count",
      // Feature 018.1: the side-nav factory reset; coverage in side-nav tests.
      "delete_all_data",
      // Feature 019 auto-research keys render on the Validation page +
      // campaign detail route; coverage lives in AutoResearchCard /
      // CampaignDetailPage tests + help-content.test.ts.
      "auto_research_campaign",
      "trial_budget",
      "tightened_bar",
      "stopping_rules",
      "ready_for_lockbox",
    ]);
    for (const key of Object.keys(HELP_CONTENT)) {
      if (feature007Keys.has(key)) continue;
      if (!document.querySelector(`[data-help-key="${key}"]`)) missing.push(key);
    }
    expect(missing).toEqual([]);
  });

  it("US5 — selecting a filter chip propagates to the chart markers", async () => {
    const journal = [
      {
        row_seq: 0,
        timestamp: "2026-01-02T09:30:00-05:00",
        status: "executed",
        actual_entry: 525.1,
        reason: "x",
      },
      {
        row_seq: 1,
        timestamp: "2026-01-02T09:35:00-05:00",
        status: "rejected",
        rejection_check: "position_value_exceeds_cap",
        reason: "x",
      },
    ];
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const u = String(url);
      if (u === "/api/runs")
        return Promise.resolve(
          new Response(
            JSON.stringify([{ run_id: "r1", started_at: "x", summary }]),
          ),
        );
      if (u.endsWith("/journal"))
        return Promise.resolve(new Response(JSON.stringify(journal)));
      if (u.endsWith("/summary"))
        return Promise.resolve(new Response(JSON.stringify(summary)));
      if (u.endsWith("/manifest"))
        return Promise.resolve(new Response(JSON.stringify(manifest)));
      if (u.endsWith("/bars"))
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                symbol: "SPY",
                timestamp: "2026-01-02T09:30:00-05:00",
                open: 525, high: 525.5, low: 524.8, close: 525.1, volume: 1000,
              },
            ]),
          ),
        );
      return Promise.resolve(new Response("[]"));
    });
    render(
      <MemoryRouter initialEntries={["/runs/r1"]}>
        <Routes>
          <Route path="/runs/:run_id" element={<RunViewer />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("price-chart-mock")).toBeInTheDocument();
    });
    // Initial render with filter='all' — chart should have at least one Entry marker.
    const initial = priceChartCalls.at(-1)!.markers as Array<{ text: string }>;
    expect(initial.some((m) => m.text.startsWith("Entry "))).toBe(true);

    // Click the "executed" filter chip — markers should still contain Entry.
    await userEvent.click(
      screen.getByRole("tab", { name: /^executed/i }),
    );
    const filtered = priceChartCalls.at(-1)!.markers as Array<{ text: string }>;
    expect(filtered.every((m) => m.text.startsWith("Entry "))).toBe(true);

    // Click "rejected" filter chip — no Entry markers (rejections aren't shown
    // unless the rejection-toggle is on).
    await userEvent.click(
      screen.getByRole("tab", { name: /^rejected/i }),
    );
    const afterRejected = priceChartCalls.at(-1)!.markers as Array<{
      text: string;
    }>;
    expect(afterRejected.some((m) => m.text.startsWith("Entry "))).toBe(false);
  });

  it("US2 — layout-mode preference restored from localStorage on mount", async () => {
    mockFetchAll();
    localStorage.setItem("isb-layout", "focus");
    const { container } = render(
      <MemoryRouter initialEntries={["/runs/r1"]}>
        <Routes>
          <Route path="/runs/:run_id" element={<RunViewer />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getAllByText("r1").length).toBeGreaterThan(0);
    });
    const content = container.querySelector(".content");
    expect(content).not.toBeNull();
    expect(content?.className).toContain("focus");
    localStorage.removeItem("isb-layout");
  });
});
