import type { TracingEvent } from './types'
import { loadSettings } from './sidepanelSettings'

const EVENTS_KEY_PREFIX = 'iris_events_'

function getStorageKey(date: Date): string {
  return EVENTS_KEY_PREFIX + date.toISOString().slice(0, 10)
}

async function isTracingEnabled(): Promise<boolean> {
  const settings = await loadSettings()
  return settings.tracingEnabled !== false
}

export async function recordEvent(
  event: Omit<TracingEvent, 'ts'>,
): Promise<void> {
  if (!(await isTracingEnabled())) return
  const full: TracingEvent = { ts: Date.now(), ...event }
  const key = getStorageKey(new Date())
  const result = await chrome.storage.local.get(key)
  const events: TracingEvent[] = (result[key] as TracingEvent[] | undefined) || []
  events.push(full)
  await chrome.storage.local.set({ [key]: events })
}

export async function getEvents(date: Date): Promise<TracingEvent[]> {
  const key = getStorageKey(date)
  const result = await chrome.storage.local.get(key)
  return (result[key] as TracingEvent[] | undefined) || []
}

export async function cleanupOldEvents(retentionDays = 30): Promise<number> {
  const all = await chrome.storage.local.get(null)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - retentionDays)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  const keysToRemove: string[] = []
  for (const key of Object.keys(all)) {
    if (!key.startsWith(EVENTS_KEY_PREFIX)) continue
    const dateStr = key.slice(EVENTS_KEY_PREFIX.length)
    if (dateStr < cutoffStr) keysToRemove.push(key)
  }

  if (keysToRemove.length > 0) {
    await chrome.storage.local.remove(keysToRemove)
  }
  return keysToRemove.length
}

// Helper for search query detection
const SEARCH_PATTERNS: { host: string; param: string; engine: string }[] = [
  { host: 'google.com', param: 'q', engine: 'google' },
  { host: 'www.google.com', param: 'q', engine: 'google' },
  { host: 'bing.com', param: 'q', engine: 'bing' },
  { host: 'www.bing.com', param: 'q', engine: 'bing' },
  { host: 'duckduckgo.com', param: 'q', engine: 'duckduckgo' },
]

export function detectSearchQuery(url: string): { query: string; engine: string } | null {
  try {
    const parsed = new URL(url)
    for (const p of SEARCH_PATTERNS) {
      if (parsed.hostname === p.host || parsed.hostname.endsWith('.' + p.host)) {
        const q = parsed.searchParams.get(p.param)
        if (q) return { query: q, engine: p.engine }
      }
    }
  } catch { /* ignore invalid URLs */ }
  return null
}
