import type { AgentConfig, AgentMode } from './types'
import { tabAgentTools, TAB_AGENT_SYSTEM_PROMPT } from '@/lib/tabAgentTools'
import { automationAgentTools, AUTOMATION_SYSTEM_PROMPT } from '@/lib/automationTools'
import { PAPER_AGENT_SYSTEM_PROMPT } from '@/lib/paperAgentTools'

const GENERAL_SYSTEM_PROMPT = 'You are a helpful assistant. The user may provide page content or images for analysis. Help them understand and work with the content, referencing specific parts when relevant.'

export const AGENT_REGISTRY: Record<AgentMode, AgentConfig> = {
  general: {
    id: 'general',
    name: 'General',
    systemPrompt: GENERAL_SYSTEM_PROMPT,
  },
  'tab-agent': {
    id: 'tab-agent',
    name: 'Tab Agent',
    systemPrompt: TAB_AGENT_SYSTEM_PROMPT,
    browserTools: tabAgentTools,
  },
  automation: {
    id: 'automation',
    name: 'Automation',
    systemPrompt: AUTOMATION_SYSTEM_PROMPT,
    browserTools: automationAgentTools,
  },
  paper: {
    id: 'paper',
    name: 'Paper',
    systemPrompt: PAPER_AGENT_SYSTEM_PROMPT,
    mcpEnabled: true,
    maxSteps: 15,
  },
}
