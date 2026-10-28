# sup.panel — پاسخ به استعلام

بخش: پنل تأمین‌کننده | راهنما: help-content.js «sup.panel» | جریان کار: wf.request (گام 6)، wf.smart (گام 4)، wf.supplier (گام 3)

> برای هر قلم قیمت واحد (ریال، بدون ارزش افزوده) و شرایط فاکتور را بدهید — قیمت کل خودکار است — و «آمادهٔ ارسال» و «📤 ارسال» را بزنید. تازه‌ترها بالا هستند.

محل در رابط:
- پنل تأمین‌کنندگان › پاسخ به استعلام: قیمت و شرایط هر قلم، گفت‌وگو

## فایل‌های این قابلیت (صاحب)
- `frontend/tamin-poshtibani/sp.css`
- `frontend/tamin-poshtibani/sup.css`
- `frontend/tamin-poshtibani/supplier.html`
- `frontend/tamin-poshtibani/supplier.js` — $، $$، latin، toNum، code، tag، pad، when، lockOf، layerTxt، extraOf، jToday، g، lockPhone، onPhoneMode، authHeaders، api، go، …
- `worker/sp-ai.js` — AI_VERSION، acceptable، aiUsable، bundlePrompt، headKey، judge، lineKey، numOf، resolve، runAiCheck
- `worker/sp-api.js` — spRoute، verifyInitData
- `worker/sp-core.js` — BUNDLE_FA، COMPANY، CORR_PATH، DEMO_GONE، DOCX_MIME، FILE_LABELS، LINE_EDITABLE، LINE_FA، LOCK_MSG، PANEL_PATH، RESERVED_PHONE، SP_COLUMNS، SP_DDL، TERM_ENUMS، TERM_FA، TERM_FIELDS، TERM_REQUIRED، acceptRows، …
- `worker/sp-sms.js` — deliverPass، deliverSms، smsNote

## مسیرهای سرور (22)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `DELETE /sp/file/{}` | w/sp-api.js › spRoute | w/sp-core.js#delFile، w/storage.js#storage | — |
| `GET /sp/bundle/{}/pf-url` | w/sp-api.js › spRoute | w/sp-core.js#proformaOfBundle | — |
| `GET /sp/bundle/{}/proforma` | w/sp-api.js › spRoute | w/pfdoc.js#PROFORMA_CSS، w/pfdoc.js#proformaHtml، w/pfdoc.js#renderProformaDoc، w/sp-core.js#DOCX_MIME، w/sp-core.js#bundleProforma، w/sp-core.js#proformaInput | ✓ |
| `GET /sp/file/{}/url` | w/sp-api.js › spRoute | w/sp-core.js#fileFor | — |
| `GET /sp/me` | w/sp-api.js › spRoute | w/sp-core.js#COMPANY، w/sp-core.js#FILE_LABELS، w/sp-core.js#TERM_ENUMS، w/sp-core.js#TERM_FA، w/sp-core.js#TERM_REQUIRED، w/sp-core.js#botLink، … | ✓ |
| `GET /sp/msg/{}/voice` | w/sp-api.js › spRoute | w/sp-core.js#voiceOf، w/storage.js#storage | ✓ |
| `GET /sp/poll` | w/sp-api.js › spRoute | w/neg-view.js#NEG_SIG_SQL، w/neg-view.js#negSig، w/sp-core.js#poll، w/sp-core.js#threadFor | ✓ |
| `GET /sp/thread/{}` | w/sp-api.js › spRoute | w/final-call.js#callForThread، w/neg-view.js#negView، w/sp-core.js#threadFor، w/sp-core.js#threadFull | ✓ |
| `POST /sp/bundle/{}/proforma` | w/sp-api.js › spRoute | w/ai-agent.js#aiKick، w/sp-core.js#proformaTarget، w/sp-core.js#setProforma، w/sp-push.js#pushMsgs، w/storage.js#storage | ✓ |
| `POST /sp/line/{}/file` | w/sp-api.js › spRoute | w/ai-agent.js#aiKick، w/sp-core.js#addFile، w/sp-core.js#fileTarget، w/sp-core.js#threadFor، w/sp-push.js#pushMsgs | ✓ |
| `POST /sp/line/{}/ready` | w/sp-api.js › spRoute | w/sp-core.js#lineReady | ✓ |
| `POST /sp/line/{}/revise` | w/sp-api.js › spRoute | w/sp-core.js#lineRevise، w/sp-core.js#threadRow، w/sp-push.js#pushMsgs | ✓ |
| `POST /sp/offpf/{}/decide` | w/sp-api.js › spRoute | w/final-call.js#offpfDecide | ✓ |
| `POST /sp/thread/{}/clear` | w/sp-api.js › spRoute | w/sp-core.js#clearMsgs، w/sp-core.js#threadFor | ✓ |
| `POST /sp/thread/{}/msg` | w/sp-api.js › spRoute | w/ai-agent.js#aiKick، w/sp-core.js#postMsg، w/sp-core.js#threadFor، w/sp-push.js#pushMsgs | ✓ |
| `POST /sp/thread/{}/offpf` | w/sp-api.js › spRoute | w/final-call.js#offpfIngest، w/sp-core.js#threadFor، w/storage.js#storage | ✓ |
| `POST /sp/thread/{}/preview` | w/sp-api.js › spRoute | w/pfdoc.js#PROFORMA_CSS، w/pfdoc.js#proformaHtml، w/pfdoc.js#renderProformaDoc، w/sp-core.js#DOCX_MIME، w/sp-core.js#previewTarget، w/sp-core.js#proformaInput | ✓ |
| `POST /sp/thread/{}/submit` | w/sp-api.js › spRoute | w/ai-agent.js#aiKick، w/ai-agent.js#autoDecide، w/ai-agent.js#propCardsNow، w/final-call.js#markSubmitted، w/final-call.js#submitOffpf، w/sp-core.js#submitLines، … | ✓ |
| `POST /sp/thread/{}/submit-pf` | w/sp-api.js › spRoute | w/ai-agent.js#aiKick، w/ai-agent.js#autoDecide، w/ai-agent.js#propCardsNow، w/final-call.js#submitOffpf، w/sp-core.js#submitLines، w/sp-core.js#threadFor، … | ✓ |
| `POST /sp/thread/{}/voice` | w/sp-api.js › spRoute | w/sp-core.js#msgFor، w/sp-core.js#threadFor، w/sp-voice.js#VOICE_MAX، w/sp-voice.js#ingestVoice | ✓ |
| `POST\|PUT /sp/thread/{}/terms` | w/sp-api.js › spRoute | w/sp-core.js#termsSave | ✓ |
| `PUT /sp/line/{}` | w/sp-api.js › spRoute | w/sp-core.js#lineSave | ✓ |

