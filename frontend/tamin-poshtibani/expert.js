/* ============================================================
   پنل کارشناس خرید
   ورود با کد → کارتابل (ارجاع‌های ارسال‌شده به این کارشناس) → جزئیات درخواست
   با پنج تب: بررسی سوابق · جستجوی هوشمند · استعلامات · جدول کمیسیون ·
   نامهٔ کمیسیون (صدا → متن → نامهٔ رسمی؛ همان مسیر بات تلگرام)

   استعلامات و جدول کمیسیون واقعی و ذخیره‌شده‌اند (D1). سوابق و جستجوی
   هوشمند و ارسال پیام، زیرساخت‌شان (UI + endpoint) هست و تا اتصال منبع
   داده، برچسب «در انتظار اتصال» دارند؛ کارشناس می‌تواند مرحله را دستی
   «انجام‌شده» علامت بزند تا پایش مدیر کار کند.
   ============================================================ */
(function () {
  "use strict";
  const CFG = window.TAMIN_POSHTIBANI_CONFIG, TP = window.TP;
  const esc = TP.esc, M = TP.M, DAY = TP.DAY;
  const COMPANY = CFG.company || "تونل سد آریانا";
  const PLATS = [["telegram", "تلگرام"], ["whatsapp", "واتساپ"], ["bale", "بله"], ["rubika", "روبیکا"]];
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
    hsort: "m",                           // ستون مرتب‌سازی جدول سوابق: m (گشتاور) | qty | n
    mom: 5,                               // ضریب اهمیت گشتاور (۱ تا ۱۰) — از localStorage پر می‌شود
    prof: null,                           // کلید تأمین‌کننده‌ای که کارتش باز است
    smBy: {},                              // قیدهای جستجوی هوشمند، برای هر قلم: {markets, brand, specs, notes}
    smProf: null,                          // تأمین‌کنندهٔ بازشده در نتایج جستجو
    team: null,                            // تب «تیم کارشناسی» کارشناس ارشد: {team, requests}
    teamCard: "all",                       // کارتِ انتخاب‌شده در تب تیم: شناسهٔ کارشناس یا "all"
    teamOpen: {},                          // کشوی اقلام هر درخواست در تب تیم
    marketsMeta: [{ key: "IR", fa: "ایران" }, { key: "TJ", fa: "تاجیکستان" }, { key: "TM", fa: "ترکمنستان" }, { key: "UZ", fa: "ازبکستان" }, { key: "KZ", fa: "قزاقستان" }, { key: "AM", fa: "ارمنستان" }, { key: "CN", fa: "چین" }, { key: "AE", fa: "امارات" }, { key: "TR", fa: "ترکیه" }],
    templates: [], tpl: 0,
    hist: {}, smart: {}, series: {},   // پاسخ endpointها برای هر قلم؛ series = نقاط نمودار
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
  function vLogin() {
    return `<div class="tp-card tp-login"><h2>ورود کارشناس خرید</h2><p>کد کارشناسی خود را وارد کنید.</p>
      <input id="code" class="tp-input" inputmode="numeric" maxlength="6" autocomplete="off" autofocus>
      <button class="tp-btn primary" data-login style="width:100%;margin-top:14px">ورود</button>
      <div class="err">${esc(S.error)}</div><a class="tp-back" href="index.html">← بازگشت به تدارکات</a></div>`;
  }
  const dateList = () => String(S.q.date || "").split("،").map((s) => s.trim()).filter(Boolean);
  function trayRows() {
    return S.tray.filter((a) => TP.hit(a.request_id, S.q.id) && (!dateList().length || dateList().includes(a.date)) && TP.hit(a.party, S.q.party));
  }
  /* ساعت کاری مانده تا مهلت — منفی یعنی مهلت گذشته */
  const trayLeft = (a) => TP.budget(a.dispatched_at, a.days || 1) - TP.wh(a.dispatched_at, S.now);
  /* نوار تب‌های صفحهٔ کارشناس: کارتابل، (ارشد: تیم کارشناسی و تنظیم اعلانات)، و «حساب من» برای همه */
  const LIST_TABS = ["team", "alerts", "account"];
  function vSeniorTabs() {
    const T = [["tray", "کارتابل من"], ...(isSenior() ? [["team", "تیم کارشناسی"], ["alerts", "تنظیم اعلانات"]] : []), ["account", "حساب من"]];
    return `<div class="tp-tabs" style="padding-top:12px">${T.map(([k, l]) => `<button class="tp-tab ${(S.tab === k || (k === "tray" && !LIST_TABS.includes(S.tab))) ? "on" : ""}" data-stab="${k}">${l}${k === "team" && S.team ? `<span class="cnt">${S.team.requests.length}</span>` : ""}</button>`).join("")}</div>`;
  }
  /* باکس‌های تب تیم با آستانه‌های تیم (ارشد اگر گذاشته، وگرنه مدیر) — جدا از آستانه‌های کارتابل خودش */
  const teamThr = () => ((S.team && S.team.settings) || settings()).thresholds;

  /* ---------- حساب من: کد ورود (رمز پنل) ---------- */
  function vAccount() {
    const e = S.expert, tg = S.tg || {};
    const k = (lab, val) => `<div class="k"><b>${lab}</b><span style="font-size:.95rem">${val}</span></div>`;
    return `<div class="tp-wrap"><div class="tp-card tp-pane"><h2>حساب من</h2>
      <div class="kpi">${k("نام", esc(e.name))}${k("نام کوتاه", esc(e.label || e.name))}${k("نقش", isSenior() ? "کارشناس ارشد" : "کارشناس خرید")}
        ${tg.botConfigured ? k("تلگرام کارشناسی", tg.connected ? "✅ وصل" : "وصل نیست") : ""}${isSenior() ? k("تلگرام تیمی", e.team_connected ? "✅ وصل" : "وصل نیست") : ""}</div>
      <div class="tp-sect"><h3>تغییر کد ورود</h3>
        <p class="lead">کد ورود، رمز پنل شماست: ۴ تا ۸ رقم. بعد از تغییر، همین مرورگر وارد می‌ماند و دفعهٔ بعد با کد تازه وارد می‌شوید. مدیر هم هر وقت لازم باشد می‌تواند کد شما را عوض کند.</p>
        <div class="tp-fields3">
          <div class="tp-field"><b>کد فعلی</b><input class="tp-input" id="acc-cur" type="password" inputmode="numeric" autocomplete="current-password"></div>
          <div class="tp-field"><b>کد تازه</b><input class="tp-input" id="acc-new" type="password" inputmode="numeric" autocomplete="new-password"></div>
          <div class="tp-field"><b>تکرار کد تازه</b><input class="tp-input" id="acc-rep" type="password" inputmode="numeric" autocomplete="new-password"></div>
          <div style="padding-bottom:2px"><button class="tp-btn primary" data-acc-save>تغییر کد</button></div></div>
        <div id="acc-msg" style="min-height:22px;font-size:.9rem"></div></div></div></div>`;
  }
  async function saveCode() {
    const G = (s) => document.querySelector(s), msg = G("#acc-msg");
    const say = (t, bad) => { msg.textContent = t; msg.style.color = bad ? "#fca5a5" : "#6ee7b7"; };
    const digits = (s) => String(s || "").trim().replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
    const cur = digits(G("#acc-cur").value), nw = digits(G("#acc-new").value), rp = digits(G("#acc-rep").value);
    if (!cur) return say("کد فعلی را بنویسید.", true);
    if (!/^\d{4,8}$/.test(nw)) return say("کد تازه باید ۴ تا ۸ رقم باشد.", true);
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
    /* مرتب‌سازی با مهلت باقی‌مانده: کم‌ترین ساعت کاری بالا (تمام‌شده‌ها اول) */
    if (S.traySort) rows.sort((x, y) => trayLeft(x) - trayLeft(y));
    const teamCol = isSenior() && (S.team ? S.team.team : []).length;
    return `${vSeniorTabs()}<div class="tp-wrap" style="padding-bottom:20px"><div class="tp-card">
      <div class="tp-filters" style="border-top:0;border-radius:16px 16px 0 0">
        <span class="lab">شماره درخواست</span><input class="tp-input ${S.q.id ? "on" : ""}" data-q="id" value="${esc(S.q.id)}" style="width:120px">
        <span class="lab">تاریخ</span><input class="tp-input date ${S.q.date ? "on" : ""}" data-q="date" value="${esc(S.q.date)}" placeholder="انتخاب تاریخ" readonly style="width:170px">
        <span class="lab">طرف مقابل</span><input class="tp-input ${S.q.party ? "on" : ""}" data-q="party" value="${esc(S.q.party)}" style="width:190px">
        <button class="tp-btn sm" data-clr>پاک کردن</button>
        <span class="end">${rows.length} از ${S.tray.length} · خاتمه‌یافته، معلق و متوقف در کارتابل نیستند</span></div>
      <div class="tp-scroll" style="border:0;border-radius:0 0 16px 16px"><table class="tp-table" style="width:100%"><thead><tr>
        <th>شماره درخواست</th><th>تاریخ</th><th class="rt">طرف مقابل</th><th>اقلام باز</th><th>مهلت</th>
        <th><button class="sortbtn ${S.traySort ? "on" : ""}" data-tsort title="${S.traySort ? "برگشت به ترتیب ارسال" : "مرتب‌سازی با مهلت باقی‌مانده — نزدیک‌ترین مهلت بالا"}">${S.traySort ? "✓ مرتب با مهلت" : "⇅ مرتب با مهلت"}</button>باقی‌مانده</th><th>پیشرفت</th><th>استعلام</th>${teamCol ? `<th>ارجاع به تیم</th>` : ""}</tr></thead><tbody>
        ${rows.map((a) => { const b = TP.budget(a.dispatched_at, a.days || 1), el = TP.wh(a.dispatched_at, S.now), lf = Math.max(0, b - el);
          const done = [!!a.viewed_at, a.hist_count > 0, a.smart_count > 0, a.quote_count > 0, a.proforma_count > 0, !!a.commission_at];
          return `<tr data-req="${a.id}" style="cursor:pointer"><td class="id num">${esc(a.request_id)}</td><td class="num">${esc(a.date)}</td><td class="party">${esc(a.party)}</td>
            <td class="num">${a.open_count} از ${a.item_count}</td><td class="num">${a.days} روز</td>
            <td class="num" style="${lf <= 0 ? "color:#fca5a5;font-weight:700" : ""}">${lf <= 0 ? "تمام شد" : lf.toFixed(1) + " ساعت کاری"}</td>
            <td>${boxes(a, done, true, true)}</td><td class="num">${a.quote_count}</td>${teamCol ? `<td data-stop><button class="tp-btn xs" data-delegate="${a.id}" title="این درخواست به یکی از کارشناسان تیم داده شود">ارجاع به تیم</button></td>` : ""}</tr>`; }).join("")}
        ${rows.length ? "" : `<tr><td colspan="${teamCol ? 9 : 8}"><div class="empty">درخواستی در کارتابل شما نیست.</div></td></tr>`}
      </tbody></table></div></div></div>`;
  }

  /* ---------- تیم کارشناسی (کارشناس ارشد) ----------
     همان ردیف‌های میز مدیر، فقط برای زیرمجموعه‌های او: کارت هر کارشناس بالا، «همه» هم هست. */
  async function loadTeam(quiet) {
    try { const t = await TP.api("/team"); S.team = t; S.now = Date.now(); }
    catch (e) { if (!quiet) TP.modal("خطا", esc(e.message), null, "باشد", ""); S.team = S.team || { team: [], requests: [] }; }
    render();
  }
  const teamRows = () => {
    const R = (S.team && S.team.requests) || [];
    if (S.teamCard === "all") return R;
    return R.map((r) => ({ ...r, assignments: r.assignments.filter((a) => a.expert_id === +S.teamCard) })).filter((r) => r.assignments.length);
  };
  function teamStageBoxes(r, a) {
    const its = r.items.filter((i) => i.assignment_id === a.id);
    const A = { dispatchedAt: a.dispatched_at, days: a.days, active: !!a.dispatched_at && its.some((i) => i.state === "open"),
      done: [!!a.viewed_at, its.some((i) => i.hist_done_at), its.some((i) => i.smart_done_at), a.quote_count > 0, a.proforma_count > 0, !!a.commission_at] };
    return TP.STAGES.map((s, i) => `<td class="console"><div class="box b-${TP.stageColor(A, i, teamThr(), S.now)}" title="${s}">${i === 3 && a.quote_count ? `<span class="cnt">${a.quote_count}</span>` : i === 4 && a.proforma_count ? `<span class="cnt">${a.proforma_count}</span>` : ""}</div></td>`).join("");
  }
  function vTeam() {
    if (!S.team) { loadTeam(); return `<div class="tp-wrap"><div class="empty">در حال خواندن تیم…</div></div>`; }
    const team = S.team.team || [], R = S.team.requests || [];
    if (!team.length) return `<div class="tp-wrap"><div class="tp-card tp-pane"><h2>تیم کارشناسی</h2><p class="lead">هنوز کارشناسی زیر نظر شما نیست. مدیر در تب «کارشناسان» پنل خودش، کارشناسان تیم شما را تیک می‌زند.</p></div></div>`;
    const cnt = (eid) => R.reduce((n, r) => n + r.assignments.filter((a) => eid === "all" || a.expert_id === eid).length, 0);
    const cards = [["all", "همه"], ...team.map((e) => [e.id, e.label || e.name])].map(([k, l]) =>
      `<div class="pill ${String(S.teamCard) === String(k) ? "sel" : ""}" style="min-width:150px"><span class="t" data-tcard="${k}">${esc(l)}</span><span class="m num">${M(cnt(k === "all" ? "all" : +k))} درخواست</span></div>`).join("");
    const rows = teamRows();
    let h = `<div class="tp-wrap" style="padding-bottom:20px"><div class="tp-card">
      <div class="strip">${cards}</div>
      <div class="tp-scroll" data-keep-scroll style="border:0;border-radius:0 0 16px 16px;max-height:calc(100vh - 300px)"><table class="tp-table"><thead>
        <tr class="group"><th colspan="6">داده فایل ورودی</th><th colspan="2" class="sep">ارجاع</th><th colspan="7" class="console sep">پایش مراحل</th><th colspan="2" class="sep">اقدام</th></tr>
        <tr><th class="stick"></th><th>شماره<br>درخواست</th><th>تاریخ</th><th>تاریخ نیاز</th><th class="rt">طرف مقابل</th><th>اقلام</th>
          <th class="sep">کارشناس</th><th>مهلت</th><th class="console sep">ارسال</th>${TP.STAGES.map((s) => `<th class="console">${s.replace(" ", "<br>")}</th>`).join("")}
          <th class="sep">وضعیت</th><th>پنل</th></tr></thead><tbody>`;
    for (const r of rows) {
      const need = r.items.map((i) => i.need_date).filter(Boolean).sort()[0] || "";
      r.assignments.forEach((a, k) => {
        const its = r.items.filter((i) => i.assignment_id === a.id), rs = k === 0 ? ` rowspan="${r.assignments.length}"` : "";
        const live = its.some((i) => i.state === "open"), st = live ? (a.dispatched_at ? "در جریان" : "ارسال‌نشده") : (its.some((i) => i.state === "hold") ? "معلق" : its.some((i) => i.state === "stop") ? "متوقف" : "بسته شده");
        h += `<tr>${k === 0 ? `<td class="stick"${rs}><button class="tp-btn xs" data-ttoggle="${esc(r.id)}">${S.teamOpen[r.id] ? "▾" : "◂"} ${r.items.length}</button></td>
            <td class="id num"${rs}>${esc(r.id)}</td><td class="num"${rs}>${esc(r.date)}</td><td class="num"${rs}>${esc(need)}</td>
            <td class="party"${rs}>${esc(r.party)}${r.center ? `<div class="dim" style="font-size:.75rem">${esc(r.center)}</div>` : ""}</td>
            <td class="item"${rs}><div style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.items.map((i) => i.title).join(" · "))}">${esc(r.items[0] ? r.items[0].title : "")}</div>${r.items.length > 1 ? `<div class="dim" style="font-size:.75rem">و ${r.items.length - 1} قلم دیگر</div>` : ""}</td>` : ""}
          <td class="sep"><b>${esc(a.expert_label || a.expert_name)}</b></td><td class="num">${a.days ? a.days + " روز" : "—"}</td>
          <td class="console sep"><div class="box b-${a.dispatched_at ? "done" : "idle"}" title="${a.dispatched_at ? "ارسال شد " + TP.fmt(a.dispatched_at) : "ارسال‌نشده"}"></div></td>${teamStageBoxes(r, a)}
          <td class="sep"><span class="st ${live ? (a.dispatched_at ? "st-run" : "st-reg") : "st-cls"}">${st}</span></td>
          <td style="white-space:nowrap"><button class="tp-btn xs" data-req="${a.id}">مشاهده</button> <button class="tp-btn xs" data-delegate="${a.id}" data-from="${a.expert_id}">تغییر کارشناس</button></td></tr>`;
      });
      if (S.teamOpen[r.id]) h += `<tr class="drawer"><td colspan="17"><div class="drawer-in"><table><thead><tr><th>#</th><th>کد قلم</th><th>عنوان</th><th>مشخصه فنی</th><th>مقدار</th><th>واحد</th><th>تاریخ نیاز</th><th>وضعیت</th><th>توضیحات</th></tr></thead><tbody>
        ${r.items.map((i) => `<tr><td class="num">${i.line_no}</td><td class="num">${esc(i.code || "")}</td><td>${esc(i.title)}</td><td class="dim">${esc(i.spec || "")}</td><td class="num">${i.qty == null ? "" : M(i.qty)}</td><td>${esc(i.unit || "")}</td><td class="num">${esc(i.need_date || "")}</td><td><span class="st ${TP.STATES[i.state].cls}">${TP.STATES[i.state].label}</span></td><td class="dim">${esc(i.note || "")}</td></tr>`).join("")}</tbody></table></div></td></tr>`;
    }
    if (!rows.length) h += `<tr><td colspan="17"><div class="empty">درخواستی برای این کارشناس نیست.</div></td></tr>`;
    return h + `</tbody></table></div></div></div>`;
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
          if (S.screen === "detail") { S.screen = "list"; S.d = null; S.tab = "team"; S.fromTeam = false; }
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
      <p class="lead">تیکِ بالای هر مرحله یعنی تغییر وضعیت آن مرحله برای کارشناسان تیم شما در «تلگرام تیمی» اعلام شود. هر درصد یعنی چند درصد از مهلتِ کارشناس باید بگذرد تا اگر آن مرحله انجام نشده باشد، هشدار برود و باکسش زرد شود. خالی = هشدار آن مرحله خاموش. عبور از مهلت و بسته شدن درخواست همیشه اعلام می‌شود.</p>
      <div class="tp-grid6">${TP.STAGES.map((st, i) => `<div class="cell"><label title="اعلان این مرحله در تلگرام تیمی"><input type="checkbox" data-sstage="${i}" ${ticks[i] ? "checked" : ""}> <b>${st}</b></label>
        <input class="tp-input" data-sthr="${i}" value="${thr[i] === "" || thr[i] == null ? "" : thr[i]}" inputmode="numeric" placeholder="خالی"></div>`).join("")}</div>
      <div id="sthrErr" style="color:#fca5a5;min-height:20px;font-size:.88rem"></div>
      <div class="tp-row" style="align-items:center;gap:10px">
        ${own ? `<span class="chip ok">آستانه‌های شما برای تیم فعال است</span><button class="tp-btn sm" data-sthr-reset>بازگشت به آستانه‌های مدیر (${esc(mgr.map((x) => (x === "" ? "—" : M(x))).join("، "))})</button>`
          : `<span class="chip">اکنون همان آستانه‌های مدیر برقرار است؛ با تغییر هر درصد، آستانه‌های شما جایگزین می‌شود</span>`}
        <span class="dim" data-sthr-saved style="font-size:.85rem"></span></div>
      <div class="tp-sect"><h3>تلگرام تیمی <span>${S.expert.team_connected ? "✅ وصل است" : "هنوز وصل نیست"}</span></h3>
        <p class="lead">اعلان‌های پایش کارشناسان تیم شما — همان پیام‌هایی که برای مدیر واحد می‌رود — ${tg.teamBot ? `با بات <b dir="ltr">@${esc(tg.teamBot)}</b>` : "با بات تیمی"} برای شما فرستاده می‌شود. ارجاع‌های خودتان همچنان در «تلگرام کارشناسی» می‌آید.</p>
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
  function vEndBar() {
    const a = A(), its = items(), n = its.length, k = its.filter((i) => i.commission_ok).length, o = openItems().length;
    const pend = S.d.pendingDecisions.length;
    return `<div class="endbar">
      <span class="st ${o ? "st-run" : "st-cls"}">${o ? "در جریان" : "بدون قلم باز"}</span>
      <span class="muted" style="font-size:.88rem">${k} از ${n} قلم را کمیسیون تأیید کرده${o < n ? ` · ${n - o} قلم بسته/متوقف` : ""}</span>
      <span style="margin-inline-start:auto"></span>
      ${pend ? `<span class="chip warn">در انتظار تأیید مدیر (${pend})</span>` : settings().approvalRequired ? `<span class="chip warn">تصمیم شما نیاز به تأیید مدیر دارد</span>` : ""}
      <button class="tp-btn sm" data-tpl>قالب‌های پیام</button>
      <button class="tp-btn sm warn" data-eact="hold" ${o ? "" : "disabled"}>تعلیق</button>
      <button class="tp-btn sm danger" data-eact="stop" ${o ? "" : "disabled"}>توقف</button>
      <button class="tp-btn sm primary" data-eact="end" ${k ? "" : "disabled"}>خاتمه (${k} قلم)</button>
      ${a.commission_at ? "" : ""}</div>`;
  }
  function vDetail() {
    const a = A(), r = S.d.request, its = items(), it = item();
    const mine = a.expert_id === S.expert.id;
    const b = TP.budget(a.dispatched_at, a.days || 1), el = TP.wh(a.dispatched_at, S.now), pct = b ? Math.min(100, Math.round(el / b * 100)) : 0;
    const dl = TP.endN(a.dispatched_at, a.days || 1), left = Math.max(0, b - el), dd = new Date(dl);
    const done = flagsOf(a, its, qCount(), pCount());
    return `<div class="tp-wrap" style="padding-bottom:24px"><div class="tp-card">
      <div class="head"><div><button class="tp-btn sm" data-back>→ کارتابل</button>${mine ? "" : `<div class="chip warn" style="margin-top:6px">ارجاعِ ${esc(a.expert_label || a.expert_name)} — فقط‌خواندنی</div>${isSenior() ? ` <button class="tp-btn xs" data-delegate="${a.id}" data-from="${a.expert_id}" title="این درخواست به کارشناس دیگری از تیم شما (یا خودتان) داده شود" style="margin-top:6px">تغییر کارشناس</button>` : ""}`}</div>
        <div><h2>درخواست <span class="num">${esc(r.id)}</span></h2>
          <div class="kpi" style="margin-top:8px"><div class="k" style="text-align:right;min-width:auto;max-width:360px"><b>طرف مقابل</b><span style="font-size:.9rem;font-weight:500">${esc(r.party)}</span></div>
            <div class="k"><b>اقلام</b><span>${its.length}</span></div><div class="k"><b>تاریخ ثبت</b><span class="num" style="font-size:.95rem">${esc(r.date)}</span></div>
            ${r.urgency ? `<div class="k"><b>فوریت</b><span style="font-size:.9rem;color:#fcd34d">${esc(r.urgency)}</span></div>` : ""}</div></div>
        <div class="right"><div style="display:flex;justify-content:flex-end">${boxes({ ...a, quote_count: qCount(), proforma_count: pCount() }, done, openItems().length > 0)}</div>
          <div class="kpi" style="margin-top:8px;justify-content:flex-end"><div class="k"><b>سپری‌شده</b><span>${pct}٪</span></div><div class="k"><b>ساعت کاری مانده</b><span>${left.toFixed(1)}</span></div>
            <div class="k" style="background:rgba(79,140,255,.14);border-color:var(--tp-accent)"><b>مهلت تحویل</b><span style="font-size:.95rem">${TP.WD[dd.getDay()]} ${TP.fmtD(dl)}</span></div></div></div></div>
      ${vEndBar()}
      <div class="strip">${its.map((x, i) => `<div class="pill ${i === S.itemIdx ? "sel" : ""} ${x.state !== "open" ? "closed" : ""}">
        <span class="t" data-item="${i}" title="${esc(x.title)}">${esc(x.title)}</span><span class="m num">${x.qty == null ? "" : M(x.qty)} ${esc(x.unit)}${x.code ? ` · ${esc(x.code)}` : ""}</span>
        ${x.state !== "open" ? `<span class="st ${TP.STATES[x.state].cls}" style="margin-top:6px;display:inline-block">${TP.STATES[x.state].label}</span>` : `<label><input type="checkbox" data-idone="${x.id}" ${x.commission_ok ? "checked" : ""}> تأیید کمیسیون</label>`}</div>`).join("")}</div>
      <div class="tabs">
        <button class="tab ${S.tab === "history" ? "on" : ""}" data-tab="history">بررسی سوابق</button>
        <button class="tab ${S.tab === "smart" ? "on" : ""}" data-tab="smart">جستجوی هوشمند</button>
        <button class="tab ${S.tab === "quotes" ? "on" : ""}" data-tab="quotes">استعلامات<span class="cnt">${qCount()}</span></button>
        <button class="tab ${S.tab === "comm" ? "on" : ""}" data-tab="comm">جدول کمیسیون</button>
        <button class="tab ${S.tab === "letter" ? "on" : ""}" data-tab="letter">نامهٔ کمیسیون</button></div>
      ${!it ? `<div class="empty">قلمی ندارد.</div>` : S.tab === "history" ? vHistory(it) : S.tab === "smart" ? vSmart(it) : S.tab === "quotes" ? vQuotes() : S.tab === "letter" ? vLetter() : vComm()}
    </div></div>`;
  }

  /* ---------- تب بررسی سوابق ----------
     دو حالت (Task.txt، مهر ۱۴۰۵): «عین قلم» — همان نوع قلم با دقیقاً همان لایه‌های
     ویژگی — و «نوع قلم» — همهٔ اقلام همان نوع. ساختار قلم (نوع و لایه‌ها) یا از فهرست
     اقلام می‌آید (کد راهکاران)، یا با تیک «نرمال‌سازی اقلام» پیشنهاد و با تأیید
     کارشناس ثبت می‌شود؛ نرخ‌های تبدیل واحد همان‌جا قابل ویرایش‌اند.
     مبنای مقایسهٔ تأمین‌کنندگان (تصمیم مدیر) سه ستون است، نه قیمت: دفعات خرید، جمع
     مقدار (به واحد مرجع) و «گشتاور» — همان جمع مقدار وقتی خریدِ تازه‌تر سنگین‌تر
     شمرده شود (شیب از نوار ۱..۱۰). در امتیاز برابر، ردهٔ بالاتر (A، B، C) جلوتر است.
     رتبه‌ها را سرور می‌سازد تا پنل و بات تلگرام یک عدد بگویند. قیمت‌ها (به زمستان
     ۱۴۰۴) فقط در ریز خریدها و کارت تأمین‌کننده‌اند. گروه «خرید قلم در پروژه» تا رسیدن
     ستون پروژه به فایل مرجع خاموش است. */
  /* حالت جستجو یادداشت نمی‌شود: هر بار صفحه با «نوع قلم» باز می‌شود (تصمیم مدیر، مهر ۱۴۰۵) */
  const MOM_KEY = "tp.mom", NORM_KEY = "tp.norm";
  try {
    S.mom = Math.min(10, Math.max(1, +(localStorage.getItem(MOM_KEY) || 5)));
    S.normOn = localStorage.getItem(NORM_KEY) === "1";
  } catch (_) { /* حالت خصوصی */ }
  const RQ = (x) => Math.round((Number(x) || 0) * 100) / 100;   /* مقدار بدون زبالهٔ اعشار شناور */
  const HSORT = { m: "rankM", qty: "rankQty", n: "rankN" };
  const HMODE_FA = { exact: "عین قلم", head: "نوع قلم", pick: "قلم انتخابی" };
  /* چرا یک نام در سهم و رتبه نیامده (worker/history.js:excludedWhy) */
  const EXCL_WHY = {
    bucket: "نام تجمیعی فایل مرجع است، نه یک تأمین‌کننده؛ در سهم‌ها و رتبه‌ها حساب نشده",
    employer: "مصالحِ تحویلیِ کارفرما است با قیمت اسمی، نه خرید از تأمین‌کننده؛ در سهم‌ها و رتبه‌ها حساب نشده",
  };
  const CONF_CLS = { "قطعی": "ok", "بالا": "ok", "متوسط": "info", "پایین": "warn", "کارشناس": "info", "فرمول": "ok" };
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
  /* عدد تایپ‌شده با کیبورد فارسی: «۰٫۵» و «0.5» یکی‌اند؛ خالی = null */
  const numIn = (v) => {
    const s = String(v == null ? "" : v).replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
      .replace(/[,٬]/g, "").replace(/٫/g, ".").trim();
    return s === "" ? null : Number(s);
  };
  /* قواعد یکسان‌سازی (catalog-rules.mjs، از <script type="module"> صفحه): لایهٔ کمّی عدد و
     واحدِ جدا، و نمایش «ضمنی». اگر ماژول نرسیده باشد پنل با فیلد متنی ساده کار می‌کند. */
  const RL = () => (window.TP && TP.rules) || null;
  const showLayer = (v) => (RL() ? RL().showLayer(v) : typeof v === "string" ? v : v && v.v != null ? `${v.v}${v.u ? " " + v.u : ""}` : String(v == null ? "" : v));
  const isQuant = (k) => !!(RL() && RL().QUANT[k]);
  /* واحدهای هم‌بُعدِ یک لایهٔ کمّی (ضخامت: میلی‌متر، سانتی‌متر، اینچ …) */
  const unitsFor = (k) => { const R = RL(); if (!R || !R.QUANT[k]) return []; const d = R.QUANT[k]; return R.UNIT_NAMES.filter((u) => d.includes("*") || d.includes(R.UNITS[u].dim)); };

  /* ---------- تبدیلِ ایستا/پویا (catalog-units.mjs، از راه TP.units) ----------
     کادرِ نرخ‌ها برای هر واحد می‌گوید تبدیلش ایستاست — ضریب از خودِ دو واحد، برای همهٔ اقلام یکی (۱ تن =
     ۱۰۰۰ کیلوگرم) — یا پویا: ضریب به اندازهٔ همین قلم بسته است (۱ ورق = مساحت × ضخامت × چگالی کیلوگرم) و
     فرمول‌هایش (فرمول ۱، ۲، …) با لایه‌های همین پیش‌نویس حساب می‌شوند؛ لایه‌ای که کارشناس می‌افزاید یا اصلاح
     می‌کند همان لحظه در فرمول می‌نشیند. بی ماژول، همان فرمول‌هایی که سرور با لایه‌های ذخیره‌شده حساب کرده. */
  const UX = () => (window.TP && TP.units) || null;
  const KIND_FA = { static: "ایستا", dynamic: "پویا", ref: "مرجع", unknown: "" };
  const KIND_TIP = {
    static: "ایستا: ضریب از خودِ دو واحد می‌آید و برای همهٔ اقلامِ این نوع یکی است (مثل ۱ تن = ۱۰۰۰ کیلوگرم)",
    dynamic: "پویا: ضریب به اندازهٔ خودِ قلم بسته است (مساحت و ضخامتِ ورق، قطر و طولِ شاخه، شمارِ یک دست) و برای هر قلم با فرمول از لایه‌هایش حساب می‌شود",
    unknown: "این واحد در جدولِ واحدها نیست؛ نرخِ فایل به کار می‌رود",
  };
  /** لایه‌های پیش‌نویس به شکلِ استاندارد، همان که «ذخیره» می‌فرستد و سرور یکسان می‌کند */
  function draftLayers(dr) {
    const R = RL(), L = {};
    for (const l of dr.layers || []) {
      if (!l.k || !String(l.t || "").trim()) continue;
      if (isQuant(l.k)) { const q = R && R.quantWith(l.k, l.t, l.u || null, l.i); if (q) L[l.k] = q; }
      else L[l.k] = l.i ? { v: l.t, i: 1 } : l.t;
    }
    return window.TP.canon ? TP.canon.canonLayers(dr.head, L) : L;
  }
  /** تبدیلِ یک واحد با لایه‌های پیش‌نویس؛ null اگر ماژول نیست یا نوع قلم در پیش‌نویس عوض شده (واحد مرجعِ تازه بعد از ذخیره) */
  function liveConv(n, unit) {
    const U = UX(), rv = (n.data && n.data.rates) || {};
    if (!U || !rv.ref || String(n.draft.head || "").trim() !== String(n.data.head || "").trim()) return null;
    try { return U.convert({ head: n.draft.head, layers: draftLayers(n.draft) }, unit, rv.ref); } catch (_) { return null; }
  }
  /** نرخی که ردیف نشان می‌دهد: نرخِ دستیِ پیش‌نویس، وگرنه فرمولِ پویا با لایه‌های پیش‌نویس، وگرنه نرخ سرور */
  function rateShown(n, u, cv) {
    if (n.draft.rates[u.unit] != null) return n.draft.rates[u.unit];
    if (u.src !== "user" && cv && cv.type === "dynamic" && cv.rate != null) return cv.rate;
    return u.rate;
  }
  /** خانهٔ «فرمول / مبنا» یک واحد */
  function fxHtml(n, u, cv) {
    const c = cv || { type: u.kind, formulas: u.formulas || [], used: u.used == null ? -1 : u.used, basis: u.staticBasis || "" };
    const user = u.src === "user" || n.draft.rates[u.unit] != null;
    const userNote = user ? `<div class="dim" style="font-size:.78rem">نرخِ دستیِ کارشناس بر ${c.type === "dynamic" ? "فرمول" : "ضریب"} مقدم است.</div>` : "";
    if (c.type === "static") return `${esc(c.basis || u.staticBasis || u.basis)}${userNote}`;
    if (c.type !== "dynamic") return `${esc(u.basis)}${userNote}`;
    const li = (c.formulas || []).map((f, i) => `<li class="${i === c.used ? "used" : f.value != null ? "ok" : "miss"}"><b>فرمول ${M(i + 1)}:</b> ${esc(f.label)}
      <div class="fxv">${f.value != null ? `${esc(f.expr)}${i === c.used && !user ? " — به کار رفت ✓" : ""}` : `لایهٔ ${(f.missing || []).map((x) => `«${esc(x)}»`).join(" و ")} را ندارد`}</div></li>`).join("");
    const none = c.used < 0 ? `<div class="fxw">هیچ فرمولی لایه‌هایش را ندارد؛ ${!user && u.rate != null && u.src !== "formula" ? `نرخِ ثابتِ فایل (${fmtRate(u.rate)}) — یک عدد برای همهٔ اقلامِ این نوع — به کار می‌رود` : !user ? "خریدِ این واحد بی‌نرخ می‌ماند" : "نرخِ دستی به کار می‌رود"}. لایهٔ لازم را در «لایه‌های ویژگی» بالا بیفزایید.</div>` : "";
    return `${li ? `<ol class="fxl">${li}</ol>` : ""}${none}${userNote}`;
  }
  /* هزینهٔ تقریبیِ یک تفکیک با مدل (Haiku) تا وقتی سرور میانگینِ واقعی را نگفته — همان worker/normalize.js:NORM_COST_EST.
     روی صفحه نشان داده نمی‌شود (تصمیم مدیر، مهر ۱۴۰۵)؛ فقط در کادرِ تأییدی که پیش از هر فراخوانی مدل باز می‌شود. */
  const NORM_COST_EST = 0.006;
  const costTxt = (c) => `≈ ${Number(c).toLocaleString("en-US", { maximumFractionDigits: 4 })} دلار`;
  /* «قلم انتخابی» هر قلم: لایه‌های تیک‌خورده، و واحدهای تیک‌خورده (null = همه) */
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

  /* کارت تأمین‌کننده — بالای جدول، با کلیک روی نام باز می‌شود */
  function vProfile(it) {
    const d = S.hist[it.id]; if (!S.prof || !d) return "";
    const p = (d.suppliers || []).find((x) => x.key === S.prof); if (!p) return "";
    const c = p.contact || {};
    const unit = d.item && d.item.unit ? " " + d.item.unit : "";
    const f = (lab, val, cls) => `<div class="f"><b>${lab}</b><span class="${cls || ""}">${val == null || val === "" ? "—" : esc(val)}</span></div>`;
    const per = d.item && d.item.unit ? ` · هر ${esc(d.item.unit)}` : "";
    return `<div class="prof"><div class="top"><h4>${esc(p.name)}</h4>${p.grade ? `<span class="chip grade g${esc(p.grade)}" title="ردهٔ تأمین‌کننده">رده ${esc(p.grade)}</span>` : ""}${p.code ? `<span class="chip num" title="کد تأمین‌کننده">${esc(p.code)}</span>` : ""}
        <button class="tp-btn xs" data-close-prof style="margin-inline-start:auto">بستن</button></div>
      <div class="gridp">
        ${f("دفعات خرید", `${M(p.n)} بار (رتبه ${M(p.rankN)})`, "num")}
        ${f("جمع مقدار", `${M(RQ(p.qty))}${unit} (رتبه ${M(p.rankQty)})`, "num")}
        ${f("امتیاز گشتاوری", `${M(RQ(p.qtyM))}${unit} (رتبه ${M(p.rankM)})`, "num")}
        ${f("نخستین خرید", p.firstDate, "num")}${f("آخرین خرید", p.lastDate, "num")}
        ${f(`قیمت واحد میانگین (${d.base.priceLabel || "زمستان ۱۴۰۴"}${per})`, p.avgUnit == null ? null : M(Math.round(p.avgUnit)) + " ریال", "num")}
        ${f(`کمینه / بیشینه قیمت واحد (${d.base.priceLabel || "زمستان ۱۴۰۴"})`, p.minUnit == null ? null : `${M(Math.round(p.minUnit))} تا ${M(Math.round(p.maxUnit))}`, "num")}
        ${f("شهر", c.city)}${f("تلفن همراه", c.phone, "num")}${f("تلفن ثابت", c.tel2, "num")}${f("ایمیل", c.email)}${f("وب‌سایت", c.site)}</div>
      ${c.note ? `<div class="desc"><b>توضیحات مدیر:</b> ${esc(c.note)}</div>` : ""}
      <div class="dim" style="font-size:.82rem;margin-top:8px">${p.contact ? "راه‌های تماس از دفترچهٔ تأمین‌کنندگان خوانده شده‌اند."
        : `راه‌های تماس این تأمین‌کننده هنوز در دفترچه ثبت نشده است. <span class="chip mock">دفترچهٔ تأمین‌کنندگان — مرحلهٔ بعد</span>`}</div></div>`;
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

  /* پنل «نرمال‌سازی اقلام»: نوع قلم، لایه‌ها و نرخ‌های تبدیل — همه قابل ویرایش. ساختار اول با کد و
     بعد با عنوانِ عیناً همان از دیتابیس می‌آید (بی مدل) و جستجو بی درنگ بر آن انجام می‌شود؛ فقط قلمِ
     تازه به مدل می‌رود و تا «ذخیره» نشود جستجو بر آن نه. «ذخیره» روی همین قلم و در دیتابیس اصلی
     برای کدش می‌نشیند (worker/normalize.js:confirmNorm). ویرایش‌ها بی‌بازرندر در draft می‌نشینند
     تا فوکوس نپرد. */
  function vNorm(it) {
    const n = S.norm[it.id];
    if (!n || n.loading) return `<div class="normbox"><div class="dim">در حال یافتن ساختار قلم در دیتابیس (با کد، بعد با عنوان)…</div></div>`;
    if (n.error) return `<div class="normbox"><div class="tp-note warn" style="margin:0 0 8px">${esc(n.error)}</div><button class="tp-btn sm" data-norm-retry>تلاش دوباره</button></div>`;
    if (n.data && n.data.needsModel) {
      return `<div class="normbox"><div class="toolrow" style="margin-bottom:6px"><b>نرمال‌سازی اقلام</b><span class="chip warn">در دیتابیس نیست</span></div>
        <div style="font-size:.9rem">کد و عنوانِ این قلم در دیتابیس نیست؛ برای یافتنِ نوع قلم و لایه‌هایش باید عنوان به مدل زبانی داده شود — پیش از آن هزینهٔ تقریبی را می‌پرسم.</div>
        <div class="toolrow" style="margin-top:8px"><button class="tp-btn primary" data-norm-model>تفکیک با مدل…</button></div></div>`;
    }
    loadHeads();
    const d = n.data, dr = n.draft, rv = d.rates || { ref: null, units: [] };
    const pickMode = S.hmode === "pick", pk = pickOf(it);
    /* نام‌های پنهان («نمره») در فهرستِ انتخاب نمی‌آیند، مگر همین لایه همان باشد */
    const names = d.layerNames || [];
    const opt = (sel) => [...new Set([...names, ...(sel && !names.includes(sel) ? [sel] : [])])].map((x) => `<option ${x === sel ? "selected" : ""}>${esc(x)}</option>`).join("");
    /* «قلم انتخابی»: تیکِ هر نرخ = خریدهای همان واحد در جستجو می‌آیند (پیش‌فرض همه) */
    const allUnits = [rv.refRow ? rv.refRow.unit : rv.ref, ...(rv.units || []).map((u) => u.unit)].filter(Boolean);
    const unitOn = (u) => !pk.units || pk.units.includes(u);
    const shareCell = (u) => (u.rows ? `<b class="num">${(u.share || 0).toFixed(1)}٪</b>${u.unconverted ? ` <span class="chip warn" title="خریدهایی با این واحد که نرخ ندارند و در جمع نیامده‌اند">${M(u.unconverted)} بی‌نرخ</span>` : ""}
      <div class="dim num" style="font-size:.75rem">${M(u.rows)} خرید · ${M(RQ(u.qty))} ${esc(u.unit)}</div>
      ${u.formulaRows || u.fixedRows ? `<div class="dim" style="font-size:.72rem" title="در همهٔ اقلامِ این نوع: خریدهایی که ضریبشان با فرمول از لایه‌های همان قلم آمد، و خریدهایی که قلمشان لایهٔ لازم را نداشت و نرخِ ثابتِ فایل گرفتند">${u.formulaRows ? `${M(u.formulaRows)} با فرمول` : ""}${u.formulaRows && u.fixedRows ? " · " : ""}${u.fixedRows ? `<span style="color:#fcd34d">${M(u.fixedRows)} با نرخ ثابت</span>` : ""}</div>` : ""}` : `<span class="dim">در سوابق نیست</span>`);
    const cands = [...new Set([d.head, ...(d.candidates || [])].filter(Boolean))];
    const fromDb = DB_SRC.has(d.source);
    const where = it.code ? `کد ${it.code}` : "عنوانِ همین قلم";
    const saved = { created: `در دیتابیس اصلی برای ${where} ذخیره شد`, updated: `در دیتابیس اصلی برای ${where} به‌روز شد`,
      same: "همان فهرست اقلام است؛ چیزی در دیتابیس عوض نشد", reverted: "با فهرست اقلام یکی شد؛ ویرایشِ قبلی از دیتابیس برداشته شد" }[d.saved];
    return `<div class="normbox">
      <div class="toolrow" style="margin-bottom:8px"><b>نرمال‌سازی اقلام</b>
        <span class="chip ${d.confirmed || fromDb ? "ok" : "warn"}">${d.confirmed ? "ذخیره‌شده — جستجو بر همین است" : fromDb ? "جستجو بر همین است" : "پیشنهاد مدل — جستجو بر همین است، ولی در دیتابیس ذخیره نشده"}</span>
        <span class="chip info" title="${fromDb ? "بی مدل: کد یا عنوانِ عیناً همان در دیتابیس بود" : "کد و عنوان در دیتابیس نبود"}">${esc(SRC_FA[d.source] || d.source)}${d.code ? ` · کد ${esc(d.code)}` : ""}</span>
        ${d.source === "title" && d.title ? `<span class="chip" title="قلمِ دیتابیس با همین عنوان">${esc(d.title)}</span>` : ""}
        ${d.edit ? `<span class="chip" title="آخرین ذخیرهٔ این قلم در دیتابیس اصلی">${esc(d.edit.by || "کارشناس")} · ${esc(TP.fmt(d.edit.at))}</span>` : ""}
        ${saved ? `<span class="chip ok">${esc(saved)}</span>` : ""}
        ${d.known === false ? `<span class="chip warn" title="جستجو چیزی پیدا نمی‌کند مگر نوع قلمِ موجود را انتخاب کنید">این نوع قلم در فهرست نیست — سابقه‌ای ندارد</span>` : ""}</div>
      <div class="normgrid">
        <label class="tp-field"><b>نوع قلم</b><input class="tp-input" data-norm-head value="${esc(dr.head)}" list="nh-${it.id}" style="width:100%" title="نوع قلم را می‌توانید عوض کنید: از فهرستِ نوع‌های قلم انتخاب کنید یا بنویسید">
          <datalist id="nh-${it.id}" data-heads="${esc(JSON.stringify(cands))}">${headOptions(cands)}</datalist>
          <span class="dim" style="font-size:.8rem;margin-top:3px">قابل تغییر — از فهرست انتخاب کنید یا بنویسید.</span></label>
        <div class="tp-field"><b>لایه‌های ویژگی</b>
          ${pickMode ? `<div class="tp-note" style="margin:2px 0 6px;font-size:.82rem"><b>قلم انتخابی:</b> لایه‌ای را که تیک بزنید، فقط اقلامی از همین نوع قلم می‌آیند که همان لایه را با <b>همان مقدار</b> دارند — از هر کدی (مثلاً «ضخامت ۸ میلی‌متر» ورق‌های ۸ میلِ همهٔ کدها را می‌آورد). بی‌تیک یعنی آن لایه مهم نیست.</div>` : ""}
          ${dr.layers.map((l, i) => { const qn = isQuant(l.k), rf = qn ? refTxt(l.k, l.t, l.u) : ""; return `<div class="normlayer">
            ${pickMode ? `<input type="checkbox" data-pick-l="${esc(l.k)}" ${pk.layers.includes(l.k) ? "checked" : ""} title="در «قلم انتخابی» فقط اقلامی با همین مقدارِ این لایه">` : ""}
            <select class="tp-input" data-norm-lk="${i}">${opt(l.k)}</select>
            <input class="tp-input${qn ? " num" : ""}" data-norm-lv="${i}" value="${esc(l.t)}"${qn ? ` placeholder="فقط عدد" title="فقط عدد: ۲، ۱ ۱/۲، ۶۵۰×۱۵۲۰ یا ۱۰-۱۶ — واحد را از فهرست کنارش انتخاب کنید"` : ""}>
            ${qn ? `<select class="tp-input nu" data-norm-lu="${i}" title="واحد استاندارد؛ تبدیل و مقایسه بر پایهٔ همین است"><option value="">بی‌واحد</option>${unitsFor(l.k).map((u) => `<option ${u === l.u ? "selected" : ""}>${esc(u)}</option>`).join("")}</select>` : ""}
            ${rf ? `<span class="dim num" style="font-size:.8rem" title="به واحد مرجعِ این لایه — مقایسه و جستجو بر همین است">${esc(rf)}</span>` : ""}
            ${l.i ? `<span class="chip info" title="در عنوان گفته نشده؛ از عرفِ پذیرفته‌شدهٔ همین نوع قلم آمده (یا واحدش از بزرگیِ عدد خوانده شده). با ویرایش، صریح می‌شود.">ضمنی</span>` : ""}
            <button class="tp-btn xs" data-norm-ldel="${i}" title="حذف این لایه">✕</button></div>`; }).join("")
            || `<div class="dim" style="font-size:.85rem">لایه‌ای ندارد.</div>`}
          <button class="tp-btn xs" data-norm-ladd style="margin-top:4px">افزودن لایه</button>
          <div class="dim" style="font-size:.8rem;margin-top:4px">در لایهٔ کمّی (قطر، طول، ضخامت، مساحت، محیط، یال …) فقط عدد بنویسید و واحد را از فهرست انتخاب کنید؛ «۲ میل»، «2mm» و «۰٫۲ سانتی‌متر» یکی‌اند و هر لایه به واحد مرجعش (طول‌ها میلی‌متر، مساحت متر مربع) سنجیده می‌شود.
            «ضمنی» یعنی در عنوان نیامده و از عرفِ همین نوع قلم آمده (مثلاً ورقِ بی‌جنس ← آهنی).</div></div>
      </div>
      ${d.residual ? `<div class="dim" style="font-size:.85rem;margin-top:6px">بخشی از عنوان که به هیچ لایه‌ای نخورد: <b>${esc(d.residual)}</b></div>` : ""}
      ${rv.ref ? `<div class="tp-field" style="margin-top:10px"><b>نرخ تبدیل به واحد مرجع («${esc(rv.ref)}»)</b>
        ${rv.total ? `<div class="dim" style="font-size:.85rem;margin:2px 0 4px">کلِ خریدِ این نوع قلم، به واحد مرجع: <b class="num">${M(RQ(rv.total))} ${esc(rv.ref)}</b> — ستونِ «سهم» می‌گوید چند درصدش با هر واحد خریده شده.</div>` : ""}
        ${pickMode ? `<div class="tp-note" style="margin:2px 0 6px;font-size:.82rem"><b>قلم انتخابی:</b> فقط خریدهایی می‌آیند که واحدشان تیک خورده؛ واحدی را که بردارید، خریدهایش در هیچ جمع، سهم، رتبه و ریز خریدی نمی‌آیند.</div>` : ""}
        <table class="tp-mx normrates" style="width:auto"><thead><tr>${pickMode ? "<th>در جستجو</th>" : ""}<th>واحد ثبت‌شده در سوابق</th>
          <th title="ایستا: ضریب از خودِ دو واحد، برای همهٔ اقلام یکی — پویا: ضریب به اندازهٔ هر قلم بسته است و با فرمول از لایه‌هایش حساب می‌شود">نوع تبدیل</th>
          <th title="برای همین قلم؛ در تبدیلِ پویا حاصلِ فرمول با لایه‌های همین قلم">نرخ</th><th>فرمول / مبنا</th><th>اطمینان</th><th title="سهمِ خریدهای همین واحد از کلِ مقدارِ خریدِ این نوع قلم، به واحد مرجع">سهم از کل خرید</th></tr></thead><tbody>
          ${rv.refRow ? `<tr>${pickMode ? `<td><input type="checkbox" data-pick-u="${esc(rv.refRow.unit)}" ${unitOn(rv.refRow.unit) ? "checked" : ""}></td>` : ""}<td><b>${esc(rv.refRow.unit)}</b></td><td><span class="chip">مرجع</span></td><td class="num">۱</td><td class="rt">واحد مرجع</td><td><span class="chip ok">قطعی</span></td><td>${shareCell(rv.refRow)}</td></tr>` : ""}
          ${(rv.units || []).map((u) => { const cv = liveConv(n, u.unit), kind = (cv && cv.type) || u.kind; return `<tr>${pickMode ? `<td><input type="checkbox" data-pick-u="${esc(u.unit)}" ${unitOn(u.unit) ? "checked" : ""}></td>` : ""}<td>${esc(u.unit)}</td>
            <td>${KIND_FA[kind] ? `<span class="chip ${kind === "dynamic" ? "info" : "ok"}" title="${esc(KIND_TIP[kind] || "")}">${KIND_FA[kind]}</span>` : `<span class="dim" title="${esc(KIND_TIP.unknown)}">—</span>`}</td>
            <td><input class="tp-input num" data-norm-rate="${esc(u.unit)}" value="${esc(fmtRate(rateShown(n, u, cv), false))}" inputmode="decimal" style="width:110px" title="${kind === "dynamic" ? "حاصلِ فرمول برای همین قلم؛ عددی که بنویسید نرخِ دستیِ همین قلم می‌شود و بر فرمول مقدم است" : "نرخی که بنویسید بر نرخ فایل مقدم است"}"></td>
            <td class="rt fxcell" data-norm-fx="${esc(u.unit)}">${fxHtml(n, u, cv)}</td><td><span class="chip ${CONF_CLS[u.conf] || ""}">${esc(u.conf)}</span></td><td>${shareCell(u)}</td></tr>`; }).join("")}
        </tbody></table>
        <div class="dim" style="font-size:.82rem">مقدار به واحد مرجع = مقدار ثبت‌شده × نرخ (نمایش با دو رقم اعشار). <b>ایستا</b>: ضریب از خودِ دو واحد است و برای همهٔ اقلام یکی. <b>پویا</b>: ضریب برای هر قلم با فرمول از لایه‌های خودش حساب می‌شود — در جمع و سهمِ تأمین‌کنندگان هم هر قلمِ این نوع با لایه‌های خودش؛ اگر لایهٔ لازم را نداشت، نرخِ ثابتِ فایل با اطمینانِ «پایین». نرخی را که دستی عوض کنید، در جستجو بر فرمول و نرخ فایل مقدم است و با «ذخیره» برای همین کد در دیتابیس می‌ماند؛ خالی گذاشتن یعنی همان فرمول یا نرخ فایل.</div>
        ${pickMode && allUnits.length && pk.units && !pk.units.length ? `<div class="tp-note warn" style="margin-top:6px">هیچ واحدی تیک نخورده؛ جستجو خالی می‌شود.</div>` : ""}</div>` : ""}
      <div class="toolrow" style="margin-top:10px"><button class="tp-btn primary" data-norm-confirm title="روی همین قلم، و اگر با دیتابیس فرق دارد در دیتابیس اصلی برای ${esc(where)}، ذخیره می‌شود — نوع قلم، لایه‌ها و نرخ‌های تبدیل">ذخیره</button>
        ${fromDb ? "" : `<button class="tp-btn" data-norm-redo title="عنوان دوباره به مدل داده شود — پیش از آن هزینهٔ تقریبی را می‌پرسم">تفکیک دوباره با مدل…</button>`}
        ${d.edit ? `<button class="tp-btn" data-norm-revert title="ساختاری که کارشناس برای این قلم در دیتابیس اصلی ذخیره کرده پاک می‌شود و ساختارِ فهرست اقلام (یا اگر قلم در فهرست نیست، پیشنهاد مدل) برمی‌گردد">حذف ویرایش از دیتابیس</button>`
          : d.confirmed ? `<button class="tp-btn" data-norm-clear title="ذخیرهٔ همین قلم برداشته می‌شود و ساختار دوباره از دیتابیس خوانده می‌شود">برداشتن ذخیره</button>` : ""}</div></div>`;
  }

  function vHistory(it) {
    const d = S.hist[it.id];
    const canChart = !!(d && d.available !== false && (d.suppliers || []).length);
    const head = `<div class="toolrow"><b style="font-size:1.02rem">${esc(it.title)}</b>${it.code ? `<span class="chip info num">${esc(it.code)}</span>` : ""}
      ${it.hist_done_at ? `<span class="chip ok">بررسی شد — ${TP.fmt(it.hist_done_at)}</span>` : ""}
      <span style="margin-inline-start:auto"></span>
      <span style="display:flex;align-items:center;gap:8px;font-size:.9rem" title="۱ = گذشتهٔ دور تقریباً هم‌وزن امروز · ۱۰ = فقط خریدهای تازه وزن دارند">
        <b>ضریب اهمیت گشتاور</b>
        <input type="range" min="1" max="10" step="1" data-mom value="${S.mom}" style="width:140px;accent-color:#4f8cff">
        <b class="num" data-mom-val style="min-width:1.4em;text-align:center">${M(S.mom)}</b></span>
      <button class="tp-btn" data-chart ${canChart ? "" : "disabled"} title="روند مقدار خرید در زمان، به تفکیک تأمین‌کننده — در پنجرهٔ بزرگ وسط صفحه">نمودار روند</button>
      <button class="tp-btn primary" data-run-hist title="ساختار قلم خودکار از دیتابیس خوانده می‌شود (با کد، بعد با عنوان)؛ اگر نبود، پیش از تفکیک با مدل هزینه را می‌پرسم">${d ? "بررسی دوباره" : "بررسی سوابق"}</button>
      ${it.hist_done_at ? "" : `<button class="tp-btn" data-mark="hist" title="اگر سوابق را بیرون از سامانه بررسی کرده‌اید">علامت بزن</button>`}</div>
      <div class="toolrow">
        <label class="chkline" title="لایهٔ زیرین را نشان می‌دهد: نوع قلم، لایه‌های ویژگی و نرخ‌های تبدیل — برای دیدن و اصلاح. جستجو با تیک یا بی تیک بر همین ساختار است."><input type="checkbox" data-norm-on ${S.normOn ? "checked" : ""}> <b>نرمال‌سازی اقلام</b></label>
        <span class="seg" role="radiogroup" aria-label="حالت جستجو">
          <button class="tp-btn sm ${S.hmode === "head" ? "primary" : ""}" data-hmode="head" title="همهٔ اقلام همین نوع — مثلاً هر پیچی که تا حالا خریده‌ایم (پیش‌فرض)">نوع قلم</button>
          <button class="tp-btn sm ${S.hmode === "pick" ? "primary" : ""}" data-hmode="pick" title="همین نوع قلم، و فقط لایه‌ها و واحدهای خریدی که در کادر نرمال‌سازی تیک می‌زنید">قلم انتخابی</button>
          <button class="tp-btn sm ${S.hmode === "exact" ? "primary" : ""}" data-hmode="exact" title="همان نوع قلم با دقیقاً همان لایه‌های ویژگی">عین قلم</button></span>
        ${S.hmode === "pick" ? `<span class="dim" style="font-size:.85rem">لایه‌ها و واحدهایی را که می‌خواهید در کادرِ نرمال‌سازی تیک بزنید، بعد «بررسی سوابق».</span>` : ""}</div>`;
    /* کادر نرمال‌سازی: تا سوابق خوانده نشده زیر همین نوار است؛ بعد از «بررسی سوابق» زیر فهرست تأمین‌کنندگان (تصمیم مدیر، مهر ۱۴۰۵).
       «قلم انتخابی» بی آن معنا ندارد، پس در آن حالت همیشه باز است. */
    const norm = S.normOn || S.hmode === "pick" ? vNorm(it) : "";

    if (!d) return `<div class="pad">${head}${norm}<div class="empty"><b>سوابق تأمین «${esc(it.title)}» هنوز خوانده نشده.</b>
      حالت «نوع قلم»، «قلم انتخابی» یا «عین قلم» را انتخاب کنید و «بررسی سوابق» را بزنید؛ ساختار قلم خودکار از دیتابیس خوانده می‌شود (با کد، بعد با عنوان).
      رتبه‌بندی بر مبنای دفعات خرید، مقدار و گشتاورِ مقدار است و به مدل زبانی نیاز ندارد.</div></div>`;
    if (d.available === false) return `<div class="pad">${head}<div class="tp-note warn">${esc(d.message)}</div>${norm}</div>`;
    const st = d.struct || {}, mt = d.match || {};
    const unit = d.item && d.item.unit ? ` ${esc(d.item.unit)}` : "";
    const picked = new Set(mt.picked || []);
    const structChips = st.head ? `<div class="toolrow">
        <span class="chip ok" title="حالت جستجو">${HMODE_FA[mt.mode] || ""}${mt.codes != null ? ` — ${M(mt.codes)} قلم از ${M(mt.headItems)} قلمِ «${esc(st.head)}»` : ""}</span>
        ${mt.source === "proposal" ? `<span class="chip warn" title="جستجو بر پیشنهادِ مدل است که هنوز در دیتابیس ذخیره نشده">پیشنهاد ذخیره‌نشده</span>` : ""}
        ${Object.entries(st.layers || {}).map(([k, v]) => `<span class="chip ${mt.mode === "pick" && picked.has(k) ? "ok" : ""}" title="${mt.mode === "pick" ? (picked.has(k) ? "در جستجو: فقط همین مقدار" : "در جستجو نیست") : "لایهٔ ویژگی"}">${mt.mode === "pick" && picked.has(k) ? "✓ " : ""}${esc(k)}: <b>${esc(showLayer(v))}</b></span>`).join("")}
        ${mt.units ? `<span class="chip info" title="«قلم انتخابی»: فقط خریدهای همین واحدها">واحدها: ${esc(mt.units.join("، "))}</span>` : ""}
        ${d.unitDropped ? `<span class="chip warn" title="خریدهایی با واحدِ تیک‌نخورده — در هیچ جمع و سهمی نیامده‌اند">${M(d.unitDropped)} خرید با واحدِ کنارگذاشته</span>` : ""}
        <span class="chip info">واحد مرجع: ${esc(st.refUnit || "—")}</span>
        ${(d.rates || []).map((r) => `<span class="chip ${CONF_CLS[r.conf] || ""}" title="${esc(KIND_FA[r.kind] ? `تبدیل ${KIND_FA[r.kind]} — ` : "")}${esc(r.basis)} — ${M(r.rows)} خرید${r.formulaRows ? ` — ${M(r.formulaRows)} خرید با فرمولِ لایه‌های همان قلم` : ""}${r.varied ? ` — نرخ ویژهٔ هر قلم، از ${fmtRate(r.min)} تا ${fmtRate(r.max)}` : ""}">${esc(r.unit)} × ${r.kind === "dynamic" && r.varied ? `${fmtRate(r.min)}…${fmtRate(r.max)}` : fmtRate(r.rate)}${r.kind === "dynamic" ? " (پویا)" : r.varied ? " (متغیر)" : ""}</span>`).join("")}
        ${d.unconverted ? `<span class="chip warn" title="واحدی که نرخ تبدیل ندارد در جمع مقدار نمی‌آید؛ نرخش را در پنل نرمال‌سازی بدهید">${M(d.unconverted)} خرید بی‌نرخ تبدیل</span>` : ""}
        ${d.fixedDyn ? `<span class="chip warn" title="تبدیلِ این خریدها پویاست (ضریب به اندازهٔ هر قلم بسته است) ولی قلمشان لایهٔ لازم را نداشت و با یک نرخِ ثابت برای همهٔ اقلام حساب شد — در کادرِ نرمال‌سازی فرمول و لایهٔ کم را ببینید">${M(d.fixedDyn)} خرید پویا با نرخ ثابتِ تقریبی</span>` : ""}
        ${d.lowConf ? `<span class="chip warn" title="نرخ تبدیلِ این خریدها اطمینان «پایین» دارد و می‌تواند جمع را جابه‌جا کند">${M(d.lowConf)} خرید با نرخ کم‌اطمینان</span>` : ""}</div>` : "";
    const exc = d.excluded || [];
    const rows = histRows(d);
    if (!rows.length) return `<div class="pad">${head}${structChips}<div class="tp-note warn">${exc.length
      ? `هرچه از این قلم ثبت شده زیر «${esc(exc[0].name)}» است (${M(exc[0].n)} خرید) — ${exc[0].why === "employer" ? "مصالحِ تحویلیِ کارفرما" : "نام تجمیعی"} — و تأمین‌کنندهٔ واقعیِ نام‌داری ندارد.`
      : esc(d.message || "برای این قلم سابقه‌ای پیدا نشد.")}</div>${norm}</div>`;

    const added = new Set(S.d.quotes.filter((q) => q.item_id === it.id).map((q) => TP.nrm(q.supplier_name)));
    /* رتبه در ستونِ باریکِ زردِ بعد از هر عدد؛ کلیک روی هر ستون رتبه، کل جدول را مرتب می‌کند */
    const rk = (k) => `<th class="rkcol ${S.hsort === k ? "sorted" : ""}" data-hsort="${k}" title="مرتب‌سازی کل جدول بر اساس همین رتبه">رتبه${S.hsort === k ? " ▾" : ""}</th>`;
    const rc = (k, v) => `<td class="rkcol num" data-hsort="${k}" title="مرتب‌سازی کل جدول بر اساس همین رتبه">${M(v)}</td>`;
    return `<div class="pad">
      ${vProfile(it)}
      ${head}
      ${structChips}
      <div class="toolrow">
        <span class="chip ok">خرید قلم — فعال</span>
        <span class="chip mock" title="ستون پروژه هنوز در فایل مرجع نیست">خرید قلم در پروژه — در انتظار ساختار داده</span>
        <span class="chip">${M(rows.length)} تأمین‌کننده · ${M(d.totals.n)} خرید · جمع مقدار ${M(RQ(d.totals.qty))}${unit}</span>
        ${exc.map((x) => `<span class="chip warn" title="${EXCL_WHY[x.why] || EXCL_WHY.bucket}">«${esc(x.name)}» کنار گذاشته شد — ${M(x.n)} خرید</span>`).join("")}</div>
      ${(d.titles || []).length ? `<details class="histitems"><summary>اقلامِ شمرده‌شده (${M(d.titles.length)}${mt.codes > d.titles.length ? "+" : ""})</summary>
        ${d.titles.map((x) => `<span class="chip" title="${esc(Object.entries(x.layers || {}).map(([k, v]) => `${k}: ${showLayer(v)}`).join(" · "))}">${esc(x.title)} <span class="dim num">${esc(x.code)} · ${M(x.n)} خرید</span></span>`).join("")}</details>` : ""}
      <div class="tp-scroll" data-keep-scroll style="max-height:54vh"><table class="tp-table grid"><thead><tr>
        <th>انتخاب</th><th class="rt">تأمین‌کننده</th><th title="کد تأمین‌کننده در فایل سوابق (یا دفترچهٔ تأمین‌کنندگان)">کد</th><th title="ردهٔ تأمین‌کننده؛ در امتیاز برابر، ردهٔ بالاتر جلوتر است">رده</th><th>دفعات خرید</th>${rk("n")}<th>مقدار${unit ? ` (${unit.trim()})` : ""}</th>${rk("qty")}<th>سهم</th><th>امتیاز گشتاوری</th>${rk("m")}<th>خریدها</th></tr></thead><tbody>
      ${rows.map((s) => `<tr class="${S.prof === s.key ? "sel" : ""}">
        <td>${added.has(TP.nrm(s.name)) ? `<span class="chip ok">در استعلامات</span>`
          : `<button class="tp-btn xs" data-to-quote="${esc(s.key)}" title="فقط نام تأمین‌کننده به تب استعلامات می‌رود؛ قیمت با پیش‌فاکتور یا ورود دستی">افزودن</button>`}</td>
        <td class="rt"><span class="supname" data-prof="${esc(s.key)}">${esc(s.name)}</span>${s.unconverted ? ` <span class="chip warn" title="خریدهایی با واحدِ بی‌نرخ تبدیل؛ در مقدار نیامده‌اند">${M(s.unconverted)}</span>` : ""}</td>
        <td class="num">${s.code ? esc(s.code) : `<span class="dim">—</span>`}</td>
        <td>${s.grade ? `<span class="chip grade g${esc(s.grade)}">${esc(s.grade)}</span>` : `<span class="dim">—</span>`}</td>
        <td class="num">${M(s.n)}</td>${rc("n", s.rankN)}
        <td class="num">${M(RQ(s.qty))}</td>${rc("qty", s.rankQty)}
        <td class="num">${s.share.toFixed(1)}٪</td>
        <td class="num" style="font-weight:700">${M(RQ(s.qtyM))}</td>${rc("m", s.rankM)}
        <td><button class="tp-btn xs" data-buys="${esc(s.key)}">${M(s.n)}</button></td></tr>`).join("")}
      </tbody></table></div>
      ${norm}
      <div class="tp-note">رتبه‌بندی فقط بر مبنای <b>دفعات خرید</b>، <b>مقدار</b> و <b>امتیاز گشتاوری</b> است و قیمت در آن اثری ندارد؛ <b>در امتیاز برابر، ردهٔ بالاتر تأمین‌کننده (A، بعد B، بعد C) جلوتر است</b>. قیمت‌ها (به ${esc(d.base.priceLabel || "زمستان ۱۴۰۴")}) را در «خریدها» و کارت تأمین‌کننده ببینید.
        <b>مقدارها به واحد مرجعِ نوع قلم («${esc(st.refUnit || "")}») برده شده‌اند</b> تا خریدهای با واحدهای مختلف قابل جمع باشند.
        <b>امتیاز گشتاوری عدد است، نه درصد</b>: جمعِ مقدارِ هر خرید ضرب در ضریب تازگی‌اش. ضریب برای خرید در ${esc(d.base.label)} یک است و با هر ماه فاصله کم می‌شود — با ضریب اهمیت ${d.base.k}، هر ماه ${(d.base.decay * 100).toFixed(2)}٪ — و قدیمی‌ترین خریدِ فایل (${M(d.base.ageMax)} ماه پیش) ${((1 - d.base.decay * d.base.ageMax) * 100).toFixed(0)}٪ وزنش را نگه می‌دارد.
        عددهای برابر (با ردهٔ برابر) رتبهٔ برابر می‌گیرند (۴، ۲، ۲، ۱ ← رتبهٔ ۱، ۲، ۲، ۴). ستون‌های زردِ «رتبه» کل جدول را مرتب می‌کنند؛ پیش‌فرض، رتبهٔ گشتاوری است.</div></div>`;
  }

  const supOf = (key) => { const d = S.hist[(item() || {}).id]; return d && (d.suppliers || []).find((x) => x.key === key); };

  /**
   * «بررسی سوابق» هرگز قفل نیست (تصمیم مدیر، مهر ۱۴۰۵): اگر ساختار قلم هنوز خوانده نشده، همین‌جا خودکار
   * نرمال‌سازی می‌شود — از دیتابیس و بی‌هزینه؛ فقط اگر قلم در دیتابیس نبود، هزینهٔ مدل پرسیده می‌شود.
   */
  async function ensureNorm(it) {
    let n = S.norm[it.id];
    if (!n || n.error) { await runNormalize(false); n = S.norm[it.id]; }
    if (!n || n.error) { TP.modal("ساختار قلم خوانده نشد", esc((n && n.error) || "خطای ناشناخته"), null, "باشد", ""); return false; }
    if (n.data && n.data.needsModel) return askModel(it, false);
    return true;
  }

  /**
   * مدل هزینه دارد، پس هر فراخوانی‌اش با کادرِ تأیید و هزینهٔ تقریبی است (تصمیم مدیر، مهر ۱۴۰۵).
   * true اگر کارشناس تأیید کرد و ساختاری آمد.
   */
  function askModel(it, force) {
    return new Promise((resolve) => {
      let done = false;
      const end = (v) => { if (!done) { done = true; resolve(v); } };
      const cost = S.normCost || NORM_COST_EST;
      const d = TP.modal("تفکیک با مدل زبانی",
        `${force ? "عنوانِ این قلم دوباره به مدل داده می‌شود تا نوع قلم و لایه‌هایش را از نو پیشنهاد کند." : `کد و عنوانِ «${esc(it.title)}» در دیتابیس نیست؛ برای یافتنِ نوع قلم و لایه‌های ویژگی‌اش باید عنوان به مدل زبانی (Haiku) داده شود.`}
        <br><br>هزینهٔ تقریبی: <b>${costTxt(cost)}</b> <span class="dim" style="font-size:.85rem">(میانگینِ اجراهای اخیر)</span>
        <br><br>پیشنهادِ مدل تا شما «ذخیره»اش نکنید در دیتابیس نمی‌نشیند؛ جستجو بر همان پیشنهاد انجام می‌شود.`,
        async () => { await runNormalize(!!force, true); const n = S.norm[it.id]; end(!!(n && n.data && !n.data.needsModel && !n.error)); },
        "تأیید و تفکیک", "انصراف");
      const no = d.querySelector("[data-n]"); if (no) no.addEventListener("click", () => end(false));
      d.addEventListener("click", (e) => { if (e.target === d) end(false); });
    });
  }

  async function runHist() {
    const it = item(); if (!it) return;
    if (!(await ensureNorm(it))) return;
    /* جستجو بر ساختارِ ذخیره‌شده است؛ ویرایشِ ذخیره‌نشده اول ذخیره شود */
    if (normDirty(it)) {
      return TP.modal("تغییرات ذخیره نشده", "نوع قلم، لایه‌ها یا نرخ‌هایی را که عوض کرده‌اید هنوز ذخیره نکرده‌اید و جستجو بر ساختارِ ذخیره‌شده انجام می‌شود.",
        async () => { if (await confirmNormUI()) runHist(); }, "ذخیره و بررسی", "انصراف");
    }
    const b = TP.busy("خواندن سوابق…", `${esc(it.title)} — ${HMODE_FA[S.hmode]}`);
    try { S.hist[it.id] = await TP.api(`/suppliers/history?${histQuery(it)}`); S.prof = null; }
    catch (e) { b.close(); TP.modal("خطا", esc(e.message), null, "باشد", ""); return; }
    b.close();
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
      const d = S.hist[it.id] || {}, pl = (d.base && d.base.priceLabel) || "زمستان ۱۴۰۴";
      const rial = (v) => (v == null ? "—" : M(Math.round(v)));
      /* هشت ستون (تصمیم مدیر، مهر ۱۴۰۵): دو ستونِ آخر همان قیمت واحد و مبلغ کل‌اند ضرب در ضریبِ
         تعدیلِ همین ردیف (شاخصِ طبقهٔ اصنافِ قلم در فصلِ خرید، به مبنای زمستان ۱۴۰۴) */
      TP.modal(`سوابق خرید — ${esc(s.name)}`, r.buys.length
        ? `<div class="tp-scroll" style="max-height:56vh"><table class="tp-mx" style="width:100%"><thead><tr>
            <th>تاریخ</th><th>عنوان قلم</th><th>مقدار خرید</th><th>واحد</th><th>قیمت واحد (ریال)</th><th>مبلغ کل (ریال)</th>
            <th>قیمت واحد به مبلغ ${esc(pl)}</th><th>مبلغ کل به مبلغ ${esc(pl)}</th></tr></thead><tbody>
          ${r.buys.map((x) => `<tr><td class="num">${esc(x.order_date)}</td><td class="rt" style="white-space:normal">${esc(x.title)}</td>
            <td class="num">${x.qty == null ? "—" : M(RQ(x.qty))}</td><td>${esc(x.unit || "—")}</td>
            <td class="num">${rial(x.unit_price)}</td><td class="num">${rial(x.amount)}</td>
            <td class="num" title="${x.adj_factor != null ? `ضریب تعدیل این ردیف: ${fmtRate(x.adj_factor)}` : ""}">${rial(x.unit_price_adj)}</td>
            <td class="num">${rial(x.amount_adj)}</td></tr>`).join("")}
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
    return { head: d.head || "", layers, rates };
  }

  /* پاسخ سرور → {data، draft، base}؛ base پیش‌نویسِ دست‌نخورده است تا ویرایشِ ذخیره‌نشده پیدا شود */
  const normState = (d) => { const draft = normDraft(d); return { data: d, draft, base: JSON.stringify(draft) }; };

  /* `model`: فقط وقتی کارشناس هزینه را دیده و تأیید کرده (askModel) — وگرنه سرور مدل را صدا نمی‌زند */
  async function runNormalize(force, model) {
    const it = item(); if (!it) return;
    S.norm[it.id] = { loading: true }; render();
    try {
      const d = await TP.api(`/items/${it.id}/normalize`, { body: { force: !!force, model: !!model } });
      if (d.costEst != null) S.normCost = d.costEst;   /* میانگینِ واقعی — برای کادرِ تأییدِ مدل */
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
      const r = await TP.api(`/items/${it.id}/norm`, { method: "PUT", body: { head: dr.head, layers, rates: headChanged ? {} : dr.rates, residual: n.data.residual, source: n.data.source, code: n.data.code } });
      S.norm[it.id] = normState({ ...n.data, ...r.norm, confirmed: true, known: r.known, rates: r.rates, saved: r.saved, edit: r.saved === "reverted" ? null : r.edit || n.data.edit || null });
      dropHist(it);
      const row = items().find((x) => x.id === it.id); if (row) row.norm_json = JSON.stringify(r.norm);
      render();
      return true;
    } catch (e) { return fail("ذخیره نشد", esc(e.message)); }
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
  S.smFresh = {}; S.chan = {}; S.chOpen = {}; S.smOpen = {};
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
    } catch (_) { S.smart[it.id] = { searches: [] }; }
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
    const s = supOfSearch(sid, idx); if (!s) return;
    await loadTemplates();
    if (!S.templates.length) { for (const t of DEFAULT_TPL) await TP.api("/templates", { body: t }); await loadTemplates(); }
    const dlg = TP.modal(`پیام برای ${esc(s.name)}`, `<div class="tplbar">${S.templates.map((t, i) => `<button class="tplbtn ${i === 0 ? "on" : ""}" data-mt="${i}"><i>قالب ${i + 1}</i><b>${esc(t.title)}</b></button>`).join("")}</div>
      <textarea class="tp-textarea" id="mtxt" style="min-height:170px"></textarea>
      <div class="tp-acts"><button class="tp-btn primary" data-mcopy>کپی متن</button><span class="dim" data-mmsg style="font-size:.85rem"></span></div>
      <div class="tp-note" style="margin-top:8px">جای‌خالی‌ها با نام تأمین‌کننده و مشخصات همین قلم پر شده‌اند؛ متن را کپی کنید و در هر کانالی که خواستید بفرستید.</div>`, null, "بستن", "");
    const paint = (i) => {
      dlg.querySelectorAll("[data-mt]").forEach((x) => x.classList.toggle("on", +x.dataset.mt === i));
      dlg.querySelector("#mtxt").value = fillTpl(S.templates[i].body, s.name);
    };
    dlg.querySelectorAll("[data-mt]").forEach((x) => x.onclick = () => paint(+x.dataset.mt));
    dlg.querySelector("[data-mcopy]").onclick = async () => {
      const ta = dlg.querySelector("#mtxt");
      try { await navigator.clipboard.writeText(ta.value); dlg.querySelector("[data-mmsg]").textContent = "کپی شد ✓"; }
      catch (_) { ta.select(); document.execCommand("copy"); dlg.querySelector("[data-mmsg]").textContent = "کپی شد ✓"; }
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
          <button class="tp-btn xs" data-sm-msg="${sid}|${i}" title="قالب پیام با فیلدهای همین تأمین‌کننده پر می‌شود">پیام</button></td></tr>${checks}`;
    }).join("");
    return `<div class="tp-scroll" data-keep-scroll><table class="tp-table smres"><thead><tr>
        <th>#</th><th class="rt">تأمین‌کننده</th><th>نوع</th><th>بازار</th><th class="rt">شماره تماس</th><th class="rt">ایمیل</th><th>وب‌سایت</th><th class="rt">قیمت</th><th>عمل</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="9"><div class="empty">مدل تأمین‌کننده‌ای برنگرداند.</div></td></tr>`}</tbody></table></div>
      ${srch.cost != null ? `<div class="dim smcost">هزینهٔ این جستجو: ${faDigits(Number(srch.cost).toFixed(2))} دلار</div>` : ""}`;
  }

  function vSmart(it) {
    const d = S.smart[it.id];
    if (d === undefined) { loadSmart(it); }
    const list = d && d !== "loading" ? d.searches || [] : [];
    const fresh = list.find((x) => x.search_id === S.smFresh[it.id]);
    const older = list.filter((x) => x !== fresh);
    const head = `<div class="toolrow"><b style="font-size:1.02rem">جستجوی هوشمند برای «${esc(it.title)}»</b>
      ${it.smart_done_at ? `<span class="chip ok">اجرا شد — ${TP.fmt(it.smart_done_at)}</span>` : ""}
      <span style="margin-inline-start:auto"></span>
      <button class="tp-btn" data-tpl-open title="قالب‌های پیام موجود را ببینید یا قالب تازه بسازید">ایجاد قالب پیام</button>
      <button class="tp-btn primary" data-run-smart>${list.length ? "اجرای جستجوی تازه" : "اجرای جستجوی هوشمند"}</button>
      ${it.smart_done_at ? "" : `<button class="tp-btn" data-mark="smart" title="اگر جستجو را بیرون از سامانه انجام داده‌اید">علامت بزن</button>`}</div>`;
    const meta = (x) => `${TP.fmt(x.created_at)} · ${esc(x.expert || "—")}${x.request_id ? ` · درخواست <span class="num">${esc(x.request_id)}</span>` : ""}${x.same_item ? "" : ` <span class="chip info" title="همین قلم در درخواست دیگری جستجو شده بود">درخواست دیگر</span>`}`;
    const count = (x) => ((x.result && x.result.suppliers) || []).length;

    let main;
    if (d === undefined || d === "loading") main = `<div class="empty">در حال خواندن جستجوهای قبلی این قلم…</div>`;
    else if (!list.length) main = `<div class="empty"><b>هنوز جستجویی برای این قلم اجرا نشده.</b>
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
    const side = `<div class="side"><h4>قیدهای جستجو</h4><div class="dim" style="font-size:.8rem">این‌ها عیناً به مدل داده می‌شوند؛ بازار تأمین کالا قید سخت است. مشخصات فنی و ملاحظات از فایل درخواست پر شده‌اند و قابل ویرایش‌اند.</div>
      ${markets}
      <div class="grp"><b>برند موردنظر <span class="dim" style="font-weight:400">(اختیاری)</span></b>
        <input class="tp-input" data-sm="brand" value="${esc(sm.brand)}" placeholder="مثلاً Komatsu" style="width:100%"></div>
      <div class="grp"><b>مشخصات فنی <span class="dim" style="font-weight:400">(از ستون «مشخصه فنی» فایل)</span></b>
        <textarea class="tp-textarea" data-sm="specs" style="min-height:64px" placeholder="استاندارد، سایز، گرید…">${esc(sm.specs)}</textarea></div>
      <div class="grp"><b>ملاحظات <span class="dim" style="font-weight:400">(از ستون «توضیحات» فایل)</span></b>
        <textarea class="tp-textarea" data-sm="notes" style="min-height:64px" placeholder="مثلاً: ترجیحاً تولیدکننده نه واسطه">${esc(sm.notes)}</textarea></div>
      <div class="grp dim" style="font-size:.78rem">نتیجه در پایگاه داده می‌ماند و با «افزودن»، تأمین‌کننده وارد تب استعلامات می‌شود؛ قیمت تازه‌اش از پیش‌فاکتور یا ورود دستی می‌آید.</div></div>`;

    return `<div class="pad">${head}<div class="two"><div class="main">${main}</div>${side}</div></div>`;
  }

  /* ---------- تب استعلامات (واقعی) ---------- */
  /* ستون «پیش‌فاکتور»: فایلِ ذخیره‌شده، یا دکمهٔ بارگذاری. ردیف‌های قدیمیِ بی‌فایل هم
     باید دوباره بارگذاری شوند، چون استخراج بدون خودِ فایل کاری نمی‌تواند بکند. */
  function pfCell(q) {
    const p = pfOf(q);
    if (p && p.storage_key) return `<span class="chip ok" title="${esc(p.filename || "")}">ثبت شد</span> <button class="tp-btn xs" data-pf="${esc(q.supplier_name)}" title="جایگزینی فایل">\u21bb</button>`;
    if (p) return `<span class="chip warn" title="فقط نامش ثبت شده بود">بی فایل</span> <button class="tp-btn xs" data-pf="${esc(q.supplier_name)}">بارگذاری</button>`;
    return `<button class="tp-btn xs" data-pf="${esc(q.supplier_name)}">بارگذاری</button>`;
  }
  /* ستون «استخراج»: همان کاری که بات روی پیش‌فاکتور تلگرام می‌کند */
  function exCell(q) {
    const p = pfOf(q);
    if (!p || !p.storage_key) return `<span class="chip">—</span>`;
    const read = p.extract_state === "ok" && p.extracted_json;
    return `<button class="tp-btn xs ${read ? "" : "primary"}" data-extract="${p.id}">${read ? "دیدن خوانده‌شده" : "استخراج"}</button>`
      + (p.extract_state === "refused" ? `<div><span class="chip warn">خوانا نبود</span></div>` : "")
      + (p.extract_state === "failed" ? `<div><span class="chip warn">ناموفق</span></div>` : "");
  }

  /* ---------- بارگذاری و استخراج پیش‌فاکتور ---------- */
  const REFUSAL_FA = { handwritten: "دست‌نویس است", low_quality_scan: "کیفیت اسکن پایین است", unclear_structure: "ساختارش روشن نیست", not_a_proforma: "پیش‌فاکتور نیست", password_protected: "فایل رمز دارد", empty: "خالی است" };

  /* بدنهٔ خام می‌رود، پس TP.api (که JSON می‌فرستد) به کار نمی‌آید */
  async function uploadProforma(supplier, file) {
    const ex = TP.session.get();
    const qs = `?assignment_id=${A().id}&supplier_name=${encodeURIComponent(supplier)}&filename=${encodeURIComponent(file.name)}`;
    const res = await fetch((CFG.apiBase || "/tamin-poshtibani/api") + "/proformas/upload" + qs, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream", ...(ex && ex.code ? { "X-Expert-Code": ex.code } : {}) },
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
          + (res.unsaved ? `<br><span class="chip warn">${M(res.unsaved)} خط هنوز فیلد اجباری خالی دارد</span>${(res.missing || []).length ? `: ${esc(res.missing.map((f) => LBL[f] || f).join("، "))}` : ""}` : "")
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

  function vQuotes() {
    const r = S.d.request, its = items(), Q = S.d.quotes;
    return `<div class="pad">
      <div class="toolrow"><button class="tp-btn" data-add-row>افزودن تأمین‌کننده</button>
        <span class="chip">${qCount()} استعلام ثبت‌شده</span><span class="chip">${pCount()} پیش‌فاکتور</span>
        <span class="dim" style="font-size:.85rem">اجباری: واحد، مقدار، قیمت واحد، زمان تحویل، شرایط تسویه، نوع فاکتور (خط دستی: غیررسمی؛ خوانده‌شده از پیش‌فاکتور: رسمی، مگر سند خلافش را بگوید). بقیه اختیاری‌اند و خالی بودنشان مانع ثبت نیست. هر ویرایش، «ثبت موقت» را برمی‌دارد.</span></div>
      ${Q.length ? `<div class="tp-scroll" data-keep-scroll style="max-height:56vh"><table class="tp-table q"><thead><tr>
        <th>تأیید نهایی</th><th class="rt">تأمین‌کننده</th><th>قلم</th>${QF.map((f) => `<th>${f[1]}${f[4] ? OPTL : ""}</th>`).join("")}<th>نوع فاکتور</th><th>شرایط تسویه</th><th>ارزش افزوده</th><th>محل معامله${OPTL}</th><th>محل تحویل${OPTL}</th><th>قیمت کل</th><th>پیش‌فاکتور</th><th>استخراج</th><th>ثبت موقت</th><th></th></tr></thead><tbody>
        ${Q.map((q) => `<tr class="${q.saved ? "" : ""}">
          <td><input type="checkbox" data-fin="${q.id}" ${q.final ? "checked" : ""}></td>
          <td class="rt">${esc(q.supplier_name)}${q.supplier_code ? `<div class="dim num" style="font-size:.75rem">${esc(q.supplier_code)}</div>` : ""}</td>
          <td><select class="tp-select" data-qf="${q.id}|item_id">${its.map((x) => `<option value="${x.id}" ${q.item_id === x.id ? "selected" : ""}>${esc(x.title)}</option>`).join("")}</select></td>
          ${QF.map(([k, , w, ty, opt]) => `<td><input class="tp-input ${!opt && (q[k] == null || q[k] === "") ? "bad" : ""} ${ty === "date" ? "date" : ""} ${ty === "num" ? "num" : ""}" data-qf="${q.id}|${k}" ${opt ? 'data-opt="1"' : ""} value="${esc(q[k] == null ? "" : q[k])}" style="width:${w}px" ${ty === "date" ? "readonly" : ""} ${ty === "num" ? 'inputmode="decimal"' : ""}></td>`).join("")}
          <td><select class="tp-select ${q.invoice ? "" : "bad"}" data-qf="${q.id}|invoice"><option value="">—</option>${INVT.map((v) => `<option ${q.invoice === v ? "selected" : ""}>${v}</option>`).join("")}</select></td>
          <td><select class="tp-select ${q.pay ? "" : "bad"}" data-qf="${q.id}|pay"><option value="">—</option>${PAYS.map((v) => `<option ${q.pay === v ? "selected" : ""}>${v}</option>`).join("")}</select></td>
          <td><select class="tp-select ${q.vat ? "" : "bad"}" data-qf="${q.id}|vat" title="اجباری — قیمتِ ردیف باید بدون ارزش افزوده باشد؛ ارزش افزوده ته جدول جدا حساب می‌شود"><option value="">—</option>${VATS.map((v) => `<option ${q.vat === v ? "selected" : ""}>${v}</option>`).join("")}</select></td>
          <td><select class="tp-select" data-qf="${q.id}|deal" title="اختیاری — تصمیم داخلی؛ از پیش‌فاکتور استخراج نمی‌شود"><option value="">—</option>${DEALS.map((v) => `<option ${q.deal === v ? "selected" : ""}>${v}</option>`).join("")}</select></td>
          <td style="min-width:170px"><div class="stack"><select class="tp-select" data-qf="${q.id}|place" title="اختیاری"><option value="">—</option>${PLACES.map((v) => `<option ${q.place === v ? "selected" : ""}>${v}</option>`).join("")}</select>
            ${q.place === "سایر" ? `<input class="tp-input ${q.place_other ? "" : "bad"}" data-qf="${q.id}|place_other" value="${esc(q.place_other || "")}" placeholder="محل را بنویسید" title="${esc(q.place_other || "")}">` : ""}</div></td>
          <td class="num">${(Number(q.qty) || 0) * (Number(q.price) || 0) ? M((Number(q.qty) || 0) * (Number(q.price) || 0)) : "—"}</td>
          <td>${pfCell(q)}</td>
          <td>${exCell(q)}</td>
          <td>${q.saved ? `<span class="chip ok">ثبت شد</span>` : `<button class="tp-btn xs primary" data-save="${q.id}">ثبت موقت</button>`}${q.low_conf ? `<div><span class="chip warn">کم‌اطمینان</span></div>` : ""}</td>
          <td><button class="tp-btn xs danger" data-del="${q.id}">حذف</button></td></tr>`).join("")}
        </tbody></table></div>
        ${vFormHead(r)}${vGuard()}`
        : `<div class="empty"><b>هنوز استعلامی نیست.</b>با «افزودن تأمین‌کننده» شروع کنید؛ بعد از اتصال سوابق و جستجوی هوشمند، از همان تب‌ها هم اضافه می‌شود.</div>`}
      <div class="tp-note">«زمان تحویل»، «اعتبار پیش‌فاکتور» و «شرایط تسویه» بعد از اتصال از پیش‌فاکتور استخراج می‌شوند. «محل معامله» (کارگاه یا دفتر مرکزی) فقط دستی است. تاریخ از تقویم انتخاب می‌شود.</div></div>`;
  }
  function vFormHead(r) {
    return `<div class="endbar" style="margin:16px 0 0;align-items:flex-end">
      <div class="tp-field"><b>نوع درخواست</b><select class="tp-select" data-h="req_type">${REQT.map((x) => `<option ${(r.head_req_type || "عادی") === x ? "selected" : ""}>${x}</option>`).join("")}</select></div>
      <div class="tp-field"><b>نوع معامله</b><select class="tp-select" data-h="deal_type">${DEALT.map((x) => `<option ${(r.head_deal_type || "خرید") === x ? "selected" : ""}>${x}</option>`).join("")}</select></div>
      <div class="tp-field" style="flex:1;min-width:240px"><b>محل پروژه</b><input class="tp-input" data-h="site" value="${esc(r.head_site == null ? r.party : r.head_site)}" style="width:100%"></div>
      <span class="dim" style="font-size:.8rem">این سه فیلد در سرآیند فرم کمیسیون چاپ می‌شوند.</span></div>`;
  }
  function guardCheck() {
    const need = settings().minSuppliers || 1, miss = [];
    openItems().forEach((it) => { const n = S.d.quotes.filter((q) => q.saved && q.item_id === it.id).length; if (n < need) miss.push({ t: it.title, n }); });
    return { miss, need, fin: S.d.quotes.filter((q) => q.final && q.saved).length };
  }
  function vGuard() {
    const g = guardCheck(), ok = !g.miss.length && g.fin > 0;
    return `<div class="toolrow" style="margin-top:14px;align-items:flex-start"><button class="tp-btn primary" data-make-comm ${ok ? "" : "disabled"}>تولید جدول کمیسیون</button>
      <div style="font-size:.9rem">${g.fin ? "" : `<div style="color:#fca5a5">حداقل یک استعلام باید تیک «تأیید نهایی» بخورد.</div>`}
      ${g.miss.length ? `<div style="color:#fca5a5">مدیر حداقل <b>${g.need}</b> استعلام برای هر قلم باز را الزامی کرده. این اقلام کم دارند:</div><div class="muted">${g.miss.map((m) => `• ${esc(m.t)} (${m.n} از ${g.need})`).join("<br>")}</div>` : `<div style="color:#6ee7b7">همه ${openItems().length} قلم باز حداقل ${g.need} استعلام دارند.</div>`}</div></div>`;
  }

  /* ---------- تب جدول کمیسیون (فرم TSA-PS-FO-02) ----------
     پیش‌نمایش، دانلود و چاپ هر سه از سرور می‌آیند — از همان مدلی که فایل اکسل و Word را
     می‌سازد — تا آنچه دیده و چاپ می‌شود عیناً همان فایل‌ها باشد. */
  function commData() {
    const sup = []; S.d.quotes.filter((q) => q.final && q.saved).forEach((q) => { let g = sup.find((x) => x.name === q.supplier_name); if (!g) { g = { name: q.supplier_name, rows: {} }; sup.push(g); } g.rows[q.item_id] = q; });
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
    if (!a.commission_at) return `<div class="pad"><div class="empty"><b>جدول کمیسیون هنوز ساخته نشده.</b>از تب استعلامات، تأمین‌کنندگان منتخب را «تأیید نهایی» کنید و «تولید جدول کمیسیون» را بزنید.</div></div>`;
    const d = commData();
    if (!d.sup.length) return `<div class="pad"><div class="empty">هیچ استعلام تأییدنهایی‌شده‌ای نیست.</div></div>`;
    const sh = sheetsFor();
    if (!sh) loadSheets();
    const z = S.sheetZoom || 10;
    const ready = sh && sh.rq && sh.cm;
    return `<div class="pad"><div class="toolrow"><b>جدول کمیسیون — درخواست <span class="num">${esc(r.id)}</span></b><span class="chip">${d.sup.length} تأمین‌کننده · ${items().filter((it) => d.sup.some((g) => g.rows[it.id])).length} از ${items().length} قلم</span>
        <span style="margin-inline-start:auto"></span>
        <button class="tp-btn sm" data-dl="commission">دانلود اکسل جدول کمیسیون</button>
        <button class="tp-btn sm" data-dl="request">دانلود Word برگهٔ درخواست خرید</button>
        <button class="tp-btn sm primary" data-print ${ready ? "" : "disabled"}>پرینت / PDF (برگه درخواست + جدول)</button></div>
      <div class="tp-note" style="display:block;margin-bottom:10px">
        <b>توضیحات تدارکات و پشتیبانی</b> — این متن در خانهٔ «توضیحات تدارکات و پشتیبانی» جدول کمیسیون می‌نشیند. از بات تلگرام هم در منوی «تولید جدول کمیسیون» با «درج توضیحات» می‌توانید بنویسید.
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
          <div class="sheetpage" style="font-size:${z}px">${sh.cm.html}</div></div>`}
      <div class="tp-note">پیش‌نمایش، فایل اکسل و فایل Word از یک مدل ساخته می‌شوند و عیناً قالب فرم‌های شرکت‌اند: جدول کمیسیون مثل «مقایسه استعلام بها» (TSA-PS-FO-02) و برگهٔ درخواست مثل چاپ راهکاران. پرینت هر برگه را در یک صفحهٔ A4 افقی جا می‌دهد؛ برای PDF در پنجرهٔ چاپ «Save as PDF» را انتخاب کنید.</div></div>`;
  }

  /* دانلود فایل از سرور با کد کارشناس — لینک مستقیم هدر احراز هویت را نمی‌فرستد */
  async function downloadSheet(kind) {
    const r = S.d.request, aid = A().id;
    const b = TP.busy("ساختن فایل…", kind === "request" ? "برگهٔ درخواست خرید (Word)" : "جدول کمیسیون (اکسل)");
    try {
      const ex = TP.session.get();
      const res = await fetch(`${CFG.apiBase || "/tamin-poshtibani/api"}/assignments/${aid}/sheet/${kind}`, { headers: ex && ex.code ? { "X-Expert-Code": ex.code } : {} });
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
    const ex = TP.session.get();
    const qs = `?letter_id=${letterId}${secs ? `&secs=${secs}` : ""}`;
    const res = await fetch(`${CFG.apiBase || "/tamin-poshtibani/api"}/assignments/${A().id}/letter/voice${qs}`, {
      method: "POST",
      headers: { "Content-Type": blobType(blob), ...(ex && ex.code ? { "X-Expert-Code": ex.code } : {}) },
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
      const ex = TP.session.get();
      const res = await fetch(`${CFG.apiBase || "/tamin-poshtibani/api"}/assignments/${aid}/letter/file`, { headers: ex && ex.code ? { "X-Expert-Code": ex.code } : {} });
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
      <b>نامه را با حرف زدن بسازید.</b>
      <p class="lead" style="margin:8px 0 0">توضیح بدهید در جریان این خرید چه اتفاقی افتاده: چه چالشی داشتید، چرا این تأمین‌کننده، چه چیزی طول کشید. محاوره‌ای و به زبان خودتان بگویید — متنِ رسمی را سامانه می‌نویسد و روی سربرگ شرکت می‌گذارد.</p>
      <p class="lead" style="margin:8px 0 0">مخاطب، «موضوع: گزارش خرید …»، «با سلام و احترام» و امضا را سامانه می‌گذارد و عددها از جدول کمیسیون برداشته می‌شوند، نه از حرف شما.</p>
      <div style="margin-top:12px"><button class="tp-btn primary" data-lt-start>${L ? "شروع دوبارهٔ نامه" : "شروع نامه"}</button></div></div>`;
  }
  function vLetterAsk(L, box) {
    const stt = box.stt !== false, rec = canRecord();
    return `<div class="tp-note" style="display:block">
        <b>۱ — توضیحتان را بگویید</b>
        <p class="lead" style="margin:6px 0 0">چه چالشی داشتید، چرا این تأمین‌کننده، چه چیزی طول کشید. یک تا دو دقیقه کافی است.</p>
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
        <p class="lead" style="margin:6px 0 0">جایی که نمی‌شود حرف زد، بنویسید؛ از این نقطه به بعد مسیر یکی است.</p>
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
        <b>۱ — این را شنیدم</b>
        <p class="lead" style="margin:6px 0 0">اگر کلمه‌ای اشتباه شنیده شده همین‌جا اصلاحش کنید؛ نامه از روی همین متن نوشته می‌شود.</p>
        <textarea class="tp-input" data-lt-text rows="7" maxlength="${LT_MAX}" style="width:100%;margin-top:8px;resize:vertical;font-family:inherit">${esc(text)}</textarea>
        <div style="margin-top:8px"><button class="tp-btn sm" data-lt-again>✏️ از نو می‌گویم</button></div>
      </div>
      <div class="tp-note" style="display:block;margin-top:10px">
        <b>۲ — موضوع نامه</b>
        <p class="lead" style="margin:6px 0 0">نامه دربارهٔ کدام اقلام است؟ پیش‌فرض، اقلامی است که در جدول کمیسیون «تأیید نهایی» دارند.</p>
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
        <button class="tp-btn sm" data-lt-start>نامهٔ تازه</button></div>
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
      <div class="tp-note">همین متن در فایل Word روی سربرگ شرکت نشسته است. اگر جایی را می‌خواهید عوض کنید فایل را دانلود و در Word اصلاحش کنید، یا «نامهٔ تازه» بزنید و دوباره توضیح بدهید.</div>`;
  }

  /* ---------- قالب‌های پیام (واقعی، ذخیره در D1) ---------- */
  const DEFAULT_TPL = [
    { title: "زمان تحویل", body: `سلام، از شرکت ${COMPANY} تماس می‌گیرم.\nبرای {عنوان قلم} به مقدار {مقدار} {واحد} استعلام قیمت نیاز داریم.\nلطفاً زودترین زمان تحویل ممکن را اعلام بفرمایید.\n{نام کارشناس}` },
    { title: "مکان تحویل", body: `سلام، از شرکت ${COMPANY} تماس می‌گیرم.\nدرباره {عنوان قلم} ({مقدار} {واحد}) — امکان تحویل در محل پروژه را دارید یا تحویل درب انبار شماست؟\nهزینه حمل چقدر است؟\n{نام کارشناس}` },
    { title: "رسمی", body: `با سلام و احترام\nشرکت ${COMPANY} در نظر دارد نسبت به تامین {عنوان قلم} به مقدار {مقدار} {واحد} با مشخصات {مشخصات فنی} اقدام نماید.\nخواهشمند است قیمت، شرایط پرداخت و زمان تحویل را اعلام فرمایید.\nبا تشکر — {نام کارشناس}` },
  ];
  async function loadTemplates() { try { S.templates = (await TP.api("/templates")).templates || []; } catch (_) { S.templates = []; } }
  function fillTpl(body, supplier) {
    const it = item() || {};
    return String(body || "").replace(/\{عنوان قلم\}/g, it.title || "").replace(/\{مقدار\}/g, it.qty == null ? "" : M(it.qty)).replace(/\{واحد\}/g, it.unit || "")
      .replace(/\{مشخصات فنی\}/g, it.spec || "—").replace(/\{تامین‌کننده\}/g, supplier || "").replace(/\{نام کارشناس\}/g, S.expert.name);
  }
  async function pickTemplate() {
    await loadTemplates();
    if (!S.templates.length) { for (const t of DEFAULT_TPL) await TP.api("/templates", { body: t }); await loadTemplates(); }
    S.tpl = Math.min(S.tpl, S.templates.length - 1);
    const d = TP.modal("قالب‌های پیام", `<p class="muted" style="margin:0 0 8px;font-size:.88rem">قالبی را انتخاب یا ویرایش کنید، یا قالب تازه بسازید. جای‌خالی‌ها هنگام ارسال با دادهٔ همین قلم پر می‌شوند.</p>
      <div class="tplbar" id="tb"></div><div id="ed"></div>`, null, "بستن", "");
    const paint = () => {
      d.querySelector("#tb").innerHTML = S.templates.map((t, i) => `<button class="tplbtn ${i === S.tpl ? "on" : ""}" data-t="${i}"><i>قالب ${i + 1}</i><b>${esc(t.title)}</b></button>`).join("") + `<button class="tplbtn" data-add><i>&nbsp;</i><b>+ قالب جدید</b></button>`;
      const t = S.templates[S.tpl]; const toks = ["عنوان قلم", "مقدار", "واحد", "مشخصات فنی", "تامین‌کننده", "نام کارشناس"];
      d.querySelector("#ed").innerHTML = `<div class="tp-field" style="margin-bottom:8px"><b>عنوان قالب</b><input class="tp-input" id="tt" value="${esc(t.title)}" style="width:100%"></div>
        <textarea class="tp-textarea" id="tb2">${esc(t.body)}</textarea>
        <div class="tokens">${toks.map((x) => `<button class="tok" data-k="${x}">{${x}}</button>`).join("")}</div>
        <div class="tp-note" style="margin:8px 0"><b>پیش‌نمایش برای قلم فعلی:</b><br><span style="white-space:pre-wrap">${esc(fillTpl(t.body, "«تأمین‌کننده»"))}</span></div>
        <div class="tp-acts"><button class="tp-btn primary" data-save>ذخیره</button><button class="tp-btn" data-del ${S.templates.length < 2 ? "disabled" : ""}>حذف این قالب</button></div>`;
      const ta = d.querySelector("#tb2");
      d.querySelectorAll(".tok").forEach((b) => b.onclick = () => { /* جای‌خالی همان‌جای مکان‌نما می‌نشیند و مکان‌نما بعد از آن و یک فاصله می‌رود */ const tk = "{" + b.dataset.k + "} ", s = ta.selectionStart, e = ta.selectionEnd; ta.value = ta.value.slice(0, s) + tk + ta.value.slice(e); const pos = s + tk.length; ta.focus(); ta.setSelectionRange(pos, pos); });
      d.querySelectorAll("[data-t]").forEach((b) => b.onclick = () => { S.tpl = +b.dataset.t; paint(); });
      d.querySelector("[data-add]").onclick = async () => { await TP.api("/templates", { body: { title: "قالب جدید", body: `سلام، از شرکت ${COMPANY} تماس می‌گیرم.\n` } }); await loadTemplates(); S.tpl = S.templates.length - 1; paint(); };
      d.querySelector("[data-save]").onclick = async () => { await TP.api(`/templates/${t.id}`, { method: "PUT", body: { title: d.querySelector("#tt").value || "بدون عنوان", body: ta.value } }); await loadTemplates(); paint(); };
      d.querySelector("[data-del]").onclick = async () => { if (S.templates.length < 2) return; await TP.api(`/templates/${t.id}`, { method: "DELETE" }); await loadTemplates(); S.tpl = 0; paint(); };
    };
    paint();
  }

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
      S.tray = t.assignments || []; S.settings = t.settings; S.now = Date.now(); S.error = ""; S.tg = t.tg || null;
      /* ارشد بودن، زیرمجموعه‌ها و تیک اعلان‌ها را مدیر هر لحظه ممکن است عوض کند؛ از سرور تازه می‌شود */
      if (me && me.expert) { S.expert = { ...S.expert, ...me.expert, team: me.team || [] }; TP.session.set(S.expert); }
      if (isSenior() && !S.team) loadTeam(true);
    }
    catch (e) { if (e.status === 401) { TP.session.clear(); S.expert = null; S.screen = "login"; } S.error = e.message; }
    render();
  }
  async function openDetail(aid, keepTab) {
    try { const d = await TP.api(`/assignments/${aid}`);
      /* بازخوانی خودکار نباید کاری را که کارشناس وسطش است (تب، قلم) به هم بزند */
      if (!keepTab) S.fromTeam = S.screen === "list" && S.tab === "team";
      S.d = d; S.d.loadedAt = Date.now(); S.settings = S.d.settings; S.now = Date.now(); if (!keepTab) { S.itemIdx = 0; S.tab = "history"; } if (S.itemIdx >= S.d.items.length) S.itemIdx = 0; S.screen = "detail";
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
  function tgButtons() {
    const tg = S.tg || {};
    const exp = tg.botConfigured ? `<button class="tp-btn sm ${tg.connected ? "" : "primary"}" data-tg title="${tg.connected ? "ارجاع‌ها و یادآوری مهلت در تلگرام شما می‌آید" : "دریافت ارجاع‌ها و یادآوری مهلت در تلگرام"}">${tg.connected ? "✅ " : ""}${isSenior() ? "تلگرام کارشناسی" : tg.connected ? "تلگرام" : "اتصال به تلگرام"}</button>` : "";
    const team = isSenior() && (tg.teamBotConfigured || tg.botConfigured) ? `<button class="tp-btn sm ${S.expert.team_connected ? "" : "primary"}" data-team-link title="اعلان‌های پایش کارشناسان تیم شما">${S.expert.team_connected ? "✅ " : ""}تلگرام تیمی</button>` : "";
    return exp + team;
  }

  /* ---------- رندر ---------- */
  function render() {
    const app = document.getElementById("app");
    if (!S.expert) S.screen = "login";
    const restore = TP.snapScroll();
    app.innerHTML = `<header class="tp-top"><div class="brand"><img src="../assets/logo-new.jpg" alt=""><div><h1>پنل کارشناس خرید</h1><div class="sub">${S.expert ? esc(S.expert.name) + " · " : ""}${esc(COMPANY)}</div></div></div>
      <span class="spacer"></span>${TP.themeBtn()}${S.expert ? `${tgButtons()}<button class="tp-btn sm" data-refresh title="به‌روزرسانی">↻</button><a class="tp-back" href="index.html">تدارکات</a><button class="tp-btn xs" data-logout>خروج</button>` : ""}</header>
      ${S.error && S.screen !== "login" ? `<div class="tp-note warn" style="margin:10px 18px">${esc(S.error)}</div>` : ""}
      ${S.screen === "login" ? vLogin() : S.screen === "list" ? vList() : vDetail()}`;
    wire();
    /* سرآیند چهارطبقهٔ جدول سوابق باید بچسبد، وگرنه با اسکرول معلوم نیست
       هر ستون مال کدام گروه است. */
    const grid = app.querySelector("table.grid"); if (grid) TP.stickHeader(grid);
    restore();
  }

  /* ---------- اتصال ---------- */
  function wire() {
    const a = document.getElementById("app"), Q = (s) => a.querySelectorAll(s), G = (s) => a.querySelector(s);
    const lg = G("[data-login]"); if (lg) { const go = async () => { const c = G("#code").value.trim(); if (!c) return; try { const r = await TP.api("/login", { body: { code: c } }); TP.session.set(r.expert); S.expert = r.expert; S.error = ""; S.screen = "list"; await loadTray(); } catch (e) { S.error = e.message; render(); } }; lg.onclick = go; G("#code").onkeydown = (e) => { if (e.key === "Enter") go(); }; return; }
    const lo = G("[data-logout]"); if (lo) lo.onclick = () => { TP.session.clear(); S.expert = null; S.d = null; S.screen = "login"; render(); };
    const rf = G("[data-refresh]"); if (rf) rf.onclick = () => S.screen === "detail" ? reload() : loadTray();
    const tg = G("[data-tg]"); if (tg) tg.onclick = tgConnect;
    Q("[data-req]").forEach((x) => x.onclick = (e) => { if (e.target.closest("[data-stop]")) return; openDetail(+x.dataset.req); });
    /* تیم کارشناسی */
    Q("[data-stab]").forEach((b) => b.onclick = () => { S.tab = b.dataset.stab === "tray" ? "history" : b.dataset.stab; if (S.tab === "team") loadTeam(true); render(); });
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
    const bk = G("[data-back]"); if (bk) bk.onclick = () => { if (S.lt.on) recStop(true); S.screen = "list"; S.d = null; S.letter = null; if (S.fromTeam) { S.tab = "team"; S.fromTeam = false; loadTeam(true); } loadTray(); };
    Q("[data-item]").forEach((x) => x.onclick = () => { S.itemIdx = +x.dataset.item; render(); });
    Q("[data-tab]").forEach((x) => x.onclick = () => { if (S.lt.on && x.dataset.tab !== "letter") recStop(true); S.tab = x.dataset.tab; render(); });
    Q("[data-idone]").forEach((c) => c.onchange = async (e) => { try { await TP.api(`/items/${e.target.dataset.idone}/commission`, { body: { ok: e.target.checked } }); await reload(); } catch (er) { TP.modal("خطا", esc(er.message), null, "باشد", ""); } });
    Q("[data-eact]").forEach((b) => b.onclick = () => doExpertAct(b.dataset.eact));
    const tp = G("[data-tpl]"); if (tp) tp.onclick = pickTemplate;
    /* سوابق */
    const mo = G("[data-mom]");
    if (mo) {
      mo.oninput = (e) => { S.mom = +e.target.value; const lab = G("[data-mom-val]"); if (lab) lab.textContent = M(S.mom); };
      mo.onchange = () => { try { localStorage.setItem(MOM_KEY, String(S.mom)); } catch (_) { /* حالت خصوصی */ } if (S.hist[item().id]) runHist(); };
    }
    const rh = G("[data-run-hist]"); if (rh) rh.onclick = runHist;
    /* نرمال‌سازی اقلام و حالت جستجو */
    const nOn = G("[data-norm-on]");
    if (nOn) nOn.onchange = (e) => {
      S.normOn = e.target.checked;
      try { localStorage.setItem(NORM_KEY, S.normOn ? "1" : "0"); } catch (_) { /* حالت خصوصی */ }
      /* تیک فقط کادرِ لایهٔ زیرین را نشان می‌دهد؛ مبنای جستجو عوض نمی‌شود، پس نتیجه می‌ماند */
      render();
    };
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
    Q("[data-pick-u]").forEach((c) => c.onchange = () => {
      const it = item(); if (!it) return;
      const n = S.norm[it.id], rv = (n && n.data && n.data.rates) || {};
      const all = [rv.refRow ? rv.refRow.unit : rv.ref, ...(rv.units || []).map((u) => u.unit)].filter(Boolean);
      const p = pickOf(it), cur = new Set(p.units || all);
      if (c.checked) cur.add(c.dataset.pickU); else cur.delete(c.dataset.pickU);
      p.units = all.every((u) => cur.has(u)) ? null : all.filter((u) => cur.has(u));
      if (S.hist[it.id]) runHist(); else render();
    });
    /* ویرایش پیش‌نویس بی‌بازرندر، تا فوکوس و مکان‌نما نپرند */
    const nd = () => { const it = item(); return it && S.norm[it.id] && S.norm[it.id].draft; };
    /* فرمول‌ها و نرخِ ردیف‌های پویا با لایه‌های تازهٔ پیش‌نویس، همان لحظه و بی بازرندر */
    const paintFx = () => {
      const it = item(), n = it && S.norm[it.id]; if (!n || !n.data || !n.draft) return;
      for (const u of (n.data.rates && n.data.rates.units) || []) {
        const cell = [...Q("[data-norm-fx]")].find((el) => el.dataset.normFx === u.unit); if (!cell) continue;
        const cv = liveConv(n, u.unit);
        cell.innerHTML = fxHtml(n, u, cv);
        const inp = [...Q("[data-norm-rate]")].find((el) => el.dataset.normRate === u.unit);
        if (inp && document.activeElement !== inp && n.draft.rates[u.unit] == null) inp.value = fmtRate(rateShown(n, u, cv), false);
      }
    };
    const nh = G("[data-norm-head]"); if (nh) nh.oninput = (e) => { const d = nd(); if (d) { d.head = e.target.value; paintFx(); } };
    /* نام لایه عوض شد: کمّی یا نبودنش فرق کرد، پس فیلد واحد باید بیاید یا برود (بازرندر) */
    Q("[data-norm-lk]").forEach((x) => x.onchange = (e) => {
      const d = nd(); if (!d) return;
      const l = d.layers[+e.target.dataset.normLk], was = isQuant(l.k);
      l.k = e.target.value;
      if (!isQuant(l.k)) l.u = "";
      if (was !== isQuant(l.k)) render(); else paintFx();
    });
    /* دستِ کارشناس که به مقدار بخورد، دیگر «ضمنی» نیست */
    Q("[data-norm-lv]").forEach((x) => x.oninput = (e) => { const d = nd(); if (d) { const l = d.layers[+e.target.dataset.normLv]; l.t = e.target.value; l.i = false; paintFx(); } });
    Q("[data-norm-lu]").forEach((x) => x.onchange = (e) => { const d = nd(); if (d) { const l = d.layers[+e.target.dataset.normLu]; l.u = e.target.value; l.i = false; paintFx(); } });
    Q("[data-norm-ldel]").forEach((x) => x.onclick = () => { const d = nd(); if (d) { d.layers.splice(+x.dataset.normLdel, 1); render(); } });
    const nla = G("[data-norm-ladd]");
    if (nla) nla.onclick = () => {
      const n = S.norm[item().id]; if (!n || !n.draft) return;
      const used = new Set(n.draft.layers.map((l) => l.k));
      n.draft.layers.push({ k: (n.data.layerNames || []).find((x) => !used.has(x)) || "", t: "", u: "", i: false }); render();
    };
    Q("[data-norm-rate]").forEach((x) => x.oninput = (e) => {
      const n = S.norm[item().id]; if (!n || !n.draft) return;
      const u = e.target.dataset.normRate, v = numIn(e.target.value);
      const orig = ((n.data.rates && n.data.rates.units) || []).find((r) => r.unit === u);
      /* فقط نرخی که واقعاً عوض شده «نرخ کارشناس» می‌شود؛ خالی یا برابرِ نرخ فایل یا حاصلِ فرمول (همان‌طور که با
         دو رقم اعشار نشان داده شده) یعنی همان نرخ فایل یا فرمول، با دقتِ کاملش */
      const live = orig && liveConv(n, u), shown = orig ? (live && live.type === "dynamic" && live.rate != null ? live.rate : orig.rate) : null;
      const same = (r) => r != null && (v === r || v === Number(fmtRate(r, false)));
      if (v == null || (orig && orig.src !== "user" && (same(orig.rate) || same(shown)))) delete n.draft.rates[u]; else n.draft.rates[u] = v;
      /* نوشتن یا پاک کردنِ نرخِ دستی: یادداشتِ «نرخِ دستی مقدم است» کنار فرمول */
      const cell = [...Q("[data-norm-fx]")].find((el) => el.dataset.normFx === u);
      if (cell && orig) cell.innerHTML = fxHtml(n, orig, live);
    });
    const ncf = G("[data-norm-confirm]"); if (ncf) ncf.onclick = () => { confirmNormUI(); };
    /* هر فراخوانی مدل با کادرِ تأیید و هزینهٔ تقریبی */
    const nrd = G("[data-norm-redo]"); if (nrd) nrd.onclick = () => askModel(item(), true);
    const nmd = G("[data-norm-model]"); if (nmd) nmd.onclick = () => askModel(item(), false);
    const nrt = G("[data-norm-retry]"); if (nrt) nrt.onclick = () => runNormalize(false);
    const ncl = G("[data-norm-clear]"); if (ncl) ncl.onclick = clearNormUI;
    const nrv = G("[data-norm-revert]"); if (nrv) nrv.onclick = revertEditUI;
    /* کادر باز است و این قلم هنوز ساختاری ندارد → خودکار از دیتابیس خوانده می‌شود (بی مدل؛ Task.txt: «به شکل خودکار») */
    if (S.screen === "detail" && S.tab === "history" && (S.normOn || S.hmode === "pick") && item() && !S.norm[item().id]) runNormalize(false);
    const chb = G("[data-chart]"); if (chb) chb.onclick = () => openChart(item());
    Q("[data-hsort]").forEach((el) => el.onclick = () => { S.hsort = el.dataset.hsort; render(); });
    Q("[data-prof]").forEach((el) => el.onclick = () => { S.prof = S.prof === el.dataset.prof ? null : el.dataset.prof; render(); });
    const cp = G("[data-close-prof]"); if (cp) cp.onclick = () => { S.prof = null; render(); };
    Q("[data-buys]").forEach((b) => b.onclick = () => showBuys(b.dataset.buys));
    Q("[data-to-quote]").forEach((b) => b.onclick = () => addFromHistory(b.dataset.toQuote));
    const rs = G("[data-run-smart]"); if (rs) rs.onclick = runSmart;
    Q("[data-mark]").forEach((b) => b.onclick = async () => { const it = item(); await TP.api(`/items/${it.id}/progress`, { body: { stage: b.dataset.mark } }); await reload(); });
    /* قیدهای جستجوی هوشمند — بدون بازرندر حین تایپ تا فوکوس نپرد؛ state همان لحظه به‌روز است */
    Q("[data-smk]").forEach((c) => c.onchange = (e) => {
      const sm = smOf(item());
      const k = e.target.dataset.smk, i = sm.markets.indexOf(k), cap = S.maxMarkets || 3;
      /* سقف هزینهٔ هر جستجو: بیش از سه بازار میان پنج جستجو پخش نمی‌شود */
      if (e.target.checked && i < 0 && sm.markets.length >= cap) {
        e.target.checked = false;
        return TP.modal("حداکثر سه بازار", "برای اینکه هزینهٔ هر جستجو از سقف ۲۰ سنت نگذرد، هر اجرا حداکثر سه بازار دارد. اول تیک یکی را بردارید.", null, "باشد", "");
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
    Q("[data-qf]").forEach((el) => {
      const [id, f] = el.dataset.qf.split("|"); const q = S.d.quotes.find((x) => x.id === +id); if (!q) return;
      if (el.classList.contains("date")) { el.onclick = () => TP.openDatePicker(el, async (v) => { await TP.api(`/quotes/${id}`, { method: "PUT", body: { [f]: v } }); await reload(); }, { single: true }); return; }
      /* قالب فیلد (تصمیم مدیر): قیمت و مقدار عدد، زمان تحویل تاریخ یا عدد روز، اعتبار عدد — اشتباه، خطا می‌دهد و ذخیره نمی‌شود */
      const commit = async () => { if (String(q[f] == null ? "" : q[f]) === el.value) return;
        const bad = TP.quoteFieldError(f, el.value);
        if (bad) { el.classList.add("bad"); TP.modal("قالب فیلد درست نیست", esc(bad), null, "باشد", ""); return; }
        try { await TP.api(`/quotes/${id}`, { method: "PUT", body: { [f]: f === "item_id" ? +el.value : el.value } }); await reload(); }
        catch (e) { el.classList.add("bad"); TP.modal("ذخیره نشد", esc(e.message), null, "باشد", ""); } };
      if (el.tagName === "SELECT") el.onchange = commit; else { el.onchange = commit; el.oninput = () => { if (!el.dataset.opt) el.classList.toggle("bad", !el.value); const tot = document.querySelector(`[data-qf="${id}|qty"]`), pr = document.querySelector(`[data-qf="${id}|price"]`); if (tot && pr) { const v = (Number(tot.value) || 0) * (Number(String(pr.value).replace(/,/g, "")) || 0); const cell = el.closest("tr").children[3 + QF.length + 4]; if (cell) cell.textContent = v ? M(v) : "—"; } }; }
    });
    Q("[data-fin]").forEach((c) => c.onchange = async (e) => { await TP.api(`/quotes/${e.target.dataset.fin}`, { method: "PUT", body: { final: e.target.checked ? 1 : 0 } }); await reload(); });
    Q("[data-save]").forEach((b) => b.onclick = async () => { try { await TP.api(`/quotes/${b.dataset.save}`, { method: "PUT", body: { save: true } }); await reload(); } catch (e) {
      const miss = (e.data && e.data.missing) || [];
      if (!miss.length) return TP.modal("ثبت موقت انجام نشد", esc(e.message), null, "باشد", "");
      TP.modal("ثبت موقت انجام نشد", `این فیلدهای اجباری خالی‌اند:<br><br><b>${miss.map((f) => LBL[f] || f).join("، ")}</b><br><br>تا ثبت موقت انجام نشود، این ردیف در شمارنده و کمیسیون حساب نمی‌شود.`, null, "باشد", ""); } });
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
    const mc = G("[data-make-comm]"); if (mc) mc.onclick = async () => { try { await TP.api(`/assignments/${A().id}/commission`, { body: {} }); S.tab = "comm"; await reload(); } catch (e) { TP.modal("تولید جدول کمیسیون", esc(e.message) + (e.data && e.data.missing && e.data.missing.length ? `<br><br>${e.data.missing.map((m) => `• ${esc(m.title)} (${m.n} از ${e.data.need})`).join("<br>")}` : ""), null, "باشد", ""); } };
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

  function doExpertAct(act) {
    const its = items(), n = its.length, done = its.filter((i) => i.commission_ok && i.state === "open");
    const lbl = { hold: "تعلیق", stop: "توقف", end: "خاتمه" }[act];
    let body = "";
    if (act === "end") body = done.length === openItems().length ? `هر <b>${done.length}</b> قلم باز را کمیسیون تأیید کرده است.<br><br>این اقلام <b>«بسته شده»</b> ثبت می‌شوند و درخواست از کارتابل شما خارج می‌شود.`
      : `<b>${done.length}</b> قلم از <b>${n}</b> قلم تأیید شده است:<br><br>${done.map((i) => "• " + esc(i.title)).join("<br>")}<br><br>این اقلام بسته می‌شوند و از کارتابل خارج می‌شوند؛ باقی اقلام همچنان پیگیری می‌شوند (خاتمهٔ جزئی).`;
    else body = `با این کار پایش و اعلان این درخواست متوقف می‌شود و از کارتابل شما خارج می‌شود.`;
    body += `<br><br><div class="tp-note" style="margin:0">${settings().approvalRequired ? "چون مدیر گزینهٔ «تصمیم کارشناس منوط به تأیید من» را فعال کرده، این درخواست ابتدا برای <b>تأیید مدیر</b> می‌رود و تا تأیید او اعمال نمی‌شود." : "تصمیم بلافاصله اعمال می‌شود و برای مدیر ثبت می‌شود."} نتیجه در تلگرام هم می‌آید.</div>`;
    TP.modal(`${lbl} — درخواست ${esc(S.d.request.id)}`, body, async () => {
      try { const r = await TP.api(`/assignments/${A().id}/decision`, { body: { action: act, item_ids: act === "end" ? done.map((i) => i.id) : null } });
        if (r.pending) { TP.modal("ارسال شد", "درخواست شما برای تأیید مدیر ارسال شد. تا تأیید او وضعیت تغییر نمی‌کند.", null, "باشد", ""); await reload(); }
        else { S.screen = "list"; S.d = null; await loadTray(); } }
      catch (e) { TP.modal("خطا", esc(e.message), null, "باشد", ""); }
    }, `تأیید ${lbl}`);
  }

  /* ---------- شروع ---------- */
  if (S.expert) { S.screen = "list"; loadTray(); } else render();
  window.addEventListener("tp-theme", render);
  /* هیچ به‌روزرسانی خودکاری نداریم (تصمیم مدیر، شهریور ۱۴۰۵): صفحه با دکمهٔ ↻ یا با کار
     خود کارشناس تازه می‌شود، تا وسط پر کردن استعلام چیزی جابه‌جا نشود. */
})();
