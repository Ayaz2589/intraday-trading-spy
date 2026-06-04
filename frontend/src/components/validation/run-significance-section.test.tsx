import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

const computeSignificanceMock = vi.fn();
vi.mock("@/api/validation", () => ({
  computeSignificance: (b: unknown) => computeSignificanceMock(b),
}));

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
  return render(createElement(QueryClientProvider, { client }, ui));
}

beforeEach(() => computeSignificanceMock.mockReset());

describe("RunSignificanceSection", () => {
  it("computes significance for the run and renders the verdict", async () => {
    computeSignificanceMock.mockResolvedValue({
      confidence: 0.95,
      bootstrap: [{ statistic: "expectancy_dollars", point: 1.2, low: 0.3, high: 2.7 }],
      permutation_metric: "total_net_pnl_dollars", observed: 100,
      p_value: 0.02, alpha: 0.05, significant: true,
      bootstrap_iterations: 1000, permutation_iterations: 1000, seed: 1,
    });
    const { RunSignificanceSection } = await import("./run-significance-section");
    wrap(createElement(RunSignificanceSection, { runId: "run-1" as never }));

    fireEvent.click(screen.getByRole("button", { name: /compute significance/i }));

    await waitFor(() =>
      expect(screen.getByTestId("significance-verdict")).toHaveTextContent(/significant/i)
    );
    expect(computeSignificanceMock).toHaveBeenCalledWith({ run_id: "run-1" });
  });
});
