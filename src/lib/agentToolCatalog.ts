import type { ListedTool, ToolCtx, ToolDef } from './tools/shared'
import { pageToolDefs } from './tools/page'
import { scriptsToolDefs } from './tools/scripts'
import { skillsToolDefs } from './tools/skills'
import { reportsToolDefs } from './tools/reports'
import { tabsToolDefs } from './tools/tabs'
import { automationToolDefs } from './tools/automation'

export type { ListedTool, ToolCtx } from './tools/shared'
export { executePageWebmcp, listPageWebmcp, type SiteTool } from './webmcp'

const TOOLS: ToolDef[] = [...pageToolDefs, ...scriptsToolDefs, ...skillsToolDefs, ...reportsToolDefs, ...tabsToolDefs, ...automationToolDefs]

const byName = new Map<string, ToolDef>()
for (const tool of TOOLS) {
  byName.set(tool.name, tool)
  tool.aliases?.forEach(alias => byName.set(alias, tool))
}

export function listAgentTools(): ListedTool[] {
  return TOOLS.map(({ name, description, group, needsTab, inputSchema }) => ({ name, description, group, needsTab, inputSchema }))
}

export async function callAgentTool(name: string, params: Record<string, unknown>, ctx: ToolCtx = {}): Promise<unknown> {
  const tool = byName.get(name)
  if (!tool) throw new Error(`Unknown tool: ${name}`)
  return tool.run(params, ctx)
}

export function hasAgentTool(name: string): boolean {
  return byName.has(name)
}
