// Browser Relay — WS client for ea-tools `browser_*` tools.
// Chrome extensions cannot listen on a port, so Iris connects out to the
// localhost relay (default :33007). Request-response only; no agent loop.

import { loadSettings, SETTINGS_KEY, type SidePanelSettings } from '../lib/sidepanelSettings'
import { callRelayMethod, listRelayMethods, registerRelayMethod, RelayError, type RelayHandler } from './relayRegistry'
import './relayIris'

const DEFAULT_PORT = 33007
const DEFAULT_TOKEN = 'ea-browser-relay-local'
const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30000
const PAGE_LOAD_TIMEOUT_MS = 30000
const KEEPALIVE_PORT = 'iris-relay-keepalive'
const ALARM_NAME = 'browser-relay-keepalive'

export type ExtractMode = 'text' | 'html' | 'markdown'

export interface RelayState {
  enabled: boolean
  connected: boolean
  port: number
}

export interface PageExtract {
  title: string
  url: string
  content: string
}

const relayTabIds = new Set<number>()

export function isRelayTab(tabId: number): boolean {
  return relayTabIds.has(tabId)
}

export function getRelayState(): RelayState {
  return { enabled, connected: isSocketOpen(), port: currentPort }
}

let ws: WebSocket | null = null
let enabled = true
let currentPort = DEFAULT_PORT
let currentToken = DEFAULT_TOKEN
let reconnectDelay = RECONNECT_BASE_MS
let connectLock = false
let reconnectQueued = false
let lastPongTime = Date.now()
let baseHold = false

function isSocketOpen(): boolean {
  return ws?.readyState === WebSocket.OPEN
}

function relayConfig(settings: SidePanelSettings): { enabled: boolean; port: number; token: string } {
  return {
    enabled: settings.browserRelayEnabled !== false,
    port: settings.browserRelayPort || DEFAULT_PORT,
    token: settings.browserRelayToken || DEFAULT_TOKEN,
  }
}

function send(msg: Record<string, unknown>): void {
  if (isSocketOpen()) ws!.send(JSON.stringify(msg))
}

const RECONNECT_ALARM = 'browser-relay-reconnect'

function scheduleReconnect(): void {
  if (!enabled) return
  reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS)
  chrome.alarms.create(RECONNECT_ALARM, { when: Date.now() + reconnectDelay })
}

function closeSocket(): void {
  chrome.alarms.clear(RECONNECT_ALARM)
  if (ws) {
    ws.onclose = null
    try { ws.close() } catch { /* already closed */ }
    ws = null
  }
}

async function connect(): Promise<void> {
  if (!enabled) return
  if (connectLock) {
    reconnectQueued = true
    return
  }
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return

  if (ws) {
    try { ws.close() } catch { /* ignore */ }
    ws = null
  }

  connectLock = true
  const url = `ws://127.0.0.1:${currentPort}/extension?token=${encodeURIComponent(currentToken)}`

  try {
    const socket = new WebSocket(url)
    ws = socket
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('connect timeout')), 5000)
      socket.onopen = () => { clearTimeout(timeout); resolve() }
      socket.onerror = () => { clearTimeout(timeout); reject(new Error('connect error')) }
      socket.onclose = (e) => { clearTimeout(timeout); reject(new Error(`closed: ${e.code}`)) }
    })

    console.log('[Iris relay] connected', currentPort)
    reconnectDelay = RECONNECT_BASE_MS
    lastPongTime = Date.now()
    chrome.alarms.clear(RECONNECT_ALARM)

    socket.onmessage = (event) => { void handleMessage(String(event.data)) }
    socket.onclose = (event) => {
      console.log('[Iris relay] disconnected:', event.code, event.reason)
      if (ws === socket) ws = null
      scheduleReconnect()
    }
    socket.onerror = () => console.error('[Iris relay] ws error')
    send({ v: 1, method: 'hello', params: { methods: listRelayMethods() } })
  } catch (e) {
    console.error('[Iris relay] connect failed:', (e as Error).message)
    if (ws && ws.readyState !== WebSocket.OPEN) ws = null
    if (enabled && !reconnectQueued) scheduleReconnect()
  } finally {
    connectLock = false
    if (reconnectQueued) {
      reconnectQueued = false
      void connect()
    }
  }
}

