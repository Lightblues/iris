/**
 * Test script for Phoenix tracing with AI SDK
 * Run: npx tsx scripts/test-phoenix.ts
 */

import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'
import { registerInstrumentations } from '@opentelemetry/instrumentation'
import { OpenInferenceSimpleSpanProcessor } from '@arizeai/openinference-vercel'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { generateText } from 'ai'

const PHOENIX_ENDPOINT = process.env.PHOENIX_ENDPOINT || 'http://localhost:3305'
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || ''

async function setupTelemetry() {
  console.log(`[Test] Setting up Phoenix telemetry: ${PHOENIX_ENDPOINT}`)

  const exporter = new OTLPTraceExporter({
    url: `${PHOENIX_ENDPOINT}/v1/traces`,
  })

  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'iris-test-script',
    }),
    spanProcessors: [
      new OpenInferenceSimpleSpanProcessor({ exporter }) as any,
    ],
  })

  provider.register()

  registerInstrumentations({
    instrumentations: [],
  })

  console.log('[Test] Telemetry initialized')
  return provider
}

async function testAISDK() {
  if (!OPENROUTER_API_KEY) {
    console.error('[Test] OPENROUTER_API_KEY not set, skipping AI SDK test')
    console.log('[Test] Set it via: export OPENROUTER_API_KEY=sk-or-...')
    return
  }

  console.log('[Test] Testing AI SDK with telemetry...')

  const openrouter = createOpenRouter({
    apiKey: OPENROUTER_API_KEY,
  })

  const result = await generateText({
    model: openrouter('openai/gpt-4o-mini'),
    prompt: 'Say "Hello from Iris test!" in exactly 5 words.',
    experimental_telemetry: {
      isEnabled: true,
    },
  })

  console.log('[Test] AI Response:', result.text)
  console.log('[Test] Usage:', result.usage)
}

async function main() {
  try {
    const provider = await setupTelemetry()

    // Test basic trace export
    console.log('[Test] Sending test span to Phoenix...')
    const tracer = provider.getTracer('iris-test')
    const span = tracer.startSpan('test-span')
    span.setAttribute('test.attribute', 'hello-phoenix')
    span.end()

    // Wait for span to be exported
    await new Promise((resolve) => setTimeout(resolve, 1000))
    console.log('[Test] Test span sent!')

    // Test AI SDK integration
    await testAISDK()

    // Wait for traces to be exported
    console.log('[Test] Waiting for traces to export...')
    await new Promise((resolve) => setTimeout(resolve, 2000))

    await provider.shutdown()
    console.log('[Test] Done! Check Phoenix UI at:', PHOENIX_ENDPOINT)
  } catch (error) {
    console.error('[Test] Error:', error)
    process.exit(1)
  }
}

main()
