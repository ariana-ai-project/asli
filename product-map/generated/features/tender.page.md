# tender.page — مناقصهٔ خرید

بخش: مناقصه | راهنما: help-content.js «tender.page» | جریان کار: wf.tender (گام 4)

> قیمت واحد را پایین می‌آورید و کمترین قیمت در پایان برنده است. بالای صفحه زمان باقی‌مانده، کمترین قیمت فعلی و جایگاه شما را می‌بینید.

## فایل‌های این قابلیت (صاحب)
- `frontend/tamin-poshtibani/tender-ui.js` — fa، esc، latin، money، parseAmt، short، three، words، clock، dtf، hms، when، stChip، ring، tickRing، chart، x، line، …
- `frontend/tamin-poshtibani/tender.css`
- `frontend/tamin-poshtibani/tender.html`
- `frontend/tamin-poshtibani/tender.js` — store، api، now، setTok، timingOf، renderLogin، setErr، ph، loadState، accept، notify، poll، stopLoops، startLoops، every، tick، loadMarket، pctTxt، …

## مسیرهای سرور (8)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `* /tender/{}/accept` | w/api.js › route | w/ai-agent.js#aiRoute، w/sp-api.js#spRoute، w/tender.js#tenderAccept، w/tender.js#tenderBid، w/tender.js#tenderFixRequest، w/tender.js#tenderLogin، … | ✓ |
| `* /tender/{}/bid` | w/api.js › route | w/ai-agent.js#aiRoute، w/sp-api.js#spRoute، w/tender.js#tenderAccept، w/tender.js#tenderBid، w/tender.js#tenderFixRequest، w/tender.js#tenderLogin، … | ✓ |
| `* /tender/{}/fixreq` | w/api.js › route | w/ai-agent.js#aiRoute، w/sp-api.js#spRoute، w/tender.js#tenderAccept، w/tender.js#tenderBid، w/tender.js#tenderFixRequest، w/tender.js#tenderLogin، … | ✓ |
| `* /tender/{}/lots` | w/api.js › route | w/ai-agent.js#aiRoute، w/sp-api.js#spRoute، w/tender.js#tenderAccept، w/tender.js#tenderBid، w/tender.js#tenderFixRequest، w/tender.js#tenderLogin، … | — |
| `* /tender/{}/pref` | w/api.js › route | w/ai-agent.js#aiRoute، w/sp-api.js#spRoute، w/tender.js#tenderAccept، w/tender.js#tenderBid، w/tender.js#tenderFixRequest، w/tender.js#tenderLogin، … | ✓ |
| `* /tender/{}/proxy` | w/api.js › route | w/ai-agent.js#aiRoute، w/sp-api.js#spRoute، w/tender.js#tenderAccept، w/tender.js#tenderBid، w/tender.js#tenderFixRequest، w/tender.js#tenderLogin، … | ✓ |
| `* /tender/{}/state` | w/api.js › route | w/ai-agent.js#aiRoute، w/sp-api.js#spRoute، w/tender.js#tenderAccept، w/tender.js#tenderBid، w/tender.js#tenderFixRequest، w/tender.js#tenderLogin، … | ✓ |
| `GET /tender/market` | w/api.js › route | w/tender.js#tenderMarket | — |

## فراخوان در پنل‌ها (6)
- tender.js › api → `GET /tender/market` (صفحه: tender.html)
- tender.js › fixReq → `* /tender/{}/fixreq` (صفحه: tender.html)
- tender.js › loadMarket → `GET /tender/market` (صفحه: tender.html)
- tender.js › loadState → `* /tender/{}/state` (صفحه: tender.html)
- tender.js › poll → `* /tender/{}/state` (صفحه: tender.html)
- tender.js › sendBid → `* /tender/{}/bid` (صفحه: tender.html)

جای راهنما: tender.js

## جدول‌ها
نوشتن: events، sp_tg، tender_invites، tender_sessions
خواندن: experts، sp_lines، tender_bids
هم‌نویس‌های همین جدول‌ها: engine.tender، login.tender، support.td

## تست‌ها (5)
- d1-budget.test.mjs
- sec-p0.test.mjs
- tender-d1.test.mjs
- tender.test.mjs
- tender2.test.mjs

```
node --test backend/tamin-poshtibani/tests/d1-budget.test.mjs backend/tamin-poshtibani/tests/sec-p0.test.mjs backend/tamin-poshtibani/tests/tender-d1.test.mjs backend/tamin-poshtibani/tests/tender.test.mjs backend/tamin-poshtibani/tests/tender2.test.mjs
```

## مرتبط
- login.tender — ورود به مناقصه
