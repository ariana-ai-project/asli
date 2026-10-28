# support.usd — 💵 نرخ دلار

بخش: پنل پشتیبانی | راهنما: help-content.js «support.usd»

> «قیمت روز»ِ سوابق خرید با نسبتِ نرخ دلارِ امروز به نرخِ روزِ خرید حساب می‌شود و رتبهٔ «ارزش خرید» هم بر همین پایه است (تیکِ «مرکز آمار» در سوابق، تعدیلِ فصلیِ زمستان ۱۴۰۴ را نشان می‌دهد).

محل در رابط:
- پنل پشتیبانی تدارکات › 🤖 کارشناس هوشمند › 💵 نرخ دلار

## فایل‌های این قابلیت (صاحب)
- `worker/usd.js` — CHANNEL، HOW_FA، USD_DDL، dayNo، dayStr، interpStmts، interpolate، isMarker، jDay، markerDay، normText، numbers، parsePosts، putRates، resetUsdCache، selectDays، shiftDay، summaryLastTrade، …

## مسیرهای سرور (3)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `* /support/usd` | w/api.js › route | w/usd.js#usdAdmin | ✓ |
| `POST /support/usd/fetch` | w/usd.js › usdAdmin | — | ✓ |
| `POST /support/usd/rows` | w/usd.js › usdAdmin | — | ✓ |

## فراخوان در پنل‌ها (4)
- support-panel.js › g → `POST /support/usd/rows` (صفحه: support.html)
- support-panel.js › loadUsd → `* /support/usd` (صفحه: support.html)
- support-panel.js › num → `POST /support/usd/rows` (صفحه: support.html)
- support-panel.js › usdFetch → `POST /support/usd/fetch` (صفحه: support.html)

## جدول‌ها
نوشتن: settings، usd_rates
خواندن: holidays

## تست‌ها (2)
- ranking.test.mjs
- usd.test.mjs

```
node --test backend/tamin-poshtibani/tests/ranking.test.mjs backend/tamin-poshtibani/tests/usd.test.mjs
```

## مرتبط
- support.rank — 🏅 رتبه‌بندی و دعوت
