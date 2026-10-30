import { createHash, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { WebSocketServer } from 'ws'
import { asLevel, createHub, methodLevel, relayErrorPayload, type Liveness } from './hub.ts'
import { DEFAULT_USER, EXPORT_KINDS, migrate, openStore, pgDb, type Db } from './store.ts'

const MAX_BODY = 32 * 1024 * 1024

export interface ServerOptions {
  /** What extensions send in the WebSocket auth frame. */
  deviceToken: string
  /** Read-level relay calls, device status, and /export. */
  readKey: string
  /** Every relay method. Empty turns control calls off. */
  controlKey?: string
  host: string
  port: number
  db: Db
  liveness?: Liveness
}

type KeyLevel = 'read' | 'control'

export async function startServer(options: ServerOptions) {
  await migrate(options.db)
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
    socket.once('message', data => {
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
      if (msg.method !== 'auth' || !tokenOk(token, options.deviceToken) || !deviceId || deviceId.length > 80) {
        socket.close(4001, 'unauthorized')
        return
      }
      socket.send(JSON.stringify({ v: 1, method: 'auth', result: { ok: true } }))
      hub.register(socket, deviceId, label, asLevel(msg.params?.level))
      console.log(`[iris-server] device connected ${deviceId}`)
    })
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

  function keyLevel(req: IncomingMessage): KeyLevel | null {
    const got = bearer(req)
    if (options.controlKey && tokenOk(got, options.controlKey)) return 'control'
    if (tokenOk(got, options.readKey)) return 'read'
    return null
  }

  async function onRequest(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, { ok: true })
      return
    }
    if (limited(hits, req.socket.remoteAddress || '')) {
      sendJson(res, 429, { error: { code: 'rate_limited', message: 'too many requests' } })
      return
    }
    const level = keyLevel(req)
    if (!level) {
      sendJson(res, 401, { error: { code: 'unauthorized', message: 'unauthorized' } })
      return
    }

    if (req.method === 'GET' && (url.pathname === '/status' || url.pathname === '/devices')) {
      sendJson(res, 200, hub.status())
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
      sendJson(res, 200, await store.exportChanges(DEFAULT_USER, since, kinds, limit))
      return
    }

    if (req.method === 'POST' && url.pathname === '/call') {
      const body = await readJson(req)
      if (typeof body.method !== 'string' || !body.method) {
        sendJson(res, 400, { error: { code: 'invalid_params', message: 'method is required' } })
        return
      }
      if (methodLevel(body.method) === 'control' && level !== 'control') {
        sendJson(res, 403, { error: { code: 'forbidden', message: `${body.method} needs the control key` } })
        return
      }
      try {
        const result = await hub.callDevice(
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

function bearer(req: IncomingMessage): string {
  const header = req.headers.authorization || ''
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match?.[1] ?? ''
}

function tokenOk(got: string, expected: string): boolean {
  if (!got || !expected) return false
  const a = createHash('sha256').update(got).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
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
    deviceToken: need('IRIS_DEVICE_TOKEN'),
    readKey: need('IRIS_READ_KEY'),
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
