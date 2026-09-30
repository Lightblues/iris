import assert from 'node:assert/strict'
import { test } from 'node:test'
import { convertToModelMessages, jsonSchema, tool, validateUIMessages } from 'ai'
import { convertToLanguageModelPrompt } from 'ai/internal'
import { repairChatMessages } from './repairMessages.ts'

const tools = {
  take_screenshot: tool({
    description: 'Capture the tab',
    inputSchema: jsonSchema({ type: 'object', properties: {}, additionalProperties: true }),
    execute: async () => ({ ok: true }),
  }),
}
const known = new Set(Object.keys(tools))

const broken = [
  { id: 'u0', role: 'user' as const, parts: [{ type: 'text', text: 'look at this page' }] },
  {
    id: 'a1',
    role: 'assistant' as const,
    parts: [
      { type: 'tool-screenshot', toolCallId: 'call-unknown', state: 'input-available', input: undefined },
      { type: 'tool-take_screenshot', toolCallId: 'call-abort', state: 'input-streaming', input: { partial: true } },
      { type: 'tool-read_page', toolCallId: 'call-done', state: 'output-available', input: {}, output: { text: 'hello' } },
    ],
  },
]

test('closes unknown and aborted tool calls before the next send', async () => {
  await assert.rejects(
    () => validateUIMessages({ messages: broken, tools }),
    /No tool schema found for tool part screenshot/,
  )

  const repaired = repairChatMessages(broken, known)
  const assistant = repaired[1].parts as Array<Record<string, unknown>>
  assert.equal(assistant[0].type, 'dynamic-tool')
  assert.equal(assistant[0].toolName, 'screenshot')
  assert.equal(assistant[0].state, 'output-error')
  assert.match(String(assistant[0].errorText), /not available/)
  assert.equal(assistant[1].state, 'output-error')
  assert.equal(assistant[1].errorText, 'Cancelled.')
  assert.equal(assistant[1].input, undefined)
  assert.equal(assistant[2].type, 'dynamic-tool')
  assert.equal(assistant[2].state, 'output-available')
  assert.deepEqual(assistant[2].output, { text: 'hello' })

  const validated = await validateUIMessages({
    messages: [...repaired, { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'continue' }] }],
    tools,
  })
  const modelMessages = await convertToModelMessages(validated, { tools })
  await convertToLanguageModelPrompt({
    prompt: { messages: modelMessages },
    supportedUrls: {},
    download: undefined,
  })
})

test('leaves a finished known tool call unchanged', () => {
  const messages = [{
    id: 'a',
    role: 'assistant' as const,
    parts: [{ type: 'tool-take_screenshot', toolCallId: 'c', state: 'output-available', input: {}, output: { ok: true } }],
  }]
  assert.equal(repairChatMessages(messages, known), messages)
})
