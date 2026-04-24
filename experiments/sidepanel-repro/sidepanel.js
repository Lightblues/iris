// SidePanel boot diagnostics. External file because MV3 CSP blocks inline scripts.
// Runs as early as possible; records every timing signal we care about.

const T0 = performance.now()
const boot = []

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

document.addEventListener('DOMContentLoaded', () => mark('DOMContentLoaded'))
window.addEventListener('load', () => mark('window load'))

queueMicrotask(() => mark('first microtask'))
setTimeout(() => mark('first setTimeout(0)'), 0)
requestAnimationFrame(() => {
  mark('first rAF (=== first commit!)')
  if (statusEl()) statusEl().textContent = '✅ painted'
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
