import type { SidePanelSettings } from '@/lib/sidepanelSettings'
import { SubHeader } from './shared'

interface Props {
  settings: SidePanelSettings
  onSettingsChange: (settings: Partial<SidePanelSettings>) => void
}

export function PageTocSection({ settings, onSettingsChange }: Props) {
  return (
    <div className="space-y-3">
      <SubHeader title="Page outline" />
      <div className="space-y-1">
        <label className="text-xs font-medium">Hide on (Blocklist)</label>
        <textarea
          value={(settings.tocSitePatterns || []).join('\n')}
          onChange={(e) => {
            const lines = e.target.value.split('\n').map(l => l.trim()).filter(Boolean)
            onSettingsChange({ tocSitePatterns: lines.length > 0 ? lines : undefined })
          }}
          placeholder="*://*.wikipedia.org/*"
          rows={3}
          className="w-full text-xs font-mono bg-background border rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <p className="text-xs text-muted-foreground">
          The outline rail shows at the right edge of long pages with headings, and on ChatGPT, DeepSeek and Gemini lists your prompts.
          Hover it or press Cmd+Shift+K to open it. Matching URLs (one glob per line) get no rail; the shortcut still works there.
        </p>
      </div>
    </div>
  )
}
