# expert.comm — جدول کمیسیون

بخش: پنل کارشناس | راهنما: help-content.js «expert.comm» | جریان کار: wf.request (گام 8)، wf.smart (گام 7)، wf.tender (گام 5)

> پیش‌نمایش، فایل اکسل و فایل Word از یک مدل ساخته می‌شوند و عیناً قالب فرم‌های شرکت‌اند: جدول کمیسیون مثل «مقایسه استعلام بها» (TSA-PS-FO-02) و برگهٔ درخواست مثل چاپ راهکاران.

## فایل‌های این قابلیت (صاحب)
- `worker/bundle.js` — buildFiles، bundleData، commissionCode، commissionGuard، commissionSize، markCommission، missingText، readiness، recordCommission
- `worker/sheets.js` — XLSX_MIME، commissionData، commissionHtml، commissionSheet، commissionXlsx

## مسیرهای سرور (5)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /assignments/{}/bundle` | w/api.js › route | w/bundle.js#bundleData، w/bundle.js#readiness، w/settings.js#getSettings | — |
| `GET /assignments/{}/sheet/commission` | w/api.js › route | — | ✓ |
| `GET /assignments/{}/sheet/request` | w/api.js › route | — | — |
| `POST /assignments/{}/commission` | w/api.js › route | — | ✓ |
| `POST /items/{}/commission` | w/api.js › route | — | ✓ |

## فراخوان در پنل‌ها (2)
- expert.js › loadSheets → `GET /assignments/{}/sheet/request`، `GET /assignments/{}/sheet/commission` (صفحه: expert.html)
- expert.js › wire → `POST /assignments/{}/commission` (صفحه: expert.html)

## جدول‌ها
نوشتن: assignments، counters
خواندن: experts، final_call_sups، final_calls، items، letters، quotes، requests، settings
هم‌نویس‌های همین جدول‌ها: engine.structure، infra.core، legal.app، manager.import

## تست‌ها (10)
- ai-mode-live.test.mjs
- ai-phase2.test.mjs
- ai-phase3.test.mjs
- commission-need.test.mjs
- docs.test.mjs
- execution-ready.test.mjs
- final-call.test.mjs
- multiprice.test.mjs
- review-fixes.test.mjs
- support.test.mjs

```
node --test backend/tamin-poshtibani/tests/ai-mode-live.test.mjs backend/tamin-poshtibani/tests/ai-phase2.test.mjs backend/tamin-poshtibani/tests/ai-phase3.test.mjs backend/tamin-poshtibani/tests/commission-need.test.mjs backend/tamin-poshtibani/tests/docs.test.mjs backend/tamin-poshtibani/tests/execution-ready.test.mjs backend/tamin-poshtibani/tests/final-call.test.mjs backend/tamin-poshtibani/tests/multiprice.test.mjs backend/tamin-poshtibani/tests/review-fixes.test.mjs backend/tamin-poshtibani/tests/support.test.mjs
```

## مرتبط
- expert.finalcall — 📨 فراخوانِ پیش‌فاکتورِ رسمی و 📦 بستهٔ کمیسیون
- expert.letter — نامهٔ کمیسیون
- expert.detail — صفحهٔ درخواست
