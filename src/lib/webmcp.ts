import { bool, type ListedTool } from './tools/shared'

export interface SiteTool extends ListedTool {
  permission: string
}

function confirmSchema(schemaIn: Record<string, unknown> | undefined, prompt: boolean): Record<string, unknown> {
  const base = schemaIn && schemaIn.type === 'object' ? schemaIn : { type: 'object', properties: {} }
  if (!prompt) return base
  const properties = { ...((base.properties as object) || {}), confirmed: bool('Set true only after the user agrees to run this tool.') }
  return { ...base, properties }
}

export async function listPageWebmcp(tabId: number): Promise<SiteTool[]> {
  let hit: { result?: unknown } | undefined
  try {
    const hits = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN' as const,
      func: async () => {
        const docMc = (document as any).modelContext
        const navMc = (navigator as any).modelContext
        const mc = docMc?.getTools ? docMc : navMc
        if (!mc?.getTools) return []
        const list = await mc.getTools()
        const raw = Array.isArray(list) ? list
          : list && Array.isArray(list.tools) ? list.tools
          : list && typeof list.length === 'number' ? Array.prototype.slice.call(list)
          : []
        const perms = (window as any).__irisWebmcpPerms || {}
        const out = []
        for (const item of raw) {
          if (!item || !item.name) continue
          let inputSchema = { type: 'object', properties: {} }
          const schema = item.inputSchema || item.parameters
          if (schema && typeof schema === 'object') {
            try { inputSchema = JSON.parse(JSON.stringify(schema)) } catch { /* keep empty schema */ }
          }
          out.push({
            name: String(item.name),
            description: String(item.description || item.name),
            inputSchema,
            permission: perms[item.name] || (typeof item.permission === 'string' ? item.permission : 'allow'),
          })
        }
        return out
      },
    })
    hit = hits[0]
  } catch (err) {
    throw new Error(`WebMCP list failed: ${(err as Error).message}`)
  }
  const value = Array.isArray(hit?.result) ? hit.result : []
  return value.filter((item: any) => item?.name).map((item: any) => {
    const permission = item.permission || 'allow'
    return {
      name: item.name,
      description: item.description || item.name,
      group: 'site',
      needsTab: true,
      permission,
      inputSchema: confirmSchema(item.inputSchema, permission === 'prompt'),
    }
  })
}

export async function executePageWebmcp(tabId: number, name: string, args: Record<string, unknown>, prompt = false): Promise<unknown> {
  if (prompt && !args.confirmed) {
    const { confirmed, ...rest } = args
    return { status: 'needs_confirmation', args: rest }
  }
  const { confirmed, ...rest } = args
  const [hit] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN' as const,
    func: async (toolName: string, payload: unknown) => {
      const docMc = (document as any).modelContext
      const navMc = (navigator as any).modelContext
      const mc = docMc?.executeTool ? docMc : navMc
      if (!mc?.executeTool) throw new Error('modelContext missing')
      const value = await mc.executeTool(toolName, payload)
      if (value === undefined) return null
      try { return JSON.parse(JSON.stringify(value)) }
      catch { throw new Error('tool result was not JSON') }
    },
    args: [name, rest],
  })
  return { untrusted: true, result: hit?.result }
}
