// SidePanel boot diagnostics. External file because MV3 CSP blocks inline scripts.
// Runs as early as possible; records every timing signal we care about.

const T0 = performance.now()
const boot = []
const IS_PREWARM = new URLSearchParams(location.search).get('prewarm') === '1'

// Prewarm mode: load same JS/HTML so V8 code cache + HTTP cache are hot,
// but short-circuit ASAP. Do NOT run watchdog/DOM-heavy logic.
if (IS_PREWARM) {
  console.log('[repro panel PREWARM] loaded, early return (T0=', T0, ')')
  // Touch a few APIs so the extension process treats us as alive but minimal.
  // No listeners, no timers, no rAF — this iframe just exists to keep renderer warm.
} else {
  runFullBoot()
}

function runFullBoot() {
  const logEl = () => document.getElementById('log')
  const statusEl = () => document.getElementById('status')

  function mark(label) {
    const line =
      `+${Math.round(performance.now() - T0)
        .toString()
        .padStart(5)}ms  ` +
      label.padEnd(30) +
      `  vis=${document.visibilityState}  focus=${document.hasFocus()}`
    boot.push(line)
    console.log('[repro panel]', line)
    if (logEl()) logEl().textContent = boot.join('\n')
  }

  mark('script start')

  // Open a port to the SW so it can tell when we actually became visible.
  let swPort = null
  try {
    swPort = chrome.runtime.connect({ name: 'repro-panel-alive' })
  } catch (e) {
    mark('connect failed ' + e)
  }

  function notifyVisibleOnce() {
    if (!swPort || notifyVisibleOnce._sent) return
    notifyVisibleOnce._sent = true
    try {
      swPort.postMessage({ type: 'visible', t: performance.now() })
      mark('sent "visible" to SW')
    } catch (e) {
      mark('postMessage failed ' + e)
    }
  }

  document.addEventListener('DOMContentLoaded', () => mark('DOMContentLoaded'))
  window.addEventListener('load', () => mark('window load'))

  queueMicrotask(() => mark('first microtask'))
  setTimeout(() => mark('first setTimeout(0)'), 0)
  requestAnimationFrame(() => {
    mark('first rAF (=== first commit!)')
    if (statusEl()) statusEl().textContent = '✅ painted'
    notifyVisibleOnce()
  })

  document.addEventListener('visibilitychange', () => {
    mark(`visibilitychange→${document.visibilityState}`)
  })
  window.addEventListener('focus', () => mark('window focus'))
  window.addEventListener('blur', () => mark('window blur'))

  // Watchdog: if no rAF after 2s, the renderer is alive but compositor never committed.
  setTimeout(() => {
    if (!boot.some((l) => l.includes('first rAF'))) {
      document.title = '⚠ NO rAF'
      mark(`WATCHDOG: 2s, still no rAF (vis=${document.visibilityState})`)
    }
  }, 2000)

  // Secondary watchdog at 5s — helps characterize "eventually recovers" case.
  setTimeout(() => {
    mark(
      `5s checkpoint (vis=${document.visibilityState}, focus=${document.hasFocus()})`,
    )
  }, 5000)
}
