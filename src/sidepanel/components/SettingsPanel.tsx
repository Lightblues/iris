import { useState, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Download, Upload, Plus, Trash2 } from 'lucide-react'
import type { SidePanelSettings, ModelConfig } from '@/lib/sidepanelSettings'
import { exportSettings, importSettings } from '@/lib/sidepanelSettings'

interface SettingsPanelProps {
  settings: SidePanelSettings
  onSettingsChange: (settings: Partial<SidePanelSettings>) => void
}

export function SettingsPanel({ settings, onSettingsChange }: SettingsPanelProps) {
  const [showAddModel, setShowAddModel] = useState(false)
  const [newModelName, setNewModelName] = useState('')
  const [newModelId, setNewModelId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleAddModel = () => {
    if (!newModelName.trim() || !newModelId.trim()) {
      setError('Both name and ID are required')
      return
    }

    const newModel: ModelConfig = {
      id: newModelId.trim(),
      name: newModelName.trim(),
    }

    onSettingsChange({
      models: [...settings.models, newModel],
    })

    setShowAddModel(false)
    setNewModelName('')
    setNewModelId('')
    setError(null)
  }

  const handleDeleteModel = (modelId: string) => {
    const updatedModels = settings.models.filter((m) => m.id !== modelId)

    // If deleting the selected model, switch to first available
    const updates: Partial<SidePanelSettings> = { models: updatedModels }
    if (settings.model === modelId && updatedModels.length > 0) {
      updates.model = updatedModels[0].id
    }

    onSettingsChange(updates)
  }

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
        setError(null)
      } else {
        setError(result.error)
      }
    }
    reader.readAsText(file)

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="border-b p-3 bg-muted/30 space-y-3">
      {error && (
        <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
          {error}
        </div>
      )}

      <div className="space-y-1">
        <label className="text-xs font-medium">API Key</label>
        <Input
          type="password"
          value={settings.apiKey}
          onChange={(e) => onSettingsChange({ apiKey: e.target.value })}
          placeholder="sk-or-... or sk-..."
          className="h-8 text-sm"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium">Base URL</label>
        <Input
          type="text"
          value={settings.baseUrl}
          onChange={(e) => onSettingsChange({ baseUrl: e.target.value })}
          placeholder="https://openrouter.ai/api/v1"
          className="h-8 text-sm font-mono"
        />
        <p className="text-xs text-muted-foreground">OpenRouter, OpenAI, or any compatible API</p>
      </div>

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

      <div className="pt-2 border-t space-y-3">
        <h3 className="text-sm font-semibold">Generation</h3>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium">Temperature</label>
            <span className="text-xs text-muted-foreground font-mono">
              {settings.temperature ?? 'default'}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={settings.temperature ?? 1}
            onChange={(e) => {
              const val = parseFloat(e.target.value)
              onSettingsChange({ temperature: val === 1 ? undefined : val })
            }}
            className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Precise (0)</span>
            <span>Creative (2)</span>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium">Max Output Tokens (Optional)</label>
          <Input
            type="number"
            min="1"
            max="200000"
            value={settings.maxOutputTokens || ''}
            onChange={(e) => {
              const val = e.target.value ? parseInt(e.target.value, 10) : undefined
              onSettingsChange({ maxOutputTokens: val })
            }}
            placeholder="default (model limit)"
            className="h-8 text-sm font-mono"
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium">Agent Max Steps</label>
            <span className="text-xs text-muted-foreground font-mono">
              {settings.maxSteps ?? 20}
            </span>
          </div>
          <Input
            type="number"
            min="1"
            max="50"
            value={settings.maxSteps ?? 20}
            onChange={(e) => {
              const val = e.target.value ? parseInt(e.target.value, 10) : undefined
              onSettingsChange({ maxSteps: val })
            }}
            className="h-8 text-sm font-mono"
          />
          <p className="text-xs text-muted-foreground">Max tool-calling iterations per reply</p>
        </div>
      </div>

      {/* Content Script / FAB Section */}
      <div className="pt-2 border-t space-y-3">
        <h3 className="text-sm font-semibold">Content Script</h3>

        <div className="space-y-1">
          <label className="text-xs font-medium">FAB Site Patterns</label>
          <textarea
            value={(settings.fabSitePatterns || []).join('\n')}
            onChange={(e) => {
              const lines = e.target.value.split('\n').map(l => l.trim()).filter(Boolean)
              onSettingsChange({ fabSitePatterns: lines.length > 0 ? lines : undefined })
            }}
            placeholder={`Empty = show on all sites\n*://github.com/*\n*://*.sspai.com/*`}
            rows={3}
            className="w-full text-xs font-mono bg-background border rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground">
            Glob patterns (one per line). <code className="bg-muted px-1 rounded">*</code> matches any characters. Empty = all sites.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            await chrome.storage.local.remove('iris_floating_fab_hidden')
            setError(null)
          }}
          className="h-7 text-xs"
        >
          Reset FAB Hidden State
        </Button>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium">Models</label>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAddModel(true)}
            className="h-6 px-2 text-xs"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add
          </Button>
        </div>
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {settings.models.map((model) => (
            <div key={model.id} className="flex items-center gap-2 bg-background p-1.5 rounded text-xs">
              <span className="flex-1 truncate">{model.name}</span>
              <span className="text-muted-foreground font-mono text-[10px] truncate max-w-[100px]">
                {model.id}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDeleteModel(model.id)}
                className="h-5 w-5 p-0"
                title="Delete model"
              >
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium">Selected Model</label>
        <Select value={settings.model} onValueChange={(model) => onSettingsChange({ model })}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {settings.models.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Settings Export/Import */}
      <div className="flex gap-2 pt-2 border-t">
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          className="h-7 text-xs flex-1"
        >
          <Download className="h-3 w-3 mr-1" />
          Export Settings
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          className="h-7 text-xs flex-1"
        >
          <Upload className="h-3 w-3 mr-1" />
          Import Settings
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          onChange={handleImport}
          className="hidden"
        />
      </div>

      <Dialog open={showAddModel} onOpenChange={setShowAddModel}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Custom Model</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Model Name</label>
              <Input
                type="text"
                value={newModelName}
                onChange={(e) => setNewModelName(e.target.value)}
                placeholder="GPT-4, Claude 3 Opus, etc."
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Model ID</label>
              <Input
                type="text"
                value={newModelId}
                onChange={(e) => setNewModelId(e.target.value)}
                placeholder="gpt-4, claude-3-opus, etc."
                className="h-8 text-sm font-mono"
              />
              <p className="text-xs text-muted-foreground">
                The exact model identifier used by your API
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setShowAddModel(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAddModel}>
              Add Model
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
