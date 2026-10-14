// Offline support: the app shell and built assets are cached so pass-and-play
// and the computer opponent work without a connection. Pages are fetched
// network-first so a new deploy shows up on the next load.
const CACHE = 'hex-v1'
const SHELL = ['/', '/manifest.webmanifest', '/icon.svg', '/icon-192.png']

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname === '/ws' || url.pathname.startsWith('/health')) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok && url.pathname === '/') {
            const copy = response.clone()
            caches.open(CACHE).then(cache => cache.put('/', copy))
          }
          return response
        })
        .catch(() => caches.match('/'))
    )
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(cached =>
        cached ||
        fetch(request).then(response => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then(cache => cache.put(request, copy))
          }
          return response
        })
      )
    )
  }
})
