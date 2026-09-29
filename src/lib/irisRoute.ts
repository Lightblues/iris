const PREFIX = 'iris://'

export interface HistoryRoute {
  page: 'history'
  id?: string
}

/** Open one stored conversation. The id is `Conversation.id` from history. */
export function historyRoute(id: string): string {
  return `${PREFIX}history/${encodeURIComponent(id)}`
}

export function parseIrisRoute(input: string): HistoryRoute | null {
  const raw = input.trim()
  if (!raw.startsWith(PREFIX)) return null
  const rest = raw.slice(PREFIX.length).replace(/\/+$/, '')
  const slash = rest.indexOf('/')
  const page = slash === -1 ? rest : rest.slice(0, slash)
  const tail = slash === -1 ? '' : rest.slice(slash + 1)
  if (page !== 'history') return null
  if (!tail) return { page: 'history' }
  try {
    return { page: 'history', id: decodeURIComponent(tail) }
  } catch {
    return { page: 'history', id: tail }
  }
}

export const IRIS_ROUTE_KEY = 'iris_pending_route'
