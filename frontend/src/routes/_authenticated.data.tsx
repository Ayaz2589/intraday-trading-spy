import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { DataDownloadForm } from '@/components/data/DataDownloadForm'
import { DataDownloadsList } from '@/components/data/DataDownloadsList'

export const Route = createFileRoute('/_authenticated/data')({
  component: DataPage,
})

function DataPage() {
  const [jobIds, setJobIds] = useState<string[]>([])

  return (
    <div className="p-6">
      <DataDownloadForm onStarted={id => setJobIds(prev => [id, ...prev])} />
      <hr style={{ margin: '16px 0', border: 0, borderTop: '1px solid var(--border)' }} />
      <h3 className="text-base font-semibold mb-2">Recent downloads</h3>
      <DataDownloadsList jobIds={jobIds} />
    </div>
  )
}
