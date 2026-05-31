import { useState } from 'react'
import { useStartDataDownload } from '@/hooks/useStartDataDownload'
import { HelpTooltip } from '@/components/help-tooltip'

interface Props {
  onStarted(jobId: string): void
}

export function DataDownloadForm({ onStarted }: Props) {
  const mutation = useStartDataDownload()
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!startDate || !endDate) {
      setError('Both start and end dates are required.')
      return
    }
    if (startDate > endDate) {
      setError('Start date must be on or before end date.')
      return
    }
    try {
      const response = await mutation.mutateAsync({ start_date: startDate, end_date: endDate })
      onStarted(response.job_id)
      setStartDate('')
      setEndDate('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <form onSubmit={submit} data-testid="data-download-form">
      <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
        Request data download
        <HelpTooltip helpKey="data_download_job" />
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="text-xs text-muted-foreground">Start date</span>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            aria-label="Start date"
            required
            className="p-2 border rounded"
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="text-xs text-muted-foreground">End date</span>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            aria-label="End date"
            required
            className="p-2 border rounded"
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive mb-2">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={mutation.isPending || !startDate || !endDate}
        className="px-3 py-1 bg-primary text-primary-foreground rounded text-sm disabled:opacity-50"
        data-testid="data-download-submit"
      >
        {mutation.isPending ? 'Requesting…' : 'Request download'}
      </button>
    </form>
  )
}
