console.log('[Iris] Content script loaded')

import './commandMenu.css'
import './floatingSidebar.css'
import { readGmLogs } from './gmBridge'
import { initDerivedTabOpens } from './derivedTabs'
import { showCommandMenu } from './commandMenu'
import { initFloatingSidebar, toggleFloatingSidebar, refreshFab, setFabCustomActions } from './floatingSidebar'
import { getAdapterForUrl } from './chatExport'
import { handleIrisChatApi } from './chatExport/relayApi'
import { exportCurrent, exportAll } from './chatExport/runExport'
import { saveHighlight, restoreHighlights, initSelectionPopup } from './highlights'
import { extractAndConvertPage, convertSelectionToMarkdown, copyToClipboard } from '../lib/markdown'
import type { MarkdownConvertMessage } from '../lib/types'

  initDerivedTabOpens()

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'open-command-menu') {
    showCommandMenu()
    sendResponse({ success: true })
  } else if (message.type === 'toggle-floating-sidebar') {
    toggleFloatingSidebar()
    sendResponse({ success: true })
  } else if (message.type === 'convert-to-markdown') {
    handleMarkdownConvert(message as MarkdownConvertMessage).then(sendResponse)
    return true
  } else if (message.type === 'extract-page-content') {
    handleExtractPageContent().then(sendResponse)
    return true
  } else if (message.type === 'extract-selection-content') {
    handleExtractSelectionContent().then(sendResponse)
    return true
  } else if (message.type === 'iris_chat_api') {
    handleIrisChatApi(message)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }))
    return true
  } else if (message.type === 'iris-gm-log') {
    sendResponse({ lines: readGmLogs() })
  } else if (message.type === 'save-highlight') {
    // Unified highlight save: capture selection + send to background + apply mark
    saveHighlight().then((entryId) => {
      sendResponse({ success: !!entryId, entryId })
    })
    return true
  }
  return true
})

async function handleExtractPageContent(): Promise<{ success: boolean; content?: string; title?: string; error?: string }> {
  console.log('[Iris Content] Extracting page content...')
  const result = extractAndConvertPage()
  if (result.success && result.markdown) {
    console.log('[Iris Content] Extraction successful, length:', result.markdown.length)
    return { success: true, content: result.markdown, title: result.title }
  }
  console.log('[Iris Content] Extraction failed:', result.error)
  return { success: false, error: result.error || 'Failed to extract content' }
}

async function handleExtractSelectionContent(): Promise<{ success: boolean; content?: string; title?: string; error?: string }> {
  console.log('[Iris Content] Extracting selection content...')
  const result = convertSelectionToMarkdown()
  if (result.success && result.markdown) {
    console.log('[Iris Content] Selection extraction successful, length:', result.markdown.length)
    return { success: true, content: result.markdown, title: document.title }
  }
  console.log('[Iris Content] Selection extraction failed:', result.error)
  return { success: false, error: result.error || 'No text selected' }
}

async function handleMarkdownConvert(message: MarkdownConvertMessage): Promise<{ success: boolean; message: string }> {
  const result = message.mode === 'page'
    ? extractAndConvertPage()
    : convertSelectionToMarkdown()

  if (!result.success || !result.markdown) {
    return { success: false, message: result.error || 'Conversion failed' }
  }

  const copied = await copyToClipboard(result.markdown)
  if (!copied) {
    return { success: false, message: 'Clipboard access denied' }
  }

  const label = message.mode === 'page' ? 'page' : 'selection'
  return { success: true, message: `Copied ${label} as Markdown` }
}

let isInitialized = false

// Initialize page enhancements
async function init() {
  const url = window.location.href
  console.log('[Iris] Content script initialized on', url)

  if (!isInitialized) {
    await initFloatingSidebar()
    initSelectionPopup()
    isInitialized = true
  } else {
    refreshFab()
  }

  // Restore saved highlights for this page
  restoreHighlights(url).catch(() => {})

  updateChatExportActions(url)
}

function updateChatExportActions(url: string): void {
  const adapter = getAdapterForUrl(url)
  if (!adapter) {
    setFabCustomActions([])
    return
  }
  const hasConversation = adapter.currentConversationId(url) != null
  setFabCustomActions([
    {
      label: `Export current (${adapter.label})`,
      icon: '⬇',
      disabled: !hasConversation,
      onClick: () => { exportCurrent(adapter).catch(err => console.warn('[Iris] export current failed:', err)) },
    },
    {
      label: `Export new/updated (${adapter.label})`,
      icon: '📦',
      onClick: () => { exportAll(adapter).catch(err => console.warn('[Iris] export all failed:', err)) },
    },
    {
      label: 'Force re-export all',
      icon: '🔄',
      onClick: () => { exportAll(adapter, { force: true }).catch(err => console.warn('[Iris] force export failed:', err)) },
    },
  ])
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}

// Also listen for SPA navigation (e.g., pushState)
let lastUrl = location.href
new MutationObserver(() => {
  const currentUrl = location.href
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl
    console.log('[Iris] URL changed to', currentUrl)
    init()
  }
}).observe(document, { subtree: true, childList: true })
