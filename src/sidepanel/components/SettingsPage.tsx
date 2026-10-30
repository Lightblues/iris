import { useState } from 'react'
import type { SidePanelSettings } from '@/lib/sidepanelSettings'
import { SectionHeader } from './settings/shared'
import { StatusStrip } from './settings/StatusStrip'
import { ModelSection } from './settings/ModelSection'
import { WebSearchSection } from './settings/WebSearchSection'
import { ThisBrowserSection } from './settings/ThisBrowserSection'
import { FabSection } from './settings/FabSection'
import { ChatExportSection } from './settings/ChatExportSection'
import { PhoenixField } from './settings/PhoenixField'
import { LocalRelaySection } from './settings/LocalRelaySection'
import { McpSection } from './settings/McpSection'
import { ImportExportSection } from './settings/ImportExportSection'

interface SettingsPageProps {
  settings: SidePanelSettings
  onSettingsChange: (settings: Partial<SidePanelSettings>) => void
}

export function SettingsPage({ settings, onSettingsChange }: SettingsPageProps) {
  const [error, setError] = useState<string | null>(null)
  const section = { settings, onSettingsChange }

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-4">
      <StatusStrip settings={settings} />
      {error && (
        <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
          {error}
        </div>
      )}

      <ModelSection {...section} />

      <section className="space-y-3">
        <SectionHeader title="Tools" />
        <WebSearchSection {...section} />
      </section>

      <ThisBrowserSection {...section} />

      <section className="space-y-4">
        <SectionHeader title="Pages" />
        <FabSection {...section} />
        <ChatExportSection onError={setError} />
      </section>

      <details className="group">
        <summary className="text-sm font-semibold pb-1 border-b cursor-pointer select-none">Developer</summary>
        <div className="space-y-4 pt-3">
          <PhoenixField {...section} />
          <LocalRelaySection {...section} />
          <McpSection {...section} />
          <ImportExportSection {...section} onError={setError} />
        </div>
      </details>
    </div>
  )
}
