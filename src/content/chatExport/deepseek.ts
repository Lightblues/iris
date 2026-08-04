import type { ChatPlatformAdapter, FetchedConversation } from './types'

// SCAFFOLD — DeepSeek has no official export and its internal API is UNVERIFIED
// (see research doc: input/KG/sources/research/llm-chat-export-tooling.md).
// URL matching + conversation-id parsing are implemented. The fetch endpoints
// below are best-effort guesses; capture the real requests in devtools and fix
// the paths / auth / response shape. Until then, export throws a clear error.

const CONV_RE = /\/a\/chat\/s\/([0-9a-f-]{36})/i
const NEEDS_VERIFY =
  'DeepSeek export not yet wired: capture the conversation API in devtools and ' +
  'complete src/content/chatExport/deepseek.ts (endpoint/auth/response shape are unverified).'

// DeepSeek uses a Bearer token kept in localStorage (key name observed to change).
function findToken(): string | null {
  const candidates = ['userToken', 'DeepSeekToken', 'token']
  for (const k of candidates) {
    const v = localStorage.getItem(k)
    if (!v) continue
    try {
      const parsed = JSON.parse(v)
  const t = parsed?.value?.token || parsed?.token || parsed?.value
      if (typeof t === 'string') return t
    } catch {
      return v
    }
  }
  return null
}

export const deepseekAdapter: ChatPlatformAdapter = {
  id: 'deepseek',
  label: 'DeepSeek',

  match(url: string): boolean {
    return /^https?:\/\/chat\.deepseek\.com\//.test(url)
  },

  currentConversationId(url: string): string | null {
    const m = url.match(CONV_RE)
    return m ? m[1] : null
  },

  async fetchConversation(id: string): Promise<FetchedConversation> {
  const token = findToken()
    if (!token) throw new Error(NEEDS_VERIFY)
    // Best-effort guess — VERIFY in devtools before trusting.
    const res = await fetch(
      `/api/v0/chat/history_messages?chat_session_id=${encodeURIComponent(id)}`,
      { credentials: 'include', headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) throw new Error(`${NEEDS_VERIFY} (got ${res.status})`)
    const raw = await res.json()
    if (!raw || typeof raw !== 'object') throw new Error(NEEDS_VERIFY)
  return { title: raw?.data?.title || 'Untitled', raw }
  },

  async listConversationIds(): Promise<string[]> {
    throw new Error(NEEDS_VERIFY)
  },
}
