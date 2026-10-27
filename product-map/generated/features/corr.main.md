# corr.main — مکاتبات با تأمین‌کنندگان

بخش: مکاتبات | راهنما: help-content.js «corr.main» | جریان کار: wf.request (گام 6)، wf.smart (گام 5)، wf.supplier (گام 1)، wf.supplier (گام 4)

> هر گفت‌وگو = یک درخواست × یک تأمین‌کننده. راست: درخواست‌ها و تأمین‌کنندگانِ درخواستِ انتخاب‌شده (با شمار نخوانده)؛ وسط: «اقلام و تصمیم‌ها»؛ چپ: گفت‌وگو داخل گوشی. در صفحهٔ باریک، همان گفت‌وگو تمام‌صفحه است و «اقلام و تصمیم‌ها» با دکمهٔ 📦 بالای گفت‌وگو باز می‌شود.

## فایل‌های این قابلیت (صاحب)
- `frontend/tamin-poshtibani/correspond.html`
- `frontend/tamin-poshtibani/correspond.js` — $، $$، fa، money، short، cut، qty، code، when، onPhoneMode، api، termsLine، dlg، close، say، top، renderLogin، loadList، …
- `frontend/tamin-poshtibani/ph-chat.js` — fa، esc، money، qty، dtf، hm، dayKey، stamp، durTxt، evItems، evCard، wave، rnd، voiceHtml، feed، kindOf، sideOf، isAi، …
- `frontend/tamin-poshtibani/ph-props.js` — bundlesOf، talk، bundleEv، anchors، target، fail، T، finBody، replaceBody، acts
- `frontend/tamin-poshtibani/phone-frame.svg`

## مسیرهای سرور (15)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /sp/x/inbox` | w/sp-api.js › spRoute | w/sp-core.js#expertInbox | ✓ |
| `GET /sp/x/items` | w/sp-api.js › spRoute | w/sp-core.js#sendableItems | ✓ |
| `GET /sp/x/phones` | w/sp-api.js › spRoute | w/sp-core.js#phonesOfName | ✓ |
| `GET /sp/x/thread/{}/neg` | w/sp-api.js › spRoute | w/neg-view.js#negView، w/sp-core.js#threadFor | ✓ |
| `GET /sp/x/threads` | w/sp-api.js › spRoute | w/sp-core.js#FILE_LABELS، w/sp-core.js#TERM_FA، w/sp-core.js#expertThreads، w/sp-core.js#spBotUser، w/switches.js#pfReadOn | ✓ |
| `POST /sp/x/bundle/{}/accept` | w/sp-api.js › spRoute | w/sp-core.js#acceptRows | ✓ |
| `POST /sp/x/bundle/{}/ai` | w/sp-api.js › spRoute | w/sp-ai.js#runAiCheck، w/sp-core.js#aiTarget، w/sp-core.js#saveAi | ✓ |
| `POST /sp/x/bundle/{}/decide` | w/sp-api.js › spRoute | w/sp-core.js#decide، w/sp-push.js#pushMsgs | ✓ |
| `POST /sp/x/phones` | w/sp-api.js › spRoute | w/sp-core.js#savePhone | ✓ |
| `POST /sp/x/prop/{}` | w/sp-api.js › spRoute | w/ai-agent.js#propDecide | ✓ |
| `POST /sp/x/rate` | w/sp-api.js › spRoute | w/ai-rates.js#rate | ✓ |
| `POST /sp/x/send` | w/sp-api.js › spRoute | w/sp-core.js#maskPhone، w/sp-core.js#spSend، w/sp-push.js#pushMsgs، w/sp-sms.js#deliverSms، w/sp-sms.js#smsNote | ✓ |
| `POST /sp/x/tglink` | w/sp-api.js › spRoute | w/sp-core.js#expertLink | ✓ |
| `POST /sp/x/thread/{}/handback` | w/sp-api.js › spRoute | w/ai-takeover.js#handbackThread، w/sp-core.js#threadFor | ✓ |
| `POST /sp/x/thread/{}/takeover` | w/sp-api.js › spRoute | w/ai-takeover.js#takeoverThread، w/sp-core.js#threadFor | ✓ |

