import { createMCPClient } from '@ai-sdk/mcp'
import { jsonSchema } from 'ai'

export type McpStatus = 'connected' | 'disconnected' | 'connecting' | 'error'
type ToolSet = Record<string, any>

const SCHEMA_SYMBOL = Symbol.for('vercel.ai.schema')

let mcpClient: Awaited<ReturnType<typeof createMCPClient>> | null = null
let cachedTools: ToolSet | null = null
let status: McpStatus = 'disconnected'
let currentUrl: string | null = null
let holdCount = 0
let connectPromise: Promise<ToolSet> | null = null

export function getMcpStatus(): McpStatus { return status }

/** Sanitize JSON Schema for Gemini compatibility (strips anyOf/oneOf, additionalProperties, etc.) */
function sanitizeSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema
  if (Array.isArray(schema)) return schema.map(sanitizeSchema)

  if (schema.anyOf && Array.isArray(schema.anyOf)) {
    const nonNull = schema.anyOf.filter((s: any) => s.type !== 'null')
    if (nonNull.length === 1) {
      const { anyOf, ...rest } = schema
      return sanitizeSchema({ ...rest, ...nonNull[0] })
    }
  }
  if (schema.oneOf && Array.isArray(schema.oneOf)) {
    const nonNull = schema.oneOf.filter((s: any) => s.type !== 'null')
    if (nonNull.length === 1) {
      const { oneOf, ...rest } = schema
      return sanitizeSchema({ ...rest, ...nonNull[0] })
    }
  }

  const result: any = {}
  for (const [key, value] of Object.entries(schema)) {
    if (['$schema', 'additionalProperties', 'title', 'default'].includes(key)) continue
    result[key] = sanitizeSchema(value)
  }
  return result
}

function sanitizeTools(tools: ToolSet): ToolSet {
  const sanitized: ToolSet = {}
  for (const [name, tool] of Object.entries(tools)) {
    const params = tool.parameters
    if (params?.[SCHEMA_SYMBOL]) {
      const rawSchema = params[SCHEMA_SYMBOL].jsonSchema
      sanitized[name] = { ...tool, parameters: jsonSchema(sanitizeSchema(rawSchema)) }
    } else if (params && typeof params === 'object') {
      sanitized[name] = { ...tool, parameters: sanitizeSchema(params) }
    } else {
      sanitized[name] = tool
    }
  }
  console.log('[Agent MCP] Sanitized tool schemas for:', Object.keys(sanitized))
  return sanitized
}

async function openClient(url: string): Promise<ToolSet> {
  const transportType = url.endsWith('/sse') ? 'sse' as const : 'http' as const
  console.log('[Agent MCP] Connecting via', transportType, 'to', url)
  mcpClient = await createMCPClient({ transport: { type: transportType, url } })
  const rawTools = await mcpClient.tools()
  cachedTools = sanitizeTools(rawTools)
  status = 'connected'
  console.log('[Agent MCP] Connected, tools:', Object.keys(cachedTools))
  return cachedTools
}

/** Connect to MCP server and return tools. Shared across Paper sessions; refcounted. */
export async function connectMcp(url: string): Promise<ToolSet> {
  if (status === 'connected' && mcpClient && currentUrl === url) {
    holdCount++
    return cachedTools ?? {}
  }
  if (connectPromise && currentUrl === url) {
    const tools = await connectPromise
    holdCount++
    return tools
  }
  if (holdCount > 0 && currentUrl && currentUrl !== url) {
    throw new Error(`MCP already connected to ${currentUrl}`)
  }

  currentUrl = url
  status = 'connecting'
  connectPromise = openClient(url)
  try {
    const tools = await connectPromise
    holdCount++
    return tools
  } catch (err) {
    console.error('[Agent MCP] Connection failed:', err)
    holdCount = 0
    status = 'error'
    mcpClient = null
    cachedTools = null
    currentUrl = null
    throw err
  } finally {
    connectPromise = null
  }
}

export async function releaseMcp(): Promise<void> {
  if (holdCount <= 0) {
    holdCount = 0
    return
  }
  holdCount--
  if (holdCount === 0) await disconnectMcp()
}

export async function disconnectMcp(): Promise<void> {
  holdCount = 0
  connectPromise = null
  if (mcpClient) {
    try { await mcpClient.close() } catch { /* ignore */ }
    mcpClient = null
  }
  cachedTools = null
  status = 'disconnected'
  currentUrl = null
}

export async function refreshMcpTools(): Promise<ToolSet> {
  if (!mcpClient) return {}
  try {
    const rawTools = await mcpClient.tools()
    cachedTools = sanitizeTools(rawTools)
    return cachedTools
  } catch (err) {
    console.error('[Agent MCP] Refresh failed:', err)
    return cachedTools ?? {}
  }
}
