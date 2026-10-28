# manager.reports — گزارش‌ها

بخش: پنل مدیر | راهنما: help-content.js «manager.reports»

> دو گزارش: «وضعیت درخواست‌ها» در بازهٔ تاریخ (برگهٔ درخواست کلی و گزارش روزانه، با برش‌دهنده‌ها مثل اکسل) و «گزارش سه ماهه» با گروه‌بندی کارشناسان و پروژه‌ها. خروجی اکسل هر دو.

محل در رابط:
- پنل مدیر تدارکات (میز ارجاع) › گزارش‌ها

## فایل‌های این قابلیت (صاحب)
- `worker/reports.js` — AMOUNT_CAP، BOOK_CSS، DAILY_COLUMNS، DEFAULT_MANAGERS، DEFAULT_PROJECTS، MONTHS، REQ_HIST_COLS، REQ_HIST_DDL، SEASONS، SEASON_SHEETS، STATUS_COLUMNS، STATUS_HIDDEN، STATUS_MAX، TEAM_KEY، bookFile، bookPreview، computeSeason، expertMatcher، …

## مسیرهای سرور (8)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /reports/meta` | w/api.js › route | w/reports.js#reportMeta | — |
| `GET /reports/status` | w/api.js › route | w/reports.js#statusData | — |
| `GET /reports/status.xlsx` | w/api.js › route | w/reports.js#bookFile، w/reports.js#statusBook، w/reports.js#statusData | — |
| `GET /reports/team` | w/api.js › route | w/reports.js#reportTeam | — |
| `POST /reports/season` | w/api.js › route | w/reports.js#BOOK_CSS، w/reports.js#bookFile، w/reports.js#bookPreview، w/reports.js#seasonBook، w/reports.js#seasonData | — |
| `POST /reports/season.xlsx` | w/api.js › route | w/reports.js#BOOK_CSS، w/reports.js#bookFile، w/reports.js#bookPreview، w/reports.js#seasonBook، w/reports.js#seasonData | — |
| `POST /reports/season/experts` | w/api.js › route | w/reports.js#seasonExperts | — |
| `PUT /reports/team` | w/api.js › route | w/reports.js#putReportTeam، w/settings.js#getSettings، w/sheets.js#XLSX_MIME | — |

## فراخوان در پنل‌ها (5)
- manager.js › genSeason → `GET /reports/team`، `POST /reports/season` (صفحه: manager.html)
- manager.js › loadRepMeta → `GET /reports/meta` (صفحه: manager.html)
- manager.js › loadRepStatus → `GET /reports/status`، `GET /reports/status.xlsx` (صفحه: manager.html)
- manager.js › pickExperts → `POST /reports/season/experts` (صفحه: manager.html)
- manager.js › pickTeam → `PUT /reports/team` (صفحه: manager.html)

جای راهنما در کد: manager.js (پویا)، manager.js › vReports

## جدول‌ها
نوشتن: settings
خواندن: assignments، experts، hist_imports، holidays، items، purchases، req_hist، requests

## تست‌ها (2)
- assign-plan.test.mjs
- reports.test.mjs

```
node --test backend/tamin-poshtibani/tests/assign-plan.test.mjs backend/tamin-poshtibani/tests/reports.test.mjs
```

## مرتبط
- manager.experts — کارشناسان
