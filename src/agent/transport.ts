import { DirectChatTransport, type Agent, type DirectChatTransportOptions } from 'ai'
import type { IrisMessageMetadata } from './types'
import type { ProviderMetadataRef } from './createAgent'
import { estimateCost } from '@/lib/tokenUtils'
import { repairChatMessages } from './repairMessages'

type ToolsAgent = { tools?: Record<string, unknown> }

export class IrisChatTransport extends DirectChatTransport<any, any, any, any> {
  private readonly agentRef: ToolsAgent

  constructor(agentRef: ToolsAgent, options: DirectChatTransportOptions<any, any, any, any>) {
    super(options)
    this.agentRef = agentRef
  }

  knownTools(): Set<string> {
    return new Set(Object.keys(this.agentRef.tools ?? {}))
  }

  override async sendMessages(
    options: Parameters<DirectChatTransport<any, any, any, any>['sendMessages']>[0],
  ) {
    return super.sendMessages({
      ...options,
      messages: repairChatMessages(options.messages, this.knownTools()),
    })
  }
}

export function createTransport(
  agent: Agent<any, any, any>,
  activeModel: string,
  providerMetadataRef: ProviderMetadataRef,
): IrisChatTransport {
  return new IrisChatTransport(agent, {
    agent,
    messageMetadata({ part }) {
      if (part.type === 'start') {
        return { timestamp: Date.now() } as IrisMessageMetadata
      }
      if (part.type === 'finish') {
        const u = part.totalUsage
        const pm = providerMetadataRef.current as any
        const orUsage = pm?.openrouter?.usage ?? pm?.openai?.usage
        const cost = orUsage?.cost ?? estimateCost(activeModel, u?.inputTokens ?? 0, u?.outputTokens ?? 0)
        providerMetadataRef.current = undefined
        return {
          timestamp: Date.now(),
          usage: {
            inputTokens: u?.inputTokens ?? 0,
            outputTokens: u?.outputTokens ?? 0,
            totalTokens: (u?.inputTokens ?? 0) + (u?.outputTokens ?? 0),
            cost: cost ?? undefined,
            model: activeModel,
          },
        } as IrisMessageMetadata
      }
      return undefined
    },
  })
}
