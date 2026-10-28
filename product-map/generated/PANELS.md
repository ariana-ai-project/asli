# پنل‌ها و بخش‌ها ← قابلیت

> خودکار. منبع: PANELSِ product-map/taxonomy.mjs (درخت) + جای راهنمای هر قابلیت در کد (help.set / ui.info).
> `key` همان مقدارِ بخش در کدِ پنل است (S.tab، S.screen، S.aiView، …).

## درگاه تدارکات (p.portal)

صفحه: `frontend/tamin-poshtibani/index.html` | کاربر: همه

- انتخاب پنل (کارشناس، مدیر، پشتیبانی) → [infra.site](features/infra.site.md) — 3 مسیر، 4 تست

## پنل کارشناس خرید (p.expert)

صفحه: `frontend/tamin-poshtibani/expert.html` | کاربر: کارشناس خرید و کارشناس ارشد

- ورود کارشناس `login` → [login.expert](features/login.expert.md) — 1 مسیر، 2 تست
- کارتابل من `list` → [expert.tray](features/expert.tray.md) — 2 مسیر، 10 تست | کد: expert.js › vList
- صفحهٔ درخواست `detail` → [expert.detail](features/expert.detail.md) — 11 مسیر، 20 تست | کد: expert.js › vDetail
  - 🤖 نوار کارشناس هوشمند، 🚀 شروع و 👁 نظارت → [expert.ai](features/expert.ai.md) — 4 مسیر، 15 تست | کد: expert.js › vRateBar، expert.js › vAiBar، expert.js › vAiLocked، expert.js › vGuard، …
  - 📋 شرایط خرید هر قلم → [expert.terms](features/expert.terms.md) — 1 مسیر، 4 تست | کد: expert.js › row
  - 📘 سند راهبرد → [engine.strategy](features/engine.strategy.md) — 0 مسیر، 12 تست
  - بررسی سوابق `history` → [expert.history](features/expert.history.md) — 6 مسیر، 10 تست | کد: expert.js › vNorm، expert.js › msgFor
    - 🎯 فهرست دعوت → [expert.picks](features/expert.picks.md) — 2 مسیر، 16 تست | کد: expert.js › vPicks، expert.js › paint، expert.js › smPickNote
    - ✉️ قالب پیام → [expert.msgtpl](features/expert.msgtpl.md) — 4 مسیر، 2 تست
  - جستجوی هوشمند `smart` → [expert.smart](features/expert.smart.md) — 2 مسیر، 3 تست | کد: expert.js › dcBlock، expert.js › vSmart
  - استعلامات `quotes` → [expert.quotes](features/expert.quotes.md) — 10 مسیر، 11 تست | کد: expert.js › ro، expert.js › vGuard
  - جدول کمیسیون `comm` → [expert.comm](features/expert.comm.md) — 5 مسیر، 10 تست | کد: expert.js › vComm
    - 📨 فراخوان پیش‌فاکتور رسمی و 📦 بستهٔ کمیسیون → [expert.finalcall](features/expert.finalcall.md) — 7 مسیر، 2 تست | کد: expert.js › vFinalCall
  - نامهٔ کمیسیون `letter` → [expert.letter](features/expert.letter.md) — 8 مسیر، 6 تست | کد: expert.js › vLetterIntro، expert.js › vLetterAsk، expert.js › vLetterDone، expert.js › st
- تیم کارشناسی `team` → [expert.team](features/expert.team.md) — 3 مسیر، 2 تست | کد: expert.js › vTeam
- تنظیم اعلانات تیم `alerts` → [expert.alerts](features/expert.alerts.md) — 1 مسیر، 1 تست
- حساب من `account` → [expert.account](features/expert.account.md) — 3 مسیر، 4 تست | کد: expert.js › k، expert.js › vSupCfg
- راهنمای «روند کار روی یک درخواست» → [expert.flow](features/expert.flow.md) — 0 مسیر، 0 تست

## مکاتبات با تأمین‌کنندگان (p.corr)

صفحه: `frontend/tamin-poshtibani/correspond.html` | کاربر: کارشناس خرید

