# support.exp — کارشناسان

بخش: پنل پشتیبانی | راهنما: help-content.js «support.exp»

> بار باز، از مهلت گذشته، دیده‌نشده و منتظر تأیید کمیسیونِ هر کارشناس؛ کلیک ← ارجاع‌ها و رخدادهای او.

## فایل‌های این قابلیت (صاحب)
— (کدِ جدا ندارد؛ از راه مسیرها و فایل‌های مشترک)

## مسیرهای سرور (4)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /support/codes` | w/api.js › route | — | ✓ |
| `GET /support/experts` | w/api.js › route | w/support.js#supportExperts | ✓ |
| `GET /support/experts/{}` | w/api.js › route | w/support.js#supportExpert | ✓ |
| `PUT /support/codes` | w/api.js › route | — | ✓ |

## فراخوان در پنل‌ها (5)
- support-panel.js › loadCodes → `GET /support/codes`، `PUT /support/codes` (صفحه: support.html)
- support-panel.js › loadExpert → `GET /support/experts/{}` (صفحه: support.html)
- support-panel.js › loadExperts → `GET /support/experts` (صفحه: support.html)
- support-panel.js › saveCode → `GET /support/codes`، `PUT /support/codes` (صفحه: support.html)
- tender-admin.js › loadList → `GET /support/codes`، `GET /support/experts`، `PUT /support/codes` (صفحه: support.html)

## جدول‌ها
نوشتن: experts
خواندن: ai_agents، assignments، items، proformas، quotes، requests، sp_suppliers، sp_threads

## تست‌ها (3)
- codes.test.mjs
- supplier.test.mjs
- support.test.mjs

```
node --test backend/tamin-poshtibani/tests/codes.test.mjs backend/tamin-poshtibani/tests/supplier.test.mjs backend/tamin-poshtibani/tests/support.test.mjs
```
