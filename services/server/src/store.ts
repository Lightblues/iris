import pg from 'pg'

export const MAX_RECORD_BYTES = 8 * 1024 * 1024
export const KINDS = ['conversation', 'skill', 'script', 'report', 'setting'] as const
export type Kind = typeof KINDS[number]
/** Kinds other apps may read through /export. Settings carry API keys and never leave the sync path. */
export const EXPORT_KINDS: Record<string, string> = {
  conversation: 'One Iris agent chat: title, messages (user, assistant, tool calls and results), pages it read, skills it loaded, model.',
}
/** Accounts are not built yet; every row belongs to this user. */
export const DEFAULT_USER = 'me'

type Query = <R = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<{ rows: R[] }>

export interface Db {
  query: Query
  tx<T>(fn: (query: Query) => Promise<T>): Promise<T>
  close(): Promise<void>
}

export function pgDb(url: string): Db {
  const pool = new pg.Pool({ connectionString: url, max: 4 })
  return {
    query: (text, params) => pool.query(text, params as unknown[]) as never,
    async tx(fn) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const out = await fn((text, params) => client.query(text, params as unknown[]) as never)
        await client.query('COMMIT')
        return out
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
      } finally {
        client.release()
      }
    },
    close: () => pool.end(),
  }
}

export interface PushRecord {
  kind: string
  id: string
  /** Rev of the copy this edit started from; 0 when the device never saw one. */
  baseRev: number
  updatedAt: number
  deleted?: boolean
  body?: unknown
}

export interface StoredRecord {
  kind: string
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
  /** Present when the stored record is not what the device sent (merged, or the server's copy won). */
  record?: StoredRecord
}

export interface ExportItem {
  kind: string
  id: string
  updatedAt: number
  deleted: boolean
  data: unknown
}

interface Row {
  kind: string
  id: string
  rev: number
  updated_at: number
  deleted: boolean
  body: unknown
}

interface Version {
  updatedAt: number
  deleted: boolean
  body: unknown
}

const COLUMNS = 'kind, id, rev::float8 AS rev, updated_at::float8 AS updated_at, deleted, body'

export async function migrate(db: Db): Promise<void> {
  await db.query(`
    CREATE SEQUENCE IF NOT EXISTS record_rev;
    CREATE TABLE IF NOT EXISTS records (
      user_id text NOT NULL,
      kind text NOT NULL,
      id text NOT NULL,
      rev bigint NOT NULL,
      updated_at bigint NOT NULL,
      deleted boolean NOT NULL DEFAULT false,
      body jsonb,
      PRIMARY KEY (user_id, kind, id)
    );
    CREATE INDEX IF NOT EXISTS records_user_rev ON records (user_id, rev);
  `)
}

function toRecord(row: Row): StoredRecord {
  return { kind: row.kind, id: row.id, rev: Number(row.rev), updatedAt: Number(row.updated_at), deleted: row.deleted, body: row.body }
}

