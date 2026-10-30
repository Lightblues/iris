import { bool, nums, num, schema, str, tabs, type ToolDef } from './shared'

export const tabsToolDefs: ToolDef[] = [
  {
    name: 'list_tabs',
    aliases: ['query_tabs'],
    group: 'tabs',
    needsTab: false,
    description: 'List open browser tabs. Filter by keyword or domain.',
    inputSchema: schema({
      keyword: str('Search keyword to filter tabs by title or URL'),
      domain: str('Filter tabs by domain (e.g. github.com)'),
      limit: num('Maximum number of tabs to return. Default 30.'),
      sort: str('recent, domain, or title. Default recent.'),
    }),
    async run(params) {
      const filter: Record<string, string> = {}
      if (typeof params.keyword === 'string') filter.keyword = params.keyword
      if (typeof params.domain === 'string') filter.domain = params.domain
      const sort = params.sort === 'domain' || params.sort === 'title' ? params.sort : 'recent'
      const result = await tabs('query_tabs', { filter, limit: typeof params.limit === 'number' ? params.limit : 30, sort })
      return {
        tabs: result.tabs.map((t: any) => ({
          id: t.id, title: t.title, domain: t.domain, groupName: t.groupName, pinned: t.pinned, active: t.active,
        })),
        total: result.total,
      }
    },
  },
  {
    name: 'close_tabs',
    group: 'tabs',
    needsTab: false,
    description: 'Close specified tabs. Tabs are saved to trash for 7-day recovery unless safe is false.',
    inputSchema: schema({ tabIds: nums('Tab ids to close'), safe: bool('Save to trash. Default true.') }, ['tabIds']),
    async run(params) {
      if (!Array.isArray(params.tabIds)) throw new Error('tabIds is required')
      const safe = params.safe !== false
      const result = await tabs('remove_tabs', { tabIds: params.tabIds, safe })
      return {
        closed: result.closed,
        message: safe ? `Closed ${result.closed} tabs (saved to trash for 7 days)` : `Closed ${result.closed} tabs permanently`,
      }
    },
  },
  {
    name: 'create_tab_group',
    group: 'tabs',
    needsTab: false,
    description: 'Create a new tab group with the specified tabs.',
    inputSchema: schema({
      tabIds: nums('Tab ids to group'),
      title: str('Group name'),
      color: str('grey, blue, red, yellow, green, pink, purple, cyan, or orange'),
    }, ['tabIds', 'title']),
    async run(params) {
      if (!Array.isArray(params.tabIds) || typeof params.title !== 'string') throw new Error('tabIds and title are required')
      const result = await tabs('create_tab_group', { tabIds: params.tabIds, title: params.title, color: params.color || 'blue' })
      return { groupId: result.groupId, message: result.message }
    },
  },
  {
    name: 'archive_inactive',
    group: 'tabs',
    needsTab: false,
    description: 'Archive tabs that have not been accessed for a given number of hours. preview:true lists them without archiving.',
    inputSchema: schema({
      thresholdHours: num('Inactivity threshold in hours. Default 24.'),
      preview: bool('Show the plan without archiving'),
    }),
    async run(params) {
      const preview = params.preview === true
      const result = await tabs('archive_inactive_tabs', {
        thresholdHours: typeof params.thresholdHours === 'number' ? params.thresholdHours : 24,
        preview,
      })
      if (preview) {
        return { preview: true, toArchive: result.count, tabs: result.toArchive.map((t: any) => ({ id: t.id, title: t.title })) }
      }
      return { executed: true, archived: result.count, message: `Archived ${result.count} inactive tabs` }
    },
  },
  {
    name: 'list_closed_tabs',
    group: 'tabs',
    needsTab: false,
    description: 'List recently closed tabs from trash. These can be restored within 7 days.',
    inputSchema: schema({ limit: num('Maximum number of items. Default 20.') }),
    async run(params) {
      const result = await tabs('list_closed_tabs', { limit: typeof params.limit === 'number' ? params.limit : 20 })
      return {
        items: result.items.map((item: any) => ({
          id: item.id, title: item.title, url: item.url, closedAt: new Date(item.closedAt).toISOString(),
        })),
        total: result.total,
      }
    },
  },
  {
    name: 'restore_tab',
    group: 'tabs',
    needsTab: false,
    description: 'Restore a closed tab from trash by its id.',
    inputSchema: schema({ trashItemId: str('Trash item id') }, ['trashItemId']),
    async run(params) {
      if (typeof params.trashItemId !== 'string') throw new Error('trashItemId is required')
      const result = await tabs('restore_tab', { trashItemId: params.trashItemId })
      return { success: result.success, message: result.message || 'Tab restored' }
    },
  },
]
