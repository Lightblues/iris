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

type EvalHit = { result?: string; error?: string }

/** Script text for userScripts MAIN. The page runs this directly, so CSP does not treat it as eval. */
export function evalSource(body: string, asExpression: boolean): string {
  const inner = asExpression ? `return (\n${body}\n)` : body
  return `(() => {
    const __irisRun = async () => { ${inner} }
    const __irisPack = (value) => {
      if (typeof Node === 'function' && value instanceof Node) {
        const text = String(value.innerText || value.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 2000)
        return { node: value.nodeName, id: value.id || undefined, text }
      }
      if (typeof value === 'function') return { function: value.name || 'anonymous' }
      return value === undefined ? null : value
    }
    return __irisRun().then(
      (value) => {
        try { return JSON.stringify({ ok: true, value: __irisPack(value) }) }
        catch { return JSON.stringify({ ok: false, error: 'Result must be JSON-serializable. Return text or a plain object.' }) }
      },
      (e) => JSON.stringify({ ok: false, error: (e && e.message) ? e.message : String(e) }),
    )
  })()`
}

export function decodeEvalResult(raw: unknown): EvalHit {
  if (typeof raw !== 'string') {
    try { return { result: JSON.stringify(raw ?? null) } }
    catch { return { error: 'Result must be JSON-serializable. Return text or a plain object.' } }
  }
  try {
    const parsed = JSON.parse(raw) as { ok?: boolean; value?: unknown; error?: string }
    if (parsed?.ok === false) return { error: parsed.error || 'Script execution failed' }
    if (parsed?.ok === true) return { result: JSON.stringify(parsed.value ?? null) }
  } catch { /* not our envelope */ }
  return { result: raw }
}

function userScriptsUnavailable(message: string): boolean {
  return /allow user scripts|user scripts unavailable|developer mode/i.test(message)
}

async function evalViaUserScripts(tabId: number, code: string): Promise<EvalHit | 'unavailable'> {
  const api = chrome.userScripts
  if (typeof api?.execute !== 'function') return 'unavailable'
  const inject = async (asExpression: boolean): Promise<EvalHit | 'syntax' | 'unavailable'> => {
    try {
      const hits = await api.execute({
        target: { tabId },
        world: 'MAIN',
        injectImmediately: true,
        js: [{ code: evalSource(code, asExpression) }],
      })
      const hit = hits?.[0]
      if (!hit) return { error: 'Script execution failed' }
      if (hit.error) {
        if (asExpression && /syntax|unexpected|illegal/i.test(hit.error)) return 'syntax'
        if (isEvalCspBlock(hit.error) || /TrustedScript/i.test(hit.error)) return 'unavailable'
        return { error: hit.error }
      }
      return decodeEvalResult(hit.result)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (userScriptsUnavailable(message) || isEvalCspBlock(message)) return 'unavailable'
      return { error: message }
    }
  }
  const hasReturn = /\breturn\b/.test(code)
  const first = await inject(!hasReturn)
  if (first === 'unavailable') return 'unavailable'
  if (first === 'syntax') {
    const retry = await inject(false)
    if (retry === 'unavailable' || retry === 'syntax') return { error: 'The code did not parse. Check for a syntax error.' }
    return retry
  }
  return first
}

/** Injected into the tab. Must not close over module scope. */
export async function evalUserCode(body: string): Promise<EvalHit> {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (src: string) => () => Promise<unknown>
  try {
    let value = await new AsyncFunction(body)()
    if (value === undefined && !/\breturn\b/.test(body)) {
      try {
        value = await new AsyncFunction(`return (\n${body}\n)`)()
      } catch (e) {
        if (!(e instanceof SyntaxError)) throw e
      }
    }
    return { result: JSON.stringify(value === undefined ? null : value) }
  } catch (e) {
    return { error: e instanceof Error && e.message ? e.message : String(e) }
  }
}

export function isEvalCspBlock(error: string | undefined): boolean {
  if (!error) return false
  return /content security policy|unsafe-eval|evalerror/i.test(error)
}

async function runEval(tabId: number, world: 'MAIN' | 'ISOLATED', code: string): Promise<EvalHit> {
  try {
    const [hit] = await chrome.scripting.executeScript({
      target: { tabId },
      world,
      func: evalUserCode,
      args: [code],
    })
    return hit?.result ?? { error: 'Script execution failed' }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

function packEval(hit: EvalHit): unknown {
  if (hit.error) {
    const error = isEvalCspBlock(hit.error)
      ? 'This page blocks JavaScript evaluation. Use read_page for text.'
      : hit.error
    return { untrusted: true, error }
  }
  const raw = hit.result ?? 'null'
  if (raw.length > CAP) return { untrusted: true, truncated: true, result: raw.slice(0, CAP) }
  try {
    return { untrusted: true, result: JSON.parse(raw) }
  } catch {
    return { untrusted: true, truncated: true, result: raw.slice(0, CAP) }
  }
}

export async function evalInPage(tabId: number, code: string): Promise<unknown> {
  // userScripts MAIN runs the source as a page script, so page JS is visible and
  // CSP does not block it. Function() is the fallback when user scripts are off.
  const direct = await evalViaUserScripts(tabId, code)
  if (direct !== 'unavailable') return packEval(direct)
  const main = await runEval(tabId, 'MAIN', code)
  if (!isEvalCspBlock(main.error)) return packEval(main)
  const isolated = packEval(await runEval(tabId, 'ISOLATED', code))
  if (isolated && typeof isolated === 'object' && !('error' in isolated)) {
    return { ...isolated, domOnly: true }
  }
  return isolated
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
