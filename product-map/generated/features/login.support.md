# login.support — ورود پشتیبانی

بخش: ورود | راهنما: help-content.js «login.support»

> این پنل رمز مشترک دارد. اولین بازدیدکننده رمز را می‌گذارد و از آن پس همه با همان رمز وارد می‌شوند. رمز مثل همهٔ کدهای ورود ۴ رقم است و نباید همان کد مدیر باشد. اگر فراموش شد، مدیر با کد مدیر رمز تازه می‌گذارد. پنج رمز غلط، ورود را ۱۵ دقیقه می‌بندد.

محل در رابط:
- پنل پشتیبانی تدارکات › ورود پشتیبانی

## فایل‌های این قابلیت (صاحب)
— (کدِ جدا ندارد؛ از راه مسیرها و فایل‌های مشترک)

## مسیرهای سرور (5)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /support/status` | w/api.js › route | w/support.js#supportStatus | ✓ |
| `POST /support/login` | w/api.js › route | w/support.js#supportLogin | ✓ |
| `POST /support/pass` | w/api.js › route | w/support.js#supportChangePass | ✓ |
| `POST /support/reset` | w/api.js › route | w/support.js#requireSupport، w/support.js#supportReset | ✓ |
| `POST /support/setup` | w/api.js › route | w/support.js#supportSetup | ✓ |

## فراخوان در پنل‌ها (3)
- support-panel.js › doAuth → `POST /support/setup`، `POST /support/login`، `POST /support/reset` (صفحه: support.html)
- support-panel.js › g → `POST /support/pass` (صفحه: support.html)
- support-panel.js › loadStatus → `GET /support/status` (صفحه: support.html)

جای راهنما در کد: support-panel.js › render

## جدول‌ها
نوشتن: settings
خواندن: —

## تست‌ها (38)
- ai-agent.test.mjs
- ai-feedback.test.mjs
- ai-mode-live.test.mjs
- ai-phase2.test.mjs
- ai-phase3.test.mjs
- codes.test.mjs
- commission-need.test.mjs
- commission-result.test.mjs
- cr-boxes.test.mjs
- cr-doc.test.mjs
- cr-hold.test.mjs
- cr-picks.test.mjs
- cr-registry.test.mjs
- cr-turn.test.mjs
- d1-budget.test.mjs
- discovered.test.mjs
- execution-ready.test.mjs
- final-call.test.mjs
- help-bot.test.mjs
- neg-view.test.mjs
- phase4.test.mjs
- phase4b.test.mjs
- phase4b2.test.mjs
- push-hooks.test.mjs
- ranking.test.mjs
- sec-p0.test.mjs
- size-estimate.test.mjs
- sms-provider.test.mjs
- structure.test.mjs
- supplier-over.test.mjs
- supplier.test.mjs
- support.test.mjs
- takeover.test.mjs
- tender-d1.test.mjs
- tender-refer.test.mjs
- tender.test.mjs
- tender2.test.mjs
- usd.test.mjs

```
node --test backend/tamin-poshtibani/tests/ai-agent.test.mjs backend/tamin-poshtibani/tests/ai-feedback.test.mjs backend/tamin-poshtibani/tests/ai-mode-live.test.mjs backend/tamin-poshtibani/tests/ai-phase2.test.mjs backend/tamin-poshtibani/tests/ai-phase3.test.mjs backend/tamin-poshtibani/tests/codes.test.mjs backend/tamin-poshtibani/tests/commission-need.test.mjs backend/tamin-poshtibani/tests/commission-result.test.mjs backend/tamin-poshtibani/tests/cr-boxes.test.mjs backend/tamin-poshtibani/tests/cr-doc.test.mjs backend/tamin-poshtibani/tests/cr-hold.test.mjs backend/tamin-poshtibani/tests/cr-picks.test.mjs backend/tamin-poshtibani/tests/cr-registry.test.mjs backend/tamin-poshtibani/tests/cr-turn.test.mjs backend/tamin-poshtibani/tests/d1-budget.test.mjs backend/tamin-poshtibani/tests/discovered.test.mjs backend/tamin-poshtibani/tests/execution-ready.test.mjs backend/tamin-poshtibani/tests/final-call.test.mjs backend/tamin-poshtibani/tests/help-bot.test.mjs backend/tamin-poshtibani/tests/neg-view.test.mjs backend/tamin-poshtibani/tests/phase4.test.mjs backend/tamin-poshtibani/tests/phase4b.test.mjs backend/tamin-poshtibani/tests/phase4b2.test.mjs backend/tamin-poshtibani/tests/push-hooks.test.mjs backend/tamin-poshtibani/tests/ranking.test.mjs backend/tamin-poshtibani/tests/sec-p0.test.mjs backend/tamin-poshtibani/tests/size-estimate.test.mjs backend/tamin-poshtibani/tests/sms-provider.test.mjs backend/tamin-poshtibani/tests/structure.test.mjs backend/tamin-poshtibani/tests/supplier-over.test.mjs backend/tamin-poshtibani/tests/supplier.test.mjs backend/tamin-poshtibani/tests/support.test.mjs backend/tamin-poshtibani/tests/takeover.test.mjs backend/tamin-poshtibani/tests/tender-d1.test.mjs backend/tamin-poshtibani/tests/tender-refer.test.mjs backend/tamin-poshtibani/tests/tender.test.mjs backend/tamin-poshtibani/tests/tender2.test.mjs backend/tamin-poshtibani/tests/usd.test.mjs
```

## مرتبط
- support.req — درخواست‌ها
