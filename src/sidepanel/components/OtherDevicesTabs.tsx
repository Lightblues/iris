import { useState } from 'react'
import type { MirrorTab, TabSnapshot } from '../../lib/tabMirror'

const GROUP_COLORS: Record<string, string> = {
  grey: '#5f6368', blue: '#1a73e8', red: '#d93025', yellow: '#f9ab00', green: '#1e8e3e',
  pink: '#d01884', purple: '#9334e6', cyan: '#007b83', orange: '#fa903e',
}

function ago(ms: number): string {
  const minutes = Math.floor((Date.now() - ms) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`
}

const host = (url: string) => { try { return new URL(url).hostname } catch { return url } }

function TabRow({ tab }: { tab: MirrorTab }) {
  const [icon, setIcon] = useState(!!tab.favIconUrl)
  return (
    <button
      className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent/50 text-left"
      onClick={() => chrome.tabs.create({ url: tab.url })}
      title={tab.url}
    >
      {icon
        ? <img src={tab.favIconUrl} className="w-4 h-4 shrink-0" onError={() => setIcon(false)} alt="" />
        : <span className="w-4 h-4 shrink-0 rounded-sm bg-muted text-[10px] leading-4 text-center uppercase">{host(tab.url)[0]}</span>}
      <span className="flex-1 min-w-0">
        <span className="block truncate text-sm">{tab.title}</span>
        <span className="block truncate text-xs text-muted-foreground">{host(tab.url)}</span>
      </span>
      {tab.group && (
        <span className="shrink-0 max-w-24 truncate rounded px-1.5 text-[10px] text-white" style={{ background: GROUP_COLORS[tab.group.color] ?? GROUP_COLORS.grey }}>
          {tab.group.title || '\u00a0'}
        </span>
      )}
    </button>
  )
}

export function OtherDevicesTabs({ devices }: { devices: [string, TabSnapshot][] }) {
  if (!devices.length) {
    return (
      <div className="text-center py-8 px-4 text-muted-foreground text-sm">
        No other browser shares its tabs yet. On each browser: Settings → This browser → Connect to my Iris server, with Share open tabs on.
      </div>
    )
  }
  return (
    <div className="p-4 space-y-5">
      {devices.map(([id, snap]) => (
        <section key={id}>
          <h3 className="flex items-baseline justify-between text-sm font-semibold pb-1 mb-2 border-b">
            <span className="truncate">{snap.label || id.slice(0, 8)}</span>
            <span className="text-[10px] font-normal text-muted-foreground">updated {ago(snap.at)}</span>
          </h3>
          {snap.windows.map((win, n) => (
            <div key={n} className="mb-3">
              <div className="text-xs text-muted-foreground px-2 pb-1">
                Window {n + 1} · {win.tabs.length} tabs{win.focused ? ' · focused' : ''}
              </div>
              {win.tabs.map((tab, i) => <TabRow key={i} tab={tab} />)}
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
