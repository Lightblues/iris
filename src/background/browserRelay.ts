// Browser Relay — WS client for ea-tools `browser_*` tools.
// Chrome extensions cannot listen on a port, so Iris connects out to the
// localhost relay (default :33007). Request-response only; no agent loop.

import { loadSettings, SETTINGS_KEY, type SidePanelSettings } from '../lib/sidepanelSettings'
import { callRelayMethod, listRelayMethods, RelayError } from './relayRegistry'
import { registerBrowserMethods } from './browserMethods'
import { acquireKeepalive, KEEPALIVE_PORT, releaseKeepalive } from './relayKeepalive'
import './relayIris'
import './relayAgentTools'

export { isRelayTab, type ExtractMode, type PageExtract } from './browserMethods'

export interface RelayState {
  enabled: boolean
  connected: boolean
  port: number
}

const DEFAULT_PORT = 33007
const DEFAULT_TOKEN = 'ea-browser-relay-local'
const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30000
const ALARM_NAME = 'browser-relay-keepalive'

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

export interface RelayFrame {
  v?: number
  action?: string
  method?: string
  id?: number
  params?: Record<string, unknown>
}

async function handleMessage(raw: string): Promise<void> {
  let msg: RelayFrame
  try {
    msg = JSON.parse(raw) as RelayFrame
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
  await answerRelayRequest(msg, send)
}

export async function answerRelayRequest(msg: RelayFrame, emit: (frame: Record<string, unknown>) => void): Promise<void> {
  if (msg.id == null) return
  const name = msg.method || msg.action
  const modern = typeof msg.method === 'string' || (!!name && name.includes('.'))
  let streamed = false
  const chunk = (result: unknown) => {
    streamed = true
    emit(modern
      ? { v: 1, id: msg.id, event: 'chunk', result }
      : { id: msg.id, event: 'chunk', result })
  }

  try {
    const result = await callRelayMethod(name, msg.params || {}, chunk)
    if (!modern) {
      emit({ id: msg.id, result })
      return
    }
    emit(streamed
      ? { v: 1, id: msg.id, event: 'end', result }
      : { v: 1, id: msg.id, result })
  } catch (e) {
    if (!modern) {
      const message = e instanceof RelayError && e.code === 'method_not_found'
        ? `unknown action: ${name}`
        : (e as Error).message || String(e)
      emit({ id: msg.id, error: message })
      return
    }
    const code = e instanceof RelayError ? e.code : 'internal'
    const error: Record<string, unknown> = { code, message: (e as Error).message || String(e) }
    if (e instanceof RelayError && e.schema) error.schema = e.schema
    if (e instanceof RelayError && e.methods) error.methods = e.methods
    emit({ v: 1, id: msg.id, error })
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

registerBrowserMethods()
