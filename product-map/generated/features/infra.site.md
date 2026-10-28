# infra.site — دروازهٔ سایت

بخش: زیرساخت

> کد ورود به خود سایت پیش از پنل‌ها.

محل در رابط:
- درگاه تدارکات › انتخاب پنل (کارشناس، مدیر، پشتیبانی)

## فایل‌های این قابلیت (صاحب)
- `frontend/tamin-poshtibani/index.html`
- `worker/site.js` — CARD_STATES، checkSiteCode، putSite، siteLogin، siteSms، siteSmsTest، siteState

## مسیرهای سرور (5)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /site` | w/api.js › route | w/auth-guard.js#guardOpen، w/auth-guard.js#recordFail، w/site.js#siteState | ✓ |
| `GET /site/sms` | w/api.js › route | w/site.js#siteSms | ✓ |
| `POST /site/login` | w/api.js › route | w/site.js#siteLogin | ✓ |
| `POST /site/sms/test` | w/api.js › route | w/site.js#siteSmsTest | ✓ |
| `PUT /site` | w/api.js › route | w/site.js#putSite | ✓ |

## فراخوان در پنل‌ها (0)
—

## جدول‌ها
نوشتن: auth_fails، settings
خواندن: —
هم‌نویس‌های همین جدول‌ها: infra.auth

## تست‌ها (5)
- d1-budget.test.mjs
- relay.test.mjs
- review-fixes.test.mjs
- sec-p0.test.mjs
- site-fx.test.mjs

```
node --test backend/tamin-poshtibani/tests/d1-budget.test.mjs backend/tamin-poshtibani/tests/relay.test.mjs backend/tamin-poshtibani/tests/review-fixes.test.mjs backend/tamin-poshtibani/tests/sec-p0.test.mjs backend/tamin-poshtibani/tests/site-fx.test.mjs
```
