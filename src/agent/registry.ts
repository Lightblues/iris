import type { AgentConfig } from './types'
import { skillsCatalogPrompt } from './skills'

/** One agent. Tools are assembled in createAgent so they can close over the session tab. */
export const irisAgent: AgentConfig = {
  id: 'general',
  name: 'Iris',
  systemPrompt: skillsCatalogPrompt(),
  mcpEnabled: true,
}
