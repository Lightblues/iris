import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CONVERSATIONS_KEY, CONVERSATION_TOMBSTONES_KEY, createSync, defaultCollections,
  type PushRecord, type ServerRecord, type SyncStorage, type SyncTransport,
} from './sync'

const SETTINGS = 'sidepanel_settings'

/** Fast-forward on a matching base; otherwise the server's copy wins and is returned. */
function fakeServer() {
  const records = new Map<string, ServerRecord>()
  let rev = 0
  const pushes: PushRecord[] = []
  const transport: SyncTransport = {
    async push(batch) {
      pushes.push(...batch)
      return batch.map(rec => {
        const key = `${rec.kind}/${rec.id}`
        const cur = records.get(key)
        if (cur && cur.rev !== rec.baseRev) return { kind: rec.kind, id: rec.id, rev: cur.rev, record: cur }
        const next: ServerRecord = { kind: rec.kind, id: rec.id, rev: ++rev, updatedAt: rec.updatedAt, deleted: rec.deleted === true, body: rec.deleted ? null : rec.body }
        records.set(key, next)
        return { kind: rec.kind, id: rec.id, rev: next.rev }
      })
    },
    async pull(since) {
      const all = [...records.values()].filter(r => r.rev > since).sort((a, b) => a.rev - b.rev)
      return { records: all.slice(0, 2), cursor: all.slice(0, 2).at(-1)?.rev ?? since, more: all.length > 2 }
    },
  }
  return { records, transport, pushes }
}

function memory(initial: Record<string, unknown> = {}): SyncStorage & { data: Record<string, unknown> } {
  const data = structuredClone(initial)
  return {
    data,
    async get(keys) { return Object.fromEntries(keys.filter(k => k in data).map(k => [k, structuredClone(data[k])])) },
    async set(items) { Object.assign(data, structuredClone(items)) },
  }
}

const conv = (id: string, lastUpdated: number) => ({ id, title: id, messages: [], urls: [], skills: [], createdAt: 1, lastUpdated })
const skill = (name: string, author: string, body = 'x') => ({ name, description: name, enabled: true, author, files: { 'SKILL.md': body }, updatedAt: 1 })

function device(server: ReturnType<typeof fakeServer>, initial: Record<string, unknown> = {}) {
  const storage = memory(initial)
  let resynced = 0
  const sync = createSync({ storage, transport: server.transport, collections: defaultCollections(SETTINGS, async () => { resynced++ }), server: 'wss://iris.test' })
  return { storage, sync, resynced: () => resynced }
}

test('records written on one device reach the other, and edits flow back', async () => {
  const server = fakeServer()
  const a = device(server, {
    [CONVERSATIONS_KEY]: { conversations: [conv('c1', 5)], activeConversationId: 'c1' },
    iris_skills: [skill('builtin-one', 'builtin'), skill('mine', 'agent')],
    iris_scripts: [{ id: 's1', source: '// s', enabled: true }],
    [SETTINGS]: { apiKey: 'k', model: 'm', remoteRelayToken: 'device-only', remoteRelayLabel: 'mbp' },
  })
  await a.sync.run()
  assert.deepEqual([...server.records.keys()].sort(), ['conversation/c1', 'script/s1', 'setting/apiKey', 'setting/model', 'skill/mine'])

  const b = device(server, { [SETTINGS]: { remoteRelayLabel: 'mini', model: 'old' }, iris_skills: [skill('builtin-one', 'builtin')] })
  await b.sync.run()
  const bSettings = b.storage.data[SETTINGS] as Record<string, unknown>
  assert.equal(bSettings.apiKey, 'k')
  assert.equal(bSettings.remoteRelayLabel, 'mini')
  assert.equal(bSettings.remoteRelayToken, undefined)
  assert.equal(bSettings.model, 'm', 'on first sync the server copy wins over a local value')
  assert.deepEqual((b.storage.data.iris_skills as { name: string }[]).map(s => s.name).sort(), ['builtin-one', 'mine'])
  assert.equal(b.resynced(), 1)
  assert.deepEqual((b.storage.data[CONVERSATIONS_KEY] as { conversations: { id: string }[] }).conversations.map(c => c.id), ['c1'])

  const edited = (b.storage.data.iris_skills as ReturnType<typeof skill>[]).map(s => s.name === 'mine' ? { ...s, files: { 'SKILL.md': 'y' }, updatedAt: 2 } : s)
  b.storage.data.iris_skills = edited
  server.pushes.length = 0
  await b.sync.run()
  assert.deepEqual(server.pushes.map(p => `${p.kind}/${p.id}`), ['skill/mine'])
  await a.sync.run()
  const mine = (a.storage.data.iris_skills as ReturnType<typeof skill>[]).find(s => s.name === 'mine')!
  assert.equal(mine.files['SKILL.md'], 'y')

  server.pushes.length = 0
  await a.sync.run()
  assert.deepEqual(server.pushes, [], 'an applied record is not echoed back')
})

test('an evicted conversation stays on the server; a deleted one is pushed as deleted', async () => {
  const server = fakeServer()
  const a = device(server, { [CONVERSATIONS_KEY]: { conversations: [conv('old', 1), conv('gone', 2)], activeConversationId: null } })
  await a.sync.run()
  a.storage.data[CONVERSATIONS_KEY] = { conversations: [], activeConversationId: null }
  a.storage.data[CONVERSATION_TOMBSTONES_KEY] = [{ id: 'gone', deletedAt: 3 }]
  server.pushes.length = 0
  await a.sync.run()
  assert.deepEqual(server.pushes.map(p => `${p.id}:${p.deleted === true}`), ['gone:true'])
  assert.equal(server.records.get('conversation/old')!.deleted, false)
})

test('a conflicting push takes the server copy back into storage', async () => {
  const server = fakeServer()
  const a = device(server, { iris_reports: [{ id: 'r1', name: 'r.md', content: 'v1', updated: 1 }] })
  await a.sync.run()
  const b = device(server)
  await b.sync.run()
  a.storage.data.iris_reports = [{ id: 'r1', name: 'r.md', content: 'from a', updated: 2 }]
  b.storage.data.iris_reports = [{ id: 'r1', name: 'r.md', content: 'from b', updated: 3 }]
  await a.sync.run()
  await b.sync.run()
  assert.equal((b.storage.data.iris_reports as { content: string }[])[0].content, 'from a')
  assert.deepEqual(b.sync.errors(), [])
})

test('state from another server starts over', async () => {
  const server = fakeServer()
  const a = device(server, { iris_reports: [{ id: 'r1', name: 'r.md', content: 'v1', updated: 1 }] })
  await a.sync.run()
  const other = fakeServer()
  const again = createSync({ storage: a.storage, transport: other.transport, collections: defaultCollections(SETTINGS, async () => {}), server: 'wss://elsewhere' })
  await again.run()
  assert.deepEqual([...other.records.keys()], ['report/r1'])
})
