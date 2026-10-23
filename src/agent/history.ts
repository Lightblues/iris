import type { IrisMessage, Conversation, ConversationStore } from './types'

import { CONVERSATIONS_KEY, CONVERSATION_TOMBSTONES_KEY } from '../lib/sync'

export const CONVERSATION_STORAGE_KEY = CONVERSATIONS_KEY
const STORAGE_KEY = CONVERSATION_STORAGE_KEY
/** Explicit deletes. Sync pushes these as deletes; a conversation dropped by the local cap stays on the server. */
const TOMBSTONE_KEY = CONVERSATION_TOMBSTONES_KEY
const MAX_TOMBSTONES = 500
const MAX_CONVERSATIONS = 100
const MAX_MESSAGES = 100

interface Tombstone {
  id: string
  deletedAt: number
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function generateTitle(messages: IrisMessage[]): string {
  const first = messages.find(m => m.role === 'user' && !m.metadata?.contextType)
  if (!first) return 'New Chat'
  const text = first.parts
    .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
    .map(p => p.text)
    .join('')
  const title = text.slice(0, 30)
  return title.length < text.length ? `${title}...` : title
}

/** Origin + path, no hash, query, or trailing slash. Same page matches across tracking params. */
export function pageKey(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:' && u.protocol !== 'file:') return null
    const path = u.pathname.length > 1 && u.pathname.endsWith('/') ? u.pathname.slice(0, -1) : u.pathname
    return `${u.origin}${path}`
  } catch {
    return null
  }
}

export function displayUrl(url: string): string {
  try {
    const u = new URL(url)
    const path = u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '')
    return `${u.hostname}${path}`
  } catch {
    return url
  }
}

function skillFromPart(part: { type?: string; toolName?: string; input?: unknown; args?: unknown }): string | null {
  const type = part.type ?? ''
  const tool = type === 'dynamic-tool' ? part.toolName : type.startsWith('tool-') ? type.slice(5) : ''
  if (tool !== 'load_skill') return null
  const input = (part.input ?? part.args) as { name?: unknown } | undefined
  return typeof input?.name === 'string' && input.name ? input.name : null
}

/** Pages from message metadata, and skill names from load_skill calls. */
export function conversationIndex(messages: IrisMessage[]): { urls: string[]; skills: string[] } {
  const urls: string[] = []
  const seenUrl = new Set<string>()
  const skills: string[] = []
  const seenSkill = new Set<string>()
  for (const message of messages) {
    const pageUrl = message.metadata?.pageUrl
    const key = pageUrl ? pageKey(pageUrl) : null
    if (pageUrl && key && !seenUrl.has(key)) {
      seenUrl.add(key)
      urls.push(pageUrl.split('#')[0])
    }
    for (const part of message.parts ?? []) {
      const skill = skillFromPart(part as { type?: string; toolName?: string; input?: unknown; args?: unknown })
      if (skill && !seenSkill.has(skill)) {
        seenSkill.add(skill)
        skills.push(skill)
      }
    }
  }
  return { urls, skills }
}

export function samePage(pageUrl: string, conv: Pick<Conversation, 'urls'>): boolean {
  const key = pageKey(pageUrl)
  if (!key) return false
  return (conv.urls ?? []).some(url => pageKey(url) === key)
}

function sameList(a: string[] | undefined, b: string[]): boolean {
  if (!a || a.length !== b.length) return false
  return a.every((value, i) => value === b[i])
}

function reindex(conv: Conversation & { agentMode?: unknown }): boolean {
  const next = conversationIndex(conv.messages ?? [])
  const changed = !sameList(conv.urls, next.urls) || !sameList(conv.skills, next.skills) || conv.agentMode != null
  conv.urls = next.urls
  conv.skills = next.skills
  delete conv.agentMode
  return changed
}

async function loadStore(): Promise<ConversationStore> {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  const stored = result[STORAGE_KEY] as ConversationStore | undefined
  const store = stored ?? { conversations: [], activeConversationId: null }
  let dirty = false
  for (const conv of store.conversations) {
    if (reindex(conv)) dirty = true
  }
  if (dirty) await saveStore(store)
  return store
}

async function saveStore(store: ConversationStore): Promise<void> {
  store.conversations.sort((a, b) => b.lastUpdated - a.lastUpdated)
  if (store.conversations.length > MAX_CONVERSATIONS) {
    store.conversations = store.conversations.slice(0, MAX_CONVERSATIONS)
    if (store.activeConversationId && !store.conversations.find(c => c.id === store.activeConversationId)) {
      store.activeConversationId = null
    }
  }
  await chrome.storage.local.set({ [STORAGE_KEY]: store })
}

