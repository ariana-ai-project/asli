# بات‌ها: دستورها، دکمه‌ها و کارهای زمان‌بندی‌شده

> خودکار. دکمه = پیشوندِ callback_data؛ پاسخ‌گو جایی است که همان پیشوند را می‌گیرد (action === "x"، /^x:/، startsWith("x:")).
> دکمه‌ای که پاسخ‌گو نداشته باشد خطای نقشه است.

## دستورها

| دستور | پاسخ‌گو | قابلیت |
|---|---|---|
| /azmayesh | w/bot.js › onMessage | bot.team |
| /cancel | w/sp-bot.js › onMessage، w/sp-voicemode.js › voiceUpdate، w/voice-bot.js › onMessage | bot.sp، bot.voice |
| /ghaleb | w/bot.js › onMessage | bot.team |
| /kartabl | w/bot.js › onMessage | bot.team |
| /manager | w/bot.js › onMessage | bot.team |
| /start | w/bot.js › handleTeamUpdate، w/bot.js › onMessage، w/sp-bot.js › onMessage، w/voice-bot.js › onMessage | bot.sp، bot.team، bot.voice |
| /stop | w/bot.js › handleTeamUpdate، w/bot.js › onMessage | bot.team |
| /support | w/bot.js › onMessage | bot.team |

## دکمه‌ها (73)

