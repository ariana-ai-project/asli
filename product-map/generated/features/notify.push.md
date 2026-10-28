# notify.push — اعلان مرورگر (Push)

بخش: اعلان‌ها

محل در رابط:
- در همهٔ پنل‌ها › 🔔 اعلان مرورگر

## فایل‌های این قابلیت (صاحب)
- `frontend/tamin-poshtibani/push-sw.js`
- `worker/push.js` — EXPERT، MANAGER، PUSH_DDL، ROLES، SUPPORT، b64u، drainPush، encryptPayload، pushLater، pushStmt، pushSubscribe، pushTo، pushUnsubscribe، resetVapidCache، sendOne، unb64u، validEndpoint، vapidKeys

## مسیرهای سرور (5)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `* /push/subscribe` | w/api.js › route | w/push.js#pushSubscribe، w/push.js#pushTo | ✓ |
| `GET /push/key` | w/api.js › route | w/push.js#vapidKeys | ✓ |
| `POST /push/subscribe` | w/api.js › route | — | ✓ |
| `POST /push/test` | w/api.js › route | — | ✓ |
| `POST /push/unsubscribe` | w/api.js › route | w/push.js#pushUnsubscribe | ✓ |

## فراخوان در پنل‌ها (2)
- ui.js › bind → `GET /push/key`، `* /push/subscribe`، `POST /push/subscribe` (صفحه: correspond.html، expert.html، manager.html، supplier.html، support.html، tender.html)
- ui.js › render → `POST /push/test` (صفحه: correspond.html، expert.html، manager.html، supplier.html، support.html، tender.html)

متغیرهای Worker (نام): SITE_ORIGIN، TG_IGNORE_HOURS، VAPID_PRIVATE_KEY، VAPID_PUBLIC_KEY

## جدول‌ها
نوشتن: push_out، push_subs، settings
خواندن: —

## تست‌ها (4)
- ai-mode-live.test.mjs
- d1-budget.test.mjs
- push-hooks.test.mjs
- push.test.mjs

```
node --test backend/tamin-poshtibani/tests/ai-mode-live.test.mjs backend/tamin-poshtibani/tests/d1-budget.test.mjs backend/tamin-poshtibani/tests/push-hooks.test.mjs backend/tamin-poshtibani/tests/push.test.mjs
```