- ورود (همان ورود کارشناس) → [login.expert](features/login.expert.md) — 1 مسیر، 2 تست | کد: correspond.js › renderLogin
- درخواست‌ها `req` → [corr.main](features/corr.main.md) — 15 مسیر، 23 تست | کد: correspond.js › render، correspond.js › askNote، correspond.js › capNote، correspond.js › negHtml، …
- تأمین‌کنندگانِ یک درخواست `sup` → [corr.main](features/corr.main.md) — 15 مسیر، 23 تست | کد: correspond.js › render، correspond.js › askNote، correspond.js › capNote، correspond.js › negHtml، …
- گفت‌وگو `chat` → [corr.main](features/corr.main.md) — 15 مسیر، 23 تست | کد: correspond.js › render، correspond.js › askNote، correspond.js › capNote، correspond.js › negHtml، …
  - اقلام، پیش‌فاکتور و تأیید بسته `items` → [corr.main](features/corr.main.md) — 15 مسیر، 23 تست | کد: correspond.js › render، correspond.js › askNote، correspond.js › capNote، correspond.js › negHtml، …
  - ✉️ قالب پیام → [expert.msgtpl](features/expert.msgtpl.md) — 4 مسیر، 2 تست

## پنل مدیر تدارکات (میز ارجاع) (p.manager)

صفحه: `frontend/tamin-poshtibani/manager.html` | کاربر: مدیر تدارکات

- ورود مدیر → [login.manager](features/login.manager.md) — 0 مسیر، 0 تست | کد: manager.js › render
- میز ارجاع `desk` → [manager.desk](features/manager.desk.md) — 9 مسیر، 13 تست | کد: manager.js › grp، manager.js › render
  - بارگذاری درخواست‌های روزانه (اکسل) → [manager.import](features/manager.import.md) — 6 مسیر، 3 تست | کد: manager.js › grp، manager.js › render
- کارشناسان `experts` → [manager.experts](features/manager.experts.md) — 10 مسیر، 6 تست | کد: manager.js › grp، manager.js › k، manager.js › render
- تنظیم اعلانات `alerts` → [manager.alerts](features/manager.alerts.md) — 4 مسیر، 4 تست | کد: manager.js › grp، manager.js › knob، manager.js › render
- ارجاع هوشمند `asg` → [manager.asg](features/manager.asg.md) — 3 مسیر، 4 تست | کد: manager.js › grp، manager.js › knobL، manager.js › render
- مهلت هوشمند `dl` → [manager.dl](features/manager.dl.md) — 0 مسیر، 0 تست | کد: manager.js › grp، manager.js › vDeadline، manager.js › render
- گزارش‌ها `reports` → [manager.reports](features/manager.reports.md) — 8 مسیر، 2 تست | کد: manager.js › grp، manager.js › vReports، manager.js › render
- تصمیم‌ها و رویدادها `log` → [manager.log](features/manager.log.md) — 6 مسیر، 5 تست | کد: manager.js › grp، manager.js › decCard، manager.js › render

## پنل پشتیبانی تدارکات (p.support)

صفحه: `frontend/tamin-poshtibani/support.html` | کاربر: پشتیبانی (مالک سامانه)

- ورود پشتیبانی `login` → [login.support](features/login.support.md) — 5 مسیر، 38 تست | کد: support-panel.js › render
- درخواست‌ها `req` → [support.req](features/support.req.md) — 4 مسیر، 4 تست
- کارشناسان `exp` → [support.exp](features/support.exp.md) — 4 مسیر، 3 تست | کد: support-panel.js › inp
- مکاتبات `chat` → [support.chat](features/support.chat.md) — 3 مسیر، 5 تست | کد: support-panel.js › render
- تأیید کمیسیون `cm` → [support.cm](features/support.cm.md) — 4 مسیر، 3 تست | کد: support-panel.js › vCm
  - 📏 برچسب اندازه و حداقل استعلام → [support.size](features/support.size.md) — 2 مسیر، 1 تست | کد: support-panel.js › vSize
