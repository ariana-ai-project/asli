# support.log — گزارش رخدادها

بخش: پنل پشتیبانی | راهنما: help-content.js «support.log»

> همهٔ رخدادها با زمان دقیق تا ثانیه — رویدادها، زمان‌های خودِ جدول‌ها، پیام‌ها و پیامک‌ها — با فیلتر تاریخ، کارشناس، درخواست و نوع، و صفحه‌بندی.

محل در رابط:
- پنل پشتیبانی تدارکات › رخدادها

## فایل‌های این قابلیت (صاحب)
— (کدِ جدا ندارد؛ از راه مسیرها و فایل‌های مشترک)

## مسیرهای سرور (7)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /support/alarms` | w/api.js › route | w/alarms.js#alarmsList | ✓ |
| `GET /support/alert-contacts` | w/api.js › route | w/alarms.js#alertContacts | ✓ |
| `GET /support/sms` | w/api.js › route | w/relay.js#relayOn، w/relay.js#relayStatus | ✓ |
| `POST /support/alarms/{}/ack` | w/api.js › route | w/alarms.js#alarmAck | — |
| `POST /support/sms/check` | w/api.js › route | w/sms.js#smsCheck | ✓ |
| `POST /support/sms/test` | w/api.js › route | w/relay.js#relayTestPattern، w/relay.js#relayTestText، w/sms.js#sendSms | ✓ |
| `PUT /support/alert-contacts` | w/api.js › route | w/alarms.js#alertContactsSave | ✓ |

## فراخوان در پنل‌ها (5)
- support-panel.js › alarmAckUi → `POST /support/alarms/{}/ack` (صفحه: support.html)
- support-panel.js › alertsDialog → `GET /support/alert-contacts` (صفحه: support.html)
- support-panel.js › loadAlarms → `GET /support/alarms` (صفحه: support.html)
- support-panel.js › smsGwDialog → `GET /support/sms`، `POST /support/sms/check`، `POST /support/sms/test` (صفحه: support.html)
- support-panel.js › v → `PUT /support/alert-contacts` (صفحه: support.html)

## جدول‌ها
نوشتن: alarms، settings
خواندن: experts، sms_outbox
هم‌نویس‌های همین جدول‌ها: infra.core، manager.log، notify.alarms، notify.sms

## تست‌ها (4)
- d1-budget.test.mjs
- relay.test.mjs
- sms-provider.test.mjs
- takeover.test.mjs

```
node --test backend/tamin-poshtibani/tests/d1-budget.test.mjs backend/tamin-poshtibani/tests/relay.test.mjs backend/tamin-poshtibani/tests/sms-provider.test.mjs backend/tamin-poshtibani/tests/takeover.test.mjs
```
