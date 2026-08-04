import type { ChatExportSaveMessage, ChatExportSaveResponse } from '@/lib/types'
import type { ChatPlatformAdapter } from './types'

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
  const bg = kind === 'error' ? '#dc2626' : kind === 'success' ? '#16a34a' : '#334155'
  toastEl.style.background = bg
  toastEl.textContent = text
  toastEl.style.opacity = '1'
}

function hideToastLater(delay = 3000): void {
  if (!toastEl) return
  const el = toastEl
  setTimeout(() => { el.style.opacity = '0' }, delay)
}

async function saveOne(msg: ChatExportSaveMessage): Promise<ChatExportSaveResponse> {
  return chrome.runtime.sendMessage(msg) as Promise<ChatExportSaveResponse>
}

async function exportIds(adapter: ChatPlatformAdapter, ids: string[]): Promise<void> {
  let done = 0
  let failed = 0
  for (const id of ids) {
    try {
      const conv = await adapter.fetchConversation(id)
      const res = await saveOne({
        type: 'chat_export_save',
      platform: adapter.id,
        id,
        title: conv.title,
        createTime: conv.createTime,
  raw: conv.raw,
  })
   if (res?.success) done++
      else { failed++; console.warn('[Iris] export save failed:', res?.error) }
    } catch (err: any) {
    failed++
      console.warn('[Iris] export fetch failed:', err?.message || err)
    }
 if (ids.length > 1) showToast(`Exporting ${adapter.label}… ${done + failed}/${ids.length}`, 'info')
  }
  if (failed === 0) {
    showToast(`Exported ${done} ${adapter.label} conversation${done === 1 ? '' : 's'}`, 'success')
  } else {
    showToast(`Exported ${done}, ${failed} failed — see console`, failed && !done ? 'error' : 'info')
  }
  hideToastLater()
}

export async function exportCurrent(adapter: ChatPlatformAdapter): Promise<void> {
  const id = adapter.currentConversationId(window.location.href)
  if (!id) {
    showToast('Open a conversation first', 'error')
    hideToastLater()
    return
  }
  showToast(`Exporting current ${adapter.label} conversation…`, 'info')
  await exportIds(adapter, [id])
}

export async function exportAll(adapter: ChatPlatformAdapter): Promise<void> {
  showToast(`Listing ${adapter.label} conversations…`, 'info')
  try {
    const ids = await adapter.listConversationIds()
    if (ids.length === 0) {
      showToast('No conversations found', 'error')
      hideToastLater()
      return
    }
    await exportIds(adapter, ids)
  } catch (err: any) {
    showToast(err?.message || 'Failed to list conversations', 'error')
    hideToastLater(5000)
  }
}
