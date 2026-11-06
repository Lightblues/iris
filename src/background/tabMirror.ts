// Keeps this browser's snapshot in DEVICE_TABS_KEY; sync uploads it as record `tabs/<device id>`.

import { loadSettings, SETTINGS_KEY } from '../lib/sidepanelSettings'
import { hashJson } from '../lib/sync'
import { buildSnapshot, DEVICE_TABS_KEY, type TabSnapshot } from '../lib/tabMirror'
import { getDeviceId } from './remoteRelay'

// Structural changes only; tab activation is not one, so switching tabs does not wake the other browsers.
const DEBOUNCE_MS = 15_000
let timer: ReturnType<typeof setTimeout> | null = null

function schedule(delay = DEBOUNCE_MS): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    void write().catch(error => console.warn('[Iris tabs] snapshot failed:', (error as Error).message))
  }, delay)
}

async function write(): Promise<void> {
  const settings = await loadSettings()
  if (!settings.remoteRelayEnabled) return
  const deviceId = await getDeviceId()
  const bag = await chrome.storage.local.get(DEVICE_TABS_KEY)
  const all = { ...((bag[DEVICE_TABS_KEY] ?? {}) as Record<string, TabSnapshot>) }
  const current = all[deviceId]
  if (settings.shareTabs === false) {
    if (!current) return
    delete all[deviceId]
    await chrome.storage.local.set({ [DEVICE_TABS_KEY]: all })
    return
  }
  const [windows, groups] = await Promise.all([chrome.windows.getAll({ populate: true }), chrome.tabGroups.query({})])
  const next = buildSnapshot(windows, groups, settings.remoteRelayLabel || '', Date.now())
  if (current && hashJson({ ...current, at: 0 }) === hashJson({ ...next, at: 0 })) return
  all[deviceId] = next
  await chrome.storage.local.set({ [DEVICE_TABS_KEY]: all })
}

export function initTabMirror(): void {
  const changed = () => schedule()
  chrome.tabs.onCreated.addListener(changed)
  chrome.tabs.onRemoved.addListener(changed)
  chrome.tabs.onMoved.addListener(changed)
  chrome.tabs.onAttached.addListener(changed)
  chrome.tabs.onDetached.addListener(changed)
  chrome.tabs.onUpdated.addListener((_id, info) => {
    if (info.url || info.title || info.pinned !== undefined || info.groupId !== undefined || info.favIconUrl) schedule()
  })
  chrome.tabGroups.onUpdated.addListener(changed)
  chrome.tabGroups.onRemoved.addListener(changed)
  chrome.windows.onRemoved.addListener(changed)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[SETTINGS_KEY]) schedule(1000)
  })
  schedule(3000)
}
