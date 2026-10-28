# expert.account — حساب من

بخش: پنل کارشناس | راهنما: help-content.js «expert.account»

> نام، نقش و وضعیت تلگرام‌های شما؛ تغییر کد ورود؛ و حالتِ مکاتباتِ کارشناس هوشمند: «⏱ با مهلت»، «⏸ بی‌مهلت» یا «🤖 خودکار».

محل در رابط:
- پنل کارشناس خرید › حساب من

## فایل‌های این قابلیت (صاحب)
— (کدِ جدا ندارد؛ از راه مسیرها و فایل‌های مشترک)

## مسیرهای سرور (3)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `* /me` | w/api.js › route | — | ✓ |
| `POST /me/activity` | w/api.js › route | — | ✓ |
| `PUT /me/code` | w/api.js › route | w/auth-guard.js#codeChangeConflict، w/auth-guard.js#codeChangeOpen | ✓ |

## فراخوان در پنل‌ها (2)
- expert.js › paint → `POST /me/activity` (صفحه: expert.html)
- expert.js › saveCode → `PUT /me/code` (صفحه: expert.html)

جای راهنما در کد: expert.js › k، expert.js › vSupCfg

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
