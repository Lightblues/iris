/**
 * Combined agent chat hook.
 *
 * Handles async agent/transport creation and exposes a stable sendMessage
 * that queues input when transport is not yet ready (fixing the race condition
 * where messages were lost during agent initialization).
 *
 * Usage: AgentPanel renders two phases via agentReady flag.
 * Phase 1 (loading): sendMessage queues to pendingRef.
 * Phase 2 (ready): AgentPanelReady mounts with useChat + guaranteed transport.
 */
import { useChat } from '@ai-sdk/react'
import { useState, useEffect, useCallback, useRef } from 'react'
import type { DirectChatTransport } from 'ai'
import type { IrisMessage, IrisMessageMetadata, AgentMode, Conversation } from './types'
import type { SidePanelSettings } from '@/lib/sidepanelSettings'
import type { SlashCommand } from '@/lib/types'
import { AGENT_REGISTRY } from './registry'
import { createAgent, type ProviderMetadataRef } from './createAgent'
import { createTransport } from './transport'
import { createConversation } from './history'
import { recordEvent } from '@/lib/tracing'
import { parseSlashInput, findCommand, expandCommand, createDefaultContextFetcher } from '@/lib/slashCommands'
import { extractArxivId } from '@/content/enhancements/arxiv'
import { getPageContext, getSelectionContext } from '@/lib/context'
import { estimateTokens } from '@/lib/tokenUtils'
import { getMcpStatus, disconnectMcp, type McpStatus } from './mcp'

// -- Transport creation hook --

export function useAgentTransport(options: {
  agentMode: AgentMode
  settings: SidePanelSettings
  chatModel: string | null
  conversationId?: string
  onError: (msg: string) => void
}) {
  const { agentMode, settings, chatModel, onError } = options
  const activeModel = chatModel ?? settings.model
  const config = AGENT_REGISTRY[agentMode]
  const providerMetadataRef = useRef<any>(undefined) as ProviderMetadataRef

  const [transport, setTransport] = useState<DirectChatTransport | null>(null)
  const [agentReady, setAgentReady] = useState(false)
  const [mcpStatus, setMcpStatus] = useState<McpStatus>(config.mcpEnabled ? 'connecting' : 'disconnected')

  useEffect(() => {
    let cancelled = false
    console.log('[Agent] Creating agent...', agentMode, activeModel)

    createAgent(config, settings, activeModel, options.conversationId)
      .then(result => {
        if (cancelled) return
        console.log('[Agent] Agent created, setting up transport')
        setTransport(createTransport(result.agent, activeModel, result.providerMetadataRef))
        setAgentReady(true)
        if (config.mcpEnabled) setMcpStatus(getMcpStatus())
      })
      .catch(err => {
        console.error('[Agent] Agent creation failed:', err)
        if (!cancelled) {
          onError(`Failed to create agent: ${err.message}`)
          if (config.mcpEnabled) setMcpStatus('error')
        }
      })

    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { transport, agentReady, mcpStatus, providerMetadataRef }
}

// -- Chat hook (requires ready transport) --

export interface UseAgentChatOptions {
  agentMode: AgentMode
  settings: SidePanelSettings
  chatModel: string | null
  conversation: Conversation | null
  slashCommands: SlashCommand[]
  onConversationCreated: (conv: Conversation) => void
  onError: (msg: string) => void
}

export function useAgentChat(
  transport: DirectChatTransport,
  options: UseAgentChatOptions,
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
    if (!settings.apiKey) { onError('Please enter your API key'); return }

    // Slash command expansion
    let processedContent = content.trim()
    if (content.startsWith('/')) {
      const parsed = parseSlashInput(content)
      if (parsed) {
        const command = findCommand(slashCommands, parsed.name, parsed.namespace)
        if (command) {
          try {
            processedContent = await expandCommand(command, parsed.args, createDefaultContextFetcher())
          } catch { onError('Failed to expand slash command'); return }
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

    // Lazy conversation creation
    let conv = conversationRef.current
    if (!conv) {
      conv = await createConversation(agentMode)
      conversationRef.current = conv
      onConversationCreated(conv)
    }

    // Tracing
    recordEvent({
      type: 'chat_message',
      data: {
        conversationId: conv.id,
        role: 'user',
        content: processedContent,
        hasImages: !!attachedImages?.length,
      },
    }).catch(() => {})

    // Build file parts
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

  // Context injection
  const injectContext = useCallback(async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      const existing = chat.messages.find(
        (m: IrisMessage) => m.metadata?.contextType === 'page' && m.metadata?.pageUrl === tab?.url,
      )
      if (existing) { onError('Page content already loaded'); return }
      const context = await getPageContext()
      if (!context) { onError('Could not extract page content'); return }
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
    } catch { onError('Failed to load page content') }
  }, [chat, onError])

  const injectSelection = useCallback(async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      const context = await getSelectionContext()
      if (!context) { onError('No text selected'); return }
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
    } catch { onError('Failed to load selected text') }
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

export { disconnectMcp }
