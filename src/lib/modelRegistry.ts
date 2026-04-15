import type { ModelConfig } from './sidepanelSettings'

// --- In-memory cache ---
let cachedModels: ModelConfig[] | null = null
let cacheTimestamp = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Fetch available models from the provider's /v1/models endpoint.
 * Caches results in memory for CACHE_TTL.
 */
export async function fetchModels(
  baseUrl: string,
  apiKey: string,
  options?: { force?: boolean },
): Promise<ModelConfig[]> {
  // Return cache if still fresh
  if (!options?.force && cachedModels && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedModels
  }

  // Normalize base URL: strip /v1 suffix if present, we'll add /v1/models
  const base = baseUrl.replace(/\/v1\/?$/, '').replace(/\/$/, '')
  const url = `${base}/v1/models`

  const headers: Record<string, string> = {
    'Accept': 'application/json',
  }
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  const res = await fetch(url, { headers })
  if (!res.ok) {
    throw new Error(`Failed to fetch models: ${res.status} ${res.statusText}`)
  }

  const json = await res.json()

  // OpenAI-compatible format: { data: [{ id: "model-id", ... }] }
  const data = json.data
  if (!Array.isArray(data)) {
    throw new Error('Invalid response: expected { data: [...] }')
  }

  const models: ModelConfig[] = data
    .map((m: any) => ({
      id: String(m.id),
      name: String(m.id), // Use ID as display name (provider APIs rarely have better names)
    }))
    .sort((a: ModelConfig, b: ModelConfig) => a.id.localeCompare(b.id))

  // Update cache
  cachedModels = models
  cacheTimestamp = Date.now()

  return models
}

/** Get cached models without fetching. Returns empty array if no cache. */
export function getCachedModels(): ModelConfig[] {
  return cachedModels ?? []
}

/** Clear the model cache. */
export function clearModelCache(): void {
  cachedModels = null
  cacheTimestamp = 0
}
