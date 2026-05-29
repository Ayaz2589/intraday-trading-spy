import type {
  RunSummaryView,
  JournalRowView,
  BarView,
  RunManifestView,
  SummaryMetricsView,
} from "./types";

type FetchOpts = { signal?: AbortSignal };

async function get<T>(path: string, opts?: FetchOpts): Promise<T> {
  const res = await fetch(path, { signal: opts?.signal });
  if (res.status === 404) {
    const body = await res.json().catch(() => ({ error: "not_found" }));
    const err: Error & { code?: string } = new Error(
      body?.error ?? "not_found",
    );
    err.code = body?.error ?? "not_found";
    throw err;
  }
  if (!res.ok) throw new Error(`http_${res.status}`);
  return (await res.json()) as T;
}

export const fetchRuns = (opts?: FetchOpts) =>
  get<RunSummaryView[]>("/api/runs", opts);

export const fetchJournal = (id: string, opts?: FetchOpts) =>
  get<JournalRowView[]>(`/api/runs/${id}/journal`, opts);

export const fetchSummary = (id: string, opts?: FetchOpts) =>
  get<SummaryMetricsView>(`/api/runs/${id}/summary`, opts);

export const fetchManifest = (id: string, opts?: FetchOpts) =>
  get<RunManifestView>(`/api/runs/${id}/manifest`, opts);

export const fetchBars = (id: string, opts?: FetchOpts) =>
  get<BarView[]>(`/api/runs/${id}/bars`, opts);

async function send<T>(
  method: "POST" | "DELETE",
  path: string,
  body?: unknown,
  opts?: FetchOpts,
): Promise<T> {
  const init: RequestInit = { method, signal: opts?.signal };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(path, init);
  if (!res.ok) {
    const respBody = await res
      .json()
      .catch(() => ({ error: `http_${res.status}` }));
    const err: Error & { code?: string } = new Error(
      respBody?.error ?? `http_${res.status}`,
    );
    err.code = respBody?.error ?? `http_${res.status}`;
    throw err;
  }
  return (await res.json()) as T;
}

export type ConfigOverrides = Record<string, Record<string, unknown>>;

export const fetchConfig = (opts?: FetchOpts) =>
  get<Record<string, unknown>>("/api/config", opts);

export const runBacktest = (
  overrides?: ConfigOverrides,
  opts?: FetchOpts,
) =>
  send<{ run_id: string }>(
    "POST",
    "/api/backtests/run",
    overrides ? { overrides } : {},
    opts,
  );

export const deleteRun = (id: string, opts?: FetchOpts) =>
  send<{ deleted: string }>("DELETE", `/api/runs/${id}`, undefined, opts);

export const deleteAllRuns = (opts?: FetchOpts) =>
  send<{ deleted_count: number }>("DELETE", "/api/runs", undefined, opts);
