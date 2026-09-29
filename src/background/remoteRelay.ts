// Outbound socket to a public iris-relay. The localhost ea-tools relay stays separate.
// Chrome cannot listen, so this browser dials out. Tool calls and history sync
// share the socket. Remote relay is off until Settings turns it on.

import { applyRemoteSync, loadAllConversations, loadTombstones } from '../agent/history'
import type { SyncTombstone } from '../agent/conversationSync'
import type { Conversation } from '../agent/types'
import { loadSettings, SETTINGS_KEY, type SidePanelSettings } from '../lib/sidepanelSettings'
import { remoteExtensionUrl } from '../lib/remoteRelayUrl'
import { answerRelayRequest, type RelayFrame } from './browserRelay'
import { listRelayMethods } from './relayRegistry'

const DEVICE_KEY = 'iris_remote_device_id'
const KEEPALIVE_PORT = 'iris-remote-relay-keepalive'
const ALARM_NAME = 'remote-relay-keepalive'
const RECONNECT_ALARM = 'remote-relay-reconnect'
const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30000

export interface RemoteRelayState {
  enabled: boolean
  connected: boolean
  url: string
  deviceId: string
  label: string
  syncError: string | null
}

interface SyncResult {
  rejected?: { id: string; error: string }[]
  push?: string[]
  conversations?: Conversation[]
  tombstones?: SyncTombstone[]
}

let ws: WebSocket | null = null
let enabled = false
let authed = false
let currentUrl = ''
let currentToken = ''
let currentLabel = ''
let syncError: string | null = null
let reconnectDelay = RECONNECT_BASE_MS
let connectLock = false
let reconnectQueued = false
let lastPongTime = Date.now()
let keepalivePort: chrome.runtime.Port | null = null
let nextId = -1
let reconcileLock = false
const waiters = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
const pendingConvs = new Map<string, Conversation>()
const pendingTombs = new Map<string, SyncTombstone>()

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
    syncError,
  }
}

export function queueRemoteSync(conversations?: Conversation[], tombstones?: SyncTombstone[]): void {
  if (!enabled) return
  for (const conv of conversations ?? []) pendingConvs.set(conv.id, conv)
  for (const tomb of tombstones ?? []) {
    pendingTombs.set(tomb.id, tomb)
    pendingConvs.delete(tomb.id)
  }
  void flushPush()
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
    }, 20_000)
    waiters.set(id, {
      resolve: value => { clearTimeout(timer); resolve(value as T) },
      reject: error => { clearTimeout(timer); reject(error) },
    })
    send({ v: 1, id, method, params })
  })
}

async function flushPush(): Promise<void> {
  if (!authed || !isSocketOpen()) return
  if (!pendingConvs.size && !pendingTombs.size) return
  const conversations = [...pendingConvs.values()]
  const tombstones = [...pendingTombs.values()]
  pendingConvs.clear()
  pendingTombs.clear()
  try {
    const result = await request<SyncResult>('sync.push', { conversations, tombstones })
    noteRejected(result.rejected)
  } catch (error) {
    syncError = (error as Error).message
    for (const conv of conversations) if (!pendingConvs.has(conv.id)) pendingConvs.set(conv.id, conv)
    for (const tomb of tombstones) if (!pendingTombs.has(tomb.id)) pendingTombs.set(tomb.id, tomb)
  }
}

function noteRejected(rejected: { id: string; error: string }[] | undefined): void {
  if (!rejected?.length) return
  syncError = rejected.map(item => `${item.id}: ${item.error}`).join('; ')
}

async function reconcile(): Promise<void> {
  if (reconcileLock || !authed || !isSocketOpen()) return
  reconcileLock = true
  try {
    syncError = null
    await flushPush()
    const store = await loadAllConversations()
    const tombstones = await loadTombstones()
    const result = await request<SyncResult>('sync.reconcile', {
      conversations: store.conversations.map(conv => ({ id: conv.id, lastUpdated: conv.lastUpdated })),
      tombstones,
    })
    if (result.conversations?.length || result.tombstones?.length) {
      await applyRemoteSync(result.conversations ?? [], result.tombstones ?? [])
    }
    if (result.push?.length) {
      const fresh = await loadAllConversations()
      const byId = new Map(fresh.conversations.map(conv => [conv.id, conv]))
      const conversations = result.push.flatMap(id => {
        const conv = byId.get(id)
        return conv ? [conv] : []
      })
      if (conversations.length) {
        const pushed = await request<SyncResult>('sync.push', { conversations })
        noteRejected(pushed.rejected)
      }
    }
  } catch (error) {
    syncError = (error as Error).message
    console.warn('[Iris remote relay] sync failed:', syncError)
  } finally {
    reconcileLock = false
    void flushPush()
  }
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
      send({ v: 1, method: 'hello', params: { methods: listRelayMethods() } })
      void reconcile()
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
  if (msg.id == null) return
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
      params: { token: currentToken, deviceId, label: currentLabel || deviceId },
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
  const changed = nextEnabled !== enabled || nextUrl !== currentUrl || nextToken !== currentToken || nextLabel !== currentLabel
  enabled = nextEnabled
  currentUrl = nextUrl
  currentToken = nextToken
  currentLabel = nextLabel
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
    if (authed) void reconcile()
  })

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[SETTINGS_KEY]) return
    const next = changes[SETTINGS_KEY].newValue as SidePanelSettings | undefined
    if (next) applySettings(next)
  })

  void loadSettings().then(applySettings)
}
