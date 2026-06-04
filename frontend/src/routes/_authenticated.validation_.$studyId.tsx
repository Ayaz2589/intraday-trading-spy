import { createFileRoute } from "@tanstack/react-router";
import { StudyDetailPage } from "@/components/validation/StudyDetailPage";
import { useStudy, useStudyStatus } from "@/hooks/useStudies";

// Feature 014: thin mount — the page composition lives in
// components/validation/StudyDetailPage.tsx (testable without the router).

export const Route = createFileRoute("/_authenticated/validation_/$studyId")({
  component: StudyDetailRoute,
});

function StudyDetailRoute() {
  const { studyId } = Route.useParams();
  const status = useStudyStatus(studyId);
  const study = useStudy(studyId);

  return <StudyDetailPage study={study.data} status={status.data} />;
}