function forceReconnect(): void {
  closeSocket()
  if (connectLock) {
    reconnectQueued = true
    return
  }
  void connect()
}

export function reconnectRelay(): RelayState {
  if (enabled) forceReconnect()
  return getRelayState()
}

function disconnect(): void {
  closeSocket()
}

async function handleMessage(raw: string): Promise<void> {
  let msg: { v?: number; action?: string; method?: string; id?: number; params?: Record<string, unknown> }
  try {
    msg = JSON.parse(raw)
  } catch {
    console.error('[Iris relay] invalid JSON:', raw)
    return
  }

  if (msg.action === 'ping' || msg.method === 'ping') {
    send({ action: 'pong' })
    return
  }
  if (msg.action === 'pong' || msg.method === 'pong') {
    lastPongTime = Date.now()
    return
  }
  if (msg.id == null) {
    console.warn('[Iris relay] unknown message:', msg)
    return
  }

  const name = msg.method || msg.action
  const modern = typeof msg.method === 'string' || (!!name && name.includes('.'))
  let streamed = false
  const chunk = (result: unknown) => {
    streamed = true
    send(modern
      ? { v: 1, id: msg.id, event: 'chunk', result }
      : { id: msg.id, event: 'chunk', result })
  }

  try {
    const result = await callRelayMethod(name, msg.params || {}, chunk)
    if (!modern) {
      send({ id: msg.id, result })
      return
    }
    send(streamed
      ? { v: 1, id: msg.id, event: 'end', result }
      : { v: 1, id: msg.id, result })
  } catch (e) {
    if (!modern) {
      const message = e instanceof RelayError && e.code === 'method_not_found'
        ? `unknown action: ${name}`
        : (e as Error).message || String(e)
      send({ id: msg.id, error: message })
      return
    }
    const code = e instanceof RelayError ? e.code : 'internal'
    send({ v: 1, id: msg.id, error: { code, message: (e as Error).message || String(e) } })
  }
}

function registerBrowserMethods(): void {
  const fetch: RelayHandler = (params) => fetchPage(params as { url?: string; wait?: number; extract?: ExtractMode })
  const list: RelayHandler = () => listTabs()
  const content: RelayHandler = (params) => getTabContent(params as { tabId?: number; extract?: ExtractMode })
  const close: RelayHandler = async (params) => {
    await closeTab(params as { tabId?: number })
    return { success: true }
  }
  const activate: RelayHandler = async (params) => {
    await activateTab(params as { tabId?: number })
    return { success: true }
  }
  registerRelayMethod('fetch', fetch)
  registerRelayMethod('list_tabs', list)
  registerRelayMethod('get_tab_content', content)
  registerRelayMethod('close_tab', close)
  registerRelayMethod('activate_tab', activate)
  registerRelayMethod('browser.fetch', fetch)
  registerRelayMethod('browser.list_tabs', list)
  registerRelayMethod('browser.get_tab_content', content)
  registerRelayMethod('browser.close_tab', close)
  registerRelayMethod('browser.activate_tab', activate)
}

registerBrowserMethods()

