import { useState, useEffect, useRef, useCallback } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'
import { ChatHeader } from './ChatHeader'
import { useIrisTransport, useIrisChat } from '@/lib/hooks/useIrisChat'
import { createConversation, updateConversation } from '@/lib/chatHistory'
import type { IrisMessage, AgentMode, Conversation, SlashCommand } from '@/lib/types'
import type { SidePanelSettings } from '@/lib/sidepanelSettings'

export interface ChatPanelProps {
  agentMode: AgentMode
  settings: SidePanelSettings
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
 * Outer shell: creates transport asynchronously, shows loading state,
 * then renders ChatPanelReady once transport is available.
 *
 * Keyed by agentMode+conversationId in parent so each session gets a fresh mount.
 */
export function ChatPanel(props: ChatPanelProps) {
  const {
    agentMode, settings, chatModel, onChatModelChange,
    conversation, onConversationCreated, onNewChat, onAgentModeChange,
    slashCommands, onOpenSettings,
  } = props

  const [error, setError] = useState<string | null>(null)

  const { transport } = useIrisTransport({
    agentMode,
    settings,
    chatModel,
    conversationId: conversation?.id,
    onError: setError,
  })

  // Transport not ready — show loading shell
  if (!transport) {
    return (
      <>
        <ChatHeader
          onNewChat={onNewChat}
          agentMode={agentMode}
          onAgentModeChange={onAgentModeChange}
          messages={[]}
          models={settings.models}
          defaultModel={settings.model}
          chatModel={chatModel}
          onChatModelChange={onChatModelChange}
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground py-8">
            <p className="text-sm">Initializing agent...</p>
            {agentMode === 'paper' && (
              <p className="text-xs mt-2">Connecting to MCP server...</p>
            )}
          </div>
        </div>
        {error && (
          <div className="px-4 py-2 bg-destructive/10 text-destructive text-sm">{error}</div>
        )}
        <ChatInput
          onSend={async () => {}}
          onStop={() => {}}
          isLoading={false}
          disabled={true}
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

  // Transport ready — render the full chat UI
  return (
    <ChatPanelReady
      transport={transport}
      agentMode={agentMode}
      settings={settings}
      chatModel={chatModel}
      onChatModelChange={onChatModelChange}
      conversation={conversation}
      onConversationCreated={onConversationCreated}
      onNewChat={onNewChat}
      onAgentModeChange={onAgentModeChange}
      slashCommands={slashCommands}
      onOpenSettings={onOpenSettings}
    />
  )
}

/**
 * Inner component: only mounts when transport is ready.
 * Calls useIrisChat (which calls useChat) with a guaranteed non-null transport.
 */
function ChatPanelReady(props: ChatPanelProps & { transport: import('ai').DirectChatTransport }) {
  const {
    transport, agentMode, settings, chatModel, onChatModelChange,
    conversation, onConversationCreated, onNewChat, onAgentModeChange,
    slashCommands, onOpenSettings,
  } = props

  const [error, setError] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const scrollViewportRef = useRef<HTMLDivElement>(null)
  const userScrolledUpRef = useRef(false)

  const {
    messages, status, error: chatError,
    sendMessage, stop, setMessages, clearError,
    injectContext, injectSelection,
  } = useIrisChat(transport, {
    agentMode,
    settings,
    chatModel,
    conversation,
    slashCommands,
    onConversationCreated,
    onError: setError,
  })

  const isLoading = status === 'streaming' || status === 'submitted'

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

  // Monitor scroll position
  useEffect(() => {
    const viewport = scrollViewportRef.current
    if (!viewport) return
    const handleScroll = () => { userScrolledUpRef.current = !isAtBottom() }
    viewport.addEventListener('scroll', handleScroll, { passive: true })
    return () => viewport.removeEventListener('scroll', handleScroll)
  }, [isAtBottom])

  // Auto-scroll on message change
  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  // Reset scroll lock on new generation
  useEffect(() => {
    if (isLoading) userScrolledUpRef.current = false
  }, [isLoading])

  // Persist messages to storage on change
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
    const newConv = await createConversation(undefined, agentMode)
    await updateConversation(newConv.id, forkedMessages as IrisMessage[])
    onConversationCreated(newConv)
    setMessages(forkedMessages as IrisMessage[])
    setError(null)
  }, [messages, setMessages, onConversationCreated, agentMode])

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

  const handleClearEditingContent = useCallback(() => {
    setEditingContent('')
  }, [])

  const displayError = error || (chatError?.message ?? null)

  return (
    <>
      <ChatHeader
        onNewChat={onNewChat}
        agentMode={agentMode}
        onAgentModeChange={onAgentModeChange}
        messages={messages as IrisMessage[]}
        models={settings.models}
        defaultModel={settings.model}
        chatModel={chatModel}
        onChatModelChange={onChatModelChange}
      />

      <ScrollArea className="flex-1 p-4" viewportRef={scrollViewportRef}>
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              <p className="text-sm">Start a conversation</p>
              <p className="text-xs mt-2">
                Click 📄 to inject page content at any time
              </p>
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
        onInjectContext={injectContext}
        onInjectSelection={injectSelection}
        defaultValue={editingContent}
        onDefaultValueConsumed={handleClearEditingContent}
        slashCommands={slashCommands}
      />
    </>
  )
}
