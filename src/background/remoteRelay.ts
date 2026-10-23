// Outbound socket to the Iris server. The localhost ea-tools relay stays separate.
// Chrome cannot listen, so this browser dials out. Relay calls and record sync
// share the socket. It is off until Settings turns it on.

import { relayAllows, type RelayLevel } from '../lib/relayLevel'
import { syncUserScripts } from '../lib/scriptRuntime'
import { loadSettings, SETTINGS_KEY, type SidePanelSettings } from '../lib/sidepanelSettings'
import { remoteExtensionUrl } from '../lib/remoteRelayUrl'
import { createSync, defaultCollections, type PushRecord, type PushResult, type ServerRecord } from '../lib/sync'
import { answerRelayRequest, type RelayFrame } from './browserRelay'
import { listRelayMethods } from './relayRegistry'

const DEVICE_KEY = 'iris_remote_device_id'
const KEEPALIVE_PORT = 'iris-remote-relay-keepalive'
const ALARM_NAME = 'remote-relay-keepalive'
const RECONNECT_ALARM = 'remote-relay-reconnect'
const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30000
const SYNC_DEBOUNCE_MS = 2000

export interface RemoteRelayState {
  enabled: boolean
  connected: boolean
  url: string
  deviceId: string
  label: string
  level: RelayLevel
  syncError: string | null
  lastSync: number | null
}

let ws: WebSocket | null = null
let enabled = false
let authed = false
let currentUrl = ''
let currentToken = ''
let currentLabel = ''
let currentLevel: RelayLevel = 'read'
let syncError: string | null = null
let lastSync: number | null = null
let syncTimer: ReturnType<typeof setTimeout> | null = null
let sync: ReturnType<typeof createSync> | null = null
let reconnectDelay = RECONNECT_BASE_MS
let connectLock = false
let reconnectQueued = false
let lastPongTime = Date.now()
let keepalivePort: chrome.runtime.Port | null = null
let nextId = -1
const waiters = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()

function isSocketOpen(): boolean {
  return ws?.readyState === WebSocket.OPEN
}

function send(msg: Record<string, unknown>): void {
  if (isSocketOpen()) ws!.send(JSON.stringify(msg))
}

export async function getDeviceId(): Promise<string> {
  const bag = await chrome.storage.local.get(DEVICE_KEY)
  const existing = bag[DEVICE_KEY]
  if (typeof existing === 'string' && existing) return existing
  const id = crypto.randomUUID()
  await chrome.storage.local.set({ [DEVICE_KEY]: id })
  return id
}

export async function getRemoteRelayState(): Promise<RemoteRelayState> {
  return {
    enabled,
    connected: isSocketOpen() && authed,
    url: currentUrl,
    deviceId: await getDeviceId(),
    label: currentLabel,
    level: currentLevel,
    syncError,
    lastSync,
  }
}

export function reconnectRemoteRelay(): void {
  if (enabled) forceReconnect()
}

function scheduleReconnect(): void {
  if (!enabled) return
  reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS)
  chrome.alarms.create(RECONNECT_ALARM, { when: Date.now() + reconnectDelay })
}

function rejectWaiters(error: Error): void {
  for (const waiter of waiters.values()) waiter.reject(error)
  waiters.clear()
}

function closeSocket(): void {
  chrome.alarms.clear(RECONNECT_ALARM)
  authed = false
  if (ws) {
    ws.onclose = null
    try { ws.close() } catch { /* already closed */ }
    ws = null
  }
  rejectWaiters(new Error('disconnected'))
}

function forceReconnect(): void {
  closeSocket()
  if (connectLock) {
    reconnectQueued = true
    return
  }
  void connect()
}

function disconnect(): void {
  closeSocket()
  if (keepalivePort) {
    try { keepalivePort.disconnect() } catch { /* ignore */ }
    keepalivePort = null
  }
}

function ensureKeepalive(): void {
  if (keepalivePort) return
  try { keepalivePort = chrome.runtime.connect({ name: KEEPALIVE_PORT }) } catch { /* SW starting */ }
}

function request<T>(method: string, params: unknown): Promise<T> {
  const id = nextId--
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!waiters.has(id)) return
      waiters.delete(id)
      reject(new Error(`${method} timed out`))
    }, 60_000)
    waiters.set(id, {
      resolve: value => { clearTimeout(timer); resolve(value as T) },
      reject: error => { clearTimeout(timer); reject(error) },
    })
    send({ v: 1, id, method, params })
  })
}

const storage = {
  get: (keys: string[]) => chrome.storage.local.get(keys) as Promise<Record<string, unknown>>,
  set: (items: Record<string, unknown>) => chrome.storage.local.set(items),
}

function syncFor(url: string) {
  if (sync && syncServer === url) return sync
  syncServer = url
  sync = createSync({
    storage,
    server: url,
    collections: defaultCollections(SETTINGS_KEY, async () => { await syncUserScripts() }),
    transport: {
      push: async (records: PushRecord[]) => (await request<{ results: PushResult[] }>('sync.push', { records })).results,
      pull: (since: number) => request<{ records: ServerRecord[]; cursor: number; more: boolean }>('sync.pull', { since }),
    },
  })
  return sync
}
let syncServer = ''

