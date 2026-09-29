import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { WebSocket } from 'ws'
import { MAX_RECORD_BYTES } from './store.ts'
import { startRelay } from './index.ts'

const TOKEN = 'test-token'

async function boot() {
  const dir = await mkdtemp(join(tmpdir(), 'iris-relay-'))
  const relay = await startRelay({
    token: TOKEN,
    host: '127.0.0.1',
    port: 0,
    dataFile: join(dir, 'iris-relay.sqlite'),
  })
  return {
    port: relay.port,
    async stop() {
      await relay.close()
      await rm(dir, { recursive: true, force: true })
    },
  }
}

function headers(token = TOKEN): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

function connectDevice(port: number, deviceId: string, onCall?: (msg: { id: number; method?: string; params?: unknown }, ws: WebSocket) => void, label = deviceId) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/extension`)
  return new Promise<WebSocket>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('connect timeout')), 3000)
    ws.on('error', reject)
    ws.on('message', data => {
      const msg = JSON.parse(String(data)) as { id?: number; method?: string; params?: unknown; result?: { ok?: boolean } }
      if (msg.method === 'auth' && msg.result?.ok) {
        ws.send(JSON.stringify({ v: 1, method: 'hello', params: { methods: ['browser.fetch'] } }))
        clearTimeout(timer)
        resolve(ws)
        return
      }
      if (typeof msg.id === 'number' && msg.id > 0) onCall?.(msg as { id: number; method?: string; params?: unknown }, ws)
    })
    ws.on('open', () => {
      ws.send(JSON.stringify({ v: 1, method: 'auth', params: { token: TOKEN, deviceId, label } }))
    })
  })
}

function rpc(ws: WebSocket, method: string, params: unknown) {
  const id = -Math.floor(Math.random() * 1_000_000) - 1
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 3000)
    const onMessage = (data: unknown) => {
      const msg = JSON.parse(String(data)) as { id?: number; result?: Record<string, unknown> }
      if (msg.id !== id) return
      clearTimeout(timer)
      ws.off('message', onMessage)
      resolve(msg.result ?? {})
    }
    ws.on('message', onMessage)
    ws.send(JSON.stringify({ v: 1, id, method, params }))
  })
}

test('rejects missing and wrong tokens', async () => {
  const relay = await boot()
  try {
    const open = await fetch(`http://127.0.0.1:${relay.port}/status`)
    assert.equal(open.status, 401)
    const wrong = await fetch(`http://127.0.0.1:${relay.port}/status`, { headers: headers('nope') })
    assert.equal(wrong.status, 401)
    const ws = new WebSocket(`ws://127.0.0.1:${relay.port}/extension`)
    const code = await new Promise<number>(resolve => {
      ws.on('open', () => ws.send(JSON.stringify({ v: 1, method: 'auth', params: { token: 'nope', deviceId: 'x' } })))
      ws.on('close', closeCode => resolve(closeCode))
    })
    assert.equal(code, 4001)
  } finally {
    await relay.stop()
  }
})

test('routes calls and returns the device that answered', async () => {
  const relay = await boot()
  try {
    const home = await connectDevice(relay.port, 'home', (msg, ws) => {
      ws.send(JSON.stringify({ v: 1, id: msg.id, result: { at: 'home', method: msg.method } }))
    })
    const company = await connectDevice(relay.port, 'company', (msg, ws) => {
      if (msg.method === 'browser.fetch') {
        ws.send(JSON.stringify({ v: 1, id: msg.id, event: 'chunk', result: { part: 1 } }))
        ws.send(JSON.stringify({ v: 1, id: msg.id, event: 'end', result: { at: 'company' } }))
        return
      }
      ws.send(JSON.stringify({ v: 1, id: msg.id, error: { code: 'invalid_params', message: 'nope' } }))
    }, 'work')

    const status = await fetch(`http://127.0.0.1:${relay.port}/devices`, { headers: headers() })
    const listed = await status.json() as { extension_connected: boolean; methods: string[]; devices: { id: string }[] }
    assert.equal(listed.extension_connected, true)
    assert.deepEqual(listed.methods, ['browser.fetch'])
    assert.deepEqual(listed.devices.map(device => device.id).sort(), ['company', 'home'])

    const newest = await fetch(`http://127.0.0.1:${relay.port}/call`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ method: 'browser.fetch', params: { url: 'https://example.com' } }),
    })
    const newestBody = await newest.json() as { chunks: unknown[]; result: { at: string } }
    assert.equal(newest.headers.get('x-iris-device'), 'company')
    assert.equal(newestBody.chunks.length, 1)
    assert.equal(newestBody.result.at, 'company')

    const labeled = await fetch(`http://127.0.0.1:${relay.port}/call`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ method: 'browser.fetch', device: 'work', params: {} }),
    })
    assert.equal(labeled.headers.get('x-iris-device'), 'company')

    const chosen = await fetch(`http://127.0.0.1:${relay.port}/call`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ method: 'iris.tools.call', device: 'home', params: {} }),
    })
    const chosenBody = await chosen.json() as { at: string }
    assert.equal(chosen.headers.get('x-iris-device'), 'home')
    assert.equal(chosenBody.at, 'home')

    const failed = await fetch(`http://127.0.0.1:${relay.port}/call`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ method: 'iris.tools.call', device: 'company', params: {} }),
    })
    const failedBody = await failed.json() as { error: { code: string } }
    assert.equal(failed.status, 400)
    assert.equal(failed.headers.get('x-iris-device'), 'company')
    assert.equal(failedBody.error.code, 'invalid_params')

    await rpc(home, 'sync.push', { conversations: [{ id: 'c1', lastUpdated: 1, title: 'home' }] })
    const afterPush = await fetch(`http://127.0.0.1:${relay.port}/call`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ method: 'browser.list_tabs' }),
    })
    const afterBody = await afterPush.json() as { at: string }
    assert.equal(afterPush.headers.get('x-iris-device'), 'home')
    assert.equal(afterBody.at, 'home')

    const missing = await fetch(`http://127.0.0.1:${relay.port}/call`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ method: 'ping', device: 'missing' }),
    })
    assert.equal(missing.status, 503)
    home.close()
    company.close()
  } finally {
    await relay.stop()
  }
})

