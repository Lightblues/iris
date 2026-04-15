import { ToolLoopAgent, stepCountIs } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import type { AgentMode } from '@/lib/types'
import type { SidePanelSettings } from '@/lib/sidepanelSettings'
import { AGENT_CONFIGS } from '@/lib/agentConfigs'
import { connectMcp, getMcpTools } from '@/lib/mcpClient'
import { recordEvent } from '@/lib/tracing'
import { isTelemetryEnabled } from '@/lib/telemetry'

export interface CreateAgentParams {
  mode: AgentMode
  settings: SidePanelSettings
  model?: string          // per-chat override
  conversationId?: string // for tracing
}

// Shared ref for passing providerMetadata from agent onStepFinish to transport messageMetadata
export interface ProviderMetadataRef {
  current: any
}

export async function createIrisAgent(params: CreateAgentParams, providerMetadataRef?: ProviderMetadataRef) {
  const { mode, settings } = params
  const config = AGENT_CONFIGS[mode]
  const modelId = params.model ?? settings.model
  console.log('[createIrisAgent]', mode, modelId)

  const provider = createOpenAI({
    apiKey: settings.apiKey,
    baseURL: settings.baseUrl || 'https://openrouter.ai/api/v1',
    headers: {
      'HTTP-Referer': typeof chrome !== 'undefined' ? chrome.runtime.getURL('/') : '',
      'X-Title': 'Iris',
    },
  })

  // Paper agent: connect MCP + get tools; others: static tools from config
  let tools = config.tools ?? {}
  if (mode === 'paper') {
    const endpoint = settings.mcpEndpoint || 'http://localhost:8000/mcp'
    console.log('[createIrisAgent] Connecting MCP:', endpoint)
    await connectMcp(endpoint)
    tools = await getMcpTools()
    console.log('[createIrisAgent] MCP tools:', Object.keys(tools))
  }

  const maxSteps = settings.maxSteps ?? config.maxSteps ?? 20

  const agent = new ToolLoopAgent({
    id: `iris-${mode}`,
    model: provider.chat(modelId),
    instructions: config.systemPrompt,
    tools,
    stopWhen: stepCountIs(maxSteps),
    temperature: settings.temperature,
    maxOutputTokens: settings.maxOutputTokens,
    experimental_telemetry: { isEnabled: isTelemetryEnabled() },
    onStepFinish({ providerMetadata }) {
      // Capture providerMetadata (carries OpenRouter cost) for transport's messageMetadata
      if (providerMetadataRef && providerMetadata) {
        providerMetadataRef.current = providerMetadata
      }
    },
    experimental_onToolCallFinish({ toolCall, durationMs, success, output }) {
      const toolArgs = 'args' in toolCall ? toolCall.args : (toolCall as any).input
      recordEvent({
        type: 'chat_tool_call',
        data: {
          conversationId: params.conversationId,
          toolName: toolCall.toolName,
          toolArgs,
          toolResult: success ? output : undefined,
          durationMs,
          success,
        },
      }).catch(() => {})
    },
  })
  console.log('[createIrisAgent] Agent created:', agent.id)
  return agent
}
