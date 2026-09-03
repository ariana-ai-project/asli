/* ============================================================
   سامانه هوشمند آریانا — سرویس‌ورکر PWA
   استراتژی: شبکه‌اول برای ناوبری، کش‌اول با به‌روزرسانی پس‌زمینه برای دارایی‌ها
   ============================================================ */

const CACHE_NAME = "ariana-pwa-v1";

/* پوستهٔ اولیهٔ برنامه — بدون ویدیوها (ویدیوها در اولین درخواست کش می‌شوند) */
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/main.js",
  "./assets/logo-new.jpg",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/icon-maskable-512.png",
  "./assets/1.jpg",
  "./assets/2.jpg",
  "./assets/3.jpg",
  "./assets/4.jpg",
  "./assets/5.jpg",
  "./assets/6.jpg",
  "./assets/7.jpg"
];

/* نصب: پیش‌کش پوسته + فعال‌سازی فوری */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)))
      )
      .then(() => self.skipWaiting())
  );
});

/* فعال‌سازی: پاک‌سازی کش‌های قدیمی */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

/* واکنش به درخواست‌ها */
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // فقط GET هم‌مبدأ
  if (request.method !== "GET" || !request.url.startsWith(self.location.origin)) {
    return;
  }

  // ناوبری صفحه: شبکه‌اول، در حالت آفلاین کش
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match("./index.html").then((r) => r || caches.match("./")))
    );
    return;
  }

  // دارایی‌ها: کش‌اول با به‌روزرسانی پس‌زمینه (stale-while-revalidate)
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && (response.ok || response.type === "opaque")) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || network;
    })
  );
});
