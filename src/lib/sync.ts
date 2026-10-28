// Record sync with the Iris server. The server keeps every record with a rev that only grows;
// this side keeps, per record, the rev it last saw and a version of the body it last sent or applied.
// A local body whose version differs from that is an unsent edit: it is pushed with the old rev as its base,
// and the server merges when someone else wrote in between.

import type { Conversation, ConversationStore } from '../agent/types'
import type { StoredReport } from './reportStore'
import type { StoredScript } from './scriptStore'
import type { StoredSkill } from './skillStore'
import type { SidePanelSettings } from './sidepanelSettings'

export type SyncKind = 'conversation' | 'skill' | 'script' | 'report' | 'setting'

export interface PushRecord {
  kind: SyncKind
  id: string
  baseRev: number
  updatedAt: number
  deleted?: boolean
  body?: unknown
}

export interface ServerRecord {
  kind: SyncKind
  id: string
  rev: number
  updatedAt: number
  deleted: boolean
  body: unknown
}

export interface PushResult {
  kind: string
  id: string
  rev?: number
  error?: string
  record?: ServerRecord
}

export interface SyncTransport {
  push(records: PushRecord[]): Promise<PushResult[]>
  pull(since: number): Promise<{ records: ServerRecord[]; cursor: number; more: boolean }>
}

export interface SyncStorage {
  get(keys: string[]): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
}

type Bag = Record<string, unknown>
interface Local { body: unknown; updatedAt?: number }

export interface Collection {
  kind: SyncKind
  keys: string[]
  read(bag: Bag): Map<string, Local>
  /** Writes remote changes (null body = delete) and returns the storage items to set. */
  write(bag: Bag, changes: Map<string, unknown | null>): Bag
  version(body: unknown): string
  /** A record gone from storage is a delete only when this says so; otherwise it was evicted locally. */
  deleted(bag: Bag, id: string): boolean
  mergeOnFirstSync?: boolean
  afterWrite?(): Promise<void>
}

export const CONVERSATIONS_KEY = 'iris_agent_conversations'
export const CONVERSATION_TOMBSTONES_KEY = 'iris_conversation_tombstones'
export const SYNC_STATE_KEY = 'iris_sync_state'
const MAX_LOCAL_CONVERSATIONS = 100

/** Settings that describe this machine, not the user. */
export const DEVICE_SETTINGS: (keyof SidePanelSettings)[] = [
  'remoteRelayEnabled', 'remoteRelayUrl', 'remoteRelayToken', 'remoteRelayLabel', 'remoteRelayLevel',
  'browserRelayEnabled', 'browserRelayPort', 'browserRelayToken', 'mcpEndpoint', 'models',
]

