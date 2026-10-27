# support.cr — 🧭 استراتژی و دفتر

بخش: پنل پشتیبانی | راهنما: help-content.js «support.cr»

> دادهٔ تحقیقِ اقلام و تأمین‌کنندگان: حالتِ استعلامِ هر نوع قلم (حداکثری، محتاط یا ویژه)، شمارِ موج اول، ردهٔ سوابق و مشخصاتِ تأمین‌کنندگان، دفترِ تأمین‌کنندگان با «نام نزدیک»، گرافِ روابط، و کلیدهای روشن و خاموشِ هر بخشِ این طرح.

## فایل‌های این قابلیت (صاحب)
- `frontend/tamin-poshtibani/cr-admin.js` — fa، p2، when، gChip، boot، reg، load، wfCell، docCell، vHeads، fam، vSup، vSupList، supSearch، histVal، supForm، hint، fld، …
- `worker/cr-api.js` — FLAG_KEYS، crFlags، crRoute، crSupportRoute
- `worker/sreg.js` — addLinks، addOpinion، editOpinion، egoGraph، fullGraph، g4Decide، g4List، hideOpinion، opinionsFor، resolveSid، reviewEdge، searchSuppliers، supplierProfile، whoName

## مسیرهای سرور (28)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `* /cr/doc` | w/cr-api.js › crRoute | — | ✓ |
| `* /support/graph` | w/api.js › route | — | — |
| `GET /cr/doc` | w/cr-api.js › crRoute | w/strategy-doc.js#docView | ✓ |
| `GET /cr/flags` | w/cr-api.js › crRoute | — | ✓ |
| `GET /cr/head` | w/cr-api.js › crRoute | w/cr-engine.js#headPolicy | ✓ |
| `GET /cr/plan` | w/cr-api.js › crRoute | w/cr-engine.js#VARIANTS، w/cr-engine.js#recipientPlan | ✓ |
| `GET /sreg/graph` | w/cr-api.js › crRoute | w/sreg.js#egoGraph | ✓ |
| `GET /sreg/profile` | w/cr-api.js › crRoute | w/sreg.js#supplierProfile | ✓ |
| `GET /sreg/search` | w/cr-api.js › crRoute | w/sreg.js#searchSuppliers | — |
| `GET /support/cr/flags` | w/cr-api.js › crSupportRoute | — | ✓ |
| `GET /support/cr/panel` | w/cr-api.js › crSupportRoute | w/ai-prompts.js#AGENT_MODELS، w/strategy-doc.js#docModel، w/strategy-doc.js#docProgress، w/strategy-doc.js#panelSettings، w/turn-engine.js#TURN_MODEL_OPTS، w/turn-engine.js#turnModels | ✓ |
| `GET /support/cr/status` | w/cr-api.js › crSupportRoute | — | ✓ |
| `GET /support/graph` | w/cr-api.js › crSupportRoute | w/sreg.js#fullGraph | — |
| `GET /support/sreg/g4` | w/cr-api.js › crSupportRoute | w/sreg.js#g4List | ✓ |
| `GET /support/strategy/heads` | w/cr-api.js › crSupportRoute | — | ✓ |
| `GET /support/strategy/rfqn` | w/cr-api.js › crSupportRoute | w/cr-engine.js#MODE_FA، w/cr-engine.js#rfqNTable، w/strategy/config.js#RFQ_N | ✓ |
| `POST /cr/doc/{}/review` | w/cr-api.js › crRoute | w/strategy-doc.js#reviewDoc | ✓ |
| `POST /cr/doc/build` | w/cr-api.js › crRoute | w/strategy-doc.js#buildDoc، w/strategy-doc.js#docOut، w/strategy-doc.js#enqueueDoc | ✓ |
| `POST /sreg/edges/{}/review` | w/cr-api.js › crRoute | w/sreg.js#reviewEdge | ✓ |
| `POST /sreg/links` | w/cr-api.js › crRoute | w/sreg.js#addLinks | ✓ |
| `POST /sreg/opinions` | w/cr-api.js › crRoute | w/sreg.js#addOpinion | ✓ |
| `POST /sreg/opinions/{}/hide` | w/cr-api.js › crRoute | w/sreg.js#hideOpinion | ✓ |
| `POST /support/sreg/g4/{}` | w/cr-api.js › crSupportRoute | w/sreg.js#g4Decide | ✓ |
| `PUT /sreg/opinions/{}` | w/cr-api.js › crRoute | w/sreg.js#editOpinion | ✓ |
| `PUT /support/cr/flags` | w/cr-api.js › crSupportRoute | — | ✓ |
| `PUT /support/cr/panel` | w/cr-api.js › crSupportRoute | w/strategy-doc.js#savePanel، w/turn-engine.js#saveTurnModels، w/turn-engine.js#turnModels | ✓ |
| `PUT /support/strategy/heads/{}` | w/cr-api.js › crSupportRoute | — | ✓ |
| `PUT /support/strategy/rfqn` | w/cr-api.js › crSupportRoute | — | ✓ |

