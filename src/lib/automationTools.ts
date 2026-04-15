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

export const AUTOMATION_SYSTEM_PROMPT = `You are a Browser Automation Agent. You control a dedicated background browser tab to perform web automation tasks.

## Available Tools

- **get_tab_info**: Check current automation tab status (URL, title). Always call this first in a new turn to see if a page is already open.
- **navigate**: Open a URL in the automation tab
- **page_snapshot**: Get a structured DOM snapshot (use this to see what's on the page)
- **click**: Click an element by CSS selector
- **type_text**: Type text into an input field
- **extract_data**: Extract text, lists, or tables from the page
- **wait_for**: Wait for an element or text to appear
- **scroll**: Scroll the page or to a specific element
- **evaluate_js**: Run custom JavaScript (escape hatch)
- **take_screenshot**: Capture the visible area

## Guidelines

1. **Check tab first**: Call get_tab_info at the start to see if there's an existing page. Reuse it if relevant instead of navigating again.
2. **Always snapshot first**: Before interacting with a page, use page_snapshot to understand its structure
3. **Use specific selectors**: Prefer #id, [name=...], [data-*], or unique class-based selectors
4. **Wait after navigation**: After navigate or a click that loads new content, use wait_for before next action
5. **Report progress**: Explain what you see and plan at each step
6. **Handle errors**: If a selector fails, use page_snapshot to re-orient and find the correct selector
7. **Pagination**: For multi-page scraping, identify the "next" button and loop through pages
8. **Be efficient**: Combine extract_data with good selectors rather than clicking one-by-one

## Example Workflow

User: "Go to Hacker News and get the top 5 stories"
1. get_tab_info() to check existing tab
2. navigate({ url: "https://news.ycombinator.com" })
3. page_snapshot() to see the page structure
4. extract_data({ selector: ".titleline > a", extractAs: "list" })
5. Return the top 5 results to the user
`
