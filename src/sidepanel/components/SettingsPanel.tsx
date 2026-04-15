import { useState, useRef, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Download, Upload, Plus, Trash2, FolderOpen, RefreshCw, Terminal, HelpCircle, CloudUpload, Unlink } from 'lucide-react'
import type { SidePanelSettings, ModelConfig } from '@/lib/sidepanelSettings'
import { exportSettings, importSettings } from '@/lib/sidepanelSettings'
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

interface SettingsPanelProps {
  settings: SidePanelSettings
  onSettingsChange: (settings: Partial<SidePanelSettings>) => void
  onCommandsChanged?: () => void
}

export function SettingsPanel({ settings, onSettingsChange, onCommandsChanged }: SettingsPanelProps) {
  const [showAddModel, setShowAddModel] = useState(false)
  const [newModelName, setNewModelName] = useState('')
  const [newModelId, setNewModelId] = useState('')
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
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load commands, linked directory, and vesta state on mount
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

  // Link to a commands directory
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

  // Sync commands from linked directory
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

  // Unlink directory
  const handleUnlinkDirectory = async () => {
    await clearDirectoryHandle()
    await saveUserCommands([])
    setLinkedDirName(null)
    setCommands(await loadAllCommands())
    onCommandsChanged?.()
  }

  // Vesta sync handlers
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
          <p className="text-xs text-muted-foreground">Max tool-calling iterations for agent modes (Tab Agent, Automation)</p>
        </div>
      </div>

      <div className="pt-2 border-t space-y-3">
        <h3 className="text-sm font-semibold">Notion Sync</h3>

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
            <a
              href="https://www.notion.so/my-integrations"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
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
          <p className="text-xs text-muted-foreground">
            Copy from database URL or share it with your integration
          </p>
        </div>
      </div>

      {/* Vesta Sync Section */}
      <div className="pt-2 border-t space-y-3">
        <h3 className="text-sm font-semibold">Vesta Sync</h3>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Directory:</span>
          {vestaDirName ? (
            <>
              <span className="font-mono bg-muted px-1.5 py-0.5 rounded truncate max-w-[120px]">
                {vestaDirName}/
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleUnlinkVesta}
                className="h-5 px-1 text-destructive"
                title="Unlink Vesta directory"
              >
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
            {vestaSyncState.lastError && (
              <p className="text-destructive">Error: {vestaSyncState.lastError}</p>
            )}
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
          <Button
            variant="outline"
            size="sm"
            onClick={handleLinkVesta}
            className="h-7 text-xs flex-1"
            title="Link to ~/.ea/vesta/ directory"
          >
            <FolderOpen className="h-3 w-3 mr-1" />
            {vestaDirName ? 'Re-link' : 'Link Directory'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleVestaSync}
            disabled={vestaSyncing || !vestaDirName}
            className="h-7 text-xs flex-1"
            title="Sync events and knowledge to Vesta"
          >
            <CloudUpload className={`h-3 w-3 mr-1 ${vestaSyncing ? 'animate-pulse' : ''}`} />
            {vestaSyncing ? 'Syncing...' : 'Sync Now'}
          </Button>
        </div>

        <p className="text-[10px] text-muted-foreground">
          One-way sync: tracing events, knowledge entries, and conversations → Vesta. Auto-syncs daily.
        </p>
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

      {/* Slash Commands Section */}
      <div className="pt-2 border-t space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Terminal className="h-3.5 w-3.5" />
            Slash Commands
            <button
              onClick={() => setShowCommandsHelp(true)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
          </h3>
          <span className="text-xs text-muted-foreground">{commands.length} loaded</span>
        </div>

        {commandsError && (
          <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
            {commandsError}
          </div>
        )}

        {/* Linked Directory */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Linked:</span>
          {linkedDirName ? (
            <>
              <span className="font-mono bg-muted px-1.5 py-0.5 rounded truncate max-w-[120px]">
                {linkedDirName}/
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleUnlinkDirectory}
                className="h-5 px-1 text-destructive"
                title="Unlink directory"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </>
          ) : (
            <span className="text-muted-foreground italic">None</span>
          )}
        </div>

        {/* Command List */}
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {commands.map((cmd) => (
            <div
              key={cmd.id}
              className="flex items-center gap-2 bg-background p-1.5 rounded text-xs cursor-pointer hover:bg-accent transition-colors"
              onClick={() => {
                setSelectedCommand(cmd)
                setShowCommandPreview(true)
              }}
              title={cmd.description}
            >
              <span className="w-5 text-center">{cmd.icon}</span>
              <span className="flex-1 font-mono truncate">{getCommandDisplayName(cmd)}</span>
              <span className="text-muted-foreground truncate max-w-[80px] text-[10px]">
                {cmd.description}
              </span>
              <span
                className={`px-1 py-0.5 rounded text-[10px] shrink-0 ${
                  cmd.source === 'user'
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {cmd.source}
              </span>
            </div>
          ))}
        </div>

        {/* Command Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleLinkDirectory}
            disabled={isLoadingCommands}
            className="h-7 text-xs flex-1"
            title="Link to a folder containing .md command files"
          >
            <FolderOpen className="h-3 w-3 mr-1" />
            Link Folder
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncCommands}
            disabled={isLoadingCommands || !linkedDirName}
            className="h-7 text-xs flex-1"
            title="Re-import commands from linked folder"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${isLoadingCommands ? 'animate-spin' : ''}`} />
            Sync
          </Button>
        </div>
      </div>

      {/* Command Preview Dialog */}
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
                  selectedCommand?.source === 'user'
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'bg-muted text-muted-foreground'
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
            <Button variant="ghost" size="sm" onClick={() => setShowCommandPreview(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Slash Commands Help Dialog */}
      <Dialog open={showCommandsHelp} onOpenChange={setShowCommandsHelp}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Terminal className="h-4 w-4" />
              Slash Commands
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 text-sm">
            {/* What are Slash Commands */}
            <section>
              <h4 className="font-semibold mb-1">What are Slash Commands?</h4>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Slash commands are reusable prompt templates that inject browser context into your messages.
                Type <kbd className="px-1 py-0.5 rounded bg-muted text-foreground text-[10px]">/</kbd> in
                the chat input to see available commands, then select one with arrow keys and Tab.
              </p>
            </section>

            {/* How to Use */}
            <section>
              <h4 className="font-semibold mb-1">How to Use</h4>
              <div className="text-xs text-muted-foreground space-y-1.5">
                <p><code className="bg-muted px-1 rounded">/summarize</code> — Summarize the current page</p>
                <p><code className="bg-muted px-1 rounded">/translate Spanish</code> — Translate selected text to Spanish</p>
                <p><code className="bg-muted px-1 rounded">/eason:review</code> — Use a custom command from "eason" namespace</p>
              </div>
            </section>

            {/* Creating Custom Commands */}
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

            {/* Command File Format */}
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

            {/* Context Variables */}
            <section>
              <h4 className="font-semibold mb-1">Context Variables</h4>
              <div className="text-xs space-y-1">
                <p><code className="bg-muted px-1 rounded">!\`pageContent\`</code> — Full page content as Markdown</p>
                <p><code className="bg-muted px-1 rounded">!\`selection\`</code> — Currently selected text</p>
                <p><code className="bg-muted px-1 rounded">!\`url\`</code> — Current page URL</p>
                <p><code className="bg-muted px-1 rounded">!\`title\`</code> — Page title</p>
                <p><code className="bg-muted px-1 rounded">$ARGUMENTS</code> — Text after command name (e.g., "Spanish" in <code>/translate Spanish</code>)</p>
              </div>
            </section>

            {/* Buttons Explanation */}
            <section>
              <h4 className="font-semibold mb-1">Settings Buttons</h4>
              <div className="text-xs text-muted-foreground space-y-1.5">
                <p><strong className="text-foreground">Link Folder</strong> — Connect to a local folder containing your command files. Use File System Access API to grant permissions.</p>
                <p><strong className="text-foreground">Sync</strong> — Reload commands from the linked folder after you edit files in VSCode or another editor.</p>
              </div>
            </section>

            {/* Reference Link */}
            <section className="pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                Inspired by{' '}
                <a
                  href="https://docs.anthropic.com/en/docs/claude-code/slash-commands"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline"
                >
                  Claude Code Slash Commands
                </a>
              </p>
            </section>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setShowCommandsHelp(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
