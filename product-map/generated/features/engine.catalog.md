# engine.catalog — کاتالوگ و قواعد یکسان‌سازی

بخش: موتورهای مشترک سرور

> کاتالوگ اقلام و اصناف، قواعد نوع قلم و واحدها (مشترک مرورگر و سرور).

## فایل‌های این قابلیت (صاحب)
- `frontend/tamin-poshtibani/catalog-canon.mjs` — refreshAliases، setAliases، canonBase، aliasBases، ruleOf، canonHead، fmt، nomreValue، qv، lenK، quant، sheetUnit، sectionUnit، sidesMm، thMm، sheet، hollow، legs، …
- `frontend/tamin-poshtibani/catalog-head-rules.mjs`
- `frontend/tamin-poshtibani/catalog-import.js` — ascii، nameOf، keyOf، fnv32، hex8، shardOf، words، T، numOf، hkey، utf8len، sheetRows، colsOf، need، historySheet، has، readItems، canonItems، …
- `frontend/tamin-poshtibani/catalog-rules.mjs` — ascii، nameOf، keyOf، canonMaterial، materialInTitle، inHead، ownerBefore، canonUnit، layerList، refUnitOf، toRef، num، showNum، parseOne، pickUnit، parseQuant، unitConventions، baseOf، …
- `frontend/tamin-poshtibani/catalog-units.mjs` — MEASURE، purchaseUnit، fmt، one، crossSection، packCount، statedMaterial، materialOf، familyOf، way، facts، miss، convert، res، pick، perUnit
- `worker/catalog.js` — CATALOG_DDL، CODE_SHARDS، EDITS_DDL، GROUPS، GUILD_MISC، TABLES، activeImport، allHeads، ascii، catalogBegin، catalogChunk، catalogFinish، catalogHead، catalogMeta، codeOfTitle، conversionFor، editIndex، editKey، …

## مسیرهای سرور (3)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `POST /catalog/begin` | w/api.js › route | w/catalog.js#catalogBegin | — |
| `POST /catalog/chunk` | w/api.js › route | w/catalog.js#catalogChunk | — |
| `POST /catalog/finish` | w/api.js › route | w/catalog.js#catalogFinish | — |

## فراخوان در پنل‌ها (0)
—

## جدول‌ها
نوشتن: hist_imports، settings
خواندن: cat_codes، cat_guilds، cat_heads، cat_titles، cat_words، guild_classes، item_edits، purchases

## تست‌ها (17)
- assign-plan.test.mjs
- bot-history.test.mjs
- canon.test.mjs
- catalog.test.mjs
- cr-doc.test.mjs
- cr-picks.test.mjs
- cr-turn.test.mjs
- layer-locks.test.mjs
- neg-view.test.mjs
- phase4b2.test.mjs
- ranking.test.mjs
- rules.test.mjs
- size-estimate.test.mjs
- structure.test.mjs
- supplier-over.test.mjs
- tender-d1.test.mjs
- units.test.mjs

```
node --test backend/tamin-poshtibani/tests/assign-plan.test.mjs backend/tamin-poshtibani/tests/bot-history.test.mjs backend/tamin-poshtibani/tests/canon.test.mjs backend/tamin-poshtibani/tests/catalog.test.mjs backend/tamin-poshtibani/tests/cr-doc.test.mjs backend/tamin-poshtibani/tests/cr-picks.test.mjs backend/tamin-poshtibani/tests/cr-turn.test.mjs backend/tamin-poshtibani/tests/layer-locks.test.mjs backend/tamin-poshtibani/tests/neg-view.test.mjs backend/tamin-poshtibani/tests/phase4b2.test.mjs backend/tamin-poshtibani/tests/ranking.test.mjs backend/tamin-poshtibani/tests/rules.test.mjs backend/tamin-poshtibani/tests/size-estimate.test.mjs backend/tamin-poshtibani/tests/structure.test.mjs backend/tamin-poshtibani/tests/supplier-over.test.mjs backend/tamin-poshtibani/tests/tender-d1.test.mjs backend/tamin-poshtibani/tests/units.test.mjs
```
