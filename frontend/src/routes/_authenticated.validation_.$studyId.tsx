import { createFileRoute } from "@tanstack/react-router";
import { WalkForwardTable } from "@/components/validation/walk-forward-table";
import { SensitivitySurface } from "@/components/validation/sensitivity-surface";
import { useStudy, useStudyStatus } from "@/hooks/useStudies";
import type { SensitivitySurface as Surface, WalkForwardResult } from "@/api/types";

export const Route = createFileRoute("/_authenticated/validation_/$studyId")({
  component: StudyDetailPage,
});

function StudyDetailPage() {
  const { studyId } = Route.useParams();
  const status = useStudyStatus(studyId);
  const study = useStudy(studyId);

  const s = study.data;
  const inFlight = status.data?.status === "queued" || status.data?.status === "running";

  return (
    <div style={{ padding: "var(--sp-5)", display: "grid", gap: "var(--sp-5)", maxWidth: 900 }}>
      <h2>Study {studyId.slice(0, 8)}…</h2>

      {status.data && (
        <div className="stat-label">
          {status.data.status} · {status.data.progress_completed}/{status.data.progress_total}
          {status.data.failure_reason ? ` · ${status.data.failure_reason}` : ""}
        </div>
      )}

      {inFlight && <div className="stat-label">Running… this page updates automatically.</div>}

      {s?.status === "finished" && s.result && s.kind === "walk_forward" && (
        <WalkForwardTable result={s.result as WalkForwardResult} />
      )}
      {s?.status === "finished" && s.result && s.kind === "sensitivity" && (
        <SensitivitySurface surface={s.result as Surface} />
      )}
      {s?.status === "failed" && (
        <div style={{ color: "var(--loss)" }}>Study failed: {s.failure_reason}</div>
      )}
    </div>
  );
}
