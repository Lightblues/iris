import { useState, lazy, Suspense } from 'react'
import { cn } from '@/lib/utils'
import { FileText, Scissors, ChevronDown, ChevronUp, X, Pencil, GitFork, StickyNote, Copy, Check, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { IrisMessage } from '@/lib/types'
import { createEntry } from '@/lib/knowledge'
import { ToolCallDisplay, type ToolPartProps } from './ToolCallDisplay'
import { formatTokenCount, formatCost } from '@/lib/tokenUtils'

// Lazy load the heavy markdown component
const MarkdownContent = lazy(() =>
  import('./MarkdownContent').then((m) => ({ default: m.MarkdownContent }))
)

interface ChatMessageProps {
  message: IrisMessage
  isStreaming?: boolean
  onDelete?: (id: string) => void
  onEdit?: (id: string, content: string) => void
  onFork?: (id: string) => void
  onRerun?: (id: string) => void
  conversationId?: string
  pageUrl?: string
  pageTitle?: string
}

function MarkdownFallback() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-3 bg-muted-foreground/20 rounded w-3/4" />
      <div className="h-3 bg-muted-foreground/20 rounded w-1/2" />
    </div>
  )
}

// Helper: extract all text from message parts
function getMessageText(msg: IrisMessage): string {
  return msg.parts
    .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
    .map(p => p.text)
    .join('')
}

// Helper: check if a part is a tool part (static 'tool-{name}' or dynamic 'dynamic-tool')
function isToolPart(part: any): part is ToolPartProps {
  if (typeof part.type !== 'string' || !('toolCallId' in part)) return false
  return part.type.startsWith('tool-') || part.type === 'dynamic-tool'
}