async function runSync(): Promise<void> {
  if (!authed || !isSocketOpen()) return
  const engine = syncFor(currentUrl)
  try {
    await engine.run()
    const errors = engine.errors()
    syncError = errors.length ? errors.join('; ') : null
    lastSync = Date.now()
  } catch (error) {
    syncError = (error as Error).message
    console.warn('[Iris remote relay] sync failed:', syncError)
  }
}

function queueSync(): void {
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    syncTimer = null
    void runSync()
  }, SYNC_DEBOUNCE_MS)
}

async function onFrame(raw: string): Promise<void> {
  let msg: RelayFrame & { result?: unknown; error?: { message?: string } }
  try {
    msg = JSON.parse(raw) as typeof msg
  } catch {
    return
  }
  if (!authed) {
    if (msg.method === 'auth' && (msg as { result?: { ok?: boolean } }).result?.ok) {
      authed = true
      syncError = null
      reconnectDelay = RECONNECT_BASE_MS
      lastPongTime = Date.now()
      chrome.alarms.clear(RECONNECT_ALARM)
      send({ v: 1, method: 'hello', params: { methods: listRelayMethods(), level: currentLevel } })
      void runSync()
    }
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
  if (typeof msg.id === 'number' && msg.id < 0) {
    const waiter = waiters.get(msg.id)
    if (!waiter) return
    waiters.delete(msg.id)
    if (msg.error) waiter.reject(new Error(msg.error.message || 'sync failed'))
    else waiter.resolve(msg.result)
    return
  }
  if (msg.method === 'sync.changed') {
    queueSync()
    return
  }
  if (msg.id == null) return
  const method = msg.method || msg.action || ''
  if (!relayAllows(currentLevel, method)) {
    send({ v: 1, id: msg.id, error: { code: 'forbidden', message: `this browser is set to ${currentLevel}; ${method} is not allowed` } })
    return
  }
  await answerRelayRequest(msg, send)
}

async function connect(): Promise<void> {
  if (!enabled) return
  if (connectLock) {
    reconnectQueued = true
    return
  }
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return

  const url = remoteExtensionUrl(currentUrl)
  if (!url || !currentToken) {
    syncError = 'Set a wss URL and token'
    return
  }

  connectLock = true
  if (ws) {
    try { ws.close() } catch { /* ignore */ }
    ws = null
  }
  authed = false

  try {
    const deviceId = await getDeviceId()
    const socket = new WebSocket(url)
    ws = socket
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('connect timeout')), 8000)
      socket.onopen = () => { clearTimeout(timeout); resolve() }
      socket.onerror = () => { clearTimeout(timeout); reject(new Error('connect error')) }
      socket.onclose = event => { clearTimeout(timeout); reject(new Error(`closed: ${event.code}`)) }
    })
    console.log('[Iris remote relay] connected')
    socket.onmessage = event => { void onFrame(String(event.data)) }
    socket.onclose = event => {
      console.log('[Iris remote relay] disconnected:', event.code)
      if (ws === socket) ws = null
      authed = false
      rejectWaiters(new Error('disconnected'))
      scheduleReconnect()
    }
    socket.onerror = () => console.error('[Iris remote relay] ws error')
    send({
      v: 1,
      method: 'auth',
      params: { token: currentToken, deviceId, label: currentLabel || deviceId, level: currentLevel },
    })
  } catch (error) {
    console.error('[Iris remote relay] connect failed:', (error as Error).message)
    syncError = (error as Error).message
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

function applySettings(settings: SidePanelSettings): void {
  const nextEnabled = settings.remoteRelayEnabled === true
  const nextUrl = settings.remoteRelayUrl || ''
  const nextToken = settings.remoteRelayToken || ''
  const nextLabel = settings.remoteRelayLabel || ''
  const nextLevel = settings.remoteRelayLevel ?? 'read'
  const changed = nextEnabled !== enabled || nextUrl !== currentUrl || nextToken !== currentToken || nextLabel !== currentLabel || nextLevel !== currentLevel
  enabled = nextEnabled
  currentUrl = nextUrl
  currentToken = nextToken
  currentLabel = nextLabel
  currentLevel = nextLevel
  if (!enabled) {
    disconnect()
    syncError = null
    return
  }
  ensureKeepalive()
  if (changed || !isSocketOpen()) forceReconnect()
}

export function initRemoteRelay(): void {
  chrome.runtime.onConnect.addListener(port => {
    if (port.name === KEEPALIVE_PORT) return
  })

  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 0.5 })
  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === RECONNECT_ALARM) {
      if (enabled && !isSocketOpen()) void connect()
      return
    }
    if (alarm.name !== ALARM_NAME || !enabled) return
    if (!isSocketOpen()) {
      void connect()
      return
    }
    if (Date.now() - lastPongTime > 60_000) {
      console.warn('[Iris remote relay] no pong for >60s, forcing reconnect')
      forceReconnect()
      return
    }
    send({ action: 'ping' })
    if (authed) void runSync()
  })

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return
    if (enabled && sync && Object.keys(changes).some(key => sync!.watches(key))) queueSync()
    if (!changes[SETTINGS_KEY]) return
    const next = changes[SETTINGS_KEY].newValue as SidePanelSettings | undefined
    if (next) applySettings(next)
  })

  void loadSettings().then(applySettings)
}
