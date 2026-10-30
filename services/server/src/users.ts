import { createHash, randomBytes } from 'node:crypto'
import { DEFAULT_USER, type Db } from './store.ts'

/** `device` opens the WebSocket; `read` and `control` are HTTP bearers. */
export type CredentialKind = 'device' | 'read' | 'control'
export const CREDENTIAL_KINDS: readonly CredentialKind[] = ['device', 'read', 'control']

/** Credentials imported from the server's env carry this label and follow it on every start. */
const ENV_LABEL = 'env'

export interface Credential {
  id: number
  userId: string
  kind: CredentialKind
  label: string
  createdAt: number
  revokedAt: number | null
}

/** Tokens are random, so a plain digest is enough; only the digest is stored. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function addUser(db: Db, id: string, name = id): Promise<void> {
  if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(id)) throw new Error('user id must be 1-32 of a-z, 0-9, _ or -, starting with a letter or digit')
  const { rows } = await db.query('INSERT INTO users (id, name, created_at) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING RETURNING id', [id, name, Date.now()])
  if (!rows.length) throw new Error(`user ${id} exists`)
}

export async function listUsers(db: Db) {
  const { rows } = await db.query<{ id: string; name: string; created_at: number }>('SELECT id, name, created_at::float8 AS created_at FROM users ORDER BY created_at')
  return rows.map(row => ({ id: row.id, name: row.name, createdAt: Number(row.created_at) }))
}

/** Stores a new credential and returns its token; the token is not kept. */
export async function addToken(db: Db, userId: string, kind: CredentialKind, label = ''): Promise<string> {
  if (!CREDENTIAL_KINDS.includes(kind)) throw new Error(`kind must be one of ${CREDENTIAL_KINDS.join(', ')}`)
  const { rows } = await db.query('SELECT id FROM users WHERE id = $1', [userId])
  if (!rows.length) throw new Error(`no user ${userId}`)
  const token = randomBytes(32).toString('base64url')
  await db.query('INSERT INTO credentials (user_id, kind, hash, label, created_at) VALUES ($1, $2, $3, $4, $5)', [userId, kind, hashToken(token), label, Date.now()])
  return token
}

export async function listTokens(db: Db, userId?: string): Promise<Credential[]> {
  const { rows } = await db.query<{ id: number; user_id: string; kind: CredentialKind; label: string; created_at: number; revoked_at: number | null }>(
    `SELECT id, user_id, kind, label, created_at::float8 AS created_at, revoked_at::float8 AS revoked_at FROM credentials
     WHERE $1::text IS NULL OR user_id = $1 ORDER BY id`,
    [userId ?? null],
  )
  return rows.map(row => ({ id: row.id, userId: row.user_id, kind: row.kind, label: row.label, createdAt: Number(row.created_at), revokedAt: row.revoked_at == null ? null : Number(row.revoked_at) }))
}

export async function revokeToken(db: Db, id: number): Promise<boolean> {
  const { rows } = await db.query('UPDATE credentials SET revoked_at = $2 WHERE id = $1 AND revoked_at IS NULL RETURNING id', [id, Date.now()])
  return rows.length > 0
}

/** The user a live credential of one of `kinds` belongs to, and which kind it is. */
export async function resolveToken(db: Db, token: string, kinds: readonly CredentialKind[]): Promise<{ userId: string; kind: CredentialKind } | null> {
  if (!token) return null
  const { rows } = await db.query<{ user_id: string; kind: CredentialKind }>(
    'SELECT user_id, kind FROM credentials WHERE hash = $1 AND kind = ANY($2) AND revoked_at IS NULL LIMIT 1',
    [hashToken(token), kinds],
  )
  return rows[0] ? { userId: rows[0].user_id, kind: rows[0].kind } : null
}

/** Seeds user `me` and makes its env credentials match the env: new ones added, changed or removed ones revoked. */
export async function seedEnv(db: Db, env: Partial<Record<CredentialKind, string>>): Promise<void> {
  await db.query('INSERT INTO users (id, name, created_at) VALUES ($1, $1, $2) ON CONFLICT (id) DO NOTHING', [DEFAULT_USER, Date.now()])
  for (const kind of CREDENTIAL_KINDS) {
    const hash = env[kind] ? hashToken(env[kind]) : ''
    await db.query(
      'UPDATE credentials SET revoked_at = $4 WHERE user_id = $1 AND kind = $2 AND label = $3 AND hash <> $5 AND revoked_at IS NULL',
      [DEFAULT_USER, kind, ENV_LABEL, Date.now(), hash],
    )
    if (!hash) continue
    await db.query(
      `INSERT INTO credentials (user_id, kind, hash, label, created_at) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (hash) DO UPDATE SET revoked_at = NULL WHERE credentials.label = $4 AND credentials.user_id = $1 AND credentials.kind = $2`,
      [DEFAULT_USER, kind, hash, ENV_LABEL, Date.now()],
    )
  }
}
