import { ToolLoopAgent, stepCountIs } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import type { AgentConfig } from './types'
import type { SidePanelSettings } from '@/lib/sidepanelSettings'
import { skillTools } from './skillTools'
import { tabAgentTools } from '@/lib/tabAgentTools'
import { createAutomationAgentTools } from '@/lib/automationTools'
import { createPageTools, type TabRef } from '@/lib/pageTools'
import { createLoadTools, createScriptTools, createToolSession } from '@/lib/scriptTools'
import { recordEvent } from '@/lib/tracing'
import { isTelemetryEnabled } from '@/lib/telemetryState'

export interface ProviderMetadataRef {
  current: any
}

export interface CreateAgentResult {
  agent: InstanceType<typeof ToolLoopAgent>
  providerMetadataRef: ProviderMetadataRef
  mcpConnected: boolean
}

export async function createAgent(
  config: AgentConfig,
  settings: SidePanelSettings,
  modelOverride?: string,
  conversationId?: string,
  tabRef?: TabRef,
): Promise<CreateAgentResult> {
  const modelId = modelOverride ?? settings.model
  const providerMetadataRef: ProviderMetadataRef = { current: undefined }
  console.log('[Agent] Creating', config.id, modelId)

  const provider = createOpenAI({
    apiKey: settings.apiKey,
    baseURL: settings.baseUrl || 'https://openrouter.ai/api/v1',
    headers: {
      'HTTP-Referer': typeof chrome !== 'undefined' ? chrome.runtime.getURL('/') : '',
      'X-Title': 'Iris',
    },
  })

  const sessionTab: TabRef = tabRef ?? { current: 0 }
  const tools: Record<string, any> = {
    ...skillTools,
    ...tabAgentTools,
    ...createPageTools(sessionTab),
    ...createScriptTools(sessionTab),
    ...createAutomationAgentTools(() => sessionTab.current),
  }
  const session = createToolSession(tools)
  tools.load_tools = createLoadTools(session, sessionTab, settings.mcpEndpoint || 'http://localhost:8765/mcp')
  const mcpConnected = false
  const maxSteps = settings.maxSteps ?? config.maxSteps ?? 20

  const agent = new ToolLoopAgent({
      id: `iris-${config.id}`,
      model: provider.chat(modelId),
      instructions: config.systemPrompt,
      tools,
      stopWhen: stepCountIs(maxSteps),
      temperature: settings.temperature,
      maxOutputTokens: settings.maxOutputTokens,
      prepareStep: () => ({ activeTools: session.active() as any }),
      providerOptions: {
        openai: { reasoningEffort: 'high' },
      },
      experimental_telemetry: { isEnabled: isTelemetryEnabled() },
      onStepFinish({ providerMetadata }) {
        if (providerMetadata) providerMetadataRef.current = providerMetadata
      },
      experimental_onToolCallFinish({ toolCall, durationMs, success, output }) {
        const toolArgs = 'args' in toolCall ? toolCall.args : (toolCall as any).input
        recordEvent({
          type: 'chat_tool_call',
          data: {
            conversationId,
            toolName: toolCall.toolName,
            toolArgs,
            toolResult: success ? output : undefined,
            durationMs, success,
          },
        }).catch(() => {})
      },
    })

  console.log('[Agent] Created:', agent.id, 'tools:', Object.keys(tools))
  return { agent, providerMetadataRef, mcpConnected }
}
