import { loadAllConversations } from '../agent/history'
import { getAllEntries } from '../lib/knowledge'
import { loadSettings } from '../lib/sidepanelSettings'
import { loadAllEvents } from '../lib/tracing'
import type { ChatExportPlatform } from '../lib/types'
import { RelayError, registerRelayMethod, listRelayMethods, type RelayChunk } from './relayRegistry'

interface PlatformSpec {
  id: ChatExportPlatform
  label: string
  origin: string
  match: (url: string) => boolean
}

const PLATFORMS: PlatformSpec[] = [
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    origin: 'https://chatgpt.com/',
    match: (url) => /^https?:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(url),
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    origin: 'https://chat.deepseek.com/',
    match: (url) => /^https?:\/\/chat\.deepseek\.com\//.test(url),
  },
  {
    id: 'gemini',
    label: 'Gemini',
    origin: 'https://gemini.google.com/app',
    match: (url) => /^https?:\/\/gemini\.google\.com\//.test(url),
  },
]

function requirePlatform(params: Record<string, unknown>): PlatformSpec {
  const id = params.platform
  const spec = PLATFORMS.find(p => p.id === id)
  if (!spec) throw new RelayError('invalid_params', 'platform must be chatgpt, deepseek, or gemini')
  return spec
}

function asStringList(value: unknown): string[] | undefined {
  if (value == null) return undefined
  if (!Array.isArray(value) || value.some(v => typeof v !== 'string')) {
    throw new RelayError('invalid_params', 'ids must be a list of strings')
  }
  return value
}

async function ensurePlatformTab(spec: PlatformSpec): Promise<{ tabId: number; opened: boolean }> {
  const tabs = await chrome.tabs.query({})
  const existing = tabs.find(t => t.id != null && t.url && spec.match(t.url))
  if (existing?.id != null) return { tabId: existing.id, opened: false }

  const tab = await chrome.tabs.create({ url: spec.origin, active: false })
  if (tab.id == null) throw new RelayError('platform_unavailable', 'failed to open platform tab')
  await waitForTabLoad(tab.id)
  return { tabId: tab.id, opened: true }
}

function waitForTabLoad(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener)
      resolve()
    }, 30000)

    function listener(updatedTabId: number, changeInfo: { status?: string }) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timeout)
        chrome.tabs.onUpdated.removeListener(listener)
        resolve()
      }
    }
    chrome.tabs.onUpdated.addListener(listener)

    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        clearTimeout(timeout)
        chrome.tabs.onUpdated.removeListener(listener)
        reject(new RelayError('platform_unavailable', chrome.runtime.lastError.message || 'tab disappeared'))
        return
      }
      if (tab.status === 'complete') {
        clearTimeout(timeout)
        chrome.tabs.onUpdated.removeListener(listener)
        resolve()
      }
    })
  })
}

async function callPlatformTab(tabId: number, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  let last = 'content script did not respond'
  for (let i = 0; i < 8; i++) {
    try {
      const res = await chrome.tabs.sendMessage(tabId, { type: 'iris_chat_api', ...payload }) as Record<string, unknown> | undefined
      if (res) return res
    } catch (e) {
      last = (e as Error).message || last
    }
    await new Promise(resolve => setTimeout(resolve, 400))
  }
  throw new RelayError('platform_unavailable', last)
}

function raiseChatError(error: unknown): never {
  const message = typeof error === 'string' ? error : 'chat request failed'
  if (/logged in|token|auth/i.test(message)) throw new RelayError('not_logged_in', message)
  throw new RelayError('platform_unavailable', message)
}

async function fetchOne(spec: PlatformSpec, id: string, tabId: number) {
  const res = await callPlatformTab(tabId, { platform: spec.id, op: 'fetch', id })
  if (res.ok !== true) raiseChatError(res.error)
  const conversation = res.conversation as {
    title?: string
    createTime?: number
    updatedAt?: number
    raw?: unknown
  }
  return {
    platform: spec.id,
    id,
    title: conversation?.title || 'Untitled',
    createTime: conversation?.createTime,
    updatedAt: conversation?.updatedAt,
    raw: conversation?.raw,
  }
}

registerRelayMethod('iris.capabilities', async () => ({ methods: listRelayMethods() }))

registerRelayMethod('iris.chat.platforms', async () => {
  const tabs = await chrome.tabs.query({})
  return {
    platforms: PLATFORMS.map(spec => {
      const open = tabs.find(t => t.id != null && t.url && spec.match(t.url))
      return { id: spec.id, label: spec.label, origin: spec.origin, open: !!open, tabId: open?.id }
    }),
  }
})

registerRelayMethod('iris.chat.list', async (params) => {
  const spec = requirePlatform(params)
  const tab = await ensurePlatformTab(spec)
  const res = await callPlatformTab(tab.tabId, { platform: spec.id, op: 'list' })
  if (res.ok !== true) raiseChatError(res.error)
  return { platform: spec.id, tabId: tab.tabId, opened: tab.opened, sessions: res.sessions }
})

registerRelayMethod('iris.chat.export', async (params) => {
  const spec = requirePlatform(params)
  const id = params.id
  if (typeof id !== 'string' || !id) throw new RelayError('invalid_params', 'id is required')
  const tab = await ensurePlatformTab(spec)
  return { ...(await fetchOne(spec, id, tab.tabId)), tabId: tab.tabId, opened: tab.opened }
})

registerRelayMethod('iris.chat.export_all', async (params, chunk: RelayChunk) => {
  const spec = requirePlatform(params)
  const only = asStringList(params.ids)
  const since = params.since
  if (since != null && typeof since !== 'number') throw new RelayError('invalid_params', 'since must be a unix timestamp')
  const tab = await ensurePlatformTab(spec)

  let ids = only
  if (!ids) {
    const res = await callPlatformTab(tab.tabId, { platform: spec.id, op: 'list' })
    if (res.ok !== true) raiseChatError(res.error)
    const sessions = (res.sessions as { id: string; updatedAt?: number }[]) || []
    ids = sessions
      .filter(s => since == null || s.updatedAt == null || s.updatedAt >= since)
      .map(s => s.id)
  }

  for (const id of ids) {
    chunk(await fetchOne(spec, id, tab.tabId))
  }
  return { platform: spec.id, count: ids.length, tabId: tab.tabId, opened: tab.opened }
})

registerRelayMethod('iris.knowledge.export', async () => ({ entries: await getAllEntries() }))

registerRelayMethod('iris.conversations.export', async () => loadAllConversations())

registerRelayMethod('iris.tracing.export', async () => ({ days: await loadAllEvents() }))

registerRelayMethod('iris.settings.get', async (params) => {
  const { apiKey, browserRelayToken, ...rest } = await loadSettings()
  if (params.includeSecrets === true) return { ...rest, apiKey, browserRelayToken }
  return rest
})
