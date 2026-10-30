import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, RefreshCw, Star, Loader2 } from 'lucide-react'
import type { ModelConfig, SidePanelSettings } from '@/lib/sidepanelSettings'
import { maskApiKey } from '@/lib/sidepanelSettings'
import { fetchModels, clearModelCache } from '@/lib/modelRegistry'
import { SectionHeader } from './shared'

interface Props {
  settings: SidePanelSettings
  onSettingsChange: (settings: Partial<SidePanelSettings>) => void
}

export function ModelSection({ settings, onSettingsChange }: Props) {
  const [availableModels, setAvailableModels] = useState<ModelConfig[]>([])
  const [modelsFetching, setModelsFetching] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [modelsQuery, setModelsQuery] = useState('')
  const [apiKeyFocused, setApiKeyFocused] = useState(false)

  // --- Model handlers ---
  const handleFetchModels = async () => {
    setModelsFetching(true)
    setModelsError(null)
    try {
      const models = await fetchModels(
        settings.baseUrl || 'https://openrouter.ai/api/v1',
        settings.apiKey,
        { force: true },
      )
      setAvailableModels(models)
    } catch (err: any) {
      setModelsError(err.message || 'Failed to fetch models')
    } finally {
      setModelsFetching(false)
    }
  }

  const handleToggleFavourite = (modelId: string) => {
    const favs = settings.favouriteModels ?? []
    const isFav = favs.includes(modelId)
    const updated = isFav
      ? favs.filter(id => id !== modelId)
      : [...favs, modelId]
    onSettingsChange({ favouriteModels: updated })
  }

  const handleAddCustomModel = () => {
    const id = modelsQuery.trim()
    if (!id) return
    // Add to favourites directly
    const favs = settings.favouriteModels ?? []
    if (!favs.includes(id)) {
      onSettingsChange({ favouriteModels: [...favs, id] })
    }
    // Also add to available models for display
    if (!availableModels.find(m => m.id === id)) {
      setAvailableModels(prev => [...prev, { id, name: id }])
    }
    setModelsQuery('')
  }

  return (
    <section className="space-y-3">
      <SectionHeader title="Model" />

      <div className="space-y-1">
        <label className="text-xs font-medium">Base URL</label>
        <div className="flex gap-1.5">
          <Input
            type="text"
            value={settings.baseUrl}
            onChange={(e) => { onSettingsChange({ baseUrl: e.target.value }); clearModelCache() }}
            placeholder="https://openrouter.ai/api/v1"
            className="h-8 text-sm font-mono flex-1"
          />
          <Button
            variant="outline" size="sm"
            onClick={handleFetchModels}
            disabled={modelsFetching}
            className="h-8 px-2 text-xs shrink-0"
            title="Fetch available models from provider"
          >
            {modelsFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          OpenRouter, OpenAI, or any compatible API
          {availableModels.length > 0 && <span className="ml-1 text-primary">· {availableModels.length} models available</span>}
        </p>
        {modelsError && <p className="text-xs text-destructive">{modelsError}</p>}
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium">API Key</label>
        {apiKeyFocused ? (
          <Input
            type="text"
            value={settings.apiKey}
            onChange={(e) => onSettingsChange({ apiKey: e.target.value })}
            onBlur={() => setApiKeyFocused(false)}
            autoFocus
            placeholder="sk-or-... or sk-..."
            className="h-8 text-sm font-mono"
          />
        ) : (
          <div
            onClick={() => setApiKeyFocused(true)}
            className="h-8 flex items-center px-3 text-sm font-mono bg-background border rounded cursor-text text-muted-foreground hover:border-ring transition-colors"
          >
            {settings.apiKey ? maskApiKey(settings.apiKey) : <span className="text-muted-foreground/50">sk-or-... or sk-...</span>}
          </div>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium">Default Model</label>
        <Select value={settings.model} onValueChange={(model) => onSettingsChange({ model })}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(settings.favouriteModels ?? []).map((id) => (
              <SelectItem key={id} value={id} className="text-xs font-mono">{id}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Shows favourited models. Override per-chat in chat header.</p>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium">Models</label>
          {availableModels.length === 0 && (
            <Button variant="ghost" size="sm" onClick={handleFetchModels} disabled={modelsFetching} className="h-6 px-2 text-xs">
              {modelsFetching ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
              Fetch
            </Button>
          )}
        </div>

        {/* Search / add custom */}
        <div className="flex gap-1.5">
          <Input
            type="text"
            value={modelsQuery}
            onChange={(e) => setModelsQuery(e.target.value)}
            placeholder="Filter or type custom model ID..."
            className="h-7 text-xs font-mono flex-1"
          />
          {modelsQuery.trim() && !availableModels.find(m => m.id === modelsQuery.trim()) && (
            <Button variant="outline" size="sm" onClick={handleAddCustomModel} className="h-7 px-2 text-xs shrink-0">
              <Plus className="h-3 w-3 mr-1" /> Add
            </Button>
          )}
        </div>

        {/* Model list */}
        <div className="space-y-0.5 max-h-48 overflow-y-auto">
          {(() => {
            const favs = new Set(settings.favouriteModels ?? [])
            const q = modelsQuery.toLowerCase()

            // Build display list: favourites first (even if not in available), then available
            const favModels = (settings.favouriteModels ?? [])
              .filter(id => !q || id.toLowerCase().includes(q))
              .map(id => ({ id, isFav: true, inList: !!availableModels.find(m => m.id === id) }))

            const restModels = availableModels
              .filter(m => !favs.has(m.id) && (!q || m.id.toLowerCase().includes(q)))
              .map(m => ({ id: m.id, isFav: false, inList: true }))

            const allModels = [...favModels, ...restModels]

            if (allModels.length === 0) {
              return (
                <div className="text-xs text-muted-foreground py-2 text-center">
                  {availableModels.length === 0
                    ? 'Click Fetch to load models from your provider'
                    : 'No matches'}
                </div>
              )
            }

            return allModels.map(({ id, isFav }) => (
              <div key={id} className="flex items-center gap-1.5 bg-background p-1 rounded text-xs group">
                <button
                  onClick={() => handleToggleFavourite(id)}
                  className="shrink-0 p-0.5 rounded hover:bg-accent transition-colors"
                  title={isFav ? 'Remove from favourites' : 'Add to favourites'}
                >
                  <Star className={`h-3 w-3 ${isFav ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground/30 hover:text-muted-foreground'}`} />
                </button>
                <span className={`flex-1 font-mono text-[11px] truncate ${isFav ? '' : 'text-muted-foreground'}`}>
                  {id}
                </span>
                {id === settings.model && (
                  <span className="text-[10px] text-primary shrink-0">default</span>
                )}
              </div>
            ))
          })()}
        </div>
      </div>

      <details className="group">
        <summary className="text-xs font-medium cursor-pointer select-none text-muted-foreground hover:text-foreground">Advanced: temperature, max output tokens, max steps</summary>
        <div className="space-y-3 pt-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium">Temperature</label>
              <span className="text-xs text-muted-foreground font-mono">{settings.temperature ?? 'default'}</span>
            </div>
            <input
              type="range" min="0" max="2" step="0.1"
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
              type="number" min="1" max="200000"
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
              <span className="text-xs text-muted-foreground font-mono">{settings.maxSteps ?? 20}</span>
            </div>
            <Input
              type="number" min="1" max="50"
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
      </details>
    </section>
  )
}
