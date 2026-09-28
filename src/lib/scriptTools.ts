import { tool, jsonSchema } from 'ai'
import { z } from 'zod'
import type { TabRef } from './pageTools'
import { describeScripts, setScriptEnabled, writeScript } from './scriptStore'
import { connectMcp } from '@/agent/mcp'

export const TOOL_GROUPS = {
  core: [
    'load_skill', 'read_skill_file', 'load_tools',
    'read_page', 'eval', 'list_tabs', 'open_url', 'focus_tab', 'close_tabs',
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

interface WebmcpTool {
  name: string
  description: string
  inputSchema?: Record<string, unknown>
  permission?: string
}

async function pageWebmcp(tabId: number): Promise<WebmcpTool[]> {
  const [hit] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: async () => {
      const mc = (document as any).modelContext
      if (!mc?.getTools) return []
      const list = await mc.getTools()
      const perms = (window as any).__irisWebmcpPerms || {}
      return (Array.isArray(list) ? list : []).map((tool: any) => ({
        ...tool,
        permission: perms[tool.name] || tool.permission || 'allow',
      }))
    },
  })
  const value = hit?.result
  return Array.isArray(value) ? value : []
}

function confirmSchema(schema: Record<string, unknown> | undefined, prompt: boolean) {
  const base = schema && schema.type === 'object' ? schema : { type: 'object', properties: {} }
  if (!prompt) return base
  const properties = { ...((base.properties as object) || {}), confirmed: { type: 'boolean', description: 'Set true only after the user agrees to run this tool.' } }
  return { ...base, properties }
}

export function createScriptTools(tabRef: TabRef) {
  const tab = (id?: number) => id ?? tabRef.current
  return {
    list_scripts: tool({
      description: 'List installed userscripts and AgentScripts, including source and unsupported grants.',
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await describeScripts()
        return rows.map(row => {
          if ('error' in row) return row
          return {
            id: row.id,
            name: row.meta.name,
            kind: row.meta.kind,
            enabled: row.enabled,
            matches: row.meta.matches,
            unsupported: row.meta.unsupported,
            source: row.source,
          }
        })
      },
    }),
    write_script: tool({
      description: 'Install or update a ==UserScript== or ==AgentScript== from its full source. Registers it immediately.',
      inputSchema: z.object({
        source: z.string(),
        enabled: z.boolean().optional(),
      }),
      execute: async ({ source, enabled }) => {
        const row = await writeScript(source, enabled)
        return { id: row.id, name: row.meta.name, kind: row.meta.kind, enabled: row.enabled, unsupported: row.meta.unsupported }
      },
    }),
    toggle_script: tool({
      description: 'Enable or disable a script by id or @name.',
      inputSchema: z.object({
        id: z.string().describe('Script id or @name'),
        enabled: z.boolean(),
      }),
      execute: async ({ id, enabled }) => setScriptEnabled(id, enabled),
    }),
    reload_tab: tool({
      description: 'Reload a tab so userscripts and AgentScripts inject again. Defaults to the session tab.',
      inputSchema: z.object({ tabId: z.number().optional() }),
      execute: async ({ tabId }) => {
        const id = tab(tabId)
        await chrome.tabs.reload(id)
        return { tabId: id, reloaded: true }
      },
    }),
    read_console: tool({
      description: 'Read GM_log lines captured on a tab since it loaded.',
      inputSchema: z.object({ tabId: z.number().optional() }),
      execute: async ({ tabId }) => {
        const id = tab(tabId)
        const lines = await chrome.tabs.sendMessage(id, { type: 'iris-gm-log' }).catch((err: Error) => ({ error: err.message }))
        return { untrusted: true, lines }
      },
    }),
  }
}

export function createLoadTools(session: ToolSession, tabRef: TabRef, mcpEndpoint: string) {
  return tool({
    description: 'Enable a tool group for the rest of this chat. Groups: tabs, automation, screenshot, site (WebMCP on this tab), mcp (local ea-tools). Schemas appear on the next step.',
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
        if (session.loaded.has(group)) { already.push(group); continue }
        if (group === 'site') {
          const found = await pageWebmcp(tabRef.current).catch(() => [])
          for (const item of found) {
            if (!item?.name || session.tools[item.name]) continue
            const prompt = item.permission === 'prompt'
            session.tools[item.name] = tool({
              description: item.description || item.name,
              inputSchema: jsonSchema(confirmSchema(item.inputSchema, prompt) as any),
              execute: async (args: any) => {
                if (prompt && !args?.confirmed) {
                  const { confirmed, ...rest } = args || {}
                  return { status: 'needs_confirmation', args: rest }
                }
                const { confirmed, ...rest } = args || {}
                const [hit] = await chrome.scripting.executeScript({
                  target: { tabId: tabRef.current },
                  world: 'MAIN',
                  func: async (name: string, payload: unknown) => {
                    const mc = (document as any).modelContext
                    if (!mc?.executeTool) return { error: 'modelContext missing' }
                    return await mc.executeTool(name, payload)
                  },
                  args: [item.name, rest],
                })
                return { untrusted: true, result: hit?.result }
              },
            })
            session.extra.set(item.name, 'site')
          }
          notes.push(found.length ? `site tools: ${found.map(t => t.name).join(', ')}` : 'no WebMCP tools on this tab')
        }
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
