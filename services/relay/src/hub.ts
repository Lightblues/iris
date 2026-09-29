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
  resolve: (value: { device: string; result: unknown; chunks?: unknown[] }) => void
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

  function pick(deviceId?: string): Device | undefined {
    if (deviceId) return devices.get(deviceId)
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
        call.reject(new RelayCallError(200, code, message, { device: device.id, details: error }))
        return
      }
      call.resolve({
        device: device.id,
        result: msg.result,
        ...(call.chunks.length ? { chunks: call.chunks } : {}),
      })
    }
  }

  function callDevice(deviceId: string | undefined, method: string, params: unknown, timeoutMs: number) {
    const device = pick(deviceId)
    if (!device) {
      return Promise.reject(new RelayCallError(404, 'no_device', deviceId ? `device offline: ${deviceId}` : 'no browser connected'))
    }
    const id = nextId++
    const timeout = Math.min(Math.max(timeoutMs || 60_000, 1000), 300_000)
    return new Promise<{ device: string; result: unknown; chunks?: unknown[] }>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new RelayCallError(504, 'timeout', `timed out after ${timeout}ms`, { device: device.id }))
      }, timeout)
      pending.set(id, { deviceId: device.id, socket: device.socket, chunks: [], timer, resolve, reject })
      console.log(`[iris-relay] call device=${device.id} method=${method}`)
      send(device.socket, { v: 1, id, method, params: params ?? {} })
    })
  }

  return { register, listDevices, callDevice }
}

export type RelayHub = ReturnType<typeof createHub>

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
