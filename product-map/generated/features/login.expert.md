# login.expert — ورود کارشناس

بخش: ورود | راهنما: help-content.js «login.expert»

> کد ورود، رمز پنل شماست: چهار رقم. هر رقم را در یک خانه بنویسید. کد اولیه را پشتیبانی می‌دهد و از «حساب من» می‌توانید عوضش کنید.

## فایل‌های این قابلیت (صاحب)
— (کدِ جدا ندارد؛ از راه مسیرها و فایل‌های مشترک)

## مسیرهای سرور (1)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `POST /login` | w/api.js › route | — | ✓ |

## فراخوان در پنل‌ها (6)
- correspond.js › renderLogin → `POST /login` (صفحه: correspond.html)
- expert.js › loadTemplates → `POST /login` (صفحه: expert.html)
- expert.js › wire → `POST /login` (صفحه: expert.html)
- manager.js › refresh → `POST /login` (صفحه: manager.html)
- manager.js › wire → `POST /login` (صفحه: manager.html)
- support-panel.js › api → `POST /login` (صفحه: support.html)

جای راهنما: correspond.js

## جدول‌ها
نوشتن: —
خواندن: experts

## تست‌ها (2)
- codes.test.mjs
- login.test.mjs

```
node --test backend/tamin-poshtibani/tests/codes.test.mjs backend/tamin-poshtibani/tests/login.test.mjs
```

## مرتبط
- expert.account — حساب من
- expert.tray — کارتابل من
