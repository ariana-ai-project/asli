# support.size — 📏 برچسبِ اندازهٔ درخواست

بخش: پنل پشتیبانی | راهنما: help-content.js «support.size»

> هر درخواست بر پایهٔ جمعِ برآوردِ کلِ اقلامش یکی از چهار رده است: جزئی، متوسط، بزرگ، عمده. سه مرزِ میانِ رده‌ها به تومان است و روی نوار با کشیدنِ دستگیره‌ها عوض می‌شود (هر دستگیره فقط میانِ همسایه‌هایش). ذخیره خودکار است.

## فایل‌های این قابلیت (صاحب)
- `worker/size.js` — SIZES، SIZE_DEFAULT، SIZE_FA، SIZE_KEY، cleanSizeRules، getSizeRules، itemEstTotal، minQOf، reqSize، reqSizeAgg، rialToToman، saveSizeRules، sizeCat، sizeOfRial، sizeRulesOf، tomanTxt

## مسیرهای سرور (2)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /support/size-rules` | w/api.js › route | w/size.js#getSizeRules | ✓ |
| `PUT /support/size-rules` | w/api.js › route | w/size.js#saveSizeRules | ✓ |

## فراخوان در پنل‌ها (3)
- support-panel.js › loadSize → `GET /support/size-rules`، `PUT /support/size-rules` (صفحه: support.html)
- support-panel.js › saveSizeSoon → `GET /support/size-rules`، `PUT /support/size-rules` (صفحه: support.html)
- tender-admin.js › loadList → `GET /support/size-rules`، `PUT /support/size-rules` (صفحه: support.html)

## جدول‌ها
نوشتن: events، settings
خواندن: —

## تست‌ها (1)
- size-estimate.test.mjs

```
node --test backend/tamin-poshtibani/tests/size-estimate.test.mjs
```

## مرتبط
- support.cm — تأیید کمیسیون
- manager.desk — میز ارجاع
