# wf.tender — مناقصهٔ برخط (معکوس)

> خودکار. گام‌ها از WORKFLOWSِ product-map/taxonomy.mjs؛ محلِ هر گام از PANELS؛ مسیر و تست از کد.

## گام 1 — ارجاع درخواست به مناقصه

کننده: مدیر یا پشتیبانی
محل: پنل مدیر تدارکات (میز ارجاع) › میز ارجاع | پنل پشتیبانی تدارکات › 🔨 مناقصه

| قابلیت | عنوان | مسیر | تست |
|---|---|---|---|
| [manager.desk](../features/manager.desk.md) | میز ارجاع | 9 | 13 |
| [support.td](../features/support.td.md) | 🔨 مناقصه | 24 | 8 |

## گام 2 — ساخت، زمان‌بندی و دعوت با پیامک

کننده: پشتیبانی
محل: پنل پشتیبانی تدارکات › 🔨 مناقصه

| قابلیت | عنوان | مسیر | تست |
|---|---|---|---|
| [support.td](../features/support.td.md) | 🔨 مناقصه | 24 | 8 |
| [engine.tender](../features/engine.tender.md) | موتور مناقصه | 0 | 2 |
| [notify.sms](../features/notify.sms.md) | پیامک | 5 | 3 |

## گام 3 — ورود تأمین‌کننده با رمز پیامکی

کننده: تأمین‌کننده
محل: مناقصهٔ خرید › ورود به مناقصه

| قابلیت | عنوان | مسیر | تست |
|---|---|---|---|
| [login.tender](../features/login.tender.md) | ورود به مناقصه | 4 | 6 |

## گام 4 — ثبت پیشنهادهای کاهشی

کننده: تأمین‌کننده
محل: مناقصهٔ خرید › ثبت پیشنهاد و جدول زنده

| قابلیت | عنوان | مسیر | تست |
|---|---|---|---|
| [tender.page](../features/tender.page.md) | مناقصهٔ خرید | 8 | 5 |
| [engine.tender](../features/engine.tender.md) | موتور مناقصه | 0 | 2 |

## گام 5 — پایان، نتیجه و برگشت به کمیسیون

کننده: پشتیبانی ← کارشناس
محل: پنل پشتیبانی تدارکات › 🔨 مناقصه | پنل کارشناس خرید › صفحهٔ درخواست › جدول کمیسیون

| قابلیت | عنوان | مسیر | تست |
|---|---|---|---|
| [support.td](../features/support.td.md) | 🔨 مناقصه | 24 | 8 |
| [expert.comm](../features/expert.comm.md) | جدول کمیسیون | 5 | 10 |

## جدول‌هایی که این جریان می‌نویسد

alarms، alerts، assignments، commission_notes، commission_results، counters، decisions، events، fm_choice، items، letters، outbox، proformas، quotes، req_hist، requests، settings، smart_jobs، smart_searches، sms_outbox، sp_sms، sp_tg، tender_bids، tender_invites، tender_jobs، tender_sessions، tenders، tg_flows، tg_nav، tg_uploads

## همهٔ تست‌های این جریان (29)

```
node --test backend/tamin-poshtibani/tests/ai-mode-live.test.mjs backend/tamin-poshtibani/tests/ai-phase2.test.mjs backend/tamin-poshtibani/tests/ai-phase3.test.mjs backend/tamin-poshtibani/tests/assign-plan.test.mjs backend/tamin-poshtibani/tests/assign.test.mjs backend/tamin-poshtibani/tests/commission-need.test.mjs backend/tamin-poshtibani/tests/commission-result.test.mjs backend/tamin-poshtibani/tests/cr-turn.test.mjs backend/tamin-poshtibani/tests/d1-budget.test.mjs backend/tamin-poshtibani/tests/docs.test.mjs backend/tamin-poshtibani/tests/execution-ready.test.mjs backend/tamin-poshtibani/tests/final-call.test.mjs backend/tamin-poshtibani/tests/multiprice.test.mjs backend/tamin-poshtibani/tests/orphans.test.mjs backend/tamin-poshtibani/tests/push-hooks.test.mjs backend/tamin-poshtibani/tests/relay.test.mjs backend/tamin-poshtibani/tests/reports.test.mjs backend/tamin-poshtibani/tests/review-fixes.test.mjs backend/tamin-poshtibani/tests/sec-p0.test.mjs backend/tamin-poshtibani/tests/size-estimate.test.mjs backend/tamin-poshtibani/tests/sms-provider.test.mjs backend/tamin-poshtibani/tests/state-notify.test.mjs backend/tamin-poshtibani/tests/supplier-over.test.mjs backend/tamin-poshtibani/tests/supplier.test.mjs backend/tamin-poshtibani/tests/support.test.mjs backend/tamin-poshtibani/tests/tender-d1.test.mjs backend/tamin-poshtibani/tests/tender-refer.test.mjs backend/tamin-poshtibani/tests/tender.test.mjs backend/tamin-poshtibani/tests/tender2.test.mjs
```
