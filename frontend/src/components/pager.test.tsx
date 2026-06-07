import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Pager, usePager } from './pager'

// Client-side pagination for the in-memory tables (studies, campaigns,
// per-config distribution). The hook slices; the Pager renders controls and
// disappears entirely when everything fits on one page.

function Harness({ items, pageSize }: { items: number[]; pageSize: number }) {
  const pager = usePager(items, pageSize)
  return (
    <div>
      <ul>
        {pager.pageItems.map((n) => (
          <li key={n}>item-{n}</li>
        ))}
      </ul>
      <Pager page={pager.page} pageCount={pager.pageCount} onPage={pager.setPage} />
    </div>
  )
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i)

describe('usePager + Pager', () => {
  it('slices to the page size and pages forward and back', () => {
    render(<Harness items={range(25)} pageSize={10} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(10)
    expect(screen.getByText('item-0')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText('item-10')).toBeInTheDocument()
    expect(screen.queryByText('item-0')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: /prev/i }))
    expect(screen.getByText('item-10')).toBeInTheDocument()
  })

  it('shows the page position', () => {
    render(<Harness items={range(25)} pageSize={10} />)
    expect(screen.getByText(/1 of 3/)).toBeInTheDocument()
  })

  it('renders no controls when everything fits on one page', () => {
    render(<Harness items={range(7)} pageSize={10} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(7)
    expect(screen.queryByRole('button', { name: /next/i })).toBeNull()
  })

  it('clamps the page when the list shrinks', () => {
    const { rerender } = render(<Harness items={range(25)} pageSize={10} />)
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText('item-20')).toBeInTheDocument()
    rerender(<Harness items={range(12)} pageSize={10} />)
    // Page 3 no longer exists — clamp to the last valid page, not an empty view.
    expect(screen.getByText('item-10')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })
})
