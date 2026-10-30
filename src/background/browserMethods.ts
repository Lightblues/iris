import { registerRelayMethod, type RelayHandler } from './relayRegistry'
import { acquireKeepalive, releaseKeepalive } from './relayKeepalive'

const PAGE_LOAD_TIMEOUT_MS = 30000

export type ExtractMode = 'text' | 'html' | 'markdown'

export interface PageExtract {
  title: string
  url: string
  content: string
}

const relayTabIds = new Set<number>()

export function isRelayTab(tabId: number): boolean {
  return relayTabIds.has(tabId)
}

export function registerBrowserMethods(): void {
  const fetch: RelayHandler = (params) => fetchPage(params as { url?: string; wait?: number; extract?: ExtractMode })
  const list: RelayHandler = () => listTabs()
  const content: RelayHandler = (params) => getTabContent(params as { tabId?: number; extract?: ExtractMode })
  const close: RelayHandler = async (params) => {
    await closeTab(params as { tabId?: number })
    return { success: true }
  }
  const activate: RelayHandler = async (params) => {
    await activateTab(params as { tabId?: number })
    return { success: true }
  }
  const fetchDoc = {
    description: 'Open a URL in a foreground tab, extract the page, then close the tab.',
    params: [
      { name: 'url', type: 'string' as const, required: true, description: 'Page URL' },
      { name: 'wait', type: 'number' as const, description: 'Extra seconds after load before reading the page' },
      { name: 'extract', type: 'string' as const, description: 'text, markdown, or html' },
    ],
  }
  const listDoc = { description: 'List open browser tabs.', params: [] }
  const contentDoc = {
    description: 'Extract an already-open tab. Does not navigate.',
    params: [
      { name: 'tabId', type: 'number' as const, required: true, description: 'Tab id from browser.list_tabs' },
      { name: 'extract', type: 'string' as const, description: 'text, markdown, or html' },
    ],
  }
  const closeDoc = {
    description: 'Close a browser tab.',
    params: [{ name: 'tabId', type: 'number' as const, required: true, description: 'Tab id to close' }],
  }
  const activateDoc = {
    description: 'Focus a browser tab.',
    params: [{ name: 'tabId', type: 'number' as const, required: true, description: 'Tab id to activate' }],
  }
  registerRelayMethod('fetch', fetch, fetchDoc)
  registerRelayMethod('list_tabs', list, listDoc)
  registerRelayMethod('get_tab_content', content, contentDoc)
  registerRelayMethod('close_tab', close, closeDoc)
  registerRelayMethod('activate_tab', activate, activateDoc)
  registerRelayMethod('browser.fetch', fetch, fetchDoc)
  registerRelayMethod('browser.list_tabs', list, listDoc)
  registerRelayMethod('browser.get_tab_content', content, contentDoc)
  registerRelayMethod('browser.close_tab', close, closeDoc)
  registerRelayMethod('browser.activate_tab', activate, activateDoc)
}


async function fetchPage({ url, wait = 3, extract = 'text' }: {
  url?: string
  wait?: number
  extract?: ExtractMode
}): Promise<PageExtract> {
  if (!url) throw new Error('url is required')
  console.log('[Iris relay] fetchPage:', url, { wait, extract })
  acquireKeepalive()

  let previousTabId: number | null = null
  let tabId: number | undefined
  try {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
      previousTabId = activeTab?.id ?? null
    } catch { /* no window */ }

    // Foreground tab: background tabs are JS-throttled and SPAs won't render.
    const tab = await chrome.tabs.create({ url, active: true })
    if (tab.id == null) throw new Error('failed to create tab')
    tabId = tab.id
    relayTabIds.add(tabId)

    await waitForTabLoad(tabId)

    const minWaitMs = Math.max(wait * 1000, 1000)
    const maxWaitMs = Math.max(wait * 1000, 3000) + 10000
    const startTime = Date.now()
    let lastLength = 0
    let stableCount = 0

    while (Date.now() - startTime < maxWaitMs) {
      await sleep(500)
      try {
        const probe = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => (document.body ? document.body.innerText.length : 0),
        })
        const curLength = probe?.[0]?.result || 0
        if (curLength > 200 && curLength === lastLength) {
          stableCount++
          if (stableCount >= 3 && Date.now() - startTime >= minWaitMs) break
        } else {
          stableCount = 0
        }
        lastLength = curLength
      } catch { /* navigating */ }
    }

    if (previousTabId) {
      try { await chrome.tabs.update(previousTabId, { active: true }) } catch { /* gone */ }
    }

    return await extractFromTab(tabId, extract)
  } finally {
    releaseKeepalive()
    if (previousTabId) {
      try { await chrome.tabs.update(previousTabId, { active: true }) } catch { /* gone */ }
    }
    if (tabId != null) {
      try { await chrome.tabs.remove(tabId) } catch { /* already closed */ }
      relayTabIds.delete(tabId)
    }
  }
}

