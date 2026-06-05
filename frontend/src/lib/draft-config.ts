import type { ConfigChange } from '@/api/types'

// Feature 017: the transient draft carried from a Claude experiment card to
// the Strategies page — URL search param only, NEVER persisted server-side
// (FR-004/FR-006: dismiss = no trace by construction). Decoding is defensive:
// anything malformed yields null and the page renders normally (FR-008).

export type DraftConfig = {
  base_config_name: string
  changes: ConfigChange[]
  analysis_id: string
  experiment_index: number
  hypothesis: string
}

const MAX_PARAM_LENGTH = 8192

export function encodeDraft(draft: DraftConfig): string {
  // base64url (no padding) so the value survives URL transport untouched.
  return btoa(JSON.stringify(draft))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function isConfigChange(c: unknown): c is ConfigChange {
  return (
    typeof c === 'object' &&
    c !== null &&
    typeof (c as ConfigChange).knob_path === 'string' &&
    typeof (c as ConfigChange).value === 'number'
  )
}

export function decodeDraft(raw: string | undefined | null): DraftConfig | null {
  if (!raw || raw.length > MAX_PARAM_LENGTH) return null
  try {
    const b64 = raw.replace(/-/g, '+').replace(/_/g, '/')
    const parsed: unknown = JSON.parse(atob(b64))
    if (typeof parsed !== 'object' || parsed === null) return null
    const d = parsed as Record<string, unknown>
    if (
      typeof d.base_config_name !== 'string' ||
      !Array.isArray(d.changes) ||
      !d.changes.every(isConfigChange) ||
      typeof d.analysis_id !== 'string' ||
      typeof d.experiment_index !== 'number' ||
      typeof d.hypothesis !== 'string'
    ) {
      return null
    }
    return d as unknown as DraftConfig
  } catch {
    return null
  }
}