| دکمه | پاسخ‌گو | قابلیتِ پاسخ‌گو | سازنده‌ها |
|---|---|---|---|
| `ai:` | w/bot.js › onCallback، w/sp-bot.js › bundleAction | bot.sp، bot.team | w/bot.js › attachProforma، w/bot.js › presentExtraction، w/bot.js › onExtract |
| `aw:` | w/bot.js › onCallback | bot.team | w/bot.js › awaitedProforma، w/bot.js › awaitStatus |
| `cc:` | w/sp-bot.js › onCallback | bot.sp | w/sp-bot.js › onCallback، w/sp-push.js › showThread |
| `cm:` | w/bot.js › onCallback | bot.team | w/bot.js › requestMenu، w/bot.js › makeTable، w/bot.js › closeCard، w/bot.js › deliverSend، w/support.js › setCommission |
| `ct:` | w/bot.js › onCallback | bot.team | w/bot.js › requestMenu، w/bot.js › quoteCard، w/bot.js › tableSelect، w/bot.js › makeTable، w/bot.js › qtabRender |
| `dg:` | w/bot.js › onCallback | bot.team | w/assign.js › seenKb، w/bot.js › firstStepsKb، w/bot.js › requestMenu |
| `dgt:` | w/bot.js › onCallback | bot.team | w/bot.js › delegateMenu |
| `dv:` | w/bot.js › onCallback | bot.team | w/bot.js › makeLetter، w/bot.js › deliverCard، w/bot.js › deliverNext، w/bot.js › addAttachment |
| `dvo:` | w/bot.js › onCallback | bot.team | w/bot.js › requestMenu، w/bot.js › makeTable، w/bot.js › closeCard، w/bot.js › makeLetter |
| `fc:` | w/bot.js › onCallback | bot.team | w/bot.js › makeTable |
| `fl:` | w/bot.js › onCallback | bot.team | w/bot.js › askFieldText، w/bot.js › notesAsk، w/bot.js › templateAsk، w/bot.js › onTemplateText |
| `go:` | w/sp-bot.js › onCallback | bot.sp | w/ai-agent.js › tellExpert، w/sp-push.js › pushMsgs، w/sp-push.js › deliverSms |
| `hb:` | w/bot.js › onCallback | bot.team | w/bot.js › hubKb |
| `hm:` | w/bot.js › onCallback | bot.team | w/bot.js › histModeCard، w/bot.js › histPicker |
| `hp:` | w/bot.js › onCallback | bot.team | w/bot.js › histPicker |
| `hq:` | w/bot.js › onCallback | bot.team | w/bot.js › histItemRender |
| `hs:` | w/bot.js › onCallback | bot.team | w/bot.js › firstStepsKb، w/bot.js › requestMenu |
| `hv:` | w/bot.js › onCallback | bot.team | w/bot.js › histPicker، w/bot.js › spSupPick، w/bot.js › spSendGo |
| `hx:` | w/bot.js › onCallback | bot.team | w/bot.js › histModeCard، w/bot.js › histSelCard، w/bot.js › histRun، w/bot.js › histPicker |
| `hz:` | w/bot.js › onCallback | bot.team | w/bot.js › histItemRender |
| `ic:` | w/sp-bot.js › onCallback | bot.sp | w/sp-push.js › lineCard، w/sp-push.js › actionKb |
| `kt:` | w/bot.js › onCallback، w/tg-nav.js › stripNav | bot.team | w/bot.js › firstStepsKb، w/bot.js › — |
| `ls:` | w/bot.js › onCallback | bot.team | w/bot.js › letterSubjectRender |
| `lt:` | w/bot.js › onCallback | bot.team | w/bot.js › startLetter، w/bot.js › letterConfirmKb، w/bot.js › letterEdit |
| `mdec:` | w/bot.js › onCallback | bot.team | w/decisions.js › decisionRequestStmt |
| `mn:` | w/bot.js › onCallback | bot.team | w/bot.js › manualStart، w/bot.js › manualItems |
| `mseen:` | w/bot.js › onCallback | bot.team | w/manager.js › notifyClosed |
| `oc:` | w/sp-bot.js › onCallback | bot.sp | w/sp-bot.js › offpfReply |
| `op:` | w/sp-bot.js › onCallback | bot.sp | w/sp-bot.js › offpfReply، w/sp-bot.js › itemsCardSend، w/sp-bot.js › onCallback |
| `pb:` | w/bot.js › onCallback | bot.team | w/bot.js › propAfterReason |
| `pbx:` | w/bot.js › onCallback | bot.team | w/bot.js › boxKb |
| `pf:` | w/bot.js › onCallback، w/sp-bot.js › bundleAction | bot.sp، bot.team | w/bot.js › dropFileKb، w/bot.js › freeProforma، w/bot.js › uploadItems، w/bot.js › uploadSupplier، w/bot.js › awaitedProforma |
| `prop:` | w/bot.js › onCallback | bot.team | w/ai-agent.js › propKb |
| `qc:` | w/bot.js › onCallback | bot.team | w/bot.js › askEnum، w/bot.js › editMenu، w/bot.js › onCallback |
| `qe:` | w/bot.js › onCallback | bot.team | w/bot.js › quoteCard |
| `qf:` | w/bot.js › onCallback | bot.team | w/bot.js › quoteCard، w/bot.js › editMenu |
| `qk:` | w/bot.js › onCallback | bot.team | w/bot.js › attachProforma، w/bot.js › presentExtraction، w/bot.js › onExtract |
| `qs:` | w/bot.js › onCallback | bot.team | w/bot.js › quoteCard |
| `qt:` | w/bot.js › onCallback | bot.team | w/bot.js › hubKb، w/bot.js › requestMenu، w/bot.js › quoteCard، w/bot.js › tableSelect، w/bot.js › presentExtraction، … (+2) |
| `qv:` | w/bot.js › onCallback | bot.team | w/bot.js › askEnum |
| `qw:` | w/bot.js › onCallback | bot.team | w/bot.js › quoteCard |
| `qx:` | w/bot.js › onCallback | bot.team | w/bot.js › qtabRender، w/bot.js › qtabDeleteConfirm، w/bot.js › onCallback |
| `rq:` | w/bot.js › onCallback، w/tg-nav.js › stripNav | bot.team | w/bot.js › reqBtn، w/bot.js › reqKb، w/bot.js › kartabl، w/bot.js › requestMenu، w/bot.js › makeTable |
| `rs:` | w/sp-bot.js › onCallback | bot.sp | w/sp-bot.js › startSupplier، w/sp-bot.js › pendingPass، w/sp-bot.js › supplierMessage |
| `rv:` | w/sp-bot.js › onCallback | bot.sp | w/sp-push.js › lineCard |
| `sa:` | w/sp-bot.js › onCallback | bot.sp | w/sp-bot.js › wizardNext، w/sp-bot.js › onCallback، w/sp-push.js › lineCard |
| `seen:` | w/bot.js › onCallback | bot.team | w/assign.js › seenKb |
| `sf:` | w/bot.js › onCallback | bot.team | w/bot.js › smartPrefsKb، w/bot.js › smartMarketMenu |
| `sg:` | w/bot.js › onCallback، w/sp-bot.js › onCallback | bot.sp، bot.team | w/bot.js › smartChoiceKb، w/bot.js › templatePick، w/bot.js › onCallback، w/sp-bot.js › onCallback |
| `si:` | w/sp-bot.js › onCallback | bot.sp | w/sp-bot.js › askValue، w/sp-bot.js › askTerm، w/sp-bot.js › wizardNext، w/sp-bot.js › onCallback، w/sp-push.js › itemsCard |
| `sl:` | w/sp-bot.js › onCallback | bot.sp | w/sp-push.js › lineCard |
| `sm:` | w/bot.js › onCallback | bot.team | w/bot.js › firstStepsKb، w/bot.js › hubKb، w/bot.js › requestMenu، w/bot.js › smartPickItem |
| `sp:` | w/sp-bot.js › onCallback | bot.sp | w/sp-push.js › itemsCard، w/sp-push.js › actionKb |
| `spf:` | w/bot.js › onCallback | bot.team | w/bot.js › spSupPick، w/bot.js › spTplPick، w/bot.js › spSendPick، w/bot.js › spSendLabel، w/bot.js › spSendConfirm، … (+1) |
| `sq:` | w/bot.js › onCallback، w/sp-bot.js › onCallback | bot.sp، bot.team | w/bot.js › smartChoiceKb، w/sp-bot.js › onCallback |
| `sr:` | w/sp-bot.js › onCallback | bot.sp | w/sp-push.js › lineCard |
| `ss:` | w/sp-bot.js › onCallback | bot.sp | w/sp-push.js › itemsCard، w/sp-push.js › lineCard |
| `st:` | w/sp-bot.js › onCallback | bot.sp | w/sp-bot.js › listSupplierThreads |
| `sv:` | w/sp-bot.js › onCallback | bot.sp | w/sp-bot.js › askValue، w/sp-push.js › lineCard |
| `sy:` | w/sp-bot.js › onCallback | bot.sp | w/sp-push.js › lineCard |
| `tk:` | w/sp-bot.js › onCallback | bot.sp | w/sp-push.js › lineCard |
| `tp:` | w/bot.js › onCallback | bot.team | w/bot.js › templatePick، w/bot.js › templateList، w/bot.js › templateView، w/bot.js › onTemplateAction، w/bot.js › onCallback |
| `tq:` | w/team.js › teamPageFor، w/team.js › handleTeamCallback | expert.team | w/team.js › teamPage، w/team.js › expertPage، w/team.js › assignPage، w/team.js › teamMenuKb |
| `tv:` | w/sp-bot.js › onCallback | bot.sp | w/sp-bot.js › askTerm |
| `vo:` | w/sp-bot.js › onCallback | bot.sp | w/sp-voicemode.js › —، w/sp-voicemode.js › askKb |
| `wz:` | w/sp-bot.js › onCallback | bot.sp | w/sp-bot.js › askValue، w/sp-bot.js › askTerm، w/sp-bot.js › wizardNext، w/sp-bot.js › onCallback، w/sp-push.js › lineCard |
| `xa:` | w/sp-bot.js › onCallback | bot.sp | w/sp-push.js › bundleCard |
| `xc:` | w/sp-bot.js › onCallback | bot.sp | w/sp-bot.js › bundleAction، w/sp-bot.js › supplierMessage، w/sp-bot.js › onCallback |
| `xd:` | w/sp-bot.js › onCallback | bot.sp | w/sp-bot.js › decideAndShow، w/sp-push.js › bundleCard، w/sp-push.js › aiConfirmKb |
| `xl:` | w/sp-bot.js › onCallback | bot.sp | w/sp-bot.js › listSuppliersOfRequest، w/sp-bot.js › listRequestsOfSupplier |
| `xr:` | w/sp-bot.js › onCallback | bot.sp | w/sp-bot.js › listRequests |
| `xs:` | w/sp-bot.js › onCallback | bot.sp | w/sp-bot.js › listSuppliers |
| `xt:` | w/sp-bot.js › onCallback | bot.sp | w/sp-bot.js › listSuppliersOfRequest، w/sp-bot.js › listRequestsOfSupplier |

