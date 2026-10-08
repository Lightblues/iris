/** Extract table as markdown from a <table> element */
export function extractTableMarkdown(el: HTMLTableElement): string {
  const rows: string[][] = []
  el.querySelectorAll('tr').forEach(tr => {
    const cells: string[] = []
    tr.querySelectorAll('th, td').forEach(cell => {
      cells.push((cell as HTMLElement).innerText.trim())
    })
    rows.push(cells)
  })
  if (rows.length === 0) return ''
  const colCount = Math.max(...rows.map(r => r.length))
  const padded = rows.map(r => {
    while (r.length < colCount) r.push('')
    return r
  })
  const header = `| ${padded[0].join(' | ')} |`
  const sep = `| ${padded[0].map(() => '---').join(' | ')} |`
  const body = padded.slice(1).map(r => `| ${r.join(' | ')} |`).join('\n')
  return [header, sep, body].filter(Boolean).join('\n')
}

/** Extract code block content as markdown fenced block */
export function extractCodeMarkdown(el: HTMLPreElement): string {
  const codeEl = el.querySelector('code')
  const text = (codeEl || el).textContent ?? ''
  const lang = codeEl?.className?.match(/language-(\w+)/)?.[1] ?? ''
  return '```' + lang + '\n' + text.trimEnd() + '\n```'
}

const BLOCK_TAGS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'table', 'ul', 'ol', 'li', 'hr', 'br', 'section', 'article'])

/** Serialize a node tree to inline markdown (no trailing newline) */
function inlineToMd(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  const el = node as HTMLElement
  const tag = el.tagName?.toLowerCase()
  if (tag === 'button') return ''
  if (tag === 'br') return '\n'
  if (tag === 'code') return '`' + (el.textContent ?? '') + '`'

  let inner = ''
  el.childNodes.forEach(c => { inner += inlineToMd(c) })

  if (tag === 'strong' || tag === 'b') return '**' + inner + '**'
  if (tag === 'em' || tag === 'i') return '*' + inner + '*'
  if (tag === 'del' || tag === 's') return '~~' + inner + '~~'
  if (tag === 'a') {
    const href = el.getAttribute('href') ?? ''
    return href ? `[${inner}](${href})` : inner
  }
  return inner
}

function isBlock(node: Node): boolean {
  if (node.nodeType !== Node.ELEMENT_NODE) return false
  const tag = (node as HTMLElement).tagName?.toLowerCase()
  return !!tag && BLOCK_TAGS.has(tag)
}

/**
 * Rebuild markdown from a copied selection.
 * A range inside one paragraph clones inline nodes (text, code, strong) without the `<p>`,
 * so those siblings must stay on one line.
 */
export function domToMarkdown(fragment: { childNodes: Iterable<Node> }): string {
  const lines: string[] = []

  function emitInline(nodes: Node[]) {
    const text = nodes.map(inlineToMd).join('').trim()
    if (text) lines.push(text)
  }

  function walkSiblings(nodes: Iterable<Node>, ctx: { listType?: 'ul' | 'ol'; listIndex?: number }) {
    const buf: Node[] = []
    const flush = () => {
      if (!buf.length) return
      emitInline(buf)
      buf.length = 0
    }
    for (const node of nodes) {
      if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName?.toLowerCase() === 'button') continue
      if (isBlock(node)) {
        flush()
        walk(node, ctx)
      } else {
        buf.push(node)
      }
    }
    flush()
  }

  function walk(node: Node, ctx: { listType?: 'ul' | 'ol'; listIndex?: number }) {
    if (!isBlock(node)) {
      emitInline([node])
      return
    }
    const el = node as HTMLElement
    const tag = el.tagName.toLowerCase()

    if (tag === 'pre') {
      lines.push(extractCodeMarkdown(el as HTMLPreElement))
      return
    }

    if (tag === 'table') {
      lines.push(extractTableMarkdown(el as HTMLTableElement))
      return
    }

    if (tag === 'ul' || tag === 'ol') {
      let idx = 0
      el.childNodes.forEach(child => {
        const childTag = (child as HTMLElement).tagName?.toLowerCase()
        if (childTag === 'li') {
          idx++
          walk(child, { listType: tag as 'ul' | 'ol', listIndex: idx })
        } else {
          walk(child, ctx)
        }
      })
      return
    }

    if (tag === 'li') {
      const prefix = ctx.listType === 'ol' ? `${ctx.listIndex}. ` : '- '
      const inlineParts: string[] = []
      const nestedBlocks: string[] = []
      el.childNodes.forEach(child => {
        const childTag = (child as HTMLElement).tagName?.toLowerCase()
        if (childTag === 'ul' || childTag === 'ol') {
          let subIdx = 0
          ;(child as HTMLElement).querySelectorAll(':scope > li').forEach(li => {
            subIdx++
            const subPrefix = childTag === 'ol' ? `${subIdx}. ` : '- '
            nestedBlocks.push('  ' + subPrefix + inlineToMd(li))
          })
        } else {
          inlineParts.push(inlineToMd(child))
        }
      })
      lines.push(prefix + inlineParts.join('').trim())
      nestedBlocks.forEach(b => lines.push(b))
      return
    }

    if (/^h([1-6])$/.test(tag)) {
      const level = parseInt(tag[1])
      lines.push('#'.repeat(level) + ' ' + inlineToMd(el))
      return
    }

    if (tag === 'blockquote') {
      const inner: string[] = []
      el.childNodes.forEach(child => { inner.push(inlineToMd(child)) })
      const text = inner.join('').trim()
      text.split('\n').forEach(line => lines.push('> ' + line))
      return
    }

    if (tag === 'p') {
      const text = inlineToMd(el).trim()
      if (text) lines.push(text)
      return
    }

    if (tag === 'div') {
      const hasBlockChild = Array.from(el.children).some(c => BLOCK_TAGS.has(c.tagName.toLowerCase()))
      if (hasBlockChild) {
        walkSiblings(el.childNodes, ctx)
        return
      }
      const text = inlineToMd(el).trim()
      if (text) lines.push(text)
      return
    }

    walkSiblings(el.childNodes, ctx)
  }

  walkSiblings(fragment.childNodes, {})
  return lines.join('\n')
}