export function ChatMessage({
  message,
  isStreaming,
  onDelete,
  onEdit,
  onFork,
  onRerun,
  conversationId,
  pageUrl,
  pageTitle,
}: ChatMessageProps) {
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  const messageText = getMessageText(message)
  const isContext = !!message.metadata?.contextType

  const handleSaveContextAsNote = async () => {
    if (!message.metadata?.pageUrl) return
    setSaving(true)
    try {
      await createEntry({
        type: message.metadata.contextType === 'page' ? 'page-snapshot' : 'highlight',
        content: messageText,
        sourceUrl: message.metadata.pageUrl,
        sourceTitle: message.metadata.pageTitle || 'Unknown',
      })
      setTimeout(() => setSaving(false), 500)
    } catch (err) {
      console.error('[Iris] Failed to save entry:', err)
      setSaving(false)
    }
  }

  const handleSaveAssistantAsNote = async () => {
    if (!messageText) return
    setSaving(true)
    try {
      await createEntry({
        type: 'chat-save',
        content: messageText,
        sourceUrl: pageUrl || window.location.href,
        sourceTitle: pageTitle || 'AI Response',
        conversationId,
      })
      setTimeout(() => setSaving(false), 500)
    } catch (err) {
      console.error('[Iris] Failed to save entry:', err)
      setSaving(false)
    }
  }

  const handleCopyAsMarkdown = async () => {
    if (!messageText) return
    await navigator.clipboard.writeText(messageText)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // Context message — user-role message with contextType metadata, distinct styling
  if (isContext) {
    const title = message.metadata?.pageTitle || 'Page Content'
    const truncatedTitle = title.length > 40 ? title.slice(0, 40) + '...' : title
    const contentPreview = messageText.slice(0, 200)
    const isSelection = message.metadata?.contextType === 'selection'
    const Icon = isSelection ? Scissors : FileText
    const iconColor = isSelection ? 'text-orange-500' : 'text-blue-500'
    const label = isSelection ? 'Selected text' : 'Loaded content'
    const estTokens = message.metadata?.estimatedTokens

    return (
      <div className="flex justify-center group">
        <div className="w-full max-w-[95%] border border-dashed border-muted-foreground/30 rounded-lg p-2 bg-muted/30 relative">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center gap-2 text-left text-xs text-muted-foreground hover:text-foreground pr-12"
          >
            <Icon className={cn('h-3.5 w-3.5 shrink-0', iconColor)} />
            <span className="flex-1 truncate">
              {label} from "<span className="font-medium">{truncatedTitle}</span>"
            </span>
            {estTokens != null && (
              <span className="shrink-0 text-[10px] text-muted-foreground/60">~{formatTokenCount(estTokens)} tokens</span>
            )}
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            )}
          </button>
          <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleSaveContextAsNote}
              disabled={saving}
              title="Save as note"
            >
              <StickyNote className={cn('h-3 w-3', saving && 'text-green-500')} />
            </Button>
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => onDelete(message.id)}
                title="Remove context"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
          {expanded && (
            <div className="mt-2 pt-2 border-t border-muted-foreground/20 text-xs text-muted-foreground max-h-40 overflow-y-auto">
              <pre className="whitespace-pre-wrap font-mono">{contentPreview}...</pre>
            </div>
          )}
        </div>
      </div>
    )
  }

  // User / Assistant message
  const isUser = message.role === 'user'

  // Collect file parts (images) from the message
  const fileParts = message.parts.filter(p => p.type === 'file') as Array<{ type: 'file'; mediaType: string; url: string }>

  return (
    <div
      className={cn('flex group', isUser ? 'justify-end' : 'justify-start')}
    >
      <div className={cn('relative min-w-0', isUser ? 'max-w-[92%]' : 'max-w-[95%]')}>
        <div
          className={cn(
            'rounded-lg px-2.5 py-1.5 text-[13px] leading-snug',
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-foreground'
          )}
        >
          {/* Images (file parts) */}
          {fileParts.length > 0 && (
            <div className="mb-2 flex gap-2 flex-wrap">
              {fileParts.map((fp, idx) => (
                <img
                  key={idx}
                  src={fp.url}
                  alt="Attached"
                  className="max-w-xs max-h-48 rounded border border-border/50"
                />
              ))}
            </div>
          )}

          {isUser ? (
            <div className="whitespace-pre-wrap [overflow-wrap:anywhere]">
              {messageText || (isStreaming && <TypingIndicator />)}
            </div>
          ) : (
            <div className="space-y-1">
              {message.parts.length > 0 ? (
                message.parts.map((part, idx) => {
                  if (part.type === 'text' && 'text' in part) {
                    return (
                      <div key={`text-${idx}`} className="prose prose-sm dark:prose-invert max-w-none [overflow-wrap:anywhere] prose-p:my-1 prose-p:leading-snug prose-headings:my-1.5 prose-headings:leading-tight prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-li:leading-snug prose-pre:my-1.5 prose-code:text-[12px] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:text-[13px] [&_li]:text-[13px] [&_h1]:text-[15px] [&_h2]:text-[14px] [&_h3]:text-[13px]">
                        <Suspense fallback={<MarkdownFallback />}>
                          <MarkdownContent content={(part as any).text} />
                        </Suspense>
                      </div>
                    )
                  }
                  if (isToolPart(part)) {
                    return (
                      <ToolCallDisplay
                        key={`tool-${part.toolCallId}`}
                        part={part}
                      />
                    )
                  }
                  // step-start, reasoning, etc. — skip silently
                  return null
                })
              ) : (
                isStreaming && <TypingIndicator />
              )}
            </div>
          )}
          {isStreaming && messageText && (
            <span className="inline-block w-1 h-4 ml-0.5 bg-current animate-pulse" />
          )}
        </div>
        {/* Token usage footer for assistant messages */}
        {!isUser && !isStreaming && message.metadata?.usage && (
          <div className="flex items-center gap-2 mt-0.5 px-1 text-[10px] text-muted-foreground/50">
            <span title="Input tokens">↗{formatTokenCount(message.metadata.usage.inputTokens)}</span>
            <span title="Output tokens">↘{formatTokenCount(message.metadata.usage.outputTokens)}</span>
            {message.metadata.usage.cost != null && (
              <span title="Estimated cost">{formatCost(message.metadata.usage.cost)}</span>
            )}
          </div>
        )}
        {/* Action buttons — inside bubble, CSS-only hover */}
        {!isStreaming && (
          <div
            className={cn(
              'absolute top-1 right-1 flex gap-0.5 rounded bg-background/80 backdrop-blur-sm',
              'opacity-0 group-hover:opacity-100 transition-opacity z-10'
            )}
          >
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleCopyAsMarkdown}
              title="Copy as Markdown"
            >
              {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
            </Button>
            {isUser && onEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => onEdit(message.id, messageText)}
                title="Edit message"
              >
                <Pencil className="h-3 w-3" />
              </Button>
            )}
            {onRerun && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => onRerun(message.id)}
                title="Rerun from here"
              >
                <RotateCcw className="h-3 w-3" />
              </Button>
            )}
            {!isUser && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleSaveAssistantAsNote}
                disabled={saving}
                title="Save as note"
              >
                <StickyNote className={cn('h-3 w-3', saving && 'text-green-500')} />
              </Button>
            )}
            {onFork && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => onFork(message.id)}
                title="Fork conversation from here"
              >
                <GitFork className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex space-x-1">
      <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
    </div>
  )
}