async function loadTombstones(): Promise<Tombstone[]> {
  const bag = await chrome.storage.local.get(TOMBSTONE_KEY)
  const stored = bag[TOMBSTONE_KEY]
  if (!Array.isArray(stored)) return []
  return stored.filter((item): item is Tombstone => (
    !!item && typeof item.id === 'string' && typeof item.deletedAt === 'number'
  ))
}

async function rememberTombstones(items: Tombstone[]): Promise<void> {
  if (!items.length) return
  const byId = new Map((await loadTombstones()).map(t => [t.id, t]))
  for (const item of items) byId.set(item.id, item)
  const kept = [...byId.values()].sort((a, b) => b.deletedAt - a.deletedAt).slice(0, MAX_TOMBSTONES)
  await chrome.storage.local.set({ [TOMBSTONE_KEY]: kept })
}

export async function loadAllConversations(): Promise<ConversationStore> {
  return loadStore()
}

/** Title, id, and user/assistant text. Tool payloads are left out. */
export function conversationSearchText(conv: Conversation): string {
  const bits = [conv.title, conv.id]
  for (const message of conv.messages) {
    if (message.role !== 'user' && message.role !== 'assistant') continue
    for (const part of message.parts ?? []) {
      if (part.type === 'text' && part.text) bits.push(part.text)
    }
  }
  bits.push(...(conv.urls ?? []), ...(conv.skills ?? []))
  return bits.join('\n').toLowerCase()
}

export async function getActiveConversation(): Promise<Conversation | null> {
  const store = await loadStore()
  if (!store.activeConversationId) return null
  return store.conversations.find(c => c.id === store.activeConversationId) || null
}

export async function setActiveConversation(id: string | null): Promise<void> {
  const store = await loadStore()
  store.activeConversationId = id
  await saveStore(store)
}

export async function createConversation(messages: IrisMessage[] = []): Promise<Conversation> {
  const store = await loadStore()
  const now = Date.now()
  const messagesKept = messages.slice(-MAX_MESSAGES)
  const index = conversationIndex(messagesKept)
  const conv: Conversation = {
    id: generateId(),
    title: generateTitle(messagesKept),
    messages: messagesKept,
    urls: index.urls,
    skills: index.skills,
    createdAt: now,
    lastUpdated: now,
  }
  store.conversations.unshift(conv)
  store.activeConversationId = conv.id
  await saveStore(store)
  return conv
}

export async function updateConversation(id: string, messages: IrisMessage[]): Promise<void> {
  const store = await loadStore()
  const conv = store.conversations.find(c => c.id === id)
  if (!conv) return
  conv.messages = messages.slice(-MAX_MESSAGES)
  const index = conversationIndex(conv.messages)
  conv.urls = index.urls
  conv.skills = index.skills
  conv.lastUpdated = Date.now()
  if (conv.title === 'New Chat') conv.title = generateTitle(messages)
  await saveStore(store)
}

export async function deleteConversation(id: string): Promise<void> {
  const store = await loadStore()
  const existed = store.conversations.some(c => c.id === id)
  store.conversations = store.conversations.filter(c => c.id !== id)
  if (store.activeConversationId === id) {
    store.activeConversationId = store.conversations[0]?.id ?? null
  }
  await saveStore(store)
  if (existed) await rememberTombstones([{ id, deletedAt: Date.now() }])
}

export async function clearAllConversations(): Promise<void> {
  const store = await loadStore()
  const tombstones = store.conversations.map(conv => ({ id: conv.id, deletedAt: Date.now() }))
  await chrome.storage.local.remove(STORAGE_KEY)
  if (tombstones.length) await rememberTombstones(tombstones)
}

export async function exportConversations(): Promise<void> {
  const store = await loadStore()
  const data = JSON.stringify(store.conversations, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `iris-agent-history-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function importConversations(file: File): Promise<{ success: number; skipped: number; error?: string }> {
  try {
    const text = await file.text()
    const imported = JSON.parse(text) as any[]
    if (!Array.isArray(imported)) return { success: 0, skipped: 0, error: 'Invalid format: expected array' }

    const store = await loadStore()
    const existingIds = new Set(store.conversations.map(c => c.id))
    let success = 0, skipped = 0

    for (const conv of imported) {
      if (!conv.id || !Array.isArray(conv.messages)) { skipped++; continue }
      if (existingIds.has(conv.id)) { skipped++; continue }
      const messages = conv.messages.slice(-MAX_MESSAGES)
      const index = conversationIndex(messages)
      const next: Conversation = {
        id: conv.id,
        title: conv.title || 'Imported',
        messages,
        urls: index.urls,
        skills: index.skills,
        createdAt: conv.createdAt || Date.now(),
        lastUpdated: conv.lastUpdated || Date.now(),
      }
      store.conversations.push(next)
      existingIds.add(conv.id)
      success++
    }
    await saveStore(store)
    return { success, skipped }
  } catch (e) {
    return { success: 0, skipped: 0, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
