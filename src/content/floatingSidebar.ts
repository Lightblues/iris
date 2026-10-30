// Floating FAB — visual entry point for the native Chrome side panel.
// Previously injected an iframe into the page; now it only renders a button
// (and hover menu) that asks the background to open chrome.sidePanel.
// Shown on the built-in allowlist (papers, GitHub, DeepWiki, chat sites), minus the FAB blocklist.

import { fabAllowed } from '../lib/fabSites'

const FAB_HIDDEN_KEY = 'iris_floating_fab_hidden'

let isFabHidden = false
let fabButton: HTMLButtonElement | null = null
let fabHideButton: HTMLButtonElement | null = null
let fabMenu: HTMLDivElement | null = null
let hiddenPatterns: string[] = []

// Optional extra FAB menu actions. Chat export registers these on supported sites.
export interface FabCustomAction {
  label: string
  icon: string
  onClick: () => void
  disabled?: boolean
}
let customActions: FabCustomAction[] = []

/** Register custom FAB menu actions (replaces any previously set). */
export function setFabCustomActions(actions: FabCustomAction[]): void {
  customActions = actions
  syncFabVisibility()
}

// Iris logo SVG icon
const irisIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="3"></circle>
  <circle cx="12" cy="12" r="8"></circle>
</svg>`

// Chat bubble SVG icon (for sidebar open action)
const chatIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
</svg>`

// Small X icon for hide FAB button
const hideIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <line x1="18" y1="6" x2="6" y2="18"></line>
  <line x1="6" y1="6" x2="18" y2="18"></line>
</svg>`

export async function initFloatingSidebar(): Promise<void> {
  // Don't inject on extension pages
  if (window.location.protocol === 'chrome-extension:' || window.location.protocol === 'chrome:') {
    return
  }

  // Load settings & hidden flag in parallel
  const SETTINGS_KEY = 'sidepanel_settings'
  const empty: Record<string, unknown> = {}
  const [hiddenResult, localSettings, syncSettings] = await Promise.all([
    chrome.storage.local.get(FAB_HIDDEN_KEY).catch(() => empty),
    chrome.storage.local.get(SETTINGS_KEY).catch(() => empty),
    // Fallback only — sync is the old storage location. Don't block on a slow
    // sync read; if it wins the race after local already returned, we just
    // ignore it. Users who haven't triggered a side-panel migration yet still
    // get their site patterns honoured.
    chrome.storage.sync.get(SETTINGS_KEY).catch(() => empty),
  ])

  const settings = (localSettings[SETTINGS_KEY] ?? syncSettings[SETTINGS_KEY]) as any
  hiddenPatterns = settings?.fabSitePatterns || []

  // Clear any stale legacy global-hidden flag
  if (hiddenResult[FAB_HIDDEN_KEY]) {
    void chrome.storage.local.set({ [FAB_HIDDEN_KEY]: false }).catch(() => {})
  }

  syncFabVisibility()
}

export function refreshFab(): void {
  syncFabVisibility()
}

/** Show FAB on the allowlist, minus the blocklist. Scripts do not affect this. */
function shouldShowFab(): boolean {
  if (isFabHidden) return false
  return fabAllowed(window.location.href, hiddenPatterns)
}

function syncFabVisibility(): void {
  const show = shouldShowFab()
  const exists = !!document.getElementById('iris-floating-fab-container')
  if (show && !exists) createFabButton()
  else if (!show && exists) removeFab()
  else if (show && fabMenu) rebuildMenu()
}

function createFabButton(): void {
  if (document.getElementById('iris-floating-fab')) return

  const fabContainer = document.createElement('div')
  fabContainer.id = 'iris-floating-fab-container'

  fabButton = document.createElement('button')
  fabButton.id = 'iris-floating-fab'
  fabButton.innerHTML = irisIcon
  fabButton.title = 'Iris (Cmd+Shift+O)'
  fabButton.addEventListener('click', openSidePanel)

  fabHideButton = document.createElement('button')
  fabHideButton.id = 'iris-floating-fab-hide'
  fabHideButton.innerHTML = hideIcon
  fabHideButton.title = 'Hide on this page'
  fabHideButton.addEventListener('click', (e) => {
    e.stopPropagation()
    hideFab()
  })

  fabMenu = document.createElement('div')
  fabMenu.id = 'iris-floating-fab-menu'
  rebuildMenu()

  fabContainer.appendChild(fabButton)
  fabContainer.appendChild(fabHideButton)
  fabContainer.appendChild(fabMenu)
  document.body.appendChild(fabContainer)
}

function rebuildMenu(): void {
  if (!fabMenu) return
  fabMenu.innerHTML = ''

  // Open-chat entry — routes to native side panel
  const chatAction = document.createElement('button')
  chatAction.className = 'iris-fab-menu-item iris-fab-menu-chat'
  chatAction.innerHTML = `<span class="iris-fab-menu-icon">${chatIcon}</span><span>Chat</span>`
  chatAction.title = 'Open Chat (Cmd+Shift+O)'
  chatAction.addEventListener('click', (e) => {
    e.stopPropagation()
    openSidePanel()
  })
  fabMenu.appendChild(chatAction)

  // Extra feature actions (chat export on supported sites).
  if (customActions.length > 0) {
    const divider = document.createElement('div')
    divider.className = 'iris-fab-menu-divider'
    fabMenu.appendChild(divider)

    for (const action of customActions) {
      const btn = document.createElement('button')
      btn.className = 'iris-fab-menu-item'
      btn.disabled = !!action.disabled
      if (action.disabled) btn.style.opacity = '0.5'
      btn.innerHTML = `<span class="iris-fab-menu-icon">${action.icon}</span><span>${action.label}</span>`
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        if (!action.disabled) action.onClick()
})
      fabMenu.appendChild(btn)
    }
  }

}

function hideFab(): void {
  removeFab()
  isFabHidden = true
  // Only hide for current page session (in-memory), not persisted globally
}

function removeFab(): void {
  document.getElementById('iris-floating-fab-container')?.remove()
  fabButton = null
  fabHideButton = null
  fabMenu = null
}

export function showFab(): void {
  if (!isFabHidden) return
  isFabHidden = false
  createFabButton()
}

/**
 * Ask the background script to open the native Chrome side panel.
 * The content script keeps the page-level entry point, while the background
 * owns the actual `chrome.sidePanel.open()` call.
 */
async function openSidePanel(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type: 'open-side-panel' })
  } catch (err) {
    console.warn('[Iris] Failed to open side panel:', err)
  }
}

export function cleanupFloatingSidebar(): void {
  removeFab()
}
