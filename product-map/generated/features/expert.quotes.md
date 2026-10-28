# expert.quotes — استعلامات

بخش: پنل کارشناس | راهنما: help-content.js «expert.quotes» | جریان کار: wf.request (گام 7)، wf.supplier (گام 4)

> هر ردیف، یک خط استعلام از یک تأمین‌کننده برای یک قلم است. مقدارها از پنل تأمین‌کننده (تأیید نهایی)، «استخراج» پیش‌فاکتور یا مناقصه می‌آیند و هر خانه را دستی هم می‌توانید پر یا ویرایش کنید؛ منبعِ هر خانه با نشانِ کوچکِ کنارش ثبت و دیده می‌شود.

محل در رابط:
- پنل کارشناس خرید › صفحهٔ درخواست › استعلامات

## فایل‌های این قابلیت (صاحب)
- `worker/extract.js` — ExtractError، MODEL، PROMPT_VERSION، REFUSAL_FA، SCHEMA، SYSTEM، extractProforma، toRial، userContent
- `worker/proforma.js` — applyExtraction، extractFor، idList، lineUnitPrice، proformaOf، runExtraction، saveExtraction
- `worker/quote-rules.js` — ENUMS، INVOICE_AI، INVOICE_DEFAULT، LABELS، OPTIONAL، PER_LINE، PER_SUPPLIER، REQUIRED، VAT_RATE، canSave، emptyOptional، missingRequired، netOf، normalizeDtime، toNumber، validDtime، validateQuote
- `worker/quote-src.js` — EXTERNAL، PLACEHOLDER_SRC، QUOTE_EDITS_DDL، SRC_FA، SRC_FIELDS، legacyOf، manualStamp، mergeSrc، overrides، srcMap، srcView، stamp

## مسیرهای سرور (10)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `DELETE /quotes/{}` | w/api.js › route | — | ✓ |
| `GET /phones/channels` | w/api.js › route | w/records.js#phoneChannels | ✓ |
| `GET /proformas/{}/file` | w/api.js › route | w/storage.js#storage | — |
| `POST /proformas` | w/api.js › route | — | — |
| `POST /proformas/{}/apply` | w/api.js › route | w/proforma.js#applyExtraction، w/proforma.js#proformaOf | ✓ |
| `POST /proformas/{}/extract` | w/api.js › route | w/proforma.js#proformaOf، w/proforma.js#runExtraction، w/storage.js#storage | — |
| `POST /proformas/upload` | w/api.js › route | w/storage.js#MAX_BYTES، w/storage.js#storage، w/storage.js#storageKey | — |
| `POST /quotes` | w/api.js › route | — | ✓ |
| `PUT /phones/channels` | w/api.js › route | w/records.js#setPhoneChannel | ✓ |
| `PUT /quotes/{}` | w/api.js › route | — | ✓ |

## فراخوان در پنل‌ها (7)
- expert.js › addFromHistory → `POST /quotes` (صفحه: expert.html)
- expert.js › addFromSmart → `POST /quotes` (صفحه: expert.html)
- expert.js › dcAddQuote → `POST /quotes` (صفحه: expert.html)
- expert.js › saveField → `PUT /quotes/{}` (صفحه: expert.html)
- expert.js › showExtract → `POST /proformas/{}/extract`، `POST /proformas/{}/apply` (صفحه: expert.html)
- expert.js › toggleChannel → `PUT /phones/channels` (صفحه: expert.html)
- expert.js › wire → `POST /quotes`، `PUT /quotes/{}`، `DELETE /quotes/{}` (صفحه: expert.html)

جای راهنما در کد: expert.js › ro، expert.js › vGuard

متغیرهای Worker (نام): AI_MODEL، ANTHROPIC_API_BASE، ANTHROPIC_API_KEY

## جدول‌ها
نوشتن: events، phone_channel_log، phone_channels، proformas، quote_edits، quotes
خواندن: assignments، experts، items، requests
هم‌نویس‌های همین جدول‌ها: bot.team، engine.records، expert.finalcall، infra.core، manager.desk، sup.panel

## تست‌ها (11)
- ai-phase2.test.mjs
- ai-phase3.test.mjs
- apply.test.mjs
- discovered.test.mjs
- execution-ready.test.mjs
- extract.test.mjs
- final-call.test.mjs
- quote-rules.test.mjs
- review-fixes.test.mjs
- supplier.test.mjs
- support.test.mjs

```
node --test backend/tamin-poshtibani/tests/ai-phase2.test.mjs backend/tamin-poshtibani/tests/ai-phase3.test.mjs backend/tamin-poshtibani/tests/apply.test.mjs backend/tamin-poshtibani/tests/discovered.test.mjs backend/tamin-poshtibani/tests/execution-ready.test.mjs backend/tamin-poshtibani/tests/extract.test.mjs backend/tamin-poshtibani/tests/final-call.test.mjs backend/tamin-poshtibani/tests/quote-rules.test.mjs backend/tamin-poshtibani/tests/review-fixes.test.mjs backend/tamin-poshtibani/tests/supplier.test.mjs backend/tamin-poshtibani/tests/support.test.mjs
```

## مرتبط
- corr.main — مکاتبات با تأمین‌کنندگان
- expert.comm — جدول کمیسیون
