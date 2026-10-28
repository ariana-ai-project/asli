# support.use — 📊 کارکرد کارشناسان

بخش: پنل پشتیبانی | راهنما: help-content.js «support.use»

> برای هر کارشناس در بازهٔ انتخابی: درخواست‌هایی که برایش فرستاده شد، هر استفاده از هوش مصنوعی (کارشناس هوشمند، جستجوی هوشمند، خوانشِ پیش‌فاکتور، نرمال‌سازی با مدل، نامهٔ کمیسیون)، ElevenLabs (صدای نامه و بات صوتی)، پیامک‌ها، قالب‌های پیامی که ساخت و پیام‌هایی که کپی کرد.

محل در رابط:
- پنل پشتیبانی تدارکات › 📊 کارکرد کارشناسان

## فایل‌های این قابلیت (صاحب)
- `worker/usage-report.js` — usageExpert، usageOverview

## مسیرهای سرور (3)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /support/activity` | w/api.js › route | w/support.js#supportActivity | ✓ |
| `GET /support/usage` | w/api.js › route | w/usage-report.js#usageOverview | ✓ |
| `GET /support/usage/{}` | w/api.js › route | w/usage-report.js#usageExpert | ✓ |

## فراخوان در پنل‌ها (1)
- support-panel.js › loadLog → `GET /support/activity` (صفحه: support.html)

## جدول‌ها
نوشتن: —
خواندن: ai_calls، ai_runs، assignments، events، experts، items، letters، proformas، requests، smart_searches، sp_phones، sp_sms، sp_suppliers، sp_threads، templates، voice_jobs

## تست‌ها (8)
- ai-mode-live.test.mjs
- ai-phase2.test.mjs
- ai-phase3.test.mjs
- execution-ready.test.mjs
- supplier-over.test.mjs
- supplier.test.mjs
- support.test.mjs
- takeover.test.mjs

```
node --test backend/tamin-poshtibani/tests/ai-mode-live.test.mjs backend/tamin-poshtibani/tests/ai-phase2.test.mjs backend/tamin-poshtibani/tests/ai-phase3.test.mjs backend/tamin-poshtibani/tests/execution-ready.test.mjs backend/tamin-poshtibani/tests/supplier-over.test.mjs backend/tamin-poshtibani/tests/supplier.test.mjs backend/tamin-poshtibani/tests/support.test.mjs backend/tamin-poshtibani/tests/takeover.test.mjs
```
