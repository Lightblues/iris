import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import type { SidePanelSettings } from '@/lib/sidepanelSettings'
import { NOT_SYNCED, SubHeader, type RelayStatusKind } from './shared'

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

interface Props {
  settings: SidePanelSettings
  onSettingsChange: (settings: Partial<SidePanelSettings>) => void
}

export function LocalRelaySection({ settings, onSettingsChange }: Props) {
  const [relayStatus, setRelayStatus] = useState<string | null>(null)
  const [relayStatusKind, setRelayStatusKind] = useState<RelayStatusKind>('checking')
  const [relayChecking, setRelayChecking] = useState(false)

  useEffect(() => {
    setRelayStatusKind('checking')
    setRelayStatus('Checking...')
    probeRelay(settings.browserRelayPort || 33007, settings.browserRelayToken || 'ea-browser-relay-local')
      .then((r) => { setRelayStatusKind(r.kind); setRelayStatus(r.text) })
  }, [])

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

  return (
    <div className="space-y-3">
      <SubHeader title="Localhost relay (ea-tools)" note={`${NOT_SYNCED} · unused for now`} />

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
    </div>
  )
}
