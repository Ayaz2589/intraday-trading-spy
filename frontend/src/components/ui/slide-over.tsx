import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// A lightweight right-anchored slide-out panel (drawer). No new dependency —
// fixed overlay + panel rendered into a portal, with a slide-in transform on
// mount. Closes on overlay click, the ✕ button, or Escape. Used by the
// Strategies config grid to show a config's detail/editor on demand.
export function SlideOver({
  open,
  onClose,
  title,
  children,
  width = 460,
}: {
  open: boolean
  onClose(): void
  title?: ReactNode
  children?: ReactNode
  width?: number
}) {
  // `shown` flips true one frame after mount so the panel transitions in from
  // the right rather than appearing already in place.
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!open) {
      setShown(false)
      return
    }
    const raf = requestAnimationFrame(() => setShown(true))
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div data-testid="slide-over-root">
      <div
        data-testid="slide-over-overlay"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.45)',
          opacity: shown ? 1 : 0,
          transition: 'opacity 180ms ease',
          zIndex: 60,
        }}
      />
      <aside
        role="dialog"
        aria-modal="true"
        data-testid="slide-over-panel"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width,
          maxWidth: '100vw',
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border-strong)',
          boxShadow: 'var(--shadow-pop)',
          zIndex: 61,
          display: 'flex',
          flexDirection: 'column',
          transform: shown ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 200ms ease',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ minWidth: 0 }}>{title}</div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="btn"
            style={{ flexShrink: 0 }}
          >
            ✕
          </button>
        </header>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>{children}</div>
      </aside>
    </div>,
    document.body,
  )
}
