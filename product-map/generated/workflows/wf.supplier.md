# wf.supplier — پاسخ تأمین‌کننده به استعلام

> خودکار. گام‌ها از WORKFLOWSِ product-map/taxonomy.mjs؛ محلِ هر گام از PANELS؛ مسیر و تست از کد.

## گام 1 — ارسال استعلام با پیامک و لینک بات

کننده: کارشناس
محل: مکاتبات با تأمین‌کنندگان › درخواست‌ها | مکاتبات با تأمین‌کنندگان › تأمین‌کنندگانِ یک درخواست | مکاتبات با تأمین‌کنندگان › گفت‌وگو | مکاتبات با تأمین‌کنندگان › گفت‌وگو › اقلام، پیش‌فاکتور و تأیید بسته

| قابلیت | عنوان | مسیر | تست |
|---|---|---|---|
| [corr.main](../features/corr.main.md) | مکاتبات با تأمین‌کنندگان | 15 | 23 |
| [notify.sms](../features/notify.sms.md) | پیامک | 0 | 2 |

## گام 2 — ورود با رمز پیامکی یا از بات

کننده: تأمین‌کننده
محل: پنل تأمین‌کنندگان › ورود با رمز پیامکی

| قابلیت | عنوان | مسیر | تست |
|---|---|---|---|
| [login.supplier](../features/login.supplier.md) | ورود به پنل تأمین‌کنندگان | 4 | 4 |
| [bot.sp](../features/bot.sp.md) | ربات تأمین‌کنندگان | 1 | 4 |

## گام 3 — پر کردن قیمت و شرایط هر قلم و ارسال

کننده: تأمین‌کننده
محل: پنل تأمین‌کنندگان › پاسخ به استعلام: قیمت و شرایط هر قلم، گفت‌وگو | پنل کارشناس خرید › صفحهٔ درخواست › 📋 شرایط خرید هر قلم

| قابلیت | عنوان | مسیر | تست |
|---|---|---|---|
| [sup.panel](../features/sup.panel.md) | پاسخ به استعلام | 22 | 25 |
| [expert.terms](../features/expert.terms.md) | 📋 شرایط خرید هر قلم | 1 | 4 |

## گام 4 — تصمیم کارشناس روی بسته‌ها

کننده: کارشناس
محل: مکاتبات با تأمین‌کنندگان › درخواست‌ها | مکاتبات با تأمین‌کنندگان › تأمین‌کنندگانِ یک درخواست | مکاتبات با تأمین‌کنندگان › گفت‌وگو | مکاتبات با تأمین‌کنندگان › گفت‌وگو › اقلام، پیش‌فاکتور و تأیید بسته | پنل کارشناس خرید › صفحهٔ درخواست › استعلامات

| قابلیت | عنوان | مسیر | تست |
|---|---|---|---|
| [corr.main](../features/corr.main.md) | مکاتبات با تأمین‌کنندگان | 15 | 23 |
| [expert.quotes](../features/expert.quotes.md) | استعلامات | 10 | 11 |

## جدول‌هایی که این جریان می‌نویسد

ai_log، ai_props، ai_rates، ai_runs، ai_threads، events، final_call_sups، items، offpf، outbox، phone_channel_log، phone_channels، proformas، quote_edits، quotes، settings، sp_bundles، sp_files، sp_lines، sp_links، sp_msgs، sp_passes، sp_phones، sp_phones_x، sp_sessions، sp_sms، sp_suppliers، sp_tg، sp_threads، tg_seen، voice_jobs

## همهٔ تست‌های این جریان (38)

```
node --test backend/tamin-poshtibani/tests/ai-agent.test.mjs backend/tamin-poshtibani/tests/ai-feedback.test.mjs backend/tamin-poshtibani/tests/ai-mode-live.test.mjs backend/tamin-poshtibani/tests/ai-phase2.test.mjs backend/tamin-poshtibani/tests/ai-phase3.test.mjs backend/tamin-poshtibani/tests/ai-rates.test.mjs backend/tamin-poshtibani/tests/apply.test.mjs backend/tamin-poshtibani/tests/cr-boxes.test.mjs backend/tamin-poshtibani/tests/cr-doc.test.mjs backend/tamin-poshtibani/tests/cr-firstmsg.test.mjs backend/tamin-poshtibani/tests/cr-hold.test.mjs backend/tamin-poshtibani/tests/cr-picks.test.mjs backend/tamin-poshtibani/tests/cr-registry.test.mjs backend/tamin-poshtibani/tests/cr-turn.test.mjs backend/tamin-poshtibani/tests/d1-budget.test.mjs backend/tamin-poshtibani/tests/discovered.test.mjs backend/tamin-poshtibani/tests/execution-ready.test.mjs backend/tamin-poshtibani/tests/extract.test.mjs backend/tamin-poshtibani/tests/final-call.test.mjs backend/tamin-poshtibani/tests/layer-locks.test.mjs backend/tamin-poshtibani/tests/login.test.mjs backend/tamin-poshtibani/tests/multiprice.test.mjs backend/tamin-poshtibani/tests/neg-view.test.mjs backend/tamin-poshtibani/tests/orphans.test.mjs backend/tamin-poshtibani/tests/phase4.test.mjs backend/tamin-poshtibani/tests/phase4b2.test.mjs backend/tamin-poshtibani/tests/phase4b3.test.mjs backend/tamin-poshtibani/tests/phase4b4.test.mjs backend/tamin-poshtibani/tests/phones-multi.test.mjs backend/tamin-poshtibani/tests/quote-rules.test.mjs backend/tamin-poshtibani/tests/review-fixes.test.mjs backend/tamin-poshtibani/tests/sms-provider.test.mjs backend/tamin-poshtibani/tests/sp-ai.test.mjs backend/tamin-poshtibani/tests/supplier.test.mjs backend/tamin-poshtibani/tests/support.test.mjs backend/tamin-poshtibani/tests/takeover.test.mjs backend/tamin-poshtibani/tests/terms-company.test.mjs backend/tamin-poshtibani/tests/w3-props.test.mjs
```
