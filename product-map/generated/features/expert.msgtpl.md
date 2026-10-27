# expert.msgtpl — قالب‌های پیام

بخش: پنل کارشناس | جریان کار: wf.request (گام 5)

> متن آمادهٔ پیام به تأمین‌کننده (✉️) با جای‌گذاری نام و اقلام؛ در جستجوی هوشمند، بررسی سوابق و مکاتبات.

## فایل‌های این قابلیت (صاحب)
- `frontend/tamin-poshtibani/msg-fill.mjs` — faN، joinFa، canon، qtyRange، step، rangeFa، fillMsg، join
- `worker/templates.js` — TEMPLATE_TOKENS، TPL_COLUMNS، TPL_DDL، defaultTemplates، ensureTemplates، fillTemplate، listTemplates، ownTemplate، tplPrefs

## مسیرهای سرور (4)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `DELETE /templates/{}` | w/api.js › route | — | ✓ |
| `GET /templates` | w/api.js › route | — | ✓ |
| `POST /templates` | w/api.js › route | — | ✓ |
| `PUT /templates/{}` | w/api.js › route | — | ✓ |

## فراخوان در پنل‌ها (7)
- expert.js › delTpl → `DELETE /templates/{}`، `PUT /templates/{}` (صفحه: expert.html)
- expert.js › load → `GET /templates`، `POST /templates` (صفحه: expert.html)
- expert.js › loadTemplates → `GET /templates`، `POST /templates` (صفحه: expert.html)
- expert.js › msgFor → `GET /templates`، `POST /templates` (صفحه: expert.html)
- expert.js › saveTpl → `DELETE /templates/{}`، `PUT /templates/{}`، `GET /templates`، `POST /templates` (صفحه: expert.html)
- manager.js › refresh → `GET /templates`، `POST /templates` (صفحه: manager.html)
- support-panel.js › api → `GET /templates`، `POST /templates` (صفحه: support.html)

## جدول‌ها
نوشتن: templates
خواندن: tpl_prefs
هم‌نویس‌های همین جدول‌ها: bot.team، expert.ai، infra.core

## تست‌ها (2)
- cr-firstmsg.test.mjs
- execution-ready.test.mjs

```
node --test backend/tamin-poshtibani/tests/cr-firstmsg.test.mjs backend/tamin-poshtibani/tests/execution-ready.test.mjs
```
