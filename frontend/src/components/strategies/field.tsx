import type { CSSProperties, ReactNode } from 'react'

// Tiny shared form atoms for the strategy page sections.
export const inputStyle: CSSProperties = {
  padding: '7px 10px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-sm)',
  background: 'var(--surface-2)',
  color: 'var(--text)',
  fontSize: 'var(--fs-sm)',
}

export function FieldLabel({
  children,
  htmlFor,
  style,
}: {
  children: ReactNode
  htmlFor?: string
  style?: CSSProperties
}) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 'var(--fs-2xs)',
        fontWeight: 600,
        color: 'var(--text-muted)',
        marginBottom: 3,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        ...style,
      }}
    >
      {children}
    </label>
  )
}
