/**
 * Real-browser check over the Iris server: version, list_tabs, and browser.fetch on one connected device.
 *
 * Usage:
 *   pnpm check-device xh-mini-m1 [url]
 *
 * Keys come from services/server/.env (IRIS_CONTROL_KEY, IRIS_HOST, IRIS_PORT) and are never printed.
 * IRIS_URL overrides the server address, e.g. https://iris.easonsi.site from another machine.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const [label, pageUrl = 'https://example.com'] = process.argv.slice(2)

function readEnv(path: string): Record<string, string> {
  if (!existsSync(path)) return {}
  const out: Record<string, string> = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  return out
}

const env = { ...readEnv(resolve('services/server/.env')), ...process.env }
const key = env.IRIS_CONTROL_KEY || ''
const host = !env.IRIS_HOST || env.IRIS_HOST === '0.0.0.0' ? '127.0.0.1' : env.IRIS_HOST
const base = (env.IRIS_URL || `http://${host}:${env.IRIS_PORT || 33030}`).replace(/\/$/, '')

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({})) as T & { error?: { code?: string; message?: string } }
  if (!res.ok) throw new Error(`${path} ${res.status}: ${json.error?.code ?? ''} ${json.error?.message ?? ''}`.trim())
  return json
}

interface Device { id: string; label: string; level: string; lastSeen: number; version?: string }
interface Tab { id: number; title?: string; url?: string; active?: boolean }

async function main() {
  if (!label) {
    console.error('Usage: pnpm check-device <label> [url]')
    process.exit(2)
  }
  if (!key) {
    console.error('IRIS_CONTROL_KEY is not set (services/server/.env or the environment)')
    process.exit(2)
  }
  console.log(`server ${base}`)

  const { devices } = await api<{ devices: Device[] }>('/devices')
  const device = devices.find(d => d.label === label || d.id === label)
  if (!device) {
    console.error(`${label} is not connected. Connected: ${devices.map(d => d.label || d.id).join(', ') || 'none'}`)
    process.exit(1)
  }
  console.log(`device ${device.label} (${device.id}) version ${device.version ?? 'unknown'} level ${device.level} seen ${Math.round((Date.now() - device.lastSeen) / 1000)}s ago`)

  const tabs = await api<Tab[] | { tabs: Tab[] }>('/call', { method: 'browser.list_tabs', params: {}, device: device.id, timeout: 30 })
  const list = Array.isArray(tabs) ? tabs : tabs.tabs ?? []
  console.log(`list_tabs: ${list.length} tabs`)
  for (const tab of list) console.log(`  ${tab.active ? '*' : ' '} ${tab.id} ${tab.title ?? ''} — ${tab.url ?? ''}`)

  const page = await api<{ title?: string; url?: string; content?: string; text?: string }>('/call', {
    method: 'browser.fetch', params: { url: pageUrl, extract: 'text' }, device: device.id, timeout: 60,
  })
  const text = page.content ?? page.text ?? ''
  console.log(`browser.fetch ${pageUrl}: "${page.title ?? ''}", ${text.length} chars`)
  if (!text) process.exit(1)
}

main().catch(error => {
  console.error((error as Error).message)
  process.exit(1)
})
