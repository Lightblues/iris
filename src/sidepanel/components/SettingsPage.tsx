import { useState, useRef, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Download, Upload, Plus, FolderOpen, RefreshCw, Unlink, Star, Loader2 } from 'lucide-react'
import type { SidePanelSettings } from '@/lib/sidepanelSettings'
import { exportSettings, importSettings, maskApiKey } from '@/lib/sidepanelSettings'
import { remoteHttpOrigin } from '@/lib/remoteRelayUrl'
import type { RemoteRelayState } from '@/background/remoteRelay'
import {
  getChatExportDirectoryHandle,
  requestChatExportDirectoryAccess,
  clearChatExportDirectoryHandle,
  queryDirectoryPermission,
  verifyDirectoryPermission,
} from '@/lib/fileSystemAccess'
import { fetchModels, clearModelCache } from '@/lib/modelRegistry'
import type { ModelConfig } from '@/lib/sidepanelSettings'

interface SettingsPageProps {
  settings: SidePanelSettings
  onSettingsChange: (settings: Partial<SidePanelSettings>) => void
}

function SectionHeader({ title }: { title: string }) {
  return <h3 className="text-sm font-semibold pb-1 mb-3 border-b">{title}</h3>
}

type RelayStatusKind = 'checking' | 'connected' | 'disconnected'

