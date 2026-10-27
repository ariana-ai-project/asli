# support.req — درخواست‌ها

بخش: پنل پشتیبانی | راهنما: help-content.js «support.req»

> نظارت بر کار کارشناسان: بازه، پروژه، کارشناس و وضعیت؛ شش باکس پایش هر ارجاع و جزئیاتش با کلیک؛ و «🔨 ارجاع به مناقصه» برای اقلامِ ارسال‌نشده.

## فایل‌های این قابلیت (صاحب)
— (کدِ جدا ندارد؛ از راه مسیرها و فایل‌های مشترک)

## مسیرهای سرور (4)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /support/assignments/{}` | w/api.js › route | — | ✓ |
| `GET /support/assignments/{}/sheet/commission` | w/api.js › route | — | ✓ |
| `GET /support/assignments/{}/sheet/request` | w/api.js › route | — | ✓ |
| `GET /support/desk` | w/api.js › route | w/support.js#pubExpert | ✓ |

## فراخوان در پنل‌ها (5)
- support-panel.js › cmPreview → `GET /support/assignments/{}/sheet/commission` (صفحه: support.html)
- support-panel.js › loadDesk → `GET /support/desk` (صفحه: support.html)
- support-panel.js › openAsg → `GET /support/assignments/{}` (صفحه: support.html)
- support-panel.js › reqPreview → `GET /support/assignments/{}/sheet/request` (صفحه: support.html)
- tender-admin.js › loadList → `GET /support/desk` (صفحه: support.html)

## جدول‌ها
نوشتن: —
خواندن: ai_agents، ai_runs، ai_threads، alarms، assignments، decisions، expert_scores، experts، imports، items، proformas، quotes، requests، settings، sp_threads، weights

## تست‌ها (4)
- ai-phase2.test.mjs
- ai-phase3.test.mjs
- d1-budget.test.mjs
- support.test.mjs

```
node --test backend/tamin-poshtibani/tests/ai-phase2.test.mjs backend/tamin-poshtibani/tests/ai-phase3.test.mjs backend/tamin-poshtibani/tests/d1-budget.test.mjs backend/tamin-poshtibani/tests/support.test.mjs
```

## مرتبط
- support.cm — تأیید کمیسیون
- support.log — گزارش رخدادها
- support.td — 🔨 مناقصه
