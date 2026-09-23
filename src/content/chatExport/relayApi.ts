import { chatExportAdapters } from './index'

export async function handleIrisChatApi(message: {
  platform?: string
  op?: string
  id?: string
}): Promise<Record<string, unknown>> {
  const adapter = chatExportAdapters.find(a => a.id === message.platform)
  if (!adapter) return { ok: false, error: `unknown platform: ${message.platform}` }
  if (!adapter.match(location.href)) return { ok: false, error: 'this tab is not the requested platform' }

  if (message.op === 'list') {
    return { ok: true, sessions: await adapter.listConversations() }
  }
  if (message.op === 'fetch') {
    if (!message.id) return { ok: false, error: 'id is required' }
    return { ok: true, conversation: await adapter.fetchConversation(message.id) }
  }
  return { ok: false, error: `unknown op: ${message.op}` }
}
