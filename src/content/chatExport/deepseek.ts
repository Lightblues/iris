import type { ChatPlatformAdapter, FetchedConversation } from './types'

// DeepSeek has no official export API; these are its internal web endpoints,
// verified against a live session:
//   GET /api/v0/chat/history_messages?chat_session_id=<id>  → one conversation
//   GET /api/v0/chat_session/fetch_page?count=N[&before=<seq_id>] → session list
// Auth is a Bearer token in localStorage (key `userToken`), not cookies.
// The list response is { data: { biz_data: { chat_sessions[], has_more } } };
// sessions are ordered by seq_id desc and carry no `total`.

const CONV_RE = /\/a\/chat\/s\/([0-9a-f-]{36})/i
const NO_TOKEN =
  'DeepSeek auth token not found — make sure you are logged in at chat.deepseek.com.'

// Probe known keys first, then scan for a token-shaped value. Values may be a
// JSON envelope or a bare string, so both forms are handled.
function findToken(): string | null {
  for (const k of ['userToken', 'DeepSeekToken', 'token']) {
    const t = extractToken(localStorage.getItem(k))
  if (t) return t
  }
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key) continue
    const t = extractToken(localStorage.getItem(key))
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
    throw new Error(`DeepSeek API error: ${json.msg || json.code}`)
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
      title: meta?.title || 'Untitled',
      createTime: typeof meta?.inserted_at === 'number' ? meta.inserted_at : undefined,
      raw,
    }
  },

  async listConversationIds(): Promise<string[]> {
    const ids: string[] = []
    const seen = new Set<string>()
    const count = 100
    let before: number | undefined

    // Page backwards from the smallest seq_id seen so far; `has_more` terminates.
    for (let page = 0; page < 500; page++) {
      const qs = new URLSearchParams({ count: String(count) })
      if (before !== undefined) qs.set('before', String(before))
      const json = await apiGet(`/api/v0/chat_session/fetch_page?${qs}`)

      const bd = json?.data?.biz_data
      const sessions: any[] = bd?.chat_sessions || []
      if (sessions.length === 0) break

      const sizeBefore = seen.size
      for (const s of sessions) {
        const id = s?.id
     if (id && !seen.has(id)) { seen.add(id); ids.push(id) }
      }

      if (bd?.has_more === false) break

      // Page yielded nothing new → the cursor param was ignored by the server.
      // Stop instead of re-fetching page 1 forever.
 if (seen.size === sizeBefore) {
        console.warn(
        `[Iris] DeepSeek pagination stalled at ${ids.length} conversations ` +
          `(cursor "before" may be the wrong param name)`,
        )
 break
      }

      const next = sessions[sessions.length - 1]?.seq_id
      if (typeof next !== 'number' || next === before) break
   before = next
    }

    if (ids.length === 0) throw new Error('No DeepSeek conversations returned')
    return ids
  },
}
