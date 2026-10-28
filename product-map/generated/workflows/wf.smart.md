# wf.smart — درخواست هوشمند (کارشناس هوشمند، کارشناس ناظر)

> خودکار. گام‌ها از WORKFLOWSِ product-map/taxonomy.mjs؛ محلِ هر گام از PANELS؛ مسیر و تست از کد.

## گام 1 — روشن کردن 🤖 برای کارشناس و تنظیم‌ها

کننده: پشتیبانی
محل: پنل پشتیبانی تدارکات › 🤖 کارشناس هوشمند | پنل پشتیبانی تدارکات › 🤖 کارشناس هوشمند › 👥 کارشناسان و کارها (و داشبورد هر کارشناس) | پنل پشتیبانی تدارکات › 🤖 کارشناس هوشمند › 🧭 حالت اقلام | پنل پشتیبانی تدارکات › 🤖 کارشناس هوشمند › 🎛 کلیدها | پنل پشتیبانی تدارکات › 🤖 کارشناس هوشمند › ⏱ مهلتِ رسیدن به حد | پنل پشتیبانی تدارکات › 🤖 کارشناس هوشمند › 🏅 رتبه‌بندی و دعوت

| قابلیت | عنوان | مسیر | تست |
|---|---|---|---|
| [support.ai](../features/support.ai.md) | 🤖 کارشناس هوشمند | 17 | 8 |
| [support.md](../features/support.md.md) | 🧭 حالت اقلام | 3 | 3 |
| [support.sw](../features/support.sw.md) | 🎛 کلیدها | 2 | 1 |
| [support.rules](../features/support.rules.md) | ⏱ مهلتِ رسیدن به حد | 2 | 2 |
| [support.rank](../features/support.rank.md) | 🏅 رتبه‌بندی و دعوت | 2 | 1 |

## گام 2 — تأیید ساختار و بررسی سوابق

کننده: کارشناس
محل: پنل کارشناس خرید › صفحهٔ درخواست | پنل کارشناس خرید › صفحهٔ درخواست › بررسی سوابق

| قابلیت | عنوان | مسیر | تست |
|---|---|---|---|
| [expert.detail](../features/expert.detail.md) | صفحهٔ درخواست | 11 | 20 |
| [expert.history](../features/expert.history.md) | بررسی سوابق | 6 | 10 |

## گام 3 — 🎯 فهرست دعوت و 🚀 شروع

کننده: کارشناس
محل: پنل کارشناس خرید › صفحهٔ درخواست › بررسی سوابق › 🎯 فهرست دعوت | پنل کارشناس خرید › صفحهٔ درخواست › 🤖 نوار کارشناس هوشمند، 🚀 شروع و 👁 نظارت | پنل کارشناس خرید › صفحهٔ درخواست › 📘 سند راهبرد

| قابلیت | عنوان | مسیر | تست |
|---|---|---|---|
| [expert.picks](../features/expert.picks.md) | 🎯 فهرست دعوت | 2 | 16 |
| [expert.ai](../features/expert.ai.md) | کارشناس هوشمند | 4 | 15 |
| [engine.strategy](../features/engine.strategy.md) | موتور راهبرد خرید (CR-02) | 0 | 12 |

## گام 4 — مذاکرهٔ خودکار با تأمین‌کنندگان

کننده: کارشناس هوشمند ↔ تأمین‌کننده
محل: پنل تأمین‌کنندگان › پاسخ به استعلام: قیمت و شرایط هر قلم، گفت‌وگو

| قابلیت | عنوان | مسیر | تست |
|---|---|---|---|
| [engine.ai](../features/engine.ai.md) | موتور کارشناس هوشمند | 0 | 21 |
| [sup.panel](../features/sup.panel.md) | پاسخ به استعلام | 22 | 25 |
| [bot.sp](../features/bot.sp.md) | ربات تأمین‌کنندگان | 1 | 4 |

## گام 5 — 👁 نظارت کارشناس و پیشنهادها

کننده: کارشناس
محل: پنل کارشناس خرید › صفحهٔ درخواست › 🤖 نوار کارشناس هوشمند، 🚀 شروع و 👁 نظارت | مکاتبات با تأمین‌کنندگان › درخواست‌ها | مکاتبات با تأمین‌کنندگان › تأمین‌کنندگانِ یک درخواست | مکاتبات با تأمین‌کنندگان › گفت‌وگو | مکاتبات با تأمین‌کنندگان › گفت‌وگو › اقلام، پیش‌فاکتور و تأیید بسته

| قابلیت | عنوان | مسیر | تست |
|---|---|---|---|
| [expert.ai](../features/expert.ai.md) | کارشناس هوشمند | 4 | 15 |
| [corr.main](../features/corr.main.md) | مکاتبات با تأمین‌کنندگان | 15 | 23 |

## گام 6 — 📨 فراخوان پیش‌فاکتور رسمی

کننده: کارشناس هوشمند
محل: پنل کارشناس خرید › صفحهٔ درخواست › جدول کمیسیون › 📨 فراخوان پیش‌فاکتور رسمی و 📦 بستهٔ کمیسیون | پنل پشتیبانی تدارکات › 🤖 کارشناس هوشمند › 🎛 کلیدها › 📨 فراخوان پیش‌فاکتور رسمی

