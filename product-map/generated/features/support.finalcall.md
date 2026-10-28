# support.finalcall — 📨 فراخوانِ پیش‌فاکتورِ رسمی

بخش: پنل پشتیبانی | راهنما: help-content.js «support.finalcall» | جریان کار: wf.smart (گام 6)

> روشن (پیش‌فرض): در درخواستِ هوشمند، پیش از جدول کمیسیون، با رسیدن به حداقلِ استعلام به تأمین‌کنندگانِ تأییدنهایی پیامک می‌رود و جدول بعد از بسته شدنِ «📦 بستهٔ کمیسیون» ساخته می‌شود. درخواستِ دستی فراخوان ندارد و جدولش با حداقلِ «ثبت موقت» ساخته می‌شود. خاموش: جدول کمیسیون مستقیم، مثلِ پیش از این.

محل در رابط:
- پنل پشتیبانی تدارکات › 🤖 کارشناس هوشمند › 🎛 کلیدها › 📨 فراخوان پیش‌فاکتور رسمی

## فایل‌های این قابلیت (صاحب)
— (کدِ جدا ندارد؛ از راه مسیرها و فایل‌های مشترک)

## مسیرهای سرور (2)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /support/ai/final-call` | w/ai-agent.js › aiAdmin | w/final-call.js#fcAdmin | ✓ |
| `PUT /support/ai/final-call` | w/ai-agent.js › aiAdmin | w/final-call.js#saveFcCfg | ✓ |

## فراخوان در پنل‌ها (3)
- support-panel.js › fcSave → `PUT /support/ai/final-call` (صفحه: support.html)
- support-panel.js › loadAi → `GET /support/ai/final-call`، `PUT /support/ai/final-call` (صفحه: support.html)
- support-panel.js › loadSw → `GET /support/ai/final-call` (صفحه: support.html)

جای راهنما در کد: support-panel.js › num

## جدول‌ها
نوشتن: events، experts، settings
خواندن: —

## تست‌ها (1)
- final-call.test.mjs

```
node --test backend/tamin-poshtibani/tests/final-call.test.mjs
```

## مرتبط
- support.sw — 🎛 کلیدها
- expert.finalcall — 📨 فراخوانِ پیش‌فاکتورِ رسمی و 📦 بستهٔ کمیسیون
