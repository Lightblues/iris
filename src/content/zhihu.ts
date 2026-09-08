import { cleanZhihuTitle, isZhihuHost, unwrapZhihuRedirect } from '../lib/zhihu'

function applyTitle(): void {
  const cleaned = cleanZhihuTitle(document.title)
  if (cleaned !== document.title) document.title = cleaned
}

function rewriteAnchor(anchor: HTMLAnchorElement): void {
  const next = unwrapZhihuRedirect(anchor.href)
  if (next && anchor.href !== next) anchor.href = next
}

function rewriteLinks(root: ParentNode): void {
  root.querySelectorAll('a[href*="link.zhihu.com"]').forEach((el) => {
    if (el instanceof HTMLAnchorElement) rewriteAnchor(el)
  })
}

function onPointer(e: Event): void {
  const node = e.target instanceof Element ? e.target : (e.target as Node | null)?.parentElement
  const anchor = node?.closest('a')
  if (anchor instanceof HTMLAnchorElement) rewriteAnchor(anchor)
}

let started = false

export function initZhihu(): void {
  if (started || !isZhihuHost(location.hostname)) return
  started = true

  const target = unwrapZhihuRedirect(location.href)
  if (target) {
    location.replace(target)
    return
  }

  applyTitle()
  rewriteLinks(document)

  const titleEl = document.querySelector('title')
  if (titleEl) {
    new MutationObserver(applyTitle).observe(titleEl, { childList: true, characterData: true, subtree: true })
  }

  new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes' && m.target instanceof HTMLAnchorElement) {
        rewriteAnchor(m.target)
        continue
      }
      for (const node of m.addedNodes) {
        if (node instanceof HTMLAnchorElement) rewriteAnchor(node)
        else if (node instanceof Element) rewriteLinks(node)
      }
    }
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['href'],
  })

  document.addEventListener('mousedown', onPointer, true)
  document.addEventListener('click', onPointer, true)
  document.addEventListener('auxclick', onPointer, true)
}
