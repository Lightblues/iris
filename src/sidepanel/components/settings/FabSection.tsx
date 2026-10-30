import type { SidePanelSettings } from '@/lib/sidepanelSettings'
import { SectionHeader } from './shared'

interface Props {
  settings: SidePanelSettings
  onSettingsChange: (settings: Partial<SidePanelSettings>) => void
}

export function FabSection({ settings, onSettingsChange }: Props) {
  return (
    <section className="space-y-3">
      <SectionHeader title="Content Script" />
      <div className="space-y-1">
        <label className="text-xs font-medium">FAB Hidden Patterns (Blocklist)</label>
        <textarea
          value={(settings.fabSitePatterns || []).join('\n')}
          onChange={(e) => {
            const lines = e.target.value.split('\n').map(l => l.trim()).filter(Boolean)
            onSettingsChange({ fabSitePatterns: lines.length > 0 ? lines : undefined })
          }}
          placeholder="*://github.com/*"
          rows={3}
          className="w-full text-xs font-mono bg-background border rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <p className="text-xs text-muted-foreground">
          Hide FAB on matching URLs (one glob per line). The button only appears on the built-in allowlist (papers, GitHub, DeepWiki, chat sites), and never because a userscript matches.
          The X button only hides FAB for the current page session.
        </p>
      </div>
    </section>
  )
}
