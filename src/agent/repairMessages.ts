const OPEN_TOOL_STATES = new Set([
  'input-streaming',
  'input-available',
  'approval-requested',
  'approval-responded',
])

type Part = {
  type?: string
  toolName?: string
  toolCallId?: string
  state?: string
  input?: unknown
  errorText?: string
  approval?: unknown
}

function toolNameOf(part: Part): string | null {
  if (part.type === 'dynamic-tool') return part.toolName || 'unknown'
  if (typeof part.type === 'string' && part.type.startsWith('tool-')) return part.type.slice(5)
  return null
}

/**
 * Close tool calls the provider would reject on the next turn.
 * Unknown names become dynamic tools so a missing schema does not fail validation.
 * Calls with no result become output-error so the prompt has a matching tool result.
 */
export function repairChatMessages<M extends { role: string; parts: unknown[] }>(
  messages: M[],
  knownTools?: ReadonlySet<string>,
): M[] {
  let changed = false
  const next = messages.map(message => {
    if (message.role !== 'assistant' || message.parts.length === 0) return message
    let partsChanged = false
    const parts: unknown[] = []
    for (const raw of message.parts) {
      const part = raw as Part
      const name = toolNameOf(part)
      if (name == null) {
        parts.push(raw)
        continue
      }
      const known = knownTools == null || knownTools.has(name)
      const open = OPEN_TOOL_STATES.has(part.state ?? '')
      const unknownStatic = !known && typeof part.type === 'string' && part.type.startsWith('tool-')
      if (!open && !unknownStatic) {
        parts.push(raw)
        continue
      }
      if (open && typeof part.toolCallId !== 'string') {
        partsChanged = true
        continue
      }
      partsChanged = true
      const repaired: Part = { ...part }
      if (unknownStatic) {
        repaired.type = 'dynamic-tool'
        repaired.toolName = name
      }
      if (open) {
        repaired.state = 'output-error'
        repaired.errorText = known ? 'Cancelled.' : `Tool "${name}" is not available.`
        if (part.state === 'input-streaming') repaired.input = undefined
        delete repaired.approval
      }
      parts.push(repaired)
    }
    if (!partsChanged) return message
    changed = true
    return { ...message, parts }
  })
  return changed ? next : messages
}
