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
