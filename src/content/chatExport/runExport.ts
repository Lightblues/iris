import type {
  ChatExportSaveMessage,
  ChatExportSaveResponse,
  ChatExportIndexResponse,
  ChatExportCheckResponse,
} from '@/lib/types'
import type { ChatPlatformAdapter, ChatSessionSummary } from './types'

// --- Minimal in-page toast (inline styles, no CSS dependency) ---

let toastEl: HTMLDivElement | null = null

function showToast(text: string, kind: 'info' | 'success' | 'error' = 'info'): void {
  if (!toastEl) {
    toastEl = document.createElement('div')
    toastEl.id = 'iris-chat-export-toast'
    Object.assign(toastEl.style, {
      position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
      zIndex: '2147483647', padding: '10px 16px', borderRadius: '8px',
      font: '13px/1.4 -apple-system, system-ui, sans-serif', color: '#fff',
      boxShadow: '0 4px 16px rgba(0,0,0,.25)', maxWidth: '80vw', pointerEvents: 'none',
    } as CSSStyleDeclaration)
    document.body.appendChild(toastEl)
  }
  toastEl.style.background =
    kind === 'error' ? '#dc2626' : kind === 'success' ? '#16a34a' : '#334155'
  toastEl.textContent = text
  toastEl.style.opacity = '1'
}

function hideToastLater(delay = 3000): void {
  if (!toastEl) return
  const el = toastEl
  setTimeout(() => { el.style.opacity = '0' }, delay)
}

// --- Export ---

async function saveOne(msg: ChatExportSaveMessage): Promise<ChatExportSaveResponse> {
  return chrome.runtime.sendMessage(msg) as Promise<ChatExportSaveResponse>
}

/** Thrown when the export directory is unusable — abort the whole run. */
class ExportBlocked extends Error {}

/**
 * Hold a port open (cycled well inside Chrome's idle window) so the MV3 service
 * worker isn't torn down mid-export. A restarted SW loses its File System
 * Access permission grant, which surfaces as a spurious re-authorization error.
 */
function startKeepalive(): () => void {
  let port: chrome.runtime.Port | null = null
  const open = () => {
    try { port = chrome.runtime.connect({ name: 'iris-keepalive' }) } catch { port = null }
  }
  open()
  const iv = setInterval(() => {
    try { port?.disconnect() } catch { /* already gone */ }
    open()
  }, 20000)
  return () => {
    clearInterval(iv)
    try { port?.disconnect() } catch { /* already gone */ }
  }
}

// Tracks the SW instance across saves so a teardown is reported, not guessed.
let lastSwInstance: string | null = null

function noteSwInstance(id?: string): boolean {
  if (!id) return false
  const restarted = lastSwInstance !== null && lastSwInstance !== id
  if (restarted) {
    console.warn(`[Iris] service worker restarted mid-export (${lastSwInstance} -> ${id})`)
  }
  lastSwInstance = id
  return restarted
}

/**
 * Verify the export directory is linked AND still authorized before doing any
 * network work. Chrome downgrades directory handles to 'prompt' whenever the
 * extension reloads, so this is a routine state, not an edge case.
 */
async function preflight(): Promise<void> {
  const res = (await chrome.runtime.sendMessage({
    type: 'chat_export_check',
  })) as ChatExportCheckResponse

  if (res?.ready) return
  if (res?.reason === 'not-configured') {
    throw new ExportBlocked('No export directory set — Iris Settings → Chat Export → Choose Directory')
  }
  throw new ExportBlocked(
    `Export directory needs re-authorization (${res?.dirName || 'chat-exports'}/) — ` +
    'Iris Settings → Chat Export → Reconnect',
  )
}

async function fetchAndSave(
  adapter: ChatPlatformAdapter,
  id: string,
  fallbackUpdatedAt?: number,
): Promise<boolean> {
  const conv = await adapter.fetchConversation(id)
  const res = await saveOne({
    type: 'chat_export_save',
    platform: adapter.id,
    id,
    title: conv.title,
createTime: conv.createTime,
    // Prefer the detail payload's timestamp; fall back to the list's.
    updatedAt: conv.updatedAt ?? fallbackUpdatedAt,
  raw: conv.raw,
  })
  const restarted = noteSwInstance(res?.swInstance)
  if (!res?.success) {
    let msg = res?.error || 'save failed'
    // A directory-level failure will hit every remaining item — stop now.
    if (/re-authorization|not configured|Permission/i.test(msg)) {
      if (restarted) {
   msg = 'Background worker restarted and lost directory access — reopen ' +
              'Iris Settings -> Chat Export -> Reconnect, then re-run ' +
          '(already-exported chats are skipped).'
}
      throw new ExportBlocked(msg)
    }
    throw new Error(msg)
  }
  return true
}

