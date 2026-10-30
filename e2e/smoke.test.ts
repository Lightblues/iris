// Headless smoke test: the built extension in Playwright Chromium against a local Iris server on PGlite.
// The browser profile is fresh and only ever points at 127.0.0.1, never the real server.

import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { after, before, test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { chromium, type BrowserContext, type Page } from 'playwright'
import { startServer } from '../services/server/src/index.ts'
import { DEFAULT_USER, openStore, type Db } from '../services/server/src/store.ts'

const DIST = resolve('dist')
const DEVICE = 'e2e-device-token'
const READ = 'e2e-read-key'
const SETTINGS = 'sidepanel_settings'

function pgliteDb(): Db {
  const pg = new PGlite()
  const wrap = (q: { query: PGlite['query']; exec: PGlite['exec'] }) => async (text: string, params?: unknown[]) => {
    if (params?.length) return await q.query(text, params) as never
    const results = await q.exec(text)
    return { rows: results.at(-1)?.rows ?? [] } as never
  }
  return { query: wrap(pg), tx: fn => pg.transaction(tx => fn(wrap(tx as never))), close: () => pg.close() }
}

async function until<T>(what: string, probe: () => Promise<T | undefined | null | false>, ms = 20_000): Promise<T> {
  const end = Date.now() + ms
  for (;;) {
    const value = await probe()
    if (value) return value
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`)
    await new Promise(r => setTimeout(r, 250))
  }
}

let db: Db
let server: Awaited<ReturnType<typeof startServer>>
let context: BrowserContext
let panel: Page
let profile: string

before(async () => {
  db = pgliteDb()
  server = await startServer({ deviceToken: DEVICE, readKey: READ, host: '127.0.0.1', port: 0, db })
  await openStore(db).push(DEFAULT_USER, [{ kind: 'setting', id: 'baseUrl', baseRev: 0, updatedAt: 1, body: { value: 'https://e2e.invalid/v1' } }])

  profile = mkdtempSync(join(tmpdir(), 'iris-e2e-'))
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  })
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
  const extensionId = new URL(worker.url()).host
  panel = await context.newPage()
  await panel.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`)
})

after(async () => {
  await context?.close()
  await server?.close()
  if (profile) rmSync(profile, { recursive: true, force: true })
})

const stored = () => panel.evaluate(async key => (await chrome.storage.local.get(key))[key], SETTINGS) as Promise<Record<string, unknown> | undefined>

test('the side panel renders', async () => {
  await panel.getByTitle('Settings').first().waitFor({ timeout: 15_000 })
})

test('a settings edit in the panel is saved', async () => {
  await panel.getByTitle('Settings').first().click()
  await panel.getByText('sk-or-... or sk-...').first().click()
  await panel.getByPlaceholder('sk-or-... or sk-...').fill('e2e-key')
  await until('the saved API key', async () => (await stored())?.apiKey === 'e2e-key')
  const edited = await panel.evaluate(async () => (await chrome.storage.local.get('sidepanel_settings_edited')).sidepanel_settings_edited) as Record<string, number>
  assert.ok(edited.apiKey > 0, 'the edit is stamped')
})

test('the extension connects to the local server and completes a sync', async () => {
  const url = `http://127.0.0.1:${server.port}`
  await panel.evaluate(async ({ key, url, token }) => {
    const current = (await chrome.storage.local.get(key))[key] as Record<string, unknown>
    await chrome.storage.local.set({ [key]: { ...current, browserRelayEnabled: false, remoteRelayEnabled: true, remoteRelayUrl: url, remoteRelayToken: token, remoteRelayLabel: 'e2e' } })
  }, { key: SETTINGS, url, token: DEVICE })

  const devices = await until('the device on /devices', async () => {
    const res = await fetch(`${url}/devices`, { headers: { authorization: `Bearer ${READ}` } })
    const body = await res.json() as { devices: { label: string; version?: string }[] }
    return body.devices.find(d => d.label === 'e2e')
  })
  const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8')) as { version: string }
  assert.equal(devices.version, manifest.version)

  await until('the API key pushed to the server', async () => {
    const { rows } = await db.query<{ body: { value: string } }>(`SELECT body FROM records WHERE kind = 'setting' AND id = 'apiKey'`)
    return rows[0]?.body.value === 'e2e-key'
  })
  await until('the server baseUrl pulled into storage', async () => (await stored())?.baseUrl === 'https://e2e.invalid/v1')
})
