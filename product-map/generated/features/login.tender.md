# login.tender — ورود به مناقصه

بخش: ورود | راهنما: help-content.js «login.tender» | جریان کار: wf.tender (گام 3)

> با همان شمارهٔ همراهی وارد شوید که پیامک دعوت را گرفت. «ارسال رمز به پیامک» را بزنید و رمز شش‌رقمی را بنویسید. برای امنیت، هر بار ورود رمز می‌خواهد.

محل در رابط:
- مناقصهٔ خرید › ورود به مناقصه

## فایل‌های این قابلیت (صاحب)
— (کدِ جدا ندارد؛ از راه مسیرها و فایل‌های مشترک)

## مسیرهای سرور (4)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `* /tender/{}/info` | w/api.js › route | w/ai-agent.js#aiRoute، w/sp-api.js#spRoute، w/tender.js#tenderAccept، w/tender.js#tenderBid، w/tender.js#tenderFixRequest، w/tender.js#tenderLogin، … | ✓ |
| `* /tender/{}/login` | w/api.js › route | w/ai-agent.js#aiRoute، w/sp-api.js#spRoute، w/tender.js#tenderAccept، w/tender.js#tenderBid، w/tender.js#tenderFixRequest، w/tender.js#tenderLogin، … | ✓ |
| `* /tender/{}/logout` | w/api.js › route | w/ai-agent.js#aiRoute، w/sp-api.js#spRoute، w/tender.js#tenderAccept، w/tender.js#tenderBid، w/tender.js#tenderFixRequest، w/tender.js#tenderLogin، … | — |
| `* /tender/{}/pass` | w/api.js › route | w/ai-agent.js#aiRoute، w/sp-api.js#spRoute، w/tender.js#tenderAccept، w/tender.js#tenderBid، w/tender.js#tenderFixRequest، w/tender.js#tenderLogin، … | ✓ |

## فراخوان در پنل‌ها (3)
- tender.js › boot → `* /tender/{}/info` (صفحه: tender.html)
- tender.js › ph → `* /tender/{}/pass`، `* /tender/{}/login` (صفحه: tender.html)
- tender.js › switchLot → `* /tender/{}/logout` (صفحه: tender.html)

جای راهنما در کد: tender.js › renderLogin

## جدول‌ها
نوشتن: events، sp_tg، tender_invites، tender_sessions
خواندن: experts، sp_lines، tender_bids
هم‌نویس‌های همین جدول‌ها: engine.tender، support.td، tender.page

## تست‌ها (6)
- d1-budget.test.mjs
- sec-p0.test.mjs
- sms-provider.test.mjs
- tender-d1.test.mjs
- tender.test.mjs
- tender2.test.mjs

```
node --test backend/tamin-poshtibani/tests/d1-budget.test.mjs backend/tamin-poshtibani/tests/sec-p0.test.mjs backend/tamin-poshtibani/tests/sms-provider.test.mjs backend/tamin-poshtibani/tests/tender-d1.test.mjs backend/tamin-poshtibani/tests/tender.test.mjs backend/tamin-poshtibani/tests/tender2.test.mjs
```

## مرتبط
- tender.page — مناقصهٔ خرید
