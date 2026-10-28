# bot.team — ربات کارشناسان و تیم

بخش: ربات‌های تلگرام

> بات تلگرامِ کارشناسان و سرگروه‌ها: اعلان ارجاع، منو، مینی‌اپ و صف پیام.

## فایل‌های این قابلیت (صاحب)
- `worker/bot.js` — STAGE_NAMES، dispatchText، drainOutbox، ensureTeamWebhook، extractSummary، handleTeamUpdate، handleUpdate، makeLink، makeTeamLink، managerOverdueText، overdueText، parsePrice، queueStmt، runAlerts، runSmartJobs، scheduled، seenKb، stageAlertText
- `worker/tg-nav.js` — MENU_V، NAV، NAV_DDL، ensureMenu، expertAppUrl، navApi، navKeyboard، navLoad، navSave، pushNavMenus، stripNav

## مسیرهای سرور (8)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /tg/flows` | w/api.js › route | — | — |
| `GET /tg/setup` | w/api.js › route | w/telegram.js#telegram | — |
| `GET /tg/status` | w/api.js › route | — | — |
| `POST /tg/link` | w/api.js › route | w/bot.js#makeLink | — |
| `POST /tg/setup` | w/api.js › route | w/bot.js#ensureTeamWebhook، w/sp-bot.js#ensureSpWebhook، w/telegram.js#telegram، w/voice-bot.js#ensureVbWebhook | — |
| `POST /tg/team-webhook` | w/api.js › route | w/bot.js#handleTeamUpdate | — |
| `POST /tg/tick` | w/api.js › route | w/bot.js#scheduled | — |
| `POST /tg/webhook` | w/api.js › route | w/bot.js#handleUpdate | — |

## فراخوان در پنل‌ها (1)
- expert.js › tgConnect → `POST /tg/link` (صفحه: expert.html)

## در بات‌ها
دستورها: /start (w/bot.js › handleTeamUpdate)، /stop (w/bot.js › handleTeamUpdate)، /start (w/bot.js › onMessage)، /support (w/bot.js › onMessage)، /manager (w/bot.js › onMessage)، /stop (w/bot.js › onMessage)، /kartabl (w/bot.js › onMessage)، /ghaleb (w/bot.js › onMessage)، /azmayesh (w/bot.js › onMessage)

