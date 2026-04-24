// SidePanel Repro — multi-variant (Phase 3+).
//
// Four entry points, all same tab. Compare timings:
//   A) action.onClicked — async await, sidePanel.open({tabId})           [BASELINE]
//   B) command Cmd+Shift+U — sync call, windows.update({focused:true})   [VARIANT B]
//   C) command Cmd+Shift+I — sync call, windowId instead of tabId        [VARIANT C]
//   D) fab message from content script                                   [KNOWN-GOOD CONTROL]
//
// Every variant logs { variant, tabId, windowId, currentWindowId } so we can
// detect multi-monitor window mismatch.

const T0 = Date.now()
const t = () => `+${Date.now() - T0}ms`
const log = (...a) => console.log('[repro bg]', t(), ...a)

log('SW booted')

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: false })
  .catch((err) => log('setPanelBehavior failed', err))

async function snapshotWindow(tab) {
  let currentWindowId = null
  try {
    const w = await chrome.windows.getCurrent()
    currentWindowId = w?.id ?? null
  } catch {}
  return {
    tabId: tab?.id,
    tabWindowId: tab?.windowId,
    currentWindowId,
    sameWindow: tab?.windowId === currentWindowId,
  }
}

// --- A) Baseline: async handler, sidePanel.open({tabId}) called synchronously
//     (no await before open → preserves user gesture, matches iris today) ---
chrome.action.onClicked.addListener((tab) => {
  if (tab?.id == null) return
  // Kick open FIRST — never let a microtask sneak in before open().
  chrome.sidePanel
    .open({ tabId: tab.id })
    .then(() => log('A sidePanel.open resolved'))
    .catch((err) => log('A sidePanel.open threw', err))
  // Log diagnostics AFTER open — won't affect gesture.
  snapshotWindow(tab).then((snap) => log('A action.onClicked', snap))
})

// --- B & C via keyboard commands ---
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'variant-b-focus-then-open') {
    // VARIANT B: windows.update({ focused: true }) BEFORE open, all synchronous.
    // Hypothesis: multi-monitor may hand us a non-foreground windowId; forcing
    // focus first should "promote" the target window so the side panel mounts
    // into a visible BrowserView.
    snapshotWindow(tab).then((snap) => log('B commands.onCommand', snap))
    if (tab?.id == null || tab?.windowId == null) return
    // Fire & forget, keep the user-gesture stack alive.
    chrome.windows.update(tab.windowId, { focused: true })
    chrome.sidePanel
      .open({ tabId: tab.id })
      .then(() => log('B sidePanel.open resolved'))
      .catch((err) => log('B sidePanel.open threw', err))
  } else if (command === 'variant-c-window-id') {
    // VARIANT C: use { windowId } instead of { tabId } — compare whether the
    // parameter choice affects which BrowserView the panel attaches to.
    snapshotWindow(tab).then((snap) => log('C commands.onCommand', snap))
    if (tab?.windowId == null) return
    chrome.sidePanel
      .open({ windowId: tab.windowId })
      .then(() => log('C sidePanel.open resolved'))
      .catch((err) => log('C sidePanel.open threw', err))
  }
})

// --- D) FAB relay (control) ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'repro-open-side-panel') return
  const tab = sender.tab
  snapshotWindow(tab).then((snap) => log('D msg repro-open-side-panel', snap))
  if (tab?.id == null) {
    sendResponse({ ok: false, reason: 'no tab id' })
    return true
  }
  chrome.sidePanel
    .open({ tabId: tab.id })
    .then(() => {
      log('D sidePanel.open resolved')
      sendResponse({ ok: true })
    })
    .catch((err) => {
      log('D sidePanel.open threw', err)
      sendResponse({ ok: false, reason: String(err) })
    })
  return true
})

// --- Watchdog experiment: if the panel never reports "visible" within N ms,
// try re-opening from the SW. The panel notifies visibility via a port.
const VISIBLE_DEADLINE_MS = 1500
const activeWatchdogs = new Map() // tabId -> timerId

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'repro-panel-alive') return
  log('panel connected port')
  port.onMessage.addListener((msg) => {
    if (msg?.type === 'visible') {
      log('panel reports visible')
      // cancel all pending watchdogs; any open we did is now considered good.
      for (const [tabId, id] of activeWatchdogs) {
        clearTimeout(id)
        activeWatchdogs.delete(tabId)
      }
    }
  })
  port.onDisconnect.addListener(() => log('panel port disconnected'))
})

// Re-exposed helper so we can arm a watchdog for variants that want it.
// Variant E: re-open after 1.5s if no visibility report. Wire by uncommenting
// the armWatchdog(tab.id) calls above after we baseline A/B/C/D.
function armWatchdog(tabId) {
  if (activeWatchdogs.has(tabId)) clearTimeout(activeWatchdogs.get(tabId))
  const id = setTimeout(() => {
    log(`WATCHDOG firing: re-open tabId=${tabId}`)
    chrome.sidePanel
      .open({ tabId })
      .then(() => log('watchdog re-open resolved'))
      .catch((err) => log('watchdog re-open threw', err))
    activeWatchdogs.delete(tabId)
  }, VISIBLE_DEADLINE_MS)
  activeWatchdogs.set(tabId, id)
}

// Expose for quick manual wiring later:
globalThis.__armWatchdog = armWatchdog
