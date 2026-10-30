import { useState } from 'react'
import type { SidePanelSettings } from '@/lib/sidepanelSettings'
import { ModelSection } from './settings/ModelSection'
import { WebSearchSection } from './settings/WebSearchSection'
import { McpSection } from './settings/McpSection'
import { LocalRelaySection } from './settings/LocalRelaySection'
import { RemoteRelaySection } from './settings/RemoteRelaySection'
import { ChatExportSection } from './settings/ChatExportSection'
import { FabSection } from './settings/FabSection'
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
      {error && (
        <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
          {error}
        </div>
      )}
      <ModelSection {...section} />
      <WebSearchSection {...section} />
      <McpSection {...section} />
      <LocalRelaySection {...section} />
      <RemoteRelaySection {...section} />
      <ChatExportSection onError={setError} />
      <FabSection {...section} />
      <ImportExportSection {...section} onError={setError} />
    </div>
  )
}