test('syncs conversations and tombstones', async () => {
  const relay = await boot()
  try {
    const pushed = await fetch(`http://127.0.0.1:${relay.port}/sync/conversations`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        conversations: [
          { id: 'keep', lastUpdated: 2, title: 'new' },
          { id: 'old', lastUpdated: 1, title: 'stale' },
        ],
      }),
    })
    assert.equal(pushed.status, 200)

    const again = await fetch(`http://127.0.0.1:${relay.port}/sync/conversations`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ conversations: [{ id: 'keep', lastUpdated: 2, title: 'older-write' }] }),
    })
    const againBody = await again.json() as { rejected: unknown[] }
    assert.deepEqual(againBody.rejected, [])

    const listed = await fetch(`http://127.0.0.1:${relay.port}/sync/conversations?since=1`, { headers: headers() })
    const listedBody = await listed.json() as { conversations: { id: string; title: string }[] }
    assert.deepEqual(listedBody.conversations, [{ id: 'keep', lastUpdated: 2, title: 'new' }])

    const huge = 'x'.repeat(MAX_RECORD_BYTES)
    const tooBig = await fetch(`http://127.0.0.1:${relay.port}/sync/conversations`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ conversations: [{ id: 'big', lastUpdated: 3, title: huge }] }),
    })
    const tooBigBody = await tooBig.json() as { rejected: { id: string; error: string }[] }
    assert.deepEqual(tooBigBody.rejected, [{ id: 'big', error: 'too_large' }])

    const ws = await connectDevice(relay.port, 'home')
    const reconciled = await rpc(ws, 'sync.reconcile', {
      conversations: [{ id: 'local', lastUpdated: 9 }],
      tombstones: [{ id: 'old', deletedAt: 8 }],
    })
    const remote = reconciled.conversations as { id: string }[]
    assert.deepEqual(remote.map(item => item.id), ['keep'])
    assert.deepEqual(reconciled.push, ['local'])
    assert.deepEqual(reconciled.tombstones, [])

    const afterDelete = await fetch(`http://127.0.0.1:${relay.port}/sync/conversations?since=0`, { headers: headers() })
    const deleted = await afterDelete.json() as { conversations: { id: string }[]; tombstones: { id: string }[] }
    assert.equal(deleted.conversations.some(item => item.id === 'old'), false)
    assert.equal(deleted.tombstones.some(item => item.id === 'old'), true)
    ws.close()
  } finally {
    await relay.stop()
  }
})

test('mcp iris_call forwards to the browser', async () => {
  const relay = await boot()
  try {
    await connectDevice(relay.port, 'home', (msg, ws) => {
      ws.send(JSON.stringify({ v: 1, id: msg.id, result: { tabs: 1 } }))
    })
    const init = await fetch(`http://127.0.0.1:${relay.port}/mcp`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } }),
    })
    assert.equal(init.status, 200)
    const call = await fetch(`http://127.0.0.1:${relay.port}/mcp`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'iris_call', arguments: { method: 'browser.list_tabs', params: {} } },
      }),
    })
    const body = await call.json() as { result: { isError: boolean; content: { text: string }[] } }
    assert.equal(body.result.isError, false)
    assert.equal(JSON.parse(body.result.content[0].text).tabs, 1)
  } finally {
    await relay.stop()
  }
})
