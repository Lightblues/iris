export const KEEPALIVE_PORT = 'iris-relay-keepalive'

// MV3: an open runtime port counts as "SW is communicating" and delays teardown.
// setInterval / setTimeout alone do not extend SW lifetime.
let keepalivePort: chrome.runtime.Port | null = null
let keepaliveInterval: ReturnType<typeof setInterval> | null = null
let keepaliveRefCount = 0

function tryConnectPort(): chrome.runtime.Port | null {
  try {
    const port = chrome.runtime.connect({ name: KEEPALIVE_PORT })
    port.onDisconnect.addListener(() => {
      if (keepalivePort === port) keepalivePort = null
    })
    return port
  } catch {
    return null
  }
}

export function acquireKeepalive(): void {
  keepaliveRefCount++
  if (!keepalivePort) keepalivePort = tryConnectPort()
  if (keepaliveInterval) return
  keepaliveInterval = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => {})
    if (!keepalivePort && keepaliveRefCount > 0) keepalivePort = tryConnectPort()
  }, 5000)
}

export function releaseKeepalive(): void {
  keepaliveRefCount = Math.max(0, keepaliveRefCount - 1)
  if (keepaliveRefCount > 0) return
  if (keepalivePort) {
    try { keepalivePort.disconnect() } catch { /* ignore */ }
    keepalivePort = null
  }
  if (keepaliveInterval) {
    clearInterval(keepaliveInterval)
    keepaliveInterval = null
  }
}
