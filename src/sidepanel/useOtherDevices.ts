import { useEffect, useState } from 'react'
import { DEVICE_TABS_KEY, type TabSnapshot } from '../lib/tabMirror'

/** Tabs other browsers share through the Iris server, by device and window. */
export function useOtherDevices(): [string, TabSnapshot][] {
  const [all, setAll] = useState<Record<string, TabSnapshot>>({})
  const [me, setMe] = useState<string | null>(null)
  useEffect(() => {
    const load = () => chrome.storage.local.get(DEVICE_TABS_KEY).then(bag => setAll((bag[DEVICE_TABS_KEY] ?? {}) as Record<string, TabSnapshot>))
    void load()
    chrome.runtime.sendMessage({ type: 'remote_relay_status' })
      .then((state: { deviceId?: string } | undefined) => setMe(state?.deviceId || ''))
      .catch(() => setMe(''))
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[DEVICE_TABS_KEY]) void load()
    }
    chrome.storage.onChanged.addListener(onChange)
    return () => chrome.storage.onChanged.removeListener(onChange)
  }, [])
  if (me === null) return []
  return Object.entries(all).filter(([id]) => id !== me).sort(([, a], [, b]) => b.at - a.at)
}
