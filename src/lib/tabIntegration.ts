import { tabTools, TAB_AGENT_SYSTEM_PROMPT } from './tabTools'

// Export tab tools for use in AI chat
export { tabTools, TAB_AGENT_SYSTEM_PROMPT }

// Helper to check if a message requests tab management
export function isTabManagementRequest(message: string): boolean {
  const keywords = [
    'tab', 'tabs',
    'organize', 'group', 'close', 'archive',
    'browser', 'window',
    'open page', 'opened',
  ]
  const lower = message.toLowerCase()
  return keywords.some(kw => lower.includes(kw))
}

// Helper to execute tab tools
export async function executeTabTool(toolName: string, params: any): Promise<any> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: 'tab_agent_action',
        action: toolName,
        params
      },
      (response) => {
        if (response?.success) {
          resolve(response.data)
        } else {
          reject(new Error(response?.error || 'Tool execution failed'))
        }
      }
    )
  })
}
