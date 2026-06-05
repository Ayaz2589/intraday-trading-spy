import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import type { Config } from "@/api/types";
import type { DraftConfig } from "@/lib/draft-config";

const createConfigMock = vi.fn();
vi.mock("@/api/configs", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/api/configs")>();
  return { ...real, createConfig: (...a: unknown[]) => createConfigMock(...a) };
});

const RR = "strategy.vwap_pullback.target.risk_reward";

const BASE: Config = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "wf-rr3",
  mode: "backtest",
  timeframe: "5m",
  strategy_id: "22222222-2222-2222-2222-222222222222",
  params: { strategy: { vwap_pullback: { target: { risk_reward: 3.0 } } }, risk: { account_value: 25000 } },
  is_active: false,
} as Config;

const ACTIVE: Config = { ...BASE, id: "33333333-3333-3333-3333-333333333333", name: "default", is_active: true };
const TAKEN: Config = { ...BASE, id: "44444444-4444-4444-4444-444444444444", name: "wf-rr3-exp-1" };

const DRAFT: DraftConfig = {
  base_config_name: "wf-rr3",
  changes: [{ knob_path: RR, value: 2.5 }],
  analysis_id: "d7e75317-4fd5-4d23-967d-a326c62c9c5b",
  experiment_index: 0,
  hypothesis: "Test a wider risk:reward",
};

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: 0 }, mutations: { retry: 0 } },
  });
  return render(createElement(QueryClientProvider, { client }, ui));
}

async function panel(props: Record<string, unknown> = {}) {
  const { DraftConfigPanel } = await import("./DraftConfigPanel");
  return createElement(DraftConfigPanel, {
    draft: DRAFT,
    configs: [BASE, ACTIVE],
    activeConfig: ACTIVE,
    onDismiss: vi.fn(),
    ...props,
  } as never);
}

beforeEach(() => createConfigMock.mockReset());

describe("DraftConfigPanel (017 US2)", () => {
  it("renders badge, provenance, and base → suggested rows with highlight", async () => {
    wrap(await panel());
    expect(screen.getByText(/review before creating/i)).toBeInTheDocument();
    expect(screen.getByText(/drafted from claude/i)).toBeInTheDocument();
    expect(screen.getByText(/d7e75317/)).toBeInTheDocument();
    const row = screen.getByTestId(`draft-row-${RR}`);
    expect(row).toHaveTextContent("risk:reward target");
    expect(row).toHaveTextContent("3"); // base value
    expect(row).toHaveTextContent("2.5"); // suggested, highlighted
  });

  it("falls back to the active config with a notice when the base is missing", async () => {
    wrap(await panel({ configs: [ACTIVE] }));
    expect(screen.getByText(/no longer exists.*using.*default/i)).toBeInTheDocument();
  });

  it("suggests <base>-exp-<n> and suffixes past collisions", async () => {
    wrap(await panel({ configs: [BASE, ACTIVE, TAKEN] }));
    const name = screen.getByLabelText(/config name/i) as HTMLInputElement;
    expect(name.value).toBe("wf-rr3-exp-2"); // -exp-1 is taken
  });

  it("Create posts merged params + provenance description via the standard API", async () => {
    createConfigMock.mockResolvedValue({ ...BASE, id: "55555555-5555-5555-5555-555555555555", name: "wf-rr3-exp-1" });
    wrap(await panel());
    fireEvent.click(screen.getByRole("button", { name: /^create/i }));
    await waitFor(() => expect(createConfigMock).toHaveBeenCalledTimes(1));
    const body = createConfigMock.mock.calls[0][0];
    expect(body.name).toBe("wf-rr3-exp-1");
    expect(body.source).toBe("scratch");
    expect(body.params.strategy.vwap_pullback.target.risk_reward).toBe(2.5); // merged
    expect(body.params.risk.account_value).toBe(25000); // base preserved
    expect(body.description).toMatch(/d7e75317/);
    expect(body.description).toMatch(/experiment 1/);
  });

  it("Dismiss fires the callback and creates nothing", async () => {
    const onDismiss = vi.fn();
    wrap(await panel({ onDismiss }));
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalled();
    expect(createConfigMock).not.toHaveBeenCalled();
  });
});
