import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RefreshCw } from 'lucide-react'
import type { SidePanelSettings } from '@/lib/sidepanelSettings'
import type { RemoteRelayState } from '@/background/remoteRelay'
import { SectionHeader, type RelayStatusKind } from './shared'

function describeRemote(state: RemoteRelayState | null): { kind: RelayStatusKind; text: string } {
  if (!state?.url) return { kind: 'disconnected', text: 'Enter a wss:// or https:// URL' }
  if (!state.connected) return { kind: 'disconnected', text: state.syncError ? `Not connected: ${state.syncError}` : 'Not connected' }
  const synced = state.lastSync ? `, synced ${new Date(state.lastSync).toLocaleTimeString()}` : ''
  const text = `Connected as ${state.label || state.deviceId} (${state.level})${synced}`
  return { kind: 'connected', text: state.syncError ? `${text}. Sync: ${state.syncError}` : text }
}

interface Props {
  settings: SidePanelSettings
  onSettingsChange: (settings: Partial<SidePanelSettings>) => void
}

export function RemoteRelaySection({ settings, onSettingsChange }: Props) {
  const [remoteState, setRemoteState] = useState<RemoteRelayState | null>(null)
  const [remoteStatus, setRemoteStatus] = useState<string | null>(null)
  const [remoteStatusKind, setRemoteStatusKind] = useState<RelayStatusKind>('disconnected')
  const [remoteChecking, setRemoteChecking] = useState(false)

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'remote_relay_status' })
      .then((state: RemoteRelayState) => setRemoteState(state))
      .catch(() => {})
  }, [])

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
      const described = describeRemote(state)
      setRemoteStatusKind(described.kind)
      setRemoteStatus(described.text)
    } catch {
      setRemoteStatusKind('disconnected')
      setRemoteStatus('Cannot reach the extension')
    } finally {
      setRemoteChecking(false)
    }
  }

  return (
    <section className="space-y-3">
      <SectionHeader title="Remote Relay" />

      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={settings.remoteRelayEnabled === true}
          onChange={(e) => onSettingsChange({ remoteRelayEnabled: e.target.checked })}
        />
        Sync with your Iris server and accept remote calls
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

      <div className="space-y-1">
        <label className="text-xs font-medium">Remote calls</label>
        <Select
          value={settings.remoteRelayLevel ?? 'read'}
          onValueChange={(level) => onSettingsChange({ remoteRelayLevel: level as 'off' | 'read' | 'control' })}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="off" className="text-xs">Off: sync only</SelectItem>
            <SelectItem value="read" className="text-xs">Read: open pages and AI chats with my login</SelectItem>
            <SelectItem value="control" className="text-xs">Control: agents may drive this browser</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Use Control only on a browser set aside for agents.</p>
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
  )
}
