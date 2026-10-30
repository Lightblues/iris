import { Input } from '@/components/ui/input'
import type { SidePanelSettings } from '@/lib/sidepanelSettings'
import { SubHeader } from './shared'

interface Props {
  settings: SidePanelSettings
  onSettingsChange: (settings: Partial<SidePanelSettings>) => void
}

export function WebSearchSection({ settings, onSettingsChange }: Props) {
  return (
    <div className="space-y-3">
      <SubHeader title="Web search (Exa)" />

      <div className="space-y-1">
        <label className="text-xs font-medium">Exa API Key</label>
        <Input
          type="password"
          value={settings.exaApiKey || ''}
          onChange={(e) => onSettingsChange({ exaApiKey: e.target.value })}
          placeholder="exa-..."
          autoComplete="off"
          className="h-8 text-sm font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Used by web_search.{' '}
          <a
            href="https://dashboard.exa.ai/api-keys"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Exa dashboard
          </a>
        </p>
      </div>
    </div>
  )
}
