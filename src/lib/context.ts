import type { PageContextResponse } from './types'

const MAX_CONTEXT_LENGTH = 100_000

export async function getPageContext(): Promise<string | null> {
  console.log('[Iris Context] Requesting page context...')
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'get-page-context' }, (response: PageContextResponse) => {
      console.log('[Iris Context] Response:', response)
      if (chrome.runtime.lastError) {
        console.error('[Iris Context] Runtime error:', chrome.runtime.lastError)
        resolve(null)
        return
      }
      if (response?.success && response.content) {
        // Truncate if too long
        const content = response.content.length > MAX_CONTEXT_LENGTH
          ? response.content.slice(0, MAX_CONTEXT_LENGTH) + '\n\n[Content truncated...]'
          : response.content
        console.log('[Iris Context] Content loaded, length:', content.length)
        resolve(content)
      } else {
        console.log('[Iris Context] No content in response:', response?.error)
        resolve(null)
      }
    })
  })
}

export async function getSelectionContext(): Promise<string | null> {
  console.log('[Iris Context] Requesting selection context...')
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'get-selection-context' }, (response: PageContextResponse) => {
      console.log('[Iris Context] Selection response:', response)
      if (chrome.runtime.lastError) {
        console.error('[Iris Context] Runtime error:', chrome.runtime.lastError)
        resolve(null)
        return
      }
      if (response?.success && response.content) {
        const content = response.content.length > MAX_CONTEXT_LENGTH
          ? response.content.slice(0, MAX_CONTEXT_LENGTH) + '\n\n[Content truncated...]'
          : response.content
        console.log('[Iris Context] Selection loaded, length:', content.length)
        resolve(content)
      } else {
        console.log('[Iris Context] No selection in response:', response?.error)
        resolve(null)
      }
    })
  })
}
