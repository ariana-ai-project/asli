# asli — سامانهٔ تأمین و پشتیبانی آریانا

- **سرور:** یک Cloudflare Worker. `worker.js` مسیرهای `/tamin-poshtibani/api` را به `worker/api.js#route` می‌دهد و پایگاه داده D1 است.
- **پنل‌ها:** `frontend/tamin-poshtibani/` با جاوااسکریپتِ ساده (IIFE روی `window.TP`). پنل‌ها: کارشناس، مدیر، پشتیبانی، تأمین‌کننده، مناقصه، مکاتبات.
- **دیگر:** چند بات تلگرام. سامانهٔ حقوقی محصولِ جداست (`worker/legal.js`، `frontend-legal/`).

## اول نقشه، بعد کد

برای هر ویرایش اسکیلِ **product-map** را دنبال کن (`.claude/skills/product-map/SKILL.md`):

1. `product-map/generated/INDEX.md` (یا `FILES.md`) → کارتِ قابلیت در `product-map/generated/features/<شناسه>.md`
2. `node scripts/map/impact.mjs <فایل|فایل#تابع|فایل:از-تا|"GET /path"|جدول|قابلیت>`. فقط تابع‌ها و خط‌هایی را بخوان که می‌گوید.
3. بعد از ویرایش: `node scripts/map/impact.mjs --changed` و اجرای همان تست‌ها.
4. اگر مسیر، فایل یا جدولِ تازه ساختی: صاحبش را در `product-map/taxonomy.mjs` بنویس، بعد `node scripts/map/build.mjs`.

## دستورها

- تست‌ها (Node ≥ 22.5، با node:sqlite): `node --test backend/tamin-poshtibani/tests/`. تستِ `product-map.test.mjs` هم سالم بودنِ نقشه را می‌سنجد.
- نقشه: `node scripts/map/build.mjs` (بازسازی)، `node scripts/map/check.mjs` (بررسی)، `node scripts/map/impact.mjs …` (اثر).

## قاعده‌ها

- push به `main` خودکار مستقر می‌شود (Workers Builds). پیش از آن `origin/main` را fetch و merge کن و همهٔ تست‌ها را بزن.
- D1ِ واقعی: اول فقط خواندن. نوشتن فقط وقتی لازم باشد، و تعدادش را گزارش کن. ستونِ تازه از راهِ `COLUMN_MIGRATIONS`ِ `worker/api.js`.
- متنِ رابط فارسی است. اگر رفتار یا متنِ یک بخش عوض شد، موضوعِ همان کلید در `frontend/tamin-poshtibani/help-content.js` را هم اصلاح کن و `node backend/tamin-poshtibani/tools/build-help-knowledge.mjs` را بزن.
- پنل پشتیبانی همهٔ مسیرها را با پیشوندِ `/support` می‌فرستد (`api("/x")` یعنی `/support/x`). پس در `support-panel.js` و تب‌هایش `api("/support/...")` ننویس.
- رمزها و کدها فقط در متغیرهای Worker هستند. هرگز در کد یا گزارش نیایند.
