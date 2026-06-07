import { createFileRoute } from "@tanstack/react-router";
import { CampaignDetailPage } from "@/components/research/CampaignDetailPage";

// Feature 019: thin mount — the page composition lives in
// components/research/CampaignDetailPage.tsx (testable without the router).

export const Route = createFileRoute("/_authenticated/validation_/campaigns/$campaignId")({
  component: CampaignDetailRoute,
});

function CampaignDetailRoute() {
  const { campaignId } = Route.useParams();
  return <CampaignDetailPage campaignId={campaignId} />;
}
