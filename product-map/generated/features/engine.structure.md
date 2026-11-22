# engine.structure — ساختار و یکسان‌سازی اقلام

بخش: موتورهای مشترک سرور | جریان کار: wf.request (گام 4)

> نوع قلم، لایه‌ها، قفل‌ها، مدل‌های قلم، یکسان‌سازی و برآورد قیمت هر قلم.

## فایل‌های این قابلیت (صاحب)
- `worker/estimate.js` — EST_DAY_MAX، EST_PENDING_SQL، EST_QUERY_ROOM، counted، estimateItem، estimateRun، layersFit، pickEstimate، resetEstimate، sameUnit
- `worker/item-models.js` — MODEL_DDL، createExpertModel، markModelsSent، markModelsSubmitted، migrateSpLineModels، modelById، modelKey، modelOut، modelTargets، modelsOfItems، publishSupplierModel، supplierSpecKey، updateExpertModel
- `worker/normalize.js` — CUSTOM_LAYERS_KEY، NORM_COST_EST، NORM_PROMPT_VERSION، canonStruct، catalogStruct، clearNorm، confirmNorm، conventionLines، customLayerNames، dbStruct، nearestItems، normOf، normalizeItem، ratesView، revertEdit، scoreHeads، settle، systemPrompt، …
- `worker/structure.js` — FROZEN_MSG، LAYER_NAME_MAX، NEED_NORM_MSG، NORM_OK_SQL، STRUCT_COLUMNS، STRUCT_DDL، addCustomLayers، changeLog، changeStmt، changesList، cleanLocks، diffLines، locksOf، newLayerName، normConfirmed، structDiff، suggOf، withTqLocks

## مسیرهای سرور (3)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `POST /items/{}/models` | w/api.js › route | w/item-models.js#createExpertModel | ✓ |
| `POST /items/{}/models/{}/publish` | w/api.js › route | w/item-models.js#publishSupplierModel | — |
| `PUT /items/{}/models/{}` | w/api.js › route | w/item-models.js#updateExpertModel | ✓ |

## فراخوان در پنل‌ها (1)
- expert.js › registerModelUI → `POST /items/{}/models` (صفحه: expert.html)

متغیرهای Worker (نام): AI_MODEL، ANTHROPIC_API_BASE، ANTHROPIC_API_KEY

## جدول‌ها
نوشتن: counters، item_changes، item_edits، item_models، items، norm_cache، settings، sp_lines
خواندن: assignments، experts، requests
هم‌نویس‌های همین جدول‌ها: corr.main، expert.comm، expert.detail، expert.finalcall، infra.core، legal.app، manager.import، sup.panel

## تست‌ها (6)
- bot-history.test.mjs
- catalog.test.mjs
- item-models.test.mjs
- layer-locks.test.mjs
- size-estimate.test.mjs
- structure.test.mjs

```
node --test backend/tamin-poshtibani/tests/bot-history.test.mjs backend/tamin-poshtibani/tests/catalog.test.mjs backend/tamin-poshtibani/tests/item-models.test.mjs backend/tamin-poshtibani/tests/layer-locks.test.mjs backend/tamin-poshtibani/tests/size-estimate.test.mjs backend/tamin-poshtibani/tests/structure.test.mjs
```
