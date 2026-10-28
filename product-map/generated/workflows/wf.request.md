# wf.request — چرخهٔ درخواست خرید (دستی)

> خودکار. گام‌ها از WORKFLOWSِ product-map/taxonomy.mjs؛ محلِ هر گام از PANELS؛ مسیر و تست از کد.

## گام 1 — بارگذاری اکسل درخواست‌ها

کننده: مدیر
محل: پنل مدیر تدارکات (میز ارجاع) › میز ارجاع › بارگذاری درخواست‌های روزانه (اکسل)

| قابلیت | عنوان | مسیر | تست |
|---|---|---|---|
| [manager.import](../features/manager.import.md) | بارگذاری اکسل درخواست‌ها | 6 | 3 |

## گام 2 — ارجاع به کارشناس و مهلت (دستی یا هوشمند)

کننده: مدیر
محل: پنل مدیر تدارکات (میز ارجاع) › میز ارجاع | پنل مدیر تدارکات (میز ارجاع) › ارجاع هوشمند | پنل مدیر تدارکات (میز ارجاع) › مهلت هوشمند

| قابلیت | عنوان | مسیر | تست |
|---|---|---|---|
| [manager.desk](../features/manager.desk.md) | میز ارجاع | 9 | 13 |
| [manager.asg](../features/manager.asg.md) | ارجاع هوشمند | 3 | 4 |
| [manager.dl](../features/manager.dl.md) | مهلت هوشمند | 0 | 0 |

## گام 3 — مشاهده در کارتابل

کننده: کارشناس
محل: پنل کارشناس خرید › کارتابل من | پنل کارشناس خرید › صفحهٔ درخواست

| قابلیت | عنوان | مسیر | تست |
|---|---|---|---|
| [expert.tray](../features/expert.tray.md) | کارتابل من | 2 | 10 |
| [expert.detail](../features/expert.detail.md) | صفحهٔ درخواست | 11 | 20 |

## گام 4 — تأیید ساختار قلم و بررسی سوابق

کننده: کارشناس
محل: پنل کارشناس خرید › صفحهٔ درخواست | پنل کارشناس خرید › صفحهٔ درخواست › بررسی سوابق

| قابلیت | عنوان | مسیر | تست |
|---|---|---|---|
| [expert.detail](../features/expert.detail.md) | صفحهٔ درخواست | 11 | 20 |
| [engine.structure](../features/engine.structure.md) | ساختار و یکسان‌سازی اقلام | 0 | 5 |
| [expert.history](../features/expert.history.md) | بررسی سوابق | 6 | 10 |

## گام 5 — جستجوی هوشمند تأمین‌کنندهٔ تازه

کننده: کارشناس
محل: پنل کارشناس خرید › صفحهٔ درخواست › جستجوی هوشمند | پنل کارشناس خرید › صفحهٔ درخواست › بررسی سوابق › ✉️ قالب پیام | مکاتبات با تأمین‌کنندگان › گفت‌وگو › ✉️ قالب پیام

| قابلیت | عنوان | مسیر | تست |
|---|---|---|---|
| [expert.smart](../features/expert.smart.md) | جستجوی هوشمند | 2 | 3 |
| [expert.msgtpl](../features/expert.msgtpl.md) | قالب‌های پیام | 4 | 2 |

## گام 6 — استعلام و مکاتبه؛ پاسخ تأمین‌کننده در پنل یا بات

کننده: کارشناس ↔ تأمین‌کننده
محل: مکاتبات با تأمین‌کنندگان › درخواست‌ها | مکاتبات با تأمین‌کنندگان › تأمین‌کنندگانِ یک درخواست | مکاتبات با تأمین‌کنندگان › گفت‌وگو | مکاتبات با تأمین‌کنندگان › گفت‌وگو › اقلام، پیش‌فاکتور و تأیید بسته | پنل تأمین‌کنندگان › ورود با رمز پیامکی | پنل تأمین‌کنندگان › پاسخ به استعلام: قیمت و شرایط هر قلم، گفت‌وگو | …

| قابلیت | عنوان | مسیر | تست |
|---|---|---|---|
| [corr.main](../features/corr.main.md) | مکاتبات با تأمین‌کنندگان | 15 | 23 |
| [login.supplier](../features/login.supplier.md) | ورود به پنل تأمین‌کنندگان | 4 | 4 |
| [sup.panel](../features/sup.panel.md) | پاسخ به استعلام | 22 | 25 |
| [bot.sp](../features/bot.sp.md) | ربات تأمین‌کنندگان | 1 | 4 |
| [expert.terms](../features/expert.terms.md) | 📋 شرایط خرید هر قلم | 1 | 4 |

## گام 7 — پیش‌فاکتور و استعلامات

کننده: کارشناس
محل: پنل کارشناس خرید › صفحهٔ درخواست › استعلامات

| قابلیت | عنوان | مسیر | تست |
|---|---|---|---|
| [expert.quotes](../features/expert.quotes.md) | استعلامات | 10 | 11 |

## گام 8 — جدول کمیسیون و نامهٔ کمیسیون

کننده: کارشناس
محل: پنل کارشناس خرید › صفحهٔ درخواست › جدول کمیسیون | پنل کارشناس خرید › صفحهٔ درخواست › نامهٔ کمیسیون

| قابلیت | عنوان | مسیر | تست |
|---|---|---|---|
| [expert.comm](../features/expert.comm.md) | جدول کمیسیون | 5 | 10 |
| [expert.letter](../features/expert.letter.md) | نامهٔ کمیسیون | 8 | 6 |

