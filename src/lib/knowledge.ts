import type { KnowledgeEntry, KnowledgeEntryType, KnowledgeStore, HighlightAnchor } from './types'
import { recordEvent } from './tracing'

const KNOWLEDGE_STORAGE_KEY = 'iris_knowledge'
const MAX_ENTRIES = 500

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function generateTitle(content: string): string {
  const firstLine = content.split('\n')[0].replace(/^#+\s*/, '').trim()
  if (firstLine.length <= 50) return firstLine || 'Untitled'
  return firstLine.slice(0, 47) + '...'
}

async function loadStore(): Promise<KnowledgeStore> {
  const result = await chrome.storage.local.get(KNOWLEDGE_STORAGE_KEY)
  const store = result[KNOWLEDGE_STORAGE_KEY] as KnowledgeStore | undefined
  return store || { entries: [] }
}

async function saveStore(store: KnowledgeStore): Promise<void> {
  store.entries.sort((a, b) => b.updatedAt - a.updatedAt)
  if (store.entries.length > MAX_ENTRIES) {
    store.entries = store.entries.slice(0, MAX_ENTRIES)
  }
  await chrome.storage.local.set({ [KNOWLEDGE_STORAGE_KEY]: store })
}

export async function getAllEntries(): Promise<KnowledgeEntry[]> {
  const store = await loadStore()
  return store.entries
}

export async function getEntryById(id: string): Promise<KnowledgeEntry | null> {
  const store = await loadStore()
  return store.entries.find((e) => e.id === id) || null
}

export async function getEntriesByUrl(url: string): Promise<KnowledgeEntry[]> {
  const store = await loadStore()
  return store.entries.filter((e) => e.source.url === url)
}

export async function createEntry(params: {
  type: KnowledgeEntryType
  content: string
  sourceUrl: string
  sourceTitle: string
  title?: string
  tags?: string[]
  anchor?: HighlightAnchor
  conversationId?: string
}): Promise<KnowledgeEntry> {
  const store = await loadStore()
  const now = Date.now()

  const entry: KnowledgeEntry = {
    id: generateId(),
    type: params.type,
    content: params.content,
    title: params.title || generateTitle(params.content),
    source: {
      url: params.sourceUrl,
      title: params.sourceTitle,
      timestamp: now,
      ...(params.anchor && { anchor: params.anchor }),
      ...(params.conversationId && { conversationId: params.conversationId }),
    },
    tags: params.tags || [],
    createdAt: now,
    updatedAt: now,
  }

  store.entries.unshift(entry)
  await saveStore(store)

  // Emit tracing event
  if (params.type === 'highlight') {
    recordEvent({
      type: 'highlight_created',
      data: {
        entryId: entry.id,
        url: params.sourceUrl,
        title: entry.title,
        tags: entry.tags,
        content: params.content,
        sourceTitle: params.sourceTitle,
      },
    }).catch(() => {})
  } else {
    recordEvent({
      type: 'note_created',
      data: {
        entryId: entry.id,
        entryType: params.type,
        url: params.sourceUrl,
        title: entry.title,
        tags: entry.tags,
        sourceTitle: params.sourceTitle,
        contentPreview: params.type === 'page-snapshot'
          ? params.content.slice(0, 2000)
          : params.content,
      },
    }).catch(() => {})
  }

  return entry
}

export async function updateEntry(
  id: string,
  updates: Partial<Pick<KnowledgeEntry, 'title' | 'content' | 'tags'>>,
): Promise<KnowledgeEntry | null> {
  const store = await loadStore()
  const entry = store.entries.find((e) => e.id === id)
  if (!entry) return null

  if (updates.title !== undefined) entry.title = updates.title
  if (updates.content !== undefined) entry.content = updates.content
  if (updates.tags !== undefined) entry.tags = updates.tags
  entry.updatedAt = Date.now()

  await saveStore(store)
  return entry
}

export async function deleteEntry(id: string): Promise<boolean> {
  const store = await loadStore()
  const index = store.entries.findIndex((e) => e.id === id)
  if (index === -1) return false

  store.entries.splice(index, 1)
  await saveStore(store)
  return true
}

export async function exportEntriesAsJson(): Promise<void> {
  const store = await loadStore()
  const data = JSON.stringify(store.entries, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `iris-knowledge-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function entryToMarkdown(entry: KnowledgeEntry): string {
  const frontmatter = [
    '---',
    `title: "${(entry.title || 'Untitled').replace(/"/g, '\\"')}"`,
    `type: ${entry.type}`,
    `source: ${entry.source.url}`,
    `date: ${new Date(entry.createdAt).toISOString().slice(0, 10)}`,
    entry.tags.length > 0 ? `tags: [${entry.tags.join(', ')}]` : null,
    '---',
    '',
  ]
    .filter(Boolean)
    .join('\n')

  return frontmatter + entry.content
}

export async function exportEntryAsMarkdown(id: string): Promise<void> {
  const entry = await getEntryById(id)
  if (!entry) return

  const markdown = entryToMarkdown(entry)
  const blob = new Blob([markdown], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const filename = (entry.title || 'entry').replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 50)
  a.download = `${filename}.md`
  a.click()
  URL.revokeObjectURL(url)
}

export async function importEntries(
  file: File,
): Promise<{ success: number; skipped: number; error?: string }> {
  try {
    const text = await file.text()
    const imported = JSON.parse(text) as KnowledgeEntry[]
    if (!Array.isArray(imported)) {
      return { success: 0, skipped: 0, error: 'Invalid format: expected array' }
    }

    const store = await loadStore()
    const existingIds = new Set(store.entries.map((e) => e.id))
    let success = 0
    let skipped = 0

    for (const entry of imported) {
      if (!entry.id || !entry.content || !entry.source) {
        skipped++
        continue
      }
      if (existingIds.has(entry.id)) {
        skipped++
        continue
      }
      const newEntry: KnowledgeEntry = {
        id: entry.id,
        type: entry.type || 'note',
        content: entry.content,
        title: entry.title || 'Imported',
        source: entry.source,
        tags: entry.tags || [],
        createdAt: entry.createdAt || Date.now(),
        updatedAt: entry.updatedAt || Date.now(),
      }
      store.entries.push(newEntry)
      existingIds.add(entry.id)
      success++
    }

    await saveStore(store)
    return { success, skipped }
  } catch (e) {
    return { success: 0, skipped: 0, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
