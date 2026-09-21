import type { IrisMessage, Conversation, ConversationStore, AgentMode } from './types'

const STORAGE_KEY = 'iris_agent_conversations'
const MAX_CONVERSATIONS = 100
const MAX_MESSAGES = 100

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

async function loadStore(): Promise<ConversationStore> {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  const stored = result[STORAGE_KEY] as ConversationStore | undefined
  return stored ?? { conversations: [], activeConversationId: null }
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

export async function loadAllConversations(): Promise<ConversationStore> {
  return loadStore()
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

export async function createConversation(agentMode: AgentMode, messages: IrisMessage[] = []): Promise<Conversation> {
  const store = await loadStore()
  const now = Date.now()
  const conv: Conversation = {
    id: generateId(),
    title: generateTitle(messages),
    messages: messages.slice(-MAX_MESSAGES),
    agentMode,
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
  conv.lastUpdated = Date.now()
  if (conv.title === 'New Chat') conv.title = generateTitle(messages)
  await saveStore(store)
}

export async function deleteConversation(id: string): Promise<void> {
  const store = await loadStore()
  store.conversations = store.conversations.filter(c => c.id !== id)
  if (store.activeConversationId === id) {
    store.activeConversationId = store.conversations[0]?.id ?? null
  }
  await saveStore(store)
}

export async function clearAllConversations(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY)
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
      store.conversations.push({
        id: conv.id,
        title: conv.title || 'Imported',
        messages: conv.messages.slice(-MAX_MESSAGES),
        agentMode: conv.agentMode || 'general',
        createdAt: conv.createdAt || Date.now(),
        lastUpdated: conv.lastUpdated || Date.now(),
      })
      existingIds.add(conv.id)
      success++
    }
    await saveStore(store)
    return { success, skipped }
  } catch (e) {
    return { success: 0, skipped: 0, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
