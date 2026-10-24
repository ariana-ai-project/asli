/* ============================================================
   پنل کارشناس خرید
   ورود با کد → کارتابل (ارجاع‌های ارسال‌شده به این کارشناس) → جزئیات درخواست
   با پنج تب: بررسی سوابق · جستجوی هوشمند · استعلامات · جدول کمیسیون ·
   نامهٔ کمیسیون (صدا → متن → نامهٔ رسمی؛ همان مسیر بات تلگرام)

   استعلامات و جدول کمیسیون واقعی و ذخیره‌شده‌اند (D1). سوابق (فایل‌های مرجع) و
   جستجوی هوشمند (Claude + جستجوی وب) هم وصل‌اند: خواندن سوابق و اجرای جستجو
   باکس همان مرحله را در پایش مدیر سبز می‌کنند؛ اگر کارشناس کار را بیرون از
   سامانه کرده، مرحله را دستی «انجام‌شده» علامت می‌زند. پیام به تأمین‌کننده از
   قالب ساخته و کپی می‌شود و خودِ کارشناس می‌فرستد.
   ============================================================ */
(function () {
  "use strict";
  window.TP.asExpert = true;
  const CFG = window.TAMIN_POSHTIBANI_CONFIG, TP = window.TP;
  const esc = TP.esc, M = TP.M, DAY = TP.DAY;
  /** دایره و تیکِ سبزِ وسطِ صفحه پس از هر تأیید (اصلِ طراحی مالک، مهر ۱۴۰۵) */
  const okTick = (label) => { if (TP.ui && TP.ui.success) TP.ui.success(label); };
  const COMPANY = CFG.company || "تونل سد آریانا";
  const PLATS = [["telegram", "تلگرام"], ["whatsapp", "واتساپ"], ["bale", "بله"], ["eitaa", "ایتا"], ["rubika", "روبیکا"]];
  const PLACES = ["محل پروژه", "انبار شرکت", "سایر"], PAYS = ["نقدی", "اعتباری", "۵۰٪ پیش‌پرداخت", "سایر"], DEALS = ["کارگاه", "دفتر مرکزی"], INVT = ["رسمی", "غیر رسمی"];
  /* ارزش افزوده: انتخابی و اجباری. قیمتِ ردیف همیشه بدون ارزش افزوده است و
     ارزش افزوده جداگانه ته جدول کمیسیون حساب می‌شود. */
  const VATS = ["دارد", "ندارد"], VAT_RATE = 0.1;
  const REQT = ["عادی", "فوری"], DEALT = ["خرید", "فروش"];
  /* فیلدهای استعلام: [کلید, عنوان, عرض, نوع, اختیاری؟]
     اجباری: واحد، مقدار، قیمت واحد، زمان تحویل، شرایط تسویه، نوع فاکتور (پیش‌فرض غیررسمی؛ با خواندن پیش‌فاکتور، رسمی).
     اختیاری: مشخصات فنی، اعتبار، روش حمل، محل معامله، محل تحویل — خالی بودنشان مانع ثبت موقت نیست. */
  const QF = [["spec", "جنس / مشخصات فنی", 170, "", true], ["unit", "واحد", 70], ["qty", "مقدار", 80, "num"], ["price", "قیمت واحد (ریال)", 130, "num"],
              ["dtime", "زمان تحویل", 116, "date"], ["valid_days", "اعتبار پیش‌فاکتور (روز)", 100, "num", true], ["ship", "روش حمل", 130, "", true]];
  const OPTL = ' <span class="dim" style="font-weight:400;font-size:.75rem">(اختیاری)</span>';
  const LBL = { spec: "جنس / مشخصات فنی", unit: "واحد", qty: "مقدار", price: "قیمت واحد", dtime: "زمان تحویل", valid_days: "اعتبار پیش‌فاکتور", ship: "روش حمل",
    place: "محل تحویل", place_other: "محل تحویل (سایر)", pay: "شرایط تسویه", vat: "ارزش افزوده", deal: "محل معامله", invoice: "نوع فاکتور" };

  /* ---------- وضعیت ---------- */
  const S = {
    screen: "login", now: Date.now(), expert: TP.session.get(),
    tray: [], settings: null, error: "", traySort: false,
    d: null,               // جزئیات ارجاع باز: {assignment, request, items, quotes, proformas, pendingDecisions}
    itemIdx: 0, tab: "history",
    q: { id: "", date: "", party: "", item: "" },
    hsort: "f",                           // ستون مرتب‌سازی جدول سوابق: f (رتبهٔ نهایی، پیش‌فرض) | v (ارزش خرید) | m (گشتاور) | qty | n
    priceIdx: false,                      // قیمت‌ها با تعدیلِ مرکز آمار (زمستان ۱۴۰۴) به‌جای قیمت روز با نرخ دلار — فقط نمایش، رتبه همیشه دلاری
    mom: 5,                               // ضریب اهمیت گشتاور (۱ تا ۱۰) — از localStorage پر می‌شود
    prof: null,                           // کلید تأمین‌کننده‌ای که کارتش باز است
    smBy: {},                              // قیدهای جستجوی هوشمند، برای هر قلم: {markets, brand, specs, notes}
    smProf: null,                          // تأمین‌کنندهٔ بازشده در نتایج جستجو
    team: null,                            // تب «تیم کارشناسی» کارشناس ارشد: {team, requests}
    teamCard: "all",                       // کارتِ انتخاب‌شده در تب تیم: شناسهٔ کارشناس یا "all"
    teamOpen: {},                          // کشوی اقلام هر درخواست در تب تیم
    marketsMeta: [{ key: "IR", fa: "ایران" }, { key: "TJ", fa: "تاجیکستان" }, { key: "TM", fa: "ترکمنستان" }, { key: "UZ", fa: "ازبکستان" }, { key: "KZ", fa: "قزاقستان" }, { key: "AM", fa: "ارمنستان" }, { key: "CN", fa: "چین" }, { key: "AE", fa: "امارات" }, { key: "TR", fa: "ترکیه" }],
    templates: [], tpl: 0, tplCtx: {},   /* قالب‌های پیام و زمینهٔ پرکردنِ هر قلم (/templates?item_id) */
    hist: {}, smart: {}, series: {},   // پاسخ endpointها برای هر قلم؛ series = نقاط نمودار
    picks: {}, pickOpen: {},           // فاز ۴ب گام ۲: «🎯 فهرست دعوت»ِ هر قلم (/items/:id/picks) و قلمِ «مستقیم»ی که کارشناس می‌خواهد بسپارد
    pkWarn: {}, pkMsg: {}, pkBusy: {}, // «🧭 چینش گسترده / محتاط»ِ هر قلم: هشدارِ تیکِ دستی، خطِ نتیجه و چیدنِ در جریان
    termsOpen: {}, termsEd: {},        // فاز ۴ب گام ۳: ویرایشگرِ «📋 شرایط خرید»ِ هر قلم و پیش‌نویسش
    normMin: {},                       // «بررسی سوابق» زده شد: پنلِ «نرمال‌سازی اقلام» جمع می‌شود تا نتیجه دیده شود
    norm: {},                          // نرمال‌سازی هر قلم: {loading, error, data, draft}
    normOn: false,                     // تیک «نرمال‌سازی اقلام» — از localStorage
    hmode: "head",                     // «نوع قلم» (head، پیش‌فرض — تصمیم مدیر) یا «عین قلم» (exact)
    tg: null,              // وضعیت اتصال تلگرام: {connected, botConfigured, bot}
    pick: {},              // «قلم انتخابی» هر قلم: {layers: [نام لایه‌های تیک‌خورده], units: [واحدهای تیک‌خورده] | null = همه}
    letter: null,          // وضعیت نامهٔ ارجاع باز: {aid, letter, stt} — از /assignments/:id/letter
    /* ضبط صدای نامه: rec = MediaRecorder باز، draft = متنِ در حال ویرایش (که
       بازرندرِ تیک‌های موضوع نباید ببلعدش)، sel = اقلامِ موضوع */
    lt: { rec: null, chunks: [], on: false, abort: false, t0: 0, timer: 0, draft: null, draftFor: 0, sel: null, selAid: 0 },
  };
  try { S.traySort = localStorage.getItem("tp.traySort") === "1"; } catch (_) { /* حالت خصوصی */ }
  const settings = () => S.settings || CFG.defaults;
  const A = () => S.d && S.d.assignment;
  const items = () => (S.d ? S.d.items : []);
  const item = () => items()[S.itemIdx];
  const openItems = () => items().filter((i) => i.state === "open");
  const qCount = () => S.d.quotes.filter((q) => q.saved).length;
  const pCount = () => S.d.proformas.length;
  /* پیش‌فاکتورِ یک خط استعلام — پیوندشان نام تأمین‌کننده است (همان قاعدهٔ بات) */
  const pfOf = (q) => S.d.proformas.find((p) => p.supplier_name === q.supplier_name) || null;
  const isSenior = () => !!(S.expert && S.expert.senior);
  /* قیدهای جستجوی هر قلم: بار اول از مشخصهٔ فنی و توضیحاتِ فایل راهکاران پر می‌شود (تصمیم مدیر)، بعد هرچه کارشناس نوشت */
  const smOf = (it) => {
    if (!S.smBy[it.id]) S.smBy[it.id] = { markets: ["IR"], brand: "", specs: String(it.spec || ""), notes: String(it.note || "") };
    return S.smBy[it.id];
  };

  /* ---------- رنگ مراحل برای این ارجاع ---------- */
  function flagsOf(a, its, quoteCount, proformaCount) {
    return [!!a.viewed_at, its.some((i) => i.hist_done_at), its.some((i) => i.smart_done_at), quoteCount > 0, proformaCount > 0, !!a.commission_at];
  }
  function boxes(a, done, active, small) {
    const st = { dispatchedAt: a.dispatched_at, days: a.days, done, active };
    const box = (s, i) => `<div class="box ${small ? "sm" : ""} b-${TP.stageColor(st, i, settings().thresholds, S.now)}" title="${s}">${i === 3 && a.quote_count ? a.quote_count : i === 4 && a.proforma_count ? a.proforma_count : ""}</div>`;
    /* در سربرگ جزئیات، بدون برچسب معلوم نیست هر باکس مال کدام مرحله است؛
       در جدول کارتابل جا نیست و همان title کافی است. */
    if (small) return `<div class="boxes">${TP.STAGES.map(box).join("")}</div>`;
    return `<div class="boxes">${TP.STAGES.map((s, i) => `<div class="boxcol"><span class="boxlab">${s}</span>${box(s, i)}</div>`).join("")}</div>`;
  }

  /* ---------- ورود و کارتابل ---------- */
  /* کارتِ ورود با چهار خانهٔ کد (کدهای بلندتر خانه می‌افزایند) و دکمهٔ سه‌بعدی — ui.js (مهر ۱۴۰۵) */
  function vLogin() {
    return TP.ui.login({ title: "ورود کارشناس خرید", sub: "کد ورود را رقم‌به‌رقم بنویسید", len: 4, max: 4, error: S.error, back: { href: "./" }, company: COMPANY });
  }
  const dateList = () => String(S.q.date || "").split("،").map((s) => s.trim()).filter(Boolean);
  function trayRows() {
    return S.tray.filter((a) => TP.hit(a.request_id, S.q.id) && (!dateList().length || dateList().includes(a.date)) && (TP.hit(a.party, S.q.party) || TP.hit(a.project, S.q.party)));
  }
  /* ساعت کاری مانده تا مهلت — منفی یعنی مهلت گذشته */
  const trayLeft = (a) => TP.budget(a.dispatched_at, a.days || 1) - TP.wh(a.dispatched_at, S.now);
  /* نوار تب‌های صفحهٔ کارشناس: کارتابل، (ارشد: تیم کارشناسی و تنظیم اعلانات)، و «حساب من» برای همه */
  const LIST_TABS = ["team", "alerts", "account"];
  /* تیکِ «🤖 هوشمند / ✋ دستی» این کارشناس در پنل پشتیبانی (worker/ai-agent.js، aiAdmin) — داشبوردش هم همان‌جاست */
  const aiOn = () => !!(S.expert && S.expert.ai === "on");
  /* کپسولِ بخش‌ها فقط برای کارشناس ارشد (کارتابل · تیم · اعلانات)؛ «حساب من» به منوی پروفایل رفت (مهر ۱۴۰۵) */
  function vSeniorTabs() {
    if (!isSenior()) return "";
    const T = [["tray", "کارتابل من"], ["team", "تیم کارشناسی"], ["alerts", "تنظیم اعلانات"]];
    const on = (k) => S.tab === k || (k === "tray" && !LIST_TABS.includes(S.tab));
    return `<div class="tp-subbar" style="padding-top:12px"><div class="tp-seg" role="tablist">${T.map(([k, l]) => `<button class="${on(k) ? "on" : ""}" data-stab="${k}" role="tab" aria-selected="${on(k) ? "true" : "false"}">${l}${k === "team" && S.team ? `<span class="cnt">${S.team.requests.length}</span>` : ""}</button>`).join("")}</div></div>`;
  }
  /* باکس‌های تب تیم با آستانه‌های تیم (ارشد اگر گذاشته، وگرنه مدیر) — جدا از آستانه‌های کارتابل خودش */
  const teamThr = () => ((S.team && S.team.settings) || settings()).thresholds;

  /* ---------- حساب من: کد ورود (رمز پنل) ---------- */
  function vAccount() {
    const e = S.expert, tg = S.tg || {};
    const k = (lab, val) => `<div class="k"><b>${lab}</b><span style="font-size:.95rem">${val}</span></div>`;
    return `<div class="tp-wrap"><div class="tp-card tp-pane"><div class="toolrow" style="margin-bottom:6px"><button class="tp-btn sm" data-stab="tray">→ کارتابل</button><h2 style="margin:0">حساب من</h2>${TP.ui.info("expert.account")}</div>
      <div class="kpi">${k("نام", esc(e.name))}${k("نام کوتاه", esc(e.label || e.name))}${k("نقش", isSenior() ? "کارشناس ارشد" : "کارشناس خرید")}
        ${tg.botConfigured ? k("تلگرام کارشناسی", tg.connected ? "✅ وصل" : "وصل نیست") : ""}${isSenior() ? k("تلگرام تیمی", e.team_connected ? "✅ وصل" : "وصل نیست") : ""}</div>
      <div class="tp-sect"><h3>تغییر کد ورود <span>۴ رقم</span></h3>
        <div class="tp-fields3">
          <div class="tp-field"><b>کد فعلی</b><input class="tp-input" id="acc-cur" type="password" inputmode="numeric" autocomplete="current-password"></div>
          <div class="tp-field"><b>کد تازه</b><input class="tp-input" id="acc-new" type="password" inputmode="numeric" autocomplete="new-password"></div>
          <div class="tp-field"><b>تکرار کد تازه</b><input class="tp-input" id="acc-rep" type="password" inputmode="numeric" autocomplete="new-password"></div>
          <div style="padding-bottom:2px"><button class="tp-btn primary" data-acc-save>تغییر کد</button></div></div>
        <div id="acc-msg" style="min-height:22px;font-size:.9rem"></div></div>${aiOn() ? vSupCfg() : ""}</div></div>`;
  }
  /**
   * «⏱ با مهلت / 🤖 خودکار» (مهر ۱۴۰۵): حالتِ مکاتباتِ کارشناس هوشمندِ شما — فقط خودتان (worker/ai-supervise.js). با مهلت: هر پیام و
   * تصمیمش اول به شما نشان داده می‌شود و بی‌پاسخ سرِ مهلت خودکار می‌رود؛ خودکار: خودش مذاکره می‌کند و فقط وقتِ لازم می‌پرسد.
   */
  function vSupCfg() {
    const s = S.sup;
    if (!s || s === "loading") { if (!s) loadSup(); return `<div class="tp-sect"><h3>⏱ مکاتباتِ کارشناس هوشمند</h3><p class="lead">در حال خواندن…</p></div>`; }
    if (s.err) return `<div class="tp-sect"><h3>⏱ مکاتباتِ کارشناس هوشمند</h3><p class="lead" style="color:#fca5a5">${esc(s.err)}</p></div>`;
    const c = s.cfg || { mode: "timer", minutes: 10 };
    return `<div class="tp-sect"><h3>⏱ مکاتباتِ کارشناس هوشمند ${TP.ui.info("expert.account", "راهنمای مکاتباتِ کارشناس هوشمند")}</h3>
      <div class="supm" role="radiogroup" aria-label="حالتِ مکاتبات">
        <label class="supm-o ${c.mode === "timer" ? "on" : ""}"><input type="radio" name="supm" data-supm value="timer" ${c.mode === "timer" ? "checked" : ""}>
          <b>⏱ با مهلت</b><small>اول به شما نشان داده می‌شود؛ بی‌پاسخ، سرِ مهلت می‌رود.</small>
          <span class="supm-min">مهلت <input class="tp-input num" type="text" data-supmin inputmode="numeric" maxlength="3" value="${c.minutes}" dir="ltr" style="width:76px" aria-label="مهلت به دقیقه"> دقیقه</span></label>
        ${s.hold_ok || c.mode === "hold" ? `<label class="supm-o ${c.mode === "hold" ? "on" : ""}"><input type="radio" name="supm" data-supm value="hold" ${c.mode === "hold" ? "checked" : ""} ${s.hold_ok ? "" : "disabled"}>
          <b>⏸ بی‌مهلت</b><small>تا «✅ ارسال» یا «✏️ رد»ِ شما نمی‌رود.${s.hold_ok ? "" : " (فعلاً خاموش است؛ مثلِ «با مهلت».)"}</small></label>` : ""}
        <label class="supm-o ${c.mode === "auto" ? "on" : ""}"><input type="radio" name="supm" data-supm value="auto" ${c.mode === "auto" ? "checked" : ""}>
          <b>🤖 خودکار</b><small>خودش مذاکره می‌کند؛ هر جا لازم باشد از شما می‌پرسد.</small></label>
      </div>
      <div id="sup-msg" style="min-height:22px;font-size:.9rem"></div></div>`;
  }
  async function loadSup() {
    if (S.sup === "loading") return;
    S.sup = "loading";
    try { S.sup = await TP.api("/me/supervise"); } catch (e) { S.sup = { err: e.message }; }
    render();
  }
  async function saveSupCfg() {
    const mode = (document.querySelector("[data-supm]:checked") || {}).value || "timer";
    const mi = document.querySelector("[data-supmin]"), msg = document.querySelector("#sup-msg");
    try {
      const r = await TP.api("/me/supervise", { method: "PUT", body: { mode, minutes: mi ? TP.digits(mi.value) : undefined } });
      S.sup = { ...S.sup, cfg: r.cfg };
      document.querySelectorAll(".supm-o").forEach((o) => o.classList.toggle("on", !!o.querySelector("input:checked")));
      if (msg) { msg.textContent = `ذخیره شد ✓ ${r.cfg.mode === "auto" ? "— خودکار" : r.cfg.mode === "hold" ? "— بی‌مهلت" : `— با مهلتِ ${M(r.cfg.minutes)} دقیقه`}${r.sent ? ` · ${M(r.sent)} پیشنهادِ معطل رفت` : ""}`; msg.style.color = "#6ee7b7"; }
    } catch (e) { if (msg) { msg.textContent = e.message; msg.style.color = "#fca5a5"; } }
  }
  async function saveCode() {
    const G = (s) => document.querySelector(s), msg = G("#acc-msg");
    const say = (t, bad) => { msg.textContent = t; msg.style.color = bad ? "#fca5a5" : "#6ee7b7"; };
    const digits = (s) => TP.digits(s).trim();
    const cur = digits(G("#acc-cur").value), nw = digits(G("#acc-new").value), rp = digits(G("#acc-rep").value);
    if (!cur) return say("کد فعلی را بنویسید.", true);
    if (!/^\d{4}$/.test(nw)) return say("کد تازه باید ۴ رقم باشد.", true);
    if (nw !== rp) return say("کد تازه و تکرارش یکی نیستند.", true);
    try {
      const r = await TP.api("/me/code", { method: "PUT", body: { current: cur, code: nw } });
      S.expert.code = r.code; TP.session.set(S.expert);
      ["#acc-cur", "#acc-new", "#acc-rep"].forEach((id) => { G(id).value = ""; });
      say(r.unchanged ? "کد تازه همان کد فعلی است." : "کد ورود عوض شد ✓");
    } catch (e) { say(e.message, true); }
  }

  function vList() {
    if (isSenior() && S.tab === "team") return vSeniorTabs() + vTeam();
    if (isSenior() && S.tab === "alerts") return vSeniorTabs() + vSeniorAlerts();
    if (S.tab === "account") return vSeniorTabs() + vAccount();
    const rows = trayRows();
    /* مرتب‌سازی با مهلت باقی‌مانده: کم‌ترین ساعت کاری بالا (تمام‌شده‌ها اول)؛ پیش‌فرض: تازه‌ترین ارسال اول */
    if (S.traySort) rows.sort((x, y) => trayLeft(x) - trayLeft(y));
    const any = S.q.id || S.q.date || S.q.party;
    return `${vSeniorTabs()}<div class="tp-subbar" style="padding-top:12px">
        <input class="tp-input ${S.q.id ? "on" : ""}" data-q="id" value="${esc(S.q.id)}" placeholder="شماره درخواست" aria-label="شماره درخواست" style="width:140px">
        <input class="tp-input date ${S.q.date ? "on" : ""}" data-q="date" value="${esc(S.q.date)}" placeholder="تاریخ" aria-label="تاریخ" readonly style="width:150px">
        <input class="tp-input ${S.q.party ? "on" : ""}" data-q="party" value="${esc(S.q.party)}" placeholder="پروژه یا طرف مقابل" aria-label="پروژه یا طرف مقابل" style="width:200px">
        ${any ? `<button class="tp-btn sm" data-clr>پاک کردن</button>` : ""}
        <button class="tp-btn sm ${S.traySort ? "primary" : ""}" data-tsort title="${S.traySort ? "برگشت به ترتیب ارسال — تازه‌ترها اول" : "مرتب‌سازی با مهلت باقی‌مانده — نزدیک‌ترین مهلت بالا"}">${S.traySort ? "✓ مرتب با مهلت" : "⇅ مرتب با مهلت"}</button>
        <span class="spacer"></span><span class="dim" style="font-size:.85rem">${rows.length} از ${S.tray.length} درخواست</span>
        ${aiOn() ? `<span class="chip info" title="تیکِ شما در پنل پشتیبانی روی «هوشمند» است">🤖 هوشمند</span>` : ""}${TP.ui.info(aiOn() ? "expert.ai" : "expert.tray", "راهنمای کارتابل")}</div>
      ${rows.length ? `<div class="tp-cards ${TP.ui.once("exp.tray")}">${rows.map(trayCard).join("")}</div>`
        : `<div class="tp-wrap"><div class="tp-card"><div class="empty"><b>درخواستی در کارتابل شما نیست.</b>${TP.ui.info("expert.tray", "راهنمای کارتابل")}</div></div></div>`}`;
  }
  /* بدترین رنگِ شش مرحله (همان TP.stageColor باکس‌های پایش) برای رنگِ کلِ کارت: زرد، نارنجی، قرمز */
  const LVL = { warn: 1, late: 2, over: 3 };
  function trayLevel(a, done) {
    const st = { dispatchedAt: a.dispatched_at, days: a.days, done, active: true };
    let worst = "";
    TP.STAGES.forEach((_, i) => { const c = TP.stageColor(st, i, settings().thresholds, S.now); if ((LVL[c] || 0) > (LVL[worst] || 0)) worst = c; });
    return worst;
  }
  /** کارتِ هر درخواست در کارتابل: شماره و تاریخ، پروژه، اقلام، نوار مهلت و نوار شش مرحله (مهر ۱۴۰۵) */
  function trayCard(a, i) {
    const b = TP.budget(a.dispatched_at, a.days || 1), el = TP.wh(a.dispatched_at, S.now), pct = b ? Math.min(100, el / b * 100) : 0;
    const done = [!!a.viewed_at, a.hist_count > 0, a.smart_count > 0, a.quote_count > 0, a.proforma_count > 0, !!a.commission_at];
    const lvl = trayLevel(a, done);
    const barLvl = el >= b ? "over" : pct >= 85 ? "late" : pct >= 60 ? "warn" : "";
    const chips = [
      a.ai === 1 && !a.ai_run ? `<span class="chip ${a.norm_count >= a.open_count ? "ok" : "warn"}" title="حالتِ هوشمند: ساختارِ اقلام را تأیید کنید و «بررسی سوابق و سپردن به کارشناس هوشمند» را بزنید">🧩 ${a.norm_count} از ${a.open_count}</span>` : "",
      a.ai === 2 ? `<span class="chip warn" title="کارشناس هوشمند در مهلت به حداقلِ استعلام نرسید؛ بررسی سوابق و جستجو برای شما باز شد">⚠️🤖</span>` : a.ai ? `<span class="chip info" title="این درخواست دستِ کارشناس هوشمند است (پنل پشتیبانی)">🤖</span>` : "",
    ].filter(Boolean).join("");
    const team = isSenior() && (S.team ? S.team.team : []).length;
    const more = team ? `<span class="more" data-stop>${TP.ui.menu({ btn: `<button class="tp-icon-btn sm" type="button" data-menu-toggle aria-haspopup="menu" aria-label="گزینه‌های درخواست" title="گزینه‌ها">${TP.ui.ICON.more}</button>`,
      items: [{ label: "ارجاع به تیم", icon: "users", attrs: `data-delegate="${a.id}"` }] })}</span>` : "";
    const proj = a.project || a.party || "—";
    return `<article class="tp-rcard ${lvl ? `lvl-${lvl}` : ""}" data-req="${a.id}" role="button" tabindex="0" style="--i:${Math.min(i, 12)}" aria-label="درخواست ${esc(a.request_id)}">
      <header><span class="rid">${esc(a.request_id)}</span><span class="rdate">${esc(a.date)}</span><span class="chips">${TP.ui.sizeChip(a.size)}${chips}</span>${more}</header>
      <div class="rproj" title="${esc(proj)}">${TP.ui.ICON.project}<span>${esc(proj)}</span></div>
      <div class="rmeta"><span>اقلام باز <b>${a.open_count}</b> از <b>${a.item_count}</b></span><span>استعلام <b>${a.quote_count}</b></span>${a.project && a.party && a.project !== a.party ? `<span title="طرف مقابل">${esc(a.party)}</span>` : ""}</div>
      ${TP.ui.bar.deadline(pct, barLvl, "مهلت", `${a.days} روز`)}
      ${TP.ui.bar.progress(TP.STAGES.map((s, k) => ({ label: TP.ui.STAGE_SHORT[k], title: s, done: done[k], cnt: k === 3 && a.quote_count ? a.quote_count : k === 4 && a.proforma_count ? a.proforma_count : "" })))}
    </article>`;
  }

  /* ---------- تیم کارشناسی (کارشناس ارشد) ----------
     همان ردیف‌های میز مدیر، فقط برای زیرمجموعه‌های او: کارت هر کارشناس بالا، «همه» هم هست. */
  /* یک درخواستِ «تیم» در هر لحظه: کارتابل و رندر هم ممکن است هم‌زمان بخواهندش */
  let teamP = null;
  function loadTeam(quiet) {
    if (teamP) return teamP;
    teamP = (async () => {
      try { const t = await TP.api("/team"); S.team = t; S.now = Date.now(); }
      catch (e) { if (!quiet) TP.modal("خطا", esc(e.message), null, "باشد", ""); S.team = S.team || { team: [], requests: [] }; }
      render();
    })().finally(() => { teamP = null; });
    return teamP;
  }
  const teamRows = () => {
    const R = (S.team && S.team.requests) || [];
    if (S.teamCard === "all") return R;
    return R.map((r) => ({ ...r, assignments: r.assignments.filter((a) => a.expert_id === +S.teamCard) })).filter((r) => r.assignments.length);
  };
  const teamItems = (r, a) => r.items.filter((i) => i.assignment_id === a.id);
  function teamState(r, a) {
    const its = teamItems(r, a);
    return { dispatchedAt: a.dispatched_at, days: a.days, active: !!a.dispatched_at && its.some((i) => i.state === "open"),
      done: [!!a.viewed_at, its.some((i) => i.hist_done_at), its.some((i) => i.smart_done_at), a.quote_count > 0, a.proforma_count > 0, !!a.commission_at] };
  }
  function teamLevel(r, a) {
    const A = teamState(r, a); if (!A.active) return "";
    let worst = "";
    TP.STAGES.forEach((_, i) => { const c = TP.stageColor(A, i, teamThr(), S.now); if ((LVL[c] || 0) > (LVL[worst] || 0)) worst = c; });
    return worst;
  }
  /* یک ردیفِ ارجاع داخل کارتِ تیم: کارشناس، مهلت، نوار مهلت و نوار شش مرحله، وضعیت و منوی ⋯ (مشاهده / تغییر کارشناس) — همان کارتِ میز مدیر */
  function teamUnit(r, a) {
    const its = teamItems(r, a), A = teamState(r, a), live = its.some((i) => i.state === "open");
    const st = live ? (a.dispatched_at ? "در جریان" : "ارسال‌نشده") : (its.some((i) => i.state === "hold") ? "معلق" : its.some((i) => i.state === "stop") ? "متوقف" : "بسته شده");
    const segs = TP.STAGES.map((s, i) => ({ label: TP.ui.STAGE_SHORT[i], title: s, cls: `c-${TP.stageColor(A, i, teamThr(), S.now)}`, done: A.done[i],
      cnt: i === 3 && a.quote_count ? a.quote_count : i === 4 && a.proforma_count ? a.proforma_count : "" }));
    let bars = TP.ui.bar.progress(segs);
    if (a.dispatched_at) {
      const b = TP.budget(a.dispatched_at, a.days || 1), el = TP.wh(a.dispatched_at, S.now), pct = b ? Math.min(100, el / b * 100) : 0;
      bars = TP.ui.bar.deadline(pct, el >= b ? "over" : pct >= 85 ? "late" : pct >= 60 ? "warn" : "", "مهلت", `${a.days || "—"} روز`) + bars;
    }
    const acts = TP.ui.menu({ btn: `<button class="tp-icon-btn sm" type="button" data-menu-toggle aria-haspopup="menu" aria-expanded="false" aria-label="اقدام‌های این ارجاع" title="اقدام‌ها">${TP.ui.ICON.more}</button>`,
      items: [{ label: "مشاهدهٔ درخواست", icon: "search", attrs: `data-req="${a.id}"` }, { label: "تغییر کارشناس", icon: "users", attrs: `data-delegate="${a.id}" data-from="${a.expert_id}"` }] });
    const sent = a.dispatched_at ? `<span class="tp-sendchip ok" title="ارسال شد ${esc(TP.fmt(a.dispatched_at))}">✓ ارسال ${esc(TP.fmt(a.dispatched_at).split(" — ")[0].replace(/^\S+\s/, ""))}</span>` : `<span class="tp-sendchip">ارسال‌نشده</span>`;
    return TP.ui.unitRow({ who: `<span class="uname">${TP.ui.ICON.user}${esc(a.expert_label || a.expert_name)}</span>`, days: `<span title="مهلت (روز کاری)">${TP.ui.ICON.clock}${a.days ? `${esc(a.days)} روز` : "—"}</span>`, bars,
      status: `<span><span class="st ${live ? (a.dispatched_at ? "st-run" : "st-reg") : "st-cls"}">${st}</span> <span class="dim">${its.length} قلم</span></span>${sent}`, acts });
  }
  function teamCard(r, i) {
    const need = r.items.map((x) => x.need_date).filter(Boolean).sort()[0] || "";
    let lvl = ""; r.assignments.forEach((a) => { const c = teamLevel(r, a); if ((LVL[c] || 0) > (LVL[lvl] || 0)) lvl = c; });
    const menu = TP.ui.menu({ btn: `<button class="tp-icon-btn sm" type="button" data-menu-toggle aria-haspopup="menu" aria-expanded="false" aria-label="گزینه‌های درخواست" title="گزینه‌ها">${TP.ui.ICON.more}</button>`,
      items: [{ label: S.teamOpen[r.id] ? "بستن فهرست اقلام" : "فهرست اقلام", icon: "box", attrs: `data-ttoggle="${esc(r.id)}"` }] });
    const drawer = `<table><thead><tr><th>#</th><th>کد قلم</th><th>عنوان</th><th>مشخصه فنی</th><th>مقدار</th><th>واحد</th><th>تاریخ نیاز</th><th>وضعیت</th><th>توضیحات</th></tr></thead><tbody>
      ${r.items.map((x) => `<tr><td class="num">${x.line_no}</td><td class="num">${esc(x.code || "")}</td><td>${esc(x.title)}</td><td class="dim">${esc(x.spec || "")}</td><td class="num">${x.qty == null ? "" : M(x.qty)}</td><td>${esc(x.unit || "")} ${TP.ui.estTxt(x)}</td><td class="num">${esc(x.need_date || "")}</td><td><span class="st ${TP.STATES[x.state].cls}">${TP.STATES[x.state].label}</span></td><td class="dim">${esc(x.note || "")}</td></tr>`).join("")}</tbody></table>`;
    return TP.ui.reqCard({ i, lvl, rid: r.id, date: r.date, need, project: r.project, party: r.party, center: r.center, menu,
      items: { first: r.items[0] ? r.items[0].title : "", total: r.items.length, est: r.items[0] ? TP.ui.estTxt(r.items[0]) : "" }, toggleAttrs: `data-ttoggle="${esc(r.id)}" aria-expanded="${S.teamOpen[r.id] ? "true" : "false"}"`,
      drawerOpen: !!S.teamOpen[r.id], drawerHtml: drawer, units: r.assignments.map((a) => teamUnit(r, a)) });
  }
  /* تب «تیم کارشناسی»: کپسولِ کارشناسان (با شمار) بالا و کارت‌های درخواست زیرش — همان کارت‌های میز مدیر (مهر ۱۴۰۵) */
  function vTeam() {
    if (!S.team) { loadTeam(); return `<div class="tp-wrap"><div class="empty">در حال خواندن تیم…</div></div>`; }
    const team = S.team.team || [], R = S.team.requests || [];
    if (!team.length) return `<div class="tp-wrap"><div class="tp-card tp-pane"><h2>تیم کارشناسی</h2><p class="lead">هنوز کارشناسی زیر نظر شما نیست. ${TP.ui.info("expert.team", "راهنمای تیم کارشناسی")}</p></div></div>`;
    const cnt = (eid) => R.reduce((n, r) => n + r.assignments.filter((a) => eid === "all" || a.expert_id === eid).length, 0);
    const seg = [["all", "همه"], ...team.map((e) => [e.id, e.label || e.name])].map(([k, l]) => { const on = String(S.teamCard) === String(k);
      return `<button type="button" class="${on ? "on" : ""}" data-tcard="${k}" role="tab" aria-selected="${on ? "true" : "false"}">${esc(l)}<span class="cnt">${M(cnt(k === "all" ? "all" : +k))}</span></button>`; }).join("");
    const rows = teamRows();
    return `<div class="tp-subbar" style="padding-top:12px"><div class="tp-seg" role="tablist" aria-label="کارشناسان تیم">${seg}</div><span class="spacer"></span><span class="dim" style="font-size:.85rem">${rows.length} درخواست</span>${TP.ui.info("expert.team", "راهنمای تیم")}</div>
      ${rows.length ? `<div class="tp-cards wide ${TP.ui.once("exp.team")}">${rows.map(teamCard).join("")}</div>` : `<div class="tp-wrap"><div class="tp-card"><div class="empty">درخواستی برای این کارشناس نیست.</div></div></div>`}`;
  }

  /* «ارجاع به تیم» / «تغییر کارشناس»: فهرست زیرمجموعه‌ها (و خودِ ارشد) و «ارسال» */
  function delegateDialog(aid, fromId) {
    const team = (S.team && S.team.team) || (S.expert.team || []);
    const opts = [...team.map((e) => [e.id, e.label || e.name]), [S.expert.id, `${S.expert.label || S.expert.name} (خودم)`]].filter(([id]) => id !== +fromId && (fromId || id !== S.expert.id));
    const title = fromId ? "تغییر کارشناس" : "ارجاع به تیم";
    if (!opts.length) return TP.modal(title, "کارشناس دیگری در تیم شما نیست.", null, "باشد", "");
    const d = TP.modal(title, `<div class="tp-field"><b>به کدام کارشناس؟</b>
        <div style="display:flex;flex-direction:column;gap:6px;margin-top:6px">${opts.map(([id, l], i) => `<label style="display:flex;gap:8px;align-items:center;cursor:pointer"><input type="radio" name="dlg" value="${id}" ${i === 0 ? "checked" : ""}> ${esc(l)}</label>`).join("")}</div></div>
      <div class="tp-field" style="margin-top:10px"><b>مهلت (روز کاری) — خالی یعنی همان مهلت فعلی</b><input class="tp-input" id="dlg-days" inputmode="numeric" style="width:110px;text-align:center"></div>
      <p class="dim" style="margin-top:10px;font-size:.85rem">اقلام، استعلام‌ها و پیش‌فاکتورها منتقل می‌شوند، ساعت‌شمار از نو شروع می‌شود و به کارشناس تازه در تلگرام خبر می‌رود. درخواست از کارتابل شما به تب «تیم کارشناسی» می‌رود.</p>`,
      async () => {
        const eid = +((d.querySelector("input[name=dlg]:checked") || {}).value || 0), days = +d.querySelector("#dlg-days").value || undefined;
        if (!eid) return;
        try {
          await TP.api("/team/delegate", { body: { assignment_id: aid, expert_id: eid, days } });
          /* از نمای فقط‌خواندنیِ درخواستِ زیرمجموعه: ارجاعِ قبلی دیگر معتبر نیست، به تب تیم برمی‌گردیم */
          if (S.screen === "detail") { S.screen = "list"; TP.ui.resetOnce("exp.tray"); TP.ui.resetOnce("exp.team"); S.d = null; S.tab = "team"; S.fromTeam = false; }
          await Promise.all([loadTray(), loadTeam(true)]);
        }
        catch (e) { TP.modal("خطا", esc(e.message), null, "باشد", ""); }
      }, "ارسال");
  }

  /* تنظیم اعلانات کارشناس ارشد — همان تب مدیر، برای تیم خودش: تیکِ بالای هر مرحله یعنی تغییر وضعیتش
     در «تلگرام تیمی» اعلام شود، و درصد زیرش آستانهٔ هشدارِ همان مرحله برای کارشناسان زیر نظر اوست.
     تا وقتی ارشد درصدی عوض نکرده، آستانه‌های مدیر برقرار است؛ با اولین تغییر، شش درصدِ او جایش
     می‌نشیند و باکس‌های پایش و هشدارهای کارشناسان تیمش همه‌جا با همان سنجیده می‌شوند. */
  function vSeniorAlerts() {
    const ticks = S.expert.alert_stages || [true, false, false, false, true, true];
    const own = S.expert.alert_thresholds;
    const mgr = (S.settings && S.settings.thresholds) || CFG.defaults.thresholds;
    const thr = own || mgr;
    const tg = S.tg || {};
    return `<div class="tp-wrap"><div class="tp-card tp-pane"><h2>تنظیم اعلانات تیم</h2>
      <div class="tp-grid6">${TP.STAGES.map((st, i) => `<div class="cell"><label title="اعلان این مرحله در تلگرام تیمی"><input type="checkbox" data-sstage="${i}" ${ticks[i] ? "checked" : ""}> <b>${st}</b></label>
        <input class="tp-input" data-sthr="${i}" value="${thr[i] === "" || thr[i] == null ? "" : thr[i]}" inputmode="numeric" placeholder="خالی"></div>`).join("")}</div>
      <div id="sthrErr" style="color:#fca5a5;min-height:20px;font-size:.88rem"></div>
      <div class="tp-row" style="align-items:center;gap:10px">
        ${own ? `<span class="chip ok">آستانه‌های شما برای تیم فعال است</span><button class="tp-btn sm" data-sthr-reset>بازگشت به آستانه‌های مدیر (${esc(mgr.map((x) => (x === "" ? "—" : M(x))).join("، "))})</button>`
          : `<span class="chip">اکنون همان آستانه‌های مدیر برقرار است؛ با تغییر هر درصد، آستانه‌های شما جایگزین می‌شود</span>`}
        <span class="dim" data-sthr-saved style="font-size:.85rem"></span></div>
      <div class="tp-sect"><h3>تلگرام تیمی <span>${S.expert.team_connected ? "✅ وصل است" : "هنوز وصل نیست"}</span></h3>
        ${tg.teamBot ? `<p class="dim" style="margin:0 0 8px">بات تیمی: <b dir="ltr">@${esc(tg.teamBot)}</b></p>` : ""}
        <button class="tp-btn ${S.expert.team_connected ? "" : "primary"}" data-team-link>${S.expert.team_connected ? "اتصال دوباره / گفت‌وگوی دیگر" : "اتصال تلگرام تیمی"}</button></div></div></div>`;
  }
  async function teamLink() {
    try {
      const r = await TP.api("/tg/team-link", { method: "POST" });
      if (r.available === false) return TP.modal("تلگرام تیمی", esc(r.message), null, "باشد", "");
      if (r.via !== "team") {
        return TP.modal("اتصال گروه تیم", `روی دکمهٔ زیر بزنید؛ تلگرام می‌پرسد بات به کدام گروه اضافه شود. گروه را انتخاب کنید و تأیید کنید.
          <br><br><a class="tp-btn primary" href="${esc(r.url)}" target="_blank" rel="noopener" style="display:inline-block;text-decoration:none">افزودن بات به گروه تیم</a>
          <br><br><span class="dim" style="font-size:.85rem">این لینک ۱۵ دقیقه اعتبار دارد و یک بار کار می‌کند. بعد از اتصال، دکمهٔ ↻ را بزنید.</span>`, null, "بستم", "");
      }
      TP.modal("تلگرام تیمی", `${S.expert.team_connected ? "<b>تلگرام تیمی شما وصل است.</b> اگر می‌خواهید اعلان‌ها به گفت‌وگوی دیگری برود، از همین لینک استفاده کنید.<br><br>" : ""}
        اعلان‌های پایش کارشناسان تیم شما — مشاهده، دریافت پیش‌فاکتور و بقیهٔ مرحله‌هایی که در «تنظیم اعلانات» تیک زده‌اید، عبور از مهلت و بسته شدن درخواست — با بات <b dir="ltr">@${esc(r.bot)}</b> برای شما فرستاده می‌شود.
        <br><br><a class="tp-btn primary" href="${esc(r.url)}" target="_blank" rel="noopener" style="display:inline-block;text-decoration:none">باز کردن @${esc(r.bot)} و زدن START</a>
        ${r.group ? `<br><br><span class="dim" style="font-size:.85rem">اگر می‌خواهید اعلان‌ها در یک گروه تلگرام بیاید: <a href="${esc(r.group)}" target="_blank" rel="noopener">افزودن همین بات به گروه</a></span>` : ""}
        <br><br><span class="dim" style="font-size:.85rem">این لینک ۱۵ دقیقه اعتبار دارد و یک بار کار می‌کند. بعد از اتصال، دکمهٔ ↻ را بزنید.</span>`, null, "بستم", "");
    } catch (e) { TP.modal("خطا", esc(e.message), null, "باشد", ""); }
  }
  /* ذخیرهٔ خودکار آستانه‌های تیم بعد از مکث؛ درصدهای نامعتبر فرستاده نمی‌شوند */
  let thrTimer = null;
  function saveSeniorThr(vals) {
    clearTimeout(thrTimer);
    thrTimer = setTimeout(async () => {
      try {
        const r = await TP.api("/me/alerts", { method: "PUT", body: { alert_thresholds: vals } });
        const hadOwn = !!S.expert.alert_thresholds;
        S.expert.alert_thresholds = r.alert_thresholds; TP.session.set(S.expert); S.team = null;
        if (!hadOwn || !vals) render();
        const el = document.querySelector("[data-sthr-saved]");
        if (el) el.textContent = `ذخیره شد ✓${r.rescheduled ? ` — هشدارهای ${M(r.rescheduled)} ارجاعِ باز تیم با آستانه‌های تازه چیده شد` : ""}`;
      } catch (e) { TP.modal("ذخیره نشد", esc(e.message), null, "باشد", ""); }
    }, vals ? 700 : 0);
  }

  /* ---------- جزئیات ---------- */
  /* ---------- کارشناس هوشمند (فاز ۲ پنل پشتیبانی) ----------
     تیکِ «🤖 هوشمند / ✋ دستی» هر کارشناس در پنل پشتیبانی است. درخواستی که دستِ کارشناس هوشمند است: بررسی سوابق، جستجوی
     هوشمند، ساختار قلم، جدول کمیسیون و نامه را خودش انجام می‌دهد و برای کارشناس قفل است؛ خط‌های استعلامِ او (🤖) دست‌نخوردنی‌اند
     و کارشناس فقط خطِ دستیِ خودش (✋) را می‌افزاید — پیش‌فاکتورش را بارگذاری و استخراج می‌کند. سرور هم همین را می‌سنجد (ai-lock.js).
     فاز ۳: کارشناس هوشمند تا هر قلم به «حداقلِ استعلامِ» پنل پشتیبانی نرسد نمی‌بندد؛ اگر در مهلتش نرسید، کار «واگذار» می‌شود:
     بررسی سوابق و جستجوی هوشمند برای کارشناس باز (جدول و نامه هنوز با کارشناس هوشمند). ردِ تحویل در پنل پشتیبانی همه‌چیز را آزاد می‌کند. */
  const aiOwned = () => !!(S.d && S.d.ai && S.d.ai.owned);
  const aiMode = () => !!(S.d && S.d.ai && S.d.ai.mode);
  const aiHandover = () => !!(aiOwned() && S.d.ai.owned.handover);
  /* فاز ۴ب گام ۲ — روالِ تازه (flow 2): بررسی سوابق و جستجوی هوشمند کارِ خودِ کارشناس است؛ قفلِ سوابق فقط برای کارِ زندهٔ روالِ پیشین */
  const flow2 = () => aiOwned() && (!S.d.ai.owned.run_id || S.d.ai.owned.flow === 2);
  /** بررسی سوابق و جستجوی هوشمند قفل است؟ — فقط روالِ پیشین، و نه بعد از واگذاری */
  const aiResearch = () => aiOwned() && !aiHandover() && !flow2();
  /* طرح «خرید هوشمند، کارشناس ناظر» (فاز ۱): کارشناسِ 🤖 درخواست را اول خودش نرمال می‌کند و با «بررسی سوابق و سپردن به کارشناس
     هوشمند» می‌سپارد — تا آن موقع کار «pending» است (ai.owned بی run_id). نرمال‌سازی برای همه اجباری و اول از همه است: سوابقِ قلمِ
     تأییدنشده خوانده نمی‌شود. با سپردن، ساختار منجمد است (frozen_at) تا کار دستِ کارشناس هوشمند است (worker/structure.js). */
  const aiPending = () => aiOwned() && !S.d.ai.owned.run_id;
  /* جدول کمیسیون و نامه با کارشناس هوشمند است؟ فقط اگر کاری هست یا قلمی هنوز به او می‌رسد (owned.end — همان نگهبانِ سرور،
     worker/ai-modes.js:aiEndLocked)؛ درخواستی که همهٔ اقلامش دستی یا «مستقیم» است، جدول و نامه‌اش با خودِ شماست */
  const aiEnd = () => aiOwned() && S.d.ai.owned.end !== false;
  /* گزینهٔ «＋ لایهٔ تازه…» در فهرستِ نامِ لایه‌ها (newLayerUI) */
  const NEW_LAYER = "__new_layer__";
  const normOk = (it) => { try { const x = it && it.norm_json ? JSON.parse(it.norm_json) : null; return !!(x && x.head && x.source !== "ai"); } catch (_) { return false; } };
  const frozen = (it) => !!(it && it.frozen_at && aiOwned());
  /* طرح «خرید هوشمند» فاز ۴ب: هر قلم با حالتِ نوعِ خودش (worker/ai-modes.js) — «انجام دستی»ِ تأییدشدهٔ مدیر، قلمِ بیرون از کارِ کارشناس
     هوشمند، یا (هنوز نسپرده) قلمی از نوعِ «مستقیم» دستِ خودِ کارشناس است: بررسی سوابق و جستجویش باز است */
  const aiItem = (it) => (it && S.d && S.d.ai && S.d.ai.items ? S.d.ai.items.find((x) => x.id === it.id) : null) || null;
  /* وضعیتِ قلم در درخواستِ هوشمند — manual («انجام دستی»ِ تأییدشده) · waiting (در انتظارِ مدیر) · started (🚀 سپرده شد) · direct (از نوعِ
     «مستقیم»، دستِ خودِ کارشناس) · select (منتظرِ «🎯 فهرست دعوت» و «🚀 شروع»)؛ روالِ پیشین: run (در کار) یا free (بیرون از کار) */
  const iState = (it) => {
    const m = aiItem(it); if (!m || !aiOwned()) return null;
    if (m.manual) return "manual"; if (m.waiting) return "waiting";
    if (!flow2()) return m.in_run ? "run" : "free";
    return m.started_at ? "started" : m.mode === "direct" ? "direct" : "select";
  };
  const itemFree = (it) => { const st = iState(it); return st === "manual" || st === "free" || (st === "direct" && !S.pickOpen[it.id]); };
  const PILL = { select: ["warn", "🎯 منتظرِ شروع", "فهرستِ دعوتِ این قلم را ببینید و «🚀 شروع» را بزنید"], direct: ["", "✋ مستقیم", "از نوعِ «مستقیم»: خودتان مکاتبه کنید یا به انتخابِ خودتان بسپارید"],
    manual: ["", "✋ دستی", "«انجام دستی»ِ تأییدشدهٔ مدیر"], waiting: ["warn", "⏳ مدیر", "درخواستِ «انجام دستی» در انتظارِ تصمیمِ مدیر"] };
  const pillAi = (x) => { const p = x.state === "open" && flow2() ? PILL[iState(x)] : null; return p ? ` <span class="chip ${p[0]}" title="${p[2]}">${p[1]}</span>` : ""; };
  /* ⭐ امتیازهای مانده به کارِ کارشناس هوشمند — «خاتمه» تا صفرشدنش معلق است (worker/ai-rates.js، تصمیمِ مالک) */
  const rateGaps = () => (S.d && S.d.ai && S.d.ai.rates) || null;
  function rateGapText(g) {
    const parts = [];
    if (g.msgs) parts.push(`${M(g.msgs)} پیامِ کارشناس هوشمند`);
    if ((g.threads || []).length) parts.push(`${M(g.threads.length)} مکاتبهٔ کامل (${g.threads.slice(0, 3).map((x) => esc(x.supplier)).join("، ")}${g.threads.length > 3 ? "، …" : ""})`);
    if (g.letter) parts.push("نامهٔ کمیسیون");
    if (g.request) parts.push("نظرِ کلی دربارهٔ کلِ مذاکره");
    return parts.length > 1 ? `${parts.slice(0, -1).join("، ")} و ${parts[parts.length - 1]}` : parts[0] || "";
  }
  function vRateBar() {
    const g = rateGaps();
    if (!g || !g.total) return "";
    return `<div class="tp-status warn rate-gap"><b>⭐ پیش از «خاتمه» امتیاز بدهید</b><span class="sp">${rateGapText(g)} هنوز ستاره ندارد.</span>
      ${g.total > (g.request ? 1 : 0) ? `<a class="tp-btn sm" href="correspond">💬 امتیاز در مکاتبات</a>` : ""}${g.letter ? `<button type="button" class="tp-btn sm" data-goletter>📝 نامهٔ کمیسیون</button>` : ""}${g.request ? `<button type="button" class="tp-btn sm" data-rqcomment>✍️ نظرِ کلی</button>` : ""}${TP.ui.info("expert.ai", "امتیاز به کارشناس هوشمند")}</div>`;
  }
  /* نوارِ یک‌خطیِ وضعیتِ کارشناس هوشمند: فقط همین لحظه (شمارها، سؤال‌ها، واگذاری)؛ توضیحِ روال در راهنما (expert.ai) */
  function vAiBar() {
    const ai = (S.d && S.d.ai) || {};
    const H = TP.ui.info("expert.ai", "راهنمای کارشناس هوشمند");
    const free = items().filter((i) => i.state === "open" && aiItem(i) && itemFree(i));
    const freeTxt = free.length ? `<span class="chip" title="${free.some((i) => (aiItem(i) || {}).manual) ? "«انجام دستی»ِ تأییدشدهٔ مدیر یا " : ""}نوعِ «مستقیم» — بررسی سوابق و جستجویشان برایتان باز است${flow2() ? "؛ «مستقیم» را هم اگر خواستید با «🤖 سپردن به کارشناس هوشمند» در «بررسی سوابق» می‌سپارید" : ""}">✋ دستِ شما: ${free.map((i) => esc(i.title)).join("، ")}</span>` : "";
    /* ✋ با نامِ کسی که دستی‌اش کرد: مدیر (تیکِ ارجاع) یا پشتیبانی (جدول کمیسیون یا نامه پیش از «🤖 هوشمند» شدنِ شما ساخته شده بود) */
    if (!aiOwned()) return ai.review && ai.review.state === "rejected"
      ? `<div class="tp-status warn"><b>↩️ پشتیبانی تحویلِ کارشناس هوشمند را رد کرد</b><span class="sp">${ai.review.reason ? `${esc(ai.review.reason)} — ` : ""}این درخواست حالا کامل دستِ شماست؛ گفت‌وگوها و خط‌های کارشناس هوشمند هم برایتان باز است.</span>${H}</div>`
      : ai.on === false ? `<div class="tp-status"><b>${ai.set_by === "support" ? "✋ دستی ماند — پشتیبانی" : "✋ ارجاعِ دستیِ مدیر"}</b><span class="sp">${ai.note ? `${esc(ai.note)} — ` : ""}همهٔ کارهایش با خودِ شماست.</span>${H}</div>` : "";
    const k = ai.asks || 0, cv = ai.cover || [];
    const ask = k ? `<a class="chip warn" href="correspond" title="پاسخ را در همان گفت‌وگو در «💬 مکاتبات» بنویسید">🚨 ${k === 1 ? "یک سؤال" : `${k} سؤال`} از شما دارد</a>` : "";
    const need = cv.length ? `<span class="chip" title="حداقلِ استعلامِ هر قلم (پنل پشتیبانی)">حداقلِ استعلام: ${cv.map((c) => `${esc(c.title)} <b>${c.have}/${c.need}</b>${c.have >= c.need ? " ✓" : ""}`).join(" · ")}</span>` : "";
    /* فاز ۴ب گام ۲ (روالِ تازه): هر قلم جدا — فهرستِ دعوت و «🚀 شروع» کارِ کارشناس، دعوت و مذاکره کارِ کارشناس هوشمند */
    if (flow2()) {
      const st = items().filter((i) => i.state === "open").map(iState);
      const nGo = st.filter((s) => s === "started").length, nSel = st.filter((s) => s === "select").length;
      const ho = aiHandover() ? `<span class="chip warn" title="در «🎯 فهرست دعوت» نفرهای دیگری تیک بزنید یا از «جستجوی هوشمند» بیفزایید و «📨 دعوت از انتخاب‌های تازه» را بزنید — یا خطِ دستیِ ✋ بیفزایید">⚠️ در مهلت به حداقلِ استعلام نرسید</span>` : "";
      const end = aiEnd() ? "" : `<span class="chip" title="هیچ قلمی به کارشناس هوشمند نمی‌رسد (همه دستی یا «مستقیم»)؛ «تولید جدول کمیسیون» و نامه را خودتان می‌زنید">جدول کمیسیون و نامه با شما</span>`;
      return `<div class="tp-status ${aiHandover() ? "warn" : ""}"><b>🤖 حالتِ هوشمند — هر قلم جدا</b><span class="sp chips"><span class="chip ok">${M(nGo)} قلم سپرده شد</span>${nSel ? `<span class="chip warn">${M(nSel)} قلم منتظرِ «🚀 شروع»</span>` : ""}${ho}${need}${ask}${freeTxt}${end}</span>${H}</div>`;
    }
    if (aiHandover()) return `<div class="tp-status warn"><b>⚠️ کار به شما واگذار شد</b><span class="sp chips"><span class="chip" title="کارشناس هوشمند در مهلت به حداقلِ استعلام نرسید؛ تأمین‌کنندهٔ تازه پیدا کنید و استعلامِ کم را بگیرید — گفت‌وگوهایش ادامه دارند و وقتی حد پر شد، جدول و نامه را خودش می‌سازد">بررسی سوابق و جستجو برایتان باز است</span>${need}${ask}${freeTxt}</span>${H}</div>`;
    return `<div class="tp-status"><b>🤖 دستِ کارشناس هوشمند</b><span class="sp chips"><span class="chip" title="بررسی سوابق، جستجوی هوشمند، مذاکره، جدول کمیسیون و نامه با اوست و برای شما قفل؛ گفت‌وگوهایش بسته‌اند مگر وقتی از شما سؤال دارد">خطِ دستیِ ✋ را در «استعلامات» می‌افزایید</span>${need}${ask}${freeTxt}</span>${H}</div>`;
  }
  /* درخواستِ هوشمند: نامه را کارشناس هوشمند می‌نویسد — وقتی نوشت، همین‌جا فقط‌خواندنی با «⭐ امتیاز و نظر»ِ اجباری؛ تا آن موقع قفل */
  function vAiLetter() {
    const box = letterFor();
    if (!box) { loadLetter(); return `<div class="pad"><div class="empty">در حال خواندن وضعیت نامه…</div></div>`; }
    if (box.loading) return `<div class="pad"><div class="empty">در حال خواندن وضعیت نامه…</div></div>`;
    const L = box.letter;
    if (L && L.state === "written" && (L.meta || {}).channel === "ai") return `<div class="pad"><div class="toolrow"><b>نامهٔ پیوست کمیسیون — درخواست <span class="num">${esc(S.d.request.id)}</span></b></div>${vLetterDone(L)}</div>`;
    return vAiLocked("letter");
  }
  function vAiLocked(tab) {
    const what = { history: "بررسی سوابق", smart: "جستجوی هوشمند", letter: "نامهٔ کمیسیون" }[tab] || "این بخش";
    return `<div class="pad"><div class="empty"><b>🔒 ${what} دستِ کارشناس هوشمند است.</b>${TP.ui.info("expert.ai", "راهنمای کارشناس هوشمند")}</div></div>`;
  }
  /* اقدام‌های درخواست در یک منو (قالب‌ها، تعلیق، توقف، خاتمه) و یک خطِ وضعیت — به‌جای نوارِ پُردکمه (مهر ۱۴۰۵) */
  function endMenu() {
    const its = items(), n = its.length, k = its.filter((i) => i.commission_ok).length, o = openItems().length;
    const pend = S.d.pendingDecisions.length;
    const note = pend ? `<span class="chip warn">در انتظار تأیید مدیر (${pend})</span>` : settings().approvalRequired ? `<span class="chip" title="تصمیم شما (تعلیق، توقف، خاتمه) نیاز به تأیید مدیر دارد">با تأیید مدیر</span>` : "";
    const menu = TP.ui.menu({ btn: `<button class="tp-btn sm tp-menu-btn" type="button" data-menu-toggle aria-haspopup="menu" aria-expanded="false">${TP.ui.ICON.more}اقدام‌ها</button>`, items: [
      { label: "قالب‌های پیام", icon: "chat", attrs: "data-tpl" }, "-",
      { label: "تعلیق", icon: "clock", attrs: 'data-eact="hold"', disabled: !o },
      { label: "توقف", icon: "flag", attrs: 'data-eact="stop"', disabled: !o, cls: "danger" },
      { label: `خاتمه (${k} قلم)`, icon: "check", attrs: 'data-eact="end"', disabled: !k },
    ] });
    return { menu, status: `<span class="st ${o ? "st-run" : "st-cls"}">${o ? "در جریان" : "بدون قلم باز"}</span><span class="dim" style="font-size:.84rem" title="تیکِ تأیید کمیسیون را پنل پشتیبانی می‌زند؛ «خاتمه» همان اقلام را می‌بندد">${k} از ${n} قلم تأیید کمیسیون${o < n ? ` · ${n - o} قلم بسته/متوقف` : ""}</span>${note}` };
  }
  function vDetail() {
    const a = A(), r = S.d.request, its = items(), it = item();
    const mine = a.expert_id === S.expert.id;
    const b = TP.budget(a.dispatched_at, a.days || 1), el = TP.wh(a.dispatched_at, S.now), pct = b ? Math.min(100, el / b * 100) : 0;
    const dl = TP.endN(a.dispatched_at, a.days || 1), dd = new Date(dl);
    const done = flagsOf(a, its, qCount(), pCount());
    /* نوار شش مرحله با رنگِ هر مرحله — همان رنگِ باکس‌های پایش مدیر */
    const st = { dispatchedAt: a.dispatched_at, days: a.days, done, active: openItems().length > 0 };
    const segs = TP.STAGES.map((s, i) => { const c = TP.stageColor(st, i, settings().thresholds, S.now); return { label: TP.ui.STAGE_SHORT[i], title: s, done: c === "done", cls: `c-${c}`, cnt: i === 3 && qCount() ? qCount() : i === 4 && pCount() ? pCount() : "" }; });
    const barLvl = el >= b ? "over" : pct >= 85 ? "late" : pct >= 60 ? "warn" : "";
    const E = endMenu();
    const proj = r.project || r.party;
    return `<div class="tp-wrap" style="padding-bottom:24px"><div class="tp-card">
      <div class="tp-dhead">
        <div class="tp-dhead-top"><button class="tp-btn sm" data-back>→ کارتابل</button><h2>درخواست <span class="num">${esc(r.id)}</span></h2>
          ${r.urgency ? `<span class="chip warn">${esc(r.urgency)}</span>` : ""}${mine ? "" : `<span class="chip warn">ارجاعِ ${esc(a.expert_label || a.expert_name)} — فقط‌خواندنی</span>${isSenior() ? ` <button class="tp-btn xs" data-delegate="${a.id}" data-from="${a.expert_id}" title="این درخواست به کارشناس دیگری از تیم شما (یا خودتان) داده شود">تغییر کارشناس</button>` : ""}`}
          <span class="spacer"></span>${E.status}${E.menu}${TP.ui.info("expert.detail", "راهنمای این صفحه")}</div>
        <div class="tp-dhead-meta"><span title="پروژه">${TP.ui.ICON.project.replace("<svg", '<svg style="width:15px;height:15px;vertical-align:-3px"')} <b>${esc(proj)}</b>${r.project && r.project !== r.party ? ` <span class="dim">(${esc(r.party)})</span>` : ""}</span><span>اقلام <b>${its.length}</b></span><span>تاریخ ثبت <b class="num">${esc(r.date)}</b></span><span>مهلت تحویل <b>${TP.WD[dd.getDay()]} ${TP.fmtD(dl)}</b></span></div>
        <div class="tp-dhead-bars">${TP.ui.bar.deadline(pct, barLvl, "مهلت", `${a.days} روز · ${Math.round(pct)}٪ سپری شده`)}${TP.ui.bar.progress(segs, true)}</div>
        ${vAiBar()}${vRateBar()}
      </div>
      <div class="tp-items" role="tablist" aria-label="اقلام">${its.map((x, i) => `<button type="button" class="tp-item ${i === S.itemIdx ? "on" : ""} ${x.state !== "open" ? "closed" : ""}" data-item="${i}" role="tab" aria-selected="${i === S.itemIdx ? "true" : "false"}" title="${esc(x.title)}">
        <span class="t">${esc(x.title)}</span><span class="m num">${x.qty == null ? "" : M(x.qty)} ${esc(x.unit)}${x.code ? ` · ${esc(x.code)}` : ""} ${TP.ui.estTxt(x)}</span>
        <span class="chips">${x.state !== "open" ? `<span class="st ${TP.STATES[x.state].cls}">${TP.STATES[x.state].label}</span>` : x.commission_ok ? `<span class="chip ok" title="پشتیبانی کمیسیون این قلم را تأیید کرده؛ «خاتمه» آن را می‌بندد">✓ کمیسیون</span>`
          : `<span class="chip" title="تیکِ تأیید کمیسیون فقط در پنل پشتیبانی زده می‌شود">⏳ تأیید پشتیبانی</span>`}
        ${x.state === "open" ? (frozen(x) ? `<span class="chip info" title="ساختار منجمد شد و به کارشناس هوشمند سپرده شد">🔒 منجمد</span>` : normOk(x) ? `<span class="chip ok" title="ساختارِ قلم (نوع، لایه‌ها، نرخ‌ها و قفل‌ها) تأیید شده">🧩 ✓</span>`
          : `<span class="chip warn" title="نرمال‌سازی اجباری است: ساختارِ این قلم هنوز تأیید نشده">🧩 تأیید نشده</span>`) : ""}${pillAi(x)}</span></button>`).join("")}</div>
      <div class="tabs">
        <button class="tab ${S.tab === "history" ? "on" : ""}" data-tab="history">${aiResearch() && !itemFree(it) ? "🔒 " : ["select", "started"].includes(iState(it)) || (iState(it) === "direct" && S.pickOpen[it.id]) ? "🎯 " : ""}بررسی سوابق</button>
        <button class="tab ${S.tab === "smart" ? "on" : ""}" data-tab="smart">${aiResearch() && !itemFree(it) ? "🔒 " : ""}جستجوی هوشمند</button>
        <button class="tab ${S.tab === "quotes" ? "on" : ""}" data-tab="quotes">استعلامات<span class="cnt">${qCount()}</span></button>
        <button class="tab ${S.tab === "comm" ? "on" : ""}" data-tab="comm">جدول کمیسیون</button>
        <button class="tab ${S.tab === "letter" ? "on" : ""}" data-tab="letter">${aiEnd() ? "🔒 " : ""}نامهٔ کمیسیون</button></div>
      ${!it ? `<div class="empty">قلمی ندارد.</div>` : (aiResearch() && ["history", "smart"].includes(S.tab) && !itemFree(it)) || (aiEnd() && S.tab === "letter") ? vAiLetter() : S.tab === "history" ? vHistory(it) : S.tab === "smart" ? vSmart(it) : S.tab === "quotes" ? vQuotes() : S.tab === "letter" ? vLetter() : vComm()}
    </div></div>`;
  }

  /* ---------- «📋 شرایط خرید»ِ هر قلم (طرح «خرید هوشمند» فاز ۴ب گام ۳؛ worker/terms-locks.js) ----------
     کنارِ نوع قلم و لایه‌ها: گزینه‌های تسویه، نوع فاکتور و ارزش افزوده و بازهٔ زمانِ تحویل، هر کدام 🔒 یا 🔓. 🔒 را پنل و بات
     تأمین‌کننده بیرونش نمی‌پذیرند و سرور هم می‌سنجد؛ 🔓 فقط خواستهٔ شرکت است. با اولین ارسال به تأمین‌کننده یا «🚀 شروع» ثابت
     می‌شود. در کارِ کارشناس هوشمند، بسته‌ای که در چارچوبِ همین‌ها باشد همان لحظه تأیید نهایی می‌شود. */
  const TERM_ENUM = { pay: PAYS, invoice: INVT, vat: VATS };
  const TERM_ONE = { place: PLACES, deal: DEALS };
  const TERM_LAB = { pay: "شرایط تسویه", invoice: "نوع فاکتور", vat: "ارزش افزوده", dtime: "زمان تحویل", place: "محل تحویل", deal: "محل معامله", ship: "روش حمل", valid: "اعتبار پیش‌فاکتور", offpf: "پیش‌فاکتورِ رسمی" };
  /* ترتیبِ جدولِ کمیسیون: تسویه، تحویل (زمان و محل)، فاکتور، ارزش افزوده، محل معامله، حمل، اعتبار */
  const TERM_ORDER = ["pay", "dtime", "place", "invoice", "vat", "deal", "ship", "valid", "offpf"];
  /* 🔒 در فیلدهایی که تأمین‌کننده خودش می‌زند یعنی «بیرونش پذیرفته نیست»؛ در شرطِ شرکت (محل، معامله، حمل) یعنی «الزامی»، که پیش‌فاکتور با همان ساخته می‌شود */
  const TERM_LOCK_TIP = { pay: "🔒: تأمین‌کننده فقط همین گزینه‌ها را می‌تواند بزند", invoice: "🔒: تأمین‌کننده فقط همین گزینه‌ها را می‌تواند بزند", vat: "🔒: تأمین‌کننده فقط همین گزینه‌ها را می‌تواند بزند",
    dtime: "🔒: تحویلِ بیرون از بازه پذیرفته نیست", place: "🔒: الزامی — پیش‌فاکتور با همین محل ساخته می‌شود", deal: "🔒: الزامی", ship: "🔒: الزامی", valid: "🔒: اعتبارِ کمتر پذیرفته نیست",
    offpf: "🔒: هنگامِ «📤 ارسال» الزامی است و هوشمند با پیشنهاد سنجیده می‌شود؛ 🔓: خواستهٔ شرکت (پیش از کمیسیون «📨 فراخوان» به‌هرحال می‌خواهدش)" };
  const termsOfItem = (it) => { try { const x = it && it.terms_json ? JSON.parse(it.terms_json) : null; return x && Object.keys(x).length ? x : null; } catch (_) { return null; } };
  const termsDraftOf = (it) => S.termsEd[it.id] || (S.termsEd[it.id] = JSON.parse(JSON.stringify(termsOfItem(it) || {})));
  const termsFixed = (it) => !!(it.sp_lock || frozen(it));
  const jRange = (d) => (d.from && d.to ? `بین ${d.from} و ${d.to}` : d.to ? `حداکثر تا ${d.to}` : d.from ? `از ${d.from} به بعد` : "");
  /** مقدارِ یک شرط (بی برچسب) — خالی یعنی بی قید */
  function termVal(f, v) {
    if (!v) return "";
    if (TERM_ENUM[f]) return (v.opts || []).join(" / ");
    if (f === "dtime") return jRange(v);
    if (TERM_ONE[f]) return v.opt ? `${v.opt}${v.note ? ` — ${v.note}` : ""}` : "";
    if (f === "ship") return String(v.text || "").trim();
    if (f === "valid") return v.min ? `دست‌کم ${M(v.min)} روز` : "";
    if (f === "offpf") return v.on ? "مهر و امضادار" : "";
    return "";
  }
  function termsSummary(L) {
    if (!L) return "";
    return TERM_ORDER.filter((f) => termVal(f, L[f])).map((f) => `${TERM_LAB[f]} ${L[f].lock ? "🔒" : "🔓"} ${termVal(f, L[f])}`).join(" · ");
  }
  /** پیش‌نویس، هم‌شکلِ سرور (terms-locks.js:cleanLimits) — برای «ذخیره نشده» */
  function termsNorm(D) {
    const lat = (s) => String(s == null ? "" : s).replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).trim();
    const out = [];
    for (const f of TERM_ORDER) {
      const v = D && D[f];
      if (!termVal(f, v)) continue;
      const lock = !!v.lock;
      out.push([f, TERM_ENUM[f] ? { opts: v.opts, lock } : f === "dtime" ? { from: v.from || "", to: v.to || "", lock } : TERM_ONE[f] ? { opt: v.opt, note: String(v.note || "").trim(), lock }
        : f === "ship" ? { text: String(v.text).trim(), lock } : f === "offpf" ? { on: true, lock } : { min: Number(lat(v.min)), lock }]);
    }
    return JSON.stringify(out);
  }
  const termsDirty = (it) => !!(it && S.termsEd[it.id]) && termsNorm(S.termsEd[it.id]) !== termsNorm(termsOfItem(it) || {});
  function vTerms(it) {
    if (!it || it.state !== "open") return "";
    const L = termsOfItem(it), ro = termsFixed(it), open = !!S.termsOpen[it.id] && !ro;
    const set = TERM_ORDER.filter((f) => L && termVal(f, L[f]));
    const dirty = termsDirty(it);
    const why = it.sp_lock ? "این قلم برای تأمین‌کننده رفته؛ شرایطش مثلِ ساختارش ثابت است تا همه عینِ همان را بگیرند" : "این قلم به کارشناس هوشمند سپرده شده و منجمد است";
    /* 🔒/🔓ِ عنوان و مقدار برای تأمین‌کننده — کنارِ بقیهٔ قفل‌ها (مهر ۱۴۰۵؛ پیش‌تر در «نرمال‌سازی اقلام»)؛ کلیک همان لحظه ذخیره می‌شود */
    const tq = tqOf(it), tqDis = ro ? "disabled" : "";
    const tqBtn = (k, on, label, tip) => `<button class="tp-btn xs lockbtn ${on ? "on" : ""}" data-tq-lock="${k}" ${tqDis} title="${esc(tip)}">${on ? "🔒" : "🔓"} ${label}</button>`;
    const head = `<div class="toolrow" style="margin:0"><b>📋 شرایط خرید</b>
      ${set.length ? `<span class="chip info">${M(set.length)} شرط</span>` : `<span class="dim" style="font-size:.85rem">${ro ? "بی قید فرستاده شد" : "هنوز شرطی نگذاشته‌اید — تأمین‌کننده هر شرطی را می‌تواند بدهد"}</span>`}
      ${dirty && !open ? `<span class="chip warn">ذخیره نشده</span>` : ""}
      ${tqBtn("title", tq.title, "عنوان", tq.title ? "🔒 تأمین‌کننده عنوان را عوض نمی‌کند — کلیک: باز" : "🔓 تأمین‌کننده می‌تواند عنوان را اصلاح کند — کلیک: قفل")}
      ${tqBtn("qty", tq.qty, `مقدار${it.qty != null ? ` (${M(it.qty)} ${esc(it.unit || "")})` : ""}`, tq.qty ? "🔒 کلِ مقدار لازم است — کلیک: باز" : "🔓 تأمین‌کننده می‌تواند مقدارِ کمتری پیشنهاد دهد — کلیک: قفل")}
      <span style="margin-inline-start:auto"></span>
      ${ro ? `<span class="chip" title="${esc(why)}">🔒 ثابت — ${it.sp_lock ? "فرستاده شده" : "سپرده شده"}</span>`
        : `<button class="tp-btn sm ${set.length ? "" : "primary"}" data-terms-open>${open ? "بستن" : set.length ? "✏️ ویرایشِ شرایط" : "✏️ تعیینِ شرایط"}</button>`}</div>`;
    /* بسته یا ثابت: همان شرط‌ها، فقط‌خواندنی */
    if (!open) {
      return `<div class="terms-box">${head}${set.length ? `<div class="tp-scroll"><table class="tp-table terms-ro" style="width:auto;margin-top:6px"><tbody>
        ${set.map((f) => `<tr><td class="rt"><b>${TERM_LAB[f]}</b></td><td class="rt">${esc(termVal(f, L[f]))}</td><td title="${esc(TERM_LOCK_TIP[f])}">${L[f].lock ? "🔒 الزامی" : "🔓 خواستهٔ شرکت"}</td></tr>`).join("")}
        </tbody></table></div>` : ""}${ro ? `<div class="dim" style="font-size:.8rem;margin-top:4px">${esc(why)}.</div>` : ""}</div>`;
    }
    const D = termsDraftOf(it);
    const lockBtn = (f) => { const x = D[f] || {}; return `<td><button class="tp-btn xs ${x.lock ? "primary" : ""}" data-tm-lock="${f}" title="${esc(TERM_LOCK_TIP[f])} · 🔓: فقط خواستهٔ شرکت">${x.lock ? "🔒 الزامی" : "🔓 خواسته"}</button></td>`; };
    const row = (f) => {
      const x = D[f] || {};
      let cell;
      if (TERM_ENUM[f]) cell = TERM_ENUM[f].map((o) => `<label class="chkline" style="margin-inline-end:10px"><input type="checkbox" data-tm-opt="${f}" value="${esc(o)}" ${(x.opts || []).includes(o) ? "checked" : ""}> ${esc(o)}</label>`).join("")
        /* «قیمتِ نقدی و اعتباری»: با «اعتباری» از تأمین‌کننده قیمتِ جدا برای نقد (اگر تیک خورده) و اعتباریِ ۱ و ۲ ماهه خواسته می‌شود */
        + (f === "pay" && (x.opts || []).includes("اعتباری") ? `<div class="dim" style="font-size:.78rem;flex-basis:100%">💳 تأمین‌کننده ${(x.opts || []).includes("نقدی") ? "قیمتِ نقد و " : ""}قیمتِ اعتباریِ ۱ و ۲ ماهه را جدا می‌دهد (با درصدِ افزایش و ماشین‌حساب)؛ ${x.lock ? "🔒 همه الزامی‌اند" : "🔓 هر کدام که دارد"}.</div>` : "");
      else if (f === "dtime") {
        cell = `از <input class="tp-input num" data-tm-dt="from" value="${esc(x.from || "")}" placeholder="اختیاری" style="width:120px" readonly>
          تا <input class="tp-input num" data-tm-dt="to" value="${esc(x.to || "")}" placeholder="📅 انتخاب تاریخ" style="width:130px" readonly>
          <button class="tp-btn xs" data-tm-dtclr title="بازهٔ تحویل پاک شود">پاک</button>`;
      } else if (TERM_ONE[f]) {
        cell = `<select class="tp-input" data-tm-one="${f}" style="min-width:140px"><option value="">— بی قید —</option>${TERM_ONE[f].map((o) => `<option ${x.opt === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>
          ${f === "place" ? `<input class="tp-input" data-tm-note value="${esc(x.note || "")}" placeholder="نشانی یا توضیح (برای «سایر» لازم)" style="min-width:220px;flex:1">` : ""}`;
      } else if (f === "ship") cell = `<input class="tp-input" data-tm-ship value="${esc(x.text || "")}" placeholder="مثلاً حمل با فروشنده تا محل پروژه" style="min-width:260px;width:100%">`;
      else if (f === "offpf") cell = `<label class="chkline"><input type="checkbox" data-tm-offpf ${x.on ? "checked" : ""}> مهر و امضای فروشنده لازم است</label>`;
      else cell = `دست‌کم <input class="tp-input num" data-tm-valid value="${esc(x.min == null ? "" : x.min)}" inputmode="numeric" placeholder="۷" style="width:70px"> روز`;
      return `<tr><td class="rt"><b>${TERM_LAB[f]}</b></td><td class="rt"><div class="terms-cell">${cell}</div></td>${lockBtn(f)}</tr>`;
    };
    return `<div class="terms-box">${head}
      <div class="tp-scroll"><table class="tp-table" style="width:auto;margin-top:8px"><tbody>${TERM_ORDER.map(row).join("")}</tbody></table></div>
      <div class="dim" style="font-size:.8rem;margin:6px 0">خالی = بی قید · 🔒 الزامی · 🔓 خواستهٔ شرکت. همهٔ این‌ها زیرِ هر قلمِ پیامِ استعلام برای تأمین‌کننده می‌رود و پیش‌فاکتورِ سامانه محل تحویل، محل معامله و روش حمل را از همین‌جا می‌گیرد. ${TP.ui.info("expert.terms", "راهنمای شرایط خرید")}</div>
      <div class="toolrow" style="margin:0"><button class="tp-btn primary sm" data-terms-save>💾 ذخیرهٔ شرایط</button><button class="tp-btn sm" data-terms-reset>برگرداندن</button>${dirty ? `<span class="chip warn">ذخیره نشده</span>` : ""}</div></div>`;
  }
  /* قفلِ عنوان و مقدار: ساختارِ تأییدشده (norm_json.locks)، وگرنه پیش‌نویسِ ویرایشگر (با «تأیید» می‌رود)؛ پیش‌فرض 🔒 */
  function tqOf(it) {
    const n = S.norm[it.id];
    if (!normOk(it) && n && n.draft) return { title: n.draft.tl !== false, qty: n.draft.ql !== false };
    let lk = null; try { lk = (JSON.parse(it.norm_json || "null") || {}).locks || null; } catch (_) { lk = null; }
    return { title: !(lk && lk.title === false), qty: !(lk && lk.qty === false) };
  }
  /* هم‌گام کردنِ پیش‌نویس و مبنای ویرایشگر، تا «تغییرات ذخیره نشده» دروغ نگوید */
  const tqSync = (it, k, v) => {
    const n = S.norm[it.id]; if (!n || !n.draft) return;
    n.draft[k === "title" ? "tl" : "ql"] = v;
    try { const b = JSON.parse(n.base); b[k === "title" ? "tl" : "ql"] = v; n.base = JSON.stringify(b); } catch (_) { /* مبنای خراب */ }
    if (n.data) n.data.locks = { ...(n.data.locks || {}), [k]: v };
  };
  async function tqToggle(it, k) {
    const v = !tqOf(it)[k];
    if (!normOk(it)) {
      const n = S.norm[it.id];
      if (!n || !n.draft) { TP.modal("اول ساختار", "ساختارِ این قلم هنوز خوانده نشده؛ در «بررسی سوابق» ساختار را ببینید، بعد قفل را بزنید.", null, "باشد", ""); return; }
      n.draft[k === "title" ? "tl" : "ql"] = v; render(); return;
    }
    try {
      const r = await TP.api(`/items/${it.id}/locks`, { method: "PUT", body: { [k]: v } });
      it.norm_json = JSON.stringify(r.norm);
      const row = items().find((x) => x.id === it.id); if (row && row !== it) row.norm_json = it.norm_json;
      tqSync(it, k, v);
      render();
      okTick(v ? "قفل شد" : "باز شد");
    } catch (e) { TP.modal("ذخیره نشد", esc(e.message), null, "باشد", ""); }
  }
  async function saveTermsUI(it, then) {
    const D = termsDraftOf(it);
    try {
      const r = await TP.api(`/items/${it.id}/terms`, { method: "PUT", body: D });
      it.terms_json = r.terms ? JSON.stringify(r.terms) : null;
      delete S.termsEd[it.id]; S.termsOpen[it.id] = false;
      render();
      okTick("شرایط ذخیره شد");
      if (then) then();
    } catch (e) { TP.modal("ذخیره نشد", esc(e.message), null, "باشد", ""); }
  }

  /* ---------- «🎯 فهرست دعوت»ِ هر قلم و «🚀 شروع» (طرح «خرید هوشمند» فاز ۴ب گام ۲؛ worker/ai-picks.js) ----------
     کارشناس هوشمند دیگر خودش تأمین‌کننده برنمی‌گزیند و جستجو نمی‌کند: برای هر قلم فهرستی به ترتیبِ رتبهٔ نهایی و «قاعدهٔ دعوت»
     می‌آید و پنج نفر اول (★) از پیش تیک خورده‌اند. «انتخاب کارشناس»: تیک‌ها کم و زیاد، برداشتنِ پنج نفر اول با توضیح کنار همان نام؛
     «سپردن یا برگشت»: همان فهرست — «🤖 سپردن» یا «↩️ برگرداندن به مدیر»؛ «مستقیم»: اگر خواستید بسپارید، آزاد و بی توضیح.
     «🚀 شروع» ساختارِ همین قلم را منجمد و قلم را به کارشناس هوشمند می‌سپارد؛ او فقط تیک‌خورده‌هایی را دعوت می‌کند که شمارهٔ
     پنلِ تیک‌خورده دارند. از «جستجوی هوشمند» فقط با «🎯 به فهرست دعوت»؛ انتخابِ تازه بعد از شروع با «📨 دعوت از انتخاب‌های تازه». */
  const PK_ST = { sent: ["ok", "📨 دعوت شد"], human: ["", "💬 گفت‌وگوی خودِ شما"], queued: ["info", "⏳ در صفِ دعوت"], nophone: ["warn", "⏸ منتظرِ شمارهٔ پنل"], draft: ["", "🆕 هنوز سپرده نشده"], off: ["", "—"] };
  const PK_THEN = { type: "بعد «نوع قلم» به ترتیبِ رتبهٔ نهایی", exact: "بعد باقیِ «عین قلم»، بعد «نوع قلم»", exactOnly: "فقط «عین قلم»" };
  /* همان کلیدِ نامِ سرور (sp-core.js:nkey): ی و ک، نیم‌فاصله و فاصله‌های پیاپی، کوچک‌حرف */
  const pkKey = (x) => String(x == null ? "" : x).trim().replace(/[ي]/g, "ی").replace(/[ك]/g, "ک").replace(/‌/g, " ").replace(/\s+/g, " ").toLowerCase();
  /** فهرستِ دعوت برای این قلم معنا دارد؟ — منتظرِ شروع، سپرده‌شده، یا «مستقیم»ی که کارشناس می‌خواهد بسپارد */
  const pkOn = (it) => { const st = iState(it); return st === "select" || st === "started" || (st === "direct" && !!S.pickOpen[it.id]); };
  /** فهرست کم و زیاد می‌شود؟ («سپردن یا برگشت» نه) */
  const pkEditable = (it) => { const P = it && S.picks[it.id]; return !!it && pkOn(it) && !!P && P !== "loading" && !P.err && !P.pending && P.mode !== "handoff"; };
  const pkHas = (it, name) => { const P = S.picks[it.id]; return !!(P && P.list && P.list.some((e) => e.k === pkKey(name))); };
  async function loadPicks(it, force) {
    if (!it || (!force && S.picks[it.id] !== undefined)) return;
    S.picks[it.id] = "loading";
    try { S.picks[it.id] = await TP.api(`/items/${it.id}/picks`); }
    catch (e) { S.picks[it.id] = { err: e.message, need_norm: !!(e.data && e.data.need_norm) }; }
    render();
  }
  async function pkEdit(it, body) {
    delete S.pkMsg[it.id]; delete S.pkWarn[it.id];
    try { S.picks[it.id] = await TP.api(`/items/${it.id}/picks`, { method: "PUT", body }); }
    catch (e) { TP.modal("ذخیره نشد", esc(e.message), null, "باشد", ""); return loadPicks(it, true); }
    render();
  }

  /* ---------- «🧭 چینش گسترده / محتاط» (درخواست مالک، مهر ۱۴۰۵) ----------
     پیش‌تر بعد از «استعلام محتاط را بچین» راهِ برگشت نبود. حالا دو گزینهٔ ثابت همیشه پیداست (بالای فهرست و در صفحهٔ «🧭 استراتژی
     استعلام»): گزینهٔ روشن همان چینشِ فعلی است (pick_json.strategy.variant)، «پیشنهادِ سامانه» گزینهٔ خانوادهٔ پیش‌فرضِ نوع قلم، و هر زدن
     تیک‌ها را همان لحظه با برنامهٔ موتور از نو می‌چیند (PUT picks {strategy: {variant}}؛ worker/cr-engine.js:headPolicy). اگر تیکی از آخرین
     چینش دستی عوض شده، اول یک خطِ هشدار — تا کارِ دستیِ کارشناس بی‌صدا دور ریخته نشود. */
  const VARS = ["broad", "cautious"];
  const VAR_TIP = { broad: "رقابت با بیشترین گیرندهٔ مجاز در ردهٔ همین قلم", cautious: "کم‌شمار، یکی در هر بازار، دو موج و افشای کم — برای بازارِ کمیاب یا متمرکز" };
  const FAM_FA = { max: "حداکثری", cautious: "محتاط", special: "ویژه" };
  /* نامِ دو چینش، حالت‌های استعلام و کلاس‌های بازار (همان worker/cr-engine.js:MODE_FA و strategy/config.js:MS_NAMES) — strategy-view.js،
     مشترکِ پنل و مکاتبات، تا «📘 سند راهبرد» در هر دو یک نما باشد */
  const { VAR_FA, MODE_FA, MS_FA } = TP.stratView;
  /** «؟»ِ کوچکِ واژه‌نامه کنارِ یک نام (help-content.js، کلیدهای gl.*) — فقط اگر آن اصطلاح در راهنما هست */
  const glq = (key, name) => { const T = key && window.TP_HELP && window.TP_HELP.topics; return T && T[key] ? TP.ui.info(key, `«${name || T[key].title}» چیست؟`, "sm") : ""; };
  /** گزینهٔ چیده‌شده — فهرست‌های پیش از این تغییر فقط پرچمِ cautious یا خانوادهٔ برنامه را دارند */
  const pkVarOf = (P) => { const SG = P && P.strategy; return !SG ? null : VARS.includes(SG.variant) ? SG.variant : SG.cautious || SG.family === "cautious" ? "cautious" : "broad"; };
  const pkRecOf = (P) => (P && P.cr ? P.cr.recommended || (P.cr.family === "cautious" ? "cautious" : "broad") : null);
  /** تیک‌ها از آخرین چینش دستی عوض شده‌اند؟ (چینشِ استراتژی: تیک ≠ برنامه؛ فهرستِ سوابق: تیک ≠ پیش‌تیک) — سپرده‌شده‌ها نه */
  const pkManual = (P) => !!P && (P.list || []).some((e) => !e.go && !!e.on !== !!(P.strategy ? e.strat : e.top));
  /** دو گزینهٔ ثابت؛ attr: نامِ data-attribute دکمه‌ها (فهرست یا صفحهٔ استراتژی) */
  const varSeg = (P, attr, busy) => {
    const cur = pkVarOf(P), rec = pkRecOf(P);
    return `<span class="tp-seg sm" role="radiogroup" aria-label="چینشِ فهرستِ دعوت">${VARS.map((v) => `<button type="button" role="radio" aria-checked="${cur === v}" class="${cur === v ? "on" : ""}" ${attr}="${v}" title="${esc(VAR_TIP[v])}" ${busy ? "disabled" : ""}>${VAR_FA[v]}${rec === v ? ` <span class="tp-seg-tag">پیشنهادِ سامانه</span>` : ""}</button>`).join("")}</span>`;
  };
  /** خطِ وضعیتِ زیرِ دو گزینه: در حالِ چیدن، هشدارِ تیکِ دستی (با «بچین / انصراف»)، نتیجهٔ آخرین چیدن، یا راهنمای یک‌خطی */
  function varLine(it, P) {
    const busy = S.pkBusy[it.id], warn = S.pkWarn[it.id], msg = S.pkMsg[it.id], cur = pkVarOf(P);
    if (busy) return `<span class="dim">⏳ چیدن با «${VAR_FA[busy]}»…</span>`;
    if (warn) return `<span class="pk-warn">⚠️ ${warn === cur ? `تیک‌ها به «${VAR_FA[warn]}» برمی‌گردند و تغییرهای دستیِ شما کنار می‌رود.` : `تیک‌هایی که دستی عوض کرده‌اید با «${VAR_FA[warn]}» از نو چیده می‌شوند.`}
      <button type="button" class="tp-btn xs primary" data-pkvar-go="${warn}">بچین</button> <button type="button" class="tp-btn xs" data-pkvar-no>انصراف</button></span>`;
    if (msg) return `<span class="${msg.bad ? "pk-bad" : "pk-ok"}">${esc(msg.t)}</span>`;
    return `<span class="dim">${cur ? `تیک‌ها با «${VAR_FA[cur]}» چیده شده‌اند؛ هر تیکِ دیگر علت می‌خواهد.` : "فهرست از سوابق است؛ با زدنِ یکی از دو گزینه، تیک‌ها با برنامهٔ بازار چیده می‌شوند."}</span>`;
  }
  /* صفحهٔ «🧭 استراتژی استعلام» وقتی باز است، با هر تغییرِ چینش خودش را هم از نو می‌کشد */
  let pkStratPaint = null;
  const pkPaint = () => { render(); if (pkStratPaint) pkStratPaint(); };
  /** زدنِ یکی از دو گزینه: تیکِ دستی ← اول هشدار؛ گزینهٔ فعلیِ بی تغییر ← فقط یک خط؛ وگرنه همان لحظه چیده می‌شود */
  function pkVarPress(it, v, sure) {
    const P = S.picks[it.id]; if (!P || !VARS.includes(v) || S.pkBusy[it.id]) return;
    delete S.pkMsg[it.id];
    if (!sure && pkManual(P)) { S.pkWarn[it.id] = v; return pkPaint(); }
    delete S.pkWarn[it.id];
    if (!sure && v === pkVarOf(P)) { S.pkMsg[it.id] = { t: `تیک‌ها همین حالا با «${VAR_FA[v]}» چیده شده‌اند.` }; return pkPaint(); }
    return pkVarApply(it, v);
  }
  async function pkVarApply(it, v) {
    delete S.pkWarn[it.id]; delete S.pkMsg[it.id]; S.pkBusy[it.id] = v; pkPaint();
    try {
      const r = await TP.api(`/items/${it.id}/picks`, { method: "PUT", body: { strategy: { variant: v } } });
      S.picks[it.id] = r;
      S.pkMsg[it.id] = { t: `✓ تیک‌ها با «${VAR_FA[v]}» چیده شد — ${M(((r.strategy || {}).wave1 || []).length)} گیرندهٔ موج اول.` };
    } catch (e) { S.pkMsg[it.id] = { t: `⛔ چیده نشد: ${e.message}`, bad: true }; }
    delete S.pkBusy[it.id]; pkPaint();
  }
  /** همان دو گزینه بالای «🎯 فهرست دعوت» (جای نوارِ «این قلم کمیاب است… بچینم؟» و «🧭 تیک‌ها با استراتژیِ…») */
  function pkVarHtml(it, P) {
    const SG = P.strategy, mode = SG ? SG.mode : P.cr.mode, modeFa = (SG ? SG.mode_fa : P.cr.mode_fa) || MODE_FA[mode] || "";
    const notes = SG ? (SG.notes || []).concat(SG.relaxations || []) : [];
    return `<div class="pk-strat">${varSeg(P, "data-pkvar", !!S.pkBusy[it.id])}
      <span class="pk-mode"><span class="chip">${esc(modeFa)}</span>${glq(`gl.mode.${mode}`, modeFa)}</span>
      <span class="pk-line" aria-live="polite">${varLine(it, P)}</span>
      ${notes.length ? TP.ui.det({ key: `pkn-${it.id}`, sub: `یادداشت‌های چینش ${M(notes.length)}`, tabs: [{ k: "n", t: "یادداشت‌های چینش", html: `<ul>${notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` }] }) : ""}</div>`;
  }
  /** توضیح‌هایی که در خانه‌ها نوشته شده ولی هنوز ذخیره نشده‌اند (پیش از «شروع») */
  async function pkFlushWhy(it) {
    const P = S.picks[it.id]; if (!P || !P.list) return;
    const why = {};
    document.querySelectorAll("[data-pkwhy]").forEach((x) => { const e = P.list.find((y) => y.k === x.dataset.pkwhy); if (e && (e.why || "") !== x.value.trim()) why[e.k] = x.value; });
    if (Object.keys(why).length) S.picks[it.id] = await TP.api(`/items/${it.id}/picks`, { method: "PUT", body: { why } });
  }
  function vPicks(it) {
    if (!flow2() || !it || it.state !== "open" || !pkOn(it)) return "";
    if (!normOk(it)) return `<div class="picks"><b>🎯 فهرست دعوت</b> <span class="dim">— بعد از تأییدِ ساختار</span></div>`;
    const P = S.picks[it.id];
    if (P === undefined) loadPicks(it);
    if (!P || P === "loading") return `<div class="picks"><b>🎯 فهرست دعوت</b> <span class="dim">— در حال ساختن از سوابق…</span></div>`;
    if (P.err) return `<div class="picks"><b>🎯 فهرست دعوت</b> <span class="chip warn">${esc(P.err)}</span> <button class="tp-btn xs" data-pkreload>دوباره</button></div>`;
    if (P.pending) return `<div class="picks"><b>🎯 فهرست دعوت</b> <span class="dim">— در حال ساختن؛ کمی بعد ↻ بزنید</span></div>`;
    const A_ = P.mode === "handoff", D_ = P.mode === "direct", started = !!P.started_at, L = P.list || [];
    const on = L.filter((e) => e.on), ready = on.filter((e) => e.panel || e.st === "sent").length;
    const miss = P.mode === "pick" && !started ? L.filter((e) => e.top && !e.on && !String(e.why || "").trim()) : [];
    const r = P.rule || {};
    const tiers = ["A", "B", "C"].filter((g) => r.tier && r.tier[g] > 0).map((g) => `ردهٔ ${g} «عین قلم» تا ${M(r.tier[g])} نفر`).join("، ");
    const rule = `قاعدهٔ دعوت: ${tiers ? `${tiers}، ` : ""}${PK_THEN[r.then] || PK_THEN.type}`;
    const help = A_ ? "«سپردن یا برگشت»: فهرست همان رتبه‌بندیِ کارشناس هوشمند است و عوض نمی‌شود — «🤖 سپردن» یا «↩️ برگرداندن به مدیر»."
      : D_ ? "«مستقیم»: تیک‌ها آزادند و توضیح نمی‌خواهند."
      : "«انتخاب کارشناس»: تیک‌ها را کم و زیاد کنید؛ برداشتنِ هر کدام از نفراتِ پیش‌تیک (★ — به شمارِ حداقلِ استعلامِ ردهٔ قلم) یک توضیحِ کوتاه کنار همان نام می‌خواهد. افزودن توضیح نمی‌خواهد.";
    const phCell = (e) => (e.panel
      ? `<button class="tp-btn xs" data-pkph="${esc(e.k)}" title="${esc(e.phones.filter((p) => p.panel).map((p) => p.phone + (p.label ? ` (${p.label})` : "")).join("، "))}">☑️ ${M(e.panel)} شمارهٔ پنل</button>`
      : `<button class="tp-btn xs ${e.on ? "warn" : ""}" data-pkph="${esc(e.k)}" title="کارشناس هوشمند فقط به شمارهٔ پنلِ تیک‌خورده پیامک می‌دهد">📱 ${e.phones.length ? "تیکِ پنل" : "شماره"}</button>`);
    const stCol = started || L.some((e) => e.go || e.st === "human");
    /* «🧭 استراتژی استعلام» چیده شده: تیکِ متفاوت با برنامه علت می‌خواهد (جعبه، و برای «دیگر» متن) */
    const SG = P.strategy || null;
    if (S.crReg === undefined && TP.supProfile) { S.crReg = null; TP.supProfile.enabled().then((v) => { S.crReg = v; if (v) render(); }); }
    const devOf = (e) => !!SG && P.mode === "pick" && !started && !e.go && !!e.on !== !!e.strat;
    const row = (e) => {
      const lock = A_ || !!e.go || e.st === "sent";
      const [cls, lab] = PK_ST[e.st] || ["", ""];
      const why = SG ? devOf(e) : P.mode === "pick" && e.top && !e.on && !started;
      return `<tr class="${e.top ? "top" : ""} ${e.on ? "" : "off"} ${why ? "need" : ""}">
        <td><input type="checkbox" data-pk="${esc(e.k)}" ${e.on ? "checked" : ""} ${lock ? "disabled" : ""} title="${e.go ? "به کارشناس هوشمند سپرده شده" : A_ ? "در «سپردن یا برگشت» عوض نمی‌شود" : "دعوت شود؟"}"></td>
        <td class="num">${e.pos ? M(e.pos) : "—"}${e.top ? " ★" : ""}${e.rankF != null && e.rankF !== e.pos ? `<sup class="rk" title="رتبهٔ نهایی در سوابق">${M(e.rankF)}</sup>` : ""}</td>
        <td class="rt"><b>${esc(e.name)}</b>${S.crReg && TP.supProfile ? ` ${TP.supProfile.btn(e.name, { sid: e.reg, head: P.head })}` : ""}${e.src === "strategy" || e.hub ? ` <span class="dim" style="font-size:.78rem" title="بازار یا پاساژ">${esc(e.hub || "")}</span>` : ""}${(() => { const ph = (e.phones || []).find((p) => p.panel) || (e.phones || [])[0]; return ph ? ` <span class="dim num pk-ph" dir="ltr" title="${ph.panel ? "شمارهٔ پنل" : "شماره (بی تیکِ پنل)"}">${esc(ph.phone)}</span>` : ""; })()}${!e.pos && !e.go && !A_ ? ` <button class="tp-btn xs" data-pkdel="${esc(e.k)}" title="از فهرست برداشته شود">✕</button>` : ""}
          ${why && SG ? `<div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap"><select class="tp-input" data-pkbox="${esc(e.k)}" style="min-width:170px"><option value="">علت (اجباری)</option>${(P.why_boxes || []).map((b) => `<option ${e.why_box === b ? "selected" : ""}>${esc(b)}</option>`).join("")}</select>
              <input class="tp-input" data-pkwhy="${esc(e.k)}" value="${esc(e.why || "")}" placeholder="${e.why_box === "دیگر" ? "توضیح (اجباری)" : "توضیح (اختیاری)"}" style="flex:1;min-width:160px"></div>`
            : why ? `<div style="margin-top:4px"><input class="tp-input" data-pkwhy="${esc(e.k)}" value="${esc(e.why || "")}" placeholder="علتِ برداشتن (اجباری)" style="width:100%;min-width:200px"></div>`
            : e.why || e.why_box ? `<div class="dim" style="font-size:.8rem;margin-top:2px;white-space:normal">علت: ${esc([e.why_box, e.why].filter(Boolean).join(" — "))}</div>` : ""}</td>
        <td><span class="chip">${esc(e.src_fa || "")}</span>${e.wave ? ` <span class="chip info" title="کارشناس هوشمند خودکار دعوت کرد: قلم کمتر از حداقلِ استعلامِ ردهٔ خودش پیشنهاد داشت">📨 موج ${M(e.wave + 1)}</span>` : ""}${e.grade ? ` <span class="chip grade g${esc(e.grade)}" title="رده">${esc(e.grade)}</span>` : ""}</td>
        <td>${phCell(e)}</td>
        ${stCol ? `<td>${e.st !== "off" && (started || e.go || e.st === "human") ? `<span class="chip ${cls}">${lab}</span>` : `<span class="dim">—</span>`}</td>` : ""}</tr>`;
    };
    const fresh = P.fresh || 0;
    const startBtn = !started
      ? `<button class="tp-btn primary" data-pkstart ${on.length ? "" : "disabled"} title="${on.length ? "پیش‌نمایشِ پیام و شرایط را می‌بینید و با «تأیید» ساختارِ همین قلم منجمد و قلم به کارشناس هوشمند سپرده می‌شود" : "دست‌کم یک تأمین‌کننده را تیک بزنید"}">${A_ ? "🤖 سپردن…" : "🚀 شروعِ دعوت…"}</button>`
      : fresh ? `<button class="tp-btn primary" data-pkstart title="انتخاب‌های تازه به کارشناس هوشمند سپرده می‌شوند">📨 دعوت از انتخاب‌های تازه (${M(fresh)})…</button>` : "";
    /* گام‌های پیش از شروع، پایینِ فهرست — کارشناس می‌بیند چه مانده و دکمهٔ آخر همان‌جاست */
    const TL_ = termsOfItem(it), nT = TERM_ORDER.filter((f) => TL_ && termVal(f, TL_[f])).length;
    const steps = !started && !A_ ? `<div class="pk-steps">
        <span class="pk-st ok">① 🧩 ساختار ✓</span>
        <button type="button" class="pk-st ${termsDirty(it) ? "warn" : nT ? "ok" : ""}" data-pkterms title="شرایطِ خرید زیرِ هر قلمِ پیامِ استعلام برای همه می‌رود">② 📋 شرایط خرید: ${termsDirty(it) ? "ذخیره نشده" : nT ? `${M(nT)} شرط ✓` : "بی قید — تعیین؟"}</button>
        <span class="pk-st ${on.length ? "ok" : "warn"}">③ 🎯 ${M(on.length)} تیک‌خورده${miss.length ? " — علت لازم" : ""}</span>
        ${P.first_msg && on.length ? `<button type="button" class="pk-st" data-pkfm title="متنِ نخستین پیامِ هر گیرنده">④ ✉️ دیدنِ پیام اول</button>` : `<span class="pk-st">④ ✉️ پیام دعوت: قالبِ استاندارد</span>`}
        <span style="margin-inline-start:auto"></span>${startBtn}</div>` : started && fresh ? `<div class="pk-steps"><span style="margin-inline-start:auto"></span>${startBtn}</div>` : "";
    return `<div class="picks">
      <div class="toolrow"><b style="font-size:1.02rem">🎯 فهرست دعوتِ کارشناس هوشمند</b>
        <span class="chip ${A_ ? "info" : ""}" title="حالتِ نوع قلمِ «${esc(P.head || "—")}» در پنل پشتیبانی">${esc(P.mode_fa || "")}</span>
        ${started ? `<span class="chip ok" title="${TP.fmt(P.started_at)}">🚀 سپرده شد</span>` : ""}
        <span class="chip">${M(on.length)} تیک‌خورده · ${M(ready)} با شمارهٔ پنل</span>
        <span style="margin-inline-start:auto"></span>
        ${P.cr && !started && !A_ ? `<button class="tp-btn sm" data-pkstrat title="سیاستِ استعلامِ این نوع قلم و برنامهٔ گیرندگان روی گراف (کمیاب یا گسترده)">🧭 استراتژی استعلام</button>` : ""}
        ${P.doc && P.head ? `<button class="tp-btn sm" data-pkdoc title="${started ? "سندِ راهبردِ این نوع قلم — فقط‌خواندنی: همان سندی که کارشناس هوشمند با آن مذاکره می‌کند" : "سندِ راهبردِ این نوع قلم — پیش از «🚀 شروع» بازبینی و تأیید می‌شود"}">📘 سند راهبرد${started ? " 🔒" : ""}</button>` : ""}
        ${P.first_msg && on.length && (!started || fresh) ? `<button class="tp-btn sm" data-pkfm title="متنِ نخستین پیامِ هر تیک‌خورده: قالبِ درخواست، یا قالب و متنِ جدا برای هر تأمین‌کننده — با پیش‌نمایش">✉️ پیام اول</button>` : ""}
        ${!started && !A_ ? `<button class="tp-btn sm" data-pkrebuild title="فهرست از سوابقِ امروز دوباره ساخته می‌شود؛ تیک‌ها به پیش‌فرض برمی‌گردند و افزوده‌های شما می‌مانند">↻ بازسازی</button>` : ""}
        ${!A_ ? `<button class="tp-btn sm" data-pkadd title="تأمین‌کنندهٔ دیگری به فهرست؛ از جستجوی هوشمند با «🎯 به فهرست دعوت» در همان تب">➕ افزودن</button>` : ""}
        ${!started && !D_ ? `<button class="tp-btn sm warn" data-pkback title="این قلم را با علت به مدیر برگردانید تا خودتان انجام دهید">↩️ برگرداندن به مدیر</button>` : ""}
        ${startBtn}</div>
      <div class="pk-rule"><span class="chip" title="${esc(help)}">${esc(rule)}</span>${P.n ? `<span class="dim">${M(P.n)} تأمین‌کننده در سوابق</span>` : ""}${TP.ui.info("expert.picks", "راهنمای فهرست دعوت")}</div>
      ${P.cr && !started && !A_ ? pkVarHtml(it, P)
        : SG ? `<div class="pk-strat"><span class="dim">🧭 تیک‌ها با «${VAR_FA[pkVarOf(P)]}» چیده شد — ${esc(SG.mode_fa || "")}${glq(`gl.mode.${SG.mode}`, SG.mode_fa)} · ${M(SG.n_wave1)} گیرندهٔ موج اول${SG.dominant_hub ? `، بازارِ غالب «${esc(SG.dominant_hub)}»` : ""}</span>
          ${(SG.notes || []).concat(SG.relaxations || []).length ? TP.ui.det({ key: `pkn-${it.id}`, sub: `یادداشت‌های چینش ${M((SG.notes || []).concat(SG.relaxations || []).length)}`, tabs: [{ k: "n", t: "یادداشت‌های چینش", html: `<ul>${(SG.notes || []).concat(SG.relaxations || []).map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` }] }) : ""}</div>` : ""}
      ${P.msg && !L.length ? `<div class="tp-note warn">${esc(P.msg)}</div>` : ""}
      ${L.length ? `<div class="tp-scroll"><table class="tp-table" style="width:100%"><thead><tr><th title="تیک = پیامِ دعوت می‌رود">دعوت</th><th title="★ = پیش‌تیک؛ برداشتنش علت می‌خواهد">#</th><th class="rt">تأمین‌کننده</th><th>از</th><th>شمارهٔ پنل</th>${stCol ? "<th>وضعیت</th>" : ""}</tr></thead>
        <tbody>${L.map(row).join("")}</tbody></table></div>`
        : `<div class="empty">فهرستی از سوابق نیامد${A_ ? " — در «سپردن یا برگشت» فقط «↩️ برگرداندن به مدیر» می‌ماند" : " — از «➕ افزودن» یا «جستجوی هوشمند» تأمین‌کننده بیفزایید"}.</div>`}
      ${miss.length ? `<div class="tp-note warn" style="margin-top:8px">برای «شروع»، علتِ برداشتنِ ${miss.map((e) => `«${esc(e.name)}»`).join("، ")} را کنار همان نام بنویسید.</div>` : ""}
      ${steps}</div>`;
  }
  /* «🧭 استراتژی استعلام» (سند طراحی، بخش ۴؛ صفحهٔ خلاصه و تیتروار — درخواست مالک، مهر ۱۴۰۵: خواندنِ صفحه حداکثر دو سه دقیقه):
     بالا همان دو گزینهٔ ثابتِ «چینش گسترده / محتاط» (هر زدن تیک‌ها را از نو می‌چیند)، بعد نامِ حالت و خانواده با «؟» (واژه‌نامه)، یک
     خطِ «چرا»، چهار نکتهٔ تیتروار و گیرندگانِ موج اول. چرایی (با برنامهٔ گزینهٔ دیگر)، قاعده‌های پخش و افشا، و داده و اطمینان زیرِ
     «≡ جزئیات». برنامهٔ هر دو گزینه یک بار از worker/cr-engine.js (بی مدل) خوانده می‌شود تا رفت‌وبرگشت فوری باشد. */
  const VER_FA = { 2: "✔ تأییدشده", 1: "هویت قابل احراز", 0: "هنوز راستی‌آزمایی نشده" };
  /** دلیلِ موتور بی ارجاع‌های درونِ پرانتز (S-02، SRC-06 ص ۱۷…) برای خطِ «چرا»؛ متنِ کامل زیرِ «≡ جزئیات» */
  const whyShort = (s) => String(s || "").replace(/\s*\([^()]*\)/g, "").trim();
  async function pkStratUI(it) {
    const P = S.picks[it.id]; if (!P || !P.head) return;
    const q = (v) => `/cr/plan?head=${encodeURIComponent(P.head)}${it.code ? `&code=${encodeURIComponent(it.code)}` : ""}&variant=${v}`;
    const b = TP.busy("🧭 استراتژی استعلام", esc(P.head));
    const plans = {};
    try { [plans.broad, plans.cautious] = await Promise.all(VARS.map((v) => TP.api(q(v)))); }
    catch (e) { b.close(); return TP.modal("نشد", esc(e.message), null, "باشد", ""); }
    b.close();
    const m = TP.modal(`🧭 استراتژی استعلام — ${esc(P.head)}`, `<div class="st-page" data-strat></div>`, null, "بستن", "");
    const box = m.querySelector("[data-strat]"), dk = `st-${it.id}-${Date.now()}`;
    const close = () => { if (pkStratPaint === paint) pkStratPaint = null; m.remove(); };
    /* تنها کارِ اصلیِ صفحه زدنِ یکی از دو گزینه است؛ «بستن» دکمهٔ معمولی */
    const y = m.querySelector("[data-y]"); if (y) { y.classList.remove("primary"); y.onclick = close; }
    m.onclick = (e) => { if (e.target === m) close(); };
    const li = (a) => (a && a.length ? `<ul>${a.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : "");
    const dh = (t) => `<span class="dh">${t}</span>`;
    const who = (x) => `<li>${esc(x.name)}${x.incumbent ? ` <span class="chip">${x.trusted ? "فعلیِ معتمد" : "فعلی"}</span>` : ""}${x.hub ? ` <span class="dim">${esc(x.hub)}</span>` : ""}${!x.incumbent && VER_FA[x.verification] ? ` <span class="chip ${x.verification >= 2 ? "ok" : "warn"}">${VER_FA[x.verification]}</span>` : ""}</li>`;
    function paint() {
      if (!m.isConnected) { if (pkStratPaint === paint) pkStratPaint = null; return; }
      /* گزینهٔ چیده‌شده؛ پیش از نخستین چیدن، برنامهٔ «پیشنهادِ سامانه» */
      const P1 = S.picks[it.id] || P, cur = pkVarOf(P1), shown = cur || plans.broad.recommended || "broad", other = shown === "broad" ? "cautious" : "broad";
      const d = plans[shown], od = plans[other], pol = d.policy, dist = pol.distribution || {}, dis = pol.disclosure || {}, pl = d.plan || {};
      const facts = [
        ["👥", "موج اول", `${M(pol.n_wave1)} گیرنده، سقف ${M(pol.n_max)} · ردهٔ ${esc(pol.tier || "")}`],
        ["🗺", "پخش", `${dist.max_per_hub ? `از هر بازار حداکثر ${M(dist.max_per_hub)}` : "حداکثر نیمی از یک بازار"}، دست‌کم ${M(dist.min_markets)} بازار${dist.need_outsider ? "، یکی بیرون از بازارِ غالب" : ""}`],
        ["🔒", "افشا", `${/^بازه/.test(dis.quantity || "") ? "مقدار به‌صورتِ بازه" : "مقدارِ کامل"}؛ ${dis.urgency === "هرگز" ? "فوریت گفته نمی‌شود" : "فقط تاریخِ تحویل"}${dis.text_variation ? "؛ متنِ هر گیرنده جدا" : ""}`],
        ["⏱", "موج دوم", pol.waves > 1 ? `پس از ${M(pol.wave2_after_days)} روز، اگر ${esc(pol.wave2_trigger || "")}` : "ندارد — همه هم‌زمان"],
      ];
      const tabs = [
        { k: "why", t: "چرا؟", html: [dh("دلیل‌های موتور") + li(pol.why), (d.notes || []).length ? dh("تنظیمِ پشتیبانی") + li(d.notes) : "",
          d.forced ? `<div class="dim">پیشنهادِ سامانه برای این نوع قلم «${esc(d.base_mode_fa || "")}» است؛ این چینش انتخابِ شماست.</div>` : "",
          od ? dh(`گزینهٔ دیگر — «${VAR_FA[other]}»`) + `<div>${esc(od.mode_fa || "")} · ${M(od.policy.n_wave1)} گیرندهٔ موج اول، سقف ${M(od.policy.n_max)}${od.policy.waves > 1 ? " · دو موج" : ""}${((od.plan || {}).wave1 || []).length ? `: ${od.plan.wave1.map((x) => esc(x.name)).join("، ")}` : ""}</div>` : ""].join("") },
        { k: "rule", t: "قاعده‌های پخش و افشا", html: [
          dh("پخش") + li([dist.max_per_hub ? `از هر بازار یا پاساژ حداکثر ${M(dist.max_per_hub)} گیرنده` : "حداکثر نیمی از گیرندگان از یک بازار", `دست‌کم ${M(dist.min_markets)} بازار`,
            dist.need_outsider ? "دست‌کم یک گیرنده بیرون از بازارِ غالب" : "", `حداکثر ${M(dist.max_incumbents)} تأمین‌کنندهٔ فعلی؛ دست‌کم ${M(dist.min_new_suppliers || 1)} تأمین‌کنندهٔ تازه`,
            (dist.blocking_edges || []).length ? `دو سرِ این پیوندها با هم دعوت نمی‌شوند: ${dist.blocking_edges.join("، ")}` : "", dist.role_mix || ""].filter(Boolean)),
          dh("افشا") + li([`مقدار: ${dis.quantity || "—"}`, `فوریت: ${dis.urgency || "—"}`, `نامِ پروژه: ${dis.project_name || "—"}`, `بودجه یا قیمت مرجع: ${dis.budget_or_reference_price || "—"}`,
            `پیشنهاددهندگانِ دیگر: ${dis.other_bidders || "—"}`, dis.text_variation ? "هر گیرنده متنِ متفاوتی می‌گیرد" : ""].filter(Boolean)),
          dh("زمان") + li([pol.timing || "", pol.waves > 1 ? `موج دوم پس از ${M(pol.wave2_after_days)} روز، اگر: ${pol.wave2_trigger || ""}` : ""].filter(Boolean)),
          (pol.anti_collusion_steps || []).length ? dh("ضدتبانی") + li(pol.anti_collusion_steps) : "",
          (pol.quote_must_include || []).length ? dh("آنچه در پیشنهاد خواسته می‌شود") + li(pol.quote_must_include) : "",
          (pol.spec_clarification || []).length ? dh("روشن کردنِ مشخصات") + li(pol.spec_clarification) : "",
          Object.values(pol.runtime || {}).length ? dh("همین درخواست") + li(Object.values(pol.runtime)) : "",
          `<div class="dim">با چیدن، تیک‌های فهرست با همین برنامه عوض می‌شود؛ هر تیکِ دیگر پیش از «🚀 شروع» علت می‌خواهد. کشف‌شده‌ها تا شمارهٔ همراهشان با تیکِ پنل ثبت نشود دعوت نمی‌شوند.</div>`].join("") },
        { k: "data", t: "داده و اطمینان", html: [
          (pl.notes || []).concat(pl.relaxations || []).length ? dh("یادداشت‌ها و قاعده‌های سهل‌شده") + li((pl.notes || []).concat(pl.relaxations || [])) : "",
          dh("بازارها و نامزدها") + li([`بازارهای شناخته‌شدهٔ موج اول: ${M(pl.markets_known || 0)}${pl.unknown_location ? `؛ ${M(pl.unknown_location)} گیرنده با مکانِ نامعلوم` : ""}`,
            pl.dominant_hub ? `بازارِ غالب: «${pl.dominant_hub}»` : "", `نامزدها: ${M(d.candidates || 0)} (فعلی و کشف‌شده) · پیوندهای میانشان: ${M(d.edges || 0)}`].filter(Boolean)),
          d.ms ? dh("ساختارِ بازار") + `<div>${esc(MS_FA[d.ms] || d.ms)} <span class="dim" dir="ltr">${esc(d.ms)}</span>${glq("gl.ms", "ساختار بازار")}${d.confidence ? ` · اطمینانِ دادهٔ تحقیق: ${esc(d.confidence)}` : ""}${d.workflow ? ` · حالتِ کار: ${esc(d.workflow)}` : ""}</div>` : "",
          (pl.reserve || []).length ? dh("ذخیرهٔ موج دوم") + `<div class="dim">${pl.reserve.slice(0, 8).map((x) => esc(x.name)).join("، ")}</div>` : ""].join("") },
      ];
      box.innerHTML = `${varSeg(P1, "data-stvar", !!S.pkBusy[it.id])}
        <div class="st-line" aria-live="polite">${varLine(it, P1)}</div>
        <div class="st-mode"><span class="chip info">${esc(d.mode_fa || "")}</span>${glq(`gl.mode.${pol.mode}`, d.mode_fa)}${d.competition_fa && d.competition_fa !== d.mode_fa ? ` <span class="dim">← رقابتِ «${esc(d.competition_fa)}»</span>` : ""}
          <span class="dim">· خانوادهٔ ${esc(FAM_FA[d.family] || "")}</span>${glq(`gl.family.${d.family}`, FAM_FA[d.family])}</div>
        ${(pol.why || []).length ? `<p class="st-why">${esc(whyShort(pol.why[0]))}</p>` : ""}
        <ul class="st-facts">${facts.map(([ic, h, t]) => `<li><span aria-hidden="true">${ic}</span><span><b>${h}:</b> ${t}</span></li>`).join("")}</ul>
        <div class="st-who"><b>گیرندگانِ موج اول</b> <span class="dim">(${M((pl.wave1 || []).length)} از ${M(pol.n_wave1)})</span><ol>${(pl.wave1 || []).map(who).join("") || "<li class='dim'>نامزدی نیست</li>"}</ol></div>
        ${TP.ui.det({ key: dk, sub: "چرا · قاعده‌ها · داده", tabs })}`;
      box.querySelectorAll("[data-stvar]").forEach((x) => x.onclick = () => pkVarPress(it, x.dataset.stvar));
      const go = box.querySelector("[data-pkvar-go]"); if (go) go.onclick = () => pkVarPress(it, go.dataset.pkvarGo, true);
      const no = box.querySelector("[data-pkvar-no]"); if (no) no.onclick = () => { delete S.pkWarn[it.id]; pkPaint(); };
    }
    pkStratPaint = paint;
    paint();
  }
  /* «✉️ پیام اول» (سند طراحی، بخش ۱؛ تصمیم‌های ۱ و ۶؛ درخواست مالک، مهر ۱۴۰۵): «پیش‌فرض برای همه» بالای فهرست و برای هر
     تیک‌خورده (به ترتیبِ «🎯 فهرست دعوت») همان پیش‌فرض، قالبِ دیگر یا «✏️ ویرایشِ متن» — فقط قالب‌های فعالِ «📚 قالب‌های پیام»
     گزینه‌اند. قاعدهٔ علت: از ردیفِ اول به پایین، ردیفی که قالبش با ردیفِ بالایی فرق دارد (ردیفِ اول با پیش‌فرض؛ برگشت به پیش‌فرض
     هم) علت می‌خواهد و بی آن «✅ تأیید … 🚀 شروع» جلو نمی‌رود — سرور هم با ۴۰۹ نگه می‌دارد؛ گونه‌های خودکارِ متن فرق نیستند. متنی
     که نامِ دیگران یا شمارِ پیشنهادها را لو بدهد ذخیره نمی‌شود (worker/first-msg.js). o.tried: از کادرِ شروع آمده‌ایم — بی‌علت‌ها
     همان اول سرخ‌اند. */
  async function pkFmUI(it, o = {}) {
    const b = TP.busy("✉️ پیام اول", esc(it.title));
    let d;
    try { d = await TP.api(`/items/${it.id}/first-msg`); } catch (e) { b.close(); return TP.modal("نشد", esc(e.message), null, "باشد", ""); }
    b.close();
    const ed = {};             /* ردیف‌هایی که متنشان در حالِ ویرایشِ دستی است: k ← متن */
    const why = {};            /* علت‌های نوشته‌شده: k ← متن (با هر ذخیره و با بستن می‌روند) */
    const opened = new Set();  /* ردیف‌هایی که متنِ پیامشان باز است */
    let tried = !!o.tried;
    /* دکمهٔ اصلی همین‌جاست: «✅ تأیید پیام و 🚀 شروع» همان کادرِ شروع را با پیش‌نمایش باز می‌کند (پیش از شروع یا با انتخابِ تازه) */
    const P0 = S.picks[it.id], canGo = !!(P0 && P0.list && (!P0.started_at || P0.fresh));
    const m = TP.modal(`✉️ پیام اول — ${esc(it.title)}`, `<div data-fm></div>`, null,
      canGo ? (P0.started_at ? "✅ تأیید پیام‌ها و دعوت…" : "✅ تأیید پیام و 🚀 شروع…") : "بستن", canGo ? "بستن" : "");
    m.querySelector(".tp-modal").classList.add("fm-modal");
    const box = m.querySelector("[data-fm]");
    const note = (h) => { const n = box.querySelector("[data-fm-msg]"); if (n) n.innerHTML = h || ""; };
    const warnH = (t) => `<div class="tp-note warn" style="margin:6px 0">${t}</div>`;
    const missH = () => (tried && (d.missing || []).length ? warnH(`برای ${d.missing.map((x) => `«${esc(x.name)}»`).join("، ")} علت بنویسید؛ قالبشان با ردیفِ بالایی فرق دارد (ردیفِ اول با پیش‌فرض).`) : "");
    const keep = () => {
      box.querySelectorAll("[data-fm-body]").forEach((ta) => { ed[ta.dataset.fmBody] = ta.value; });
      box.querySelectorAll("[data-fm-why]").forEach((x) => { why[x.dataset.fmWhy] = x.value; });
    };
    /** علت‌هایی که با نسخهٔ ذخیره‌شده فرق دارند */
    const pending = () => {
      const p = {};
      for (const [k, v] of Object.entries(why)) { const r = (d.rows || []).find((x) => x.k === k); if (r && String(v).trim() !== (r.why || "")) p[k] = String(v).trim(); }
      return p;
    };
    /** هر ذخیره علت‌های نوشته‌شده را هم می‌برد */
    async function put(body) {
      const p = pending();
      d = await TP.api(`/items/${it.id}/first-msg`, { method: "PUT", body: Object.keys(p).length ? { ...body, why: { ...p, ...(body.why || {}) } } : body });
      for (const k of Object.keys(p)) delete why[k];
      return d;
    }
    async function save(body, ok) {
      keep();
      try { await put(body); if (ok) ok(); paint(); }
      catch (e) {
        note(warnH(`⛔ ${esc(e.message)}`));
        const k = e.data && e.data.k, row = k && [...box.querySelectorAll("[data-fmk]")].find((x) => x.dataset.fmk === k); if (row) row.classList.add("bad");
      }
    }
    /* بستن علت‌های نوشته‌شده را گم نمی‌کند */
    const flush = () => { keep(); const p = pending(); if (Object.keys(p).length) TP.api(`/items/${it.id}/first-msg`, { method: "PUT", body: { why: p } }).catch(() => {}); };
    const nb = m.querySelector("[data-n]"); if (nb) nb.onclick = () => { flush(); m.remove(); };
    m.onclick = (e) => { if (e.target === m) { flush(); m.remove(); } };
    /* «تأیید»: متنِ در حالِ ویرایش اول ذخیره یا رها شود؛ علت‌ها ذخیره و قاعدهٔ علت سنجیده می‌شود */
    m.querySelector("[data-y]").onclick = async () => {
      if (!canGo) { flush(); m.remove(); return; }
      if (box.querySelector("[data-fm-body]")) return note(warnH("متنی در حالِ ویرایش است؛ اول «ذخیرهٔ متن» یا «انصراف» را بزنید."));
      keep();
      if (Object.keys(pending()).length) { try { await put({}); } catch (e) { return note(warnH(`⛔ ${esc(e.message)}`)); } }
      if ((d.missing || []).length) {
        tried = true; paint();
        const r0 = box.querySelector(".fm-row.need"); if (r0) { r0.scrollIntoView({ block: "center", behavior: "smooth" }); const x = r0.querySelector("[data-fm-why]"); if (x) x.focus(); }
        return;
      }
      m.remove(); pkStartUI(it);
    };
    const tplOf = (k) => (d.templates || []).find((t) => t.key === k);
    /* فقط قالب‌های فعال؛ انتخابِ پیشینی که بعداً خاموش شده همان‌جا با «غیرفعال» می‌ماند تا بی‌صدا عوض نشود */
    const opts = (sel) => {
      const pool = (d.templates || []).filter((t) => t.active || t.key === sel);
      const g = (std, lab) => {
        const h = pool.filter((t) => !!t.std === std).map((t) => `<option value="${esc(t.key)}" ${sel === t.key ? "selected" : ""}>${esc(t.title)}${t.active ? "" : " — غیرفعال"}</option>`).join("");
        return h ? `<optgroup label="${lab}">${h}</optgroup>` : "";
      };
      return g(true, "قالب‌های آماده") + g(false, "قالب‌های من");
    };
    /* «👁 متن»ِ پیش‌فرض: متنِ نخستین ردیفی که همان را می‌گیرد، وگرنه همان قالب با دادهٔ این درخواست */
    const peek = () => {
      const r = (d.rows || []).find((x) => !x.custom && x.eff === d.def_eff), t = tplOf(d.def_eff);
      const txt = r ? r.text : t ? (TP.msg ? TP.msg.fillMsg(t.body, { ...(d.ctx || {}), supplier: "«تأمین‌کننده»" }) : t.body) : "";
      TP.modal(`👁 ${esc(t ? t.title : "پیش‌فرض")}`, `<pre class="fm-text" style="max-height:52vh">${esc(txt)}</pre>${r ? `<div class="dim" style="font-size:.8rem;margin-top:6px">نمونهٔ «${esc(r.name)}»${d.variation && !d.var_off ? "؛ گیرندگانِ دیگر گونهٔ دیگری از همین متن را می‌گیرند" : ""}.</div>` : ""}`, null, "بستن", "");
    };
    const row = (r, i) => {
      const editing = ed[r.k] != null;
      const w = why[r.k] != null ? why[r.k] : r.why || "";
      const need = !!r.need_why && !String(w).trim();
      const sel = r.custom ? `<span class="chip info">✏️ متنِ دستی</span>`
        : `<select class="tp-input" data-fm-tpl="${esc(r.k)}" ${r.go ? "disabled" : ""} aria-label="قالبِ ${esc(r.name)}"><option value="">= پیش‌فرض</option>${opts(r.sel || null)}</select>`;
      const whyH = r.go ? (r.why ? `<span class="dim fm-same">علت: ${esc(r.why)}</span>` : "")
        : r.diff ? `<input class="tp-input fm-why" data-fm-why="${esc(r.k)}" value="${esc(w)}" maxlength="300" placeholder="${i ? "چرا با ردیفِ بالایی فرق دارد؟ (اجباری)" : "چرا با پیش‌فرض فرق دارد؟ (اجباری)"}" aria-label="علتِ ${esc(r.name)}">`
        : `<span class="dim fm-same">همانِ ${i ? "ردیفِ بالایی" : "پیش‌فرض"}</span>`;
      const used = r.tpl && r.tpl !== "manual" ? tplOf(r.tpl) : null;
      return `<div class="fm-row ${r.block.length ? "bad" : ""} ${r.diff ? "diff" : ""} ${need && tried ? "need" : ""}" data-fmk="${esc(r.k)}">
        <div class="toolrow"><span class="fm-n">${M(i + 1)}</span><b>${esc(r.name)}</b>${r.go ? ` <span class="chip ok" title="پیامش رفته است">سپرده شد</span>` : ""}
          ${sel}
          <span style="margin-inline-start:auto"></span>
          ${r.go ? "" : editing ? `<button class="tp-btn xs primary" data-fm-save="${esc(r.k)}">ذخیرهٔ متن</button><button class="tp-btn xs" data-fm-cancel="${esc(r.k)}">انصراف</button>`
            : `<button class="tp-btn xs" data-fm-edit="${esc(r.k)}">✏️ ویرایشِ متن</button>${r.custom ? `<button class="tp-btn xs" data-fm-reset="${esc(r.k)}" title="متنِ دستی پاک می‌شود و پیش‌فرض می‌رود">↺ برگشت به پیش‌فرض</button>` : ""}`}</div>
        ${whyH ? `<div class="fm-whyrow">${whyH}</div>` : ""}
        ${r.block.length ? `<div class="chips" style="margin:4px 0">${r.block.map((x) => `<span class="chip bad" title="این متن نمی‌رود؛ دعوتِ پیشین جایش می‌رود">⛔ ${esc(x)}</span>`).join(" ")}</div>` : ""}
        ${r.warn.length ? `<div class="chips" style="margin:4px 0">${r.warn.map((x) => `<span class="chip warn">⚠️ ${esc(x)}</span>`).join(" ")}</div>` : ""}
        ${editing ? `<textarea class="tp-input" data-fm-body="${esc(r.k)}" dir="rtl">${esc(ed[r.k])}</textarea>`
          : `<details class="fm-det" data-fm-det="${esc(r.k)}" ${opened.has(r.k) || r.block.length ? "open" : ""}><summary>👁 متنِ پیام${used ? ` <span class="dim">— ${esc(used.title)}</span>` : ""}</summary><pre class="fm-text">${esc(r.text)}</pre></details>`}</div>`;
    };
    function paint() {
      keep();
      const rows = d.rows || [];
      const vary = d.variation ? (d.var_off
        ? ` · متنِ یکسان برای همه <span class="dim">(${esc(d.var_off.by || "")}: «${esc(d.var_off.reason || "")}»)</span> <button class="tp-btn xs" data-fm-var="1">گونه‌ها را برگردان</button>`
        : ` · هر گیرنده گونهٔ دیگری از متن را می‌گیرد <button class="tp-btn xs" data-fm-var="0" title="همه همان یک متن را بگیرند — با دلیل">متنِ یکسان برای همه…</button>`) : "";
      box.innerHTML = `<div class="fm-head"><div class="dim" style="font-size:.86rem;line-height:1.9">${TP.ui.info("expert.picks", "راهنمای پیام اول")} خانوادهٔ پیام: <b>${esc(d.family_fa || "")}</b>${d.family === "cautious" ? " — مقدار با بازهٔ متعارف، نه مقدارِ کامل" : ""}${vary}${(d.must || []).length ? ` · موارد لازم: ${d.must.map(esc).join("، ")}` : ""}</div>
          <button class="tp-btn sm" data-fm-lib title="قالب‌های من و قالب‌های آماده: ساختن، ویرایش و فعال یا غیرفعال کردن">📚 قالب‌های پیام</button></div>
        <div class="fm-def"><b>پیش‌فرض برای همه</b><select class="tp-input" data-fm-def aria-label="قالبِ پیش‌فرض">${opts(d.def_eff)}</select>
          <button class="tp-btn xs" data-fm-peek title="متنِ پیش‌فرض با دادهٔ همین درخواست">👁 متن</button></div>
        <div data-fm-msg>${missH()}</div>
        <div class="fm-box">${rows.map(row).join("") || `<div class="empty">هنوز تیک‌خورده‌ای نیست.</div>`}</div>
        ${rows.length ? `<div class="dim" style="font-size:.78rem;margin-top:8px;line-height:1.8">ردیف‌ها به ترتیبِ «🎯 فهرست دعوت»اند؛ هر ردیفی که قالبش با ردیفِ بالایی فرق دارد (ردیفِ اول با پیش‌فرض) علت می‌خواهد — برگشت به پیش‌فرض هم. «✏️ متنِ دستی» همیشه متفاوت است${d.variation && !d.var_off ? "؛ گونه‌های خودکارِ متن فرق شمرده نمی‌شوند" : ""}.</div>` : ""}`;
      bind();
    }
    function bind() {
      const Qm = (s) => box.querySelectorAll(s), G1 = (s) => box.querySelector(s);
      G1("[data-fm-lib]").onclick = () => tplLibUI(it, { fm: () => d, onView: (v) => { d = v; paint(); } });
      G1("[data-fm-peek]").onclick = peek;
      const defSel = G1("[data-fm-def]"); defSel.onchange = () => save({ def: defSel.value || null });
      Qm("[data-fm-tpl]").forEach((s) => s.onchange = () => save({ per: { [s.dataset.fmTpl]: s.value ? { tpl: s.value } : null } }));
      Qm("[data-fm-why]").forEach((x) => {
        x.oninput = () => { why[x.dataset.fmWhy] = x.value; if (x.value.trim()) x.closest(".fm-row").classList.remove("need"); };
        /* ذخیرهٔ بی‌صدا با ترکِ خانه: فهرست دوباره کشیده نمی‌شود تا فوکوسِ خانهٔ بعدی نپرد */
        x.onchange = async () => {
          why[x.dataset.fmWhy] = x.value;
          if (!Object.keys(pending()).length) return;
          try { await put({}); note(missH()); } catch (e) { note(warnH(`⛔ ${esc(e.message)}`)); }
        };
      });
      Qm("[data-fm-det]").forEach((x) => x.ontoggle = () => { if (x.open) opened.add(x.dataset.fmDet); else opened.delete(x.dataset.fmDet); });
      Qm("[data-fm-edit]").forEach((x) => x.onclick = () => { const r = (d.rows || []).find((y) => y.k === x.dataset.fmEdit); if (r) { ed[r.k] = r.text; paint(); } });
      Qm("[data-fm-cancel]").forEach((x) => x.onclick = () => { const ta = [...Qm("[data-fm-body]")].find((t) => t.dataset.fmBody === x.dataset.fmCancel); if (ta) ta.remove(); delete ed[x.dataset.fmCancel]; paint(); });
      Qm("[data-fm-save]").forEach((x) => x.onclick = () => {
        const k = x.dataset.fmSave, ta = [...Qm("[data-fm-body]")].find((t) => t.dataset.fmBody === k);
        const v = ta ? ta.value : "";
        save({ per: { [k]: v.trim() ? { body: v } : null } }, () => { if (ta) ta.remove(); delete ed[k]; });
      });
      Qm("[data-fm-reset]").forEach((x) => x.onclick = () => save({ per: { [x.dataset.fmReset]: null } }));
      /* گونه‌های متن (تصمیم ۱): خاموش با دلیل، روشن بی دلیل */
      Qm("[data-fm-var]").forEach((x) => x.onclick = () => {
        if (x.dataset.fmVar === "1") return save({ variation: true });
        note(`<div class="toolrow" style="gap:6px;margin:6px 0;flex-wrap:wrap"><input class="tp-input" data-fm-varwhy placeholder="چرا همه همان یک متن را بگیرند؟ (اجباری)" style="flex:1;min-width:220px"><button class="tp-btn xs primary" data-fm-varok>ثبت</button></div>`);
        const inp = box.querySelector("[data-fm-varwhy]"); inp.focus();
        box.querySelector("[data-fm-varok]").onclick = () => save({ variation: false, reason: inp.value });
      });
    }
    paint();
    /* از کادرِ شروع آمده‌ایم: نخستین ردیفِ بی‌علت پیش چشم و خانهٔ علتش آماده */
    if (tried) setTimeout(() => { const r0 = box.querySelector(".fm-row.need"); if (r0) { r0.scrollIntoView({ block: "center" }); const x = r0.querySelector("[data-fm-why]"); if (x) x.focus(); } }, 0);
  }
  /* «📚 قالب‌های پیام» (درخواست مالک، مهر ۱۴۰۵) — یک کتابخانه برای «✉️ پیام اول»، جستجوی هوشمند و بات: «قالب‌های من» (ساختن،
     ویرایش و حذف، با دکمه‌های جای‌خالیِ {…} که همان‌جای مکان‌نما می‌نشینند و پیش‌نمایشِ زنده با دادهٔ همین قلم — همان msg-fill.mjsِ
     سرور) و «قالب‌های آماده»ی پیام اول (فقط‌خواندنی، «کپی برای ویرایش»). از «✉️ پیام اول» (o.fm: نمای همان کادر) کلیدِ «فعال» هم
     هست: فقط فعال‌ها گزینهٔ پیش‌فرض و ردیف‌ها می‌شوند و دست‌کم یکی فعال می‌ماند؛ خاموش کردنِ قالبی که در همین درخواست انتخاب شده،
     آن ردیف‌ها را به پیش‌فرض برمی‌گرداند. سرور پیش از ذخیره متن را از نظرِ لو رفتنِ نامِ تأمین‌کنندگان و واژه‌های درونی می‌سنجد. */
  async function tplLibUI(it, o = {}) {
    const fm = typeof o.fm === "function" ? o.fm : null;
    const st = { mode: "", key: "", title: "", body: "", msg: "" };
    let L = null;
    const q = () => `/templates${it ? `?item_id=${it.id}` : ""}`;
    async function load() {
      if (fm) {
        const d = fm();
        L = { list: d.templates || [], tokens: d.tokens || [], ctx: d.ctx || null, who: ((d.rows || [])[0] || {}).name || "" };
        return;
      }
      let r = await TP.api(q());
      if (!(r.templates || []).length) { for (const t of DEFAULT_TPL) await TP.api("/templates", { body: t }); r = await TP.api(q()); }
      S.templates = r.templates || [];
      if (it) S.tplCtx[it.id] = r.ctx || null;
      L = { list: [...(r.std || []), ...(r.templates || []).map((t) => ({ key: String(t.id), id: t.id, title: t.title, body: t.body, std: false, own: t.expert_id != null, shared: t.expert_id == null }))],
        tokens: r.tokens || [], ctx: r.ctx || null, who: "" };
    }
    async function refresh() {
      if (fm) { const v = await TP.api(`/items/${it.id}/first-msg`); if (o.onView) o.onView(v); }
      await load(); paint();
    }
    try { await load(); } catch (e) { return TP.modal("نشد", esc(e.message), null, "باشد", ""); }
    const m = TP.modal("📚 قالب‌های پیام", `<div data-tl></div>`, null, "بستن", "");
    m.querySelector(".tp-modal").classList.add("fm-modal");
    const box = m.querySelector("[data-tl]");
    const byKey = (k) => L.list.find((t) => t.key === k);
    const toks = () => (L.tokens.length ? L.tokens : TP.msg ? TP.msg.TOKENS : ["عنوان قلم", "مقدار", "واحد", "مشخصات فنی", "تامین‌کننده", "نام کارشناس"]);
    const baseCtx = () => { const x = it || {}; return { company: COMPANY, expertName: (S.expert && (S.expert.label || S.expert.name)) || "", items: [{ title: x.title, qty: x.qty, unit: x.unit, spec: x.spec, due: x.need_date }] }; };
    /* آمادهٔ «محتاط» همان‌طور که می‌رود: مقدار با بازهٔ متعارف (first-msg.js:fmTextFor) */
    const fill = (body, t) => {
      if (!TP.msg) return String(body || "");
      const c = L.ctx || baseCtx();
      return TP.msg.fillMsg(body, { ...c, family: t && t.std && t.family === "cautious" ? "cautious" : c.family, supplier: L.who || "«تأمین‌کننده»" });
    };
    const pvFor = () => `پیش‌نمایش با دادهٔ ${it ? `«${esc(it.title)}»` : "همین قلم"}${L.who ? ` برای «${esc(L.who)}»` : ""}:`;
    function editor() {
      if (!st.mode) return "";
      const t = byKey(st.key);
      if (st.mode === "view" && t) {
        return `<div class="tpl-ed"><div class="toolrow" style="margin:0"><b>${esc(t.title)}</b>${t.std ? ` <span class="chip">آماده</span>` : ""}<span style="margin-inline-start:auto"></span>
            ${t.std ? `<button type="button" class="tp-btn xs" data-tl-copy="${esc(t.key)}">کپی برای ویرایش</button>` : `<button type="button" class="tp-btn xs" data-tl-edit="${esc(t.key)}">✏️ ویرایش</button>`}</div>
          <div class="dim" style="font-size:.8rem;margin:4px 0">${pvFor()}</div><pre class="fm-text">${esc(fill(t.body, t))}</pre></div>`;
      }
      if (st.mode === "view") return "";
      return `<div class="tpl-ed"><b>${st.mode === "new" ? "＋ قالبِ تازه" : "✏️ ویرایشِ قالب"}</b>
        <label class="tp-field" style="margin:6px 0"><b>عنوانِ قالب</b><input class="tp-input" data-tl-title value="${esc(st.title)}" maxlength="80" placeholder="مثلاً «رسمی با برند»" style="width:100%"></label>
        <div class="tokens" aria-label="جای‌خالی‌ها">${toks().map((x) => `<button type="button" class="tok" data-tl-tok="${esc(x)}" title="${esc((TP.msg && TP.msg.TOKEN_HINT && TP.msg.TOKEN_HINT[x]) || "")}">{${esc(x)}}</button>`).join("")}</div>
        <textarea class="tp-textarea" data-tl-body dir="rtl" style="min-height:9em">${esc(st.body)}</textarea>
        <div class="dim" style="font-size:.8rem;margin:6px 0 2px">${pvFor()}</div><pre class="fm-text" data-tl-pv>${esc(fill(st.body))}</pre>
        <div class="toolrow" style="margin-top:8px;gap:8px;flex-wrap:wrap"><button type="button" class="tp-btn primary" data-tl-save>💾 ذخیره</button><button type="button" class="tp-btn" data-tl-cancel>انصراف</button>
          <span class="dim" style="font-size:.78rem">پیش از ذخیره، متن از نظرِ لو رفتنِ نامِ تأمین‌کنندگان و واژه‌های درونی سنجیده می‌شود.</span></div></div>`;
    }
    function paint() {
      const own = L.list.filter((t) => !t.std), std = L.list.filter((t) => t.std);
      const li = (t) => `<li class="tpl-li ${st.key === t.key ? "on" : ""} ${fm && !t.active ? "off" : ""}">
          <button type="button" class="tpl-t" data-tl-open="${esc(t.key)}" title="دیدنِ متن و پیش‌نمایش">${esc(t.title)}${t.shared ? ` <span class="chip">مشترک</span>` : ""}</button>
          ${t.std ? `<button type="button" class="tp-btn xs" data-tl-copy="${esc(t.key)}" title="یک کپی در «قالب‌های من» برای ویرایش">کپی برای ویرایش</button>`
            : `<button type="button" class="tp-btn xs" data-tl-edit="${esc(t.key)}" title="ویرایش">✏️</button>${t.own ? `<button type="button" class="tp-btn xs" data-tl-del="${esc(t.key)}" title="حذف">🗑</button>` : ""}`}
          ${fm ? TP.ui.switchEl({ on: !!t.active, attrs: `data-tl-sw="${esc(t.key)}" aria-label="فعال بودنِ ${esc(t.title)}"`, title: t.active ? "فعال در «✉️ پیام اول»" : "خاموش — گزینهٔ «✉️ پیام اول» نیست" }) : ""}</li>`;
      box.innerHTML = `<p class="dim" style="margin:0 0 8px;font-size:.84rem;line-height:1.8">${fm ? "فقط قالب‌های <b>فعال</b> گزینهٔ «پیش‌فرض برای همه» و ردیف‌های «✉️ پیام اول» می‌شوند؛ دست‌کم یکی فعال می‌ماند. "
          : "همین قالب‌ها در «✉️ پیام اول» هم هستند (فعال یا غیرفعال کردن در همان پنجره). "}جای‌خالی‌های {…} هنگامِ ارسال با دادهٔ همان قلم و تأمین‌کننده پر می‌شوند.</p>
        <div class="tpl-cols">
          <section><div class="toolrow" style="margin:0"><b>قالب‌های من</b><span style="margin-inline-start:auto"></span><button type="button" class="tp-btn xs primary" data-tl-new>＋ قالبِ تازه</button></div>
            <ul class="tpl-list">${own.map(li).join("") || `<li class="dim" style="font-size:.84rem;padding:4px">هنوز قالبی نساخته‌اید.</li>`}</ul></section>
          <section><div class="toolrow" style="margin:0"><b>قالب‌های آماده</b><span class="dim" style="font-size:.78rem">فقط‌خواندنی — مخصوصِ «✉️ پیام اول»</span></div>
            <ul class="tpl-list">${std.map(li).join("")}</ul></section></div>
        <div data-tl-msg>${st.msg ? `<div class="tp-note warn" style="margin:6px 0">${st.msg}</div>` : ""}</div>
        <div data-tl-ed>${editor()}</div>`;
      bind();
    }
    const focus = (sel) => setTimeout(() => { const x = box.querySelector(sel); if (x) { x.focus(); x.scrollIntoView({ block: "nearest" }); } }, 0);
    function bind() {
      const Qb = (s) => box.querySelectorAll(s), G1 = (s) => box.querySelector(s);
      Qb("[data-tl-open]").forEach((b) => b.onclick = () => { Object.assign(st, { mode: "view", key: b.dataset.tlOpen, msg: "" }); paint(); focus(".tpl-ed"); });
      Qb("[data-tl-edit]").forEach((b) => b.onclick = () => { const t = byKey(b.dataset.tlEdit); if (!t) return; Object.assign(st, { mode: "edit", key: t.key, title: t.title, body: t.body, msg: "" }); paint(); focus("[data-tl-body]"); });
      Qb("[data-tl-copy]").forEach((b) => b.onclick = () => { const t = byKey(b.dataset.tlCopy); if (!t) return; Object.assign(st, { mode: "new", key: "", title: `کپیِ ${t.title}`.slice(0, 80), body: t.body, msg: "" }); paint(); focus("[data-tl-title]"); });
      const nw = G1("[data-tl-new]"); if (nw) nw.onclick = () => { Object.assign(st, { mode: "new", key: "", title: "", body: "سلام، وقت بخیر. از واحد خرید {شرکت} پیام می‌دم.\n", msg: "" }); paint(); focus("[data-tl-title]"); };
      Qb("[data-tl-del]").forEach((b) => b.onclick = () => delTpl(b.dataset.tlDel));
      Qb("[data-tl-sw]").forEach((sw) => sw.addEventListener("tp-change", (e) => toggle(sw.dataset.tlSw, !!(e.detail && e.detail.value))));
      const ta = G1("[data-tl-body]"), pv = G1("[data-tl-pv]"), ti = G1("[data-tl-title]");
      if (ta) ta.oninput = () => { st.body = ta.value; if (pv) pv.textContent = fill(ta.value); };
      if (ti) ti.oninput = () => { st.title = ti.value; };
      Qb("[data-tl-tok]").forEach((b) => b.onclick = () => {
        if (!ta) return;
        /* جای‌خالی همان‌جای مکان‌نما می‌نشیند و مکان‌نما بعد از آن و یک فاصله می‌رود */
        const tk = "{" + b.dataset.tlTok + "} ", s = ta.selectionStart ?? ta.value.length, e = ta.selectionEnd ?? s;
        ta.value = ta.value.slice(0, s) + tk + ta.value.slice(e); const pos = s + tk.length; ta.focus(); ta.setSelectionRange(pos, pos);
        st.body = ta.value; if (pv) pv.textContent = fill(ta.value);
      });
      const sv = G1("[data-tl-save]"); if (sv) sv.onclick = saveTpl;
      const cc = G1("[data-tl-cancel]"); if (cc) cc.onclick = () => { Object.assign(st, { mode: st.key ? "view" : "", msg: "" }); paint(); };
    }
    async function saveTpl() {
      const ti = box.querySelector("[data-tl-title]"), ta = box.querySelector("[data-tl-body]");
      const title = (ti ? ti.value : st.title).trim() || "بدون عنوان", body = ta ? ta.value : st.body;
      st.title = title; st.body = body;
      if (!body.trim()) { st.msg = "متنِ قالب خالی است."; return paint(); }
      const btn = box.querySelector("[data-tl-save]"); if (btn) btn.disabled = true;
      try {
        const payload = { title, body, ...(it ? { item_id: it.id } : {}) };
        const t = st.mode === "edit" ? byKey(st.key) : null;
        const r = t ? await TP.api(`/templates/${t.id}`, { method: "PUT", body: payload }) : await TP.api("/templates", { body: payload });
        if (!t) st.key = String(r.id);
        st.mode = "view"; st.msg = (r.warn || []).length ? `⚠️ ذخیره شد، ولی: ${r.warn.map(esc).join("، ")}` : "";
        await refresh();
        okTick("قالب ذخیره شد");
      } catch (e) { st.msg = `⛔ ${esc(e.message)}`; paint(); }
    }
    /* «فعال»: همان PUTِ «✉️ پیام اول» — خاموش کردنِ قالبی که در همین درخواست پیش‌فرض یا قالبِ ردیفی است، آن را به پیش‌فرض برمی‌گرداند */
    async function toggle(key, on) {
      if (!fm) return;
      const d = fm(), body = { active: { [key]: on } };
      if (!on) {
        if (d.def === key) body.def = null;
        const per = {}; for (const r of d.rows || []) if (r.sel === key && !r.go) per[r.k] = null;
        if (Object.keys(per).length) body.per = per;
      }
      try {
        const v = await TP.api(`/items/${it.id}/first-msg`, { method: "PUT", body });
        if (o.onView) o.onView(v);
        await load();
        st.msg = !on && (body.def === null || body.per) ? `«${esc((byKey(key) || {}).title || "")}» خاموش شد و ردیف‌هایی که در همین درخواست آن را داشتند پیش‌فرض را می‌گیرند.` : "";
        paint();
      } catch (e) { st.msg = `⛔ ${esc(e.message)}`; paint(); }
    }
    function delTpl(key) {
      const t = byKey(key); if (!t) return;
      if (fm && t.active && L.list.filter((x) => x.active).length < 2) { st.msg = "این تنها قالبِ فعال است؛ اول قالبِ دیگری را فعال کنید."; return paint(); }
      TP.modal("🗑 حذفِ قالب", `قالبِ «${esc(t.title)}» حذف شود؟${fm ? " ردیف‌هایی که در «✉️ پیام اول» آن را داشتند پیش‌فرض را می‌گیرند." : ""}`, async () => {
        try {
          await TP.api(`/templates/${t.id}`, { method: "DELETE" });
          if (st.key === key) Object.assign(st, { mode: "", key: "" });
          st.msg = ""; await refresh();
        } catch (e) { st.msg = `⛔ ${esc(e.message)}`; paint(); }
      }, "حذف", "انصراف");
    }
    paint();
  }
  function pkPhoneUI(it, k) {
    const P = S.picks[it.id], e = P && P.list && P.list.find((x) => x.k === k); if (!e) return;
    const done = async () => { delete S.spPh[e.name]; await loadPicks(it, true); };
    const d = TP.modal(`📱 شمارهٔ پنل — ${esc(e.name)}`, `<p style="margin-top:0">کارشناس هوشمند فقط به شماره‌ای پیامک می‌دهد که تیکِ «پنل» دارد (پنلِ تأمین‌کننده به همین شماره وصل است).</p>
      ${e.phones.length ? `<div style="display:flex;flex-direction:column;gap:6px;margin:8px 0">${e.phones.map((p) => `<div class="toolrow" style="margin:0"><span class="num" dir="ltr">${esc(p.phone)}</span>${p.label ? ` <span class="dim">${esc(p.label)}</span>` : ""}
        ${p.panel ? `<span class="chip ok">☑️ پنل</span>` : `<button class="tp-btn xs primary" data-pph-tick="${esc(p.phone)}">☑️ تیکِ پنل بزن</button>`}</div>`).join("")}</div>` : `<div class="dim">هنوز شماره‌ای برای این تأمین‌کننده ثبت نشده.</div>`}
      <div class="toolrow" style="align-items:end;flex-wrap:wrap;gap:8px;margin-top:10px">
        <label class="tp-field"><b>شمارهٔ تازه (چندتا: با «،» یا فاصله)</b><input class="tp-input" id="pph-num" dir="ltr" inputmode="tel" value="${esc((e.found || []).slice(0, 4).join("، "))}" placeholder="09…، 09…" style="width:260px;max-width:100%"></label>
        <label class="tp-field"><b>برچسب</b><input class="tp-input" id="pph-lab" value="${e.src === "smart" ? "جستجوی هوشمند" : ""}" placeholder="همراه، فروش…" style="width:150px"></label>
        <label class="chkline"><input type="checkbox" id="pph-panel" checked> تیکِ پنل</label></div>
      ${(e.found || []).length > 1 ? `<div class="dim" style="font-size:.82rem">شماره‌های پیداشده: ${e.found.map((p) => `<span dir="ltr">${esc(p)}</span>`).join("، ")}</div>` : ""}`,
      async () => {
        /* چند شماره در یک بار (آبان ۱۴۰۵): هر کدام جدا ثبت می‌شود؛ شماره‌ای که ثبت نشد با علتش گفته می‌شود */
        const nums = (d.querySelector("#pph-num").value || "").split(/[\s,،;؛]+/).map((x) => x.trim()).filter(Boolean).slice(0, 10); if (!nums.length) return;
        const bad = [];
        for (const num of nums) {
          try { await TP.api("/sp/x/phones", { body: { supplier_name: e.name, phone: num, label: d.querySelector("#pph-lab").value, panel: d.querySelector("#pph-panel").checked } }); }
          catch (er) { bad.push(`${esc(num)}: ${esc(er.message)}`); }
        }
        await done();
        if (bad.length) TP.modal("بعضی شماره‌ها ثبت نشد", bad.join("<br>"), null, "باشد", "");
      }, "ثبت شماره", "بستن");
    d.querySelectorAll("[data-pph-tick]").forEach((b) => b.onclick = async () => {
      try { await TP.api("/sp/x/phones", { body: { supplier_name: e.name, phone: b.dataset.pphTick, panel: true } }); d.remove(); await done(); }
      catch (er) { TP.modal("نشد", esc(er.message), null, "باشد", ""); }
    });
  }
  /* «📘 سند راهبرد» (worker/strategy-doc.js، کلیدِ doc): سندِ نوع قلم پیش از «🚀 شروع» — دیدن، امتیاز (۱ تا ۳ با توضیح و جعبهٔ
     راهبرد)، تأیید، ویرایش یا سازندهٔ پارامتری؛ عددهای درونیِ همین قلم (هدف، حد، پیشنهادِ هر دور) فقط برای شما.
     نما (درخواست مالک، مهر ۱۴۰۵: تیتروار، خواندن دو سه دقیقه): «در یک نگاه»، چهار کاشی (بازار، استعلام، مذاکره، 🔒 عددهای درونی) با
     «؟» کنارِ هر اصطلاح، و وضعیت‌های محتمل جمع‌شده (پاسخِ آماده با باز کردنِ ردیف)؛ متنِ کامل و قاعده‌ها، ریسک‌ها، قیدها و تأییدها و
     سازندهٔ پارامتری زیرِ «≡ جزئیات». امتیاز، «✅ تأیید»، «✏️ ویرایش» و «⋯» (سازندهٔ پارامتری، ساختِ دوباره) در نوارِ چسبانِ پایین.
     نما و کاشی‌ها در strategy-view.js است (TP.stratView.docBody) — همان نما فقط‌خواندنی پس از «🚀 شروع» و از کارتِ مذاکرهٔ مکاتبات. */
  const { MV_FA } = TP.stratView;
  /** «📘 سند راهبرد»ِ قلمِ سپرده‌شده (پس از «🚀 شروع»): فقط‌خواندنی — همان نسخهٔ تأییدشده‌ای که کارشناس هوشمند با آن مذاکره می‌کند */
  function pkDocRoUI(it) {
    const P = S.picks[it.id]; if (!P || !P.head) return;
    return TP.stratView.openDoc({ head: P.head, code: it.code || null, variant: pkVarOf(P),
      roTip: "قلم سپرده شده؛ بازبینی و تأیید پیش از «🚀 شروع» است و این‌جا فقط دیدن",
      why: `«${it.title}» سپرده شده${P.started_at ? ` (${TP.fmt(P.started_at)})` : ""}؛ کارشناس هوشمند با همین سند مذاکره می‌کند — حالِ هر گفت‌وگو در کارتِ «🧭 مذاکره»ٔ «💬 مکاتبات».` });
  }
  async function pkDocUI(it, then) {
    const P = S.picks[it.id]; if (!P || !P.head) return;
    /* پس از «🚀 شروع» سند فقط‌خواندنی است (بازبینی و تأیید پیش از شروع است؛ سرور: doc_ro) */
    if ((P.doc_ro || P.started_at) && !then) return pkDocRoUI(it);
    const q = `/cr/doc?head=${encodeURIComponent(P.head)}${it.code ? `&code=${encodeURIComponent(it.code)}` : ""}&enqueue=1`;
    let d;
    try { d = await TP.api(q); } catch (e) { return TP.modal("نشد", esc(e.message), null, "باشد", ""); }
    if (!d.available) return TP.modal("📘 سند راهبرد", "این نوع قلم در دادهٔ تحقیق نیست؛ سند ندارد.", null, "باشد", "");
    const m = TP.modal(`📘 سند راهبرد — ${esc(d.head)}`, `<div data-doc></div>`, null, "بستن", "");
    m.querySelector(".tp-modal").classList.add("fm-modal", "doc-modal");
    const box = m.querySelector("[data-doc]"), dk = `doc-${it.id}-${Date.now()}`;
    /* نوارِ چسبانِ پایینِ پنجره (همان .tp-acts) جای امتیاز و دکمه‌های بازبینی است */
    const acts = m.querySelector(".tp-acts"); acts.classList.add("doc-foot");
    const st = { mode: "view", score: 0, note: "", boxes: [] };
    const msg = (t) => m.querySelectorAll("[data-docmsg], [data-dfmsg]").forEach((n) => { n.innerHTML = t ? `<div class="tp-note warn" style="margin:6px 0">⛔ ${esc(t)}</div>` : ""; });
    const reload = async () => { try { d = await TP.api(q); } catch (e) { return msg(e.message); } paint(); };
    async function review(body) {
      const L = d.latest;
      try {
        await TP.api(`/cr/doc/${L.id}/review`, { body });
        st.mode = "view"; await reload(); await loadPicks(it, true);
        okTick("سندِ راهبرد تأیید شد");
        if (then) { m.remove(); then(); }
      } catch (e) { msg(e.message); }
    }
    const rv = () => (st.score ? { score: st.score, note: st.note, boxes: st.boxes } : {});
    /* نمای تیترواریِ سند (strategy-view.js) — همان نمایی که پس از «🚀 شروع» و در مکاتبات فقط‌خواندنی دیده می‌شود */
    const docHtml = (x, nums) => TP.stratView.docBody(x, nums, { dk, builder: d.builder, variant: pkVarOf(S.picks[it.id]) });
    /** امتیاز و نقد (۱ تا ۳: توضیح و دست‌کم یک جعبهٔ راهبرد) — در ویرایش و سازنده درونِ فرم، در نما درونِ نوارِ پایین */
    const stars = () => `<span class="doc-stars" role="radiogroup" aria-label="امتیاز به سند">${[1, 2, 3, 4, 5].map((n) => `<button type="button" role="radio" aria-checked="${st.score === n}" class="tp-btn sm ${st.score === n ? "on" : ""}" data-dscore="${n}">${M(n)}</button>`).join("")}</span>`;
    const critique = () => (st.score && st.score <= 3 ? `<textarea class="tp-input" data-dnote style="width:100%;min-height:60px;margin-top:6px" placeholder="چه چیزِ این سند درست نبود؟ (اجباری)">${esc(st.note)}</textarea>
      <div class="sp-cboxes" role="group" aria-label="جعبه‌های نقدِ راهبرد"><b>کدام بخش؟ (دست‌کم یکی)</b>${d.builder.boxes.map((b) => `<label class="sp-cbox"><input type="checkbox" data-dbox="${b.code}" ${st.boxes.includes(b.code) ? "checked" : ""}> ${esc(b.fa)}</label>`).join("")}</div>` : "");
    function reviewHtml() {
      return `<div class="doc-rev" data-drev><b>امتیازِ شما به این سند</b><div class="toolrow" style="gap:6px;flex-wrap:wrap">${stars()}</div>${critique()}</div>`;
    }
    function editHtml(x) {
      const n = x.negotiation || {};
      return `<div class="doc-edit"><label class="tp-field"><b>خلاصه</b><textarea class="tp-input" data-esum style="width:100%;min-height:90px">${esc(x.summary_fa || "")}</textarea></label>
        <label class="tp-field"><b>قاعدهٔ لنگر و هدف</b><input class="tp-input" data-eanchor style="width:100%" value="${esc(n.anchor_rule || "")}"></label>
        <label class="tp-field"><b>قاعدهٔ حد</b><input class="tp-input" data-eres style="width:100%" value="${esc(n.reservation_rule || "")}"></label>
        ${(x.anticipated_states || []).map((s) => `<label class="tp-field"><b>${esc(s.name || s.state_id)} — ${esc(MV_FA[s.move] || s.move)}</b><textarea class="tp-input" data-erep="${esc(s.state_id)}" style="width:100%;min-height:50px">${esc(s.prepared_reply_fa)}</textarea></label>`).join("")}
        ${reviewHtml()}
        <div class="toolrow" style="gap:8px;margin-top:8px"><button type="button" class="tp-btn primary" data-esave>ذخیره و تأیید</button><button type="button" class="tp-btn" data-ecancel>انصراف</button></div></div>`;
    }
    function builderHtml() {
      const B = d.builder, df = B.defaults || {}, w = df.weights || {};
      const pc = (v) => (v == null ? "" : String(Math.round(v * 1000) / 10));
      return `<div class="doc-builder"><b>🧱 سازندهٔ پارامتری</b>
        <div class="toolrow" style="gap:8px;flex-wrap:wrap;align-items:end">${Object.entries(B.weights).map(([k, fa]) => `<label class="tp-field"><b>${esc(fa)}</b><input class="tp-input num" data-bw="${k}" value="${w[k] ?? 20}" style="width:64px" dir="ltr" inputmode="numeric"></label>`).join("")}<span class="dim">جمعِ وزن‌ها ۱۰۰</span></div>
        <div class="toolrow" style="gap:8px;flex-wrap:wrap;align-items:end">
          <label class="tp-field"><b>هدف نسبت به مرجع (٪)${glq("gl.target", "هدف")}</b><input class="tp-input num" data-bp="target_vs_ref" value="${pc(df.target_vs_ref)}" style="width:80px" dir="ltr"></label>
          <label class="tp-field"><b>تحملِ حد (٪)${glq("gl.reservation", "حد")}</b><input class="tp-input num" data-bp="rv_tol" value="${pc(df.rv_tol)}" style="width:80px" dir="ltr"></label>
          <label class="tp-field"><b>شمارِ دور</b><input class="tp-input num" data-bp="rounds" value="${df.rounds || 3}" style="width:60px" dir="ltr"></label>
          <label class="tp-field"><b>حداکثر ماهِ تعویقِ پرداخت</b><input class="tp-input num" data-bp="max_pay_months" value="${df.max_pay_months ?? 3}" style="width:60px" dir="ltr"></label>
          <label class="tp-field"><b>نرخِ ماهانهٔ پنل (٪، اختیاری)</b><input class="tp-input num" data-bp="panel_rate" value="" style="width:80px" dir="ltr"></label></div>
        <div style="margin-top:6px"><b>آهنگِ امتیازدهی${glq("gl.pace", "آهنگِ امتیازدهی")}</b> ${Object.entries(B.pace).map(([k, fa]) => `<label class="chkline"><input type="radio" name="bpace" value="${k}" ${k === (df.pace || "balanced") ? "checked" : ""}> ${esc(fa)}</label>`).join(" ")}</div>
        <div><b>استفاده از پیشنهادِ دیگران</b> ${Object.entries(B.others).map(([k, fa]) => `<label class="chkline"><input type="radio" name="bothers" value="${k}" ${k === (df.others || "better_only") ? "checked" : ""}> ${esc(fa)}</label>`).join(" ")}</div>
        ${B.tradeable_issues.length ? `<div><b>موضوع‌های قابلِ معامله${glq("gl.package", "بستهٔ معاوضه")}</b><div class="sp-cboxes">${B.tradeable_issues.map((t) => `<label class="sp-cbox"><input type="checkbox" data-btrade="${esc(t)}" checked> ${esc(t)}</label>`).join("")}</div></div>` : ""}
        <label class="tp-field" style="margin-top:6px"><b>قیدهای سخت (هر خط یکی)</b><textarea class="tp-input" data-bhard style="width:100%;min-height:50px">${esc((df.hard_constraints || []).join("\n"))}</textarea></label>
        <label class="chkline"><input type="checkbox" data-bsplit> تقسیمِ سفارش مجاز است${glq("gl.split", "تقسیمِ سفارش")}</label>
        <label class="tp-field"><b>یادداشت (اختیاری)</b><input class="tp-input" data-bnote style="width:100%"></label>
        ${d.latest && d.latest.doc ? reviewHtml() : ""}
        <div class="toolrow" style="gap:8px;margin-top:8px"><button type="button" class="tp-btn primary" data-bsave>ساخت و تأیید</button><button type="button" class="tp-btn" data-bcancel>انصراف</button></div></div>`;
    }
    const ready = () => { const L = d.latest; return !!(L && ["draft", "approved"].includes(L.state) && (L.final || L.doc)); };
    /** نوارِ چسبانِ پایین: در نمای سند امتیاز، «✅ تأیید» (تنها کارِ اصلی)، «✏️ ویرایش» و «⋯»؛ در ویرایش، سازنده و صف فقط «بستن» */
    function footHtml() {
      const close = `<button type="button" class="tp-btn ghost" data-dclose>بستن</button>`;
      if (st.mode !== "view" || !ready()) return `<div data-dfmsg></div><div class="doc-bar"><span class="sp"></span>${close}</div>`;
      const more = TP.ui.menu({ cls: "up", btn: `<button type="button" class="tp-icon-btn" data-menu-toggle aria-haspopup="menu" aria-expanded="false" aria-label="کارهای بیشتر" title="کارهای بیشتر">${TP.ui.ICON.more}</button>`,
        items: [{ label: "🧱 سازندهٔ پارامتری", attrs: "data-dbuild" }, { label: "↻ ساختِ دوباره", attrs: "data-drebuild-ask" }] });
      return `<div data-dfmsg></div>${critique()}<div class="doc-bar"><span class="dim">امتیاز:</span>${stars()}
        <button type="button" class="tp-btn primary" data-dok>✅ تأیید</button><button type="button" class="tp-btn" data-dedit>✏️ ویرایش</button>${more}<span class="sp"></span>${close}</div>`;
    }
    function paint() {
      const L = d.latest, x = L && (L.final || L.doc);
      let h = `${TP.stratView.docHead(L)}<div data-docmsg></div>`;
      if (st.mode === "builder") h += builderHtml();
      else if (st.mode === "edit" && x) h += editHtml(x);
      else if (!L || ["queued", "building"].includes(L.state)) h += `<div class="tp-note" style="margin:8px 0">⏳ سند در حالِ ساخت است. <button type="button" class="tp-btn xs" data-dreload>↻ تازه کن</button></div><div class="toolrow"><button type="button" class="tp-btn" data-dbuild>🧱 همین حالا با سازندهٔ پارامتری</button></div>`;
      else if (L.state === "failed") h += `<div class="tp-note warn">ساخت نشد: ${esc(L.error || "")}</div><div class="toolrow" style="gap:8px"><button type="button" class="tp-btn primary" data-drebuild>↻ دوباره بساز</button><button type="button" class="tp-btn" data-dbuild>🧱 سازندهٔ پارامتری</button></div>`;
      else h += docHtml(x, d.numbers);
      box.innerHTML = h;
      acts.innerHTML = footHtml();
      bind();
    }
    function keep() {
      const nt = m.querySelector("[data-dnote]"); if (nt) st.note = nt.value;
      const bx = [...m.querySelectorAll("[data-dbox]")]; if (bx.length) st.boxes = bx.filter((c) => c.checked).map((c) => c.dataset.dbox);
    }
    const rebuild = async () => { try { await TP.api("/cr/doc/build", { body: { head: d.head, code: it.code || null, force: true } }); await reload(); } catch (e) { msg(e.message); } };
    function bind() {
      /* نوارِ پایین بیرون از box است؛ همهٔ دکمه‌ها از ریشهٔ پنجره */
      const Qd = (s) => m.querySelectorAll(s), G1 = (s) => m.querySelector(s);
      Qd("[data-dscore]").forEach((b) => b.onclick = () => {
        keep(); st.score = +b.dataset.dscore;
        const el = box.querySelector("[data-drev]");
        if (el) el.outerHTML = reviewHtml(); else acts.innerHTML = footHtml();
        bind();
      });
      const dok = G1("[data-dok]"); if (dok) dok.onclick = () => { keep(); if (!st.score) return msg("امتیازِ ۱ تا ۵ را بزنید."); review({ action: "approve", ...rv() }); };
      const ded = G1("[data-dedit]"); if (ded) ded.onclick = () => { keep(); st.mode = "edit"; paint(); };
      Qd("[data-dbuild]").forEach((b) => b.onclick = () => { keep(); st.mode = "builder"; paint(); });
      const drl = G1("[data-dreload]"); if (drl) drl.onclick = reload;
      const drb = G1("[data-drebuild]"); if (drb) drb.onclick = rebuild;
      /* «↻ ساختِ دوباره» (منوی ⋯): نسخهٔ تازه از الگوی آماده (بی مدل، آبان ۱۴۰۵) — پیش از رفتن می‌پرسد */
      const dra = G1("[data-drebuild-ask]"); if (dra) dra.onclick = () => TP.modal("↻ ساختِ دوبارهٔ سند", `نسخهٔ تازهٔ سندِ «${esc(d.head)}» از الگوی آمادهٔ همین نوع قلم ساخته می‌شود. نسخه‌های قبلی می‌مانند و نسخهٔ تأییدشده تا تأییدِ نسخهٔ تازه معتبر است.`, rebuild, "↻ بساز", "انصراف");
      const dcl = G1("[data-dclose]"); if (dcl) dcl.onclick = () => m.remove();
      const ec = G1("[data-ecancel]"); if (ec) ec.onclick = () => { keep(); st.mode = "view"; paint(); };
      const es = G1("[data-esave]"); if (es) es.onclick = () => {
        keep();
        if (!st.score) return msg("امتیازِ ۱ تا ۵ را بزنید.");
        review({ action: "edit", ...rv(), edit: { summary_fa: G1("[data-esum]").value, anchor_rule: G1("[data-eanchor]").value, reservation_rule: G1("[data-eres]").value,
          replies: [...Qd("[data-erep]")].map((t) => ({ state_id: t.dataset.erep, prepared_reply_fa: t.value })) } });
      };
      const bc = G1("[data-bcancel]"); if (bc) bc.onclick = () => { keep(); st.mode = "view"; paint(); };
      const bs = G1("[data-bsave]"); if (bs) bs.onclick = () => {
        keep();
        if (d.latest && d.latest.doc && !st.score) return msg("پیش از سازنده به سندِ مدل امتیاز بدهید.");
        const v = (k) => G1(`[data-bp="${k}"]`).value.trim();
        const pct = (s) => (s === "" ? null : Number(TP.digits(s)) / 100);
        const params = { weights: Object.fromEntries([...Qd("[data-bw]")].map((x) => [x.dataset.bw, Number(TP.digits(x.value))])),
          target_vs_ref: pct(v("target_vs_ref")), rv_tol: pct(v("rv_tol")), rounds: Number(TP.digits(v("rounds"))), max_pay_months: Number(TP.digits(v("max_pay_months"))), panel_rate: pct(v("panel_rate")),
          pace: (box.querySelector('input[name="bpace"]:checked') || {}).value, others: (box.querySelector('input[name="bothers"]:checked') || {}).value,
          tradeables: [...Qd("[data-btrade]:checked")].map((x) => x.dataset.btrade), hard_constraints: G1("[data-bhard]").value.split("\n").map((s) => s.trim()).filter(Boolean),
          split_ok: G1("[data-bsplit]").checked, note: G1("[data-bnote]").value };
        if (!d.latest) return msg("سند هنوز در صف نیست؛ ↻ تازه کنید.");
        review({ action: "builder", ...rv(), params });
      };
    }
    paint();
  }
  /** ویرایشگرِ «📋 شرایط خرید» باز و پیش چشم (از گام‌های شروع و کادرِ شروع) */
  function termsGo(it) {
    if (!it || termsFixed(it)) return;
    S.termsOpen[it.id] = true; if (S.tab !== "history") S.tab = "history";
    render();
    const el = document.querySelector(".terms-box"); if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); el.classList.add("tp-flash"); setTimeout(() => el.classList.remove("tp-flash"), 1600); }
  }
  async function pkStartUI(it) {
    if (!S.picks[it.id] || !S.picks[it.id].list) return;
    if (normDirty(it)) return TP.modal("تغییرات ذخیره نشده", `ساختارِ «${esc(it.title)}» را عوض کرده‌اید ولی تأیید نکرده‌اید؛ اول «تأیید» را بزنید.`, null, "باشد", "");
    /* شرایطِ خریدِ ذخیره‌نشده: همین شرایط برای همه می‌رود و بعد از شروع ثابت است */
    if (termsDirty(it)) {
      return TP.modal("📋 شرایط خرید ذخیره نشده", `شرایطِ خریدِ «${esc(it.title)}» را عوض کرده‌اید ولی ذخیره نکرده‌اید. همین شرایط زیرِ پیامِ استعلام برای همهٔ تأمین‌کنندگان می‌رود و بعد از شروع عوض نمی‌شود.`,
        () => saveTermsUI(it, () => pkStartUI(it)), "💾 ذخیره و ادامه", "انصراف");
    }
    try { await pkFlushWhy(it); } catch (e) { return TP.modal("ذخیره نشد", esc(e.message), null, "باشد", ""); }
    const P = S.picks[it.id], started = !!P.started_at;
    const go = P.list.filter((e) => e.on && (!started || !e.go));
    const miss = P.mode === "pick" && !started ? P.list.filter((e) => e.top && !e.on && !String(e.why || "").trim()) : [];
    if (miss.length) { render(); return TP.modal("توضیح لازم است", `برداشتنِ تیکِ نفراتِ پیش‌تیک (★) توضیح می‌خواهد: ${miss.map((e) => `«${esc(e.name)}»`).join("، ")} — علت را کنار همان نام بنویسید.`, null, "باشد", ""); }
    if (!go.length) return TP.modal("تیکی نیست", started ? "انتخابِ تازه‌ای برای دعوت نیست." : "دست‌کم یک تأمین‌کننده را تیک بزنید.", null, "باشد", "");
    const noPh = go.filter((e) => !e.panel).length;
    const title = started ? "📨 دعوت از انتخاب‌های تازه" : P.mode === "handoff" ? "🤖 سپردن به کارشناس هوشمند" : "🚀 شروعِ دعوت و مذاکره";
    /* پیش‌نمایش: همان متنی که برای هر گیرنده می‌رود، و شرایطِ خرید */
    let pv = null;
    const b0 = TP.busy(title, "پیش‌نمایشِ پیام…");
    try { pv = await TP.api(`/items/${it.id}/invite-preview`); } catch (_) { pv = null; }
    b0.close();
    const L = termsOfItem(it), rows = (pv && pv.rows) || [];
    const termsHtml = L ? `<div class="tp-note" style="margin:8px 0">📋 <b>شرایط خرید</b> — زیرِ هر قلمِ پیامِ استعلام برای همه می‌رود:<br>${esc(termsSummary(L))}</div>`
      : `<div class="tp-note warn" style="margin:8px 0">📋 شرطِ خریدی نگذاشته‌اید — تأمین‌کننده هر شرطی را می‌تواند بدهد. <button class="tp-btn xs" data-st-terms>✏️ تعیینِ شرایط</button></div>`;
    const msgHtml = rows.length ? `<div style="margin:8px 0"><b>✉️ پیامی که می‌رود</b>${rows.length > 1 ? ` <span class="dim">(نمونهٔ «${esc(rows[0].name)}»${pv.first_msg ? "؛ هر گیرنده متنِ خودش را می‌گیرد" : ""})</span>` : ""}
        <pre class="fm-text" style="max-height:26vh;overflow:auto;margin:4px 0">${esc(rows[0].text)}</pre>
        ${pv.first_msg ? `<button class="tp-btn xs" data-st-fm>✏️ دیدن و ویرایشِ پیامِ هر گیرنده</button>` : ""}</div>` : "";
    /* «✉️ پیام اول»: ردیفی که قالبش با ردیفِ بالایی فرق دارد و علت ندارد — دکمهٔ اصلی به‌جای شروع، همان کادر را برای نوشتنِ علت باز می‌کند */
    const fmMiss = (pv && pv.fm_missing) || [];
    const fmHtml = fmMiss.length ? `<div class="tp-note warn" style="margin:8px 0">✉️ قالبِ پیامِ اولِ ${fmMiss.map((x) => `«${esc(x.name)}»`).join("، ")} با ردیفِ بالایی فرق دارد و علت ندارد؛ پیش از شروع علتش را بنویسید.</div>` : "";
    const d = TP.modal(title, `${started ? "" : `ساختار و شرایطِ «${esc(it.title)}» منجمد می‌شود و این قلم به کارشناس هوشمند می‌رود. `}کارشناس هوشمند از این ${M(go.length)} تأمین‌کننده دعوت می‌کند و مذاکره را پیش می‌برد:
      <div style="margin:8px 0;max-height:22vh;overflow:auto">${go.map((e) => `• ${esc(e.name)}${e.panel ? "" : ` <span class="chip warn">بی شمارهٔ پنل — منتظر می‌ماند</span>`}`).join("<br>")}</div>
      ${noPh ? `<div class="dim">${M(noPh)} نفر هنوز شمارهٔ پنلِ تیک‌خورده ندارند؛ هر وقت شماره‌شان را با تیکِ پنل بزنید، دعوت می‌شوند.</div>` : ""}
      ${termsHtml}${fmHtml}${msgHtml}
      <div class="dim" style="font-size:.84rem">⏱ دعوت‌ها یکی‌یکی می‌روند (حدوداً هر دقیقه ${M((pv && pv.per_tick) || 1)})؛ زیرِ هر پیام کارتِ استعلام با مشخصات و شرایطِ خرید می‌آید. پاسخ‌ها را در «مکاتبات» می‌بینید.</div>`, async () => {
      if (fmMiss.length) return pkFmUI(it, { tried: true });
      const b = TP.busy(title, esc(it.title));
      try { const r = await TP.api(`/items/${it.id}/ai-start`, { body: {} }); b.close(); await reload(); S.picks[it.id] = r; render(); okTick(started ? "دعوت شد" : "سپرده شد"); }
      catch (e) {
        b.close();
        if (e.data && e.data.need_doc) return pkDocUI(it, () => pkStartUI(it));
        if (e.data && e.data.need_fm_why) return pkFmUI(it, { tried: true });
        TP.modal("نشد", esc(e.message), null, "باشد", ""); await loadPicks(it, true);
      }
    }, fmMiss.length ? "✉️ نوشتنِ علت‌ها…" : started ? "✅ تأیید و دعوت" : P.mode === "handoff" ? "✅ تأیید و سپردن" : "✅ تأیید و 🚀 شروع", "انصراف");
    const st = d.querySelector("[data-st-terms]"); if (st) st.onclick = () => { d.remove(); termsGo(it); };
    const sf = d.querySelector("[data-st-fm]"); if (sf) sf.onclick = () => { d.remove(); pkFmUI(it); };
  }
  function pkAddUI(it) {
    const hist = (S.hist[it.id] && S.hist[it.id].suppliers) || [];
    const d = TP.modal("➕ افزودن به فهرست دعوت", `<div class="tp-field"><b>نام تأمین‌کننده</b><input class="tp-input" id="pka-name" list="pka-list" style="width:100%" autofocus></div>
      <datalist id="pka-list">${hist.filter((s) => !pkHas(it, s.name)).slice(0, 60).map((s) => `<option value="${esc(s.name)}">`).join("")}</datalist>
      <div class="dim" style="font-size:.82rem;margin-top:6px">از سوابقِ همین قلم یا هر نامِ دیگر؛ توضیح نمی‌خواهد. برای دعوت، شمارهٔ پنلِ تیک‌خورده هم لازم است (📱 در همان ردیف).</div>`, async () => {
      const name = (d.querySelector("#pka-name").value || "").trim(); if (!name) return;
      await pkEdit(it, { add: [{ name, src: "manual" }] });
    }, "بیفزا", "انصراف");
  }
  function pkRebuildUI(it) {
    TP.modal("↻ بازسازیِ فهرست", "فهرست از سوابقِ امروز و «قاعدهٔ دعوت»ِ فعلی دوباره ساخته می‌شود: تیک‌ها و توضیح‌های سوابق به پیش‌فرض برمی‌گردند و افزوده‌های شما (جستجوی هوشمند و نام‌های دیگر) می‌مانند.",
      () => pkEdit(it, { rebuild: true }), "بازسازی", "انصراف");
  }
  /** «🎯» در جدولِ سوابق: همان نام به فهرستِ دعوت */
  const pkHistBtn = (it, name) => (!pkEditable(it) ? "" : pkHas(it, name) ? ` <span class="chip info" title="در «🎯 فهرست دعوت»">🎯</span>`
    : ` <button class="tp-btn xs" data-pkadd-name="${esc(name)}" title="به «🎯 فهرست دعوت»ِ کارشناس هوشمند — تیک‌خورده">🎯</button>`);
  /** «🎯 به فهرست دعوت» در نتایجِ جستجوی هوشمند — فقط با انتخابِ خودِ کارشناس (تصمیم ۱۸) */
  const smPickBtn = (it, sid, i, s) => (!pkEditable(it) ? "" : pkHas(it, s.name) ? ` <span class="chip info" title="در «🎯 فهرست دعوت»">🎯 در فهرست</span>`
    : ` <button class="tp-btn xs primary" data-sm-pick="${sid}|${i}" title="کارشناس هوشمند فقط تأمین‌کنندهٔ انتخاب‌شده با شمارهٔ پنلِ تیک‌خورده را دعوت می‌کند">🎯 به فهرست دعوت</button>`);
  function smPickNote(it) {
    if (!flow2() || !it || it.state !== "open" || !pkOn(it)) return "";
    const P = S.picks[it.id];
    if (P === undefined && normOk(it)) loadPicks(it);
    if (P && P.mode === "handoff") return `<div class="tp-status"><b>🎯 سپردن یا برگشت</b>${TP.ui.info("expert.picks")}</div>`;
    const n = P && P.list ? P.list.filter((e) => e.src === "smart").length : 0;
    return `<div class="tp-status"><b>🎯 فهرست دعوت</b><span class="sp chips"><span class="chip" title="کارشناس هوشمند خودش جستجو نمی‌کند و از این نتایج فقط آن‌هایی را دعوت می‌کند که شما با «🎯 به فهرست دعوت» انتخاب کنید و شمارهٔ پنلِ تیک‌خورده دارند؛ نفرستادن توضیح نمی‌خواهد">${n ? `${M(n)} انتخاب از جستجو در فهرست است` : "با «🎯 به فهرست دعوت» کنار هر نتیجه بیفزایید"}</span>
      <span class="chip">${P && P.started_at ? (P.fresh ? "بعد «📨 دعوت از انتخاب‌های تازه» در «بررسی سوابق»" : "دعوت‌شده") : "بعد «🚀 شروع» در «بررسی سوابق»"}</span></span>
      <button class="tp-btn xs" data-pkgo>🎯 رفتن به فهرست دعوت</button>${TP.ui.info("expert.picks")}</div>`;
  }
  async function smPickUI(sid, idx) {
    const it = item(), s = supOfSearch(sid, idx); if (!it || !s) return;
    const P = S.picks[it.id];
    const mob = supPhones(s).map((p) => String(p).replace(/[^\d+]/g, "")).find((p) => /^(\+98|0098|98|0)?9\d{9}$/.test(p)) || "";
    const d = TP.modal(`🎯 «${esc(s.name)}» به فهرست دعوت`, `<p style="margin-top:0">کارشناس هوشمند فقط به شمارهٔ پنلِ تیک‌خورده پیامک می‌دهد. شماره را ببینید یا وارد کنید و تیکِ پنل بزنید (اختیاری — بعد هم از «📱» در فهرست می‌شود).</p>
      <div class="toolrow" style="align-items:end;flex-wrap:wrap;gap:8px">
        <label class="tp-field"><b>شمارهٔ همراه</b><input class="tp-input" id="smp-num" dir="ltr" inputmode="tel" value="${esc(mob)}" placeholder="09…" style="width:150px"></label>
        <label class="tp-field"><b>برچسب</b><input class="tp-input" id="smp-lab" value="جستجوی هوشمند" style="width:150px"></label>
        <label class="chkline"><input type="checkbox" id="smp-panel" checked> تیکِ پنل</label></div>
      <p class="dim" style="font-size:.84rem">${P && P.started_at ? "بعد از افزودن، در «بررسی سوابق» «📨 دعوت از انتخاب‌های تازه» را بزنید." : "بعد در «بررسی سوابق» «🚀 شروع» را بزنید."}</p>`, async () => {
      const num = (d.querySelector("#smp-num").value || "").trim();
      try {
        if (num) await TP.api("/sp/x/phones", { body: { supplier_name: s.name, phone: num, label: d.querySelector("#smp-lab").value || "جستجوی هوشمند", panel: d.querySelector("#smp-panel").checked } });
        await pkEdit(it, { add: [{ name: s.name, src: "smart", sid, ph: supPhones(s) }] });
      } catch (e) { TP.modal("نشد", esc(e.message), null, "باشد", ""); }
    }, "به فهرست بیفزا", "انصراف");
  }

  /** only: شناسهٔ قلمی که از «🎯 فهرست دعوت»ِ همان قلم آمده — فقط همان از پیش تیک می‌خورد */
  function manualUI(only) {
    const can = openItems().filter((x) => { const m = aiItem(x); return m && !m.manual && !m.waiting && m.mode !== "direct" && !m.in_run && !m.started_at; });
    if (!can.length) return TP.modal("قلمی نیست", "همهٔ اقلام دستی‌اند، در انتظارِ مدیرند یا از نوعِ «مستقیم»؛ «مستقیم» را بی اجازه خودتان انجام دهید.", null, "باشد", "");
    const d = TP.modal("↩️ برگرداندن به مدیر — انجام دستی", `<p>این اقلام به‌جای کارشناس هوشمند با خودِ شما باشد؟ مدیر با علتِ شما تصمیم می‌گیرد؛ تا تصمیمش، سپرده نمی‌شوند.</p>
      <div style="display:flex;flex-direction:column;gap:4px;margin:8px 0">${can.map((x) => `<label class="chkline"><input type="checkbox" data-mitem="${x.id}" ${!only || x.id === only ? "checked" : ""}> ${esc(x.title)}</label>`).join("")}</div>
      <div class="tp-field"><b>علت (اجباری)</b><textarea class="tp-input" id="man-why" rows="3" style="width:100%;margin-top:6px" placeholder="مثلاً تأمین‌کنندهٔ این قلم فقط حضوری کار می‌کند"></textarea></div>`, async () => {
      const ids = [...d.querySelectorAll("[data-mitem]")].filter((c) => c.checked).map((c) => +c.dataset.mitem);
      const why = ((d.querySelector("#man-why") || {}).value || "").trim();
      if (!ids.length) return TP.modal("قلمی انتخاب نشد", "دست‌کم یک قلم را تیک بزنید.", null, "باشد", "");
      if (!why) return TP.modal("علت لازم است", "برای «انجام دستی» علت را بنویسید تا مدیر تصمیم بگیرد.", null, "باشد", "");
      try { await TP.api(`/assignments/${A().id}/decision`, { body: { action: "manual", item_ids: ids, reason: why } }); await reload();
        okTick("برای مدیر رفت"); }
      catch (e) { TP.modal("نشد", esc(e.message), null, "باشد", ""); }
    }, "برای مدیر بفرست", "انصراف");
  }

  /* ---------- تب بررسی سوابق ----------
     دو حالت (Task.txt، مهر ۱۴۰۵): «عین قلم» — همان نوع قلم با دقیقاً همان لایه‌های
     ویژگی — و «نوع قلم» — همهٔ اقلام همان نوع. ساختار قلم (نوع و لایه‌ها) یا از فهرست
     اقلام می‌آید (کد راهکاران)، یا با تیک «نرمال‌سازی اقلام» پیشنهاد و با تأیید
     کارشناس ثبت می‌شود. جدولِ نرخ‌های تبدیلِ واحد به خواستِ مدیر (مهر ۱۴۰۵) از ویرایشگر برداشته شد.
     مبنای مقایسهٔ تأمین‌کنندگان (تصمیم مدیر) سه ستون است، نه قیمت: دفعات خرید، جمع
     مقدار (به واحد مرجع) و «گشتاور» — همان جمع مقدار وقتی خریدِ تازه‌تر سنگین‌تر
     شمرده شود (شیب از نوار ۱..۱۰). در امتیاز برابر، ردهٔ بالاتر (A، B، C) جلوتر است.
     رتبه‌ها را سرور می‌سازد تا پنل و بات تلگرام یک عدد بگویند. قیمت‌ها (به زمستان
     ۱۴۰۴) فقط در ریز خریدها و کارت تأمین‌کننده‌اند. گروه «خرید قلم در پروژه» تا رسیدن
     ستون پروژه به فایل مرجع خاموش است. */
  /* حالت جستجو یادداشت نمی‌شود: هر بار صفحه با «نوع قلم» باز می‌شود (تصمیم مدیر، مهر ۱۴۰۵) */
  const MOM_KEY = "tp.mom", NORM_KEY = "tp.norm", PIDX_KEY = "tp.pidx";
  try {
    S.mom = Math.min(10, Math.max(1, +(localStorage.getItem(MOM_KEY) || 5)));
    S.normOn = localStorage.getItem(NORM_KEY) === "1";
    S.priceIdx = localStorage.getItem(PIDX_KEY) === "1";
  } catch (_) { /* حالت خصوصی */ }
  const RQ = (x) => Math.round((Number(x) || 0) * 100) / 100;   /* مقدار بدون زبالهٔ اعشار شناور */
  const HSORT = { m: "rankM", qty: "rankQty", n: "rankN", v: "rankV", f: "rankF" };
  /* «قیمت روز» (فاز ۲ طرح «خرید هوشمند»): پیش‌فرض با نرخ دلار (مبلغ × نرخِ امروز ÷ نرخِ روزِ خرید)؛ تیکِ «مرکز آمار» همان تعدیلِ
     فصلیِ زمستان ۱۴۰۴. رتبهٔ ارزش خرید و رتبهٔ نهایی همیشه دلاری‌اند (سرور: worker/history.js) */
  const usdOn = (d) => !!(d && d.usd) && !S.priceIdx;
  const priceLab = (d) => (usdOn(d) ? "قیمت روز" : (d && d.base && d.base.priceLabel) || "زمستان ۱۴۰۴");
  const bigRial = (v) => { if (v == null) return "—"; const a = Math.abs(v); return a >= 1e9 ? `${(v / 1e9).toLocaleString("en-US", { maximumFractionDigits: 1 })} میلیارد` : a >= 1e6 ? `${(v / 1e6).toLocaleString("en-US", { maximumFractionDigits: 1 })} میلیون` : M(Math.round(v)); };
  const HMODE_FA = { exact: "عین قلم", head: "نوع قلم", pick: "قلم انتخابی" };
  /* چرا یک نام در سهم و رتبه نیامده (worker/history.js:excludedWhy) */
  const EXCL_WHY = {
    bucket: "نام تجمیعی فایل مرجع است، نه یک تأمین‌کننده؛ در سهم‌ها و رتبه‌ها حساب نشده",
    employer: "مصالحِ تحویلیِ کارفرما است با قیمت اسمی، نه خرید از تأمین‌کننده؛ در سهم‌ها و رتبه‌ها حساب نشده",
  };
  /* ساختار قلم از کجا آمده: سه تای اول خودِ دیتابیس‌اند (کد یا عنوانِ عیناً همان) و مدل صدا زده نمی‌شود */
  const SRC_FA = { catalog: "از دیتابیس — همین کد", title: "از دیتابیس — همین عنوان", edit: "از دیتابیس — ویرایش کارشناس",
    cache: "پیشنهاد مدل (همین عنوان قبلاً تفکیک شده)", model: "پیشنهاد مدل", manual: "ویرایش کارشناس" };
  const DB_SRC = new Set(["catalog", "title", "edit"]);
  /* نرخ تبدیل با دو رقم اعشار (تصمیم مدیر، مهر ۱۴۰۵)؛ نرخی که با دو رقم صفر می‌شود (۰٫۰۰۴) تا
     نخستین رقمِ غیرصفرش. `grp`: جداکنندهٔ هزارگان (در فیلدِ ورودی نه) */
  const rateDigits = (x) => { let d = 2; while (d < 12 && x !== 0 && Math.round(Math.abs(x) * 10 ** d) === 0) d++; return d; };
  const fmtRate = (r, grp = true) => {
    const x = r == null || r === "" ? NaN : Number(r);
    return Number.isFinite(x) ? x.toLocaleString("en-US", { maximumFractionDigits: rateDigits(x), useGrouping: grp }) : grp ? "—" : "";
  };
  /* قواعد یکسان‌سازی (catalog-rules.mjs، از <script type="module"> صفحه): لایهٔ کمّی عدد و
     واحدِ جدا، و نمایش «ضمنی». اگر ماژول نرسیده باشد پنل با فیلد متنی ساده کار می‌کند. */
  const RL = () => (window.TP && TP.rules) || null;
  const showLayer = (v) => (RL() ? RL().showLayer(v) : typeof v === "string" ? v : v && v.v != null ? `${v.v}${v.u ? " " + v.u : ""}` : String(v == null ? "" : v));
  const isQuant = (k) => !!(RL() && RL().QUANT[k]);
  /* واحدهای هم‌بُعدِ یک لایهٔ کمّی (ضخامت: میلی‌متر، سانتی‌متر، اینچ …) */
  const unitsFor = (k) => { const R = RL(); if (!R || !R.QUANT[k]) return []; const d = R.QUANT[k]; return R.UNIT_NAMES.filter((u) => d.includes("*") || d.includes(R.UNITS[u].dim)); };

  /* «قلم انتخابی» هر قلم: لایه‌های تیک‌خورده (واحدها null = همه؛ تیکِ واحدها با جدولِ نرخ‌ها رفت) */
  const pickOf = (it) => S.pick[it.id] || (S.pick[it.id] = { layers: [], units: null });
  /* پارامترهای جستجو. جستجو همیشه بر ساختارِ نرمال‌سازی است (ذخیره‌شده، یا دیتابیس با کد/عنوان)؛ پیشنهادِ
     ذخیره‌نشدهٔ مدل همراهِ درخواست می‌رود و فقط خوانده می‌شود. تیکِ «نرمال‌سازی اقلام» فقط کادرِ لایه‌ها را
     نشان می‌دهد (تصمیم مدیر، مهر ۱۴۰۵). */
  const unsaved = (n) => !!(n && n.data && n.data.head && !n.data.confirmed && !DB_SRC.has(n.data.source) && !n.data.needsModel);
  const histQuery = (it) => {
    let q = `item_id=${it.id}&k=${S.mom}&mode=${S.hmode}&norm=1`;
    const n = S.norm[it.id];
    if (unsaved(n)) q += `&struct=${encodeURIComponent(JSON.stringify({ head: n.data.head, layers: n.data.layers || {} }))}`;
    if (S.hmode === "pick") {
      const p = pickOf(it);
      for (const l of p.layers) q += `&pl=${encodeURIComponent(l)}`;
      for (const u of p.units || []) q += `&pu=${encodeURIComponent(u)}`;
    }
    return q;
  };
  const normDirty = (it) => { const n = S.norm[it.id]; return !!(n && n.draft && n.base !== JSON.stringify(n.draft)); };
  /* مقدارِ کمّی به واحد مرجعِ لایه (catalog-rules.mjs:toRef) — «۶ متر ≈ ۶۰۰۰ میلی‌متر»؛ خالی اگر همان واحد است */
  const refTxt = (k, t, u) => {
    const R = RL(); if (!R || !R.toRef || !u) return "";
    const q = R.quantWith(k, t, u); if (!q || Array.isArray(q)) return "";
    const r = R.toRef(k, q); if (!r || r.same) return "";
    return `≈ ${r.n.map((x) => M(Math.round(x * 1000) / 1000)).join("×")} ${r.u}`;
  };
  const CHART_COLORS = ["#4f8cff", "#ff8c42", "#22c55e", "#e5484d", "#a78bfa", "#f2c230", "#2dd4bf", "#f472b6", "#93c5fd", "#fb923c", "#86efac", "#fca5a5"];

  const histRows = (d) => [...(d.suppliers || [])].sort((a, b) => a[HSORT[S.hsort] || "rankM"] - b[HSORT[S.hsort] || "rankM"]
    || (b.qtyM || 0) - (a.qtyM || 0) || String(a.name).localeCompare(String(b.name), "fa"));
  /* چیپِ رده؛ ✎ یعنی پشتیبانی رده را با دلیل عوض کرده («🏷 تأمین‌کنندگان») و عنوانش ردهٔ خودِ فایلِ سوابق را می‌گوید */
  const gradeChip = (s, pre, tip) => (s.grade || s.gradeOver ? ` <span class="chip grade${s.grade ? ` g${esc(s.grade)}` : ""}" title="${esc(s.gradeOver
    ? `ردهٔ پشتیبانی — در فایلِ سوابق: ${s.gradeFile || "بی‌رده"}` : tip)}">${pre || ""}${esc(s.grade || "بی‌رده")}${s.gradeOver ? " ✎" : ""}</span>` : "");

  /* کارت تأمین‌کننده — بالای جدول، با کلیک روی نام باز می‌شود */
  function vProfile(it) {
    const d = S.hist[it.id]; if (!S.prof || !d) return "";
    const p = (d.suppliers || []).find((x) => x.key === S.prof); if (!p) return "";
    const c = p.contact || {};
    const unit = d.item && d.item.unit ? " " + d.item.unit : "";
    const f = (lab, val, cls) => `<div class="f"><b>${lab}</b><span class="${cls || ""}">${val == null || val === "" ? "—" : esc(val)}</span></div>`;
    const per = d.item && d.item.unit ? ` · هر ${esc(d.item.unit)}` : "";
    return `<div class="prof"><div class="top"><h4>${esc(p.name)}</h4>${gradeChip(p, "رده ", "ردهٔ تأمین‌کننده")}${p.code ? `<span class="chip num" title="کد تأمین‌کننده">${esc(p.code)}</span>` : ""}
        ${(() => { /* «👤 پروفایل کامل» (sup-profile.js) — فقط وقتی کلیدِ دفتر تأمین‌کنندگان در پنل پشتیبانی روشن است */
          if (!TP.supProfile) return "";
          if (S.crReg === undefined) { S.crReg = null; TP.supProfile.enabled().then((v) => { S.crReg = v; if (v) render(); }); }
          return S.crReg ? TP.supProfile.btn(p.name) : ""; })()}
        <button class="tp-btn xs" data-close-prof style="margin-inline-start:auto">بستن</button></div>
      <div class="gridp">
        ${f("دفعات خرید", `${M(p.n)} بار (رتبه ${M(p.rankN)})`, "num")}
        ${f("جمع مقدار", `${M(RQ(p.qty))}${unit} (رتبه ${M(p.rankQty)})`, "num")}
        ${f("امتیاز گشتاوری", `${M(RQ(p.qtyM))}${unit} (رتبه ${M(p.rankM)})`, "num")}
        ${f("نخستین خرید", p.firstDate, "num")}${f("آخرین خرید", p.lastDate, "num")}
        ${(() => { const u = usdOn(d), av = u ? p.avgUsd : p.avgUnit, mn = u ? p.minUsd : p.minUnit, mx = u ? p.maxUsd : p.maxUnit;
          return f(`قیمت واحد میانگین (${priceLab(d)}${per})`, av == null ? null : M(Math.round(av)) + " ریال", "num")
            + f(`کمینه / بیشینه قیمت واحد (${priceLab(d)})`, mn == null ? null : `${M(Math.round(mn))} تا ${M(Math.round(mx))}`, "num")
            + f(`ارزش خرید (${priceLab(d)})`, `${bigRial(u ? p.val : p.adjVal)} ریال (رتبه ${M(p.rankV)})`, "num")
            + f("رتبهٔ نهایی", `${M(p.rankF)} — امتیاز ${p.score}`, "num"); })()}
        ${f("شهر", c.city)}${f("تلفن همراه", c.phone, "num")}${f("تلفن ثابت", c.tel2, "num")}${f("ایمیل", c.email)}${f("وب‌سایت", c.site)}</div>
      ${c.note ? `<div class="desc"><b>توضیحات مدیر:</b> ${esc(c.note)}</div>` : ""}
      <div class="dim" style="font-size:.82rem;margin-top:8px">${p.contact ? "راه‌های تماس از دفترچهٔ تأمین‌کنندگان خوانده شده‌اند."
        : `راه‌های تماس این تأمین‌کننده هنوز در دفترچه ثبت نشده است. <span class="chip mock">دفترچهٔ تأمین‌کنندگان — مرحلهٔ بعد</span>`}</div>
      ${vSpPhones(p.name, c.phone)}</div>`;
  }

  /* شماره‌های مکاتبات (پنل و بات تأمین‌کننده) همین تأمین‌کننده و افزودنِ شمارهٔ تازه (مهر ۱۴۰۵).
     تیکِ «پنل» یعنی پنلِ تأمین‌کننده به این شماره وصل است؛ کارشناس هوشمند فقط به شمارهٔ تیک‌خورده پیامک می‌دهد. */
  const digits = (x) => String(x || "").replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[^\d]/g, "").replace(/^(0098|98|0)/, "");
  function vSpPhones(name, dirPhone) {
    const ph = S.spPh[name];
    if (ph === undefined) loadSpPhones(name);
    const list = (ph && ph.phones) || [];
    const fill = dirPhone && !list.some((x) => digits(x.phone) === digits(dirPhone)) ? dirPhone : "";
    return `<div class="spph" style="margin-top:10px;border-top:1px solid var(--tp-line);padding-top:8px"><b>📱 شماره‌ها برای مکاتبات و پنل تأمین‌کننده</b>
      <div style="margin-top:4px">${!ph || ph.loading ? `<span class="dim">در حال خواندن…</span>` : ph.err ? `<span class="chip warn">${esc(ph.err)}</span>`
        : list.length ? list.map((x) => `<span class="chip ${x.panel ? "ok" : ""}" title="${x.panel ? "تیکِ پنل: کارشناس هوشمند به این شماره پیامک می‌دهد" : "بی تیکِ پنل"}">${x.panel ? "☑️ " : ""}<span dir="ltr">${esc(x.phone)}</span>${x.label ? ` · ${esc(x.label)}` : ""}</span>`).join(" ")
        : `<span class="dim">هنوز شماره‌ای برای مکاتبات ثبت نشده.</span>`}</div>
      <div class="toolrow" style="margin-top:6px;align-items:end;flex-wrap:wrap;gap:8px">
        <label class="tp-field"><b>شمارهٔ همراه</b><input class="tp-input" data-pp-phone dir="ltr" inputmode="tel" placeholder="09…" value="${esc(fill)}" style="width:150px"></label>
        <label class="tp-field"><b>برچسب</b><input class="tp-input" data-pp-label list="pp-labels" placeholder="همراه، فروش، دفتر…" style="width:150px">
          <datalist id="pp-labels"><option>همراه</option><option>فروش</option><option>دفتر</option><option>مدیر فروش</option></datalist></label>
        <label class="chkline" title="پنل تأمین‌کننده به این شماره وصل است؛ کارشناس هوشمند فقط به شمارهٔ تیک‌خورده پیامک می‌دهد"><input type="checkbox" data-pp-panel> تیکِ پنل</label>
        <button class="tp-btn sm primary" data-pp-add="${esc(name)}">➕ افزودن شماره</button></div></div>`;
  }
  async function loadSpPhones(name) {
    S.spPh[name] = { loading: true };
    try { S.spPh[name] = { phones: (await TP.api(`/sp/x/phones?name=${encodeURIComponent(name)}`)).phones || [] }; }
    catch (e) { S.spPh[name] = { err: e.message }; }
    render();
  }
  async function addSpPhone(btn) {
    const box = btn.closest(".spph"), name = btn.dataset.ppAdd;
    const body = { supplier_name: name, phone: box.querySelector("[data-pp-phone]").value, label: box.querySelector("[data-pp-label]").value, panel: box.querySelector("[data-pp-panel]").checked };
    try {
      const r = await TP.api("/sp/x/phones", { body });
      delete S.spPh[name];
      TP.modal("شماره ثبت شد", `<span dir="ltr">${esc(r.phone.phone)}</span>${r.phone.label ? ` (${esc(r.phone.label)})` : ""} برای «${esc(r.supplier.name)}» ${r.phone.panel ? "با تیکِ پنل " : ""}ثبت شد؛ در «💬 مکاتبات» هنگامِ ارسال همین شماره پیشنهاد می‌شود.`, null, "باشد", "");
      render();
    } catch (e) { TP.modal("ثبت نشد", esc(e.message), null, "باشد", ""); }
  }

  /* نمودار روند خرید — پنجرهٔ بزرگ وسط صفحه. افقی: زمان از اولین تا آخرین تأمین، با
     خط‌کش سال (بازهٔ بلند) یا ماه (بازهٔ کوتاه). عمودی: مقدار با گام‌های گرد (۱، ۲، ۲٫۵، ۵
     × ۱۰ⁿ) که به مقیاس همان مقدارهای خریداری‌شده می‌خورد. هر خرید یک نقطه به رنگ
     تأمین‌کننده‌اش و نقاط هر تأمین‌کننده با خط هم‌رنگ به هم وصل‌اند. */
  const niceStep = (raw) => { const p = Math.pow(10, Math.floor(Math.log10(raw > 0 ? raw : 1))), f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; };
  const jParts = (ms) => TP.fmtD(ms).split("/").map(Number);
  const jMonth = (y, m) => TP.jStr2ms(`${y + Math.floor((m - 1) / 12)}/${((m - 1) % 12 + 12) % 12 + 1}/01`);

  const seriesKey = (it) => `${it.id}|${S.hmode}|${S.hmode === "pick" ? JSON.stringify(pickOf(it)) : ""}`;
  function chartBody(it, d) {
    const se = S.series[seriesKey(it)];
    if (se === "loading") return `<div class="empty">در حال خواندن نقاط نمودار…</div>`;
    const pts = ((se && se.points) || []).map((p) => ({ ...p, t: TP.jStr2ms(p.date) })).filter((p) => p.t != null && p.qty > 0);
    if (!pts.length) return `<div class="tp-note warn">هیچ خرید مقدارداری برای نمودار نیست.</div>`;
    const by = new Map();
    for (const p of pts) { if (!by.has(p.key)) by.set(p.key, { name: p.name, pts: [] }); by.get(p.key).pts.push(p); }
    const groups = [...by.values()].sort((a, b) => b.pts.reduce((n, x) => n + x.qty, 0) - a.pts.reduce((n, x) => n + x.qty, 0));
    groups.forEach((g, i) => { g.color = CHART_COLORS[i % CHART_COLORS.length]; g.pts.sort((a, b) => a.t - b.t); });

    const W = 1200, H = 620, PL = 150, PR = 36, PT = 30, PB = 86, FS = 22;
    const tMin = Math.min(...pts.map((p) => p.t)), tMax = Math.max(...pts.map((p) => p.t));
    const [y0, m0] = jParts(tMin), [y1, m1] = jParts(tMax);
    const span = (y1 - y0) * 12 + (m1 - m0) + 1;            /* ماه‌های درگیر */
    let start, end;
    const ticks = [];
    if (span > 24) {
      start = TP.jStr2ms(`${y0}/01/01`); end = TP.jStr2ms(`${y1 + 1}/01/01`);
      const every = Math.max(1, Math.ceil((y1 + 1 - y0) / 12));
      for (let y = y0; y <= y1 + 1; y += every) ticks.push({ t: TP.jStr2ms(`${y}/01/01`), lab: String(y) });
    } else {
      start = jMonth(y0, m0); end = jMonth(y1, m1 + 1);
      const every = [1, 2, 3, 6].find((k) => span / k <= 12) || 12;
      for (let k = 0; k <= span; k += every) { const t = jMonth(y0, m0 + k), [yy, mm] = jParts(t); ticks.push({ t, lab: `${yy}/${String(mm).padStart(2, "0")}` }); }
    }
    const qMax = Math.max(...pts.map((p) => p.qty));
    const step = niceStep(qMax / 5), yMax = Math.max(step, Math.ceil(qMax / step - 1e-9) * step);
    const X = (t) => PL + (end > start ? (t - start) / (end - start) : 0.5) * (W - PL - PR);
    const Y = (q) => H - PB - q / yMax * (H - PT - PB);
    const AX = "#b8c7e6", GRID = "rgba(158,197,255,.16)";
    const fmtQ = (v) => M(Math.round(v * 100) / 100);
    let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" font-family="Vazirmatn, Tahoma, sans-serif">`;
    for (let k = 0; k * step <= yMax + step / 1000; k++) { const v = k * step, y = Y(v); svg += `<line x1="${PL}" x2="${W - PR}" y1="${y}" y2="${y}" stroke="${GRID}"/><text x="${PL - 14}" y="${y + FS / 3}" fill="${AX}" font-size="${FS}" text-anchor="end">${fmtQ(v)}</text>`; }
    for (const tk of ticks) { const x = X(tk.t); svg += `<line x1="${x}" x2="${x}" y1="${PT}" y2="${H - PB}" stroke="${GRID}"/><text x="${x}" y="${H - PB + FS + 14}" fill="${AX}" font-size="${FS}" text-anchor="middle">${tk.lab}</text>`; }
    svg += `<line x1="${PL}" x2="${W - PR}" y1="${H - PB}" y2="${H - PB}" stroke="${AX}" stroke-width="1.5"/><line x1="${PL}" x2="${PL}" y1="${PT}" y2="${H - PB}" stroke="${AX}" stroke-width="1.5"/>`;
    for (const g of groups) {
      if (g.pts.length > 1) svg += `<polyline fill="none" stroke="${g.color}" stroke-width="2.5" opacity=".85" points="${g.pts.map((p) => `${X(p.t).toFixed(1)},${Y(p.qty).toFixed(1)}`).join(" ")}"/>`;
      for (const p of g.pts) svg += `<circle cx="${X(p.t).toFixed(1)}" cy="${Y(p.qty).toFixed(1)}" r="6.5" fill="${g.color}" stroke="#0b1730" stroke-width="1.5"><title>${esc(g.name)} — ${esc(p.date)} — ${fmtQ(p.qty)}</title></circle>`;
    }
    svg += `</svg>`;
    const u = (se && se.unit) || (d && d.item && d.item.unit), unit = u ? ` (${esc(u)} — واحد مرجع)` : "";
    return `<div class="dim" style="font-size:1.05rem;margin-bottom:10px">افقی: زمان از ${esc(TP.fmtD(tMin))} تا ${esc(TP.fmtD(tMax))} · عمودی: مقدار${unit} · هر نقطه یک خرید است.</div>
      ${svg}
      <div class="chlegend">${groups.map((g) => `<span><i style="background:${g.color}"></i>${esc(g.name)}</span>`).join("")}</div>`;
  }

  function openChart(it) {
    if (!it) return;
    const d = S.hist[it.id];
    const onKey = (ev) => { if (ev.key === "Escape") close(); };
    function close() { const x = document.getElementById("tp-chart"); if (x) x.remove(); document.removeEventListener("keydown", onKey); }
    function draw() {
      const bg = document.getElementById("tp-chart"); if (!bg) return;
      bg.innerHTML = `<div class="chart-box" role="dialog" aria-modal="true">
        <div class="chart-head"><b>روند خرید «${esc(it.title)}» — ${HMODE_FA[S.hmode]}</b><button class="tp-btn" data-chart-close>بستن</button></div>
        ${chartBody(it, d)}</div>`;
      bg.querySelector("[data-chart-close]").onclick = close;
    }
    const old = document.getElementById("tp-chart"); if (old) old.remove();
    const bg = document.createElement("div"); bg.id = "tp-chart"; bg.className = "chart-bg";
    bg.onclick = (ev) => { if (ev.target === bg) close(); };
    document.body.appendChild(bg);
    document.addEventListener("keydown", onKey);
    const sk = seriesKey(it);
    if (S.series[sk] && S.series[sk] !== "loading") { draw(); return; }
    S.series[sk] = "loading"; draw();
    TP.api(`/suppliers/history/series?${histQuery(it)}`)
      .then((r) => { S.series[sk] = r; draw(); })
      .catch((err) => { S.series[sk] = null; close(); TP.modal("خطا", esc(err.message), null, "باشد", ""); });
  }

  /* نام همهٔ نوع‌های قلم برای انتخاب در فیلد «نوع قلم» — یک بار در هر بار باز شدن صفحه؛ فهرستِ
     پیشنهادی بی‌بازرندر پر می‌شود تا فوکوس و نوشتهٔ کارشناس نپرد */
  const headOptions = (first) => [...new Set([...first, ...(S.heads || [])])].map((c) => `<option value="${esc(c)}">`).join("");
  function loadHeads() {
    if (S.heads !== undefined) return;
    S.heads = null;
    TP.api("/catalog/heads").then((r) => {
      S.heads = r.heads || [];
      document.querySelectorAll("datalist[data-heads]").forEach((dl) => { dl.innerHTML = headOptions(JSON.parse(dl.dataset.heads || "[]")); });
    }).catch(() => { S.heads = undefined; });
  }

  /* پنل «نرمال‌سازی اقلام»: نوع قلم و لایه‌ها — قابل ویرایش. ساختار اول با کد و
     بعد با عنوانِ عیناً همان از دیتابیس می‌آید (بی مدل) و جستجو بی درنگ بر آن انجام می‌شود؛ فقط قلمِ
     تازه به مدل می‌رود و تا «ذخیره» نشود جستجو بر آن نه. «ذخیره» روی همین قلم و در دیتابیس اصلی
     برای کدش می‌نشیند (worker/normalize.js:confirmNorm). ویرایش‌ها بی‌بازرندر در draft می‌نشینند
     تا فوکوس نپرد. */
  function vNorm(it) {
    const n = S.norm[it.id];
    if (!n || n.loading) return `<div class="normbox"><div class="dim">در حال یافتن ساختار قلم در دیتابیس (با کد، بعد با عنوان)…</div></div>`;
    if (n.error) return `<div class="normbox"><div class="tp-note warn" style="margin:0 0 8px">${esc(n.error)}</div><button class="tp-btn sm" data-norm-retry>تلاش دوباره</button></div>`;
    if (n.data && n.data.needsModel) {
      return `<div class="normbox"><div class="toolrow" style="margin-bottom:6px"><b>نرمال‌سازی اقلام</b><span class="chip warn">در دیتابیس نیست</span>${TP.ui.info("expert.history", "راهنمای ساختار قلم")}</div>
        <div class="toolrow" style="margin-top:8px"><button class="tp-btn primary" data-norm-model>تفکیک با مدل…</button></div></div>`;
    }
    loadHeads();
    const d = n.data, dr = n.draft;
    const pickMode = S.hmode === "pick", pk = pickOf(it);
    /* نام‌های پنهان («نمره») در فهرستِ انتخاب نمی‌آیند، مگر همین لایه همان باشد */
    const names = d.layerNames || [];
    const opt = (sel) => [...new Set([...names, ...(sel && !names.includes(sel) ? [sel] : [])])].map((x) => `<option ${x === sel ? "selected" : ""}>${esc(x)}</option>`).join("")
      + `<option value="${NEW_LAYER}">＋ لایهٔ تازه…</option>`;
    const cands = [...new Set([d.head, ...(d.candidates || [])].filter(Boolean))];
    const fromDb = DB_SRC.has(d.source);
    const where = it.code ? `کد ${it.code}` : "عنوانِ همین قلم";
    const saved = { created: `در دیتابیس اصلی برای ${where} ذخیره شد`, updated: `در دیتابیس اصلی برای ${where} به‌روز شد`,
      same: "همان فهرست اقلام است؛ چیزی در دیتابیس عوض نشد", reverted: "با فهرست اقلام یکی شد؛ ویرایشِ قبلی از دیتابیس برداشته شد" }[d.saved];
    /* بستهٔ قفل‌شده: قلمی که برای تأمین‌کننده رفته — نوع قلم و لایه‌ها فقط‌خواندنی؛ سرور هم نمی‌پذیرد (sp-core.js:itemLocks) */
    const lk = it.sp_lock, fz = frozen(it), dis = lk || fz ? "disabled" : "";
    /* 🔒/🔓 برای تأمین‌کننده (طرح «خرید هوشمند» فاز ۱): پیش‌فرض همه 🔒؛ قلمی که رفته یا منجمد است عوض نمی‌شود */
    const ldis = lk || fz ? "disabled" : "";
    const lockBtn = (key, on, label, tip) => `<button class="tp-btn xs lockbtn ${on ? "on" : ""}" data-norm-lock="${key}" ${ldis} title="${esc(tip)}">${on ? "🔒" : "🔓"}${label ? ` ${label}` : ""}</button>`;
    const lockNote = lk ? `<div class="hx-lock" title="${esc(`${lk.title}${lk.head ? ` — ${lk.head}` : ""}${(lk.layers || []).length ? ` · ${lk.layers.map((x) => `${x.k}: ${x.v}`).join(" · ")}` : ""}`)}">🔒 <b>فرستاده‌شده به تأمین‌کننده</b> — نوع قلم و لایه‌ها ثابت‌اند.</div>` : "";
    const fzNote = fz ? `<div class="hx-lock">🔒 <b>منجمد و سپرده به کارشناس هوشمند</b> — ${TP.fmt(it.frozen_at)}</div>` : "";
    return `<div class="normbox">${fzNote}${lockNote}
      <div class="toolrow" style="margin-bottom:8px"><b>نرمال‌سازی اقلام</b>
        <span class="chip ${d.confirmed ? "ok" : "warn"}" title="نرمال‌سازی اجباری است: سوابق فقط بر ساختارِ تأییدشده خوانده می‌شود">${d.confirmed ? "✓ تأییدشده — سوابق بر همین است" : fromDb ? "پیشنهادِ سامانه از دیتابیس — هنوز تأیید نشده" : "پیشنهادِ مدل — هنوز تأیید نشده"}</span>
        <span class="chip info" title="${esc([fromDb ? "بی مدل: کد یا عنوانِ عیناً همان در دیتابیس بود" : "کد و عنوان در دیتابیس نبود", d.source === "title" && d.title ? `قلمِ دیتابیس با همین عنوان: ${d.title}` : "", d.edit ? `آخرین ذخیره در دیتابیس اصلی: ${d.edit.by || "کارشناس"} · ${TP.fmt(d.edit.at)}` : ""].filter(Boolean).join(" — "))}">${esc(SRC_FA[d.source] || d.source)}${d.code ? ` · کد ${esc(d.code)}` : ""}</span>
        ${TP.ui.info("expert.history", "راهنمای ساختار قلم")}
        ${saved ? `<span class="chip ok">${esc(saved)}</span>` : ""}
        ${d.known === false ? `<span class="chip warn" title="جستجو چیزی پیدا نمی‌کند مگر نوع قلمِ موجود را انتخاب کنید">این نوع قلم در فهرست نیست — سابقه‌ای ندارد</span>` : ""}</div>
      <div class="normgrid">
        <label class="tp-field"><b>نوع قلم</b><input class="tp-input" data-norm-head value="${esc(dr.head)}" list="nh-${it.id}" style="width:100%" ${dis} title="${lk ? "قفل: این قلم برای تأمین‌کننده رفته است" : "نوع قلم را می‌توانید عوض کنید: از فهرستِ نوع‌های قلم انتخاب کنید یا بنویسید"}">
          <datalist id="nh-${it.id}" data-heads="${esc(JSON.stringify(cands))}">${headOptions(cands)}</datalist>
</label>
        <div class="tp-field"><b>لایه‌های ویژگی</b>
          ${pickMode ? `<div class="dim" style="font-size:.8rem;margin:2px 0 4px">☑️ لایه‌هایی که با همین مقدار در جستجو بیایند</div>` : ""}
          ${dr.layers.map((l, i) => { const qn = isQuant(l.k), rf = qn ? refTxt(l.k, l.t, l.u) : ""; return `<div class="normlayer">
            ${pickMode ? `<input type="checkbox" data-pick-l="${esc(l.k)}" ${pk.layers.includes(l.k) ? "checked" : ""} title="در «قلم انتخابی» فقط اقلامی با همین مقدارِ این لایه">` : ""}
            ${lockBtn(`l:${i}`, l.lk !== false, "", l.lk !== false ? "🔒 تأمین‌کننده این لایه را عوض نمی‌کند — کلیک: باز" : "🔓 تأمین‌کننده می‌تواند این لایه را اصلاح کند — کلیک: قفل")}
            <select class="tp-input" data-norm-lk="${i}" ${dis}>${opt(l.k)}</select>
            <input class="tp-input${qn ? " num" : ""}" data-norm-lv="${i}" value="${esc(l.t)}" ${dis}${qn ? ` placeholder="فقط عدد" title="فقط عدد: ۲، ۱ ۱/۲، ۶۵۰×۱۵۲۰ یا ۱۰-۱۶ — واحد را از فهرست کنارش انتخاب کنید"` : ""}>
            ${qn ? `<select class="tp-input nu" data-norm-lu="${i}" ${dis} title="واحد استاندارد؛ تبدیل و مقایسه بر پایهٔ همین است"><option value="">بی‌واحد</option>${unitsFor(l.k).map((u) => `<option ${u === l.u ? "selected" : ""}>${esc(u)}</option>`).join("")}</select>` : ""}
            ${rf ? `<span class="dim num" style="font-size:.8rem" title="به واحد مرجعِ این لایه — مقایسه و جستجو بر همین است">${esc(rf)}</span>` : ""}
            ${l.i ? `<span class="chip info" title="در عنوان گفته نشده؛ از عرفِ پذیرفته‌شدهٔ همین نوع قلم آمده (یا واحدش از بزرگیِ عدد خوانده شده). با ویرایش، صریح می‌شود.">ضمنی</span>` : ""}
            ${lk ? "" : `<button class="tp-btn xs" data-norm-ldel="${i}" title="حذف این لایه">✕</button>`}</div>`; }).join("")
            || `<div class="dim" style="font-size:.85rem">لایه‌ای ندارد.</div>`}
          ${lk ? "" : `<button class="tp-btn xs" data-norm-ladd style="margin-top:4px">افزودن لایه</button>`}
</div>
      </div>
      ${d.residual ? `<div class="dim" style="font-size:.85rem;margin-top:6px">بخشی از عنوان که به هیچ لایه‌ای نخورد: <b>${esc(d.residual)}</b></div>` : ""}
      ${fz ? "" : `<div class="toolrow" style="margin-top:10px"><button class="tp-btn primary" data-norm-confirm title="روی همین قلم، و اگر با دیتابیس فرق دارد در دیتابیس اصلی برای ${esc(where)}، ذخیره می‌شود — نوع قلم، لایه‌ها و قفل‌ها؛ هر تغییر برای پشتیبانی ثبت می‌شود">${d.confirmed ? "ذخیره" : "✓ تأییدِ ساختار"}</button>
        ${d.confirmed ? "" : `<span class="chip warn" title="نرمال‌سازی اجباری است: بی تأیید، سوابقِ این قلم خوانده نمی‌شود">هنوز تأیید نشده</span>`}
        ${fromDb || lk ? "" : `<button class="tp-btn" data-norm-redo title="عنوان دوباره به مدل داده شود — پیش از آن از شما می‌پرسم">تفکیک دوباره با مدل…</button>`}
        ${lk ? "" : d.edit ? `<button class="tp-btn" data-norm-revert title="ساختاری که کارشناس برای این قلم در دیتابیس اصلی ذخیره کرده پاک می‌شود و ساختارِ فهرست اقلام (یا اگر قلم در فهرست نیست، پیشنهاد مدل) برمی‌گردد">حذف ویرایش از دیتابیس</button>`
          : d.confirmed ? `<button class="tp-btn" data-norm-clear title="ذخیرهٔ همین قلم برداشته می‌شود و ساختار دوباره از دیتابیس خوانده می‌شود">برداشتن ذخیره</button>` : ""}</div>`}</div>`;
  }

  /* خلاصهٔ ساختارِ قلم: نوع و لایه‌ها با 🔒/🔓؛ ویرایشگر با «ویرایش ساختار» باز می‌شود (تأییدنشده: همیشه باز) */
  function vStructSum(it, mini) {
    const n = S.norm[it.id], d = n && n.data, nj = (() => { try { return JSON.parse(it.norm_json || "null"); } catch (_) { return null; } })();
    const head = (nj && nj.head) || (d && d.head) || "", layers = (nj && nj.layers) || (d && d.layers) || {}, locks = (nj && nj.locks) || {};
    const lk = (k) => !(locks.layers && locks.layers[k] === false);
    const fixed = it.sp_lock || frozen(it);
    return `<section class="hx-struct">${fixed ? `<span class="chip warn" title="${frozen(it) ? `منجمد و سپرده به کارشناس هوشمند — ${esc(TP.fmt(it.frozen_at))}` : "برای تأمین‌کننده فرستاده شده"}">🔒 ${frozen(it) ? "منجمد" : "فرستاده‌شده"}</span>` : `<span class="chip ok">✓ ساختار تأییدشده</span>`}${head ? `<b class="hx-head">${esc(head)}</b>` : ""}
      <span class="hx-layers">${Object.entries(layers).map(([k, v]) => `<span class="chip">${lk(k) ? "🔒" : "🔓"} ${esc(k)}: <b>${esc(showLayer(v))}</b></span>`).join("") || `<span class="dim">بی لایه</span>`}</span>
      ${mini ? `<button class="tp-btn sm" data-norm-on title="پنلِ «نرمال‌سازی اقلام» باز شود">▾ نرمال‌سازی اقلام</button>` : fixed ? "" : `<button class="tp-btn sm" data-norm-on>${TP.ui.ICON.edit} ویرایش ساختار</button>`}</section>`;
  }
  function vHistory(it) {
    const d = S.hist[it.id];
    const canChart = !!(d && d.available !== false && (d.suppliers || []).length);
    const fixed = !!(it.sp_lock || frozen(it));
    const ok = normOk(it), mini = ok && !!S.normMin[it.id];
    const editing = !mini && ((S.normOn && !fixed) || S.hmode === "pick" || !ok);
    const tools = TP.ui.menu({ btn: `<button class="tp-icon-btn sm" type="button" data-menu-toggle aria-haspopup="menu" aria-expanded="false" aria-label="ابزارهای سوابق" title="ابزارها">${TP.ui.ICON.more}</button>`,
      items: [{ label: "نمودار روند", icon: "data", attrs: `data-chart ${canChart ? "" : "disabled"}`, disabled: !canChart },
        ...(it.hist_done_at ? [] : [{ label: "علامتِ «بررسی شد»", icon: "check", attrs: 'data-mark="hist"' }]),
        ...(fixed && !mini ? [] : [{ label: editing && ok ? "بستنِ ویرایشگرِ ساختار" : mini ? "نمایشِ نرمال‌سازی اقلام" : "ویرایش ساختار", icon: "edit", attrs: "data-norm-on" }])] });
    const head = `<section class="hx-top">
      <div class="hx-title"><b>${esc(it.title)}</b>${it.code ? `<span class="chip info num">${esc(it.code)}</span>` : ""}
        ${it.sp_lock ? `<span class="chip warn" title="برای تأمین‌کننده فرستاده شده: عنوان، نوع قلم و لایه‌ها قفل‌اند">🔒 فرستاده‌شده</span>` : ""}
        ${it.hist_done_at ? `<span class="chip ok" title="${esc(TP.fmt(it.hist_done_at))}">✓ بررسی شد</span>` : ""}
        ${iState(it) === "direct" ? `<button class="tp-btn sm ${S.pickOpen[it.id] ? "" : "primary"}" data-pkopen>${S.pickOpen[it.id] ? "✋ خودم انجام می‌دهم" : "🤖 سپردن به کارشناس هوشمند"}</button>` : ""}</div>
      <div class="hx-bar"><div class="tp-seg sm" role="radiogroup" aria-label="حالت جستجو">
          ${[["head", "نوع قلم", "همهٔ اقلام همین نوع (پیش‌فرض)"], ["pick", "قلم انتخابی", "همین نوع با لایه‌ها و واحدهای تیک‌خورده"], ["exact", "عین قلم", "همان نوع با دقیقاً همان لایه‌ها"]].map(([k, l, t]) => `<button type="button" class="${S.hmode === k ? "on" : ""}" aria-pressed="${S.hmode === k}" data-hmode="${k}" title="${t}">${l}</button>`).join("")}</div>
        <span class="spacer"></span>
        <button class="tp-btn" data-tpl-open title="قالب‌های پیام را ببینید یا قالب تازه بسازید؛ جای‌خالی‌های {…} با اطلاعات همین درخواست پر می‌شوند">ایجاد قالب پیام</button>
        <button class="tp-btn primary" data-run-hist>${d ? "بررسی دوباره" : ok ? "بررسی سوابق" : "تأییدِ ساختار و بررسی سوابق"}</button>${tools}</div>
      <details class="tp-more hx-opts"><summary>تنظیماتِ جستجو</summary><div class="hx-optsb">
        <label class="hx-mom" title="۱ = گذشتهٔ دور تقریباً هم‌وزن امروز · ۱۰ = فقط خریدهای تازه وزن دارند"><b>ضریب اهمیت گشتاور</b>
          <input type="range" min="1" max="10" step="1" data-mom value="${S.mom}" style="width:140px;accent-color:#4f8cff"><b class="num" data-mom-val>${M(S.mom)}</b></label>
        <label class="chkline" title="به‌جای «قیمت روز» با نرخ دلار، تعدیلِ شاخصِ مرکز آمار (مبلغ به زمستان ۱۴۰۴)"><input type="checkbox" data-pidx ${S.priceIdx ? "checked" : ""}> تعدیل مرکز آمار (زمستان ۱۴۰۴)</label></div></details></section>`;
    /* ساختار: تأییدنشده یا «قلم انتخابی» یا ویرایش → ویرایشگرِ کامل؛ وگرنه یک خطِ خلاصه */
    const norm = editing ? `<div class="hx-step ${ok ? "" : "need"}">${ok ? "" : `<div class="hx-stepn"><b>۱</b> ساختارِ قلم را ببینید و تأیید کنید</div>`}${vNorm(it)}</div>` : vStructSum(it, mini);

    if (!d) return `<div class="pad hx">${head}${norm}${vTerms(it)}${vPicks(it)}${ok ? `<div class="hx-none">${TP.ui.ICON.search}<b>سوابق هنوز خوانده نشده</b><span>حالت جستجو را بزنید و «بررسی سوابق»</span></div>` : ""}</div>`;
    if (d.available === false) return `<div class="pad hx">${head}${norm}${vTerms(it)}${vPicks(it)}<div class="chip warn">${esc(d.message)}</div></div>`;
    const st = d.struct || {}, mt = d.match || {};
    const unit = d.item && d.item.unit ? ` ${esc(d.item.unit)}` : "";
    const exc = d.excluded || [];
    /* هشدارهای سوابق در یک چیپ — ریزشان با کلیک */
    const warns = [
      mt.source === "proposal" ? "جستجو بر پیشنهادِ ذخیره‌نشدهٔ مدل است" : "",
      d.unitDropped ? `${M(d.unitDropped)} خرید با واحدِ کنارگذاشته` : "",
      d.unconverted ? `${M(d.unconverted)} خرید بی‌نرخ تبدیل (در جمع نیامده)` : "",
      d.fixedDyn ? `${M(d.fixedDyn)} خریدِ پویا با نرخِ ثابتِ تقریبی` : "",
      d.lowConf ? `${M(d.lowConf)} خرید با نرخِ کم‌اطمینان` : "",
      ...exc.map((x) => `«${x.name}» کنار گذاشته شد — ${M(x.n)} خرید (${x.why === "employer" ? "مصالحِ تحویلیِ کارفرما" : "نام تجمیعی"})`),
    ].filter(Boolean);
    const rates = (d.rates || []).map((r) => `${r.unit} × ${r.kind === "dynamic" && r.varied ? `${fmtRate(r.min)}…${fmtRate(r.max)}` : fmtRate(r.rate)}${r.kind === "dynamic" ? " (پویا)" : ""}`);
    const sum = `<div class="hx-sum"><span class="chip ok">${HMODE_FA[mt.mode] || ""}${mt.codes != null ? ` · ${M(mt.codes)} قلم از ${M(mt.headItems)}` : ""}</span>
        <span class="chip">${M(d.totals.n)} خرید · جمع ${M(RQ(d.totals.qty))}${unit}</span><span class="chip info">واحد مرجع: ${esc(st.refUnit || "—")}</span>
        ${warns.length || rates.length ? `<details class="hx-warn"><summary class="chip ${warns.length ? "warn" : ""}">${warns.length ? `⚠ ${M(warns.length)} نکته` : "جزئیات"}</summary><div>${warns.map((w) => `<div>• ${esc(w)}</div>`).join("")}${rates.length ? `<div class="dim">نرخ‌ها: ${esc(rates.join("، "))}</div>` : ""}</div></details>` : ""}
        ${(d.titles || []).length ? `<details class="hx-warn"><summary class="chip">اقلامِ شمرده‌شده (${M(d.titles.length)}${mt.codes > d.titles.length ? "+" : ""})</summary><div class="hx-titles">${d.titles.map((x) => `<span class="chip" title="${esc(Object.entries(x.layers || {}).map(([k, v]) => `${k}: ${showLayer(v)}`).join(" · "))}">${esc(x.title)} <span class="dim num">${esc(x.code)} · ${M(x.n)}</span></span>`).join("")}</div></details>` : ""}</div>`;
    const rows = histRows(d);
    if (!rows.length) return `<div class="pad hx">${head}${norm}${sum}${vTerms(it)}${vPicks(it)}<div class="chip warn">${exc.length
      ? `هرچه از این قلم ثبت شده زیر «${esc(exc[0].name)}» است (${M(exc[0].n)} خرید) و تأمین‌کنندهٔ واقعیِ نام‌داری ندارد.`
      : esc(d.message || "برای این قلم سابقه‌ای پیدا نشد.")}</div></div>`;

    const added = new Set(S.d.quotes.filter((q) => q.item_id === it.id).map((q) => TP.nrm(q.supplier_name)));
    /* رتبه کنارِ هر عدد (نشانِ کوچک)؛ کلیکِ سرستون، کلِ جدول را بر همان رتبه مرتب می‌کند */
    const th = (k, label, tip) => `<th class="${k ? "sortable" : ""} ${S.hsort === k ? "sorted" : ""}" ${k ? `data-hsort="${k}"` : ""} title="${esc(tip || (k ? "مرتب‌سازی بر همین رتبه" : ""))}">${label}${S.hsort === k ? " ▾" : ""}</th>`;
    const rb = (v) => `<sup class="rk" title="رتبه">${M(v)}</sup>`;
    const u = usdOn(d);
    return `<div class="pad hx">
      ${vProfile(it)}
      ${head}
      ${norm}
      ${vTerms(it)}${vPicks(it)}
      ${sum}
      <div class="tp-scroll hx-table" data-keep-scroll style="max-height:56vh"><table class="tp-table grid"><thead><tr>
        <th>انتخاب</th><th class="rt">تأمین‌کننده</th>${th("n", "دفعات")}${th("qty", `مقدار${unit ? ` (${unit.trim()})` : ""}`)}${th("m", "گشتاوری", "مقدارِ وزن‌دار با تازگیِ خرید")}
        <th title="قیمت واحدِ میانگین به ازای واحد مرجع — ${u ? "به قیمت روز با نرخ دلار" : "با تعدیلِ مرکز آمار (زمستان ۱۴۰۴)"}">قیمت واحد</th>${th("v", "ارزش خرید")}${th("f", "امتیاز نهایی", "میانگینِ وزنیِ رتبه‌ها و رده — ترتیبِ دعوتِ کارشناس هوشمند")}<th>خریدها</th></tr></thead><tbody>
      ${rows.map((s) => `<tr class="${S.prof === s.key ? "sel" : ""}">
        <td>${added.has(TP.nrm(s.name)) ? `<span class="chip ok">در استعلامات</span>`
          : `<button class="tp-btn xs" data-to-quote="${esc(s.key)}" title="نام تأمین‌کننده به تب استعلامات">افزودن</button>`}${pkHistBtn(it, s.name)}
          <button class="tp-btn xs" data-hist-msg="${esc(s.key)}" title="پیام با قالب: نامِ همین تأمین‌کننده و اطلاعاتِ درخواست پر می‌شود؛ متن را کپی کنید">✉️ پیام</button></td>
        <td class="rt"><span class="supname" data-prof="${esc(s.key)}">${esc(s.name)}</span>${gradeChip(s, "", "رده")}${s.code ? ` <span class="dim num" title="کد تأمین‌کننده">${esc(s.code)}</span>` : ""}${s.unconverted ? ` <span class="chip warn" title="خریدهایی با واحدِ بی‌نرخ تبدیل">${M(s.unconverted)}</span>` : ""}</td>
        <td class="num">${M(s.n)}${rb(s.rankN)}</td>
        <td class="num">${M(RQ(s.qty))}${rb(s.rankQty)}<div class="dim hx-share">${s.share.toFixed(1)}٪</div></td>
        <td class="num">${M(RQ(s.qtyM))}${rb(s.rankM)}</td>
        ${(() => { const av = u ? s.avgUsd : s.avgUnit, vv = u ? s.val : s.adjVal; return `<td class="num">${av == null ? "—" : M(Math.round(av))}</td>
        <td class="num" title="${vv == null ? "" : `${M(Math.round(vv))} ریال`}">${bigRial(vv)}${s.early && u ? " *" : ""}${rb(s.rankV)}</td>`; })()}
        <td class="num hx-final"><b>${s.score == null ? "—" : s.score}</b>${rb(s.rankF)}</td>
        <td><button class="tp-btn xs" data-buys="${esc(s.key)}">${M(s.n)}</button></td></tr>`).join("")}
      </tbody></table></div>
      <details class="tp-more hx-basis"><summary>مبنای محاسبه</summary><div class="dim">رتبهٔ نهایی${d.weights ? ` با وزن‌های پشتیبانی (دفعات ${d.weights.n}، مقدار ${d.weights.qty}، گشتاور ${d.weights.qtyM}، ارزش ${d.weights.val}، رده ${d.weights.grade})` : ""} ·
        ${d.usd ? `قیمت روز با نرخ دلارِ ${M(d.usd.latest)} ریال (${esc(d.usd.latestDay)})؛ خریدِ پیش از ${esc(d.usd.firstDay)} با نرخِ همان روز (*)` : "نرخ دلار هنوز بارگذاری نشده؛ ارزش خرید با تعدیلِ مرکز آمار (زمستان ۱۴۰۴)"} ·
        مقدارها به واحد مرجع «${esc(st.refUnit || "")}» · گشتاور با ضریب ${d.base.k} (هر ماه ${(d.base.decay * 100).toFixed(2)}٪ کمتر)</div></details></div>`;
  }

  const supOf = (key) => { const d = S.hist[(item() || {}).id]; return d && (d.suppliers || []).find((x) => x.key === key); };

  /**
   * «بررسی سوابق» هرگز قفل نیست (تصمیم مدیر، مهر ۱۴۰۵): اگر ساختار قلم هنوز خوانده نشده، همین‌جا خودکار
   * نرمال‌سازی می‌شود — از دیتابیس؛ فقط اگر قلم در دیتابیس نبود، پیش از مدل از کارشناس پرسیده می‌شود.
   */
  async function ensureNorm(it) {
    let n = S.norm[it.id];
    if (!n || n.error) { await runNormalize(false); n = S.norm[it.id]; }
    if (!n || n.error) { TP.modal("ساختار قلم خوانده نشد", esc((n && n.error) || "خطای ناشناخته"), null, "باشد", ""); return false; }
    if (n.data && n.data.needsModel) return askModel(it, false);
    return true;
  }

  /**
   * هر فراخوانیِ مدل با کادرِ تأیید است. هزینهٔ کار با مدل به کاربر گفته نمی‌شود (تصمیم مدیر، مهر ۱۴۰۵).
   * true اگر کارشناس تأیید کرد و ساختاری آمد.
   */
  function askModel(it, force) {
    return new Promise((resolve) => {
      let done = false;
      const end = (v) => { if (!done) { done = true; resolve(v); } };
      const d = TP.modal("تفکیک با مدل زبانی",
        `${force ? "عنوانِ این قلم دوباره به مدل داده می‌شود تا نوع قلم و لایه‌هایش را از نو پیشنهاد کند." : `کد و عنوانِ «${esc(it.title)}» در دیتابیس نیست؛ برای یافتنِ نوع قلم و لایه‌های ویژگی‌اش باید عنوان به مدل زبانی (Haiku) داده شود.`}
        <br><br>پیشنهادِ مدل تا شما «ذخیره»اش نکنید در دیتابیس نمی‌نشیند؛ جستجو بر همان پیشنهاد انجام می‌شود.`,
        async () => { await runNormalize(!!force, true); const n = S.norm[it.id]; end(!!(n && n.data && !n.data.needsModel && !n.error)); },
        "تأیید و تفکیک", "انصراف");
      const no = d.querySelector("[data-n]"); if (no) no.addEventListener("click", () => end(false));
      d.addEventListener("click", (e) => { if (e.target === d) end(false); });
    });
  }

  /* collapse: فقط دکمهٔ «بررسی سوابق» — تیکِ لایه یا حالتِ جستجو که دوباره می‌خواند، ویرایشگر را جمع نمی‌کند */
  async function runHist(collapse) {
    const it = item(); if (!it) return;
    if (!(await ensureNorm(it))) return;
    /* نرمال‌سازی اجباری و اول از همه (طرح «خرید هوشمند» فاز ۱): سوابقِ قلمِ تأییدنشده خوانده نمی‌شود — سرور هم نمی‌خواند */
    if (!normOk(it)) {
      /* ساختار همین بالا در ویرایشگر دیده می‌شود و دکمه «تأییدِ ساختار و بررسی سوابق» است: مستقیم تأیید (و اگر عوض شده، علت) */
      if (await confirmNormUI()) return runHist(collapse);
      return;
    }
    /* جستجو بر ساختارِ ذخیره‌شده است؛ ویرایشِ ذخیره‌نشده اول ذخیره شود */
    if (normDirty(it)) {
      return TP.modal("تغییرات ذخیره نشده", "نوع قلم، لایه‌ها یا نرخ‌هایی را که عوض کرده‌اید هنوز ذخیره نکرده‌اید و جستجو بر ساختارِ ذخیره‌شده انجام می‌شود.",
        async () => { if (await confirmNormUI()) runHist(collapse); }, "ذخیره و بررسی", "انصراف");
    }
    const b = TP.busy("خواندن سوابق…", `${esc(it.title)} — ${HMODE_FA[S.hmode]}`);
    try { S.hist[it.id] = await TP.api(`/suppliers/history?${histQuery(it)}`); S.prof = null; }
    catch (e) { b.close(); TP.modal("خطا", esc(e.message), null, "باشد", ""); return; }
    b.close();
    /* نتیجه جای اصلی را بگیرد: «نرمال‌سازی اقلام» جمع می‌شود و با «▾ نرمال‌سازی اقلام» دوباره باز */
    if (collapse === true) S.normMin[it.id] = true;
    /* خواندنِ سوابق خودش همان «بررسی سوابق» است — باکس دوم پایش مدیر سبز می‌شود */
    if (!it.hist_done_at && S.hist[it.id].available && (S.hist[it.id].suppliers || []).length) {
      try { await TP.api(`/items/${it.id}/progress`, { body: { stage: "hist" } }); await reload(); return; }
      catch (_) { /* نمایش جدول مهم‌تر از سبزشدن باکس است */ }
    }
    render();
  }

  async function showBuys(key) {
    const it = item(), s = supOf(key); if (!s) return;
    try {
      const r = await TP.api(`/suppliers/history/buys?${histQuery(it)}&supplier=${encodeURIComponent(s.name)}`);
      const d = S.hist[it.id] || {}, u = !!r.usd && !S.priceIdx, pl = u ? "قیمت روز" : (d.base && d.base.priceLabel) || "زمستان ۱۴۰۴";
      const rial = (v) => (v == null ? "—" : M(Math.round(v)));
      /* هشت ستون (تصمیم مدیر، مهر ۱۴۰۵): دو ستونِ آخر همان قیمت واحد و مبلغ کل‌اند ضرب در ضریبِ
         تعدیلِ همین ردیف (شاخصِ طبقهٔ اصنافِ قلم در فصلِ خرید، به مبنای زمستان ۱۴۰۴) */
      TP.modal(`سوابق خرید — ${esc(s.name)}`, r.buys.length
        ? `<div class="tp-scroll" style="max-height:56vh"><table class="tp-mx" style="width:100%"><thead><tr>
            <th>تاریخ</th><th>عنوان قلم</th><th>مقدار خرید</th><th>واحد</th><th>قیمت واحد (ریال)</th><th>مبلغ کل (ریال)</th>
            <th>قیمت واحد به ${u ? "" : "مبلغ "}${esc(pl)}</th><th>مبلغ کل به ${u ? "" : "مبلغ "}${esc(pl)}</th></tr></thead><tbody>
          ${r.buys.map((x) => `<tr><td class="num">${esc(x.order_date)}</td><td class="rt" style="white-space:normal">${esc(x.title)}</td>
            <td class="num">${x.qty == null ? "—" : M(RQ(x.qty))}</td><td>${esc(x.unit || "—")}</td>
            <td class="num">${rial(x.unit_price)}</td><td class="num">${rial(x.amount)}</td>
            ${u ? `<td class="num" title="نرخ دلارِ روزِ خرید: ${x.usd_rate ? M(x.usd_rate) : "—"} ریال${x.usd_early ? " (پیش از اولین نرخِ کانال؛ نرخِ همان روز)" : ""} — ضریب ${x.usd_factor != null ? fmtRate(x.usd_factor) : "—"}">${rial(x.unit_price_usd)}${x.usd_early ? " *" : ""}</td>
            <td class="num">${rial(x.amount_usd)}</td>` : `<td class="num" title="${x.adj_factor != null ? `ضریب تعدیل این ردیف: ${fmtRate(x.adj_factor)}` : ""}">${rial(x.unit_price_adj)}</td>
            <td class="num">${rial(x.amount_adj)}</td>`}</tr>`).join("")}
          </tbody></table></div>` : "ردیفی پیدا نشد.", null, "بستن", "");
    } catch (e) { TP.modal("خطا", esc(e.message), null, "باشد", ""); }
  }

  /* ---------- نرمال‌سازی اقلام ---------- */
  /* پاسخ سرور → پیش‌نویسِ قابل ویرایش. نرخ‌ها فقط وقتی در پیش‌نویس‌اند که کارشناس خودش
     عوض کرده باشد؛ وگرنه نرخ فایل (که برای اقلامِ مختلف یک نوع می‌تواند فرق کند) دست نمی‌خورد. */
  function normDraft(d) {
    const rates = {};
    for (const u of (d.rates && d.rates.units) || []) if (u.src === "user") rates[u.unit] = u.rate;
    /* هر لایه: {k: نام، t: متن (در لایهٔ کمّی فقط عدد)، u: واحد استاندارد، i: ضمنی} */
    const layers = Object.entries(d.layers || {}).map(([k, v]) => {
      if (Array.isArray(v)) return { k, t: RL() ? RL().layerText(v) : String(v), u: "", i: false };
      if (v && typeof v === "object") return { k, t: String(v.v == null ? "" : v.v), u: isQuant(k) ? v.u || "" : "", i: !!v.i };
      /* متنِ کهنه («2 میل»): اگر لایهٔ کمّی است و واحدش خواناست، عدد و واحد جدا می‌شوند */
      const q = isQuant(k) ? RL().quantWith(k, v, null) : null;
      return q && !Array.isArray(q) && q.u ? { k, t: q.v, u: q.u, i: false } : { k, t: String(v == null ? "" : v), u: "", i: false };
    });
    /* 🔒/🔓 (طرح «خرید هوشمند» فاز ۱): پیش‌فرض همه 🔒 — tl عنوان، ql مقدار، lk هر لایه */
    const lk = d.locks || {};
    for (const l of layers) l.lk = !(lk.layers && lk.layers[l.k] === false);
    return { head: d.head || "", layers, rates, tl: lk.title !== false, ql: lk.qty !== false };
  }

  /* پاسخ سرور → {data، draft، base}؛ base پیش‌نویسِ دست‌نخورده است تا ویرایشِ ذخیره‌نشده پیدا شود */
  const normState = (d) => { const draft = normDraft(d); return { data: d, draft, base: JSON.stringify(draft) }; };

  /* `model`: فقط وقتی کارشناس در کادرِ تأیید (askModel) پذیرفته — وگرنه سرور مدل را صدا نمی‌زند */
  async function runNormalize(force, model) {
    const it = item(); if (!it) return;
    S.norm[it.id] = { loading: true }; render();
    try {
      const d = await TP.api(`/items/${it.id}/normalize`, { body: { force: !!force, model: !!model } });
      S.norm[it.id] = normState(d);
    } catch (e) { S.norm[it.id] = { error: e.message }; }
    if (item() && item().id === it.id) render();
  }

  /* ساختارِ عوض‌شده: نتیجهٔ قبلیِ سوابق و نقاط نمودارش کهنه‌اند */
  const dropHist = (it) => { delete S.hist[it.id]; Object.keys(S.series).forEach((k) => { if (k.startsWith(`${it.id}|`)) delete S.series[k]; }); };

  /** ذخیره روی همین قلم و در دیتابیس اصلی؛ true اگر ذخیره شد */
  async function confirmNormUI() {
    const it = item(), n = it && S.norm[it.id]; if (!n || !n.draft) return false;
    const dr = n.draft, layers = {};
    const fail = (t, m) => { TP.modal(t, m, null, "باشد", ""); return false; };
    for (const l of dr.layers) if (String(l.t || "").trim()) {
      if (layers[l.k] != null) return fail("لایهٔ تکراری", `لایهٔ «${esc(l.k)}» دو بار آمده است؛ یکی را حذف کنید.`);
      if (isQuant(l.k) && l.u && !RL().quantWith(l.k, l.t, l.u)) {
        return fail("عدد نامعتبر", `در «${esc(l.k)}» فقط عدد بنویسید (مثل ۲، ۱ ۱/۲، ۶۵۰×۱۵۲۰ یا ۱۰-۱۶) و واحد را از فهرست کنارش انتخاب کنید.`);
      }
      /* لایهٔ کمّی: عدد و واحد جدا؛ «ضمنی» فقط تا وقتی کارشناس دستش نزده */
      layers[l.k] = isQuant(l.k) ? { v: l.t, u: l.u || "", ...(l.i ? { i: 1 } : {}) } : l.i ? { v: l.t, i: 1 } : l.t;
    }
    /* نرخ‌های جدول به واحد مرجعِ نوع قلمِ قبلی‌اند؛ نوع قلم که عوض شد، نرخ‌های نوع قلمِ تازه بعد از ذخیره می‌آیند */
    const headChanged = String(dr.head || "").trim() !== String(n.data.head || "").trim();
    try {
      const locks = { title: dr.tl !== false, qty: dr.ql !== false, layers: Object.fromEntries(dr.layers.filter((l) => l.k && String(l.t || "").trim()).map((l) => [l.k, l.lk !== false])) };
      const body = { head: dr.head, layers, rates: headChanged ? {} : dr.rates, residual: n.data.residual, source: n.data.source, code: n.data.code, locks };
      let r;
      try { r = await TP.api(`/items/${it.id}/norm`, { method: "PUT", body }); }
      catch (e) {
        /* ساختار با پیشنهادِ سامانه فرق دارد: علتِ تغییر اجباری است (مهر ۱۴۰۵) — همان تغییرها نشان داده می‌شوند */
        if (!(e.status === 422 && e.data && e.data.need_reason)) throw e;
        const why = await askWhy(e.data.lines || []);
        if (!why) return false;
        r = await TP.api(`/items/${it.id}/norm`, { method: "PUT", body: { ...body, reason: why } });
      }
      S.norm[it.id] = normState({ ...n.data, ...r.norm, confirmed: true, known: r.known, rates: r.rates, saved: r.saved, edit: r.saved === "reverted" ? null : r.edit || n.data.edit || null });
      dropHist(it);
      const row = items().find((x) => x.id === it.id); if (row) { row.norm_json = JSON.stringify(r.norm); row.est_at = null; }
      render();
      okTick("ساختار تأیید شد");
      /* برآوردِ قیمت بر ساختارِ تازه (worker/estimate.js) — در اجرای جدا، بی انتظار */
      TP.api(`/items/${it.id}/estimate`, { body: {} }).then((e) => { if (row) { row.est_unit_rial = e.est_unit_rial; row.est_at = Date.now(); render(); } }).catch(() => { /* Cron برمی‌دارد */ });
      return true;
    } catch (e) { return fail("ذخیره نشد", esc(e.message)); }
  }

  /* «＋ لایهٔ تازه…» (مهر ۱۴۰۵): نامِ لایه‌ای که در فهرستِ ثابت نیست — همان سنجشِ سرور (structure.js:newLayerName)؛
     با «تأیید ساختار» روی قلم و برای همین نوع قلم در فهرستِ نام‌ها می‌نشیند */
  function newLayerUI(it, l) {
    const n = it && S.norm[it.id]; if (!n || !n.draft) return;
    const d = TP.modal("لایهٔ تازه", `<input class="tp-input" id="nl-txt" maxlength="30" aria-label="نامِ لایهٔ تازه" aria-describedby="nl-err" style="width:100%" placeholder="نامِ لایه">
      <div class="tp-auth-err" id="nl-err" role="alert" style="min-height:18px"></div>`, null, "افزودن", "انصراف");
    const t = d.querySelector("#nl-txt"), err = d.querySelector("#nl-err");
    const back = () => render();
    d.querySelector("[data-y]").onclick = () => {
      const name = String(t.value || "").replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/[\u200c\u200e\u200f]/g, " ").replace(/\s+/g, " ").trim();
      const others = n.draft.layers.filter((x) => x !== l).map((x) => x.k);
      const bad = !name ? "نامِ لایه را بنویسید." : name.length > 30 ? "نامِ لایه حداکثر ۳۰ نویسه است." : !/\p{L}/u.test(name) ? "نامِ لایه باید حرف داشته باشد."
        : /[<>"{}[\]`]/.test(name) ? "نامِ لایه نویسهٔ نامجاز دارد." : others.includes(name) ? `لایهٔ «${name}» همین حالا روی قلم هست.` : "";
      if (bad) { err.textContent = bad; t.focus(); return; }
      d.remove();
      l.k = name; l.u = ""; l.i = false;
      if (n.data && !(n.data.layerNames || []).includes(name)) n.data.layerNames = [...(n.data.layerNames || []), name];
      render();
    };
    t.addEventListener("input", () => { err.textContent = ""; });
    t.addEventListener("keydown", (e) => { if (e.key === "Enter") d.querySelector("[data-y]").click(); });
    const no = d.querySelector("[data-n]"); if (no) no.addEventListener("click", back);
    d.addEventListener("click", (e) => { if (e.target === d) back(); });
    setTimeout(() => t.focus(), 40);
  }

  /** «چرا این تغییر لازم است؟» — تا علت ننویسد ذخیره نمی‌شود (خطا همان‌جا، پنجره باز می‌ماند)؛ انصراف = null */
  function askWhy(lines) {
    return new Promise((resolve) => {
      let done = false;
      const end = (v) => { if (!done) { done = true; resolve(v); } };
      const d = TP.modal("چرا این تغییر لازم است؟", `<ul class="why-lines">${lines.map((l) => `<li>${TP.rtlArrow(esc(l))}</li>`).join("")}</ul>
        <textarea class="tp-input" id="why-txt" rows="3" maxlength="500" aria-label="علتِ تغییر" aria-describedby="why-err" style="width:100%" placeholder="علتِ تغییر (اجباری)"></textarea>
        <div class="tp-auth-err" id="why-err" role="alert" style="min-height:18px"></div>`, null, "ذخیره با این علت", "انصراف");
      const t = d.querySelector("#why-txt"), err = d.querySelector("#why-err");
      d.querySelector("[data-y]").onclick = () => {
        const v = (t.value || "").trim();
        if (!v) { err.textContent = "بی علت ذخیره نمی‌شود."; t.focus(); return; }
        d.remove(); end(v);
      };
      t.addEventListener("input", () => { err.textContent = ""; });
      const no = d.querySelector("[data-n]"); if (no) no.addEventListener("click", () => end(null));
      d.addEventListener("click", (e) => { if (e.target === d) end(null); });
      d.addEventListener("keydown", (e) => { if (e.key === "Escape") { d.remove(); end(null); } });
      setTimeout(() => t.focus(), 40);
    });
  }

  async function clearNormUI() {
    const it = item(); if (!it) return;
    try {
      await TP.api(`/items/${it.id}/norm`, { method: "DELETE" });
      dropHist(it);
      const row = items().find((x) => x.id === it.id); if (row) row.norm_json = null;
      await runNormalize(false);
    } catch (e) { TP.modal("خطا", esc(e.message), null, "باشد", ""); }
  }

  /* ویرایشِ کارشناس برای این قلم از دیتابیس اصلی پاک می‌شود — برای همهٔ درخواست‌ها، پس اول پرسیده می‌شود */
  function revertEditUI() {
    const it = item(); if (!it) return;
    const n = S.norm[it.id], e = n && n.data && n.data.edit;
    TP.modal("حذف ویرایش از دیتابیس", `ساختاری که ${esc((e && e.by) || "کارشناس")} برای ${it.code ? `کد ${esc(it.code)}` : "این عنوان"} در دیتابیس اصلی ذخیره کرده پاک می‌شود و از این پس، در همهٔ درخواست‌ها، ساختارِ فهرست اقلام (یا اگر قلم در فهرست نیست، پیشنهاد مدل) برای آن می‌آید.`,
      async () => {
        try {
          await TP.api(`/items/${it.id}/edit`, { method: "DELETE" });
          dropHist(it);
          const row = items().find((x) => x.id === it.id); if (row) row.norm_json = null;
          await runNormalize(false);
        } catch (er) { TP.modal("خطا", esc(er.message), null, "باشد", ""); }
      }, "حذف", "انصراف");
  }

  /* از سوابق فقط نام (و کد) تأمین‌کننده وارد خط استعلام می‌شود؛ قیمتِ تازه باید
     از پیش‌فاکتور یا ورود دستی بیاید و قیمتِ سابقه جای آن را نمی‌گیرد. */
  async function addFromHistory(key) {
    const it = item(), s = supOf(key); if (!s) return;
    try {
      await TP.api("/quotes", { body: { assignment_id: A().id, item_ids: [it.id], supplier_name: s.name, supplier_code: s.code || "", origin: "history" } });
      S.tab = "quotes"; await reload();
    } catch (e) { TP.modal(e.status === 409 ? "قبلاً اضافه شده" : "خطا", esc(e.message), null, "باشد", ""); }
  }

  /* ---------- تب جستجوی هوشمند ----------
     کشف تأمین‌کنندهٔ تازه با Claude + جستجوی وب. کارشناس بازارها را تیک می‌زند
     (مهم‌ترین قید — بالای ستون)، برند و مشخصات و ملاحظات را می‌نویسد و اجرا
     می‌کند؛ نتیجه در D1 ثبت می‌شود و رفرش چیزی را نمی‌پراند. */
  /* نوع تأمین‌کننده — نسخهٔ تازه (v3) و نقش‌های نتایج قدیمی */
  const ROLE_FA = {
    manufacturer: "تولیدکننده", authorized_dealer: "نمایندگی رسمی", wholesaler: "عمده‌فروش/واردکننده",
    retailer: "فروشگاه", online_seller: "فروشندهٔ آنلاین/آگهی", unknown: "نامشخص",
    authorized_distributor: "نمایندهٔ رسمی", wholesaler_importer: "عمده‌فروش/واردکننده", retailer_shop: "فروشگاه",
    marketplace_only: "فقط آگهی", broker_intermediary: "واسطه",
  };
  /* S.smart[itemId] = { searches: [...] } — همهٔ جستجوهای همین قلم (هر درخواست و هر کارشناس)،
     تازه‌ترین اول. S.smFresh[itemId] جستجویی است که همین حالا اجرا شد و بالای همه برجسته می‌آید.
     S.chan[phone][platform] وضعیت پیام‌رسان‌های هر شماره است، مشترک بین همه و ذخیره در پایگاه داده. */
  S.smFresh = {}; S.chan = {}; S.chOpen = {}; S.smOpen = {}; S.spPh = {};
  /* «🗂 تأمین‌کنندگان کشف‌شده»ِ هر قلم و دروازهٔ «اجرای جستجوی هوشمند» (/search/smart GET؛ worker/discovered.js)،
     «؟»ِ بازِ دلیل، ردیف‌های بازشده، پالایه و جستجوی هر قلم */
  S.disc = {}; S.gate = {}; S.gateWhy = {}; S.dcOpen = {}; S.dcF = {}; S.dcQ = {};
  const mergeChannels = (ch) => { for (const [ph, v] of Object.entries(ch || {})) S.chan[ph] = { ...(S.chan[ph] || {}), ...v }; };
  const searchOf = (sid) => { const d = S.smart[(item() || {}).id]; return d && d.searches ? d.searches.find((x) => x.search_id === sid) : null; };
  const supOfSearch = (sid, idx) => { const s = searchOf(sid); return s && s.result && (s.result.suppliers || [])[idx]; };

  async function loadSmart(it) {
    if (S.smart[it.id] !== undefined) return;
    S.smart[it.id] = "loading";
    try {
      const r = await TP.api(`/search/smart?item_id=${it.id}`);
      S.marketsMeta = r.markets || S.marketsMeta;
      S.maxMarkets = r.maxMarkets || S.maxMarkets;
      mergeChannels(r.channels);
      S.smart[it.id] = { searches: r.searches || [] };
      S.disc[it.id] = r.discovered || null; S.gate[it.id] = r.gate || null;
    } catch (_) { S.smart[it.id] = { searches: [] }; S.disc[it.id] = null; S.gate[it.id] = null; }
    render();
  }

  /* یک کلیک روی ✓/✗/— : همان لحظه در صفحه عوض می‌شود و در پایگاه داده ثبت می‌شود؛ اگر ثبت نشد برمی‌گردد */
  async function toggleChannel(phone, platform) {
    const cur = (S.chan[phone] || {})[platform] || "unk";
    const next = cur === "unk" ? "ok" : cur === "ok" ? "no" : "unk";
    S.chan[phone] = { ...(S.chan[phone] || {}), [platform]: next };
    render();
    try {
      const r = await TP.api("/phones/channels", { method: "PUT", body: { phone, platform, state: next } });
      if (r && r.channels) S.chan[phone] = { ...S.chan[phone], ...r.channels };
    } catch (e) {
      S.chan[phone] = { ...(S.chan[phone] || {}), [platform]: cur };
      render();
      TP.modal("ثبت نشد", esc(e.message), null, "باشد", "");
    }
  }

  async function runSmart() {
    const it = item(); if (!it) return;
    const g = S.gate[it.id];
    if (g && !g.open) return TP.modal("جستجوی هوشمند بسته است", esc(gateTxt(g)), null, "باشد", "");
    const sm = smOf(it);
    if (!sm.markets.length) return TP.modal("بازار انتخاب نشده", "دست‌کم یک بازار را تیک بزنید — مهم‌ترین قید جستجو همین است.", null, "باشد", "");
    const b = TP.busy("جستجوی هوشمند در حال اجراست…",
      `${esc(it.title)}<br><span class="dim">مدل در بازارهای انتخابی می‌گردد، صفحه‌ها را می‌خواند و تماس‌ها را استخراج می‌کند؛ ممکن است چند دقیقه طول بکشد. پنجره را نبندید.</span>`);
    try {
      const r = await TP.api("/search/smart", { body: { item_id: it.id, markets: sm.markets, brand: sm.brand, specs: sm.specs, notes: sm.notes, deliveryHint: S.d.request.party } });
      /* پاسخ جریانی است: خطای وسط اجرا با وضعیت ۲۰۰ و فیلد error می‌آید */
      if (r && r.error) throw Object.assign(new Error(r.error), { status: r.status });
      b.close();
      if (r.available === false) return TP.modal("جستجوی هوشمند", esc(r.message), null, "باشد", "");
      /* نتیجهٔ تازه بالای همه؛ جستجوهای قبلی پایینش می‌مانند */
      mergeChannels(r.channels);
      const prev = (S.smart[it.id] && S.smart[it.id].searches) || [];
      S.smart[it.id] = { searches: [{ search_id: r.search_id, item_id: it.id, request_id: r.request_id, expert: r.expert, created_at: r.created_at, cost: r.cost, same_item: true, result: r.result },
        ...prev.filter((x) => x.search_id !== r.search_id)] };
      S.smFresh[it.id] = r.search_id;
      if (!it.hist_done_at || !it.smart_done_at) { await reload(); return; }
      render();
    } catch (e) { b.close(); TP.modal("جستجو انجام نشد", esc(e.message), null, "باشد", ""); }
  }

  /* افزودن تأمین‌کنندهٔ کشف‌شده به خط استعلام همین قلم — فقط نام می‌رود؛ از کدام جستجو آمده ثبت می‌شود */
  async function addFromSmart(sid, idx) {
    const it = item(), s = supOfSearch(sid, idx); if (!s) return;
    try {
      await TP.api("/quotes", { body: { assignment_id: A().id, item_ids: [it.id], supplier_name: s.name, origin: "smart", search_id: sid } });
      S.tab = "quotes"; await reload();
    } catch (e) { TP.modal(e.status === 409 ? "قبلاً اضافه شده" : "خطا", esc(e.message), null, "باشد", ""); }
  }

  /* پیام آماده برای یک تأمین‌کنندهٔ نتیجه: انتخاب قالب → متنِ پرشده → کپی */
  async function smartMessage(sid, idx) {
    const s = supOfSearch(sid, idx); if (s) await msgFor(s.name);
  }
  /* همان پنجره برای هر نام — نتیجهٔ جستجو یا «🗂 تأمین‌کنندگان کشف‌شده» */
  async function msgFor(name) {
    const s = { name };
    await loadTemplates(item());
    if (!S.templates.length) { for (const t of DEFAULT_TPL) await TP.api("/templates", { body: t }); await loadTemplates(item()); }
    const dlg = TP.modal(`پیام برای ${esc(s.name)}`, `<div class="tplbar">${S.templates.map((t, i) => `<button class="tplbtn ${i === 0 ? "on" : ""}" data-mt="${i}"><i>قالب ${i + 1}</i><b>${esc(t.title)}</b></button>`).join("")}</div>
      <textarea class="tp-textarea" id="mtxt" style="min-height:170px"></textarea>
      <div class="toolrow" style="align-items:end;flex-wrap:wrap;gap:8px;margin:8px 0 0">
        <label class="tp-field"><b>شمارهٔ تأمین‌کننده</b><select class="tp-input" data-mph style="min-width:190px"><option value="">شمارهٔ تازه…</option></select></label>
        <label class="tp-field" data-mnew><b>شمارهٔ تازه</b><input class="tp-input" data-mnum dir="ltr" inputmode="tel" placeholder="09…" style="width:150px"></label>
        <label class="tp-field" data-mnew><b>برچسب</b><input class="tp-input" data-mlab placeholder="همراه، فروش…" style="width:130px"></label></div>
      <div class="tp-acts"><button class="tp-btn primary" data-msend title="گفت‌وگوی تازه در «💬 مکاتبات» با همین متن، و پیامکِ ورود به پنل برای همین شماره">📨 ارسال پیام</button><button class="tp-btn" data-mcopy>کپی متن</button><button class="tp-btn" data-mlib title="قالب تازه بسازید یا قالب‌های خودتان را ویرایش کنید">📚 تعریف یا ویرایش قالب</button>${TP.ui.info("expert.history", "پیام به تأمین‌کننده")}<span class="dim" data-mmsg style="font-size:.85rem"></span></div>`, null, "بستن", "");
    /* «📨 ارسال پیام» (آبان ۱۴۰۵): همان مسیرِ «ارسال استعلام»ِ مکاتبات (/sp/x/send) — گفت‌وگوی تازه برای همین قلم و همین تأمین‌کننده با متنِ قالب */
    const mph = dlg.querySelector("[data-mph]");
    const showNew = () => dlg.querySelectorAll("[data-mnew]").forEach((x) => { x.style.display = mph.value ? "none" : ""; });
    TP.api(`/sp/x/phones?name=${encodeURIComponent(s.name)}`).then((r) => {
      const ph = (r && r.phones) || [];
      mph.insertAdjacentHTML("afterbegin", ph.map((p) => `<option value="${p.id}">${esc(p.phone)}${p.label ? ` — ${esc(p.label)}` : ""}${p.panel ? " ☑️" : ""}</option>`).join(""));
      if (ph.length) mph.value = String((ph.find((p) => p.panel) || ph[0]).id);
      showNew();
    }).catch(() => showNew());
    mph.onchange = showNew;
    dlg.querySelector("[data-msend]").onclick = async (ev) => {
      const it = item(), text = dlg.querySelector("#mtxt").value.trim(), msg = dlg.querySelector("[data-mmsg]");
      if (!it || !A()) return;
      if (!text) { msg.textContent = "متن خالی است."; return; }
      const body = { assignment_id: A().id, item_ids: [it.id], supplier_name: s.name, text };
      if (mph.value) body.phone_id = +mph.value; else { body.phone = dlg.querySelector("[data-mnum]").value.trim(); body.label = dlg.querySelector("[data-mlab]").value.trim(); }
      if (!body.phone_id && !body.phone) { msg.textContent = "شمارهٔ تأمین‌کننده را بنویسید."; return; }
      ev.target.disabled = true; msg.textContent = "در حالِ ارسال…";
      try {
        const r = await TP.api("/sp/x/send", { body });
        dlg.remove();
        TP.modal("📨 پیام رفت", `<p>گفت‌وگو با «${esc(s.name)}» در «💬 مکاتبات» باز شد و همین متن اولین پیامِ آن است.</p><p class="dim">${esc((r.sms && r.sms.note) || "")}</p>`,
          () => { try { sessionStorage.setItem("sp.th.e", String(r.thread_id)); sessionStorage.setItem("sp.aid", String(A().id)); } catch (_) { /* حالت خصوصی */ } location.href = "correspond"; }, "💬 رفتن به گفت‌وگو", "بستن");
      } catch (e) { ev.target.disabled = false; msg.textContent = e.message; }
    };
    dlg.querySelector("[data-mlib]").onclick = () => { dlg.remove(); pickTemplate(); };
    const paint = (i) => {
      dlg.querySelectorAll("[data-mt]").forEach((x) => x.classList.toggle("on", +x.dataset.mt === i));
      dlg.querySelector("#mtxt").value = fillTpl(S.templates[i].body, s.name);
    };
    dlg.querySelectorAll("[data-mt]").forEach((x) => x.onclick = () => paint(+x.dataset.mt));
    dlg.querySelector("[data-mcopy]").onclick = async () => {
      const ta = dlg.querySelector("#mtxt");
      try { await navigator.clipboard.writeText(ta.value); dlg.querySelector("[data-mmsg]").textContent = "کپی شد ✓"; }
      catch (_) { ta.select(); document.execCommand("copy"); dlg.querySelector("[data-mmsg]").textContent = "کپی شد ✓"; }
      /* گزارشِ کارکرد در پنل پشتیبانی (آبان ۱۴۰۵): کپیِ پیام با نامِ تأمین‌کننده و قالب ثبت می‌شود؛ ثبت‌نشدن مانعِ کار نیست */
      const it = item(), mt = dlg.querySelector("[data-mt].on");
      TP.api("/me/activity", { body: { kind: "msg_copy", supplier: s.name, item_id: it ? it.id : null, template: mt ? (S.templates[+mt.dataset.mt] || {}).title || null : null, chars: ta.value.length } }).catch(() => {});
    };
    paint(0);
  }

  /* نتیجهٔ جستجو را هر دو شکل می‌خوانند: v3 (فهرست ساده) و نتایج ذخیره‌شدهٔ قدیمی */
  const supPhones = (s) => (s.phones || []).map((p) => (p && typeof p === "object" ? p.e164 || p.verbatim : p)).filter(Boolean);
  const supEmails = (s) => (s.emails || []).map((x) => (x && typeof x === "object" ? x.verbatim : x)).filter(Boolean);
  const supMarket = (s) => s.market || (s.location && s.location.country) || "";
  const supType = (s) => s.type || s.role || "unknown";
  const supPrice = (s) => (s.price && typeof s.price === "object" ? [s.price.text, s.price.unit ? `/ ${s.price.unit}` : ""].filter(Boolean).join(" ") : s.price || "");
  const faDigits = (x) => String(x).replace(/\d/g, (c) => "۰۱۲۳۴۵۶۷۸۹"[+c]).replace(/\./g, "٫");
  /* بررسی دستیِ پیام‌رسان هر شماره — همان مدل دمو: «—» بررسی‌نشده، یک کلیک ✓، کلیک دوم ✗.
     کلید، خودِ شماره است (برای هر چهار پیام‌رسان): تیکی که یک کارشناس زد، برای هر کارشناسی که
     همان شماره را در هر جستجویی ببیند پیش‌پر است. */
  const TRI = { unk: ["—", "unk"], ok: ["✓", "ok"], no: ["✗", "no"] };
  /* ستون وب‌سایت فشرده است (تصمیم مدیر): یک کادر «وبسایت» با فلش ↗ سمت راست و کرهٔ زمین
     سمت چپ؛ نشانی کامل در title است و با کلیک همان لینک باز می‌شود. */
  const ICO_GLOBE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>`;
  const ICO_ARROW = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>`;
  const siteBtn = (u) => {
    const x = String(u || "").trim();
    if (!x) return "—";
    const href = /^https?:\/\//i.test(x) ? x : `https://${x}`;
    return `<a class="sitebtn" href="${esc(href)}" target="_blank" rel="noopener" title="${esc(x)}"><span class="arr">${ICO_ARROW}</span><span>وبسایت</span><span class="glb">${ICO_GLOBE}</span></a>`;
  };

  /* جدول نتایج یک جستجو */
  function smartTable(it, srch) {
    const sup = (srch.result && srch.result.suppliers) || [], sid = srch.search_id;
    const added = new Set(S.d.quotes.filter((q) => q.item_id === it.id).map((q) => TP.nrm(q.supplier_name)));
    const rows = sup.map((s, i) => {
      const phones = supPhones(s), keys = s.phone_keys || [], emails = supEmails(s), key = `${sid}|${i}`, open = !!S.chOpen[key];
      const tri = (ph, p, lab) => {
        const st = TRI[(S.chan[ph] || {})[p]] ? S.chan[ph][p] : "unk";
        return `<button class="tri ${TRI[st][1]}" data-ch="${esc(ph)}|${p}" title="${lab}">${TRI[st][0]}</button>`;
      };
      /* خلاصهٔ کنار شماره: پیام‌رسان‌هایی که کسی بررسی کرده */
      const marks = (ph) => PLATS.filter(([p]) => ["ok", "no"].includes((S.chan[ph] || {})[p])).map(([p, l]) => `<span class="chm ${S.chan[ph][p]}" title="${l}">${S.chan[ph][p] === "ok" ? "✓" : "✗"}${l}</span>`).join("");
      const checks = open && phones.length ? `<tr class="chrow"><td></td><td colspan="8"><table class="chx"><thead><tr><th class="rt">شماره</th>${PLATS.map(([, l]) => `<th>${l}</th>`).join("")}<th class="rt"></th></tr></thead><tbody>
        ${phones.map((ph, k) => { const pk = keys[k] || ph, c = S.chan[pk] || {};
          return `<tr><td class="num rt" dir="ltr">${esc(ph)}</td>${PLATS.map(([p, l]) => `<td>${tri(pk, p, l)}</td>`).join("")}
            <td class="dim rt" style="font-size:.72rem">${c.updated_by ? `آخرین بررسی: ${esc(c.updated_by)}${c.updated_at ? " — " + TP.fmt(c.updated_at) : ""}` : ""}</td></tr>`; }).join("")}
        </tbody></table></td></tr>` : "";
      return `<tr>
        <td class="num">${M(i + 1)}</td>
        <td class="rt">${esc(s.name || "—")}</td>
        <td>${esc(ROLE_FA[supType(s)] || supType(s))}</td>
        <td>${esc(supMarket(s) || "—")}</td>
        <td class="rt">${phones.length ? `<div class="phcell"><button class="tp-btn xs hamb ${open ? "on" : ""}" data-chopen="${esc(key)}" title="بررسی تلگرام، واتساپ، بله و روبیکا">☰</button><div>${phones.map((ph, k) => `<div class="num" dir="ltr">${esc(ph)}</div>${marks(keys[k] || ph) ? `<div class="chms">${marks(keys[k] || ph)}</div>` : ""}`).join("")}</div></div>` : "—"}</td>
        <td class="rt" dir="ltr" style="text-align:right">${emails.length ? emails.map((x) => `<div>${esc(x)}</div>`).join("") : "—"}</td>
        <td>${siteBtn(s.website)}</td>
        <td class="rt">${esc(supPrice(s) || "—")}</td>
        <td style="white-space:nowrap">${added.has(TP.nrm(s.name)) ? `<span class="chip ok">در استعلامات</span>` : `<button class="tp-btn xs" data-sm-add="${sid}|${i}" title="نام تأمین‌کننده وارد تب استعلامات می‌شود">افزودن</button>`}
          <button class="tp-btn xs" data-sm-msg="${sid}|${i}" title="قالب پیام با فیلدهای همین تأمین‌کننده پر می‌شود">پیام</button>${smPickBtn(it, sid, i, s)}</td></tr>${checks}`;
    }).join("");
    return `<div class="tp-scroll" data-keep-scroll><table class="tp-table smres"><thead><tr>
        <th>#</th><th class="rt">تأمین‌کننده</th><th>نوع</th><th>بازار</th><th class="rt">شماره تماس</th><th class="rt">ایمیل</th><th>وب‌سایت</th><th class="rt">قیمت</th><th>عمل</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="9"><div class="empty">مدل تأمین‌کننده‌ای برنگرداند.</div></td></tr>`}</tbody></table></div>
`;
  }

  /* ---------- «🗂 تأمین‌کنندگان کشف‌شده» (درخواست مالک، مهر ۱۴۰۵) ----------
     ۴۰ نفرِ برترِ ردنشدهٔ نوع قلم در تحقیقِ کشفِ تأمین‌کننده (worker/discovered.js)، پیش‌فرض بالای تب. کلیک روی هر نفر همهٔ
     اطلاعاتش را باز می‌کند؛ پالایه و جستجو فقط همین فهرست را کم و زیاد می‌کنند. «اجرای جستجوی هوشمند» برای قلمی که کمتر از حدِ
     پنل پشتیبانی (پیش‌فرض ۱۰) کشف‌شده دارد باز است؛ بسته که بود، دکمه غیرفعال است و دلیلش در «؟» کنارش. */
  const gateTxt = (g) => `برای این قلم ${M(g.count)} تأمین‌کنندهٔ کشف‌شده هست؛ «اجرای جستجوی هوشمند» وقتی باز است که کمتر از ${M(g.min)} نفر باشند، تا هزینهٔ جستجوی وب فقط جایی صرف شود که تحقیق کم آورده. اگر لازم است، از پشتیبانی بخواهید جستجوی هوشمندِ شما را باز کند.`;
  const DC_ST = { "تأییدشده": ["تأییدشده", "ok"], "مرزی": ["مرزی", "warn"], "در ده‌تای اول — منتظر تکمیل دروازه‌ها": ["ده‌تای اول · منتظر دروازه‌ها", "info"], "رقیب (رتبهٔ ۱۱ تا ۴۰)": ["رقیب ۱۱ تا ۴۰", ""] };
  const DC_VER = { 2: "۲ — همهٔ دروازه‌ها قبول", 1: "۱ — هویت قابل احراز", 0: "۰ — هنوز احراز نشده" };
  const DC_BASIS = { S2: "امتیاز کامل موتور", S1: "ترتیب غربال اولیه" };
  /* سرستون‌های فایل ۶ تحقیق (برگهٔ «طرح‌واره») */
  const DC_GROUPS = [
    ["تماس", [["phones", "تلفن ثابت"], ["mobiles", "تلفن همراه"], ["fax", "نمابر"], ["email", "ایمیل"], ["website", "وب‌سایت"], ["social", "شبکه‌های اجتماعی"], ["verified_contacts", "تماس تأییدشده (دو منبع)"]]],
    ["شناسه و ثبت", [["legal_name", "نام رسمی شرکت"], ["brand_name", "نام تجاری / فروشگاه"], ["latin_name", "نام لاتین"], ["supplier_type", "نوع تأمین‌کننده"], ["national_id", "شناسهٔ ملی"],
      ["registration_no", "شمارهٔ ثبت"], ["registration_place", "محل ثبت"], ["established", "سال تأسیس"], ["registry_status", "وضعیت ثبتی"], ["registered_capital", "سرمایهٔ ثبتی"], ["manager", "مدیرعامل / مدیر"]]],
    ["مکان", [["country", "کشور"], ["province", "استان"], ["city", "شهر"], ["hub", "بازار / مرکز تجاری"], ["address", "نشانی"], ["postal_code", "کد پستی"]]],
    ["کسب‌وکار", [["chain_role", "نقش در زنجیره"], ["branches_n", "تعداد شعبه / نمایندگی / انبار"], ["branches", "محل شعبه‌ها و نمایندگی‌ها"], ["brands", "کارخانه‌ها / برندهای عرضه‌شده"],
      ["products", "محصولات (به نقل از خودش)"], ["enamad", "نماد اعتماد الکترونیکی"], ["certificates", "گواهی‌ها"], ["memberships", "عضویت و رتبه"]]],
    ["راستی‌آزمایی و فعالیت", [["verification", "سطح راستی‌آزمایی"], ["gates_summary", "وضعیت دروازه‌ها"], ["open_gates", "دروازه‌های باز یا رد (دلیل)"], ["g4_review", "بازبینی نام (G4)"],
      ["last_activity", "آخرین نشانهٔ فعالیت"], ["last_activity_date", "تاریخ آخرین فعالیت"]]],
    ["پیشینهٔ تحقیق", [["discovery_channel", "منبع کشف"], ["clusters", "خوشه‌ها"], ["n_units", "شمار انواع قلم مرتبط"], ["n_units_exact", "شمار با تناسب اصلی"], ["n_item_codes", "شمار کد قلم مرتبط"],
      ["best_rank", "بهترین رتبه"], ["best_rank_unit", "نوع قلمِ بهترین رتبه"], ["n_top10", "شمار انواع قلم در ده‌تای اول"], ["n_top40", "شمار انواع قلم در ۴۰ نفر اول"], ["top10_units", "انواع قلم ده‌تای اول"],
      ["completeness", "کامل بودن پرونده"], ["other", "سایر"], ["todo", "کارهای مانده"], ["sources", "منابع"], ["checked", "تاریخ بررسی"]]],
  ];
  const dcFilled = (v) => v != null && String(v).trim() !== "" && !["—", "-"].includes(String(v).trim());
  const dcSplit = (v) => String(v).split(/\s*[،,]\s*|\n+/).map((x) => x.trim()).filter(Boolean);
  const dcUrl = (u) => { const x = String(u).trim(); return /^https?:\/\//i.test(x) ? x : `https://${x}`; };
  const dcFx = (x) => !!(x.country && String(x.country).trim() !== "ایران");
  /** مقدارِ یک فیلد: ستون‌های دفتر (با اصلاحِ کارشناس) و بقیه از دادهٔ تحقیق */
  const dcVal = (x, f) => {
    const top = { hub: x.hub, province: x.province, city: x.city, country: x.country, phones: x.phones, mobiles: x.mobiles, verification: x.verification, chain_role: x.role }[f];
    return dcFilled(top) || f === "verification" ? top : (x.d || {})[f];
  };
  const dcCopy = (t) => `<button type="button" class="dc-copy" data-dc-copy="${esc(t)}" aria-label="کپی ${esc(t)}">کپی</button>`;
  const dcDate = (s) => { const d = new Date(`${String(s).trim()}T12:00:00`); return isNaN(d) ? String(s) : d.toLocaleDateString("fa-IR", { year: "numeric", month: "long", day: "numeric" }); };
  function dcFmt(f, v) {
    if (!dcFilled(v) && !(f === "verification" && v != null)) return null;
    if (["phones", "mobiles", "fax", "verified_contacts"].includes(f)) return dcSplit(v).map((p) => `<span class="num" dir="ltr">${esc(p)}</span>${dcCopy(p)}`).join("، ");
    if (f === "email") return dcSplit(v).map((p) => `<span dir="ltr">${esc(p)}</span>${dcCopy(p)}`).join("، ");
    if (f === "website") return dcSplit(v).map((p) => `<a href="${esc(dcUrl(p))}" target="_blank" rel="noopener" dir="ltr">${esc(p)}</a>`).join("، ");
    if (f === "social") return dcSplit(v).map((p) => (/\.[a-z]{2,}\//i.test(p) ? `<a href="${esc(dcUrl(p))}" target="_blank" rel="noopener" dir="ltr">${esc(p)}</a>` : `<span dir="ltr">${esc(p)}</span>`)).join("، ");
    if (f === "sources") return String(v).split(/\s+/).filter((p) => /^https?:/i.test(p)).map((p) => `<a href="${esc(p)}" target="_blank" rel="noopener" dir="ltr">${esc(p.replace(/^https?:\/\/(www\.)?/, "").slice(0, 52))}</a>`).join("\n") || esc(v);
    if (f === "verification") return esc(DC_VER[Number(v)] || String(v));
    if (f === "completeness") return `${M(Math.round(Number(v) * 100))}٪`;
    if (f === "last_activity_date" || f === "checked") return esc(dcDate(v));
    if (f === "enamad") { const u = (String(v).match(/https?:\S+/) || [])[0]; return esc(String(v).replace(/\s*·?\s*https?:\S+/, "")) + (u ? ` · <a href="${esc(u)}" target="_blank" rel="noopener">نماد</a>` : ""); }
    return esc(String(v));
  }
  const dcOf = (it) => (it ? S.disc[it.id] : null);
  const dcSup = (sid) => { const D = dcOf(item()); return D && D.list ? D.list.find((x) => x.sid === sid) : null; };
  const dcInQuotes = (it, name) => S.d.quotes.some((q) => q.item_id === it.id && TP.nrm(q.supplier_name) === TP.nrm(name));
  function dcDetail(it, x, D) {
    /* «✉️ پیام» و «🎯 دعوت» / «➕ افزودن» در خودِ ردیف‌اند؛ این‌جا فقط آنچه ردیف ندارد */
    const pk = pkEditable(it);
    const acts = `${pk && !dcInQuotes(it, x.name) ? `<button class="tp-btn sm" data-dc-add="${esc(x.sid)}" title="نام تأمین‌کننده وارد تب استعلامات می‌شود">➕ به استعلامات</button>` : ""}
      ${TP.supProfile && S.crReg ? `<button class="tp-btn sm" data-dc-prof="${esc(x.sid)}">👤 پروفایل و گراف</button>` : ""}
      <button class="tp-btn sm" data-dc-phone="${esc(x.sid)}" title="شماره در دفترچهٔ شماره‌ها با تیکِ «پنل» برای دعوت و پیامک">📇 ثبت شماره</button>`;
    const why = `<div class="dc-why-box"><dl class="dc-kv">
      <dt>تناسب با این قلم</dt><dd>${x.fit === "اصلی" ? "<b>اصلی</b> — نام کالا در فهرست محصولات خودش است" : "<b>خانواده</b> — خانوادهٔ این کالا را عرضه می‌کند"}</dd>
      ${dcFilled(x.quote) ? `<dt>نقل از خودش</dt><dd>«${esc(x.quote)}»${dcFilled(x.url) ? ` · <a href="${esc(dcUrl(x.url))}" target="_blank" rel="noopener">شاهد</a>` : ""}</dd>` : ""}
      <dt>رتبه در این نوع قلم</dt><dd>${M(x.rank)}${D.n_found ? ` از ${M(D.n_found)} تأمین‌کنندهٔ ردنشده` : ""}</dd>
      ${x.score != null ? `<dt>امتیاز (از ۴)</dt><dd>${faDigits(x.score)}${x.lo != null && x.hi != null ? ` <span class="dim">(بازهٔ ${faDigits(x.lo)} تا ${faDigits(x.hi)})</span>` : ""}</dd>` : ""}
      ${x.p10 != null ? `<dt>احتمال ده‌تای اول</dt><dd>${M(Math.round(x.p10 * 100))}٪</dd>` : ""}
      ${x.basis ? `<dt>مبنای رتبه</dt><dd>${esc(DC_BASIS[x.basis] || x.basis)}</dd>` : ""}
      <dt>وضعیت</dt><dd>${esc(x.status || "—")}${x.staff_phone ? ` · <span class="chip ok">شمارهٔ اصلاح‌شدهٔ کارشناس</span>` : ""}</dd></dl></div>`;
    const secs = DC_GROUPS.map(([t, fs]) => {
      const rows = fs.map(([f, l]) => { const v = dcFmt(f, dcVal(x, f)); return v == null ? "" : `<dt>${esc(l)}</dt><dd>${v}</dd>`; }).join("");
      return rows ? `<div class="dc-sec"><h5>${esc(t)}</h5><dl class="dc-kv">${rows}</dl></div>` : "";
    }).join("");
    return `<div class="dc-det" id="dc-det-${esc(x.sid)}"><div class="toolrow" style="gap:6px;flex-wrap:wrap;padding-top:8px">${acts}</div>${why}<div class="dc-secs">${secs}</div></div>`;
  }
  /* جدولِ کشف‌شده‌ها (آبان ۱۴۰۵، خواستهٔ مالک): ستون‌های جدا با عرضِ متناسب و بی اطلاعاتِ اضافه — رتبه، تأمین‌کننده، شهر/بازار، تناسب،
     شماره‌ها (هر شماره در یک خط، با ☰ برای تیکِ تلگرام، واتساپ، بله، ایتا و روبیکا — همان مدلِ نتایج جستجو) و عمل‌ها (✉️ کپی پیام با
     قالبِ پرشده، 🎯 دعوت یا ➕ افزودن). همهٔ اطلاعات با کلیک روی ردیف زیرش باز می‌شود. */
  const dcPlace = (x) => {
    const hub = dcFilled(x.hub) && !/^(شهر|استان)\s*:/.test(x.hub) ? x.hub : "";
    return [x.city || (hub ? "" : x.province), hub && hub !== x.city ? hub : "", dcFx(x) ? x.country : ""].filter(dcFilled).join(" · ");
  };
  function dcRow(it, x, D) {
    const open = !!S.dcOpen[x.sid], ck = `dc:${x.sid}`, tel = x.tel || [], chOpen = !!S.chOpen[ck];
    const pk = pkEditable(it);
    const add = pk ? (pkHas(it, x.name) ? `<span class="chip info" title="در «🎯 فهرست دعوت»">🎯 در فهرست</span>` : `<button class="tp-btn xs primary" data-dc-pick="${esc(x.sid)}" title="به «🎯 فهرست دعوت»">🎯 دعوت</button>`)
      : dcInQuotes(it, x.name) ? `<span class="chip ok">در استعلامات</span>` : `<button class="tp-btn xs" data-dc-add="${esc(x.sid)}" title="نام تأمین‌کننده وارد تب استعلامات می‌شود">➕ افزودن</button>`;
    const marks = (k) => PLATS.filter(([p]) => ["ok", "no"].includes((S.chan[k] || {})[p])).map(([p, l]) => `<span class="chm ${S.chan[k][p]}" title="${l}">${S.chan[k][p] === "ok" ? "✓" : "✗"}${l}</span>`).join("");
    const tri = (k, p, l) => { const st = TRI[(S.chan[k] || {})[p]] ? S.chan[k][p] : "unk"; return `<button class="tri ${TRI[st][1]}" data-ch="${esc(k)}|${p}" title="${l}">${TRI[st][0]}</button>`; };
    const phones = tel.length ? `<div class="phcell"><button class="tp-btn xs hamb ${chOpen ? "on" : ""}" data-chopen="${esc(ck)}" title="بررسی تلگرام، واتساپ، بله، ایتا و روبیکا">☰</button><div>${tel.map((p) => `<div class="num" dir="ltr" title="${esc(p.raw)}">${esc(p.disp)}</div>${marks(p.key) ? `<div class="chms">${marks(p.key)}</div>` : ""}`).join("")}</div></div>` : `<span class="dim">—</span>`;
    const checks = chOpen && tel.length ? `<tr class="chrow"><td></td><td colspan="5"><table class="chx"><thead><tr><th class="rt">شماره</th>${PLATS.map(([, l]) => `<th>${l}</th>`).join("")}<th class="rt"></th></tr></thead><tbody>
      ${tel.map((p) => { const c = S.chan[p.key] || {}; return `<tr><td class="num rt" dir="ltr">${esc(p.disp)}</td>${PLATS.map(([pl, l]) => `<td>${tri(p.key, pl, l)}</td>`).join("")}<td class="dim rt" style="font-size:.72rem">${c.updated_by ? `آخرین بررسی: ${esc(c.updated_by)}${c.updated_at ? " — " + TP.fmt(c.updated_at) : ""}` : ""}</td></tr>`; }).join("")}
      </tbody></table></td></tr>` : "";
    const text = [x.name, (x.d || {}).brand_name, (x.d || {}).legal_name, (x.d || {}).latin_name, x.city, x.hub, x.province, (x.d || {}).products, (x.d || {}).brands].filter(Boolean).join(" ");
    return `<tbody class="dc-row" data-dc-text="${esc(TP.nrm(text))}"><tr class="dc-tr ${open ? "on" : ""}" data-dc-row="${esc(x.sid)}" tabindex="0" aria-expanded="${open}" aria-controls="dc-det-${esc(x.sid)}">
        <td class="num"><span class="dc-rk ${x.rank <= 10 ? "top" : ""}" title="رتبه در این نوع قلم">${M(x.rank)}</span></td>
        <td class="rt"><b>${esc(x.name)}</b></td>
        <td class="rt dim">${esc(dcPlace(x) || "—")}</td>
        <td><span class="chip ${x.fit === "اصلی" ? "ok" : ""}">${esc(x.fit)}</span></td>
        <td class="rt">${phones}</td>
        <td class="dc-acts"><button class="tp-btn xs" data-dc-msg="${esc(x.sid)}" title="قالب‌های پیام با نامِ همین تأمین‌کننده و اطلاعاتِ درخواست پر می‌شوند؛ متن را کپی کنید">✉️ پیام</button>${add}<span class="dim" aria-hidden="true">${open ? "▴" : "▾"}</span></td></tr>
      ${checks}${open ? `<tr class="dc-dtr"><td colspan="6">${dcDetail(it, x, D)}</td></tr>` : ""}</tbody>`;
  }
  function dcBlock(it) {
    const D = dcOf(it);
    if (D === undefined) return "";
    if (!D) return `<div class="dc"><div class="dc-none">فهرستِ تأمین‌کنندگانِ کشف‌شده خوانده نشد؛ صفحه را تازه کنید.</div></div>`;
    const L = D.list || [], f = S.dcF[it.id] || "all", q = S.dcQ[it.id] || "";
    const head = `<div class="dc-head"><b>🗂 تأمین‌کنندگان کشف‌شده</b><span class="dim">${D.cluster_name ? `${esc(D.cluster_name)} · ` : ""}${D.head ? `تا ۴۰ نفرِ برترِ ردنشدهٔ نوع قلم «${esc(D.head)}» در تحقیقِ کشفِ تأمین‌کننده` : "تحقیقِ کشفِ تأمین‌کننده"}</span>${TP.ui.info("expert.smart", "راهنمای تأمین‌کنندگان کشف‌شده")}</div>`;
    if (!L.length) return `<div class="dc">${head}<div class="dc-none">${D.unit_key ? `برای این نوع قلم در تحقیق تأمین‌کننده‌ای پیدا نشد.` : "این قلم در دادهٔ تحقیقِ کشفِ تأمین‌کننده نیست."}</div></div>`;
    const n = (fn) => L.filter(fn).length;
    const fxN = n(dcFx), hasTel = (x) => (x.tel || []).length > 0;
    const sum = `<div class="dc-sum"><span class="chip">${M(L.length)} نفر</span><span class="chip ok">${M(n((x) => x.fit === "اصلی"))} تناسب اصلی</span>
      <span class="chip">${M(n(hasTel))} با تلفن</span>${fxN ? `<span class="chip warn">${M(fxN)} خارجی</span>` : ""}</div>`;
    const segs = [["all", "همه"], ["exact", "تناسب اصلی"], ["phone", "با تلفن"], ...(fxN ? [["fx", "خارجی"]] : [])];
    const tools = `<div class="dc-tools"><input class="tp-input" type="search" data-dcq value="${esc(q)}" placeholder="جستجو در نام، شهر، بازار یا محصول" aria-label="جستجو در تأمین‌کنندگان کشف‌شده">
      <div class="tp-seg" role="group" aria-label="پالایهٔ تأمین‌کنندگان کشف‌شده">${segs.map(([k, l]) => `<button type="button" class="${f === k ? "on" : ""}" aria-pressed="${f === k}" data-dc-f="${k}">${l}</button>`).join("")}</div></div>`;
    const rows = L.filter((x) => f === "all" || (f === "exact" ? x.fit === "اصلی" : f === "phone" ? hasTel(x) : dcFx(x)));
    return `<div class="dc" data-keep-scroll>${head}${sum}${tools}
      ${rows.length ? `<div class="tp-scroll"><table class="tp-table dct"><colgroup><col style="width:48px"><col style="width:24%"><col style="width:18%"><col style="width:80px"><col style="width:23%"><col style="width:190px"></colgroup>
        <thead><tr><th>رتبه</th><th class="rt">تأمین‌کننده</th><th class="rt">شهر / بازار</th><th>تناسب</th><th class="rt">شماره تماس</th><th>عمل</th></tr></thead>
        ${rows.map((x) => dcRow(it, x, D)).join("")}</table></div>` : `<div class="dc-none">با این پالایه کسی نماند.</div>`}
      <div class="dc-none" data-dc-empty hidden>با این جستجو کسی پیدا نشد.</div></div>`;
  }
  /** جستجوی درونِ فهرست بی بازرندر (فوکوسِ کادر نمی‌پرد) */
  function dcFilterDom(q) {
    const k = TP.nrm(q || ""), rows = [...document.querySelectorAll(".dc-row")];
    let shown = 0;
    for (const r of rows) { const ok = !k || (r.dataset.dcText || "").includes(k); r.hidden = !ok; if (ok) shown++; }
    const e = document.querySelector("[data-dc-empty]"); if (e) e.hidden = !(rows.length && !shown);
  }
  const dcMobile = (x) => [...dcSplit(x.mobiles || ""), ...dcSplit(x.phones || "")].map((p) => p.replace(/[^\d+]/g, "")).find((p) => /^(\+98|0098|98|0)?9\d{9}$/.test(p)) || "";
  async function dcPickUI(sid) {
    const it = item(), x = dcSup(sid); if (!it || !x) return;
    const P = S.picks[it.id];
    const d = TP.modal(`🎯 «${esc(x.name)}» به فهرست دعوت`, `<p style="margin-top:0">کارشناس هوشمند فقط به شمارهٔ پنلِ تیک‌خورده پیامک می‌دهد. شماره را ببینید یا وارد کنید و تیکِ پنل بزنید (اختیاری — بعد هم از «📱» در فهرست می‌شود).</p>
      <div class="toolrow" style="align-items:end;flex-wrap:wrap;gap:8px">
        <label class="tp-field"><b>شمارهٔ همراه</b><input class="tp-input" id="dcp-num" dir="ltr" inputmode="tel" value="${esc(dcMobile(x))}" placeholder="09…" style="width:150px"></label>
        <label class="tp-field"><b>برچسب</b><input class="tp-input" id="dcp-lab" value="تأمین‌کنندهٔ کشف‌شده" style="width:170px"></label>
        <label class="chkline"><input type="checkbox" id="dcp-panel" checked> تیکِ پنل</label></div>
      <p class="dim" style="font-size:.84rem">${P && P.started_at ? "بعد از افزودن، در «بررسی سوابق» «📨 دعوت از انتخاب‌های تازه» را بزنید." : "بعد در «بررسی سوابق» «🚀 شروع» را بزنید."}</p>`, async () => {
      const num = (d.querySelector("#dcp-num").value || "").trim();
      try {
        if (num) await TP.api("/sp/x/phones", { body: { supplier_name: x.name, phone: num, label: d.querySelector("#dcp-lab").value || "تأمین‌کنندهٔ کشف‌شده", panel: d.querySelector("#dcp-panel").checked } });
        await pkEdit(it, { add: [{ name: x.name, src: "disc", rsid: x.sid, ph: [...dcSplit(x.mobiles || ""), ...dcSplit(x.phones || "")].slice(0, 3) }] });
      } catch (e) { TP.modal("نشد", esc(e.message), null, "باشد", ""); }
    }, "به فهرست بیفزا", "انصراف");
  }
  async function dcAddQuote(sid) {
    const it = item(), x = dcSup(sid); if (!it || !x) return;
    try {
      await TP.api("/quotes", { body: { assignment_id: A().id, item_ids: [it.id], supplier_name: x.name, origin: "disc" } });
      S.tab = "quotes"; await reload();
    } catch (e) { TP.modal(e.status === 409 ? "قبلاً اضافه شده" : "خطا", esc(e.message), null, "باشد", ""); }
  }
  function dcPhoneUI(sid) {
    const x = dcSup(sid); if (!x) return;
    const nums = [...dcSplit(x.mobiles || ""), ...dcSplit(x.phones || "")];
    const d = TP.modal(`📇 شمارهٔ «${esc(x.name)}»`, `<p style="margin-top:0">شماره در دفترچهٔ شماره‌ها ثبت می‌شود؛ با تیکِ «پنل» دعوت و پیامکِ پنلِ تأمین‌کننده به همین شماره می‌رود.</p>
      <div class="toolrow" style="align-items:end;flex-wrap:wrap;gap:8px">
        <label class="tp-field"><b>شماره</b><input class="tp-input" id="dcn-num" dir="ltr" inputmode="tel" list="dcn-list" value="${esc(dcMobile(x) || nums[0] || "")}" style="width:170px"></label>
        <datalist id="dcn-list">${nums.map((p) => `<option value="${esc(p)}">`).join("")}</datalist>
        <label class="tp-field"><b>برچسب</b><input class="tp-input" id="dcn-lab" value="تأمین‌کنندهٔ کشف‌شده" style="width:170px"></label>
        <label class="chkline"><input type="checkbox" id="dcn-panel" checked> تیکِ پنل</label></div>`, async () => {
      const num = (d.querySelector("#dcn-num").value || "").trim(); if (!num) return;
      try { await TP.api("/sp/x/phones", { body: { supplier_name: x.name, phone: num, label: d.querySelector("#dcn-lab").value || "تأمین‌کنندهٔ کشف‌شده", panel: d.querySelector("#dcn-panel").checked } }); okTick("شماره ثبت شد"); }
      catch (e) { TP.modal("نشد", esc(e.message), null, "باشد", ""); }
    }, "ثبت", "انصراف");
  }

  function vSmart(it) {
    const d = S.smart[it.id];
    if (d === undefined) { loadSmart(it); }
    if (S.crReg === undefined && TP.supProfile) { S.crReg = null; TP.supProfile.enabled().then((v) => { S.crReg = v; if (v) render(); }); }
    const list = d && d !== "loading" ? d.searches || [] : [];
    const fresh = list.find((x) => x.search_id === S.smFresh[it.id]);
    const older = list.filter((x) => x !== fresh);
    /* دروازهٔ «اجرای جستجوی هوشمند»: بسته ← دکمهٔ غیرفعال و دلیل در «؟» کنارش (با کلیک باز و بسته می‌شود) */
    const g = S.gate[it.id], shut = !!(g && !g.open), why = shut && !!S.gateWhy[it.id];
    const head = `<div class="toolrow"><b style="font-size:1.02rem">جستجوی هوشمند برای «${esc(it.title)}»</b>
      ${it.smart_done_at ? `<span class="chip ok">اجرا شد — ${TP.fmt(it.smart_done_at)}</span>` : ""}
      <span style="margin-inline-start:auto"></span>
      <button class="tp-btn" data-tpl-open title="قالب‌های پیام موجود را ببینید یا قالب تازه بسازید">ایجاد قالب پیام</button>
      <span class="dc-run"><button class="tp-btn primary" data-run-smart ${shut ? 'disabled aria-disabled="true"' : ""}>${shut ? "🔒 " : ""}${list.length ? "اجرای جستجوی تازه" : "اجرای جستجوی هوشمند"}</button>${shut ? `<button type="button" class="tp-info" data-gate-why aria-expanded="${why}" aria-controls="dc-why-${it.id}" title="چرا بسته است؟" aria-label="چرا «اجرای جستجوی هوشمند» بسته است؟">؟</button>` : ""}</span>
      ${it.smart_done_at ? "" : `<button class="tp-btn" data-mark="smart" title="اگر جستجو را بیرون از سامانه انجام داده‌اید">علامت بزن</button>`}</div>
      ${why ? `<div class="dc-why" id="dc-why-${it.id}" role="note">${esc(gateTxt(g))}</div>` : ""}`;
    const meta = (x) => `${TP.fmt(x.created_at)} · ${esc(x.expert || "—")}${x.request_id ? ` · درخواست <span class="num">${esc(x.request_id)}</span>` : ""}${x.same_item ? "" : ` <span class="chip info" title="همین قلم در درخواست دیگری جستجو شده بود">درخواست دیگر</span>`}`;
    const count = (x) => ((x.result && x.result.suppliers) || []).length;

    let main;
    if (d === undefined || d === "loading") main = `<div class="empty">در حال خواندن تأمین‌کنندگانِ کشف‌شده و جستجوهای قبلی این قلم…</div>`;
    else if (!list.length) main = shut ? `<div class="empty">جستجوی وب برای این قلم اجرا نشده.</div>` : `<div class="empty"><b>هنوز جستجویی برای این قلم اجرا نشده.</b>
      بازارها را در ستون کنار انتخاب کنید و «اجرای جستجوی هوشمند» را بزنید.</div>`;
    else {
      /* نتیجهٔ تازه بالا و برجسته؛ جستجوهای قبلیِ همین قلم (هر درخواست، هر کارشناس) پایین */
      main = (fresh ? `<div class="smblock fresh"><div class="smhead"><span class="chip ok">🆕 نتیجهٔ جستجوی تازه</span><b>${M(count(fresh))} تأمین‌کننده</b><span class="dim">${meta(fresh)}</span></div>${smartTable(it, fresh)}</div>` : "")
        + (older.length ? `<div class="smprev-title">${fresh ? "نتایج جستجوهای قبلی" : "نتایج جستجوهای قبلی این قلم — پیش از اجرای جستجوی تازه ببینید"} <span class="dim">(${M(older.length)})</span></div>` : "")
        + older.map((x, k) => `<details class="smblock prev" data-sid="${x.search_id}" ${(S.smOpen[x.search_id] ?? k < (fresh ? 1 : 2)) ? "open" : ""}><summary class="smhead"><span class="chip">جستجوی قبلی</span><b>${M(count(x))} تأمین‌کننده</b><span class="dim">${meta(x)}</span></summary>${smartTable(it, x)}</details>`).join("");
    }
    /* ستون قیدها — مهم‌ترین قید، «بازار تأمین کالا»، یک فهرست است */
    const sm = smOf(it);
    const markets = `<div class="grp"><b>بازار تأمین کالا <span class="dim" style="font-weight:400">(حداکثر ${"۰۱۲۳۴۵۶۷۸۹"[S.maxMarkets || 3] || S.maxMarkets})</span></b>${(S.marketsMeta || []).map((x) =>
      `<label><input type="checkbox" data-smk="${x.key}" ${sm.markets.includes(x.key) ? "checked" : ""}> ${esc(x.fa)}</label>`).join("")}</div>`;
    const side = `<div class="side"><h4>قیدهای جستجو ${TP.ui.info("expert.smart", "راهنمای جستجوی هوشمند")}</h4>
      ${markets}
      <div class="grp"><b>برند موردنظر <span class="dim" style="font-weight:400">(اختیاری)</span></b>
        <input class="tp-input" data-sm="brand" value="${esc(sm.brand)}" placeholder="مثلاً Komatsu" style="width:100%"></div>
      <div class="grp"><b>مشخصات فنی <span class="dim" style="font-weight:400">(از ستون «مشخصه فنی» فایل)</span></b>
        <textarea class="tp-textarea" data-sm="specs" style="min-height:64px" placeholder="استاندارد، سایز، گرید…">${esc(sm.specs)}</textarea></div>
      <div class="grp"><b>ملاحظات <span class="dim" style="font-weight:400">(از ستون «توضیحات» فایل)</span></b>
        <textarea class="tp-textarea" data-sm="notes" style="min-height:64px" placeholder="مثلاً: ترجیحاً تولیدکننده نه واسطه">${esc(sm.notes)}</textarea></div></div>`;

    /* کشف‌شده‌ها بالا؛ نتایجِ جستجوی وب زیرش؛ ستونِ قیدها فقط وقتی جستجو باز است */
    const web = `<h4 class="dc-webh">نتایج جستجوی وب</h4>${main}`;
    return `<div class="pad">${head}${smPickNote(it)}<div class="two"><div class="main">${dcBlock(it)}${web}</div>${shut ? "" : side}</div></div>`;
  }

  /* ---------- تب استعلامات (واقعی) ---------- */
  /* ستون «پیش‌فاکتور»: فایلِ ذخیره‌شده، یا دکمهٔ بارگذاری. ردیف‌های قدیمیِ بی‌فایل هم
     باید دوباره بارگذاری شوند، چون استخراج بدون خودِ فایل کاری نمی‌تواند بکند. */
  function pfCell(q) {
    const p = pfOf(q);
    /* فاز ۴ طرح «خرید هوشمند»: Word که سامانه از فیلدهای خودِ تأمین‌کننده در پنل ساخته — فایلِ خودتان جایش می‌نشیند */
    if (p && p.storage_key && p.source === "generated") return `<span class="chip ok" title="${esc(p.filename || "")} — سامانه از فیلدهای خودِ تأمین‌کننده در پنل ساخت">پیش‌فاکتورِ سامانه</span> <button class="tp-btn xs" data-pf="${esc(q.supplier_name)}" title="جایگزینی با فایلِ خودتان">↻</button>`;
    if (p && p.storage_key) return `<span class="chip ok" title="${esc(p.filename || "")}">ثبت شد</span> <button class="tp-btn xs" data-pf="${esc(q.supplier_name)}" title="جایگزینی فایل">\u21bb</button>`;
    if (p) return `<span class="chip warn" title="فقط نامش ثبت شده بود">بی فایل</span> <button class="tp-btn xs" data-pf="${esc(q.supplier_name)}">بارگذاری</button>`;
    return `<button class="tp-btn xs" data-pf="${esc(q.supplier_name)}">بارگذاری</button>`;
  }
  /* ستون «استخراج»: همان کاری که بات روی پیش‌فاکتور تلگرام می‌کند */
  function exCell(q) {
    const p = pfOf(q);
    if (!p || !p.storage_key) return `<span class="chip">—</span>`;
    if (p.source === "generated") return `<span class="chip" title="مقدارها همان است که تأمین‌کننده در پنل ثبت کرده؛ خواندنِ سند لازم نیست">از پنل</span>`;
    const read = p.extract_state === "ok" && p.extracted_json;
    return `<button class="tp-btn xs ${read ? "" : "primary"}" data-extract="${p.id}">${read ? "دیدن خوانده‌شده" : "استخراج"}</button>`
      + (p.extract_state === "refused" ? `<div><span class="chip warn">خوانا نبود</span></div>` : "")
      + (p.extract_state === "failed" ? `<div><span class="chip warn">ناموفق</span></div>` : "");
  }

  /* ---------- بارگذاری و استخراج پیش‌فاکتور ---------- */
  const REFUSAL_FA = { handwritten: "دست‌نویس است", low_quality_scan: "کیفیت اسکن پایین است", unclear_structure: "ساختارش روشن نیست", not_a_proforma: "پیش‌فاکتور نیست", password_protected: "فایل رمز دارد", empty: "خالی است" };

  /* بدنهٔ خام می‌رود، پس TP.api (که JSON می‌فرستد) به کار نمی‌آید */
  async function uploadProforma(supplier, file) {
    const qs = `?assignment_id=${A().id}&supplier_name=${encodeURIComponent(supplier)}&filename=${encodeURIComponent(file.name)}`;
    const res = await fetch((CFG.apiBase || "/tamin-poshtibani/api") + "/proformas/upload" + qs, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream", ...TP.authHeaders() },
      body: file,
    });
    let data = null; const txt = await res.text();
    try { data = txt ? JSON.parse(txt) : null; } catch (_) { data = { error: txt.slice(0, 300) }; }
    if (!res.ok) throw new Error((data && data.error) || `خطای سرور ${res.status}`);
    return data || {};
  }

  /* همان خلاصه‌ای که بات در تلگرام نشان می‌دهد، در قالب پنل */
  function extractView(r) {
    if (!r.extractable) {
      return `<b>نتوانستم مطمئن بخوانم.</b><br><br>دلیل: <b>${esc(REFUSAL_FA[r.reason] || r.reason || "نامشخص")}</b>`
        + (r.notes ? `<br><br>${esc(r.notes)}` : "") + `<br><br>فیلدهای این ردیف را دستی پر کنید.`;
    }
    const titles = new Map(items().map((i) => [i.id, i.title]));
    const matched = (r.lines || []).filter((l) => l.matched_item_id);
    const other = (r.lines || []).filter((l) => !l.matched_item_id);
    const cur = r.currency || "نامشخص";
    const rows = matched.map((l) => `<tr><td class="rt">${esc(titles.get(l.matched_item_id) || l.title || "\u2014")}</td>
      <td class="num">${l.qty == null ? "\u2014" : M(l.qty)}</td>
      <td class="num">${l.unit_price == null ? "\u2014" : M(l.unit_price)}</td>
      <td>${l.confidence === "high" ? `<span class="chip ok">مطمئن</span>` : `<span class="chip warn">مطمئن نیست</span>`}</td></tr>`).join("");
    const line = (lab, v) => (v ? `<div><span class="dim">${lab}:</span> ${esc(v)}</div>` : "");
    return (r.orientation && r.orientation !== "upright" ? `<div><span class="chip warn">اسکن چرخیده بود</span></div>` : "")
      + `<div>${r.supplier_name ? `<span class="dim">تأمین‌کننده:</span> <b>${esc(r.supplier_name)}</b> \u00b7 ` : ""}<span class="dim">واحد پول:</span> <b>${esc(cur)}</b></div>`
      + (matched.length ? `<table class="tp-table" style="margin-top:10px"><thead><tr><th>قلم</th><th>مقدار</th><th>قیمت واحد</th><th>اطمینان</th></tr></thead><tbody>${rows}</tbody></table>`
        : `<div style="margin-top:10px"><b>هیچ سطری با اقلام این درخواست تطبیق نخورد.</b></div>`)
      + (other.length ? `<div class="dim" style="margin-top:6px">${M(other.length)} سطر دیگر در فاکتور بود که به اقلام این درخواست نمی‌خورد و ثبت نمی‌شود.</div>` : "")
      + `<div style="margin-top:10px">${line("اعتبار", r.valid_days ? r.valid_days + " روز" : "")}${line("تحویل", r.delivery_date)}${line("تسویه", r.pay_terms)}${line("حمل", r.ship_method)}${line("نوع فاکتور", r.invoice_type)}${line("محل تحویل", r.place === "سایر" && r.place_other ? r.place_other : r.place)}</div>`
      + ((r.unreadable_fields || []).length ? `<div style="margin-top:8px"><span class="chip warn">خوانا نبود</span> ${esc(r.unreadable_fields.join("، "))}</div>` : "")
      + (r.notes ? `<div class="dim" style="margin-top:8px">${esc(r.notes)}</div>` : "")
      + (r.currency ? "" : `<div style="margin-top:12px"><b>واحد پول در سند مشخص نبود.</b> خودتان انتخاب کنید:
          <select class="tp-select" data-ex-cur style="margin-inline-start:8px"><option value="ریال">ریال</option><option value="تومان">تومان</option></select></div>`);
  }

  /* خواندن (یا نمایش خوانده‌شدهٔ قبلی) و بعد ثبت در جدول استعلام */
  async function showExtract(pid, reread) {
    const p = S.d.proformas.find((x) => x.id === +pid);
    let out = null;
    if (!reread && p && p.extract_state === "ok" && p.extracted_json) {
      try { out = JSON.parse(p.extracted_json); } catch (_) { out = null; }
    }
    if (!out) {
      const busy = TP.busy("خواندن پیش‌فاکتور", "مدل دارد سند را می‌خواند؛ چند ثانیه طول می‌کشد\u2026");
      try { out = await TP.api(`/proformas/${pid}/extract`, { body: {} }); }
      catch (e) { busy.close(); return TP.modal("استخراج انجام نشد", esc(e.message), null, "باشد", ""); }
      busy.close();
      if (out.available === false) return TP.modal("استخراج", esc(out.message || "هنوز وصل نیست."), null, "باشد", "");
      await reload();
    }
    const r = out.result || out;
    const d = TP.modal("خوانده\u200cشده از پیش‌فاکتور", extractView(r), r.extractable ? async () => {
      const cur = d.querySelector("[data-ex-cur]");
      const busy = TP.busy("ثبت در جدول استعلام", "\u2026");
      try {
        const res = await TP.api(`/proformas/${pid}/apply`, { body: cur ? { currency: cur.value } : {} });
        busy.close();
        await reload();
        TP.modal("ثبت شد", `${M(res.applied || 0)} خط پر شد${res.created ? ` (${M(res.created)} خط تازه ساخته شد)` : ""}.`
          + (res.saved ? `<br>${M(res.saved)} خط «ثبت موقت» شد.` : "")
          + (res.unsaved ? `<br><span class="chip warn">${M(res.unsaved)} خط هنوز فیلدِ اجباریِ خالی یا نادرست دارد</span>${(res.missing || []).length ? `: ${esc(res.missing.map((f) => LBL[f] || f).join("، "))}` : ""}` : "")
          + (res.vatStripped ? `<br>ارزش افزوده از قیمت‌ها کم شد.` : "")
          + `<br><br>عددها را با خود سند بسنجید؛ این‌ها پیش‌نویس‌اند.`, null, "باشد", "");
      } catch (e) { busy.close(); TP.modal("ثبت نشد", esc(e.message), null, "باشد", ""); }
    } : null, r.extractable ? "ثبت در جدول استعلام" : "باشد", "بستن");
    if (r.extractable) {
      const again = document.createElement("button");
      again.className = "tp-btn"; again.textContent = "دوباره بخوان";
      again.onclick = () => { d.remove(); showExtract(pid, true); };
      d.querySelector(".tp-acts").appendChild(again);
    }
  }

  /* خانهٔ فقط‌خواندنیِ خط استعلام: خطی که کارشناس هوشمند همین حالا رویش مذاکره می‌کند (و ارجاعِ تیم برای کارشناس ارشد). خانهٔ اجباریِ خالی با نشان قرمز. */
  function roCell(v, need, opts) {
    const o = opts || {};
    const empty = v == null || v === "";
    const txt = empty ? "—" : o.money ? M(Number(v)) : esc(v);
    return `<td class="ro${o.num ? " num" : ""}${need && empty ? " miss" : ""}"${o.w ? ` style="min-width:${o.w}px"` : ""}${need && empty ? ' title="اجباری — هنوز خالی است"' : ""}>${txt}${o.src || ""}</td>`;
  }
  /* «منبعِ هر خانه» (worker/quote-src.js): نشانِ کوچکِ کنارِ مقدار؛ مقدارِ دستی‌ای که جای مقدارِ یک منبعِ بیرونی نشسته، مقدار و منبعِ قبلی را در title نشان می‌دهد */
  const SRC_ICO = { manual: "✋", manual_tg: "✋", bundle: "📦", bundle_ai: "🤖", pf: "📄", pf_off: "🧾", tender: "🏷", company: "🏢", req: "", def: "" };
  const SRC_EXT = ["bundle", "bundle_ai", "pf", "pf_off", "tender"];
  function srcTag(q, k) {
    const x = q.src && q.src[k];
    if (!x || !SRC_ICO[x.s]) return "";
    const tip = `${x.fa}${x.at ? ` · ${TP.fmt(x.at)}` : ""}${x.prev ? ` — پیش‌تر: ${x.prev.v} (${x.prev.fa})` : ""}`;
    return `<i class="qsrc s-${x.s}" title="${esc(tip)}" aria-label="${esc(tip)}">${SRC_ICO[x.s]}</i>`;
  }
  /* خطِ استعلام دستی پر و ویرایش می‌شود (درخواست مالک، مهر ۱۴۰۵)، جز خطی که کارشناس هوشمند همین حالا رویش مذاکره می‌کند؛ سرور هم
     همین را می‌سنجد (api.js:quoteUpdate). جایگزینیِ مقدارِ تأمین‌کننده، خوانشِ پیش‌فاکتور یا مناقصه علت می‌خواهد */
  const qEditable = (q) => !q.ai_live && !!A() && !!S.expert && A().expert_id === S.expert.id;
  /** خانهٔ ویرایش‌پذیر: اجباریِ خالی لبهٔ قرمز دارد و با Enter یا رفتن از خانه ذخیره می‌شود؛ زمان تحویل تایپ‌شدنی است («۱۰ روز کاری»
      یا تاریخ) و 📅 تقویم را باز می‌کند */
  function edCell(q, k, w, ty, opt) {
    const v = q[k] == null ? "" : String(q[k]);
    const inp = `<input class="tp-input${!opt && !v ? " bad" : ""}${ty === "num" ? " num" : ""}" data-qf="${q.id}|${k}"${opt ? ' data-opt="1"' : ""} value="${esc(v)}" style="width:${w}px"${ty === "num" ? ' inputmode="decimal"' : ""}${ty === "date" ? ' placeholder="۱۰ روز کاری" title="عدد روز (۱۰ یا ۱۰ روز کاری) یا تاریخ شمسی — 📅 تقویم"' : ""} aria-label="${esc(LBL[k] || k)}">`;
    return `<td class="ed">${ty === "date" ? `<span class="qdt">${inp}<button type="button" class="tp-btn xs" data-qdt="${q.id}" title="انتخاب تاریخ از تقویم" aria-label="تقویمِ زمان تحویل">📅</button></span>` : inp}${srcTag(q, k)}</td>`;
  }
  /** فهرستیِ ویرایش‌پذیر — مقدارِ بیرون از فهرست (مثلاً متنِ خامِ تسویه از خواندنِ پیش‌فاکتور) دیده می‌شود و قرمز است تا گزینهٔ درست را بزنید */
  function edSel(q, k, list, need, title) {
    const v = q[k] == null ? "" : String(q[k]), odd = !!v && !list.includes(v);
    return `<select class="tp-select${(need && !v) || odd ? " bad" : ""}" data-qf="${q.id}|${k}"${title ? ` title="${title}"` : ""} aria-label="${esc(LBL[k] || k)}"><option value="">—</option>${odd ? `<option selected>${esc(v)}</option>` : ""}${list.map((x) => `<option ${v === x ? "selected" : ""}>${x}</option>`).join("")}</select>${srcTag(q, k)}`;
  }
  function edTerms(q) {
    return `<td class="ed">${edSel(q, "invoice", INVT, true)}</td><td class="ed">${edSel(q, "pay", PAYS, true)}</td>
      <td class="ed">${edSel(q, "vat", VATS, true, "اجباری — قیمتِ ردیف بدون ارزش افزوده است؛ ارزش افزوده ته جدول کمیسیون جدا حساب می‌شود")}</td>
      <td class="ed">${edSel(q, "deal", DEALS, false, "اختیاری — تصمیم داخلی؛ از پیش‌فاکتور خوانده نمی‌شود")}</td>
      <td class="ed" style="min-width:170px"><div class="stack">${edSel(q, "place", PLACES, false, "اختیاری")}${q.place === "سایر" ? `<input class="tp-input${q.place_other ? "" : " bad"}" data-qf="${q.id}|place_other" value="${esc(q.place_other || "")}" placeholder="محل را بنویسید" title="${esc(q.place_other || "")}" aria-label="${LBL.place_other}">` : ""}</div></td>`;
  }
  /* «قیمتِ نقدی و اعتباری» (quotes.prices_json): زیرِ قیمت کل، قیمت‌های واحدِ هر شیوهٔ پرداخت با درصدِ افزایش نسبت به نقد */
  function qPrices(q) {
    let p = null;
    try { p = q.prices_json ? JSON.parse(q.prices_json) : null; } catch { p = null; }
    if (!p || typeof p !== "object") return "";
    const rows = [Number(p.cash) > 0 ? `💵 نقد ${M(Number(p.cash))}` : null,
      ...[1, 2].map((m) => (Number(p[`c${m}`]) > 0 ? `💳 ${M(m)} ماهه ${M(Number(p[`c${m}`]))}${p[`r${m}`] != null && Number.isFinite(Number(p[`r${m}`])) ? ` (+${M(Number(p[`r${m}`]))}٪)` : ""}` : null))].filter(Boolean);
    return rows.length ? `<div class="qpr" title="قیمتِ واحدِ هر شیوهٔ پرداخت (ریال، بی ارزش افزوده)">${rows.map((x) => `<span>${x}</span>`).join("")}</div>` : "";
  }
  function vQuotes() {
    const r = S.d.request, its = items(), Q = S.d.quotes;
    const itemTitle = (id) => { const x = its.find((i) => i.id === id); return x ? x.title : ""; };
    const ro = (q) => QF.map(([k, , w, ty, opt]) => roCell(q[k], !opt, { w, num: ty === "num", money: k === "price" || k === "qty", src: srcTag(q, k) })).join("")
      + `${roCell(q.invoice, true, { src: srcTag(q, "invoice") })}${roCell(q.pay, true, { src: srcTag(q, "pay") })}${roCell(q.vat, true, { src: srcTag(q, "vat") })}${roCell(q.deal, false, { src: srcTag(q, "deal") })}${roCell(q.place === "سایر" && q.place_other ? `سایر: ${q.place_other}` : q.place, false, { src: srcTag(q, "place") })}`;
    return `<div class="pad">
      <div class="toolrow"><button class="tp-btn" data-add-row>افزودن تأمین‌کننده</button>
        <span class="chip">${qCount()} استعلام ثبت‌شده</span><span class="chip">${pCount()} پیش‌فاکتور</span>
        <span class="dim" style="font-size:.85rem">${TP.ui.info("expert.quotes", "راهنمای استعلامات")}</span></div>
      ${Q.length ? `<div class="qsrc-legend" aria-label="منبعِ خانه‌ها"><span><i class="qsrc s-manual">✋</i> دستی</span><span><i class="qsrc s-bundle_ai">🤖</i> بستهٔ مذاکرهٔ هوشمند</span><span><i class="qsrc s-bundle">📦</i> بستهٔ پنلِ تأمین‌کننده</span><span><i class="qsrc s-pf">📄</i> خوانشِ پیش‌فاکتور</span><span><i class="qsrc s-pf_off">🧾</i> پیش‌فاکتورِ رسمی</span><span><i class="qsrc s-tender">🏷</i> مناقصه</span><span><i class="qsrc s-company">🏢</i> شرطِ شرکت</span></div>
        <div class="tp-scroll" data-keep-scroll style="max-height:56vh"><table class="tp-table q"><thead><tr>
        <th${manualA() ? ' title="اختیاری: بی تیک، همهٔ «ثبت موقت»ها به جدول کمیسیون می‌روند؛ اگر برای قلمی تیک بزنید، فقط تیک‌خورده‌های همان قلم"' : ""}>تأیید نهایی${manualA() ? OPTL : ""}</th><th class="rt">تأمین‌کننده</th><th>قلم</th>${QF.map((f) => `<th>${f[1]}${f[4] ? OPTL : ""}</th>`).join("")}<th>نوع فاکتور</th><th>شرایط تسویه</th><th>ارزش افزوده</th><th>محل معامله${OPTL}</th><th>محل تحویل${OPTL}</th><th>قیمت کل</th><th>پیش‌فاکتور</th><th>استخراج</th><th>ثبت موقت</th><th></th></tr></thead><tbody>
        ${Q.map((q) => { const ed = qEditable(q); return `<tr>
          <td><input type="checkbox" data-fin="${q.id}" ${q.final ? "checked" : ""} ${q.ai ? "disabled title=\"خطِ کارشناس هوشمند — تأیید نهایی‌اش با خودِ اوست\"" : ""}></td>
          <td class="rt">${esc(q.supplier_name)}${ed ? `<input class="tp-input qcode num" data-qf="${q.id}|supplier_code" data-opt="1" value="${esc(q.supplier_code || "")}" placeholder="کد (اختیاری)" title="کد تأمین‌کننده — برای همهٔ خط‌های همین تأمین‌کننده" aria-label="کد تأمین‌کننده">` : q.supplier_code ? `<div class="dim num" style="font-size:.75rem">${esc(q.supplier_code)}</div>` : ""}${q.origin === "supplier" ? `<div><span class="chip ok" title="از پنل تأمین‌کننده، با تأیید نهایی کارشناس">پنل تأمین‌کننده</span></div>` : q.origin === "tender" ? `<div><span class="chip" title="از مناقصهٔ آنلاین">مناقصه</span></div>` : ""}${q.ai_live ? `<div><span class="chip info" title="کارشناس هوشمند همین حالا با این تأمین‌کننده مذاکره می‌کند؛ تا پایانِ مذاکره یا «🚨 باز کردن» دستی عوض نمی‌شود">🤖 در حالِ مذاکره</span></div>` : q.ai ? `<div><span class="chip info" title="کارشناس هوشمند ساخته؛ مذاکره‌اش تمام شده و خانه‌ها دستی هم ویرایش می‌شوند">🤖 کارشناس هوشمند</span></div>` : aiMode() ? `<div><span class="chip warn" title="خطِ دستیِ خودِ کارشناس">✋ دستی</span></div>` : ""}</td>
          <td class="ro item">${esc(itemTitle(q.item_id))}</td>
          ${ed ? QF.map(([k, , w, ty, opt]) => edCell(q, k, w, ty, opt)).join("") + edTerms(q) : ro(q)}
          <td class="num"><span data-qtot="${q.id}">${(Number(q.qty) || 0) * (Number(q.price) || 0) ? M((Number(q.qty) || 0) * (Number(q.price) || 0)) : "—"}</span>${qPrices(q)}</td>
          <td>${q.ai ? `<span class="dim">🤖</span>` : pfCell(q)}</td>
          <td>${q.ai ? `<span class="dim">🤖</span>` : exCell(q)}</td>
          <td>${q.saved ? `<span class="chip ok">ثبت شد</span>` : q.ai_live ? `<span class="dim">—</span>` : `<button class="tp-btn xs primary" data-save="${q.id}">ثبت موقت</button>`}${q.low_conf ? `<div><span class="chip warn">کم‌اطمینان</span></div>` : ""}</td>
          <td>${q.ai ? "" : `<button class="tp-btn xs danger" data-del="${q.id}">حذف</button>`}</td></tr>`; }).join("")}
        </tbody></table></div>
        ${vFormHead(r)}${vGuard()}`
        : `<div class="empty"><b>هنوز استعلامی نیست.</b>با «افزودن تأمین‌کننده» شروع کنید، یا از «💬 مکاتبات» استعلام بفرستید. ${TP.ui.info("expert.quotes", "راهنمای استعلامات")}</div>`}</div>`;
  }
  /* ---------- ویرایشِ خانه‌به‌خانهٔ خطِ استعلام ---------- */
  /* نوشتن‌های تب استعلامات پشتِ هم می‌روند: پاسخِ دیرتر خانهٔ تازه‌تری را با مقدارِ کهنه نمی‌پوشاند و «ثبت موقت» بعد از ذخیرهٔ
     خانه‌ای می‌رسد که کارشناس همان لحظه از آن بیرون آمد */
  let qChain = Promise.resolve();
  const qSeq = (fn) => (qChain = qChain.then(fn).catch(() => { /* هر کار خطای خودش را نشان می‌دهد */ }));
  /* عددِ خانهٔ مقدار و قیمت با هر رقم و جداکننده (همان quote-rules.js:toNumber) — برای «قیمت کل»ِ زنده حینِ تایپ */
  const numOf = (s) => { const x = TP.digits(s).replace(/[,٬]/g, "").replace(/٫/g, ".").trim(); return /^\d+(\.\d+)?$/.test(x) ? Number(x) : 0; };
  function liveTotal(id) {
    const qn = document.querySelector(`[data-qf="${id}|qty"]`), pr = document.querySelector(`[data-qf="${id}|price"]`), cell = document.querySelector(`[data-qtot="${id}"]`);
    if (!qn || !pr || !cell) return;
    const v = numOf(qn.value) * numOf(pr.value);
    cell.textContent = v ? M(v) : "—";
  }
  /* علتِ جایگزینیِ دستیِ مقدارِ یک منبعِ بیرونی — با «انصراف» مقدارِ قبلی برمی‌گردد */
  function askReason(q, f) {
    const x = q.src && q.src[f];
    return new Promise((res) => {
      const d = TP.modal("✋ جایگزینیِ دستی", `<p style="margin-top:0">«${esc(LBL[f] || f)}»ِ «${esc(q.supplier_name)}» از <b>${esc(x ? x.fa : "منبعی بیرونی")}</b> آمده (${esc(String(q[f]))}). مقدارِ تازه جایش می‌نشیند و مقدارِ قبلی در سابقه می‌ماند.</p>
        <label class="tp-field"><b>علت (اجباری)</b><input class="tp-input" id="qreason" style="width:100%" placeholder="مثلاً: تخفیفِ تلفنی، نامه دارد"></label>`, () => res((d.querySelector("#qreason").value || "").trim()), "ذخیره", "انصراف");
      const n = d.querySelector("[data-n]"); if (n) n.addEventListener("click", () => res(null));
      d.addEventListener("click", (e) => { if (e.target === d) res(null); });
      setTimeout(() => { const i = d.querySelector("#qreason"); if (i) i.focus(); }, 30);
    });
  }
  /* یک خانه: قالب (همان قاعدهٔ سرور، TP.quoteFieldError) ← اگر جای مقدارِ بیرونی می‌نشیند علت ← PUT ← جایگزینیِ خط‌های همان تأمین‌کننده
     از پاسخ (شرایطِ فاکتور روی خط‌های دیگرِ او هم نشسته). قالبِ نادرست ذخیره نمی‌شود و خانه قرمز می‌ماند */
  async function saveField(el, id, f) {
    const q = S.d && S.d.quotes.find((x) => x.id === id); if (!q) return;
    const v = el.value.trim();
    if (String(q[f] == null ? "" : q[f]) === v) return;
    const bad = TP.quoteFieldError(f, v);
    if (bad) { el.classList.add("bad"); TP.modal("قالب فیلد درست نیست", esc(bad), null, "باشد", ""); return; }
    const body = { [f]: v };
    const x = q.src && q.src[f];
    if (x && SRC_EXT.includes(x.s) && String(q[f] == null ? "" : q[f]) !== "") {
      const why = await askReason(q, f);
      if (!why || why.length < 3) { el.value = q[f] == null ? "" : String(q[f]); if (f === "qty" || f === "price") liveTotal(id); return; }
      body.reason = why;
    }
    try { patchQuotes(await TP.api(`/quotes/${id}`, { method: "PUT", body }), `${id}|${f}`); }
    catch (e) { el.classList.add("bad"); TP.modal("ذخیره نشد", esc(e.message), null, "باشد", ""); }
  }
  /* پاسخِ PUT /quotes/:id همهٔ خط‌های همان تأمین‌کننده را دارد — همان‌ها در جدول می‌نشینند، بی بازخوانیِ کلِ درخواست */
  function patchQuotes(r, doneKey) {
    if (!S.d || S.screen !== "detail") return;
    if (!r || !Array.isArray(r.quotes)) { reload(); return; }
    for (const x of r.quotes) { const q = S.d.quotes.find((y) => y.id === x.id); if (q) Object.assign(q, x); }
    S.sheets = null;   /* پیش‌نمایشِ جدول کمیسیون با مقدارهای تازه از نو ساخته شود */
    renderKeep(doneKey);
  }
  /* بازرندر بی آنکه فوکوس و نوشتهٔ نیمه‌کارهٔ خانه‌ای که کارشناس با Tab به آن رفته گم شود؛ خانهٔ تازه‌ذخیره‌شده مقدارِ سرور را می‌گیرد */
  function renderKeep(doneKey) {
    const f = document.activeElement, key = f && f.dataset ? f.dataset.qf : null;
    const typed = key && key !== doneKey && f.tagName !== "SELECT" ? f.value : null;
    let pos = null; try { pos = key ? f.selectionStart : null; } catch (_) { /* غیرمتنی */ }
    render();
    const n = key ? document.querySelector(`[data-qf="${CSS.escape(key)}"]`) : null;
    if (!n) return;
    if (typed != null && n.value !== typed) {
      n.value = typed; if (!n.dataset.opt) n.classList.toggle("bad", !typed.trim());
      const [id, k] = key.split("|"); if (k === "qty" || k === "price") liveTotal(id);
    }
    n.focus();
    if (pos != null) try { n.setSelectionRange(pos, pos); } catch (_) { /* غیرمتنی */ }
  }
  function vFormHead(r) {
    return `<div class="endbar" style="margin:16px 0 0;align-items:flex-end">
      <div class="tp-field"><b>نوع درخواست</b><select class="tp-select" data-h="req_type">${REQT.map((x) => `<option ${(r.head_req_type || "عادی") === x ? "selected" : ""}>${x}</option>`).join("")}</select></div>
      <div class="tp-field"><b>نوع معامله</b><select class="tp-select" data-h="deal_type">${DEALT.map((x) => `<option ${(r.head_deal_type || "خرید") === x ? "selected" : ""}>${x}</option>`).join("")}</select></div>
      <div class="tp-field" style="flex:1;min-width:240px"><b>محل پروژه</b><input class="tp-input" data-h="site" value="${esc(r.head_site == null ? r.party : r.head_site)}" style="width:100%"></div></div>`;
  }
  /* حداقلِ استعلامِ هر قلم: ردهٔ اندازهٔ همان قلم (مهر ۱۴۰۵؛ worker/size.js، ai-rules.js) — حدِ سرور، و اگر استعلامِ تازه‌ای که هنوز
     بارگذاری نشده پیشنهادِ کلِ بزرگ‌تری دارد، ردهٔ همان (همان قاعدهٔ نگهبانِ «تولید جدول»)؛ تأمین‌کنندگانِ مختلف شمرده می‌شوند */
  const SZ_FA = { s: "جزئی", m: "متوسط", l: "بزرگ", b: "عمده" };
  function localNeed(it) {
    const sr = settings().sizeRules || { th: [50e6, 200e6, 5e9], minQ: { s: 3, m: 5, l: 5, b: 7 } };
    const tots = S.d.quotes.filter((q) => q.saved && q.item_id === it.id && +q.price > 0).map((q) => +q.price * (+q.qty > 0 ? +q.qty : +it.qty || 0)).filter((x) => x > 0);
    if (!tots.length) return null;
    const t = Math.max(...tots) / 10, cat = t <= sr.th[0] ? "s" : t <= sr.th[1] ? "m" : t <= sr.th[2] ? "l" : "b";
    return { need: sr.minQ[cat], cat };
  }
  function guardCheck() {
    const N = S.d.need || {}, need = N.base || 3, by = N.items || {}, miss = [];
    openItems().forEach((it) => {
      const n = new Set(S.d.quotes.filter((q) => q.saved && q.item_id === it.id).map((q) => TP.nrm(q.supplier_name))).size, x = by[it.id] || {}, L = localNeed(it);
      const k = Math.max(x.need || need, L ? L.need : 0), cat = L && L.need > (x.need || 0) ? L.cat : x.cat || "s";
      if (n < k) miss.push({ t: it.title, n, k, cat, why: x.why || "" });
    });
    return { miss, need, ruled: Object.values(by).some((x) => x.ruled), fin: S.d.quotes.filter((q) => q.final && q.saved).length };
  }
  /* «📨 فراخوانِ پیش‌فاکتورِ رسمی» و «📦 بستهٔ کمیسیون» (worker/final-call.js): پیش از جدول کمیسیون، پیامک به تأمین‌کنندگانِ تأییدنهایی و
     فرصتِ پیش‌فاکتورِ رسمی؛ جدول بعد از بسته شدنِ بسته. درخواستی که پیش از این روال جدول گرفته (legacy) همان‌طور که بود */
  const fcOf = () => (S.d && S.d.final_call) || null;
  const fcBlocks = () => { const f = fcOf(); return !!(f && f.on && !f.legacy && !(f.call && f.call.state === "closed")); };
  const hoursLeft = (ms) => { const m = Math.max(0, Math.round((ms - Date.now()) / 60000)); return m >= 60 ? `${M(Math.floor(m / 60))} ساعت${m % 60 ? ` و ${M(m % 60)} دقیقه` : ""}` : `${M(m)} دقیقه`; };
  function vFinalCall(ok) {
    const f = fcOf();
    if (!f || f.legacy || (!f.on && !f.call)) return "";
    const c = f.call;
    if (!c) {
      return `<div class="fc-card"><div class="fc-h"><b>📨 فراخوانِ پیش‌فاکتورِ رسمی</b><span class="dim">پیش از جدول کمیسیون — ${M(f.cfg.window_h)} ساعت فرصت</span>${TP.ui.info("expert.finalcall", "راهنمای فراخوان")}</div>
        ${aiEnd() ? `<div class="dim">🤖 کارشناس هوشمند در پایانِ کار خودش می‌زند.</div>` : `<button class="tp-btn primary" data-fc-start ${ok ? "" : "disabled"}>📨 فراخوانِ پیش‌فاکتورِ رسمی</button>`}</div>`;
    }
    const open = c.state === "open";
    const rows = f.sups.map((s) => {
      const st = open ? (s.status === "valid" ? `<span class="chip ok">✅ معتبر${s.valid_to ? ` تا ${esc(TP.fmt(s.valid_to))}` : ""}</span>` : `<span class="chip warn">${esc(s.status_fa)}</span>`)
        : `<span class="chip ${s.final === "ok" ? "ok" : s.final === "short" ? "warn" : ""}">${esc(s.final_fa || "—")}</span>`;
      const sms = s.sms === "no_phone" ? `<span class="chip warn">☎️ شماره ندارد</span>` : s.sms_fa ? `<span class="dim">${esc(s.sms_fa)}${s.sms_at ? ` · ${esc(TP.fmt(s.sms_at))}` : ""}</span>` : "—";
      const act = !open || s.status === "valid" ? "" : `${s.sms === "no_phone" || !s.thread_id ? `<button class="tp-btn xs" data-fc-phone="${esc(s.name)}">📱 شماره</button>` : `<button class="tp-btn xs" data-fc-sms="${esc(s.name)}" title="همان پیامک، با رمزِ تازه">🔁 پیامک</button>`}
        <button class="tp-btn xs" data-fc-up="${esc(s.name)}" title="پیش‌فاکتورِ رسمیِ همین تأمین‌کننده را خودتان بارگذاری کنید (همان سنجش)">📎 بارگذاری</button>`;
      const file = s.offpf_id ? `<button class="tp-btn xs" data-fc-file="${s.offpf_id}" title="دیدنِ پیش‌فاکتورِ رسمیِ ثبت‌شده">🧾 سند</button>` : "";
      return `<tr><td class="num">${esc(s.offer_no)}</td><td class="rt">${esc(s.name)}${s.revised ? ` <span class="chip info" title="قیمت با پیش‌فاکتورِ رسمی عوض شد">✏️ نهایی</span>` : ""}</td><td>${st}</td><td>${sms}</td><td class="fc-act">${file}${act}</td></tr>`;
    }).join("");
    const head = open ? `<b>📨 فراخوانِ پیش‌فاکتورِ رسمی</b><span class="chip info">تا ${esc(TP.fmt(c.deadline_at))} — ${hoursLeft(c.deadline_at)} مانده</span>`
      : `<b>📦 بستهٔ کمیسیون بسته شد</b><span class="dim">${esc(TP.fmt(c.closed_at || c.deadline_at))}${c.close_why === "all" ? " — همه پیش‌فاکتورِ معتبر داشتند" : c.close_why === "early" ? " — پایانِ زودهنگام" : ""}</span>`;
    return `<div class="fc-card"><div class="fc-h">${head}${TP.ui.info("expert.finalcall", "راهنمای فراخوان")}
        ${open && c.mode !== "ai" ? `<span style="margin-inline-start:auto"></span><button class="tp-btn xs danger" data-fc-close title="بسته همین حالا بسته شود؛ تأمین‌کننده‌ای که هنوز پیش‌فاکتور نفرستاده بی آن به کمیسیون می‌رود">⏹ پایانِ زودهنگام</button>` : ""}</div>
      <div class="tp-scroll"><table class="tp-table fc-tbl"><thead><tr><th>شمارهٔ پیشنهاد</th><th class="rt">تأمین‌کننده</th><th>${open ? "وضعیت" : "هنگامِ ورود"}</th><th>پیامک</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }
  /** بارگذاریِ خام (TP.api فقط JSON می‌فرستد) */
  async function uploadRaw(path, file) {
    const res = await fetch((CFG.apiBase || "/tamin-poshtibani/api") + path, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream", ...TP.authHeaders() }, body: file });
    let data = null; const txt = await res.text();
    try { data = txt ? JSON.parse(txt) : null; } catch (_) { data = { error: txt.slice(0, 300) }; }
    if (!res.ok) throw new Error((data && data.error) || `خطای سرور ${res.status}`);
    return data || {};
  }
  /** حکمِ پیش‌فاکتورِ رسمی (همان سنجشِ پنلِ تأمین‌کننده): مانع‌ها، «جایگزین شود؟» یا «✅ ثبت» */
  function fcVerdict(r, decide) {
    const li = (xs) => xs.map((x) => `<li>${esc(x.msg)}</li>`).join("");
    if (r.state === "blocked") { TP.modal("🧾 پیش‌فاکتورِ رسمی پذیرفته نیست", `<ul class="fc-ul">${li(r.block)}</ul><div class="dim">پیش‌فاکتورِ دیگری لازم است.</div>`, null, "باشد", ""); return; }
    const body = r.state === "ask" ? `<p style="margin-top:0">سند با پیشنهادِ قبلی فرق دارد — جایگزین شود؟ (مقدارِ قبلی در سابقه می‌ماند)</p><ul class="fc-ul">${li(r.ask)}</ul>` : `<p style="margin-top:0">✅ سند با پیشنهاد می‌خواند${r.valid_to ? ` — معتبر تا ${esc(TP.fmt(r.valid_to))}` : ""}.</p>`;
    const d = TP.modal("🧾 پیش‌فاکتورِ رسمی", body + (r.info && r.info.length ? `<div class="dim" style="font-size:.8rem">${r.info.map((x) => esc(x.msg)).join("<br>")}</div>` : ""), () => decide(true), r.state === "ask" ? "✅ جایگزین شود و ثبت" : "✅ ثبت", r.state === "ask" ? "✖ نه" : "انصراف");
    if (r.state === "ask") { const n = d.querySelector("[data-n]"); if (n) n.addEventListener("click", () => decide(false)); }
  }
  /* درخواستِ دستی (آبان ۱۴۰۵، خواستهٔ مالک): رسیدن به حداقلِ «ثبت موقت» کافی است؛ «تأیید نهایی» اختیاری است و اگر برای قلمی بخورد فقط
     تیک‌خورده‌های همان قلم به جدول می‌روند (worker/sheets.js:commissionData) */
  const manualA = () => !(S.d && S.d.ai && S.d.ai.req);
  function vGuard() {
    const g = guardCheck(), ok = !g.miss.length && (g.fin > 0 || manualA());
    const fc = vFinalCall(ok), block = fcBlocks();
    if (aiEnd()) return `<div class="tp-status" style="margin-top:14px"><b>🤖 جدول کمیسیون با کارشناس هوشمند</b><span class="sp">در پایانِ کار، با خط‌های تأییدنهایی‌شده — از جمله خط‌های دستیِ شما.</span>${TP.ui.info("expert.ai")}</div>${fc}`;
    return `${fc}<div class="toolrow" style="margin-top:14px;align-items:flex-start"><button class="tp-btn ${block ? "" : "primary"}" data-make-comm ${ok && !block ? "" : "disabled"}${block ? ' title="بعد از بسته شدنِ «📦 بستهٔ کمیسیون»"' : ""}>تولید جدول کمیسیون</button>
      <div style="font-size:.9rem">${g.fin || manualA() ? "" : `<div style="color:#fca5a5">حداقل یک استعلام باید تیک «تأیید نهایی» بخورد.</div>`}
      ${g.miss.length ? `<div style="color:#fca5a5">این اقلام هنوز به حداقلِ استعلامِ ردهٔ خود نرسیده‌اند؛ استعلامِ بیشتر بگیرید ${TP.ui.info("expert.quotes", "راهنمای حداقل استعلام")}</div><div class="muted">${g.miss.map((m) => `• ${esc(m.t)} (ردهٔ «${SZ_FA[m.cat] || "جزئی"}»: ${m.n} از ${m.k})${m.why ? ` <span class="dim" style="font-size:.8rem">— ${esc(m.why)}</span>` : ""}`).join("<br>")}</div>` : `<div style="color:#6ee7b7">همه ${openItems().length} قلم باز به حداقل استعلامشان رسیده‌اند.</div>`}</div></div>`;
  }

  /* ---------- تب جدول کمیسیون (فرم TSA-PS-FO-02) ----------
     پیش‌نمایش، دانلود و چاپ هر سه از سرور می‌آیند — از همان مدلی که فایل اکسل و Word را
     می‌سازد — تا آنچه دیده و چاپ می‌شود عیناً همان فایل‌ها باشد. */
  function commData() {
    const picked = new Set(S.d.quotes.filter((q) => q.final && q.saved).map((q) => q.item_id));
    const sup = []; S.d.quotes.filter((q) => q.saved && (q.final || (manualA() && !picked.has(q.item_id)))).forEach((q) => { let g = sup.find((x) => x.name === q.supplier_name); if (!g) { g = { name: q.supplier_name, rows: {} }; sup.push(g); } g.rows[q.item_id] = q; });
    return { sup };
  }
  const sheetsFor = () => (S.sheets && S.d && S.sheets.aid === A().id && S.sheets.at === S.d.loadedAt ? S.sheets : null);
  async function loadSheets() {
    const aid = A().id, at = S.d.loadedAt;
    S.sheets = { aid, at, loading: true };
    try {
      const [rq, cm] = await Promise.all([TP.api(`/assignments/${aid}/sheet/request?format=html`), TP.api(`/assignments/${aid}/sheet/commission?format=html`)]);
      if (S.sheets && S.sheets.aid === aid && S.sheets.at === at) S.sheets = { aid, at, rq, cm };
    } catch (err) { S.sheets = { aid, at, error: err.message }; }
    render();
  }
  function vComm() {
    const a = A(), r = S.d.request;
    if (!a.commission_at) return `<div class="pad"><div class="empty"><b>جدول کمیسیون هنوز ساخته نشده.</b>${manualA() ? "در تب استعلامات خط‌ها را «ثبت موقت» کنید؛ وقتی هر قلم به حداقلِ استعلامش رسید «تولید جدول کمیسیون» را بزنید." : "از تب استعلامات، تأمین‌کنندگان منتخب را «تأیید نهایی» کنید و «تولید جدول کمیسیون» را بزنید."}</div></div>`;
    const d = commData();
    if (!d.sup.length) return `<div class="pad"><div class="empty">هیچ استعلام تأییدنهایی‌شده‌ای نیست.</div></div>`;
    const sh = sheetsFor();
    if (!sh) loadSheets();
    const z = S.sheetZoom || 10;
    const ready = sh && sh.rq && sh.cm;
    let szc = null; try { szc = a.size_cm ? JSON.parse(a.size_cm) : null; } catch (_) { szc = null; }
    return `<div class="pad"><div class="toolrow"><b>جدول کمیسیون — درخواست <span class="num">${esc(r.id)}</span></b>${TP.ui.sizeChip(szc, true)}<span class="chip">${d.sup.length} تأمین‌کننده · ${items().filter((it) => d.sup.some((g) => g.rows[it.id])).length} از ${items().length} قلم</span>
        <span style="margin-inline-start:auto"></span>
        <button class="tp-btn sm" data-dl="commission">دانلود اکسل جدول کمیسیون</button>
        <button class="tp-btn sm" data-dl="request">دانلود Word برگهٔ درخواست خرید</button>
        <button class="tp-btn sm primary" data-print ${ready ? "" : "disabled"}>پرینت / PDF (برگه درخواست + جدول)</button></div>
      <div class="tp-note" style="display:block;margin-bottom:10px">
        <b>توضیحات تدارکات و پشتیبانی</b> <span class="dim" style="font-size:.82rem">— در خانهٔ همین نام در جدول کمیسیون چاپ می‌شود</span>${TP.ui.info("expert.comm", "راهنمای جدول کمیسیون")}
        <textarea class="tp-input" data-notes rows="3" maxlength="1500" placeholder="مثلاً: تأمین‌کنندهٔ دوم زمان تحویل بهتری داشت ولی قیمتش بالاتر است…"
          style="width:100%;margin-top:8px;resize:vertical;font-family:inherit">${esc(a.notes || "")}</textarea>
        <div style="display:flex;gap:8px;align-items:center;margin-top:6px">
          <button class="tp-btn sm primary" data-save-notes>ذخیرهٔ توضیحات</button><span class="dim" data-notes-msg style="font-size:.85rem"></span></div>
      </div>
      ${!sh || sh.loading ? `<div class="empty">در حال ساختن پیش‌نمایش برگه‌ها…</div>`
        : sh.error ? `<div class="tp-note warn">پیش‌نمایش ساخته نشد: ${esc(sh.error)}</div>`
        : `<div class="toolrow"><span class="dim" style="font-size:.85rem">بزرگ‌نمایی پیش‌نمایش</span><button class="tp-btn xs" data-zoom="-1">−</button><button class="tp-btn xs" data-zoom="1">+</button></div>
        <style>${sh.rq.css}${sh.cm.css}</style>
        <div class="sheetview" data-keep-scroll>
          <div class="sheetpage" style="--u:${(z * 0.42).toFixed(2)}px">${sh.rq.html}</div>
          <div class="sheetpage" style="font-size:${z}px">${sh.cm.html}</div></div>`}</div>`;
  }

  /* دانلود فایل از سرور با کد کارشناس — لینک مستقیم هدر احراز هویت را نمی‌فرستد */
  async function downloadSheet(kind) {
    const r = S.d.request, aid = A().id;
    const b = TP.busy("ساختن فایل…", kind === "request" ? "برگهٔ درخواست خرید (Word)" : "جدول کمیسیون (اکسل)");
    try {
      const res = await fetch(`${CFG.apiBase || "/tamin-poshtibani/api"}/assignments/${aid}/sheet/${kind}`, { headers: TP.authHeaders() });
      if (!res.ok) { let msg = `خطای سرور ${res.status}`; try { msg = (await res.json()).error || msg; } catch (_) { /* متن خام */ } throw new Error(msg); }
      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${kind === "request" ? "درخواست-خرید" : "کمیسیون"}-${r.id}.${kind === "request" ? "docx" : "xlsx"}`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 5000);
      b.close();
    } catch (err) { b.close(); TP.modal("دانلود نشد", esc(err.message), null, "باشد", ""); }
  }

  /* چاپ در iframe جدا: فقط دو برگه، هر کدام یک صفحهٔ A4 افقی. window.print خودِ صفحهٔ پنل
     (پس‌زمینهٔ تیره، جدول اسکرول‌دار) را می‌داد و برگه بریده یا خالی چاپ می‌شد. */
  function printSheets() {
    const sh = sheetsFor(); if (!sh || !sh.rq || !sh.cm) return;
    const old = document.getElementById("tp-print"); if (old) old.remove();
    const f = document.createElement("iframe"); f.id = "tp-print";
    f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    document.body.appendChild(f);
    const doc = f.contentDocument;
    doc.open();
    doc.write(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>درخواست ${esc(S.d.request.id)}</title><style>
      @page { size: A4 landscape; margin: 8mm; }
      html, body { margin: 0; background: #fff; }
      ${sh.rq.css}${sh.cm.css}
      .page { break-after: page; page-break-after: always; display: flex; justify-content: center; }
      .page:last-child { break-after: auto; page-break-after: auto; }
      .page .rqdoc { --u: 1.0144mm; }
      .page table.xsheet { font-size: min(calc(281mm / var(--wem)), calc(193mm / var(--hem))); }
    </style></head><body><div class="page">${sh.rq.html}</div><div class="page">${sh.cm.html}</div></body></html>`);
    doc.close();
    const go = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (err) { TP.modal("پرینت", esc(err.message), null, "باشد", ""); } };
    /* لوگو باید پیش از چاپ بار شده باشد */
    Promise.all([...doc.images].map((im) => (im.complete ? 0 : new Promise((ok) => { im.onload = im.onerror = ok; })))).then(() => setTimeout(go, 150));
  }

  /* ---------- تب نامهٔ پیوست کمیسیون ----------
     همان مسیری که بات تلگرام دارد، این بار در پنل: ضبط با میکروفون یا بارگذاری
     فایل صوتی ← رونویسی فارسی (ElevenLabs) ← متنِ قابل ویرایش برای تأیید ←
     انتخاب اقلامِ موضوع ← نامهٔ رسمی روی سربرگ (Word).

     جدول و وضعیت‌ها همان `letters` سرور است، پس نامه‌ای که این‌جا ساخته شود در
     تلگرام و در «تحویل» هم همان یکی است، نه یک نسخهٔ موازی. مخاطب، «موضوع»،
     سلام، «با تشکر» و امضا را سرور می‌گذارد و عددها از جدول کمیسیون می‌آیند. */
  const LT_MIN = 15, LT_MAX = 4000, LT_MAXB = 20 * 1024 * 1024;
  /* مرورگرها یک قالب صوتی مشترک ندارند: کروم webm/opus می‌دهد و سافاری mp4 */
  const REC_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  const recType = () => (window.MediaRecorder ? REC_TYPES.find((t) => { try { return MediaRecorder.isTypeSupported(t); } catch (_) { return false; } }) : null) || "";
  /* میکروفون فقط روی HTTPS (یا localhost) در دسترس است */
  const canRecord = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && recType());
  const EXT_MIME = { ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", mp3: "audio/mpeg", m4a: "audio/mp4", mp4: "audio/mp4", wav: "audio/wav", webm: "audio/webm", aac: "audio/aac", flac: "audio/flac" };
  const blobType = (b) => b.type || EXT_MIME[String(b.name || "").split(".").pop().toLowerCase()] || "audio/mpeg";
  /* همان قاعدهٔ worker/letter.js — تا موضوعی که این‌جا نشان داده می‌شود همان باشد که نوشته می‌شود */
  const subjectFa = (titles, rid) => {
    const list = [...new Set(titles.map((t) => String(t == null ? "" : t).trim()).filter(Boolean))];
    return `گزارش خرید ${list.join(" و ")}`.trim() + (rid ? `، درخواست شماره ${rid}` : "");
  };
  const LT_OPEN = ["need_voice", "transcribed", "failed"];

  const letterFor = () => (S.letter && S.d && S.letter.aid === A().id ? S.letter : null);
  /* متنِ سرور همیشه حرف آخر را می‌زند؛ پیش‌نویسِ نیمه‌تایپ‌شده با آن پاک می‌شود */
  function setLetter(l) {
    S.lt.draft = null; S.lt.draftFor = 0;
    S.letter = { ...(letterFor() || {}), aid: A().id, letter: l };
  }
  async function loadLetter() {
    const aid = A().id;
    S.letter = { aid, loading: true };
    try { const r = await TP.api(`/assignments/${aid}/letter`); if (S.letter && S.letter.aid === aid) S.letter = { aid, ...r }; }
    catch (e) { S.letter = { aid, error: e.message }; }
    render();
  }
  /* اقلامِ موضوع — پیش‌فرض همان اقلامی که در جدول کمیسیون تأیید نهایی دارند (قاعدهٔ بات) */
  function subjSel() {
    const aid = A().id;
    if (!S.lt.sel || S.lt.selAid !== aid) {
      const fin = new Set(S.d.quotes.filter((q) => q.saved && q.final).map((q) => q.item_id));
      const pick = items().filter((i) => fin.has(i.id)).map((i) => i.id);
      S.lt.sel = pick.length ? pick : items().map((i) => i.id);
      S.lt.selAid = aid;
    }
    return S.lt.sel;
  }

  /* --- ضبط --- */
  async function recStart() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = recType();
      const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      S.lt.chunks = []; S.lt.abort = false;
      mr.ondataavailable = (e) => { if (e.data && e.data.size) S.lt.chunks.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(S.lt.timer); S.lt.timer = 0;
        const secs = Math.max(1, Math.round((Date.now() - S.lt.t0) / 1000));
        const parts = S.lt.chunks, abort = S.lt.abort;
        const blob = new Blob(parts, { type: (parts[0] && parts[0].type) || type || "audio/webm" });
        S.lt.rec = null; S.lt.on = false; S.lt.chunks = []; S.lt.abort = false;
        render();
        if (!abort) sendVoice(blob, secs);
      };
      S.lt.rec = mr; S.lt.on = true; S.lt.t0 = Date.now();
      mr.start();
      render();
      /* شمارنده مستقیم روی همان span نوشته می‌شود؛ بازرندرِ هر ثانیه، کلیک و فوکوس را می‌پراند */
      S.lt.timer = setInterval(() => {
        const el = document.querySelector("[data-rec-time]"); if (!el) return;
        const s = Math.round((Date.now() - S.lt.t0) / 1000);
        el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
      }, 500);
    } catch (e) {
      TP.modal("میکروفون در دسترس نیست", `اجازهٔ میکروفون داده نشد یا مرورگر پشتیبانی نمی‌کند.<br><br><span class="dim">${esc(e.message)}</span><br><br>به‌جایش می‌توانید فایل صوتی بارگذاری کنید یا توضیحتان را تایپ کنید.`, null, "باشد", "");
    }
  }
  function recStop(abort) {
    if (!S.lt.rec) return;
    S.lt.abort = !!abort;
    try { S.lt.rec.stop(); }
    catch (_) { clearInterval(S.lt.timer); S.lt.timer = 0; S.lt.rec = null; S.lt.on = false; render(); }
  }
  function pickVoiceFile() {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "audio/*,.ogg,.m4a,.mp3,.wav,.webm";
    inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) sendVoice(f, null); };
    inp.click();
  }

  /* بدنهٔ خام می‌رود (TP.api فقط JSON می‌فرستد) — همان قاعدهٔ بارگذاری پیش‌فاکتور */
  async function uploadVoice(letterId, blob, secs) {
    const qs = `?letter_id=${letterId}${secs ? `&secs=${secs}` : ""}`;
    const res = await fetch(`${CFG.apiBase || "/tamin-poshtibani/api"}/assignments/${A().id}/letter/voice${qs}`, {
      method: "POST",
      headers: { "Content-Type": blobType(blob), ...TP.authHeaders() },
      body: blob,
    });
    let data = null; const txt = await res.text();
    try { data = txt ? JSON.parse(txt) : null; } catch (_) { data = { error: txt.slice(0, 300) }; }
    if (!res.ok) throw new Error((data && data.error) || `خطای سرور ${res.status}`);
    return data || {};
  }
  async function sendVoice(blob, secs) {
    const box = letterFor(), L = box && box.letter;
    if (!L) return;
    if (!blob || blob.size < 1200) return TP.modal("چیزی ضبط نشد", "صدایی در این فایل نبود یا ضبط خیلی کوتاه بود. دوباره تلاش کنید یا توضیحتان را تایپ کنید.", null, "باشد", "");
    if (blob.size > LT_MAXB) return TP.modal("صوت خیلی بلند است", `حجم صوت بیشتر از ${M(20)} مگابایت است؛ کوتاه‌ترش کنید.`, null, "باشد", "");
    const busy = TP.busy("در حال گوش دادن…", "صوت برای رونویسی فارسی فرستاده شد؛ چند ثانیه طول می‌کشد.");
    try {
      const r = await uploadVoice(L.id, blob, secs);
      busy.close();
      if (r.available === false) return TP.modal("تبدیل صوت به متن", esc(r.message), null, "باشد", "");
      setLetter(r.letter); render();
    } catch (e) {
      busy.close();
      await loadLetter();
      TP.modal("صوت به متن تبدیل نشد", `${esc(e.message)}<br><br>می‌توانید دوباره ضبط کنید یا همان توضیح را تایپ کنید.`, null, "باشد", "");
    }
  }

  /* --- متن و نگارش --- */
  async function letterStart() {
    try { const r = await TP.api(`/assignments/${A().id}/letter`, { body: {} }); setLetter(r.letter); render(); }
    catch (e) { TP.modal("خطا", esc(e.message), null, "باشد", ""); }
  }
  function letterCancel() {
    TP.modal("بی‌خیال نامه", "متنی که گفته‌اید کنار گذاشته می‌شود و نامه‌ای ساخته نمی‌شود. مطمئنید؟", async () => {
      try { await TP.api(`/assignments/${A().id}/letter/cancel`, { body: {} }); await loadLetter(); }
      catch (e) { TP.modal("خطا", esc(e.message), null, "باشد", ""); }
    }, "بی‌خیال");
  }
  const ltTooShort = (t) => (t.length < LT_MIN ? "کمی بیشتر توضیح بدهید تا بشود از آن نامه ساخت." : t.length > LT_MAX ? "متن خیلی بلند است؛ خلاصه‌ترش کنید." : "");
  async function letterTyped() {
    const box = document.querySelector("[data-lt-type]"); if (!box) return;
    const text = box.value.trim(), bad = ltTooShort(text);
    if (bad) return TP.modal("متن مناسب نیست", esc(bad), null, "باشد", "");
    try { const r = await TP.api(`/assignments/${A().id}/letter/transcript`, { method: "PUT", body: { letter_id: letterFor().letter.id, transcript: text } }); setLetter(r.letter); render(); }
    catch (e) { TP.modal("ثبت نشد", esc(e.message), null, "باشد", ""); }
  }
  async function letterWrite() {
    const L = letterFor().letter;
    const el = document.querySelector("[data-lt-text]");
    const text = (el ? el.value : String(L.transcript || "")).trim();
    const bad = ltTooShort(text);
    if (bad) return TP.modal("متن مناسب نیست", esc(bad), null, "باشد", "");
    const sel = subjSel();
    const titles = items().filter((i) => sel.includes(i.id)).map((i) => i.title);
    if (!titles.length) return TP.modal("موضوع نامه", "دست‌کم یک قلم را برای موضوع نامه تیک بزنید.", null, "باشد", "");
    const busy = TP.busy("در حال نوشتن نامه…", "مدل نامه را می‌نویسد و روی سربرگ می‌نشاند؛ چند ثانیه طول می‌کشد.");
    try {
      /* اصلاحِ متن پیش از نگارش ذخیره می‌شود تا آنچه نوشته می‌شود همان باشد که روی صفحه است */
      if (text !== String(L.transcript || "")) await TP.api(`/assignments/${A().id}/letter/transcript`, { method: "PUT", body: { letter_id: L.id, transcript: text } });
      const r = await TP.api(`/assignments/${A().id}/letter/write`, { body: { letter_id: L.id, subject_titles: titles } });
      busy.close();
      if (r.available === false) return TP.modal("نگارش نامه", esc(r.message), null, "باشد", "");
      setLetter(r.letter); render();
      if (r.fileError) TP.modal("فایل Word ساخته نشد", `نامه نوشته شد و متنش همین‌جاست، ولی فایل Word ساخته نشد:<br><br><b>${esc(r.fileError)}</b>`, null, "باشد", "");
    } catch (e) { busy.close(); await loadLetter(); TP.modal("نگارش نامه انجام نشد", esc(e.message), null, "باشد", ""); }
  }
  /* لینک مستقیم هدر احراز هویت را نمی‌فرستد — همان کاری که دانلود برگه‌ها می‌کند */
  async function downloadLetter() {
    const aid = A().id, rid = S.d.request.id;
    const b = TP.busy("آماده‌سازی فایل…", "نامهٔ Word روی سربرگ شرکت");
    try {
      const res = await fetch(`${CFG.apiBase || "/tamin-poshtibani/api"}/assignments/${aid}/letter/file`, { headers: TP.authHeaders() });
      if (!res.ok) { let msg = `خطای سرور ${res.status}`; try { msg = (await res.json()).error || msg; } catch (_) { /* متن خام */ } throw new Error(msg); }
      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob); link.download = `نامه-${rid}.docx`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 5000);
      b.close();
    } catch (err) { b.close(); TP.modal("دانلود نشد", esc(err.message), null, "باشد", ""); }
  }

  /* --- نماها --- */
  function vLetter() {
    const box = letterFor();
    if (!box) { loadLetter(); return `<div class="pad"><div class="empty">در حال خواندن وضعیت نامه…</div></div>`; }
    if (box.loading) return `<div class="pad"><div class="empty">در حال خواندن وضعیت نامه…</div></div>`;
    if (box.error) return `<div class="pad"><div class="tp-note warn">وضعیت نامه خوانده نشد: ${esc(box.error)}</div></div>`;
    const L = box.letter, open = L && LT_OPEN.includes(L.state);
    return `<div class="pad">
      <div class="toolrow"><b>نامهٔ پیوست کمیسیون — درخواست <span class="num">${esc(S.d.request.id)}</span></b>
        <span style="margin-inline-start:auto"></span>
        ${open ? `<button class="tp-btn sm" data-lt-cancel>بی‌خیال</button>` : ""}</div>
      ${L && L.state === "written" ? vLetterDone(L)
        : L && L.transcript && (L.state === "transcribed" || L.state === "failed") ? vLetterConfirm(L)
        : open ? vLetterAsk(L, box) : vLetterIntro(L)}</div>`;
  }
  function vLetterIntro(L) {
    return `<div class="tp-note" style="display:block">
      <b>نامه را با حرف زدن بسازید.</b> ${TP.ui.info("expert.letter", "راهنمای نامهٔ کمیسیون")}
      <div style="margin-top:12px"><button class="tp-btn primary" data-lt-start>${L ? "شروع دوبارهٔ نامه" : "شروع نامه"}</button></div></div>`;
  }
  function vLetterAsk(L, box) {
    const stt = box.stt !== false, rec = canRecord();
    return `<div class="tp-note" style="display:block">
        <b>۱ — توضیحتان را بگویید</b> <span class="dim" style="font-size:.85rem">یک تا دو دقیقه کافی است</span>${TP.ui.info("expert.letter", "راهنمای نامهٔ کمیسیون")}
        ${stt ? "" : `<div class="tp-note warn" style="margin-top:10px">سرویس تبدیل صوت به متن هنوز وصل نیست؛ فعلاً توضیحتان را تایپ کنید.</div>`}
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px">
          ${S.lt.on
            ? `<button class="tp-btn danger" data-lt-stop>⏹ پایان ضبط و ارسال</button>
               <span class="chip warn">🔴 در حال ضبط — <span class="num" data-rec-time>0:00</span></span>
               <button class="tp-btn sm" data-lt-abort>انصراف</button>`
            : `<button class="tp-btn primary" data-lt-rec ${rec && stt ? "" : "disabled"}>🎤 ضبط صدا</button>
               <button class="tp-btn" data-lt-file ${stt ? "" : "disabled"}>📁 بارگذاری فایل صوتی</button>
               ${L.hasVoice ? `<span class="chip warn">صوت قبلی ذخیره شد ولی رونویسی نشد</span>` : ""}`}
        </div>
        ${rec ? "" : `<div class="dim" style="font-size:.85rem;margin-top:8px">ضبط مستقیم در این مرورگر در دسترس نیست (میکروفون فقط روی HTTPS کار می‌کند). فایل صوتی بارگذاری کنید یا تایپ کنید.</div>`}
      </div>
      <div class="tp-note" style="display:block;margin-top:10px">
        <b>یا همین‌جا تایپ کنید</b>
        <textarea class="tp-input" data-lt-type rows="5" maxlength="${LT_MAX}" placeholder="مثلاً: برای این قلم از پنج تأمین‌کننده استعلام گرفتیم، سه‌تا جواب دادند…" style="width:100%;margin-top:8px;resize:vertical;font-family:inherit"></textarea>
        <div style="margin-top:8px"><button class="tp-btn primary" data-lt-typed>ثبت متن</button></div>
      </div>`;
  }
  function vLetterConfirm(L) {
    const sel = subjSel(), its = items();
    const titles = its.filter((i) => sel.includes(i.id)).map((i) => i.title);
    const text = S.lt.draftFor === L.id && S.lt.draft != null ? S.lt.draft : String(L.transcript || "");
    return `${L.state === "failed" ? `<div class="tp-note warn">نگارش نامه بار قبل انجام نشد؛ متن شما سر جایش است و می‌توانید دوباره بزنید.</div>` : ""}
      <div class="tp-note" style="display:block">
        <b>۱ — این را شنیدم</b> <span class="dim" style="font-size:.85rem">اگر کلمه‌ای اشتباه شنیده شده همین‌جا اصلاحش کنید</span>
        <textarea class="tp-input" data-lt-text rows="7" maxlength="${LT_MAX}" style="width:100%;margin-top:8px;resize:vertical;font-family:inherit">${esc(text)}</textarea>
        <div style="margin-top:8px"><button class="tp-btn sm" data-lt-again>✏️ از نو می‌گویم</button></div>
      </div>
      <div class="tp-note" style="display:block;margin-top:10px">
        <b>۲ — موضوع نامه</b> <span class="dim" style="font-size:.85rem">نامه دربارهٔ کدام اقلام است؟</span>
        <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px;max-height:34vh;overflow:auto">
          ${its.map((i) => `<label style="display:flex;gap:8px;align-items:center;cursor:pointer"><input type="checkbox" data-lt-sub="${i.id}" ${sel.includes(i.id) ? "checked" : ""}><span>${esc(i.title)}</span>${i.qty == null ? "" : `<span class="dim" style="font-size:.8rem">— ${M(i.qty)} ${esc(i.unit || "")}</span>`}</label>`).join("")}
        </div>
        <div style="margin-top:10px"><span class="dim">موضوع:</span> <b>${titles.length ? esc(subjectFa(titles, S.d.request.id)) : "—"}</b></div>
      </div>
      <div style="margin-top:12px"><button class="tp-btn primary" data-lt-write>✍️ نوشتن نامه</button></div>`;
  }
  function vLetterDone(L) {
    const b = L.body || {}, mt = L.meta || {}, warn = [];
    if ((b.uncertain || []).length) warn.push(`<div><b>این‌ها در صحبتتان روشن نبود و در نامه نیامد:</b><br>${b.uncertain.map((u) => "• " + esc(u)).join("<br>")}</div>`);
    if ((mt.suspicious || []).length) warn.push(`<div><b>عددهایی که از دادهٔ سامانه نیامده‌اند:</b> ${esc(mt.suspicious.join("، "))}</div>`);
    if ((mt.unresolved || []).length) warn.push(`<div><b>جای‌خالیِ حل‌نشده (با «—» پر شد):</b> ${esc(mt.unresolved.join("، "))}</div>`);
    return `<div class="toolrow"><span class="chip ok">نامه آماده است</span>
        <span class="dim" style="font-size:.85rem">بر پایهٔ ${M(mt.items || 0)} قلمِ تیک‌خورده و ${M(mt.suppliers || 0)} تأمین‌کننده — همان جدول کمیسیون</span>
        <span style="margin-inline-start:auto"></span>
        <button class="tp-btn sm primary" data-lt-dl ${L.hasFile ? "" : "disabled"}>⬇️ دانلود نامه (Word)</button>
        ${mt.channel === "ai" ? `<span class="chip info" title="این نامه را کارشناس هوشمند نوشته است">🤖 نوشتهٔ کارشناس هوشمند</span>` : ""}${mt.channel === "ai" && aiEnd() ? "" : `<button class="tp-btn sm" data-lt-start>نامهٔ تازه</button>`}</div>
      ${L.hasFile ? "" : `<div class="tp-note warn">فایل Word این نامه ساخته نشد؛ متنش را از همین‌جا بردارید.</div>`}
      ${warn.length ? `<div class="tp-note warn" style="display:block"><b>⚠️ پیش از پیوست کردن این‌ها را چک کنید:</b><div style="margin-top:6px">${warn.join("<br>")}</div></div>` : ""}
      <div class="letterpaper">
        <div class="lt-to">${esc(b.to || "")}</div>
        <div class="lt-sub"><b>موضوع:</b> ${esc(b.subject || "")}</div>
        <div class="lt-sal">${esc(b.salutation || "")}</div>
        ${(b.paragraphs || []).map((p) => `<p>${esc(p)}</p>`).join("")}
        ${b.closing ? `<p>${esc(b.closing)}</p>` : ""}
        <div class="lt-sign"><b>${esc(b.thanks || "")}</b><br><b>${esc(b.signature || "")}</b></div>
      </div>
      <div class="dim" style="font-size:.85rem;margin-top:8px">همین متن در فایل Word روی سربرگ شرکت است ${TP.ui.info("expert.letter", "راهنمای نامهٔ کمیسیون")}</div>
      ${mt.channel === "ai" ? vLetterRate(L) : ""}`;
  }
  /* ⭐ نامه‌ای که کارشناس هوشمند نوشته: ستاره و نظرِ اجباری — «خاتمه» تا آن موقع معلق است */
  const STAR_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.75 5.86 6.4.78-4.73 4.4 1.23 6.33L12 17.03l-5.65 3.14 1.23-6.33-4.73-4.4 6.4-.78z"/></svg>`;
  function vLetterRate(L) {
    const r = L.rate, edit = S.lrEdit === L.id || !r, v = S.lrStars || (r && r.stars) || 0;
    const st = (on, live) => `<span class="tp-stars ${live ? "" : "ro"}">${[5, 4, 3, 2, 1].map((n) => live
      ? `<button type="button" class="tp-star${n <= on ? " on" : ""}" data-lr-star="${n}" aria-label="${M(n)} ستاره">${STAR_SVG}</button>`
      : `<span class="tp-star${n <= on ? " on" : ""}">${STAR_SVG}</span>`).join("")}</span>`;
    if (!edit) return `<div class="tp-note lr-box done"><b>⭐ امتیازِ شما به نامهٔ کارشناس هوشمند</b>${st(r.stars, false)}<div class="lr-note">${esc(r.note || "")}</div>
      <button type="button" class="tp-btn sm" data-lr-edit>✏️ ویرایش</button></div>`;
    return `<div class="tp-note lr-box"><b>⭐ این نامه را کارشناس هوشمند نوشته — امتیاز و نظرِ شما (اجباری) ${TP.ui.info("expert.letter", "راهنمای امتیاز به نامه")}</b>
      ${st(v, true)}
      <textarea class="tp-input" data-lr-note rows="3" style="width:100%;margin-top:8px" placeholder="نظرتان دربارهٔ نامه — کامل بود؟ چه چیزی کم داشت یا درست نبود؟">${esc(S.lrNote != null ? S.lrNote : (r && r.note) || "")}</textarea>
      <div style="display:flex;gap:8px;align-items:center;margin-top:8px"><button type="button" class="tp-btn primary sm" data-lr-save ${v ? "" : "disabled"}>ثبتِ امتیاز و نظر</button><span class="lr-err" data-lr-err></span></div></div>`;
  }
  async function saveLetterRate(btn) {
    const L = letterFor() && letterFor().letter; if (!L) return;
    const note = ((document.querySelector("[data-lr-note]") || {}).value || "").trim(), err = document.querySelector("[data-lr-err]");
    if (!S.lrStars && !(L.rate && L.rate.stars)) { if (err) err.textContent = "ستاره‌ها را انتخاب کنید."; return; }
    if (note.length < 3) { if (err) err.textContent = "نظرتان را بنویسید — اجباری است."; return; }
    if (btn) btn.disabled = true;
    try {
      const r = await TP.api("/sp/x/rate", { body: { kind: "letter", letter_id: L.id, stars: S.lrStars || L.rate.stars, note } });
      L.rate = { stars: r.stars, note: r.note }; S.lrStars = 0; S.lrNote = null; S.lrEdit = 0;
      if (S.d && S.d.ai) S.d.ai.rates = r.gaps;
      okTick("امتیازِ نامه ثبت شد ⭐"); render();
    } catch (e) { if (btn) btn.disabled = false; if (err) err.textContent = e.message; }
  }

  /* ---------- قالب‌های پیام (واقعی، ذخیره در D1) ---------- */
  const DEFAULT_TPL = [
    { title: "زمان تحویل", body: `سلام، از شرکت ${COMPANY} تماس می‌گیرم.\nبرای {عنوان قلم} به مقدار {مقدار} {واحد} استعلام قیمت نیاز داریم.\nلطفاً زودترین زمان تحویل ممکن را اعلام بفرمایید.\n{نام کارشناس}` },
    { title: "مکان تحویل", body: `سلام، از شرکت ${COMPANY} تماس می‌گیرم.\nدرباره {عنوان قلم} ({مقدار} {واحد}) — امکان تحویل در محل پروژه را دارید یا تحویل درب انبار شماست؟\nهزینه حمل چقدر است؟\n{نام کارشناس}` },
    { title: "رسمی", body: `با سلام و احترام\nشرکت ${COMPANY} در نظر دارد نسبت به تامین {عنوان قلم} به مقدار {مقدار} {واحد} با مشخصات {مشخصات فنی} اقدام نماید.\nخواهشمند است قیمت، شرایط پرداخت و زمان تحویل را اعلام فرمایید.\nبا تشکر — {نام کارشناس}` },
  ];
  /** قالب‌های کارشناس و زمینهٔ پرکردنِ همین قلم (لایه‌های 🔒/🔓، شرایطِ خرید و تاریخِ تحویل — worker/ai-agent.js:tplCtx) */
  async function loadTemplates(it) {
    try { const r = await TP.api(`/templates${it ? `?item_id=${it.id}` : ""}`); S.templates = r.templates || []; if (it) S.tplCtx[it.id] = r.ctx || null; }
    catch (_) { S.templates = []; }
  }
  /** همان پرکردنِ «✉️ پیام اول» و بات (msg-fill.mjs، هر سیزده جای‌خالی) — زمینهٔ قلم از سرور، وگرنه خودِ قلم */
  function fillTpl(body, supplier) {
    const it = item() || {};
    const ctx = S.tplCtx[it.id] || { company: COMPANY, expertName: (S.expert && (S.expert.label || S.expert.name)) || "", items: [{ title: it.title, qty: it.qty, unit: it.unit, spec: it.spec, due: it.need_date }] };
    if (TP.msg) return TP.msg.fillMsg(body, { ...ctx, supplier });
    return String(body || "").replace(/\{عنوان قلم\}/g, it.title || "").replace(/\{مقدار\}/g, it.qty == null ? "" : M(it.qty)).replace(/\{واحد\}/g, it.unit || "")
      .replace(/\{مشخصات فنی\}/g, it.spec || "—").replace(/\{تامین‌کننده\}/g, supplier || "").replace(/\{نام کارشناس\}/g, S.expert.name);
  }
  /** «قالب‌های پیام» (منوی اقدام‌ها و «ایجاد قالب پیام»ِ جستجوی هوشمند): همان کتابخانهٔ «📚 قالب‌های پیام»ِ «✉️ پیام اول» */
  function pickTemplate() { return tplLibUI(item()); }

  /* ---------- بارگیری ---------- */
  /* ---------- اتصال به تلگرام (TG-03) ----------
     بات نمی‌تواند گفت‌وگو را شروع کند؛ کارشناس باید یک بار /start بزند. سرور یک
     توکن یک‌بارمصرف می‌سازد و ما لینک t.me را نشان می‌دهیم. لینک را باز نمی‌کنیم
     که مرورگر بلاکش نکند — خودِ کارشناس روی دکمه می‌زند. */
  async function tgConnect() {
    if (S.tg && S.tg.connected) {
      TP.modal("اعلان تلگرام", `اعلان‌های شما فعال است.<br><br>ارجاع‌های تازه و یادآوری مهلت‌ها در تلگرام برای شما فرستاده می‌شود.
        <br><br>برای قطع اتصال، در گفت‌وگوی بات دستور <code>/stop</code> را بفرستید.`, null, "باشد", "");
      return;
    }
    try {
      const r = await TP.api("/tg/link", { method: "POST" });
      if (r.available === false) return TP.modal("اعلان تلگرام", esc(r.message), null, "باشد", "");
      TP.modal("اتصال به تلگرام", `روی دکمهٔ زیر بزنید و در تلگرام <b>START</b> را لمس کنید.
        <br><br><a class="tp-btn primary" href="${esc(r.url)}" target="_blank" rel="noopener" style="display:inline-block;text-decoration:none">باز کردن بات در تلگرام</a>
        <br><br><span class="dim" style="font-size:.85rem">این لینک ۱۵ دقیقه اعتبار دارد و فقط یک بار کار می‌کند. بعد از اتصال، دکمهٔ ↻ را بزنید.</span>`,
        null, "بستم", "");
    } catch (e) { TP.modal("خطا", esc(e.message), null, "باشد", ""); }
  }

  async function loadTray() {
    try {
      /* یک درخواست به‌جای سه: کارتابل، وضعیت تلگرام و «من» (سرعت — هر درخواست رفت‌وبرگشت شبکهٔ خودش را دارد) */
      const t = await TP.api("/tray?full=1"), me = t.me;
      S.tray = t.assignments || []; S.settings = t.settings; S.now = Date.now(); S.error = ""; S.tg = t.tg || null; S.asks = t.asks || 0;
      if (S.screen !== "detail") aiStale(false);
      /* ارشد بودن، زیرمجموعه‌ها و تیک اعلان‌ها را مدیر هر لحظه ممکن است عوض کند؛ از سرور تازه می‌شود */
      if (me && me.expert) { S.expert = { ...S.expert, ...me.expert, team: me.team || [] }; TP.session.set(S.expert); }
      if (isSenior() && !S.team) loadTeam(true);
    }
    catch (e) { if (e.status === 401) { TP.session.clear(); S.expert = null; S.screen = "login"; } S.error = e.message; }
    render();
  }
  async function openDetail(aid, keepTab) {
    try { const d = await TP.api(`/assignments/${aid}`);
      /* صفحه تازه شد: نوارِ «🔄 حالتِ کار عوض شد» دیگر لازم نیست */
      aiStale(false);
      /* بازخوانی خودکار نباید کاری را که کارشناس وسطش است (تب، قلم) به هم بزند */
      if (!keepTab) S.fromTeam = S.screen === "list" && S.tab === "team";
      S.d = d; S.d.loadedAt = Date.now(); S.settings = S.d.settings; S.now = Date.now(); if (!keepTab) { S.itemIdx = 0; S.tab = d.ai && d.ai.owned && d.ai.owned.run_id && !d.ai.owned.handover && d.ai.owned.flow !== 2 ? "quotes" : "history"; } S.picks = {}; if (S.itemIdx >= S.d.items.length) S.itemIdx = 0; S.screen = "detail";
      /* نامه را بات تلگرام هم جلو می‌برد، پس ↻ باید وضعیتش را از نو بگیرد؛
         تب نامه خودش تنبلانه دوباره می‌خواند. */
      S.letter = null;
      render();
      /* ارجاعِ زیرمجموعه فقط‌خواندنی است: «مشاهده» را کارشناس خودش ثبت می‌کند */
      if (!S.d.assignment.viewed_at && S.d.assignment.expert_id === S.expert.id) { await TP.api(`/assignments/${aid}/viewed`, { body: {} }); S.d.assignment.viewed_at = Date.now(); render(); } }
    catch (e) { TP.modal("خطا", esc(e.message), null, "باشد", ""); }
  }
  const reload = () => openDetail(A().id, true);

  /* دکمه‌های تلگرام نوار بالا. کارشناس ارشد دو تلگرام دارد (تصمیم مدیر): «تلگرام کارشناسی» — همان
     بات کارشناسان برای ارجاع‌های خودش (با «ارجاع به تیم» کنار «مشاهده») — و «تلگرام تیمی» برای
     اعلان‌های پایش کارشناسان زیر نظرش. */
  /* یک گزینهٔ «تلگرام» در منوی پروفایل: کارشناس ارشد میان «تلگرام کارشناسی» و «تلگرام تیمی» انتخاب می‌کند (مهر ۱۴۰۵) */
  function tgChooser() {
    const tg = S.tg || {};
    if (!isSenior() || !(tg.teamBotConfigured || tg.botConfigured)) return tgConnect();
    const d = TP.modal("تلگرام", `<p style="margin-top:0">کدام را می‌خواهید وصل یا باز کنید؟</p><div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">
      ${tg.botConfigured ? `<button class="tp-btn ${tg.connected ? "" : "primary"}" data-tgc="exp" style="white-space:normal;text-align:start">${tg.connected ? "✅ " : ""}تلگرام کارشناسی <span class="dim">— ارجاع‌ها و یادآوری مهلتِ خودتان</span></button>` : ""}
      <button class="tp-btn ${S.expert.team_connected ? "" : "primary"}" data-tgc="team" style="white-space:normal;text-align:start">${S.expert.team_connected ? "✅ " : ""}تلگرام تیمی <span class="dim">— اعلان‌های پایش کارشناسان تیم شما</span></button></div>`, null, "بستن", "");
    d.querySelectorAll("[data-tgc]").forEach((b) => { b.onclick = () => { d.remove(); if (b.dataset.tgc === "exp") tgConnect(); else teamLink(); }; });
  }
  /** گزینه‌های منوی پروفایل در نوار بالا (ui.js:topbar) */
  function profileItems() {
    const tg = S.tg || {};
    const items = [{ label: "حساب من", icon: "user", attrs: 'data-stab="account"' }];
    if (tg.botConfigured || (isSenior() && tg.teamBotConfigured)) items.push({ label: "تلگرام", icon: "telegram", attrs: "data-tgmenu", cnt: tg.connected || S.expert.team_connected ? "✅ وصل" : "وصل کنید", cntCls: tg.connected || S.expert.team_connected ? "ok" : "warn" });
    items.push({ label: "به‌روزرسانی", icon: "refresh", attrs: "data-refresh" }, { label: "تدارکات", icon: "home", href: "./" }, "-", { label: "خروج", icon: "logout", attrs: "data-logout", cls: "danger" });
    return items;
  }
  /** موضوعِ راهنمای صفحهٔ فعلی (help-content.js) */
  function helpKey() {
    if (S.screen === "login") return "login.expert";
    if (S.screen === "detail") return `expert.${{ history: "history", smart: "smart", quotes: "quotes", comm: "comm", letter: "letter" }[S.tab] || "detail"}`;
    return S.tab === "team" ? "expert.team" : S.tab === "alerts" ? "expert.alerts" : S.tab === "account" ? "expert.account" : "expert.tray";
  }

  /* ---------- رندر ---------- */
  const PUSH_API = (p, b) => TP.api(p, b === undefined ? {} : { body: b });
  function render() {
    const app = document.getElementById("app");
    if (!S.expert) S.screen = "login";
    const restore = TP.snapScroll();
    TP.ui.mountBg(S.screen === "login" ? "fog" : "");
    const nav = S.expert ? `<a class="tp-btn sm ${S.asks ? "warn" : ""}" href="correspond" data-corr title="${S.asks ? "کارشناس هوشمند از شما سؤال دارد — پاسخ را در همان گفت‌وگو بنویسید" : "مکاتبات با تأمین‌کنندگان: ارسال استعلام، گفت‌وگو، پیش‌فاکتور و تأیید نهایی"}">💬 مکاتبات${S.asks ? `<span class="tp-dot-badge" data-asks title="پرسش از کارشناس">${S.asks}</span>` : ""}</a>` : "";
    const head = S.screen === "login" ? "" : TP.ui.topbar({ title: "پنل کارشناس خرید", sub: esc(COMPANY), nav, user: { name: S.expert.name, sub: isSenior() ? "کارشناس ارشد" : "کارشناس خرید" }, items: profileItems() });
    app.innerHTML = `${head}${S.error && S.screen !== "login" ? `<div class="tp-note warn" style="margin:10px 18px">${esc(S.error)}</div>` : ""}
      ${S.screen === "login" ? vLogin() : S.screen === "list" ? vList() : vDetail()}`;
    TP.ui.help.set(helpKey());
    wire();
    /* سرآیند چهارطبقهٔ جدول سوابق باید بچسبد، وگرنه با اسکرول معلوم نیست
       هر ستون مال کدام گروه است. */
    const grid = app.querySelector("table.grid"); if (grid) TP.stickHeader(grid);
    restore();
    /* اعلانِ گوشی و مرورگر (ui.js: TP.ui.push) — نه در مینی‌اپ تلگرام (آن‌جا خودِ بات خبر می‌دهد) */
    if (S.expert && S.screen !== "login" && !TP.tg) TP.ui.push.mount({ role: "expert", who: S.expert.id, api: PUSH_API });
    /* «دستیار سامانه» در کشوی راهنما (ui.js) */
    if (S.expert && S.screen !== "login") TP.ui.help.assistant({ role: "expert", api: PUSH_API, name: S.expert.name });
  }

  /* ---------- اتصال ---------- */
  function wire() {
    const a = document.getElementById("app"), Q = (s) => a.querySelectorAll(s), G = (s) => a.querySelector(s);
    if (G("[data-login-card]")) { TP.ui.bindLogin(a, { onSubmit: async (c) => { const r = await TP.api("/login", { body: { code: c } }); TP.session.set(r.expert); S.expert = r.expert; S.error = ""; S.screen = "list"; TP.ui.resetOnce("exp.tray"); TP.ui.resetOnce("exp.team"); await loadTray(); } }); return; }
    const lo = G("[data-logout]"); if (lo) lo.onclick = () => { TP.ui.push.off(PUSH_API); TP.ui.help.assistant(null); TP.session.clear(); S.expert = null; S.d = null; S.screen = "login"; render(); };
    const rf = G("[data-refresh]"); if (rf) rf.onclick = () => S.screen === "detail" ? reload() : loadTray();
    const tg = G("[data-tg]"); if (tg) tg.onclick = tgConnect;
    const tgm = G("[data-tgmenu]"); if (tgm) tgm.onclick = tgChooser;
    Q("[data-req]").forEach((x) => {
      x.onclick = (e) => { if (e.target.closest("[data-stop]")) return; openDetail(+x.dataset.req); };
      x.onkeydown = (e) => { if ((e.key === "Enter" || e.key === " ") && e.target === x) { e.preventDefault(); openDetail(+x.dataset.req); } };
    });
    /* تیم کارشناسی */
    Q("[data-stab]").forEach((b) => b.onclick = () => { TP.ui.resetOnce("exp.tray"); TP.ui.resetOnce("exp.team"); S.tab = b.dataset.stab === "tray" ? "history" : b.dataset.stab; if (S.tab === "team") loadTeam(true); render(); });
    Q("[data-tcard]").forEach((x) => x.onclick = () => { S.teamCard = x.dataset.tcard; render(); });
    Q("[data-ttoggle]").forEach((b) => b.onclick = () => { S.teamOpen[b.dataset.ttoggle] = !S.teamOpen[b.dataset.ttoggle]; render(); });
    Q("[data-delegate]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); delegateDialog(+b.dataset.delegate, b.dataset.from ? +b.dataset.from : null); });
    Q("[data-sstage]").forEach((c) => c.onchange = async () => {
      const ticks = [...Q("[data-sstage]")].map((x) => x.checked);
      try { const r = await TP.api("/me/alerts", { method: "PUT", body: { alert_stages: ticks } }); S.expert.alert_stages = r.alert_stages; TP.session.set(S.expert); }
      catch (er) { TP.modal("خطا", esc(er.message), null, "باشد", ""); }
    });
    Q("[data-team-link]").forEach((b) => b.onclick = teamLink);
    /* حساب من */
    const acs = G("[data-acc-save]"); if (acs) acs.onclick = saveCode;
    Q("[data-supm]").forEach((c) => c.onchange = saveSupCfg);
    const smin = G("[data-supmin]"); if (smin) smin.onchange = saveSupCfg;
    Q("#acc-cur, #acc-new, #acc-rep").forEach((i) => i.onkeydown = (e) => { if (e.key === "Enter") saveCode(); });
    /* آستانه‌های تیم (کارشناس ارشد) */
    Q("[data-sthr]").forEach((i) => i.oninput = (e) => {
      e.target.value = e.target.value.replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[^0-9]/g, "");
      const vals = [...Q("[data-sthr]")].map((x) => (x.value === "" ? "" : +x.value));
      const act = vals.filter((v) => v !== "");
      const ok = act.every((v, k) => k === 0 || v > act[k - 1]) && act.every((v) => v >= 1 && v <= 100);
      const er = G("#sthrErr"); if (er) er.textContent = ok ? "" : "درصدها باید صعودی و بین ۱ تا ۱۰۰ باشند.";
      if (ok) saveSeniorThr(vals);
    });
    const tr = G("[data-sthr-reset]"); if (tr) tr.onclick = () => saveSeniorThr(null);
    Q("[data-q]").forEach((i) => { if (i.dataset.q === "date") i.onclick = () => TP.openDatePicker(i, (v) => { S.q.date = v; render(); }); else i.oninput = (e) => { S.q[e.target.dataset.q] = e.target.value; TP.keepFocus(e.target, "q", render); }; });
    const cq = G("[data-clr]"); if (cq) cq.onclick = () => { S.q = { id: "", date: "", party: "", item: "" }; render(); };
    const ts = G("[data-tsort]"); if (ts) ts.onclick = () => { S.traySort = !S.traySort; try { localStorage.setItem("tp.traySort", S.traySort ? "1" : "0"); } catch (_) { /* حالت خصوصی */ } render(); };
    const bk = G("[data-back]"); if (bk) bk.onclick = () => { if (S.lt.on) recStop(true); S.screen = "list"; TP.ui.resetOnce("exp.tray"); TP.ui.resetOnce("exp.team"); S.d = null; S.letter = null; if (S.fromTeam) { S.tab = "team"; S.fromTeam = false; loadTeam(true); } loadTray(); };
    Q("[data-item]").forEach((x) => x.onclick = () => { S.itemIdx = +x.dataset.item; render(); });
    Q("[data-tab]").forEach((x) => x.onclick = () => { if (S.lt.on && x.dataset.tab !== "letter") recStop(true); S.tab = x.dataset.tab; render(); });
    Q("[data-eact]").forEach((b) => b.onclick = () => doExpertAct(b.dataset.eact));
    const tp = G("[data-tpl]"); if (tp) tp.onclick = pickTemplate;
    /* سوابق */
    const mo = G("[data-mom]");
    if (mo) {
      mo.oninput = (e) => { S.mom = +e.target.value; const lab = G("[data-mom-val]"); if (lab) lab.textContent = M(S.mom); };
      mo.onchange = () => { try { localStorage.setItem(MOM_KEY, String(S.mom)); } catch (_) { /* حالت خصوصی */ } if (S.hist[item().id]) runHist(); };
    }
    const rh = G("[data-run-hist]"); if (rh) rh.onclick = () => runHist(true);
    const pix = G("[data-pidx]"); if (pix) pix.onchange = (e) => { S.priceIdx = e.target.checked; try { localStorage.setItem(PIDX_KEY, S.priceIdx ? "1" : "0"); } catch (_) { /* حالت خصوصی */ } render(); };
    /* نرمال‌سازی اقلام و حالت جستجو */
    Q("[data-norm-on]").forEach((b) => b.onclick = () => {
      const it0 = item();
      /* پنلِ جمع‌شده بعد از «بررسی سوابق»: فقط باز می‌شود */
      if (it0 && S.normMin[it0.id]) { delete S.normMin[it0.id]; if (!S.normOn && !(it0.sp_lock || frozen(it0)) && S.hmode !== "pick") S.normOn = true; if (!S.norm[it0.id]) runNormalize(false); render(); return; }
      S.normOn = !S.normOn;
      try { localStorage.setItem(NORM_KEY, S.normOn ? "1" : "0"); } catch (_) { /* حالت خصوصی */ }
      /* فقط ویرایشگرِ ساختار باز و بسته می‌شود؛ مبنای جستجو عوض نمی‌شود، پس نتیجه می‌ماند */
      render();
    });
    Q("[data-hmode]").forEach((b) => b.onclick = () => {
      if (S.hmode === b.dataset.hmode) return;
      S.hmode = b.dataset.hmode;
      const it = item();
      if (it && S.hist[it.id] && !normDirty(it)) runHist(); else render();
    });
    /* «قلم انتخابی»: تیکِ لایه‌ها و واحدها — اگر نتیجه‌ای روی صفحه است همان لحظه از نو جستجو می‌شود،
       وگرنه با «بررسی سوابق» */
    Q("[data-pick-l]").forEach((c) => c.onchange = () => {
      const it = item(); if (!it) return;
      const p = pickOf(it), k = c.dataset.pickL;
      p.layers = c.checked ? [...new Set([...p.layers, k])] : p.layers.filter((x) => x !== k);
      if (S.hist[it.id]) runHist(); else render();
    });
    /* ویرایش پیش‌نویس بی‌بازرندر، تا فوکوس و مکان‌نما نپرند */
    const nd = () => { const it = item(); return it && S.norm[it.id] && S.norm[it.id].draft; };
    const nh = G("[data-norm-head]"); if (nh) nh.oninput = (e) => { const d = nd(); if (d) d.head = e.target.value; };
    /* نام لایه عوض شد: کمّی یا نبودنش فرق کرد، پس فیلد واحد باید بیاید یا برود (بازرندر) */
    Q("[data-norm-lk]").forEach((x) => x.onchange = (e) => {
      const d = nd(); if (!d) return;
      const l = d.layers[+e.target.dataset.normLk], was = isQuant(l.k);
      /* «＋ لایهٔ تازه…»: نامی بیرون از فهرستِ ثابت — کمّی نیست */
      if (e.target.value === NEW_LAYER) { newLayerUI(item(), l); return; }
      l.k = e.target.value;
      if (!isQuant(l.k)) l.u = "";
      if (was !== isQuant(l.k)) render();
    });
    /* دستِ کارشناس که به مقدار بخورد، دیگر «ضمنی» نیست */
    Q("[data-norm-lv]").forEach((x) => x.oninput = (e) => { const d = nd(); if (d) { const l = d.layers[+e.target.dataset.normLv]; l.t = e.target.value; l.i = false; } });
    Q("[data-norm-lu]").forEach((x) => x.onchange = (e) => { const d = nd(); if (d) { const l = d.layers[+e.target.dataset.normLu]; l.u = e.target.value; l.i = false; } });
    Q("[data-norm-ldel]").forEach((x) => x.onclick = () => { const d = nd(); if (d) { d.layers.splice(+x.dataset.normLdel, 1); render(); } });
    const nla = G("[data-norm-ladd]");
    if (nla) nla.onclick = () => {
      const n = S.norm[item().id]; if (!n || !n.draft) return;
      const used = new Set(n.draft.layers.map((l) => l.k));
      n.draft.layers.push({ k: (n.data.layerNames || []).find((x) => !used.has(x)) || "", t: "", u: "", i: false, lk: true }); render();
    };
    const ncf = G("[data-norm-confirm]"); if (ncf) ncf.onclick = () => { confirmNormUI(); };
    /* 🔒/🔓ِ عنوان، مقدار و هر لایه — در پیش‌نویس؛ با «تأیید» ذخیره می‌شود */
    Q("[data-norm-lock]").forEach((b) => b.onclick = () => {
      const d = nd(); if (!d) return;
      const k = b.dataset.normLock;
      const l = d.layers[+k.slice(2)]; if (l) l.lk = l.lk === false;
      render();
    });
    const man = G("[data-manual]"); if (man) man.onclick = () => manualUI();
    /* فاز ۴ب گام ۲: «🎯 فهرست دعوت»ِ همین قلم و «🚀 شروع» */
    Q("[data-pk]").forEach((c) => c.onchange = () => pkEdit(item(), { on: { [c.dataset.pk]: c.checked } }));
    Q("[data-pkwhy]").forEach((x) => x.onchange = () => pkEdit(item(), { why: { [x.dataset.pkwhy]: x.value } }));
    /* «🧭 استراتژی استعلام»: علتِ تیکِ متفاوت با برنامه، دیدنِ برنامه و چیدن */
    Q("[data-pkbox]").forEach((s) => s.onchange = () => pkEdit(item(), { whybox: { [s.dataset.pkbox]: s.value } }));
    Q("[data-pkstrat]").forEach((b) => b.onclick = () => pkStratUI(item()));
    /* «🧭 چینش گسترده / محتاط»: زدن، و «بچین / انصراف»ِ خطِ هشدارِ تیکِ دستی */
    Q("[data-pkvar]").forEach((b) => b.onclick = () => pkVarPress(item(), b.dataset.pkvar));
    Q("[data-pkvar-go]").forEach((b) => b.onclick = () => pkVarPress(item(), b.dataset.pkvarGo, true));
    Q("[data-pkvar-no]").forEach((b) => b.onclick = () => { delete S.pkWarn[item().id]; pkPaint(); });
    Q("[data-pkfm]").forEach((b) => b.onclick = () => pkFmUI(item()));
    /* «② 📋 شرایط خرید» در گام‌های شروع: ویرایشگر باز و همان‌جا */
    Q("[data-pkterms]").forEach((b) => b.onclick = () => termsGo(item()));
    const pkd = G("[data-pkdoc]"); if (pkd) pkd.onclick = () => pkDocUI(item());
    Q("[data-pkdel]").forEach((b) => b.onclick = () => pkEdit(item(), { remove: [b.dataset.pkdel] }));
    Q("[data-pkph]").forEach((b) => b.onclick = () => pkPhoneUI(item(), b.dataset.pkph));
    Q("[data-pkadd-name]").forEach((b) => b.onclick = () => pkEdit(item(), { add: [{ name: b.dataset.pkaddName, src: "manual" }] }));
    const pka = G("[data-pkadd]"); if (pka) pka.onclick = () => pkAddUI(item());
    Q("[data-pkstart]").forEach((b) => b.onclick = () => pkStartUI(item()));
    const pkr = G("[data-pkrebuild]"); if (pkr) pkr.onclick = () => pkRebuildUI(item());
    const pkb = G("[data-pkback]"); if (pkb) pkb.onclick = () => manualUI(item().id);
    const pko = G("[data-pkopen]"); if (pko) pko.onclick = () => { const it = item(); S.pickOpen[it.id] = !S.pickOpen[it.id]; render(); };
    const pkl = G("[data-pkreload]"); if (pkl) pkl.onclick = () => loadPicks(item(), true);
    const pkg = G("[data-pkgo]"); if (pkg) pkg.onclick = () => { S.tab = "history"; render(); };
    /* فاز ۴ب گام ۳: «📋 شرایط خرید» — پیش‌نویس بی بازرندر (جز دکمه‌های 🔒/🔓 و تاریخ) */
    Q("[data-tq-lock]").forEach((b) => b.onclick = () => tqToggle(item(), b.dataset.tqLock));
    /* بستن پیش‌نویس را دور نمی‌ریزد: «ذخیره نشده» کنار عنوان می‌ماند و «🚀 شروع» پیش از رفتن می‌پرسد؛ «برگرداندن» دور می‌ریزد */
    const tmo = G("[data-terms-open]"); if (tmo) tmo.onclick = () => { const it = item(); S.termsOpen[it.id] = !S.termsOpen[it.id]; render(); };
    Q("[data-tm-opt]").forEach((c) => c.onchange = () => {
      const it = item(), D = termsDraftOf(it), f = c.dataset.tmOpt;
      D[f] = D[f] || { opts: [], lock: false };
      const set = new Set(D[f].opts || []); if (c.checked) set.add(c.value); else set.delete(c.value);
      D[f].opts = TERM_ENUM[f].filter((o) => set.has(o));
    });
    Q("[data-tm-lock]").forEach((b) => b.onclick = () => {
      const it = item(), D = termsDraftOf(it), f = b.dataset.tmLock;
      D[f] = D[f] || (TERM_ENUM[f] ? { opts: [] } : {});
      D[f].lock = !D[f].lock;
      /* «پیش‌فاکتورِ رسمی 🔒» یعنی خواسته هم هست */
      if (f === "offpf" && D[f].lock) D[f].on = true;
      render();
    });
    Q("[data-tm-one]").forEach((s) => s.onchange = () => { const D = termsDraftOf(item()), f = s.dataset.tmOne; D[f] = { ...(D[f] || {}), opt: s.value }; });
    const tmn = G("[data-tm-note]"); if (tmn) tmn.oninput = () => { const D = termsDraftOf(item()); D.place = { ...(D.place || {}), note: tmn.value }; };
    const tmsh = G("[data-tm-ship]"); if (tmsh) tmsh.oninput = () => { const D = termsDraftOf(item()); D.ship = { ...(D.ship || {}), text: tmsh.value }; };
    const tmv = G("[data-tm-valid]"); if (tmv) tmv.oninput = () => { const D = termsDraftOf(item()); D.valid = { ...(D.valid || {}), min: tmv.value.trim() }; };
    const tmo2 = G("[data-tm-offpf]"); if (tmo2) tmo2.onchange = () => { const D = termsDraftOf(item()); D.offpf = { ...(D.offpf || {}), on: tmo2.checked }; };
    Q("[data-tm-dt]").forEach((x) => x.onclick = () => TP.openDatePicker(x, (v) => {
      const it = item(), D = termsDraftOf(it);
      D.dtime = { ...(D.dtime || {}), [x.dataset.tmDt]: String(v || "").split("،")[0].trim() }; render();
    }, { single: true }));
    const tmc = G("[data-tm-dtclr]"); if (tmc) tmc.onclick = () => { const D = termsDraftOf(item()); D.dtime = { lock: !!(D.dtime && D.dtime.lock) }; render(); };
    const tms = G("[data-terms-save]"); if (tms) tms.onclick = () => saveTermsUI(item());
    const tmr = G("[data-terms-reset]"); if (tmr) tmr.onclick = () => { delete S.termsEd[item().id]; render(); };
    /* هر فراخوانی مدل با کادرِ تأیید */
    const nrd = G("[data-norm-redo]"); if (nrd) nrd.onclick = () => askModel(item(), true);
    const nmd = G("[data-norm-model]"); if (nmd) nmd.onclick = () => askModel(item(), false);
    const nrt = G("[data-norm-retry]"); if (nrt) nrt.onclick = () => runNormalize(false);
    const ncl = G("[data-norm-clear]"); if (ncl) ncl.onclick = clearNormUI;
    const nrv = G("[data-norm-revert]"); if (nrv) nrv.onclick = revertEditUI;
    /* کادر باز است و این قلم هنوز ساختاری ندارد → خودکار از دیتابیس خوانده می‌شود (بی مدل؛ Task.txt: «به شکل خودکار») */
    if (S.screen === "detail" && S.tab === "history" && (S.normOn || S.hmode === "pick" || aiPending() || !normOk(item())) && item() && item().state === "open" && !S.norm[item().id]) runNormalize(false);
    const chb = G("[data-chart]"); if (chb) chb.onclick = () => { if (!chb.disabled) openChart(item()); };
    Q("[data-hsort]").forEach((el) => el.onclick = () => { S.hsort = el.dataset.hsort; render(); });
    Q("[data-prof]").forEach((el) => el.onclick = () => { S.prof = S.prof === el.dataset.prof ? null : el.dataset.prof; render(); });
    const cp = G("[data-close-prof]"); if (cp) cp.onclick = () => { S.prof = null; render(); };
    const ppa = G("[data-pp-add]"); if (ppa) ppa.onclick = () => addSpPhone(ppa);
    Q("[data-buys]").forEach((b) => b.onclick = () => showBuys(b.dataset.buys));
    Q("[data-to-quote]").forEach((b) => b.onclick = () => addFromHistory(b.dataset.toQuote));
    Q("[data-hist-msg]").forEach((b) => b.onclick = () => { const x = supOf(b.dataset.histMsg); if (x) msgFor(x.name); });
    const rs = G("[data-run-smart]"); if (rs) rs.onclick = runSmart;
    Q("[data-mark]").forEach((b) => b.onclick = async () => { const it = item(); try { await TP.api(`/items/${it.id}/progress`, { body: { stage: b.dataset.mark } }); await reload(); okTick("انجام‌شده ثبت شد"); } catch (e) { TP.modal("نشد", esc(e.message), null, "باشد", ""); } });
    /* قیدهای جستجوی هوشمند — بدون بازرندر حین تایپ تا فوکوس نپرد؛ state همان لحظه به‌روز است */
    Q("[data-smk]").forEach((c) => c.onchange = (e) => {
      const sm = smOf(item());
      const k = e.target.dataset.smk, i = sm.markets.indexOf(k), cap = S.maxMarkets || 3;
      /* سقف هزینهٔ هر جستجو: بیش از سه بازار میان پنج جستجو پخش نمی‌شود */
      if (e.target.checked && i < 0 && sm.markets.length >= cap) {
        e.target.checked = false;
        return TP.modal("حداکثر سه بازار", "هر جستجو حداکثر سه بازار دارد. اول تیک یکی را بردارید.", null, "باشد", "");
      }
      if (e.target.checked && i < 0) sm.markets.push(k);
      if (!e.target.checked && i >= 0) sm.markets.splice(i, 1);
    });
    Q("[data-sm]").forEach((el) => el.oninput = (e) => { smOf(item())[e.target.dataset.sm] = e.target.value; });
    Q("[data-tpl-open]").forEach((b) => b.onclick = pickTemplate);
    Q("[data-chopen]").forEach((b) => b.onclick = () => { S.chOpen[b.dataset.chopen] = !S.chOpen[b.dataset.chopen]; render(); });
    /* همان چرخهٔ دمو: — ← ✓ ← ✗ ← — ؛ کلید «شماره|پیام‌رسان»، ذخیره در پایگاه داده */
    Q("[data-ch]").forEach((b) => b.onclick = () => { const k = b.dataset.ch, i = k.lastIndexOf("|"); toggleChannel(k.slice(0, i), k.slice(i + 1)); });
    const pair = (v) => v.split("|").map(Number);
    Q("[data-sm-add]").forEach((b) => b.onclick = () => addFromSmart(...pair(b.dataset.smAdd)));
    Q("[data-sm-msg]").forEach((b) => b.onclick = () => smartMessage(...pair(b.dataset.smMsg)));
    Q("[data-sm-pick]").forEach((b) => b.onclick = () => smPickUI(...pair(b.dataset.smPick)));
    /* «🗂 تأمین‌کنندگان کشف‌شده» و «؟»ِ دلیلِ بسته بودنِ جستجو */
    const gw = G("[data-gate-why]"); if (gw) gw.onclick = () => { const it = item(); S.gateWhy[it.id] = !S.gateWhy[it.id]; render(); };
    Q("[data-dc-row]").forEach((el) => {
      const flip = (e) => { if (e.target.closest("button, a, input")) return; S.dcOpen[el.dataset.dcRow] = !S.dcOpen[el.dataset.dcRow]; render(); };
      el.onclick = flip;
      el.onkeydown = (e) => { if ((e.key === "Enter" || e.key === " ") && e.target === el) { e.preventDefault(); flip(e); } };
    });
    Q("[data-dc-f]").forEach((b) => b.onclick = () => { S.dcF[item().id] = b.dataset.dcF; render(); });
    const dq = G("[data-dcq]"); if (dq) { dq.oninput = () => { S.dcQ[item().id] = dq.value; dcFilterDom(dq.value); }; if (dq.value) dcFilterDom(dq.value); }
    Q("[data-dc-pick]").forEach((b) => b.onclick = () => dcPickUI(b.dataset.dcPick));
    Q("[data-dc-add]").forEach((b) => b.onclick = () => dcAddQuote(b.dataset.dcAdd));
    Q("[data-dc-msg]").forEach((b) => b.onclick = () => { const x = dcSup(b.dataset.dcMsg); if (x) msgFor(x.name); });
    Q("[data-dc-phone]").forEach((b) => b.onclick = () => dcPhoneUI(b.dataset.dcPhone));
    Q("[data-dc-prof]").forEach((b) => b.onclick = () => { const x = dcSup(b.dataset.dcProf), D = dcOf(item()); if (x && TP.supProfile) TP.supProfile.open({ sid: x.sid, name: x.name, head: D && D.head }); });
    Q("[data-dc-copy]").forEach((b) => b.onclick = async () => { const t = b.dataset.dcCopy; try { await navigator.clipboard.writeText(t); okTick("کپی شد"); } catch (_) { TP.modal("کپی نشد", `<span dir="ltr">${esc(t)}</span>`, null, "باشد", ""); } });
    /* باز/بسته کردن جستجوی قبلی نباید با بازرندرِ بعدی برگردد */
    Q("details.smblock").forEach((el) => el.ontoggle = () => { S.smOpen[el.dataset.sid] = el.open; });
    /* استعلامات */
    const ar = G("[data-add-row]"); if (ar) ar.onclick = () => {
      /* یک تأمین‌کننده معمولاً چند قلم را با هم قیمت می‌دهد، پس اقلام چندانتخابی‌اند؛ برای هر قلم یک خط ساخته می‌شود */
      const d = TP.modal("افزودن تأمین‌کننده", `<div class="tp-field"><b>نام تأمین‌کننده</b><input class="tp-input" id="sup" style="width:100%" autofocus></div><div class="tp-field" style="margin-top:8px"><b>کد (اختیاری)</b><input class="tp-input" id="supc" style="width:160px"></div>
        <div class="tp-field" style="margin-top:10px"><b>برای کدام اقلام؟</b> <span class="dim" style="font-size:.82rem">هر قلمی که این تأمین‌کننده قیمت داده را تیک بزنید</span>
          <div style="display:flex;flex-direction:column;gap:6px;margin-top:6px;max-height:40vh;overflow:auto">${items().map((x, i) => `<label style="display:flex;gap:8px;align-items:center;cursor:pointer"><input type="checkbox" data-supi="${x.id}" ${i === S.itemIdx ? "checked" : ""}><span>${esc(x.title)}</span>${x.qty != null ? `<span class="dim" style="font-size:.8rem">— ${M(x.qty)} ${esc(x.unit || "")}</span>` : ""}</label>`).join("")}</div>
          <label style="display:inline-flex;gap:6px;margin-top:8px;cursor:pointer"><input type="checkbox" id="supall"> همهٔ اقلام</label></div>`,
        async () => {
          const n = d.querySelector("#sup").value.trim(); if (!n) return;
          const ids = [...d.querySelectorAll("[data-supi]:checked")].map((c) => +c.dataset.supi);
          if (!ids.length) { TP.modal("قلمی انتخاب نشد", "دست‌کم یک قلم را تیک بزنید.", null, "باشد", ""); return; }
          try { const r = await TP.api("/quotes", { body: { assignment_id: A().id, item_ids: ids, supplier_name: n, supplier_code: d.querySelector("#supc").value.trim(), origin: "manual" } }); S.tab = "quotes"; await reload(); if (r.skipped) TP.modal("توجه", `${M(r.skipped)} قلم برای این تأمین‌کننده از قبل خط داشت و دوباره ساخته نشد.`, null, "باشد", ""); }
          catch (e) { TP.modal("خطا", esc(e.message), null, "باشد", ""); }
        }, "افزودن");
      const all = d.querySelector("#supall"); if (all) all.onchange = () => d.querySelectorAll("[data-supi]").forEach((c) => { c.checked = all.checked; });
    };
    /* خطِ استعلام: هر خانه با Enter یا رفتن از آن ذخیره می‌شود (saveField)؛ خطی که کارشناس هوشمند همین حالا رویش مذاکره می‌کند ورودی ندارد */
    Q("[data-qf]").forEach((el) => {
      const [id, f] = el.dataset.qf.split("|");
      el.onchange = () => qSeq(() => saveField(el, +id, f));
      if (el.tagName !== "SELECT") el.oninput = () => { if (!el.dataset.opt) el.classList.toggle("bad", !el.value.trim()); if (f === "qty" || f === "price") liveTotal(id); };
    });
    /* زمان تحویل: تایپ («۱۰ روز کاری») یا تاریخ از تقویم — «پاک کردن»ِ تقویم خانه را خالی می‌کند */
    Q("[data-qdt]").forEach((b) => b.onclick = () => {
      const el = G(`[data-qf="${b.dataset.qdt}|dtime"]`); if (!el) return;
      TP.openDatePicker(el, (v) => { const x = String(v || "").split("،")[0].trim(); if (x !== el.value.trim()) { el.value = x; el.onchange(); } }, { single: true });
    });
    Q("[data-fin]").forEach((c) => c.onchange = () => { const on = c.checked; qSeq(async () => {
      try { await TP.api(`/quotes/${c.dataset.fin}`, { method: "PUT", body: { final: on ? 1 : 0 } }); } catch (e) { TP.modal("تیک «تأیید نهایی» ثبت نشد", esc(e.message), null, "باشد", ""); }
      await reload(); }); });
    Q("[data-save]").forEach((b) => b.onclick = () => qSeq(async () => { try { await TP.api(`/quotes/${b.dataset.save}`, { method: "PUT", body: { save: true } }); await reload(); okTick("استعلام ثبت شد"); } catch (e) {
      const miss = (e.data && e.data.missing) || [];
      if (!miss.length) return TP.modal("ثبت موقت انجام نشد", esc(e.message), null, "باشد", "");
      TP.modal("ثبت موقت انجام نشد", `این فیلدهای اجباری خالی‌اند:<br><br><b>${miss.map((f) => LBL[f] || f).join("، ")}</b><br><br>خانه‌های قرمز را همین‌جا در جدول پر کنید. تا ثبت موقت انجام نشود، این ردیف در شمارنده و کمیسیون حساب نمی‌شود.`, null, "باشد", ""); } }));
    Q("[data-del]").forEach((b) => b.onclick = () => TP.modal("حذف استعلام", "این ردیف حذف شود؟", async () => { await TP.api(`/quotes/${b.dataset.del}`, { method: "DELETE" }); await reload(); }, "حذف"));
    Q("[data-pf]").forEach((b) => b.onclick = () => {
      const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".pdf,.jpg,.jpeg,.png";
      inp.onchange = async () => {
        const f = inp.files && inp.files[0]; if (!f) return;
        const busy = TP.busy("بارگذاری پیش‌فاکتور", esc(f.name));
        try {
          const r = await uploadProforma(b.dataset.pf, f);
          busy.close();
          await reload();
          if (r.available === false) return TP.modal("پیش‌فاکتور", esc(r.message || "انبار فایل وصل نیست."), null, "باشد", "");
          /* فایل که نشست، همان‌جا بخوانیمش \u2014 همان کاری که بات با فایل تلگرام می‌کند */
          const p = S.d.proformas.find((x) => x.supplier_name === b.dataset.pf);
          if (p) showExtract(p.id, true);
        } catch (e) { busy.close(); TP.modal("بارگذاری نشد", esc(e.message), null, "باشد", ""); }
      };
      inp.click();
    });
    Q("[data-extract]").forEach((b) => b.onclick = () => showExtract(b.dataset.extract, false));
    Q("[data-h]").forEach((x) => x.onchange = async (e) => { const k = e.target.dataset.h; await TP.api(`/requests/${encodeURIComponent(S.d.request.id)}/head`, { method: "PUT", body: { [k]: e.target.value } }); S.d.request["head_" + k] = e.target.value; S.sheets = null; render(); });
    /* «📨 فراخوانِ پیش‌فاکتورِ رسمی» */
    const fcp = (sub) => `/assignments/${A().id}/final-call${sub || ""}`;
    const fcs = G("[data-fc-start]"); if (fcs) fcs.onclick = () => {
      const f = fcOf(), n = new Set(S.d.quotes.filter((q) => q.final && q.saved).map((q) => q.supplier_name)).size;
      TP.modal("📨 فراخوانِ پیش‌فاکتورِ رسمی", `به ${M(n)} تأمین‌کنندهٔ تأییدنهایی پیامک می‌رود و ${M(f.cfg.window_h)} ساعت فرصتِ پیش‌فاکتورِ رسمی دارند${f.cfg.send_lowest ? " (با کمترین قیمتِ رسیده)" : ""}. جدول کمیسیون بعد از بسته شدنِ «📦 بستهٔ کمیسیون» ساخته می‌شود.`, async () => {
        try { const r = await TP.api(fcp(), { body: {} }); await reload(); okTick(`فراخوان رفت — ${M(r.sent)} پیامک${r.no_phone ? `، ${M(r.no_phone)} بی‌شماره` : ""}`); }
        catch (e) { TP.modal("📨 فراخوان", esc(e.message), null, "باشد", ""); }
      }, "📨 بفرست", "انصراف");
    };
    const fcc = G("[data-fc-close]"); if (fcc) fcc.onclick = () => TP.modal("⏹ پایانِ زودهنگام", "«📦 بستهٔ کمیسیون» همین حالا بسته شود؟ تأمین‌کننده‌ای که هنوز پیش‌فاکتورِ رسمی نفرستاده بی آن به کمیسیون می‌رود.", async () => {
      try { await TP.api(fcp("/close"), { body: {} }); await reload(); okTick("بستهٔ کمیسیون بسته شد"); } catch (e) { TP.modal("پایانِ زودهنگام", esc(e.message), null, "باشد", ""); }
    }, "بسته شود", "انصراف");
    Q("[data-fc-phone]").forEach((b) => b.onclick = () => {
      const name = b.dataset.fcPhone;
      const d = TP.modal("📱 شمارهٔ تأمین‌کننده", `<label class="tp-field"><b>شمارهٔ همراهِ «${esc(name)}»</b><input class="tp-input num" id="fcph" inputmode="tel" placeholder="۰۹۱۲۱۲۳۴۵۶۷" style="width:100%"></label>`, async () => {
        const phone = (d.querySelector("#fcph").value || "").trim(); if (!phone) return;
        try { const r = await TP.api(fcp("/phone"), { body: { supplier_name: name, phone } }); await reload(); okTick(r.state === "sent" ? "پیامک رفت" : "ثبت شد"); } catch (e) { TP.modal("شمارهٔ تأمین‌کننده", esc(e.message), null, "باشد", ""); }
      }, "ثبت و پیامک", "انصراف");
      setTimeout(() => { const i = d.querySelector("#fcph"); if (i) i.focus(); }, 30);
    });
    /* فایلِ پیش‌فاکتورِ رسمی با همان هدرِ ورود (پنجرهٔ تازه بی هدر باز نمی‌شود) */
    Q("[data-fc-file]").forEach((b) => b.onclick = async () => {
      const w = window.open("", "_blank");
      try {
        const res = await fetch((CFG.apiBase || "/tamin-poshtibani/api") + fcp(`/offpf/${b.dataset.fcFile}/file`), { headers: TP.authHeaders() });
        if (!res.ok) throw new Error(`خطای سرور ${res.status}`);
        const url = URL.createObjectURL(await res.blob());
        if (w) w.location = url; else location.href = url;
      } catch (e) { if (w) w.close(); TP.modal("پیش‌فاکتورِ رسمی", esc(e.message), null, "باشد", ""); }
    });
    Q("[data-fc-sms]").forEach((b) => b.onclick = async () => {
      try { const r = await TP.api(fcp("/phone"), { body: { supplier_name: b.dataset.fcSms } }); await reload(); okTick(r.state === "sent" ? "پیامک دوباره رفت" : "ثبت شد"); } catch (e) { TP.modal("پیامک", esc(e.message), null, "باشد", ""); }
    });
    Q("[data-fc-up]").forEach((b) => b.onclick = () => {
      const name = b.dataset.fcUp;
      const inp = document.createElement("input"); inp.type = "file"; inp.accept = "application/pdf,image/*";
      inp.onchange = async () => {
        const file = inp.files && inp.files[0]; if (!file) return;
        const busy = TP.busy("سنجشِ هوشمندِ پیش‌فاکتورِ رسمی", "…");
        try {
          const r = await uploadRaw(fcp(`/offpf?supplier=${encodeURIComponent(name)}&filename=${encodeURIComponent(file.name)}`), file);
          busy.close();
          fcVerdict(r, async (yes) => {
            try { await TP.api(fcp(`/offpf/${r.id}/decide`), { body: { replace: yes } }); await reload(); if (yes) okTick("پیش‌فاکتورِ رسمی ثبت شد"); } catch (e) { TP.modal("پیش‌فاکتورِ رسمی", esc(e.message), null, "باشد", ""); }
          });
        } catch (e) { busy.close(); TP.modal("پیش‌فاکتورِ رسمی", esc(e.message), null, "باشد", ""); }
      };
      inp.click();
    });
    const mc = G("[data-make-comm]"); if (mc) mc.onclick = async () => { try { await TP.api(`/assignments/${A().id}/commission`, { body: {} }); S.tab = "comm"; await reload(); okTick("جدول کمیسیون ساخته شد"); } catch (e) { TP.modal("تولید جدول کمیسیون", esc(e.message) + (e.data && e.data.missing && e.data.missing.length ? `<br><br>${e.data.missing.map((m) => `• ${esc(m.title)} (${m.n} از ${e.data.need})`).join("<br>")}` : ""), null, "باشد", ""); } };
    Q("[data-dl]").forEach((b) => b.onclick = () => downloadSheet(b.dataset.dl));
    Q("[data-zoom]").forEach((b) => b.onclick = () => { S.sheetZoom = Math.min(22, Math.max(6, (S.sheetZoom || 10) + +b.dataset.zoom)); render(); });
    const sn = G("[data-save-notes]");
    if (sn) sn.onclick = async () => {
      const box = G("[data-notes]"), msg = G("[data-notes-msg]");
      try {
        await TP.api(`/assignments/${A().id}/notes`, { method: "PUT", body: { notes: box.value } });
        A().notes = box.value; S.sheets = null;   /* پیش‌نمایش با توضیحات تازه از نو ساخته شود */
        msg.textContent = "ذخیره شد ✅";
        render();
      } catch (e) { msg.textContent = e.message; }
    };
    const pr = G("[data-print]"); if (pr) pr.onclick = printSheets;
    /* نامهٔ کمیسیون */
    const lStart = G("[data-lt-start]"); if (lStart) lStart.onclick = letterStart;
    const lAgain = G("[data-lt-again]"); if (lAgain) lAgain.onclick = letterStart;
    const lCancel = G("[data-lt-cancel]"); if (lCancel) lCancel.onclick = letterCancel;
    const lRec = G("[data-lt-rec]"); if (lRec) lRec.onclick = recStart;
    const lStop = G("[data-lt-stop]"); if (lStop) lStop.onclick = () => recStop(false);
    const lAbort = G("[data-lt-abort]"); if (lAbort) lAbort.onclick = () => recStop(true);
    const lFile = G("[data-lt-file]"); if (lFile) lFile.onclick = pickVoiceFile;
    const lTyped = G("[data-lt-typed]"); if (lTyped) lTyped.onclick = letterTyped;
    const lWrite = G("[data-lt-write]"); if (lWrite) lWrite.onclick = letterWrite;
    const lDl = G("[data-lt-dl]"); if (lDl) lDl.onclick = downloadLetter;
    Q("[data-lr-star]").forEach((b) => b.onclick = () => { const t = G("[data-lr-note]"); S.lrNote = t ? t.value : S.lrNote; S.lrStars = +b.dataset.lrStar; render(); });
    const lrN = G("[data-lr-note]"); if (lrN) lrN.oninput = () => { S.lrNote = lrN.value; };
    const lrS = G("[data-lr-save]"); if (lrS) lrS.onclick = () => saveLetterRate(lrS);
    const lrE = G("[data-lr-edit]"); if (lrE) lrE.onclick = () => { const L = letterFor() && letterFor().letter; S.lrEdit = L ? L.id : 0; S.lrStars = (L && L.rate && L.rate.stars) || 0; render(); };
    const gl = G("[data-goletter]"); if (gl) gl.onclick = () => { S.tab = "letter"; render(); };
    const rqc = G("[data-rqcomment]"); if (rqc) rqc.onclick = () => reqCommentUI();
    /* اصلاحِ نیمه‌کارهٔ متن نباید با تیک زدنِ اقلامِ موضوع (که بازرندر می‌کند) گم شود */
    const keepDraft = () => { const t = G("[data-lt-text]"), b = letterFor(); if (t && b && b.letter) { S.lt.draft = t.value; S.lt.draftFor = b.letter.id; } };
    const lText = G("[data-lt-text]"); if (lText) lText.oninput = keepDraft;
    Q("[data-lt-sub]").forEach((c) => c.onchange = () => {
      keepDraft();
      S.lt.sel = [...Q("[data-lt-sub]")].filter((x) => x.checked).map((x) => +x.dataset.ltSub);
      S.lt.selAid = A().id;
      render();
    });
  }

  /* «نظرِ کلی دربارهٔ کلِ مذاکرهٔ این درخواست» (تصمیم ۷؛ کلیدِ «جعبه‌های نقد»): ستاره و نظرِ کوتاهِ اجباری پیش از «خاتمه» (ai-rates.js) */
  function reqCommentUI(then) {
    let v = 0;
    const d = TP.modal("✍️ نظرِ کلی دربارهٔ کلِ مذاکره", `<p style="margin-top:0">کارشناس هوشمند در کلِ این درخواست چطور مذاکره کرد؟</p>
      <div class="toolrow" style="gap:6px;flex-wrap:wrap">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="tp-btn sm" data-rqs="${n}" aria-label="${M(n)} ستاره">${"⭐".repeat(n)}</button>`).join("")}</div>
      <textarea class="tp-input" data-rqn style="width:100%;min-height:80px;margin-top:8px" maxlength="400" placeholder="نظرِ کوتاهِ شما (اجباری)"></textarea>
      <div data-rqerr style="color:#fca5a5;min-height:1.2em;font-size:.88rem"></div>
      <div class="toolrow" style="margin-top:6px"><button type="button" class="tp-btn primary" data-rqsave>ثبتِ نظر</button>${TP.ui.info("expert.ai", "امتیاز به کارشناس هوشمند")}</div>`, null, "انصراف", "");
    d.querySelectorAll("[data-rqs]").forEach((b) => b.onclick = () => { v = +b.dataset.rqs; d.querySelectorAll("[data-rqs]").forEach((x) => x.classList.toggle("primary", +x.dataset.rqs === v)); });
    d.querySelector("[data-rqsave]").onclick = async () => {
      const note = d.querySelector("[data-rqn]").value.trim(), err = d.querySelector("[data-rqerr]");
      if (!v) { err.textContent = "ستاره‌ها را انتخاب کنید."; return; }
      if (note.length < 3) { err.textContent = "نظرتان را بنویسید — کوتاه و اجباری."; return; }
      try {
        await TP.api("/sp/x/rate", { body: { kind: "request", assignment_id: A().id, stars: v, note } });
        d.remove(); await reload(); okTick("نظرِ کلی ثبت شد");
        if (then) then();
      } catch (e) { err.textContent = e.message; }
    };
    setTimeout(() => { const t = d.querySelector("[data-rqn]"); if (t) t.focus(); }, 30);
  }
  /* ⭐ «خاتمه» تا امتیازها کامل نشده معلق است: پیامِ روشن با راهِ رسیدن به همان‌ها */
  function rateGate(g) {
    /* فقط «نظرِ کلی» مانده: همان‌جا بنویسد و «خاتمه» ادامه یابد */
    if (g.request && g.total === 1) return reqCommentUI(() => doExpertAct("end"));
    TP.modal("⭐ «خاتمه» معلق است", `<p>پیش از «خاتمه» به کارِ کارشناس هوشمند امتیاز بدهید: <b>${rateGapText(g)}</b> هنوز ستاره ندارد.</p>
      <p class="dim" style="font-size:.9rem">پیام‌ها و کلِ هر مکاتبه در «💬 مکاتبات» (نشانگر را روی پیامِ 🤖 نگه دارید)؛ نامه در تب «نامهٔ کمیسیون». کمتر از سه ستاره برای پیام، و هر امتیازِ مکاتبه و نامه، نظر می‌خواهد.</p>`,
      () => { location.href = "correspond"; }, "💬 رفتن به مکاتبات", "بعداً");
  }
  function doExpertAct(act) {
    const g = rateGaps();
    if (act === "end" && g && g.total) return rateGate(g);
    const its = items(), n = its.length, done = its.filter((i) => i.commission_ok && i.state === "open");
    const lbl = { hold: "تعلیق", stop: "توقف", end: "خاتمه" }[act];
    let body = "";
    if (act === "end") body = done.length === openItems().length ? `پشتیبانی کمیسیونِ هر <b>${done.length}</b> قلم باز را تأیید کرده است.<br><br>این اقلام <b>«بسته شده»</b> ثبت می‌شوند و درخواست از کارتابل شما خارج می‌شود.`
      : `کمیسیونِ <b>${done.length}</b> قلم از <b>${n}</b> قلم را پشتیبانی تأیید کرده است:<br><br>${done.map((i) => "• " + esc(i.title)).join("<br>")}<br><br>این اقلام بسته می‌شوند و از کارتابل خارج می‌شوند؛ باقی اقلام همچنان پیگیری می‌شوند (خاتمهٔ جزئی).`;
    else body = `با این کار پایش و اعلان این درخواست متوقف می‌شود و از کارتابل شما خارج می‌شود.`;
    body += `<br><br><div class="tp-note" style="margin:0">${settings().approvalRequired ? "چون مدیر گزینهٔ «تصمیم کارشناس منوط به تأیید من» را فعال کرده، این درخواست ابتدا برای <b>تأیید مدیر</b> می‌رود و تا تأیید او اعمال نمی‌شود." : "تصمیم بلافاصله اعمال می‌شود و برای مدیر ثبت می‌شود."} نتیجه در تلگرام هم می‌آید.</div>`;
    TP.modal(`${lbl} — درخواست ${esc(S.d.request.id)}`, body, async () => {
      try { const r = await TP.api(`/assignments/${A().id}/decision`, { body: { action: act, item_ids: act === "end" ? done.map((i) => i.id) : null } });
        if (r.pending) { await reload(); okTick("برای تأیید مدیر رفت"); }
        else { okTick(`${lbl} ثبت شد`); S.screen = "list"; TP.ui.resetOnce("exp.tray"); TP.ui.resetOnce("exp.team"); S.d = null; await loadTray(); } }
      catch (e) { if (e.data && e.data.rate_gaps) return rateGate(e.data.rate_gaps); TP.modal("خطا", esc(e.message), null, "باشد", ""); }
    }, `تأیید ${lbl}`);
  }

  /* ---------- شروع ---------- */
  /* مینی‌اپ تلگرام: کارشناس با initData همان بات شناخته می‌شود و کد ورود لازم نیست (shared.js: TP.tg) */
  /* کارشناس ارشد (طبق آخرین ورود): «تیم» هم‌زمان با کارتابل، نه یک رفت‌وبرگشتِ شبکه بعد از آن */
  if (S.expert || TP.tg) { S.screen = "list"; TP.ui.resetOnce("exp.tray"); TP.ui.resetOnce("exp.team"); loadTray(); if (isSenior()) loadTeam(true); } else render();
  window.addEventListener("tp-theme", render);
  /* اعلانِ پیامِ تازهٔ تأمین‌کننده در گوشهٔ صفحه (مهر ۱۴۰۵) — فقط یک لایهٔ شناور است و صفحه را دوباره نمی‌سازد؛
     کلیکش صفحهٔ مکاتبات را روی همان گفت‌وگو باز می‌کند (shared.js: TP.inbox) */
  TP.inbox.start({ active: () => !!S.expert, onAsks: (k) => { if (k !== (S.asks || 0)) { S.asks = k; if (S.screen !== "login") render(); } }, onAi: aiChanged });
  /* «🤖 هوشمند / ✋ دستی»ِ پنل پشتیبانی، تیکِ مدیر روی ارجاع، «انجام دستی»ِ تأییدشده یا ردِ تحویل (worker/ai-lock.js:aiRevStmt) — همان لحظه، بی
     «به‌روزرسانی» (مهر ۱۴۰۵، درخواست مالک): کارتابل یا صفحهٔ درخواست دوباره خوانده می‌شود اگر کارشناس وسطِ نوشتن یا پنجره‌ای نیست (همان
     نگهبانِ بازخوانیِ خودکار، ui.js:idle)، وگرنه نوارِ «🔄 حالتِ کار عوض شد — ↻» تا خودش بزند */
  function aiChanged(ai) {
    if (!S.expert) return;
    if (ai && ai.mode && S.expert.ai !== ai.mode) { S.expert.ai = ai.mode; TP.session.set(S.expert); }
    if (S.screen !== "list" && !(S.screen === "detail" && S.d)) return;
    if (!TP.ui.idle()) return aiStale(true);
    return S.screen === "detail" ? reload() : loadTray();
  }
  function aiStale(on) {
    let b = document.getElementById("ai-stale");
    if (!on) { if (b) b.remove(); return; }
    if (b) return;
    b = document.createElement("div"); b.id = "ai-stale"; b.className = "tp-ai-stale"; b.setAttribute("role", "status");
    b.innerHTML = `<span>🔄 حالتِ کار عوض شد</span><span class="dim">—</span><button type="button" class="tp-btn sm primary" title="تازه کردنِ همین صفحه">↻</button>`;
    b.querySelector("button").onclick = () => { aiStale(false); return S.screen === "detail" && S.d ? reload() : loadTray(); };
    document.body.appendChild(b);
  }
  /* کارِ کارشناس روی صفحهٔ کهنه: ۴۲۳ با ai_locked (حالا دستِ کارشناس هوشمند است) یا ۴۰۹ با ai_mode (دیگر هوشمند نیست) — همان لحظه دوباره
     خوانده می‌شود؛ پیامِ خطا را خودِ همان کار نشان می‌دهد (shared.js: TP.onApiError) */
  let aiReloading = false;
  TP.onApiError = (e) => {
    if (!e || !e.data || !(e.data.ai_locked || e.data.ai_mode) || aiReloading || !S.expert) return;
    aiReloading = true;
    setTimeout(async () => { try { if (S.screen === "detail" && S.d) await reload(); else if (S.screen === "list") await loadTray(); } finally { aiReloading = false; } }, 0);
  };
  /* بازخوانیِ خودکارِ بی‌پرش (خواستهٔ مالک، مهر ۱۴۰۵): فقط کارتابل و تیم، هر دقیقه، وقتی کارشناس وسطِ نوشتن یا پنجره‌ای نیست.
     صفحهٔ درخواست همچنان فقط با کارِ خودِ کارشناس یا «به‌روزرسانی» تازه می‌شود (تصمیم مدیر، شهریور ۱۴۰۵) تا وسط پر کردن چیزی جابه‌جا نشود —
     جز تغییرِ «🤖 هوشمند / ✋ دستی» (aiChanged بالا، با همان نگهبان). */
  TP.ui.autoRefresh(() => (S.tab === "team" ? loadTeam(true) : loadTray()), 60000, () => !!S.expert && S.screen === "list" && !LIST_TABS.includes(S.tab === "team" ? "" : S.tab));
})();
