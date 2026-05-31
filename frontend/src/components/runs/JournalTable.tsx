import { useRunJournal, flattenJournal } from '@/hooks/useRunJournal'
import type { UUID } from '@/api/types'

interface Props {
  runId: UUID
}

const SEVERITY_COLOR: Record<string, string> = {
  info: 'var(--text-muted)',
  warning: 'var(--warning, #d97706)',
  error: 'var(--danger, #dc2626)',
}

export function JournalTable({ runId }: Props) {
  const query = useRunJournal(runId)
  const events = flattenJournal(query.data)

  if (query.isLoading) return <div className="p-4">Loading journal…</div>
  if (query.isError) return <div className="p-4 text-destructive">Could not load journal.</div>
  if (events.length === 0) return <div className="p-4 text-muted-foreground">No events.</div>

  return (
    <div data-testid="journal-table">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-sm)' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-strong)' }}>
            <th style={{ padding: '6px 8px' }}>Time</th>
            <th style={{ padding: '6px 8px' }}>Kind</th>
            <th style={{ padding: '6px 8px' }}>Severity</th>
            <th style={{ padding: '6px 8px' }}>Message</th>
          </tr>
        </thead>
        <tbody>
          {events.map(e => (
            <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '6px 8px' }}>{e.occurred_at}</td>
              <td style={{ padding: '6px 8px' }}>{e.kind}</td>
              <td style={{ padding: '6px 8px', color: SEVERITY_COLOR[e.severity] ?? undefined }}>
                {e.severity}
              </td>
              <td style={{ padding: '6px 8px' }}>{e.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
