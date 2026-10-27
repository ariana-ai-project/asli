# expert.detail — صفحهٔ درخواست

بخش: پنل کارشناس | راهنما: help-content.js «expert.detail» | جریان کار: wf.request (گام 3)، wf.request (گام 4)، wf.request (گام 9)، wf.smart (گام 2)

> بالای صفحه، شمارهٔ درخواست، پروژه، اقلام و مهلت تحویل است؛ زیرش نوار مهلت و نوار شش مرحله با رنگِ هر مرحله (سبز انجام‌شده، زرد هشدار، نارنجی دیر، قرمز مهلت گذشته).

## فایل‌های این قابلیت (صاحب)
— (کدِ جدا ندارد؛ از راه مسیرها و فایل‌های مشترک)

## مسیرهای سرور (11)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `DELETE /items/{}/edit` | w/api.js › route | w/normalize.js#revertEdit، w/sp-core.js#LOCK_MSG، w/sp-core.js#itemLocks، w/structure.js#changeStmt، w/structure.js#normConfirmed | ✓ |
| `GET /assignments/{}` | w/api.js › route | — | ✓ |
| `GET /catalog/heads` | w/api.js › route | w/catalog.js#allHeads | — |
| `POST /assignments/{}/decision` | w/api.js › route | w/decisions.js#expertDecision | ✓ |
| `POST /items/{}/estimate` | w/api.js › route | w/estimate.js#estimateItem | ✓ |
| `POST /items/{}/normalize` | w/api.js › route | w/history.js#ratesWithShares، w/normalize.js#normalizeItem، w/structure.js#suggOf | ✓ |
| `POST /items/{}/progress` | w/api.js › route | — | ✓ |
| `PUT /assignments/{}/notes` | w/api.js › route | — | — |
| `PUT /items/{}/locks` | w/api.js › route | w/sp-core.js#LOCK_MSG، w/sp-core.js#itemLocks، w/structure.js#NEED_NORM_MSG، w/structure.js#changeStmt، w/structure.js#normConfirmed، w/structure.js#withTqLocks | ✓ |
| `PUT /requests/{}/head` | w/api.js › route | — | ✓ |
| `PUT\|DELETE /items/{}/norm` | w/api.js › route | w/estimate.js#resetEstimate، w/history.js#ratesWithShares، w/normalize.js#clearNorm، w/normalize.js#confirmNorm، w/sp-core.js#LOCK_MSG، w/sp-core.js#itemLocks، … | ✓ |

## فراخوان در پنل‌ها (12)
- expert.js › clearNormUI → `PUT|DELETE /items/{}/norm` (صفحه: expert.html)
- expert.js › confirmNormUI → `PUT|DELETE /items/{}/norm`، `POST /items/{}/estimate` (صفحه: expert.html)
- expert.js › doExpertAct → `POST /assignments/{}/decision` (صفحه: expert.html)
- expert.js › loadHeads → `GET /catalog/heads` (صفحه: expert.html)
- expert.js › manualUI → `POST /assignments/{}/decision` (صفحه: expert.html)
- expert.js › openDetail → `GET /assignments/{}` (صفحه: expert.html)
- expert.js › revertEditUI → `DELETE /items/{}/edit` (صفحه: expert.html)
- expert.js › runHist → `POST /items/{}/progress` (صفحه: expert.html)
- expert.js › runNormalize → `POST /items/{}/normalize` (صفحه: expert.html)
- expert.js › tqToggle → `PUT /items/{}/locks` (صفحه: expert.html)
- expert.js › wire → `POST /items/{}/progress`، `PUT /requests/{}/head`، `PUT /assignments/{}/notes` (صفحه: expert.html)
- manager.js › openDetail → `GET /assignments/{}` (صفحه: manager.html)

## جدول‌ها
نوشتن: assignments، decisions، events، item_changes، item_edits، items، requests
خواندن: ai_agents، ai_runs، ai_threads، cat_heads، experts، proformas، quotes، sp_lines، sp_suppliers، sp_threads
هم‌نویس‌های همین جدول‌ها: engine.structure، infra.core، manager.asg، manager.desk، manager.import، manager.log

## تست‌ها (20)
- ai-agent.test.mjs
- ai-mode-live.test.mjs
- ai-phase2.test.mjs
- ai-phase3.test.mjs
- ai-rates.test.mjs
- commission-need.test.mjs
- cr-boxes.test.mjs
- d1-budget.test.mjs
- execution-ready.test.mjs
- layer-locks.test.mjs
- multiprice.test.mjs
- phase4b.test.mjs
- phase4b2.test.mjs
- phase4b3.test.mjs
- phase4b4.test.mjs
- review-fixes.test.mjs
- size-estimate.test.mjs
- structure.test.mjs
- supplier.test.mjs
- support.test.mjs

```
node --test backend/tamin-poshtibani/tests/ai-agent.test.mjs backend/tamin-poshtibani/tests/ai-mode-live.test.mjs backend/tamin-poshtibani/tests/ai-phase2.test.mjs backend/tamin-poshtibani/tests/ai-phase3.test.mjs backend/tamin-poshtibani/tests/ai-rates.test.mjs backend/tamin-poshtibani/tests/commission-need.test.mjs backend/tamin-poshtibani/tests/cr-boxes.test.mjs backend/tamin-poshtibani/tests/d1-budget.test.mjs backend/tamin-poshtibani/tests/execution-ready.test.mjs backend/tamin-poshtibani/tests/layer-locks.test.mjs backend/tamin-poshtibani/tests/multiprice.test.mjs backend/tamin-poshtibani/tests/phase4b.test.mjs backend/tamin-poshtibani/tests/phase4b2.test.mjs backend/tamin-poshtibani/tests/phase4b3.test.mjs backend/tamin-poshtibani/tests/phase4b4.test.mjs backend/tamin-poshtibani/tests/review-fixes.test.mjs backend/tamin-poshtibani/tests/size-estimate.test.mjs backend/tamin-poshtibani/tests/structure.test.mjs backend/tamin-poshtibani/tests/supplier.test.mjs backend/tamin-poshtibani/tests/support.test.mjs
```

## مرتبط
- expert.flow — روند کار روی یک درخواست
- expert.ai — کارشناس هوشمند
- expert.history — بررسی سوابق
