import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { WebSocketServer } from 'ws'
import { asLevel, createHub, methodLevel, relayErrorPayload, type Liveness } from './hub.ts'
import { EXPORT_KINDS, migrate, openStore, pgDb, type Db } from './store.ts'
import { createSession, deleteSession, resolveSession, resolveToken, seedEnv, SESSION_MS } from './users.ts'

const MAX_BODY = 32 * 1024 * 1024

/** The env credentials belong to user `me`; other users' credentials live in the database. */
export interface ServerOptions {
  /** What extensions send in the WebSocket auth frame. */
  deviceToken?: string
  /** Read-level relay calls, device status, and /export. */
  readKey?: string
  /** Every relay method. Empty turns control calls off for `me`. */
  controlKey?: string
  host: string
  port: number
  db: Db
  liveness?: Liveness
  /** The built web app (services/web/dist). */
  webDir?: string
}

type KeyLevel = 'read' | 'control'

export async function startServer(options: ServerOptions) {
  await migrate(options.db)
  await seedEnv(options.db, { device: options.deviceToken, read: options.readKey, control: options.controlKey })
  const store = openStore(options.db)
  const hub = createHub(store, options.liveness)
  const hits = new Map<string, { n: number; reset: number }>()

  const server = createServer((req, res) => {
    void onRequest(req, res).catch(error => {
      console.error('[iris-server] request failed:', (error as Error).message)
      sendJson(res, 500, { error: { code: 'internal', message: 'internal error' } })
    })
  })

  const wss = new WebSocketServer({ server, path: '/extension', maxPayload: MAX_BODY })
  wss.on('connection', socket => {
    const timer = setTimeout(() => socket.close(4001, 'auth timeout'), 5000)
    socket.once('message', data => void onAuth(data).catch(error => {
      console.error('[iris-server] auth failed:', (error as Error).message)
      socket.close(1011, 'internal error')
    }))
    async function onAuth(data: unknown) {
      clearTimeout(timer)
      let msg: { method?: string; params?: { token?: unknown; deviceId?: unknown; label?: unknown; level?: unknown } }
      try {
        msg = JSON.parse(String(data)) as typeof msg
      } catch {
        socket.close(4001, 'unauthorized')
        return
      }
      const token = typeof msg.params?.token === 'string' ? msg.params.token : ''
      const deviceId = typeof msg.params?.deviceId === 'string' ? msg.params.deviceId : ''
      const label = typeof msg.params?.label === 'string' ? msg.params.label : ''
      const auth = msg.method === 'auth' && deviceId && deviceId.length <= 80 ? await resolveToken(options.db, token, ['device']) : null
      if (!auth) {
        socket.close(4001, 'unauthorized')
        return
      }
      if (socket.readyState !== socket.OPEN) return
      socket.send(JSON.stringify({ v: 1, method: 'auth', result: { ok: true } }))
      hub.register(socket, auth.userId, deviceId, label, asLevel(msg.params?.level))
      console.log(`[iris-server] device connected user=${auth.userId} ${deviceId}`)
    }
  })

  await new Promise<void>((resolveListen, reject) => {
    const onError = (error: Error) => reject(error)
    server.once('error', onError)
    server.listen(options.port, options.host, () => {
      server.removeListener('error', onError)
      resolveListen()
    })
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : options.port

  const webDir = options.webDir ?? WEB_DIR

  /** A bearer key, or the web app's session cookie; a cookie never authorizes a cross-origin write. */
  async function caller(req: IncomingMessage): Promise<{ user: string; level: KeyLevel } | null> {
    const key = bearer(req)
    const auth = key
      ? await resolveToken(options.db, key, ['read', 'control'])
      : req.method === 'GET' || sameOrigin(req) ? await resolveSession(options.db, cookie(req, SESSION_COOKIE)) : null
    return auth ? { user: auth.userId, level: auth.kind as KeyLevel } : null
  }

  async function onRequest(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, { ok: true })
      return
    }
    // Before the rate limit: behind the tunnel every visitor shares one address, and page views must not starve the API.
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (await sendStatic(res, webDir, url.pathname, req.method === 'HEAD')) return
    }
    if (limited(hits, req.socket.remoteAddress || '')) {
      sendJson(res, 429, { error: { code: 'rate_limited', message: 'too many requests' } })
      return
    }
    if (url.pathname === '/auth/me' && req.method === 'GET') {
      const me = await caller(req)
      sendJson(res, 200, me ? { loggedIn: true, user: me.user, level: me.level } : { loggedIn: false })
      return
    }
    if (url.pathname === '/auth/login' && req.method === 'POST') {
      if (!sameOrigin(req)) {
        sendJson(res, 403, { error: { code: 'forbidden', message: 'cross-origin login' } })
        return
      }
      const body = await readJson(req)
      const key = typeof body.key === 'string' ? body.key.trim() : ''
      if (!key) {
        sendJson(res, 400, { error: { code: 'invalid_params', message: 'key is required' } })
        return
      }
      const session = await createSession(options.db, key)
      if (!session) {
        sendJson(res, 401, { error: { code: 'unauthorized', message: 'not a read or control key' } })
        return
      }
      sendJson(res, 200, { loggedIn: true, user: session.userId, level: session.kind }, { 'set-cookie': sessionCookie(req, session.token, SESSION_MS / 1000) })
      return
    }
    if (url.pathname === '/auth/logout' && req.method === 'POST') {
      await deleteSession(options.db, cookie(req, SESSION_COOKIE))
      sendJson(res, 200, { loggedIn: false }, { 'set-cookie': sessionCookie(req, '', 0) })
      return
    }

    const auth = await caller(req)
    if (!auth) {
      sendJson(res, 401, { error: { code: 'unauthorized', message: 'unauthorized' } })
      return
    }

    if (req.method === 'GET' && (url.pathname === '/status' || url.pathname === '/devices')) {
      const base = hub.status(auth.user)
      sendJson(res, 200, url.searchParams.get('history') === '1' ? { ...base, ...hub.history(auth.user) } : base)
      return
    }

    if (req.method === 'GET' && url.pathname === '/export/kinds') {
      sendJson(res, 200, { app: 'iris', kinds: Object.entries(EXPORT_KINDS).map(([kind, description]) => ({ kind, description })) })
      return
    }

    if (req.method === 'GET' && url.pathname === '/export/changes') {
      const since = Number(url.searchParams.get('since') || 0)
      if (!Number.isFinite(since) || since < 0) {
        sendJson(res, 400, { error: { code: 'invalid_params', message: 'since must be a cursor from a previous response' } })
        return
      }
      const kinds = (url.searchParams.get('kinds') || '').split(',').map(kind => kind.trim()).filter(Boolean)
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 100) || 100, 1), 500)
      sendJson(res, 200, await store.exportChanges(auth.user, since, kinds, limit))
      return
    }

    if (req.method === 'POST' && url.pathname === '/call') {
      const body = await readJson(req)
      if (typeof body.method !== 'string' || !body.method) {
        sendJson(res, 400, { error: { code: 'invalid_params', message: 'method is required' } })
        return
      }
      if (methodLevel(body.method) === 'control' && auth.level !== 'control') {
        sendJson(res, 403, { error: { code: 'forbidden', message: `${body.method} needs the control key` } })
        return
      }
      try {
        const result = await hub.callDevice(
          auth.user,
          typeof body.device === 'string' ? body.device : undefined,
          body.method,
          body.params ?? {},
          typeof body.timeout === 'number' ? body.timeout : 120,
        )
        sendJson(res, 200, result.body, result.device ? { 'X-Iris-Device': result.device } : undefined)
      } catch (error) {
        const payload = relayErrorPayload(error)
        sendJson(res, payload.status, payload.body, payload.device ? { 'X-Iris-Device': payload.device } : undefined)
      }
      return
    }

    sendJson(res, 404, { error: { code: 'not_found', message: url.pathname } })
  }

  return {
    port,
    async close() {
      hub.close()
      for (const client of wss.clients) client.terminate()
      wss.close()
      await new Promise<void>((resolveClose, reject) => {
        server.close(error => error ? reject(error) : resolveClose())
      })
      await options.db.close()
    },
  }
}

