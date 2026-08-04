import type { ChatExportPlatform } from '@/lib/types'

export interface FetchedConversation {
  title: string
  createTime?: number   // unix seconds
  raw: any      // raw platform API JSON, stored verbatim
}

// A platform adapter runs INSIDE a content script on the platform's own origin,
// so same-origin fetch() carries the user's cookies + first-party auth for free.
export interface ChatPlatformAdapter {
  id: ChatExportPlatform
  label: string
  /** True when the current page belongs to this platform. */
  match(url: string): boolean
  /** Conversation id from the current URL, or null if not on a conversation page. */
  currentConversationId(url: string): string | null
  /** Fetch one conversation's raw API payload. */
  fetchConversation(id: string): Promise<FetchedConversation>
  /** All conversation ids for the logged-in user (paginated), for export-all. */
  listConversationIds(): Promise<string[]>
}
