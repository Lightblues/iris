import { Input } from '@/components/ui/input'
import type { SidePanelSettings } from '@/lib/sidepanelSettings'
import { SectionHeader } from './shared'

interface Props {
  settings: SidePanelSettings
  onSettingsChange: (settings: Partial<SidePanelSettings>) => void
}

export function WebSearchSection({ settings, onSettingsChange }: Props) {
  return (
    <section className="space-y-3">
      <SectionHeader title="Web Search" />

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
    </section>
  )
}
