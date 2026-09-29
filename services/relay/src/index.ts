import { createHash, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { WebSocketServer } from 'ws'
import { createHub, relayErrorPayload } from './hub.ts'
import { handleMcp } from './mcp.ts'
import { openStore, type SyncTombstone } from './store.ts'

const MAX_BODY = 32 * 1024 * 1024

export interface RelayOptions {
  token: string
  host: string
  port: number
  dataFile: string
}

export async function startRelay(options: RelayOptions) {
  const store = openStore(options.dataFile)
  const hub = createHub(store)
  const hits = new Map<string, { n: number; reset: number }>()

  const server = createServer((req, res) => {
    void onRequest(req, res).catch(error => {
      console.error('[iris-relay] request failed:', (error as Error).message)
      sendJson(res, 500, { error: { code: 'internal', message: 'internal error' } })
    })
  })

  const wss = new WebSocketServer({ server, path: '/extension' })
  wss.on('connection', socket => {
    const timer = setTimeout(() => socket.close(4001, 'auth timeout'), 5000)
    socket.once('message', data => {
      clearTimeout(timer)
      let msg: { method?: string; params?: { token?: unknown; deviceId?: unknown; label?: unknown } }
      try {
        msg = JSON.parse(String(data)) as typeof msg
      } catch {
        socket.close(4001, 'unauthorized')
        return
      }
      const token = typeof msg.params?.token === 'string' ? msg.params.token : ''
      const deviceId = typeof msg.params?.deviceId === 'string' ? msg.params.deviceId : ''
      const label = typeof msg.params?.label === 'string' ? msg.params.label : ''
      if (msg.method !== 'auth' || !tokenOk(token, options.token) || !deviceId || deviceId.length > 80) {
        socket.close(4001, 'unauthorized')
        return
      }
      socket.send(JSON.stringify({ v: 1, method: 'auth', result: { ok: true } }))
      hub.register(socket, deviceId, label)
      console.log(`[iris-relay] device connected ${deviceId}`)
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

  async function onRequest(req: IncomingMessage, res: ServerResponse) {
    if (limited(hits, req.socket.remoteAddress || '')) {
      sendJson(res, 429, { error: { code: 'rate_limited', message: 'too many requests' } })
      return
    }
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    if (!tokenOk(bearer(req), options.token)) {
      sendJson(res, 401, { error: { code: 'unauthorized', message: 'unauthorized' } })
      return
    }

    if (req.method === 'GET' && (url.pathname === '/status' || url.pathname === '/devices')) {
      sendJson(res, 200, hub.status())
      return
    }

    if (req.method === 'GET' && url.pathname === '/sync/conversations') {
      const since = Number(url.searchParams.get('since') || 0)
      sendJson(res, 200, store.since(Number.isFinite(since) ? since : 0))
      return
    }

    if (req.method === 'POST' && url.pathname === '/sync/conversations') {
      const body = await readJson(req)
      const conversations = Array.isArray(body.conversations) ? body.conversations : []
      const tombstones = asTombstones(body.tombstones)
      sendJson(res, 200, { rejected: store.push(conversations, tombstones) })
      return
    }

    if (req.method === 'POST' && url.pathname === '/call') {
      const body = await readJson(req)
      if (typeof body.method !== 'string' || !body.method) {
        sendJson(res, 400, { error: { code: 'invalid_params', message: 'method is required' } })
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
        sendCallError(res, error)
      }
      return
    }

    if (req.method === 'POST' && url.pathname === '/mcp') {
      const body = await readJson(req)
      const outcome = await handleMcp(body, hub)
      if (outcome.json === undefined) {
        res.writeHead(outcome.status)
        res.end()
        return
      }
      sendJson(res, outcome.status, outcome.json)
      return
    }

    sendJson(res, 404, { error: { code: 'not_found', message: url.pathname } })
  }

  return {
    port,
    async close() {
      for (const client of wss.clients) client.terminate()
      wss.close()
      await new Promise<void>((resolveClose, reject) => {
        server.close(error => error ? reject(error) : resolveClose())
      })
      store.close()
    },
  }
}

function bearer(req: IncomingMessage): string {
  const header = req.headers.authorization || ''
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match?.[1] ?? ''
}

function tokenOk(got: string, expected: string): boolean {
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

function sendCallError(res: ServerResponse, error: unknown) {
  const payload = relayErrorPayload(error)
  sendJson(res, payload.status, payload.body, payload.device ? { 'X-Iris-Device': payload.device } : undefined)
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

function asTombstones(value: unknown): SyncTombstone[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(entry => {
    if (!entry || typeof entry !== 'object') return []
    const row = entry as { id?: unknown; deletedAt?: unknown }
    if (typeof row.id !== 'string' || typeof row.deletedAt !== 'number') return []
    return [{ id: row.id, deletedAt: row.deletedAt }]
  })
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) {
  const token = process.env.IRIS_RELAY_TOKEN || ''
  if (!token) {
    console.error('IRIS_RELAY_TOKEN is required')
    process.exit(1)
  }
  const host = process.env.IRIS_RELAY_HOST || '127.0.0.1'
  const port = Number(process.env.IRIS_RELAY_PORT || process.env.PORT || 8787)
  const dataDir = process.env.IRIS_RELAY_DATA || './data'
  startRelay({
    token,
    host,
    port,
    dataFile: resolve(dataDir, 'iris-relay.sqlite'),
  }).then(handle => {
    console.log(`[iris-relay] http://${host}:${handle.port}`)
  }).catch(error => {
    console.error('[iris-relay] failed:', (error as Error).message)
    process.exit(1)
  })
}
