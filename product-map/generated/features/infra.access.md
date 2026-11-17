# infra.access — دسترسی و API

بخش: زیرساخت

> مدیریت رمزنگاری‌شدهٔ کلیدها و سرویس‌دهنده‌ها در چرخ‌دندهٔ صفحهٔ اصلی.

## فایل‌های این قابلیت (صاحب)
- `frontend/tamin-poshtibani/secure-admin.js` — clone، fa، configure، mount، collect، configBody، refresh، load، saveConfig، saveUser، onClick، providerCard، secretField، userRow، mainView، view
- `worker/secure-config.js` — SECRET_FIELDS، SECURE_DDL، resetSecureConfig، saveSecureConfigVerified، secureOverview، withSecureConfig

## مسیرهای سرور (3)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /site/access` | w/api.js › route | w/legal-auth.js#listLegalUsers، w/secure-config.js#secureOverview، w/site.js#siteLogin | ✓ |
| `POST /site/access/legal-user` | w/api.js › route | w/legal-auth.js#saveLegalUser، w/site.js#siteLogin | ✓ |
| `POST /site/access/save` | w/api.js › route | w/legal-auth.js#listLegalUsers، w/secure-config.js#saveSecureConfigVerified، w/site.js#siteLogin | ✓ |

## فراخوان در پنل‌ها (3)
- secure-admin.js › refresh → `GET /site/access`
- secure-admin.js › saveConfig → `POST /site/access/save`
- secure-admin.js › saveUser → `POST /site/access/legal-user`

متغیرهای Worker (نام): CONFIG_ENCRYPTION_KEY

## جدول‌ها
نوشتن: legal_sessions، legal_users، secure_configs
خواندن: —
هم‌نویس‌های همین جدول‌ها: legal.app

## تست‌ها (1)
- secure-admin.test.mjs

```
node --test backend/tamin-poshtibani/tests/secure-admin.test.mjs
```
