import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

const getAnalysisMock = vi.fn();
const postAnalysisMock = vi.fn();
const getSettingsMock = vi.fn();
const patchSettingsMock = vi.fn();
vi.mock("@/api/insights", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/api/insights")>();
  return {
    ...real,
    getClaudeAnalysis: (...a: unknown[]) => getAnalysisMock(...a),
    postClaudeAnalysis: (...a: unknown[]) => postAnalysisMock(...a),
    getClaudeSettings: (...a: unknown[]) => getSettingsMock(...a),
    patchClaudeSettings: (...a: unknown[]) => patchSettingsMock(...a),
  };
});

const SETTINGS_ON = { claude_enabled: true, disabled_reason: null, configured: true };

const ANALYSIS = {
  id: "ia1",
  scope: "insights",
  scope_id: null,
  payload_hash: "h1",
  model: "claude-opus-4-8",
  analysis: {
    summary: "The edge concentrates in H2 windows.",
    findings: [
      {
        claim: "Pooled expectancy is positive but not significant",
        evidence_metric: "pooled_gate.expectancy_dollars_ci",
        confidence: "high",
      },
      {
        claim: "A made-up metric claim",
        evidence_metric: "nonexistent.metric",
        confidence: "low",
      },
    ],
    risks: ["Two windows bleed heavily"],
    suggested_experiments: [
      { hypothesis: "Regime filter helps", how_to_test: "Run a filtered walk-forward" },
    ],
    truncated: false,
    fingerprints: { timeseries: "fp-edge", distribution: "fp-dist" },
  },
  created_at: "2026-06-05T10:00:00Z",
  truncated: false,
};

const METRICS = { "pooled_gate.expectancy_dollars_ci": "[−0.53, +2.56]" };

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: 0 }, mutations: { retry: 0 } },
  });
  return render(createElement(QueryClientProvider, { client }, ui));
}

async function card(props: Record<string, unknown> = {}) {
  const { ClaudeReadCard } = await import("./ClaudeReadCard");
  return createElement(ClaudeReadCard, {
    scope: "insights",
    metricValues: METRICS,
    currentFingerprints: { timeseries: "fp-edge", distribution: "fp-dist" },
    ...props,
  } as never);
}

beforeEach(() => {
  getAnalysisMock.mockReset();
  postAnalysisMock.mockReset();
  getSettingsMock.mockReset();
  patchSettingsMock.mockReset();
  getSettingsMock.mockResolvedValue(SETTINGS_ON);
});

describe("ClaudeReadCard", () => {
  it("renders the stored analysis: summary, cited findings, risks, experiments, footer", async () => {
    getAnalysisMock.mockResolvedValue(ANALYSIS);
    wrap(await card());
    await waitFor(() =>
      expect(screen.getByText(/concentrates in H2 windows/i)).toBeInTheDocument()
    );
    // Cited metric value rendered FROM OUR DATA beside the claim.
    expect(screen.getByText(/\[−0\.53, \+2\.56\]/)).toBeInTheDocument();
    expect(screen.getByText(/Two windows bleed heavily/)).toBeInTheDocument();
    expect(screen.getByText(/Regime filter helps/)).toBeInTheDocument();
    const footer = screen.getByTestId("claude-footer");
    expect(footer).toHaveTextContent("h1");
    expect(footer).toHaveTextContent("claude-opus-4-8");
  });

  it("marks a finding citing an absent metric as unverifiable", async () => {
    getAnalysisMock.mockResolvedValue(ANALYSIS);
    wrap(await card());
    await waitFor(() =>
      expect(screen.getByText(/metric not found/i)).toBeInTheDocument()
    );
  });

  it("disables Regenerate when fingerprints match, enables when data changed", async () => {
    getAnalysisMock.mockResolvedValue(ANALYSIS);
    wrap(await card());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /regenerate/i })).toBeDisabled()
    );
  });

  it("enables Regenerate when the snapshot changed", async () => {
    getAnalysisMock.mockResolvedValue(ANALYSIS);
    wrap(await card({ currentFingerprints: { timeseries: "fp-NEW", distribution: "fp-dist" } }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /regenerate/i })).toBeEnabled()
    );
  });

  it("offers Get Claude's read when nothing is stored and posts the scope", async () => {
    getAnalysisMock.mockResolvedValue(null);
    postAnalysisMock.mockResolvedValue(ANALYSIS);
    wrap(await card());
    const btn = await screen.findByRole("button", { name: /get claude's read/i });
    fireEvent.click(btn);
    await waitFor(() =>
      expect(postAnalysisMock).toHaveBeenCalledWith(
        expect.objectContaining({ scope: "insights", force: false })
      )
    );
  });

  it("paused (billing): shows the top-up banner with one-click Re-enable", async () => {
    getSettingsMock.mockResolvedValue({
      claude_enabled: false, disabled_reason: "billing", configured: true,
    });
    getAnalysisMock.mockResolvedValue(ANALYSIS);
    patchSettingsMock.mockResolvedValue(SETTINGS_ON);
    wrap(await card());
    await waitFor(() =>
      expect(screen.getByText(/top up/i)).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: /re-enable/i }));
    await waitFor(() => expect(patchSettingsMock).toHaveBeenCalledWith(true));
    // Stored analyses stay readable while paused.
    expect(screen.getByText(/concentrates in H2 windows/i)).toBeInTheDocument();
  });

  it("manual pause toggle fires the settings PATCH (analyze M2)", async () => {
    getAnalysisMock.mockResolvedValue(ANALYSIS);
    patchSettingsMock.mockResolvedValue({
      claude_enabled: false, disabled_reason: "manual", configured: true,
    });
    wrap(await card());
    const pause = await screen.findByRole("button", { name: /pause/i });
    fireEvent.click(pause);
    await waitFor(() => expect(patchSettingsMock).toHaveBeenCalledWith(false));
  });

  it("unconfigured: quiet setup hint, no generate button", async () => {
    getSettingsMock.mockResolvedValue({
      claude_enabled: true, disabled_reason: null, configured: false,
    });
    getAnalysisMock.mockResolvedValue(null);
    wrap(await card());
    await waitFor(() =>
      expect(screen.getByText(/ANTHROPIC_API_KEY/i)).toBeInTheDocument()
    );
    expect(screen.queryByRole("button", { name: /get claude's read/i })).not.toBeInTheDocument();
  });

  it("explains itself: advisory + snapshot-pin tooltips and the advisory label", async () => {
    getAnalysisMock.mockResolvedValue(ANALYSIS);
    const { container } = wrap(await card());
    // Footer (and its snapshot_pin tooltip) renders once the analysis loads.
    await waitFor(() => expect(screen.getByTestId("claude-footer")).toBeInTheDocument());
    expect(container.querySelector('[data-help-key="claude_advisory"]')).toBeTruthy();
    expect(container.querySelector('[data-help-key="snapshot_pin"]')).toBeTruthy();
    expect(screen.getByText(/advisory only/i)).toBeInTheDocument();
  });
});
