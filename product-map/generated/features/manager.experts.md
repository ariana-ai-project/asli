# manager.experts — کارشناسان

بخش: پنل مدیر | راهنما: help-content.js «manager.experts»

> هر کارشناس ارشد یک کارتِ تیم است و اعضایش تراشه‌هایی زیرِ آن؛ کارتِ «بی‌سرپرست» کارشناسانی‌اند که زیر نظر هیچ ارشدی نیستند (اعلان‌هایشان همیشه برای شما می‌آید). هر کارشناس فقط زیر نظر یک ارشد است.

## فایل‌های این قابلیت (صاحب)
— (کدِ جدا ندارد؛ از راه مسیرها و فایل‌های مشترک)

## مسیرهای سرور (10)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /axes` | w/api.js › route | — | ✓ |
| `GET /experts` | w/api.js › route | — | ✓ |
| `GET /experts/{}/code` | w/api.js › route | — | ✓ |
| `GET /scores` | w/api.js › route | — | — |
| `GET /workload` | w/api.js › route | — | ✓ |
| `POST /experts` | w/api.js › route | — | ✓ |
| `POST /experts/{}/code` | w/api.js › route | — | ✓ |
| `POST /experts/codes/random` | w/api.js › route | — | ✓ |
| `PUT /experts/{}` | w/api.js › route | — | ✓ |
| `PUT /scores` | w/api.js › route | — | — |

## فراخوان در پنل‌ها (14)
- expert.js › loadTemplates → `GET /axes`، `GET /experts`، `GET /scores`، `GET /workload`، `POST /experts`، `PUT /scores` (صفحه: expert.html)
- manager.js › addExpertDialog → `GET /experts`، `POST /experts` (صفحه: manager.html)
- manager.js › applyAssignAll → `GET /axes` (صفحه: manager.html)
- manager.js › applyDeadlineAll → `GET /axes` (صفحه: manager.html)
- manager.js › expertCodeUI → `GET /experts/{}/code`، `POST /experts/{}/code` (صفحه: manager.html)
- manager.js › expertMove → `PUT /experts/{}` (صفحه: manager.html)
- manager.js › expertPatch → `PUT /experts/{}`، `GET /experts`، `POST /experts` (صفحه: manager.html)
- manager.js › loadWorkload → `GET /workload` (صفحه: manager.html)
- manager.js › needAxes → `GET /axes` (صفحه: manager.html)
- manager.js › needWorkload → `GET /workload` (صفحه: manager.html)
- manager.js › refresh → `GET /axes`، `GET /experts`، `GET /scores`، `GET /workload`، `POST /experts`، `PUT /scores` (صفحه: manager.html)
- manager.js › setW → `GET /scores`، `PUT /scores`، `PUT /experts/{}` (صفحه: manager.html)
- manager.js › wire → `POST /experts/codes/random` (صفحه: manager.html)
- support-panel.js › api → `GET /axes`، `GET /experts`، `GET /scores`، `GET /workload`، `POST /experts`، `PUT /scores` (صفحه: support.html)

جای راهنما: manager.js (پویا)

## جدول‌ها
نوشتن: events، expert_scores، experts، weights
خواندن: assignments، items، requests
هم‌نویس‌های همین جدول‌ها: infra.core

## تست‌ها (6)
- assign-plan.test.mjs
- codes.test.mjs
- d1-budget.test.mjs
- execution-ready.test.mjs
- review-fixes.test.mjs
- sec-p0.test.mjs

```
node --test backend/tamin-poshtibani/tests/assign-plan.test.mjs backend/tamin-poshtibani/tests/codes.test.mjs backend/tamin-poshtibani/tests/d1-budget.test.mjs backend/tamin-poshtibani/tests/execution-ready.test.mjs backend/tamin-poshtibani/tests/review-fixes.test.mjs backend/tamin-poshtibani/tests/sec-p0.test.mjs
```

## مرتبط
- manager.desk — میز ارجاع
- manager.reports — گزارش‌ها
