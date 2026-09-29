import { WebSocket } from 'ws'
import type { RelayStore, SyncIndexEntry, SyncTombstone } from './store.ts'

export interface DeviceInfo {
  id: string
  label: string
  lastSeen: number
  methods: string[]
}

export class RelayCallError extends Error {
  status: number
  code: string
  device?: string
  details?: unknown

  constructor(status: number, code: string, message: string, extra?: { device?: string; details?: unknown }) {
    super(message)
    this.status = status
    this.code = code
    this.device = extra?.device
    this.details = extra?.details
  }
}

interface Device {
  id: string
  label: string
  socket: WebSocket
  lastActive: number
  methods: string[]
}

interface Pending {
  deviceId: string
  socket: WebSocket
  chunks: unknown[]
  timer: NodeJS.Timeout
  resolve: (value: { device: string; body: unknown }) => void
  reject: (error: RelayCallError) => void
}

interface Inbound {
  v?: number
  id?: number
  method?: string
  action?: string
  event?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: unknown
}

export function createHub(store: RelayStore) {
  const devices = new Map<string, Device>()
  const pending = new Map<number, Pending>()
  let nextId = 1

  function send(socket: WebSocket, msg: unknown) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg))
  }

  function failSocket(socket: WebSocket, code: string, message: string) {
    for (const [id, call] of pending) {
      if (call.socket !== socket) continue
      clearTimeout(call.timer)
      pending.delete(id)
      call.reject(new RelayCallError(502, code, message, { device: call.deviceId }))
    }
  }

  function listDevices(): DeviceInfo[] {
    return [...devices.values()].map(device => ({
      id: device.id,
      label: device.label,
      lastSeen: device.lastActive,
      methods: device.methods,
    }))
  }

  function status() {
    const active = pick()
    return {
      extension_connected: devices.size > 0,
      pending_requests: pending.size,
      methods: active?.methods ?? [],
      devices: listDevices(),
    }
  }

  function pick(deviceId?: string): Device | undefined {
    if (deviceId) {
      const exact = devices.get(deviceId)
      if (exact) return exact
      const labeled = [...devices.values()].filter(device => device.label === deviceId)
      return labeled.length === 1 ? labeled[0] : undefined
    }
    let best: Device | undefined
    for (const device of devices.values()) {
      if (!best || device.lastActive > best.lastActive) best = device
    }
    return best
  }

  function register(socket: WebSocket, id: string, label: string) {
    const device: Device = {
      id,
      label: label.slice(0, 64) || id,
      socket,
      lastActive: Date.now(),
      methods: [],
    }
    const prev = devices.get(id)
    devices.set(id, device)
    if (prev && prev.socket !== socket) prev.socket.close(4000, 'replaced')

    socket.on('close', () => {
      if (devices.get(id)?.socket === socket) devices.delete(id)
      failSocket(socket, 'disconnected', 'browser disconnected')
    })
    socket.on('message', (data) => {
      let msg: Inbound
      try {
        msg = JSON.parse(String(data)) as Inbound
      } catch {
        return
      }
      onMessage(device, msg)
    })
  }

  function onMessage(device: Device, msg: Inbound) {
    if (msg.action === 'ping' || msg.method === 'ping') {
      send(device.socket, { action: 'pong' })
      return
    }
    if (msg.action === 'pong' || msg.method === 'pong') return

    if (msg.method === 'hello') {
      const methods = msg.params?.methods
      device.methods = Array.isArray(methods) ? methods.filter((name): name is string => typeof name === 'string') : []
      device.lastActive = Date.now()
      return
    }

    if (msg.method === 'sync.push') {
      device.lastActive = Date.now()
      const conversations = Array.isArray(msg.params?.conversations) ? msg.params.conversations : []
      const tombstones = asTombstones(msg.params?.tombstones)
      const rejected = store.push(conversations, tombstones)
      if (typeof msg.id === 'number') send(device.socket, { v: 1, id: msg.id, result: { rejected } })
      console.log(`[iris-relay] sync.push device=${device.id} conversations=${conversations.length} tombstones=${tombstones.length} rejected=${rejected.length}`)
      return
    }

    if (msg.method === 'sync.reconcile' && typeof msg.id === 'number') {
      const conversations = asIndex(msg.params?.conversations)
      const tombstones = asTombstones(msg.params?.tombstones)
      const result = store.reconcile(conversations, tombstones)
      send(device.socket, { v: 1, id: msg.id, result })
      console.log(`[iris-relay] sync.reconcile device=${device.id} push=${result.push.length} send=${result.conversations.length}`)
      return
    }

    if (typeof msg.id === 'number' && msg.id > 0) {
      const call = pending.get(msg.id)
      if (!call || call.socket !== device.socket) return
      if (msg.event === 'chunk') {
        call.chunks.push(msg.result)
        return
      }
      clearTimeout(call.timer)
      pending.delete(msg.id)
      if (msg.error != null) {
        const error = msg.error
        const code = typeof error === 'object' && error && 'code' in error ? String((error as { code: unknown }).code) : 'internal'
        const message = typeof error === 'object' && error && 'message' in error
          ? String((error as { message: unknown }).message)
          : String(error)
        const status = code === 'method_not_found' || code === 'invalid_params' ? 400 : 502
        call.reject(new RelayCallError(status, code, message, { device: device.id, details: publicError(error, code, message) }))
        return
      }
      const result = msg.result !== undefined ? msg.result : {}
      call.resolve({
        device: device.id,
        body: call.chunks.length ? { chunks: call.chunks, result } : result,
      })
    }
  }

  function callDevice(deviceId: string | undefined, method: string, params: unknown, timeoutSec: number) {
    const device = pick(deviceId)
    if (!device) {
      return Promise.reject(new RelayCallError(503, 'no_device', 'extension not connected', deviceId ? { device: deviceId } : undefined))
    }
    const id = nextId++
    const seconds = callSeconds(timeoutSec)
    return new Promise<{ device: string; body: unknown }>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new RelayCallError(504, 'timeout', 'timeout waiting for extension response', { device: device.id }))
      }, seconds * 1000)
      pending.set(id, { deviceId: device.id, socket: device.socket, chunks: [], timer, resolve, reject })
      console.log(`[iris-relay] call device=${device.id} method=${method}`)
      send(device.socket, { v: 1, id, method, params: params ?? {} })
    })
  }

  return { register, listDevices, status, callDevice }
}

