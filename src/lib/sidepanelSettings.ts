export interface ModelConfig {
  id: string
  name: string
}

export interface SidePanelSettings {
  apiKey: string
  baseUrl: string
  model: string // Selected model ID
  models: ModelConfig[] // User-manageable model list
  usePageContext: boolean
  temperature?: number // LLM temperature (0-2)
  maxOutputTokens?: number // Max output tokens
  maxSteps?: number // Agent loop max steps (default 20)
  phoenixEndpoint?: string // Phoenix tracing endpoint (optional)
  notionToken?: string // Notion integration token
  notionDatabaseId?: string // Notion database ID for notes sync
  notionSyncEnabled?: boolean // Enable/disable auto sync
  fabSitePatterns?: string[] // Glob patterns for FAB visibility (empty = all sites)
  tracingEnabled?: boolean // Enable/disable passive tracing (default true)
  mcpEndpoint?: string // ea-tools MCP server URL (default: http://localhost:8000/sse)
}

const DEFAULT_MODELS: ModelConfig[] = [
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
  { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku' },
  { id: 'openai/gpt-4o', name: 'GPT-4o' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini' },
  { id: 'google/gemini-pro-1.5', name: 'Gemini 1.5 Pro' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat' },
]

export const DEFAULT_SETTINGS: SidePanelSettings = {
  apiKey: '',
  baseUrl: 'https://openrouter.ai/api/v1',
  model: 'anthropic/claude-3.5-sonnet',
  models: DEFAULT_MODELS,
  usePageContext: true,
  phoenixEndpoint: '',
  notionToken: '',
  notionDatabaseId: '',
  notionSyncEnabled: false,
  tracingEnabled: true,
}

const SETTINGS_KEY = 'sidepanel_settings'

export async function loadSettings(): Promise<SidePanelSettings> {
  const result = await chrome.storage.sync.get(SETTINGS_KEY)
  const stored = result[SETTINGS_KEY] as Partial<SidePanelSettings> | undefined

  // Migrate old format if needed
  if (stored && !stored.models) {
    const migrated: SidePanelSettings = {
      ...DEFAULT_SETTINGS,
      ...stored,
      models: DEFAULT_MODELS,
    }
    // If there was a customModel, add it to the list
    const oldCustomModel = (stored as any).customModel
    if (oldCustomModel && oldCustomModel.trim()) {
      migrated.models = [...DEFAULT_MODELS, { id: oldCustomModel, name: oldCustomModel }]
      migrated.model = 'custom' === stored.model ? oldCustomModel : stored.model || DEFAULT_SETTINGS.model
    }
    await saveSettings(migrated)
    return migrated
  }

  return { ...DEFAULT_SETTINGS, ...stored }
}

export async function saveSettings(settings: SidePanelSettings): Promise<void> {
  await chrome.storage.sync.set({ [SETTINGS_KEY]: settings })
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

    // Validate structure
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

    if (!Array.isArray(parsed.models)) {
      return { success: false, error: 'Invalid settings: models must be an array' }
    }

    // Validate each model
    for (const model of parsed.models) {
      if (typeof model !== 'object' || !model.id || !model.name) {
        return { success: false, error: 'Invalid settings: each model must have id and name' }
      }
    }

    // Build validated settings
    const settings: SidePanelSettings = {
      apiKey: parsed.apiKey,
      baseUrl: parsed.baseUrl,
      model: parsed.model,
      models: parsed.models,
      usePageContext: typeof parsed.usePageContext === 'boolean' ? parsed.usePageContext : DEFAULT_SETTINGS.usePageContext,
    }

    return { success: true, settings }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to parse JSON' }
  }
}
