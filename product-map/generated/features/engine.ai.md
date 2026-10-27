# engine.ai — موتور کارشناس هوشمند

بخش: موتورهای مشترک سرور | جریان کار: wf.smart (گام 4)

> مذاکرهٔ خودکار با تأمین‌کنندگان، قفل‌ها، پیشنهادهای نظارتی، تحویل به کارشناس و هزینهٔ مدل.

## فایل‌های این قابلیت (صاحب)
- `worker/ai-agent.js` — AI_DDL، AI_DEFAULTS، agentOf، aiAdmin، aiHandoff، aiKick، aiModeSet، aiRebase، aiReleaseStmts، aiResumeStmts، aiRoute، aiTick، aiWaves، autoDecide، cfgOf، createRun، picksRoute، preTickN، …
- `worker/ai-fetch.js` — PRICES، aiFetch، estimateCost
- `worker/ai-lock.js` — AI_ASK_SQL، AI_LIVE_MSG، AI_LOCK_MSG، AI_OWNED_SQL، AI_QUOTE_MSG، AI_REJECTED_SQL، AI_SUP_SQL، AI_THREAD_MSG، AI_WATCH_MSG، HOLD_ON_SQL، LINE_HEAD_SQL، TURN_CAP، WF_SQL، aiAsks، aiModeOn، aiOwned، aiQuote، aiQuoteLive، …
- `worker/ai-md.js` — SOURCE_FA، msgEntry، runMd، threadSection
- `worker/ai-prompts.js` — AGENT_MODEL، AGENT_MODELS، AiError، CLOSING_SCHEMA، EFFORTS، NEGOTIATE_SCHEMA، callModel، closingReport، closingSystem، modelOk، negotiate، negotiateSystem، negotiationContext، replayCall
- `worker/ai-rates.js` — RATE_DDL، RATE_MSG_SQL، gapText، rate، rateGaps، rateable، ratesForModel، threadRates
- `worker/ai-supervise.js` — BUNDLE_ACTS، PROP_FA، PROP_STATE_FA، SUP_DEFAULT، SUP_FA، SUP_MIN، SUP_MODES، SUP_RANK، WORKFLOWS، WORKFLOW_SUP، getSup، holdOn، manualBundles، propOut، propsOf، rejectBody، saveSup، supCfg، …
- `worker/ai-takeover.js` — handbackThread، takeoverThread
- `worker/neg-view.js` — NEG_SIG_SQL، NEG_STATE_FA، negSig، negView

## مسیرهای سرور (0)
—

## فراخوان در پنل‌ها (0)
—

## جدول‌ها
نوشتن: ai_agents، ai_calls، ai_log، ai_props، ai_rates، ai_runs، ai_threads، alerts، assignments، events، experts، items، letters، outbox، quotes، sp_phones
خواندن: cr_facts، cr_head_x، cr_heads، cr_turns، decisions، final_calls، requests، settings، smart_searches، sp_bundles، sp_lines، sp_msgs، sp_sms، sp_suppliers، sp_tg، sp_threads، supplier_phones
هم‌نویس‌های همین جدول‌ها: bot.team، corr.main، expert.ai، expert.letter، infra.core، login.supplier، manager.desk، notify.telegram، sup.panel، support.ai، support.fb

## تست‌ها (21)
- ai-agent.test.mjs
- ai-feedback.test.mjs
- ai-mode-live.test.mjs
- ai-phase2.test.mjs
- ai-phase3.test.mjs
- ai-rates.test.mjs
- ai-waves.test.mjs
- cr-boxes.test.mjs
- cr-doc.test.mjs
- cr-hold.test.mjs
- cr-picks.test.mjs
- cr-turn.test.mjs
- execution-ready.test.mjs
- final-call.test.mjs
- neg-view.test.mjs
- phase4.test.mjs
- phase4b2.test.mjs
- phase4b3.test.mjs
- phase4b4.test.mjs
- supplier.test.mjs
- w3-props.test.mjs

```
node --test backend/tamin-poshtibani/tests/ai-agent.test.mjs backend/tamin-poshtibani/tests/ai-feedback.test.mjs backend/tamin-poshtibani/tests/ai-mode-live.test.mjs backend/tamin-poshtibani/tests/ai-phase2.test.mjs backend/tamin-poshtibani/tests/ai-phase3.test.mjs backend/tamin-poshtibani/tests/ai-rates.test.mjs backend/tamin-poshtibani/tests/ai-waves.test.mjs backend/tamin-poshtibani/tests/cr-boxes.test.mjs backend/tamin-poshtibani/tests/cr-doc.test.mjs backend/tamin-poshtibani/tests/cr-hold.test.mjs backend/tamin-poshtibani/tests/cr-picks.test.mjs backend/tamin-poshtibani/tests/cr-turn.test.mjs backend/tamin-poshtibani/tests/execution-ready.test.mjs backend/tamin-poshtibani/tests/final-call.test.mjs backend/tamin-poshtibani/tests/neg-view.test.mjs backend/tamin-poshtibani/tests/phase4.test.mjs backend/tamin-poshtibani/tests/phase4b2.test.mjs backend/tamin-poshtibani/tests/phase4b3.test.mjs backend/tamin-poshtibani/tests/phase4b4.test.mjs backend/tamin-poshtibani/tests/supplier.test.mjs backend/tamin-poshtibani/tests/w3-props.test.mjs
```
