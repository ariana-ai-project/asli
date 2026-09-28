/* ============================================================
   سامانه هوشمند آریانا — سرویس‌ورکر PWA
   استراتژی: شبکه‌اول برای ناوبری، کش‌اول با به‌روزرسانی پس‌زمینه برای دارایی‌ها
   ============================================================ */

/* این نسخه را با هر تغییرِ قابل‌توجه در css/js/index.html افزایش دهید —
   مرورگر فقط وقتی sw.js را کلمه‌به‌کلمه تغییر کرده ببیند مرحلهٔ نصب و
   پیش‌کشِ دوباره را اجرا می‌کند؛ بدون این، کاربرانی که قبلاً سایت را
   باز کرده‌اند تا مدت‌ها نسخهٔ کش‌شدهٔ قدیمی را می‌بینند.
   هم‌زمان «?v=» نشانی‌های css/js را در index.html و tamin-poshtibani/index.html هم بالا ببرید:
   ناوبری شبکه‌اول است ولی دارایی‌ها کش‌اول، و بدون نشانی تازه، بازدیدکنندهٔ قبلی اولین بار
   HTML تازه را با main.js کهنهٔ کش‌شده می‌گرفت (صفحهٔ سیاه تا رفرش بعدی). */
const CACHE_NAME = "ariana-pwa-v8";

/* پوستهٔ اولیهٔ برنامه — از فریم‌های لوگوموشن فقط اولی (بقیه در اولین درخواست کش می‌شوند) */
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css?v=8",
  "./js/main.js?v=8",
  "./js/liquid-glass.js?v=8",
  "./js/support.js?v=8",
  "./assets/logo-new.jpg",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/icon-maskable-512.png",
  "./assets/frames/1600/logo-000.webp",
  "./assets/frames/720/logo-000.webp",
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

  /* پنل‌های تأمین و پشتیبانی و API آن‌ها هیچ‌وقت کش نمی‌شوند: داده‌شان زنده است و
     کش‌اول باعث می‌شد مدیر بعد از ارجاع، میزِ قبلی را ببیند و کد پنل یک دیپلوی عقب بماند */
  const path = new URL(request.url).pathname;
  if (path.startsWith("/tamin-poshtibani/")) {
    return;
  }
  /* API بخش حقوقی (فهرست گفت‌وگوها، متن گفت‌وگو، حافظه) هم زنده است؛ کش‌اول یعنی گفت‌وگوی قدیمی */
  if (path.startsWith("/hoghooghi/api/")) {
    return;
  }

  // ناوبری صفحه: شبکه‌اول، در حالت آفلاین کش
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          /* فقط صفحهٔ اول سایت نسخهٔ آفلاین «./index.html» است؛ صفحهٔ بخش‌های دیگر (مثل /hoghooghi/)
             نباید جایش بنشیند */
          if (response.ok && (path === "/" || path === "/index.html")) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy));
          }
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
