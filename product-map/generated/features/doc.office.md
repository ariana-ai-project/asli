# doc.office — ساخت Word و Excel

بخش: سندسازی (Word، Excel)

> سازندهٔ docx و xlsx بی وابستگی، برگ درخواست، پیش‌فاکتور، لوگو.

## فایل‌های این قابلیت (صاحب)
- `frontend/tamin-poshtibani/vendor/xlsx.full.min.js`
- `worker/docx.js` — LETTER_FONT، buildDocumentXml، crc32، deflateRaw، fillHeader، fixDates، ltrOf، persianize، renderLetter، textRuns، unzip، zip
- `worker/logo.js` — COMMISSION_LOGO_PNG، COMMISSION_LOGO_URL
- `worker/pfdoc.js` — PF_COLUMNS، PROFORMA_CSS، proformaData، proformaDocumentXml، proformaHtml، renderProformaDoc، termRows
- `worker/reqdoc.js` — REQUEST_COLUMNS، REQUEST_CSS، renderRequestDoc، requestDocumentXml، requestHtml، requestSheetData
- `worker/xlsx.js` — SHEET_CSS، Sheet، buildXlsx، cellRef، colName، sheetHtml
- `worker/xlsxbook.js` — BOOK_CSS، Book، DEFAULT_FONT، WSheet، absRef، buildBook، cellRef، chartSvg، chartXml، colName، escXml، faDigits، formatValue، sheetHtml

## مسیرهای سرور (0)
—

## فراخوان در پنل‌ها (0)
—

## جدول‌ها
نوشتن: —
خواندن: —

## تست‌ها (5)
- docs.test.mjs
- letter.test.mjs
- multiprice.test.mjs
- phase4.test.mjs
- reports.test.mjs

```
node --test backend/tamin-poshtibani/tests/docs.test.mjs backend/tamin-poshtibani/tests/letter.test.mjs backend/tamin-poshtibani/tests/multiprice.test.mjs backend/tamin-poshtibani/tests/phase4.test.mjs backend/tamin-poshtibani/tests/reports.test.mjs
```
