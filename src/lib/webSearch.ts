export interface ExaSearchHit {
  title: string
  url: string
  publishedDate: string
  text: string
}

const EXA_SEARCH_URL = 'https://api.exa.ai/search'
const TEXT_LIMIT = 1000

export function clampNumResults(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 5
  return Math.min(10, Math.max(1, Math.round(value)))
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function trimText(value: unknown): string {
  const text = asString(value)
  return text.length <= TEXT_LIMIT ? text : text.slice(0, TEXT_LIMIT)
}

async function exaErrorMessage(res: Response): Promise<string> {
  const raw = await res.text()
  if (!raw.trim()) return res.statusText || 'request failed'
  try {
    const body = JSON.parse(raw) as { error?: unknown; message?: unknown }
    if (typeof body.error === 'string' && body.error.trim()) return body.error.trim()
    if (body.error && typeof body.error === 'object') {
      const message = (body.error as { message?: unknown }).message
      if (typeof message === 'string' && message.trim()) return message.trim()
    }
    if (typeof body.message === 'string' && body.message.trim()) return body.message.trim()
  } catch { /* Exa sometimes returns plain text */ }
  return raw.trim().slice(0, 300)
}

export async function searchExa(
  query: string,
  options: { numResults?: number } = {},
  deps: { apiKey?: string; fetch?: typeof fetch } = {},
): Promise<ExaSearchHit[]> {
  const apiKey = deps.apiKey?.trim() ?? ''
  if (!apiKey) {
    throw new Error('Exa API key is not set. Add it in Settings → Web Search.')
  }
  const numResults = clampNumResults(options.numResults)
  const doFetch = deps.fetch ?? fetch
  const res = await doFetch(EXA_SEARCH_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      query,
      numResults,
      type: 'auto',
      contents: { text: true },
    }),
  })
  if (!res.ok) {
    const message = await exaErrorMessage(res)
    throw new Error(`Exa search failed (${res.status}): ${message}`)
  }
  const data = await res.json() as { results?: unknown }
  if (!Array.isArray(data.results)) return []
  return data.results.map(row => {
    const hit = row && typeof row === 'object' ? row as Record<string, unknown> : {}
    return {
      title: asString(hit.title),
      url: asString(hit.url),
      publishedDate: asString(hit.publishedDate),
      text: trimText(hit.text),
    }
  })
}
