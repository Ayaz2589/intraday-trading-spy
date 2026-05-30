import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { SessionPicker } from "./session-picker";

describe("SessionPicker", () => {
  it("renders each session as a tab with weekday + short date (FR-001)", () => {
    render(
      <SessionPicker
        sessions={["2026-05-26", "2026-05-27"]}
        selected="2026-05-26"
        onChange={() => {}}
      />,
    );
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByText("05-26")).toBeInTheDocument();
    expect(screen.getByText("05-27")).toBeInTheDocument();
  });

  it("fires onChange with the session ISO when a tab is clicked", async () => {
    const onChange = vi.fn();
    render(
      <SessionPicker
        sessions={["2026-05-26", "2026-05-27"]}
        selected="2026-05-26"
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByText("05-27"));
    expect(onChange).toHaveBeenCalledWith("2026-05-27");
  });

  it("highlights the selected tab with aria-selected and design 'day-on' class", () => {
    render(
      <SessionPicker
        sessions={["2026-05-26", "2026-05-27"]}
        selected="2026-05-27"
        onChange={() => {}}
      />,
    );
    const tabs = screen.getAllByRole("tab");
    const active = tabs.find((t) => t.getAttribute("aria-selected") === "true");
    expect(active).toBeDefined();
    expect(active?.className).toContain("day-on");
  });

  it("returns null when there is one or zero sessions", () => {
    const { container } = render(
      <SessionPicker
        sessions={["2026-05-26"]}
        selected="2026-05-26"
        onChange={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
