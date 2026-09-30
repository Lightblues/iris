import { rememberScreenshot } from './screenshotStore'

// Automation Engine: browser automation via chrome.scripting.executeScript
// Operates on a dedicated background tab (active: false) to avoid blocking user

let automationTabId: number | null = null

async function ensureAutomationTab(): Promise<number> {
  if (automationTabId !== null) {
    try {
      await chrome.tabs.get(automationTabId)
      return automationTabId
    } catch {
      automationTabId = null
    }
  }
  const tab = await chrome.tabs.create({ url: 'about:blank', active: false })
  automationTabId = tab.id!
  return automationTabId
}

async function tabFor(params?: object): Promise<number> {
  const tabId = (params as { tabId?: number } | undefined)?.tabId
  if (tabId != null) {
    await chrome.tabs.get(tabId)
    return tabId
  }
  return ensureAutomationTab()
}

export async function closeAutomationTab(): Promise<void> {
  if (automationTabId !== null) {
    try { await chrome.tabs.remove(automationTabId) } catch {}
    automationTabId = null
  }
}

async function executeInTab<T>(tabId: number, func: (...args: any[]) => T, args?: any[]): Promise<T> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    ...(args && { args }),
  })
  if (!results?.length) throw new Error('Script execution failed: no results')
  const first = results[0] as any
  if (first.error) throw new Error(first.error.message || 'Script execution error')
  return first.result as T
}

function waitForTabLoad(tabId: number, timeout = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener)
      reject(new Error('Navigation timeout'))
    }, timeout)
    const listener = (id: number, info: { status?: string }) => {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer)
        chrome.tabs.onUpdated.removeListener(listener)
        resolve()
      }
    }
    chrome.tabs.onUpdated.addListener(listener)
  })
}

// --- Tool Implementations ---

