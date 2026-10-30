import { canonicalJson, editTimesKey } from './sync'

export interface ModelConfig {
  id: string
  name: string
}

export interface SidePanelSettings {
  apiKey: string
  baseUrl: string
  model: string // Default model ID
  models: ModelConfig[] // @deprecated — kept for migration only, replaced by favouriteModels
  favouriteModels: string[] // User's favourite model IDs (ordered)
  usePageContext: boolean
  temperature?: number // LLM temperature (0-2)
  maxOutputTokens?: number // Max output tokens
  maxSteps?: number // Agent loop max steps (default 20)
  phoenixEndpoint?: string // Phoenix tracing endpoint (optional)
  fabSitePatterns?: string[] // Glob blocklist; FAB is hidden except on adapted sites
  tracingEnabled?: boolean // Enable/disable passive tracing (default true)
  mcpEndpoint?: string // ea-tools MCP server URL (default: http://localhost:8000/sse)
  browserRelayEnabled?: boolean // Connect to ea-tools browser relay (default true)
  browserRelayPort?: number // Relay server port (default 33007)
  browserRelayToken?: string // Shared token with ~/.ea/tools/config.yaml
  remoteRelayEnabled?: boolean // Outbound public relay (default off)
  remoteRelayUrl?: string // wss:// or https:// host
  remoteRelayToken?: string
  remoteRelayLabel?: string // Device name, for example home or company
  remoteRelayLevel?: 'off' | 'read' | 'control' // What remote callers may do through this browser (default read)
  exaApiKey?: string // Exa key for web_search. Stored only in chrome.storage.local
}

const DEFAULT_FAVOURITE_MODELS = [
  'anthropic/claude-sonnet-4',
  'anthropic/claude-3.5-sonnet',
  'openai/gpt-4o',
  'google/gemini-2.5-flash',
  'deepseek/deepseek-chat',
]

export const DEFAULT_SETTINGS: SidePanelSettings = {
  apiKey: '',
  baseUrl: 'https://openrouter.ai/api/v1',
  model: 'anthropic/claude-sonnet-4',
  models: [], // deprecated
  favouriteModels: DEFAULT_FAVOURITE_MODELS,
  usePageContext: true,
  phoenixEndpoint: '',
  tracingEnabled: true,
  browserRelayEnabled: true,
  browserRelayPort: 33007,
  browserRelayToken: 'ea-browser-relay-local',
  remoteRelayEnabled: false,
  remoteRelayUrl: '',
  remoteRelayToken: '',
  remoteRelayLabel: '',
  remoteRelayLevel: 'read',
  exaApiKey: '',
}

export const SETTINGS_KEY = 'sidepanel_settings'

// One-time migration from chrome.storage.sync → chrome.storage.local.
// We moved off storage.sync because cold-start reads would occasionally hang
// for seconds (possibly blocking on Chrome Sync reconciliation), freezing the
// side panel at mount time. storage.local is synchronous-enough to be
// reliable on the critical startup path.
let migratedFromSync = false

async function migrateFromSyncOnce(): Promise<Partial<SidePanelSettings> | undefined> {
  if (migratedFromSync) return
  migratedFromSync = true
  try {
    const syncResult = await chrome.storage.sync.get(SETTINGS_KEY)
    const syncValue = syncResult[SETTINGS_KEY] as Partial<SidePanelSettings> | undefined
    if (syncValue) {
      await chrome.storage.local.set({ [SETTINGS_KEY]: syncValue })
      console.log('[Iris] Migrated settings from storage.sync → storage.local')
      return syncValue
    }
  } catch (err) {
    console.warn('[Iris] storage.sync migration failed (non-fatal):', err)
  }
  return
}

export async function loadSettings(): Promise<SidePanelSettings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY)
  let stored = result[SETTINGS_KEY] as Partial<SidePanelSettings> | undefined

  // Back-compat: first run after upgrade — nothing in local yet, check sync.
  // This call is best-effort; if sync hangs, we fall back to defaults.
  if (!stored) {
    stored = await migrateFromSyncOnce()
  }

  if (!stored) return { ...DEFAULT_SETTINGS }

  // Migration: old format had models[] but no favouriteModels
  if (!stored.favouriteModels) {
    const oldModels = stored.models
    const favouriteModels = oldModels && oldModels.length > 0
      ? oldModels.map(m => m.id)
      : DEFAULT_FAVOURITE_MODELS

    const migrated: SidePanelSettings = {
      ...DEFAULT_SETTINGS,
      ...stored,
      favouriteModels,
    }

    // Also handle ancient customModel field
    const oldCustomModel = (stored as any).customModel
    if (oldCustomModel && oldCustomModel.trim() && !favouriteModels.includes(oldCustomModel)) {
      migrated.favouriteModels = [...favouriteModels, oldCustomModel]
      if ('custom' === stored.model) migrated.model = oldCustomModel
    }

    await saveSettings(migrated)
    return migrated
  }

  return { ...DEFAULT_SETTINGS, ...stored }
}

