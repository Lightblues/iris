// In-page table of contents: a thin rail of ticks at the right edge that opens a card of the page's
// headings (or the user's prompts on chat sites). Lives in a shadow root and never reflows the page.
// Design: .ea/log/2026-11-07-page-toc.md (D011).

import { extractOutline, isChatPage, type OutlineEntry } from '../lib/outline'
import { matchesGlob } from '../lib/fabSites'
import { showToast } from './commandMenu'

const HOST_ID = 'iris-page-toc'
const SETTINGS_KEY = 'sidepanel_settings'
const MIN_HEADINGS = 3
const MIN_PROMPTS = 2
const MIN_SCREENS = 2.5
const FILTER_ABOVE = 40
const FOLD_DEEPER_THAN = 3
const REBUILD_MS = 500

let entries: OutlineEntry[] = []
let signature = ''
let blocklist: string[] = []
let host: HTMLDivElement | null = null
let rail: HTMLDivElement | null = null
let card: HTMLDivElement | null = null
let list: HTMLDivElement | null = null
let filterInput: HTMLInputElement | null = null
let pinButton: HTMLButtonElement | null = null
let isOpen = false
let pinned = false
let keyboardMode = false
let active = -1
let filter = ''
let expanded = new Set<number>()
let returnFocus: Element | null = null
let openTimer: ReturnType<typeof setTimeout> | undefined
let closeTimer: ReturnType<typeof setTimeout> | undefined
let rebuildTimer: ReturnType<typeof setTimeout> | undefined
let frame = 0
let started = false

const CSS = `
:host { all: initial; }
.rail { position: fixed; right: 3px; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; align-items: flex-end;
  padding: 6px 4px; max-height: 50vh; overflow: hidden; cursor: pointer; opacity: .5; transition: opacity .15s; z-index: 2147483646; }
.rail:hover { opacity: 1; }
.tick { flex: none; height: 2px; border-radius: 1px; background: rgba(120,120,120,.6); }
.tick.active { background: rgba(40,40,40,.95); }
.card { position: fixed; right: 12px; top: 50%; transform: translateY(-50%); width: 260px; max-height: 70vh; display: flex; flex-direction: column;
  background: rgba(255,255,255,.97); color: #1f2328; border: 1px solid rgba(0,0,0,.1); border-radius: 10px; box-shadow: 0 8px 28px rgba(0,0,0,.16);
  font: 13px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; z-index: 2147483646; backdrop-filter: blur(8px); }
.head { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px 6px; font-size: 12px; font-weight: 600; color: #6b7280; }
.pin { border: 0; background: none; cursor: pointer; font-size: 12px; opacity: .45; padding: 0 2px; }
.pin.on { opacity: 1; }
.filter { margin: 0 8px 6px; padding: 4px 6px; border: 1px solid rgba(0,0,0,.15); border-radius: 6px; font: inherit; font-size: 12px; background: transparent; color: inherit; outline: none; }
.list { overflow-y: auto; padding: 0 4px 8px; }
.item { display: flex; align-items: center; width: 100%; box-sizing: border-box; text-align: left; border: 0; background: none; color: inherit; font: inherit;
  padding: 3px 6px; border-radius: 6px; cursor: pointer; }
.item:hover, .item:focus { background: rgba(0,0,0,.06); outline: none; }
.item.active { font-weight: 600; box-shadow: inset 2px 0 0 #6366f1; }
.txt { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fold { flex: none; width: 14px; text-align: center; opacity: .55; font-size: 10px; }
.empty { padding: 6px 10px; color: #6b7280; font-size: 12px; }
@media (prefers-color-scheme: dark) {
  .tick { background: rgba(180,180,180,.55); }
  .tick.active { background: rgba(240,240,240,.95); }
  .card { background: rgba(32,33,36,.97); color: #e8eaed; border-color: rgba(255,255,255,.12); }
  .head, .empty { color: #9aa0a6; }
  .filter { border-color: rgba(255,255,255,.2); }
  .item:hover, .item:focus { background: rgba(255,255,255,.08); }
}
@media print { .rail, .card { display: none; } }
`

