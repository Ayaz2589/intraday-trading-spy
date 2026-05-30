import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import type { BarView } from "@/api/types";

vi.mock("klinecharts", () => {
  const chart = {
    setSymbol: vi.fn(),
    setPeriod: vi.fn(),
    setDataLoader: vi.fn(),
    setStyles: vi.fn(),
    setOffsetRightDistance: vi.fn(),
    setBarSpace: vi.fn(),
    createIndicator: vi.fn(),
    createOverlay: vi.fn(),
    removeIndicator: vi.fn(),
    removeOverlay: vi.fn(),
    subscribeAction: vi.fn(),
    unsubscribeAction: vi.fn(),
    convertFromPixel: vi.fn(() => [{}]),
    getDataList: vi.fn(() => []),
  };
  return {
    init: vi.fn(() => chart),
    dispose: vi.fn(),
    registerIndicator: vi.fn(),
    registerOverlay: vi.fn(),
  };
});

const { PriceChart } = await import("./price-chart");

const bars: BarView[] = [
  {
    symbol: "SPY",
    timestamp: "2026-01-01T09:30:00-05:00",
    open: 525,
    high: 525.5,
    low: 524.8,
    close: 525.1,
    volume: 1000,
  },
];

describe("PriceChart", () => {
  it("renders without crashing on bars", () => {
    const { container } = render(
      <PriceChart
        bars={bars}
        vwap={[{ time: "2026-01-01T09:30:00-05:00", value: 525.05 }]}
        or={null}
        markers={[]}
        journal={[]}
        accountValue={25000}
        positionCapPct={100}
      />,
    );
    expect(container.querySelector("[data-chart-root]")).toBeTruthy();
  });

  it("renders HelpTooltips for vwap and opening_range in legend", () => {
    const { container } = render(
      <PriceChart
        bars={bars}
        vwap={[]}
        or={null}
        markers={[]}
        journal={[]}
        accountValue={25000}
        positionCapPct={100}
      />,
    );
    expect(container.querySelector('[data-help-key="vwap"]')).toBeTruthy();
    expect(container.querySelector('[data-help-key="opening_range"]')).toBeTruthy();
  });

  it("VWAP and OR legend items are toggle buttons (pressed by default)", () => {
    render(
      <PriceChart
        bars={bars}
        vwap={[]}
        or={null}
        markers={[]}
        journal={[]}
        accountValue={25000}
        positionCapPct={100}
      />,
    );
    expect(
      screen.getByRole("button", { name: /toggle vwap/i }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /toggle or/i }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("clicking the VWAP toggle flips aria-pressed", async () => {
    const user = userEvent.setup();
    render(
      <PriceChart
        bars={bars}
        vwap={[]}
        or={null}
        markers={[]}
        journal={[]}
        accountValue={25000}
        positionCapPct={100}
      />,
    );
    const vwapToggle = screen.getByRole("button", { name: /toggle vwap/i });
    await user.click(vwapToggle);
    expect(vwapToggle).toHaveAttribute("aria-pressed", "false");
    await user.click(vwapToggle);
    expect(vwapToggle).toHaveAttribute("aria-pressed", "true");
  });

  it("accepts a markers array without crashing", () => {
    const markers = [
      {
        time: "2026-01-01T09:30:00-05:00",
        position: "belowBar" as const,
        color: "#10b981",
        shape: "arrowUp" as const,
        text: "Entry @ 525.45",
      },
      {
        time: "2026-01-01T10:00:00-05:00",
        position: "aboveBar" as const,
        color: "#22c55e",
        shape: "arrowDown" as const,
        text: "Exit @ 526.10 (target) +1.0R $200.00",
      },
    ];
    const { container } = render(
      <PriceChart
        bars={bars}
        vwap={[]}
        or={null}
        markers={markers}
        journal={[]}
        accountValue={25000}
        positionCapPct={100}
      />,
    );
    expect(container.querySelector("[data-chart-root]")).toBeTruthy();
  });
});
