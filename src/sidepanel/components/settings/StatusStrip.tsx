import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { RemoteRelayState } from '@/background/remoteRelay'
import type { SidePanelSettings } from '@/lib/sidepanelSettings'

const POLL_MS = 5000

function describe(state: RemoteRelayState | null, enabled: boolean): { tone: 'ok' | 'warn' | 'off'; server: string; sync: string | null } {
  if (!enabled) return { tone: 'off', server: 'Iris server off', sync: null }
  if (!state?.url) return { tone: 'warn', server: 'No server URL', sync: null }
  const host = state.url.replace(/^\w+:\/\//, '').replace(/\/.*$/, '')
  if (!state.connected) return { tone: 'warn', server: `Not connected to ${host}`, sync: state.syncError }
  const sync = state.syncError
    ? `Sync error: ${state.syncError}`
    : state.lastSync ? `Synced ${new Date(state.lastSync).toLocaleTimeString()}` : 'Not synced yet'
  return { tone: state.syncError ? 'warn' : 'ok', server: `Connected to ${host} as ${state.label || state.deviceId} (${state.level})`, sync }
}

export function StatusStrip({ settings }: { settings: SidePanelSettings }) {
  const [state, setState] = useState<RemoteRelayState | null>(null)
  const [busy, setBusy] = useState(false)
  const version = chrome.runtime.getManifest().version

  const load = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'remote_relay_status' })
      .then((next: RemoteRelayState) => setState(next))
      .catch(() => setState(null))
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, POLL_MS)
    return () => clearInterval(timer)
  }, [load])

  const reconnect = async () => {
    setBusy(true)
    try {
      await chrome.runtime.sendMessage({ type: 'remote_relay_reconnect' }).catch(() => {})
      await new Promise(resolve => setTimeout(resolve, 800))
      load()
    } finally {
      setBusy(false)
    }
  }

  const { tone, server, sync } = describe(state, settings.remoteRelayEnabled === true)
  const dot = tone === 'ok' ? 'bg-green-500' : tone === 'warn' ? 'bg-amber-500' : 'bg-muted-foreground/40'

  return (
    <div className="flex items-start gap-2 rounded border bg-muted/30 px-2.5 py-2 text-xs">
      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <div className="min-w-0 flex-1">
        <div className="truncate" title={server}>{server}</div>
        {sync && <div className={`truncate text-[10px] ${tone === 'ok' ? 'text-muted-foreground' : 'text-amber-600'}`} title={sync}>{sync}</div>}
      </div>
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">v{version}</span>
      {settings.remoteRelayEnabled === true && (
        <button
          type="button"
          onClick={() => void reconnect()}
          disabled={busy}
          title="Reconnect"
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <RefreshCw className={`h-3 w-3 ${busy ? 'animate-spin' : ''}`} />
        </button>
      )}
    </div>
  )
}
