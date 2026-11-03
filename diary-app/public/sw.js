self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(
      keys
        .filter(key => key.startsWith('workbox-'))
        .map(key => caches.delete(key))
    )
    await self.registration.unregister()
    const clients = await self.clients.matchAll({ type: 'window' })
    await Promise.all(
      clients
        .filter(client => new URL(client.url).pathname.startsWith('/Diary/'))
        .map(client => client.navigate(client.url))
    )
  })())
})