## گام 9 — تأیید کمیسیون و خاتمه

کننده: پشتیبانی
محل: پنل پشتیبانی تدارکات › تأیید کمیسیون | پنل کارشناس خرید › صفحهٔ درخواست

| قابلیت | عنوان | مسیر | تست |
|---|---|---|---|
| [support.cm](../features/support.cm.md) | تأیید کمیسیون | 4 | 3 |
| [expert.detail](../features/expert.detail.md) | صفحهٔ درخواست | 11 | 20 |

## جدول‌هایی که این جریان می‌نویسد

ai_log، ai_props، ai_rates، ai_runs، ai_threads، alerts، assignments، commission_notes، commission_results، counters، decisions، events، final_call_sups، fm_choice، imports، item_changes، item_edits، items، letters، norm_cache، offpf، outbox، phone_channel_log، phone_channels، proformas، quote_edits، quotes، req_hist، requests، settings، smart_jobs، smart_searches، sp_bundles، sp_files، sp_lines، sp_links، sp_msgs، sp_passes، sp_phones، sp_phones_x، sp_sessions، sp_sms، sp_suppliers، sp_tg، sp_threads، templates، tenders، tg_flows، tg_nav، tg_seen، tg_uploads، voice_jobs

## همهٔ تست‌های این جریان (61)

```
node --test backend/tamin-poshtibani/tests/ai-agent.test.mjs backend/tamin-poshtibani/tests/ai-feedback.test.mjs backend/tamin-poshtibani/tests/ai-mode-live.test.mjs backend/tamin-poshtibani/tests/ai-phase2.test.mjs backend/tamin-poshtibani/tests/ai-phase3.test.mjs backend/tamin-poshtibani/tests/ai-rates.test.mjs backend/tamin-poshtibani/tests/apply.test.mjs backend/tamin-poshtibani/tests/assign-plan.test.mjs backend/tamin-poshtibani/tests/assign.test.mjs backend/tamin-poshtibani/tests/bot-history.test.mjs backend/tamin-poshtibani/tests/catalog.test.mjs backend/tamin-poshtibani/tests/closed-items.test.mjs backend/tamin-poshtibani/tests/commission-need.test.mjs backend/tamin-poshtibani/tests/commission-result.test.mjs backend/tamin-poshtibani/tests/cr-boxes.test.mjs backend/tamin-poshtibani/tests/cr-doc.test.mjs backend/tamin-poshtibani/tests/cr-firstmsg.test.mjs backend/tamin-poshtibani/tests/cr-hold.test.mjs backend/tamin-poshtibani/tests/cr-picks.test.mjs backend/tamin-poshtibani/tests/cr-registry.test.mjs backend/tamin-poshtibani/tests/cr-turn.test.mjs backend/tamin-poshtibani/tests/d1-budget.test.mjs backend/tamin-poshtibani/tests/discovered.test.mjs backend/tamin-poshtibani/tests/discovery.test.mjs backend/tamin-poshtibani/tests/docs.test.mjs backend/tamin-poshtibani/tests/execution-ready.test.mjs backend/tamin-poshtibani/tests/extract.test.mjs backend/tamin-poshtibani/tests/final-call.test.mjs backend/tamin-poshtibani/tests/history.test.mjs backend/tamin-poshtibani/tests/import.test.mjs backend/tamin-poshtibani/tests/layer-locks.test.mjs backend/tamin-poshtibani/tests/letter.test.mjs backend/tamin-poshtibani/tests/login.test.mjs backend/tamin-poshtibani/tests/multiprice.test.mjs backend/tamin-poshtibani/tests/neg-view.test.mjs backend/tamin-poshtibani/tests/orphans.test.mjs backend/tamin-poshtibani/tests/phase4.test.mjs backend/tamin-poshtibani/tests/phase4b.test.mjs backend/tamin-poshtibani/tests/phase4b2.test.mjs backend/tamin-poshtibani/tests/phase4b3.test.mjs backend/tamin-poshtibani/tests/phase4b4.test.mjs backend/tamin-poshtibani/tests/phones-multi.test.mjs backend/tamin-poshtibani/tests/push-hooks.test.mjs backend/tamin-poshtibani/tests/quote-rules.test.mjs backend/tamin-poshtibani/tests/ranking.test.mjs backend/tamin-poshtibani/tests/reports.test.mjs backend/tamin-poshtibani/tests/review-fixes.test.mjs backend/tamin-poshtibani/tests/sec-p0.test.mjs backend/tamin-poshtibani/tests/size-estimate.test.mjs backend/tamin-poshtibani/tests/sms-provider.test.mjs backend/tamin-poshtibani/tests/sp-ai.test.mjs backend/tamin-poshtibani/tests/state-notify.test.mjs backend/tamin-poshtibani/tests/structure.test.mjs backend/tamin-poshtibani/tests/supplier-over.test.mjs backend/tamin-poshtibani/tests/supplier.test.mjs backend/tamin-poshtibani/tests/support.test.mjs backend/tamin-poshtibani/tests/takeover.test.mjs backend/tamin-poshtibani/tests/tender-refer.test.mjs backend/tamin-poshtibani/tests/terms-company.test.mjs backend/tamin-poshtibani/tests/voice-bot.test.mjs backend/tamin-poshtibani/tests/w3-props.test.mjs
```
