# infra.site — دروازهٔ سایت

بخش: زیرساخت

> کد ورود به خود سایت پیش از پنل‌ها.

## فایل‌های این قابلیت (صاحب)
- `frontend/tamin-poshtibani/index.html`
- `worker/site.js` — CARD_STATES، checkSiteCode، putSite، siteLogin، siteState

## مسیرهای سرور (3)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /site` | w/api.js › route | w/auth-guard.js#guardOpen، w/auth-guard.js#recordFail، w/site.js#siteState | ✓ |
| `POST /site/login` | w/api.js › route | w/site.js#siteLogin | ✓ |
| `PUT /site` | w/api.js › route | w/site.js#putSite | ✓ |

## فراخوان در پنل‌ها (3)
- expert.js › loadTemplates → `GET /site`، `PUT /site` (صفحه: expert.html)
- manager.js › refresh → `GET /site`، `PUT /site` (صفحه: manager.html)
- support-panel.js › api → `GET /site`، `PUT /site` (صفحه: support.html)

## جدول‌ها
نوشتن: auth_fails، settings
خواندن: —
هم‌نویس‌های همین جدول‌ها: infra.auth

## تست‌ها (4)
- d1-budget.test.mjs
- review-fixes.test.mjs
- sec-p0.test.mjs
- site-fx.test.mjs

```
node --test backend/tamin-poshtibani/tests/d1-budget.test.mjs backend/tamin-poshtibani/tests/review-fixes.test.mjs backend/tamin-poshtibani/tests/sec-p0.test.mjs backend/tamin-poshtibani/tests/site-fx.test.mjs
```
