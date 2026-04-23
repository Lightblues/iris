import { WebTracerProvider } from '@opentelemetry/sdk-trace-web'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import {
  isOpenInferenceSpan,
  OpenInferenceSimpleSpanProcessor,
} from '@arizeai/openinference-vercel'
import { SEMRESATTRS_PROJECT_NAME } from '@arizeai/openinference-semantic-conventions'
import { setTelemetryEnabled } from './telemetryState'

const PROJECT_NAME = 'iris-chrome-extension'

let provider: WebTracerProvider | null = null
let isInitialized = false

export function initTelemetry(phoenixEndpoint: string): boolean {
  // Already initialized, skip
  if (isInitialized) {
    return true
  }

  // No endpoint configured, skip silently
  if (!phoenixEndpoint || !phoenixEndpoint.trim()) {
    console.log('[Iris Telemetry] No Phoenix endpoint configured, skipping')
    return false
  }

  try {
    console.log('[Iris Telemetry] Initializing Phoenix tracing:', phoenixEndpoint)

    // Create OTLP exporter pointing to Phoenix
    const traceUrl = `${phoenixEndpoint.replace(/\/$/, '')}/v1/traces`
    console.log('[Iris Telemetry] OTLP endpoint:', traceUrl)

    const exporter = new OTLPTraceExporter({
      url: traceUrl,
    })

    // Use OpenInference span processor with filtering
    const spanProcessor = new OpenInferenceSimpleSpanProcessor({
      exporter,
      spanFilter: isOpenInferenceSpan,
    })

    // Create tracer provider with project name for Phoenix
    provider = new WebTracerProvider({
      resource: {
        attributes: {
          [SEMRESATTRS_PROJECT_NAME]: PROJECT_NAME,
          'service.name': PROJECT_NAME,
        },
      } as any,
      spanProcessors: [spanProcessor as any],
    })

    // Register provider globally
    provider.register()

    isInitialized = true
    setTelemetryEnabled(true)
    console.log('[Iris Telemetry] Phoenix tracing initialized successfully')
    return true
  } catch (error) {
    // Telemetry errors should never block the application
    console.warn('[Iris Telemetry] Failed to initialize (non-blocking):', error)
    return false
  }
}

export function shutdownTelemetry(): void {
  if (provider) {
    try {
      provider.shutdown()
      console.log('[Iris Telemetry] Phoenix tracing shut down')
    } catch (error) {
      console.warn('[Iris Telemetry] Error during shutdown (non-blocking):', error)
    }
    provider = null
    isInitialized = false
    setTelemetryEnabled(false)
  }
}

export { isTelemetryEnabled } from './telemetryState'
