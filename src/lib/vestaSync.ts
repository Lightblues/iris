import type { KnowledgeEntry, TracingEvent, IrisMessage, IrisMessagePart, Conversation } from './types'
import { getVestaDirectoryHandle, verifyDirectoryPermission } from './fileSystemAccess'
import { getAllEntries } from './knowledge'
import { loadAllConversations } from './chatHistory'

const SYNC_STATE_KEY = 'iris_vesta_sync_state'
const EVENTS_KEY_PREFIX = 'iris_events_'

export interface VestaSyncState {
  lastSyncTime: number
  lastEventDate: string
  entriesSynced: number
  conversationsSynced: number
  lastConversationSyncTime: number
  lastError?: string
}

export interface SyncResult {
  eventsSynced: number
  entriesSynced: number
  conversationsSynced: number
}

// --- Sync state persistence ---

async function loadSyncState(): Promise<VestaSyncState> {
  const result = await chrome.storage.local.get(SYNC_STATE_KEY)
  const stored = result[SYNC_STATE_KEY] as Partial<VestaSyncState> | undefined
  return {
    lastSyncTime: 0,
    lastEventDate: '',
    entriesSynced: 0,
    conversationsSynced: 0,
    lastConversationSyncTime: 0,
    ...stored,
  }
}

async function saveSyncState(state: VestaSyncState): Promise<void> {
  await chrome.storage.local.set({ [SYNC_STATE_KEY]: state })
}

export async function getSyncState(): Promise<VestaSyncState> {
  return loadSyncState()
}

// --- Directory helpers ---

async function ensureSubdirectory(
  root: FileSystemDirectoryHandle,
  ...path: string[]
): Promise<FileSystemDirectoryHandle> {
  let current = root
  for (const segment of path) {
    current = await current.getDirectoryHandle(segment, { create: true })
  }
  return current
}

async function writeFile(
  dir: FileSystemDirectoryHandle,
  name: string,
  content: string,
): Promise<void> {
  const fileHandle = await dir.getFileHandle(name, { create: true })
  // 
  const writable = await fileHandle.createWritable()
  await writable.write(content)
  await writable.close()
}

