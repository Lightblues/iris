import { useState, useRef, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Download, Upload, Plus, Trash2, FolderOpen, RefreshCw, Terminal, HelpCircle, CloudUpload, Unlink, Star, Loader2 } from 'lucide-react'
import type { SidePanelSettings } from '@/lib/sidepanelSettings'
import { exportSettings, importSettings, maskApiKey } from '@/lib/sidepanelSettings'
import type { SlashCommand } from '@/lib/types'
import { loadAllCommands, saveUserCommands } from '@/lib/commandStorage'
import {
  requestDirectoryAccess,
  getSavedDirectoryHandle,
  verifyDirectoryPermission,
  importCommandsFromDirectory,
  clearDirectoryHandle,
  getVestaDirectoryHandle,
  requestVestaDirectoryAccess,
  clearVestaDirectoryHandle,
} from '@/lib/fileSystemAccess'
import { getCommandDisplayName } from '@/lib/slashCommands'
import { syncToVesta, getSyncState, type VestaSyncState } from '@/lib/vestaSync'
import { fetchModels, clearModelCache } from '@/lib/modelRegistry'
import type { ModelConfig } from '@/lib/sidepanelSettings'

interface SettingsPageProps {
  settings: SidePanelSettings
  onSettingsChange: (settings: Partial<SidePanelSettings>) => void
  onCommandsChanged?: () => void
}

function SectionHeader({ title }: { title: string }) {
  return <h3 className="text-sm font-semibold pb-1 mb-3 border-b">{title}</h3>
}

