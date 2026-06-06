import type { ReactNode } from 'react'

// The shared no-data view (design-system .empty-state pattern). Constitution
// VI: an empty page is a teaching moment — say what belongs here, why it's
// empty, and what to do next.

export function EmptyState({
  icon,
  title,
  text,
  action,
  hint,
  testid,
}: {
  icon: ReactNode
  title: ReactNode
  text: ReactNode
  action?: ReactNode
  hint?: ReactNode
  testid?: string
}) {
  return (
    <div className="empty-state" data-testid={testid}>
      <div className="empty-state-card">
        <span className="icon-badge" aria-hidden>
          {icon}
        </span>
        <h3 className="empty-state-title">{title}</h3>
        <p className="empty-state-text">{text}</p>
        {action}
        {hint && <p className="empty-state-hint">{hint}</p>}
      </div>
    </div>
  )
}
