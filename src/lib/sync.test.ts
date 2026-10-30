import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  batchBySize, canonicalJson, CONVERSATIONS_KEY, CONVERSATION_TOMBSTONES_KEY, createSync, defaultCollections, editTimesKey,
  type PushRecord, type ServerRecord, type SyncStorage, type SyncTransport,
} from './sync'
import { DEFAULT_SETTINGS, SETTINGS_KEY as SETTINGS, saveSettings, updateSettings } from './sidepanelSettings'

const EDITED = editTimesKey(SETTINGS)

/** Points chrome.storage at one device's memory storage, for the settings helpers. */
function useChrome(storage: { data: Record<string, unknown> }) {
  const area = {
    async get(keys: string | string[]) {
      return Object.fromEntries([keys].flat().filter(k => k in storage.data).map(k => [k, structuredClone(storage.data[k])]))
    },
    async set(items: Record<string, unknown>) { Object.assign(storage.data, structuredClone(items)) },
  }
  ;(globalThis as any).chrome = { storage: { local: area, sync: area } }
}

/** Like the real server: fast-forward on a matching base; otherwise the later `updatedAt` wins and a losing push gets the stored copy. */
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
        if (cur && canonicalJson(cur.body) === canonicalJson(rec.deleted ? null : rec.body)) return { kind: rec.kind, id: rec.id, rev: cur.rev }
        if (cur && cur.rev !== rec.baseRev && rec.updatedAt <= cur.updatedAt) return { kind: rec.kind, id: rec.id, rev: cur.rev, record: cur }
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
  a.storage.data.iris_reports = [{ id: 'r1', name: 'r.md', content: 'from a', updated: 3 }]
  b.storage.data.iris_reports = [{ id: 'r1', name: 'r.md', content: 'from b', updated: 2 }]
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

test('push batches split by count and by size, and an oversized item goes alone', () => {
  const item = (n: number) => ({ id: String(n), text: 'x'.repeat(n) })
  assert.deepEqual(batchBySize([1, 2, 3, 4, 5].map(() => item(1)), 2, 1e6).map(b => b.length), [2, 2, 1])
  assert.deepEqual(batchBySize([item(100), item(100), item(500), item(100)], 20, 300).map(b => b.map(x => x.text.length)), [[100, 100], [500], [100]])
  assert.deepEqual(batchBySize([], 20, 300), [])
})

test('a pulled record whose keys come back in another order is not pushed again', async () => {
  const server = fakeServer()
  const a = device(server, { iris_skills: [skill('mine', 'agent')] })
  await a.sync.run()
  const reversed = (o: object) => Object.fromEntries(Object.entries(o).reverse())
  for (const rec of server.records.values()) rec.body = reversed(rec.body as object)
  const b = device(server)
  await b.sync.run()
  b.storage.data.iris_skills = (b.storage.data.iris_skills as object[]).map(reversed)
  server.pushes.length = 0
  await b.sync.run()
  await a.sync.run()
  assert.deepEqual(server.pushes, [])
})

test('a new device takes the server settings over its defaults', async () => {
  const server = fakeServer()
  const a = device(server, { [SETTINGS]: { apiKey: 'k', baseUrl: 'u' } })
  await a.sync.run()
  const b = device(server, { [SETTINGS]: { apiKey: '', baseUrl: 'default' } })
  await b.sync.run()
  assert.deepEqual(b.storage.data[SETTINGS], { apiKey: 'k', baseUrl: 'u' })
})

test('a stale device saving defaults after its first sync does not overwrite a newer edit (2026-10-28)', async () => {
  const server = fakeServer()
  const a = device(server)
  useChrome(a.storage)
  await updateSettings({ apiKey: 'k' }, 100)
  await a.sync.run()

  const b = device(server)
  useChrome(b.storage)
  await saveSettings({ ...DEFAULT_SETTINGS })
  await b.sync.run()
  assert.equal((b.storage.data[SETTINGS] as { apiKey: string }).apiKey, 'k')
  assert.equal((b.storage.data[EDITED] as Record<string, number>).apiKey, 100, 'an applied value keeps its edit time')

  // A panel opened before that sync writes its whole stale copy back.
  await saveSettings({ ...DEFAULT_SETTINGS })
  await updateSettings({ model: 'other' }, 150)
  await b.sync.run()
  assert.equal((server.records.get('setting/apiKey')!.body as { value: string }).value, 'k')
  assert.equal((b.storage.data[SETTINGS] as { apiKey: string }).apiKey, 'k', 'the server copy comes back')
  await a.sync.run()
  assert.equal((a.storage.data[SETTINGS] as { apiKey: string; model: string }).apiKey, 'k')
  assert.equal((a.storage.data[SETTINGS] as { model: string }).model, 'other', 'the real edit in that save still syncs')
})

test('a later edit on another device wins; an older one loses', async () => {
  const server = fakeServer()
  const a = device(server)
  useChrome(a.storage)
  await updateSettings({ apiKey: 'k' }, 100)
  await a.sync.run()
  const b = device(server)
  await b.sync.run()

  useChrome(b.storage)
  await updateSettings({ apiKey: 'k2' }, 200)
  useChrome(a.storage)
  await updateSettings({ apiKey: 'offline' }, 150)
  await b.sync.run()
  await a.sync.run()
  assert.equal((server.records.get('setting/apiKey')!.body as { value: string }).value, 'k2')
  assert.equal((a.storage.data[SETTINGS] as { apiKey: string }).apiKey, 'k2')
  assert.equal((a.storage.data[EDITED] as Record<string, number>).apiKey, 200)

  useChrome(a.storage)
  await updateSettings({ apiKey: 'k3' }, 300)
  await a.sync.run()
  await b.sync.run()
  assert.equal((b.storage.data[SETTINGS] as { apiKey: string }).apiKey, 'k3')
})

test('an install from before edit times keeps its values and its next edit still wins', async () => {
  const server = fakeServer()
  const a = device(server, { [SETTINGS]: { apiKey: 'k', model: 'm' } })
  await a.sync.run()
  delete a.storage.data[EDITED]
  for (const rec of server.records.values()) rec.updatedAt = 5000 // push times, as older versions sent
  server.pushes.length = 0
  await a.sync.run()
  assert.deepEqual(server.pushes, [])
  assert.deepEqual(a.storage.data[SETTINGS], { apiKey: 'k', model: 'm' })

  useChrome(a.storage)
  await updateSettings({ apiKey: 'k2' })
  await a.sync.run()
  assert.equal((server.records.get('setting/apiKey')!.body as { value: string }).value, 'k2')
})
