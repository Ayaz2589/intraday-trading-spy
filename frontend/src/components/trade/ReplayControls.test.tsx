// Feature 022 (T015) — ReplayControls (pure presentational).
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ReplayControls, SPEED_OPTIONS } from './ReplayControls'
import type { ReplaySessionInfo } from '@/api/replay'

function setup(overrides: Partial<Parameters<typeof ReplayControls>[0]> = {}) {
  const props = {
    dates: ['2026-05-28', '2026-05-27', '2026-05-26'],
    selectedDate: '2026-05-28',
    onSelectDate: vi.fn(),
    session: null as ReplaySessionInfo | null,
    startAutomation: false,
    onToggleStartAutomation: vi.fn(),
    onStart: vi.fn(),
    onPlay: vi.fn(),
    onPause: vi.fn(),
    onStop: vi.fn(),
    onSpeed: vi.fn(),
    onToggleAutomation: vi.fn(),
    ...overrides,
  }
  render(<ReplayControls {...props} />)
  return props
}

describe('ReplayControls', () => {
  it('start screen: date picker, all speed options, start button', () => {
    const props = setup()
    expect(screen.getByTestId('replay-date-select')).toBeInTheDocument()
    const speed = screen.getByTestId('replay-speed-select') as HTMLSelectElement
    expect(speed.querySelectorAll('option').length).toBe(SPEED_OPTIONS.length)
    fireEvent.click(screen.getByTestId('replay-start'))
    expect(props.onStart).toHaveBeenCalled()
  })

  it('active session: shows status, progress, pause + stop', () => {
    const session: ReplaySessionInfo = {
      id: 'x', session_date: '2026-05-26', status: 'playing', automation: false,
      speed: 60, sim_clock: '2026-05-26T10:00:00-04:00',
      bars_total: 78, bars_delivered: 12,
    }
    const props = setup({ session })
    expect(screen.getByTestId('replay-status')).toHaveTextContent(/playing/i)
    expect(screen.getByTestId('replay-progress')).toHaveTextContent('12/78')
    fireEvent.click(screen.getByTestId('replay-pause'))
    expect(props.onPause).toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('replay-stop'))
    expect(props.onStop).toHaveBeenCalled()
  })

  it('paused session offers Play', () => {
    const session: ReplaySessionInfo = {
      id: 'x', session_date: '2026-05-26', status: 'paused', automation: true,
      speed: 300, sim_clock: '2026-05-26T10:00:00-04:00',
      bars_total: 78, bars_delivered: 30,
    }
    const props = setup({ session })
    fireEvent.click(screen.getByTestId('replay-play'))
    expect(props.onPlay).toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('replay-automation-toggle'))
    expect(props.onToggleAutomation).toHaveBeenCalledWith(false)
  })
})
