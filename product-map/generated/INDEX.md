# نقشهٔ محصول — فهرست

> خودکار است؛ دستی ویرایش نکنید. منبع: `product-map/taxonomy.mjs` + کد. بازسازی: `node scripts/map/build.mjs`.
> اثرِ یک تغییر: `node scripts/map/impact.mjs <فایل|فایل#تابع|مسیر|جدول|قابلیت>` یا `--changed`. راهنمای کامل: `product-map/README.md`.

آمار: 77 قابلیت در 13 بخش | 156 فایل | 348 مسیر (263 در تست صدا زده می‌شوند) | 363 فراخوان پنل | 116 جدول | 87 تست

نقشه‌های دیگر: [PANELS.md](PANELS.md) پنل ← تب ← قابلیت | [BOTS.md](BOTS.md) دستور و دکمهٔ بات‌ها، Cron | کارتِ هر جریان: workflows/<شناسه>.md

## جریان‌های کار

### [wf.request](workflows/wf.request.md) — چرخهٔ درخواست خرید (دستی)
1. (مدیر) بارگذاری اکسل درخواست‌ها → manager.import
2. (مدیر) ارجاع به کارشناس و مهلت (دستی یا هوشمند) → manager.desk، manager.asg، manager.dl
3. (کارشناس) مشاهده در کارتابل → expert.tray، expert.detail
4. (کارشناس) تأیید ساختار قلم و بررسی سوابق → expert.detail، engine.structure، expert.history
5. (کارشناس) جستجوی هوشمند تأمین‌کنندهٔ تازه → expert.smart، expert.msgtpl
6. (کارشناس ↔ تأمین‌کننده) استعلام و مکاتبه؛ پاسخ تأمین‌کننده در پنل یا بات → corr.main، login.supplier، sup.panel، bot.sp، expert.terms
7. (کارشناس) پیش‌فاکتور و استعلامات → expert.quotes
8. (کارشناس) جدول کمیسیون و نامهٔ کمیسیون → expert.comm، expert.letter
9. (پشتیبانی) تأیید کمیسیون و خاتمه → support.cm، expert.detail

### [wf.smart](workflows/wf.smart.md) — درخواست هوشمند (کارشناس هوشمند، کارشناس ناظر)
1. (پشتیبانی) روشن کردن 🤖 برای کارشناس و تنظیم‌ها → support.ai، support.md، support.sw، support.rules، support.rank
2. (کارشناس) تأیید ساختار و بررسی سوابق → expert.detail، expert.history
3. (کارشناس) 🎯 فهرست دعوت و 🚀 شروع → expert.picks، expert.ai، engine.strategy
4. (کارشناس هوشمند ↔ تأمین‌کننده) مذاکرهٔ خودکار با تأمین‌کنندگان → engine.ai، sup.panel، bot.sp
5. (کارشناس) 👁 نظارت کارشناس و پیشنهادها → expert.ai، corr.main
6. (کارشناس هوشمند) 📨 فراخوان پیش‌فاکتور رسمی → expert.finalcall، support.finalcall
7. (کارشناس هوشمند ← پشتیبانی) جدول کمیسیون، تحویل و تأیید → expert.comm، support.dl، support.cm

### [wf.tender](workflows/wf.tender.md) — مناقصهٔ برخط (معکوس)
1. (مدیر یا پشتیبانی) ارجاع درخواست به مناقصه → manager.desk، support.td
2. (پشتیبانی) ساخت، زمان‌بندی و دعوت با پیامک → support.td، engine.tender، notify.sms
3. (تأمین‌کننده) ورود تأمین‌کننده با رمز پیامکی → login.tender
4. (تأمین‌کننده) ثبت پیشنهادهای کاهشی → tender.page، engine.tender
5. (پشتیبانی ← کارشناس) پایان، نتیجه و برگشت به کمیسیون → support.td، expert.comm

### [wf.supplier](workflows/wf.supplier.md) — پاسخ تأمین‌کننده به استعلام
1. (کارشناس) ارسال استعلام با پیامک و لینک بات → corr.main، notify.sms
2. (تأمین‌کننده) ورود با رمز پیامکی یا از بات → login.supplier، bot.sp
3. (تأمین‌کننده) پر کردن قیمت و شرایط هر قلم و ارسال → sup.panel، expert.terms
4. (کارشناس) تصمیم کارشناس روی بسته‌ها → corr.main، expert.quotes