export function openStore(db: Db) {
  async function pushOne(user: string, rec: PushRecord): Promise<PushResult> {
    const head = { kind: rec.kind, id: rec.id }
    if (!(KINDS as readonly string[]).includes(rec.kind)) return { ...head, error: 'unknown_kind' }
    if (!rec.id || rec.id.length > 200) return { ...head, error: 'invalid_id' }
    const incoming: Version = { updatedAt: rec.updatedAt, deleted: rec.deleted === true, body: rec.deleted ? null : rec.body ?? null }
    const json = incoming.deleted ? null : JSON.stringify(incoming.body)
    if (json && Buffer.byteLength(json) > MAX_RECORD_BYTES) return { ...head, error: 'too_large' }

    return db.tx(async query => {
      // Revs must commit in the order they are drawn, or a reader whose cursor passed a later rev skips an earlier one.
      await query('SELECT pg_advisory_xact_lock(hashtext($1))', [user])
      const { rows } = await query<Row>(`SELECT ${COLUMNS} FROM records WHERE user_id = $1 AND kind = $2 AND id = $3 FOR UPDATE`, [user, rec.kind, rec.id])
      const current = rows[0] ? toRecord(rows[0]) : undefined
      const next = !current || current.rev === rec.baseRev ? incoming : resolve(rec.kind, current, incoming)
      if (current && next === current) return { ...head, rev: current.rev, record: current }
      const body = next === incoming ? json : next.deleted ? null : JSON.stringify(next.body)
      const saved = await query<Row>(
        `INSERT INTO records (user_id, kind, id, rev, updated_at, deleted, body)
         VALUES ($1, $2, $3, nextval('record_rev'), $4, $5, $6::jsonb)
         ON CONFLICT (user_id, kind, id) DO UPDATE SET rev = excluded.rev, updated_at = excluded.updated_at, deleted = excluded.deleted, body = excluded.body
         RETURNING ${COLUMNS}`,
        [user, rec.kind, rec.id, Math.round(next.updatedAt), next.deleted, body],
      )
      const stored = toRecord(saved.rows[0])
      return next === incoming ? { ...head, rev: stored.rev } : { ...head, rev: stored.rev, record: stored }
    })
  }

  return {
    async push(user: string, records: PushRecord[]): Promise<PushResult[]> {
      const results: PushResult[] = []
      for (const rec of records) {
        try {
          results.push(await pushOne(user, rec))
        } catch (error) {
          console.error(`[iris-server] push ${rec.kind}/${rec.id} failed:`, (error as Error).message)
          results.push({ kind: rec.kind, id: rec.id, error: 'invalid' })
        }
      }
      return results
    },

    async pull(user: string, since: number, limit = 50): Promise<{ records: StoredRecord[]; cursor: number; more: boolean }> {
      const { rows } = await db.query<Row>(`SELECT ${COLUMNS} FROM records WHERE user_id = $1 AND rev > $2 ORDER BY rev LIMIT $3`, [user, since, limit + 1])
      const records = rows.slice(0, limit).map(toRecord)
      return { records, cursor: records.at(-1)?.rev ?? since, more: rows.length > limit }
    },

    async exportChanges(user: string, since: number, kinds: string[], limit = 100): Promise<{ items: ExportItem[]; cursor: string; more: boolean }> {
      const allowed = kinds.length ? kinds.filter(kind => kind in EXPORT_KINDS) : Object.keys(EXPORT_KINDS)
      const { rows } = await db.query<Row>(
        `SELECT ${COLUMNS} FROM records WHERE user_id = $1 AND rev > $2 AND kind = ANY($3) ORDER BY rev LIMIT $4`,
        [user, since, allowed, limit + 1],
      )
      const page = rows.slice(0, limit).map(toRecord)
      return {
        items: page.map(rec => ({ kind: rec.kind, id: rec.id, updatedAt: rec.updatedAt, deleted: rec.deleted, data: rec.deleted ? null : stripDataUrls(rec.body) })),
        cursor: String(page.at(-1)?.rev ?? since),
        more: rows.length > limit,
      }
    },
  }
}

export type Store = ReturnType<typeof openStore>

/** Both sides changed the record since the device last saw it. */
function resolve(kind: string, current: StoredRecord, incoming: Version): Version {
  if (kind === 'conversation' && !current.deleted && !incoming.deleted) return mergeConversation(current, incoming)
  return incoming.updatedAt > current.updatedAt ? incoming : current
}

interface Message { id?: unknown }

/** Union of messages by id: the incoming order, with messages only the server has placed after their predecessor. */
export function mergeConversation(current: Version, incoming: Version): Version {
  const a = messagesOf(current.body)
  const b = messagesOf(incoming.body)
  const key = (m: Message) => typeof m.id === 'string' ? m.id : JSON.stringify(m)
  const seen = new Set(b.map(key))
  const out = [...b]
  for (let i = 0; i < a.length; i++) {
    const k = key(a[i])
    if (seen.has(k)) continue
    const at = i === 0 ? 0 : out.findIndex(m => key(m) === key(a[i - 1])) + 1
    out.splice(at, 0, a[i])
    seen.add(k)
  }
  const newer = incoming.updatedAt >= current.updatedAt ? incoming : current
  if (out.length === b.length && newer === incoming) return incoming
  const updatedAt = Math.max(current.updatedAt, incoming.updatedAt)
  return { updatedAt, deleted: false, body: { ...(newer.body as object), messages: out, lastUpdated: updatedAt } }
}

function messagesOf(body: unknown): Message[] {
  const messages = (body as { messages?: unknown } | null)?.messages
  return Array.isArray(messages) ? messages.filter((m): m is Message => !!m && typeof m === 'object') : []
}

/** Inline images (data: URLs) are device payloads; an export reader gets a marker instead. */
function stripDataUrls(value: unknown): unknown {
  if (typeof value === 'string') return value.startsWith('data:') && value.length > 256 ? '[inline data omitted]' : value
  if (Array.isArray(value)) return value.map(stripDataUrls)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stripDataUrls(v)]))
  return value
}
