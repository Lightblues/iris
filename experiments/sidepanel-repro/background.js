// SidePanel Repro — baseline (Phase 1)
// Equivalent to iris' current code: async handler + sidePanel.open({ tabId }).
// Every path logs a timestamp so we can correlate with sidepanel boot logs.

const T0 = Date.now()
const t = () => `+${Date.now() - T0}ms`
const log = (...a) => console.log('[repro bg]', t(), ...a)

log('SW booted')

// Explicit: do NOT use Chrome's built-in auto-open; we want to observe our own
// call site. This matches iris' current setting.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: false })
  .catch((err) => log('setPanelBehavior failed', err))

// --- Path 1: toolbar action click (async handler, like iris today) ---
chrome.action.onClicked.addListener(async (tab) => {
  log('action.onClicked', { tabId: tab?.id, windowId: tab?.windowId })
  if (tab?.id == null) return
  try {
    await chrome.sidePanel.open({ tabId: tab.id })
    log('sidePanel.open (action) resolved')
  } catch (err) {
    log('sidePanel.open (action) threw', err)
  }
})

// --- Path 2: keyboard shortcut (async handler) ---
chrome.commands.onCommand.addListener(async (command, tab) => {
  log('commands.onCommand', command, { tabId: tab?.id, windowId: tab?.windowId })
  if (command !== 'open-via-command') return
  if (tab?.id == null) return
  try {
    await chrome.sidePanel.open({ tabId: tab.id })
    log('sidePanel.open (command) resolved')
  } catch (err) {
    log('sidePanel.open (command) threw', err)
  }
})

// --- Path 3: FAB click relayed from content script (the known-good path) ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'repro-open-side-panel') return
  const tabId = sender.tab?.id
  log('msg repro-open-side-panel', { tabId, windowId: sender.tab?.windowId })
  if (tabId == null) {
    sendResponse({ ok: false, reason: 'no tab id' })
    return true
  }
  chrome.sidePanel
    .open({ tabId })
    .then(() => {
      log('sidePanel.open (fab msg) resolved')
      sendResponse({ ok: true })
    })
    .catch((err) => {
      log('sidePanel.open (fab msg) threw', err)
      sendResponse({ ok: false, reason: String(err) })
    })
  return true // async response
})