## فراخوان در پنل‌ها (29)
- correspond.js › answerAsk → `POST /sp/thread/{}/msg` (صفحه: correspond.html)
- correspond.js › bind → `POST /sp/thread/{}/clear` (صفحه: correspond.html)
- correspond.js › go → `POST /sp/thread/{}/msg` (صفحه: correspond.html)
- correspond.js › loadThread → `GET /sp/thread/{}` (صفحه: correspond.html)
- correspond.js › pfDialog → `GET /sp/bundle/{}/proforma` (صفحه: correspond.html)
- correspond.js › poll → `GET /sp/poll` (صفحه: correspond.html)
- supplier.js › Q → `POST /sp/line/{}/ready` (صفحه: supplier.html)
- supplier.js › bindChat → `POST /sp/thread/{}/msg`، `POST /sp/thread/{}/clear` (صفحه: supplier.html)
- supplier.js › boot → `GET /sp/me` (صفحه: supplier.html)
- supplier.js › bot → `PUT /sp/line/{}`، `POST /sp/line/{}/revise`، `POST|PUT /sp/thread/{}/terms`، `POST /sp/line/{}/ready` (صفحه: supplier.html)
- supplier.js › bundlePfDialog → `GET /sp/bundle/{}/proforma` (صفحه: supplier.html)
- supplier.js › doSubmit → `POST /sp/thread/{}/submit`، `POST /sp/thread/{}/submit-pf` (صفحه: supplier.html)
- supplier.js › flowInput → `PUT /sp/line/{}`، `POST|PUT /sp/thread/{}/terms` (صفحه: supplier.html)
- supplier.js › go → `POST /sp/offpf/{}/decide` (صفحه: supplier.html)
- supplier.js › loadThread → `GET /sp/thread/{}` (صفحه: supplier.html)
- supplier.js › offpfUpload → `POST /sp/thread/{}/offpf` (صفحه: supplier.html)
- supplier.js › pfBot → `POST /sp/bundle/{}/proforma` (صفحه: supplier.html)
- supplier.js › poll → `GET /sp/poll`، `GET /sp/me` (صفحه: supplier.html)
- supplier.js › previewDialog → `POST /sp/thread/{}/preview` (صفحه: supplier.html)
- supplier.js › reviseLine → `POST /sp/line/{}/revise` (صفحه: supplier.html)
- supplier.js › saveLine → `PUT /sp/line/{}` (صفحه: supplier.html)
- supplier.js › saveTerms → `POST|PUT /sp/thread/{}/terms` (صفحه: supplier.html)
- supplier.js › sendVoice → `POST /sp/thread/{}/voice` (صفحه: supplier.html)
- supplier.js › submitBot → `POST /sp/thread/{}/submit`، `POST /sp/thread/{}/submit-pf` (صفحه: supplier.html)
- supplier.js › submitDialog → `POST /sp/thread/{}/submit-pf`، `POST /sp/thread/{}/submit` (صفحه: supplier.html)
- supplier.js › upd → `POST /sp/line/{}/ready`، `DELETE /sp/file/{}` (صفحه: supplier.html)
- supplier.js › uploadAttach → `POST /sp/line/{}/file` (صفحه: supplier.html)
- supplier.js › uploadFile → `POST /sp/line/{}/file` (صفحه: supplier.html)
- supplier.js › uploadPf → `POST /sp/bundle/{}/proforma` (صفحه: supplier.html)

