import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate, useParams } from "react-router";
import {
  fetchRuns,
  fetchJournal,
  fetchSummary,
  fetchManifest,
  fetchBars,
} from "@/api/client";
import { RunsSidebar } from "@/components/runs-sidebar";
import { RunHeader } from "@/components/run-header";
import { SummaryMetricsCard } from "@/components/summary-metrics-card";
import { RejectionBreakdownCard } from "@/components/rejection-breakdown-card";
import { JournalTable } from "@/components/journal-table";
import { PriceChart } from "@/components/price-chart";
import { SessionPicker } from "@/components/session-picker";
import { ThemeToggle } from "@/components/theme-toggle";
import { RunActions } from "@/components/run-actions";
import { RiskKnobs } from "@/components/risk-knobs";
import { buildMarkers } from "@/components/journal-markers";
import { Button } from "@/components/ui/button";
import type {
  BarView,
  JournalFilter,
  JournalRowView,
  RunManifestView,
  RunSummaryView,
  SummaryMetricsView,
} from "@/api/types";

const sessionDate = (iso: string) => iso.slice(0, 10);

type SectionState<T> =
  | { loading: true }
  | { error: string }
  | { data: T };

function Section<T>({
  state,
  children,
}: {
  state: SectionState<T>;
  children: (data: T) => ReactNode;
}) {
  if ("loading" in state)
    return (
      <div className="text-sm text-gray-500 dark:text-slate-400 p-4">
        Loading…
      </div>
    );
  if ("error" in state)
    return (
      <div className="text-sm text-red-700 dark:text-red-400 p-4">
        Error: {state.error}
      </div>
    );
  return <>{children(state.data)}</>;
}

function loadSection<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  setter: (s: SectionState<T>) => void,
  ctrl: AbortController,
) {
  fn(ctrl.signal)
    .then((data) => setter({ data }))
    .catch((e: Error) => {
      if (e.name === "AbortError") return;
      setter({ error: String(e.message || e) });
    });
}

