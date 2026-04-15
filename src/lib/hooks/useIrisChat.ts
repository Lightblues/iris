import { useChat } from '@ai-sdk/react'
import { useState, useEffect, useCallback, useRef } from 'react'
import type { IrisMessage, IrisMessageMetadata, AgentMode, SlashCommand, Conversation } from '@/lib/types'
import type { SidePanelSettings } from '@/lib/sidepanelSettings'
import { createIrisAgent, type ProviderMetadataRef } from '@/lib/agents/createAgent'
import { createIrisTransport } from '@/lib/agents/createTransport'
import { createConversation } from '@/lib/chatHistory'
import { recordEvent } from '@/lib/tracing'
import { parseSlashInput, findCommand, expandCommand, createDefaultContextFetcher } from '@/lib/slashCommands'
import { extractArxivId } from '@/content/enhancements/arxiv'
import { getPageContext, getSelectionContext } from '@/lib/context'
import { estimateTokens } from '@/lib/tokenUtils'
import type { DirectChatTransport } from 'ai'

export interface UseIrisChatOptions {
  agentMode: AgentMode
  settings: SidePanelSettings
  chatModel: string | null
  conversation: Conversation | null
  slashCommands: SlashCommand[]
  onConversationCreated: (conv: Conversation) => void
  onError: (msg: string) => void
}

/**
 * Async transport creation hook.
 * Returns { transport, error } — transport is null until agent is ready.
 * ChatPanel is keyed by agentMode+conversationId so this only mounts once per session.
 */
