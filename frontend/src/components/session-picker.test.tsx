import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { SessionPicker } from "./session-picker";

describe("SessionPicker", () => {
  it("renders all sessions and fires callback on select", async () => {
    const onChange = vi.fn();
    render(
      <SessionPicker
        sessions={["2026-05-26", "2026-05-27"]}
        selected="2026-05-26"
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByText("2026-05-27"));
    expect(onChange).toHaveBeenCalledWith("2026-05-27");
  });

  it("highlights the selected session", () => {
    render(
      <SessionPicker
        sessions={["2026-05-26", "2026-05-27"]}
        selected="2026-05-27"
        onChange={() => {}}
      />,
    );
    const selected = screen.getByText("2026-05-27");
    expect(selected.className).toMatch(/bg-blue/);
  });
});
