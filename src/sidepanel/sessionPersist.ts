export const TAB_SESSION_KEY = 'iris_tab_agent_sessions'

export interface PersistedTabSession {
  sessionId: string
  conversationId: string | null
  chatModel: string | null
}

export type PersistedMap = Record<string, PersistedTabSession>

export function newSessionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function isBrowserNewTab(tab: chrome.tabs.Tab): boolean {
  const url = (tab.pendingUrl || tab.url || '').toLowerCase()
  return url.startsWith('chrome://newtab')
    || url.startsWith('chrome://new-tab-page')
    || url.startsWith('edge://newtab')
}

export async function readTabSessions(): Promise<PersistedMap> {
  try {
    const data = await chrome.storage.session.get(TAB_SESSION_KEY)
    return (data[TAB_SESSION_KEY] as PersistedMap) ?? {}
  } catch {
    return {}
  }
}

export async function writeTabSessions(all: PersistedMap): Promise<void> {
  await chrome.storage.session.set({ [TAB_SESSION_KEY]: all })
}

export async function persistSessionBindings(
  tabIds: number[],
  rec: PersistedTabSession,
): Promise<void> {
  const all = await readTabSessions()
  for (const id of tabIds) all[String(id)] = rec
  await writeTabSessions(all)
}

export async function copyTabSession(fromTabId: number, toTabId: number): Promise<boolean> {
  const all = await readTabSessions()
  const src = all[String(fromTabId)]
  if (!src) return false
  all[String(toTabId)] = { ...src }
  await writeTabSessions(all)
  return true
}

export async function dropTabBinding(tabId: number): Promise<void> {
  const all = await readTabSessions()
  delete all[String(tabId)]
  await writeTabSessions(all)
}

export function tabIdsForSession(all: PersistedMap, sessionId: string): number[] {
  return Object.entries(all)
    .filter(([, v]) => v.sessionId === sessionId)
    .map(([k]) => Number(k))
}
