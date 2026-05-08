/**
 * Test script: Verify reasoning/thinking output from LLM providers via OpenRouter.
 *
 * Run: OPENROUTER_API_KEY=... npx tsx scripts/test-reasoning.ts
 * Optional: MODEL=anthropic/claude-sonnet-4 npx tsx scripts/test-reasoning.ts
 *
 * Notes:
 * - OpenRouter returns reasoningTokens count but may not stream reasoning text
 *   for all models (depends on provider support).
 * - AI SDK fullStream emits: reasoning-start → reasoning-delta → reasoning-end
 *   when provider streams reasoning text.
 * - UI message parts use: { type: 'reasoning', text: string }
 */
import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

const API_KEY = process.env.OPENROUTER_API_KEY
if (!API_KEY) {
  console.error('Set OPENROUTER_API_KEY env var')
  process.exit(1)
}

const MODEL = process.env.MODEL || 'anthropic/claude-sonnet-4'
const PROMPT = process.env.PROMPT || 'What is 27 * 453? Think step by step.'

console.log(`[test-reasoning] Model: ${MODEL}`)
console.log(`[test-reasoning] Prompt: ${PROMPT}`)
console.log('---')

const provider = createOpenAI({
  apiKey: API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
})

async function main() {
  const result = streamText({
    model: provider.chat(MODEL),
    prompt: PROMPT,
    providerOptions: {
      openai: { reasoningEffort: 'high' },
    },
  })

  let reasoningText = ''
  let responseText = ''

  for await (const part of result.fullStream) {
    const p = part as any
    if (p.type === 'reasoning-start') {
      process.stdout.write('\n[REASONING] ')
    } else if (p.type === 'reasoning-delta') {
      process.stdout.write(p.delta ?? '')
      reasoningText += p.delta ?? ''
    } else if (p.type === 'text-start') {
      process.stdout.write('\n[RESPONSE] ')
    } else if (p.type === 'text-delta') {
      process.stdout.write(p.delta ?? '')
      responseText += p.delta ?? ''
    } else if (p.type === 'finish-step') {
      console.log('\n---')
      console.log('[DONE] Finish reason:', p.finishReason)
      if (p.usage) console.log('[DONE] Usage:', JSON.stringify(p.usage))
    }
  }

  console.log('\n===')
  console.log(`Reasoning: ${reasoningText.length} chars`)
  console.log(`Response: ${responseText.length} chars`)
}

main().catch((err) => {
  console.error('[ERROR]', err.message || err)
  process.exit(1)
})
