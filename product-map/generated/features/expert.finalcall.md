# expert.finalcall — 📨 فراخوانِ پیش‌فاکتورِ رسمی و 📦 بستهٔ کمیسیون

بخش: پنل کارشناس | راهنما: help-content.js «expert.finalcall» | جریان کار: wf.smart (گام 6)

> فقط درخواستِ هوشمند (درخواستِ دستی فراخوان ندارد): وقتی هر قلم به حداقلِ استعلامِ ردهٔ خودش رسید، به هر تأمین‌کنندهٔ تأییدنهایی پیامک می‌رود: «پیشنهاد شما با شمارهٔ … وارد کمیسیون معاملات شرکت می‌شود؛ تا [۲۴ ساعت بعد] فرصت دارید پیش‌فاکتورِ رسمی با حداقل ۲۴ ساعت اعتبار ارسال کنید» — با کمترین قیمتِ رسیده (اگر پشتیبانی روشن گذاشته). سرِ مهلت «📦 بستهٔ کمیسیون» بسته می‌شود و بعد جدول کمیسیون ساخته می‌شود.

محل در رابط:
- پنل کارشناس خرید › صفحهٔ درخواست › جدول کمیسیون › 📨 فراخوان پیش‌فاکتور رسمی و 📦 بستهٔ کمیسیون

## فایل‌های این قابلیت (صاحب)
- `worker/final-call.js` — FC_DDL، FC_DEFAULT، FC_FA، FC_KEY، callForThread، callGuard، callPhone، callSmsText، callText، callView، closeCall، closeEarly، fcAdmin، fcCfg، fcWhen، finalCallTick، lastCall، markSubmitted، …

## مسیرهای سرور (7)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `* /assignments/{}/final-call` | w/api.js › route | w/bundle.js#commissionGuard، w/bundle.js#missingText، w/final-call.js#callView، w/final-call.js#startCall، w/settings.js#getSettings | ✓ |
| `GET /assignments/{}/final-call/offpf/{}/file` | w/api.js › route | w/storage.js#storage | — |
| `GET /assignments/{}/final-call/package` | w/api.js › route | w/final-call.js#packageOf | ✓ |
| `POST /assignments/{}/final-call/close` | w/api.js › route | w/final-call.js#closeEarly | — |
| `POST /assignments/{}/final-call/offpf` | w/api.js › route | w/final-call.js#offpfIngest، w/storage.js#MAX_BYTES، w/storage.js#storage، w/storage.js#storageKey | — |
| `POST /assignments/{}/final-call/offpf/{}/decide` | w/api.js › route | w/final-call.js#callView، w/final-call.js#offpfDecide | ✓ |
| `POST /assignments/{}/final-call/phone` | w/api.js › route | w/final-call.js#callPhone | ✓ |

## فراخوان در پنل‌ها (0)
—

جای راهنما در کد: expert.js › vFinalCall

متغیرهای Worker (نام): TG_BOT_TOKEN

## جدول‌ها
نوشتن: ai_runs، commission_packages، events، experts، final_call_sups، final_calls، offpf، quote_edits، quotes، settings، sp_lines، sp_msgs، sp_sms، sp_threads
خواندن: assignments، items، requests، sp_phones، sp_suppliers
هم‌نویس‌های همین جدول‌ها: bot.team، corr.main، expert.quotes، infra.core، login.supplier، sup.panel، support.cm

## تست‌ها (2)
- execution-ready.test.mjs
- final-call.test.mjs

```
node --test backend/tamin-poshtibani/tests/execution-ready.test.mjs backend/tamin-poshtibani/tests/final-call.test.mjs
```

## مرتبط
- expert.comm — جدول کمیسیون
- expert.quotes — استعلامات
- expert.terms — 📋 شرایط خرید هر قلم
