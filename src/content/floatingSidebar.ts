// Floating Sidebar - Monica-style unified entry point
// Main FAB + hover menu for enhancements + sidebar toggle

import type { EnhancementResult } from './enhancements'

const SIDEBAR_STATE_KEY = 'iris_floating_sidebar_open'
const SIDEBAR_WIDTH_KEY = 'iris_floating_sidebar_width'
const FAB_HIDDEN_KEY = 'iris_floating_fab_hidden'
const DEFAULT_WIDTH = 420
const MIN_WIDTH = 380
const MAX_WIDTH = 800

let isOpen = false
let isFabHidden = false
let sidebarWidth = DEFAULT_WIDTH
let fabButton: HTMLButtonElement | null = null
let fabHideButton: HTMLButtonElement | null = null
let fabMenu: HTMLDivElement | null = null
let sidebarContainer: HTMLDivElement | null = null
let resizeHandle: HTMLDivElement | null = null
let isResizing = false
let currentEnhancements: EnhancementResult[] = []

// Iris logo SVG icon
const irisIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="3"></circle>
  <circle cx="12" cy="12" r="8"></circle>
</svg>`

// Chat bubble SVG icon (for sidebar open action)
const chatIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
</svg>`

// X icon for close state
const closeIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <line x1="18" y1="6" x2="6" y2="18"></line>
  <line x1="6" y1="6" x2="18" y2="18"></line>
</svg>`

// Small X icon for hide FAB button
const hideIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <line x1="18" y1="6" x2="6" y2="18"></line>
  <line x1="6" y1="6" x2="18" y2="18"></line>
</svg>`

export async function initFloatingSidebar(enhancements: EnhancementResult[] = []): Promise<void> {
  // Don't inject on extension pages
  if (window.location.protocol === 'chrome-extension:' || window.location.protocol === 'chrome:') {
    return
  }

  currentEnhancements = enhancements

  // Create FAB immediately for instant visibility (no await before DOM injection)
  createFabButton()

  // Load all storage in parallel for speed
  const SETTINGS_KEY = 'sidepanel_settings'
  const empty: Record<string, unknown> = {}
  const [widthResult, hiddenResult, settingsResult, stateResult] = await Promise.all([
    chrome.storage.local.get(SIDEBAR_WIDTH_KEY).catch(() => empty),
    chrome.storage.local.get(FAB_HIDDEN_KEY).catch(() => empty),
    chrome.storage.sync.get(SETTINGS_KEY).catch(() => empty),
    chrome.storage.local.get(SIDEBAR_STATE_KEY).catch(() => empty),
  ])

  // Apply saved width
  if (widthResult[SIDEBAR_WIDTH_KEY] && typeof widthResult[SIDEBAR_WIDTH_KEY] === 'number') {
    sidebarWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, widthResult[SIDEBAR_WIDTH_KEY] as number))
  }
  updateSidebarWidth(sidebarWidth)

  // Check site patterns — if configured and URL matches a blocklist pattern, remove FAB and bail
  const settings = settingsResult[SETTINGS_KEY] as any
  const patterns: string[] = settings?.fabSitePatterns || []
  if (patterns.length > 0 && matchesSitePatterns(window.location.href, patterns)) {
    removeFab()
    return
  }

  // Check FAB hidden state (legacy: clear any stale global hidden flag)
  if (hiddenResult[FAB_HIDDEN_KEY]) {
    saveFabHiddenState(false)
  }

  // Restore previous sidebar open state
  if (stateResult[SIDEBAR_STATE_KEY]) {
    openFloatingSidebar()
  }

  // Listen for messages from iframe (close request)
  window.addEventListener('message', handleIframeMessage)
}

/** Update enhancements (called when URL changes) */
export function updateEnhancements(enhancements: EnhancementResult[]): void {
  currentEnhancements = enhancements
  // Rebuild menu if FAB exists
  if (fabMenu) {
    rebuildMenu()
  }
}

function updateSidebarWidth(width: number): void {
  document.documentElement.style.setProperty('--iris-sidebar-width', `${width}px`)
}

