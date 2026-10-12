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
const CACHE_NAME = "ariana-pwa-v14"; /* v14: بالا و پایینِ پُرترِ ویدیوی گوشی (فریم‌های عمودی ?v=2)؛ v13: فریم‌های عمودیِ تازهٔ صفحهٔ اول (p720/p1080، main.js?v=9)؛ v12: نمادِ ۱۸۰ آیفون (apple-touch-icon.png در ریشه)؛ v11: زمینهٔ پایینِ صفحه روی گوشی؛ v10: لوگوی تازه */
/* فریم‌های لوگوموشن (۱۴۹ تصویر در هر اندازه — روی آیفون حدود ۲۳ مگابایت) کشِ جدا و پایدار دارند: بالا رفتنِ CACHE_NAME
   نباید همه را پاک کند تا گوشی دوباره همه را بگیرد. محتوای یک نام فریم عوض نمی‌شود؛ اگر روزی عوض شد، این نام را بالا ببرید. */
const FRAMES_CACHE = "ariana-frames-v1";
const isFrame = (path) => path.startsWith("/assets/frames/");

/* پوستهٔ اولیهٔ برنامه — از فریم‌های لوگوموشن فقط اولی (بقیه در اولین درخواست کش می‌شوند) */
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css?v=9",
  "./js/main.js?v=10",
  "./js/liquid-glass.js?v=8",
  "./js/support.js?v=9",
  "./assets/logo-new.jpg",
  "./apple-touch-icon.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/icon-maskable-512.png",
  "./assets/frames/1600/logo-000.webp",
  "./assets/frames/p720/logo-000.webp?v=2",
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
          keys.filter((key) => key !== CACHE_NAME && key !== FRAMES_CACHE).map((key) => caches.delete(key))
        )
      )
      /* فریم‌های عمودیِ کهنه: پوشه‌های قدیمیِ 720 و 1080، و نسخه‌های پیشینِ p720/p1080 (نشانیِ بی «?v=2») */
      .then(() => caches.open(FRAMES_CACHE)).then((c) => c.keys().then((ks) =>
        Promise.all(ks.filter((r) => { const u = new URL(r.url); return /\/assets\/frames\/(720|1080)\//.test(u.pathname) || (/\/assets\/frames\/p(720|1080)\//.test(u.pathname) && u.search !== "?v=2"); }).map((r) => c.delete(r)))))
      .catch(() => {})
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
      /* فریمِ کش‌شده همان است که بود (نامش تغییرناپذیر)؛ بی رفت‌وبرگشتِ بازبینی — وگرنه هر بازدیدِ صفحهٔ اول روی گوشی ~۳۰۰ درخواست */
      if (cached && isFrame(path)) return cached;
      const network = fetch(request)
        .then((response) => {
          if (response && (response.ok || response.type === "opaque")) {
            const copy = response.clone();
            caches.open(isFrame(path) ? FRAMES_CACHE : CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || network;
    })
  );
});
