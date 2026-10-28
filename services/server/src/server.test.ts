import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { WebSocket } from 'ws'
import { startServer } from './index.ts'
import { DEFAULT_USER, MAX_RECORD_BYTES, migrate, openStore, type Db } from './store.ts'

const DEVICE = 'device-token'
const READ = 'read-key'
const CONTROL = 'control-key'

function pgliteDb(): Db {
  const pg = new PGlite()
  const wrap = (q: { query: PGlite['query']; exec: PGlite['exec'] }) => async (text: string, params?: unknown[]) => {
    if (params?.length) return await q.query(text, params) as never
    const results = await q.exec(text)
    return { rows: results.at(-1)?.rows ?? [] } as never
  }
  return {
    query: wrap(pg),
    tx: fn => pg.transaction(tx => fn(wrap(tx as never))),
    close: () => pg.close(),
  }
}

async function boot(controlKey = CONTROL) {
  const server = await startServer({ deviceToken: DEVICE, readKey: READ, controlKey, host: '127.0.0.1', port: 0, db: pgliteDb() })
  const base = `http://127.0.0.1:${server.port}`
  return {
    port: server.port,
    get: (path: string, key = READ) => fetch(`${base}${path}`, { headers: headers(key) }),
    call: (body: unknown, key = READ) => fetch(`${base}/call`, { method: 'POST', headers: headers(key), body: JSON.stringify(body) }),
    stop: () => server.close(),
  }
}

function headers(key: string): Record<string, string> {
  return { authorization: `Bearer ${key}`, 'content-type': 'application/json' }
}

type Call = { id: number; method?: string; params?: unknown }

