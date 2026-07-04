/*! coi-serviceworker v0.1.7 | MIT License | https://github.com/gzuidhof/coi-serviceworker */
if (typeof window === "undefined") {
  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
  self.addEventListener("fetch", (e) => {
    if (
      e.request.cache === "only-if-cached" &&
      e.request.mode !== "same-origin"
    )
      return;
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          if (r.status === 0) return r;
          const h = new Headers(r.headers);
          h.set("Cross-Origin-Embedder-Policy", "require-corp");
          h.set("Cross-Origin-Opener-Policy", "same-origin");
          return new Response(r.body, {
            status: r.status,
            statusText: r.statusText,
            headers: h,
          });
        })
        .catch((err) => console.error(err)),
    );
  });
} else {
  const b = document.currentScript
    ? document.currentScript.src
    : new URL("coi-serviceworker.js", window.location.href).href;
  navigator.serviceWorker
    .register(b)
    .then((reg) => {
      reg.addEventListener("updatefound", () => {
        window.location.reload();
      });
      if (navigator.serviceWorker.controller) {
        console.log("COI Service Worker active.");
      } else {
        window.location.reload();
      }
    })
    .catch((err) => console.error("COI registration failed:", err));
}
