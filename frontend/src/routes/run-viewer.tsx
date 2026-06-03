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
} from "@/api/legacy-client";
import { AppShell } from "@/components/app-shell";
import { Topbar } from "@/components/topbar";
import { Skeleton } from "@/components/skeleton";
import { ErrorCard } from "@/components/error-card";
import { RunsSidebar } from "@/components/runs-sidebar";
import { useLayoutMode } from "@/lib/layout-mode";
import { useSidebarMode } from "@/lib/sidebar-mode";
import { RunHeader } from "@/components/run-header";
import { SummaryMetricsCard } from "@/components/summary-metrics-card";
import { StrategyConfigCard } from "@/components/strategy-config-card";
import { RejectionBreakdownCard } from "@/components/rejection-breakdown-card";
import { EquityCurve } from "@/components/equity-curve";
import { PerBucketCard } from "@/components/per-bucket-card";
import { JournalTable } from "@/components/journal-table";
import { PriceChart } from "@/components/price-chart";
import { SessionPicker } from "@/components/session-picker";
import { buildMarkers } from "@/components/journal-markers";
import type {
  BarView,
  JournalFilter,
  JournalRowView,
  RunManifestView,
  RunSummaryView,
  SummaryMetricsView,
} from "@/api/legacy-types";

const sessionDate = (iso: string) => iso.slice(0, 10);

type SectionState<T> =
  | { loading: true }
  | { error: string }
  | { data: T };

function Section<T>({
  state,
  children,
  loading,
}: {
  state: SectionState<T>;
  children: (data: T) => ReactNode;
  loading?: ReactNode;
}) {
  if ("loading" in state) return <>{loading ?? <CardSkeleton />}</>;
  if ("error" in state) return <ErrorCard message={state.error} />;
  return <>{children(state.data)}</>;
}

