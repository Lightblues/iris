import type { ReadingListEntry } from './types';

export async function getReadingList(): Promise<ReadingListEntry[]> {
  const entries = await chrome.readingList.query({});
  return entries as ReadingListEntry[];
}

export async function addToReadingList(entry: { url: string; title: string }): Promise<void> {
  await chrome.readingList.addEntry({
    url: entry.url,
    title: entry.title,
    hasBeenRead: false,
  });
}

export async function updateReadingListEntry(
  url: string,
  updates: { title?: string; hasBeenRead?: boolean }
): Promise<void> {
  await chrome.readingList.updateEntry({
    url,
    ...updates,
  });
}

export async function removeFromReadingList(url: string): Promise<void> {
  await chrome.readingList.removeEntry({ url });
}

export async function exportReadingList(): Promise<void> {
  const entries = await getReadingList();
  const dataStr = JSON.stringify(entries, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const downloadUrl = URL.createObjectURL(dataBlob);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `iris-reading-list-${timestamp}.json`;

  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(downloadUrl);
}
