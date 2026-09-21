/** Tab-scoped Chrome side panel. Global panel is disabled; only opted-in tabs show Iris. */

import { copyTabSession, isBrowserNewTab } from '../sidepanel/sessionPersist'

const PANEL_PATH = 'src/sidepanel/index.html'
const STORAGE_KEY = 'iris_panel_open_tabs'

const openTabs = new Set<number>()

function persist(): void {
  chrome.storage.session.set({ [STORAGE_KEY]: [...openTabs] }).catch(() => {})
}

function enableTab(tabId: number): void {
  // Do not await — open() must stay in the user-gesture stack.
  chrome.sidePanel.setOptions({ tabId, path: PANEL_PATH, enabled: true })
  openTabs.add(tabId)
  persist()
}

function disableTab(tabId: number): void {
  chrome.sidePanel.setOptions({ tabId, enabled: false }).catch(() => {})
  if (openTabs.delete(tabId)) persist()
}

async function restore(): Promise<void> {
  try {
    const data = await chrome.storage.session.get(STORAGE_KEY)
    const ids = data[STORAGE_KEY] as number[] | undefined
    if (ids) {
      for (const id of ids) openTabs.add(id)
    }
  } catch { /* session storage unavailable */ }

  for (const tabId of [...openTabs]) {
    try {
      await chrome.tabs.get(tabId)
      chrome.sidePanel.setOptions({ tabId, path: PANEL_PATH, enabled: true }).catch(() => {})
    } catch {
      openTabs.delete(tabId)
    }
  }
  persist()
}

async function syncTabEnabled(tabId: number): Promise<void> {
  if (openTabs.has(tabId)) {
    await chrome.sidePanel.setOptions({ tabId, path: PANEL_PATH, enabled: true })
  } else {
    await chrome.sidePanel.setOptions({ tabId, enabled: false })
  }
}

export async function toggleForTab(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id == null) return
  const tabId = tab.id
  if (openTabs.has(tabId)) {
    disableTab(tabId)
    try {
      await chrome.sidePanel.close({ tabId })
    } catch {
      if (tab.windowId != null) {
        await chrome.sidePanel.close({ windowId: tab.windowId }).catch(() => {})
      }
    }
    return
  }
  enableTab(tabId)
  try {
    await chrome.sidePanel.open({ tabId })
  } catch (err) {
    console.warn('[Iris] sidePanel.open failed:', err)
    disableTab(tabId)
  }
}

export function openForTab(tabId: number): Promise<void> {
  enableTab(tabId)
  return chrome.sidePanel.open({ tabId }).catch(err => {
    disableTab(tabId)
    throw err
  })
}

export function initSidePanel(): void {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(console.error)
  chrome.sidePanel.setOptions({ enabled: false }).catch(console.error)
  void restore()

  chrome.action.onClicked.addListener(tab => {
    void toggleForTab(tab)
  })

  chrome.tabs.onActivated.addListener(({ tabId }) => {
    void syncTabEnabled(tabId)
  })

  chrome.tabs.onRemoved.addListener(tabId => {
    if (openTabs.delete(tabId)) persist()
  })

  chrome.tabs.onCreated.addListener(tab => {
    if (tab.id == null || tab.openerTabId == null) return
    if (!openTabs.has(tab.openerTabId)) return
    if (isBrowserNewTab(tab)) return
    enableTab(tab.id)
    void copyTabSession(tab.openerTabId, tab.id)
  })

  const onClosed = chrome.sidePanel.onClosed
  if (onClosed) {
    onClosed.addListener(async info => {
      if (info.tabId == null) return
      try {
        const [active] = await chrome.tabs.query({ active: true, windowId: info.windowId })
        // Hidden by switching tabs → keep membership. Dismissed on this tab → drop.
        if (active?.id === info.tabId) disableTab(info.tabId)
      } catch { /* window gone */ }
    })
  }
}
