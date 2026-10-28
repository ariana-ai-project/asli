# login.supplier — ورود به پنل تأمین‌کنندگان

بخش: ورود | راهنما: help-content.js «login.supplier» | جریان کار: wf.request (گام 6)، wf.supplier (گام 2)

> رمز ۶ رقمیِ پیامک را وارد کنید. همین پنل را در تلگرام هم دارید (لینک دوم پیامک).

محل در رابط:
- پنل تأمین‌کنندگان › ورود با رمز پیامکی

## فایل‌های این قابلیت (صاحب)
— (کدِ جدا ندارد؛ از راه مسیرها و فایل‌های مشترک)

## مسیرهای سرور (4)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /sp/info` | w/sp-api.js › spRoute | w/sp-bot.js#ensureSpWebhook، w/sp-core.js#COMPANY، w/sp-core.js#FILE_LABELS، w/sp-core.js#botLink، w/sp-core.js#spBotUser | — |
| `POST /sp/login` | w/sp-api.js › spRoute | w/sp-core.js#login، w/sp-core.js#newSession | ✓ |
| `POST /sp/logout` | w/sp-api.js › spRoute | w/sp-core.js#logout | ✓ |
| `POST /sp/resend` | w/sp-api.js › spRoute | w/sp-core.js#resendPassword، w/sp-sms.js#deliverPass | ✓ |

## فراخوان در پنل‌ها (2)
- supplier.js › logout → `POST /sp/logout` (صفحه: supplier.html)
- supplier.js › renderLogin → `POST /sp/login`، `POST /sp/resend` (صفحه: supplier.html)

جای راهنما در کد: supplier.js › renderLogin

## جدول‌ها
نوشتن: settings، sp_passes، sp_phones، sp_sessions، sp_sms، sp_tg
خواندن: assignments، experts، sp_suppliers، sp_threads
هم‌نویس‌های همین جدول‌ها: corr.main، engine.ai، expert.finalcall، infra.core، sup.panel، support.ai، support.fb

## تست‌ها (4)
- ai-agent.test.mjs
- phase4.test.mjs
- sms-provider.test.mjs
- supplier.test.mjs

```
node --test backend/tamin-poshtibani/tests/ai-agent.test.mjs backend/tamin-poshtibani/tests/phase4.test.mjs backend/tamin-poshtibani/tests/sms-provider.test.mjs backend/tamin-poshtibani/tests/supplier.test.mjs
```

## مرتبط
- sup.panel — پاسخ به استعلام
