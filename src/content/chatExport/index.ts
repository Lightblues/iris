import type { ChatPlatformAdapter } from './types'
import { chatgptAdapter } from './chatgpt'
import { deepseekAdapter } from './deepseek'
import { geminiAdapter } from './gemini'

export type { ChatPlatformAdapter, FetchedConversation } from './types'

export const chatExportAdapters: ChatPlatformAdapter[] = [
  chatgptAdapter,
  deepseekAdapter,
  geminiAdapter,
]

export function getAdapterForUrl(url: string): ChatPlatformAdapter | null {
  return chatExportAdapters.find(a => a.match(url)) || null
}
