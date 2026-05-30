import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { SegmentedControl } from "./segmented-control";

const OPTIONS = [
  { value: "overview", label: "Overview" },
  { value: "focus", label: "Chart focus" },
] as const;

describe("<SegmentedControl>", () => {
  it("renders a radiogroup with one radio per option", () => {
    render(
      <SegmentedControl
        options={OPTIONS}
        value="overview"
        onChange={() => {}}
        ariaLabel="Layout"
      />,
    );
    expect(screen.getByRole("radiogroup", { name: "Layout" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("marks the active option with aria-checked='true'", () => {
    render(
      <SegmentedControl
        options={OPTIONS}
        value="focus"
        onChange={() => {}}
        ariaLabel="Layout"
      />,
    );
    const radios = screen.getAllByRole("radio");
    const active = radios.find((r) => r.getAttribute("aria-checked") === "true");
    expect(active).toBeDefined();
    expect(active?.textContent).toContain("Chart focus");
  });

  it("clicking a radio fires onChange with its value", async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        options={OPTIONS}
        value="overview"
        onChange={onChange}
        ariaLabel="Layout"
      />,
    );
    await userEvent.click(screen.getByRole("radio", { name: /chart focus/i }));
    expect(onChange).toHaveBeenCalledWith("focus");
  });

  it("applies the design 'seg-on' class to the active option", () => {
    render(
      <SegmentedControl
        options={OPTIONS}
        value="overview"
        onChange={() => {}}
        ariaLabel="Layout"
      />,
    );
    const active = screen
      .getAllByRole("radio")
      .find((r) => r.getAttribute("aria-checked") === "true");
    expect(active?.className).toContain("seg-on");
  });

  it("supports keyboard navigation (right arrow moves selection)", async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        options={OPTIONS}
        value="overview"
        onChange={onChange}
        ariaLabel="Layout"
      />,
    );
    const first = screen.getByRole("radio", { name: /^overview/i });
    first.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("focus");
  });
});
