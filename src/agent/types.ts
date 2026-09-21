import type { UIMessage } from 'ai'

// -- Agent config --

export type AgentMode = 'general' | 'tab-agent' | 'automation' | 'paper'

export interface AgentConfig {
  id: AgentMode
  name: string
  systemPrompt: string
  browserTools?: Record<string, any>  // Chrome API tools (tab, automation)
  mcpEnabled?: boolean                // Connect to ea-tools MCP server
  maxSteps?: number
}

// -- Message metadata --

export interface MessageUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cost?: number   // USD — from OpenRouter providerMetadata or local estimate
  model?: string
}

export interface IrisMessageMetadata {
  timestamp: number
  tabId?: number
  pageUrl?: string
  pageTitle?: string
  contextType?: 'page' | 'selection'
  usage?: MessageUsage
  estimatedTokens?: number
}

export type IrisMessage = UIMessage<IrisMessageMetadata>
export type IrisMessagePart = IrisMessage['parts'][number]

// -- Conversation --

export interface Conversation {
  id: string
  title: string
  messages: IrisMessage[]
  agentMode: AgentMode
  model?: string
  createdAt: number
  lastUpdated: number
}

export interface ConversationStore {
  conversations: Conversation[]
  activeConversationId: string | null
}
