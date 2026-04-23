import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/index.css'
import SidePanelApp from './SidePanelApp'

// --- Diagnostic logs — identify what Chrome throttles at side-panel open ---
const bootT0 = performance.now()
const bootLog = (label: string) =>
  console.log(`[Iris boot] +${(performance.now() - bootT0).toFixed(0)}ms ${label} · vis=${document.visibilityState} focus=${document.hasFocus()}`)

bootLog('main.tsx evaluated')
document.addEventListener('visibilitychange', () => bootLog(`visibilitychange → ${document.visibilityState}`))
window.addEventListener('focus', () => bootLog('window focus'))
window.addEventListener('blur', () => bootLog('window blur'))
// Fires when the renderer's main thread actually schedules a microtask
queueMicrotask(() => bootLog('first microtask'))
// Fires when the renderer's main thread scheduler reaches a 0ms setTimeout
setTimeout(() => bootLog('first setTimeout(0)'), 0)
// Fires when browser produces a paint frame
requestAnimationFrame(() => bootLog('first rAF'))

// Remove static skeleton before React takes over (prevents flash of empty root)
const skeleton = document.getElementById('iris-skeleton')
if (skeleton) skeleton.remove()

bootLog('about to createRoot')
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SidePanelApp />
  </StrictMode>,
)
bootLog('createRoot returned')

// --- Workaround: force Chrome to commit a frame -----------------------------
// Chrome's side panel renderer sometimes starts with visibilityState=hidden and
// defers the first paint indefinitely until some external UI event (focus,
// inspect-link click, etc.) kicks it. We observed the entire boot pipeline
// completing in <100ms while the user sees a blank panel for seconds.
//
// Poking at layout, forcing reflows, dispatching resize, and calling
// window.focus() all nudge the compositor to commit. Do it repeatedly in the
// first few frames to cover the window where Chrome is still holding paint.
// None of this is expensive once the panel is actually visible.
function kickPaint(reason: string) {
  try {
    // Force style recalc + layout
    void document.body.offsetHeight
    // Ask the compositor to think it needs to resize (triggers frame commit)
    window.dispatchEvent(new Event('resize'))
    // Focus the window so Chrome promotes renderer to foreground scheduling
    window.focus()
    bootLog(`kickPaint(${reason})`)
  } catch (err) {
    console.warn('[Iris boot] kickPaint failed:', err)
  }
}

// Kick immediately (sync after render), then on each of the first few rAFs.
kickPaint('sync')
let kickFrames = 0
function kickLoop() {
  kickFrames++
  kickPaint(`rAF#${kickFrames}`)
  if (kickFrames < 3) requestAnimationFrame(kickLoop)
}
requestAnimationFrame(kickLoop)

// Also kick when Chrome finally decides we're visible — this is where the
// real first-paint should happen, so we want to commit ASAP.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') kickPaint('visibilitychange')
}, { once: false })
