import { useDataDownloadJob } from '@/hooks/useDataDownloadJob'
import { DataDownloadStatus } from './DataDownloadStatus'
import type { UUID } from '@/api/types'

interface Props {
  jobIds: UUID[]
}

export function DataDownloadsList({ jobIds }: Props) {
  if (jobIds.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground" data-testid="data-downloads-list-empty">
        No downloads yet this session.
      </div>
    )
  }

  return (
    <div data-testid="data-downloads-list">
      {jobIds.map(id => (
        <DataDownloadRow key={id} jobId={id} />
      ))}
    </div>
  )
}

function DataDownloadRow({ jobId }: { jobId: UUID }) {
  const query = useDataDownloadJob(jobId)
  if (query.isLoading || !query.data) {
    return (
      <div className="p-2 text-xs text-muted-foreground">Loading job {jobId.slice(0, 8)}…</div>
    )
  }
  if (query.isError) {
    return (
      <div className="p-2 text-xs text-destructive">Could not load job {jobId.slice(0, 8)}.</div>
    )
  }
  return <DataDownloadStatus job={query.data} />
}
