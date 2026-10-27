# manager.desk — میز ارجاع

بخش: پنل مدیر | راهنما: help-content.js «manager.desk» | جریان کار: wf.request (گام 2)، wf.tender (گام 1)

> هر کارت یک درخواست است (شماره، تاریخ، نزدیک‌ترین تاریخ نیاز، پروژه/طرف مقابل و اقلام) و زیرش برای هر «ارجاع» (درخواست × کارشناس) یک ردیف: کارشناس، مهلت، نوار مهلت، نوار شش مرحله، وضعیت و منوی ⋯؛ اقلامِ بی‌کارشناس هم یک ردیف با انتخاب خالی می‌گیرند. رنگ کارت از بدترین ارجاعش می‌آید: زرد، نارنجی، قرمز. «n قلم» روی کارت فهرست کامل اقلام را زیرش باز می‌کند.

## فایل‌های این قابلیت (صاحب)
- `worker/assign.js` — TEAM_SIZE_SQL، alertStatements، delegateAssignment، dispatchText، holidayFn، parseThresholds، reassign، rescheduleTeam، resetHolidayCache، seenKb، stateText، teamOf، thresholdsByExpert
- `worker/manager.js` — DOT، RECIPIENT_COLS، RECIPIENT_JOIN، managerCard، markManagerSeen، notifyClosed، pushRecipients، recipients، stageWatch، statusBar

## مسیرهای سرور (9)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /desk` | w/api.js › route | — | ✓ |
| `POST /assign` | w/api.js › route | — | ✓ |
| `POST /assign/days` | w/api.js › route | — | — |
| `POST /items/state` | w/api.js › route | — | ✓ |
| `POST /reassign` | w/api.js › route | w/assign.js#reassign | ✓ |
| `POST /requests/delete` | w/api.js › route | — | ✓ |
| `POST /tender-refer` | w/api.js › route | w/tender.js#tenderRefer | ✓ |
| `POST /tender-unrefer` | w/api.js › route | w/tender.js#tenderUnrefer | ✓ |
| `POST /unassign` | w/api.js › route | — | — |

## فراخوان در پنل‌ها (11)
- expert.js › loadTemplates → `GET /desk`، `POST /assign`، `POST /reassign`، `POST /tender-refer`، `POST /tender-unrefer`، `POST /unassign` (صفحه: expert.html)
- manager.js › applyAssignAll → `POST /assign` (صفحه: manager.html)
- manager.js › applyDeadlineAll → `POST /assign/days` (صفحه: manager.html)
- manager.js › askDelete → `POST /requests/delete` (صفحه: manager.html)
- manager.js › doAct → `POST /items/state` (صفحه: manager.html)
- manager.js › moveDialog → `POST /reassign` (صفحه: manager.html)
- manager.js › referTender → `POST /tender-refer` (صفحه: manager.html)
- manager.js › refresh → `GET /desk`، `POST /assign`، `POST /reassign`، `POST /tender-refer`، `POST /tender-unrefer`، `POST /unassign` (صفحه: manager.html)
- manager.js › unreferTender → `POST /tender-unrefer` (صفحه: manager.html)
- manager.js › wire → `GET /desk`، `POST /reassign`، `POST /unassign`، `POST /assign`، `POST /assign/days` (صفحه: manager.html)
- support-panel.js › api → `GET /desk`، `POST /assign`، `POST /reassign`، `POST /tender-refer`، `POST /tender-unrefer`، `POST /unassign` (صفحه: support.html)

جای راهنما: manager.js (پویا)

## جدول‌ها
نوشتن: alerts، assignments، commission_notes، commission_results، decisions، events، fm_choice، items، letters، outbox، proformas، quotes، req_hist، requests، smart_jobs، smart_searches، tenders، tg_flows، tg_nav، tg_uploads
خواندن: ai_agents، ai_runs، alarms، expert_scores، experts، holidays، imports، settings، sp_threads، weights
هم‌نویس‌های همین جدول‌ها: bot.team، engine.ai، engine.records، engine.tender، expert.ai، expert.detail، expert.history، expert.letter، expert.quotes، expert.smart، infra.core، manager.asg، manager.import، manager.log، notify.telegram، sup.panel، support.cm، support.td

## تست‌ها (13)
- assign-plan.test.mjs
- assign.test.mjs
- commission-result.test.mjs
- cr-turn.test.mjs
- d1-budget.test.mjs
- execution-ready.test.mjs
- orphans.test.mjs
- push-hooks.test.mjs
- reports.test.mjs
- review-fixes.test.mjs
- size-estimate.test.mjs
- state-notify.test.mjs
- tender-refer.test.mjs

```
node --test backend/tamin-poshtibani/tests/assign-plan.test.mjs backend/tamin-poshtibani/tests/assign.test.mjs backend/tamin-poshtibani/tests/commission-result.test.mjs backend/tamin-poshtibani/tests/cr-turn.test.mjs backend/tamin-poshtibani/tests/d1-budget.test.mjs backend/tamin-poshtibani/tests/execution-ready.test.mjs backend/tamin-poshtibani/tests/orphans.test.mjs backend/tamin-poshtibani/tests/push-hooks.test.mjs backend/tamin-poshtibani/tests/reports.test.mjs backend/tamin-poshtibani/tests/review-fixes.test.mjs backend/tamin-poshtibani/tests/size-estimate.test.mjs backend/tamin-poshtibani/tests/state-notify.test.mjs backend/tamin-poshtibani/tests/tender-refer.test.mjs
```

## مرتبط
- manager.experts — کارشناسان
- manager.alerts — تنظیم اعلانات
- manager.asg — ارجاع هوشمند
- manager.dl — مهلت هوشمند
- manager.log — تصمیم‌ها و رویدادها