| دکمه | پاسخ‌گو | سازنده‌ها |
|---|---|---|
| `ai:` | w/bot.js › onCallback، w/sp-bot.js › bundleAction | w/bot.js › attachProforma، w/bot.js › presentExtraction، w/bot.js › onExtract |
| `aw:` | w/bot.js › onCallback | w/bot.js › awaitedProforma، w/bot.js › awaitStatus |
| `cm:` | w/bot.js › onCallback | w/bot.js › requestMenu، w/bot.js › makeTable، w/bot.js › closeCard، w/bot.js › deliverSend، w/support.js › setCommission |
| `ct:` | w/bot.js › onCallback | w/bot.js › requestMenu، w/bot.js › quoteCard، w/bot.js › tableSelect، w/bot.js › makeTable، w/bot.js › qtabRender |
| `dg:` | w/bot.js › onCallback | w/assign.js › seenKb، w/bot.js › firstStepsKb، w/bot.js › requestMenu |
| `dgt:` | w/bot.js › onCallback | w/bot.js › delegateMenu |
| `dv:` | w/bot.js › onCallback | w/bot.js › makeLetter، w/bot.js › deliverCard، w/bot.js › deliverNext، w/bot.js › addAttachment |
| `dvo:` | w/bot.js › onCallback | w/bot.js › requestMenu، w/bot.js › makeTable، w/bot.js › closeCard، w/bot.js › makeLetter |
| `fc:` | w/bot.js › onCallback | w/bot.js › makeTable |
| `fl:` | w/bot.js › onCallback | w/bot.js › askFieldText، w/bot.js › notesAsk، w/bot.js › templateAsk، w/bot.js › onTemplateText |
| `hb:` | w/bot.js › onCallback | w/bot.js › hubKb |
| `hm:` | w/bot.js › onCallback | w/bot.js › histModeCard، w/bot.js › histPicker |
| `hp:` | w/bot.js › onCallback | w/bot.js › histPicker |
| `hq:` | w/bot.js › onCallback | w/bot.js › histItemRender |
| `hs:` | w/bot.js › onCallback | w/bot.js › firstStepsKb، w/bot.js › requestMenu |
| `hv:` | w/bot.js › onCallback | w/bot.js › histPicker، w/bot.js › spSupPick، w/bot.js › spSendGo |
| `hx:` | w/bot.js › onCallback | w/bot.js › histModeCard، w/bot.js › histSelCard، w/bot.js › histRun، w/bot.js › histPicker |
| `hz:` | w/bot.js › onCallback | w/bot.js › histItemRender |
| `kt:` | w/bot.js › onCallback، w/tg-nav.js › stripNav | w/bot.js › firstStepsKb، w/bot.js › — |
| `ls:` | w/bot.js › onCallback | w/bot.js › letterSubjectRender |
| `lt:` | w/bot.js › onCallback | w/bot.js › startLetter، w/bot.js › letterConfirmKb، w/bot.js › letterEdit |
| `mdec:` | w/bot.js › onCallback | w/decisions.js › decisionRequestStmt |
| `mn:` | w/bot.js › onCallback | w/bot.js › manualStart، w/bot.js › manualItems |
| `mseen:` | w/bot.js › onCallback | w/manager.js › notifyClosed |
| `pb:` | w/bot.js › onCallback | w/bot.js › propAfterReason |
| `pbx:` | w/bot.js › onCallback | w/bot.js › boxKb |
| `pf:` | w/bot.js › onCallback، w/sp-bot.js › bundleAction | w/bot.js › dropFileKb، w/bot.js › freeProforma، w/bot.js › uploadItems، w/bot.js › uploadSupplier، w/bot.js › awaitedProforma |
| `prop:` | w/bot.js › onCallback | w/ai-agent.js › propKb |
| `qc:` | w/bot.js › onCallback | w/bot.js › askEnum، w/bot.js › editMenu، w/bot.js › onCallback |
| `qe:` | w/bot.js › onCallback | w/bot.js › quoteCard |
| `qf:` | w/bot.js › onCallback | w/bot.js › quoteCard، w/bot.js › editMenu |
| `qk:` | w/bot.js › onCallback | w/bot.js › attachProforma، w/bot.js › presentExtraction، w/bot.js › onExtract |
| `qs:` | w/bot.js › onCallback | w/bot.js › quoteCard |
| `qt:` | w/bot.js › onCallback | w/bot.js › hubKb، w/bot.js › requestMenu، w/bot.js › quoteCard، w/bot.js › tableSelect، w/bot.js › presentExtraction، … (+2) |
| `qv:` | w/bot.js › onCallback | w/bot.js › askEnum |
| `qw:` | w/bot.js › onCallback | w/bot.js › quoteCard |
| `qx:` | w/bot.js › onCallback | w/bot.js › qtabRender، w/bot.js › qtabDeleteConfirm، w/bot.js › onCallback |
| `rq:` | w/bot.js › onCallback، w/tg-nav.js › stripNav | w/bot.js › reqBtn، w/bot.js › reqKb، w/bot.js › kartabl، w/bot.js › requestMenu، w/bot.js › makeTable |
| `seen:` | w/bot.js › onCallback | w/assign.js › seenKb |
| `sf:` | w/bot.js › onCallback | w/bot.js › smartPrefsKb، w/bot.js › smartMarketMenu |
| `sg:` | w/bot.js › onCallback، w/sp-bot.js › onCallback | w/bot.js › smartChoiceKb، w/bot.js › templatePick، w/bot.js › onCallback، w/sp-bot.js › onCallback |
| `sm:` | w/bot.js › onCallback | w/bot.js › firstStepsKb، w/bot.js › hubKb، w/bot.js › requestMenu، w/bot.js › smartPickItem |
| `spf:` | w/bot.js › onCallback | w/bot.js › spSupPick، w/bot.js › spTplPick، w/bot.js › spSendPick، w/bot.js › spSendLabel، w/bot.js › spSendConfirm، … (+1) |
| `sq:` | w/bot.js › onCallback، w/sp-bot.js › onCallback | w/bot.js › smartChoiceKb، w/sp-bot.js › onCallback |
| `tp:` | w/bot.js › onCallback | w/bot.js › templatePick، w/bot.js › templateList، w/bot.js › templateView، w/bot.js › onTemplateAction، w/bot.js › onCallback |

متغیرهای Worker (نام): ANTHROPIC_API_KEY، COMPANY، TG_BOT_TOKEN، TG_BOT_USERNAME، TG_IGNORE_HOURS، TG_TEAM_BOT_TOKEN، TG_TEAM_BOT_USERNAME، TG_WEBHOOK_SECRET

## جدول‌ها
نوشتن: alerts، assignments، events، experts، items، letters، outbox، proformas، quote_edits، quotes، settings، smart_jobs، templates، tg_flows، tg_nav، tg_seen، tg_tokens، tg_uploads
خواندن: ai_props، requests، sp_threads، supplier_phones
هم‌نویس‌های همین جدول‌ها: bot.sp، bot.voice، engine.ai، expert.ai، expert.finalcall، expert.letter، expert.msgtpl، expert.quotes، expert.team، infra.core، manager.desk، notify.telegram، sup.panel

## تست‌ها (6)
- bot-fixes.test.mjs
- bot-history.test.mjs
- cr-boxes.test.mjs
- d1-budget.test.mjs
- phase4b4.test.mjs
- supplier.test.mjs

```
node --test backend/tamin-poshtibani/tests/bot-fixes.test.mjs backend/tamin-poshtibani/tests/bot-history.test.mjs backend/tamin-poshtibani/tests/cr-boxes.test.mjs backend/tamin-poshtibani/tests/d1-budget.test.mjs backend/tamin-poshtibani/tests/phase4b4.test.mjs backend/tamin-poshtibani/tests/supplier.test.mjs
```
