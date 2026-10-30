import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import type { SidePanelSettings } from '@/lib/sidepanelSettings'
import type { RelayLevel } from '@/lib/relayLevel'
import { NOT_SYNCED, SectionHeader } from './shared'

interface Props {
  settings: SidePanelSettings
  onSettingsChange: (settings: Partial<SidePanelSettings>) => void
}

const LEVELS: { value: RelayLevel; label: string; hint: string }[] = [
  { value: 'off', label: 'Nothing, sync only', hint: 'Chats, skills, scripts, and settings sync; agents cannot use this browser.' },
  { value: 'read', label: 'Read pages', hint: 'Agents may open pages and read AI chats with your login.' },
  { value: 'control', label: 'Control this browser', hint: 'Agents may click, type, and run tools. Use on a browser set aside for agents.' },
]

export function ThisBrowserSection({ settings, onSettingsChange }: Props) {
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const level = settings.remoteRelayLevel ?? 'read'

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'remote_relay_status' })
      .then((state: { deviceId?: string } | undefined) => setDeviceId(state?.deviceId || null))
      .catch(() => {})
  }, [])

  return (
    <section className="space-y-3">
      <SectionHeader title="This browser" note={NOT_SYNCED} />

      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={settings.remoteRelayEnabled === true}
          onChange={(e) => onSettingsChange({ remoteRelayEnabled: e.target.checked })}
        />
        Connect to my Iris server
      </label>

      <div className="space-y-1">
        <label className="text-xs font-medium">Server URL</label>
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
        {deviceId && <p className="text-xs text-muted-foreground font-mono">device {deviceId}</p>}
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-xs font-medium pb-1">Agents may</legend>
        {LEVELS.map(option => (
          <label key={option.value} className="flex items-start gap-2 text-xs cursor-pointer">
            <input
              type="radio"
              name="remoteRelayLevel"
              className="mt-0.5"
              checked={level === option.value}
              onChange={() => onSettingsChange({ remoteRelayLevel: option.value })}
            />
            <span>
              {option.label}
              <span className="block text-[10px] text-muted-foreground">{option.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <p className="text-[10px] text-muted-foreground">
        This browser connects out to your server. History and tool calls are readable there.
      </p>
    </section>
  )
}
