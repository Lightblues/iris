import type { AgentConfig } from './types'
import { tabAgentTools } from '@/lib/tabAgentTools'
import { automationAgentTools } from '@/lib/automationTools'
import { skillTools } from './skillTools'
import { skillsCatalogPrompt } from './skills'

/** One agent. Skills are a catalog plus load_skill; tab, automation, and MCP tools stay callable. */
export const irisAgent: AgentConfig = {
  id: 'general',
  name: 'Iris',
  systemPrompt: skillsCatalogPrompt(),
  browserTools: {
    ...skillTools,
    ...tabAgentTools,
    ...automationAgentTools,
  },
  mcpEnabled: true,
}
