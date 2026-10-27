# support.sw — 🎛 کلیدها

بخش: پنل پشتیبانی | راهنما: help-content.js «support.sw» | جریان کار: wf.smart (گام 1)

> کلیدهای سراسریِ مسیرِ خرید — برای همهٔ کارشناسان، کارشناس هوشمند، پنل تأمین‌کننده و بات‌ها، همان لحظه (تا یک دقیقه).

## فایل‌های این قابلیت (صاحب)
- `worker/switches.js` — SWITCH_DEFAULT، SWITCH_FA، SWITCH_KEY، getSwitches، pfReadOn، resetSwitchCache، saveSwitches

## مسیرهای سرور (2)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /support/ai/switches` | w/ai-agent.js › aiAdmin | w/switches.js#SWITCH_FA، w/switches.js#getSwitches | ✓ |
| `PUT /support/ai/switches` | w/ai-agent.js › aiAdmin | w/switches.js#saveSwitches | ✓ |

## فراخوان در پنل‌ها (4)
- support-panel.js › go → `GET /support/ai/switches`، `PUT /support/ai/switches` (صفحه: support.html)
- support-panel.js › loadAi → `GET /support/ai/switches`، `PUT /support/ai/switches` (صفحه: support.html)
- support-panel.js › loadDls → `GET /support/ai/switches`، `PUT /support/ai/switches` (صفحه: support.html)
- support-panel.js › loadSw → `GET /support/ai/switches`، `PUT /support/ai/switches` (صفحه: support.html)

## جدول‌ها
نوشتن: events، settings
خواندن: —

## تست‌ها (1)
- phase4.test.mjs

```
node --test backend/tamin-poshtibani/tests/phase4.test.mjs
```

## مرتبط
- support.ai — 🤖 کارشناس هوشمند
- support.finalcall — 📨 فراخوانِ پیش‌فاکتورِ رسمی
- support.smartgate — 🔎 جستجوی هوشمند
