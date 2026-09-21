function linkFromEvent(e: Event): HTMLAnchorElement | null {
  const t = e.target
  if (!(t instanceof Element)) return null
  return t.closest('a[href]')
}

function isDerivedClick(e: MouseEvent): boolean {
  if (!linkFromEvent(e)) return false
  if (e.button === 1) return true
  if (e.button !== 0) return false
  return e.metaKey || e.ctrlKey || e.shiftKey
}

/** Forward Cmd/Ctrl/Shift/middle-clicks so the SW can open the side panel with a user gesture. */
export function initDerivedTabOpens(): void {
  const notify = () => {
    chrome.runtime.sendMessage({ type: 'iris-expect-derived-tab' }).catch(() => {})
  }
  document.addEventListener('click', e => { if (isDerivedClick(e)) notify() }, true)
  document.addEventListener('auxclick', e => { if (isDerivedClick(e)) notify() }, true)
}
