export type RelayLevel = 'off' | 'read' | 'control'

/** Must match READ_METHODS in services/server/src/hub.ts; the server enforces the same split. */
export const READ_METHODS = new Set([
  'browser.fetch',
  'iris.capabilities',
  'iris.chat.platforms',
  'iris.chat.list',
  'iris.chat.export',
  'iris.chat.export_all',
])

export function relayAllows(level: RelayLevel, method: string): boolean {
  if (level === 'off') return false
  return level === 'control' || READ_METHODS.has(method)
}
