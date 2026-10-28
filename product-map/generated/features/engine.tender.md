# engine.tender — موتور مناقصه

بخش: موتورهای مشترک سرور | جریان کار: wf.tender (گام 2)، wf.tender (گام 4)

> ساخت، زمان‌بندی، دعوت، پیشنهاد و پایانِ مناقصهٔ برخط.

## فایل‌های این قابلیت (صاحب)
- `worker/tender-core.js` — TENDER_DEFAULTS، bestOf، bidRange، checkBid، extendOnBid، floorOf، mineOf، numWords، proxyRun، rankDrops، ranksOf، stepOf، tenderState
- `worker/tender.js` — TENDER_COLUMNS، TENDER_DDL، TENDER_PATH، aliasLabel، amountOf، discoveryInput، finalizeIfDue، inviteText، numWords، tenderAccept، tenderBid، tenderBidFix، tenderBook، tenderCancel، tenderCreate، tenderCsv، tenderDetail، tenderDiscoverQueue، …

## مسیرهای سرور (0)
—

## فراخوان در پنل‌ها (0)
—

متغیرهای Worker (نام): ANTHROPIC_API_KEY، DISCOVERY_MODEL، TG_SP_BOT_TOKEN

## جدول‌ها
نوشتن: assignments، events، items، quotes، settings، tender_bids، tender_invites، tender_jobs، tender_sessions، tenders
خواندن: cat_heads، experts، purchases، requests، sp_phones، sp_suppliers، sp_tg، supplier_grades، suppliers
هم‌نویس‌های همین جدول‌ها: login.tender، manager.desk، support.td، tender.page

## تست‌ها (2)
- tender.test.mjs
- tender2.test.mjs

```
node --test backend/tamin-poshtibani/tests/tender.test.mjs backend/tamin-poshtibani/tests/tender2.test.mjs
```
