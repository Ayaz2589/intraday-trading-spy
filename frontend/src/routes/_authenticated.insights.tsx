import { createFileRoute } from '@tanstack/react-router'
import { InsightsPage } from '@/components/insights/InsightsPage'

// Feature 016: the Insights page route (cross-run aggregates + advisory rail).
export const Route = createFileRoute('/_authenticated/insights')({
  component: InsightsPage,
})
