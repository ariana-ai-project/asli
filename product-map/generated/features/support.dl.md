# support.dl — 📥 تحویل‌های هوشمند

بخش: پنل پشتیبانی | راهنما: help-content.js «support.dl» | جریان کار: wf.smart (گام 7)

> هر کاری که کارشناس هوشمند تمام می‌کند — جدول کمیسیون، برگهٔ درخواست خرید و نامه — این‌جا می‌آید. بازش کنید، اسناد را ببینید و کمیسیون را تأیید یا با دلیل رد کنید. تأیید = تیکِ کمیسیونِ همهٔ اقلام؛ رد، درخواست را کامل به کارشناس برمی‌گرداند.

## فایل‌های این قابلیت (صاحب)
— (کدِ جدا ندارد؛ از راه مسیرها و فایل‌های مشترک)

## مسیرهای سرور (3)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /support/ai/deliveries` | w/ai-agent.js › aiAdmin | — | ✓ |
| `GET /support/ai/deliveries/{}` | w/ai-agent.js › aiAdmin | — | ✓ |
| `POST /support/ai/deliveries/{}/review` | w/ai-agent.js › aiAdmin | — | ✓ |

## فراخوان در پنل‌ها (10)
- expert-ai.js › Q → `GET /support/ai/deliveries/{}` (صفحه: support.html)
- expert-ai.js › load → `GET /support/ai/deliveries/{}`، `POST /support/ai/deliveries/{}/review` (صفحه: support.html)
- expert-ai.js › phoneDialog → `GET /support/ai/deliveries/{}` (صفحه: support.html)
- expert-ai.js › ul → `GET /support/ai/deliveries/{}`، `POST /support/ai/deliveries/{}/review` (صفحه: support.html)
- expert-ai.js › wire → `GET /support/ai/deliveries/{}`، `POST /support/ai/deliveries/{}/review` (صفحه: support.html)
- support-panel.js › aiToggle → `GET /support/ai/deliveries/{}` (صفحه: support.html)
- support-panel.js › dlSend → `POST /support/ai/deliveries/{}/review` (صفحه: support.html)
- support-panel.js › loadAi → `GET /support/ai/deliveries` (صفحه: support.html)
- support-panel.js › loadDl → `GET /support/ai/deliveries/{}` (صفحه: support.html)
- support-panel.js › loadDls → `GET /support/ai/deliveries` (صفحه: support.html)

## جدول‌ها
نوشتن: ai_runs، events
خواندن: assignments، experts، items، letters، quotes، requests

## تست‌ها (2)
- ai-mode-live.test.mjs
- ai-phase3.test.mjs

```
node --test backend/tamin-poshtibani/tests/ai-mode-live.test.mjs backend/tamin-poshtibani/tests/ai-phase3.test.mjs
```
