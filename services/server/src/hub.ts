import { WebSocket } from 'ws'
import type { PushRecord, Store } from './store.ts'

/** What a device lets callers do through it. Set per device in Iris settings. */
export type Level = 'off' | 'read' | 'control'

/** Reading with the user's login, nothing that drives the browser or reads Iris's own data. */
export const READ_METHODS = new Set([
  'browser.fetch',
  'iris.capabilities',
  'iris.chat.platforms',
  'iris.chat.list',
  'iris.chat.export',
  'iris.chat.export_all',
])

export function methodLevel(method: string): Exclude<Level, 'off'> {
  return READ_METHODS.has(method) ? 'read' : 'control'
}

export function allows(level: Level, method: string): boolean {
  if (level === 'off') return false
  return level === 'control' || methodLevel(method) === 'read'
}

export interface DeviceInfo {
  id: string
  label: string
  level: Level
  lastSeen: number
  methods: string[]
  version?: string
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
  user: string
  id: string
  label: string
  level: Level
  socket: WebSocket
  /** Last hello or sync push; routing prefers the browser in use. */
  lastActive: number
  /** Last frame of any kind, pongs included. */
  lastSeen: number
  methods: string[]
  version?: string
}

export interface Liveness {
  pingMs: number
  /** A socket with no frame for this long is terminated. */
  deadMs: number
}

const LIVENESS: Liveness = { pingMs: 30_000, deadMs: 90_000 }