async function readFile(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<string | null> {
  try {
    const fileHandle = await dir.getFileHandle(name)
    const file = await fileHandle.getFile()
    return await file.text()
  } catch {
    return null
  }
}

// --- Index helpers ---

function parseIndexLines(content: string | null): string[] {
  if (!content) return []
  return content.trim().split('\n').filter(Boolean)
}

function indexIdSet(lines: string[]): Set<string> {
  const ids = new Set<string>()
  for (const line of lines) {
    try { ids.add(JSON.parse(line).id) } catch {}
  }
  return ids
}

// Upsert: replace existing line by id, or append
function upsertIndexLine(lines: string[], id: string, newLine: string): string[] {
  const idx = lines.findIndex(line => {
    try { return JSON.parse(line).id === id } catch { return false }
  })
  if (idx >= 0) {
    lines[idx] = newLine
  } else {
    lines.push(newLine)
  }
  return lines
}

// --- Flow 1: Tracing Events → JSONL ---

async function syncEvents(root: FileSystemDirectoryHandle): Promise<number> {
  const state = await loadSyncState()

  const all = await chrome.storage.local.get(null)
  const eventKeys = Object.keys(all)
    .filter(k => k.startsWith(EVENTS_KEY_PREFIX))
    .sort()

  if (eventKeys.length === 0) return 0

  const eventsDir = await ensureSubdirectory(root, 'memory', 'events', 'iris')
  const today = new Date().toISOString().slice(0, 10)

  let synced = 0
  for (const key of eventKeys) {
    const dateStr = key.slice(EVENTS_KEY_PREFIX.length)
    if (dateStr < state.lastEventDate && dateStr !== today) continue

    const events = all[key] as TracingEvent[]
    if (!events || events.length === 0) continue

    const lines = events.map(ev => {
      const obj: Record<string, any> = {
        ts: new Date(ev.ts).toISOString(),
        type: ev.type,
        ...ev.data,
      }
      if (ev.sessionId) obj.sessionId = ev.sessionId
      return JSON.stringify(obj)
    })

    await writeFile(eventsDir, `${dateStr}.jsonl`, lines.join('\n') + '\n')
    synced += events.length

    if (dateStr > state.lastEventDate) {
      state.lastEventDate = dateStr
    }
  }

  await saveSyncState(state)
  return synced
}

// --- Flow 2: Knowledge Entries → Markdown + Index ---

async function syncKnowledge(root: FileSystemDirectoryHandle): Promise<number> {
  const entries = await getAllEntries()
  const toSync = entries.filter(
    e => e.syncedAt == null || e.syncedAt < e.updatedAt,
  )
  if (toSync.length === 0) return 0

  const inboxDir = await ensureSubdirectory(root, 'inbox', 'iris')
  const now = Date.now()

  // Write entry files
  for (const entry of toSync) {
    const dateStr = new Date(entry.createdAt).toISOString().slice(0, 10)
    const filename = `${dateStr}-${entry.id}.md`
    await writeFile(inboxDir, filename, entryToVestaMarkdown(entry))
    entry.syncedAt = now
  }

  // Update index.jsonl
  const existingIndex = parseIndexLines(await readFile(inboxDir, 'index.jsonl'))
  const existingIds = indexIdSet(existingIndex)
  const newLines: string[] = []
  for (const entry of toSync) {
    if (existingIds.has(entry.id)) continue
    const dateStr = new Date(entry.createdAt).toISOString().slice(0, 10)
    newLines.push(JSON.stringify({
      id: entry.id,
      type: entry.type,
      title: entry.title || '',
      url: entry.source.url,
      filename: `${dateStr}-${entry.id}.md`,
      created: new Date(entry.createdAt).toISOString(),
    }))
  }
  if (newLines.length > 0) {
    await writeFile(inboxDir, 'index.jsonl', [...existingIndex, ...newLines].join('\n') + '\n')
  }

  await updateSyncedAt(toSync.map(e => ({ id: e.id, syncedAt: now })))
  return toSync.length
}

function entryToVestaMarkdown(entry: KnowledgeEntry): string {
  const lines = [
    '---',
    `id: "iris-${entry.id}"`,
    `type: ${entry.type}`,
    `source_url: "${entry.source.url}"`,
    `source_title: "${(entry.source.title || '').replace(/"/g, '\\"')}"`,
  ]
  if (entry.tags.length > 0) {
    lines.push(`tags: [${entry.tags.join(', ')}]`)
  }
  lines.push(`created: ${new Date(entry.createdAt).toISOString()}`)
  lines.push('---')
  lines.push('')
  lines.push(entry.content)
  return lines.join('\n')
}

async function updateSyncedAt(
  updates: { id: string; syncedAt: number }[],
): Promise<void> {
  const result = await chrome.storage.local.get('iris_knowledge')
  const store = result.iris_knowledge as { entries: KnowledgeEntry[] } | undefined
  if (!store) return

  const map = new Map(updates.map(u => [u.id, u.syncedAt]))
  for (const entry of store.entries) {
    const ts = map.get(entry.id)
    if (ts !== undefined) entry.syncedAt = ts
  }
  await chrome.storage.local.set({ iris_knowledge: store })
}

// --- Flow 3: Conversations → JSONL + Index ---

function extractMessageText(msg: IrisMessage): string {
  return msg.parts
    .filter((p): p is Extract<IrisMessagePart, { type: 'text' }> => p.type === 'text')
    .map(p => p.text)
    .join('')
}

function extractToolParts(msg: IrisMessage): any[] {
  return msg.parts
    .filter((p: any) => typeof p.type === 'string' && p.type.startsWith('tool-') && 'toolCallId' in p)
    .map((p: any) => ({
      toolName: (p.type as string).slice(5),
      toolCallId: p.toolCallId,
      input: p.input,
      output: p.output,
      state: p.state,
    }))
}

function conversationToJsonl(conv: Conversation): string {
  const header = JSON.stringify({
    _type: 'conversation_meta',
    id: conv.id,
    title: conv.title,
    agentMode: conv.agentMode || 'general',
    messageCount: conv.messages.length,
    createdAt: new Date(conv.createdAt).toISOString(),
    lastUpdated: new Date(conv.lastUpdated).toISOString(),
  })

  const msgLines = conv.messages.map(msg => {
    const obj: Record<string, any> = {
      ts: msg.metadata?.timestamp
        ? new Date(msg.metadata.timestamp).toISOString()
        : new Date(conv.createdAt).toISOString(),
      role: msg.role,
      content: extractMessageText(msg),
    }
    const tools = extractToolParts(msg)
    if (tools.length > 0) obj.toolCalls = tools
    if (msg.role === 'assistant' && msg.metadata?.usage) {
      obj.usage = msg.metadata.usage
    }
    if (msg.metadata?.contextType) {
      obj.contextType = msg.metadata.contextType
      obj.pageUrl = msg.metadata.pageUrl
      obj.pageTitle = msg.metadata.pageTitle
    }
    return JSON.stringify(obj)
  })

  return [header, ...msgLines].join('\n') + '\n'
}

async function syncConversations(root: FileSystemDirectoryHandle): Promise<number> {
  const state = await loadSyncState()
  const store = await loadAllConversations()

  const toSync = store.conversations.filter(
    c => c.lastUpdated > state.lastConversationSyncTime,
  )
  if (toSync.length === 0) return 0

  const convDir = await ensureSubdirectory(root, 'memory', 'conversations', 'iris')

  // Write conversation files
  for (const conv of toSync) {
    const dateStr = new Date(conv.createdAt).toISOString().slice(0, 10)
    const filename = `${dateStr}-${conv.id}.jsonl`
    await writeFile(convDir, filename, conversationToJsonl(conv))
  }

  // Update index.jsonl (upsert — conversations can be re-synced after updates)
  const existingIndex = parseIndexLines(await readFile(convDir, 'index.jsonl'))
  let indexLines = [...existingIndex]
  for (const conv of toSync) {
    const dateStr = new Date(conv.createdAt).toISOString().slice(0, 10)
    const line = JSON.stringify({
      id: conv.id,
      title: conv.title,
      agentMode: conv.agentMode || 'general',
      messageCount: conv.messages.length,
      createdAt: new Date(conv.createdAt).toISOString(),
      lastUpdated: new Date(conv.lastUpdated).toISOString(),
      filename: `${dateStr}-${conv.id}.jsonl`,
    })
    indexLines = upsertIndexLine(indexLines, conv.id, line)
  }
  await writeFile(convDir, 'index.jsonl', indexLines.join('\n') + '\n')

  state.lastConversationSyncTime = Date.now()
  state.conversationsSynced += toSync.length
  await saveSyncState(state)

  return toSync.length
}

// --- Orchestrator ---

export async function syncToVesta(): Promise<SyncResult> {
  const handle = await getVestaDirectoryHandle()
  if (!handle) throw new Error('Vesta directory not configured')

  const hasPermission = await verifyDirectoryPermission(handle)
  if (!hasPermission) throw new Error('Permission denied for Vesta directory')

  const state = await loadSyncState()

  try {
    const eventsSynced = await syncEvents(handle)
    const entriesSynced = await syncKnowledge(handle)
    const conversationsSynced = await syncConversations(handle)

    state.lastSyncTime = Date.now()
    state.entriesSynced += entriesSynced
    state.lastError = undefined
    await saveSyncState(state)

    console.log(`[Iris] Vesta sync: ${eventsSynced} events, ${entriesSynced} entries, ${conversationsSynced} conversations`)
    return { eventsSynced, entriesSynced, conversationsSynced }
  } catch (err: any) {
    state.lastError = err.message || 'Unknown sync error'
    await saveSyncState(state)
    throw err
  }
}
