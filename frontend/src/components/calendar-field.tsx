import { useState } from 'react'
import { DayPicker } from 'react-day-picker'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function isoToDate(iso: string): Date {
  // Treat ISO YYYY-MM-DD as a local date (avoid UTC parse pulling it back a day).
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function dateToIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function formatLabel(iso: string): string {
  const d = isoToDate(iso)
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

interface Props {
  value: string // ISO YYYY-MM-DD
  onChange(iso: string): void
  min?: string
  max?: string
  ariaLabel?: string
  testid?: string
}

export function CalendarField({ value, onChange, min, max, ariaLabel, testid }: Props) {
  const [open, setOpen] = useState(false)
  const selected = isoToDate(value)
  const disabledBefore = min ? isoToDate(min) : undefined
  const disabledAfter = max ? isoToDate(max) : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          data-testid={testid}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-sm)',
            background: 'var(--surface-2)',
            color: 'var(--text)',
            fontSize: 'var(--fs-xs)',
            fontFamily: 'var(--mono)',
            cursor: 'pointer',
            minWidth: 116,
          }}
        >
          <span aria-hidden style={{ opacity: 0.7 }}>📅</span>
          {formatLabel(value)}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        style={{
          padding: 8,
          background: 'var(--surface)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--r-md)',
          width: 'auto',
        }}
      >
        <DayPicker
          mode="single"
          selected={selected}
          onSelect={d => {
            if (!d) return
            onChange(dateToIso(d))
            setOpen(false)
          }}
          disabled={[
            ...(disabledBefore ? [{ before: disabledBefore }] : []),
            ...(disabledAfter ? [{ after: disabledAfter }] : []),
          ]}
          showOutsideDays
          weekStartsOn={0}
        />
      </PopoverContent>
    </Popover>
  )
}