## قابلیت‌ها

### ورود (login)

| شناسه | عنوان | فایل‌های صاحب | مسیر (بی‌تست) | تست |
|---|---|---|---|---|
| [login.expert](features/login.expert.md) | ورود کارشناس | — | 1 | 2 |
| [login.manager](features/login.manager.md) | ورود مدیر تدارکات | — | 0 | 0 |
| [login.supplier](features/login.supplier.md) | ورود به پنل تأمین‌کنندگان | — | 4 (1) | 4 |
| [login.support](features/login.support.md) | ورود پشتیبانی | — | 5 | 39 |
| [login.tender](features/login.tender.md) | ورود به مناقصه | — | 4 (1) | 6 |

### پنل کارشناس (expert)

| شناسه | عنوان | فایل‌های صاحب | مسیر (بی‌تست) | تست |
|---|---|---|---|---|
| [expert.account](features/expert.account.md) | حساب من | — | 3 | 4 |
| [expert.ai](features/expert.ai.md) | کارشناس هوشمند | w/first-msg.js | 4 | 15 |
| [expert.alerts](features/expert.alerts.md) | تنظیم اعلانات تیم | — | 1 | 1 |
| [expert.app](features/expert.app.md) | پوستهٔ پنل کارشناس | expert.html، expert.js، manifest-expert.webmanifest | 0 | 3 |
| [expert.comm](features/expert.comm.md) | جدول کمیسیون | w/bundle.js، w/sheets.js | 5 (2) | 10 |
| [expert.detail](features/expert.detail.md) | صفحهٔ درخواست | — | 11 (2) | 20 |
| [expert.finalcall](features/expert.finalcall.md) | 📨 فراخوانِ پیش‌فاکتورِ رسمی و 📦 بستهٔ کمیسیون | w/final-call.js | 7 (3) | 2 |
| [expert.flow](features/expert.flow.md) | روند کار روی یک درخواست | — | 0 | 0 |
| [expert.history](features/expert.history.md) | بررسی سوابق | w/history.js | 6 (3) | 10 |
| [expert.letter](features/expert.letter.md) | نامهٔ کمیسیون | w/letter.js | 8 (4) | 6 |
| [expert.msgtpl](features/expert.msgtpl.md) | قالب‌های پیام | msg-fill.mjs، w/templates.js | 4 | 2 |
| [expert.picks](features/expert.picks.md) | 🎯 فهرست دعوت | w/ai-picks.js | 2 | 16 |
| [expert.quotes](features/expert.quotes.md) | استعلامات | w/extract.js، w/proforma.js، w/quote-rules.js، w/quote-src.js | 10 (4) | 11 |
| [expert.smart](features/expert.smart.md) | جستجوی هوشمند | w/discovered.js، w/discovery.js | 2 | 3 |
| [expert.team](features/expert.team.md) | تیم کارشناسی | w/team.js | 3 (2) | 2 |
| [expert.terms](features/expert.terms.md) | 📋 شرایط خرید هر قلم | w/terms-locks.js | 1 | 4 |
| [expert.tray](features/expert.tray.md) | کارتابل من | — | 2 (1) | 10 |

### پنل مدیر (manager)

| شناسه | عنوان | فایل‌های صاحب | مسیر (بی‌تست) | تست |
|---|---|---|---|---|
| [manager.alerts](features/manager.alerts.md) | تنظیم اعلانات | — | 4 (2) | 4 |
| [manager.app](features/manager.app.md) | پوستهٔ پنل مدیر | manager.html، manager.js، manifest-manager.webmanifest، mgr.css | 0 | 1 |
| [manager.asg](features/manager.asg.md) | ارجاع هوشمند | assign-rules.mjs | 3 | 4 |
| [manager.desk](features/manager.desk.md) | میز ارجاع | w/assign.js، w/manager.js | 9 (2) | 13 |
| [manager.dl](features/manager.dl.md) | مهلت هوشمند | — | 0 | 0 |
| [manager.experts](features/manager.experts.md) | کارشناسان | — | 10 (2) | 6 |
| [manager.import](features/manager.import.md) | بارگذاری اکسل درخواست‌ها | import.js | 6 (5) | 3 |
| [manager.log](features/manager.log.md) | تصمیم‌ها و رویدادها | w/decisions.js | 6 | 5 |
| [manager.reports](features/manager.reports.md) | گزارش‌ها | w/reports.js | 8 (8) | 2 |

