import { automationTools } from '../automationEngine'
import { tabTools } from '../tabTools'

export interface ToolCtx {
  tabId?: number
}

export interface ListedTool {
  name: string
  description: string
  group: string
  needsTab: boolean
  inputSchema: Record<string, unknown>
  permission?: string
}

export interface ToolDef extends ListedTool {
  aliases?: string[]
  run: (params: Record<string, unknown>, ctx: ToolCtx) => Promise<unknown>
}

export const str = (description: string) => ({ type: 'string', description })
export const num = (description: string) => ({ type: 'number', description })
export const bool = (description: string) => ({ type: 'boolean', description })
export const nums = (description: string) => ({ type: 'array', items: { type: 'number' }, description })

export function schema(properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> {
  return { type: 'object', properties, ...(required.length ? { required } : {}) }
}

export const tabField = num('Target tab. Required from the relay; the side panel uses the session tab when omitted.')

export function requireTab(params: Record<string, unknown>, ctx: ToolCtx): number {
  const id = typeof params.tabId === 'number' ? params.tabId : ctx.tabId
  if (typeof id !== 'number' || !Number.isFinite(id) || id <= 0) throw new Error('tabId is required')
  return id
}

export function optTab(params: Record<string, unknown>, ctx: ToolCtx): number | undefined {
  return typeof params.tabId === 'number' ? params.tabId : ctx.tabId
}

export async function auto(action: keyof typeof automationTools, params: object): Promise<unknown> {
  const entry = automationTools[action] as { execute: (p?: any) => Promise<unknown> }
  return entry.execute(params)
}

export async function tabs(action: keyof typeof tabTools, params: object): Promise<any> {
  const entry = tabTools[action] as { execute: (p: any) => Promise<any> }
  return entry.execute(params)
}
