// FitLog used to be an installable web app at this address. This replaces its service worker,
// clears what it cached, and removes itself, so visitors get the current pages.
self.addEventListener('install', function () { self.skipWaiting() })
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) { return Promise.all(keys.map(function (k) { return caches.delete(k) })) })
      .then(function () { return self.registration.unregister() })
      .then(function () { return self.clients.matchAll({ type: 'window' }) })
      .then(function (clients) { clients.forEach(function (c) { c.navigate(c.url) }) })
  )
})
