import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PerBucketCard } from "./per-bucket-card";
import type { BucketView } from "@/api/legacy-types";

const hour: BucketView[] = [
  { key: "10", trade_count: 2, net_pnl_dollars: 120.5, win_rate: 0.5, expectancy_r: 0.3 },
  { key: "14", trade_count: 1, net_pnl_dollars: -50.0, win_rate: 0.0, expectancy_r: -1.0 },
];
const weekday: BucketView[] = [
  { key: "Tue", trade_count: 3, net_pnl_dollars: 70.5, win_rate: 0.33, expectancy_r: 0.1 },
];
const month: BucketView[] = [
  { key: "3", trade_count: 3, net_pnl_dollars: 70.5, win_rate: 0.33, expectancy_r: 0.1 },
];

describe("PerBucketCard", () => {
  it("renders buckets across the three dimensions with the help tooltip", () => {
    render(<PerBucketCard hour={hour} weekday={weekday} month={month} />);
    expect(screen.getByText("Hour of day")).toBeInTheDocument();
    expect(screen.getByText("Weekday")).toBeInTheDocument();
    expect(screen.getByText("Month")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("Tue")).toBeInTheDocument();
    expect(document.querySelector('[data-help-key="per_bucket"]')).toBeTruthy();
  });

  it("handles empty dimensions gracefully", () => {
    render(<PerBucketCard hour={[]} weekday={[]} month={[]} />);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
