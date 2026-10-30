import { Input } from '@/components/ui/input'
import type { SidePanelSettings } from '@/lib/sidepanelSettings'

interface Props {
  settings: SidePanelSettings
  onSettingsChange: (settings: Partial<SidePanelSettings>) => void
}

export function PhoenixField({ settings, onSettingsChange }: Props) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium">Phoenix Endpoint (Optional)</label>
      <Input
        type="text"
        value={settings.phoenixEndpoint || ''}
        onChange={(e) => onSettingsChange({ phoenixEndpoint: e.target.value })}
        placeholder="http://localhost:6006"
        className="h-8 text-sm font-mono"
      />
      <p className="text-xs text-muted-foreground">Arize Phoenix tracing endpoint for observability</p>
    </div>
  )
}
