import type { Device } from './api.ts'

export type DeviceState = 'online' | 'unstable' | 'offline'

/** The server pings every 30 s; a frame older than this means the browser is slow to answer. */
export const LATE_FRAME_MS = 45_000
/** Reconnects in an hour that make an online browser worth avoiding. */
export const UNSTABLE_RECONNECTS = 3

export function deviceState(device: Device, now: number): DeviceState {
  if (!device.online) return 'offline'
  if (device.reconnectsLastHour >= UNSTABLE_RECONNECTS || now - device.lastSeen > LATE_FRAME_MS) return 'unstable'
  return 'online'
}

export const STATE_LABEL: Record<DeviceState, string> = { online: 'Online', unstable: 'Unstable', offline: 'Offline' }

export interface Span {
  /** 0..1 within the window. */
  from: number
  to: number
  kind: 'online' | 'offline' | 'unknown'
}

/** Online and offline stretches over the last `windowMs`, from the event history; before the server started is unknown. */
export function timeline(device: Device, startedAt: number, now: number, windowMs = 3600_000): Span[] {
  const start = now - windowMs
  const at = (t: number) => Math.min(1, Math.max(0, (t - start) / windowMs))
  const spans: Span[] = []
  let cursor = start
  let kind: Span['kind'] = startedAt > start ? 'unknown' : 'offline'
  const push = (until: number) => {
    if (until > cursor) spans.push({ from: at(cursor), to: at(until), kind })
    cursor = Math.max(cursor, until)
  }
  if (startedAt > start) {
    push(startedAt)
    kind = 'offline'
  }
  for (const event of [...device.events].reverse()) {
    push(event.at)
    kind = event.type === 'connect' ? 'online' : 'offline'
  }
  push(now)
  return spans
}

/** "42 s", "5 min", "3 h 10 min", "2 d". */
export function duration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 48) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`
  return `${Math.floor(h / 24)} d`
}

export function clock(at: number): string {
  return new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/** A disconnect reason in words. */
export function reasonText(reason?: string): string {
  if (!reason) return ''
  if (reason === 'silent') return 'no frame for 90 s, dropped by the server'
  if (reason === 'replaced') return 'replaced by a new connection'
  const code = /^closed (\d+)/.exec(reason)?.[1]
  if (code === '1000' || code === '1005') return 'closed by the browser'
  if (code === '1001') return 'browser went away'
  if (code === '1006') return 'connection lost'
  return reason
}
