# manager.log — تصمیم‌ها و رویدادها

بخش: پنل مدیر | راهنما: help-content.js «manager.log»

> درخواست‌های کارشناسان که منتظر تأیید شماست — تعلیق، توقف، خاتمه، و «انجام دستی» (چند قلم و علتِ کارشناس؛ با رد، اقلام دستِ کارشناس هوشمند می‌مانند) — هر کدام یک کارت با «تأیید» و «رد»؛ و خطِ زمانِ رویدادهای اخیر سامانه، روز به روز.

## فایل‌های این قابلیت (صاحب)
- `worker/decisions.js` — applyDecision، approveDecision، expertDecision، rejectDecision

## مسیرهای سرور (6)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /alarms` | w/api.js › route | w/alarms.js#alarmsList | ✓ |
| `GET /decisions` | w/api.js › route | — | ✓ |
| `GET /events` | w/api.js › route | — | ✓ |
| `POST /alarms/{}/ack` | w/api.js › route | w/alarms.js#alarmAck، w/cr-api.js#crRoute | ✓ |
| `POST /decisions/{}/approve` | w/api.js › route | w/decisions.js#approveDecision، w/decisions.js#rejectDecision | ✓ |
| `POST /decisions/{}/reject` | w/api.js › route | w/decisions.js#approveDecision، w/decisions.js#rejectDecision | ✓ |

## فراخوان در پنل‌ها (5)
- expert.js › loadTemplates → `GET /alarms`، `GET /decisions`، `GET /events` (صفحه: expert.html)
- manager.js › loadEvents → `GET /events` (صفحه: manager.html)
- manager.js › refresh → `GET /alarms`، `GET /decisions`، `GET /events` (صفحه: manager.html)
- manager.js › wire → `POST /alarms/{}/ack`، `POST /decisions/{}/reject`، `POST /decisions/{}/approve` (صفحه: manager.html)
- support-panel.js › api → `GET /alarms`، `GET /decisions`، `GET /events` (صفحه: support.html)

جای راهنما: manager.js (پویا)

## جدول‌ها
نوشتن: alarms، alerts، assignments، decisions، events، items
خواندن: cr_docs، experts، requests، settings
هم‌نویس‌های همین جدول‌ها: expert.detail، infra.core، manager.desk، notify.alarms، support.log

## تست‌ها (5)
- ai-mode-live.test.mjs
- d1-budget.test.mjs
- phase4b.test.mjs
- review-fixes.test.mjs
- takeover.test.mjs

```
node --test backend/tamin-poshtibani/tests/ai-mode-live.test.mjs backend/tamin-poshtibani/tests/d1-budget.test.mjs backend/tamin-poshtibani/tests/phase4b.test.mjs backend/tamin-poshtibani/tests/review-fixes.test.mjs backend/tamin-poshtibani/tests/takeover.test.mjs
```

## مرتبط
- manager.desk — میز ارجاع
