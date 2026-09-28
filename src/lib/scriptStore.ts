import { parseScript, type ScriptMeta } from './scriptMeta'
import { SEED_SCRIPTS } from './scriptSeeds'

async function sync(): Promise<void> {
  await chrome.runtime.sendMessage({ type: 'iris_sync_scripts' })
}

export async function scriptRegisterError(): Promise<string | null> {
  const bag = await chrome.storage.local.get('iris_script_register_error')
  const value = bag.iris_script_register_error
  return typeof value === 'string' && value.length > 0 ? value : null
}

export interface StoredScript {
  id: string
  source: string
  enabled: boolean
}

const KEY = 'iris_scripts'
const SEEDED = 'iris_scripts_seeded'

export interface ScriptRecord extends StoredScript {
  meta: ScriptMeta
}

export async function listStoredScripts(): Promise<StoredScript[]> {
  const bag = await chrome.storage.local.get(KEY)
  return (bag[KEY] as StoredScript[] | undefined) ?? []
}

export async function ensureSeedScripts(): Promise<void> {
  const bag = await chrome.storage.local.get([KEY, SEEDED])
  if (bag[SEEDED]) return
  const existing = (bag[KEY] as StoredScript[] | undefined) ?? []
  const ids = new Set(existing.map(s => s.id))
  const added = SEED_SCRIPTS.filter(s => !ids.has(s.id)).map(s => ({ id: s.id, source: s.source, enabled: true }))
  await chrome.storage.local.set({ [KEY]: [...existing, ...added], [SEEDED]: true })
}

export async function describeScripts(): Promise<(ScriptRecord | { id: string; source: string; enabled: boolean; error: string })[]> {
  const rows = await listStoredScripts()
  return rows.map(row => {
    const parsed = parseScript(row.source)
    if ('error' in parsed) return { ...row, error: parsed.error }
    return { ...row, meta: parsed }
  })
}

export async function writeScript(source: string, enabled?: boolean): Promise<ScriptRecord> {
  const parsed = parseScript(source)
  if ('error' in parsed) throw new Error(parsed.error)
  const rows = await listStoredScripts()
  const prior = rows.find(row => {
    const meta = parseScript(row.source)
    return !('error' in meta) && meta.name === parsed.name
  })
  const id = prior?.id ?? `s_${crypto.randomUUID()}`
  const next = { id, source, enabled: enabled ?? prior?.enabled ?? true }
  const rest = rows.filter(row => row.id !== id)
  await chrome.storage.local.set({ [KEY]: [...rest, next] })
  await sync()
  return { ...next, meta: parsed }
}

export async function setScriptEnabled(idOrName: string, enabled: boolean): Promise<StoredScript> {
  const rows = await listStoredScripts()
  const row = rows.find(r => r.id === idOrName) ?? rows.find(r => {
    const meta = parseScript(r.source)
    return !('error' in meta) && meta.name === idOrName
  })
  if (!row) throw new Error(`Script not found: ${idOrName}`)
  row.enabled = enabled
  await chrome.storage.local.set({ [KEY]: rows })
  await sync()
  return row
}

export async function deleteScript(idOrName: string): Promise<void> {
  const rows = await listStoredScripts()
  const next = rows.filter(r => {
    if (r.id === idOrName) return false
    const meta = parseScript(r.source)
    return 'error' in meta || meta.name !== idOrName
  })
  if (next.length === rows.length) throw new Error(`Script not found: ${idOrName}`)
  await chrome.storage.local.set({ [KEY]: next })
  await sync()
}
