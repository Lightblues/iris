// Injects a tiny FAB so we have the known-good path as a control.
// Skip if we're in an iframe or on restricted URLs that won't host a button anyway.
;(() => {
  if (window.top !== window) return
  if (document.getElementById('__repro_fab__')) return

  // --- Prewarm iframe experiment ------------------------------------------
  // Hypothesis: a hidden iframe pointing at the sidepanel URL keeps the
  // extension renderer process hot and primes V8 code cache + HTTP cache,
  // so the *next* chrome.sidePanel.open() reuses it and renders instantly.
  //
  // Controlled via:
  //   - localStorage.__repro_prewarm__ = '1' / '0'   (persists across reloads)
  //   - window.__REPRO_PREWARM__ = true / false      (per-tab override)
  //
  // Default: OFF. Turn it on in devtools console:
  //   localStorage.setItem('__repro_prewarm__', '1'); location.reload()
  // and off with '0' + reload.
  function prewarmEnabled() {
    if (window.__REPRO_PREWARM__ === true) return true
    if (window.__REPRO_PREWARM__ === false) return false
    return localStorage.getItem('__repro_prewarm__') === '1'
  }

  function mountPrewarm() {
    if (document.getElementById('__repro_prewarm__')) return
    const iframe = document.createElement('iframe')
    iframe.id = '__repro_prewarm__'
    iframe.src = chrome.runtime.getURL('sidepanel.html?prewarm=1')
    Object.assign(iframe.style, {
      position: 'fixed',
      left: '-9999px',
      top: '-9999px',
      width: '1px',
      height: '1px',
      border: '0',
      pointerEvents: 'none',
      opacity: '0',
    })
    ;(document.body || document.documentElement).appendChild(iframe)
    console.log('[repro content] prewarm iframe mounted')
  }

  // --- Compositor wake: keep the page compositor alive after sidePanel.open ---
  // When the SW tells us, run a tight rAF loop with minimal DOM mutation for ~2s
  // so the browser window's compositor stays active and commits the side panel's
  // pending first frame.
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== 'repro-wake-compositor') return
    const el = document.createElement('div')
    Object.assign(el.style, {
      position: 'fixed',
      left: '-1px',
      top: '-1px',
      width: '1px',
      height: '1px',
      pointerEvents: 'none',
      zIndex: -1,
      opacity: '0.01',
    })
    document.documentElement.appendChild(el)
    let frame = 0
    const DURATION = 6000
    const t0 = performance.now()
    const origTitle = document.title
    console.log('[repro content] compositor wake START (6s)')
    function tick() {
      if (performance.now() - t0 > DURATION) {
        el.remove()
        document.title = origTitle
        console.log(`[repro content] compositor wake END after ${frame} frames`)
        return
      }
      el.style.transform = `translateX(${frame % 2}px)`
      // Also toggle title to poke the browser process UI compositor:
      document.title = frame % 2 === 0 ? origTitle : origTitle + '\u200B'
      frame++
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  const mountFab = () => {
    const btn = document.createElement('button')
    btn.id = '__repro_fab__'
    btn.textContent = 'R'
    btn.title = 'Repro: open side panel'
    Object.assign(btn.style, {
      position: 'fixed',
      right: '16px',
      bottom: '16px',
      width: '40px',
      height: '40px',
      borderRadius: '50%',
      border: '0',
      background: prewarmEnabled() ? '#16a34a' : '#ef4444',
      color: '#fff',
      fontSize: '16px',
      fontWeight: '700',
      cursor: 'pointer',
      zIndex: 2147483647,
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    })
    btn.addEventListener('click', async (e) => {
      e.preventDefault()
      e.stopPropagation()
      const tReq = performance.now()
      console.log('[repro fab] click → sendMessage', { tReq })
      try {
        const resp = await chrome.runtime.sendMessage({
          type: 'repro-open-side-panel',
        })
        console.log('[repro fab] bg responded', resp, {
          roundtripMs: Math.round(performance.now() - tReq),
        })
      } catch (err) {
        console.warn('[repro fab] sendMessage failed', err)
      }
    })
    ;(document.body || document.documentElement).appendChild(btn)
  }

  const whenReady = (fn) => {
    if (document.body) fn()
    else document.addEventListener('DOMContentLoaded', fn, { once: true })
  }

  whenReady(() => {
    if (prewarmEnabled()) mountPrewarm()
    mountFab()
    console.log(
      `[repro content] loaded. prewarm=${prewarmEnabled()}. ` +
        `Toggle: localStorage.setItem('__repro_prewarm__','1'|'0'); location.reload()`,
    )
  })
})()