function createFabButton(): void {
  if (document.getElementById('iris-floating-fab')) return

  // Create FAB container for button + menu
  const fabContainer = document.createElement('div')
  fabContainer.id = 'iris-floating-fab-container'

  fabButton = document.createElement('button')
  fabButton.id = 'iris-floating-fab'
  fabButton.innerHTML = irisIcon
  fabButton.title = 'Iris (Cmd+Shift+Y)'
  fabButton.addEventListener('click', toggleFloatingSidebar)

  // Create hide button (appears on hover)
  fabHideButton = document.createElement('button')
  fabHideButton.id = 'iris-floating-fab-hide'
  fabHideButton.innerHTML = hideIcon
  fabHideButton.title = 'Hide on this page (Cmd+Shift+Y to restore)'
  fabHideButton.addEventListener('click', (e) => {
    e.stopPropagation()
    hideFab()
  })

  // Create menu (appears on hover)
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

  // Add sidebar toggle action at the top
  const chatAction = document.createElement('button')
  chatAction.className = 'iris-fab-menu-item iris-fab-menu-chat'
  chatAction.innerHTML = `<span class="iris-fab-menu-icon">${chatIcon}</span><span>Chat</span>`
  chatAction.title = 'Open Chat (Cmd+Shift+Y)'
  chatAction.addEventListener('click', (e) => {
    e.stopPropagation()
    toggleFloatingSidebar()
  })
  fabMenu.appendChild(chatAction)

  // Add enhancement actions
  if (currentEnhancements.length > 0) {
    const divider = document.createElement('div')
    divider.className = 'iris-fab-menu-divider'
    fabMenu.appendChild(divider)

    for (const enhancement of currentEnhancements) {
      // Add header
      const header = document.createElement('div')
      header.className = 'iris-fab-menu-header'
      header.textContent = enhancement.header
      fabMenu.appendChild(header)

      // Add actions
      for (const action of enhancement.actions) {
        const link = document.createElement('a')
        link.className = 'iris-fab-menu-item'
        link.href = action.url
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        link.innerHTML = `<span class="iris-fab-menu-icon">${action.icon}</span><span>${action.name}</span>`
        link.addEventListener('click', (e) => e.stopPropagation())
        fabMenu.appendChild(link)
      }
    }
  }
}

function hideFab(): void {
  removeFab()
  isFabHidden = true
  // Only hide for current page session (in-memory), not persisted globally
}

/** Remove FAB from DOM without persisting hidden state */
function removeFab(): void {
  document.getElementById('iris-floating-fab-container')?.remove()
  fabButton = null
  fabHideButton = null
  fabMenu = null
}

/** Check if URL matches any glob-style site patterns */
function matchesSitePatterns(url: string, patterns: string[]): boolean {
  return patterns.some(p => {
    const escaped = p.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp('^' + escaped.replace(/\*/g, '.*').replace(/\?/g, '.') + '$')
    return regex.test(url)
  })
}

export function showFab(): void {
  if (!isFabHidden) return
  isFabHidden = false
  createFabButton()
}

async function saveFabHiddenState(hidden: boolean): Promise<void> {
  try {
    await chrome.storage.local.set({ [FAB_HIDDEN_KEY]: hidden })
  } catch {
    // Ignore storage errors
  }
}

function createSidebarContainer(): void {
  if (document.getElementById('iris-floating-sidebar')) return

  // Create sidebar container
  sidebarContainer = document.createElement('div')
  sidebarContainer.id = 'iris-floating-sidebar'

  // Create resize handle
  resizeHandle = document.createElement('div')
  resizeHandle.id = 'iris-floating-resize-handle'
  resizeHandle.addEventListener('mousedown', startResize)
  sidebarContainer.appendChild(resizeHandle)

  // Create iframe pointing to sidepanel with floating mode
  const iframe = document.createElement('iframe')
  const sidepanelUrl = chrome.runtime.getURL('src/sidepanel/index.html?mode=floating')
  iframe.src = sidepanelUrl
  iframe.allow = 'clipboard-write'

  sidebarContainer.appendChild(iframe)
  document.body.appendChild(sidebarContainer)

  // Send page info to iframe once loaded
  iframe.addEventListener('load', () => {
    iframe.contentWindow?.postMessage({
      type: 'iris-page-info',
      pageUrl: window.location.href,
      pageTitle: document.title,
    }, '*')
  })
}

// Bound event handlers for proper removal
let boundHandleResize: ((e: MouseEvent) => void) | null = null
let boundStopResize: (() => void) | null = null

