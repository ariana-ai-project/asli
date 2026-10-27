# expert.team — تیم کارشناسی

بخش: پنل کارشناس | راهنما: help-content.js «expert.team»

> کارشناس ارشد ارجاع‌های زیرمجموعه‌هایش را می‌بیند: همان کارت‌های میز مدیر، فقط برای تیم او؛ کپسولِ کارشناسان (با شمار) بالا، «همه» هم هست. مدیر در تب «کارشناسان» پنل خودش، کارشناسان تیم شما را تیک می‌زند.

## فایل‌های این قابلیت (صاحب)
- `worker/team.js` — handleTeamCallback، sendTeamMenu، seniorOfChat، teamMenuKb، teamPageFor

## مسیرهای سرور (3)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /team` | w/api.js › route | — | ✓ |
| `POST /team/delegate` | w/api.js › route | — | — |
| `POST /tg/team-link` | w/api.js › route | w/bot.js#ensureTeamWebhook، w/bot.js#makeTeamLink | — |

## فراخوان در پنل‌ها (6)
- expert.js › delegateDialog → `POST /team/delegate` (صفحه: expert.html)
- expert.js › loadTeam → `GET /team` (صفحه: expert.html)
- expert.js › loadTemplates → `GET /team` (صفحه: expert.html)
- expert.js › teamLink → `POST /tg/team-link` (صفحه: expert.html)
- manager.js › refresh → `GET /team` (صفحه: manager.html)
- support-panel.js › api → `GET /team` (صفحه: support.html)

## جدول‌ها
نوشتن: settings، tg_tokens
خواندن: assignments، experts، items، proformas، quotes، requests
هم‌نویس‌های همین جدول‌ها: bot.team

## تست‌ها (2)
- d1-budget.test.mjs
- team.test.mjs

```
node --test backend/tamin-poshtibani/tests/d1-budget.test.mjs backend/tamin-poshtibani/tests/team.test.mjs
```

## مرتبط
- expert.alerts — تنظیم اعلانات تیم
