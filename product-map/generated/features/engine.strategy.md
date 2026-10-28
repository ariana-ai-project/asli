# engine.strategy — موتور راهبرد خرید (CR-02)

بخش: موتورهای مشترک سرور | جریان کار: wf.smart (گام 3)

> راهبرد هر نوع قلم، سند راهبرد، نوبت‌های مذاکره و داده‌های تحقیق CR-02.

محل در رابط:
- پنل کارشناس خرید › صفحهٔ درخواست › 📘 سند راهبرد

## فایل‌های این قابلیت (صاحب)
- `frontend/tamin-poshtibani/strategy-view.js` — fa، glq، rial، pctS، paceFa، glanceOf، faM، faNum، when، det، helpBtn، docBody، ul، dh، tile، docHead، roHtml، openDoc، …
- `worker/cr-data.js` — CR02_DDL، CR_SHARDS، NATURES، crShard، fnv32، natureOfEvidence، supKey
- `worker/cr-engine.js` — CAUTIOUS، FAMILY، MODE_FA، VARIANTS، codeRow، headChanges، headPolicy، headProfile، headRow، recipientPlan، researchHead، rfqNTable، variantOfFamily
- `worker/critique.js` — BOXES، BOX_FA، STRAT_BOXES، boxesFa، boxesIn، boxesOf، boxesOn
- `worker/strategy-doc.js` — DOC_API_SCHEMA، DOC_DDL، DOC_MODEL، DOC_STATE_FA، OTHERS_FA، PACE_FA، PANEL_DEFAULT، PREGEN_RANK، WEIGHT_FA، applyRules، boxesOf، buildDoc، builderDoc، crDocTick، docBlock، docBrief، docGate، docInput، …
- `worker/strategy/config.js` — ABNORMALLY_LOW_VS_MEDIAN، ABNORMALLY_LOW_VS_REF، BLOCKING_EDGES_SAME_BUSINESS، BLOCKING_EDGES_STRICT، BROADEN_IF، CONCESSION_C، CONCESSION_C_SCARCE، CONSULT_N، DATE_JALALI، DEP_CAP، DEP_MIN_ACTIVE، DEP_WINDOW_MONTHS، DISCOUNT_BASIS، FX_MONTHLY_GROWTH_DEFAULT، IDENTICAL_QUOTES_REL، MAX_INCUMBENTS، MAX_PER_HUB، MAX_SENDS_PER_DAY_LIMITED، …
- `worker/strategy/detectors.js` — aboveReference، competitiveSignal، dependenceCheck، extremeAnchor، lowVarianceAfterRise، quoteChecks، winnerRotation
- `worker/strategy/index.js` — VERSION، engineProfile
- `worker/strategy/kb-data.js` — CLASSIFIER_SCHEMA، KB، KB_VERSION، MOVES، P0، P1، P3، P4، PLAN_SCHEMA، STATES، TURN_SCHEMA
- `worker/strategy/negotiation.js` — accept، concessionOk، nextOffer، planNegotiation، referencePrice
- `worker/strategy/pricing.js` — dependenceAdjusted، dependenceParams، effectivePrice، monthlyDiscountRate، nominalForEffective، pyRound، rankOffers، settingsFor، splitAward
- `worker/strategy/profile.js` — engineProfile
- `worker/strategy/questionnaire.js` — DIMENSIONS، QUESTION_OPTIONS، applyAnswers، decisionRelevantQuestions، impliedClass، impliedLabels، swingWeights
- `worker/strategy/rfq.js` — DISPERSED_HUBS، buildAdjacency، decideMode، rfqPolicy، selectRecipients، spendTier
- `worker/strategy/validator-rules.js` — VALIDATOR_RULES
- `worker/strategy/validator.js` — norm، toJsRegex، validateTurn
- `worker/turn-engine.js` — CLS_API، TURN_API، TURN_DDL، TURN_MODELS، TURN_MODEL_OPTS، bestOther، boxOfViolation، exOf، notesFor، opinionLeaks، othersStmt، planOf، refOf، sameUnit، saveTurnModels، statesOf، turnModels، turnOn، …

## مسیرهای سرور (0)
—

## فراخوان در پنل‌ها (0)
—

## جدول‌ها
نوشتن: ai_feedback، cr_cache، cr_docs، cr_facts، cr_turns، events، settings
خواندن: cr_codes، cr_head_x، cr_heads، cr_prices، cr_units، items، purchases، sp_bundles، sp_lines، sp_suppliers، sp_threads، sreg، sreg_edges، sreg_ops
هم‌نویس‌های همین جدول‌ها: infra.core، support.cr، support.fb

## تست‌ها (12)
- cr-boxes.test.mjs
- cr-doc.test.mjs
- cr-headname.test.mjs
- cr-picks.test.mjs
- cr-registry.test.mjs
- cr-turn.test.mjs
- discovered.test.mjs
- help-glossary.test.mjs
- neg-view.test.mjs
- strategy-engine.test.mjs
- strategy-parity.test.mjs
- supplier-over.test.mjs

```
node --test backend/tamin-poshtibani/tests/cr-boxes.test.mjs backend/tamin-poshtibani/tests/cr-doc.test.mjs backend/tamin-poshtibani/tests/cr-headname.test.mjs backend/tamin-poshtibani/tests/cr-picks.test.mjs backend/tamin-poshtibani/tests/cr-registry.test.mjs backend/tamin-poshtibani/tests/cr-turn.test.mjs backend/tamin-poshtibani/tests/discovered.test.mjs backend/tamin-poshtibani/tests/help-glossary.test.mjs backend/tamin-poshtibani/tests/neg-view.test.mjs backend/tamin-poshtibani/tests/strategy-engine.test.mjs backend/tamin-poshtibani/tests/strategy-parity.test.mjs backend/tamin-poshtibani/tests/supplier-over.test.mjs
```
