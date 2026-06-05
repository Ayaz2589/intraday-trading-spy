// Run-viewer session scale fix: the ~250-chip session strip becomes a
// calendar + prev/next arrows. Calendar picks snap to the nearest session.
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SessionCalendarPicker, snapToSession } from './session-calendar-picker'

const SESSIONS = ['2018-07-02', '2018-07-03', '2018-07-05', '2018-07-06']

describe('snapToSession', () => {
  it('returns exact matches as-is', () => {
    expect(snapToSession(SESSIONS, '2018-07-05')).toBe('2018-07-05')
  })

  it('snaps a non-trading day to the nearest session', () => {
    expect(snapToSession(SESSIONS, '2018-07-04')).toBe('2018-07-03') // tie → earlier
    expect(snapToSession(SESSIONS, '2018-07-08')).toBe('2018-07-06')
    expect(snapToSession(SESSIONS, '2018-01-01')).toBe('2018-07-02') // clamps
  })
})

describe('SessionCalendarPicker', () => {
  it('renders nothing for single-session runs', () => {
    render(
      <SessionCalendarPicker sessions={['2018-07-02']} selected="2018-07-02" onChange={vi.fn()} />,
    )
    expect(screen.queryByTestId('session-calendar')).not.toBeInTheDocument()
  })

  it('shows position context and steps with the arrows', () => {
    const onChange = vi.fn()
    render(
      <SessionCalendarPicker sessions={SESSIONS} selected="2018-07-03" onChange={onChange} />,
    )
    expect(screen.getByTestId('session-position').textContent).toContain('2 / 4')

    fireEvent.click(screen.getByRole('button', { name: /previous session/i }))
    expect(onChange).toHaveBeenCalledWith('2018-07-02')
    fireEvent.click(screen.getByRole('button', { name: /next session/i }))
    expect(onChange).toHaveBeenCalledWith('2018-07-05')
  })

  it('disables the arrows at the ends', () => {
    render(
      <SessionCalendarPicker sessions={SESSIONS} selected="2018-07-02" onChange={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: /previous session/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /next session/i })).not.toBeDisabled()
  })

  it('renders the calendar trigger with the selected date', () => {
    render(
      <SessionCalendarPicker sessions={SESSIONS} selected="2018-07-05" onChange={vi.fn()} />,
    )
    expect(screen.getByTestId('session-calendar').textContent).toContain('Jul 5, 2018')
  })
})
