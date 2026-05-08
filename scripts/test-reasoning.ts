/**
 * Test script: Verify reasoning/thinking output from LLM providers via OpenRouter.
 *
 * Run: OPENROUTER_API_KEY=... npx tsx scripts/test-reasoning.ts
 * Optional: MODEL=deepseek/deepseek-r1 npx tsx scripts/test-reasoning.ts
 *
 * Notes:
 * - OpenRouter uses `"reasoning": { "enabled": true }` in request body
 * - Response streams `delta.reasoning` field alongside `delta.content`
 * - @ai-sdk/openai doesn't natively parse OpenRouter's reasoning format,
 *   so we inject the field via custom fetch wrapper.
 */
import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

const API_KEY = process.env.OPENROUTER_API_KEY
if (!API_KEY) {
  console.error('Set OPENROUTER_API_KEY env var')
  process.exit(1)
}

const MODEL = process.env.MODEL || 'deepseek/deepseek-v4-flash'
const PROMPT = process.env.PROMPT || 'What is 27 * 453? Think step by step.'

console.log(`[test-reasoning] Model: ${MODEL}`)
console.log(`[test-reasoning] Prompt: ${PROMPT}`)
console.log('---')

// Custom fetch that injects `reasoning` into the request body
const reasoningFetch: typeof globalThis.fetch = async (url, init) => {
  if (init?.body && typeof init.body === 'string') {
    try {
      const body = JSON.parse(init.body)
      body.reasoning = { enabled: true }
      init = { ...init, body: JSON.stringify(body) }
    } catch {}
  }
  return globalThis.fetch(url, init)
}

const provider = createOpenAI({
  apiKey: API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  fetch: reasoningFetch,
})

async function main() {
  const result = streamText({
    model: provider.chat(MODEL),
    prompt: PROMPT,
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
