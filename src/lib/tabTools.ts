import {
  queryTabs,
  getTabContent,
  createTabGroup,
  updateTabGroup,
  moveTab,
  createBookmarkFromTab,
  removeTabs,
  smartOrganizeTabs,
  archiveInactiveTabs,
  formatTabsForLLM,
  type TabQueryOptions
} from './tabAgent'
import { restoreTab, restoreRecentTabs, getTrash } from './tabTrash'

export const tabTools = {
  query_tabs: {
    description: `Query open browser tabs with filtering and pagination.
Returns a formatted list of tabs (default max 30).
Use filters to narrow results and avoid overwhelming context.`,
    parameters: {
      type: 'object',
      properties: {
        filter: {
          type: 'object',
          properties: {
            keyword: { type: 'string', description: 'Search in title/URL' },
            domain: { type: 'string', description: 'Filter by domain (e.g., "github.com")' },
            groupId: { type: 'number', description: 'Filter by tab group ID' },
            windowId: { type: 'number', description: 'Filter by window ID' },
            active: { type: 'boolean', description: 'Only active tabs' },
            audible: { type: 'boolean', description: 'Only audible tabs' },
            pinned: { type: 'boolean', description: 'Only pinned tabs' }
          }
        },
        limit: {
          type: 'number',
          description: 'Max number of tabs to return',
          default: 30
        },
        offset: {
          type: 'number',
          description: 'Offset for pagination',
          default: 0
        },
        sort: {
          type: 'string',
          enum: ['recent', 'domain', 'title'],
          description: 'Sort order',
          default: 'recent'
        }
      }
    },
    execute: async (params: TabQueryOptions) => {
      const result = await queryTabs(params)
      return {
        formatted: formatTabsForLLM(result.tabs),
        total: result.total,
        hasMore: result.hasMore,
        tabs: result.tabs
      }
    }
  },

  get_tab_content: {
    description: `Extract text content from a specific tab.
Returns Readability-processed content, truncated to maxLength.
Use this for generating summaries.`,
    parameters: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID to extract content from' },
        maxLength: { type: 'number', description: 'Max content length', default: 2000 }
      },
      required: ['tabId']
    },
    execute: async (params: { tabId: number; maxLength?: number }) => {
      const content = await getTabContent(params.tabId, params.maxLength)
      return { content }
    }
  },

  create_tab_group: {
    description: 'Create a new tab group with specified tabs',
    parameters: {
      type: 'object',
      properties: {
        tabIds: {
          type: 'array',
          items: { type: 'number' },
          description: 'Tab IDs to group'
        },
        title: { type: 'string', description: 'Group name' },
        color: {
          type: 'string',
          enum: ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'],
          description: 'Group color',
          default: 'grey'
        }
      },
      required: ['tabIds', 'title']
    },
    execute: async (params: { tabIds: number[]; title: string; color?: string }) => {
      const groupId = await createTabGroup(params.tabIds, params.title, params.color)
      return { groupId, message: `Created group "${params.title}" with ${params.tabIds.length} tabs` }
    }
  },

  update_tab_group: {
    description: 'Update an existing tab group',
    parameters: {
      type: 'object',
      properties: {
        groupId: { type: 'number', description: 'Group ID to update' },
        title: { type: 'string', description: 'New group name' },
        color: {
          type: 'string',
          enum: ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'],
          description: 'New group color'
        },
        collapsed: { type: 'boolean', description: 'Collapse/expand group' }
      },
      required: ['groupId']
    },
    execute: async (params: { groupId: number; title?: string; color?: string; collapsed?: boolean }) => {
      await updateTabGroup(params.groupId, params)
      return { message: 'Group updated' }
    }
  },

  move_tab: {
    description: 'Move a tab to a different position or window',
    parameters: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID to move' },
        windowId: { type: 'number', description: 'Target window ID' },
        index: { type: 'number', description: 'Target index position' }
      },
      required: ['tabId']
    },
    execute: async (params: { tabId: number; windowId?: number; index?: number }) => {
      await moveTab(params.tabId, params)
      return { message: 'Tab moved' }
    }
  },

  create_bookmark: {
    description: 'Create a bookmark from a tab',
    parameters: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID to bookmark' },
        remark: { type: 'string', description: 'Optional note/summary' }
      },
      required: ['tabId']
    },
    execute: async (params: { tabId: number; remark?: string }) => {
      const bookmark = await createBookmarkFromTab(params.tabId, params.remark)
      return { bookmark, message: `Bookmarked: ${bookmark.title}` }
    }
  },

  remove_tabs: {
    description: `Close tabs with optional trash safety.
When safe=true (default), tabs are saved to trash for 7-day recovery.
When safe=false, tabs are permanently closed.`,
    parameters: {
      type: 'object',
      properties: {
        tabIds: {
          type: 'array',
          items: { type: 'number' },
          description: 'Tab IDs to close'
        },
        safe: {
          type: 'boolean',
          description: 'Save to trash for recovery',
          default: true
        }
      },
      required: ['tabIds']
    },
    execute: async (params: { tabIds: number[]; safe?: boolean }) => {
      const result = await removeTabs(params.tabIds, params.safe)
      if (params.safe !== false) {
        return {
          closed: result.closed,
          message: `Closed ${result.closed} tabs. Saved to trash (7-day recovery).`,
          trashIds: result.trashItems?.map(i => i.id)
        }
      } else {
        return {
          closed: result.closed,
          message: `Closed ${result.closed} tabs permanently.`,
          warning: 'These tabs cannot be recovered.'
        }
      }
    }
  },

  restore_tab: {
    description: 'Restore a closed tab from trash',
    parameters: {
      type: 'object',
      properties: {
        trashItemId: { type: 'string', description: 'Trash item ID to restore' }
      },
      required: ['trashItemId']
    },
    execute: async (params: { trashItemId: string }) => {
      const tab = await restoreTab(params.trashItemId)
      if (!tab) {
        return { success: false, message: 'Tab not found or expired' }
      }
      return { success: true, tab, message: 'Tab restored' }
    }
  },

  list_closed_tabs: {
    description: 'List recently closed tabs in trash',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max items to show', default: 20 }
      }
    },
    execute: async (params: { limit?: number }) => {
      const items = await getTrash()
      const valid = items.filter(i => i.expiresAt > Date.now())
      const limited = valid.slice(0, params.limit || 20)
      return { items: limited, total: valid.length }
    }
  },

  restore_recent_tabs: {
    description: 'Restore multiple recently closed tabs',
    parameters: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Number of tabs to restore', default: 1 }
      }
    },
    execute: async (params: { count?: number }) => {
      const tabs = await restoreRecentTabs(params.count || 1)
      return { restored: tabs.length, message: `Restored ${tabs.length} tabs` }
    }
  },

  smart_organize_tabs: {
    description: `Intelligently organize all open tabs into groups.
Strategy 'domain': Group by domain name.
Strategy 'topic': (TODO) Use LLM to categorize by topic.
When preview=true, returns plan without executing.`,
    parameters: {
      type: 'object',
      properties: {
        strategy: {
          type: 'string',
          enum: ['domain', 'topic'],
          description: 'Organization strategy',
          default: 'domain'
        },
        preview: {
          type: 'boolean',
          description: 'Only show plan, do not execute',
          default: true
        }
      }
    },
    execute: async (params: { strategy?: 'domain' | 'topic'; preview?: boolean }) => {
      const result = await smartOrganizeTabs(params.strategy, params.preview)
      return {
        preview: params.preview !== false,
        groups: result.groups.map(g => ({
          name: g.name,
          color: g.color,
          tabCount: g.tabs.length,
          tabs: g.tabs.map(t => ({ id: t.id, title: t.title, url: t.url }))
        }))
      }
    }
  },

  archive_inactive_tabs: {
    description: `Archive tabs not accessed for a threshold period.
Creates bookmarks, groups them as "Archive" (collapsed).
When preview=true, shows plan without executing.`,
    parameters: {
      type: 'object',
      properties: {
        thresholdHours: {
          type: 'number',
          description: 'Inactivity threshold in hours',
          default: 24
        },
        preview: {
          type: 'boolean',
          description: 'Only show plan, do not execute',
          default: true
        }
      }
    },
    execute: async (params: { thresholdHours?: number; preview?: boolean }) => {
      const result = await archiveInactiveTabs(params.thresholdHours, params.preview)
      return {
        preview: params.preview !== false,
        toArchive: result.toArchive.map(t => ({ id: t.id, title: t.title, url: t.url })),
        count: result.toArchive.length,
        groupId: result.groupId
      }
    }
  }
} as const

export const TAB_AGENT_SYSTEM_PROMPT = `
## Tab Management Tools

You have access to powerful tab management tools. Follow these guidelines:

### Query Strategy
- query_tabs returns max 30 tabs by default
- Use filters to narrow results before processing
- For 100+ tabs: first call query_tabs to see total, then filter by domain/keyword
- NEVER call get_tab_content on all tabs at once

### Safety Rules
- ALWAYS use safe=true when closing tabs (default behavior)
- NEVER set safe=false unless user explicitly says "permanently close"
- Before closing >5 tabs, show the list and ask for confirmation
- For archive_inactive: always use preview=true first, show plan, then execute

### Smart Operations
- smart_organize_tabs and archive_inactive_tabs have preview mode
- Always show preview to user before executing
- Ask for confirmation before making bulk changes

### Workflow Examples
1. Organize tabs: query_tabs → smart_organize_tabs (preview=true) → confirm → execute (preview=false)
2. Close old tabs: query_tabs (filter by domain) → remove_tabs (safe=true) → confirm
3. Recover tab: list_closed_tabs → restore_tab (with specific ID)
`
