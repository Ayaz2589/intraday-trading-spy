import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { StudyDetailPage } from "@/components/validation/StudyDetailPage";
import { RerunAction } from "@/components/validation/RerunAction";
import { useRerunStudy, useStudy, useStudyStatus } from "@/hooks/useStudies";

// Feature 014: thin mount — the page composition lives in
// components/validation/StudyDetailPage.tsx (testable without the router).
//
// Re-run UX: stay on THIS study (results remain visible) while the clone
// runs — its progress shows inline in the header action — then jump to the
// new study once it reaches a terminal state.

export const Route = createFileRoute("/_authenticated/validation_/$studyId")({
  component: StudyDetailRoute,
});

function StudyDetailRoute() {
  const { studyId } = Route.useParams();
  const status = useStudyStatus(studyId);
  const study = useStudy(studyId);
  const rerun = useRerunStudy();
  const navigate = useNavigate();

  // The cloned study we're waiting on (null = no re-run in flight).
  const [cloneId, setCloneId] = useState<string | null>(null);
  const cloneStatus = useStudyStatus(cloneId ?? "");

  useEffect(() => {
    const s = cloneStatus.data?.status;
    if (cloneId && (s === "finished" || s === "failed")) {
      setCloneId(null);
      navigate({ to: "/validation/$studyId", params: { studyId: cloneId } });
    }
  }, [cloneId, cloneStatus.data?.status, navigate]);

  const cloneInFlight =
    cloneId && cloneStatus.data
      ? {
          completed: cloneStatus.data.progress_completed,
          total: cloneStatus.data.progress_total,
        }
      : cloneId
        ? { completed: 0, total: 0 } // clone started, first status poll pending
        : null;

  const rerunAction = (
    <RerunAction
      pending={rerun.isPending}
      progress={cloneInFlight}
      onRerun={() =>
        rerun.mutate(studyId, { onSuccess: (r) => setCloneId(r.study_id) })
      }
    />
  );

  return (
    <StudyDetailPage study={study.data} status={status.data} rerunAction={rerunAction} />
  );
}
