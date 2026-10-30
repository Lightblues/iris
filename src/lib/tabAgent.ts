import { safeCloseTabs, type TrashItem } from './tabTrash'
import { addBookmark } from './storage'
import type { BookmarkLink } from './types'

export interface TabSummary {
  id: number
  title: string
  url: string
  domain: string
  groupId: number
  groupName: string | null
  groupColor?: string
  lastAccessed?: number
  pinned: boolean
  audible: boolean
  active: boolean
  windowId: number
  index: number
}

export interface TabQueryFilter {
  keyword?: string
  domain?: string
  groupId?: number
  windowId?: number
  active?: boolean
  audible?: boolean
  pinned?: boolean
}

export interface TabQueryOptions {
  filter?: TabQueryFilter
  limit?: number
  offset?: number
  sort?: 'recent' | 'domain' | 'title'
}

export interface TabQueryResult {
  tabs: TabSummary[]
  total: number
  hasMore: boolean
}

async function getDomain(url: string): Promise<string> {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

export async function queryTabs(options: TabQueryOptions = {}): Promise<TabQueryResult> {
  const { filter = {}, limit = 30, offset = 0, sort = 'recent' } = options

  let query: chrome.tabs.QueryInfo = {}

  if (filter.active !== undefined) query.active = filter.active
  if (filter.audible !== undefined) query.audible = filter.audible
  if (filter.pinned !== undefined) query.pinned = filter.pinned
  if (filter.windowId !== undefined) query.windowId = filter.windowId
  if (filter.groupId !== undefined) query.groupId = filter.groupId

  let tabs = await chrome.tabs.query(query)

  // Filter by keyword or domain
  if (filter.keyword) {
    const kw = filter.keyword.toLowerCase()
    tabs = tabs.filter(t =>
      t.title?.toLowerCase().includes(kw) || t.url?.toLowerCase().includes(kw)
    )
  }

  if (filter.domain) {
    tabs = tabs.filter(t => t.url?.includes(filter.domain!))
  }

  // Get group info for tabs
  const groupIds = new Set(tabs.map(t => t.groupId).filter(id => id !== chrome.tabGroups.TAB_GROUP_ID_NONE))
  const groups = new Map<number, chrome.tabGroups.TabGroup>()

  for (const id of groupIds) {
    try {
      const group = await chrome.tabGroups.get(id)
      groups.set(id, group)
    } catch {
      // Group might not exist
    }
  }

  // Sort tabs
  if (sort === 'recent') {
    tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))
  } else if (sort === 'domain') {
    tabs.sort((a, b) => {
      const domainA = a.url ? new URL(a.url).hostname : ''
      const domainB = b.url ? new URL(b.url).hostname : ''
      return domainA.localeCompare(domainB)
    })
  } else if (sort === 'title') {
    tabs.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
  }

  const total = tabs.length
  const paginated = tabs.slice(offset, offset + limit)

  const summaries: TabSummary[] = await Promise.all(
    paginated.map(async tab => {
      const group = tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE ? groups.get(tab.groupId) : null
      return {
        id: tab.id!,
        title: (tab.title || 'Untitled').slice(0, 80),
        url: tab.url || '',
        domain: await getDomain(tab.url || ''),
        groupId: tab.groupId,
        groupName: group?.title || null,
        groupColor: group?.color,
        lastAccessed: tab.lastAccessed,
        pinned: tab.pinned || false,
        audible: tab.audible || false,
        active: tab.active || false,
        windowId: tab.windowId,
        index: tab.index
      }
    })
  )

  return {
    tabs: summaries,
    total,
    hasMore: offset + limit < total
  }
}

export async function getTabContent(tabId: number, maxLength: number = 2000): Promise<string> {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'extract-page-content' })
    if (response.success && response.content) {
      return response.content.slice(0, maxLength)
    }
    return ''
  } catch {
    return ''
  }
}

export async function createTabGroup(
  tabIds: number[],
  title: string,
  color: string = 'grey'
): Promise<number> {
  if (tabIds.length === 0) {
    throw new Error('Cannot create group with no tabs')
  }
  const groupId = await chrome.tabs.group({ tabIds: tabIds[0] })
  if (tabIds.length > 1) {
    for (const tabId of tabIds.slice(1)) {
      await chrome.tabs.group({ tabIds: tabId, groupId })
    }
  }
  await chrome.tabGroups.update(groupId, { title, color: color as any })
  return groupId
}

export async function updateTabGroup(
  groupId: number,
  updates: {
    title?: string
    color?: string
    collapsed?: boolean
  }
): Promise<void> {
  await chrome.tabGroups.update(groupId, updates as any)
}

export async function moveTab(
  tabId: number,
  options: { windowId?: number; index?: number }
): Promise<void> {
  if (options.windowId !== undefined || options.index !== undefined) {
    await chrome.tabs.move(tabId, options as any)
  }
}

export async function createBookmarkFromTab(
  tabId: number,
  remark?: string
): Promise<BookmarkLink> {
  const tab = await chrome.tabs.get(tabId)
  const bookmark: BookmarkLink = {
    id: Date.now().toString() + Math.random(),
    title: tab.title || 'Untitled',
    url: tab.url || '',
    remark,
    category: 'Other',
    createdAt: Date.now()
  }
  await addBookmark(bookmark)
  return bookmark
}

export async function removeTabs(
  tabIds: number[],
  safe: boolean = true
): Promise<{ closed: number; trashItems?: TrashItem[] }> {
  if (safe) {
    const items = await safeCloseTabs(tabIds)
    return { closed: items.length, trashItems: items }
  } else {
    await chrome.tabs.remove(tabIds)
    return { closed: tabIds.length }
  }
}

export interface ArchiveInactivePreview {
  toArchive: TabSummary[]
  groupId?: number
}

export async function archiveInactiveTabs(
  thresholdHours: number = 24,
  preview: boolean = true
): Promise<ArchiveInactivePreview> {
  const result = await queryTabs({ limit: 1000 })
  const now = Date.now()
  const threshold = thresholdHours * 3600 * 1000

  const toArchive = result.tabs.filter(t =>
    !t.pinned &&
    !t.active &&
    t.lastAccessed &&
    now - t.lastAccessed > threshold
  )

  if (!preview && toArchive.length > 0) {
    for (const tab of toArchive) {
      await createBookmarkFromTab(tab.id, 'Auto-archived')
    }

    const groupId = await createTabGroup(
      toArchive.map(t => t.id),
      'Archive',
      'grey'
    )
    await updateTabGroup(groupId, { collapsed: true })

    return { toArchive, groupId }
  }

  return { toArchive }
}

export function formatTabsForLLM(tabs: TabSummary[]): string {
  const lines = [
    `Open tabs (${tabs.length} shown):`,
    `ID    | Domain               | Title                           | Group       | Flags`,
    `------|----------------------|---------------------------------|-------------|------`,
  ]

  for (const tab of tabs) {
    const id = tab.id.toString().padEnd(5)
    const domain = tab.domain.slice(0, 20).padEnd(20)
    const title = tab.title.slice(0, 31).padEnd(31)
    const group = (tab.groupName || '-').slice(0, 11).padEnd(11)

    let flags = ''
    if (tab.pinned) flags += '📌'
    if (tab.audible) flags += '🔊'
    if (tab.active) flags += '⭐'

    lines.push(`${id} | ${domain} | ${title} | ${group} | ${flags}`)
  }

  return lines.join('\n')
}
