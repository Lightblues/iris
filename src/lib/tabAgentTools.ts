import { z } from 'zod'
import { tool } from 'ai'
import type { TabAgentMessage, TabAgentResponse } from './types'

// Helper to call tab agent via background script
async function callTabAgent(action: string, params: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const message: TabAgentMessage = { type: 'tab_agent_action', action, params }
    chrome.runtime.sendMessage(message, (response: TabAgentResponse) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }
      if (response?.success) {
        resolve(response.data)
      } else {
        reject(new Error(response?.error || 'Action failed'))
      }
    })
  })
}

// Tab Tools in AI SDK tool format
export const tabAgentTools = {
  query_tabs: tool({
    description: 'Query open browser tabs with filtering and pagination. Use this to see what tabs are currently open.',
    inputSchema: z.object({
      keyword: z.string().optional().describe('Search keyword to filter tabs by title or URL'),
      domain: z.string().optional().describe('Filter tabs by domain (e.g., "github.com")'),
      limit: z.number().optional().default(30).describe('Maximum number of tabs to return'),
      sort: z.enum(['recent', 'domain', 'title']).optional().default('recent').describe('Sort order')
    }),
    execute: async ({ keyword, domain, limit, sort }) => {
      const filter: any = {}
      if (keyword) filter.keyword = keyword
      if (domain) filter.domain = domain

      const result = await callTabAgent('query_tabs', {
        filter,
        limit,
        sort
      })

      return {
        tabs: result.tabs.map((t: any) => ({
          id: t.id,
          title: t.title,
          domain: t.domain,
          groupName: t.groupName,
          pinned: t.pinned,
          active: t.active
        })),
        total: result.total
      }
    }
  }),

  create_tab_group: tool({
    description: 'Create a new tab group with specified tabs. Use this to organize tabs into named groups.',
    inputSchema: z.object({
      tabIds: z.array(z.number()).describe('Array of tab IDs to group together'),
      title: z.string().describe('Name for the tab group'),
      color: z.enum(['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'])
        .optional()
        .default('blue')
        .describe('Color for the tab group')
    }),
    execute: async ({ tabIds, title, color }) => {
      const result = await callTabAgent('create_tab_group', { tabIds, title, color })
      return { groupId: result.groupId, message: result.message }
    }
  }),

  close_tabs: tool({
    description: 'Close specified tabs. Tabs are safely saved to trash for 7-day recovery by default.',
    inputSchema: z.object({
      tabIds: z.array(z.number()).describe('Array of tab IDs to close'),
      safe: z.boolean().optional().default(true).describe('Save to trash for recovery (default: true)')
    }),
    execute: async ({ tabIds, safe }) => {
      const result = await callTabAgent('remove_tabs', { tabIds, safe })
      return {
        closed: result.closed,
        message: safe !== false
          ? `Closed ${result.closed} tabs (saved to trash for 7 days)`
          : `Closed ${result.closed} tabs permanently`
      }
    }
  }),

  smart_organize: tool({
    description: 'Intelligently organize all open tabs by grouping them. Use domain strategy to group by website.',
    inputSchema: z.object({
      strategy: z.enum(['domain']).optional().default('domain').describe('Organization strategy'),
      preview: z.boolean().optional().default(false).describe('Preview mode - show plan without executing')
    }),
    execute: async ({ strategy, preview }) => {
      const result = await callTabAgent('smart_organize_tabs', { strategy, preview })
      if (preview) {
        return {
          preview: true,
          groups: result.groups.map((g: any) => ({
            name: g.name,
            color: g.color,
            tabCount: g.tabCount
          }))
        }
      }
      return {
        executed: true,
        groupsCreated: result.groups.length,
        message: `Created ${result.groups.length} tab groups`
      }
    }
  }),

  archive_inactive: tool({
    description: 'Archive tabs that haven\'t been accessed for a specified time. Tabs are bookmarked and grouped.',
    inputSchema: z.object({
      thresholdHours: z.number().optional().default(24).describe('Inactivity threshold in hours'),
      preview: z.boolean().optional().default(false).describe('Preview mode - show plan without executing')
    }),
    execute: async ({ thresholdHours, preview }) => {
      const result = await callTabAgent('archive_inactive_tabs', { thresholdHours, preview })
      if (preview) {
        return {
          preview: true,
          toArchive: result.count,
          tabs: result.toArchive.map((t: any) => ({ id: t.id, title: t.title }))
        }
      }
      return {
        executed: true,
        archived: result.count,
        message: `Archived ${result.count} inactive tabs`
      }
    }
  }),

  list_closed_tabs: tool({
    description: 'List recently closed tabs from trash. These can be restored within 7 days.',
    inputSchema: z.object({
      limit: z.number().optional().default(20).describe('Maximum number of items to return')
    }),
    execute: async ({ limit }) => {
      const result = await callTabAgent('list_closed_tabs', { limit })
      return {
        items: result.items.map((item: any) => ({
          id: item.id,
          title: item.title,
          url: item.url,
          closedAt: new Date(item.closedAt).toISOString()
        })),
        total: result.total
      }
    }
  }),

  restore_tab: tool({
    description: 'Restore a closed tab from trash by its ID.',
    inputSchema: z.object({
      trashItemId: z.string().describe('Trash item ID to restore')
    }),
    execute: async ({ trashItemId }) => {
      const result = await callTabAgent('restore_tab', { trashItemId })
      return { success: result.success, message: result.message || 'Tab restored' }
    }
  })
}

export const TAB_AGENT_SYSTEM_PROMPT = `You are a Tab Management Agent. You help users manage their browser tabs efficiently.

## Available Tools

You have access to these tools to manage tabs:
- query_tabs: See what tabs are currently open
- create_tab_group: Organize tabs into named groups
- close_tabs: Close tabs (safely saved to trash)
- smart_organize: Auto-organize tabs by domain
- archive_inactive: Archive old unused tabs
- list_closed_tabs: See recently closed tabs
- restore_tab: Restore a closed tab

## Guidelines

1. **Always query first**: Before closing or organizing, use query_tabs to see current state
2. **Preview mode**: For bulk operations (organize/archive), use preview=true first to show the plan
3. **Ask for confirmation**: After showing preview, ask user if they want to proceed
4. **Be helpful**: Explain what you're doing and why
5. **Safe defaults**: Always use safe=true when closing tabs (default)

## Example Workflow

User: "Close all tabs from github.com"
1. query_tabs with domain="github.com"
2. Show user the found tabs
3. Ask "Found 5 GitHub tabs. Should I close them?"
4. If confirmed: close_tabs with those IDs

User: "Organize my tabs"
1. smart_organize with preview=true
2. Show the proposed groups
3. Ask "Should I create these groups?"
4. If confirmed: smart_organize with preview=false
`
