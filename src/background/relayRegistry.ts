export interface RelayParamSchema {
  name: string
  type: 'string' | 'number' | 'boolean' | 'string[]'
  required?: boolean
  description: string
}

export interface RelayMethodSchema {
  name: string
  description: string
  params: RelayParamSchema[]
  streams?: boolean
}

export class RelayError extends Error {
  code: string
  schema?: RelayMethodSchema
  methods?: RelayMethodSchema[]

  constructor(code: string, message: string, extra?: { schema?: RelayMethodSchema; methods?: RelayMethodSchema[] }) {
    super(message)
    this.name = 'RelayError'
    this.code = code
    this.schema = extra?.schema
    this.methods = extra?.methods
  }
}

export type RelayChunk = (result: unknown) => void
export type RelayHandler = (params: Record<string, unknown>, chunk: RelayChunk) => Promise<unknown>

interface RelayEntry {
  handler: RelayHandler
  schema: RelayMethodSchema
}

const handlers = new Map<string, RelayEntry>()

export function registerRelayMethod(
  name: string,
  handler: RelayHandler,
  doc: Omit<RelayMethodSchema, 'name'>,
): void {
  handlers.set(name, { handler, schema: { name, ...doc } })
}

export function listRelaySchemas(): RelayMethodSchema[] {
  return [...handlers.values()].map(entry => entry.schema).sort((a, b) => a.name.localeCompare(b.name))
}

export function listRelayMethods(): string[] {
  return listRelaySchemas().map(schema => schema.name)
}

export async function callRelayMethod(
  name: string | undefined,
  params: Record<string, unknown>,
  chunk: RelayChunk,
): Promise<unknown> {
  if (!name) throw new RelayError('invalid_params', 'method is required')
  const entry = handlers.get(name)
  if (!entry) {
    if (!name.includes('.')) throw new Error(`unknown action: ${name}`)
    throw new RelayError('method_not_found', name, { methods: listRelaySchemas() })
  }
  try {
    return await entry.handler(params, chunk)
  } catch (e) {
    if (e instanceof RelayError) {
      if (!e.schema) e.schema = entry.schema
      throw e
    }
    throw new RelayError('internal', (e as Error).message || String(e), { schema: entry.schema })
  }
}
