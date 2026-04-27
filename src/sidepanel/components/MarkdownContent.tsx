import { useState, useCallback, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

function CopyButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(getText())
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [getText])
  return (
    <button
      onClick={handleCopy}
      className="absolute top-1 right-1 px-1.5 py-0.5 rounded text-[10px] bg-muted-foreground/20 hover:bg-muted-foreground/40 text-muted-foreground opacity-0 group-hover/copy:opacity-100 transition-opacity z-10"
    >
      {copied ? '✓' : 'Copy'}
    </button>
  )
}

/** Extract table as TSV from a <table> element */
function extractTableTSV(el: HTMLTableElement): string {
  const rows: string[] = []
  el.querySelectorAll('tr').forEach(tr => {
    const cells: string[] = []
    tr.querySelectorAll('th, td').forEach(cell => {
      cells.push((cell as HTMLElement).innerText.trim())
    })
    rows.push(cells.join('\t'))
  })
  return rows.join('\n')
}

interface MarkdownContentProps {
  content: string
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Intercept copy events to rewrite clipboard with markdown-style list prefixes
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handleCopy = (e: ClipboardEvent) => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed) return

      // Walk selected nodes — rebuild text with list prefixes
      const range = selection.getRangeAt(0)
      const fragment = range.cloneContents()
      const lines: string[] = []

      function walk(node: Node, listCtx?: { type: 'ul' | 'ol'; index: number }) {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent ?? ''
          if (text.trim()) lines.push(text)
          return
        }
        const el = node as HTMLElement
        const tag = el.tagName?.toLowerCase()
        if (tag === 'ul' || tag === 'ol') {
          let idx = 0
          el.childNodes.forEach(child => {
            const childTag = (child as HTMLElement).tagName?.toLowerCase()
            if (childTag === 'li') {
              idx++
              walk(child, { type: tag as 'ul' | 'ol', index: idx })
            } else {
              walk(child, listCtx)
            }
          })
          return
        }
        if (tag === 'li' && listCtx) {
          const prefix = listCtx.type === 'ol' ? `${listCtx.index}. ` : '- '
          const childTexts: string[] = []
          el.childNodes.forEach(child => {
            childTexts.push(child.textContent ?? '')
          })
          lines.push(prefix + childTexts.join('').trim())
          return
        }
        // Block elements get newlines
        if (tag && /^(p|div|h[1-6]|blockquote|pre|tr)$/.test(tag)) {
          el.childNodes.forEach(child => walk(child, listCtx))
          return
        }
        el.childNodes.forEach(child => walk(child, listCtx))
      }

      walk(fragment)
      if (lines.length > 0) {
        e.preventDefault()
        e.clipboardData?.setData('text/plain', lines.join('\n'))
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
              <CopyButton getText={() => ref.current?.textContent ?? ''} />
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
              <CopyButton getText={() => ref.current ? extractTableTSV(ref.current) : ''} />
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