## فراخوان در پنل‌ها (14)
- cr-admin.js › boot → `GET /support/cr/flags`، `PUT /support/cr/flags` (صفحه: support.html)
- cr-admin.js › load → `GET /support/cr/flags`، `PUT /support/cr/flags`، `GET /support/strategy/heads`، `GET /support/strategy/rfqn`، `PUT /support/strategy/rfqn`، `GET /support/sreg/g4`، `* /support/graph`، `GET /support/graph`، `GET /support/cr/status`، `GET /support/cr/panel`، `PUT /support/cr/panel` (صفحه: support.html)
- cr-admin.js › moveUI → `PUT /support/strategy/heads/{}` (صفحه: support.html)
- cr-admin.js › onChange → `GET /support/cr/flags`، `PUT /support/cr/flags` (صفحه: support.html)
- cr-admin.js › onClick → `GET /support/strategy/rfqn`، `PUT /support/strategy/rfqn`، `GET /support/cr/panel`، `PUT /support/cr/panel`، `POST /support/sreg/g4/{}` (صفحه: support.html)
- expert.js › rebuild → `POST /cr/doc/build` (صفحه: expert.html)
- expert.js › review → `POST /cr/doc/{}/review` (صفحه: expert.html)
- sup-profile.js › enabled → `GET /cr/flags`، `GET /support/cr/flags`، `PUT /support/cr/flags` (صفحه: correspond.html، expert.html، support.html)
- sup-profile.js › load → `GET /sreg/profile` (صفحه: correspond.html، expert.html، support.html)
- sup-profile.js › loadGraph → `GET /sreg/graph` (صفحه: correspond.html، expert.html، support.html)
- sup-profile.js › onClick → `PUT /sreg/opinions/{}`، `POST /sreg/opinions/{}/hide`، `POST /sreg/edges/{}/review`، `POST /sreg/links` (صفحه: correspond.html، expert.html، support.html)
- sup-profile.js › searchLinks → `GET /sreg/search` (صفحه: correspond.html، expert.html، support.html)
- sup-profile.js › v → `POST /sreg/opinions` (صفحه: correspond.html، expert.html، support.html)
- tender-admin.js › loadList → `* /support/graph`، `GET /support/graph` (صفحه: support.html)

## جدول‌ها
نوشتن: ai_feedback، cr_cache، cr_docs، cr_head_x، events، settings، sreg، sreg_alias، sreg_edges، sreg_ops
خواندن: cr_heads، cr_units، purchases، sp_suppliers، sreg_x، supplier_grades، supplier_over
هم‌نویس‌های همین جدول‌ها: engine.strategy، support.fb

## تست‌ها (9)
- cr-boxes.test.mjs
- cr-doc.test.mjs
- cr-hold.test.mjs
- cr-picks.test.mjs
- cr-registry.test.mjs
- cr-turn.test.mjs
- neg-view.test.mjs
- sup-profile.test.mjs
- supplier-over.test.mjs

```
node --test backend/tamin-poshtibani/tests/cr-boxes.test.mjs backend/tamin-poshtibani/tests/cr-doc.test.mjs backend/tamin-poshtibani/tests/cr-hold.test.mjs backend/tamin-poshtibani/tests/cr-picks.test.mjs backend/tamin-poshtibani/tests/cr-registry.test.mjs backend/tamin-poshtibani/tests/cr-turn.test.mjs backend/tamin-poshtibani/tests/neg-view.test.mjs backend/tamin-poshtibani/tests/sup-profile.test.mjs backend/tamin-poshtibani/tests/supplier-over.test.mjs
```

## مرتبط
- support.sup — 🏷 تأمین‌کنندگان — رده و مشخصات
- support.ai — 🤖 کارشناس هوشمند
- expert.picks — 🎯 فهرست دعوت
