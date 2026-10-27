# support.chg — 🧩 تغییرات اقلام

بخش: پنل پشتیبانی | راهنما: help-content.js «support.chg»

> نرمال‌سازی اجباری است و اول از همه: کارشناس ساختارِ هر قلم را می‌بیند، اصلاح یا تأیید می‌کند و کنارِ عنوان، مقدار و هر لایه 🔒 یا 🔓 می‌گذارد. این‌جا برای هر قلمِ نرمال‌شده یک پیام است: فرقِ ساختارِ تأییدشده با پیشنهادِ سامانه، با تاریخچه.

## فایل‌های این قابلیت (صاحب)
— (کدِ جدا ندارد؛ از راه مسیرها و فایل‌های مشترک)

## مسیرهای سرور (2)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /support/changes` | w/api.js › route | w/structure.js#changesList | ✓ |
| `GET /support/changes/{}` | w/api.js › route | w/structure.js#changeLog | ✓ |

## فراخوان در پنل‌ها (3)
- support-panel.js › chgLog → `GET /support/changes/{}` (صفحه: support.html)
- support-panel.js › loadChg → `GET /support/changes` (صفحه: support.html)
- tender-admin.js › loadList → `GET /support/changes` (صفحه: support.html)

## جدول‌ها
نوشتن: —
خواندن: assignments، item_changes، items، requests

## تست‌ها (1)
- structure.test.mjs

```
node --test backend/tamin-poshtibani/tests/structure.test.mjs
```