export type RelayHub = ReturnType<typeof createHub>

function callSeconds(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 120
  return Math.min(value, 300)
}

function publicError(error: unknown, code: string, message: string): Record<string, unknown> {
  const body: Record<string, unknown> = { code, message }
  if (error && typeof error === 'object') {
    const row = error as { schema?: unknown; methods?: unknown }
    if (row.schema !== undefined) body.schema = row.schema
    if (row.methods !== undefined) body.methods = row.methods
  }
  return body
}

export function relayErrorPayload(error: unknown): { status: number; body: unknown; device?: string } {
  if (!(error instanceof RelayCallError)) {
    return { status: 500, body: { error: { code: 'internal', message: 'internal error' } } }
  }
  if (error.status === 503) return { status: 503, body: { error: 'extension not connected' }, device: error.device }
  if (error.status === 504) return { status: 504, body: { error: 'timeout waiting for extension response' }, device: error.device }
  const details = error.details && typeof error.details === 'object'
    ? error.details
    : { code: error.code, message: error.message }
  return { status: error.status, body: { error: details }, device: error.device }
}

function asIndex(value: unknown): SyncIndexEntry[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(entry => {
    if (!entry || typeof entry !== 'object') return []
    const row = entry as { id?: unknown; lastUpdated?: unknown }
    if (typeof row.id !== 'string' || typeof row.lastUpdated !== 'number') return []
    return [{ id: row.id, lastUpdated: row.lastUpdated }]
  })
}

function asTombstones(value: unknown): SyncTombstone[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(entry => {
    if (!entry || typeof entry !== 'object') return []
    const row = entry as { id?: unknown; deletedAt?: unknown }
    if (typeof row.id !== 'string' || typeof row.deletedAt !== 'number') return []
    return [{ id: row.id, deletedAt: row.deletedAt }]
  })
}
