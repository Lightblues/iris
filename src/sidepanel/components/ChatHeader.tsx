import { memo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Check, Plus } from 'lucide-react'
import { ModelCombobox } from './ModelCombobox'
import type { IrisMessage } from '@/lib/types'
import type { ModelConfig } from '@/lib/sidepanelSettings'
import { getSessionUsage, formatModelShort, formatCost, formatTokenCount } from '@/lib/tokenUtils'

interface ChatHeaderProps {
  onNewChat: () => void
  newChatTitle?: string
  messages: IrisMessage[]
  models: ModelConfig[]
  favourites: string[]
  defaultModel: string
  chatModel: string | null
  onChatModelChange: (model: string | null) => void
  conversationId?: string | null
}

export const ChatHeader = memo(function ChatHeader({
  onNewChat,
  newChatTitle = 'New Chat',
  messages,
  models,
  favourites,
  defaultModel,
  chatModel,
  onChatModelChange,
  conversationId,
}: ChatHeaderProps) {
  const [copied, setCopied] = useState(false)
  const usage = getSessionUsage(messages)
  const hasUsage = usage.totalCost != null || usage.totalInputTokens > 0
  const activeModel = chatModel ?? defaultModel

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 border-b bg-muted/30">

      {conversationId && (
        <button
          type="button"
          className="inline-flex items-center gap-1 min-w-0 max-w-[9.5rem] shrink cursor-pointer text-[10px] font-mono text-muted-foreground/70 hover:text-foreground"
          title={copied ? 'Copied' : 'Copy session id'}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            void navigator.clipboard.writeText(conversationId).then(() => {
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1200)
            })
          }}
        >
          <span className="truncate">{conversationId}</span>
          {copied && <Check className="h-3 w-3 shrink-0 text-green-500" />}
        </button>
      )}

      <ModelCombobox
        models={models}
        favourites={favourites}
        value={activeModel}
        onChange={(v) => onChatModelChange(v === defaultModel ? null : v)}
      />

      {hasUsage && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 ml-auto mr-1" title={`↗${formatTokenCount(usage.totalInputTokens)} in ↘${formatTokenCount(usage.totalOutputTokens)} out`}>
          {usage.model && <span>{formatModelShort(usage.model)}</span>}
          {usage.totalCost != null && <span>{formatCost(usage.totalCost)}</span>}
        </div>
      )}

      <Button
        variant="ghost"
        size="icon"
        onClick={onNewChat}
        title={newChatTitle}
        className="h-7 w-7 ml-auto shrink-0"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  )
})
