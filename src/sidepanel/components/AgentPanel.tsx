import { useState, useEffect, useRef, useCallback } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'
import { ChatHeader } from './ChatHeader'
import { useAgentTransport, useAgentChat } from '@/agent/useAgentChat'
import { updateConversation } from '@/agent/history'
import type { IrisMessage, AgentMode, Conversation } from '@/agent/types'
import type { SidePanelSettings, ModelConfig } from '@/lib/sidepanelSettings'
import type { SlashCommand } from '@/lib/types'
import { createConversation } from '@/agent/history'

export interface AgentPanelProps {
  tabId: number
  agentMode: AgentMode
  settings: SidePanelSettings
  availableModels: ModelConfig[]
  chatModel: string | null
  onChatModelChange: (model: string | null) => void
  conversation: Conversation | null
  onConversationCreated: (conv: Conversation) => void
  onNewChat: () => void
  onAgentModeChange: (mode: AgentMode) => void
  slashCommands: SlashCommand[]
  onOpenSettings: () => void
}

/**
 * Outer shell: creates transport async, renders loading state inline,
 * then mounts AgentPanelReady once transport is available.
 *
 * Keyed by agentMode+conversationId in parent so each session gets a fresh mount.
 */
export function AgentPanel(props: AgentPanelProps) {
  const {
    tabId, agentMode, settings, chatModel, onChatModelChange,
    conversation, onConversationCreated, onNewChat, onAgentModeChange,
    slashCommands, onOpenSettings,
  } = props

  const [error, setError] = useState<string | null>(null)
  const pendingRef = useRef<{ content: string; images?: any[] } | null>(null)

  const { transport, mcpStatus } = useAgentTransport({
    agentMode,
    settings,
    chatModel,
    conversationId: conversation?.id,
    onError: setError,
  })

  // Before transport ready: queue one message
  const handlePendingSend = useCallback(async (
    content: string,
    images?: { id: string; data: string; mimeType: string; size: number }[],
  ) => {
    if (!settings.apiKey) {
      onOpenSettings()
      setError('Please enter your API key')
      return
    }
    pendingRef.current = { content, images }
  }, [settings.apiKey, onOpenSettings])

  if (!transport) {
    return (
      <>
        <ChatHeader
          onNewChat={onNewChat}
          agentMode={agentMode}
          onAgentModeChange={onAgentModeChange}
          messages={[]}
          models={props.availableModels}
          favourites={settings.favouriteModels ?? []}
          defaultModel={settings.model}
          chatModel={chatModel}
          onChatModelChange={onChatModelChange}
          mcpStatus={mcpStatus}
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground py-8">
            <p className="text-sm">Initializing agent...</p>
            {mcpStatus === 'connecting' && (
              <p className="text-xs mt-2">Connecting to MCP server...</p>
            )}
          </div>
        </div>
        {error && (
          <div className="px-4 py-2 bg-destructive/10 text-destructive text-sm">{error}</div>
        )}
        <ChatInput
          onSend={handlePendingSend}
          onStop={() => {}}
          isLoading={false}
          disabled={!settings.apiKey}
          usePageContext={true}
          onInjectContext={async () => {}}
          onInjectSelection={async () => {}}
          defaultValue=""
          onDefaultValueConsumed={() => {}}
          slashCommands={slashCommands}
        />
      </>
    )
  }

  return (
    <AgentPanelReady
      transport={transport}
      tabId={tabId}
      agentMode={agentMode}
      settings={settings}
      availableModels={props.availableModels}
      chatModel={chatModel}
      onChatModelChange={onChatModelChange}
      conversation={conversation}
      onConversationCreated={onConversationCreated}
      onNewChat={onNewChat}
      onAgentModeChange={onAgentModeChange}
      slashCommands={slashCommands}
      onOpenSettings={onOpenSettings}
      mcpStatus={mcpStatus}
      pendingMessage={pendingRef.current}
    />
  )
}

/**
 * Inner component: only mounts when transport is ready.
 * Calls useAgentChat (which calls useChat) with a guaranteed non-null transport.
 * Flushes any pending message queued during loading phase.
 */
