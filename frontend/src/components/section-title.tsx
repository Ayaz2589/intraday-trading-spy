// Shared section header for the card-based pages (Data, Validation):
// accent tick + bold title + muted subtitle. Children = HelpTooltips.
export function SectionTitle({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children?: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 4 }}>
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-base, 15px)', fontWeight: 700, margin: 0 }}>
        <span aria-hidden style={{ width: 3, height: 14, borderRadius: 2, background: 'var(--accent, #2563eb)' }} />
        {title} {children}
      </h3>
      <p style={{ margin: '2px 0 0 11px', fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>{subtitle}</p>
    </div>
  )
}

export const cardSection: React.CSSProperties = {
  padding: '14px 16px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-md, 10px)',
  background: 'var(--surface, #fff)',
}
