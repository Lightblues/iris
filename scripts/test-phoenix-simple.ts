/**
 * Simple test script for Phoenix tracing (no OpenInference)
 * Run: npx tsx scripts/test-phoenix-simple.ts
 */

import { NodeTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'

const PHOENIX_ENDPOINT = process.env.PHOENIX_ENDPOINT || 'http://localhost:3305'

async function main() {
  console.log(`[Test] Phoenix endpoint: ${PHOENIX_ENDPOINT}`)

  const exporter = new OTLPTraceExporter({
    url: `${PHOENIX_ENDPOINT}/v1/traces`,
  })

  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'iris-simple-test',
    }),
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  })

  provider.register()
  console.log('[Test] Provider registered')

  const tracer = provider.getTracer('test')

  // Create a simple span
  const span = tracer.startSpan('test-operation')
  span.setAttribute('test.key', 'test-value')
  span.setAttribute('test.timestamp', Date.now())
  console.log('[Test] Span created')

  // Simulate some work
  await new Promise((resolve) => setTimeout(resolve, 100))

  span.end()
  console.log('[Test] Span ended')

  // Wait for export
  await new Promise((resolve) => setTimeout(resolve, 2000))

  await provider.shutdown()
  console.log('[Test] Done! Check Phoenix at:', PHOENIX_ENDPOINT)
}

main().catch(console.error)
