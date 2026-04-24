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

// --- A) Baseline: single sidePanel.open({ tabId }) ------------------------
//     Matches iris today. Slow path, ~4s gap between open → panel connect.
chrome.action.onClicked.addListener((tab) => {
  if (tab?.id == null) return
  const t0 = Date.now()
  chrome.sidePanel
    .open({ tabId: tab.id })
    .then(() => log(`A sidePanel.open resolved (+${Date.now() - t0}ms)`))
    .catch((err) => log('A sidePanel.open threw', err))
  snapshotWindow(tab).then((snap) => log('A action.onClicked', snap))
})

// --- E) Spam-open: call sidePanel.open three times back-to-back -----------
//     Hypothesis: a second/third open while the first is still pending
//     triggers Chrome's "rush" path that commits the panel frame quickly.
//     Trigger: Cmd+Shift+L  (L for 'Loud'/spam)
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'variant-e-spam-open') {
    if (tab?.id == null) return
    const t0 = Date.now()
    log('E commands.onCommand: spamming 3 open calls')
    for (let i = 0; i < 3; i++) {
      chrome.sidePanel
        .open({ tabId: tab.id })
        .then(() => log(`E open #${i} resolved (+${Date.now() - t0}ms)`))
        .catch((err) => log(`E open #${i} threw`, err))
    }
  } else if (command === 'variant-f-delayed-nudge') {
    // VARIANT F: open once (with gesture), then after 1s auto-nudge a 2nd
    // open from setTimeout (WITHOUT user gesture). Hypothesis:
    //   1st call  — creates WebContents, renderer loads, stays hidden
    //   2nd call  — after renderer is ready, triggers visibility commit
    // Question: does 2nd call throw "user gesture required" since panel is
    // already "opening" for this tab?
    if (tab?.id == null) return
    const t0 = Date.now()
    log('F commands.onCommand: open now + nudge in 1000ms')
    chrome.sidePanel
      .open({ tabId: tab.id })
      .then(() => log(`F open #0 resolved (+${Date.now() - t0}ms)`))
      .catch((err) => log('F open #0 threw', err))
    setTimeout(() => {
      chrome.sidePanel
        .open({ tabId: tab.id })
        .then(() => log(`F nudge resolved (+${Date.now() - t0}ms)`))
        .catch((err) => log('F nudge threw', err))
    }, 1000)
  } else if (command === 'variant-g-double-nudge') {
    // VARIANT G: open + nudge at 700ms + nudge at 1500ms. If F's single
    // nudge is too early sometimes, spacing two nudges may catch more cases.
    if (tab?.id == null) return
    const t0 = Date.now()
    log('G commands.onCommand: open + 2 nudges')
    chrome.sidePanel
      .open({ tabId: tab.id })
      .then(() => log(`G open #0 resolved (+${Date.now() - t0}ms)`))
      .catch((err) => log('G open #0 threw', err))
    setTimeout(() => {
      chrome.sidePanel
        .open({ tabId: tab.id })
        .then(() => log(`G nudge#1 resolved (+${Date.now() - t0}ms)`))
        .catch((err) => log('G nudge#1 threw', err))
    }, 700)
    setTimeout(() => {
      chrome.sidePanel
        .open({ tabId: tab.id })
        .then(() => log(`G nudge#2 resolved (+${Date.now() - t0}ms)`))
        .catch((err) => log('G nudge#2 threw', err))
    }, 1500)
  } else if (command === 'variant-f-delayed-nudge') {
    // VARIANT F: open once (with gesture), then after 1s auto-nudge a 2nd
    // open from setTimeout (WITHOUT user gesture). Hypothesis:
    //   1st call  — creates WebContents, renderer loads, stays hidden
    //   2nd call  — after renderer is ready, triggers visibility commit
    // Question: does 2nd call throw "user gesture required" since panel is
    // already "opening" for this tab?
    if (tab?.id == null) return
    const t0 = Date.now()
    log('F commands.onCommand: open now + nudge in 1000ms')
    chrome.sidePanel
      .open({ tabId: tab.id })
      .then(() => log(`F open #0 resolved (+${Date.now() - t0}ms)`))
      .catch((err) => log('F open #0 threw', err))
    setTimeout(() => {
      chrome.sidePanel
        .open({ tabId: tab.id })
        .then(() => log(`F nudge resolved (+${Date.now() - t0}ms)`))
        .catch((err) => log('F nudge threw', err))
    }, 1000)
  } else if (command === 'variant-g-double-nudge') {
    // VARIANT G: open + nudge at 700ms + nudge at 1500ms. If F's single
    // nudge is too early sometimes, spacing two nudges may catch more cases.
    if (tab?.id == null) return
    const t0 = Date.now()
    log('G commands.onCommand: open + 2 nudges')
    chrome.sidePanel
      .open({ tabId: tab.id })
      .then(() => log(`G open #0 resolved (+${Date.now() - t0}ms)`))
      .catch((err) => log('G open #0 threw', err))
    setTimeout(() => {
      chrome.sidePanel
        .open({ tabId: tab.id })
        .then(() => log(`G nudge#1 resolved (+${Date.now() - t0}ms)`))
        .catch((err) => log('G nudge#1 threw', err))
    }, 700)
    setTimeout(() => {
      chrome.sidePanel
        .open({ tabId: tab.id })
        .then(() => log(`G nudge#2 resolved (+${Date.now() - t0}ms)`))
        .catch((err) => log('G nudge#2 threw', err))
    }, 1500)
  }
})

// --- B & C via keyboard commands ---
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'variant-b-focus-then-open') {
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
