/**
 * Prove take_screenshot images reach the model on OpenRouter chat completions.
 *
 * Usage:
 *   OPENROUTER_API_KEY=sk-... pnpm exec tsx scripts/test-screenshot-vision.ts
 */
import { deflateSync, crc32 } from 'node:zlib'
import { createOpenAI } from '@ai-sdk/openai'
import { ToolLoopAgent, stepCountIs, tool, wrapLanguageModel } from 'ai'
import { z } from 'zod'
import { rememberScreenshot, screenshotToModelOutput } from '../src/lib/screenshotStore.ts'
import { liftToolImagesMiddleware } from '../src/lib/liftToolImages.ts'

const API_KEY = process.env.OPENROUTER_API_KEY || process.env.IRIS_API_KEY || ''
const MODEL = process.env.MODEL || 'google/gemini-2.5-flash'
const BANDS = [
  { name: 'top', hex: '#1A6B4A' },
  { name: 'middle', hex: '#F2C14E' },
  { name: 'bottom', hex: '#C23B22' },
] as const

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type), data])
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const c = Buffer.alloc(4)
  c.writeUInt32BE(crc32(body) >>> 0)
  return Buffer.concat([len, body, c])
}

function bandPng(width = 96, band = 32): string {
  const height = band * BANDS.length
  const stride = width * 3 + 1
  const raw = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    const color = BANDS[Math.min(BANDS.length - 1, Math.floor(y / band))]
    const r = parseInt(color.hex.slice(1, 3), 16)
    const g = parseInt(color.hex.slice(3, 5), 16)
    const b = parseInt(color.hex.slice(5, 7), 16)
    raw[y * stride] = 0
    for (let x = 0; x < width; x++) {
      const i = y * stride + 1 + x * 3
      raw[i] = r
      raw[i + 1] = g
      raw[i + 2] = b
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]).toString('base64')
}

function summarizeRequest(body: unknown) {
  const messages = (body as { messages?: Array<Record<string, unknown>> })?.messages ?? []
  const summary = messages.map(msg => {
    const role = String(msg.role)
    const content = msg.content
    if (typeof content === 'string') {
      return { role, kind: 'text', chars: content.length, hasImageUrl: false, preview: content.slice(0, 80) }
    }
    if (!Array.isArray(content)) return { role, kind: typeof content }
    const kinds = content.map((part: any) => part?.type)
    const hasImageUrl = content.some((part: any) => part?.type === 'image_url' && !!part?.image_url?.url)
    const imageUrlChars = content
      .filter((part: any) => part?.type === 'image_url')
      .reduce((n: number, part: any) => n + String(part.image_url?.url || '').length, 0)
    return { role, kind: 'parts', types: kinds, hasImageUrl, imageUrlChars, textChars: content.filter((p: any) => p?.type === 'text').reduce((n: number, p: any) => n + String(p.text || '').length, 0) }
  })
  return {
    urlPath: 'chat/completions',
    messageCount: messages.length,
    hasImageUrl: summary.some(row => 'hasImageUrl' in row && row.hasImageUrl),
    toolChars: summary.filter(row => row.role === 'tool').map(row => ('chars' in row ? row.chars : 0)),
    messages: summary,
  }
}

async function main() {
  if (!API_KEY) {
    console.error('Set OPENROUTER_API_KEY to run the live vision check')
    process.exit(2)
  }

  const png = bandPng()
  const expected = BANDS.map(b => b.hex.toLowerCase())
  let requestSummary: ReturnType<typeof summarizeRequest> | undefined

  const provider = createOpenAI({
    apiKey: API_KEY,
    baseURL: 'https://openrouter.ai/api/v1',
    headers: { 'HTTP-Referer': 'https://iris.local', 'X-Title': 'Iris-Screenshot-Vision' },
    fetch: async (url, init) => {
      if (init?.body && typeof init.body === 'string') {
        try { requestSummary = summarizeRequest(JSON.parse(init.body)) } catch { /* ignore */ }
      }
      return fetch(url, init)
    },
  })

  const agent = new ToolLoopAgent({
    id: 'iris-screenshot-vision',
    model: wrapLanguageModel({
      model: provider.chat(MODEL),
      middleware: liftToolImagesMiddleware,
    }),
    instructions: 'You can see screenshots returned by take_screenshot. When asked about colors, look at the image.',
    tools: {
      take_screenshot: tool({
        description: 'Capture the visible viewport of the current tab.',
        inputSchema: z.object({}),
        execute: async () => {
          const ref = rememberScreenshot(`data:image/png;base64,${png}`)
          return { captured: true, tabId: 1, ...ref }
        },
        toModelOutput: ({ output }) => screenshotToModelOutput(output),
      }),
    },
    stopWhen: stepCountIs(4),
  })

  const result = await agent.generate({
    prompt: 'Call take_screenshot, then list the three horizontal band colors from top to bottom as hex codes. Reply with only the three hex codes.',
  })

  const hexes = [...(result.text || '').matchAll(/#?[0-9a-fA-F]{6}/g)].map(m => {
    const raw = m[0].startsWith('#') ? m[0] : `#${m[0]}`
    return raw.toLowerCase()
  })
  const families = hexes.map(hex => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    if (g > r && g > b) return 'green'
    if (r > 160 && g > 120 && b < 120) return 'yellow'
    if (r > g && r > b) return 'red'
    return 'other'
  })
  const toolChars = requestSummary?.toolChars ?? []
  const ok = !!requestSummary?.hasImageUrl
    && toolChars.every(n => n < 120)
    && families[0] === 'green'
    && families[1] === 'yellow'
    && families[2] === 'red'
  console.log(JSON.stringify({
    model: MODEL,
    steps: result.steps.length,
    toolCalls: result.steps.flatMap(step => step.toolCalls?.map(tc => tc.toolName) ?? []),
    request: requestSummary,
    reply: result.text,
    expected,
    hexes,
    families,
    ok,
  }, null, 2))
  if (!ok) process.exit(1)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
