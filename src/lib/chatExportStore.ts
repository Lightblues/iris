import type {
  ChatExportSaveMessage,
  ChatExportSaveResponse,
  ChatExportPlatform,
  ChatExportIndexEntry,
  ChatExportCheckResponse,
} from './types'
import { getChatExportDirectoryHandle, queryDirectoryPermission } from './fileSystemAccess'
import {
  ensureSubdirectory,
  writeFile,
  readFile,
  parseIndexLines,
  upsertIndexLine,
} from './fsWrite'

// Persist one raw conversation to the user-picked export directory:
//   <dir>/<platform>/<id>.json     raw API JSON, verbatim
//   <dir>/<platform>/index.jsonl   one upserted line per conversation
export async function saveChatExport(
  msg: ChatExportSaveMessage,
): Promise<ChatExportSaveResponse> {
  const root = await getChatExportDirectoryHandle()
  if (!root) {
    return { success: false, error: 'Chat export directory not configured (Settings → Chat Export)' }
  }

  // A service worker has no user activation, so it can only *query*. After an
  // extension reload Chrome downgrades the handle to 'prompt', which must be
  // re-granted from the sidepanel (Settings → Chat Export → Reconnect).
  const perm = await queryDirectoryPermission(root)
  if (perm !== 'granted') {
    return {
      success: false,
    error: `Export directory needs re-authorization (${root.name}/). Open Iris Settings → Chat Export → Reconnect.`,
    }
  }

  try {
    const dir = await ensureSubdirectory(root, msg.platform)
    const filename = `${msg.id}.json`

    // Raw JSON, verbatim — preserves branch tree / parent_id.
    await writeFile(dir, filename, JSON.stringify(msg.raw, null, 2))

 // Upsert index line (conversations can be re-exported after updates).
    const existing = parseIndexLines(await readFile(dir, 'index.jsonl'))
    const line = JSON.stringify({
      id: msg.id,
      platform: msg.platform,
      title: msg.title,
          createTime: msg.createTime ?? null,
      updatedAt: msg.updatedAt ?? null,
      exportedAt: new Date().toISOString(),
      filename,
    })
    const updated = upsertIndexLine(existing, msg.id, line)
    await writeFile(dir, 'index.jsonl', updated.join('\n') + '\n')

    return { success: true, filename }
  } catch (err: any) {
  return { success: false, error: err?.message || 'Failed to write chat export' }
  }
}

// Read the on-disk index so export-all can skip unchanged conversations.
export async function readChatExportIndex(
  platform: ChatExportPlatform,
): Promise<ChatExportIndexEntry[]> {
  const root = await getChatExportDirectoryHandle()
  if (!root) return []
  if ((await queryDirectoryPermission(root)) !== 'granted') return []

  try {
    const dir = await ensureSubdirectory(root, platform)
    const lines = parseIndexLines(await readFile(dir, 'index.jsonl'))
    const out: ChatExportIndexEntry[] = []
    for (const line of lines) {
      try {
      const o = JSON.parse(line)
        if (o?.id) out.push({ id: o.id, updatedAt: o.updatedAt ?? null, exportedAt: o.exportedAt })
      } catch {}
    }
    return out
  } catch {
    return []
  }
}

// Preflight check so a long export fails fast instead of at the last item.
export async function checkChatExportReady(): Promise<ChatExportCheckResponse> {
  const root = await getChatExportDirectoryHandle()
  if (!root) return { ready: false, reason: 'not-configured' }
  const perm = await queryDirectoryPermission(root)
  if (perm !== 'granted') {
    return { ready: false, reason: 'needs-grant', dirName: root.name }
  }
  return { ready: true, dirName: root.name }
}
