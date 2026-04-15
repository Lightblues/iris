/**
 * Test script: Verify AI SDK ModelMessage format for tool calls across turns.
 *
 * Run: npx tsx test-messages.ts
 *
 * This simulates a 2-turn conversation where:
 * - Turn 1: user asks to query tabs → agent calls query_tabs tool → gets result → responds
 * - Turn 2: user asks to organize → agent should see the previous tool call history
 */
import { z } from 'zod'
import { streamText, tool, stepCountIs, type ModelMessage } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'

const API_KEY = process.env.OPENROUTER_API_KEY
if (!API_KEY) {
  console.error('Set OPENROUTER_API_KEY env var')
  process.exit(1)
}

const MODEL = process.env.MODEL || 'google/gemini-2.5-flash'

const openrouter = createOpenRouter({
  apiKey: API_KEY,
})

// Simple mock tools
const testTools = {
  query_tabs: tool({
    description: 'Query open browser tabs',
    inputSchema: z.object({
      domain: z.string().optional().describe('Filter by domain'),
    }),
    execute: async ({ domain }) => {
      console.log('  [Tool Execute] query_tabs called, domain:', domain)
      return {
        tabs: [
          { id: 1, title: 'GitHub', domain: 'github.com' },
          { id: 2, title: 'Google', domain: 'google.com' },
          { id: 3, title: 'StackOverflow', domain: 'stackoverflow.com' },
        ],
        total: 3,
      }
    },
  }),
  create_tab_group: tool({
    description: 'Create a tab group',
    inputSchema: z.object({
      tabIds: z.array(z.number()).describe('Tab IDs'),
      title: z.string().describe('Group name'),
    }),
    execute: async ({ tabIds, title }) => {
      console.log('  [Tool Execute] create_tab_group called, title:', title, 'tabIds:', tabIds)
      return { groupId: 99, message: `Created group "${title}" with ${tabIds.length} tabs` }
    },
  }),
}

const SYSTEM = 'You are a tab management agent. Use tools to help the user manage browser tabs. Always query tabs before organizing.'

async function runTurn(messages: ModelMessage[], userContent: string): Promise<ModelMessage[]> {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`USER: ${userContent}`)
  console.log('='.repeat(60))

  messages.push({ role: 'user', content: userContent })

  console.log('\n--- Messages sent to API ---')
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      console.log(`  [${msg.role}] ${msg.content.slice(0, 80)}`)
    } else if (Array.isArray(msg.content)) {
      console.log(`  [${msg.role}] (${msg.content.length} parts)`)
      for (const part of msg.content) {
        const p = part as any
        if (p.type === 'tool-call') {
          console.log(`    -> tool-call: ${p.toolName}(${JSON.stringify(p.args || p.input || {}).slice(0, 60)})`)
        } else if (p.type === 'tool-result') {
          console.log(`    -> tool-result: ${p.toolName} = ${JSON.stringify(p.result || p.output || '').slice(0, 60)}`)
        } else if (p.type === 'text') {
          console.log(`    -> text: ${(p.text || '').slice(0, 60)}`)
        } else {
          console.log(`    -> ${p.type}: ${JSON.stringify(p).slice(0, 60)}`)
        }
      }
    } else {
      console.log(`  [${msg.role}] (${typeof msg.content})`)
    }
  }
  console.log('---\n')

  const result = await streamText({
    model: openrouter(MODEL),
    system: SYSTEM,
    messages,
    tools: testTools,
    stopWhen: stepCountIs(5),
    onStepFinish: (step) => {
      console.log(`  [Step] text=${step.text?.slice(0, 50) || '(none)'}, toolCalls=${step.toolCalls?.length || 0}, reason=${step.finishReason}`)
    },
  })

  // Consume text stream
  let fullText = ''
  for await (const chunk of result.textStream) {
    fullText += chunk
  }

  const response = await result.response
  const responseMessages = response.messages

  console.log(`\nASSISTANT: ${fullText.slice(0, 200)}`)
  console.log(`\n--- Response messages (${responseMessages.length}) ---`)
  for (const msg of responseMessages) {
    if (typeof msg.content === 'string') {
      console.log(`  [${msg.role}] ${msg.content.slice(0, 80)}`)
    } else if (Array.isArray(msg.content)) {
      console.log(`  [${msg.role}] (${msg.content.length} parts)`)
      for (const part of msg.content) {
        const p = part as any
        if (p.type === 'tool-call') {
          console.log(`    -> tool-call: ${p.toolName}`)
        } else if (p.type === 'tool-result') {
          console.log(`    -> tool-result: ${p.toolName}`)
        } else if (p.type === 'text') {
          console.log(`    -> text: ${(p.text || '').slice(0, 60)}`)
        } else {
          console.log(`    -> ${p.type}`)
        }
      }
    }
  }

  // Append response messages to conversation history (this is the key part!)
  messages.push(...responseMessages)

  return messages
}

async function main() {
  let messages: ModelMessage[] = []

  // Turn 1: query tabs
  messages = await runTurn(messages, 'Show me all open tabs')

  // Turn 2: organize (should NOT re-query since it already has the results)
  messages = await runTurn(messages, 'Group all tabs by domain')

  console.log(`\n${'='.repeat(60)}`)
  console.log('FINAL MESSAGE HISTORY:')
  console.log('='.repeat(60))
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (typeof msg.content === 'string') {
      console.log(`  [${i}] ${msg.role}: ${msg.content.slice(0, 100)}`)
    } else if (Array.isArray(msg.content)) {
      const types = (msg.content as any[]).map((p: any) => p.type).join(', ')
      console.log(`  [${i}] ${msg.role}: [${types}]`)
    }
  }
}

main().catch(console.error)
