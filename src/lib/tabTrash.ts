export interface TrashItem {
  id: string
  tabId: number
  title: string
  url: string
  favicon: string
  groupName: string | null
  closedAt: number
  expiresAt: number
}

export interface TrashStore {
  items: TrashItem[]
}

const STORAGE_KEY = 'iris_tab_trash'
const MAX_ITEMS = 200
const RETENTION_DAYS = 7

export async function getTrash(): Promise<TrashItem[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  const store = (result[STORAGE_KEY] || { items: [] }) as TrashStore
  return store.items
}

async function saveTrash(items: TrashItem[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: { items } })
}

export async function addToTrash(items: TrashItem[]): Promise<void> {
  const existing = await getTrash()
  const combined = [...existing, ...items]
  const sorted = combined.sort((a, b) => b.closedAt - a.closedAt)
  const kept = sorted.slice(0, MAX_ITEMS)
  await saveTrash(kept)
}

export async function safeCloseTabs(tabIds: number[]): Promise<TrashItem[]> {
  const tabs = await Promise.all(
    tabIds.map(id => chrome.tabs.get(id).catch(() => null))
  )

  const items: TrashItem[] = []
  for (const tab of tabs) {
    if (!tab) continue

    let groupName: string | null = null
    if (tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
      try {
        const group = await chrome.tabGroups.get(tab.groupId)
        groupName = group.title || null
      } catch {
        // Group might not exist
      }
    }

    items.push({
      id: crypto.randomUUID(),
      tabId: tab.id!,
      title: tab.title || 'Untitled',
      url: tab.url || '',
      favicon: tab.favIconUrl || '',
      groupName,
      closedAt: Date.now(),
      expiresAt: Date.now() + RETENTION_DAYS * 86400000
    })
  }

  if (items.length > 0) {
    await addToTrash(items)
    await chrome.tabs.remove(tabIds)
  }

  return items
}

export async function restoreTab(itemId: string): Promise<chrome.tabs.Tab | null> {
  const items = await getTrash()
  const item = items.find(i => i.id === itemId)

  if (!item || item.expiresAt < Date.now()) {
    return null
  }

  const tab = await chrome.tabs.create({ url: item.url, active: true })

  const remaining = items.filter(i => i.id !== itemId)
  await saveTrash(remaining)

  return tab
}

export async function restoreRecentTabs(count: number): Promise<chrome.tabs.Tab[]> {
  const items = await getTrash()
  const valid = items.filter(i => i.expiresAt > Date.now())
  const toRestore = valid.slice(0, count)

  const tabs: chrome.tabs.Tab[] = []
  for (const item of toRestore) {
    const tab = await chrome.tabs.create({ url: item.url, active: false })
    tabs.push(tab)
  }

  const remaining = items.filter(i => !toRestore.find(r => r.id === i.id))
  await saveTrash(remaining)

  return tabs
}

export async function cleanupExpired(): Promise<number> {
  const items = await getTrash()
  const now = Date.now()
  const valid = items.filter(i => i.expiresAt > now)
  const removed = items.length - valid.length

  if (removed > 0) {
    await saveTrash(valid)
  }

  return removed
}

export async function clearTrash(): Promise<void> {
  await saveTrash([])
}
