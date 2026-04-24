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
