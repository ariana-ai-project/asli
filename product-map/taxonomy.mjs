/* ============================================================
   نقشهٔ محصول — لایهٔ دست‌نویس (طبقه‌بندی)
   • هر قابلیت یک شناسهٔ ثابت دارد. شناسهٔ قابلیت‌های رابط کاربری همان کلیدِ راهنماست
     (frontend/tamin-poshtibani/help-content.js، مثل expert.smart)؛ عنوان و توضیحشان از همان‌جا خوانده می‌شود.
   • files: فایل‌هایی که «صاحبشان» این قابلیت است — هر فایل فقط یک صاحب دارد (الگوی * مجاز است).
   • endpoints: مسیرهای سرور که این قابلیت پاسخ‌گویشان است: «METHOD /path» یا «/path»؛ «*» در انتها یعنی پیشوند؛ «{}» یعنی بخش متغیر.
   • بقیه (تابع‌ها، فراخوان‌های پنل، جدول‌ها، تست‌ها، وابستگی‌ها) را scripts/map/build.mjs از خودِ کد درمی‌آورد.
   بعد از هر تغییر: node scripts/map/build.mjs — و اگر مسیر/فایل تازه‌ای ساختید، همین‌جا صاحبش را بنویسید.
   ============================================================ */

export const AREAS = [
  { id: "login", title: "ورود" },
  { id: "expert", title: "پنل کارشناس" },
  { id: "manager", title: "پنل مدیر" },
  { id: "corr", title: "مکاتبات" },
  { id: "sup", title: "پنل تأمین‌کننده" },
  { id: "support", title: "پنل پشتیبانی" },
  { id: "tender", title: "مناقصه" },
  { id: "bot", title: "ربات‌های تلگرام" },
  { id: "engine", title: "موتورهای مشترک سرور" },
  { id: "notify", title: "اعلان‌ها" },
  { id: "doc", title: "سندسازی (Word، Excel)" },
  { id: "infra", title: "زیرساخت" },
  { id: "legal", title: "سامانهٔ حقوقی (محصول جدا)" },
];

const F = "frontend/tamin-poshtibani/";
const W = "worker/";

