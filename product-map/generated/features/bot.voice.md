# bot.voice — ربات صدا به متن

بخش: ربات‌های تلگرام

> بات جدای تبدیل پیام صوتی به متن و موتور مشترک تبدیل صدا (برای نامهٔ کمیسیون هم).

## فایل‌های این قابلیت (صاحب)
- `worker/stt.js` — audioExt، sttReady، transcribe
- `worker/voice-bot.js` — MENU، ensureVbWebhook، handleVbUpdate، handler، vbApi
- `worker/voice-core.js` — INLINE_SECS، MAX_FILE، MAX_TRIES، TOO_BIG، VOICE_CRON، VOICE_DDL، checkPass، chunks، cleanPass، delMsgs، dropJob، dur، fa، jobOf، latin، passError، passRec، passVer، …

## مسیرهای سرور (2)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `POST /tg/vb-webhook` | w/api.js › route | w/voice-bot.js#handleVbUpdate | ✓ |
| `POST /voice/reset` | w/api.js › route | w/voice-core.js#resetPass | ✓ |

## فراخوان در پنل‌ها (0)
—

## جدول‌ها
نوشتن: settings، tg_seen، vb_chats، voice_jobs
خواندن: —
هم‌نویس‌های همین جدول‌ها: bot.sp، bot.team، infra.core

## تست‌ها (2)
- supplier.test.mjs
- voice-bot.test.mjs

```
node --test backend/tamin-poshtibani/tests/supplier.test.mjs backend/tamin-poshtibani/tests/voice-bot.test.mjs
```
