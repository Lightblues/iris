import { z } from 'zod'
import { tool } from 'ai'
import type { AutomationMessage, AutomationResponse } from './types'

async function callAutomation(action: string, params: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const message: AutomationMessage = { type: 'automation_action', action, params }
    chrome.runtime.sendMessage(message, (response: AutomationResponse) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }
      if (response?.success) resolve(response.data)
      else reject(new Error(response?.error || 'Action failed'))
    })
  })
}

export const automationAgentTools = {
  get_tab_info: tool({
    description: 'Get the current automation tab status (URL, title). Use this at the start to check if there is already a page open from a previous interaction.',
    inputSchema: z.object({}),
    execute: async () => {
      return await callAutomation('get_tab_info', {})
    }
  }),

  navigate: tool({
    description: 'Navigate the automation tab to a URL. Creates a background tab if none exists.',
    inputSchema: z.object({
      url: z.string().describe('The URL to navigate to')
    }),
    execute: async ({ url }) => {
      return await callAutomation('navigate', { url })
    }
  }),

  page_snapshot: tool({
    description: 'Get a structured snapshot of the current page DOM. Use this to understand what is on the page before interacting. Returns a compact tree with tag names, ids, classes, text content, and key attributes.',
    inputSchema: z.object({
      selector: z.string().optional().describe('CSS selector to snapshot a subtree (default: whole page)'),
      maxLength: z.number().optional().default(8000).describe('Max snapshot length in characters')
    }),
    execute: async ({ selector, maxLength }) => {
      return await callAutomation('page_snapshot', { selector, maxLength })
    }
  }),

  click: tool({
    description: 'Click an element on the page by CSS selector.',
    inputSchema: z.object({
      selector: z.string().describe('CSS selector of the element to click')
    }),
    execute: async ({ selector }) => {
      return await callAutomation('click', { selector })
    }
  }),

  type_text: tool({
    description: 'Type text into an input or textarea element.',
    inputSchema: z.object({
      selector: z.string().describe('CSS selector of the input element'),
      text: z.string().describe('Text to type'),
      clearFirst: z.boolean().optional().default(true).describe('Clear existing value before typing')
    }),
    execute: async ({ selector, text, clearFirst }) => {
      return await callAutomation('type_text', { selector, text, clearFirst })
    }
  }),

  extract_data: tool({
    description: 'Extract data from the page. Use "list" mode with a selector to get an array of text from matching elements. Use "table" to parse a table. Use "text" for plain text content.',
    inputSchema: z.object({
      selector: z.string().optional().describe('CSS selector (for list mode: matches all; for text: single element)'),
      extractAs: z.enum(['text', 'html', 'list', 'table']).optional().default('text').describe('Extraction mode')
    }),
    execute: async ({ selector, extractAs }) => {
      return await callAutomation('extract_data', { selector, extractAs })
    }
  }),

  wait_for: tool({
    description: 'Wait for an element or text to appear on the page. Use after navigation or click that triggers dynamic content loading.',
    inputSchema: z.object({
      selector: z.string().optional().describe('CSS selector to wait for'),
      text: z.string().optional().describe('Text content to wait for'),
      timeout: z.number().optional().default(5000).describe('Max wait time in ms (max 15000)')
    }),
    execute: async ({ selector, text, timeout }) => {
      return await callAutomation('wait_for', { selector, text, timeout })
    }
  }),

  scroll: tool({
    description: 'Scroll the page. Provide a selector to scroll to a specific element, or use direction + amount to scroll by pixels.',
    inputSchema: z.object({
      selector: z.string().optional().describe('CSS selector to scroll into view'),
      direction: z.enum(['up', 'down']).optional().default('down').describe('Scroll direction'),
      amount: z.number().optional().default(500).describe('Scroll amount in pixels')
    }),
    execute: async ({ selector, direction, amount }) => {
      return await callAutomation('scroll', { selector, direction, amount })
    }
  }),

  evaluate_js: tool({
    description: 'Execute JavaScript code in the page context. Use as an escape hatch for operations not covered by other tools. The code should be a function body that returns a value.',
    inputSchema: z.object({
      code: z.string().describe('JavaScript code to execute (function body, use return for results)')
    }),
    execute: async ({ code }) => {
      return await callAutomation('evaluate_js', { code })
    }
  }),

  take_screenshot: tool({
    description: 'Take a screenshot of the visible area of the automation tab. Note: this briefly switches to the automation tab and back.',
    inputSchema: z.object({}),
    execute: async () => {
      return await callAutomation('take_screenshot', {})
    }
  }),
}