export const FEATURES = [
  /* ---------------- ورود ---------------- */
  { id: "login.expert", endpoints: ["POST /login"] },
  { id: "login.manager" },
  { id: "login.support", endpoints: ["/support/status", "/support/setup", "/support/login", "/support/reset", "/support/pass"] },
  { id: "login.supplier", endpoints: ["/sp/info", "/sp/login", "/sp/resend", "/sp/logout"] },
  { id: "login.tender", endpoints: ["/tender/{}/info", "/tender/{}/pass", "/tender/{}/login", "/tender/{}/logout"] },

  /* ---------------- پنل کارشناس ---------------- */
  { id: "expert.app", title: "پوستهٔ پنل کارشناس", desc: "صفحه، ناوبری تب‌ها و رسمِ همهٔ تب‌های پنل کارشناس (یک فایل برای همهٔ تب‌ها).",
    files: [`${F}expert.html`, `${F}expert.js`, `${F}manifest-expert.webmanifest`] },
  { id: "expert.tray", endpoints: ["GET /tray", "POST /assignments/{}/viewed"] },
  { id: "expert.flow" },
  { id: "expert.detail", endpoints: ["GET /assignments/{}", "PUT /assignments/{}/notes", "PUT /requests/{}/head", "POST /items/{}/progress", "POST /assignments/{}/decision",
    "POST /items/{}/normalize", "/items/{}/norm", "POST /items/{}/estimate", "DELETE /items/{}/edit", "PUT /items/{}/locks", "GET /catalog/heads"] },
  { id: "expert.terms", files: [`${W}terms-locks.js`], endpoints: ["PUT /items/{}/terms"] },
  { id: "expert.history", files: [`${W}history.js`], endpoints: ["/suppliers/history*", "GET /history/status", "/import/history"] },
  { id: "expert.smart", files: [`${W}discovered.js`, `${W}discovery.js`], endpoints: ["/search/smart"] },
  { id: "expert.picks", files: [`${W}ai-picks.js`], endpoints: ["/items/{}/picks", "GET /items/{}/invite-preview"] },
  { id: "expert.ai", files: [`${W}first-msg.js`], endpoints: ["POST /items/{}/ai-start", "/items/{}/first-msg", "POST /assignments/{}/handoff", "/me/supervise"] },
  { id: "expert.quotes", files: [`${W}proforma.js`, `${W}extract.js`, `${W}quote-src.js`, `${W}quote-rules.js`], endpoints: ["/quotes*", "/proformas*", "/phones/channels"] },
  { id: "expert.comm", files: [`${W}bundle.js`, `${W}sheets.js`], endpoints: ["POST /assignments/{}/commission", "POST /items/{}/commission", "GET /assignments/{}/sheet/*", "GET /assignments/{}/bundle"] },
  { id: "expert.finalcall", files: [`${W}final-call.js`], endpoints: ["/assignments/{}/final-call*"] },
  { id: "expert.letter", files: [`${W}letter.js`], endpoints: ["/assignments/{}/letter*", "GET /support/assignments/{}/letter/file"] },
  { id: "expert.team", files: [`${W}team.js`], endpoints: ["GET /team", "POST /team/delegate", "POST /tg/team-link"] },
  { id: "expert.alerts", endpoints: ["PUT /me/alerts"] },
  { id: "expert.account", endpoints: ["/me", "PUT /me/code", "POST /me/activity"] },
  { id: "expert.msgtpl", title: "قالب‌های پیام", desc: "متن آمادهٔ پیام به تأمین‌کننده (✉️) با جای‌گذاری نام و اقلام؛ در جستجوی هوشمند، بررسی سوابق و مکاتبات.",
    files: [`${W}templates.js`, `${F}msg-fill.mjs`], endpoints: ["/templates*"] },

  /* ---------------- پنل مدیر ---------------- */
  { id: "manager.app", title: "پوستهٔ پنل مدیر", desc: "صفحه و تب‌های پنل مدیر تدارکات.", files: [`${F}manager.html`, `${F}manager.js`, `${F}mgr.css`, `${F}manifest-manager.webmanifest`] },
  { id: "manager.desk", files: [`${W}assign.js`, `${W}manager.js`],
    endpoints: ["GET /desk", "POST /assign", "POST /assign/days", "POST /reassign", "POST /unassign", "POST /items/state", "POST /requests/delete", "POST /tender-refer", "POST /tender-unrefer"] },
  { id: "manager.import", title: "بارگذاری اکسل درخواست‌ها", desc: "خواندن فایل خروجی راهکاران در مرورگر، نمایش تعارض‌ها و ثبت درخواست‌ها و اقلام.",
    files: [`${F}import.js`], endpoints: ["/import/begin", "/import/chunk", "/import/finish", "/import/apply", "GET /imports", "POST /estimate/run"] },
  { id: "manager.experts", endpoints: ["/experts*", "/scores", "GET /axes", "GET /workload"] },
  { id: "manager.alerts", endpoints: ["/settings", "/holidays"] },
  { id: "manager.asg", files: [`${F}assign-rules.mjs`], endpoints: ["POST /assign/ai", "POST /assign/ai-req", "POST /dispatch"] },
  { id: "manager.dl" },
  { id: "manager.reports", files: [`${W}reports.js`], endpoints: ["/reports/*"] },
  { id: "manager.log", files: [`${W}decisions.js`], endpoints: ["/decisions*", "GET /events", "/alarms*"] },

  /* ---------------- مکاتبات و تأمین‌کننده ---------------- */
  { id: "corr.main", files: [`${F}correspond.html`, `${F}correspond.js`, `${F}ph-chat.js`, `${F}ph-props.js`, `${F}phone-frame.svg`], endpoints: ["/sp/x/*"] },
  { id: "sup.panel", files: [`${F}supplier.html`, `${F}supplier.js`, `${F}sp.css`, `${F}sup.css`, `${W}sp-api.js`, `${W}sp-core.js`, `${W}sp-ai.js`, `${W}sp-sms.js`], endpoints: ["/sp/*"] },

  /* ---------------- پنل پشتیبانی ---------------- */
  { id: "support.app", title: "پوستهٔ پنل پشتیبانی", desc: "صفحه، ورود و تب‌های پنل پشتیبانی؛ همهٔ مسیرهایش با پیشوند /support.",
    files: [`${F}support.html`, `${F}support-panel.js`, `${F}manifest-support.webmanifest`, `${W}support.js`] },
  { id: "support.req", endpoints: ["GET /support/desk", "GET /support/assignments/{}", "GET /support/assignments/{}/sheet/*"] },
  { id: "support.exp", endpoints: ["/support/experts*", "/support/codes"] },
  { id: "support.chg", endpoints: ["/support/changes*"] },
  { id: "support.ai", files: [`${F}expert-ai.js`], endpoints: ["/support/ai/{}/*", "GET /support/ai/experts"] },
  { id: "support.rules", files: [`${W}ai-rules.js`], endpoints: ["/support/ai/rules"] },
  { id: "support.size", files: [`${W}size.js`], endpoints: ["/support/size-rules"] },
  { id: "support.rank", files: [`${W}ranking.js`], endpoints: ["/support/ai/ranking"] },
  { id: "support.usd", files: [`${W}usd.js`], endpoints: ["/support/usd*"] },
  { id: "support.md", files: [`${W}ai-modes.js`], endpoints: ["/support/ai/modes", "GET /support/ai/heads"] },
  { id: "support.sw", files: [`${W}switches.js`], endpoints: ["/support/ai/switches"] },
  { id: "support.smartgate", endpoints: ["/support/ai/smart-gate"] },
  { id: "support.finalcall", endpoints: ["/support/ai/final-call"] },
  { id: "support.td", files: [`${F}tender-admin.js`], endpoints: ["/support/tender*"] },
  { id: "support.dl", endpoints: ["/support/ai/deliveries*"] },
  { id: "support.cr", files: [`${F}cr-admin.js`, `${W}cr-api.js`, `${W}sreg.js`], endpoints: ["/support/cr/*", "/support/strategy/*", "/support/graph", "/support/sreg/*", "/cr/*", "/sreg/*"] },
  { id: "support.sup", files: [`${F}sup-profile.js`, `${W}supplier-over.js`], endpoints: ["/support/suppliers", "/support/supplier"] },
  { id: "support.fb", files: [`${F}fb-admin.js`, `${W}ai-feedback.js`], endpoints: ["/support/ai/feedback*"] },
  { id: "support.chat", endpoints: ["/support/threads*", "/support/msg/*"] },
  { id: "support.use", files: [`${W}usage-report.js`], endpoints: ["/support/usage*", "/support/activity"] },
  { id: "support.log", endpoints: ["/support/alarms*", "/support/alert-contacts", "/support/sms*"] },
  { id: "support.cm", files: [`${F}cm-result.js`, `${W}commission-result.js`], endpoints: ["/support/commission*"] },

  /* ---------------- مناقصه ---------------- */
  { id: "tender.page", files: [`${F}tender.html`, `${F}tender.js`, `${F}tender.css`, `${F}tender-ui.js`], endpoints: ["/tender/{}/*", "GET /tender/market"] },

  /* ---------------- ربات‌ها ---------------- */
  { id: "bot.team", title: "ربات کارشناسان و تیم", desc: "بات تلگرامِ کارشناسان و سرگروه‌ها: اعلان ارجاع، منو، مینی‌اپ و صف پیام.",
    files: [`${W}bot.js`, `${W}tg-nav.js`], endpoints: ["POST /tg/webhook", "POST /tg/team-webhook", "/tg/link", "/tg/status", "/tg/setup", "/tg/flows", "POST /tg/tick"] },
  { id: "bot.sp", title: "ربات تأمین‌کنندگان", desc: "بات تلگرامِ تأمین‌کنندگان (SP-bot): همان پنل تأمین‌کننده در تلگرام، منوها، حالت صدا.",
    files: [`${W}sp-bot.js`, `${W}sp-push.js`, `${W}sp-voice.js`, `${W}sp-voicemode.js`], endpoints: ["POST /tg/sp-webhook"] },
  { id: "bot.voice", title: "ربات صدا به متن", desc: "بات جدای تبدیل پیام صوتی به متن و موتور مشترک تبدیل صدا (برای نامهٔ کمیسیون هم).",
    files: [`${W}voice-bot.js`, `${W}voice-core.js`, `${W}stt.js`], endpoints: ["POST /tg/vb-webhook", "POST /voice/reset"] },
  { id: "bot.help", title: "دستیار سامانه", desc: "گفت‌وگوی راهنما در همهٔ پنل‌ها، با دانشِ ساخته‌شده از متن‌های راهنما.",
    files: [`${W}help-bot.js`, `${W}help-knowledge.js`], endpoints: ["/help/chat*"] },

  /* ---------------- موتورهای مشترک ---------------- */
  { id: "engine.ai", title: "موتور کارشناس هوشمند", desc: "مذاکرهٔ خودکار با تأمین‌کنندگان، قفل‌ها، پیشنهادهای نظارتی، تحویل به کارشناس و هزینهٔ مدل.",
    files: [`${W}ai-agent.js`, `${W}ai-lock.js`, `${W}ai-md.js`, `${W}ai-prompts.js`, `${W}ai-fetch.js`, `${W}ai-rates.js`, `${W}ai-supervise.js`, `${W}ai-takeover.js`, `${W}neg-view.js`] },
  { id: "engine.strategy", title: "موتور راهبرد خرید (CR-02)", desc: "راهبرد هر نوع قلم، سند راهبرد، نوبت‌های مذاکره و داده‌های تحقیق CR-02.",
    files: [`${W}strategy/*.js`, `${W}cr-engine.js`, `${W}cr-data.js`, `${W}turn-engine.js`, `${W}critique.js`, `${W}strategy-doc.js`, `${F}strategy-view.js`] },
  { id: "engine.structure", title: "ساختار و یکسان‌سازی اقلام", desc: "نوع قلم، لایه‌ها، قفل‌ها، یکسان‌سازی و برآورد قیمت هر قلم.",
    files: [`${W}normalize.js`, `${W}structure.js`, `${W}estimate.js`] },
  { id: "engine.catalog", title: "کاتالوگ و قواعد یکسان‌سازی", desc: "کاتالوگ اقلام و اصناف، قواعد نوع قلم و واحدها (مشترک مرورگر و سرور).",
    files: [`${W}catalog.js`, `${F}catalog-*.mjs`, `${F}catalog-import.js`], endpoints: ["POST /catalog/begin", "POST /catalog/chunk", "POST /catalog/finish"] },
  { id: "engine.records", title: "ثبت سوابق جستجو، کانال‌ها و کمیسیون", desc: "دستورهای ثبتِ تأمین‌کنندگانِ یافته، شماره‌ها و کانال‌ها، رخداد ارجاع و رکورد کمیسیون.",
    files: [`${W}records.js`] },
  { id: "engine.tender", title: "موتور مناقصه", desc: "ساخت، زمان‌بندی، دعوت، پیشنهاد و پایانِ مناقصهٔ برخط.", files: [`${W}tender.js`, `${W}tender-core.js`] },

  /* ---------------- اعلان‌ها ---------------- */
  { id: "notify.push", title: "اعلان مرورگر (Push)", files: [`${W}push.js`, `${F}push-sw.js`], endpoints: ["/push/*"] },
  { id: "notify.sms", title: "پیامک", files: [`${W}sms.js`] },
  { id: "notify.alarms", title: "هشدارها", files: [`${W}alarms.js`] },
  { id: "notify.telegram", title: "ارسال تلگرام و صف پیام", files: [`${W}telegram.js`, `${W}queue.js`], endpoints: ["/notify/telegram"] },

  /* ---------------- سندسازی ---------------- */
  { id: "doc.office", title: "ساخت Word و Excel", desc: "سازندهٔ docx و xlsx بی وابستگی، برگ درخواست، پیش‌فاکتور، لوگو.",
    files: [`${W}docx.js`, `${W}xlsx.js`, `${W}xlsxbook.js`, `${W}pfdoc.js`, `${W}reqdoc.js`, `${W}logo.js`, `${F}vendor/*`] },

  /* ---------------- زیرساخت ---------------- */
  { id: "infra.core", title: "مسیریاب و هستهٔ سرور", desc: "worker.js، مسیریاب api.js (ensureSchema و مهاجرت‌ها)، خطا، زمان کاری، تنظیمات، ذخیره‌سازی و نگهبان D1.",
    files: ["worker.js", `${W}api.js`, `${W}http.js`, `${W}time.js`, `${W}settings.js`, `${W}storage.js`, `${W}d1-guard.js`, `${W}selftest.js`],
    endpoints: ["/health", "GET /selftest", "/reviews", "/notify/email"] },
  { id: "infra.auth", title: "ورود با کد و تلگرام", desc: "محدودیت تلاش ناموفق و قفل، شناسایی از مینی‌اپ تلگرام.", files: [`${W}auth-guard.js`, `${W}tg-auth.js`] },
  { id: "infra.site", title: "دروازهٔ سایت", desc: "کد ورود به خود سایت پیش از پنل‌ها.", files: [`${W}site.js`, `${F}index.html`], endpoints: ["/site*"] },
  { id: "infra.ui", title: "کیت رابط کاربری مشترک", desc: "TP.api، ui.js (کشوی راهنما، اعلان، ...)، ui-kit، حرکت‌ها و سبک‌های مشترک همهٔ پنل‌ها.",
    files: [`${F}shared.js`, `${F}ui.js`, `${F}ui-kit.js`, `${F}ui-motion.js`, `${F}config.js`, `${F}panel.css`, `${F}ui.css`] },
  { id: "infra.help", title: "متن‌های راهنما", desc: "help-content.js (منبع همهٔ راهنماها و همین طبقه‌بندی)، جریان‌های راهنما و راهنمای چاپی A4.",
    files: [`${F}help-content.js`, `${F}help-flows.js`, `${F}guide-a4.html`] },

  /* ---------------- حقوقی ---------------- */
  { id: "legal.app", title: "سامانهٔ حقوقی", desc: "تحلیل قرارداد، پیش‌نویس و گفت‌وگوی حقوقی؛ پایهٔ جدا (LEGAL_PREFIX) و فرانت جدا (frontend-legal).",
    files: [`${W}legal.js`, `${W}legal-prompts.js`], endpoints: ["legal:*"] },
];

