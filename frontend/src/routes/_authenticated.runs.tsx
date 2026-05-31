import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/runs')({
  component: RunsPage,
})

function RunsPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">Runs</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        No runs yet. Use the CLI <code>make backtest PUSH=1</code> or come back
        here in a future feature with a Start Backtest button (Feature 007 US2).
      </p>
    </div>
  )
}