function AgentPanelReady(props: AgentPanelProps & {
  transport: import('ai').DirectChatTransport
  mcpStatus: import('@/agent/mcp').McpStatus
  pendingMessage: { content: string; images?: any[] } | null
}) {
  const {
    transport, tabId, agentMode, settings, chatModel, onChatModelChange,
    conversation, onConversationCreated, onNewChat, onAgentModeChange,
    slashCommands, onOpenSettings, mcpStatus, pendingMessage,
  } = props

  const [error, setError] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const scrollViewportRef = useRef<HTMLDivElement>(null)
  const userScrolledUpRef = useRef(false)
  const flushedRef = useRef(false)

  const {
    messages, status, error: chatError,
    sendMessage, stop, setMessages, clearError,
    injectContext, injectSelection,
  } = useAgentChat(transport, {
    agentMode,
    settings,
    chatModel,
    conversation,
    slashCommands,
    tabId,
    onConversationCreated,
    onError: setError,
  })

  const isLoading = status === 'streaming' || status === 'submitted'

  // Auto-inject this tab's page, then flush any message queued before transport was ready.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const hasMessages = (conversation?.messages?.length ?? 0) > 0
      if (!hasMessages) await injectContext({ silent: true })
      if (cancelled || flushedRef.current || !pendingMessage) return
      flushedRef.current = true
      sendMessage(pendingMessage.content, pendingMessage.images).catch(() => {})
    })()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll helpers
  const isAtBottom = useCallback(() => {
    if (!scrollViewportRef.current) return true
    const { scrollTop, scrollHeight, clientHeight } = scrollViewportRef.current
    return scrollHeight - scrollTop - clientHeight < 50
  }, [])

  const scrollToBottom = useCallback(() => {
    if (scrollViewportRef.current && !userScrolledUpRef.current) {
      scrollViewportRef.current.scrollTop = scrollViewportRef.current.scrollHeight
    }
  }, [])

  useEffect(() => {
    const viewport = scrollViewportRef.current
    if (!viewport) return
    const handleScroll = () => { userScrolledUpRef.current = !isAtBottom() }
    viewport.addEventListener('scroll', handleScroll, { passive: true })
    return () => viewport.removeEventListener('scroll', handleScroll)
  }, [isAtBottom])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])
  useEffect(() => { if (isLoading) userScrolledUpRef.current = false }, [isLoading])

  // Persist messages
  useEffect(() => {
    if (conversation?.id && messages.length > 0) {
      updateConversation(conversation.id, messages as IrisMessage[]).catch(() => {})
    }
  }, [messages, conversation?.id])

  // Message actions
  const handleDeleteMessage = useCallback((id: string) => {
    setMessages((prev: IrisMessage[]) => prev.filter(m => m.id !== id))
  }, [setMessages])

  const handleEditMessage = useCallback((id: string, content: string) => {
    const idx = messages.findIndex((m: IrisMessage) => m.id === id)
    if (idx !== -1) {
      setMessages(messages.slice(0, idx) as IrisMessage[])
      setEditingContent(content)
    }
  }, [messages, setMessages])

  const handleForkMessage = useCallback(async (id: string) => {
    const idx = messages.findIndex((m: IrisMessage) => m.id === id)
    if (idx === -1) return
    const forkedMessages = messages.slice(0, idx + 1).map((m: IrisMessage) => ({
      ...m,
      id: `${m.id}-fork-${Date.now()}`,
    }))
    const newConv = await createConversation(agentMode)
    await updateConversation(newConv.id, forkedMessages as IrisMessage[])
    onConversationCreated(newConv)
    setMessages(forkedMessages as IrisMessage[])
    setError(null)
  }, [messages, setMessages, onConversationCreated, agentMode])

  const handleRerunFromMessage = useCallback((id: string) => {
    const idx = messages.findIndex((m: IrisMessage) => m.id === id)
    if (idx === -1) return
    // Find the last user message at or before this index
    let userMsgIdx = -1
    for (let i = idx; i >= 0; i--) {
      if (messages[i].role === 'user') { userMsgIdx = i; break }
    }
    if (userMsgIdx === -1) return
    const userMsg = messages[userMsgIdx]
    const textPart = userMsg.parts.find((p: any) => p.type === 'text')
    const content = textPart?.type === 'text' ? textPart.text : ''
    if (!content) return
    // Truncate to just before the user message, then resend
    setMessages(messages.slice(0, userMsgIdx) as IrisMessage[])
    setTimeout(() => sendMessage(content), 0)
  }, [messages, setMessages, sendMessage])

  const handleSendMessage = useCallback(async (
    content: string,
    attachedImages?: { id: string; data: string; mimeType: string; size: number }[],
  ) => {
    if (!settings.apiKey) {
      onOpenSettings()
      setError('Please enter your API key')
      return
    }
    setError(null)
    clearError()
    await sendMessage(content, attachedImages)
  }, [settings.apiKey, sendMessage, onOpenSettings, clearError])

  const handleClearEditingContent = useCallback(() => { setEditingContent('') }, [])

  const displayError = error || (chatError?.message ?? null)

  return (
    <>
      <ChatHeader
        onNewChat={onNewChat}
        agentMode={agentMode}
        onAgentModeChange={onAgentModeChange}
        messages={messages as IrisMessage[]}
        models={props.availableModels}
        favourites={settings.favouriteModels ?? []}
        defaultModel={settings.model}
        chatModel={chatModel}
        onChatModelChange={onChatModelChange}
        mcpStatus={mcpStatus}
      />

      <ScrollArea className="flex-1 px-3 py-2" viewportRef={scrollViewportRef}>
        <div className="space-y-3">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              <p className="text-xs">Start a conversation</p>
              <p className="text-[11px] mt-1">Page content loads automatically. Type / for commands.</p>
            </div>
          )}
          {messages.map((message: IrisMessage) => (
            <ChatMessage
              key={message.id}
              message={message}
              isStreaming={
                isLoading &&
                message.role === 'assistant' &&
                message === messages[messages.length - 1]
              }
              onDelete={handleDeleteMessage}
              onEdit={handleEditMessage}
              onFork={handleForkMessage}
              onRerun={handleRerunFromMessage}
              conversationId={conversation?.id}
            />
          ))}
        </div>
      </ScrollArea>

      {displayError && (
        <div className="px-4 py-2 bg-destructive/10 text-destructive text-sm">{displayError}</div>
      )}

      <ChatInput
        onSend={handleSendMessage}
        onStop={stop}
        isLoading={isLoading}
        disabled={!settings.apiKey}
        usePageContext={true}
        onInjectContext={() => { void injectContext() }}
        onInjectSelection={injectSelection}
        defaultValue={editingContent}
        onDefaultValueConsumed={handleClearEditingContent}
        slashCommands={slashCommands}
      />
    </>
  )
}
