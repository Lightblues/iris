import type { IrisMessage, IrisMessageMetadata, IrisMessagePart, Conversation, ConversationStore, LegacyChatMessage, AgentMode } from './types'

const STORAGE_KEY = 'chat_conversations'
const OLD_STORAGE_KEY = 'chat_history'  // For migration
const MAX_CONVERSATIONS = 100
const MAX_MESSAGES_PER_CONVERSATION = 100

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function generateTitle(messages: IrisMessage[]): string {
  const firstUserMessage = messages.find(m => m.role === 'user')
  if (firstUserMessage) {
    const text = firstUserMessage.parts
      .filter((p): p is Extract<IrisMessagePart, { type: 'text' }> => p.type === 'text')
      .map(p => p.text)
      .join('')
    const title = text.slice(0, 30)
    return title.length < text.length ? `${title}...` : title
  }
  return 'New Chat'
}

// Migrate a single legacy ChatMessage → IrisMessage (UIMessage format)
function migrateLegacyMessage(old: LegacyChatMessage): IrisMessage {
  const parts: IrisMessagePart[] = []

  // Migrate content blocks if available, otherwise fall back to content string
  if (old.contentBlocks && old.contentBlocks.length > 0) {
    for (const block of old.contentBlocks) {
      if (block.type === 'text' && block.text) {
        parts.push({ type: 'text', text: block.text })
      }
      if (block.type === 'tool' && block.toolCall) {
        const tc = block.toolCall
        const tr = block.toolResult
        parts.push({
          type: `tool-${tc.name}`,
          toolCallId: tc.id,
          state: tr ? 'output-available' : 'input-available',
          input: tc.args,
          ...(tr && { output: tr.result }),
        } as any)
      }
    }
  } else if (old.content) {
    parts.push({ type: 'text', text: old.content })
  }

  // Legacy tool calls without content blocks (fallback path)
  if (parts.length === 0 || (!old.contentBlocks?.length && old.toolCalls?.length)) {
    for (const tc of old.toolCalls || []) {
      const tr = old.toolResults?.find(r => r.id === tc.id)
      parts.push({
        type: `tool-${tc.name}`,
        toolCallId: tc.id,
        state: tr ? 'output-available' : 'input-available',
        input: tc.args,
        ...(tr && { output: tr.result }),
      } as any)
    }
  }

  // Images → file parts
  if (old.images) {
    for (const img of old.images) {
      parts.push({ type: 'file', mediaType: img.mimeType, url: img.data } as any)
    }
  }

  // Map role: 'context' → 'user' with contextType metadata; 'tool' → 'assistant'
  const role: 'system' | 'user' | 'assistant' =
    old.role === 'context' ? 'user'
    : old.role === 'tool' ? 'assistant'
    : old.role as 'user' | 'assistant'

  return {
    id: old.id,
    role,
    metadata: {
      timestamp: old.timestamp,
      pageUrl: old.metadata?.pageUrl,
      pageTitle: old.metadata?.pageTitle,
      contextType: old.role === 'context' ? (old.metadata?.contextType || 'page') : undefined,
    } as IrisMessageMetadata,
    parts: parts.length > 0 ? parts : [{ type: 'text', text: '' }],
  }
}

// Check if a message is in old format (has 'content' string instead of 'parts' array)
function isLegacyMessage(msg: any): msg is LegacyChatMessage {
  return msg && typeof msg.content === 'string' && !Array.isArray(msg.parts)
}

// Migrate conversation messages if they're in legacy format
function migrateConversationMessages(conv: any): Conversation {
  if (conv.messages?.length > 0 && isLegacyMessage(conv.messages[0])) {
    console.log('[Iris] Migrating conversation', conv.id, 'from legacy format')
    return {
      ...conv,
      messages: conv.messages.map((m: LegacyChatMessage) => migrateLegacyMessage(m)),
    }
  }
  return conv as Conversation
}