const WEB_DIR = fileURLToPath(new URL('../../web/dist/', import.meta.url))
const SESSION_COOKIE = 'iris_session'
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
}
const APP_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"

/** The web app's routes get its index.html; any file in the build is served as is. Everything else goes on to auth. */
async function sendStatic(res: ServerResponse, dir: string, pathname: string, head: boolean): Promise<boolean> {
  const route = pathname === '/' || pathname === '/login' || pathname === '/app' || pathname.startsWith('/app/')
  const name = route ? 'index.html' : pathname.slice(1)
  if (!/^[\w-]+(\.[\w-]+)*(\/[\w-]+(\.[\w-]+)*)*$/.test(name)) return false
  const type = TYPES[extname(name)]
  if (!type) return false
  let body: Buffer
  try {
    body = await readFile(join(dir, name))
  } catch {
    return false
  }
  res.writeHead(200, {
    'content-type': type,
    'content-length': body.length,
    'cache-control': name.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    'content-security-policy': APP_CSP,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'same-origin',
  })
  res.end(head ? undefined : body)
  return true
}

function cookie(req: IncomingMessage, name: string): string {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return v.join('=')
  }
  return ''
}

function sessionCookie(req: IncomingMessage, value: string, maxAge: number): string {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(maxAge)}${secure}`
}

/** No Origin (curl, same-origin GET) or one whose host is this server's. */
function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  if (!origin) return true
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

function bearer(req: IncomingMessage): string {
  const header = req.headers.authorization || ''
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match?.[1] ?? ''
}

function limited(hits: Map<string, { n: number; reset: number }>, ip: string): boolean {
  const now = Date.now()
  const row = hits.get(ip)
  if (!row || now > row.reset) {
    hits.set(ip, { n: 1, reset: now + 60_000 })
    return false
  }
  row.n += 1
  return row.n > 600
}

function sendJson(res: ServerResponse, status: number, body: unknown, extra?: Record<string, string>) {
  if (res.headersSent) return
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    ...extra,
  })
  res.end(payload)
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buf.length
    if (size > MAX_BODY) throw new Error('body too large')
    chunks.push(buf)
  }
  if (!chunks.length) return {}
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('json object required')
  return parsed as Record<string, unknown>
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) {
  const need = (name: string) => {
    const value = process.env[name] || ''
    if (!value) {
      console.error(`${name} is required`)
      process.exit(1)
    }
    return value
  }
  const host = process.env.IRIS_HOST || '127.0.0.1'
  const port = Number(process.env.IRIS_PORT || 33030)
  startServer({
    deviceToken: process.env.IRIS_DEVICE_TOKEN || '',
    readKey: process.env.IRIS_READ_KEY || '',
    controlKey: process.env.IRIS_CONTROL_KEY || '',
    host,
    port,
    db: pgDb(need('IRIS_DATABASE_URL')),
  }).then(handle => {
    console.log(`[iris-server] http://${host}:${handle.port}`)
  }).catch(error => {
    console.error('[iris-server] failed:', (error as Error).message)
    process.exit(1)
  })
}