| قابلیت | عنوان | مسیر | تست |
|---|---|---|---|
| [expert.finalcall](../features/expert.finalcall.md) | 📨 فراخوانِ پیش‌فاکتورِ رسمی و 📦 بستهٔ کمیسیون | 7 | 2 |
| [support.finalcall](../features/support.finalcall.md) | 📨 فراخوانِ پیش‌فاکتورِ رسمی | 2 | 1 |

## گام 7 — جدول کمیسیون، تحویل و تأیید

کننده: کارشناس هوشمند ← پشتیبانی
محل: پنل کارشناس خرید › صفحهٔ درخواست › جدول کمیسیون | پنل پشتیبانی تدارکات › 📥 تحویل‌های هوشمند | پنل پشتیبانی تدارکات › تأیید کمیسیون

| قابلیت | عنوان | مسیر | تست |
|---|---|---|---|
| [expert.comm](../features/expert.comm.md) | جدول کمیسیون | 5 | 10 |
| [support.dl](../features/support.dl.md) | 📥 تحویل‌های هوشمند | 3 | 2 |
| [support.cm](../features/support.cm.md) | تأیید کمیسیون | 4 | 3 |

## جدول‌هایی که این جریان می‌نویسد

ai_agents، ai_calls، ai_feedback، ai_log، ai_props، ai_rates، ai_runs، ai_threads، alerts، assignments، commission_notes، commission_packages، commission_results، counters، cr_cache، cr_docs، cr_facts، cr_turns، decisions، events، experts، final_call_sups، final_calls، fm_choice، item_changes، item_edits، items، letters، offpf، outbox، proformas، quote_edits، quotes، req_hist، requests، settings، sp_bundles، sp_files، sp_lines، sp_links، sp_msgs، sp_passes، sp_phones، sp_phones_x، sp_sessions، sp_sms، sp_suppliers، sp_tg، sp_threads، templates، tg_seen، tpl_prefs، voice_jobs

## همهٔ تست‌های این جریان (51)

```
node --test backend/tamin-poshtibani/tests/ai-agent.test.mjs backend/tamin-poshtibani/tests/ai-feedback.test.mjs backend/tamin-poshtibani/tests/ai-mode-live.test.mjs backend/tamin-poshtibani/tests/ai-phase2.test.mjs backend/tamin-poshtibani/tests/ai-phase3.test.mjs backend/tamin-poshtibani/tests/ai-rates.test.mjs backend/tamin-poshtibani/tests/ai-waves.test.mjs backend/tamin-poshtibani/tests/catalog.test.mjs backend/tamin-poshtibani/tests/commission-need.test.mjs backend/tamin-poshtibani/tests/commission-result.test.mjs backend/tamin-poshtibani/tests/cr-boxes.test.mjs backend/tamin-poshtibani/tests/cr-doc.test.mjs backend/tamin-poshtibani/tests/cr-firstmsg.test.mjs backend/tamin-poshtibani/tests/cr-headname.test.mjs backend/tamin-poshtibani/tests/cr-hold.test.mjs backend/tamin-poshtibani/tests/cr-picks.test.mjs backend/tamin-poshtibani/tests/cr-registry.test.mjs backend/tamin-poshtibani/tests/cr-turn.test.mjs backend/tamin-poshtibani/tests/d1-budget.test.mjs backend/tamin-poshtibani/tests/discovered.test.mjs backend/tamin-poshtibani/tests/docs.test.mjs backend/tamin-poshtibani/tests/execution-ready.test.mjs backend/tamin-poshtibani/tests/final-call.test.mjs backend/tamin-poshtibani/tests/help-glossary.test.mjs backend/tamin-poshtibani/tests/history.test.mjs backend/tamin-poshtibani/tests/layer-locks.test.mjs backend/tamin-poshtibani/tests/login.test.mjs backend/tamin-poshtibani/tests/multiprice.test.mjs backend/tamin-poshtibani/tests/neg-view.test.mjs backend/tamin-poshtibani/tests/orphans.test.mjs backend/tamin-poshtibani/tests/phase4.test.mjs backend/tamin-poshtibani/tests/phase4b.test.mjs backend/tamin-poshtibani/tests/phase4b2.test.mjs backend/tamin-poshtibani/tests/phase4b3.test.mjs backend/tamin-poshtibani/tests/phase4b4.test.mjs backend/tamin-poshtibani/tests/phones-multi.test.mjs backend/tamin-poshtibani/tests/ranking.test.mjs backend/tamin-poshtibani/tests/reports.test.mjs backend/tamin-poshtibani/tests/review-fixes.test.mjs backend/tamin-poshtibani/tests/size-estimate.test.mjs backend/tamin-poshtibani/tests/sms-provider.test.mjs backend/tamin-poshtibani/tests/sp-ai.test.mjs backend/tamin-poshtibani/tests/strategy-engine.test.mjs backend/tamin-poshtibani/tests/strategy-parity.test.mjs backend/tamin-poshtibani/tests/structure.test.mjs backend/tamin-poshtibani/tests/supplier-over.test.mjs backend/tamin-poshtibani/tests/supplier.test.mjs backend/tamin-poshtibani/tests/support.test.mjs backend/tamin-poshtibani/tests/takeover.test.mjs backend/tamin-poshtibani/tests/terms-company.test.mjs backend/tamin-poshtibani/tests/w3-props.test.mjs
```
