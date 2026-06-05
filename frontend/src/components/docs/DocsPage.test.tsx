import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { vi } from "vitest";
import { HELP_CONTENT } from "../help-content";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    ...rest
  }: {
    children: React.ReactNode;
    to: string;
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

import { DocsPage } from "./DocsPage";

describe("DocsPage", () => {
  it("renders the page header chrome", () => {
    render(<DocsPage />);
    const header = screen.getByTestId("docs-header");
    expect(header.querySelector("h1.rh-title")).toBeTruthy();
    expect(header).toHaveTextContent(/how this app works/i);
  });

  it("explains the trade pipeline: strategy → risk veto → broker → journal", () => {
    render(<DocsPage />);
    const flow = screen.getByTestId("docs-trade-flow");
    expect(flow).toHaveTextContent(/strategy/i);
    expect(flow).toHaveTextContent(/risk manager/i);
    expect(flow).toHaveTextContent(/broker/i);
    expect(flow).toHaveTextContent(/journal/i);
    // the absolute veto is the heart of the architecture
    expect(flow).toHaveTextContent(/no stop-loss = no trade/i);
  });

  it("explains the research pipeline through gate and lockbox", () => {
    render(<DocsPage />);
    const pipeline = screen.getByTestId("docs-research-flow");
    expect(pipeline).toHaveTextContent(/walk-forward/i);
    expect(pipeline).toHaveTextContent(/pooled gate/i);
    expect(pipeline).toHaveTextContent(/lockbox/i);
  });

  it("documents every page in the side nav with a link to it", () => {
    render(<DocsPage />);
    const pages = screen.getByTestId("docs-pages");
    for (const [name, href] of [
      ["Validation", "/validation"],
      ["Insights", "/insights"],
      ["Data", "/data"],
      ["Strategy", "/strategies"],
      ["Backtests", "/runs"],
    ]) {
      expect(pages).toHaveTextContent(name);
      expect(pages.querySelector(`a[href='${href}']`)).toBeTruthy();
    }
  });

  it("renders the full glossary from HELP_CONTENT — single source of truth", () => {
    render(<DocsPage />);
    const entries = screen.getAllByTestId("glossary-entry");
    expect(entries).toHaveLength(Object.keys(HELP_CONTENT).length);
    // spot-check a few canonical terms
    expect(screen.getByText(HELP_CONTENT.vwap.title)).toBeInTheDocument();
    expect(screen.getByText(HELP_CONTENT.lockbox.title)).toBeInTheDocument();
  });

  it("filters the glossary by search across title and description", () => {
    render(<DocsPage />);
    const total = Object.keys(HELP_CONTENT).length;
    fireEvent.change(screen.getByPlaceholderText(/search/i), {
      target: { value: "vwap" },
    });
    const filtered = screen.getAllByTestId("glossary-entry");
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.length).toBeLessThan(total);
    expect(screen.getByText(HELP_CONTENT.vwap.title)).toBeInTheDocument();
    // count line reflects the filter
    expect(screen.getByTestId("glossary-count")).toHaveTextContent(
      `${filtered.length} of ${total}`
    );
    // clearing restores everything
    fireEvent.change(screen.getByPlaceholderText(/search/i), {
      target: { value: "" },
    });
    expect(screen.getAllByTestId("glossary-entry")).toHaveLength(total);
  });

  it("shows a quiet empty state when no term matches", () => {
    render(<DocsPage />);
    fireEvent.change(screen.getByPlaceholderText(/search/i), {
      target: { value: "zzz-no-such-term" },
    });
    expect(screen.queryAllByTestId("glossary-entry")).toHaveLength(0);
    expect(screen.getByText(/no terms match/i)).toBeInTheDocument();
  });

  it("states the hard guardrails: SPY-only, long-only, paper-first", () => {
    render(<DocsPage />);
    const intro = screen.getByTestId("docs-intro");
    expect(intro).toHaveTextContent(/SPY/);
    expect(intro).toHaveTextContent(/long-only/i);
    expect(intro).toHaveTextContent(/paper/i);
  });
});