function waitForTabLoad(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener)
      resolve()
    }, PAGE_LOAD_TIMEOUT_MS)

    function listener(updatedTabId: number, changeInfo: { status?: string }) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timeout)
        chrome.tabs.onUpdated.removeListener(listener)
        resolve()
      }
    }
    chrome.tabs.onUpdated.addListener(listener)

    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        clearTimeout(timeout)
        chrome.tabs.onUpdated.removeListener(listener)
        reject(new Error(chrome.runtime.lastError.message))
        return
      }
      if (tab.status === 'complete') {
        clearTimeout(timeout)
        chrome.tabs.onUpdated.removeListener(listener)
        resolve()
      }
    })
  })
}

// Injected into the page — must stay self-contained (executeScript serializes toString).
function extractContent(extract: ExtractMode): PageExtract {
  const title = document.title || ''
  const url = document.location.href
  let content: string
  if (extract === 'html') {
    content = document.documentElement.outerHTML
  } else if (extract === 'markdown') {
    content = walk(document.body)
  } else {
    content = document.body ? document.body.innerText : ''
  }
  return { title, url, content }

  function walk(el: Element | null): string {
    if (!el) return ''
    const parts: string[] = []
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim()
        if (text) parts.push(text)
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const child = node as Element
        const tag = child.tagName.toLowerCase()
        if (['script', 'style', 'noscript', 'svg'].includes(tag)) continue
        if (/^h[1-6]$/.test(tag)) {
          const text = (child as HTMLElement).innerText.trim()
          if (text) parts.push('\n' + '#'.repeat(Number(tag[1])) + ' ' + text + '\n')
        } else if (tag === 'p') {
          const text = (child as HTMLElement).innerText.trim()
          if (text) parts.push('\n' + text + '\n')
        } else if (tag === 'a') {
          const text = (child as HTMLElement).innerText.trim()
          const href = child.getAttribute('href')
          if (text && href) parts.push(`[${text}](${href})`)
          else if (text) parts.push(text)
        } else if (tag === 'img') {
          const alt = child.getAttribute('alt') || ''
          const src = child.getAttribute('src') || ''
          if (src) parts.push(`![${alt}](${src})`)
        } else if (tag === 'li') {
          const text = (child as HTMLElement).innerText.trim()
          if (text) parts.push('- ' + text)
        } else if (tag === 'br') {
          parts.push('\n')
        } else if (tag === 'pre' || tag === 'code') {
          const text = (child as HTMLElement).innerText
          if (text) parts.push('\n```\n' + text + '\n```\n')
        } else {
          parts.push(walk(child))
        }
      }
    }
    return parts.join('\n')
  }
}

async function extractFromTab(tabId: number, extract: ExtractMode): Promise<PageExtract> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: extractContent,
    args: [extract],
  })
  const first = results?.[0] as { result?: PageExtract; error?: { message?: string } } | undefined
  if (!first) throw new Error('Script execution returned no results')
  if (first.error) throw new Error(first.error.message || 'Script execution error')
  if (!first.result) throw new Error('Script execution returned empty result')
  return first.result
}

async function listTabs() {
  const tabs = await chrome.tabs.query({})
  return tabs.map((t) => ({
    id: t.id,
    title: t.title || '',
    url: t.url || '',
    active: t.active,
    windowId: t.windowId,
    pinned: t.pinned,
  }))
}

async function getTabContent({ tabId, extract = 'text' }: { tabId?: number; extract?: ExtractMode }): Promise<PageExtract> {
  if (tabId == null) throw new Error('tabId is required')
  acquireKeepalive()
  try {
    return await extractFromTab(tabId, extract)
  } finally {
    releaseKeepalive()
  }
}

async function closeTab({ tabId }: { tabId?: number }): Promise<void> {
  if (tabId == null) throw new Error('tabId is required')
  await chrome.tabs.remove(tabId)
}

async function activateTab({ tabId }: { tabId?: number }): Promise<void> {
  if (tabId == null) throw new Error('tabId is required')
  const tab = await chrome.tabs.get(tabId)
  await chrome.tabs.update(tabId, { active: true })
  if (tab.windowId != null) await chrome.windows.update(tab.windowId, { focused: true })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
