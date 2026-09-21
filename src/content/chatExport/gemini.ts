import type { ChatPlatformAdapter, FetchedConversation, ChatSessionSummary } from './types'

// Gemini has no REST API — its web app talks over Google's `batchexecute` RPC.
// Everything below was verified against a live session (2026-08):
//
//   POST /_/BardChatUi/data/batchexecute?rpcids=<id>&bl=<build>&rt=c&...
//   body: at=<SNlM0e>&f.req=[[[<rpcid>,"<json payload>",null,"generic"]]]
//
//   MaZiqc (list): payload [pageSize, pageToken|null, [0, null, 1]]
//       -> [null, <nextPageToken>, [ entry, ... ]]
//            entry = [cid, title, _,_,_, [sec, nanos], ...]
//     NOTE: third arg MUST start with 0; [1,null,1] returns empty.
//   hNvQHb (read): payload [cid, limit, null, 1, [1], [4], null, 1]
//
// Response transport is `)]}'` + length-prefixed NDJSON wrapping arrays whose
// third element is a JSON *string*. Unwrapping that is lossless, so the parsed
// nested array IS the raw payload — we store it without normalising.

const BATCH_URL = '/_/BardChatUi/data/batchexecute'
const RPC_LIST = 'MaZiqc'
const RPC_READ = 'hNvQHb'
const CONV_RE = /\/app\/(c_[0-9a-f]+)/i
const PAGE_SIZE = 50

// Titles live only in the list response, never in the read payload — cache them
// so fetchConversation() can label files correctly.
const titleCache = new Map<string, { title: string; updatedAt?: number }>()

let auth: { at: string; bl?: string; ts: number } | null = null
const AUTH_TTL = 5 * 60 * 1000
let reqid = Math.floor((Date.now() / 1000) % 100000)

/**
 * Extract the SNlM0e token (and build label) from the page HTML.
 * A content script runs in an isolated world and cannot read the page's
 * `window.WIZ_global_data`, so this must go through the DOM/HTML text.
 */
async function getAuth(): Promise<{ at: string; bl?: string }> {
  if (auth && Date.now() - auth.ts < AUTH_TTL) return auth

  const scan = (html: string) => ({
    at: html.match(/"SNlM0e":"([^"]+)"/)?.[1],
    bl: html.match(/"cfb2h":"([^"]+)"/)?.[1],
  })

  let found = scan(document.documentElement.innerHTML)
  if (!found.at) {
    // Fallback: the token may not be inline on SPA-navigated views.
    const res = await fetch('/app', { credentials: 'include' })
found = scan(await res.text())
  }
  if (!found.at) {
    throw new Error('Gemini auth token (SNlM0e) not found — are you logged in?')
  }

  auth = { at: found.at, bl: found.bl, ts: Date.now() }
  return auth
}

/** Unwrap `)]}'`-prefixed length-delimited NDJSON and return the rpc payload. */
function parseBatchResponse(text: string, rpcid: string): any {
  for (const line of text.replace(/^\)\]\}'\n?/, '').split('\n')) {
    const s = line.trim()
    if (s[0] !== '[') continue
    try {
      for (const item of JSON.parse(s)) {
        if (
     Array.isArray(item) && item[0] === 'wrb.fr' &&
          item[1] === rpcid && typeof item[2] === 'string'
  ) {
          return JSON.parse(item[2])
        }
   }
    } catch { /* not a frame line */ }
  }
  return null
}

async function rpc(rpcid: string, payload: any): Promise<any> {
  const { at, bl } = await getAuth()

  const qs = new URLSearchParams({
    rpcids: rpcid,
    'source-path': '/app',
    hl: 'en',
    _reqid: String((reqid += 100000)),
    rt: 'c',
})
  // Build label changes daily — always read it from the page, never hardcode.
  if (bl) qs.set('bl', bl)

  const res = await fetch(`${BATCH_URL}?${qs}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({
      'f.req': JSON.stringify([[[rpcid, JSON.stringify(payload), null, 'generic']]]),
      at,
    }),
  })
  if (!res.ok) throw new Error(`Gemini RPC ${rpcid} failed (${res.status})`)

  const data = parseBatchResponse(await res.text(), rpcid)
  if (data == null) {
    auth = null // token may have rotated; force a re-read next call
    throw new Error(`Gemini RPC ${rpcid}: unexpected response envelope`)
}
  return data
}

/** First user prompt, used as a title when the list cache has no entry. */
function firstPromptTitle(raw: any): string | undefined {
  const t = raw?.[0]?.[0]?.[2]?.[0]?.[0]
  if (typeof t !== 'string' || !t.trim()) return undefined
  const one = t.replace(/\s+/g, ' ').trim()
  return one.length > 60 ? one.slice(0, 60) + '…' : one
}

export const geminiAdapter: ChatPlatformAdapter = {
  id: 'gemini',
  label: 'Gemini',

  match(url: string): boolean {
    return /^https?:\/\/gemini\.google\.com\//.test(url)
  },

  currentConversationId(url: string): string | null {
    const m = url.match(CONV_RE)
    return m ? m[1] : null
  },

  async fetchConversation(id: string): Promise<FetchedConversation> {
    const data = await rpc(RPC_READ, [id, 100, null, 1, [1], [4], null, 1])
    const cached = titleCache.get(id)
    return {
      title: cached?.title || firstPromptTitle(data) || 'Untitled',
      updatedAt: cached?.updatedAt,
      // Provenance wrapper: the nested arrays are not self-describing, and the
      // title is unrecoverable from `data` alone, so keeping both loses nothing.
raw: {
        _format: 'gemini/batchexecute',
    _rpcid: RPC_READ,
     cid: id,
        title: cached?.title ?? null,
        updatedAt: cached?.updatedAt ?? null,
 data,
 },
 }
},

  async listConversations(): Promise<ChatSessionSummary[]> {
    const out: ChatSessionSummary[] = []
    const seen = new Set<string>()
 let token: string | null = null

    for (let page = 0; page < 200; page++) {
      const data = await rpc(RPC_LIST, [PAGE_SIZE, token, [0, null, 1]])
   const entries: any[] = data?.[2] || []
      if (entries.length === 0) break

      const sizeBefore = seen.size
      for (const e of entries) {
        const id = e?.[0]
        if (typeof id !== 'string' || seen.has(id)) continue
        seen.add(id)
        // e[5] = [seconds, nanos]
        const secs = Array.isArray(e?.[5]) ? e[5][0] : undefined
        const updatedAt = typeof secs === 'number' ? secs : undefined
   const title = typeof e?.[1] === 'string' ? e[1] : undefined
        if (title || updatedAt) titleCache.set(id, { title: title || 'Untitled', updatedAt })
        out.push({ id, title, updatedAt })
      }

      const next = data?.[1]
      if (typeof next !== 'string' || !next) break
      if (seen.size === sizeBefore) break // no progress — stop rather than loop
      token = next
    }

    if (out.length === 0) throw new Error('No Gemini conversations returned')
    console.log(`[Iris] Gemini: ${out.length} conversations`)
    return out
  },
}
