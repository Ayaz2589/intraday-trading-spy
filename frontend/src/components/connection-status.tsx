import { useHealth } from '@/hooks/useHealth'
import { HelpTooltip } from './help-tooltip'

export function ConnectionStatus() {
  const { state } = useHealth()
  const color =
    state === 'healthy' ? 'var(--success, #16a34a)' : state === 'unhealthy' ? 'var(--danger, #dc2626)' : 'var(--muted, #9ca3af)'
  const label =
    state === 'healthy' ? 'API connected' : state === 'unhealthy' ? 'API unreachable' : 'Checking API…'
  return (
    <span
      data-testid="connection-status"
      data-state={state}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
      title={label}
      aria-label={label}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: color,
          display: 'inline-block',
        }}
      />
      <span className="text-xs text-muted-foreground">{label}</span>
      <HelpTooltip helpKey="connection_status" />
    </span>
  )
}
