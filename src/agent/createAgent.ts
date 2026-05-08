import { ToolLoopAgent, stepCountIs } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import type { AgentConfig } from './types'
import type { SidePanelSettings } from '@/lib/sidepanelSettings'
import { connectMcp } from './mcp'
import { recordEvent } from '@/lib/tracing'
import { isTelemetryEnabled } from '@/lib/telemetryState'

export interface ProviderMetadataRef {
  current: any
}

export interface CreateAgentResult {
  agent: InstanceType<typeof ToolLoopAgent>
  providerMetadataRef: ProviderMetadataRef
}

export async function createAgent(
  config: AgentConfig,
  settings: SidePanelSettings,
  modelOverride?: string,
  conversationId?: string,
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

  // Merge: browserTools (static) + mcpTools (dynamic)
  let tools: Record<string, any> = { ...(config.browserTools ?? {}) }
  if (config.mcpEnabled) {
    const endpoint = settings.mcpEndpoint || 'http://localhost:8765/mcp'
    const mcpTools = await connectMcp(endpoint)
    tools = { ...tools, ...mcpTools }
  }

  const maxSteps = settings.maxSteps ?? config.maxSteps ?? 20

  const agent = new ToolLoopAgent({
    id: `iris-${config.id}`,
    model: provider.chat(modelId),
    instructions: config.systemPrompt,
    tools,
    stopWhen: stepCountIs(maxSteps),
    temperature: settings.temperature,
    maxOutputTokens: settings.maxOutputTokens,
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
  return { agent, providerMetadataRef }
}
