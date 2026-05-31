import { useState } from 'react'
import { useStartBacktest } from '@/hooks/useStartBacktest'
import { HelpTooltip } from '@/components/help-tooltip'

interface Props {
  open: boolean
  onClose(): void
  onStarted?(runId: string): void
}

export function StartBacktestDialog({ open, onClose, onStarted }: Props) {
  const mutation = useStartBacktest()
  const [configName, setConfigName] = useState('default')
  const [dataCsvPath, setDataCsvPath] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const response = await mutation.mutateAsync({
        config_name: configName,
        ...(dataCsvPath ? { data_csv_path: dataCsvPath } : {}),
      })
      onStarted?.(response.run_id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="start-backtest-title"
      data-testid="start-backtest-dialog"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--r-lg)',
          padding: 24,
          width: 'min(440px, 90vw)',
        }}
      >
        <h2 id="start-backtest-title" className="text-lg font-semibold mb-4">
          Start backtest
        </h2>
        <label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
          Saved config
          <HelpTooltip helpKey="saved_config" />
        </label>
        <input
          type="text"
          value={configName}
          onChange={e => setConfigName(e.target.value)}
          aria-label="Config name"
          required
          className="w-full p-2 border rounded mb-3"
        />
        <label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
          Data source (optional CSV path)
          <HelpTooltip helpKey="data_download_job" />
        </label>
        <input
          type="text"
          value={dataCsvPath}
          onChange={e => setDataCsvPath(e.target.value)}
          aria-label="Data CSV path"
          placeholder="(bundled fixture)"
          className="w-full p-2 border rounded mb-3"
        />
        {error && (
          <p role="alert" className="text-sm text-destructive mb-2">
            {error}
          </p>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 border rounded text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={mutation.isPending || !configName}
            className="px-3 py-1 bg-primary text-primary-foreground rounded text-sm disabled:opacity-50"
            data-testid="start-backtest-submit"
          >
            {mutation.isPending ? 'Starting…' : 'Start'}
          </button>
        </div>
      </form>
    </div>
  )
}