## کارهای زمان‌بندی‌شده (Cron؛ wrangler.toml › [triggers])

### worker.js#scheduled (infra.core)

- w/alarms.js › raiseAlarm — notify.alarms
- w/api.js › ensureSchema — infra.core
- w/bot.js › scheduled — bot.team
- w/d1-guard.js › guardEnv — infra.core
- w/legal.js › legalCleanup — legal.app
- w/push.js › drainPush — notify.push
- w/relay.js › relayOn — notify.sms
- w/relay.js › relayWatch — notify.sms
- w/sp-bot.js › ensureSpWebhook — bot.sp
- w/strategy-doc.js › crDocTick — engine.strategy
- w/tender.js › tenderDiscoverTick — engine.tender
- w/tender.js › tenderTick — engine.tender
- w/voice-bot.js › ensureVbWebhook — bot.voice
- w/voice-core.js › VOICE_CRON — bot.voice
- w/voice-core.js › runVoiceJobs — bot.voice
- worker.js › voiceBots — infra.core

### worker/bot.js#scheduled (bot.team)

- w/ai-agent.js › aiTick — engine.ai
- w/estimate.js › estimateRun — engine.structure
- w/final-call.js › finalCallTick — expert.finalcall
- w/manager.js › stageWatch — manager.desk
- w/settings.js › getSettings — infra.core
- w/telegram.js › telegram — notify.telegram
- w/tg-nav.js › pushNavMenus — bot.team
- w/usd.js › usdDaily — support.usd
- w/usd.js › usdSlot — support.usd
- w/bot.js › drainOutbox — bot.team
- w/bot.js › runAlerts — bot.team
- w/bot.js › runSmartJobs — bot.team
- w/bot.js › settingValue — bot.team