export function SettingsPage({ settings, onSettingsChange, onCommandsChanged }: SettingsPageProps) {
  const [availableModels, setAvailableModels] = useState<ModelConfig[]>([])
  const [modelsFetching, setModelsFetching] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [modelsQuery, setModelsQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [commandsError, setCommandsError] = useState<string | null>(null)
  const [commands, setCommands] = useState<SlashCommand[]>([])
  const [linkedDirName, setLinkedDirName] = useState<string | null>(null)
  const [isLoadingCommands, setIsLoadingCommands] = useState(false)
  const [selectedCommand, setSelectedCommand] = useState<SlashCommand | null>(null)
  const [showCommandPreview, setShowCommandPreview] = useState(false)
  const [showCommandsHelp, setShowCommandsHelp] = useState(false)
  const [vestaDirName, setVestaDirName] = useState<string | null>(null)
  const [vestaSyncState, setVestaSyncState] = useState<VestaSyncState | null>(null)
  const [vestaSyncing, setVestaSyncing] = useState(false)
  const [vestaSyncResult, setVestaSyncResult] = useState<string | null>(null)
  const [apiKeyFocused, setApiKeyFocused] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadAllCommands().then(setCommands)
    getSavedDirectoryHandle().then(handle => {
      if (handle) setLinkedDirName(handle.name)
    })
    getVestaDirectoryHandle().then(handle => {
      if (handle) setVestaDirName(handle.name)
    })
    getSyncState().then(setVestaSyncState)
  }, [])

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
        setError(null)
      } else {
        setError(result.error)
      }
    }
    reader.readAsText(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // --- Commands handlers ---
  const handleLinkDirectory = async () => {
    setCommandsError(null)
    setIsLoadingCommands(true)
    try {
      const handle = await requestDirectoryAccess()
      if (handle) {
        setLinkedDirName(handle.name)
        const imported = await importCommandsFromDirectory(handle)
        await saveUserCommands(imported)
        setCommands(await loadAllCommands())
        onCommandsChanged?.()
      }
    } catch (err: any) {
      setCommandsError(err.message || 'Failed to link directory')
    } finally {
      setIsLoadingCommands(false)
    }
  }

  const handleSyncCommands = async () => {
    setCommandsError(null)
    setIsLoadingCommands(true)
    try {
      const handle = await getSavedDirectoryHandle()
      if (!handle) {
        setCommandsError('No directory linked. Click "Link Folder" first.')
        return
      }
      const hasPermission = await verifyDirectoryPermission(handle)
      if (!hasPermission) {
        setCommandsError('Permission denied. Please re-link the directory.')
        setLinkedDirName(null)
        await clearDirectoryHandle()
        return
      }
      const imported = await importCommandsFromDirectory(handle)
      await saveUserCommands(imported)
      setCommands(await loadAllCommands())
      onCommandsChanged?.()
    } catch (err: any) {
      setCommandsError(err.message || 'Failed to sync commands')
    } finally {
      setIsLoadingCommands(false)
    }
  }

  const handleUnlinkDirectory = async () => {
    await clearDirectoryHandle()
    await saveUserCommands([])
    setLinkedDirName(null)
    setCommands(await loadAllCommands())
    onCommandsChanged?.()
  }

  // --- Vesta handlers ---
  const handleLinkVesta = async () => {
    try {
      const handle = await requestVestaDirectoryAccess()
      if (handle) setVestaDirName(handle.name)
    } catch (err: any) {
      setError(err.message || 'Failed to link Vesta directory')
    }
  }

  const handleUnlinkVesta = async () => {
    await clearVestaDirectoryHandle()
    setVestaDirName(null)
  }

  const handleVestaSync = async () => {
    setVestaSyncing(true)
    setVestaSyncResult(null)
    try {
      const result = await syncToVesta()
      setVestaSyncResult(`Synced ${result.eventsSynced} events, ${result.entriesSynced} entries, ${result.conversationsSynced} conversations`)
      setVestaSyncState(await getSyncState())
    } catch (err: any) {
      setVestaSyncResult(`Error: ${err.message}`)
      setVestaSyncState(await getSyncState())
    } finally {
      setVestaSyncing(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-4">
      {error && (
        <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
          {error}
        </div>
      )}

      {/* ===== LLM / Agent ===== */}
      <section className="space-y-3">
        <SectionHeader title="LLM / Agent" />

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
          <p className="text-xs text-muted-foreground">Max tool-calling iterations for agent modes</p>
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
      </section>

      {/* ===== MCP Server ===== */}
      <section className="space-y-3">
        <SectionHeader title="MCP Server (Paper Agent)" />

        <div className="space-y-1">
          <label className="text-xs font-medium">Endpoint URL</label>
          <Input
            type="text"
            value={settings.mcpEndpoint || ''}
            onChange={(e) => onSettingsChange({ mcpEndpoint: e.target.value })}
            placeholder="http://localhost:8000/sse"
            className="h-8 text-sm font-mono"
          />
          <p className="text-xs text-muted-foreground">
            ea-tools MCP server SSE endpoint. Start with:{' '}
            <code className="bg-muted px-1 rounded">ea-tools serve --transport http -k arxiv -k sn_proxy -k vesta</code>
          </p>
        </div>
      </section>

      {/* ===== Vesta Sync ===== */}
      <section className="space-y-3">
        <SectionHeader title="Vesta Sync" />

        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Directory:</span>
          {vestaDirName ? (
            <>
              <span className="font-mono bg-muted px-1.5 py-0.5 rounded truncate max-w-[120px]">{vestaDirName}/</span>
              <Button variant="ghost" size="sm" onClick={handleUnlinkVesta} className="h-5 px-1 text-destructive" title="Unlink Vesta directory">
                <Unlink className="h-3 w-3" />
              </Button>
            </>
          ) : (
            <span className="text-muted-foreground italic">None</span>
          )}
        </div>

        {vestaSyncState && vestaSyncState.lastSyncTime > 0 && (
          <div className="text-[10px] text-muted-foreground space-y-0.5">
            <p>Last sync: {new Date(vestaSyncState.lastSyncTime).toLocaleString()}</p>
            <p>Total: {vestaSyncState.entriesSynced} entries, {vestaSyncState.conversationsSynced} conversations</p>
            {vestaSyncState.lastError && <p className="text-destructive">Error: {vestaSyncState.lastError}</p>}
          </div>
        )}

        {vestaSyncResult && (
          <div className={`text-xs p-2 rounded ${
            vestaSyncResult.startsWith('Error')
              ? 'text-destructive bg-destructive/10'
              : 'text-green-600 bg-green-500/10'
          }`}>
            {vestaSyncResult}
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleLinkVesta} className="h-7 text-xs flex-1" title="Link to ~/.ea/vesta/ directory">
            <FolderOpen className="h-3 w-3 mr-1" />
            {vestaDirName ? 'Re-link' : 'Link Directory'}
          </Button>
          <Button
            variant="outline" size="sm" onClick={handleVestaSync}
            disabled={vestaSyncing || !vestaDirName}
            className="h-7 text-xs flex-1" title="Sync events and knowledge to Vesta"
          >
            <CloudUpload className={`h-3 w-3 mr-1 ${vestaSyncing ? 'animate-pulse' : ''}`} />
            {vestaSyncing ? 'Syncing...' : 'Sync Now'}
          </Button>
        </div>

        <p className="text-[10px] text-muted-foreground">
          One-way sync: tracing events, knowledge entries, and conversations → Vesta. Auto-syncs daily.
        </p>
      </section>

      {/* ===== Slash Commands ===== */}
      <section className="space-y-3">
        <SectionHeader title="Slash Commands" />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Terminal className="h-3.5 w-3.5" />
            <button onClick={() => setShowCommandsHelp(true)} className="text-muted-foreground hover:text-foreground transition-colors">
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
          </div>
          <span className="text-xs text-muted-foreground">{commands.length} loaded</span>
        </div>

        {commandsError && (
          <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">{commandsError}</div>
        )}

        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Linked:</span>
          {linkedDirName ? (
            <>
              <span className="font-mono bg-muted px-1.5 py-0.5 rounded truncate max-w-[120px]">{linkedDirName}/</span>
              <Button variant="ghost" size="sm" onClick={handleUnlinkDirectory} className="h-5 px-1 text-destructive" title="Unlink directory">
                <Trash2 className="h-3 w-3" />
              </Button>
            </>
          ) : (
            <span className="text-muted-foreground italic">None</span>
          )}
        </div>

        <div className="space-y-1 max-h-32 overflow-y-auto">
          {commands.map((cmd) => (
            <div
              key={cmd.id}
              className="flex items-center gap-2 bg-background p-1.5 rounded text-xs cursor-pointer hover:bg-accent transition-colors"
              onClick={() => { setSelectedCommand(cmd); setShowCommandPreview(true) }}
              title={cmd.description}
            >
              <span className="w-5 text-center">{cmd.icon}</span>
              <span className="flex-1 font-mono truncate">{getCommandDisplayName(cmd)}</span>
              <span className="text-muted-foreground truncate max-w-[80px] text-[10px]">{cmd.description}</span>
              <span className={`px-1 py-0.5 rounded text-[10px] shrink-0 ${
                cmd.source === 'user' ? 'bg-blue-500/20 text-blue-400' : 'bg-muted text-muted-foreground'
              }`}>
                {cmd.source}
              </span>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleLinkDirectory} disabled={isLoadingCommands} className="h-7 text-xs flex-1" title="Link to a folder containing .md command files">
            <FolderOpen className="h-3 w-3 mr-1" /> Link Folder
          </Button>
          <Button variant="outline" size="sm" onClick={handleSyncCommands} disabled={isLoadingCommands || !linkedDirName} className="h-7 text-xs flex-1" title="Re-import commands from linked folder">
            <RefreshCw className={`h-3 w-3 mr-1 ${isLoadingCommands ? 'animate-spin' : ''}`} /> Sync
          </Button>
        </div>
      </section>

      {/* ===== Content Script ===== */}
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
            placeholder={`Empty = show on all sites\n*://example.com/*`}
            rows={3}
            className="w-full text-xs font-mono bg-background border rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground">
            Hide FAB on matching URLs (one glob per line). Empty = show everywhere.
            The X button only hides FAB for the current page session.
          </p>
        </div>
      </section>

      {/* ===== Notion Sync ===== */}
      <section className="space-y-3">
        <SectionHeader title="Notion Sync" />

        <div className="space-y-1">
          <label className="text-xs font-medium">Notion Token</label>
          <Input
            type="password"
            value={settings.notionToken || ''}
            onChange={(e) => onSettingsChange({ notionToken: e.target.value })}
            placeholder="secret_..."
            className="h-8 text-sm font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Create an integration at{' '}
            <a href="https://www.notion.so/my-integrations" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
              notion.so/my-integrations
            </a>
          </p>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium">Database ID</label>
          <Input
            type="text"
            value={settings.notionDatabaseId || ''}
            onChange={(e) => onSettingsChange({ notionDatabaseId: e.target.value })}
            placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            className="h-8 text-sm font-mono"
          />
          <p className="text-xs text-muted-foreground">Copy from database URL or share it with your integration</p>
        </div>
      </section>

      {/* ===== Import / Export ===== */}
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

      {/* ===== Dialogs ===== */}
      <Dialog open={showCommandPreview} onOpenChange={setShowCommandPreview}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>{selectedCommand?.icon}</span>
              <span className="font-mono">{selectedCommand && getCommandDisplayName(selectedCommand)}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            <p className="text-sm text-muted-foreground mb-3">{selectedCommand?.description}</p>
            <div className="text-xs space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Source:</span>
                <span className={`px-1.5 py-0.5 rounded ${
                  selectedCommand?.source === 'user' ? 'bg-blue-500/20 text-blue-400' : 'bg-muted text-muted-foreground'
                }`}>
                  {selectedCommand?.source}
                </span>
              </div>
              {selectedCommand?.contextVariables && selectedCommand.contextVariables.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-muted-foreground">Variables:</span>
                  {selectedCommand.contextVariables.map(v => (
                    <code key={v} className="px-1.5 py-0.5 rounded bg-muted text-[10px]">
                      {v === 'ARGUMENTS' ? '$ARGUMENTS' : `!\`${v}\``}
                    </code>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-3 p-3 bg-muted rounded text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-48">
              {selectedCommand?.template}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setShowCommandPreview(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCommandsHelp} onOpenChange={setShowCommandsHelp}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Terminal className="h-4 w-4" />
              Slash Commands
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 text-sm">
            <section>
              <h4 className="font-semibold mb-1">What are Slash Commands?</h4>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Slash commands are reusable prompt templates that inject browser context into your messages.
                Type <kbd className="px-1 py-0.5 rounded bg-muted text-foreground text-[10px]">/</kbd> in
                the chat input to see available commands, then select one with arrow keys and Tab.
              </p>
            </section>
            <section>
              <h4 className="font-semibold mb-1">How to Use</h4>
              <div className="text-xs text-muted-foreground space-y-1.5">
                <p><code className="bg-muted px-1 rounded">/summarize</code> — Summarize the current page</p>
                <p><code className="bg-muted px-1 rounded">/translate Spanish</code> — Translate selected text to Spanish</p>
                <p><code className="bg-muted px-1 rounded">/eason:review</code> — Use a custom command from "eason" namespace</p>
              </div>
            </section>
            <section>
              <h4 className="font-semibold mb-1">Creating Custom Commands</h4>
              <p className="text-muted-foreground text-xs leading-relaxed mb-2">
                Commands are Markdown files with YAML frontmatter. Create a folder structure like:
              </p>
              <pre className="bg-muted p-2 rounded text-[10px] font-mono overflow-x-auto">{`~/.ea/iris/commands/
├── eason/
│   └── review.md    → /eason:review
└── work/
    └── standup.md   → /work:standup`}</pre>
            </section>
            <section>
              <h4 className="font-semibold mb-1">Command File Format</h4>
              <pre className="bg-muted p-2 rounded text-[10px] font-mono overflow-x-auto">{`---
description: Summarize page content
icon: 📝
---

Summarize this page: **!\`title\`**

!\`pageContent\`

Target language: $ARGUMENTS`}</pre>
            </section>
            <section>
              <h4 className="font-semibold mb-1">Context Variables</h4>
              <div className="text-xs space-y-1">
                <p><code className="bg-muted px-1 rounded">!\`pageContent\`</code> — Full page content as Markdown</p>
                <p><code className="bg-muted px-1 rounded">!\`selection\`</code> — Currently selected text</p>
                <p><code className="bg-muted px-1 rounded">!\`url\`</code> — Current page URL</p>
                <p><code className="bg-muted px-1 rounded">!\`title\`</code> — Page title</p>
                <p><code className="bg-muted px-1 rounded">$ARGUMENTS</code> — Text after command name</p>
              </div>
            </section>
            <section>
              <h4 className="font-semibold mb-1">Settings Buttons</h4>
              <div className="text-xs text-muted-foreground space-y-1.5">
                <p><strong className="text-foreground">Link Folder</strong> — Connect to a local folder containing your command files.</p>
                <p><strong className="text-foreground">Sync</strong> — Reload commands from the linked folder after editing.</p>
              </div>
            </section>
            <section className="pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                Inspired by{' '}
                <a href="https://docs.anthropic.com/en/docs/claude-code/slash-commands" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                  Claude Code Slash Commands
                </a>
              </p>
            </section>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setShowCommandsHelp(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
