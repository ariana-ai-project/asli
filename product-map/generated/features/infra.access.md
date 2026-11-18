# infra.access — دسترسی و API

بخش: زیرساخت

> مدیریت رمزنگاری‌شدهٔ کلیدها، سازگاری مدل‌ها و سرویس‌دهنده‌ها در چرخ‌دندهٔ صفحهٔ اصلی.

## فایل‌های این قابلیت (صاحب)
- `frontend/tamin-poshtibani/secure-admin.js` — clone، fa، configure، mount، collect، configBody، refresh، load، saveConfig، saveUser، testService، onClick، providerCard، secretField، userRow، serviceTests، mainView، view
- `worker/model-provider.js` — modelFetch، normalizeModelBase
- `worker/secure-config.js` — SECRET_FIELDS، SECURE_DDL، resetSecureConfig، saveSecureConfigVerified، secureOverview، testSecureService، withSecureConfig

## مسیرهای سرور (4)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /site/access` | w/api.js › route | w/legal-auth.js#listLegalUsers، w/secure-config.js#secureOverview، w/site.js#siteLogin | ✓ |
| `POST /site/access/legal-user` | w/api.js › route | w/legal-auth.js#saveLegalUser، w/site.js#siteLogin | ✓ |
| `POST /site/access/save` | w/api.js › route | w/legal-auth.js#listLegalUsers، w/secure-config.js#saveSecureConfigVerified، w/site.js#siteLogin | ✓ |
| `POST /site/access/test` | w/api.js › route | w/secure-config.js#testSecureService، w/site.js#siteLogin | — |

## فراخوان در پنل‌ها (4)
- secure-admin.js › refresh → `GET /site/access`
- secure-admin.js › saveConfig → `POST /site/access/save`
- secure-admin.js › saveUser → `POST /site/access/legal-user`
- secure-admin.js › testService → `POST /site/access/test`

متغیرهای Worker (نام): AI_CUSTOM_PROVIDER، AI_MODEL، ANTHROPIC_API_BASE، ANTHROPIC_API_KEY، CONFIG_ENCRYPTION_KEY، ELEVENLABS_API_BASE، ELEVENLABS_API_KEY، SUPABASE_BUCKET، SUPABASE_SERVICE_KEY، SUPABASE_URL

## جدول‌ها
نوشتن: legal_sessions، legal_users، secure_configs
خواندن: —
هم‌نویس‌های همین جدول‌ها: legal.app

## تست‌ها (2)
- model-provider.test.mjs
- secure-admin.test.mjs

```
node --test backend/tamin-poshtibani/tests/model-provider.test.mjs backend/tamin-poshtibani/tests/secure-admin.test.mjs
```
