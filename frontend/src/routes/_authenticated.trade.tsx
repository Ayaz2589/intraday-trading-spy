import { createFileRoute } from '@tanstack/react-router'
import { TradePage } from '@/components/trade/TradePage'

// Feature 021: live paper trading cockpit.
export const Route = createFileRoute('/_authenticated/trade')({
  component: TradePage,
})
