// Open tabs of each browser, mirrored through the Iris server. A browser writes only its own snapshot,
// keyed by its device id; the other browsers' snapshots are read-only copies.

export const DEVICE_TABS_KEY = 'iris_device_tabs'
const MAX_TABS = 500

export interface MirrorTab {
  title: string
  url: string
  favIconUrl?: string
  pinned?: boolean
  group?: { title: string; color: string }
}

export interface MirrorWindow {
  focused: boolean
  tabs: MirrorTab[]
}

export interface TabSnapshot {
  label: string
  at: number
  windows: MirrorWindow[]
}

const isWeb = (url?: string) => !!url && /^https?:\/\//.test(url)

/** Normal, non-incognito windows only; tabs with an http(s) URL only. */
export function buildSnapshot(
  windows: chrome.windows.Window[],
  groups: chrome.tabGroups.TabGroup[],
  label: string,
  at: number,
): TabSnapshot {
  const byId = new Map(groups.map(g => [g.id, g]))
  let left = MAX_TABS
  const out: MirrorWindow[] = []
  for (const win of windows) {
    if (win.incognito || (win.type && win.type !== 'normal')) continue
    const tabs: MirrorTab[] = []
    for (const tab of win.tabs ?? []) {
      if (tab.incognito || !isWeb(tab.url) || left <= 0) continue
      const group = tab.groupId != null && tab.groupId >= 0 ? byId.get(tab.groupId) : undefined
      const row: MirrorTab = { title: tab.title || tab.url!, url: tab.url! }
      if (isWeb(tab.favIconUrl) && tab.favIconUrl!.length <= 500) row.favIconUrl = tab.favIconUrl
      if (tab.pinned) row.pinned = true
      if (group) row.group = { title: group.title || '', color: group.color }
      tabs.push(row)
      left--
    }
    if (tabs.length) out.push({ focused: win.focused === true, tabs })
  }
  return { label, at, windows: out }
}
