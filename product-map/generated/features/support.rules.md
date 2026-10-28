# support.rules — ⏱ مهلتِ رسیدن به حد

بخش: پنل پشتیبانی | راهنما: help-content.js «support.rules» | جریان کار: wf.smart (گام 1)

> کارشناس هوشمند تا هر قلم به «حداقلِ استعلام»ِ ردهٔ خودش (جزئی، متوسط، بزرگ، عمده) پیشنهادِ تأییدنهایی از تأمین‌کنندگانِ مختلف نرسد، مذاکره را نمی‌بندد و جدول و نامه نمی‌سازد. این بخش فقط مهلتِ رسیدن به آن حد را دارد.

محل در رابط:
- پنل پشتیبانی تدارکات › 🤖 کارشناس هوشمند › ⏱ مهلتِ رسیدن به حد

## فایل‌های این قابلیت (صاحب)
- `worker/ai-rules.js` — DIMS، DIM_FA، DIM_UNIT، RULES_DEFAULT، RULES_KEY، cleanRules، coverOf، getRules، itemNeeds، needFor، numIn، ruleCount، ruleText، saveRules، whyText

## مسیرهای سرور (2)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /support/ai/rules` | w/ai-agent.js › aiAdmin | w/ai-rules.js#DIMS، w/ai-rules.js#DIM_FA، w/ai-rules.js#DIM_UNIT، w/ai-rules.js#getRules، w/settings.js#getSettings | ✓ |
| `PUT /support/ai/rules` | w/ai-agent.js › aiAdmin | w/ai-rules.js#saveRules | ✓ |

## فراخوان در پنل‌ها (3)
- support-panel.js › loadAi → `GET /support/ai/rules`، `PUT /support/ai/rules` (صفحه: support.html)
- support-panel.js › loadRules → `GET /support/ai/rules` (صفحه: support.html)
- support-panel.js › saveRulesUi → `PUT /support/ai/rules` (صفحه: support.html)

جای راهنما در کد: support-panel.js › vRules

## جدول‌ها
نوشتن: ai_runs، events، settings
خواندن: items، quotes، sp_lines، sp_threads

## تست‌ها (2)
- ai-phase3.test.mjs
- commission-need.test.mjs

```
node --test backend/tamin-poshtibani/tests/ai-phase3.test.mjs backend/tamin-poshtibani/tests/commission-need.test.mjs
```

## مرتبط
- support.size — 📏 برچسبِ اندازهٔ درخواست
- support.ai — 🤖 کارشناس هوشمند
