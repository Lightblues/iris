import { useState, useCallback, useRef, useEffect, memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { domToMarkdown, extractCodeMarkdown, extractTableMarkdown } from '@/lib/selectionMarkdown'

const REMARK_PLUGINS = [remarkGfm, remarkMath]
const REHYPE_PLUGINS = [rehypeKatex]

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

interface MarkdownContentProps {
  content: string
}

function MarkdownPre({ children }: { children?: React.ReactNode }) {
  const ref = useRef<HTMLPreElement>(null)
  return (
    <div className="relative group/copy">
      <CopyButton getText={() => ref.current ? extractCodeMarkdown(ref.current) : ''} />
      <pre ref={ref} className="bg-background/50 rounded p-2 overflow-x-auto text-[11px] leading-snug">
        {children}
      </pre>
    </div>
  )
}

function MarkdownTable({ children }: { children?: React.ReactNode }) {
  const ref = useRef<HTMLTableElement>(null)
  return (
    <div className="relative group/copy overflow-x-auto">
      <CopyButton getText={() => ref.current ? extractTableMarkdown(ref.current) : ''} />
      <table ref={ref} className="border-collapse border border-muted-foreground/30 text-xs">
        {children}
      </table>
    </div>
  )
}

const markdownComponents = {
  pre: MarkdownPre,
  code: ({ className, children, ...props }: { className?: string; children?: React.ReactNode }) => {
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
  p: ({ children }: { children?: React.ReactNode }) => <p className="mb-1.5 last:mb-0 leading-snug">{children}</p>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="list-disc pl-4 mb-1.5 space-y-0.5">{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol className="list-decimal pl-4 mb-1.5 space-y-0.5">{children}</ol>,
  li: ({ children }: { children?: React.ReactNode }) => <li className="leading-snug">{children}</li>,
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
      {children}
    </a>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 border-muted-foreground/30 pl-3 italic">
      {children}
    </blockquote>
  ),
  table: MarkdownTable,
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="border border-muted-foreground/30 px-2 py-1 bg-muted/50">
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="border border-muted-foreground/30 px-2 py-1">
      {children}
    </td>
  ),
}

export const MarkdownContent = memo(function MarkdownContent({ content }: MarkdownContentProps) {
  const containerRef = useRef<HTMLDivElement>(null)

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
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
})
