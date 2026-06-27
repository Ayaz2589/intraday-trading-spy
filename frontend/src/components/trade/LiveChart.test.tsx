// Feature 021 T029 — live chart: view switcher, VWAP presence/absence,
// position level lines (textual strip is the testable surface).
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('klinecharts', () => {
  const chart = {
    setSymbol: vi.fn(),
    setPeriod: vi.fn(),
    setDataLoader: vi.fn(),
    createIndicator: vi.fn(),
    createOverlay: vi.fn(),
    removeOverlay: vi.fn(),
    setStyles: vi.fn(),
    resize: vi.fn(),
  }
  return {
    init: vi.fn(() => chart),
    dispose: vi.fn(),
    registerIndicator: vi.fn(),
    registerOverlay: vi.fn(),
  }
})

import { init } from 'klinecharts'
const { LiveChart } = await import('./LiveChart')
import type { LiveBars } from '@/hooks/useTrade'

const bars = (n = 3): LiveBars => ({
  bars: Array.from({ length: n }, (_, i) => ({
    t: `2026-06-08T13:${30 + i}:00+00:00`,
    o: 525, h: 525.5, l: 524.7, c: 525.2, v: 1000, vwap: 525.1,
  })),
  vwapAvailable: true,
  vwapReason: null,
  positionLevels: { entry: 525.1, stop: 524.2, target: 526.9 },
  loading: false,
})

describe('LiveChart', () => {
  it('renders the four views and signals a switch', () => {
    const onView = vi.fn()
    render(<LiveChart view="5m" onView={onView} data={bars()} />)
    for (const label of ['1m', '5m', '1d', '30d']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    fireEvent.click(screen.getByRole('button', { name: '30d' }))
    expect(onView).toHaveBeenCalledWith('30d')
  })

  it('marks the active view as pressed', () => {
    render(<LiveChart view="1m" onView={vi.fn()} data={bars()} />)
    expect(screen.getByRole('button', { name: '1m' })).toHaveAttribute(
      'aria-pressed', 'true',
    )
  })

  it('shows position levels as a readable strip', () => {
    render(<LiveChart view="5m" onView={vi.fn()} data={bars()} />)
    const strip = screen.getByTestId('position-levels')
    expect(strip).toHaveTextContent('525.10')
    expect(strip).toHaveTextContent('524.20')
    expect(strip).toHaveTextContent('526.90')
  })

  it('explains the missing VWAP on the 30d view', () => {
    const data = {
      ...bars(),
      vwapAvailable: false,
      vwapReason: 'VWAP is anchored to a single trading session',
    }
    render(<LiveChart view="30d" onView={vi.fn()} data={data} />)
    expect(screen.getByText(/anchored to a single trading session/i)).toBeInTheDocument()
  })

  it('pairs VWAP with a HelpTooltip', () => {
    const { container } = render(<LiveChart view="5m" onView={vi.fn()} data={bars()} />)
    expect(container.querySelector('[data-help-key="vwap"]')).toBeTruthy()
  })

  // The klinecharts default grid is too prominent in dark mode; apply the
  // design's subtle `--grid` token (matches price-chart) so the dashed
  // horizontal lines recede.
  it('styles the grid with a subtle color instead of the library default', () => {
    render(<LiveChart view="5m" onView={vi.fn()} data={bars()} />)
    const chart = vi.mocked(init).mock.results.at(-1)?.value as {
      setStyles: ReturnType<typeof vi.fn>
    }
    const gridCalls = chart.setStyles.mock.calls.filter(
      (call: unknown[]) => (call[0] as { grid?: { horizontal?: { color?: string } } })?.grid?.horizontal?.color,
    )
    expect(gridCalls.length).toBeGreaterThan(0)
    const color = (gridCalls.at(-1)![0] as { grid: { horizontal: { color: string } } }).grid
      .horizontal.color
    expect(typeof color).toBe('string')
    expect(color.length).toBeGreaterThan(0)
  })
})
