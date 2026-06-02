import { LineChart, Play } from 'lucide-react'

interface Props {
  /** Opens the run launcher (topbar StrategyConfigDropdown). */
  onCreateRun: () => void
}

/**
 * Empty state for the runs landing when no backtests exist yet. Centered
 * design-system card with an educational blurb and a primary CTA that opens
 * the run launcher. Presentational — the open signal is wired by the caller.
 */
export function RunsEmptyState({ onCreateRun }: Props) {
  return (
    <div className="empty-state" data-testid="runs-landing-empty">
      <div className="card empty-state-card">
        <div className="icon-badge" aria-hidden>
          <LineChart size={22} />
        </div>
        <h2 className="empty-state-title">No backtests yet</h2>
        <p className="empty-state-text">
          Backtests replay SPY 5-minute bars through your strategy so you can
          study entries, exits, and rejections.
        </p>
        <button type="button" className="btn btn-primary" onClick={onCreateRun}>
          <Play size={14} aria-hidden />
          Run your first backtest
        </button>
        <p className="empty-state-hint">
          Prefer the terminal?{' '}
          <code className="mono empty-state-code">make backtest</code>
        </p>
      </div>
    </div>
  )
}