- 🔨 مناقصه `td` → [support.td](features/support.td.md) — 24 مسیر، 8 تست | کد: tender-admin.js › vWizard، tender-admin.js › linkHtml
- 🤖 کارشناس هوشمند `ai` → [support.ai](features/support.ai.md) — 17 مسیر، 8 تست | کد: expert-ai.js › vHead، expert-ai.js › vRuns، expert-ai.js › vRun، expert-ai.js › vCalls، …
  - 👥 کارشناسان و کارها (و داشبورد هر کارشناس) `list` → [support.ai](features/support.ai.md) — 17 مسیر، 8 تست | کد: expert-ai.js › vHead، expert-ai.js › vRuns، expert-ai.js › vRun، expert-ai.js › vCalls، …
  - ⏱ مهلتِ رسیدن به حد `rules` → [support.rules](features/support.rules.md) — 2 مسیر، 2 تست | کد: support-panel.js › vRules
  - 🏅 رتبه‌بندی و دعوت `rank` → [support.rank](features/support.rank.md) — 2 مسیر، 1 تست | کد: support-panel.js › inp
  - 💵 نرخ دلار `usd` → [support.usd](features/support.usd.md) — 3 مسیر، 2 تست
  - 🧭 حالت اقلام `md` → [support.md](features/support.md.md) — 3 مسیر، 3 تست
  - 🎛 کلیدها `sw` → [support.sw](features/support.sw.md) — 2 مسیر، 1 تست
    - 📨 فراخوان پیش‌فاکتور رسمی → [support.finalcall](features/support.finalcall.md) — 2 مسیر، 1 تست | کد: support-panel.js › num
    - 🔎 جستجوی هوشمند → [support.smartgate](features/support.smartgate.md) — 2 مسیر، 1 تست | کد: support-panel.js › vSg
- 📥 تحویل‌های هوشمند `dl` → [support.dl](features/support.dl.md) — 3 مسیر، 2 تست | کد: support-panel.js › vDlOne
- ⭐ ارزیابی ربات `fb` → [support.fb](features/support.fb.md) — 4 مسیر، 4 تست | کد: fb-admin.js › aiBox، fb-admin.js › boxesBox، fb-admin.js › c، fb-admin.js › view
- 📊 کارکرد کارشناسان `use` → [support.use](features/support.use.md) — 3 مسیر، 8 تست
- رخدادها `log` → [support.log](features/support.log.md) — 6 مسیر، 3 تست
- 🧩 تغییرات اقلام `chg` → [support.chg](features/support.chg.md) — 2 مسیر، 1 تست
- 🧭 استراتژی و دفتر `cr` → [support.cr](features/support.cr.md) — 28 مسیر، 9 تست | کد: cr-admin.js › inp
  - 🏷 تأمین‌کنندگان — رده و مشخصات → [support.sup](features/support.sup.md) — 5 مسیر، 3 تست | کد: cr-admin.js › vSup

## پنل تأمین‌کنندگان (p.supplier)

صفحه: `frontend/tamin-poshtibani/supplier.html` | کاربر: تأمین‌کننده (لینک پیامک یا بات)

- ورود با رمز پیامکی → [login.supplier](features/login.supplier.md) — 4 مسیر، 4 تست | کد: supplier.js › renderLogin
- پاسخ به استعلام: قیمت و شرایط هر قلم، گفت‌وگو → [sup.panel](features/sup.panel.md) — 22 مسیر، 25 تست | کد: supplier.js › renderAll

## مناقصهٔ خرید (p.tender)

صفحه: `frontend/tamin-poshtibani/tender.html` | کاربر: تأمین‌کنندهٔ دعوت‌شده

- ورود به مناقصه → [login.tender](features/login.tender.md) — 4 مسیر، 6 تست | کد: tender.js › renderLogin
- ثبت پیشنهاد و جدول زنده → [tender.page](features/tender.page.md) — 8 مسیر، 5 تست | کد: tender.js › renderMain

## راهنمای چاپی کارشناس (A4) (p.guide)

صفحه: `frontend/tamin-poshtibani/guide-a4.html` | کاربر: کارشناس خرید

- راهنمای چاپی → [infra.help](features/infra.help.md) — 0 مسیر، 3 تست

## در همهٔ پنل‌ها (p.all)

بخش‌های مشترکِ همهٔ صفحه‌ها | کاربر: همه

- «؟» کشوی راهنما → [infra.help](features/infra.help.md) — 0 مسیر، 3 تست
- 💬 دستیار سامانه → [bot.help](features/bot.help.md) — 5 مسیر، 3 تست
- 🔔 اعلان مرورگر → [notify.push](features/notify.push.md) — 5 مسیر، 4 تست
- نوار بالا، اعلان‌ها و کیت مشترک → [infra.ui](features/infra.ui.md) — 0 مسیر، 9 تست
