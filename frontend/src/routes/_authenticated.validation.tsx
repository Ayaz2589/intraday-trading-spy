import { createFileRoute } from '@tanstack/react-router'
import { ValidationStatCards } from '@/components/validation/ValidationStatCards'
import { StartStudyCard } from '@/components/validation/StartStudyCard'
import { StudiesTable } from '@/components/validation/StudiesTable'
import { LockboxCard } from '@/components/validation/LockboxCard'
import { SectionTitle, cardSection } from '@/components/section-title'
import { useConfigs } from '@/hooks/useConfigs'
import { useLockboxStatus, useRunLockbox, useStudies } from '@/hooks/useStudies'

export const Route = createFileRoute('/_authenticated/validation')({
  component: ValidationPage,
})

// The Validation page (Feature 011, redesigned 2026-06-04 in the Data-page
// card language). Thin composer: stat cards → launcher → studies table →
// lockbox. Sections fail independently; tooltips per concept (constitution VI).
function ValidationPage() {
  const studiesQuery = useStudies()
  const lockbox = useLockboxStatus()
  const runLockbox = useRunLockbox()
  const configsQuery = useConfigs()

  const studies = studiesQuery.data?.studies ?? []
  const configs = configsQuery.data?.configs ?? []

  return (
    <div style={{ padding: 'var(--sp-5, 20px)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-4, 16px)' }}>
      {/* Header */}
      <section>
        <h2 style={{ fontSize: 'var(--fs-lg, 18px)', fontWeight: 700, margin: 0 }}>Validation</h2>
        <p style={{ margin: '2px 0 0', fontSize: 'var(--fs-sm, 13px)', color: 'var(--text-muted)' }}>
          Walk-forward, sensitivity &amp; the one-shot lockbox — research without self-deception
        </p>
      </section>

      <ValidationStatCards studies={studies} lockboxState={lockbox.data?.state ?? null} />

      <section style={cardSection}>
        <SectionTitle title="New validation study" subtitle="Test a saved config on data it has never seen" />
        <StartStudyCard />
      </section>

      <section style={cardSection}>
        <SectionTitle title="Studies" subtitle="Your validation studies, newest first" />
        {studiesQuery.isError ? (
          <p data-testid="studies-error" style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 13px)' }}>
            Couldn't load studies — the rest of the page still works.
          </p>
        ) : studiesQuery.isLoading ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 13px)' }}>Loading…</p>
        ) : (
          <StudiesTable studies={studies} />
        )}
      </section>

      {lockbox.data && (
        <section style={cardSection}>
          <SectionTitle title="Lockbox" subtitle="The sealed final exam — spent exactly once, on your best candidate" />
          <LockboxCard
            status={lockbox.data}
            configs={configs}
            running={runLockbox.isPending}
            onRun={(configName, override) => runLockbox.mutate({ config_name: configName, override })}
          />
        </section>
      )}
    </div>
  )
}
