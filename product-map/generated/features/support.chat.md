# support.chat — مکاتبات

بخش: پنل پشتیبانی | راهنما: help-content.js «support.chat»

> گفت‌وگوهای همهٔ کارشناسان با تأمین‌کنندگان، فقط‌خواندنی؛ باز کردنشان «خوانده‌شده» ثبت نمی‌کند.

## فایل‌های این قابلیت (صاحب)
— (کدِ جدا ندارد؛ از راه مسیرها و فایل‌های مشترک)

## مسیرهای سرور (3)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /support/msg/{}/voice` | w/api.js › route | w/storage.js#storage | — |
| `GET /support/threads` | w/api.js › route | w/support.js#supportThreads | ✓ |
| `GET /support/threads/{}` | w/api.js › route | w/support.js#supportThread | ✓ |

## فراخوان در پنل‌ها (3)
- support-panel.js › loadThreads → `GET /support/threads` (صفحه: support.html)
- support-panel.js › openThread → `GET /support/threads/{}` (صفحه: support.html)
- tender-admin.js › loadList → `GET /support/threads` (صفحه: support.html)

جای راهنما: support-panel.js

## جدول‌ها
نوشتن: —
خواندن: ai_threads، assignments، requests، sp_bundles، sp_files، sp_lines، sp_msgs، sp_suppliers، sp_threads

## تست‌ها (5)
- ai-phase2.test.mjs
- d1-budget.test.mjs
- supplier.test.mjs
- support.test.mjs
- takeover.test.mjs

```
node --test backend/tamin-poshtibani/tests/ai-phase2.test.mjs backend/tamin-poshtibani/tests/d1-budget.test.mjs backend/tamin-poshtibani/tests/supplier.test.mjs backend/tamin-poshtibani/tests/support.test.mjs backend/tamin-poshtibani/tests/takeover.test.mjs
```
