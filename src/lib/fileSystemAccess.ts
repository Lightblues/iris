import type { SlashCommand } from './types'
import { parseCommandFile } from './slashCommands'

const DB_NAME = 'iris_fs_handles'
const STORE_NAME = 'handles'
const COMMANDS_DIR_KEY = 'commands_directory'
const CHAT_EXPORT_DIR_KEY = 'chat_export_directory'

// IndexedDB helpers for storing FileSystemDirectoryHandle
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME)
    }
  })
}

export async function saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  return saveHandle(COMMANDS_DIR_KEY, handle)
}

export async function getSavedDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  return getHandle(COMMANDS_DIR_KEY)
}

export async function clearDirectoryHandle(): Promise<void> {
  return clearHandle(COMMANDS_DIR_KEY)
}

// --- Generic handle persistence (used internally) ---
async function saveHandle(key: string, handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.put(handle, key)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

async function getHandle(key: string): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.get(key)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result || null)
    })
  } catch {
    return null
  }
}

async function clearHandle(key: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.delete(key)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

// --- Chat export directory handle ---
export async function saveChatExportDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  return saveHandle(CHAT_EXPORT_DIR_KEY, handle)
}

export async function getChatExportDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  return getHandle(CHAT_EXPORT_DIR_KEY)
}

export async function clearChatExportDirectoryHandle(): Promise<void> {
  return clearHandle(CHAT_EXPORT_DIR_KEY)
}

export async function requestChatExportDirectoryAccess(): Promise<FileSystemDirectoryHandle | null> {
  try {
    // @ts-expect-error - showDirectoryPicker is not in all TS definitions
    const handle = await window.showDirectoryPicker({
      id: 'iris-chat-export',
      mode: 'readwrite',
      startIn: 'documents',
    })
    await saveChatExportDirectoryHandle(handle)
    return handle
  } catch (err: any) {
    if (err?.name === 'AbortError') return null
    throw err
  }
}

// Request directory access from user
export async function requestDirectoryAccess(): Promise<FileSystemDirectoryHandle | null> {
  try {
    // @ts-expect-error - showDirectoryPicker is not in all TS definitions
    const handle = await window.showDirectoryPicker({
      id: 'iris-commands',
      mode: 'readwrite',
      startIn: 'documents',
    })
    await saveDirectoryHandle(handle)
    return handle
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return null // User cancelled
    }
    throw err
  }
}

// Read-only permission check. Safe from a service worker: requestPermission()
// needs a user gesture, which the SW never has.
export async function queryDirectoryPermission(
  handle: FileSystemDirectoryHandle,
): Promise<'granted' | 'prompt' | 'denied'> {
  try {
    // @ts-expect-error - queryPermission not in all TS defs
    return await handle.queryPermission({ mode: 'readwrite' })
  } catch {
    return 'denied'
  }
}

// Verify we still have permission to access the directory
export async function verifyDirectoryPermission(
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  try {
    // @ts-expect-error - queryPermission not in all TS defs
    const permission = await handle.queryPermission({ mode: 'readwrite' })
    if (permission === 'granted') return true
    // @ts-expect-error - requestPermission not in all TS defs
    const requested = await handle.requestPermission({ mode: 'readwrite' })
    return requested === 'granted'
  } catch {
    return false
  }
}

// Read all markdown files from directory (recursively by namespace)
export async function readMarkdownFiles(
  handle: FileSystemDirectoryHandle
): Promise<{ namespace: string; name: string; content: string }[]> {
  const results: { namespace: string; name: string; content: string }[] = []

  async function scanDirectory(dirHandle: FileSystemDirectoryHandle, namespace: string) {
    // @ts-expect-error - values() is available in modern browsers but not in all TS defs
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'directory') {
        // Subdirectory becomes namespace
        const subHandle = await dirHandle.getDirectoryHandle(entry.name)
        await scanDirectory(subHandle, entry.name)
      } else if (entry.kind === 'file' && entry.name.endsWith('.md')) {
        const fileHandle = await dirHandle.getFileHandle(entry.name)
        const file = await fileHandle.getFile()
        const content = await file.text()
        const name = entry.name.replace(/\.md$/, '')
        results.push({ namespace: namespace || 'user', name, content })
      }
    }
  }

  await scanDirectory(handle, '')
  return results
}

// Import commands from directory
export async function importCommandsFromDirectory(
  handle: FileSystemDirectoryHandle
): Promise<SlashCommand[]> {
  const files = await readMarkdownFiles(handle)
  return files.map(f => parseCommandFile(f.content, f.namespace, f.name, 'user'))
}

// Get saved directory path (for display purposes)
export async function getSavedDirectoryPath(): Promise<string | null> {
  const handle = await getSavedDirectoryHandle()
  if (!handle) return null
  return handle.name
}
