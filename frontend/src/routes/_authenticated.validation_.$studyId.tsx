import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { StudyDetailPage } from "@/components/validation/StudyDetailPage";
import { HelpTooltip } from "@/components/help-tooltip";
import { useRerunStudy, useStudy, useStudyStatus } from "@/hooks/useStudies";

// Feature 014: thin mount — the page composition lives in
// components/validation/StudyDetailPage.tsx (testable without the router).

export const Route = createFileRoute("/_authenticated/validation_/$studyId")({
  component: StudyDetailRoute,
});

function StudyDetailRoute() {
  const { studyId } = Route.useParams();
  const status = useStudyStatus(studyId);
  const study = useStudy(studyId);
  const rerun = useRerunStudy();
  const navigate = useNavigate();

  const rerunAction = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <button
        type="button"
        disabled={rerun.isPending}
        onClick={() =>
          rerun.mutate(studyId, {
            // Jump straight to the fresh (drillable) study.
            onSuccess: (r) =>
              navigate({ to: "/validation/$studyId", params: { studyId: r.study_id } }),
          })
        }
        style={{
          padding: "5px 12px",
          borderRadius: "var(--r-sm, 6px)",
          border: "1px solid var(--border)",
          background: "var(--surface-2, #f6f7f9)",
          color: "var(--text)",
          fontSize: "var(--fs-sm, 13px)",
          fontWeight: 600,
          cursor: rerun.isPending ? "wait" : "pointer",
        }}
      >
        {rerun.isPending ? "Re-running…" : "↻ Re-run study"}
      </button>
      <HelpTooltip helpKey="rerun_study" />
    </span>
  );

  return (
    <StudyDetailPage study={study.data} status={status.data} rerunAction={rerunAction} />
  );
}
