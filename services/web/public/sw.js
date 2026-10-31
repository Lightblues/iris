/* App shell only. Pages are network-first and fall back to the last copy after 3 s or offline, so a cold launch on
   a slow link still paints; every page is the same index.html, which routes by URL. Hashed /assets/ files are
   cache-first; icons and the manifest are stale-while-revalidate. Only the app's routes (/, /login, /app/*) count as
   pages; the API (/auth, /devices, /call, /sync, ...) and other origins are never touched. */
const SHELL = 'iris-shell-v1'
const WAIT_MS = 3000
const PAGE = /^\/(login|app(\/.*)?)?$/
const STATIC = /^\/(icon[.-]|apple-touch-icon|manifest\.webmanifest)/

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name !== SHELL) await caches.delete(name)
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (request.mode === 'navigate') return PAGE.test(url.pathname) ? event.respondWith(page(event, request)) : undefined
  if (url.pathname.startsWith('/assets/')) return event.respondWith(asset(request))
  if (STATIC.test(url.pathname)) return event.respondWith(staleWhileRevalidate(event, request))
})

/** Network first; the cached shell after WAIT_MS, offline, or a 5xx. The network answer still refreshes the cache. */
async function page(event, request) {
  const cache = await caches.open(SHELL)
  const network = fetch(request).then((response) => {
    if (response.ok && !response.redirected) event.waitUntil(cache.put('/', response.clone()))
    return response
  })
  const timer = new Promise((resolve) => setTimeout(resolve, WAIT_MS, null))
  try {
    const first = await Promise.race([network, timer])
    if (first && first.status < 500) return first
    return (await cache.match('/')) || first || (await network)
  } catch {
    return (await cache.match('/')) || Response.error()
  }
}

/** A hashed file never changes: serve the copy, fetch once on a miss. Bumping SHELL clears old builds' files. */
async function asset(request) {
  const cache = await caches.open(SHELL)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  if (response.ok) await cache.put(request, response.clone())
  return response
}

async function staleWhileRevalidate(event, request) {
  const cache = await caches.open(SHELL)
  const hit = await cache.match(request)
  const network = fetch(request).then((response) => {
    if (response.ok) event.waitUntil(cache.put(request, response.clone()))
    return response
  })
  if (hit) {
    event.waitUntil(network.catch(() => undefined))
    return hit
  }
  return network
}
