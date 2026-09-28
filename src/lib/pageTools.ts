const CAP = 8_000

export interface TabRef {
  current: number
}

function clip(text: string, offset = 0): { text: string; nextOffset?: number } {
  const slice = text.slice(offset, offset + CAP)
  const next = offset + slice.length
  return next < text.length ? { text: slice, nextOffset: next } : { text: slice }
}

async function runInTab<T>(tabId: number, func: (...args: any[]) => T, args: unknown[] = [], world?: 'MAIN' | 'ISOLATED'): Promise<T> {
  const [hit] = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args,
    ...(world ? { world } : {}),
  })
  return hit?.result as T
}

export async function readPage(tabId: number, mode: 'card' | 'text' | 'selector', offset: number, selector?: string): Promise<unknown> {
  if (mode === 'card') {
    const card = await runInTab(tabId, () => {
      const headings = Array.from(document.querySelectorAll('h1,h2,h3')).slice(0, 30).map(el => {
        const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 140)
        return text ? `${el.tagName.toLowerCase()}: ${text}` : ''
      }).filter(Boolean)
      const interactive = document.querySelectorAll('a,button,input,textarea,select,[role="button"]').length
      return { title: document.title, url: location.href, headings, interactive }
    })
    const body = [
      `# ${card.title}`,
      card.url,
      `interactive: ${card.interactive}`,
      ...card.headings,
    ].join('\n')
    return { mode, untrusted: true, ...clip(body) }
  }

  if (mode === 'selector') {
    if (!selector) return { error: 'selector is required' }
    const text = await runInTab(tabId, (sel: string) => {
      const el = document.querySelector(sel)
      if (!el) return null
      return (el as HTMLElement).innerText || el.textContent || ''
    }, [selector])
    if (text == null) return { error: `No element: ${selector}` }
    return { mode, untrusted: true, selector, ...clip(text, offset) }
  }

  let content = ''
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'extract-page-content' }) as { success?: boolean; content?: string; error?: string }
    if (!response?.success || !response.content) return { error: response?.error || 'Page content unavailable' }
    content = response.content
  } catch (err) {
    return { error: (err as Error).message || 'Content script not available' }
  }
  return { mode: 'text', untrusted: true, ...clip(content, offset) }
}

export async function evalInPage(tabId: number, code: string): Promise<unknown> {
  const [hit] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: async (body: string) => {
      const key = '__iris_eval_' + Math.random().toString(36).slice(2)
      let parseError: string | null = null
      const onError = (ev: ErrorEvent) => { parseError = ev.message }
      try {
        // The body becomes an async function, so it may use await at the top level.
        window.addEventListener('error', onError)
        const script = document.createElement('script')
        script.textContent = `window[${JSON.stringify(key)}] = (async function () { ${body} })();`
        document.documentElement.appendChild(script)
        script.remove()
      } catch (e) {
        return { error: (e as Error).message }
      } finally {
        window.removeEventListener('error', onError)
      }
      const bag = window as unknown as Record<string, unknown>
      const pending = bag[key]
      delete bag[key]
      // An inline <script> that fails to parse never assigns, so nothing is pending.
      if (!pending) return { error: parseError ? `Script error: ${parseError}` : 'The code did not parse. Check for a syntax error.' }
      try {
        const value = await pending
        return { result: value === undefined ? null : value }
      } catch (e) {
        return { error: String((e as Error)?.message ?? e) }
      }
    },
    args: [code],
  })
  const result = hit?.result
  const packed = JSON.stringify(result)
  if (packed && packed.length > CAP) return { untrusted: true, truncated: true, result: packed.slice(0, CAP) }
  return { untrusted: true, ...(typeof result === 'object' && result ? result : { result }) }
}

export async function openUrl(url: string, background = false): Promise<unknown> {
  const created = await chrome.tabs.create({ url, active: !background })
  return { tabId: created.id, url: created.url || url }
}

export async function focusTab(tabId: number): Promise<unknown> {
  const target = await chrome.tabs.update(tabId, { active: true })
  if (!target) return { tabId }
  if (target.windowId != null) await chrome.windows.update(target.windowId, { focused: true })
  return { tabId, url: target.url, title: target.title }
}
