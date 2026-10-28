# engine.structure — ساختار و یکسان‌سازی اقلام

بخش: موتورهای مشترک سرور | جریان کار: wf.request (گام 4)

> نوع قلم، لایه‌ها، قفل‌ها، یکسان‌سازی و برآورد قیمت هر قلم.

## فایل‌های این قابلیت (صاحب)
- `worker/estimate.js` — EST_DAY_MAX، EST_PENDING_SQL، EST_QUERY_ROOM، counted، estimateItem، estimateRun، layersFit، pickEstimate، resetEstimate، sameUnit
- `worker/normalize.js` — CUSTOM_LAYERS_KEY، NORM_COST_EST، NORM_PROMPT_VERSION، canonStruct، catalogStruct، clearNorm، confirmNorm، conventionLines، customLayerNames، dbStruct، nearestItems، normOf، normalizeItem، ratesView، revertEdit، scoreHeads، settle، systemPrompt، …
- `worker/structure.js` — FROZEN_MSG، LAYER_NAME_MAX، NEED_NORM_MSG، NORM_OK_SQL، STRUCT_COLUMNS، STRUCT_DDL، addCustomLayers، changeLog، changeStmt، changesList، cleanLocks، diffLines، locksOf، newLayerName، normConfirmed، structDiff، suggOf، withTqLocks

## مسیرهای سرور (0)
—

## فراخوان در پنل‌ها (0)
—

متغیرهای Worker (نام): AI_MODEL، ANTHROPIC_API_BASE، ANTHROPIC_API_KEY

## جدول‌ها
نوشتن: counters، item_changes، item_edits، items، norm_cache، settings
خواندن: assignments، requests
هم‌نویس‌های همین جدول‌ها: expert.comm، expert.detail، infra.core، legal.app، manager.import

## تست‌ها (5)
- bot-history.test.mjs
- catalog.test.mjs
- layer-locks.test.mjs
- size-estimate.test.mjs
- structure.test.mjs

```
node --test backend/tamin-poshtibani/tests/bot-history.test.mjs backend/tamin-poshtibani/tests/catalog.test.mjs backend/tamin-poshtibani/tests/layer-locks.test.mjs backend/tamin-poshtibani/tests/size-estimate.test.mjs backend/tamin-poshtibani/tests/structure.test.mjs
```
