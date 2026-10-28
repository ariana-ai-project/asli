# support.fb — ⭐ ارزیابی ربات

بخش: پنل پشتیبانی | راهنما: help-content.js «support.fb»

> امتیازها و نظرهای کارشناسان به کارشناس هوشمند در یک صفحه: میانگینِ پیام‌ها، مکاتبه‌ها و نامه‌ها، سرنوشتِ پیشنهادهای «⏱ با مهلت» (فرستاد، رد، خودکار)، پخشِ ستاره‌ها، روند، جدولِ کارشناسان و فهرستِ همهٔ نظرها — برای پیدا کردنِ ایرادهای ربات و اصلاحِ دستورالعمل و قواعدش.

محل در رابط:
- پنل پشتیبانی تدارکات › ⭐ ارزیابی ربات

## فایل‌های این قابلیت (صاحب)
- `frontend/tamin-poshtibani/fb-admin.js` — fa، M، boxFa، boxChips، fa1، pct، stars، p2، dShort، when، sumKey، qs، load، kpis، tile، distBox، rows، trendBox، …
- `worker/ai-feedback.js` — FB_DDL، FB_KIND_FA، FB_OUT_FA، feedbackExport، feedbackOne، feedbackStats، feedbackSummary، recordGuard، recordProp، recordRate

## مسیرهای سرور (4)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /support/ai/feedback` | w/api.js › route | w/ai-feedback.js#feedbackStats | ✓ |
| `GET /support/ai/feedback/{}` | w/api.js › route | w/ai-agent.js#aiAdmin، w/ai-feedback.js#feedbackOne | ✓ |
| `GET /support/ai/feedback/export` | w/api.js › route | w/ai-feedback.js#feedbackExport | ✓ |
| `POST /support/ai/feedback/summary` | w/api.js › route | w/ai-feedback.js#feedbackSummary | ✓ |

## فراخوان در پنل‌ها (5)
- expert-ai.js › load → `GET /support/ai/feedback/{}` (صفحه: support.html)
- fb-admin.js › load → `GET /support/ai/feedback` (صفحه: support.html)
- fb-admin.js › runSum → `POST /support/ai/feedback/summary` (صفحه: support.html)
- fb-admin.js › showCtx → `GET /support/ai/feedback/export`، `GET /support/ai/feedback/{}` (صفحه: support.html)
- support-panel.js › loadAi → `GET /support/ai/feedback` (صفحه: support.html)

جای راهنما در کد: fb-admin.js › aiBox، fb-admin.js › boxesBox، fb-admin.js › c، fb-admin.js › view

## جدول‌ها
نوشتن: ai_agents، ai_calls، ai_feedback، ai_runs، ai_threads، sp_phones
خواندن: ai_rates، assignments، experts، items، letters، requests، sp_lines، sp_msgs، sp_sms، sp_suppliers، sp_threads
هم‌نویس‌های همین جدول‌ها: corr.main، engine.ai، engine.strategy، infra.core، login.supplier، sup.panel، support.ai، support.cr

## تست‌ها (4)
- ai-feedback.test.mjs
- ai-mode-live.test.mjs
- cr-boxes.test.mjs
- cr-turn.test.mjs

```
node --test backend/tamin-poshtibani/tests/ai-feedback.test.mjs backend/tamin-poshtibani/tests/ai-mode-live.test.mjs backend/tamin-poshtibani/tests/cr-boxes.test.mjs backend/tamin-poshtibani/tests/cr-turn.test.mjs
```

## مرتبط
- support.ai — 🤖 کارشناس هوشمند
- support.dl — 📥 تحویل‌های هوشمند
- corr.main — مکاتبات با تأمین‌کنندگان