export async function initPageToc(): Promise<void> {
  if (started || location.protocol === 'chrome-extension:' || location.protocol === 'chrome:') return
  started = true
  const empty: Record<string, unknown> = {}
  const [local, sync] = await Promise.all([
    chrome.storage.local.get(SETTINGS_KEY).catch(() => empty),
    chrome.storage.sync.get(SETTINGS_KEY).catch(() => empty),
  ])
  blocklist = ((local[SETTINGS_KEY] ?? sync[SETTINGS_KEY]) as { tocSitePatterns?: string[] } | undefined)?.tocSitePatterns || []
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[SETTINGS_KEY]) return
    blocklist = (changes[SETTINGS_KEY].newValue as { tocSitePatterns?: string[] } | undefined)?.tocSitePatterns || []
    render()
  })
  new MutationObserver(scheduleRebuild).observe(document.documentElement, { childList: true, subtree: true })
  document.addEventListener('scroll', scheduleActive, { capture: true, passive: true })
  window.addEventListener('resize', scheduleActive, { passive: true })
  document.addEventListener('pointerdown', (e) => {
    if (isOpen && !pinned && host && !e.composedPath().includes(host)) close()
  }, true)
  refreshPageToc()
}

/** Re-read the outline now (SPA navigation, or the page changed). */
export function refreshPageToc(urlChanged = false): void {
  if (!started) return
  if (urlChanged) { expanded = new Set(); pinned = false; if (isOpen) close() }
  rebuild()
}

/** The keyboard command and the palette row: open the card focused, or close it. */
export function togglePageToc(): void {
  if (isOpen) { close(); return }
  rebuild()
  if (!entries.length) { showToast('No headings on this page', 'error'); return }
  open(true)
}

function scheduleRebuild(): void {
  if (rebuildTimer) return
  rebuildTimer = setTimeout(() => { rebuildTimer = undefined; rebuild() }, REBUILD_MS)
}

function rebuild(): void {
  const next = extractOutline()
  const sig = next.map(e => `${e.level}${e.text}`).join('\n')
  const changed = sig !== signature || next.some((e, i) => e.el !== entries[i]?.el)
  entries = next
  signature = sig
  if (changed) { updateActive(); render() }
  else if (!!host !== shouldShow()) render()
}

function scrollRatio(el: Element | undefined): number {
  const doc = document.documentElement
  let best = doc.scrollHeight / Math.max(1, window.innerHeight)
  for (let n = el?.parentElement; n && n !== document.body && n !== doc; n = n.parentElement) {
    if (n.scrollHeight > n.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(n).overflowY)) {
      best = Math.max(best, n.scrollHeight / Math.max(1, n.clientHeight))
      break
    }
  }
  return best
}

function autoShow(): boolean {
  if (matchesGlob(location.href, blocklist)) return false
  if (isChatPage(location.href) && entries[0]?.tag === 'prompt') return entries.length >= MIN_PROMPTS
  return entries.length >= MIN_HEADINGS && scrollRatio(entries[0]?.el) >= MIN_SCREENS
}

const shouldShow = () => isOpen || autoShow()

function ensureHost(): ShadowRoot {
  if (host?.isConnected) return host.shadowRoot!
  host = document.createElement('div')
  host.id = HOST_ID
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = CSS
  rail = document.createElement('div')
  rail.className = 'rail'
  rail.addEventListener('mouseenter', () => { clearTimeout(openTimer); openTimer = setTimeout(() => open(false), 150) })
  rail.addEventListener('mouseleave', () => clearTimeout(openTimer))
  rail.addEventListener('click', () => { clearTimeout(openTimer); open(false) })

  card = document.createElement('div')
  card.className = 'card'
  card.setAttribute('role', 'navigation')
  card.setAttribute('aria-label', 'Page outline')
  const head = document.createElement('div')
  head.className = 'head'
  const label = document.createElement('span')
  label.className = 'label'
  pinButton = document.createElement('button')
  pinButton.className = 'pin'
  pinButton.title = 'Keep open on this page'
  pinButton.textContent = '📌'
  pinButton.addEventListener('click', () => { pinned = !pinned; render() })
  head.append(label, pinButton)
  filterInput = document.createElement('input')
  filterInput.className = 'filter'
  filterInput.placeholder = 'Filter…'
  filterInput.addEventListener('input', () => { filter = filterInput!.value; renderList() })
  list = document.createElement('div')
  list.className = 'list'
  card.append(head, filterInput, list)
  card.addEventListener('mouseenter', () => clearTimeout(closeTimer))
  card.addEventListener('mouseleave', () => {
    if (!pinned && !keyboardMode) closeTimer = setTimeout(close, 300)
  })
  card.addEventListener('keydown', onKey)
  card.addEventListener('keyup', e => e.stopPropagation())
  card.addEventListener('keypress', e => e.stopPropagation())

  shadow.append(style, rail, card)
  document.documentElement.appendChild(host)
  return shadow
}

