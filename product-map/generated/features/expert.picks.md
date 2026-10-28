# expert.picks — 🎯 فهرست دعوت

بخش: پنل کارشناس | راهنما: help-content.js «expert.picks» | جریان کار: wf.smart (گام 3)

> فهرستِ تأمین‌کنندگانی که کارشناس هوشمند برای این قلم دعوت می‌کند — بعد از تأییدِ ساختارِ همین قلم از سوابق ساخته می‌شود؛ به ترتیبِ رتبهٔ نهایی و «قاعدهٔ دعوت»، به شمارِ حداقلِ استعلامِ ردهٔ همین قلم (جزئی ۳، متوسط ۵، بزرگ ۵، عمده ۷ — از برآوردِ کلِ قلم) از پیش تیک می‌خورند.

محل در رابط:
- پنل کارشناس خرید › صفحهٔ درخواست › بررسی سوابق › 🎯 فهرست دعوت

## فایل‌های این قابلیت (صاحب)
- `worker/ai-picks.js` — A_MSG، PICK_SRC_FA، TOP، WHY_BOXES، applyEdits، applyStrategy، buildDefault، defaultFrom، mergeRebuilt، pickCands، pickOf، pickSummary، pickView، release، resetToDefault، startCheck، strategyDeviations، threadSrc، …

## مسیرهای سرور (2)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /items/{}/invite-preview` | w/ai-agent.js › picksRoute | w/ai-picks.js#pickOf، w/cr-api.js#crFlags، w/first-msg.js#fmContext، w/switches.js#pfReadOn، w/terms-locks.js#limitsOf، w/terms-locks.js#limitsTxt | ✓ |
| `GET\|PUT /items/{}/picks` | w/ai-agent.js › picksRoute | w/ai-picks.js#A_MSG، w/ai-picks.js#applyEdits، w/ai-picks.js#applyStrategy، w/ai-picks.js#buildDefault، w/ai-picks.js#pickOf، w/cr-api.js#crFlags، … | ✓ |

## فراخوان در پنل‌ها (5)
- expert.js › loadPicks → `GET|PUT /items/{}/picks` (صفحه: expert.html)
- expert.js › pkEdit → `GET|PUT /items/{}/picks` (صفحه: expert.html)
- expert.js › pkFlushWhy → `GET|PUT /items/{}/picks` (صفحه: expert.html)
- expert.js › pkStartUI → `GET /items/{}/invite-preview` (صفحه: expert.html)
- expert.js › pkVarApply → `GET|PUT /items/{}/picks` (صفحه: expert.html)

جای راهنما در کد: expert.js › vPicks، expert.js › paint، expert.js › smPickNote

## جدول‌ها
نوشتن: items
خواندن: ai_threads، assignments، cr_units، decisions، settings، sp_lines، sp_phones، sp_suppliers، sp_threads، sreg، sreg_edges

## تست‌ها (16)
- ai-agent.test.mjs
- ai-mode-live.test.mjs
- ai-waves.test.mjs
- cr-boxes.test.mjs
- cr-doc.test.mjs
- cr-firstmsg.test.mjs
- cr-hold.test.mjs
- cr-picks.test.mjs
- cr-turn.test.mjs
- discovered.test.mjs
- neg-view.test.mjs
- phase4b.test.mjs
- phase4b2.test.mjs
- phase4b3.test.mjs
- phase4b4.test.mjs
- w3-props.test.mjs

```
node --test backend/tamin-poshtibani/tests/ai-agent.test.mjs backend/tamin-poshtibani/tests/ai-mode-live.test.mjs backend/tamin-poshtibani/tests/ai-waves.test.mjs backend/tamin-poshtibani/tests/cr-boxes.test.mjs backend/tamin-poshtibani/tests/cr-doc.test.mjs backend/tamin-poshtibani/tests/cr-firstmsg.test.mjs backend/tamin-poshtibani/tests/cr-hold.test.mjs backend/tamin-poshtibani/tests/cr-picks.test.mjs backend/tamin-poshtibani/tests/cr-turn.test.mjs backend/tamin-poshtibani/tests/discovered.test.mjs backend/tamin-poshtibani/tests/neg-view.test.mjs backend/tamin-poshtibani/tests/phase4b.test.mjs backend/tamin-poshtibani/tests/phase4b2.test.mjs backend/tamin-poshtibani/tests/phase4b3.test.mjs backend/tamin-poshtibani/tests/phase4b4.test.mjs backend/tamin-poshtibani/tests/w3-props.test.mjs
```

## مرتبط
- expert.ai — کارشناس هوشمند
- expert.smart — جستجوی هوشمند