async function probeRelay(port: number, token: string): Promise<{ kind: RelayStatusKind; text: string }> {
  try {
    const resp = await fetch(`http://127.0.0.1:${port}/status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!resp.ok) {
      return {
        kind: 'disconnected',
        text: resp.status === 401 ? 'Auth failed — token mismatch' : `Server error: ${resp.status}`,
      }
    }
    const data = await resp.json() as { extension_connected?: boolean }
    return data.extension_connected
      ? { kind: 'connected', text: 'Connected' }
      : { kind: 'disconnected', text: 'Server running, Iris not connected' }
  } catch {
    return { kind: 'disconnected', text: 'Cannot reach relay server' }
  }
}

async function probeRemote(url: string, token: string, deviceId: string): Promise<{ kind: RelayStatusKind; text: string }> {
  const origin = remoteHttpOrigin(url)
  if (!origin) return { kind: 'disconnected', text: 'Enter a wss:// or https:// URL' }
  if (!token) return { kind: 'disconnected', text: 'Token is required' }
  try {
    const resp = await fetch(`${origin}/status`, { headers: { Authorization: `Bearer ${token}` } })
    if (!resp.ok) {
      return {
        kind: 'disconnected',
        text: resp.status === 401 ? 'Auth failed — token mismatch' : `Server error: ${resp.status}`,
      }
    }
    const data = await resp.json() as { devices?: { id: string; label: string }[] }
    const mine = data.devices?.find(device => device.id === deviceId)
    return mine
      ? { kind: 'connected', text: `Connected as ${mine.label}` }
      : { kind: 'disconnected', text: 'Server running, this browser not connected' }
  } catch {
    return { kind: 'disconnected', text: 'Cannot reach remote relay' }
  }
}

export function SettingsPage({ settings, onSettingsChange }: SettingsPageProps) {
  const [availableModels, setAvailableModels] = useState<ModelConfig[]>([])
  const [modelsFetching, setModelsFetching] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [modelsQuery, setModelsQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [chatExportDirName, setChatExportDirName] = useState<string | null>(null)
  const [chatExportNeedsGrant, setChatExportNeedsGrant] = useState(false)
  const [apiKeyFocused, setApiKeyFocused] = useState(false)
  const [relayStatus, setRelayStatus] = useState<string | null>(null)
  const [relayStatusKind, setRelayStatusKind] = useState<RelayStatusKind>('checking')
  const [relayChecking, setRelayChecking] = useState(false)
  const [remoteState, setRemoteState] = useState<RemoteRelayState | null>(null)
  const [remoteStatus, setRemoteStatus] = useState<string | null>(null)
  const [remoteStatusKind, setRemoteStatusKind] = useState<RelayStatusKind>('disconnected')
  const [remoteChecking, setRemoteChecking] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getChatExportDirectoryHandle().then(async handle => {
      if (!handle) return
      setChatExportDirName(handle.name)
      setChatExportNeedsGrant((await queryDirectoryPermission(handle)) !== 'granted')
    })
    setRelayStatusKind('checking')
    setRelayStatus('Checking...')
    probeRelay(settings.browserRelayPort || 33007, settings.browserRelayToken || 'ea-browser-relay-local')
      .then((r) => { setRelayStatusKind(r.kind); setRelayStatus(r.text) })
    chrome.runtime.sendMessage({ type: 'remote_relay_status' })
      .then((state: RemoteRelayState) => setRemoteState(state))
      .catch(() => {})
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

  const handleLinkChatExport = async () => {
    try {
      const handle = await requestChatExportDirectoryAccess()
      if (handle) {
        setChatExportDirName(handle.name)
        setChatExportNeedsGrant(false)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to link chat export directory')
    }
  }

  const handleReconnectChatExport = async () => {
    const handle = await getChatExportDirectoryHandle()
    if (!handle) return
    try {
      const ok = await verifyDirectoryPermission(handle)
      setChatExportNeedsGrant(!ok)
      if (!ok) setError('Permission was not granted for the export directory')
    } catch (err: any) {
      setError(err.message || 'Failed to reconnect export directory')
    }
  }

  const handleUnlinkChatExport = async () => {
    await clearChatExportDirectoryHandle()
    setChatExportDirName(null)
    setChatExportNeedsGrant(false)
  }

  const checkRelayStatus = async () => {
    setRelayChecking(true)
    setRelayStatusKind('checking')
    setRelayStatus('Checking...')
    try {
      await chrome.runtime.sendMessage({ type: 'browser_relay_reconnect' })
    } catch { /* SW starting */ }
    await new Promise((r) => setTimeout(r, 800))
    const r = await probeRelay(
      settings.browserRelayPort || 33007,
      settings.browserRelayToken || 'ea-browser-relay-local',
    )
    setRelayStatusKind(r.kind)
    setRelayStatus(r.text)
    setRelayChecking(false)
  }

  const checkRemoteRelay = async () => {
    setRemoteChecking(true)
    setRemoteStatusKind('checking')
    setRemoteStatus('Checking...')
    try {
      try {
        await chrome.runtime.sendMessage({ type: 'remote_relay_reconnect' })
      } catch { /* SW starting */ }
      await new Promise(resolve => setTimeout(resolve, 800))
      const state = await chrome.runtime.sendMessage({ type: 'remote_relay_status' }) as RemoteRelayState
      setRemoteState(state)
      const probed = await probeRemote(settings.remoteRelayUrl || '', settings.remoteRelayToken || '', state?.deviceId || '')
      setRemoteStatusKind(probed.kind)
      setRemoteStatus(state?.syncError ? `${probed.text}. Sync: ${state.syncError}` : probed.text)
    } catch {
      setRemoteStatusKind('disconnected')
      setRemoteStatus('Cannot reach the extension')
    } finally {
      setRemoteChecking(false)
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
          <p className="text-xs text-muted-foreground">Max tool-calling iterations per reply</p>
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
            <code className="bg-muted px-1 rounded">ea-tools serve --transport http -k arxiv -k sn_proxy</code>
          </p>
        </div>
      </section>

      {/* ===== Browser Relay ===== */}
      <section className="space-y-3">
        <SectionHeader title="Browser Relay" />

        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={settings.browserRelayEnabled !== false}
            onChange={(e) => onSettingsChange({ browserRelayEnabled: e.target.checked })}
          />
          Connect to ea-tools browser relay
        </label>

        <div className="space-y-1">
          <label className="text-xs font-medium">Port</label>
          <Input
            type="number"
            min={1}
            max={65535}
            value={settings.browserRelayPort ?? 33007}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10)
              onSettingsChange({ browserRelayPort: Number.isFinite(val) ? val : 33007 })
            }}
            className="h-8 text-sm font-mono"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium">Auth Token</label>
          <Input
            type="text"
            value={settings.browserRelayToken ?? 'ea-browser-relay-local'}
            onChange={(e) => onSettingsChange({ browserRelayToken: e.target.value })}
            className="h-8 text-sm font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Must match <code className="bg-muted px-1 rounded">browser_relay.auth_token</code> in{' '}
            <code className="bg-muted px-1 rounded">~/.ea/tools/config.yaml</code>
          </p>
        </div>

        {relayStatus && (
          <div className={`text-xs p-2 rounded ${
            relayStatusKind === 'connected'
              ? 'text-green-600 bg-green-500/10'
              : relayStatusKind === 'checking'
                ? 'text-amber-600 bg-amber-500/10'
                : 'text-destructive bg-destructive/10'
          }`}>
            {relayStatus}
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => void checkRelayStatus()}
          disabled={relayChecking || settings.browserRelayEnabled === false}
          className="h-7 text-xs"
        >
          <RefreshCw className={`h-3 w-3 mr-1 ${relayChecking ? 'animate-spin' : ''}`} />
          Check Connection
        </Button>

        <p className="text-[10px] text-muted-foreground">
          Exposes this browser to ea-tools agents (<code className="font-mono">browser_fetch</code>, tab tools).
          Start the server with <code className="font-mono">ea-tools browser-relay serve</code>.
        </p>
      </section>

      <section className="space-y-3">
        <SectionHeader title="Remote Relay" />

        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={settings.remoteRelayEnabled === true}
            onChange={(e) => onSettingsChange({ remoteRelayEnabled: e.target.checked })}
          />
          Sync history and expose tools through your relay
        </label>

        <div className="space-y-1">
          <label className="text-xs font-medium">URL</label>
          <Input
            type="text"
            value={settings.remoteRelayUrl || ''}
            onChange={(e) => onSettingsChange({ remoteRelayUrl: e.target.value })}
            placeholder="wss://iris.example"
            className="h-8 text-sm font-mono"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium">Token</label>
          <Input
            type="text"
            value={settings.remoteRelayToken || ''}
            onChange={(e) => onSettingsChange({ remoteRelayToken: e.target.value })}
            className="h-8 text-sm font-mono"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium">Device name</label>
          <Input
            type="text"
            value={settings.remoteRelayLabel || ''}
            onChange={(e) => onSettingsChange({ remoteRelayLabel: e.target.value })}
            placeholder="home"
            className="h-8 text-sm font-mono"
          />
          {remoteState?.deviceId && (
            <p className="text-xs text-muted-foreground font-mono">device {remoteState.deviceId}</p>
          )}
        </div>

        {remoteStatus && (
          <div className={`text-xs p-2 rounded ${
            remoteStatusKind === 'connected'
              ? 'text-green-600 bg-green-500/10'
              : remoteStatusKind === 'checking'
                ? 'text-amber-600 bg-amber-500/10'
                : 'text-destructive bg-destructive/10'
          }`}>
            {remoteStatus}
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => void checkRemoteRelay()}
          disabled={remoteChecking || settings.remoteRelayEnabled !== true}
          className="h-7 text-xs"
        >
          <RefreshCw className={`h-3 w-3 mr-1 ${remoteChecking ? 'animate-spin' : ''}`} />
          Check Connection
        </Button>

        <p className="text-[10px] text-muted-foreground">
          This browser connects out to your server. History and tool calls are readable there. The local ea-tools relay is unchanged.
        </p>
      </section>

      <section className="space-y-3">
        <SectionHeader title="Chat Export" />

        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Directory:</span>
          {chatExportDirName ? (
            <>
              <span className="font-mono bg-muted px-1.5 py-0.5 rounded truncate max-w-[120px]">{chatExportDirName}/</span>
              <Button variant="ghost" size="sm" onClick={handleUnlinkChatExport} className="h-5 px-1 text-destructive" title="Unlink chat export directory">
                <Unlink className="h-3 w-3" />
              </Button>
            </>
          ) : (
            <span className="text-muted-foreground italic">None</span>
          )}
        </div>

        {chatExportNeedsGrant && chatExportDirName && (
          <div className="text-xs p-2 rounded text-amber-600 bg-amber-500/10">
            Access expired after extension reload. Click Reconnect to restore it.
          </div>
        )}

        <div className="flex gap-2">
          {chatExportNeedsGrant && chatExportDirName && (
            <Button variant="outline" size="sm" onClick={handleReconnectChatExport} className="h-7 text-xs flex-1" title="Re-grant access to the saved directory">
              <RefreshCw className="h-3 w-3 mr-1" />
              Reconnect
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleLinkChatExport} className="h-7 text-xs flex-1" title="Pick the directory to export online AI chats into">
            <FolderOpen className="h-3 w-3 mr-1" />
            {chatExportDirName ? 'Re-link' : 'Choose Directory'}
          </Button>
        </div>

        <p className="text-[10px] text-muted-foreground">
          Export ChatGPT / DeepSeek / Gemini conversations as raw JSON via the on-page FAB.
          Files land in <span className="font-mono">&lt;dir&gt;/&lt;platform&gt;/&lt;id&gt;.json</span>.
        </p>
      </section>

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
    </div>
  )
}