/** JSON with object keys sorted: the server's jsonb and chrome.storage each reorder keys their own way. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) => v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, (v as Record<string, unknown>)[k]]))
    : v) ?? ''
}

export function hashJson(value: unknown): string {
  const text = canonicalJson(value)
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `${text.length}:${(h >>> 0).toString(36)}`
}

function arrayCollection<T>(kind: SyncKind, key: string, idOf: (row: T) => string, opts: {
  include?: (row: T) => boolean
  updatedAt?: (row: T) => number | undefined
  afterWrite?: () => Promise<void>
} = {}): Collection {
  const rows = (bag: Bag) => (Array.isArray(bag[key]) ? bag[key] : []) as T[]
  return {
    kind,
    keys: [key],
    read(bag) {
      const out = new Map<string, Local>()
      for (const row of rows(bag)) {
        if (opts.include && !opts.include(row)) continue
        out.set(idOf(row), { body: row, updatedAt: opts.updatedAt?.(row) })
      }
      return out
    },
    write(bag, changes) {
      const all = rows(bag)
      const blocked = new Set(all.filter(row => opts.include && !opts.include(row)).map(idOf))
      const kept = all.filter(row => blocked.has(idOf(row)) || !changes.has(idOf(row)))
      for (const [id, body] of changes) if (body !== null && !blocked.has(id)) kept.push(body as T)
      return { [key]: kept }
    },
    version: hashJson,
    deleted: () => true,
    afterWrite: opts.afterWrite,
  }
}

export function conversationCollection(): Collection {
  const store = (bag: Bag) => (bag[CONVERSATIONS_KEY] as ConversationStore | undefined) ?? { conversations: [], activeConversationId: null }
  return {
    kind: 'conversation',
    keys: [CONVERSATIONS_KEY, CONVERSATION_TOMBSTONES_KEY],
    read(bag) {
      return new Map(store(bag).conversations.map(conv => [conv.id, { body: conv, updatedAt: conv.lastUpdated }]))
    },
    write(bag, changes) {
      const current = store(bag)
      const conversations = current.conversations.filter(conv => !changes.has(conv.id))
      for (const body of changes.values()) if (body !== null) conversations.push(body as Conversation)
      conversations.sort((a, b) => b.lastUpdated - a.lastUpdated)
      const kept = conversations.slice(0, MAX_LOCAL_CONVERSATIONS)
      const active = kept.some(conv => conv.id === current.activeConversationId) ? current.activeConversationId : null
      return { [CONVERSATIONS_KEY]: { conversations: kept, activeConversationId: active } }
    },
    version: body => String((body as Conversation).lastUpdated),
    mergeOnFirstSync: true,
    deleted(bag, id) {
      const tombs = bag[CONVERSATION_TOMBSTONES_KEY]
      return Array.isArray(tombs) && tombs.some(t => (t as { id?: string })?.id === id)
    },
  }
}

export function settingsCollection(key: string): Collection {
  const local = new Set<string>(DEVICE_SETTINGS)
  return {
    kind: 'setting',
    keys: [key],
    read(bag) {
      const settings = (bag[key] ?? {}) as Record<string, unknown>
      const out = new Map<string, Local>()
      for (const [field, value] of Object.entries(settings)) {
        if (local.has(field) || value === undefined) continue
        out.set(field, { body: { value } })
      }
      return out
    },
    write(bag, changes) {
      const settings = { ...((bag[key] ?? {}) as Record<string, unknown>) }
      for (const [field, body] of changes) {
        if (local.has(field) || body === null) continue
        settings[field] = (body as { value: unknown }).value
      }
      return { [key]: settings }
    },
    version: hashJson,
    deleted: () => false,
  }
}

export function defaultCollections(settingsKey: string, resyncScripts: () => Promise<void>): Collection[] {
  return [
    conversationCollection(),
    arrayCollection<StoredSkill>('skill', 'iris_skills', row => row.name, { include: row => row.author !== 'builtin', updatedAt: row => row.updatedAt }),
    arrayCollection<StoredScript>('script', 'iris_scripts', row => row.id, { afterWrite: resyncScripts }),
    arrayCollection<StoredReport>('report', 'iris_reports', row => row.id, { updatedAt: row => row.updated }),
    settingsCollection(settingsKey),
  ]
}

interface SyncState {
  /** Server the state belongs to; a different server starts over. */
  server: string
  cursor: number
  seen: Record<string, { rev: number; v: string }>
}

const PUSH_BATCH = 20
// A batch is one WebSocket frame; a slow link must carry it well inside the request timeout.
export const PUSH_BATCH_BYTES = 256 * 1024

export function batchBySize<T>(items: T[], maxCount: number, maxBytes: number): T[][] {
  const batches: T[][] = []
  let batch: T[] = []
  let bytes = 0
  for (const item of items) {
    const size = JSON.stringify(item).length
    if (batch.length && (batch.length >= maxCount || bytes + size > maxBytes)) {
      batches.push(batch)
      batch = []
      bytes = 0
    }
    batch.push(item)
    bytes += size
  }
  if (batch.length) batches.push(batch)
  return batches
}

