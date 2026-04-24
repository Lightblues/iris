// Injects a tiny FAB so we have the known-good path as a control.
// Skip if we're in an iframe or on restricted URLs that won't host a button anyway.
;(() => {
  if (window.top !== window) return
  if (document.getElementById('__repro_fab__')) return

  const btn = document.createElement('button')
  btn.id = '__repro_fab__'
  btn.textContent = 'R'
  btn.title = 'Repro: open side panel (known-good FAB path)'
  Object.assign(btn.style, {
    position: 'fixed',
    right: '16px',
    bottom: '16px',
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    border: '0',
    background: '#ef4444',
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
    console.log('[repro fab] clicked, sending message')
    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'repro-open-side-panel',
      })
      console.log('[repro fab] bg responded', resp)
    } catch (err) {
      console.warn('[repro fab] sendMessage failed', err)
    }
  })

  const mount = () => {
    if (document.body) document.body.appendChild(btn)
    else document.addEventListener('DOMContentLoaded', () => document.body.appendChild(btn))
  }
  mount()
})()
