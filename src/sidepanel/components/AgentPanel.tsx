import { useState, useEffect, useRef, useCallback } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'
import { ChatHeader } from './ChatHeader'
import { useAgentTransport, useAgentChat } from '@/agent/useAgentChat'
import { updateConversation } from '@/agent/history'
import type { IrisMessage, AgentMode, Conversation } from '@/agent/types'
import type { SidePanelSettings, ModelConfig } from '@/lib/sidepanelSettings'
import type { ChatImageAttachment, SlashCommand } from '@/lib/types'
import { createConversation } from '@/agent/history'
import { useThrottledValue } from '../useThrottledValue'

function imageAttachments(message: IrisMessage): ChatImageAttachment[] | undefined {
  const images: ChatImageAttachment[] = []
  for (const part of message.parts) {
    if (part.type !== 'file' || !part.mediaType.startsWith('image/')) continue
    const comma = part.url.indexOf(',')
    const payload = comma >= 0 ? part.url.slice(comma + 1) : part.url
    images.push({
      id: `${message.id}-file-${images.length}`,
      data: part.url,
      mimeType: part.mediaType,
      size: Math.floor(payload.length * 0.75),
    })
  }
  return images.length > 0 ? images : undefined
}

export interface AgentPanelProps {
  tabId: number
  memberTabIds: number[]
  autoFocus?: boolean
  agentMode: AgentMode
  settings: SidePanelSettings
  availableModels: ModelConfig[]
  chatModel: string | null
  onChatModelChange: (model: string | null) => void
  conversation: Conversation | null
  onConversationCreated: (conv: Conversation) => void
  onNewChat: () => void
  slashCommands: SlashCommand[]
  onOpenSettings: () => void
}

/**
 * Outer shell: creates transport async, renders loading state inline,
 * then mounts AgentPanelReady once transport is available.
 *
 * Keyed by session in the parent so each session gets a fresh mount.
 */
