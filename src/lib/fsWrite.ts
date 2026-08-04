// Shared File System Access helpers for writing structured data to a picked
// directory. Used by vestaSync.ts and chatExportStore.ts.

export async function ensureSubdirectory(
  root: FileSystemDirectoryHandle,
  ...path: string[]
): Promise<FileSystemDirectoryHandle> {
  let current = root
  for (const segment of path) {
    current = await current.getDirectoryHandle(segment, { create: true })
  }
  return current
}

export async function writeFile(
  dir: FileSystemDirectoryHandle,
  name: string,
  content: string,
): Promise<void> {
  const fileHandle = await dir.getFileHandle(name, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(content)
  await writable.close()
}

export async function readFile(
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

// --- Index (JSONL) helpers ---

export function parseIndexLines(content: string | null): string[] {
  if (!content) return []
  return content.trim().split('\n').filter(Boolean)
}

export function indexIdSet(lines: string[]): Set<string> {
  const ids = new Set<string>()
  for (const line of lines) {
    try { ids.add(JSON.parse(line).id) } catch {}
  }
  return ids
}

// Upsert: replace existing line by id, or append
export function upsertIndexLine(lines: string[], id: string, newLine: string): string[] {
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
