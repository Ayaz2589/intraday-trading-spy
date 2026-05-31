import { ThemeToggle } from './theme-toggle'
import { ConnectionStatus } from './connection-status'
import { SignOutMenu } from './auth/SignOutMenu'
import { HelpTooltip } from './help-tooltip'

interface Props {
  strategyLabel?: string
  configLabel?: string
}

export function AuthenticatedTopbar({ strategyLabel, configLabel }: Props) {
  return (
    <header className="topbar topbar-blur" data-testid="authenticated-topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden>
          ◑
        </span>
        <span className="brand-name">
          Intraday<span className="brand-dim">Builder</span>
        </span>
        <span className="brand-tick mono">SPY · 5m</span>
        {strategyLabel || configLabel ? (
          <span
            className="text-xs text-muted-foreground"
            data-testid="strategy-config-breadcrumb"
            style={{ marginLeft: 12 }}
          >
            {strategyLabel ?? 'vwap_pullback_long'} · {configLabel ?? 'default'}
          </span>
        ) : null}
      </div>
      <div className="tb-actions">
        <ConnectionStatus />
        <span className="tb-div" />
        <ThemeToggle />
        <span className="tb-div" />
        <HelpTooltip helpKey="session" />
        <SignOutMenu />
      </div>
    </header>
  )
}
