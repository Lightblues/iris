import type { ChatExportSaveMessage, ChatExportSaveResponse } from './types'
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
