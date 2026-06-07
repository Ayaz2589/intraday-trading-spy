import { useState } from 'react'

// Client-side pagination for in-memory tables (studies, campaigns, per-config
// distribution). The data is already fully fetched — this only tames how much
// renders at once. For server pagination see useRuns (cursor + Load more).

export function usePager<T>(items: T[], pageSize: number): {
  page: number
  pageCount: number
  pageItems: T[]
  setPage(page: number): void
  total: number
} {
  const [rawPage, setPage] = useState(0)
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  // Clamp instead of resetting state: if the list shrinks under us (a delete,
  // a refetch), stay on the nearest valid page rather than showing nothing.
  const page = Math.min(rawPage, pageCount - 1)
  const pageItems = items.slice(page * pageSize, (page + 1) * pageSize)
  return { page, pageCount, pageItems, setPage, total: items.length }
}

export function Pager({
  page,
  pageCount,
  onPage,
}: {
  page: number
  pageCount: number
  onPage(page: number): void
}) {
  if (pageCount <= 1) return null
  return (
    <div
      data-testid="pager"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: '8px 0 2px',
      }}
    >
      <button
        type="button"
        className="btn btn-ghost"
        disabled={page === 0}
        onClick={() => onPage(page - 1)}
        style={{ fontSize: 'var(--fs-xs, 11px)', padding: '2px 10px' }}
      >
        ‹ Prev
      </button>
      <span className="mono" style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>
        {page + 1} of {pageCount}
      </span>
      <button
        type="button"
        className="btn btn-ghost"
        disabled={page >= pageCount - 1}
        onClick={() => onPage(page + 1)}
        style={{ fontSize: 'var(--fs-xs, 11px)', padding: '2px 10px' }}
      >
        Next ›
      </button>
    </div>
  )
}
