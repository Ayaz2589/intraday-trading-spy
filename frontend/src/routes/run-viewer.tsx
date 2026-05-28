import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router";
import {
  fetchRuns,
  fetchJournal,
  fetchSummary,
  fetchManifest,
} from "@/api/client";
import { RunsSidebar } from "@/components/runs-sidebar";
import { RunHeader } from "@/components/run-header";
import { SummaryMetricsCard } from "@/components/summary-metrics-card";
import { RejectionBreakdownCard } from "@/components/rejection-breakdown-card";
import { JournalTable } from "@/components/journal-table";
import type {
  JournalRowView,
  RunManifestView,
  RunSummaryView,
  SummaryMetricsView,
} from "@/api/types";

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
    return <div className="text-sm text-gray-500 p-4">Loading…</div>;
  if ("error" in state)
    return <div className="text-sm text-red-700 p-4">Error: {state.error}</div>;
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

  useEffect(() => {
    const ctrl = new AbortController();
    fetchRuns({ signal: ctrl.signal })
      .then(setRuns)
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    if (!run_id) return;
    setManifest({ loading: true });
    setSummary({ loading: true });
    setJournal({ loading: true });
    const ctrl = new AbortController();
    loadSection(
      (s) => fetchManifest(run_id, { signal: s }),
      setManifest,
      ctrl,
    );
    loadSection((s) => fetchSummary(run_id, { signal: s }), setSummary, ctrl);
    loadSection((s) => fetchJournal(run_id, { signal: s }), setJournal, ctrl);
    return () => ctrl.abort();
  }, [run_id]);

  return (
    <div className="flex h-screen">
      <RunsSidebar runs={runs} selectedRunId={run_id ?? null} />
      <main className="flex-1 overflow-y-auto">
        <Section state={manifest}>
          {(m) => <RunHeader manifest={m} />}
        </Section>
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
            {(j) => <JournalTable rows={j} />}
          </Section>
        </div>
      </main>
    </div>
  );
}
