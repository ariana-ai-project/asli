# support.md — 🧭 حالت اقلام

بخش: پنل پشتیبانی | راهنما: help-content.js «support.md» | جریان کار: wf.smart (گام 1)

> هر قلمِ درخواست با حالتِ نوع قلمِ خودش جلو می‌رود و کارشناس کارتِ هر قلم را جدا پیش می‌برد. نوع قلمی که این‌جا نیامده «انتخاب کارشناس» است.

محل در رابط:
- پنل پشتیبانی تدارکات › 🤖 کارشناس هوشمند › 🧭 حالت اقلام

## فایل‌های این قابلیت (صاحب)
- `worker/ai-modes.js` — MODES، MODES_KEY، MODE_DEFAULT، MODE_FA، aiEndLocked، aiItemFree، endLockedOf، getModes، headGuess، itemModes، modeOf، resetModesCache، saveModes، searchHeads

## مسیرهای سرور (3)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /support/ai/heads` | w/ai-agent.js › aiAdmin | w/ai-modes.js#searchHeads | ✓ |
| `GET /support/ai/modes` | w/ai-agent.js › aiAdmin | w/ai-modes.js#MODE_DEFAULT، w/ai-modes.js#MODE_FA، w/ai-modes.js#getModes | ✓ |
| `PUT /support/ai/modes` | w/ai-agent.js › aiAdmin | w/ai-modes.js#MODE_DEFAULT، w/ai-modes.js#MODE_FA، w/ai-modes.js#saveModes | ✓ |

## فراخوان در پنل‌ها (4)
- support-panel.js › loadAi → `GET /support/ai/heads`، `GET /support/ai/modes`، `PUT /support/ai/modes` (صفحه: support.html)
- support-panel.js › loadMd → `GET /support/ai/modes` (صفحه: support.html)
- support-panel.js › mdSearch → `GET /support/ai/heads` (صفحه: support.html)
- support-panel.js › saveMdUi → `PUT /support/ai/modes` (صفحه: support.html)

## جدول‌ها
نوشتن: events، settings
خواندن: ai_runs، items

## تست‌ها (3)
- ai-mode-live.test.mjs
- phase4b.test.mjs
- phase4b2.test.mjs

```
node --test backend/tamin-poshtibani/tests/ai-mode-live.test.mjs backend/tamin-poshtibani/tests/phase4b.test.mjs backend/tamin-poshtibani/tests/phase4b2.test.mjs
```

## مرتبط
- support.ai — 🤖 کارشناس هوشمند
