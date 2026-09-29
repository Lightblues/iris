import { jsonSchema, tool } from 'ai'
import { listAgentTools, callAgentTool, type ToolCtx } from './agentToolCatalog'
import { screenshotToModelOutput } from './screenshotStore'

const ALIASES: Record<string, string> = { query_tabs: 'list_tabs' }

export function bindAgentTools(resolveTab: () => number): Record<string, unknown> {
  const tools: Record<string, unknown> = {}
  for (const spec of listAgentTools()) {
    const wrapped = tool({
      description: spec.description,
      inputSchema: jsonSchema(spec.inputSchema as any),
      execute: async (params: any) => {
        const ctx: ToolCtx = { tabId: typeof params?.tabId === 'number' ? params.tabId : resolveTab() }
        return callAgentTool(spec.name, params ?? {}, ctx)
      },
      ...(spec.name === 'take_screenshot' ? { toModelOutput: ({ output }) => screenshotToModelOutput(output) } : {}),
    })
    tools[spec.name] = wrapped
  }
  for (const [alias, name] of Object.entries(ALIASES)) tools[alias] = tools[name]
  return tools
}
