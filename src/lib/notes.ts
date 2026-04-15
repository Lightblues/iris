import type { Note, NotesStore, NoteSourceType } from './types'

const NOTES_STORAGE_KEY = 'iris_notes'
const MAX_NOTES = 500

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function generateTitle(content: string): string {
  // Extract first line or first 50 chars
  const firstLine = content.split('\n')[0].replace(/^#+\s*/, '').trim()
  if (firstLine.length <= 50) return firstLine || 'Untitled Note'
  return firstLine.slice(0, 47) + '...'
}

async function loadStore(): Promise<NotesStore> {
  const result = await chrome.storage.local.get(NOTES_STORAGE_KEY)
  const store = result[NOTES_STORAGE_KEY] as NotesStore | undefined
  return store || { notes: [] }
}

async function saveStore(store: NotesStore): Promise<void> {
  // Sort by updatedAt desc
  store.notes.sort((a, b) => b.updatedAt - a.updatedAt)
  // Prune if needed
  if (store.notes.length > MAX_NOTES) {
    store.notes = store.notes.slice(0, MAX_NOTES)
  }
  await chrome.storage.local.set({ [NOTES_STORAGE_KEY]: store })
}

// Public API
export async function getAllNotes(): Promise<Note[]> {
  const store = await loadStore()
  return store.notes
}

export async function getNoteById(id: string): Promise<Note | null> {
  const store = await loadStore()
  return store.notes.find((n) => n.id === id) || null
}

export async function createNote(params: {
  content: string
  sourceUrl: string
  sourceTitle: string
  sourceType: NoteSourceType
  title?: string
  tags?: string[]
  conversationId?: string  // For assistant-generated notes
}): Promise<Note> {
  const store = await loadStore()
  const now = Date.now()

  const note: Note = {
    id: generateId(),
    title: params.title || generateTitle(params.content),
    content: params.content,
    source: {
      url: params.sourceUrl,
      title: params.sourceTitle,
      type: params.sourceType,
      extractedAt: now,
      ...(params.conversationId && { conversationId: params.conversationId }),
    },
    tags: params.tags || [],
    createdAt: now,
    updatedAt: now,
  }

  store.notes.unshift(note)
  await saveStore(store)
  return note
}

export async function updateNote(
  id: string,
  updates: Partial<Pick<Note, 'title' | 'content' | 'tags'>>
): Promise<Note | null> {
  const store = await loadStore()
  const note = store.notes.find((n) => n.id === id)
  if (!note) return null

  if (updates.title !== undefined) note.title = updates.title
  if (updates.content !== undefined) note.content = updates.content
  if (updates.tags !== undefined) note.tags = updates.tags
  note.updatedAt = Date.now()

  await saveStore(store)
  return note
}

export async function deleteNote(id: string): Promise<boolean> {
  const store = await loadStore()
  const index = store.notes.findIndex((n) => n.id === id)
  if (index === -1) return false

  store.notes.splice(index, 1)
  await saveStore(store)
  return true
}

// Export functions
export async function exportNotesAsJson(): Promise<void> {
  const store = await loadStore()
  const data = JSON.stringify(store.notes, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `iris-notes-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function noteToMarkdown(note: Note): string {
  const frontmatter = [
    '---',
    `title: "${note.title.replace(/"/g, '\\"')}"`,
    `source: ${note.source.url}`,
    `date: ${new Date(note.createdAt).toISOString().slice(0, 10)}`,
    note.tags.length > 0 ? `tags: [${note.tags.join(', ')}]` : null,
    '---',
    '',
  ]
    .filter(Boolean)
    .join('\n')

  return frontmatter + note.content
}

export async function exportNoteAsMarkdown(id: string): Promise<void> {
  const note = await getNoteById(id)
  if (!note) return

  const markdown = noteToMarkdown(note)
  const blob = new Blob([markdown], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  // Sanitize filename
  const filename = note.title.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 50)
  a.download = `${filename}.md`
  a.click()
  URL.revokeObjectURL(url)
}

export async function exportAllNotesAsMarkdown(): Promise<void> {
  const store = await loadStore()
  const markdown = store.notes.map(noteToMarkdown).join('\n\n---\n\n')
  const blob = new Blob([markdown], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `iris-notes-${new Date().toISOString().slice(0, 10)}.md`
  a.click()
  URL.revokeObjectURL(url)
}

export async function importNotes(
  file: File
): Promise<{ success: number; skipped: number; error?: string }> {
  try {
    const text = await file.text()
    const imported = JSON.parse(text) as Note[]
    if (!Array.isArray(imported)) {
      return { success: 0, skipped: 0, error: 'Invalid format: expected array of notes' }
    }

    const store = await loadStore()
    const existingIds = new Set(store.notes.map((n) => n.id))
    let success = 0
    let skipped = 0

    for (const note of imported) {
      // Validate note structure
      if (!note.id || !note.content || !note.source) {
        skipped++
        continue
      }
      // Skip if ID already exists
      if (existingIds.has(note.id)) {
        skipped++
        continue
      }
      // Ensure required fields
      const newNote: Note = {
        id: note.id,
        title: note.title || 'Imported Note',
        content: note.content,
        source: note.source,
        tags: note.tags || [],
        createdAt: note.createdAt || Date.now(),
        updatedAt: note.updatedAt || Date.now(),
      }
      store.notes.push(newNote)
      existingIds.add(note.id)
      success++
    }

    await saveStore(store)
    return { success, skipped }
  } catch (e) {
    return { success: 0, skipped: 0, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
