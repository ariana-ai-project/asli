# expert.tray — کارتابل من

بخش: پنل کارشناس | راهنما: help-content.js «expert.tray» | جریان کار: wf.request (گام 3)

> هر درخواستی که مدیر به شما ارجاع و ارسال کرده، یک کارت است — تازه‌ترها اول. خاتمه‌یافته، معلق و متوقف در کارتابل نیستند.

## فایل‌های این قابلیت (صاحب)
— (کدِ جدا ندارد؛ از راه مسیرها و فایل‌های مشترک)

## مسیرهای سرور (2)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /tray` | w/api.js › route | — | ✓ |
| `POST /assignments/{}/viewed` | w/api.js › route | — | — |

## فراخوان در پنل‌ها (5)
- expert.js › loadTemplates → `GET /tray` (صفحه: expert.html)
- expert.js › loadTray → `GET /tray` (صفحه: expert.html)
- expert.js › openDetail → `POST /assignments/{}/viewed` (صفحه: expert.html)
- manager.js › refresh → `GET /tray` (صفحه: manager.html)
- support-panel.js › api → `GET /tray` (صفحه: support.html)

## جدول‌ها
نوشتن: assignments
خواندن: ai_agents، ai_runs، experts، items، proformas، quotes، requests

## تست‌ها (10)
- ai-agent.test.mjs
- ai-mode-live.test.mjs
- ai-phase2.test.mjs
- ai-phase3.test.mjs
- d1-budget.test.mjs
- phase4b.test.mjs
- review-fixes.test.mjs
- sec-p0.test.mjs
- size-estimate.test.mjs
- supplier.test.mjs

```
node --test backend/tamin-poshtibani/tests/ai-agent.test.mjs backend/tamin-poshtibani/tests/ai-mode-live.test.mjs backend/tamin-poshtibani/tests/ai-phase2.test.mjs backend/tamin-poshtibani/tests/ai-phase3.test.mjs backend/tamin-poshtibani/tests/d1-budget.test.mjs backend/tamin-poshtibani/tests/phase4b.test.mjs backend/tamin-poshtibani/tests/review-fixes.test.mjs backend/tamin-poshtibani/tests/sec-p0.test.mjs backend/tamin-poshtibani/tests/size-estimate.test.mjs backend/tamin-poshtibani/tests/supplier.test.mjs
```

## مرتبط
- expert.flow — روند کار روی یک درخواست
- expert.detail — صفحهٔ درخواست
- expert.ai — کارشناس هوشمند
