import type { BookmarkLink } from './types';
import { STORAGE_KEY } from './types';

// One-time lazy migration sync → local (see sidepanelSettings.ts for rationale)
let migratedFromSync = false

async function ensureMigrated(): Promise<void> {
  if (migratedFromSync) return
  migratedFromSync = true
  try {
    const localResult = await chrome.storage.local.get(STORAGE_KEY)
    if (localResult[STORAGE_KEY] != null) return
    const syncResult = await chrome.storage.sync.get(STORAGE_KEY)
    const syncValue = syncResult[STORAGE_KEY]
    if (syncValue != null) {
      await chrome.storage.local.set({ [STORAGE_KEY]: syncValue })
    }
  } catch {
    // best-effort; fall through to defaults
  }
}

export async function getBookmarks(): Promise<BookmarkLink[]> {
  await ensureMigrated()
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return (result[STORAGE_KEY] || []) as BookmarkLink[];
}

export async function saveBookmarks(bookmarks: BookmarkLink[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: bookmarks });
}

export async function addBookmark(bookmark: BookmarkLink): Promise<void> {
  const bookmarks = await getBookmarks();
  bookmarks.unshift(bookmark);
  await saveBookmarks(bookmarks);
}

export async function deleteBookmark(id: string): Promise<void> {
  const bookmarks = await getBookmarks();
  const filtered = bookmarks.filter(b => b.id !== id);
  await saveBookmarks(filtered);
}

export async function updateBookmark(id: string, updates: Partial<BookmarkLink>): Promise<void> {
  const bookmarks = await getBookmarks();
  const index = bookmarks.findIndex(b => b.id === id);
  if (index !== -1) {
    bookmarks[index] = { ...bookmarks[index], ...updates };
    await saveBookmarks(bookmarks);
  }
}

export async function exportBookmarks(): Promise<void> {
  const bookmarks = await getBookmarks();
  const dataStr = JSON.stringify(bookmarks, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `iris-bookmarks-${timestamp}.json`;
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  
  URL.revokeObjectURL(url);
}

export async function importBookmarks(file: File): Promise<{ success: number; skipped: number; error?: string }> {
  try {
    const text = await file.text();
    const importedBookmarks = JSON.parse(text) as BookmarkLink[];
    
    if (!Array.isArray(importedBookmarks)) {
      return { success: 0, skipped: 0, error: 'Invalid file format: expected an array of bookmarks' };
    }
    
    const existingBookmarks = await getBookmarks();
    const existingUrls = new Set(existingBookmarks.map(b => b.url));
    
    let successCount = 0;
    let skippedCount = 0;
    
    for (const bookmark of importedBookmarks) {
      if (!bookmark.url || !bookmark.title) {
        skippedCount++;
        continue;
      }
      
      if (existingUrls.has(bookmark.url)) {
        skippedCount++;
        continue;
      }
      
      // Ensure the bookmark has required fields
      const newBookmark: BookmarkLink = {
        id: bookmark.id || Date.now().toString() + Math.random(),
        title: bookmark.title,
        url: bookmark.url,
        remark: bookmark.remark,
        category: bookmark.category,
        createdAt: bookmark.createdAt || Date.now()
      };
      
      existingBookmarks.push(newBookmark);
      existingUrls.add(bookmark.url);
      successCount++;
    }
    
    if (successCount > 0) {
      await saveBookmarks(existingBookmarks);
    }
    
    return { success: successCount, skipped: skippedCount };
  } catch (error) {
    return { success: 0, skipped: 0, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
