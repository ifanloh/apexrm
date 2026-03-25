self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open("arm-scanner-v1").then((cache) =>
      cache.addAll(["/", "/index.html", "/manifest.webmanifest"])
    )
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request).then((response) => {
        if (event.request.method === "GET") {
          const cloned = response.clone();
          void caches.open("arm-scanner-v1").then((cache) => cache.put(event.request, cloned));
        }

        return response;
      });
    })
  );
});