جای راهنما در کد: supplier.js › renderAll

متغیرهای Worker (نام): AI_MODEL، ANTHROPIC_API_BASE، ANTHROPIC_API_KEY، COMPANY، SITE_ORIGIN، TG_BOT_TOKEN، TG_SP_BOT_TOKEN، TG_SP_BOT_USERNAME، TG_WEBHOOK_SECRET

## جدول‌ها
نوشتن: ai_runs، events، final_call_sups، offpf، outbox، proformas، quotes، settings، sp_bundles، sp_files، sp_lines، sp_links، sp_msgs، sp_passes، sp_phones، sp_phones_x، sp_sessions، sp_sms، sp_suppliers، sp_tg، sp_threads
خواندن: ai_agents، ai_props، ai_threads، assignments، cr_facts، cr_turns، experts، final_calls، items، requests
هم‌نویس‌های همین جدول‌ها: bot.sp، bot.team، corr.main، engine.ai، expert.finalcall، expert.quotes، infra.core، login.supplier، manager.desk، notify.telegram، support.ai، support.cm، support.fb

## تست‌ها (25)
- ai-agent.test.mjs
- ai-mode-live.test.mjs
- ai-phase2.test.mjs
- ai-phase3.test.mjs
- ai-rates.test.mjs
- cr-boxes.test.mjs
- cr-doc.test.mjs
- cr-firstmsg.test.mjs
- cr-hold.test.mjs
- cr-registry.test.mjs
- cr-turn.test.mjs
- final-call.test.mjs
- layer-locks.test.mjs
- multiprice.test.mjs
- neg-view.test.mjs
- orphans.test.mjs
- phase4.test.mjs
- phase4b3.test.mjs
- phase4b4.test.mjs
- phones-multi.test.mjs
- sp-ai.test.mjs
- supplier.test.mjs
- takeover.test.mjs
- terms-company.test.mjs
- w3-props.test.mjs

```
node --test backend/tamin-poshtibani/tests/ai-agent.test.mjs backend/tamin-poshtibani/tests/ai-mode-live.test.mjs backend/tamin-poshtibani/tests/ai-phase2.test.mjs backend/tamin-poshtibani/tests/ai-phase3.test.mjs backend/tamin-poshtibani/tests/ai-rates.test.mjs backend/tamin-poshtibani/tests/cr-boxes.test.mjs backend/tamin-poshtibani/tests/cr-doc.test.mjs backend/tamin-poshtibani/tests/cr-firstmsg.test.mjs backend/tamin-poshtibani/tests/cr-hold.test.mjs backend/tamin-poshtibani/tests/cr-registry.test.mjs backend/tamin-poshtibani/tests/cr-turn.test.mjs backend/tamin-poshtibani/tests/final-call.test.mjs backend/tamin-poshtibani/tests/layer-locks.test.mjs backend/tamin-poshtibani/tests/multiprice.test.mjs backend/tamin-poshtibani/tests/neg-view.test.mjs backend/tamin-poshtibani/tests/orphans.test.mjs backend/tamin-poshtibani/tests/phase4.test.mjs backend/tamin-poshtibani/tests/phase4b3.test.mjs backend/tamin-poshtibani/tests/phase4b4.test.mjs backend/tamin-poshtibani/tests/phones-multi.test.mjs backend/tamin-poshtibani/tests/sp-ai.test.mjs backend/tamin-poshtibani/tests/supplier.test.mjs backend/tamin-poshtibani/tests/takeover.test.mjs backend/tamin-poshtibani/tests/terms-company.test.mjs backend/tamin-poshtibani/tests/w3-props.test.mjs
```

## مرتبط
- login.supplier — ورود به پنل تأمین‌کنندگان