### مکاتبات (corr)

| شناسه | عنوان | فایل‌های صاحب | مسیر (بی‌تست) | تست |
|---|---|---|---|---|
| [corr.main](features/corr.main.md) | مکاتبات با تأمین‌کنندگان | correspond.html، correspond.js، ph-chat.js، ph-props.js (+1) | 15 | 23 |

### پنل تأمین‌کننده (sup)

| شناسه | عنوان | فایل‌های صاحب | مسیر (بی‌تست) | تست |
|---|---|---|---|---|
| [sup.panel](features/sup.panel.md) | پاسخ به استعلام | sp.css، sup.css، supplier.html، supplier.js (+4) | 22 (3) | 25 |

### پنل پشتیبانی (support)

| شناسه | عنوان | فایل‌های صاحب | مسیر (بی‌تست) | تست |
|---|---|---|---|---|
| [support.ai](features/support.ai.md) | 🤖 کارشناس هوشمند | expert-ai.js | 17 | 8 |
| [support.app](features/support.app.md) | پوستهٔ پنل پشتیبانی | manifest-support.webmanifest، support-panel.js، support.html، w/support.js | 0 | 0 |
| [support.chat](features/support.chat.md) | مکاتبات | — | 3 (1) | 5 |
| [support.chg](features/support.chg.md) | 🧩 تغییرات اقلام | — | 2 | 1 |
| [support.cm](features/support.cm.md) | تأیید کمیسیون | cm-result.js، w/commission-result.js | 4 | 3 |
| [support.cr](features/support.cr.md) | 🧭 استراتژی و دفتر | cr-admin.js، w/cr-api.js، w/sreg.js | 28 (3) | 9 |
| [support.dl](features/support.dl.md) | 📥 تحویل‌های هوشمند | — | 3 | 2 |
| [support.exp](features/support.exp.md) | کارشناسان | — | 4 | 3 |
| [support.fb](features/support.fb.md) | ⭐ ارزیابی ربات | fb-admin.js، w/ai-feedback.js | 4 | 4 |
| [support.finalcall](features/support.finalcall.md) | 📨 فراخوانِ پیش‌فاکتورِ رسمی | — | 2 | 1 |
| [support.log](features/support.log.md) | گزارش رخدادها | — | 7 (1) | 4 |
| [support.md](features/support.md.md) | 🧭 حالت اقلام | w/ai-modes.js | 3 | 3 |
| [support.rank](features/support.rank.md) | 🏅 رتبه‌بندی و دعوت | w/ranking.js | 2 | 1 |
| [support.req](features/support.req.md) | درخواست‌ها | — | 4 | 4 |
| [support.rules](features/support.rules.md) | ⏱ مهلتِ رسیدن به حد | w/ai-rules.js | 2 | 2 |
| [support.size](features/support.size.md) | 📏 برچسبِ اندازهٔ درخواست | w/size.js | 2 | 1 |
| [support.smartgate](features/support.smartgate.md) | 🔎 جستجوی هوشمند | — | 2 | 1 |
| [support.sup](features/support.sup.md) | 🏷 تأمین‌کنندگان — رده و مشخصات | sup-profile.js، w/supplier-over.js | 5 | 3 |
| [support.sw](features/support.sw.md) | 🎛 کلیدها | w/switches.js | 2 | 1 |
| [support.td](features/support.td.md) | 🔨 مناقصه | tender-admin.js | 24 (4) | 8 |
| [support.usd](features/support.usd.md) | 💵 نرخ دلار | w/usd.js | 3 | 2 |
| [support.use](features/support.use.md) | 📊 کارکرد کارشناسان | w/usage-report.js | 3 | 8 |

### مناقصه (tender)

| شناسه | عنوان | فایل‌های صاحب | مسیر (بی‌تست) | تست |
|---|---|---|---|---|
| [tender.page](features/tender.page.md) | مناقصهٔ خرید | tender-ui.js، tender.css، tender.html، tender.js | 8 (2) | 5 |

### ربات‌های تلگرام (bot)

