# support.sup — 🏷 تأمین‌کنندگان — رده و مشخصات

بخش: پنل پشتیبانی | راهنما: help-content.js «support.sup»

> ردهٔ A/B/C ِ هر تأمین‌کننده از فایلِ سوابقِ خریدِ مدیر می‌آید. این‌جا، فقط در پنل پشتیبانی، آن رده و مشخصاتِ تأمین‌کننده — نام رسمی، شمارهٔ ثبت، شناسهٔ ملی، نشانی و تلفن — فیلد به فیلد و با دلیل عوض می‌شود، با توضیحِ کیفیِ اینکه چرا A، B یا C است.

محل در رابط:
- پنل پشتیبانی تدارکات › 🧭 استراتژی و دفتر › 🏷 تأمین‌کنندگان — رده و مشخصات

## فایل‌های این قابلیت (صاحب)
- `frontend/tamin-poshtibani/sup-profile.js` — fa، gradeChip، bySup، ymFa، money، when، css، enabled، btn، nk، hitKey، lfInit، lfReduce، linkBody، vLinkForm، vLinkBox، vLinkAct، kindOf، …
- `worker/supplier-over.js` — FIELD_FA، GRADES، HIST_SQL، NO_GRADE، SUPOVER_DDL، gradeMap، mergeGrade، normTel، phoneList، supplierInfo، supplierSave، supplierSearch

## مسیرهای سرور (5)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `* /support/supplier` | w/api.js › route | w/cr-api.js#crSupportRoute | ✓ |
| `* /support/suppliers` | w/api.js › route | w/cr-api.js#crSupportRoute | ✓ |
| `GET /support/supplier` | w/cr-api.js › crSupportRoute | w/supplier-over.js#supplierInfo | ✓ |
| `GET /support/suppliers` | w/cr-api.js › crSupportRoute | w/supplier-over.js#supplierSearch | ✓ |
| `PUT /support/supplier` | w/cr-api.js › crSupportRoute | w/supplier-over.js#supplierSave | ✓ |

## فراخوان در پنل‌ها (3)
- cr-admin.js › load → `* /support/suppliers`، `GET /support/suppliers` (صفحه: support.html)
- cr-admin.js › supSearch → `* /support/suppliers`، `GET /support/suppliers` (صفحه: support.html)
- cr-admin.js › supUI → `* /support/supplier`، `GET /support/supplier`، `PUT /support/supplier` (صفحه: support.html)

جای راهنما در کد: cr-admin.js › vSup

## جدول‌ها
نوشتن: events، supplier_over
خواندن: cr_heads، sp_phones، sp_suppliers، sreg، sreg_alias، supplier_grades، suppliers

## تست‌ها (3)
- cr-registry.test.mjs
- sup-profile.test.mjs
- supplier-over.test.mjs

```
node --test backend/tamin-poshtibani/tests/cr-registry.test.mjs backend/tamin-poshtibani/tests/sup-profile.test.mjs backend/tamin-poshtibani/tests/supplier-over.test.mjs
```

## مرتبط
- support.cr — 🧭 استراتژی و دفتر
- support.rank — 🏅 رتبه‌بندی و دعوت
