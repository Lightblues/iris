import { RelayCallError, type RelayHub } from './hub.ts'

interface JsonRpc {
  jsonrpc?: string
  id?: number | string | null
  method?: string
  params?: Record<string, unknown>
}

const TOOL = {
  name: 'iris_call',
  description: 'Call a method on a paired Iris browser. Omit device to use the most recently active one.',
  inputSchema: {
    type: 'object',
    properties: {
      method: { type: 'string', description: 'Relay method, for example browser.fetch or iris.tools.call' },
      params: { type: 'object', description: 'Method parameters' },
      device: { type: 'string', description: 'Browser device id from GET /devices' },
      timeout: { type: 'number', description: 'Milliseconds to wait. Default 60000.' },
    },
    required: ['method'],
    additionalProperties: false,
  },
}

export async function handleMcp(body: JsonRpc, hub: RelayHub): Promise<{ status: number; json?: unknown }> {
  if (!body.method) return { status: 400, json: rpcError(body.id ?? null, -32600, 'invalid request') }
  if (body.id == null) return { status: 202 }

  if (body.method === 'initialize') {
    const requested = typeof body.params?.protocolVersion === 'string' ? body.params.protocolVersion : '2025-03-26'
    return {
      status: 200,
      json: {
        jsonrpc: '2.0',
        id: body.id,
        result: {
          protocolVersion: requested,
          capabilities: { tools: {} },
          serverInfo: { name: 'iris-relay', version: '0.1.0' },
        },
      },
    }
  }

  if (body.method === 'ping') {
    return { status: 200, json: { jsonrpc: '2.0', id: body.id, result: {} } }
  }

  if (body.method === 'tools/list') {
    return { status: 200, json: { jsonrpc: '2.0', id: body.id, result: { tools: [TOOL] } } }
  }

  if (body.method === 'tools/call') {
    const args = (body.params?.arguments ?? {}) as { method?: unknown; params?: unknown; device?: unknown; timeout?: unknown }
    if (body.params?.name !== 'iris_call' || typeof args.method !== 'string') {
      return { status: 200, json: { jsonrpc: '2.0', id: body.id, result: toolText('method is required', true) } }
    }
    try {
      const result = await hub.callDevice(
        typeof args.device === 'string' ? args.device : undefined,
        args.method,
        args.params ?? {},
        typeof args.timeout === 'number' ? args.timeout : 60_000,
      )
      return { status: 200, json: { jsonrpc: '2.0', id: body.id, result: toolText(JSON.stringify(result), false) } }
    } catch (error) {
      const message = error instanceof RelayCallError ? error.message : 'call failed'
      const details = error instanceof RelayCallError
        ? { device: error.device, error: error.details ?? { code: error.code, message } }
        : { message }
      return { status: 200, json: { jsonrpc: '2.0', id: body.id, result: toolText(JSON.stringify(details), true) } }
    }
  }

  return { status: 200, json: rpcError(body.id, -32601, `method not found: ${body.method}`) }
}

function toolText(text: string, isError: boolean) {
  return { content: [{ type: 'text', text }], isError }
}

function rpcError(id: number | string | null, code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } }
}
