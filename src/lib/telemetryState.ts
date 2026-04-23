// Lightweight state module — no otel dependencies.
// Kept separate from `telemetry.ts` so that `createAgent.ts` (which only needs
// the enabled flag) does not pull the heavy OpenTelemetry/OpenInference bundles
// into the main chunk. The real init/shutdown in `telemetry.ts` flips this flag
// via `setTelemetryEnabled` when it loads.

let enabled = false

export function isTelemetryEnabled(): boolean {
  return enabled
}

export function setTelemetryEnabled(value: boolean): void {
  enabled = value
}
