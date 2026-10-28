# expert.smart — جستجوی هوشمند

بخش: پنل کارشناس | راهنما: help-content.js «expert.smart» | جریان کار: wf.request (گام 5)

> بالای تب، «🗂 تأمین‌کنندگان کشف‌شده» است: ۴۰ نفرِ برترِ ردنشدهٔ همین نوع قلم در تحقیقِ کشفِ تأمین‌کننده (مهر ۱۴۰۵)، با همهٔ اطلاعاتی که از هر کدام پیدا شده. زیرش جستجوی تازه در بازارهای انتخابی (ایران و همسایه‌ها، چین، امارات، ترکیه) با مدل زبانی و جستجوی وب. «اجرای جستجوی هوشمند» فقط برای قلمی باز است که کمتر از ۱۰ تأمین‌کنندهٔ کشف‌شده دارد (عدد را پنل پشتیبانی می‌گذارد).

محل در رابط:
- پنل کارشناس خرید › صفحهٔ درخواست › جستجوی هوشمند

## فایل‌های این قابلیت (صاحب)
- `worker/discovered.js` — SG_DEFAULT، SG_FA، SG_KEY، discoveredFor، gateFor، gateMsg، gateShort، phoneList، resetSgCache، saveSgCfg، sgAdmin، sgCfg
- `worker/discovery.js` — DISCOVERY_PROMPT_VERSION، LIMITS، MARKETS، MAX_MARKETS، MODEL، buildPrompt، fillTemplate، parseResult، runCost، runDiscovery، searchById، shapeResult، smartSearch

## مسیرهای سرور (2)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /search/smart` | w/api.js › route | w/discovered.js#discoveredFor، w/discovered.js#gateFor، w/discovery.js#MARKETS، w/discovery.js#MAX_MARKETS، w/records.js#itemSearches، w/records.js#phoneChannels | ✓ |
| `POST /search/smart` | w/api.js › route | w/discovered.js#gateFor، w/discovered.js#gateMsg، w/discovery.js#smartSearch، w/records.js#phoneChannels، w/records.js#withPhoneKeys | ✓ |

## فراخوان در پنل‌ها (2)
- expert.js › loadSmart → `GET /search/smart` (صفحه: expert.html)
- expert.js › runSmart → `POST /search/smart` (صفحه: expert.html)

جای راهنما در کد: expert.js › dcBlock، expert.js › vSmart

متغیرهای Worker (نام): ANTHROPIC_API_BASE، ANTHROPIC_API_KEY، DISCOVERY_MODEL، SMART_SEARCH_FILTER، WEB_FETCH_TOOL، WEB_SEARCH_TOOL

## جدول‌ها
نوشتن: alerts، events، items، settings، smart_searches
خواندن: assignments، cr_heads، cr_units، experts، phone_channels، sreg، sreg_x
هم‌نویس‌های همین جدول‌ها: engine.records، infra.core، manager.desk

## تست‌ها (3)
- ai-phase2.test.mjs
- discovered.test.mjs
- discovery.test.mjs

```
node --test backend/tamin-poshtibani/tests/ai-phase2.test.mjs backend/tamin-poshtibani/tests/discovered.test.mjs backend/tamin-poshtibani/tests/discovery.test.mjs
```

## مرتبط
- expert.picks — 🎯 فهرست دعوت
- expert.quotes — استعلامات
