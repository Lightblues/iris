import { auto, bool, num, optTab, requireTab, schema, str, tabField, type ToolDef } from './shared'

export const automationToolDefs: ToolDef[] = [
  {
    name: 'navigate',
    group: 'automation',
    needsTab: false,
    description: 'Navigate a tab to a URL. Without tabId, uses the hidden automation tab.',
    inputSchema: schema({ url: str('URL to open'), tabId: tabField }, ['url']),
    async run(params, ctx) {
      if (typeof params.url !== 'string') throw new Error('url is required')
      return auto('navigate', { url: params.url, tabId: optTab(params, ctx) })
    },
  },
  {
    name: 'page_snapshot',
    group: 'automation',
    needsTab: false,
    description: 'Structured snapshot of a page DOM. Without tabId, uses the hidden automation tab.',
    inputSchema: schema({
      selector: str('CSS selector to snapshot a subtree'),
      maxLength: num('Max snapshot length. Default 8000.'),
      tabId: tabField,
    }),
    async run(params, ctx) {
      return auto('page_snapshot', {
        selector: params.selector,
        maxLength: typeof params.maxLength === 'number' ? params.maxLength : 8000,
        tabId: optTab(params, ctx),
      })
    },
  },
  {
    name: 'click',
    group: 'automation',
    needsTab: false,
    description: 'Click an element by CSS selector.',
    inputSchema: schema({ selector: str('CSS selector'), tabId: tabField }, ['selector']),
    async run(params, ctx) {
      if (typeof params.selector !== 'string') throw new Error('selector is required')
      return auto('click', { selector: params.selector, tabId: optTab(params, ctx) })
    },
  },
  {
    name: 'type_text',
    group: 'automation',
    needsTab: false,
    description: 'Type text into an input or textarea.',
    inputSchema: schema({
      selector: str('CSS selector of the input'),
      text: str('Text to type'),
      clearFirst: bool('Clear the existing value first. Default true.'),
      tabId: tabField,
    }, ['selector', 'text']),
    async run(params, ctx) {
      if (typeof params.selector !== 'string' || typeof params.text !== 'string') throw new Error('selector and text are required')
      return auto('type_text', { selector: params.selector, text: params.text, clearFirst: params.clearFirst !== false, tabId: optTab(params, ctx) })
    },
  },
  {
    name: 'extract_data',
    group: 'automation',
    needsTab: false,
    description: 'Extract text, html, a list, or a table from the page.',
    inputSchema: schema({
      selector: str('CSS selector'),
      extractAs: str('text, html, list, or table. Default text.'),
      tabId: tabField,
    }),
    async run(params, ctx) {
      const extractAs = params.extractAs === 'html' || params.extractAs === 'list' || params.extractAs === 'table' ? params.extractAs : 'text'
      return auto('extract_data', { selector: params.selector, extractAs, tabId: optTab(params, ctx) })
    },
  },
  {
    name: 'wait_for',
    group: 'automation',
    needsTab: false,
    description: 'Wait for an element or text to appear.',
    inputSchema: schema({
      selector: str('CSS selector to wait for'),
      text: str('Text to wait for'),
      timeout: num('Max wait in ms. Default 5000, max 15000.'),
      tabId: tabField,
    }),
    async run(params, ctx) {
      return auto('wait_for', {
        selector: params.selector,
        text: params.text,
        timeout: typeof params.timeout === 'number' ? params.timeout : 5000,
        tabId: optTab(params, ctx),
      })
    },
  },
  {
    name: 'scroll',
    group: 'automation',
    needsTab: false,
    description: 'Scroll the page, or scroll an element into view.',
    inputSchema: schema({
      selector: str('CSS selector to scroll into view'),
      direction: str('up or down. Default down.'),
      amount: num('Pixels. Default 500.'),
      tabId: tabField,
    }),
    async run(params, ctx) {
      return auto('scroll', {
        selector: params.selector,
        direction: params.direction === 'up' ? 'up' : 'down',
        amount: typeof params.amount === 'number' ? params.amount : 500,
        tabId: optTab(params, ctx),
      })
    },
  },
  {
    name: 'take_screenshot',
    group: 'screenshot',
    needsTab: true,
    description: 'Capture the visible viewport of a tab as an image the model can see. Defaults to the current session tab. The tab is focused briefly.',
    inputSchema: schema({ tabId: tabField }),
    async run(params, ctx) {
      return auto('take_screenshot', { tabId: requireTab(params, ctx) })
    },
  },
]
