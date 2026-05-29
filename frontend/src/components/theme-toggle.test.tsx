import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach } from "vitest";
import { ThemeToggle } from "./theme-toggle";

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("theme", "light");
  document.documentElement.classList.remove("dark");
});

describe("ThemeToggle", () => {
  it("renders a button with an accessible label", () => {
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: /theme/i })).toBeInTheDocument();
  });

  it("clicking toggles the dark class on <html>", async () => {
    render(<ThemeToggle />);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: /theme/i }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
