# support.smartgate — 🔎 جستجوی هوشمند

بخش: پنل پشتیبانی | راهنما: help-content.js «support.smartgate»

> روشن (پیش‌فرض): «اجرای جستجوی هوشمند» (جستجوی وب با هزینهٔ API) فقط برای قلمی باز است که کمتر از حدِ این‌جا تأمین‌کنندهٔ کشف‌شده در تحقیق دارد (پیش‌فرض ۱۰)؛ بقیه دکمهٔ بسته و «؟»ِ دلیل می‌بینند. خاموش: برای همه باز، مثلِ پیش از این.

محل در رابط:
- پنل پشتیبانی تدارکات › 🤖 کارشناس هوشمند › 🎛 کلیدها › 🔎 جستجوی هوشمند

## فایل‌های این قابلیت (صاحب)
— (کدِ جدا ندارد؛ از راه مسیرها و فایل‌های مشترک)

## مسیرهای سرور (2)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /support/ai/smart-gate` | w/ai-agent.js › aiAdmin | w/discovered.js#sgAdmin | ✓ |
| `PUT /support/ai/smart-gate` | w/ai-agent.js › aiAdmin | w/discovered.js#saveSgCfg | ✓ |

## فراخوان در پنل‌ها (3)
- support-panel.js › loadAi → `GET /support/ai/smart-gate`، `PUT /support/ai/smart-gate` (صفحه: support.html)
- support-panel.js › loadSw → `GET /support/ai/smart-gate` (صفحه: support.html)
- support-panel.js › sgSave → `PUT /support/ai/smart-gate` (صفحه: support.html)

جای راهنما در کد: support-panel.js › vSg

## جدول‌ها
نوشتن: events، settings
خواندن: experts

## تست‌ها (1)
- discovered.test.mjs

```
node --test backend/tamin-poshtibani/tests/discovered.test.mjs
```

## مرتبط
- support.sw — 🎛 کلیدها
- expert.smart — جستجوی هوشمند