## فراخوان در پنل‌ها (25)
- correspond.js › act → `POST /sp/x/bundle/{}/ai`، `POST /sp/x/bundle/{}/accept`، `POST /sp/x/bundle/{}/decide` (صفحه: correspond.html)
- correspond.js › bind → `POST /sp/x/bundle/{}/accept` (صفحه: correspond.html)
- correspond.js › connectTg → `POST /sp/x/tglink` (صفحه: correspond.html)
- correspond.js › decide → `POST /sp/x/bundle/{}/decide` (صفحه: correspond.html)
- correspond.js › dueTick → `POST /sp/x/prop/{}` (صفحه: correspond.html)
- correspond.js › go → `POST /sp/x/bundle/{}/decide` (صفحه: correspond.html)
- correspond.js › handbackDialog → `POST /sp/x/thread/{}/handback` (صفحه: correspond.html)
- correspond.js › holdProp → `POST /sp/x/prop/{}` (صفحه: correspond.html)
- correspond.js › loadList → `GET /sp/x/threads` (صفحه: correspond.html)
- correspond.js › propOk → `POST /sp/x/prop/{}` (صفحه: correspond.html)
- correspond.js › propSend → `POST /sp/x/prop/{}` (صفحه: correspond.html)
- correspond.js › rateThread → `POST /sp/x/rate` (صفحه: correspond.html)
- correspond.js › refreshNeg → `GET /sp/x/thread/{}/neg` (صفحه: correspond.html)
- correspond.js › send → `POST /sp/x/rate` (صفحه: correspond.html)
- correspond.js › sendDialog → `GET /sp/x/items`، `POST /sp/x/send`، `GET /sp/x/phones`، `POST /sp/x/phones` (صفحه: correspond.html)
- correspond.js › takeoverDialog → `POST /sp/x/thread/{}/takeover` (صفحه: correspond.html)
- expert.js › addSpPhone → `GET /sp/x/phones`، `POST /sp/x/phones` (صفحه: expert.html)
- expert.js › dcPhoneUI → `GET /sp/x/phones`، `POST /sp/x/phones` (صفحه: expert.html)
- expert.js › dcPickUI → `GET /sp/x/phones`، `POST /sp/x/phones` (صفحه: expert.html)
- expert.js › loadSpPhones → `GET /sp/x/phones`، `POST /sp/x/phones` (صفحه: expert.html)
- expert.js › pkPhoneUI → `GET /sp/x/phones`، `POST /sp/x/phones` (صفحه: expert.html)
- expert.js › reqCommentUI → `POST /sp/x/rate` (صفحه: expert.html)
- expert.js › saveLetterRate → `POST /sp/x/rate` (صفحه: expert.html)
- expert.js › showNew → `GET /sp/x/phones`، `POST /sp/x/phones`، `POST /sp/x/send` (صفحه: expert.html)
- expert.js › smPickUI → `GET /sp/x/phones`، `POST /sp/x/phones` (صفحه: expert.html)

جای راهنما: correspond.js

## جدول‌ها
نوشتن: ai_log، ai_props، ai_rates، ai_runs، ai_threads، events، settings، sp_bundles، sp_lines، sp_links، sp_phones، sp_sms، sp_tg، sp_threads
خواندن: ai_agents، assignments، cr_facts، cr_turns، items، letters، proformas، quotes، requests، sp_msgs، sp_suppliers
هم‌نویس‌های همین جدول‌ها: bot.sp، engine.ai، expert.ai، expert.finalcall، infra.core، login.supplier، sup.panel، support.ai، support.cm، support.fb

## تست‌ها (23)
- ai-feedback.test.mjs
- ai-mode-live.test.mjs
- ai-phase2.test.mjs
- ai-rates.test.mjs
- cr-boxes.test.mjs
- cr-doc.test.mjs
- cr-hold.test.mjs
- cr-picks.test.mjs
- cr-turn.test.mjs
- d1-budget.test.mjs
- final-call.test.mjs
- login.test.mjs
- multiprice.test.mjs
- neg-view.test.mjs
- phase4.test.mjs
- phase4b2.test.mjs
- phase4b3.test.mjs
- phase4b4.test.mjs
- sms-provider.test.mjs
- supplier.test.mjs
- takeover.test.mjs
- terms-company.test.mjs
- w3-props.test.mjs

```
node --test backend/tamin-poshtibani/tests/ai-feedback.test.mjs backend/tamin-poshtibani/tests/ai-mode-live.test.mjs backend/tamin-poshtibani/tests/ai-phase2.test.mjs backend/tamin-poshtibani/tests/ai-rates.test.mjs backend/tamin-poshtibani/tests/cr-boxes.test.mjs backend/tamin-poshtibani/tests/cr-doc.test.mjs backend/tamin-poshtibani/tests/cr-hold.test.mjs backend/tamin-poshtibani/tests/cr-picks.test.mjs backend/tamin-poshtibani/tests/cr-turn.test.mjs backend/tamin-poshtibani/tests/d1-budget.test.mjs backend/tamin-poshtibani/tests/final-call.test.mjs backend/tamin-poshtibani/tests/login.test.mjs backend/tamin-poshtibani/tests/multiprice.test.mjs backend/tamin-poshtibani/tests/neg-view.test.mjs backend/tamin-poshtibani/tests/phase4.test.mjs backend/tamin-poshtibani/tests/phase4b2.test.mjs backend/tamin-poshtibani/tests/phase4b3.test.mjs backend/tamin-poshtibani/tests/phase4b4.test.mjs backend/tamin-poshtibani/tests/sms-provider.test.mjs backend/tamin-poshtibani/tests/supplier.test.mjs backend/tamin-poshtibani/tests/takeover.test.mjs backend/tamin-poshtibani/tests/terms-company.test.mjs backend/tamin-poshtibani/tests/w3-props.test.mjs
```

## مرتبط
- expert.quotes — استعلامات
- expert.ai — کارشناس هوشمند
- sup.panel — پاسخ به استعلام