export async function exportCurrent(adapter: ChatPlatformAdapter): Promise<void> {
  const id = adapter.currentConversationId(window.location.href)
  if (!id) {
 showToast('Open a conversation first', 'error')
    hideToastLater()
    return
  }
  showToast(`Exporting current ${adapter.label} conversation…`, 'info')
  try {
    await preflight()
    await fetchAndSave(adapter, id)
    showToast('Exported 1 conversation', 'success')
  } catch (err: any) {
    showToast(err?.message || 'Export failed', 'error')
    hideToastLater(6000)
    return
  }
  hideToastLater()
}

/**
 * Export every conversation, skipping ones already on disk whose `updated_at`
 * hasn't advanced since the last export. Listing is cheap (100/page); the
 * per-conversation detail fetch is what we avoid.
 */
export async function exportAll(
  adapter: ChatPlatformAdapter,
  opts: { force?: boolean } = {},
): Promise<void> {
  // Fail fast: check the directory before any network work.
  try {
    await preflight()
  } catch (err: any) {
    showToast(err?.message || 'Export directory unavailable', 'error')
    hideToastLater(8000)
    return
  }

  showToast(`Listing ${adapter.label} conversations…`, 'info')

  let sessions: ChatSessionSummary[]
  try {
    sessions = await adapter.listConversations()
  } catch (err: any) {
    showToast(err?.message || 'Failed to list conversations', 'error')
    hideToastLater(6000)
    return
  }
  if (sessions.length === 0) {
    showToast('No conversations found', 'error')
    hideToastLater()
    return
  }

  // Build the "already exported" map from the on-disk index.
  const known = new Map<string, number | null>()
  if (!opts.force) {
    const res = (await chrome.runtime.sendMessage({
      type: 'chat_export_index',
      platform: adapter.id,
    })) as ChatExportIndexResponse
    for (const e of res?.entries || []) known.set(e.id, e.updatedAt ?? null)
  }

  const todo = sessions.filter(s => {
    if (!known.has(s.id)) return true       // never exported
    const prev = known.get(s.id)
    if (prev == null) return true  // exported before we tracked time
    if (s.updatedAt == null) return false     // no signal → assume unchanged
    return s.updatedAt > prev            // changed since last export
  })

  const skipped = sessions.length - todo.length
  if (todo.length === 0) {
    showToast(`Up to date — ${skipped} conversation${skipped === 1 ? '' : 's'} unchanged`, 'success')
    hideToastLater()
    return
  }

  let done = 0
  let failed = 0
  const stopKeepalive = startKeepalive()
  try {
  for (const s of todo) {
    try {
      await fetchAndSave(adapter, s.id, s.updatedAt)
      done++
    } catch (err: any) {
      // Directory-level problem: every remaining item would fail the same way.
      if (err instanceof ExportBlocked) {
        showToast(
    `Stopped after ${done} exported — ${err.message}`,
    done ? 'info' : 'error',
        )
   hideToastLater(8000)
        return
      }
      failed++
      console.warn('[Iris] export failed for', s.id, err?.message || err)
    }
    showToast(
      `Exporting ${adapter.label}… ${done + failed}/${todo.length}` +
      (skipped ? ` (${skipped} unchanged)` : ''),
      'info',
    )
  }

  const tail = skipped ? `, ${skipped} unchanged` : ''
  if (failed === 0) {
    showToast(`Exported ${done} conversation${done === 1 ? '' : 's'}${tail}`, 'success')
  } else {
    showToast(`Exported ${done}, ${failed} failed${tail} — see console`, done ? 'info' : 'error')
  }
  hideToastLater(failed ? 6000 : 3000)
  } finally {
    stopKeepalive()
  }
}
