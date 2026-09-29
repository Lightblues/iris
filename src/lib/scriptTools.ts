import { tool, jsonSchema } from 'ai'
import { z } from 'zod'
import type { TabRef } from './pageTools'
import { connectMcp } from '@/agent/mcp'
import { executePageWebmcp, listPageWebmcp } from './agentToolCatalog'

export const TOOL_GROUPS = {
  core: [
    'list_skills', 'load_skill', 'read_skill_file', 'read_skill_history', 'write_skill', 'patch_skill', 'delete_skill', 'toggle_skill', 'load_tools',
    'read_page', 'eval', 'take_screenshot', 'list_tabs', 'open_url', 'focus_tab', 'close_tabs',
    'list_scripts', 'write_script', 'toggle_script', 'reload_tab', 'read_console',
  ],
  tabs: ['query_tabs', 'create_tab_group', 'smart_organize', 'archive_inactive', 'list_closed_tabs', 'restore_tab'],
  automation: ['get_tab_info', 'navigate', 'page_snapshot', 'click', 'type_text', 'extract_data', 'wait_for', 'scroll', 'evaluate_js'],
  screenshot: ['take_screenshot'],
} as const

const LAZY = ['tabs', 'automation', 'screenshot', 'site', 'mcp'] as const
type LazyGroup = typeof LAZY[number]

export interface ToolSession {
  tools: Record<string, any>
  loaded: Set<string>
  extra: Map<string, string>
  active(): string[]
}

export function createToolSession(tools: Record<string, any>): ToolSession {
  const loaded = new Set<string>(['core'])
  const extra = new Map<string, string>()
  return {
    tools,
    loaded,
    extra,
    active() {
      const names = new Set<string>(TOOL_GROUPS.core)
      for (const group of loaded) {
        const known = TOOL_GROUPS[group as keyof typeof TOOL_GROUPS]
        if (known) known.forEach(n => names.add(n))
      }
      for (const [name, group] of extra) {
        if (loaded.has(group)) names.add(name)
      }
      return [...names].filter(n => n in tools)
    },
  }
}

export function createLoadTools(session: ToolSession, tabRef: TabRef, mcpEndpoint: string) {
  return tool({
    description: 'Enable a tool group for the rest of this chat. Groups: tabs, automation, screenshot, site (WebMCP on this tab), mcp (local ea-tools). Schemas appear on the next step. Calling site again re-reads the tab.',
    inputSchema: z.object({
      groups: z.array(z.string()).describe('Group names to load'),
    }),
    execute: async ({ groups }) => {
      const unknown = groups.filter(g => !LAZY.includes(g as LazyGroup))
      const loaded: string[] = []
      const already: string[] = []
      const notes: string[] = []
      for (const group of groups) {
        if (!LAZY.includes(group as LazyGroup)) continue
        if (group === 'site') {
          try {
            const found = await listPageWebmcp(tabRef.current)
            for (const [name, g] of [...session.extra]) {
              if (g !== 'site') continue
              delete session.tools[name]
              session.extra.delete(name)
            }
            const skipped: string[] = []
            for (const item of found) {
              if (!item?.name) continue
              if (session.tools[item.name]) { skipped.push(item.name); continue }
              const prompt = item.permission === 'prompt'
              try {
                session.tools[item.name] = tool({
                  description: item.description || item.name,
                  inputSchema: jsonSchema(item.inputSchema as any),
                  execute: async (args: any) => executePageWebmcp(tabRef.current, item.name, args || {}, prompt),
                })
                session.extra.set(item.name, 'site')
              } catch (err) {
                skipped.push(`${item.name} (${(err as Error).message})`)
              }
            }
            const names = found.map(t => t.name).filter(Boolean)
            let note = names.length ? `site tools: ${names.join(', ')}` : 'no WebMCP tools on this tab'
            if (skipped.length) note += ` (name taken: ${skipped.join(', ')})`
            notes.push(note)
          } catch (err) {
            notes.push(`site tools failed: ${(err as Error).message}`)
          }
          session.loaded.add(group)
          loaded.push(group)
          continue
        }
        if (session.loaded.has(group)) { already.push(group); continue }
        if (group === 'mcp') {
          try {
            const mcpTools = await connectMcp(mcpEndpoint)
            const names: string[] = []
            for (const [name, mcpTool] of Object.entries(mcpTools)) {
              if (session.tools[name]) continue
              session.tools[name] = mcpTool
              session.extra.set(name, 'mcp')
              names.push(name)
            }
            notes.push(names.length ? `mcp tools: ${names.join(', ')}` : 'mcp connected with no new tools')
          } catch (err) {
            notes.push(`mcp failed: ${(err as Error).message}`)
            continue
          }
        }
        session.loaded.add(group)
        loaded.push(group)
      }
      return {
        loaded,
        alreadyActive: already,
        unknown,
        available: [...LAZY],
        notes,
        message: 'Newly loaded tools are callable on the next step.',
      }
    },
  })
}