export const automationTools = {
  get_tab_info: {
    execute: async () => {
      if (automationTabId === null) {
        return { active: false, message: 'No automation tab open. Use navigate to open a URL.' }
      }
      try {
        const tab = await chrome.tabs.get(automationTabId)
        return { active: true, tabId: tab.id, url: tab.url, title: tab.title }
      } catch {
        automationTabId = null
        return { active: false, message: 'Automation tab was closed. Use navigate to open a URL.' }
      }
    }
  },

  navigate: {
    execute: async (params: { url: string }) => {
      const tabId = await tabFor(params)
      const loadPromise = waitForTabLoad(tabId)
      await chrome.tabs.update(tabId, { url: params.url })
      await loadPromise
      const tab = await chrome.tabs.get(tabId)
      return { url: tab.url, title: tab.title }
    }
  },

  page_snapshot: {
    execute: async (params: { selector?: string; maxLength?: number }) => {
      const tabId = await tabFor(params)
      const result = await executeInTab(tabId, (sel: string | null, maxLen: number) => {
        const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'LINK', 'META'])
        const MAX_DEPTH = 12

        function isVisible(el: Element): boolean {
          if (!(el instanceof HTMLElement)) return true
          const style = getComputedStyle(el)
          if (style.display === 'none' || style.visibility === 'hidden') return false
          if (el.offsetHeight === 0 && el.offsetWidth === 0) return false
          return true
        }

        function getAttrs(el: Element): string {
          const parts: string[] = []
          const id = el.id
          if (id) parts.push(`#${id}`)
          const classes = Array.from(el.classList).slice(0, 2).join('.')
          if (classes) parts.push(`.${classes}`)
          const tag = el.tagName
          if (tag === 'A') {
            const href = el.getAttribute('href')
            if (href) parts.push(`[href="${href.slice(0, 100)}"]`)
          }
          if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
            const type = el.getAttribute('type')
            if (type) parts.push(`[type="${type}"]`)
            const name = el.getAttribute('name')
            if (name) parts.push(`[name="${name}"]`)
            const val = (el as HTMLInputElement).value
            if (val) parts.push(`[value="${val.slice(0, 50)}"]`)
            const ph = el.getAttribute('placeholder')
            if (ph) parts.push(`[placeholder="${ph.slice(0, 40)}"]`)
          }
          if (tag === 'IMG') {
            const alt = el.getAttribute('alt')
            if (alt) parts.push(`[alt="${alt.slice(0, 50)}"]`)
          }
          const role = el.getAttribute('role')
          if (role) parts.push(`[role="${role}"]`)
          const ariaLabel = el.getAttribute('aria-label')
          if (ariaLabel) parts.push(`[aria-label="${ariaLabel.slice(0, 40)}"]`)
          return parts.join('')
        }

        function walk(el: Element, depth: number, lines: string[], maxLen: number): boolean {
          if (lines.join('\n').length >= maxLen) return false
          if (SKIP_TAGS.has(el.tagName)) return true
          if (!isVisible(el)) return true
          if (depth > MAX_DEPTH) return true

          const indent = '  '.repeat(depth)
          const tag = el.tagName
          const attrs = getAttrs(el)

          // Get direct text content (not from children)
          let text = ''
          for (const node of el.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
              const t = (node.textContent || '').trim()
              if (t) text += (text ? ' ' : '') + t
            }
          }
          if (text.length > 80) text = text.slice(0, 77) + '...'

          const children = Array.from(el.children)
          const hasChildren = children.some(c => !SKIP_TAGS.has(c.tagName) && isVisible(c))

          // Skip empty wrapper divs with single child
          if (!text && children.length === 1 && (tag === 'DIV' || tag === 'SPAN') && !el.id && !attrs) {
            return walk(children[0], depth, lines, maxLen)
          }

          const textPart = text ? ` "${text}"` : ''
          if (hasChildren || text || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'IMG' || tag === 'BUTTON') {
            lines.push(`${indent}${tag}${attrs}${textPart}`)
          }

          for (const child of children) {
            if (!walk(child, depth + 1, lines, maxLen)) return false
          }
          return true
        }

        const root = sel ? document.querySelector(sel) : document.body
        if (!root) return { title: document.title, url: location.href, snapshot: `[No element found for selector: ${sel}]` }

        const lines: string[] = []
        walk(root, 0, lines, maxLen)
        return {
          title: document.title,
          url: location.href,
          snapshot: lines.join('\n')
        }
      }, [params.selector || null, params.maxLength || 8000])
      return result
    }
  },

  click: {
    execute: async (params: { selector: string }) => {
      const tabId = await tabFor(params)
      return await executeInTab(tabId, (sel: string) => {
        const el = document.querySelector(sel) as HTMLElement
        if (!el) return { clicked: false, error: `Element not found: ${sel}` }
        el.click()
        return { clicked: true, elementText: (el.textContent || '').trim().slice(0, 100) }
      }, [params.selector])
    }
  },

  type_text: {
    execute: async (params: { selector: string; text: string; clearFirst?: boolean }) => {
      const tabId = await tabFor(params)
      return await executeInTab(tabId, (sel: string, text: string, clear: boolean) => {
        const el = document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement
        if (!el) return { typed: false, error: `Element not found: ${sel}` }
        el.focus()
        if (clear) el.value = ''
        // Use execCommand for better compatibility with React-controlled inputs
        document.execCommand('insertText', false, text)
        // Fallback: directly set value + dispatch events
        if (el.value !== text && el.value !== (clear ? '' : '') + text) {
          el.value = clear ? text : el.value + text
        }
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
        return { typed: true }
      }, [params.selector, params.text, params.clearFirst !== false])
    }
  },

  extract_data: {
    execute: async (params: { selector?: string; extractAs?: 'text' | 'html' | 'list' | 'table' }) => {
      const tabId = await tabFor(params)
      return await executeInTab(tabId, (sel: string | null, mode: string) => {
        if (mode === 'list') {
          if (!sel) return { data: [] }
          const els = document.querySelectorAll(sel)
          return { data: Array.from(els).map(el => (el.textContent || '').trim()).filter(Boolean) }
        }
        if (mode === 'table') {
          const table = sel ? document.querySelector(sel) : document.querySelector('table')
          if (!table) return { data: [] }
          const rows = table.querySelectorAll('tr')
          return {
            data: Array.from(rows).map(row =>
              Array.from(row.querySelectorAll('td, th')).map(cell => (cell.textContent || '').trim())
            )
          }
        }
        const el = sel ? document.querySelector(sel) : document.body
        if (!el) return { data: '' }
        if (mode === 'html') return { data: el.innerHTML.slice(0, 10000) }
        return { data: (el.textContent || '').trim().slice(0, 10000) }
      }, [params.selector || null, params.extractAs || 'text'])
    }
  },

  wait_for: {
    execute: async (params: { selector?: string; text?: string; timeout?: number }) => {
      const tabId = await tabFor(params)
      const timeout = Math.min(params.timeout || 5000, 15000)
      return await executeInTab(tabId, (sel: string | null, text: string | null, ms: number) => {
        return new Promise<{ found: boolean; elapsed: number }>((resolve) => {
          const start = Date.now()
          const check = () => {
            if (sel && document.querySelector(sel)) {
              return resolve({ found: true, elapsed: Date.now() - start })
            }
            if (text && document.body.textContent?.includes(text)) {
              return resolve({ found: true, elapsed: Date.now() - start })
            }
            if (Date.now() - start >= ms) {
              return resolve({ found: false, elapsed: ms })
            }
            setTimeout(check, 200)
          }
          check()
        })
      }, [params.selector || null, params.text || null, timeout])
    }
  },

  scroll: {
    execute: async (params: { selector?: string; direction?: 'up' | 'down'; amount?: number }) => {
      const tabId = await tabFor(params)
      return await executeInTab(tabId, (sel: string | null, dir: string, amt: number) => {
        if (sel) {
          const el = document.querySelector(sel)
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            return { scrollY: window.scrollY, scrolledTo: sel }
          }
          return { error: `Element not found: ${sel}` }
        }
        const delta = dir === 'up' ? -amt : amt
        window.scrollBy({ top: delta, behavior: 'smooth' })
        return { scrollY: window.scrollY + delta }
      }, [params.selector || null, params.direction || 'down', params.amount || 500])
    }
  },

  take_screenshot: {
    execute: async (params: { tabId?: number } = {}) => {
      const tabId = params.tabId
      if (typeof tabId !== 'number' || tabId <= 0) {
        throw new Error('tabId is required')
      }
      const tab = await chrome.tabs.get(tabId)
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
      await chrome.tabs.update(tabId, { active: true })
      await new Promise(r => setTimeout(r, 300))
      try {
        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId!, { format: 'png' })
        return { captured: true, tabId, ...rememberScreenshot(dataUrl) }
      } finally {
        if (activeTab?.id && activeTab.id !== tabId) await chrome.tabs.update(activeTab.id, { active: true })
      }
    }
  }
}
