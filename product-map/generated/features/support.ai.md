# support.ai — 🤖 کارشناس هوشمند

بخش: پنل پشتیبانی | راهنما: help-content.js «support.ai» | جریان کار: wf.smart (گام 1)

> تیکِ 🤖 هوشمند: همهٔ درخواست‌های بازِ این کارشناس — نه فقط ارجاع‌های تازه — همان لحظه قلم‌به‌قلم پیش می‌روند — کارشناس ساختار را تأیید می‌کند، «بررسی سوابق» را می‌زند و در «🎯 فهرست دعوت»ِ هر قلم تیک‌ها را می‌بیند و «🚀 شروع» می‌زند؛ از آن پس دعوت، مذاکره، جدول کمیسیون و نامه با کارشناس هوشمند است. پرسش‌های بی‌پاسخ و داشبوردِ هر کارشناس همین‌جاست.

محل در رابط:
- پنل پشتیبانی تدارکات › 🤖 کارشناس هوشمند
- پنل پشتیبانی تدارکات › 🤖 کارشناس هوشمند › 👥 کارشناسان و کارها (و داشبورد هر کارشناس)

## فایل‌های این قابلیت (صاحب)
- `frontend/tamin-poshtibani/expert-ai.js` — p2، when، usd، tok، api، load، tick، vHead، vSubTabs، vRuns، vRun، phoneCell، vCalls، vSms، vPhones، modelOpts، effortOpts، vSettings، …

## مسیرهای سرور (17)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /support/ai/{}/calls` | w/ai-agent.js › aiAdmin | — | ✓ |
| `GET /support/ai/{}/calls/{}` | w/ai-agent.js › aiAdmin | — | ✓ |
| `GET /support/ai/{}/phones` | w/ai-agent.js › aiAdmin | w/sms.js#isMobile، w/sp-core.js#latin، w/sp-core.js#nkey | ✓ |
| `GET /support/ai/{}/runs/{}` | w/ai-agent.js › aiAdmin | — | ✓ |
| `GET /support/ai/{}/runs/{}/md` | w/ai-agent.js › aiAdmin | — | ✓ |
| `GET /support/ai/{}/sms` | w/ai-agent.js › aiAdmin | w/sms.js#smsLabel، w/sms.js#smsReady | ✓ |
| `GET /support/ai/{}/state` | w/ai-agent.js › aiAdmin | w/ai-prompts.js#AGENT_MODELS، w/ai-prompts.js#EFFORTS، w/discovery.js#MARKETS، w/discovery.js#MAX_MARKETS، w/sms.js#smsLabel، w/sms.js#smsReady | ✓ |
| `GET /support/ai/experts` | w/ai-agent.js › aiAdmin | — | ✓ |
| `POST /support/ai/{}/calls/{}/replay` | w/ai-agent.js › aiAdmin | w/ai-prompts.js#EFFORTS، w/ai-prompts.js#modelOk، w/ai-prompts.js#negotiate، w/ai-prompts.js#replayCall | ✓ |
| `POST /support/ai/{}/phones` | w/ai-agent.js › aiAdmin | w/sp-core.js#savePhone | ✓ |
| `POST /support/ai/{}/rebase` | w/ai-agent.js › aiAdmin | — | ✓ |
| `POST /support/ai/{}/runs` | w/ai-agent.js › aiAdmin | w/ai-lock.js#aiRevStmt | ✓ |
| `POST /support/ai/{}/runs/{}/act` | w/ai-agent.js › aiAdmin | — | ✓ |
| `POST /support/ai/{}/runs/{}/supplier` | w/ai-agent.js › aiAdmin | w/sp-core.js#maskPhone، w/sp-core.js#savePhone | ✓ |
| `PUT /support/ai/{}/config` | w/ai-agent.js › aiAdmin | w/ai-prompts.js#EFFORTS، w/ai-prompts.js#modelOk | ✓ |
| `PUT /support/ai/{}/mode` | w/ai-agent.js › aiAdmin | — | ✓ |
| `PUT /support/ai/{}/phones/{}` | w/ai-agent.js › aiAdmin | w/sp-core.js#nrm، w/sp-core.js#setPanel | ✓ |

