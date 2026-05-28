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
  it("renders run id, code_version, and sha256[:8]", () => {
    render(<RunHeader manifest={manifest} />);
    expect(screen.getByText("20260528-220714-7697908e")).toBeInTheDocument();
    expect(screen.getByText(/deadbeef/)).toBeInTheDocument();
    // sha256[:8] rendered in a separate span — match exactly.
    expect(screen.getByText(/^data /)).toHaveTextContent("data 7697908e");
  });
});
