import type { HighlightAnchor } from './types'

/** Build an XPath from a node up to the nearest element with an id, or to body */
export function getXPath(node: Node): string {
  const parts: string[] = []
  let current: Node | null = node

  while (current && current !== document.body) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      const el = current as Element
      if (el.id) {
        parts.unshift(`//*[@id="${el.id}"]`)
        return parts.join('/')
      }
      const tag = el.tagName.toLowerCase()
      const siblings = el.parentElement?.children
      if (siblings && siblings.length > 1) {
        let idx = 1
        for (let i = 0; i < siblings.length; i++) {
          if (siblings[i] === el) break
          if (siblings[i].tagName === el.tagName) idx++
        }
        parts.unshift(`${tag}[${idx}]`)
      } else {
        parts.unshift(tag)
      }
    }
    current = current.parentNode
  }
  return '//' + parts.join('/')
}

/** Serialize a Range to a HighlightAnchor */
export function serializeAnchor(range: Range): HighlightAnchor {
  const textContent = range.toString()
  const container = range.startContainer.nodeType === Node.TEXT_NODE
    ? range.startContainer.parentElement!
    : range.startContainer as Element

  return {
    textContent,
    xpath: getXPath(container),
    startOffset: range.startOffset,
    endOffset: range.endOffset,
  }
}

/** Try to resolve a HighlightAnchor back to a Range in the document */
export function resolveAnchor(anchor: HighlightAnchor, doc: Document): Range | null {
  // Strategy 1: XPath → find container, then text match within it
  if (anchor.xpath) {
    try {
      const result = doc.evaluate(anchor.xpath, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
      const container = result.singleNodeValue as Element | null
      if (container) {
        const range = findTextInNode(container, anchor.textContent)
        if (range) return range
      }
    } catch { /* XPath may fail on changed DOM */ }
  }

  // Strategy 2: Full document text search (fuzzy)
  return findTextInNode(doc.body, anchor.textContent)
}

/** Search for text within a node using TreeWalker, return Range if found */
function findTextInNode(root: Node, searchText: string): Range | null {
  if (!searchText) return null

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null)
  let accumulated = ''
  const textNodes: { node: Text; start: number }[] = []

  let node: Text | null
  while ((node = walker.nextNode() as Text | null)) {
    const text = node.textContent || ''
    if (!text.trim()) continue
    textNodes.push({ node, start: accumulated.length })
    accumulated += text
  }

  // Find the search text in the accumulated string
  const idx = accumulated.indexOf(searchText)
  if (idx === -1) return null

  // Map back to text nodes
  const startPos = idx
  const endPos = idx + searchText.length
  let startNode: Text | null = null
  let startOffset = 0
  let endNode: Text | null = null
  let endOffset = 0

  for (let i = 0; i < textNodes.length; i++) {
    const tn = textNodes[i]
    const nodeEnd = tn.start + (tn.node.textContent?.length || 0)

    if (!startNode && startPos >= tn.start && startPos < nodeEnd) {
      startNode = tn.node
      startOffset = startPos - tn.start
    }
    if (endPos > tn.start && endPos <= nodeEnd) {
      endNode = tn.node
      endOffset = endPos - tn.start
      break
    }
  }

  if (!startNode || !endNode) return null

  try {
    const range = document.createRange()
    range.setStart(startNode, startOffset)
    range.setEnd(endNode, endOffset)
    return range
  } catch {
    return null
  }
}