/* جریان‌های کار: هر گام به یک یا چند قابلیت اشاره می‌کند (ترتیبِ راهنمای «روند کار» و «میز ارجاع») */
export const WORKFLOWS = [
  { id: "wf.request", title: "چرخهٔ درخواست خرید (دستی)", steps: [
    { t: "بارگذاری اکسل درخواست‌ها", f: ["manager.import"] },
    { t: "ارجاع به کارشناس و مهلت (دستی یا هوشمند)", f: ["manager.desk", "manager.asg", "manager.dl"] },
    { t: "مشاهده در کارتابل", f: ["expert.tray", "expert.detail"] },
    { t: "تأیید ساختار قلم و بررسی سوابق", f: ["expert.detail", "engine.structure", "expert.history"] },
    { t: "جستجوی هوشمند تأمین‌کنندهٔ تازه", f: ["expert.smart", "expert.msgtpl"] },
    { t: "استعلام و مکاتبه؛ پاسخ تأمین‌کننده در پنل یا بات", f: ["corr.main", "login.supplier", "sup.panel", "bot.sp", "expert.terms"] },
    { t: "پیش‌فاکتور و استعلامات", f: ["expert.quotes"] },
    { t: "جدول کمیسیون و نامهٔ کمیسیون", f: ["expert.comm", "expert.letter"] },
    { t: "تأیید کمیسیون و خاتمه", f: ["support.cm", "expert.detail"] },
  ] },
  { id: "wf.smart", title: "درخواست هوشمند (کارشناس هوشمند، کارشناس ناظر)", steps: [
    { t: "روشن کردن 🤖 برای کارشناس و تنظیم‌ها", f: ["support.ai", "support.md", "support.sw", "support.rules", "support.rank"] },
    { t: "تأیید ساختار و بررسی سوابق", f: ["expert.detail", "expert.history"] },
    { t: "🎯 فهرست دعوت و 🚀 شروع", f: ["expert.picks", "expert.ai", "engine.strategy"] },
    { t: "مذاکرهٔ خودکار با تأمین‌کنندگان", f: ["engine.ai", "sup.panel", "bot.sp"] },
    { t: "👁 نظارت کارشناس و پیشنهادها", f: ["expert.ai", "corr.main"] },
    { t: "📨 فراخوان پیش‌فاکتور رسمی", f: ["expert.finalcall", "support.finalcall"] },
    { t: "جدول کمیسیون، تحویل و تأیید", f: ["expert.comm", "support.dl", "support.cm"] },
  ] },
  { id: "wf.tender", title: "مناقصهٔ برخط (معکوس)", steps: [
    { t: "ارجاع درخواست به مناقصه", f: ["manager.desk", "support.td"] },
    { t: "ساخت، زمان‌بندی و دعوت با پیامک", f: ["support.td", "engine.tender", "notify.sms"] },
    { t: "ورود تأمین‌کننده با رمز پیامکی", f: ["login.tender"] },
    { t: "ثبت پیشنهادهای کاهشی", f: ["tender.page", "engine.tender"] },
    { t: "پایان، نتیجه و برگشت به کمیسیون", f: ["support.td", "expert.comm"] },
  ] },
  { id: "wf.supplier", title: "پاسخ تأمین‌کننده به استعلام", steps: [
    { t: "ارسال استعلام با پیامک و لینک بات", f: ["corr.main", "notify.sms"] },
    { t: "ورود با رمز پیامکی یا از بات", f: ["login.supplier", "bot.sp"] },
    { t: "پر کردن قیمت و شرایط هر قلم و ارسال", f: ["sup.panel", "expert.terms"] },
    { t: "تصمیم کارشناس روی بسته‌ها", f: ["corr.main", "expert.quotes"] },
  ] },
];

