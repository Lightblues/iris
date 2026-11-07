// Page outline: the headings (or, on chat sites, the user's prompts) of the page being read.
// Shared by the in-page table of contents and read_page's card.

export interface OutlineItem {
  tag: string   // h1..h6, or 'prompt'
  level: number // 1-based after compression
  text: string
}

export interface OutlineEntry<E = Element> extends OutlineItem {
  el: E
}

const MAX_TEXT = 140
const SKIP = 'nav,aside,footer,[role="navigation"],[role="complementary"],[role="contentinfo"],[aria-hidden="true"]'

// User prompts per chat platform. DeepSeek's classes are hashed: a message without an answer body is a prompt.
const PROMPTS: { match: RegExp; find: (doc: Document) => Element[] }[] = [
  { match: /^https?:\/\/(chatgpt\.com|chat\.openai\.com)\//, find: d => [...d.querySelectorAll('[data-message-author-role="user"]')] },
  { match: /^https?:\/\/gemini\.google\.com\//, find: d => [...d.querySelectorAll('user-query')] },
  { match: /^https?:\/\/chat\.deepseek\.com\//, find: d => [...d.querySelectorAll('.ds-message')].filter(m => !m.querySelector('.ds-markdown')) },
]

export const cleanText = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT)

/** Drop empties and repeats, drop a leading h1 that only repeats the title, compress levels to 1..n. */
export function normalizeOutline<T extends { tag: string; level: number; text: string }>(raw: T[], title = ''): T[] {
  let items = raw.filter((it, i) => it.text && !(i > 0 && raw[i - 1].text === it.text && raw[i - 1].level === it.level))
  const t = cleanText(title).toLowerCase()
  if (items.length > 1 && items[0].tag === 'h1' && t && t.includes(items[0].text.toLowerCase()) && !items.slice(1).some(i => i.tag === 'h1')) {
    items = items.slice(1)
  }
  const levels = [...new Set(items.map(i => i.level))].sort((a, b) => a - b)
  return items.map(i => ({ ...i, level: levels.indexOf(i.level) + 1 }))
}

export function isChatPage(url: string): boolean {
  return PROMPTS.some(p => p.match.test(url))
}

function visible(el: Element): boolean {
  if (typeof el.checkVisibility === 'function') return el.checkVisibility()
  const r = el.getBoundingClientRect()
  return r.width > 0 || r.height > 0
}

function headingLevel(el: Element): number {
  const m = /^H([1-6])$/.exec(el.tagName)
  if (m) return Number(m[1])
  const aria = Number(el.getAttribute('aria-level'))
  return aria >= 1 && aria <= 6 ? aria : 2
}

function scopeRoot(doc: Document): Element {
  for (const sel of ['main', '[role="main"]', 'article']) {
    const el = doc.querySelector(sel)
    if (el && el.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]').length >= 3) return el
  }
  return doc.body
}

/** Headings of the page, or the user's prompts on a chat site (falling back to headings when none are found). */
export function extractOutline(doc: Document = document, url = location.href): OutlineEntry[] {
  const chat = PROMPTS.find(p => p.match.test(url))
  if (chat) {
    const prompts = chat.find(doc).filter(visible).map(el => ({ el, tag: 'prompt', level: 1, text: cleanText(el.textContent || '') }))
    const items = normalizeOutline(prompts)
    if (items.length) return items
  }
  if (!doc.body) return []
  const root = scopeRoot(doc)
  const raw: OutlineEntry[] = []
  for (const el of root.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')) {
    if (el.closest(SKIP) || el.closest('#iris-page-toc') || (root === doc.body && el.closest('header'))) continue
    if (!visible(el)) continue
    raw.push({ el, tag: /^H[1-6]$/.test(el.tagName) ? el.tagName.toLowerCase() : `h${headingLevel(el)}`, level: headingLevel(el), text: cleanText(el.textContent || '') })
  }
  return normalizeOutline(raw, doc.title)
}