export async function saveSettings(settings: SidePanelSettings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings })
}

/** A user edit: patches the stored copy and stamps each changed field, so sync resolves conflicts by edit time. */
export async function updateSettings(patch: Partial<SidePanelSettings>, at = Date.now()): Promise<SidePanelSettings> {
  const current = await loadSettings()
  const timesKey = editTimesKey(SETTINGS_KEY)
  const times = { ...((await chrome.storage.local.get(timesKey))[timesKey] as Record<string, number> | undefined) }
  for (const [field, value] of Object.entries(patch)) {
    if (canonicalJson(value) !== canonicalJson(current[field as keyof SidePanelSettings])) times[field] = at
  }
  const updated = { ...current, ...patch }
  await chrome.storage.local.set({ [SETTINGS_KEY]: updated, [timesKey]: times })
  return updated
}

export function maskApiKey(key: string): string {
  if (!key || key.length < 10) return key ? '••••••••' : ''
  return `${key.slice(0, 5)}...${key.slice(-4)}`
}

export function exportSettings(settings: SidePanelSettings): string {
  return JSON.stringify(settings, null, 2)
}

export function importSettings(jsonString: string): { success: true; settings: SidePanelSettings } | { success: false; error: string } {
  try {
    const parsed = JSON.parse(jsonString)

    if (typeof parsed !== 'object' || parsed === null) {
      return { success: false, error: 'Invalid JSON: not an object' }
    }

    if (typeof parsed.apiKey !== 'string') {
      return { success: false, error: 'Invalid settings: apiKey must be a string' }
    }

    if (typeof parsed.baseUrl !== 'string') {
      return { success: false, error: 'Invalid settings: baseUrl must be a string' }
    }

    if (typeof parsed.model !== 'string') {
      return { success: false, error: 'Invalid settings: model must be a string' }
    }

    // Build validated settings, handling both old and new formats
    const favouriteModels = Array.isArray(parsed.favouriteModels)
      ? parsed.favouriteModels
      : Array.isArray(parsed.models)
        ? parsed.models.map((m: any) => m.id)
        : DEFAULT_FAVOURITE_MODELS

    const settings: SidePanelSettings = {
      ...DEFAULT_SETTINGS,
      apiKey: parsed.apiKey,
      baseUrl: parsed.baseUrl,
      model: parsed.model,
      models: [], // deprecated
      favouriteModels,
      usePageContext: typeof parsed.usePageContext === 'boolean' ? parsed.usePageContext : DEFAULT_SETTINGS.usePageContext,
      temperature: parsed.temperature,
      maxOutputTokens: parsed.maxOutputTokens,
      maxSteps: parsed.maxSteps,
      phoenixEndpoint: parsed.phoenixEndpoint,
      fabSitePatterns: parsed.fabSitePatterns,
      tracingEnabled: parsed.tracingEnabled,
      mcpEndpoint: parsed.mcpEndpoint,
      browserRelayEnabled: typeof parsed.browserRelayEnabled === 'boolean' ? parsed.browserRelayEnabled : DEFAULT_SETTINGS.browserRelayEnabled,
      browserRelayPort: typeof parsed.browserRelayPort === 'number' ? parsed.browserRelayPort : DEFAULT_SETTINGS.browserRelayPort,
      browserRelayToken: typeof parsed.browserRelayToken === 'string' ? parsed.browserRelayToken : DEFAULT_SETTINGS.browserRelayToken,
      remoteRelayEnabled: typeof parsed.remoteRelayEnabled === 'boolean' ? parsed.remoteRelayEnabled : DEFAULT_SETTINGS.remoteRelayEnabled,
      remoteRelayUrl: typeof parsed.remoteRelayUrl === 'string' ? parsed.remoteRelayUrl : DEFAULT_SETTINGS.remoteRelayUrl,
      remoteRelayToken: typeof parsed.remoteRelayToken === 'string' ? parsed.remoteRelayToken : DEFAULT_SETTINGS.remoteRelayToken,
      remoteRelayLabel: typeof parsed.remoteRelayLabel === 'string' ? parsed.remoteRelayLabel : DEFAULT_SETTINGS.remoteRelayLabel,
      remoteRelayLevel: ['off', 'read', 'control'].includes(parsed.remoteRelayLevel) ? parsed.remoteRelayLevel : DEFAULT_SETTINGS.remoteRelayLevel,
      exaApiKey: typeof parsed.exaApiKey === 'string' ? parsed.exaApiKey : DEFAULT_SETTINGS.exaApiKey,
    }

    return { success: true, settings }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to parse JSON' }
  }
}
