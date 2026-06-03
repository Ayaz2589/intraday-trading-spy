import { createFileRoute } from '@tanstack/react-router'
import { DataCoveragePanel } from '@/components/data-coverage-panel'

export const Route = createFileRoute('/_authenticated/data')({
  component: DataPage,
})

function DataPage() {
  return (
    <div className="p-6">
      <DataCoveragePanel />
    </div>
  )
}
