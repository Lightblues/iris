import { DirectChatTransport, type Agent } from 'ai'
import type { IrisMessageMetadata } from '@/lib/types'
import type { ProviderMetadataRef } from './createAgent'
import { estimateCost } from '@/lib/tokenUtils'

export function createIrisTransport(
  agent: Agent<any, any, any>,
  activeModel: string,
  providerMetadataRef: ProviderMetadataRef,
) {
  return new DirectChatTransport({
    agent,
    messageMetadata({ part }) {
      if (part.type === 'start') {
        return { timestamp: Date.now() } as IrisMessageMetadata
      }
      if (part.type === 'finish') {
        const u = part.totalUsage
        // providerMetadata captured by agent's onStepFinish → shared ref
        const pm = providerMetadataRef.current as any
        const orUsage = pm?.openrouter?.usage ?? pm?.openai?.usage
        const cost = orUsage?.cost ?? estimateCost(activeModel, u?.inputTokens ?? 0, u?.outputTokens ?? 0)
        const meta: IrisMessageMetadata = {
          timestamp: Date.now(),
          usage: {
            inputTokens: u?.inputTokens ?? 0,
            outputTokens: u?.outputTokens ?? 0,
            totalTokens: (u?.inputTokens ?? 0) + (u?.outputTokens ?? 0),
            cost: cost ?? undefined,
            model: activeModel,
          },
        }
        providerMetadataRef.current = undefined
        return meta
      }
      return undefined
    },
  })
}
