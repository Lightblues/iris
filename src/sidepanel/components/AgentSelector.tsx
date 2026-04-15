import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { AgentMode } from '@/lib/types'
import { AGENT_CONFIGS } from '@/lib/agentConfigs'

export type { AgentMode }

interface AgentSelectorProps {
  value: AgentMode
  onChange: (mode: AgentMode) => void
}

const AGENTS = Object.values(AGENT_CONFIGS).map(c => ({ value: c.id, label: c.name }))

export function AgentSelector({ value, onChange }: AgentSelectorProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-7 w-[120px] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {AGENTS.map(agent => (
          <SelectItem key={agent.value} value={agent.value} className="text-xs">
            {agent.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
