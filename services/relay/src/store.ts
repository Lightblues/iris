import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export const MAX_RECORD_BYTES = 8 * 1024 * 1024
export const MAX_CONVERSATIONS = 100
const MAX_TOMBSTONES = 500

export interface SyncTombstone {
  id: string
  deletedAt: number
}

export interface StoredConversation {
  id: string
  lastUpdated: number
  body: unknown
}

export interface SyncIndexEntry {
  id: string
  lastUpdated: number
}

export interface ReconcileResult {
  push: string[]
  conversations: unknown[]
  tombstones: SyncTombstone[]
}

interface ConvRow {
  id: string
  last_updated: number
  body: string
}

export function openStore(dataFile: string) {
  if (dataFile !== ':memory:') mkdirSync(dirname(dataFile), { recursive: true })
  const db = new DatabaseSync(dataFile)
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 3000;
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      last_updated INTEGER NOT NULL,
      body TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tombstones (
      id TEXT PRIMARY KEY,
      deleted_at INTEGER NOT NULL
    );
  `)

  const upsertConv = db.prepare(
    'INSERT INTO conversations (id, last_updated, body) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET last_updated = excluded.last_updated, body = excluded.body',
  )
  const deleteConv = db.prepare('DELETE FROM conversations WHERE id = ?')
  const getConv = db.prepare('SELECT id, last_updated, body FROM conversations WHERE id = ?')
  const allConvs = db.prepare('SELECT id, last_updated, body FROM conversations ORDER BY last_updated DESC')
  const convsSince = db.prepare('SELECT body FROM conversations WHERE last_updated > ? ORDER BY last_updated ASC')
  const upsertTomb = db.prepare(
    'INSERT INTO tombstones (id, deleted_at) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET deleted_at = excluded.deleted_at',
  )
  const deleteTomb = db.prepare('DELETE FROM tombstones WHERE id = ?')
  const getTomb = db.prepare('SELECT id, deleted_at FROM tombstones WHERE id = ?')
  const allTombs = db.prepare('SELECT id, deleted_at FROM tombstones')
  const tombsSince = db.prepare('SELECT id, deleted_at FROM tombstones WHERE deleted_at > ?')
  const trimTombs = db.prepare(`
    DELETE FROM tombstones WHERE id NOT IN (
      SELECT id FROM tombstones ORDER BY deleted_at DESC LIMIT ${MAX_TOMBSTONES}
    )
  `)

  function rowConv(row: ConvRow): StoredConversation {
    return { id: row.id, lastUpdated: row.last_updated, body: JSON.parse(row.body) as unknown }
  }

  function readConv(id: string): StoredConversation | undefined {
    const row = getConv.get(id) as unknown as ConvRow | undefined
    return row ? rowConv(row) : undefined
  }

  function readTomb(id: string): SyncTombstone | undefined {
    const row = getTomb.get(id) as unknown as { id: string; deleted_at: number } | undefined
    return row ? { id: row.id, deletedAt: row.deleted_at } : undefined
  }

  function listConvs(): StoredConversation[] {
    return (allConvs.all() as unknown as ConvRow[]).map(rowConv)
  }

  function listTombs(): SyncTombstone[] {
    return (allTombs.all() as unknown as { id: string; deleted_at: number }[]).map(row => ({
      id: row.id,
      deletedAt: row.deleted_at,
    }))
  }

  function applyTombstone(tomb: SyncTombstone): void {
    const existing = readConv(tomb.id)
    if (existing && existing.lastUpdated > tomb.deletedAt) return
    const prev = readTomb(tomb.id)
    if (prev && prev.deletedAt >= tomb.deletedAt) return
    deleteConv.run(tomb.id)
    upsertTomb.run(tomb.id, tomb.deletedAt)
  }

  function capConversations(): void {
    const rows = listConvs()
    if (rows.length <= MAX_CONVERSATIONS) return
    const now = Date.now()
    for (const old of rows.slice(MAX_CONVERSATIONS)) applyTombstone({ id: old.id, deletedAt: now })
    trimTombs.run()
  }

  return {
    push(conversations: unknown[], tombstones: SyncTombstone[]): { id: string; error: string }[] {
      const rejected: { id: string; error: string }[] = []
      for (const value of conversations) {
        const parsed = parseConversation(value)
        if (!parsed) continue
        if (Buffer.byteLength(parsed.json) > MAX_RECORD_BYTES) {
          rejected.push({ id: parsed.id, error: 'too_large' })
          continue
        }
        const tomb = readTomb(parsed.id)
        if (tomb && tomb.deletedAt > parsed.lastUpdated) continue
        const existing = readConv(parsed.id)
        if (existing && existing.lastUpdated >= parsed.lastUpdated) continue
        upsertConv.run(parsed.id, parsed.lastUpdated, parsed.json)
        if (tomb && tomb.deletedAt <= parsed.lastUpdated) deleteTomb.run(parsed.id)
      }
      for (const tomb of tombstones) {
        if (!tomb || typeof tomb.id !== 'string' || typeof tomb.deletedAt !== 'number') continue
        applyTombstone(tomb)
      }
      capConversations()
      trimTombs.run()
      return rejected
    },

    since(since: number): { conversations: unknown[]; tombstones: SyncTombstone[] } {
      const conversations = (convsSince.all(since) as unknown as { body: string }[]).map(row => JSON.parse(row.body) as unknown)
      const tombstones = (tombsSince.all(since) as unknown as { id: string; deleted_at: number }[]).map(row => ({
        id: row.id,
        deletedAt: row.deleted_at,
      }))
      return { conversations, tombstones }
    },

    reconcile(clientConvs: SyncIndexEntry[], clientTombs: SyncTombstone[]): ReconcileResult {
      const clientConv = new Map(clientConvs.filter(entry => entry.id).map(entry => [entry.id, entry.lastUpdated]))
      const clientTomb = new Map(clientTombs.filter(entry => entry.id).map(entry => [entry.id, entry.deletedAt]))

      for (const [id, deletedAt] of clientTomb) {
        const serverBody = readConv(id)
        const clientBodyTs = clientConv.get(id) ?? 0
        if (deletedAt > (serverBody?.lastUpdated ?? 0) && deletedAt > clientBodyTs) {
          applyTombstone({ id, deletedAt })
        }
      }

      const push: string[] = []
      for (const [id, lastUpdated] of clientConv) {
        const tomb = readTomb(id)
        if (tomb && tomb.deletedAt > lastUpdated) continue
        const server = readConv(id)
        if (!server || lastUpdated > server.lastUpdated) push.push(id)
      }

      const conversations: unknown[] = []
      for (const server of listConvs()) {
        const localTs = clientConv.get(server.id) ?? 0
        const localTomb = clientTomb.get(server.id) ?? 0
        if (localTomb > server.lastUpdated) continue
        if (localTs < server.lastUpdated) conversations.push(server.body)
      }

      const tombstones: SyncTombstone[] = []
      for (const tomb of listTombs()) {
        const localTs = clientConv.get(tomb.id) ?? 0
        const localTomb = clientTomb.get(tomb.id) ?? 0
        if (localTs >= tomb.deletedAt) continue
        if (localTomb >= tomb.deletedAt) continue
        tombstones.push(tomb)
      }

      trimTombs.run()
      return { push, conversations, tombstones }
    },

    close() {
      db.close()
    },
  }
}

export type RelayStore = ReturnType<typeof openStore>

function parseConversation(value: unknown): { id: string; lastUpdated: number; json: string } | null {
  if (!value || typeof value !== 'object') return null
  const record = value as { id?: unknown; lastUpdated?: unknown }
  if (typeof record.id !== 'string' || !record.id) return null
  if (typeof record.lastUpdated !== 'number' || !Number.isFinite(record.lastUpdated)) return null
  return { id: record.id, lastUpdated: record.lastUpdated, json: JSON.stringify(value) }
}
