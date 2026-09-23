export class RelayError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'RelayError'
    this.code = code
  }
}

export type RelayChunk = (result: unknown) => void
export type RelayHandler = (params: Record<string, unknown>, chunk: RelayChunk) => Promise<unknown>

const handlers = new Map<string, RelayHandler>()

export function registerRelayMethod(name: string, handler: RelayHandler): void {
  handlers.set(name, handler)
}

export function listRelayMethods(): string[] {
  return [...handlers.keys()].sort()
}

export async function callRelayMethod(
  name: string | undefined,
  params: Record<string, unknown>,
  chunk: RelayChunk,
): Promise<unknown> {
  if (!name) throw new RelayError('invalid_params', 'method is required')
  const handler = handlers.get(name)
  if (!handler) {
    if (!name.includes('.')) throw new Error(`unknown action: ${name}`)
    throw new RelayError('method_not_found', name)
  }
  return handler(params, chunk)
}