export function useIrisTransport(options: {
  agentMode: AgentMode
  settings: SidePanelSettings
  chatModel: string | null
  conversationId?: string
  onError: (msg: string) => void
}) {
  const { agentMode, settings, chatModel, onError } = options
  const activeModel = chatModel ?? settings.model
  const providerMetadataRef = useRef<any>(undefined) as ProviderMetadataRef
  const [transport, setTransport] = useState<DirectChatTransport | null>(null)

  useEffect(() => {
    let cancelled = false
    console.log('[Iris] Creating agent...', agentMode, activeModel)
    createIrisAgent(
      { mode: agentMode, settings, model: activeModel, conversationId: options.conversationId },
      providerMetadataRef,
    )
      .then(agent => {
        if (cancelled) return
        console.log('[Iris] Agent created, setting up transport')
        setTransport(createIrisTransport(agent, activeModel, providerMetadataRef))
      })
      .catch(err => {
        console.error('[Iris] Agent creation failed:', err)
        if (!cancelled) onError(`Failed to create agent: ${err.message}`)
      })

    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { transport, providerMetadataRef }
}

/**
 * Chat hook — MUST only be called with a ready (non-null) transport.
 * This is enforced by ChatPanel rendering ChatPanelReady only after transport is available.
 */
export function useIrisChat(
  transport: DirectChatTransport,
  options: UseIrisChatOptions,
) {
  const { agentMode, settings, chatModel, conversation, slashCommands, onConversationCreated, onError } = options
  const activeModel = chatModel ?? settings.model
  const conversationRef = useRef(conversation)
  conversationRef.current = conversation

  const chat = useChat<IrisMessage>({
    transport: transport as any,
    messages: conversation?.messages,
    onFinish({ message, isAbort }) {
      if (isAbort) return
      const conv = conversationRef.current
      const meta = (message as IrisMessage).metadata
      recordEvent({
        type: 'chat_message',
        data: {
          conversationId: conv?.id,
          role: 'assistant',
          model: activeModel,
          inputTokens: meta?.usage?.inputTokens,
          outputTokens: meta?.usage?.outputTokens,
          cost: meta?.usage?.cost,
        },
      }).catch(() => {})
    },
    onError(error) {
      onError(error.message || 'Failed to get response')
    },
  })

  const sendMessage = useCallback(async (
    content: string,
    attachedImages?: { id: string; data: string; mimeType: string; size: number }[],
  ) => {
    if (!content.trim() && !attachedImages?.length) return
    if (!settings.apiKey) {
      onError('Please enter your API key')
      return
    }

    // Slash command expansion
    let processedContent = content.trim()
    if (content.startsWith('/')) {
      const parsed = parseSlashInput(content)
      if (parsed) {
        const command = findCommand(slashCommands, parsed.name, parsed.namespace)
        if (command) {
          try {
            processedContent = await expandCommand(command, parsed.args, createDefaultContextFetcher())
          } catch {
            onError('Failed to expand slash command')
            return
          }
        }
      }
    }

    // Paper Agent: auto-inject arXiv context on first message
    if (agentMode === 'paper' && chat.messages.length === 0) {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        if (tab?.url) {
          const arxivId = extractArxivId(tab.url)
          if (arxivId) {
            processedContent = `[Context: arXiv paper ${arxivId.base} — ${tab.url}]\n\n${processedContent}`
          }
        }
      } catch { /* ignore */ }
    }

    // Create conversation if none exists
    let conv = conversationRef.current
    if (!conv) {
      conv = await createConversation(undefined, agentMode)
      conversationRef.current = conv
      onConversationCreated(conv)
    }

    // Tracing: user message
    recordEvent({
      type: 'chat_message',
      data: {
        conversationId: conv.id,
        role: 'user',
        content: processedContent,
        hasImages: !!attachedImages?.length,
      },
    }).catch(() => {})

    // Build file parts for images
    const files = attachedImages?.map(img => ({
      type: 'file' as const,
      mediaType: img.mimeType,
      url: img.data,
    }))

    await chat.sendMessage({
      text: processedContent,
      ...(files?.length ? { files } : {}),
      metadata: { timestamp: Date.now() } as IrisMessageMetadata,
    } as any)
  }, [settings.apiKey, slashCommands, agentMode, chat, onConversationCreated, onError, activeModel])

  const injectContext = useCallback(async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      const existing = chat.messages.find(
        (m: IrisMessage) => m.metadata?.contextType === 'page' && m.metadata?.pageUrl === tab?.url,
      )
      if (existing) {
        onError('Page content already loaded in this conversation')
        return
      }
      const context = await getPageContext()
      if (!context) {
        onError('Could not extract page content')
        return
      }
      const msg: IrisMessage = {
        id: Date.now().toString(),
        role: 'user',
        metadata: {
          timestamp: Date.now(),
          pageUrl: tab?.url,
          pageTitle: tab?.title,
          contextType: 'page',
          estimatedTokens: estimateTokens(context),
        },
        parts: [{ type: 'text', text: `[Page content from "${tab?.title || 'a page'}"]\n\n${context}` }],
      }
      chat.setMessages((prev: IrisMessage[]) => [...prev, msg])
    } catch {
      onError('Failed to load page content')
    }
  }, [chat, onError])

  const injectSelection = useCallback(async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      const context = await getSelectionContext()
      if (!context) {
        onError('No text selected on the page')
        return
      }
      const msg: IrisMessage = {
        id: Date.now().toString(),
        role: 'user',
        metadata: {
          timestamp: Date.now(),
          pageUrl: tab?.url,
          pageTitle: tab?.title,
          contextType: 'selection',
          estimatedTokens: estimateTokens(context),
        },
        parts: [{ type: 'text', text: `[Selected text from "${tab?.title || 'a page'}"]\n\n${context}` }],
      }
      chat.setMessages((prev: IrisMessage[]) => [...prev, msg])
    } catch {
      onError('Failed to load selected text')
    }
  }, [chat, onError])

  return {
    messages: chat.messages as IrisMessage[],
    status: chat.status,
    error: chat.error,
    sendMessage,
    stop: chat.stop,
    setMessages: chat.setMessages as (msgs: IrisMessage[] | ((msgs: IrisMessage[]) => IrisMessage[])) => void,
    clearError: chat.clearError,
    injectContext,
    injectSelection,
  }
}
