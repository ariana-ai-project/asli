# support.td — 🔨 مناقصه

بخش: پنل پشتیبانی | راهنما: help-content.js «support.td» | جریان کار: wf.tender (گام 1)، wf.tender (گام 2)، wf.tender (گام 5)

> مزایدهٔ معکوس زنده برای خرید یک قلم: تأمین‌کنندگان دعوت‌شده قیمت واحد را پایین می‌آورند و کمترین قیمت در پایان برنده است.

محل در رابط:
- پنل پشتیبانی تدارکات › 🔨 مناقصه

## فایل‌های این قابلیت (صاحب)
- `frontend/tamin-poshtibani/tender-admin.js` — ICON، faD، now، rerender، nameKey، sw، loadCfg، loadList، loadOne، loops، timeLine، card، vList، cnt، formOf، n0، rulesBody، m، …

## مسیرهای سرور (24)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `* /support/tenders/{}` | w/api.js › route | w/tender.js#tenderCancel، w/tender.js#tenderCsv، w/tender.js#tenderDetail، w/tender.js#tenderDiscoverQueue، w/tender.js#tenderEnd، w/tender.js#tenderInviteAdd، … | ✓ |
| `* /support/tenders/{}/cancel` | w/api.js › route | w/tender.js#tenderCancel، w/tender.js#tenderCsv، w/tender.js#tenderDetail، w/tender.js#tenderDiscoverQueue، w/tender.js#tenderEnd، w/tender.js#tenderInviteAdd، … | — |
| `* /support/tenders/{}/csv` | w/api.js › route | w/tender.js#tenderCancel، w/tender.js#tenderCsv، w/tender.js#tenderDetail، w/tender.js#tenderDiscoverQueue، w/tender.js#tenderEnd، w/tender.js#tenderInviteAdd، … | ✓ |
| `* /support/tenders/{}/discover` | w/api.js › route | w/tender.js#tenderCancel، w/tender.js#tenderCsv، w/tender.js#tenderDetail، w/tender.js#tenderDiscoverQueue، w/tender.js#tenderEnd، w/tender.js#tenderInviteAdd، … | ✓ |
| `* /support/tenders/{}/end` | w/api.js › route | w/tender.js#tenderCancel، w/tender.js#tenderCsv، w/tender.js#tenderDetail، w/tender.js#tenderDiscoverQueue، w/tender.js#tenderEnd، w/tender.js#tenderInviteAdd، … | — |
| `* /support/tenders/{}/invite` | w/api.js › route | w/tender.js#tenderCancel، w/tender.js#tenderCsv، w/tender.js#tenderDetail، w/tender.js#tenderDiscoverQueue، w/tender.js#tenderEnd، w/tender.js#tenderInviteAdd، … | ✓ |
| `* /support/tenders/{}/invites` | w/api.js › route | w/tender.js#tenderCancel، w/tender.js#tenderCsv، w/tender.js#tenderDetail، w/tender.js#tenderDiscoverQueue، w/tender.js#tenderEnd، w/tender.js#tenderInviteAdd، … | ✓ |
| `* /support/tenders/{}/invites/{}` | w/api.js › route | w/tender.js#tenderInviteSet، w/tender.js#tenderPhonePass | — |
| `* /support/tenders/{}/invites/{}/pass` | w/api.js › route | w/tender.js#tenderInviteSet، w/tender.js#tenderPhonePass | ✓ |
| `* /support/tenders/{}/link` | w/api.js › route | w/tender.js#tenderCancel، w/tender.js#tenderCsv، w/tender.js#tenderDetail، w/tender.js#tenderDiscoverQueue، w/tender.js#tenderEnd، w/tender.js#tenderInviteAdd، … | ✓ |
| `* /support/tenders/{}/schedule` | w/api.js › route | w/tender.js#tenderCancel، w/tender.js#tenderCsv، w/tender.js#tenderDetail، w/tender.js#tenderDiscoverQueue، w/tender.js#tenderEnd، w/tender.js#tenderInviteAdd، … | ✓ |
| `* /support/tenders/{}/unrefer` | w/api.js › route | w/tender.js#tenderCancel، w/tender.js#tenderCsv، w/tender.js#tenderDetail، w/tender.js#tenderDiscoverQueue، w/tender.js#tenderEnd، w/tender.js#tenderInviteAdd، … | ✓ |
| `GET /support/tender-book` | w/api.js › route | w/tender.js#tenderBook | ✓ |
| `GET /support/tender-items` | w/api.js › route | w/tender.js#tenderItems | ✓ |
| `GET /support/tender-req-items` | w/api.js › route | w/tender.js#tenderReqItems | ✓ |
| `GET /support/tender-settings` | w/api.js › route | w/tender.js#tenderSettingsGet | ✓ |
| `GET /support/tender-suppliers` | w/api.js › route | w/tender.js#tenderSuppliers | ✓ |
| `GET /support/tenders` | w/api.js › route | w/tender.js#tenderList | ✓ |
| `POST /support/tender-refer` | w/api.js › route | w/tender.js#tenderRefer | ✓ |
| `POST /support/tender-settings/test` | w/api.js › route | w/tender.js#tenderSmsTest | ✓ |
| `POST /support/tender-unrefer` | w/api.js › route | w/tender.js#tenderUnrefer | — |
| `POST /support/tenders` | w/api.js › route | w/tender.js#tenderCreate | ✓ |
| `POST /support/tenders/{}/bids/{}` | w/api.js › route | w/tender.js#tenderBidFix | ✓ |
| `PUT /support/tender-settings` | w/api.js › route | w/tender.js#tenderSettingsSave | ✓ |

