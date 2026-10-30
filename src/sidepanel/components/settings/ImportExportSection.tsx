import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Download, Upload } from 'lucide-react'
import type { SidePanelSettings } from '@/lib/sidepanelSettings'
import { exportSettings, importSettings } from '@/lib/sidepanelSettings'
import { SectionHeader } from './shared'

interface Props {
  settings: SidePanelSettings
  onSettingsChange: (settings: Partial<SidePanelSettings>) => void
  onError: (message: string | null) => void
}

export function ImportExportSection({ settings, onSettingsChange, onError }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  // --- Import/Export ---
  const handleExport = () => {
    const json = exportSettings(settings)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `iris-settings-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      const result = importSettings(content)
      if (result.success) {
        onSettingsChange(result.settings)
        onError(null)
      } else {
        onError(result.error)
      }
    }
    reader.readAsText(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <section className="space-y-3">
      <SectionHeader title="Import / Export" />
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handleExport} className="h-7 text-xs flex-1">
          <Download className="h-3 w-3 mr-1" /> Export Settings
        </Button>
        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="h-7 text-xs flex-1">
          <Upload className="h-3 w-3 mr-1" /> Import Settings
        </Button>
        <input ref={fileInputRef} type="file" accept="application/json" onChange={handleImport} className="hidden" />
      </div>
    </section>
  )
}
