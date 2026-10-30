import { describeScripts, setScriptEnabled, writeScript } from '../scriptStore'
import { bool, requireTab, schema, str, tabField, type ToolDef } from './shared'

export const scriptsToolDefs: ToolDef[] = [
  {
    name: 'list_scripts',
    group: 'scripts',
    needsTab: false,
    description: 'List installed userscripts and AgentScripts, including source and unsupported grants.',
    inputSchema: schema({}),
    async run() {
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
  },
  {
    name: 'write_script',
    group: 'scripts',
    needsTab: false,
    description: 'Install or update a ==UserScript== or ==AgentScript== from its full source. Registers it immediately.',
    inputSchema: schema({ source: str('Full script source'), enabled: bool('Enable after write. Defaults to the previous state, or true.') }, ['source']),
    async run(params) {
      if (typeof params.source !== 'string') throw new Error('source is required')
      const enabled = typeof params.enabled === 'boolean' ? params.enabled : undefined
      const row = await writeScript(params.source, enabled)
      return { id: row.id, name: row.meta.name, kind: row.meta.kind, enabled: row.enabled, unsupported: row.meta.unsupported }
    },
  },
  {
    name: 'toggle_script',
    group: 'scripts',
    needsTab: false,
    description: 'Enable or disable a script by id or @name.',
    inputSchema: schema({ id: str('Script id or @name'), enabled: bool('Whether the script should run') }, ['id', 'enabled']),
    async run(params) {
      if (typeof params.id !== 'string' || typeof params.enabled !== 'boolean') throw new Error('id and enabled are required')
      return setScriptEnabled(params.id, params.enabled)
    },
  },
  {
    name: 'reload_tab',
    group: 'scripts',
    needsTab: true,
    description: 'Reload a tab so userscripts and AgentScripts inject again.',
    inputSchema: schema({ tabId: tabField }),
    async run(params, ctx) {
      const tabId = requireTab(params, ctx)
      await chrome.tabs.reload(tabId)
      return { tabId, reloaded: true }
    },
  },
  {
    name: 'read_console',
    group: 'scripts',
    needsTab: true,
    description: 'Read GM_log lines captured on a tab since it loaded, including thrown script errors. Empty means the script never ran — check that it is enabled and matches the URL.',
    inputSchema: schema({ tabId: tabField }),
    async run(params, ctx) {
      const tabId = requireTab(params, ctx)
      const res = await chrome.tabs.sendMessage(tabId, { type: 'iris-gm-log' }).catch((err: Error) => ({ error: err.message }))
      if (res && typeof res === 'object' && 'error' in res) return { untrusted: true, tabId, error: (res as { error: string }).error }
      const lines = Array.isArray((res as { lines?: unknown })?.lines) ? (res as { lines: unknown[] }).lines : []
      return { untrusted: true, tabId, lines }
    },
  },
]
