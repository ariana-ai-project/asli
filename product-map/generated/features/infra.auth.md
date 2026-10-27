# infra.auth — ورود با کد و تلگرام

بخش: زیرساخت

> محدودیت تلاش ناموفق و قفل، شناسایی از مینی‌اپ تلگرام.

## فایل‌های این قابلیت (صاحب)
- `worker/auth-guard.js` — CODE_DAY_LIMIT، GUARD_DDL، LIMIT، WIN_MS، blockedError، codeChangeConflict، codeChangeOpen، failCountStmt، guardOpen، ipOf، recordFail، windowOf
- `worker/tg-auth.js` — expertOfInit، tgIdentity، verifyInitData

## مسیرهای سرور (0)
—

## فراخوان در پنل‌ها (0)
—

## جدول‌ها
نوشتن: auth_fails
خواندن: experts، sp_tg
هم‌نویس‌های همین جدول‌ها: infra.site

## تست‌ها (1)
- sec-p0.test.mjs

```
node --test backend/tamin-poshtibani/tests/sec-p0.test.mjs
```
