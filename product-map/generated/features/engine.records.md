# engine.records — ثبت سوابق جستجو، کانال‌ها و کمیسیون

بخش: موتورهای مشترک سرور

> دستورهای ثبتِ تأمین‌کنندگانِ یافته، شماره‌ها و کانال‌ها، رخداد ارجاع و رکورد کمیسیون.

## فایل‌های این قابلیت (صاحب)
- `worker/records.js` — PLATFORMS، assignmentLogStmt، backfillSearchKeys، closureStmt، commissionRecordStmts، deleteQuotes، itemKeys، itemSearches، phoneChannels، phoneKey، scoresHistoryStmts، searchSupplierStmts، setPhoneChannel، settingsHistoryStmts، titleKey، withPhoneKeys

## مسیرهای سرور (0)
—

## فراخوان در پنل‌ها (0)
—

## جدول‌ها
نوشتن: assignment_log، closures، commission_tables، events، phone_channel_log، phone_channels، quotes، quotes_deleted، scores_history، search_suppliers، settings_history، smart_searches، supplier_phones
خواندن: assignments، expert_scores، experts، items، settings، weights
هم‌نویس‌های همین جدول‌ها: expert.quotes، expert.smart، infra.core، manager.desk

## تست‌ها (1)
- records.test.mjs

```
node --test backend/tamin-poshtibani/tests/records.test.mjs
```
