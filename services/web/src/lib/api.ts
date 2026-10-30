export class ApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

let onUnauthorized: () => void = () => {}

/** Called on any 401 from `get`: the app sends the user to /login. */
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler
}

async function failure(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } | string } | null
  const error = body?.error
  if (typeof error === 'string') return new ApiError(res.status, 'http', error)
  return new ApiError(res.status, error?.code ?? 'http', error?.message ?? res.statusText)
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, { credentials: 'same-origin', ...init, headers: { accept: 'application/json', ...(init?.body ? { 'content-type': 'application/json' } : {}) } })
  } catch {
    throw new ApiError(0, 'network', 'The Iris server did not answer.')
  }
  if (!res.ok) throw await failure(res)
  return (await res.json()) as T
}

/** A read route with the session cookie. Network failures throw `ApiError` with status 0. */
export async function get<T>(path: string): Promise<T> {
  try {
    return await request<T>(path)
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) onUnauthorized()
    throw error
  }
}

export interface Me {
  loggedIn: boolean
  user?: string
  level?: 'read' | 'control'
}

/** The key goes to the server once; only the `HttpOnly` cookie it sets is kept. */
export const login = (key: string) => request<Me>('/auth/login', { method: 'POST', body: JSON.stringify({ key }) })
export const logout = () => request<Me>('/auth/logout', { method: 'POST' })
export const fetchMe = () => request<Me>('/auth/me')

export interface DeviceEvent {
  at: number
  type: 'connect' | 'disconnect'
  reason?: string
}

export interface Device {
  id: string
  label: string
  level: 'off' | 'read' | 'control'
  lastSeen: number
  version?: string
  online: boolean
  connectedAt: number | null
  reconnectsLastHour: number
  /** Newest first. */
  events: DeviceEvent[]
}

export interface DevicesResponse {
  startedAt: number
  pending_requests: number
  devices: Device[]
}

export const fetchDevices = () => get<DevicesResponse>('/devices?history=1')

export type TestResult = { ok: true; ms: number } | { ok: false; ms: number; status: number; message: string }

/** One read-level relay call to this browser, timed from here. */
export async function testDevice(id: string): Promise<TestResult> {
  const started = performance.now()
  try {
    await request('/call', { method: 'POST', body: JSON.stringify({ method: 'iris.capabilities', device: id, timeout: 15 }) })
    return { ok: true, ms: Math.round(performance.now() - started) }
  } catch (error) {
    const e = error instanceof ApiError ? error : new ApiError(0, 'network', String(error))
    return { ok: false, ms: Math.round(performance.now() - started), status: e.status, message: e.status === 504 ? 'timed out' : e.message }
  }
}

/** A sentence for the login form. */
export function loginErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Login failed. Try again.'
  if (error.status === 0) return 'The Iris server did not answer. Check your connection and try again.'
  if (error.status === 401) return 'That is not a read or control key. A browser (device) token does not open this page.'
  if (error.status === 429) return 'Too many requests from this address. Try again in a minute.'
  if (error.status === 400) return 'Paste the key first.'
  return `The server answered ${error.status}: ${error.message}`
}
