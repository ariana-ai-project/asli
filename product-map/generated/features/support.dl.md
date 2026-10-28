# support.dl — 📥 تحویل‌های هوشمند

بخش: پنل پشتیبانی | راهنما: help-content.js «support.dl» | جریان کار: wf.smart (گام 7)

> هر کاری که کارشناس هوشمند تمام می‌کند — جدول کمیسیون، برگهٔ درخواست خرید و نامه — این‌جا می‌آید. بازش کنید، اسناد را ببینید و کمیسیون را تأیید یا با دلیل رد کنید. تأیید = تیکِ کمیسیونِ همهٔ اقلام؛ رد، درخواست را کامل به کارشناس برمی‌گرداند.

محل در رابط:
- پنل پشتیبانی تدارکات › 📥 تحویل‌های هوشمند

## فایل‌های این قابلیت (صاحب)
— (کدِ جدا ندارد؛ از راه مسیرها و فایل‌های مشترک)

## مسیرهای سرور (3)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /support/ai/deliveries` | w/ai-agent.js › aiAdmin | — | ✓ |
| `GET /support/ai/deliveries/{}` | w/ai-agent.js › aiAdmin | — | ✓ |
| `POST /support/ai/deliveries/{}/review` | w/ai-agent.js › aiAdmin | — | ✓ |

## فراخوان در پنل‌ها (5)
- expert-ai.js › load → `GET /support/ai/deliveries/{}` (صفحه: support.html)
- support-panel.js › dlSend → `POST /support/ai/deliveries/{}/review` (صفحه: support.html)
- support-panel.js › loadAi → `GET /support/ai/deliveries` (صفحه: support.html)
- support-panel.js › loadDl → `GET /support/ai/deliveries/{}` (صفحه: support.html)
- support-panel.js › loadDls → `GET /support/ai/deliveries` (صفحه: support.html)

جای راهنما در کد: support-panel.js › vDlOne

## جدول‌ها
نوشتن: ai_runs، events
خواندن: assignments، experts، items، letters، quotes، requests

## تست‌ها (2)
- ai-mode-live.test.mjs
- ai-phase3.test.mjs

```
node --test backend/tamin-poshtibani/tests/ai-mode-live.test.mjs backend/tamin-poshtibani/tests/ai-phase3.test.mjs
```