| شناسه | عنوان | فایل‌های صاحب | مسیر (بی‌تست) | تست |
|---|---|---|---|---|
| [bot.help](features/bot.help.md) | دستیار سامانه | w/help-bot.js، w/help-knowledge.js | 5 | 3 |
| [bot.sp](features/bot.sp.md) | ربات تأمین‌کنندگان | w/sp-bot.js، w/sp-push.js، w/sp-voice.js، w/sp-voicemode.js | 1 (1) | 4 |
| [bot.team](features/bot.team.md) | ربات کارشناسان و تیم | w/bot.js، w/tg-nav.js | 8 (8) | 6 |
| [bot.voice](features/bot.voice.md) | ربات صدا به متن | w/stt.js، w/voice-bot.js، w/voice-core.js | 2 | 2 |

### موتورهای مشترک سرور (engine)

| شناسه | عنوان | فایل‌های صاحب | مسیر (بی‌تست) | تست |
|---|---|---|---|---|
| [engine.ai](features/engine.ai.md) | موتور کارشناس هوشمند | w/ai-agent.js، w/ai-fetch.js، w/ai-lock.js، w/ai-md.js (+5) | 0 | 21 |
| [engine.catalog](features/engine.catalog.md) | کاتالوگ و قواعد یکسان‌سازی | catalog-canon.mjs، catalog-head-rules.mjs، catalog-import.js، catalog-rules.mjs (+2) | 3 (3) | 17 |
| [engine.records](features/engine.records.md) | ثبت سوابق جستجو، کانال‌ها و کمیسیون | w/records.js | 0 | 1 |
| [engine.strategy](features/engine.strategy.md) | موتور راهبرد خرید (CR-02) | strategy-view.js، w/cr-data.js، w/cr-engine.js، w/critique.js (+13) | 0 | 12 |
| [engine.structure](features/engine.structure.md) | ساختار و یکسان‌سازی اقلام | w/estimate.js، w/normalize.js، w/structure.js | 0 | 5 |
| [engine.tender](features/engine.tender.md) | موتور مناقصه | w/tender-core.js، w/tender.js | 0 | 2 |

### اعلان‌ها (notify)

| شناسه | عنوان | فایل‌های صاحب | مسیر (بی‌تست) | تست |
|---|---|---|---|---|
| [notify.alarms](features/notify.alarms.md) | هشدارها | w/alarms.js | 0 | 1 |
| [notify.push](features/notify.push.md) | اعلان مرورگر (Push) | push-sw.js، w/push.js | 5 | 4 |
| [notify.sms](features/notify.sms.md) | پیامک | w/relay.js، w/sms.js | 4 | 3 |
| [notify.telegram](features/notify.telegram.md) | ارسال تلگرام و صف پیام | w/queue.js، w/telegram.js | 1 (1) | 1 |

### سندسازی (Word، Excel) (doc)

| شناسه | عنوان | فایل‌های صاحب | مسیر (بی‌تست) | تست |
|---|---|---|---|---|
| [doc.office](features/doc.office.md) | ساخت Word و Excel | vendor/xlsx.full.min.js، w/docx.js، w/logo.js، w/pfdoc.js (+3) | 0 | 5 |

### زیرساخت (infra)

| شناسه | عنوان | فایل‌های صاحب | مسیر (بی‌تست) | تست |
|---|---|---|---|---|
| [infra.auth](features/infra.auth.md) | ورود با کد و تلگرام | w/auth-guard.js، w/tg-auth.js | 0 | 1 |
| [infra.core](features/infra.core.md) | مسیریاب و هستهٔ سرور | worker.js، w/api.js، w/d1-guard.js، w/http.js (+4) | 4 (4) | 9 |
| [infra.help](features/infra.help.md) | متن‌های راهنما | guide-a4.html، help-content.js، help-flows.js | 0 | 3 |
| [infra.site](features/infra.site.md) | دروازهٔ سایت | index.html، w/site.js | 3 | 4 |
| [infra.ui](features/infra.ui.md) | کیت رابط کاربری مشترک | config.js، panel.css، shared.js، ui-kit.js (+3) | 0 | 9 |

### سامانهٔ حقوقی (محصول جدا) (legal)

| شناسه | عنوان | فایل‌های صاحب | مسیر (بی‌تست) | تست |
|---|---|---|---|---|
| [legal.app](features/legal.app.md) | سامانهٔ حقوقی | w/legal-prompts.js، w/legal.js | 12 (12) | 0 |

فهرست‌های دیگر: [FILES.md](FILES.md) فایل ← قابلیت | [ENDPOINTS.md](ENDPOINTS.md) مسیر ← قابلیت | [TABLES.md](TABLES.md) جدول ← قابلیت | graph.json همه برای ماشین
