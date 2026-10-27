# bot.sp — ربات تأمین‌کنندگان

بخش: ربات‌های تلگرام | جریان کار: wf.request (گام 6)، wf.smart (گام 4)، wf.supplier (گام 2)

> بات تلگرامِ تأمین‌کنندگان (SP-bot): همان پنل تأمین‌کننده در تلگرام، منوها، حالت صدا.

## فایل‌های این قابلیت (صاحب)
- `worker/sp-bot.js` — ensureSpWebhook، extraOf، handleSpUpdate
- `worker/sp-push.js` — ICON، LEGEND، MENU، TERM_BTN، TERM_KEY، acceptList، aiConfirmKb، appUrl، bundleCard، clearChat، deliverSms، fa، flowOf، hasBoth، headerText، itemsCard، lineCard، lineTag، …
- `worker/sp-voice.js` — VOICE_MAX، ingestVoice
- `worker/sp-voicemode.js` — VOICE_EXIT، VOICE_PW، askCallback، enterVoice، handler، voiceCallback، voicePassVer، voiceUpdate

## مسیرهای سرور (1)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `POST /tg/sp-webhook` | w/api.js › route | w/sp-bot.js#handleSpUpdate | — |

## فراخوان در پنل‌ها (0)
—

## جدول‌ها
نوشتن: settings، sp_links، sp_tg، tg_seen، voice_jobs
خواندن: experts، offpf، sp_bundles، sp_files، sp_lines، sp_msgs، sp_phones، sp_suppliers، sp_threads
هم‌نویس‌های همین جدول‌ها: bot.team، bot.voice، corr.main، infra.core، sup.panel

## تست‌ها (4)
- ai-agent.test.mjs
- final-call.test.mjs
- multiprice.test.mjs
- supplier.test.mjs

```
node --test backend/tamin-poshtibani/tests/ai-agent.test.mjs backend/tamin-poshtibani/tests/final-call.test.mjs backend/tamin-poshtibani/tests/multiprice.test.mjs backend/tamin-poshtibani/tests/supplier.test.mjs
```