function render(): void {
  if (!shouldShow()) {
    host?.remove()
    host = null
    return
  }
  ensureHost()
  rail!.style.display = isOpen ? 'none' : 'flex'
  card!.style.display = isOpen ? 'flex' : 'none'
  if (!isOpen) renderRail()
  else {
    card!.querySelector('.label')!.textContent = entries[0]?.tag === 'prompt' ? `Prompts · ${entries.length}` : `Outline · ${entries.length}`
    pinButton!.classList.toggle('on', pinned)
    filterInput!.style.display = entries.length > FILTER_ABOVE ? '' : 'none'
    renderList()
  }
}

function renderRail(): void {
  const step = Math.min(6, (window.innerHeight * 0.5 - 12) / Math.max(1, entries.length))
  const gap = Math.max(0, (step - 2) / 2)
  rail!.replaceChildren(...entries.map((e, i) => {
    const t = document.createElement('div')
    t.className = i === active ? 'tick active' : 'tick'
    t.style.width = `${[14, 10, 7][e.level - 1] ?? 5}px`
    t.style.margin = `${gap}px 0`
    return t
  }))
}

// h4 and deeper hang under their nearest entry of level 3 or less, folded unless expanded or holding the current section.
function parentOf(i: number): number {
  if (entries[i].level <= FOLD_DEEPER_THAN) return -1
  for (let j = i - 1; j >= 0; j--) if (entries[j].level <= FOLD_DEEPER_THAN) return j
  return -1
}

function visibleIndices(): number[] {
  const q = filter.trim().toLowerCase()
  if (q) return entries.flatMap((e, i) => e.text.toLowerCase().includes(q) ? [i] : [])
  const activeParent = active >= 0 ? (parentOf(active) >= 0 ? parentOf(active) : active) : -1
  return entries.flatMap((_, i) => {
    const p = parentOf(i)
    return p < 0 || expanded.has(p) || p === activeParent ? [i] : []
  })
}

function renderList(): void {
  if (!list) return
  const focused = list.querySelector<HTMLElement>('.item:focus')?.dataset.i
  const shown = visibleIndices()
  const q = filter.trim()
  if (!shown.length) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent = 'No match'
    list.replaceChildren(empty)
    return
  }
  list.replaceChildren(...shown.map(i => {
    const e = entries[i]
    const b = document.createElement('button')
    b.className = i === active ? 'item active' : 'item'
    b.dataset.i = String(i)
    b.title = e.text
    b.style.paddingLeft = `${6 + (q ? 0 : (e.level - 1) * 12)}px`
    const fold = document.createElement('span')
    fold.className = 'fold'
    const hasKids = !q && e.level <= FOLD_DEEPER_THAN && entries[i + 1] && parentOf(i + 1) === i
    if (hasKids) {
      const openKids = shown.includes(i + 1)
      fold.textContent = openKids ? '▾' : '▸'
      fold.addEventListener('click', (ev) => {
        ev.stopPropagation()
        if (openKids) expanded.delete(i)
        else expanded.add(i)
        if (openKids && parentOf(active) === i) expanded.delete(i)
        renderList()
      })
    }
    const txt = document.createElement('span')
    txt.className = 'txt'
    txt.textContent = e.text
    b.append(fold, txt)
    b.addEventListener('click', () => jump(i))
    return b
  }))
  if (focused) list.querySelector<HTMLElement>(`.item[data-i="${focused}"]`)?.focus({ preventScroll: true })
  list.querySelector('.item.active')?.scrollIntoView({ block: 'nearest' })
}

