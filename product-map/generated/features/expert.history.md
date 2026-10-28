# expert.history — بررسی سوابق

بخش: پنل کارشناس | راهنما: help-content.js «expert.history» | جریان کار: wf.request (گام 4)، wf.smart (گام 2)

> تأمین‌کنندگانی که این قلم (یا این نوع قلم) را قبلاً از آن‌ها خریده‌ایم، با دفعات، مقدار، گشتاورِ مقدار، ارزش خرید و رتبهٔ نهایی. رتبه‌بندی به مدل زبانی نیاز ندارد.

محل در رابط:
- پنل کارشناس خرید › صفحهٔ درخواست › بررسی سوابق

## فایل‌های این قابلیت (صاحب)
- `worker/history.js` — BASE_YM، GRADE_ORDER، MAX_DROP، activeImport، clampK، decayPerMonth، excludedWhy، finalRank، gradeKey، historyStatus، itemHistory، itemSeries، momentWeight، rankBy، ratesWithShares، resolveScope، supplierBuys، unitShares

## مسیرهای سرور (6)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /history/status` | w/api.js › route | w/history.js#historyStatus | — |
| `GET /import/history` | w/api.js › route | — | ✓ |
| `GET /suppliers/history` | w/api.js › route | w/history.js#itemHistory، w/structure.js#NEED_NORM_MSG، w/structure.js#normConfirmed | ✓ |
| `GET /suppliers/history/buys` | w/api.js › route | w/history.js#supplierBuys، w/structure.js#NEED_NORM_MSG، w/structure.js#normConfirmed | — |
| `GET /suppliers/history/series` | w/api.js › route | w/history.js#itemSeries، w/structure.js#NEED_NORM_MSG، w/structure.js#normConfirmed | — |
| `POST /import/history` | w/api.js › route | — | ✓ |

## فراخوان در پنل‌ها (4)
- expert.js › openChart → `GET /suppliers/history/series` (صفحه: expert.html)
- expert.js › runHist → `GET /suppliers/history` (صفحه: expert.html)
- expert.js › showBuys → `GET /suppliers/history/buys` (صفحه: expert.html)
- manager.js › importFile → `GET /import/history`، `POST /import/history` (صفحه: manager.html)

جای راهنما در کد: expert.js › vNorm، expert.js › msgFor

## جدول‌ها
نوشتن: req_hist
خواندن: assignments، hist_imports، items، purchases، suppliers
هم‌نویس‌های همین جدول‌ها: infra.core، manager.desk

## تست‌ها (10)
- ai-phase2.test.mjs
- ai-phase3.test.mjs
- catalog.test.mjs
- history.test.mjs
- phase4b.test.mjs
- phase4b2.test.mjs
- ranking.test.mjs
- reports.test.mjs
- structure.test.mjs
- supplier-over.test.mjs

```
node --test backend/tamin-poshtibani/tests/ai-phase2.test.mjs backend/tamin-poshtibani/tests/ai-phase3.test.mjs backend/tamin-poshtibani/tests/catalog.test.mjs backend/tamin-poshtibani/tests/history.test.mjs backend/tamin-poshtibani/tests/phase4b.test.mjs backend/tamin-poshtibani/tests/phase4b2.test.mjs backend/tamin-poshtibani/tests/ranking.test.mjs backend/tamin-poshtibani/tests/reports.test.mjs backend/tamin-poshtibani/tests/structure.test.mjs backend/tamin-poshtibani/tests/supplier-over.test.mjs
```

## مرتبط
- expert.terms — 📋 شرایط خرید هر قلم
- expert.picks — 🎯 فهرست دعوت
- expert.smart — جستجوی هوشمند
