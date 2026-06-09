import { createFileRoute } from '@tanstack/react-router'
import { HistoricTradePage } from '@/components/trade/HistoricTradePage'

// Feature 022: historic trade replay — nested under /trade at /trade/historic.
export const Route = createFileRoute('/_authenticated/trade_/historic')({
  component: HistoricTradePage,
})