/* فراخوان‌هایی از پنل که هنوز به مسیری نمی‌رسند و دانسته رها شده‌اند (هر یک با دلیل؛ بعد از اصلاح پاکشان کنید) */
export const KNOWN_UNMATCHED = [
  { file: `${F}support-panel.js`, path: "/support/support/size-rules",
    why: "باگ: api() پنل پشتیبانی خودش /support می‌چسباند و این فراخوان /support/size-rules می‌دهد ← ۴۰۴ (تب 📏 برچسب اندازه). اصلاح: api(\"/size-rules\")." },
];

/* تست‌هایی که از راه import یا مسیر به قابلیتی نمی‌رسند (مثلاً پارسر مرورگر را از راه run.mjs#loadTP اجرا می‌کنند) */
export const TEST_FEATURES = {
  "import.test.mjs": ["manager.import"],
  "closed-items.test.mjs": ["manager.import"],
  "boot-splash.test.mjs": ["infra.ui"],
};

/* محدودهٔ نقشه: فایل‌هایی که باید صاحب داشته باشند */
export const SCOPE = ["worker.js", "worker/**/*.js", `${F}*.js`, `${F}*.mjs`, `${F}*.html`, `${F}*.css`, `${F}*.webmanifest`, `${F}*.svg`, `${F}vendor/*`];