async function fetchPage({ url, wait = 3, extract = 'text' }: {
  url?: string
  wait?: number
  extract?: ExtractMode
}): Promise<PageExtract> {
  if (!url) throw new Error('url is required')
  console.log('[Iris relay] fetchPage:', url, { wait, extract })
  acquireKeepalive()

  let previousTabId: number | null = null
  let tabId: number | undefined
  try {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
      previousTabId = activeTab?.id ?? null
    } catch { /* no window */ }

    // Foreground tab: background tabs are JS-throttled and SPAs won't render.
    const tab = await chrome.tabs.create({ url, active: true })
    if (tab.id == null) throw new Error('failed to create tab')
    tabId = tab.id
    relayTabIds.add(tabId)

    await waitForTabLoad(tabId)

    const minWaitMs = Math.max(wait * 1000, 1000)
    const maxWaitMs = Math.max(wait * 1000, 3000) + 10000
    const startTime = Date.now()
    let lastLength = 0
    let stableCount = 0

    while (Date.now() - startTime < maxWaitMs) {
      await sleep(500)
      try {
        const probe = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => (document.body ? document.body.innerText.length : 0),
        })
        const curLength = probe?.[0]?.result || 0
        if (curLength > 200 && curLength === lastLength) {
          stableCount++
          if (stableCount >= 3 && Date.now() - startTime >= minWaitMs) break
        } else {
          stableCount = 0
        }
        lastLength = curLength
      } catch { /* navigating */ }
    }

    if (previousTabId) {
      try { await chrome.tabs.update(previousTabId, { active: true }) } catch { /* gone */ }
    }

    return await extractFromTab(tabId, extract)
  } finally {
    releaseKeepalive()
    if (previousTabId) {
      try { await chrome.tabs.update(previousTabId, { active: true }) } catch { /* gone */ }
    }
    if (tabId != null) {
      try { await chrome.tabs.remove(tabId) } catch { /* already closed */ }
      relayTabIds.delete(tabId)
    }
  }
}

function waitForTabLoad(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener)
      resolve()
    }, PAGE_LOAD_TIMEOUT_MS)

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
        reject(new Error(chrome.runtime.lastError.message))
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

// Injected into the page — must stay self-contained (executeScript serializes toString).
function extractContent(extract: ExtractMode): PageExtract {
  const title = document.title || ''
  const url = document.location.href
  let content: string
  if (extract === 'html') {
    content = document.documentElement.outerHTML
  } else if (extract === 'markdown') {
    content = walk(document.body)
  } else {
    content = document.body ? document.body.innerText : ''
  }
  return { title, url, content }

  function walk(el: Element | null): string {
    if (!el) return ''
    const parts: string[] = []
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim()
        if (text) parts.push(text)
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const child = node as Element
        const tag = child.tagName.toLowerCase()
        if (['script', 'style', 'noscript', 'svg'].includes(tag)) continue
        if (/^h[1-6]$/.test(tag)) {
          const text = (child as HTMLElement).innerText.trim()
          if (text) parts.push('\n' + '#'.repeat(Number(tag[1])) + ' ' + text + '\n')
        } else if (tag === 'p') {
          const text = (child as HTMLElement).innerText.trim()
          if (text) parts.push('\n' + text + '\n')
        } else if (tag === 'a') {
          const text = (child as HTMLElement).innerText.trim()
          const href = child.getAttribute('href')
          if (text && href) parts.push(`[${text}](${href})`)
          else if (text) parts.push(text)
        } else if (tag === 'img') {
          const alt = child.getAttribute('alt') || ''
          const src = child.getAttribute('src') || ''
          if (src) parts.push(`![${alt}](${src})`)
        } else if (tag === 'li') {
          const text = (child as HTMLElement).innerText.trim()
          if (text) parts.push('- ' + text)
        } else if (tag === 'br') {
          parts.push('\n')
        } else if (tag === 'pre' || tag === 'code') {
          const text = (child as HTMLElement).innerText
          if (text) parts.push('\n```\n' + text + '\n```\n')
        } else {
          parts.push(walk(child))
        }
      }
    }
    return parts.join('\n')
  }
}

async function extractFromTab(tabId: number, extract: ExtractMode): Promise<PageExtract> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: extractContent,
    args: [extract],
  })
  const first = results?.[0] as { result?: PageExtract; error?: { message?: string } } | undefined
  if (!first) throw new Error('Script execution returned no results')
  if (first.error) throw new Error(first.error.message || 'Script execution error')
  if (!first.result) throw new Error('Script execution returned empty result')
  return first.result
}