## فراخوان در پنل‌ها (11)
- expert-ai.js › Q → `PUT /support/ai/{}/mode` (صفحه: support.html)
- expert-ai.js › callDialog → `POST /support/ai/{}/calls/{}/replay` (صفحه: support.html)
- expert-ai.js › load → `GET /support/ai/{}/state`، `GET /support/ai/{}/runs/{}`، `GET /support/ai/{}/calls`، `GET /support/ai/{}/sms`، `GET /support/ai/{}/phones` (صفحه: support.html)
- expert-ai.js › phoneDialog → `POST /support/ai/{}/phones` (صفحه: support.html)
- expert-ai.js › ul → `POST /support/ai/{}/rebase`، `POST /support/ai/{}/runs`، `POST /support/ai/{}/runs/{}/act`، `PUT /support/ai/{}/phones/{}`، `POST /support/ai/{}/phones` (صفحه: support.html)
- expert-ai.js › wire → `POST /support/ai/{}/rebase`، `POST /support/ai/{}/runs/{}/supplier`، `GET /support/ai/{}/calls/{}`، `POST /support/ai/{}/phones`، `PUT /support/ai/{}/config` (صفحه: support.html)
- fb-admin.js › showCtx → `GET /support/ai/{}/calls`، `GET /support/ai/{}/phones`، `GET /support/ai/{}/sms`، `GET /support/ai/{}/state` (صفحه: support.html)
- support-panel.js › aiPulse → `GET /support/ai/experts` (صفحه: support.html)
- support-panel.js › aiToggle → `PUT /support/ai/{}/mode` (صفحه: support.html)
- support-panel.js › loadAi → `GET /support/ai/experts` (صفحه: support.html)
- support-panel.js › loadDl → `GET /support/ai/{}/calls`، `GET /support/ai/{}/phones`، `GET /support/ai/{}/sms`، `GET /support/ai/{}/state` (صفحه: support.html)

جای راهنما در کد: expert-ai.js › vHead، expert-ai.js › vRuns، expert-ai.js › vRun، expert-ai.js › vCalls، expert-ai.js › vSms، expert-ai.js › vPhones، expert-ai.js › f

## جدول‌ها
نوشتن: ai_agents، ai_calls، ai_log، ai_runs، ai_threads، events، items، sp_phones
خواندن: ai_props، assignments، decisions، experts، letters، requests، sp_bundles، sp_lines، sp_msgs، sp_sms، sp_suppliers، sp_threads
هم‌نویس‌های همین جدول‌ها: corr.main، engine.ai، infra.core، login.supplier، sup.panel، support.fb

## تست‌ها (8)
- ai-agent.test.mjs
- ai-feedback.test.mjs
- ai-mode-live.test.mjs
- ai-phase2.test.mjs
- ai-phase3.test.mjs
- phase4.test.mjs
- phase4b2.test.mjs
- sms-provider.test.mjs

```
node --test backend/tamin-poshtibani/tests/ai-agent.test.mjs backend/tamin-poshtibani/tests/ai-feedback.test.mjs backend/tamin-poshtibani/tests/ai-mode-live.test.mjs backend/tamin-poshtibani/tests/ai-phase2.test.mjs backend/tamin-poshtibani/tests/ai-phase3.test.mjs backend/tamin-poshtibani/tests/phase4.test.mjs backend/tamin-poshtibani/tests/phase4b2.test.mjs backend/tamin-poshtibani/tests/sms-provider.test.mjs
```

## مرتبط
- support.dl — 📥 تحویل‌های هوشمند
- support.rules — ⏱ مهلتِ رسیدن به حد
- support.rank — 🏅 رتبه‌بندی و دعوت
- support.usd — 💵 نرخ دلار
- support.md — 🧭 حالت اقلام
- support.sw — 🎛 کلیدها
- expert.ai — کارشناس هوشمند
