/**
 * Opaque cursor pagination — mirrors Feature 006's contract.
 * Clients treat cursors as black boxes; encode/decode is server-defined.
 * This module is mostly for the URL-search-param round-trip in TanStack Router.
 */

export function encodeCursor(naturalKey: string, idValue: string): string {
  const payload = JSON.stringify([naturalKey, idValue])
  const b64 = btoa(payload)
  return b64.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

export function decodeCursor(cursor: string | null | undefined): [string, string] | null {
  if (!cursor) return null
  try {
    const padded = cursor.replace(/-/g, '+').replace(/_/g, '/')
    const padLen = (4 - (padded.length % 4)) % 4
    const decoded = JSON.parse(atob(padded + '='.repeat(padLen)))
    if (!Array.isArray(decoded) || decoded.length !== 2) throw new Error('shape')
    const [key, id] = decoded
    if (typeof key !== 'string' || typeof id !== 'string') throw new Error('types')
    return [key, id]
  } catch (err) {
    throw new Error(`malformed cursor: ${err}`)
  }
}
