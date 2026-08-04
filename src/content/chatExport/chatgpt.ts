import type { ChatPlatformAdapter, FetchedConversation } from './types'

const CONV_RE = /\/c\/([0-9a-f-]{36})/i

// Cache the bearer token for the duration of a batch export.
let cachedToken: { value: string; at: number } | null = null
const TOKEN_TTL = 5 * 60 * 1000

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() - cachedToken.at < TOKEN_TTL) {
    return cachedToken.value
  }
  const res = await fetch('/api/auth/session', { credentials: 'include' })
  if (!res.ok) throw new Error(`ChatGPT auth session failed (${res.status}) — are you logged in?`)
  const data = await res.json()
  const token = data?.accessToken
  if (!token) throw new Error('ChatGPT access token not found in /api/auth/session')
  cachedToken = { value: token, at: Date.now() }
  return token
}

async function apiGet(path: string): Promise<any> {
  const token = await getAccessToken()
  const res = await fetch(`/backend-api${path}`, {
    credentials: 'include',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`ChatGPT API ${path} failed (${res.status})`)
  return res.json()
}

export const chatgptAdapter: ChatPlatformAdapter = {
  id: 'chatgpt',
  label: 'ChatGPT',

  match(url: string): boolean {
    return /^https?:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(url)
  },

  currentConversationId(url: string): string | null {
    const m = url.match(CONV_RE)
    return m ? m[1] : null
  },

  async fetchConversation(id: string): Promise<FetchedConversation> {
    const raw = await apiGet(`/conversation/${id}`)
    return {
      title: raw?.title || 'Untitled',
      createTime: typeof raw?.create_time === 'number' ? raw.create_time : undefined,
      raw,
    }
  },

  async listConversationIds(): Promise<string[]> {
    const ids: string[] = []
    const limit = 28
    let offset = 0
    // Guard against runaway pagination.
    for (let page = 0; page < 400; page++) {
   const data = await apiGet(`/conversations?offset=${offset}&limit=${limit}&order=updated`)
      const items: any[] = data?.items || []
      if (items.length === 0) break
 for (const it of items) if (it?.id) ids.push(it.id)
      offset += items.length
      const total = typeof data?.total === 'number' ? data.total : undefined
   if (total !== undefined && offset >= total) break
      if (items.length < limit) break
    }
    return ids
  },
}