async function loadStore(): Promise<ConversationStore> {
  await migrateIfNeeded()

  const result = await chrome.storage.local.get(STORAGE_KEY)
  const store = result[STORAGE_KEY] as ConversationStore | undefined
  if (!store) return { conversations: [], activeConversationId: null }

  // Migrate individual conversations from legacy ChatMessage format
  let needsSave = false
  const conversations = store.conversations.map((conv: any) => {
    if (conv.messages?.length > 0 && isLegacyMessage(conv.messages[0])) {
      needsSave = true
      return migrateConversationMessages(conv)
    }
    return conv as Conversation
  })

  if (needsSave) {
    const migrated = { ...store, conversations }
    await chrome.storage.local.set({ [STORAGE_KEY]: migrated })
    console.log('[Iris] Migrated', conversations.length, 'conversations to UIMessage format')
    return migrated
  }

  return store as ConversationStore
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

// Migration from old URL-based format
async function migrateIfNeeded(): Promise<void> {
  const result = await chrome.storage.local.get([OLD_STORAGE_KEY, STORAGE_KEY])
  if (result[STORAGE_KEY] || !result[OLD_STORAGE_KEY]) return

  console.log('[Iris] Migrating chat history from URL-based format...')
  const oldHistory = result[OLD_STORAGE_KEY] as Record<string, { url: string; title: string; messages: LegacyChatMessage[]; lastUpdated: number }>

  const conversations: Conversation[] = Object.values(oldHistory).map(old => {
    const migratedMessages = old.messages
      .slice(-MAX_MESSAGES_PER_CONVERSATION)
      .map(m => migrateLegacyMessage(m))
    return {
      id: generateId(),
      title: generateTitle(migratedMessages) || old.title || 'Imported Chat',
      messages: migratedMessages,
      createdAt: old.messages[0]?.timestamp || old.lastUpdated,
      lastUpdated: old.lastUpdated,
    }
  })

  const store: ConversationStore = {
    conversations: conversations.sort((a, b) => b.lastUpdated - a.lastUpdated).slice(0, MAX_CONVERSATIONS),
    activeConversationId: conversations[0]?.id || null,
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: store })
  await chrome.storage.local.remove(OLD_STORAGE_KEY)
  console.log('[Iris] Migration complete:', conversations.length, 'conversations migrated')
}

// Public API
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

export async function createConversation(firstMessage?: IrisMessage, agentMode?: AgentMode): Promise<Conversation> {
  const store = await loadStore()
  const now = Date.now()
  const conversation: Conversation = {
    id: generateId(),
    title: 'New Chat',
    messages: firstMessage ? [firstMessage] : [],
    agentMode,
    createdAt: now,
    lastUpdated: now,
  }
  if (firstMessage && firstMessage.role === 'user') {
    conversation.title = generateTitle([firstMessage])
  }
  store.conversations.unshift(conversation)
  store.activeConversationId = conversation.id
  await saveStore(store)
  return conversation
}

export async function updateConversation(id: string, messages: IrisMessage[]): Promise<void> {
  const store = await loadStore()
  const conversation = store.conversations.find(c => c.id === id)
  if (!conversation) return

  conversation.messages = messages.slice(-MAX_MESSAGES_PER_CONVERSATION)
  conversation.lastUpdated = Date.now()

  if (conversation.title === 'New Chat') {
    conversation.title = generateTitle(messages)
  }

  await saveStore(store)
}

export async function deleteConversation(id: string): Promise<void> {
  const store = await loadStore()
  store.conversations = store.conversations.filter(c => c.id !== id)
  if (store.activeConversationId === id) {
    store.activeConversationId = store.conversations[0]?.id || null
  }
  await saveStore(store)
}

export async function clearAllConversations(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY)
}

// Export/Import functions
export async function exportConversations(): Promise<void> {
  const store = await loadStore()
  const data = JSON.stringify(store.conversations, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `iris-chat-history-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function importConversations(file: File): Promise<{ success: number; skipped: number; error?: string }> {
  try {
    const text = await file.text()
    const imported = JSON.parse(text) as any[]
    if (!Array.isArray(imported)) {
      return { success: 0, skipped: 0, error: 'Invalid format: expected array of conversations' }
    }

    const store = await loadStore()
    const existingIds = new Set(store.conversations.map(c => c.id))
    let success = 0
    let skipped = 0

    for (const conv of imported) {
      if (!conv.id || !Array.isArray(conv.messages)) {
        skipped++
        continue
      }
      if (existingIds.has(conv.id)) {
        skipped++
        continue
      }
      // Migrate if legacy format
      const migrated = migrateConversationMessages(conv)
      const newConv: Conversation = {
        id: migrated.id,
        title: migrated.title || 'Imported Chat',
        messages: migrated.messages.slice(-MAX_MESSAGES_PER_CONVERSATION),
        createdAt: migrated.createdAt || Date.now(),
        lastUpdated: migrated.lastUpdated || Date.now(),
      }
      store.conversations.push(newConv)
      existingIds.add(conv.id)
      success++
    }

    await saveStore(store)
    return { success, skipped }
  } catch (e) {
    return { success: 0, skipped: 0, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
