import type { ReactNode } from 'react'

interface Props {
  title: string
  children: ReactNode
  /** Forwarded to the page container so existing tests/selectors keep working. */
  testId?: string
}

/**
 * Centered auth-card chrome for the sign-in flow: the IntradayBuilder brand
 * lockup (matching the topbar), a design-system card holding the stage form,
 * and a tagline footer. Presentational only — no router/auth dependencies.
 */
export function AuthScreen({ title, children, testId }: Props) {
  return (
    <div className="auth-screen">
      <div className="auth-box" data-testid={testId}>
        <div className="auth-brand">
          <div className="brand">
            <span className="brand-mark" aria-hidden>
              ◑
            </span>
            <span className="brand-name">
              Intraday<span className="brand-dim">Builder</span>
            </span>
          </div>
        </div>
        <div className="card auth-card">
          <h1 className="auth-title">{title}</h1>
          {children}
        </div>
        <p className="auth-foot">SPY · 5m research builder</p>
      </div>
    </div>
  )
}