export function AgentPanel(props: AgentPanelProps) {
  const {
    tabId, memberTabIds, autoFocus, agentMode, settings, chatModel, onChatModelChange,
    conversation, onConversationCreated, onNewChat,
    slashCommands, onOpenSettings,
  } = props

  const [error, setError] = useState<string | null>(null)
  const pendingRef = useRef<{ content: string; images?: any[] } | null>(null)

  const tabRef = useRef(tabId)
  tabRef.current = tabId

  const { transport, mcpStatus } = useAgentTransport({
    settings,
    chatModel,
    conversationId: conversation?.id,
    tabRef,
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
          autoFocus={autoFocus}
        />
      </>
    )
  }

  return (
    <AgentPanelReady
      transport={transport}
      tabId={tabId}
      memberTabIds={memberTabIds}
      autoFocus={autoFocus}
      agentMode={agentMode}
      settings={settings}
      availableModels={props.availableModels}
      chatModel={chatModel}
      onChatModelChange={onChatModelChange}
      conversation={conversation}
      onConversationCreated={onConversationCreated}
      onNewChat={onNewChat}
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
    transport, tabId, memberTabIds, autoFocus, agentMode, settings, chatModel, onChatModelChange,
    conversation, onConversationCreated, onNewChat,
    slashCommands, onOpenSettings, mcpStatus, pendingMessage,
  } = props

  const [error, setError] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const scrollViewportRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)
  const programmaticScrollRef = useRef(false)
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
  const displayMessages = useThrottledValue(messages, isLoading, 16)
  const memberKey = memberTabIds.join(',')
  const seenMembersRef = useRef<number[]>([])
  const injectTargetsRef = useRef(new Set<number>())

  useEffect(() => {
    let cancelled = false
    const restored = (conversation?.messages?.length ?? 0) > 0
    const prev = seenMembersRef.current
    const added = memberTabIds.filter(id => !prev.includes(id))
    seenMembersRef.current = memberTabIds
    // Restored history: keep the stored prefix. Only inject tabs that join later.
    const targets = restored && prev.length === 0 ? [] : (prev.length === 0 ? memberTabIds : added)
    for (const id of targets) injectTargetsRef.current.add(id)

    const injectMembers = async () => {
      for (const id of targets) {
        if (cancelled) return
        const ok = await injectContext({ silent: true, tabId: id, card: true })
        if (ok) injectTargetsRef.current.delete(id)
      }
      if (cancelled || flushedRef.current || !pendingMessage) return
      flushedRef.current = true
      sendMessage(pendingMessage.content, pendingMessage.images).catch(() => {})
    }
    void injectMembers()

    const onUpdated = (id: number, info: { status?: string; url?: string }) => {
      if (!injectTargetsRef.current.has(id)) return
      if (info.status !== 'complete' && info.url == null) return
      void injectContext({ silent: true, tabId: id, card: true }).then(ok => {
        if (ok) injectTargetsRef.current.delete(id)
      })
    }
    chrome.tabs.onUpdated.addListener(onUpdated)
    return () => {
      cancelled = true
      chrome.tabs.onUpdated.removeListener(onUpdated)
    }
  }, [memberKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const isAtBottom = useCallback(() => {
    if (!scrollViewportRef.current) return true
    const { scrollTop, scrollHeight, clientHeight } = scrollViewportRef.current
    return scrollHeight - scrollTop - clientHeight < 80
  }, [])

  const scrollToBottom = useCallback(() => {
    const el = scrollViewportRef.current
    if (!el || !stickToBottomRef.current) return
    programmaticScrollRef.current = true
    el.scrollTop = el.scrollHeight
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { programmaticScrollRef.current = false })
    })
  }, [])

  useEffect(() => {
    const viewport = scrollViewportRef.current
    if (!viewport) return
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) stickToBottomRef.current = false
      else stickToBottomRef.current = isAtBottom()
    }
    const onScroll = () => {
      if (programmaticScrollRef.current) return
      stickToBottomRef.current = isAtBottom()
    }
    viewport.addEventListener('wheel', onWheel, { passive: true })
    viewport.addEventListener('touchmove', onScroll, { passive: true })
    viewport.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      viewport.removeEventListener('wheel', onWheel)
      viewport.removeEventListener('touchmove', onScroll)
      viewport.removeEventListener('scroll', onScroll)
    }
  }, [isAtBottom])

  useEffect(() => { scrollToBottom() }, [displayMessages, scrollToBottom])

  useEffect(() => {
    if (!conversation?.id || messages.length === 0) return
    if (!isLoading) {
      updateConversation(conversation.id, messages as IrisMessage[]).catch(err => {
        console.error('[Iris] Failed to save conversation', err)
      })
      return
    }
    const t = setTimeout(() => {
      updateConversation(conversation.id, messages as IrisMessage[]).catch(err => {
        console.error('[Iris] Failed to save conversation', err)
      })
    }, 400)
    return () => clearTimeout(t)
  }, [messages, conversation?.id, isLoading])

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
    const content = userMsg.parts
      .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
      .map(p => p.text)
      .join('')
    const images = imageAttachments(userMsg)
    if (!content.trim() && !images) return
    // Truncate to just before the user message, then resend
    setMessages(messages.slice(0, userMsgIdx) as IrisMessage[])
    setTimeout(() => sendMessage(content, images), 0)
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
    stickToBottomRef.current = true
    scrollToBottom()
    await sendMessage(content, attachedImages)
  }, [settings.apiKey, sendMessage, onOpenSettings, clearError, scrollToBottom])

  const handleClearEditingContent = useCallback(() => { setEditingContent('') }, [])

  const displayError = error || (chatError?.message ?? null)

  return (
    <>
      <ChatHeader
        onNewChat={onNewChat}
        newChatTitle={memberTabIds.length > 1 ? 'New chat (unlinks this tab)' : 'New Chat'}
        messages={displayMessages as IrisMessage[]}
        models={props.availableModels}
        favourites={settings.favouriteModels ?? []}
        defaultModel={settings.model}
        chatModel={chatModel}
        onChatModelChange={onChatModelChange}
        mcpStatus={mcpStatus}
      />
      {memberTabIds.length > 1 && (
        <LinkedTabsBar tabIds={memberTabIds} currentTabId={tabId} />
      )}

      <ScrollArea className="flex-1 px-3 py-2" viewportRef={scrollViewportRef}>
        <div className="space-y-3">
          {displayMessages.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              <p className="text-xs">Start a conversation</p>
              <p className="text-[11px] mt-1">Page content loads automatically. Type / for commands.</p>
            </div>
          )}
          {displayMessages.map((message: IrisMessage) => (
            <ChatMessage
              key={message.id}
              message={message}
              isStreaming={
                isLoading &&
                message.role === 'assistant' &&
                message === displayMessages[displayMessages.length - 1]
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
        autoFocus={autoFocus}
      />
    </>
  )
}

function LinkedTabsBar({ tabIds, currentTabId }: { tabIds: number[]; currentTabId: number }) {
  const [titles, setTitles] = useState<Record<number, string>>({})

  useEffect(() => {
    let cancelled = false
    void Promise.all(tabIds.map(async id => {
      try {
        const tab = await chrome.tabs.get(id)
        return [id, tab.title || tab.url || `#${id}`] as const
      } catch {
        return [id, `#${id}`] as const
      }
    })).then(entries => {
      if (cancelled) return
      setTitles(Object.fromEntries(entries))
    })
    return () => { cancelled = true }
  }, [tabIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex items-center gap-1.5 px-3 py-1 border-b bg-muted/20 text-[10px] text-muted-foreground overflow-x-auto">
      <span className="shrink-0">Linked</span>
      {tabIds.map(id => (
        <span
          key={id}
          className={id === currentTabId ? 'truncate max-w-[140px] text-foreground' : 'truncate max-w-[140px]'}
          title={titles[id]}
        >
          {titles[id] || `Tab ${id}`}
        </span>
      ))}
    </div>
  )
}
