/* ============================================================
   پنل کارشناس خرید
   ورود با کد → کارتابل (ارجاع‌های ارسال‌شده به این کارشناس) → جزئیات درخواست
   با چهار تب: بررسی سوابق · جستجوی هوشمند · استعلامات · جدول کمیسیون

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
    sm: { markets: ["IR"], brand: "", specs: "", notes: "" },   // قیدهای جستجوی هوشمند
    smProf: null,                          // تأمین‌کنندهٔ بازشده در نتایج جستجو
    marketsMeta: [{ key: "IR", fa: "ایران" }, { key: "TJ", fa: "تاجیکستان" }, { key: "TM", fa: "ترکمنستان" }, { key: "UZ", fa: "ازبکستان" }, { key: "KZ", fa: "قزاقستان" }, { key: "AM", fa: "ارمنستان" }, { key: "CN", fa: "چین" }, { key: "AE", fa: "امارات" }, { key: "TR", fa: "ترکیه" }],
    templates: [], tpl: 0,
    hist: {}, smart: {}, series: {},   // پاسخ endpointها برای هر قلم؛ series = نقاط نمودار
    tg: null,              // وضعیت اتصال تلگرام: {connected, botConfigured, bot}
  };
  try { S.traySort = localStorage.getItem("tp.traySort") === "1"; } catch (_) { /* حالت خصوصی */ }
  const settings = () => S.settings || CFG.defaults;
  const A = () => S.d && S.d.assignment;
  const items = () => (S.d ? S.d.items : []);
  const item = () => items()[S.itemIdx];
  const openItems = () => items().filter((i) => i.state === "open");
  const qCount = () => S.d.quotes.filter((q) => q.saved).length;
  const pCount = () => S.d.proformas.length;

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
  function vList() {
    const rows = trayRows();
    /* مرتب‌سازی با مهلت باقی‌مانده: کم‌ترین ساعت کاری بالا (تمام‌شده‌ها اول) */
    if (S.traySort) rows.sort((x, y) => trayLeft(x) - trayLeft(y));
    return `<div class="tp-wrap" style="padding-bottom:20px"><div class="tp-card">
      <div class="tp-filters" style="border-top:0;border-radius:16px 16px 0 0">
        <span class="lab">شماره درخواست</span><input class="tp-input ${S.q.id ? "on" : ""}" data-q="id" value="${esc(S.q.id)}" style="width:120px">
        <span class="lab">تاریخ</span><input class="tp-input date ${S.q.date ? "on" : ""}" data-q="date" value="${esc(S.q.date)}" placeholder="انتخاب تاریخ" readonly style="width:170px">
        <span class="lab">طرف مقابل</span><input class="tp-input ${S.q.party ? "on" : ""}" data-q="party" value="${esc(S.q.party)}" style="width:190px">
        <button class="tp-btn sm" data-clr>پاک کردن</button>
        <span class="end">${rows.length} از ${S.tray.length} · خاتمه‌یافته، معلق و متوقف در کارتابل نیستند</span></div>
      <div class="tp-scroll" style="border:0;border-radius:0 0 16px 16px"><table class="tp-table" style="width:100%"><thead><tr>
        <th>شماره درخواست</th><th>تاریخ</th><th class="rt">طرف مقابل</th><th>اقلام باز</th><th>مهلت</th>
        <th><button class="sortbtn ${S.traySort ? "on" : ""}" data-tsort title="${S.traySort ? "برگشت به ترتیب ارسال" : "مرتب‌سازی با مهلت باقی‌مانده — نزدیک‌ترین مهلت بالا"}">${S.traySort ? "✓ مرتب با مهلت" : "⇅ مرتب با مهلت"}</button>باقی‌مانده</th><th>پیشرفت</th><th>استعلام</th></tr></thead><tbody>
        ${rows.map((a) => { const b = TP.budget(a.dispatched_at, a.days || 1), el = TP.wh(a.dispatched_at, S.now), lf = Math.max(0, b - el);
          const done = [!!a.viewed_at, a.hist_count > 0, a.smart_count > 0, a.quote_count > 0, a.proforma_count > 0, !!a.commission_at];
          return `<tr data-req="${a.id}" style="cursor:pointer"><td class="id num">${esc(a.request_id)}</td><td class="num">${esc(a.date)}</td><td class="party">${esc(a.party)}</td>
            <td class="num">${a.open_count} از ${a.item_count}</td><td class="num">${a.days} روز</td>
            <td class="num" style="${lf <= 0 ? "color:#fca5a5;font-weight:700" : ""}">${lf <= 0 ? "تمام شد" : lf.toFixed(1) + " ساعت کاری"}</td>
            <td>${boxes(a, done, true, true)}</td><td class="num">${a.quote_count}</td></tr>`; }).join("")}
        ${rows.length ? "" : `<tr><td colspan="8"><div class="empty">درخواستی در کارتابل شما نیست.</div></td></tr>`}
      </tbody></table></div></div></div>`;
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
    const b = TP.budget(a.dispatched_at, a.days || 1), el = TP.wh(a.dispatched_at, S.now), pct = b ? Math.min(100, Math.round(el / b * 100)) : 0;
    const dl = TP.endN(a.dispatched_at, a.days || 1), left = Math.max(0, b - el), dd = new Date(dl);
    const done = flagsOf(a, its, qCount(), pCount());
    return `<div class="tp-wrap" style="padding-bottom:24px"><div class="tp-card">
      <div class="head"><div><button class="tp-btn sm" data-back>→ کارتابل</button></div>
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
        <button class="tab ${S.tab === "comm" ? "on" : ""}" data-tab="comm">جدول کمیسیون</button></div>
      ${!it ? `<div class="empty">قلمی ندارد.</div>` : S.tab === "history" ? vHistory(it) : S.tab === "smart" ? vSmart(it) : S.tab === "quotes" ? vQuotes() : vComm()}
    </div></div>`;
  }

  /* ---------- تب بررسی سوابق ----------
     مبنای مقایسهٔ تأمین‌کنندگان (تصمیم مدیر) سه ستون است، نه قیمت:
     دفعات خرید، جمع مقدار، و «گشتاور» — همان جمع مقدار وقتی خریدِ تازه‌تر
     سنگین‌تر شمرده شود (شیب از نوار ۱..۱۰). قیمت‌ها فقط در ریز خریدها و کارت
     تأمین‌کننده نمایش داده می‌شوند. رتبه‌ها را سرور می‌سازد تا پنل و بات تلگرام
     یک عدد بگویند؛ این‌جا فقط ستون مرتب‌سازی انتخاب می‌شود (پیش‌فرض: گشتاور).
     گروه «خرید قلم در پروژه» تا رسیدن ستون پروژه به فایل مرجع خاموش است. */
  const MOM_KEY = "tp.mom";
  try { S.mom = Math.min(10, Math.max(1, +(localStorage.getItem(MOM_KEY) || 5))); } catch (_) { /* حالت خصوصی */ }
  const RQ = (x) => Math.round((Number(x) || 0) * 100) / 100;   /* مقدار بدون زبالهٔ اعشار شناور */
  const MATCH = { normalized: "کد استاندارد", code: "کد قلم راهکاران", title: "عنوان قلم", none: "بی‌سابقه" };
  const HSORT = { m: "rankM", qty: "rankQty", n: "rankN" };
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
    return `<div class="prof"><div class="top"><h4>${esc(p.name)}</h4>${p.code ? `<span class="chip num">${esc(p.code)}</span>` : ""}
        <button class="tp-btn xs" data-close-prof style="margin-inline-start:auto">بستن</button></div>
      <div class="gridp">
        ${f("دفعات خرید این قلم", `${M(p.n)} بار (رتبه ${M(p.rankN)})`, "num")}
        ${f("جمع مقدار", `${M(RQ(p.qty))}${unit} (رتبه ${M(p.rankQty)})`, "num")}
        ${f("امتیاز گشتاوری", `${M(RQ(p.qtyM))}${unit} (رتبه ${M(p.rankM)})`, "num")}
        ${f("نخستین خرید", p.firstDate, "num")}${f("آخرین خرید", p.lastDate, "num")}
        ${f("قیمت واحد میانگین (۱۴۰۴)", p.avgUnit == null ? null : M(Math.round(p.avgUnit)) + " ریال", "num")}
        ${f("کمینه / بیشینه قیمت واحد (۱۴۰۴)", p.minUnit == null ? null : `${M(Math.round(p.minUnit))} تا ${M(Math.round(p.maxUnit))}`, "num")}
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

  function chartBody(it, d) {
    const se = S.series[it.id];
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
    const unit = d && d.item && d.item.unit ? ` (${esc(d.item.unit)})` : "";
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
        <div class="chart-head"><b>روند خرید «${esc(it.title)}»</b><button class="tp-btn" data-chart-close>بستن</button></div>
        ${chartBody(it, d)}</div>`;
      bg.querySelector("[data-chart-close]").onclick = close;
    }
    const old = document.getElementById("tp-chart"); if (old) old.remove();
    const bg = document.createElement("div"); bg.id = "tp-chart"; bg.className = "chart-bg";
    bg.onclick = (ev) => { if (ev.target === bg) close(); };
    document.body.appendChild(bg);
    document.addEventListener("keydown", onKey);
    if (S.series[it.id] && S.series[it.id] !== "loading") { draw(); return; }
    S.series[it.id] = "loading"; draw();
    TP.api(`/suppliers/history/series?item_id=${it.id}`)
      .then((r) => { S.series[it.id] = r; draw(); })
      .catch((err) => { S.series[it.id] = null; close(); TP.modal("خطا", esc(err.message), null, "باشد", ""); });
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
      <button class="tp-btn primary" data-run-hist>${d ? "محاسبهٔ دوباره" : "جستجوی سوابق این قلم"}</button>
      ${it.hist_done_at ? "" : `<button class="tp-btn" data-mark="hist" title="اگر سوابق را بیرون از سامانه بررسی کرده‌اید">علامت بزن</button>`}</div>`;

    if (!d) return `<div class="pad">${head}<div class="empty"><b>سوابق تأمین «${esc(it.title)}» هنوز خوانده نشده.</b>
      دکمهٔ «جستجوی سوابق این قلم» را بزنید. رتبه‌بندی بر مبنای دفعات خرید، مقدار و گشتاورِ مقدار است و به مدل زبانی نیاز ندارد.</div></div>`;
    if (d.available === false) return `<div class="pad">${head}<div class="tp-note warn">${esc(d.message)}</div></div>`;
    const exc = d.excluded || [];
    const rows = histRows(d);
    if (!rows.length) return `<div class="pad">${head}<div class="tp-note warn">${exc.length
      ? `هرچه از این قلم خریده شده زیر نام تجمیعی «${esc(exc[0].name)}» ثبت شده (${M(exc[0].n)} خرید) و تأمین‌کنندهٔ واقعیِ نام‌داری ندارد.`
      : esc(d.message || "برای این قلم سابقه‌ای پیدا نشد.")}</div></div>`;

    const added = new Set(S.d.quotes.filter((q) => q.item_id === it.id).map((q) => TP.nrm(q.supplier_name)));
    const unit = d.item && d.item.unit ? ` ${esc(d.item.unit)}` : "";
    /* رتبه در ستونِ باریکِ زردِ بعد از هر عدد؛ کلیک روی هر ستون رتبه، کل جدول را مرتب می‌کند */
    const rk = (k) => `<th class="rkcol ${S.hsort === k ? "sorted" : ""}" data-hsort="${k}" title="مرتب‌سازی کل جدول بر اساس همین رتبه">رتبه${S.hsort === k ? " ▾" : ""}</th>`;
    const rc = (k, v) => `<td class="rkcol num" data-hsort="${k}" title="مرتب‌سازی کل جدول بر اساس همین رتبه">${M(v)}</td>`;
    return `<div class="pad">
      ${vProfile(it)}
      ${head}
      <div class="toolrow">
        <span class="chip ok">خرید قلم — فعال</span>
        <span class="chip mock" title="ستون پروژه هنوز در فایل مرجع نیست">خرید قلم در پروژه — در انتظار ساختار داده</span>
        <span class="chip">${M(rows.length)} تأمین‌کننده · ${M(d.totals.n)} خرید · جمع مقدار ${M(RQ(d.totals.qty))}${unit}</span>
        <span class="chip info">تطبیق با ${MATCH[d.match.by] || esc(d.match.by)}${d.match.code2 ? ` · ${esc(d.match.code2)}` : ""}</span>
        ${d.item && d.item.mixedUnits ? `<span class="chip warn" title="جمع مقدار وقتی معنا دارد که واحد یکی باشد">واحدها یکدست نیستند: ${esc(d.item.units || "")}</span>` : ""}
        ${exc.map((x) => `<span class="chip warn" title="نام تجمیعی فایل مرجع است، نه یک تأمین‌کننده؛ در سهم‌ها و رتبه‌ها حساب نشده">«${esc(x.name)}» کنار گذاشته شد — ${M(x.n)} خرید</span>`).join("")}</div>
      <div class="tp-scroll" data-keep-scroll style="max-height:54vh"><table class="tp-table grid"><thead><tr>
        <th>انتخاب</th><th class="rt">تأمین‌کننده</th><th>دفعات خرید</th>${rk("n")}<th>مقدار</th>${rk("qty")}<th>سهم</th><th>امتیاز گشتاوری</th>${rk("m")}<th>خریدها</th></tr></thead><tbody>
      ${rows.map((s) => `<tr class="${S.prof === s.key ? "sel" : ""}">
        <td>${added.has(TP.nrm(s.name)) ? `<span class="chip ok">در استعلامات</span>`
          : `<button class="tp-btn xs" data-to-quote="${esc(s.key)}" title="فقط نام تأمین‌کننده به تب استعلامات می‌رود؛ قیمت با پیش‌فاکتور یا ورود دستی">افزودن</button>`}</td>
        <td class="rt"><span class="supname" data-prof="${esc(s.key)}">${esc(s.name)}</span></td>
        <td class="num">${M(s.n)}</td>${rc("n", s.rankN)}
        <td class="num">${M(RQ(s.qty))}${unit}</td>${rc("qty", s.rankQty)}
        <td class="num">${s.share.toFixed(1)}٪</td>
        <td class="num" style="font-weight:700">${M(RQ(s.qtyM))}</td>${rc("m", s.rankM)}
        <td><button class="tp-btn xs" data-buys="${esc(s.key)}">${M(s.n)}</button></td></tr>`).join("")}
      </tbody></table></div>
      <div class="tp-note">رتبه‌بندی فقط بر مبنای <b>دفعات خرید</b>، <b>مقدار</b> و <b>امتیاز گشتاوری</b> است و قیمت در آن اثری ندارد؛ قیمت‌ها را در «خریدها» و کارت تأمین‌کننده ببینید.
        <b>امتیاز گشتاوری عدد است، نه درصد</b>: جمعِ مقدارِ هر خرید ضرب در ضریب تازگی‌اش. ضریب برای خرید در ${esc(d.base.label)} یک است و با هر ماه فاصله کم می‌شود — با ضریب اهمیت ${d.base.k}، هر ماه ${(d.base.decay * 100).toFixed(2)}٪ — و قدیمی‌ترین خریدِ فایل (${M(d.base.ageMax)} ماه پیش) ${((1 - d.base.decay * d.base.ageMax) * 100).toFixed(0)}٪ وزنش را نگه می‌دارد؛ پس از دو مقدار برابر، آن‌که تازه‌تر فروخته امتیاز بالاتری دارد.
        عددهای برابر رتبهٔ برابر می‌گیرند (۴، ۲، ۲، ۱ ← رتبهٔ ۱، ۲، ۲، ۴). «سهم» رتبهٔ جدا ندارد چون همان رتبهٔ مقدار است. ستون‌های زردِ «رتبه» کل جدول را مرتب می‌کنند؛ پیش‌فرض، رتبهٔ گشتاوری است.</div></div>`;
  }

  const supOf = (key) => { const d = S.hist[(item() || {}).id]; return d && (d.suppliers || []).find((x) => x.key === key); };

  async function runHist() {
    const it = item(); if (!it) return;
    const b = TP.busy("خواندن سوابق…", esc(it.title));
    try { S.hist[it.id] = await TP.api(`/suppliers/history?item_id=${it.id}&k=${S.mom}`); S.prof = null; }
    catch (e) { b.close(); TP.modal("خطا", esc(e.message), null, "باشد", ""); return; }
    b.close();
    /* خواندنِ سوابق خودش همان «بررسی سوابق» است — باکس دوم پایش مدیر سبز می‌شود */
    if (!it.hist_done_at && S.hist[it.id].available) {
      try { await TP.api(`/items/${it.id}/progress`, { body: { stage: "hist" } }); await reload(); return; }
      catch (_) { /* نمایش جدول مهم‌تر از سبزشدن باکس است */ }
    }
    render();
  }


  async function showBuys(key) {
    const it = item(), s = supOf(key); if (!s) return;
    try {
      const r = await TP.api(`/suppliers/history/buys?item_id=${it.id}&supplier=${encodeURIComponent(s.name)}`);
      TP.modal(`سوابق خرید — ${esc(s.name)}`, r.buys.length
        ? `<div class="tp-scroll" style="max-height:56vh"><table class="tp-mx" style="width:100%"><thead><tr>
            <th>تاریخ</th><th>عنوان در فایل</th><th>مقدار</th><th>واحد</th><th>قیمت واحد روز</th><th>قیمت واحد (۱۴۰۴)</th><th>مبلغ (۱۴۰۴)</th></tr></thead><tbody>
          ${r.buys.map((x) => `<tr><td class="num">${esc(x.order_date)}</td><td class="rt" style="white-space:normal">${esc(x.title)}</td>
            <td class="num">${x.qty == null ? "—" : M(x.qty)}</td><td>${esc(x.unit || "")}</td>
            <td class="num">${x.unit_price == null ? "—" : M(Math.round(x.unit_price))}</td>
            <td class="num">${x.unit_1404 == null ? "—" : M(Math.round(x.unit_1404))}</td>
            <td class="num">${x.amount_1404 == null ? "—" : M(Math.round(x.amount_1404))}</td></tr>`).join("")}
          </tbody></table></div>` : "ردیفی پیدا نشد.", null, "بستن", "");
    } catch (e) { TP.modal("خطا", esc(e.message), null, "باشد", ""); }
  }

  /* از سوابق فقط نام (و کد) تأمین‌کننده وارد خط استعلام می‌شود؛ قیمتِ تازه باید
     از پیش‌فاکتور یا ورود دستی بیاید و قیمتِ سابقه جای آن را نمی‌گیرد. */
  async function addFromHistory(key) {
    const it = item(), s = supOf(key); if (!s) return;
    try {
      await TP.api("/quotes", { body: { assignment_id: A().id, item_ids: [it.id], supplier_name: s.name, supplier_code: s.code || "" } });
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
  const smState = () => S.smart[(item() || {}).id];

  async function loadSmart(it) {
    if (S.smart[it.id] !== undefined) return;
    S.smart[it.id] = "loading";
    try {
      const r = await TP.api(`/search/smart?item_id=${it.id}`);
      S.marketsMeta = r.markets || S.marketsMeta;
      S.maxMarkets = r.maxMarkets || S.maxMarkets;
      S.smart[it.id] = r.last || null;
    } catch (_) { S.smart[it.id] = null; }
    render();
  }

  async function runSmart() {
    const it = item(); if (!it) return;
    if (!S.sm.markets.length) return TP.modal("بازار انتخاب نشده", "دست‌کم یک بازار را تیک بزنید — مهم‌ترین قید جستجو همین است.", null, "باشد", "");
    const b = TP.busy("جستجوی هوشمند در حال اجراست…",
      `${esc(it.title)}<br><span class="dim">مدل در بازارهای انتخابی می‌گردد، صفحه‌ها را می‌خواند و تماس‌ها را استخراج می‌کند؛ ممکن است چند دقیقه طول بکشد. پنجره را نبندید.</span>`);
    try {
      const r = await TP.api("/search/smart", { body: { item_id: it.id, markets: S.sm.markets, brand: S.sm.brand, specs: S.sm.specs, notes: S.sm.notes, deliveryHint: S.d.request.party } });
      /* پاسخ جریانی است: خطای وسط اجرا با وضعیت ۲۰۰ و فیلد error می‌آید */
      if (r && r.error) throw Object.assign(new Error(r.error), { status: r.status });
      b.close();
      if (r.available === false) { S.smart[it.id] = null; return TP.modal("جستجوی هوشمند", esc(r.message), null, "باشد", ""); }
      S.smart[it.id] = r; S.smProf = null;
      if (!it.hist_done_at || !it.smart_done_at) { await reload(); return; }
      render();
    } catch (e) { b.close(); TP.modal("جستجو انجام نشد", esc(e.message), null, "باشد", ""); }
  }

  /* افزودن تأمین‌کنندهٔ کشف‌شده به خط استعلام همین قلم — فقط نام می‌رود */
  async function addFromSmart(idx) {
    const it = item(), d = smState();
    const s = d && d.result && (d.result.suppliers || [])[idx]; if (!s) return;
    try {
      await TP.api("/quotes", { body: { assignment_id: A().id, item_ids: [it.id], supplier_name: s.name } });
      S.tab = "quotes"; await reload();
    } catch (e) { TP.modal(e.status === 409 ? "قبلاً اضافه شده" : "خطا", esc(e.message), null, "باشد", ""); }
  }

  /* پیام آماده برای یک تأمین‌کنندهٔ نتیجه: انتخاب قالب → متنِ پرشده → کپی */
  async function smartMessage(idx) {
    const it = item(), d = smState();
    const s = d && d.result && (d.result.suppliers || [])[idx]; if (!s) return;
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
     فعلاً فقط در همین صفحه می‌ماند؛ انتقالش به پایگاه داده مرحلهٔ بعد است. */
  const TRI = { unk: ["—", "unk"], ok: ["✓", "ok"], no: ["✗", "no"] };
  const siteLink = (u) => {
    const x = String(u || "").trim();
    if (!x) return "—";
    const href = /^https?:\/\//i.test(x) ? x : `https://${x}`;
    return `<a href="${esc(href)}" target="_blank" rel="noopener" dir="ltr" style="color:var(--tp-accent)">${esc(x.replace(/^https?:\/\//i, "").replace(/\/$/, ""))}</a>`;
  };

  function vSmart(it) {
    const d = S.smart[it.id];
    if (d === undefined) { loadSmart(it); }
    S.chan = S.chan || {}; S.chOpen = S.chOpen || {};
    const has = d && d !== "loading" && d.result;
    const head = `<div class="toolrow"><b style="font-size:1.02rem">جستجوی هوشمند برای «${esc(it.title)}»</b>
      ${it.smart_done_at ? `<span class="chip ok">اجرا شد — ${TP.fmt(it.smart_done_at)}</span>` : ""}
      <span style="margin-inline-start:auto"></span>
      <button class="tp-btn" data-tpl-open title="قالب‌های پیام موجود را ببینید یا قالب تازه بسازید">ایجاد قالب پیام</button>
      <button class="tp-btn primary" data-run-smart>${has ? "جستجوی دوباره" : "اجرای جستجوی هوشمند"}</button>
      ${it.smart_done_at ? "" : `<button class="tp-btn" data-mark="smart" title="اگر جستجو را بیرون از سامانه انجام داده‌اید">علامت بزن</button>`}</div>`;

    let main;
    if (d === undefined || d === "loading") main = `<div class="empty">در حال خواندن نتیجهٔ قبلی…</div>`;
    else if (!has) main = `<div class="empty"><b>هنوز جستجویی برای این قلم اجرا نشده.</b>
      بازارها را در ستون کنار انتخاب کنید و «اجرای جستجوی هوشمند» را بزنید.</div>`;
    else {
      const sup = d.result.suppliers || [], sid = d.search_id || 0;
      const added = new Set(S.d.quotes.filter((q) => q.item_id === it.id).map((q) => TP.nrm(q.supplier_name)));
      const rows = sup.map((s, i) => {
        const phones = supPhones(s), emails = supEmails(s), key = `${sid}|${i}`, open = !!S.chOpen[key];
        const tri = (ph, p, lab) => {
          const k = `${key}|${ph}|${p}`, st = TRI[S.chan[k]] ? S.chan[k] : "unk";
          return `<button class="tri ${TRI[st][1]}" data-ch="${esc(k)}" title="${lab}">${TRI[st][0]}</button>`;
        };
        const checks = open && phones.length ? `<tr class="chrow"><td></td><td colspan="8"><table class="chx"><thead><tr><th class="rt">شماره</th>${PLATS.map(([, l]) => `<th>${l}</th>`).join("")}</tr></thead><tbody>
          ${phones.map((ph) => `<tr><td class="num rt" dir="ltr">${esc(ph)}</td>${PLATS.map(([p, l]) => `<td>${tri(ph, p, l)}</td>`).join("")}</tr>`).join("")}
          </tbody></table></td></tr>` : "";
        return `<tr>
          <td class="num">${M(i + 1)}</td>
          <td class="rt">${esc(s.name || "—")}</td>
          <td>${esc(ROLE_FA[supType(s)] || supType(s))}</td>
          <td>${esc(supMarket(s) || "—")}</td>
          <td class="rt">${phones.length ? `<div class="phcell"><button class="tp-btn xs hamb ${open ? "on" : ""}" data-chopen="${esc(key)}" title="بررسی تلگرام، واتساپ، بله و روبیکا">☰</button><div>${phones.map((ph) => `<div class="num" dir="ltr">${esc(ph)}</div>`).join("")}</div></div>` : "—"}</td>
          <td class="rt" dir="ltr" style="text-align:right">${emails.length ? emails.map((x) => `<div>${esc(x)}</div>`).join("") : "—"}</td>
          <td class="rt">${siteLink(s.website)}</td>
          <td class="rt">${esc(supPrice(s) || "—")}</td>
          <td style="white-space:nowrap">${added.has(TP.nrm(s.name)) ? `<span class="chip ok">در استعلامات</span>` : `<button class="tp-btn xs" data-sm-add="${i}" title="نام تأمین‌کننده وارد تب استعلامات می‌شود">افزودن</button>`}
            <button class="tp-btn xs" data-sm-msg="${i}" title="قالب پیام با فیلدهای همین تأمین‌کننده پر می‌شود">پیام</button></td></tr>${checks}`;
      }).join("");
      main = `<div class="tp-scroll" data-keep-scroll style="max-height:56vh"><table class="tp-table smres"><thead><tr>
          <th>#</th><th class="rt">تأمین‌کننده</th><th>نوع</th><th>بازار</th><th class="rt">شماره تماس</th><th class="rt">ایمیل</th><th class="rt">وب‌سایت</th><th class="rt">قیمت</th><th>عمل</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="9"><div class="empty">مدل تأمین‌کننده‌ای برنگرداند.</div></td></tr>`}</tbody></table></div>
        ${d.cost != null ? `<div class="dim smcost">هزینهٔ این جستجو: ${faDigits(Number(d.cost).toFixed(2))} دلار</div>` : ""}`;
    }
    /* ستون قیدها — مهم‌ترین قید، «بازار تأمین کالا»، یک فهرست است */
    const markets = `<div class="grp"><b>بازار تأمین کالا <span class="dim" style="font-weight:400">(حداکثر ${"۰۱۲۳۴۵۶۷۸۹"[S.maxMarkets || 3] || S.maxMarkets})</span></b>${(S.marketsMeta || []).map((x) =>
      `<label><input type="checkbox" data-smk="${x.key}" ${S.sm.markets.includes(x.key) ? "checked" : ""}> ${esc(x.fa)}</label>`).join("")}</div>`;
    const side = `<div class="side"><h4>قیدهای جستجو</h4><div class="dim" style="font-size:.8rem">این‌ها عیناً به مدل داده می‌شوند؛ بازار تأمین کالا قید سخت است.</div>
      ${markets}
      <div class="grp"><b>برند موردنظر <span class="dim" style="font-weight:400">(اختیاری)</span></b>
        <input class="tp-input" data-sm="brand" value="${esc(S.sm.brand)}" placeholder="مثلاً Komatsu" style="width:100%"></div>
      <div class="grp"><b>مشخصات فنی <span class="dim" style="font-weight:400">(اختیاری)</span></b>
        <textarea class="tp-textarea" data-sm="specs" style="min-height:64px" placeholder="استاندارد، سایز، گرید…">${esc(S.sm.specs)}</textarea></div>
      <div class="grp"><b>ملاحظات</b>
        <textarea class="tp-textarea" data-sm="notes" style="min-height:64px" placeholder="مثلاً: ترجیحاً تولیدکننده نه واسطه">${esc(S.sm.notes)}</textarea></div>
      <div class="grp dim" style="font-size:.78rem">نتیجه در پایگاه داده می‌ماند و با «افزودن»، تأمین‌کننده وارد تب استعلامات می‌شود؛ قیمت تازه‌اش از پیش‌فاکتور یا ورود دستی می‌آید.</div></div>`;

    return `<div class="pad">${head}<div class="two"><div class="main">${main}</div>${side}</div></div>`;
  }

  /* ---------- تب استعلامات (واقعی) ---------- */
  function vQuotes() {
    const r = S.d.request, its = items(), Q = S.d.quotes;
    return `<div class="pad">
      <div class="toolrow"><button class="tp-btn" data-add-row>افزودن تأمین‌کننده</button>
        <span class="chip">${qCount()} استعلام ثبت‌شده</span><span class="chip">${pCount()} پیش‌فاکتور</span>
        <span class="dim" style="font-size:.85rem">اجباری: واحد، مقدار، قیمت واحد، زمان تحویل، شرایط تسویه، نوع فاکتور (پیش‌فرض غیررسمی؛ با خواندن پیش‌فاکتور، رسمی). بقیه اختیاری‌اند و خالی بودنشان مانع ثبت نیست. هر ویرایش، «ثبت موقت» را برمی‌دارد.</span></div>
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
          <td style="min-width:170px"><select class="tp-select" data-qf="${q.id}|place" title="اختیاری"><option value="">—</option>${PLACES.map((v) => `<option ${q.place === v ? "selected" : ""}>${v}</option>`).join("")}</select>
            ${q.place === "سایر" ? `<input class="tp-input ${q.place_other ? "" : "bad"}" data-qf="${q.id}|place_other" value="${esc(q.place_other || "")}" placeholder="محل را بنویسید" style="margin-top:4px;width:100%">` : ""}</td>
          <td class="num">${(Number(q.qty) || 0) * (Number(q.price) || 0) ? M((Number(q.qty) || 0) * (Number(q.price) || 0)) : "—"}</td>
          <td>${S.d.proformas.find((p) => p.supplier_name === q.supplier_name) ? `<span class="chip ok" title="${esc(S.d.proformas.find((p) => p.supplier_name === q.supplier_name).filename || "")}">ثبت شد</span>` : `<button class="tp-btn xs" data-pf="${esc(q.supplier_name)}">بارگذاری</button>`}</td>
          <td>${S.d.proformas.find((p) => p.supplier_name === q.supplier_name) ? `<button class="tp-btn xs" data-extract="${q.id}">استخراج</button>` : `<span class="chip">—</span>`}</td>
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
      const [t, tg] = await Promise.all([TP.api("/tray"), TP.api("/tg/status").catch(() => null)]);
      S.tray = t.assignments || []; S.settings = t.settings; S.now = Date.now(); S.error = ""; S.tg = tg;
    }
    catch (e) { if (e.status === 401) { TP.session.clear(); S.expert = null; S.screen = "login"; } S.error = e.message; }
    render();
  }
  async function openDetail(aid, keepTab) {
    try { S.d = await TP.api(`/assignments/${aid}`); S.d.loadedAt = Date.now(); S.settings = S.d.settings; S.now = Date.now(); if (!keepTab) { S.itemIdx = 0; S.tab = "history"; } if (S.itemIdx >= S.d.items.length) S.itemIdx = 0; S.screen = "detail"; render();
      if (!S.d.assignment.viewed_at) { await TP.api(`/assignments/${aid}/viewed`, { body: {} }); S.d.assignment.viewed_at = Date.now(); render(); } }
    catch (e) { TP.modal("خطا", esc(e.message), null, "باشد", ""); }
  }
  const reload = () => openDetail(A().id, true);

  /* ---------- رندر ---------- */
  function render() {
    const app = document.getElementById("app");
    if (!S.expert) S.screen = "login";
    const restore = TP.snapScroll();
    app.innerHTML = `<header class="tp-top"><div class="brand"><img src="../assets/logo-new.jpg" alt=""><div><h1>پنل کارشناس خرید</h1><div class="sub">${S.expert ? esc(S.expert.name) + " · " : ""}${esc(COMPANY)}</div></div></div>
      <span class="spacer"></span>${S.expert ? `${S.tg && S.tg.botConfigured ? `<button class="tp-btn sm ${S.tg.connected ? "" : "primary"}" data-tg title="${S.tg.connected ? "اعلان‌های تلگرام فعال است" : "دریافت ارجاع‌ها و یادآوری مهلت در تلگرام"}">${S.tg.connected ? "✅ تلگرام" : "اتصال به تلگرام"}</button>` : ""}<button class="tp-btn sm" data-refresh title="به‌روزرسانی">↻</button><a class="tp-back" href="index.html">تدارکات</a><button class="tp-btn xs" data-logout>خروج</button>` : ""}</header>
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
    Q("[data-req]").forEach((x) => x.onclick = () => openDetail(+x.dataset.req));
    Q("[data-q]").forEach((i) => { if (i.dataset.q === "date") i.onclick = () => TP.openDatePicker(i, (v) => { S.q.date = v; render(); }); else i.oninput = (e) => { S.q[e.target.dataset.q] = e.target.value; TP.keepFocus(e.target, "q", render); }; });
    const cq = G("[data-clr]"); if (cq) cq.onclick = () => { S.q = { id: "", date: "", party: "", item: "" }; render(); };
    const ts = G("[data-tsort]"); if (ts) ts.onclick = () => { S.traySort = !S.traySort; try { localStorage.setItem("tp.traySort", S.traySort ? "1" : "0"); } catch (_) { /* حالت خصوصی */ } render(); };
    const bk = G("[data-back]"); if (bk) bk.onclick = () => { S.screen = "list"; S.d = null; loadTray(); };
    Q("[data-item]").forEach((x) => x.onclick = () => { S.itemIdx = +x.dataset.item; render(); });
    Q("[data-tab]").forEach((x) => x.onclick = () => { S.tab = x.dataset.tab; render(); });
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
      const k = e.target.dataset.smk, i = S.sm.markets.indexOf(k), cap = S.maxMarkets || 3;
      /* سقف هزینهٔ هر جستجو: بیش از سه بازار میان پنج جستجو پخش نمی‌شود */
      if (e.target.checked && i < 0 && S.sm.markets.length >= cap) {
        e.target.checked = false;
        return TP.modal("حداکثر سه بازار", "برای اینکه هزینهٔ هر جستجو از سقف ۲۰ سنت نگذرد، هر اجرا حداکثر سه بازار دارد. اول تیک یکی را بردارید.", null, "باشد", "");
      }
      if (e.target.checked && i < 0) S.sm.markets.push(k);
      if (!e.target.checked && i >= 0) S.sm.markets.splice(i, 1);
    });
    Q("[data-sm]").forEach((el) => el.oninput = (e) => { S.sm[e.target.dataset.sm] = e.target.value; });
    Q("[data-tpl-open]").forEach((b) => b.onclick = pickTemplate);
    Q("[data-chopen]").forEach((b) => b.onclick = () => { S.chOpen[b.dataset.chopen] = !S.chOpen[b.dataset.chopen]; render(); });
    /* همان چرخهٔ دمو: — ← ✓ ← ✗ ← — */
    Q("[data-ch]").forEach((b) => b.onclick = () => { const k = b.dataset.ch, c = S.chan[k] || "unk"; S.chan[k] = c === "unk" ? "ok" : c === "ok" ? "no" : "unk"; render(); });
    Q("[data-sm-add]").forEach((b) => b.onclick = () => addFromSmart(+b.dataset.smAdd));
    Q("[data-sm-msg]").forEach((b) => b.onclick = () => smartMessage(+b.dataset.smMsg));
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
          try { const r = await TP.api("/quotes", { body: { assignment_id: A().id, item_ids: ids, supplier_name: n, supplier_code: d.querySelector("#supc").value.trim() } }); S.tab = "quotes"; await reload(); if (r.skipped) TP.modal("توجه", `${M(r.skipped)} قلم برای این تأمین‌کننده از قبل خط داشت و دوباره ساخته نشد.`, null, "باشد", ""); }
          catch (e) { TP.modal("خطا", esc(e.message), null, "باشد", ""); }
        }, "افزودن");
      const all = d.querySelector("#supall"); if (all) all.onchange = () => d.querySelectorAll("[data-supi]").forEach((c) => { c.checked = all.checked; });
    };
    Q("[data-qf]").forEach((el) => {
      const [id, f] = el.dataset.qf.split("|"); const q = S.d.quotes.find((x) => x.id === +id); if (!q) return;
      if (el.classList.contains("date")) { el.onclick = () => TP.openDatePicker(el, async (v) => { await TP.api(`/quotes/${id}`, { method: "PUT", body: { [f]: v } }); await reload(); }, { single: true }); return; }
      const commit = async () => { if (String(q[f] == null ? "" : q[f]) === el.value) return; try { await TP.api(`/quotes/${id}`, { method: "PUT", body: { [f]: f === "item_id" ? +el.value : el.value } }); await reload(); } catch (e) { TP.modal("خطا", esc(e.message), null, "باشد", ""); } };
      if (el.tagName === "SELECT") el.onchange = commit; else { el.onchange = commit; el.oninput = () => { if (!el.dataset.opt) el.classList.toggle("bad", !el.value); const tot = document.querySelector(`[data-qf="${id}|qty"]`), pr = document.querySelector(`[data-qf="${id}|price"]`); if (tot && pr) { const v = (Number(tot.value) || 0) * (Number(String(pr.value).replace(/,/g, "")) || 0); const cell = el.closest("tr").children[3 + QF.length + 4]; if (cell) cell.textContent = v ? M(v) : "—"; } }; }
    });
    Q("[data-fin]").forEach((c) => c.onchange = async (e) => { await TP.api(`/quotes/${e.target.dataset.fin}`, { method: "PUT", body: { final: e.target.checked ? 1 : 0 } }); await reload(); });
    Q("[data-save]").forEach((b) => b.onclick = async () => { try { await TP.api(`/quotes/${b.dataset.save}`, { method: "PUT", body: { save: true } }); await reload(); } catch (e) { const miss = (e.data && e.data.missing) || []; TP.modal("ثبت موقت انجام نشد", `این فیلدهای اجباری خالی‌اند:<br><br><b>${miss.map((f) => LBL[f] || f).join("، ")}</b><br><br>تا ثبت موقت انجام نشود، این ردیف در شمارنده و کمیسیون حساب نمی‌شود.`, null, "باشد", ""); } });
    Q("[data-del]").forEach((b) => b.onclick = () => TP.modal("حذف استعلام", "این ردیف حذف شود؟", async () => { await TP.api(`/quotes/${b.dataset.del}`, { method: "DELETE" }); await reload(); }, "حذف"));
    Q("[data-pf]").forEach((b) => b.onclick = () => {
      const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".pdf,.jpg,.jpeg,.png";
      inp.onchange = async () => { const f = inp.files && inp.files[0]; if (!f) return; const r = await TP.api("/proformas", { body: { assignment_id: A().id, supplier_name: b.dataset.pf, filename: f.name } }); await reload(); TP.modal("پیش‌فاکتور", `${esc(r.message || "ثبت شد.")} <span class="chip mock">ذخیرهٔ فایل — در انتظار اتصال R2</span>`, null, "باشد", ""); };
      inp.click();
    });
    Q("[data-extract]").forEach((b) => b.onclick = async () => { const r = await TP.api(`/proformas/${b.dataset.extract}/extract`, { body: {} }); TP.modal("استخراج از پیش‌فاکتور", `${esc(r.message)} <span class="chip mock">در انتظار اتصال به مدل</span><br><br>تا آن زمان، فیلدهای زمان تحویل، اعتبار، تسویه و نوع فاکتور را دستی وارد کنید.`, null, "باشد", ""); });
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
  setInterval(() => { if (S.expert) { S.now = Date.now(); render(); } }, 60000);
})();