## فراخوان در پنل‌ها (17)
- support-panel.js › referTender → `POST /support/tender-refer` (صفحه: support.html)
- support-panel.js › unreferTender → `POST /support/tender-unrefer` (صفحه: support.html)
- tender-admin.js › addItem → `GET /support/tender-suppliers` (صفحه: support.html)
- tender-admin.js › addSup → `* /support/tenders/{}/invites` (صفحه: support.html)
- tender-admin.js › create → `POST /support/tenders`، `* /support/tenders/{}/schedule`، `* /support/tenders/{}/invite` (صفحه: support.html)
- tender-admin.js › endDialog → `* /support/tenders/{}/end` (صفحه: support.html)
- tender-admin.js › fixDialog → `POST /support/tenders/{}/bids/{}` (صفحه: support.html)
- tender-admin.js › loadCfg → `GET /support/tender-settings` (صفحه: support.html)
- tender-admin.js › loadList → `GET /support/tenders` (صفحه: support.html)
- tender-admin.js › loadOne → `* /support/tenders/{}` (صفحه: support.html)
- tender-admin.js › onChange → `* /support/tenders/{}/invites/{}` (صفحه: support.html)
- tender-admin.js › onClick → `* /support/tenders/{}`، `* /support/tenders/{}/unrefer`، `* /support/tenders/{}/invite`، `* /support/tenders/{}/cancel`، `POST /support/tenders/{}/bids/{}`، `* /support/tenders/{}/invites/{}/pass`، `* /support/tenders/{}/discover`، `GET /support/tender-req-items`، `* /support/tenders/{}/link` (صفحه: support.html)
- tender-admin.js › rulesDialog → `* /support/tenders/{}` (صفحه: support.html)
- tender-admin.js › searchBook → `GET /support/tender-book` (صفحه: support.html)
- tender-admin.js › searchItems → `GET /support/tender-items` (صفحه: support.html)
- tender-admin.js › settingsDialog → `PUT /support/tender-settings`، `POST /support/tender-settings/test` (صفحه: support.html)
- tender-admin.js › startDialog → `* /support/tenders/{}/schedule` (صفحه: support.html)

جای راهنما در کد: tender-admin.js › vWizard، tender-admin.js › linkHtml

## جدول‌ها
نوشتن: assignments، events، items، quotes، tender_bids، tender_invites، tender_jobs، tender_sessions، tenders
خواندن: experts، purchases، requests، sp_suppliers، supplier_grades، suppliers
هم‌نویس‌های همین جدول‌ها: engine.tender، login.tender، manager.desk، tender.page

## تست‌ها (8)
- d1-budget.test.mjs
- sec-p0.test.mjs
- sms-provider.test.mjs
- supplier-over.test.mjs
- tender-d1.test.mjs
- tender-refer.test.mjs
- tender.test.mjs
- tender2.test.mjs

```
node --test backend/tamin-poshtibani/tests/d1-budget.test.mjs backend/tamin-poshtibani/tests/sec-p0.test.mjs backend/tamin-poshtibani/tests/sms-provider.test.mjs backend/tamin-poshtibani/tests/supplier-over.test.mjs backend/tamin-poshtibani/tests/tender-d1.test.mjs backend/tamin-poshtibani/tests/tender-refer.test.mjs backend/tamin-poshtibani/tests/tender.test.mjs backend/tamin-poshtibani/tests/tender2.test.mjs
```

## مرتبط
- support.cm — تأیید کمیسیون
