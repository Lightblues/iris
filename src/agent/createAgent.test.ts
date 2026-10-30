import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createAgent } from './createAgent.ts'
import { listAgentTools } from '../lib/agentToolCatalog.ts'
import type { SidePanelSettings } from '../lib/sidepanelSettings.ts'

const store: Record<string, unknown> = {}
;(globalThis as any).chrome = {
  runtime: { getURL: () => 'chrome-extension://test/' },
  storage: {
    local: {
      async get(key: string) { return key in store ? { [key]: structuredClone(store[key]) } : {} },
      async set(items: Record<string, unknown>) { Object.assign(store, structuredClone(items)) },
    },
  },
}

const settings = {
  apiKey: 'test',
  baseUrl: 'https://example.invalid/v1',
  model: 'test-model',
  models: [],
  favouriteModels: [],
  usePageContext: false,
} satisfies SidePanelSettings

test('createAgent attaches the catalog with no activeTools filter', async () => {
  const { agent } = await createAgent(
    { id: 'general', name: 'Iris', systemPrompt: '' },
    settings,
  )
  const tools = agent.tools as Record<string, unknown>
  const expected = new Set(listAgentTools().map(tool => tool.name))
  assert.deepEqual(new Set(Object.keys(tools)), expected)
  for (const name of ['list_reports', 'create_tab_group', 'click']) {
    assert.ok(name in tools, name)
  }
  const built = (agent as { settings: { prepareStep?: unknown; activeTools?: unknown } }).settings
  assert.equal(built.prepareStep, undefined)
  assert.equal(built.activeTools, undefined)
})
