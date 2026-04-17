import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { AgentSelector, type AgentMode } from './AgentSelector'
import { ModelCombobox } from './ModelCombobox'
import type { IrisMessage } from '@/lib/types'
import type { ModelConfig } from '@/lib/sidepanelSettings'
import type { McpStatus } from '@/lib/mcpClient'
import { getSessionUsage, formatModelShort, formatCost, formatTokenCount } from '@/lib/tokenUtils'

interface ChatHeaderProps {
  onNewChat: () => void
  agentMode: AgentMode
  onAgentModeChange: (mode: AgentMode) => void
  messages: IrisMessage[]
  models: ModelConfig[]
  favourites: string[]
  defaultModel: string
  chatModel: string | null
  onChatModelChange: (model: string | null) => void
  mcpStatus?: McpStatus
}

export function ChatHeader({
  onNewChat,
  agentMode,
  onAgentModeChange,
  messages,
  models,
  favourites,
  defaultModel,
  chatModel,
  onChatModelChange,
  mcpStatus,
}: ChatHeaderProps) {
  const usage = getSessionUsage(messages)
  const hasUsage = usage.totalCost != null || usage.totalInputTokens > 0
  const activeModel = chatModel ?? defaultModel

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 border-b bg-muted/30">
      <AgentSelector value={agentMode} onChange={onAgentModeChange} />

      {mcpStatus && mcpStatus !== 'disconnected' && (
        <div
          className={`w-2 h-2 rounded-full shrink-0 ${
            mcpStatus === 'connected' ? 'bg-green-500' :
            mcpStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' :
            mcpStatus === 'error' ? 'bg-red-500' : 'bg-gray-400'
          }`}
          title={`MCP: ${mcpStatus}`}
        />
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
        title="New Chat"
        className="h-7 w-7 ml-auto shrink-0"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  )
}