async function listTabs() {
  const tabs = await chrome.tabs.query({})
  return tabs.map((t) => ({
    id: t.id,
    title: t.title || '',
    url: t.url || '',
    active: t.active,
    windowId: t.windowId,
    pinned: t.pinned,
  }))
}

async function getTabContent({ tabId, extract = 'text' }: { tabId?: number; extract?: ExtractMode }): Promise<PageExtract> {
  if (tabId == null) throw new Error('tabId is required')
  acquireKeepalive()
  try {
    return await extractFromTab(tabId, extract)
  } finally {
    releaseKeepalive()
  }
}

async function closeTab({ tabId }: { tabId?: number }): Promise<void> {
  if (tabId == null) throw new Error('tabId is required')
  await chrome.tabs.remove(tabId)
}

async function activateTab({ tabId }: { tabId?: number }): Promise<void> {
  if (tabId == null) throw new Error('tabId is required')
  const tab = await chrome.tabs.get(tabId)
  await chrome.tabs.update(tabId, { active: true })
  if (tab.windowId != null) await chrome.windows.update(tab.windowId, { focused: true })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// MV3: an open runtime port counts as "SW is communicating" and delays teardown.
// setInterval / setTimeout alone do not extend SW lifetime.
let keepalivePort: chrome.runtime.Port | null = null
let keepaliveInterval: ReturnType<typeof setInterval> | null = null
let keepaliveRefCount = 0

function tryConnectPort(): chrome.runtime.Port | null {
  try {
    const port = chrome.runtime.connect({ name: KEEPALIVE_PORT })
    port.onDisconnect.addListener(() => {
      if (keepalivePort === port) keepalivePort = null
    })
    return port
  } catch {
    return null
  }
}

function acquireKeepalive(): void {
  keepaliveRefCount++
  if (!keepalivePort) keepalivePort = tryConnectPort()
  if (keepaliveInterval) return
  keepaliveInterval = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => {})
    if (!keepalivePort && keepaliveRefCount > 0) keepalivePort = tryConnectPort()
  }, 5000)
}

function releaseKeepalive(): void {
  keepaliveRefCount = Math.max(0, keepaliveRefCount - 1)
  if (keepaliveRefCount > 0) return
  if (keepalivePort) {
    try { keepalivePort.disconnect() } catch { /* ignore */ }
    keepalivePort = null
  }
  if (keepaliveInterval) {
    clearInterval(keepaliveInterval)
    keepaliveInterval = null
  }
}

function ensureBaseKeepalive(): void {
  if (baseHold) return
  baseHold = true
  acquireKeepalive()
}

function dropBaseKeepalive(): void {
  if (!baseHold) return
  baseHold = false
  releaseKeepalive()
}

function applySettings(settings: SidePanelSettings): void {
  const next = relayConfig(settings)
  const changed = next.enabled !== enabled || next.port !== currentPort || next.token !== currentToken
  enabled = next.enabled
  currentPort = next.port
  currentToken = next.token
  if (!enabled) {
    disconnect()
    dropBaseKeepalive()
    return
  }
  ensureBaseKeepalive()
  if (changed || !isSocketOpen()) forceReconnect()
}

export function initBrowserRelay(): void {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === KEEPALIVE_PORT) return
  })

  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 0.5 })
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === RECONNECT_ALARM) {
      if (enabled && !isSocketOpen()) void connect()
      return
    }
    if (alarm.name !== ALARM_NAME) return
    if (!enabled) return
    if (!isSocketOpen()) {
      void connect()
      return
    }
    if (Date.now() - lastPongTime > 60000) {
      console.warn('[Iris relay] no pong for >60s, forcing reconnect')
      forceReconnect()
      return
    }
    send({ action: 'ping' })
  })

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[SETTINGS_KEY]) return
    const next = changes[SETTINGS_KEY].newValue as SidePanelSettings | undefined
    if (next) applySettings(next)
  })

  // Connect on this tick with defaults so a hung storage.sync read cannot
  // eat the SW lifetime. Settings, if different, reconnect via applySettings.
  ensureBaseKeepalive()
  void connect()
  void loadSettings().then(applySettings)
}
