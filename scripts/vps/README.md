# پلِ سرورِ شرکت

دو برنامهٔ کوچکِ پایتون (فقط کتابخانهٔ استاندارد) روی سرورِ Ubuntuِ شرکت، کاربرِ `user`، پوشهٔ `~/ariana-sms/`:

| فایل | کار |
|---|---|
| `sms_relay.py` | پیامک‌های IPPanel را از صفِ سامانه می‌گیرد و می‌فرستد. IPPanel فقط از IPِ داخلی جواب می‌دهد. تاریخچهٔ کامل در `sms-history.sqlite` می‌ماند. |
| `backup.py` | هر شب از همهٔ جدول‌های D1 یک نسخهٔ پشتیبان می‌گیرد: `backups/db/asli-YYYY-MM-DD.sqlite.gz` (۳۰ نسخهٔ آخر). آینهٔ کاملِ گیت هم در `backups/code.git` است. |

طرفِ سامانه در `worker/relay.js` است. هر دو برنامه با راز `RELAY_KEY` به مسیرهای `/relay/*` وصل می‌شوند.

## config.json

این فایل `chmod 600` دارد و در مخزن نیست:

```json
{"site": "https://arianaai.website", "relay_key": "<همان RELAY_KEYِ Worker>", "ippanel_key": "<کلید API پنل IPPanel>"}
```

## Cron کاربر

ساعت سرور UTC است. ساعت ۰۰:۳۰ UTC برابر ۴ صبح تهران است، درست بعد از صفر شدنِ سقفِ روزانهٔ D1.

```
* * * * * cd ~/ariana-sms && flock -n .relay.lock python3 sms_relay.py >/dev/null 2>&1
30 0 * * * cd ~/ariana-sms && flock -n .backup.lock python3 backup.py >/dev/null 2>&1
```

## نگهداری

- **گزارش‌ها:** `relay.log` (چرخشی) و `backup.log`.
- **پیامک‌های اخیر:**

  ```
  sqlite3 ~/ariana-sms/sms-history.sqlite "SELECT job_id, datetime(sent_at/1000,'unixepoch'), to_number, ok, ippanel_id, error, delivery_status FROM sms ORDER BY job_id DESC LIMIT 20"
  ```
