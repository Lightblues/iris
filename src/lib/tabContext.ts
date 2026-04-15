import type { TabAgentMessage, TabAgentResponse } from './types'
import { TAB_AGENT_SYSTEM_PROMPT } from './tabTools'

export async function getTabsContext(): Promise<string> {
  return new Promise((resolve) => {
    const message: TabAgentMessage = {
      type: 'tab_agent_action',
      action: 'query_tabs',
      params: { limit: 30, sort: 'recent' }
    }

    chrome.runtime.sendMessage(message, (response: TabAgentResponse) => {
      if (chrome.runtime.lastError) {
        console.error('[TabContext] Failed to get tabs:', chrome.runtime.lastError)
        resolve('Failed to load tabs context')
        return
      }

      if (!response?.success || !response.data?.tabs) {
        resolve('No tabs available')
        return
      }

      const tabs = response.data.tabs
      const context = `Current open tabs (${tabs.length} total):\n\n` +
        tabs.map((t: any, i: number) =>
          `${i + 1}. [ID:${t.id}] ${t.title}\n` +
          `   Domain: ${t.domain}\n` +
          `   ${t.groupName ? `Group: ${t.groupName}\n` : ''}` +
          `   ${t.pinned ? '📌 Pinned ' : ''}${t.audible ? '🔊 Playing ' : ''}${t.active ? '⭐ Active' : ''}\n`
        ).join('\n')

      resolve(context)
    })
  })
}

export function getTabAgentSystemPrompt(): string {
  return TAB_AGENT_SYSTEM_PROMPT
}
