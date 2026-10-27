# infra.core — مسیریاب و هستهٔ سرور

بخش: زیرساخت

> worker.js، مسیریاب api.js (ensureSchema و مهاجرت‌ها)، خطا، زمان کاری، تنظیمات، ذخیره‌سازی و نگهبان D1.

## فایل‌های این قابلیت (صاحب)
- `worker.js` — voiceBots
- `worker/api.js` — cleanOrphans، ensureSchema، migrateAiOptIn، migrateCodes4، route
- `worker/d1-guard.js` — HEAVY، guardEnv
- `worker/http.js` — HttpError
- `worker/selftest.js` — selfTest
- `worker/settings.js` — DEFAULTS، getSettings، managerCode، managerCodeStmt، settingsFromRows
- `worker/storage.js` — MAX_BYTES، storage، storageInfo، storageKey
- `worker/time.js` — DAY، HOUR، TEHRAN_OFFSET، WEEKDAYS، addWorkingHours، alertSchedule، budgetHours، endOfNthWorkingDay، fmtFa، inWorkHours، jLen، jNorm، jStr، jStr2ms، jValid، nextWorkMoment، stageColor، stageColors، …

## مسیرهای سرور (4)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `* /health` | w/api.js › route | w/settings.js#managerCode، w/storage.js#storage، w/storage.js#storageInfo | — |
| `* /notify/email` | w/api.js › route | — | — |
| `* /reviews` | w/api.js › route | — | — |
| `GET /selftest` | w/api.js › route | w/selftest.js#selfTest | — |

## فراخوان در پنل‌ها (3)
- expert.js › loadTemplates → `* /health`، `* /reviews`، `GET /selftest` (صفحه: expert.html)
- manager.js › refresh → `* /health`، `* /reviews`، `GET /selftest` (صفحه: manager.html)
- support-panel.js › api → `* /health`، `* /reviews`، `GET /selftest` (صفحه: support.html)

## جدول‌ها
نوشتن: ai_agents، ai_calls، ai_log، ai_props، ai_runs، ai_threads، alarms، alerts، assignments، commission_notes، commission_results، counters، cr_facts، cr_turns، decisions، events، expert_scores، experts، fm_choice، holidays، imports، item_changes، items، letters، outbox، proformas، quote_edits، quotes، req_hist، requests، search_suppliers، settings، smart_jobs، smart_searches، sp_bundles، sp_files، sp_lines، sp_msgs، sp_sms، sp_tg، sp_threads، templates، tg_flows، tg_nav، tg_seen، tg_uploads، weights
خواندن: ai_rates، offpf
هم‌نویس‌های همین جدول‌ها: bot.sp، bot.team، bot.voice، corr.main، engine.ai، engine.records، engine.strategy، engine.structure، expert.ai، expert.comm، expert.detail، expert.finalcall، expert.history، expert.letter، expert.msgtpl، expert.quotes، expert.smart، legal.app، login.supplier، manager.alerts، manager.asg، manager.desk، manager.experts، manager.import، manager.log، notify.alarms، notify.telegram، sup.panel، support.ai، support.cm، support.fb، support.log

## تست‌ها (8)
- assign-plan.test.mjs
- d1-budget.test.mjs
- final-call.test.mjs
- phase4b3.test.mjs
- reports.test.mjs
- review-fixes.test.mjs
- storage.test.mjs
- time.test.mjs

```
node --test backend/tamin-poshtibani/tests/assign-plan.test.mjs backend/tamin-poshtibani/tests/d1-budget.test.mjs backend/tamin-poshtibani/tests/final-call.test.mjs backend/tamin-poshtibani/tests/phase4b3.test.mjs backend/tamin-poshtibani/tests/reports.test.mjs backend/tamin-poshtibani/tests/review-fixes.test.mjs backend/tamin-poshtibani/tests/storage.test.mjs backend/tamin-poshtibani/tests/time.test.mjs
```
