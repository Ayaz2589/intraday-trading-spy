import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { RunHeader } from "./run-header";
import type { RunManifestView } from "@/api/types";

const manifest: RunManifestView = {
  run_id: "20260528-220714-7697908e",
  run_started_at: "2026-05-28T22:07:14+00:00",
  run_ended_at: "2026-05-28T22:07:15+00:00",
  code_version: "deadbeef",
  config_snapshot: {},
  data_fingerprint: {
    sha256: "7697908eabcdef0123456789",
    bar_count: 234,
    earliest_timestamp: "x",
    latest_timestamp: "y",
    session_count: 3,
  },
  summary: {} as RunManifestView["summary"],
};

describe("RunHeader", () => {
  it("renders run id as an h1 with mono font (FR-004)", () => {
    render(<RunHeader manifest={manifest} />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("20260528-220714-7697908e");
    expect(h1.className).toContain("mono");
  });

  it("renders Started / Code / Data overline labels (FR-001)", () => {
    render(<RunHeader manifest={manifest} />);
    expect(screen.getByText("Started")).toBeInTheDocument();
    expect(screen.getByText("Code")).toBeInTheDocument();
    expect(screen.getByText("Data")).toBeInTheDocument();
  });

  it("renders code_version and sha256[:8]", () => {
    render(<RunHeader manifest={manifest} />);
    expect(screen.getByText(/deadbeef/)).toBeInTheDocument();
    expect(screen.getByText("7697908e")).toBeInTheDocument();
  });

  it("renders the 'complete' status badge", () => {
    render(<RunHeader manifest={manifest} />);
    expect(screen.getByText(/complete/i)).toBeInTheDocument();
  });
});
