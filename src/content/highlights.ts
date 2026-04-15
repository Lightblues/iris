// Content script module for page highlight capture, restore, tooltip, and selection popup
import { serializeAnchor, resolveAnchor } from '../lib/highlights'
import { convertSelectionToMarkdown } from '../lib/markdown'
import type { HighlightAnchor, KnowledgeEntry } from '../lib/types'

let activeTooltip: HTMLDivElement | null = null
let selectionPopup: HTMLDivElement | null = null

// Highlight icon SVG
const highlightSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`

/** Capture the current selection as anchor + markdown content */
export function captureHighlight(): { anchor: HighlightAnchor; text: string; markdown: string } | null {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null

  const range = sel.getRangeAt(0)
  const text = range.toString().trim()
  if (!text) return null

  const anchor = serializeAnchor(range)

  // Convert to markdown for rich content
  const mdResult = convertSelectionToMarkdown()
  const markdown = mdResult.success && mdResult.markdown ? mdResult.markdown : text

  return { anchor, text, markdown }
}

/** Save highlight: capture → send to background → apply mark. Returns entry id or null. */
export async function saveHighlight(): Promise<string | null> {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null

  const range = sel.getRangeAt(0)
  const text = range.toString().trim()
  if (!text) return null

  // Capture anchor and markdown BEFORE any DOM changes
  const anchor = serializeAnchor(range)
  const mdResult = convertSelectionToMarkdown()
  const markdown = mdResult.success && mdResult.markdown ? mdResult.markdown : text

  // Collect text nodes for marking BEFORE clearing selection
  const textNodes = getTextNodesInRange(range)

  // Clear selection
  sel.removeAllRanges()

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'create-highlight',
      anchor,
      content: markdown,
      text,
      url: window.location.href,
      title: document.title,
    }) as any

    if (response?.success && response.entryId) {
      // Apply marks using the pre-collected text nodes
      applyHighlightToTextNodes(textNodes, response.entryId)
      return response.entryId
    }
  } catch (err) {
    console.log('[Iris] Failed to save highlight:', err)
  }
  return null
}

/** Apply highlight marks to pre-collected text nodes */
function applyHighlightToTextNodes(
  textNodes: { node: Text; start: number; end: number }[],
  entryId: string
): void {
  // Process in reverse order to avoid offset shifts
  for (let i = textNodes.length - 1; i >= 0; i--) {
    const { node, start, end } = textNodes[i]
    // Node may have been modified; validate
    if (!node.parentNode || !node.textContent) continue

    let targetNode: Text = node
    if (end < targetNode.length) {
      targetNode.splitText(end)
    }
    if (start > 0) {
      targetNode = targetNode.splitText(start)
    }

    const mark = document.createElement('mark')
    mark.className = 'iris-highlight'
    mark.dataset.irisId = entryId
    targetNode.parentNode!.insertBefore(mark, targetNode)
    mark.appendChild(targetNode)

    mark.addEventListener('mouseenter', (e) => showTooltip(e, entryId))
    mark.addEventListener('mouseleave', scheduleHideTooltip)
  }
}

/** Apply a visual highlight mark around a range */
function applyHighlightMark(range: Range, entryId: string): void {
  // Collect all text nodes within the range
  const textNodes = getTextNodesInRange(range)
  if (textNodes.length === 0) return

  for (const { node, start, end } of textNodes) {
    // Split text node if needed to only wrap the selected portion
    let targetNode = node
    if (end < targetNode.length) {
      targetNode.splitText(end)
    }
    if (start > 0) {
      targetNode = targetNode.splitText(start)
    }

    const mark = document.createElement('mark')
    mark.className = 'iris-highlight'
    mark.dataset.irisId = entryId
    targetNode.parentNode!.insertBefore(mark, targetNode)
    mark.appendChild(targetNode)

    mark.addEventListener('mouseenter', (e) => showTooltip(e, entryId))
    mark.addEventListener('mouseleave', scheduleHideTooltip)
  }
}

/** Get all text nodes within a range with their start/end offsets */
function getTextNodesInRange(range: Range): { node: Text; start: number; end: number }[] {
  const results: { node: Text; start: number; end: number }[] = []
  const walker = document.createTreeWalker(
    range.commonAncestorContainer,
    NodeFilter.SHOW_TEXT,
    null
  )

  let node: Text | null
  while ((node = walker.nextNode() as Text | null)) {
    if (!range.intersectsNode(node)) continue
    const text = node.textContent || ''
    if (!text.trim()) continue

    let start = 0
    let end = text.length

    if (node === range.startContainer) start = range.startOffset
    if (node === range.endContainer) end = range.endOffset

    if (start < end) {
      results.push({ node, start, end })
    }
  }

  return results
}

/** Restore all highlights for the current URL */
export async function restoreHighlights(url: string): Promise<void> {
  const result = await chrome.storage.local.get('iris_knowledge')
  const store = result['iris_knowledge'] as { entries: KnowledgeEntry[] } | undefined
  if (!store?.entries) return

  const highlights = store.entries.filter(
    (e) => e.type === 'highlight' && e.source.url === url && e.source.anchor
  )

  for (const entry of highlights) {
    if (!entry.source.anchor) continue
    if (document.querySelector(`[data-iris-id="${entry.id}"]`)) continue

    const range = resolveAnchor(entry.source.anchor, document)
    if (range) {
      applyHighlightMark(range, entry.id)
    }
  }
}

/** Remove a highlight mark from the page (unwrap) */
export function removeHighlightMark(id: string): void {
  const marks = document.querySelectorAll<HTMLElement>(`mark.iris-highlight[data-iris-id="${id}"]`)
  marks.forEach((mark) => {
    const parent = mark.parentNode
    if (!parent) return
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark)
    }
    parent.removeChild(mark)
    parent.normalize()
  })
}

// --- Selection Popup (Cubox-style) ---

export function initSelectionPopup(): void {
  document.addEventListener('mouseup', onMouseUp)
  document.addEventListener('mousedown', onMouseDown)
}

function onMouseDown(e: MouseEvent): void {
  // Hide popup if clicking outside of it
  if (selectionPopup && !selectionPopup.contains(e.target as Node)) {
    hideSelectionPopup()
  }
}

function onMouseUp(e: MouseEvent): void {
  // Don't show popup if clicking inside iris elements
  const target = e.target as HTMLElement
  if (target.closest('#iris-floating-fab-container, #iris-floating-sidebar, .iris-highlight-tooltip, .iris-selection-popup')) return

  // Small delay to let selection stabilize
  setTimeout(() => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      hideSelectionPopup()
      return
    }

    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()

    showSelectionPopup(rect)
  }, 10)
}

function showSelectionPopup(rect: DOMRect): void {
  hideSelectionPopup()

  selectionPopup = document.createElement('div')
  selectionPopup.className = 'iris-selection-popup'
  selectionPopup.innerHTML = `<button class="iris-selection-popup-btn" title="Save as Highlight">${highlightSvg}<span>Highlight</span></button>`

  const btn = selectionPopup.querySelector('.iris-selection-popup-btn')!
  btn.addEventListener('click', async (ev) => {
    ev.stopPropagation()
    hideSelectionPopup()
    await saveHighlight()
  })

  // Position above selection
  const top = window.scrollY + rect.top - 36
  const left = window.scrollX + rect.left + (rect.width / 2) - 50
  selectionPopup.style.top = `${Math.max(0, top)}px`
  selectionPopup.style.left = `${Math.max(4, left)}px`

  document.body.appendChild(selectionPopup)
}

function hideSelectionPopup(): void {
  selectionPopup?.remove()
  selectionPopup = null
}

// --- Tooltip ---
let hideTooltipTimer: ReturnType<typeof setTimeout> | null = null

function showTooltip(e: MouseEvent, entryId: string): void {
  if (hideTooltipTimer) { clearTimeout(hideTooltipTimer); hideTooltipTimer = null }
  hideTooltipNow()

  const tooltip = document.createElement('div')
  tooltip.className = 'iris-highlight-tooltip'
  tooltip.innerHTML = `
    <span class="iris-highlight-tooltip-id">${entryId.slice(0, 8)}...</span>
    <button class="iris-highlight-tooltip-delete" data-id="${entryId}" title="Remove highlight">x</button>
  `
  tooltip.addEventListener('mouseenter', () => {
    if (hideTooltipTimer) { clearTimeout(hideTooltipTimer); hideTooltipTimer = null }
  })
  tooltip.addEventListener('mouseleave', scheduleHideTooltip)

  const deleteBtn = tooltip.querySelector('.iris-highlight-tooltip-delete')
  deleteBtn?.addEventListener('click', (ev) => {
    ev.stopPropagation()
    removeHighlightMark(entryId)
    hideTooltipNow()
    chrome.runtime.sendMessage({ type: 'delete-highlight', id: entryId })
  })

  const target = e.target as HTMLElement
  const rect = target.getBoundingClientRect()
  tooltip.style.top = `${window.scrollY + rect.top - 32}px`
  tooltip.style.left = `${window.scrollX + rect.left}px`

  document.body.appendChild(tooltip)
  activeTooltip = tooltip
}

function scheduleHideTooltip(): void {
  if (hideTooltipTimer) clearTimeout(hideTooltipTimer)
  hideTooltipTimer = setTimeout(hideTooltipNow, 300)
}

function hideTooltipNow(): void {
  activeTooltip?.remove()
  activeTooltip = null
  if (hideTooltipTimer) { clearTimeout(hideTooltipTimer); hideTooltipTimer = null }
}
