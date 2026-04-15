import type { AgentMode } from './types'
import { tabAgentTools, TAB_AGENT_SYSTEM_PROMPT } from './tabAgentTools'
import { automationAgentTools, AUTOMATION_SYSTEM_PROMPT } from './automationTools'
import { PAPER_AGENT_SYSTEM_PROMPT } from './paperAgentTools'

export interface AgentConfig {
  id: AgentMode
  name: string
  systemPrompt: string
  tools?: Record<string, any>
  maxSteps?: number
}

const GENERAL_SYSTEM_PROMPT = 'You are a helpful assistant. The user may provide page content or images for analysis. Help them understand and work with the content, referencing specific parts when relevant.'

export const AGENT_CONFIGS: Record<AgentMode, AgentConfig> = {
  'general': {
    id: 'general',
    name: 'General',
    systemPrompt: GENERAL_SYSTEM_PROMPT,
  },
  'tab-agent': {
    id: 'tab-agent',
    name: 'Tab Agent',
    systemPrompt: TAB_AGENT_SYSTEM_PROMPT,
    tools: tabAgentTools,
  },
  'automation': {
    id: 'automation',
    name: 'Automation',
    systemPrompt: AUTOMATION_SYSTEM_PROMPT,
    tools: automationAgentTools,
  },
  'paper': {
    id: 'paper',
    name: 'Paper',
    systemPrompt: PAPER_AGENT_SYSTEM_PROMPT,
    // tools: injected dynamically from MCP server at runtime
    maxSteps: 15,
  },
}
