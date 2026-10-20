// Service worker de LogiAI: avisos al teléfono (push) y una pantalla de «sin conexión».
// No guarda páginas de la aplicación: lo que se ve siempre viene de la red (los datos son privados y cambian).
const VERSION = "v1";
const CACHE = `logiai-offline-${VERSION}`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll([OFFLINE_URL, "/icons/icon-192.png"])).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("logiai-offline-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

// Solo las navegaciones: si no hay red, se muestra la pantalla de «sin conexión».
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(async () => (await caches.match(OFFLINE_URL)) || Response.error()));
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : "" }; }
  const title = data.title || "LogiAI";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: data.tag || undefined,
      data: { url: typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/" },
    }),
  );
});

// Al tocar el aviso: se enfoca la aplicación si ya está abierta y se va a la pantalla del aviso; si no, se abre.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (list) => {
      for (const client of list) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) { try { await client.navigate(url); } catch { /* otra pestaña: se abre abajo */ } }
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(url);
    }),
  );
});