export function RunViewer() {
  const { run_id } = useParams<{ run_id: string }>();
  const navigate = useNavigate();
  const [runs, setRuns] = useState<RunSummaryView[]>([]);
  const [manifest, setManifest] = useState<SectionState<RunManifestView>>({
    loading: true,
  });
  const [summary, setSummary] = useState<SectionState<SummaryMetricsView>>({
    loading: true,
  });
  const [journal, setJournal] = useState<SectionState<JournalRowView[]>>({
    loading: true,
  });
  const [bars, setBars] = useState<SectionState<BarView[]>>({ loading: true });
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [showRejections, setShowRejections] = useState(false);
  const [filter, setFilter] = useState<JournalFilter>("all");

  const refreshRuns = useCallback(() => {
    fetchRuns().then(setRuns).catch(() => {});
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchRuns({ signal: ctrl.signal })
      .then(setRuns)
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  // If the URL points at a run that no longer exists (e.g. after
  // `make prune-runs`), redirect to root which picks the newest.
  useEffect(() => {
    if ("error" in manifest && manifest.error === "run_not_found") {
      navigate("/", { replace: true });
    }
  }, [manifest, navigate]);

  useEffect(() => {
    if (!run_id) return;
    setManifest({ loading: true });
    setSummary({ loading: true });
    setJournal({ loading: true });
    setBars({ loading: true });
    setSelectedSession(null);
    const ctrl = new AbortController();
    loadSection(
      (s) => fetchManifest(run_id, { signal: s }),
      setManifest,
      ctrl,
    );
    loadSection((s) => fetchSummary(run_id, { signal: s }), setSummary, ctrl);
    loadSection((s) => fetchJournal(run_id, { signal: s }), setJournal, ctrl);
    loadSection((s) => fetchBars(run_id, { signal: s }), setBars, ctrl);
    return () => ctrl.abort();
  }, [run_id]);

  const sessions = useMemo(() => {
    if (!("data" in bars)) return [];
    return Array.from(new Set(bars.data.map((b) => sessionDate(b.timestamp))));
  }, [bars]);

  useEffect(() => {
    if (sessions.length > 0 && !selectedSession) setSelectedSession(sessions[0]);
  }, [sessions, selectedSession]);

  const renderChart = () => {
    if ("loading" in bars)
      return (
        <div className="text-sm text-gray-500 dark:text-slate-400 p-4">
          Loading chart…
        </div>
      );
    if ("error" in bars) {
      const msg =
        bars.error === "source_data_missing"
          ? "Source data missing — the bars CSV referenced by this run is no longer on disk."
          : `Chart unavailable: ${bars.error}`;
      return (
        <div className="border border-amber-200 rounded p-4 text-sm text-amber-700 bg-amber-50 dark:border-amber-700/50 dark:text-amber-200 dark:bg-amber-900/20">
          {msg}
        </div>
      );
    }
    if (!selectedSession || sessions.length === 0) return null;
    const sessionBars = bars.data.filter(
      (b) => sessionDate(b.timestamp) === selectedSession,
    );
    const journalRows = "data" in journal ? journal.data : [];
    const sessionJournal = journalRows.filter(
      (r) => sessionDate(r.timestamp) === selectedSession,
    );
    const filteredForMarkers =
      filter === "all"
        ? sessionJournal
        : sessionJournal.filter((r) => r.status === filter);
    // A bar produces multiple journal rows (emitted + decision) carrying
    // the same vwap value. Dedupe by timestamp, otherwise lightweight-charts
    // rejects the series with "data must be asc ordered by time".
    const vwapByTime = new Map<string, number>();
    for (const r of sessionJournal) {
      if (r.vwap != null && !vwapByTime.has(r.timestamp))
        vwapByTime.set(r.timestamp, r.vwap);
    }
    const vwap = Array.from(vwapByTime, ([time, value]) => ({ time, value }))
      .sort((a, b) => a.time.localeCompare(b.time));
    const orRow = sessionJournal.find(
      (r) => r.or_high != null && r.or_low != null,
    );
    const or = orRow
      ? {
          high: orRow.or_high as number,
          low: orRow.or_low as number,
          from: sessionBars[0]?.timestamp ?? "",
          to: sessionBars[sessionBars.length - 1]?.timestamp ?? "",
        }
      : null;
    const markers = buildMarkers(filteredForMarkers, { showRejections });
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <SessionPicker
            sessions={sessions}
            selected={selectedSession}
            onChange={setSelectedSession}
          />
          <Button
            size="sm"
            variant={showRejections ? "default" : "outline"}
            onClick={() => setShowRejections((s) => !s)}
          >
            {showRejections ? "Hide rejections" : "Show rejections"}
          </Button>
        </div>
        <PriceChart bars={sessionBars} vwap={vwap} or={or} markers={markers} />
      </div>
    );
  };

  return (
    <div className="flex h-screen">
      <RunsSidebar runs={runs} selectedRunId={run_id ?? null} />
      <main className="flex-1 overflow-y-auto">
        <div className="flex items-center justify-between p-2 border-b border-gray-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <RunActions
              currentRunId={run_id ?? null}
              onNewRun={(id) => {
                refreshRuns();
                navigate(`/runs/${id}`);
              }}
              onCleared={() => {
                refreshRuns();
                navigate("/", { replace: true });
              }}
            />
            <RiskKnobs
              onNewRun={(id) => {
                refreshRuns();
                navigate(`/runs/${id}`);
              }}
            />
          </div>
          <ThemeToggle />
        </div>
        <Section state={manifest}>
          {(m) => <RunHeader manifest={m} />}
        </Section>
        <div className="p-4">{renderChart()}</div>
        <div className="p-4 grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <Section state={summary}>
              {(s) => <SummaryMetricsCard summary={s} />}
            </Section>
          </div>
          <Section state={summary}>
            {(s) => (
              <RejectionBreakdownCard
                breakdown={s.rejection_breakdown}
                total={s.rejected_signal_count}
              />
            )}
          </Section>
        </div>
        <div className="p-4">
          <Section state={journal}>
            {(j) => (
              <JournalTable
                rows={j}
                filter={filter}
                onFilterChange={setFilter}
              />
            )}
          </Section>
        </div>
      </main>
    </div>
  );
}