interface Pending {
  user: string
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

export function asLevel(value: unknown): Level {
  return value === 'off' || value === 'control' ? value : 'read'
}

export function createHub(store: Store, liveness: Liveness = LIVENESS) {
  /** Keyed by user and device id; device ids are only unique within a user. */
  const devices = new Map<string, Device>()
  const key = (user: string, id: string) => `${user}\n${id}`
  const own = (user: string) => [...devices.values()].filter(device => device.user === user)
  const pending = new Map<number, Pending>()
  let nextId = 1

  // A half-open socket never fires close, so silence is the only signal.
  const sweep = setInterval(() => {
    const now = Date.now()
    for (const device of devices.values()) {
      if (now - device.lastSeen > liveness.deadMs) {
        console.log(`[iris-server] device ${device.id} silent for ${Math.round((now - device.lastSeen) / 1000)}s, dropping`)
        drop(device)
      } else if (device.socket.readyState === WebSocket.OPEN) {
        device.socket.ping()
      }
    }
  }, liveness.pingMs)
  sweep.unref()

  function drop(device: Device) {
    if (devices.get(key(device.user, device.id)) === device) devices.delete(key(device.user, device.id))
    failSocket(device.socket, 'disconnected', 'browser disconnected')
    device.socket.terminate()
  }

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

  function listDevices(user: string): DeviceInfo[] {
    return own(user).map(device => ({
      id: device.id,
      label: device.label,
      level: device.level,
      lastSeen: device.lastSeen,
      methods: device.methods,
      version: device.version,
    }))
  }

  function status(user: string) {
    const mine = listDevices(user)
    return {
      extension_connected: mine.length > 0,
      pending_requests: [...pending.values()].filter(call => call.user === user).length,
      devices: mine,
    }
  }

  function serves(device: Device, method: string): boolean {
    return allows(device.level, method) && (!device.methods.length || device.methods.includes(method))
  }

  function pick(user: string, method: string, deviceId?: string): Device {
    const mine = own(user)
    if (deviceId) {
      const labeled = mine.filter(device => device.label === deviceId)
      const device = devices.get(key(user, deviceId)) ?? (labeled.length === 1 ? labeled[0] : undefined)
      if (!device) throw new RelayCallError(503, 'no_device', 'extension not connected', { device: deviceId })
      if (!allows(device.level, method)) {
        throw new RelayCallError(403, 'forbidden', `${device.label} is set to ${device.level}; ${method} needs ${methodLevel(method)}`, { device: device.id })
      }
      return device
    }
    let best: Device | undefined
    for (const device of mine) {
      if (!serves(device, method)) continue
      if (!best || device.lastActive > best.lastActive) best = device
    }
    if (best) return best
    if (mine.length) throw new RelayCallError(503, 'no_device', `no connected browser accepts ${method} (needs level ${methodLevel(method)})`)
    throw new RelayCallError(503, 'no_device', 'extension not connected')
  }

  function register(socket: WebSocket, user: string, id: string, label: string, level: Level) {
    const now = Date.now()
    const device: Device = { user, id, label: label.slice(0, 64) || id, level, socket, lastActive: now, lastSeen: now, methods: [] }
    const prev = devices.get(key(user, id))
    devices.set(key(user, id), device)
    if (prev && prev.socket !== socket) {
      failSocket(prev.socket, 'disconnected', 'browser reconnected')
      prev.socket.terminate()
    }

    socket.on('close', () => {
      if (devices.get(key(user, id))?.socket === socket) devices.delete(key(user, id))
      failSocket(socket, 'disconnected', 'browser disconnected')
    })
    socket.on('pong', () => { device.lastSeen = Date.now() })
    socket.on('message', (data) => {
      device.lastSeen = Date.now()
      let msg: Inbound
      try {
        msg = JSON.parse(String(data)) as Inbound
      } catch {
        return
      }
      void onMessage(device, msg).catch(error => {
        console.error(`[iris-server] ${msg.method ?? 'message'} from ${device.id} failed:`, (error as Error).message)
        if (typeof msg.id === 'number' && msg.id < 0) send(device.socket, { v: 1, id: msg.id, error: { code: 'internal', message: 'internal error' } })
      })
    })
  }

  async function onMessage(device: Device, msg: Inbound) {
    if (msg.action === 'ping' || msg.method === 'ping') {
      send(device.socket, { action: 'pong' })
      return
    }
    if (msg.action === 'pong' || msg.method === 'pong') return

    if (msg.method === 'hello') {
      const methods = msg.params?.methods
      device.methods = Array.isArray(methods) ? methods.filter((name): name is string => typeof name === 'string') : []
      if (msg.params?.level !== undefined) device.level = asLevel(msg.params.level)
      if (typeof msg.params?.version === 'string') device.version = msg.params.version.slice(0, 32)
      device.lastActive = Date.now()
      return
    }

    if (msg.method === 'sync.push' && typeof msg.id === 'number') {
      device.lastActive = Date.now()
      const records = asRecords(msg.params?.records)
      const results = await store.push(device.user, records)
      send(device.socket, { v: 1, id: msg.id, result: { results } })
      if (results.some(r => !r.error && !r.unchanged)) {
        for (const other of own(device.user)) if (other !== device) send(other.socket, { v: 1, method: 'sync.changed' })
      }
      const failed = results.filter(r => r.error).length
      const unchanged = results.filter(r => r.unchanged).length
      console.log(`[iris-server] sync.push user=${device.user} device=${device.id} records=${records.length} unchanged=${unchanged} failed=${failed}`)
      return
    }

    if (msg.method === 'sync.pull' && typeof msg.id === 'number') {
      const since = Number(msg.params?.since ?? 0)
      const limit = Number(msg.params?.limit ?? 50)
      const result = await store.pull(device.user, Number.isFinite(since) ? since : 0, Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50)
      send(device.socket, { v: 1, id: msg.id, result })
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
        const status = code === 'method_not_found' || code === 'invalid_params' ? 400 : code === 'forbidden' ? 403 : 502
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

  function callDevice(user: string, deviceId: string | undefined, method: string, params: unknown, timeoutSec: number) {
    let device: Device
    try {
      device = pick(user, method, deviceId)
    } catch (error) {
      return Promise.reject(error)
    }
    const id = nextId++
    const seconds = callSeconds(timeoutSec)
    return new Promise<{ device: string; body: unknown }>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new RelayCallError(504, 'timeout', 'timeout waiting for extension response', { device: device.id }))
      }, seconds * 1000)
      pending.set(id, { user, deviceId: device.id, socket: device.socket, chunks: [], timer, resolve, reject })
      console.log(`[iris-server] call user=${user} device=${device.id} method=${method}`)
      send(device.socket, { v: 1, id, method, params: params ?? {} })
    })
  }

  return { register, listDevices, status, callDevice, close: () => clearInterval(sweep) }
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
  if (error.status === 504) return { status: 504, body: { error: 'timeout waiting for extension response' }, device: error.device }
  const details = error.details && typeof error.details === 'object'
    ? error.details
    : { code: error.code, message: error.message }
  return { status: error.status, body: { error: details }, device: error.device }
}

function asRecords(value: unknown): PushRecord[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(entry => {
    if (!entry || typeof entry !== 'object') return []
    const row = entry as Record<string, unknown>
    if (typeof row.kind !== 'string' || typeof row.id !== 'string') return []
    if (typeof row.updatedAt !== 'number' || !Number.isFinite(row.updatedAt)) return []
    return [{
      kind: row.kind,
      id: row.id,
      baseRev: typeof row.baseRev === 'number' ? row.baseRev : 0,
      updatedAt: row.updatedAt,
      deleted: row.deleted === true,
      body: row.body,
    }]
  })
}