function startResize(e: MouseEvent): void {
  e.preventDefault()
  e.stopPropagation()

  if (isResizing) return
  isResizing = true

  // Add resizing class to disable transitions
  const fabContainer = document.getElementById('iris-floating-fab-container')
  document.documentElement.classList.add('iris-resizing')
  sidebarContainer?.classList.add('iris-resizing')
  fabContainer?.classList.add('iris-resizing')
  fabButton?.classList.add('iris-resizing')
  resizeHandle?.classList.add('iris-resizing')

  // Create bound handlers for this resize session
  boundHandleResize = (e: MouseEvent) => {
    if (!isResizing) return
    e.preventDefault()

    const newWidth = window.innerWidth - e.clientX
    const clampedWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth))

    sidebarWidth = clampedWidth
    updateSidebarWidth(clampedWidth)
  }

  boundStopResize = () => {
    isResizing = false

    // Remove resizing class to re-enable transitions
    const fabContainer = document.getElementById('iris-floating-fab-container')
    document.documentElement.classList.remove('iris-resizing')
    sidebarContainer?.classList.remove('iris-resizing')
    fabContainer?.classList.remove('iris-resizing')
    fabButton?.classList.remove('iris-resizing')
    resizeHandle?.classList.remove('iris-resizing')

    // Remove event listeners
    if (boundHandleResize) {
      document.removeEventListener('mousemove', boundHandleResize)
    }
    if (boundStopResize) {
      document.removeEventListener('mouseup', boundStopResize)
      document.removeEventListener('mouseleave', boundStopResize)
    }

    boundHandleResize = null
    boundStopResize = null

    // Save width preference
    saveWidth(sidebarWidth)
  }

  document.addEventListener('mousemove', boundHandleResize)
  document.addEventListener('mouseup', boundStopResize)
  document.addEventListener('mouseleave', boundStopResize)
}

export function toggleFloatingSidebar(): void {
  if (isOpen) {
    closeFloatingSidebar()
  } else {
    openFloatingSidebar()
  }
}

export function openFloatingSidebar(): void {
  if (isOpen) return

  // Show FAB if hidden
  if (isFabHidden) {
    showFab()
  }

  // Create sidebar if not exists
  if (!sidebarContainer) {
    createSidebarContainer()
  }

  // Push page content to left by adding class to html
  document.documentElement.classList.add('iris-sidebar-active')

  // Animate sidebar in
  const fabContainer = document.getElementById('iris-floating-fab-container')
  requestAnimationFrame(() => {
    sidebarContainer?.classList.add('iris-floating-sidebar-open')
    fabContainer?.classList.add('iris-floating-fab-open')
    fabButton?.classList.add('iris-floating-fab-open')
    if (fabButton) fabButton.innerHTML = closeIcon
  })

  isOpen = true
  saveState(true)
}

export function closeFloatingSidebar(): void {
  if (!isOpen) return

  // Remove push from page content
  document.documentElement.classList.remove('iris-sidebar-active')

  // Animate sidebar out
  const fabContainer = document.getElementById('iris-floating-fab-container')
  sidebarContainer?.classList.remove('iris-floating-sidebar-open')
  fabContainer?.classList.remove('iris-floating-fab-open')
  fabButton?.classList.remove('iris-floating-fab-open')
  if (fabButton) fabButton.innerHTML = irisIcon

  isOpen = false
  saveState(false)
}

function handleIframeMessage(event: MessageEvent): void {
  // Validate message origin (should be from our extension)
  if (!event.data || typeof event.data !== 'object') return

  if (event.data.type === 'iris-sidebar-close') {
    closeFloatingSidebar()
  }
}

async function saveState(open: boolean): Promise<void> {
  try {
    await chrome.storage.local.set({ [SIDEBAR_STATE_KEY]: open })
  } catch {
    // Ignore storage errors
  }
}

async function saveWidth(width: number): Promise<void> {
  try {
    await chrome.storage.local.set({ [SIDEBAR_WIDTH_KEY]: width })
  } catch {
    // Ignore storage errors
  }
}

// Cleanup function (for SPA navigation)
export function cleanupFloatingSidebar(): void {
  window.removeEventListener('message', handleIframeMessage)
  if (boundHandleResize) {
    document.removeEventListener('mousemove', boundHandleResize)
  }
  if (boundStopResize) {
    document.removeEventListener('mouseup', boundStopResize)
    document.removeEventListener('mouseleave', boundStopResize)
  }
  boundHandleResize = null
  boundStopResize = null
  document.documentElement.classList.remove('iris-sidebar-active', 'iris-resizing')
  document.getElementById('iris-floating-fab-container')?.remove()
  fabButton?.remove()
  sidebarContainer?.remove()
  fabButton = null
  fabHideButton = null
  fabMenu = null
  sidebarContainer = null
  resizeHandle = null
  isOpen = false
  isResizing = false
  currentEnhancements = []
}
