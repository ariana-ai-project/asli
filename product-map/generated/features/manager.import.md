# manager.import — بارگذاری اکسل درخواست‌ها

بخش: پنل مدیر | جریان کار: wf.request (گام 1)

> خواندن فایل خروجی راهکاران در مرورگر، نمایش تعارض‌ها و ثبت درخواست‌ها و اقلام.

## فایل‌های این قابلیت (صاحب)
- `frontend/tamin-poshtibani/import.js` — T، mapHeader، readRows، build، get، fnv32، cnt

## مسیرهای سرور (6)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /imports` | w/api.js › route | — | — |
| `POST /estimate/run` | w/api.js › route | w/estimate.js#estimateRun | ✓ |
| `POST /import/apply` | w/api.js › route | — | — |
| `POST /import/begin` | w/api.js › route | — | — |
| `POST /import/chunk` | w/api.js › route | — | — |
| `POST /import/finish` | w/api.js › route | — | — |

## فراخوان در پنل‌ها (6)
- expert.js › loadTemplates → `GET /imports` (صفحه: expert.html)
- manager.js › estimateLoop → `POST /estimate/run` (صفحه: manager.html)
- manager.js › importFile → `POST /import/begin`، `POST /import/chunk`، `POST /import/finish` (صفحه: manager.html)
- manager.js › refresh → `GET /imports` (صفحه: manager.html)
- manager.js › showConflicts → `POST /import/apply` (صفحه: manager.html)
- support-panel.js › api → `GET /imports` (صفحه: support.html)

جای راهنما: manager.js (پویا)

## جدول‌ها
نوشتن: counters، imports، items، requests
خواندن: assignments، experts
هم‌نویس‌های همین جدول‌ها: engine.structure، expert.comm، expert.detail، infra.core، legal.app، manager.asg، manager.desk

## تست‌ها (3)
- closed-items.test.mjs
- import.test.mjs
- size-estimate.test.mjs

```
node --test backend/tamin-poshtibani/tests/closed-items.test.mjs backend/tamin-poshtibani/tests/import.test.mjs backend/tamin-poshtibani/tests/size-estimate.test.mjs
```
