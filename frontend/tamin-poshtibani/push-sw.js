/* ============================================================
   سرویس‌ورکرِ اعلان‌های پنل‌ها (کارشناس، مدیر، پشتیبان) — فقط push و کلیکِ اعلان (مهر ۱۴۰۵)
   هیچ fetchی را نمی‌گیرد: پنل‌ها و API آن‌ها مثل قبل هرگز کش نمی‌شوند (همان قاعدهٔ ‎/sw.js‎).
   دامنه‌اش ‎/tamin-poshtibani/‎ است و برای صفحه‌های همین مسیر جای ‎/sw.js‎ (دامنهٔ ریشه) می‌نشیند.
   آیفون: هر پیامِ push باید اعلانی نشان دهد، وگرنه Safari اجازه را پس می‌گیرد — پس همیشه showNotification.
   ============================================================ */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

const ICON = new URL("../assets/icon-192.png", self.registration.scope).href;

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { b: e.data ? e.data.text() : "" }; }
  const title = d.t || "تدارکات آریانا";
  const opts = { body: d.b || "", icon: ICON, badge: ICON, dir: "rtl", lang: "fa", data: { url: d.u || "./" } };
  /* اعلانِ هم‌برچسب (مثلاً «پیشنهاد بهتر» در یک مناقصه) جای قبلی را می‌گیرد و دوباره صدا می‌دهد */
  if (d.g) { opts.tag = d.g; opts.renotify = true; }
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  const page = url.split("#")[0];
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    /* همان پنل اگر باز است جلو می‌آید و به همان بخش می‌رود؛ وگرنه پنجرهٔ تازه */
    const same = wins.find((w) => w.url.split("#")[0] === page) || wins.find((w) => w.url.startsWith(self.registration.scope));
    if (same) {
      try { if (same.url !== url && "navigate" in same) await same.navigate(url); } catch (_) { /* پنجرهٔ بی‌کنترل */ }
      return same.focus();
    }
    return self.clients.openWindow(url);
  })());
});
