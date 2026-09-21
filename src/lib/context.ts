import type { PageContextResponse } from './types'

const MAX_CONTEXT_LENGTH = 100_000

export function isInjectableUrl(url?: string): boolean {
  return !!url && /^(https?|file):/i.test(url)
}

export async function waitForTabLoad(tabId: number, timeoutMs = 8000): Promise<chrome.tabs.Tab | null> {
  try {
    const tab = await chrome.tabs.get(tabId)
    if (tab.status === 'complete') return tab
  } catch {
    return null
  }

  return new Promise(resolve => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated)
      chrome.tabs.get(tabId).then(resolve).catch(() => resolve(null))
    }, timeoutMs)

    const onUpdated = (id: number, info: { status?: string }, updated: chrome.tabs.Tab) => {
      if (id !== tabId || info.status !== 'complete') return
      clearTimeout(timer)
      chrome.tabs.onUpdated.removeListener(onUpdated)
      resolve(updated)
    }
    chrome.tabs.onUpdated.addListener(onUpdated)
  })
}

function requestContext(type: 'get-page-context' | 'get-selection-context', tabId?: number): Promise<string | null> {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type, tabId }, (response: PageContextResponse) => {
      if (chrome.runtime.lastError) {
        console.error('[Iris Context] Runtime error:', chrome.runtime.lastError)
        resolve(null)
        return
      }
      if (response?.success && response.content) {
        const content = response.content.length > MAX_CONTEXT_LENGTH
          ? response.content.slice(0, MAX_CONTEXT_LENGTH) + '\n\n[Content truncated...]'
          : response.content
        resolve(content)
      } else {
        resolve(null)
      }
    })
  })
}

export function getPageContext(tabId?: number): Promise<string | null> {
  return requestContext('get-page-context', tabId)
}

export function getSelectionContext(tabId?: number): Promise<string | null> {
  return requestContext('get-selection-context', tabId)
}
