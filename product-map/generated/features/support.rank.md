# support.rank — 🏅 رتبه‌بندی و دعوت

بخش: پنل پشتیبانی | راهنما: help-content.js «support.rank» | جریان کار: wf.smart (گام 1)

> رتبهٔ نهایی هر تأمین‌کننده در سوابق، میانگینِ وزنیِ رتبه‌های نسبیِ او در چهار ستون است — دفعات خرید، مقدار، امتیاز گشتاوری و ارزش خرید به قیمت روز (با نرخ دلار) — به‌اضافهٔ ردهٔ او (A صد درصد، B شصت‌وشش، C سی‌وسه، بی‌رده صفر).

محل در رابط:
- پنل پشتیبانی تدارکات › 🤖 کارشناس هوشمند › 🏅 رتبه‌بندی و دعوت

## فایل‌های این قابلیت (صاحب)
- `worker/ranking.js` — DISPATCH_DEFAULT، DISPATCH_KEY، GRADE_SCORE، RANK_DEFAULT، RANK_FA، RANK_KEY، THEN_FA، cleanDispatch، cleanWeights، dispatchOrder، getRanking، resetRankingCache، saveRanking

## مسیرهای سرور (2)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /support/ai/ranking` | w/ai-agent.js › aiAdmin | w/ranking.js#RANK_FA، w/ranking.js#THEN_FA، w/ranking.js#getRanking | ✓ |
| `PUT /support/ai/ranking` | w/ai-agent.js › aiAdmin | w/ranking.js#saveRanking | ✓ |

## فراخوان در پنل‌ها (3)
- support-panel.js › loadAi → `GET /support/ai/ranking`، `PUT /support/ai/ranking` (صفحه: support.html)
- support-panel.js › loadRank → `GET /support/ai/ranking` (صفحه: support.html)
- support-panel.js › saveRankUi → `PUT /support/ai/ranking` (صفحه: support.html)

جای راهنما در کد: support-panel.js › inp

## جدول‌ها
نوشتن: events، settings
خواندن: —

## تست‌ها (1)
- ranking.test.mjs

```
node --test backend/tamin-poshtibani/tests/ranking.test.mjs
```

## مرتبط
- support.ai — 🤖 کارشناس هوشمند
- support.usd — 💵 نرخ دلار
- support.sup — 🏷 تأمین‌کنندگان — رده و مشخصات
