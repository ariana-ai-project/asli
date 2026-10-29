# notify.sms — پیامک

بخش: اعلان‌ها | جریان کار: wf.tender (گام 2)، wf.supplier (گام 1)

> درگاه‌های پیامک و پلِ سرورِ شرکت: صفِ پیامکِ IPPanel، تپشِ پل و پشتیبان‌گیریِ شبانهٔ پایگاه داده.

## فایل‌های این قابلیت (صاحب)
- `worker/relay.js` — RELAY_DDL، RELAY_EXPIRE_MS، RELAY_FRESH_MS، RELAY_STALE_MS، relayAuth، relayBackupRows، relayBackupSchema، relayCheck، relayEnqueue، relayOn، relayStatus، relaySync، relayTestText، relayWatch
- `worker/sms.js` — BIDI، SmsError، e164، garbled، isMobile، lineE164، phoneChars، sendSms، smsCheck، smsEnvWith، smsLabel، smsProvider، smsReady، smsStatus، viaLabel، viaSent

## مسیرهای سرور (4)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /relay/backup/rows` | w/api.js › route | w/relay.js#relayBackupRows | ✓ |
| `GET /relay/backup/schema` | w/api.js › route | w/relay.js#relayBackupSchema | ✓ |
| `POST /relay/sync` | w/api.js › route | w/relay.js#relaySync | ✓ |
| `POST /relay/test` | w/api.js › route | w/relay.js#relayAuth، w/relay.js#relayTestText، w/sms.js#sendSms | ✓ |

## فراخوان در پنل‌ها (0)
—

متغیرهای Worker (نام): IPPANEL_API_BASE، IPPANEL_API_KEY، RELAY_KEY، SMS_PROVIDER، TEXTBEE_API_BASE

## جدول‌ها
نوشتن: settings، sms_outbox، sp_sms
خواندن: —
هم‌نویس‌های همین جدول‌ها: corr.main، expert.finalcall، infra.core، login.supplier، sup.panel

## تست‌ها (3)
- relay.test.mjs
- sms-provider.test.mjs
- supplier.test.mjs

```
node --test backend/tamin-poshtibani/tests/relay.test.mjs backend/tamin-poshtibani/tests/sms-provider.test.mjs backend/tamin-poshtibani/tests/supplier.test.mjs
```
