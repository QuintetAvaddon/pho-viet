/* Service worker: приложение открывается быстро и работает при плохом интернете.
   При изменении файлов сайта увеличьте VERSION, чтобы у всех обновился кэш. */
const VERSION = "pv-v32";
const SHELL = [
  "/", "/menu", "/app", "/promo",
  "/styles.css?v=32", "/app.js?v=32", "/menu.js?v=32", "/hours.js?v=32", "/coupons.js?v=32", "/appshell.js?v=32", "/fx.js?v=32", "/pwa.js?v=32",
  "/logo.png", "/manifest.webmanifest",
  "/icons/icon-192.png", "/icons/apple-touch-icon.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const put = (req, res) => {
  if (res && (res.ok || res.type === "opaque")) {
    const copy = res.clone();
    caches.open(VERSION).then(c => c.put(req, copy));
  }
  return res;
};

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin && url.pathname.startsWith("/api/")) return; // заказы — только через сеть

  // Страницы: сначала сеть (свежее меню и цены), без сети — из кэша
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then(res => put(req, res)).catch(() =>
        caches.match(req, { ignoreSearch: true }).then(r => r || caches.match(url.pathname === "/" ? "/" : "/menu"))
      )
    );
    return;
  }

  // Фото и иконки: из кэша, если уже скачаны
  if (url.origin === location.origin && /^\/(images|icons)\//.test(url.pathname)) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req).then(res => put(req, res))));
    return;
  }

  // Свои стили и скрипты: сначала сеть (правки доходят сразу), без сети — из кэша
  if (url.origin === location.origin) {
    e.respondWith(fetch(req).then(res => put(req, res)).catch(() => caches.match(req, { ignoreSearch: true })));
    return;
  }

  // Шрифты и библиотеки с CDN: отдаём из кэша и тихо обновляем
  e.respondWith(
    caches.match(req).then(cached => {
      const net = fetch(req).then(res => put(req, res)).catch(() => cached);
      return cached || net;
    })
  );
});
