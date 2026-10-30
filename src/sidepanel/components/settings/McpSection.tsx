import { Input } from '@/components/ui/input'
import type { SidePanelSettings } from '@/lib/sidepanelSettings'
import { NOT_SYNCED, SubHeader } from './shared'

interface Props {
  settings: SidePanelSettings
  onSettingsChange: (settings: Partial<SidePanelSettings>) => void
}

export function McpSection({ settings, onSettingsChange }: Props) {
  return (
    <div className="space-y-3">
      <SubHeader title="MCP endpoint" note={`${NOT_SYNCED} · unused for now`} />

      <div className="space-y-1">
        <label className="text-xs font-medium">Endpoint URL</label>
        <Input
          type="text"
          value={settings.mcpEndpoint || ''}
          onChange={(e) => onSettingsChange({ mcpEndpoint: e.target.value })}
          placeholder="http://localhost:8000/sse"
          className="h-8 text-sm font-mono"
        />
        <p className="text-xs text-muted-foreground">
          ea-tools MCP server SSE endpoint. Start with:{' '}
          <code className="bg-muted px-1 rounded">ea-tools serve --transport http -k arxiv -k sn_proxy</code>
        </p>
      </div>
    </div>
  )
}
