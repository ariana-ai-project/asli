# expert.account — حساب من

بخش: پنل کارشناس | راهنما: help-content.js «expert.account»

> نام، نقش و وضعیت تلگرام‌های شما؛ تغییر کد ورود؛ و حالتِ مکاتباتِ کارشناس هوشمند: «⏱ با مهلت»، «⏸ بی‌مهلت» یا «🤖 خودکار».

## فایل‌های این قابلیت (صاحب)
— (کدِ جدا ندارد؛ از راه مسیرها و فایل‌های مشترک)

## مسیرهای سرور (3)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `* /me` | w/api.js › route | — | ✓ |
| `POST /me/activity` | w/api.js › route | — | ✓ |
| `PUT /me/code` | w/api.js › route | w/auth-guard.js#codeChangeConflict، w/auth-guard.js#codeChangeOpen | ✓ |

## فراخوان در پنل‌ها (5)
- expert.js › loadTemplates → `* /me` (صفحه: expert.html)
- expert.js › paint → `POST /me/activity` (صفحه: expert.html)
- expert.js › saveCode → `PUT /me/code` (صفحه: expert.html)
- manager.js › refresh → `* /me` (صفحه: manager.html)
- support-panel.js › api → `* /me` (صفحه: support.html)

## جدول‌ها
نوشتن: events، experts
خواندن: ai_agents، assignments، items

## تست‌ها (4)
- codes.test.mjs
- execution-ready.test.mjs
- sec-p0.test.mjs
- supplier.test.mjs

```
node --test backend/tamin-poshtibani/tests/codes.test.mjs backend/tamin-poshtibani/tests/execution-ready.test.mjs backend/tamin-poshtibani/tests/sec-p0.test.mjs backend/tamin-poshtibani/tests/supplier.test.mjs
```

## مرتبط
- login.expert — ورود کارشناس
- expert.ai — کارشناس هوشمند
