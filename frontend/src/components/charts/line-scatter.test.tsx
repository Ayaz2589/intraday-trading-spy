import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { LineScatter } from "./line-scatter";

const SERIES = [
  {
    id: "wf-rr3",
    color: "#6b8cae",
    points: [
      { x: 1, y: 118, datum: { run: "r1" } },
      { x: 2, y: -396, datum: { run: "r2" } },
    ],
  },
  {
    id: "default",
    color: "#b08c5a",
    points: [{ x: 1, y: 60, datum: { run: "r3" } }],
  },
];

describe("LineScatter", () => {
  it("renders one clickable point per datum and a polyline per series", () => {
    const { container } = render(<LineScatter series={SERIES} />);
    expect(container.querySelectorAll("[data-testid='ls-point']")).toHaveLength(3);
    expect(container.querySelectorAll("polyline")).toHaveLength(2);
  });

  it("draws a zero line when values cross zero", () => {
    const { container } = render(<LineScatter series={SERIES} />);
    expect(container.querySelector("[data-testid='ls-zero']")).toBeTruthy();
  });

  it("fires onPointClick with the datum", () => {
    const onClick = vi.fn();
    const { container } = render(<LineScatter series={SERIES} onPointClick={onClick} />);
    fireEvent.click(container.querySelectorAll("[data-testid='ls-point']")[0]);
    expect(onClick).toHaveBeenCalledWith({ run: "r1" });
  });

  it("renders a legend entry per series", () => {
    render(<LineScatter series={SERIES} />);
    expect(screen.getByText("wf-rr3")).toBeInTheDocument();
    expect(screen.getByText("default")).toBeInTheDocument();
  });
});

describe("LineScatter — bands (016-polish)", () => {
  it("renders shaded x-bands with labels behind the series", () => {
    const bands = [{ from: 1, to: 2, label: "2022 bear" }];
    const { container } = render(<LineScatter series={SERIES} bands={bands} />);
    expect(container.querySelectorAll("[data-testid='ls-band']")).toHaveLength(1);
    expect(screen.getByText("2022 bear")).toBeInTheDocument();
  });

  it("skips bands that do not overlap the x-domain", () => {
    const bands = [{ from: 100, to: 200, label: "far future" }];
    const { container } = render(<LineScatter series={SERIES} bands={bands} />);
    expect(container.querySelectorAll("[data-testid='ls-band']")).toHaveLength(0);
  });
});

describe("LineScatter — axes & rendering cleanup (016-polish round 2)", () => {
  it("renders y-axis tick labels through formatY with gridlines", () => {
    const { container } = render(
      <LineScatter series={SERIES} formatY={(v) => `${Math.round(v)}R`} />,
    );
    const ticks = container.querySelectorAll("[data-testid='ls-ytick']");
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect([...ticks].some((t) => /R$/.test(t.textContent ?? ""))).toBe(true);
    expect(container.querySelectorAll("[data-testid='ls-grid']").length).toBeGreaterThanOrEqual(3);
  });

  it("renders x-axis tick labels through formatX, deduping repeats", () => {
    const { container } = render(
      <LineScatter series={SERIES} formatX={() => "2020"} />,
    );
    // all ticks format to "2020" -> consecutive duplicates collapse to one
    expect(container.querySelectorAll("[data-testid='ls-xtick']")).toHaveLength(1);
  });

  it("draws points as true circles (uniform scaling — no preserveAspectRatio stretch)", () => {
    const { container } = render(<LineScatter series={SERIES} />);
    expect(container.querySelector("svg")?.getAttribute("preserveAspectRatio")).not.toBe("none");
  });
});
