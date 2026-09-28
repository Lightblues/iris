const logs: string[] = []
const MAX = 200

function markGmReady(): void {
  if (!document.documentElement) return
  document.documentElement.setAttribute('data-iris-gm', '1')
}
markGmReady()
if (!document.documentElement) {
  new MutationObserver((_records, obs) => {
    if (!document.documentElement) return
    markGmReady()
    obs.disconnect()
  }).observe(document, { childList: true })
}

window.addEventListener('message', (ev: MessageEvent) => {
  if (ev.source !== window) return
  const detail = ev.data
  if (!detail || detail.source !== 'iris-gm-request') return
  const { id, scriptId, method, payload } = detail
  if (!id) return
  const reply = (result?: unknown, error?: string) => {
    window.postMessage({ source: 'iris-gm-response', id, result, error }, '*')
  }
  if (method === 'log') {
    const line = `[${scriptId}] ${(payload?.args || []).join(' ')}`
    logs.push(line)
    if (logs.length > MAX) logs.shift()
    console.log('[Iris GM]', line)
    reply(true)
    return
  }
  if (method === 'clipboard') {
    navigator.clipboard.writeText(payload?.text || '').then(() => reply(true), (err) => reply(undefined, err.message))
    return
  }
  chrome.runtime.sendMessage({ type: 'iris_gm', scriptId, method, payload }, (res: { ok?: boolean; result?: unknown; error?: string }) => {
    if (chrome.runtime.lastError) reply(undefined, chrome.runtime.lastError.message)
    else if (!res?.ok) reply(undefined, res?.error || 'GM request failed')
    else reply(res.result)
  })
})

export function readGmLogs(): string[] {
  return logs.slice()
}