function connectDevice(port: number, deviceId: string, level: string, onCall?: (msg: Call, ws: WebSocket) => void, label = deviceId) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/extension`)
  return new Promise<WebSocket>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('connect timeout')), 3000)
    ws.on('error', reject)
    ws.on('message', data => {
      const msg = JSON.parse(String(data)) as Call & { result?: { ok?: boolean } }
      if (msg.method === 'auth' && msg.result?.ok) {
        ws.send(JSON.stringify({ v: 1, method: 'hello', params: { methods: [], level } }))
        clearTimeout(timer)
        setTimeout(() => resolve(ws), 20)
        return
      }
      if (typeof msg.id === 'number' && msg.id > 0) onCall?.(msg, ws)
    })
    ws.on('open', () => {
      ws.send(JSON.stringify({ v: 1, method: 'auth', params: { token: DEVICE, deviceId, label, level } }))
    })
  })
}

let rpcId = 0
function rpc<T = Record<string, unknown>>(ws: WebSocket, method: string, params: unknown) {
  const id = --rpcId
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 3000)
    const onMessage = (data: unknown) => {
      const msg = JSON.parse(String(data)) as { id?: number; result?: T }
      if (msg.id !== id) return
      clearTimeout(timer)
      ws.off('message', onMessage)
      resolve(msg.result as T)
    }
    ws.on('message', onMessage)
    ws.send(JSON.stringify({ v: 1, id, method, params }))
  })
}

const echo = (at: string) => (msg: Call, ws: WebSocket) => ws.send(JSON.stringify({ v: 1, id: msg.id, result: { at, method: msg.method } }))

test('each credential opens only its own door', async () => {
  const server = await boot()
  try {
    assert.equal((await fetch(`http://127.0.0.1:${server.port}/health`)).status, 200)
    assert.equal((await server.get('/status', 'nope')).status, 401)
    assert.equal((await server.get('/status', DEVICE)).status, 401)
    assert.equal((await server.get('/status')).status, 200)
    assert.equal((await server.get('/mcp')).status, 404)
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/extension`)
    const code = await new Promise<number>(resolve => {
      ws.on('open', () => ws.send(JSON.stringify({ v: 1, method: 'auth', params: { token: READ, deviceId: 'x' } })))
      ws.on('close', closeCode => resolve(closeCode))
    })
    assert.equal(code, 4001)
  } finally {
    await server.stop()
  }
})

test('read calls go to read devices; control calls need the control key and a control device', async () => {
  const server = await boot()
  try {
    const mbp = await connectDevice(server.port, 'mbp', 'read', echo('mbp'))
    const mini = await connectDevice(server.port, 'mini', 'control', (msg, ws) => {
      if (msg.method === 'iris.chat.export_all') {
        ws.send(JSON.stringify({ v: 1, id: msg.id, event: 'chunk', result: { part: 1 } }))
        ws.send(JSON.stringify({ v: 1, id: msg.id, result: { count: 1 } }))
        return
      }
      echo('mini')(msg, ws)
    }, 'agent-mini')
    const off = await connectDevice(server.port, 'quiet', 'off', echo('quiet'))

    const listed = await (await server.get('/devices')).json() as { devices: { id: string; level: string }[] }
    assert.deepEqual(listed.devices.map(d => `${d.id}:${d.level}`).sort(), ['mbp:read', 'mini:control', 'quiet:off'])

    const read = await server.call({ method: 'browser.fetch', params: { url: 'https://example.com' } })
    assert.equal(read.status, 200)
    assert.equal(read.headers.get('x-iris-device'), 'mini')

    const readByLabel = await server.call({ method: 'browser.fetch', device: 'agent-mini' })
    assert.equal(readByLabel.headers.get('x-iris-device'), 'mini')

    assert.equal((await server.call({ method: 'browser.list_tabs' })).status, 403)
    const control = await server.call({ method: 'browser.list_tabs' }, CONTROL)
    assert.equal(control.headers.get('x-iris-device'), 'mini')
    assert.equal((await control.json() as { at: string }).at, 'mini')

    const pinned = await server.call({ method: 'browser.list_tabs', device: 'mbp' }, CONTROL)
    assert.equal(pinned.status, 403)
    assert.equal((await server.call({ method: 'browser.fetch', device: 'quiet' })).status, 403)

    const streamed = await (await server.call({ method: 'iris.chat.export_all', device: 'mini', params: { platform: 'chatgpt' } })).json() as { chunks: unknown[]; result: { count: number } }
    assert.equal(streamed.chunks.length, 1)
    assert.equal(streamed.result.count, 1)

    mini.close()
    await new Promise(resolve => setTimeout(resolve, 50))
    const none = await server.call({ method: 'browser.list_tabs' }, CONTROL)
    assert.equal(none.status, 503)
    assert.equal((await server.call({ method: 'browser.fetch', device: 'missing' })).status, 503)
    mbp.close()
    off.close()
  } finally {
    await server.stop()
  }
})

test('control calls are off when no control key is set', async () => {
  const server = await boot('')
  try {
    await connectDevice(server.port, 'mini', 'control', echo('mini'))
    assert.equal((await server.call({ method: 'browser.list_tabs' }, '')).status, 401)
    assert.equal((await server.call({ method: 'browser.list_tabs' })).status, 403)
  } finally {
    await server.stop()
  }
})

type Results = { results: { kind: string; id: string; rev?: number; error?: string; unchanged?: boolean; record?: { body: { messages: { id: string }[]; title?: string } | null; deleted: boolean } }[] }
type Pulled = { records: { kind: string; id: string; rev: number; deleted: boolean; body: unknown }[]; cursor: number; more: boolean }

const conv = (id: string, updatedAt: number, messages: string[], title = id) => ({
  kind: 'conversation', id, updatedAt, body: { id, title, lastUpdated: updatedAt, messages: messages.map(m => ({ id: m, role: 'user', parts: [{ type: 'text', text: m }] })) },
})

test('sync: fast-forward replaces, a stale base merges conversations by message and keeps the newer other record', async () => {
  const server = await boot()
  try {
    const mbp = await connectDevice(server.port, 'mbp', 'read')
    const mini = await connectDevice(server.port, 'mini', 'control')

    const first = await rpc<Results>(mbp, 'sync.push', { records: [{ ...conv('c1', 1, ['a', 'b']), baseRev: 0 }] })
    const rev1 = first.results[0].rev!
    assert.ok(rev1 > 0)
    assert.equal(first.results[0].record, undefined)

    const ff = await rpc<Results>(mbp, 'sync.push', { records: [{ ...conv('c1', 2, ['a', 'b2']), baseRev: rev1 }] })
    assert.equal(ff.results[0].record, undefined)
    const rev2 = ff.results[0].rev!

    const stale = await rpc<Results>(mini, 'sync.push', { records: [{ ...conv('c1', 3, ['a', 'b', 'c'], 'mini title'), baseRev: rev1 }] })
    const merged = stale.results[0].record!
    assert.deepEqual(merged.body!.messages.map(m => m.id), ['a', 'b2', 'b', 'c'])
    assert.equal(merged.body!.title, 'mini title')
    assert.ok(stale.results[0].rev! > rev2)

    await rpc(mbp, 'sync.push', { records: [{ kind: 'setting', id: 'model', updatedAt: 10, body: { value: 'x' }, baseRev: 0 }] })
    const lost = await rpc<Results>(mini, 'sync.push', { records: [{ kind: 'setting', id: 'model', updatedAt: 5, body: { value: 'y' }, baseRev: 0 }] })
    assert.deepEqual(lost.results[0].record!.body, { value: 'x' })

    const deleted = await rpc<Results>(mbp, 'sync.push', { records: [{ kind: 'skill', id: 's1', updatedAt: 4, body: { name: 's1', files: { a: 1 } }, baseRev: 0 }] })
    const same = await rpc<Results>(mini, 'sync.push', { records: [{ kind: 'skill', id: 's1', updatedAt: 99, body: { files: { a: 1 }, name: 's1' }, baseRev: 0 }] })
    assert.equal(same.results[0].unchanged, true)
    assert.equal(same.results[0].rev, deleted.results[0].rev)
    await rpc(mbp, 'sync.push', { records: [{ kind: 'skill', id: 's1', updatedAt: 6, deleted: true, baseRev: deleted.results[0].rev }] })

    const bad = await rpc<Results>(mbp, 'sync.push', { records: [
      { kind: 'nope', id: 'x', updatedAt: 1, body: {}, baseRev: 0 },
      { kind: 'report', id: 'big', updatedAt: 1, body: { content: 'x'.repeat(MAX_RECORD_BYTES) }, baseRev: 0 },
    ] })
    assert.deepEqual(bad.results.map(r => r.error), ['unknown_kind', 'too_large'])

    const page1 = await rpc<Pulled>(mini, 'sync.pull', { since: 0, limit: 2 })
    assert.equal(page1.records.length, 2)
    assert.equal(page1.more, true)
    const page2 = await rpc<Pulled>(mini, 'sync.pull', { since: page1.cursor, limit: 50 })
    assert.equal(page2.more, false)
    const all = [...page1.records, ...page2.records]
    assert.deepEqual(all.map(r => `${r.kind}/${r.id}`).sort(), ['conversation/c1', 'setting/model', 'skill/s1'])
    assert.equal(all.find(r => r.id === 's1')!.deleted, true)
    const revs = all.map(r => r.rev)
    assert.deepEqual(revs, [...revs].sort((a, b) => a - b))
    mbp.close()
    mini.close()
  } finally {
    await server.stop()
  }
})

test('export serves conversations only, with a cursor, and drops inline images', async () => {
  const server = await boot()
  try {
    const mbp = await connectDevice(server.port, 'mbp', 'read')
    const image = `data:image/png;base64,${'A'.repeat(400)}`
    const withImage = conv('c1', 1, ['a'])
    ;(withImage.body.messages[0].parts as unknown[]).push({ type: 'file', url: image })
    await rpc(mbp, 'sync.push', { records: [
      { ...withImage, baseRev: 0 },
      { kind: 'setting', id: 'apiKey', updatedAt: 1, body: { value: 'secret' }, baseRev: 0 },
      { ...conv('c2', 2, ['b']), baseRev: 0 },
    ] })

    const kinds = await (await server.get('/export/kinds')).json() as { app: string; kinds: { kind: string }[] }
    assert.equal(kinds.app, 'iris')
    assert.deepEqual(kinds.kinds.map(k => k.kind), ['conversation'])

    const first = await (await server.get('/export/changes?limit=1')).json() as { items: { id: string; data: unknown }[]; cursor: string; more: boolean }
    assert.deepEqual(first.items.map(i => i.id), ['c1'])
    assert.equal(first.more, true)
    assert.equal(JSON.stringify(first.items[0].data).includes('base64'), false)
    const rest = await (await server.get(`/export/changes?since=${first.cursor}&kinds=conversation,setting`)).json() as { items: { id: string }[]; cursor: string; more: boolean }
    assert.deepEqual(rest.items.map(i => i.id), ['c2'])
    assert.equal(rest.more, false)
    const empty = await (await server.get(`/export/changes?since=${rest.cursor}`)).json() as { items: unknown[]; cursor: string }
    assert.deepEqual(empty.items, [])
    assert.equal(empty.cursor, rest.cursor)
    assert.equal((await server.get('/export/changes?since=x')).status, 400)
    mbp.close()
  } finally {
    await server.stop()
  }
})

test('a pull page stops at the byte cap but always carries one record', async () => {
  const db = pgliteDb()
  await migrate(db)
  const store = openStore(db)
  const big = 'x'.repeat(100_000)
  await store.push(DEFAULT_USER, ['a', 'b', 'c'].map(id => ({ kind: 'report', id, baseRev: 0, updatedAt: 1, body: { id, text: big } })))
  const first = await store.pull(DEFAULT_USER, 0, 50, 150_000)
  assert.deepEqual(first.records.map(r => r.id), ['a'])
  assert.equal(first.more, true)
  const second = await store.pull(DEFAULT_USER, first.cursor, 50, 250_000)
  assert.deepEqual(second.records.map(r => r.id), ['b', 'c'])
  assert.equal(second.more, false)
  const tiny = await store.pull(DEFAULT_USER, 0, 50, 10)
  assert.deepEqual(tiny.records.map(r => r.id), ['a'])
  await db.close()
})