export function createSync(opts: { storage: SyncStorage; transport: SyncTransport; collections: Collection[]; server: string; now?: () => number }) {
  const { storage, transport, collections } = opts
  const now = opts.now ?? Date.now
  const byKind = new Map(collections.map(c => [c.kind, c]))
  const watched = new Set(collections.flatMap(c => c.keys))
  const errors: string[] = []

  async function loadState(): Promise<SyncState> {
    const bag = await storage.get([SYNC_STATE_KEY])
    const state = bag[SYNC_STATE_KEY] as SyncState | undefined
    return state && state.server === opts.server ? state : { server: opts.server, cursor: 0, seen: {} }
  }

  async function apply(state: SyncState, records: ServerRecord[]): Promise<void> {
    const grouped = new Map<Collection, ServerRecord[]>()
    for (const rec of records) {
      const collection = byKind.get(rec.kind)
      if (collection) grouped.set(collection, [...(grouped.get(collection) ?? []), rec])
    }
    for (const [collection, recs] of grouped) {
      const bag = await storage.get(collection.keys)
      const local = collection.read(bag)
      const changes = new Map<string, unknown | null>()
      for (const rec of recs) {
        const key = `${rec.kind}/${rec.id}`
        const seen = state.seen[key]
        const mine = local.get(rec.id)
        const localV = mine ? collection.version(mine.body) : ''
        // First contact: the server's copy wins, except a conversation, which is pushed and merged by message.
        if (seen ? localV !== seen.v : !!mine && collection.mergeOnFirstSync) continue
        changes.set(rec.id, rec.deleted ? null : rec.body)
        state.seen[key] = { rev: rec.rev, v: rec.deleted ? '' : collection.version(rec.body) }
      }
      if (!changes.size) continue
      await storage.set(collection.write(bag, changes))
      await collection.afterWrite?.()
    }
  }

  async function pull(state: SyncState): Promise<void> {
    for (;;) {
      const page = await transport.pull(state.cursor)
      await apply(state, page.records)
      state.cursor = page.cursor
      if (!page.more) return
    }
  }

  async function push(state: SyncState): Promise<void> {
    const outgoing: PushRecord[] = []
    for (const collection of collections) {
      const bag = await storage.get(collection.keys)
      const local = collection.read(bag)
      for (const [id, row] of local) {
        const seen = state.seen[`${collection.kind}/${id}`]
        if (seen && seen.v === collection.version(row.body)) continue
        outgoing.push({ kind: collection.kind, id, baseRev: seen?.rev ?? 0, updatedAt: row.updatedAt ?? now(), body: row.body })
      }
      const prefix = `${collection.kind}/`
      for (const [key, seen] of Object.entries(state.seen)) {
        if (!key.startsWith(prefix) || seen.v === '') continue
        const id = key.slice(prefix.length)
        if (local.has(id)) continue
        if (collection.deleted(bag, id)) outgoing.push({ kind: collection.kind, id, baseRev: seen.rev, updatedAt: now(), deleted: true })
        else delete state.seen[key]
      }
    }
    for (const batch of batchBySize(outgoing, PUSH_BATCH, PUSH_BATCH_BYTES)) {
      const results = await transport.push(batch)
      const merged: ServerRecord[] = []
      for (const [n, result] of results.entries()) {
        const sent = batch[n]
        const collection = byKind.get(sent.kind)!
        const key = `${sent.kind}/${sent.id}`
        if (result.error) {
          errors.push(`${key}: ${result.error}`)
          // Not retried until the record changes again.
          state.seen[key] = { rev: state.seen[key]?.rev ?? 0, v: sent.deleted ? '' : collection.version(sent.body) }
          continue
        }
        if (result.record) {
          // The server's copy replaces the one just sent; mark ours as seen so apply takes it.
          state.seen[key] = { rev: state.seen[key]?.rev ?? 0, v: sent.deleted ? '' : collection.version(sent.body) }
          merged.push(result.record)
          continue
        }
        state.seen[key] = { rev: result.rev ?? 0, v: sent.deleted ? '' : collection.version(sent.body) }
      }
      if (merged.length) await apply(state, merged)
    }
  }

  let running: Promise<void> | null = null
  let again = false

  async function runOnce(): Promise<void> {
    errors.length = 0
    const state = await loadState()
    try {
      await pull(state)
      await push(state)
    } finally {
      await storage.set({ [SYNC_STATE_KEY]: state })
    }
  }

  return {
    watches: (key: string) => watched.has(key),
    errors: () => [...errors],
    /** Pull, then push. Calls made while one runs fold into one more run. */
    run(): Promise<void> {
      if (running) {
        again = true
        return running
      }
      running = (async () => {
        try {
          do {
            again = false
            await runOnce()
          } while (again)
        } finally {
          running = null
        }
      })()
      return running
    },
  }
}