function open(viaKeyboard: boolean): void {
  clearTimeout(closeTimer)
  if (isOpen) return
  if (!entries.length) return
  isOpen = true
  keyboardMode = viaKeyboard
  filter = ''
  if (filterInput) filterInput.value = ''
  if (viaKeyboard) returnFocus = document.activeElement
  render()
  if (viaKeyboard) {
    const target = list?.querySelector<HTMLElement>('.item.active') ?? list?.querySelector<HTMLElement>('.item')
    if (entries.length > FILTER_ABOVE) filterInput?.focus({ preventScroll: true })
    else target?.focus({ preventScroll: true })
  }
}

function close(): void {
  clearTimeout(closeTimer)
  if (!isOpen) return
  const hadFocus = !!host?.shadowRoot?.activeElement
  isOpen = false
  pinned = false
  filter = ''
  render()
  if (keyboardMode && hadFocus && returnFocus instanceof HTMLElement) returnFocus.focus({ preventScroll: true })
  keyboardMode = false
  returnFocus = null
}

function onKey(e: KeyboardEvent): void {
  e.stopPropagation()
  const items = [...(list?.querySelectorAll<HTMLElement>('.item') ?? [])]
  const at = items.findIndex(b => b === host?.shadowRoot?.activeElement)
  if (e.key === 'Escape') { e.preventDefault(); close() }
  else if (e.key === 'ArrowDown') { e.preventDefault(); items[Math.min(items.length - 1, at + 1)]?.focus() }
  else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (at <= 0 && filterInput?.style.display !== 'none') filterInput?.focus()
    else items[Math.max(0, at - 1)]?.focus()
  } else if (e.key === 'Enter' && host?.shadowRoot?.activeElement === filterInput) { e.preventDefault(); items[0]?.click() }
}

/** Height covered by fixed or sticky bars at the top of the viewport. */
function stickyTop(): number {
  let bottom = 0
  for (const x of [window.innerWidth / 2, window.innerWidth / 4]) {
    for (const hit of document.elementsFromPoint(x, 4)) {
      for (let n: Element | null = hit; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
        if (n === host) break
        const pos = getComputedStyle(n).position
        if (pos !== 'fixed' && pos !== 'sticky') continue
        const r = n.getBoundingClientRect()
        if (r.top <= 4 && r.height < window.innerHeight / 3) bottom = Math.max(bottom, r.bottom)
      }
    }
  }
  return bottom
}

function jump(i: number): void {
  const el = entries[i]?.el as HTMLElement | undefined
  if (!el?.isConnected) return
  const distance = Math.abs(el.getBoundingClientRect().top)
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const behavior: ScrollBehavior = !reduced && distance < window.innerHeight * 3 ? 'smooth' : 'auto'
  const prev = el.style.scrollMarginTop
  el.style.scrollMarginTop = `${stickyTop() + 8}px`
  el.scrollIntoView({ block: 'start', behavior })
  setTimeout(() => { el.style.scrollMarginTop = prev }, 1000)
  el.animate?.([{ backgroundColor: 'rgba(250, 204, 21, 0.35)' }, { backgroundColor: 'rgba(250, 204, 21, 0)' }], { duration: 1500, delay: behavior === 'smooth' ? 300 : 0, easing: 'ease-out' })
  active = i
  if (!pinned) close()
  else renderList()
}

function scheduleActive(): void {
  if (frame || !host) return
  frame = requestAnimationFrame(() => {
    frame = 0
    const prev = active
    updateActive()
    if (active !== prev && host) { if (isOpen) renderList(); else renderRail() }
  })
}

function updateActive(): void {
  const line = window.innerHeight / 3
  let found = -1
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].el.getBoundingClientRect().top <= line) found = i
    else break
  }
  active = found
}
