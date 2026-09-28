const DB_NAME = 'iris_fs_handles'
const STORE_NAME = 'handles'
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
