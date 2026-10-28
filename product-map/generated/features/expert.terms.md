# expert.terms — 📋 شرایط خرید هر قلم

بخش: پنل کارشناس | راهنما: help-content.js «expert.terms» | جریان کار: wf.request (گام 6)، wf.supplier (گام 3)

> کنارِ نوع قلم و لایه‌ها، برای هر قلم شرایطِ خرید را می‌گذارید — مثلِ ستون‌های جدول کمیسیون: شرایط تسویه، زمان تحویل (تاریخ از تقویم)، محل تحویل، نوع فاکتور، ارزش افزوده، محل معامله، روش حمل و کمینهٔ اعتبار پیش‌فاکتور؛ هر کدام 🔒 الزامی یا 🔓 خواستهٔ شرکت.

محل در رابط:
- پنل کارشناس خرید › صفحهٔ درخواست › 📋 شرایط خرید هر قلم

## فایل‌های این قابلیت (صاحب)
- `worker/terms-locks.js` — CREDIT_MONTHS، ENUM_FIELDS، LIMIT_ENUMS، LIMIT_FA، LIMIT_FIELDS، ONE_FIELDS، PRICE_FA، cleanLimits، combineLocks، dtimeDate، fieldTxt، limitsOf، limitsTxt، payModes، priceRows، pricesMissing، rangeTxt، violationError، …

## مسیرهای سرور (1)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `PUT /items/{}/terms` | w/api.js › route | w/sp-core.js#itemLocks، w/terms-locks.js#cleanLimits، w/terms-locks.js#limitsTxt | ✓ |

## فراخوان در پنل‌ها (1)
- expert.js › saveTermsUI → `PUT /items/{}/terms` (صفحه: expert.html)

جای راهنما در کد: expert.js › row

## جدول‌ها
نوشتن: events، items
خواندن: assignments، experts، sp_lines، sp_suppliers، sp_threads

## تست‌ها (4)
- final-call.test.mjs
- multiprice.test.mjs
- phase4b3.test.mjs
- terms-company.test.mjs

```
node --test backend/tamin-poshtibani/tests/final-call.test.mjs backend/tamin-poshtibani/tests/multiprice.test.mjs backend/tamin-poshtibani/tests/phase4b3.test.mjs backend/tamin-poshtibani/tests/terms-company.test.mjs
```

## مرتبط
- expert.history — بررسی سوابق
- sup.panel — پاسخ به استعلام
