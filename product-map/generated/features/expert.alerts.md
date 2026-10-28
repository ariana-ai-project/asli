# expert.alerts — تنظیم اعلانات تیم

بخش: پنل کارشناس | راهنما: help-content.js «expert.alerts»

> تیکِ بالای هر مرحله یعنی تغییر وضعیت آن مرحله برای کارشناسان تیم شما در «تلگرام تیمی» اعلام شود. هر درصد یعنی چند درصد از مهلتِ کارشناس باید بگذرد تا اگر آن مرحله انجام نشده باشد، هشدار برود و باکسش زرد شود. خالی = هشدار آن مرحله خاموش. عبور از مهلت و بسته شدن درخواست همیشه اعلام می‌شود.

محل در رابط:
- پنل کارشناس خرید › تنظیم اعلانات تیم

## فایل‌های این قابلیت (صاحب)
— (کدِ جدا ندارد؛ از راه مسیرها و فایل‌های مشترک)

## مسیرهای سرور (1)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `PUT /me/alerts` | w/api.js › route | w/assign.js#parseThresholds، w/assign.js#rescheduleTeam | ✓ |

## فراخوان در پنل‌ها (2)
- expert.js › saveSeniorThr → `PUT /me/alerts` (صفحه: expert.html)
- expert.js › wire → `PUT /me/alerts` (صفحه: expert.html)

## جدول‌ها
نوشتن: alerts، assignments، experts
خواندن: items

## تست‌ها (1)
- d1-budget.test.mjs

```
node --test backend/tamin-poshtibani/tests/d1-budget.test.mjs
```

## مرتبط
- expert.team — تیم کارشناسی
- expert.account — حساب من
