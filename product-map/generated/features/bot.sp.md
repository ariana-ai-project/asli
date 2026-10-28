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

## در بات‌ها
دستورها: /start (w/sp-bot.js › onMessage)، /cancel (w/sp-bot.js › onMessage)، /cancel (w/sp-voicemode.js › voiceUpdate)

| دکمه | پاسخ‌گو | سازنده‌ها |
|---|---|---|
| `ai:` | w/bot.js › onCallback، w/sp-bot.js › bundleAction | w/bot.js › attachProforma، w/bot.js › presentExtraction، w/bot.js › onExtract |
| `cc:` | w/sp-bot.js › onCallback | w/sp-bot.js › onCallback، w/sp-push.js › showThread |
| `go:` | w/sp-bot.js › onCallback | w/ai-agent.js › tellExpert، w/sp-push.js › pushMsgs، w/sp-push.js › deliverSms |
| `ic:` | w/sp-bot.js › onCallback | w/sp-push.js › lineCard، w/sp-push.js › actionKb |
| `oc:` | w/sp-bot.js › onCallback | w/sp-bot.js › offpfReply |
| `op:` | w/sp-bot.js › onCallback | w/sp-bot.js › offpfReply، w/sp-bot.js › itemsCardSend، w/sp-bot.js › onCallback |
| `pf:` | w/bot.js › onCallback، w/sp-bot.js › bundleAction | w/bot.js › dropFileKb، w/bot.js › freeProforma، w/bot.js › uploadItems، w/bot.js › uploadSupplier، w/bot.js › awaitedProforma |
| `rs:` | w/sp-bot.js › onCallback | w/sp-bot.js › startSupplier، w/sp-bot.js › pendingPass، w/sp-bot.js › supplierMessage |
| `rv:` | w/sp-bot.js › onCallback | w/sp-push.js › lineCard |
| `sa:` | w/sp-bot.js › onCallback | w/sp-bot.js › wizardNext، w/sp-bot.js › onCallback، w/sp-push.js › lineCard |
| `sg:` | w/bot.js › onCallback، w/sp-bot.js › onCallback | w/bot.js › smartChoiceKb، w/bot.js › templatePick، w/bot.js › onCallback، w/sp-bot.js › onCallback |
| `si:` | w/sp-bot.js › onCallback | w/sp-bot.js › askValue، w/sp-bot.js › askTerm، w/sp-bot.js › wizardNext، w/sp-bot.js › onCallback، w/sp-push.js › itemsCard |
| `sl:` | w/sp-bot.js › onCallback | w/sp-push.js › lineCard |
| `sp:` | w/sp-bot.js › onCallback | w/sp-push.js › itemsCard، w/sp-push.js › actionKb |
| `sq:` | w/bot.js › onCallback، w/sp-bot.js › onCallback | w/bot.js › smartChoiceKb، w/sp-bot.js › onCallback |
| `sr:` | w/sp-bot.js › onCallback | w/sp-push.js › lineCard |
| `ss:` | w/sp-bot.js › onCallback | w/sp-push.js › itemsCard، w/sp-push.js › lineCard |
| `st:` | w/sp-bot.js › onCallback | w/sp-bot.js › listSupplierThreads |
| `sv:` | w/sp-bot.js › onCallback | w/sp-bot.js › askValue، w/sp-push.js › lineCard |
| `sy:` | w/sp-bot.js › onCallback | w/sp-push.js › lineCard |
| `tk:` | w/sp-bot.js › onCallback | w/sp-push.js › lineCard |
| `tv:` | w/sp-bot.js › onCallback | w/sp-bot.js › askTerm |
| `vo:` | w/sp-bot.js › onCallback | w/sp-voicemode.js › —، w/sp-voicemode.js › askKb |
| `wz:` | w/sp-bot.js › onCallback | w/sp-bot.js › askValue، w/sp-bot.js › askTerm، w/sp-bot.js › wizardNext، w/sp-bot.js › onCallback، w/sp-push.js › lineCard |
| `xa:` | w/sp-bot.js › onCallback | w/sp-push.js › bundleCard |
| `xc:` | w/sp-bot.js › onCallback | w/sp-bot.js › bundleAction، w/sp-bot.js › supplierMessage، w/sp-bot.js › onCallback |
| `xd:` | w/sp-bot.js › onCallback | w/sp-bot.js › decideAndShow، w/sp-push.js › bundleCard، w/sp-push.js › aiConfirmKb |
| `xl:` | w/sp-bot.js › onCallback | w/sp-bot.js › listSuppliersOfRequest، w/sp-bot.js › listRequestsOfSupplier |
| `xr:` | w/sp-bot.js › onCallback | w/sp-bot.js › listRequests |
| `xs:` | w/sp-bot.js › onCallback | w/sp-bot.js › listSuppliers |
| `xt:` | w/sp-bot.js › onCallback | w/sp-bot.js › listSuppliersOfRequest، w/sp-bot.js › listRequestsOfSupplier |

متغیرهای Worker (نام): TG_SP_BOT_TOKEN، TG_WEBHOOK_SECRET

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
