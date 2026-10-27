# notify.telegram — ارسال تلگرام و صف پیام

بخش: اعلان‌ها

## فایل‌های این قابلیت (صاحب)
- `worker/queue.js` — STAGE_NAMES، queueStmt
- `worker/telegram.js` — TgError، esc، telegram

## مسیرهای سرور (1)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `* /notify/telegram` | w/api.js › route | w/telegram.js#telegram | — |

## فراخوان در پنل‌ها (0)
—

## جدول‌ها
نوشتن: outbox
خواندن: —
هم‌نویس‌های همین جدول‌ها: bot.team، engine.ai، infra.core، manager.desk، sup.panel

## تست‌ها (1)
- bot-history.test.mjs

```
node --test backend/tamin-poshtibani/tests/bot-history.test.mjs
```
