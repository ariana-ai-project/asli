---
name: product-map
description: Use before and after ANY change to the tamin-poshtibani system (worker/, worker.js, frontend/tamin-poshtibani/, backend/tamin-poshtibani/tests/) and for questions like "where is X implemented", "what does changing X affect", "which tests cover X". It locates the feature on the product map, lists exactly which functions/lines, routes, panel call sites, D1 tables and tests are involved, and keeps the map in sync after the edit. Read this instead of scanning large files (api.js, expert.js, bot.js are thousands of lines).
---

# نقشهٔ محصول: ویرایشِ هدفمند

نقشه در `product-map/` است. گرافِ آن را `scripts/map/` بی مدل از خودِ کد می‌سازد و طبقه‌بندیِ دستی‌اش در `product-map/taxonomy.mjs` است. شناسهٔ قابلیت‌های رابط همان کلیدهای `help-content.js` است (`expert.smart`، `support.ai`، …).

## پیش از ویرایش

1. **یافتن.** از درخواست کاربر، قابلیت یا فایل را پیدا کن:
   - `product-map/generated/INDEX.md` (جریان‌های کار و فهرست قابلیت‌ها)، یا `FILES.md` (فایل ← قابلیت)، یا `ENDPOINTS.md` (مسیر ← قابلیت). با Grep بخش لازم را پیدا کن؛ کلِ فایل را نخوان.
   - کارتِ قابلیت: `product-map/generated/features/<شناسه>.md`.
2. **اثر.** `node scripts/map/impact.mjs <هدف>`. هدف یکی از این‌هاست:
   - فایل: `worker/discovered.js`
   - تابع: `worker/discovered.js#gateFor`
   - خط‌ها: `worker/api.js:2887-2930`
   - مسیر: `"GET /search/smart"`
   - جدول: `smart_searches`
   - قابلیت: `expert.smart`
3. **خواندن.** فقط تابع‌ها و بلوک‌های مسیری را بخوان که خروجی می‌گوید (Read با offset/limit روی همان خط‌ها). در فایل‌های بزرگ (`api.js`، `expert.js`، `support-panel.js`، `bot.js`، `ai-agent.js`) هرگز کلِ فایل را نخوان.

## ویرایش

- **بستهٔ پنل پشتیبانی.** `api()` در `support-panel.js` و تب‌هایش (`cr-admin.js`، `fb-admin.js`، `tender-admin.js`، `cm-result.js`، `expert-ai.js`) خودش `/support` می‌چسباند.
- **پنل مناقصه.** `tender.js` با `api("/x")` مسیرِ `/tender/{code}/x` را می‌زند.
- **مسیر تازه در سرور.** به همان شکلِ فعلی بنویس: `if (path === "/x" && m === "GET")` یا `(mm = /^\/x\/(\d+)$/.exec(path)) && m === "POST"`. اسکنر همین الگوها را می‌شناسد.

## پس از ویرایش

1. `node scripts/map/impact.mjs --changed`، بعد اجرای تست‌هایی که فهرست می‌کند با دستورِ `node --test …` که خودش می‌دهد. `product-map.test.mjs` همیشه در فهرست هست.
2. **اگر مسیر، فایل، جدول یا قابلیتِ تازه** ساختی یا چیزی را جابه‌جا کردی:
   - صاحبش را در `product-map/taxonomy.mjs` بنویس:
     - `files` برای فایل (هر فایل یک صاحب)؛
     - `endpoints` برای مسیر (`"METHOD /path"`؛ `*` یعنی پیشوند و `{}` یعنی بخش متغیر)؛
     - قابلیتِ رابط کاربریِ تازه اول کلیدش را در `help-content.js` می‌گیرد.
   - `node scripts/map/build.mjs` و بعد `node scripts/map/check.mjs`. هر دو باید بی خطا باشند.
   - زیرمسیرِ تازه‌ای که مسیرِ بریده‌شده می‌گیرد: `MOUNTS` در `scripts/map/scan.mjs`. بسته‌بندِ تازهٔ api در پنل‌ها: `FRONT_PREFIX`.
3. **اگر رفتار یا متنِ رابط عوض شد**، موضوعِ همان کلید را در `help-content.js` اصلاح کن و `node backend/tamin-poshtibani/tools/build-help-knowledge.mjs` را بزن.
4. **پیش از commit یا استقرار**، همهٔ تست‌ها: `node --test backend/tamin-poshtibani/tests/`.

## خطاهای نقشه و معنی‌شان

- **«فراخوان پنل به هیچ مسیری نمی‌رسد».** معمولاً باگِ واقعی است: پیشوندِ اشتباه یا مسیری که در سرور نیست. اصلاحش کن. اگر دانسته است، در `KNOWN_UNMATCHED` با دلیل بنویس.
- **«فایل/مسیرِ بی‌صاحب».** در `taxonomy.mjs` صاحبش را بنویس.
- **«خروجی‌های نقشه کهنه‌اند».** `node scripts/map/build.mjs`.
- **«تستی که به هیچ قابلیتی نرسید»** (هشدار). در `TEST_FEATURES` بنویس.

## کی کافی نیست

ابزارِ اثر حداقلِ لازم را می‌دهد. تغییرِ مشترک را با همهٔ تست‌ها بسنج: مسیریابِ مرکزی بیرون از بلوکِ مسیرها، `ensureSchema` و مهاجرت‌ها، `shared.js`، `ui.js`، و ابزارهای تست. خروجیِ ابزار در این حالت‌ها خودش «همه» را می‌گوید.
