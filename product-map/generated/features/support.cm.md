# support.cm — تأیید کمیسیون

بخش: پنل پشتیبانی | راهنما: help-content.js «support.cm» | جریان کار: wf.request (گام 9)، wf.smart (گام 7)

> تأیید کمیسیون فقط در همین پنل است و با «🏆 نتیجه و تأیید» ثبت می‌شود: برای هر قلم برنده و علتِ انتخابش را می‌گذارید؛ کارشناسِ همان درخواست در تلگرام خبردار می‌شود و «خاتمه»ی همان اقلام را می‌زند، و به تأمین‌کنندگانی که برنده نشدند پیامِ تشکر می‌رود.

## فایل‌های این قابلیت (صاحب)
- `frontend/tamin-poshtibani/cm-result.js` — fa، money، open، close، onKey، quoteCard، itemCard، losers، paint، load
- `worker/commission-result.js` — CR_DDL، REASONS، commissionResultGet، commissionResultSave، regretText

## مسیرهای سرور (4)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /support/commission` | w/api.js › route | w/settings.js#getSettings، w/support.js#commissionList | ✓ |
| `GET /support/commission/result` | w/api.js › route | w/commission-result.js#commissionResultGet | ✓ |
| `POST /support/commission` | w/api.js › route | w/support.js#setCommission | ✓ |
| `POST /support/commission/result` | w/api.js › route | w/commission-result.js#commissionResultSave | ✓ |

## فراخوان در پنل‌ها (4)
- cm-result.js › load → `GET /support/commission/result`، `POST /support/commission/result` (صفحه: support.html)
- support-panel.js › cmSet → `GET /support/commission`، `POST /support/commission` (صفحه: support.html)
- support-panel.js › loadCm → `GET /support/commission`، `POST /support/commission` (صفحه: support.html)
- tender-admin.js › loadList → `GET /support/commission`، `POST /support/commission` (صفحه: support.html)

## جدول‌ها
نوشتن: commission_notes، commission_results، events، items، sp_msgs، sp_threads
خواندن: assignments، experts، quotes، requests، settings، sp_bundles، sp_phones، sp_suppliers
هم‌نویس‌های همین جدول‌ها: corr.main، expert.finalcall، infra.core، manager.desk، sup.panel

## تست‌ها (3)
- commission-need.test.mjs
- commission-result.test.mjs
- support.test.mjs

```
node --test backend/tamin-poshtibani/tests/commission-need.test.mjs backend/tamin-poshtibani/tests/commission-result.test.mjs backend/tamin-poshtibani/tests/support.test.mjs
```