// Default card-shaped skeleton: ~6 placeholder rows that fill the same
// space as the loaded card. Sections that need a different shape pass
// their own `loading` prop.
function CardSkeleton() {
  return (
    <section className="card" aria-hidden>
      <Skeleton width="40%" height={16} rounded="md" />
      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
        <Skeleton width="100%" height={14} />
        <Skeleton width="100%" height={14} />
        <Skeleton width="85%" height={14} />
        <Skeleton width="92%" height={14} />
      </div>
    </section>
  );
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
  const { layout, setLayout } = useLayoutMode();
  const { mode: sidebarMode, toggle: toggleSidebar } = useSidebarMode();
  const sidebarCollapsed = sidebarMode === "collapsed";

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
        <section className="card chart-card" aria-hidden>
          <Skeleton width="100%" height={360} rounded="md" />
        </section>
      );
    if ("error" in bars) {
      const msg =
        bars.error === "source_data_missing"
          ? "Source data missing — the bars CSV referenced by this run is no longer on disk."
          : `Chart unavailable: ${bars.error}`;
      return <ErrorCard title="Chart unavailable" message={msg} />;
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
    // The journal only writes a row when the strategy emits/rejects a
    // signal, so vwap is sparse — most bars (no signal) have no row at
    // all. Linearly interpolate across all session bars so the chart
    // renders one continuous VWAP line instead of disconnected segments.
    const vwapByTime = new Map<string, number>();
    for (const r of sessionJournal) {
      if (r.vwap != null && !vwapByTime.has(r.timestamp))
        vwapByTime.set(r.timestamp, r.vwap);
    }
    const knownIdx: number[] = [];
    sessionBars.forEach((b, i) => {
      if (vwapByTime.has(b.timestamp)) knownIdx.push(i);
    });
    const vwap: { time: string; value: number }[] = [];
    if (knownIdx.length > 0) {
      const ts = (s: string) => new Date(s).getTime();
      let cursor = 0; // index into knownIdx — first entry with knownIdx[cursor] >= i
      for (let i = 0; i < sessionBars.length; i++) {
        while (cursor < knownIdx.length && knownIdx[cursor] < i) cursor++;
        const exact = vwapByTime.get(sessionBars[i].timestamp);
        if (exact != null) {
          vwap.push({ time: sessionBars[i].timestamp, value: exact });
          continue;
        }
        const prevI = cursor > 0 ? knownIdx[cursor - 1] : -1;
        const nextI = cursor < knownIdx.length ? knownIdx[cursor] : -1;
        const prev =
          prevI >= 0 ? vwapByTime.get(sessionBars[prevI].timestamp)! : null;
        const next =
          nextI >= 0 ? vwapByTime.get(sessionBars[nextI].timestamp)! : null;
        let v: number | null = null;
        if (prev != null && next != null) {
          const t = ts(sessionBars[i].timestamp);
          const t0 = ts(sessionBars[prevI].timestamp);
          const t1 = ts(sessionBars[nextI].timestamp);
          const frac = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
          v = prev + frac * (next - prev);
        } else if (prev != null) v = prev;
        else if (next != null) v = next;
        if (v != null) vwap.push({ time: sessionBars[i].timestamp, value: v });
      }
    }
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
    // Pull account value + position cap out of the manifest's config
    // snapshot so the chart can show "(0.10% of account)" / "(46% of
    // cap)" on the entry rationale popover. Defaults match config.yaml
    // for runs that predate the snapshot fields.
    const m = "data" in manifest ? manifest.data : null;
    const riskCfg =
      (m?.config_snapshot?.risk as
        | { account_value?: number; max_position_value_pct?: number }
        | undefined) ?? {};
    const accountValue = riskCfg.account_value ?? 25000;
    const positionCapPct = riskCfg.max_position_value_pct ?? 100;
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <SessionPicker
            sessions={sessions}
            selected={selectedSession}
            onChange={setSelectedSession}
          />
        </div>
        <PriceChart
          bars={sessionBars}
          vwap={vwap}
          or={or}
          markers={markers}
          journal={sessionJournal}
          accountValue={accountValue}
          positionCapPct={positionCapPct}
          showRejections={showRejections}
          onToggleRejections={() => setShowRejections((v) => !v)}
        />
      </div>
    );
  };

  const onRunChange = (id: string) => {
    refreshRuns();
    navigate(`/runs/${id}`);
  };
  const onCleared = () => {
    refreshRuns();
    navigate("/", { replace: true });
  };

  return (
    <AppShell
      sidebar={<RunsSidebar runs={runs} selectedRunId={run_id ?? null} />}
      sidebarCollapsed={sidebarCollapsed}
      topbar={
        <Topbar
          currentRunId={run_id ?? null}
          onRunChange={onRunChange}
          onCleared={onCleared}
          layout={layout}
          onLayoutChange={setLayout}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={toggleSidebar}
        />
      }
    >
      <div className={layout === "focus" ? "content focus" : "content"}>
        <Section state={manifest}>
          {(m) => <RunHeader manifest={m} />}
        </Section>
        <div className="stat-row">
          <Section state={manifest}>
            {(m) => <StrategyConfigCard manifest={m} />}
          </Section>
          <Section state={summary}>
            {(s) => <SummaryMetricsCard summary={s} />}
          </Section>
          <Section state={summary}>
            {(s) => (
              <RejectionBreakdownCard
                breakdown={s.rejection_breakdown}
                total={s.rejected_signal_count}
                show={showRejections}
                onToggle={() => setShowRejections((v) => !v)}
              />
            )}
          </Section>
        </div>
        <Section state={summary}>
          {(s) => <EquityCurve points={s.equity_curve ?? []} />}
        </Section>
        {renderChart()}
        <Section state={summary}>
          {(s) => (
            <PerBucketCard
              hour={s.hour_buckets ?? []}
              weekday={s.weekday_buckets ?? []}
              month={s.month_buckets ?? []}
            />
          )}
        </Section>
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
    </AppShell>
  );
}
