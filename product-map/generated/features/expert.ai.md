# expert.ai — کارشناس هوشمند

بخش: پنل کارشناس | راهنما: help-content.js «expert.ai» | جریان کار: wf.smart (گام 3)، wf.smart (گام 5)

> تیکِ «🤖 هوشمند / ✋ دستی» هر کارشناس در پنل پشتیبانی است. درخواستی که دستِ کارشناس هوشمند است: بررسی سوابق، جستجوی هوشمند، مذاکره با تأمین‌کنندگان، جدول کمیسیون و نامه را خودش انجام می‌دهد و این کارها برای شما قفل است؛ گفت‌وگوهایش هم بسته‌اند مگر وقتی از شما سؤال دارد.

## فایل‌های این قابلیت (صاحب)
- `worker/first-msg.js` — FAMILY_FA، FAMILY_OF_MODE، FM_COLUMNS، FM_DDL، FM_TOKENS، STD، fillFm، fmCheck، fmChoices، fmContext، fmDefKey، fmReasons، fmSave، fmTextFor، listTemplates، qtyRange، stdKey، stdList، …

## مسیرهای سرور (4)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET\|PUT /items/{}/first-msg` | w/ai-agent.js › picksRoute | w/ai-picks.js#pickOf، w/cr-api.js#crFlags، w/first-msg.js#fmCheck، w/first-msg.js#fmContext، w/first-msg.js#fmSave، w/first-msg.js#tplLib، … | ✓ |
| `GET\|PUT /me/supervise` | w/api.js › route | w/ai-agent.js#propsRetime، w/ai-supervise.js#SUP_FA، w/ai-supervise.js#SUP_MAX، w/ai-supervise.js#SUP_MIN، w/ai-supervise.js#getSup، w/ai-supervise.js#holdOn، … | ✓ |
| `POST /assignments/{}/handoff` | w/api.js › route | w/ai-agent.js#aiHandoff، w/ai-agent.js#picksRoute | ✓ |
| `POST /items/{}/ai-start` | w/ai-agent.js › picksRoute | — | ✓ |

## فراخوان در پنل‌ها (9)
- correspond.js › supCfgDialog → `GET|PUT /me/supervise` (صفحه: correspond.html)
- expert.js › flush → `GET|PUT /items/{}/first-msg` (صفحه: expert.html)
- expert.js › loadSup → `GET|PUT /me/supervise` (صفحه: expert.html)
- expert.js › pkFmUI → `GET|PUT /items/{}/first-msg` (صفحه: expert.html)
- expert.js › pkStartUI → `POST /items/{}/ai-start` (صفحه: expert.html)
- expert.js › put → `GET|PUT /items/{}/first-msg` (صفحه: expert.html)
- expert.js › refresh → `GET|PUT /items/{}/first-msg` (صفحه: expert.html)
- expert.js › saveSupCfg → `GET|PUT /me/supervise` (صفحه: expert.html)
- expert.js › toggle → `GET|PUT /items/{}/first-msg` (صفحه: expert.html)

## جدول‌ها
نوشتن: ai_props، ai_runs، events، experts، fm_choice، items، templates، tpl_prefs
خواندن: assignments، decisions، settings، sp_threads
هم‌نویس‌های همین جدول‌ها: bot.team، corr.main، engine.ai، expert.msgtpl، infra.core، manager.desk

## تست‌ها (15)
- ai-agent.test.mjs
- cr-boxes.test.mjs
- cr-doc.test.mjs
- cr-firstmsg.test.mjs
- cr-hold.test.mjs
- cr-picks.test.mjs
- cr-turn.test.mjs
- neg-view.test.mjs
- phase4.test.mjs
- phase4b.test.mjs
- phase4b2.test.mjs
- phase4b3.test.mjs
- phase4b4.test.mjs
- structure.test.mjs
- w3-props.test.mjs

```
node --test backend/tamin-poshtibani/tests/ai-agent.test.mjs backend/tamin-poshtibani/tests/cr-boxes.test.mjs backend/tamin-poshtibani/tests/cr-doc.test.mjs backend/tamin-poshtibani/tests/cr-firstmsg.test.mjs backend/tamin-poshtibani/tests/cr-hold.test.mjs backend/tamin-poshtibani/tests/cr-picks.test.mjs backend/tamin-poshtibani/tests/cr-turn.test.mjs backend/tamin-poshtibani/tests/neg-view.test.mjs backend/tamin-poshtibani/tests/phase4.test.mjs backend/tamin-poshtibani/tests/phase4b.test.mjs backend/tamin-poshtibani/tests/phase4b2.test.mjs backend/tamin-poshtibani/tests/phase4b3.test.mjs backend/tamin-poshtibani/tests/phase4b4.test.mjs backend/tamin-poshtibani/tests/structure.test.mjs backend/tamin-poshtibani/tests/w3-props.test.mjs
```

## مرتبط
- expert.picks — 🎯 فهرست دعوت
- expert.detail — صفحهٔ درخواست
- corr.main — مکاتبات با تأمین‌کنندگان
