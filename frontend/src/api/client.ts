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
  opts?: FetchOpts,
): Promise<T> {
  const res = await fetch(path, { method, signal: opts?.signal });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `http_${res.status}` }));
    const err: Error & { code?: string } = new Error(
      body?.error ?? `http_${res.status}`,
    );
    err.code = body?.error ?? `http_${res.status}`;
    throw err;
  }
  return (await res.json()) as T;
}

export const runBacktest = (opts?: FetchOpts) =>
  send<{ run_id: string }>("POST", "/api/backtests/run", opts);

export const deleteRun = (id: string, opts?: FetchOpts) =>
  send<{ deleted: string }>("DELETE", `/api/runs/${id}`, opts);

export const deleteAllRuns = (opts?: FetchOpts) =>
  send<{ deleted_count: number }>("DELETE", "/api/runs", opts);
