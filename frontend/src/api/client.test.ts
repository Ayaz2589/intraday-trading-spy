import { describe, it, expect, beforeEach, vi } from "vitest";
import { fetchRuns, fetchJournal } from "./client";

describe("api/client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetchRuns hits /api/runs", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("[]"));
    const out = await fetchRuns();
    expect(fetchSpy).toHaveBeenCalledWith("/api/runs", expect.any(Object));
    expect(out).toEqual([]);
  });

  it("fetchJournal 404 maps to error result", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "run_not_found" }), {
        status: 404,
      }),
    );
    await expect(fetchJournal("missing")).rejects.toThrow(/run_not_found/);
  });

  it("fetchRuns supports AbortController cancelation (passes signal)", async () => {
    const ctrl = new AbortController();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("[]"));
    await fetchRuns({ signal: ctrl.signal });
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({ signal: ctrl.signal });
  });
});
