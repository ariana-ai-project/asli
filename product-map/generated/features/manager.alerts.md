# manager.alerts — تنظیم اعلانات

بخش: پنل مدیر | راهنما: help-content.js «manager.alerts»

> نوارِ رنگی، مهلتِ کارشناس است از آغاز تا پایان؛ هر دستگیره آستانهٔ یک مرحله است: چند درصد از مهلت بگذرد تا اگر آن مرحله انجام نشده باشد، هشدار برود و باکسش زرد شود. دستگیره را بکشید (یا با کلیدهای جهت جابه‌جا کنید)؛ هر دستگیره فقط میانِ همسایه‌هایش می‌رود، پس ترتیبِ مرحله‌ها همیشه درست می‌ماند.

محل در رابط:
- پنل مدیر تدارکات (میز ارجاع) › تنظیم اعلانات

## فایل‌های این قابلیت (صاحب)
— (کدِ جدا ندارد؛ از راه مسیرها و فایل‌های مشترک)

## مسیرهای سرور (4)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /holidays` | w/api.js › route | — | — |
| `GET /settings` | w/api.js › route | w/settings.js#getSettings | ✓ |
| `PUT /holidays` | w/api.js › route | w/assign.js#resetHolidayCache | — |
| `PUT /settings` | w/api.js › route | — | ✓ |

## فراخوان در پنل‌ها (3)
- manager.js › projectsDialog → `PUT /settings` (صفحه: manager.html)
- manager.js › save → `PUT /settings` (صفحه: manager.html)
- manager.js › saveQuiet → `PUT /settings` (صفحه: manager.html)

جای راهنما در کد: manager.js (پویا)، manager.js › knob

## جدول‌ها
نوشتن: holidays، settings
خواندن: —
هم‌نویس‌های همین جدول‌ها: infra.core

## تست‌ها (4)
- codes.test.mjs
- review-fixes.test.mjs
- size-estimate.test.mjs
- support.test.mjs

```
node --test backend/tamin-poshtibani/tests/codes.test.mjs backend/tamin-poshtibani/tests/review-fixes.test.mjs backend/tamin-poshtibani/tests/size-estimate.test.mjs backend/tamin-poshtibani/tests/support.test.mjs
```

## مرتبط
- manager.desk — میز ارجاع
