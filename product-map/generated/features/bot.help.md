# bot.help — دستیار سامانه

بخش: ربات‌های تلگرام

> گفت‌وگوی راهنما در همهٔ پنل‌ها، با دانشِ ساخته‌شده از متن‌های راهنما.

## فایل‌های این قابلیت (صاحب)
- `worker/help-bot.js` — HELP_DDL، HELP_MODEL، helpAsk، helpClear، helpHistory، helpRequest
- `worker/help-knowledge.js` — HELP_KNOWLEDGE، HELP_KNOWLEDGE_FP

## مسیرهای سرور (5)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `* /help/chat` | w/api.js › route | — | ✓ |
| `* /help/chat/clear` | w/api.js › route | — | ✓ |
| `GET /help/chat` | w/api.js › route | w/help-bot.js#helpHistory | ✓ |
| `POST /help/chat` | w/api.js › route | w/help-bot.js#helpAsk | ✓ |
| `POST /help/chat/clear` | w/api.js › route | w/help-bot.js#helpClear | ✓ |

## فراخوان در پنل‌ها (3)
- ui.js › clearChat → `* /help/chat/clear`، `POST /help/chat/clear` (صفحه: correspond.html، expert.html، manager.html، supplier.html، support.html، tender.html)
- ui.js › loadChat → `* /help/chat`، `GET /help/chat`، `POST /help/chat` (صفحه: correspond.html، expert.html، manager.html، supplier.html، support.html، tender.html)
- ui.js › send → `* /help/chat`، `GET /help/chat`، `POST /help/chat` (صفحه: correspond.html، expert.html، manager.html، supplier.html، support.html، tender.html)

## جدول‌ها
نوشتن: help_msgs
خواندن: —

## تست‌ها (3)
- d1-budget.test.mjs
- help-bot.test.mjs
- help-glossary.test.mjs

```
node --test backend/tamin-poshtibani/tests/d1-budget.test.mjs backend/tamin-poshtibani/tests/help-bot.test.mjs backend/tamin-poshtibani/tests/help-glossary.test.mjs
```
