import { useState, useCallback, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

function CopyButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    await navigator.clipboard.writeText(getText())
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [getText])
  return (
    <button
      onClick={handleCopy}
      // user-select:none prevents button text from being included in text selection
      className="absolute top-1 right-1 px-1.5 py-0.5 rounded text-[10px] select-none bg-muted-foreground/20 hover:bg-muted-foreground/40 text-muted-foreground opacity-0 group-hover/copy:opacity-100 transition-opacity z-10"
    >
      {copied ? '✓' : 'Copy'}
    </button>
  )
}

/** Extract table as markdown from a <table> element */
function extractTableMarkdown(el: HTMLTableElement): string {
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
  // Pad rows to same length
  const padded = rows.map(r => {
    while (r.length < colCount) r.push('')
    return r
  })
  // First row is header
  const header = `| ${padded[0].join(' | ')} |`
  const sep = `| ${padded[0].map(() => '---').join(' | ')} |`
  const body = padded.slice(1).map(r => `| ${r.join(' | ')} |`).join('\n')
  return [header, sep, body].filter(Boolean).join('\n')
}

/** Extract code block content as markdown fenced block */
function extractCodeMarkdown(el: HTMLPreElement): string {
  const codeEl = el.querySelector('code')
  const text = (codeEl || el).textContent ?? ''
  // Try to detect language from class name
  const lang = codeEl?.className?.match(/language-(\w+)/)?.[1] ?? ''
  return '```' + lang + '\n' + text.trimEnd() + '\n```'
}

interface MarkdownContentProps {
  content: string
}

/** Walk DOM fragment and rebuild markdown-style text */
function domToMarkdown(fragment: DocumentFragment): string {
  const lines: string[] = []

  function walk(node: Node, ctx: { listType?: 'ul' | 'ol'; listIndex?: number; depth?: number }) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      if (text.trim()) lines.push(text)
      return
    }
    const el = node as HTMLElement
    const tag = el.tagName?.toLowerCase()

    // Skip copy buttons entirely
    if (tag === 'button') return

    // Code blocks → fenced markdown
    if (tag === 'pre') {
      lines.push(extractCodeMarkdown(el as HTMLPreElement))
      return
    }

    // Tables → markdown table
    if (tag === 'table') {
      lines.push(extractTableMarkdown(el as HTMLTableElement))
      return
    }

    // Lists
    if (tag === 'ul' || tag === 'ol') {
      let idx = 0
      el.childNodes.forEach(child => {
        const childTag = (child as HTMLElement).tagName?.toLowerCase()
        if (childTag === 'li') {
          idx++
          walk(child, { listType: tag as 'ul' | 'ol', listIndex: idx, depth: (ctx.depth ?? 0) })
        } else {
          walk(child, ctx)
        }
      })
      return
    }

    if (tag === 'li') {
      const prefix = ctx.listType === 'ol' ? `${ctx.listIndex}. ` : '- '
      // Collect inline text, but recurse for nested lists
      const inlineParts: string[] = []
      const nestedBlocks: string[] = []
      el.childNodes.forEach(child => {
        const childTag = (child as HTMLElement).tagName?.toLowerCase()
        if (childTag === 'ul' || childTag === 'ol') {
          // Nested list — collect separately
          let subIdx = 0
          ;(child as HTMLElement).querySelectorAll(':scope > li').forEach(li => {
            subIdx++
            const subPrefix = childTag === 'ol' ? `${subIdx}. ` : '- '
            nestedBlocks.push('  ' + subPrefix + (li as HTMLElement).textContent?.trim())
          })
        } else {
          inlineParts.push(child.textContent ?? '')
        }
      })
      lines.push(prefix + inlineParts.join('').trim())
      nestedBlocks.forEach(b => lines.push(b))
      return
    }

    // Headings
    if (tag && /^h([1-6])$/.test(tag)) {
      const level = parseInt(tag[1])
      const text = el.textContent?.trim() ?? ''
      lines.push('#'.repeat(level) + ' ' + text)
      return
    }

    // Blockquote
    if (tag === 'blockquote') {
      const text = el.textContent?.trim() ?? ''
      lines.push('> ' + text)
      return
    }

    // Skip wrapper divs that hold copy buttons (group/copy containers)
    // Just recurse into children
    el.childNodes.forEach(child => walk(child, ctx))
  }

  fragment.childNodes.forEach(child => walk(child, {}))
  return lines.join('\n')
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Intercept copy events to rewrite clipboard with markdown-style formatting
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handleCopy = (e: ClipboardEvent) => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed) return

      const range = selection.getRangeAt(0)
      const fragment = range.cloneContents()
      const md = domToMarkdown(fragment)
      if (md) {
        e.preventDefault()
        e.clipboardData?.setData('text/plain', md)
      }
    }
    el.addEventListener('copy', handleCopy)
    return () => el.removeEventListener('copy', handleCopy)
  }, [])

  return (
    <div ref={containerRef}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        pre: ({ children }) => {
          const ref = useRef<HTMLPreElement>(null)
          return (
            <div className="relative group/copy">
              <CopyButton getText={() => ref.current ? extractCodeMarkdown(ref.current) : ''} />
              <pre ref={ref} className="bg-background/50 rounded p-2 overflow-x-auto text-[11px] leading-snug">
                {children}
              </pre>
            </div>
          )
        },
        code: ({ className, children, ...props }) => {
          const isInline = !className
          return isInline ? (
            <code className="bg-background/50 px-1 py-0.5 rounded text-[11px]" {...props}>
              {children}
            </code>
          ) : (
            <code className={className} {...props}>
              {children}
            </code>
          )
        },
        p: ({ children }) => <p className="mb-1.5 last:mb-0 leading-snug">{children}</p>,
        ul: ({ children }) => <ul className="list-disc pl-4 mb-1.5 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 mb-1.5 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="leading-snug">{children}</li>,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
            {children}
          </a>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-muted-foreground/30 pl-3 italic">
            {children}
          </blockquote>
        ),
        table: ({ children }) => {
          const ref = useRef<HTMLTableElement>(null)
          return (
            <div className="relative group/copy overflow-x-auto">
              <CopyButton getText={() => ref.current ? extractTableMarkdown(ref.current) : ''} />
              <table ref={ref} className="border-collapse border border-muted-foreground/30 text-xs">
                {children}
              </table>
            </div>
          )
        },
        th: ({ children }) => (
          <th className="border border-muted-foreground/30 px-2 py-1 bg-muted/50">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-muted-foreground/30 px-2 py-1">
            {children}
          </td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
    </div>
  )
}
