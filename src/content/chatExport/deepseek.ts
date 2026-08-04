import type { ChatPlatformAdapter, FetchedConversation } from './types'

// DeepSeek has no official export API; these are its internal web endpoints.
// Verified working: /api/v0/chat/history_messages (single conversation).
// /api/v0/chat_session/fetch_page returns 40002 "Missing Token" without auth,
// confirming the path — it needs the same Bearer token as history_messages.

const CONV_RE = /\/a\/chat\/s\/([0-9a-f-]{36})/i
const NO_TOKEN =
  'DeepSeek auth token not found — make sure you are logged in at chat.deepseek.com.'

// Bearer token lives in localStorage; the key name has changed across versions,
// so probe known keys first, then fall back to scanning for a token-shaped value.
function findToken(): string | null {
  const candidates = ['userToken', 'DeepSeekToken', 'token']
  for (const k of candidates) {
    const t = extractToken(localStorage.getItem(k))
    if (t) return t
  }
  // Fallback: scan all keys for an object holding a `token` field.
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key) continue
    const raw = localStorage.getItem(key)
    if (!raw || !raw.includes('token')) continue
    const t = extractToken(raw)
 if (t) return t
  }
  return null
}

function extractToken(v: string | null): string | null {
  if (!v) return null
  try {
    const parsed = JSON.parse(v)
    const t = parsed?.value?.token || parsed?.token || parsed?.value
    return typeof t === 'string' && t.length > 20 ? t : null
  } catch {
    return v.length > 20 ? v : null
  }
}

async function apiGet(path: string): Promise<any> {
  const token = findToken()
  if (!token) throw new Error(NO_TOKEN)
  const res = await fetch(path, {
    credentials: 'include',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`DeepSeek API ${path} failed (${res.status})`)
  const json = await res.json()
  if (json?.code && json.code !== 0) {
    throw new Error(`DeepSeek API ${path} error: ${json.msg || json.code}`)
  }
  return json
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
 const raw = await apiGet(
      `/api/v0/chat/history_messages?chat_session_id=${encodeURIComponent(id)}`,
    )
    const meta = raw?.data?.biz_data?.chat_session
    return {
      title: meta?.title || raw?.data?.title || 'Untitled',
      createTime: typeof meta?.inserted_at === 'number' ? meta.inserted_at : undefined,
      raw,
    }
  },

  async listConversationIds(): Promise<string[]> {
    const ids: string[] = []
    const count = 100
    let before: number | undefined

    // Cursor pagination: each page returns sessions ordered by updated_at desc;
    // `before` is the oldest updated_at seen so far.
for (let page = 0; page < 200; page++) {
      const qs = new URLSearchParams({ count: String(count) })
      if (before !== undefined) qs.set('before', String(before))
      const json = await apiGet(`/api/v0/chat_session/fetch_page?${qs}`)

      const sessions: any[] =
  json?.data?.biz_data?.chat_sessions || json?.data?.chat_sessions || []
      if (sessions.length === 0) break

   let oldest: number | undefined
      for (const s of sessions) {
    const id = s?.id || s?.chat_session_id
     if (id && !ids.includes(id)) ids.push(id)
      const ts = s?.updated_at ?? s?.inserted_at
        if (typeof ts === 'number' && (oldest === undefined || ts < oldest)) oldest = ts
}

      if (sessions.length < count) break
      if (oldest === undefined || oldest === before) break // no cursor progress
      before = oldest
    }

    if (ids.length === 0) throw new Error('No DeepSeek conversations returned')
    return ids
  },
}
