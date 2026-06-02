import { Skeleton } from '@/components/skeleton'

/**
 * Loading placeholder for the runs landing while the runs list is fetched.
 * Reuses the design-system Skeleton (shimmer) inside a centered card — the
 * same loading language as the run-viewer. Resolves to either a redirect into
 * the newest run or the empty state once the query settles.
 */
export function RunsLoadingSkeleton() {
  return (
    <div
      className="empty-state"
      data-testid="runs-landing-loading"
      role="status"
      aria-label="Loading runs"
    >
      <div
        className="card"
        aria-hidden
        style={{
          width: '100%',
          maxWidth: 440,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--sp-3)',
        }}
      >
        <Skeleton width="55%" height={22} />
        <Skeleton width="100%" height={14} />
        <Skeleton width="88%" height={14} />
        <Skeleton width="70%" height={14} />
        <Skeleton width={150} height={38} rounded="md" style={{ marginTop: 'var(--sp-2)' }} />
      </div>
    </div>
  )
}
