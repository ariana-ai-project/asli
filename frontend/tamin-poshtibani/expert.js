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
     اجباری: واحد، مقدار، قیمت واحد، زمان تحویل، شرایط تسویه، نوع فاکتور (پیش‌فرض رسمی).
     اختیاری: مشخصات فنی، اعتبار، روش حمل، محل معامله، محل تحویل — خالی بودنشان مانع ثبت موقت نیست. */
  const QF = [["spec", "جنس / مشخصات فنی", 170, "", true], ["unit", "واحد", 70], ["qty", "مقدار", 80, "num"], ["price", "قیمت واحد (ریال)", 130, "num"],
              ["dtime", "زمان تحویل", 116, "date"], ["valid_days", "اعتبار پیش‌فاکتور (روز)", 100, "num", true], ["ship", "روش حمل", 130, "", true]];
  const OPTL = ' <span class="dim" style="font-weight:400;font-size:.75rem">(اختیاری)</span>';
  const LBL = { spec: "جنس / مشخصات فنی", unit: "واحد", qty: "مقدار", price: "قیمت واحد", dtime: "زمان تحویل", valid_days: "اعتبار پیش‌فاکتور", ship: "روش حمل",
    place: "محل تحویل", place_other: "محل تحویل (سایر)", pay: "شرایط تسویه", vat: "ارزش افزوده", deal: "محل معامله", invoice: "نوع فاکتور" };

  /* ---------- وضعیت ---------- */
  const S = {
    screen: "login", now: Date.now(), expert: TP.session.get(),
    tray: [], settings: null, error: "",
    d: null,               // جزئیات ارجاع باز: {assignment, request, items, quotes, proformas, pendingDecisions}
    itemIdx: 0, tab: "history",
    q: { id: "", date: "", party: "", item: "" },
    weights: [20, 40, 15, 25], open: { 0: false, 1: false, 2: false, 3: false },
    scope: "item", caps: { contact: true, cred: true, reviews: false, price: true },
    srch: { brand: "", yMin: "", yMax: "", cond: "نو", maker: "", spec: "", origin: "", trade: "داخلی", place: "" },
    f: { maxDelivery: "", priceOnly: false, adMin: 0, adMax: 365 },
    templates: [], tpl: 0,
    hist: {}, smart: {},   // پاسخ endpointها برای هر قلم (available:false تا اتصال)
    tg: null,              // وضعیت اتصال تلگرام: {connected, botConfigured, bot}
  };
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
    return `<div class="boxes">${TP.STAGES.map((s, i) => `<div class="box ${small ? "sm" : ""} b-${TP.stageColor(st, i, settings().thresholds, S.now)}" title="${s}">${i === 3 && a.quote_count ? a.quote_count : i === 4 && a.proforma_count ? a.proforma_count : ""}</div>`).join("")}</div>`;
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
  function vList() {
    const rows = trayRows();
    return `<div class="tp-wrap" style="padding-bottom:20px"><div class="tp-card">
      <div class="tp-filters" style="border-top:0;border-radius:16px 16px 0 0">
        <span class="lab">شماره درخواست</span><input class="tp-input ${S.q.id ? "on" : ""}" data-q="id" value="${esc(S.q.id)}" style="width:120px">
        <span class="lab">تاریخ</span><input class="tp-input date ${S.q.date ? "on" : ""}" data-q="date" value="${esc(S.q.date)}" placeholder="انتخاب تاریخ" readonly style="width:170px">
        <span class="lab">طرف مقابل</span><input class="tp-input ${S.q.party ? "on" : ""}" data-q="party" value="${esc(S.q.party)}" style="width:190px">
        <button class="tp-btn sm" data-clr>پاک کردن</button>
        <span class="end">${rows.length} از ${S.tray.length} · خاتمه‌یافته، معلق و متوقف در کارتابل نیستند</span></div>
      <div class="tp-scroll" style="border:0;border-radius:0 0 16px 16px"><table class="tp-table" style="width:100%"><thead><tr>
        <th>شماره درخواست</th><th>تاریخ</th><th class="rt">طرف مقابل</th><th>اقلام باز</th><th>مهلت</th><th>باقی‌مانده</th><th>پیشرفت</th><th>استعلام</th></tr></thead><tbody>
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
     سوابق از اسنادِ خریدِ گذشته می‌آید (تب «سوابق تأمین» مدیر). سرور برای هر
     تأمین‌کننده سطلِ ماهانهٔ مبلغ می‌دهد؛ وزن، سهم و رتبه این‌جا حساب می‌شود تا
     وقتی کارشناس ضریب زمان را عوض می‌کند، جدول همان لحظه دوباره چیده شود. */
  const recKey = "tp.recency";
  S.recency = Math.min(10, Math.max(1, +(localStorage.getItem(recKey) || 5)));
  S.hsort = "item"; S.prof = null;

  /** وزن‌دهی، سهم و رتبه — همان قاعدهٔ سرور (TP.recencyWeight) */
  function calcHist(h, k) {
    const sum = (b) => Object.entries(b || {}).reduce((n, [ym, amt]) => n + amt * TP.recencyWeight(ym, h.oldest, k), 0);
    const raw = (b) => Object.values(b || {}).reduce((n, a) => n + a, 0);
    const rows = h.suppliers.map((s) => ({ ...s, totalW: sum(s.total), itemW: sum(s.item), totalRaw: raw(s.total), itemRaw: raw(s.item) }));
    const T1 = rows.reduce((n, r) => n + r.totalW, 0) || 1, T2 = rows.reduce((n, r) => n + r.itemW, 0) || 1;
    rows.forEach((r) => { r.totalShare = r.totalW / T1; r.itemShare = r.itemW / T2; });
    [...rows].sort((a, b) => b.totalW - a.totalW).forEach((r, i) => { r.totalRank = i + 1; });
    [...rows].sort((a, b) => b.itemW - a.itemW).forEach((r, i) => { r.itemRank = i + 1; });
    rows.sort((a, b) => (S.hsort === "total" ? a.totalRank - b.totalRank : a.itemRank - b.itemRank));
    return rows;
  }

  function vHistory(it) {
    const h = S.hist[it.id], k = S.recency;
    const added = new Set(S.d.quotes.filter((q) => q.item_id === it.id).map((q) => TP.nrm(q.supplier_name)));
    const head = `<div class="toolrow"><b style="font-size:1.02rem">${esc(it.title)}</b>${it.code ? `<span class="chip info num">${esc(it.code)}</span>` : ""}
        ${it.hist_done_at ? `<span class="chip ok">بررسی شد — ${TP.fmt(it.hist_done_at)}</span>` : ""}
        <span style="margin-inline-start:auto;display:flex;align-items:center;gap:8px;font-size:.9rem" title="۱ = خریدهای قدیمی هم تقریباً به همان اندازه می‌ارزند · ۱۰ = فقط خریدهای تازه مهم‌اند">
          <b>ضریب زمان</b><input type="range" min="1" max="10" step="1" data-rec value="${k}" style="width:150px;accent-color:#4f8cff"><b class="num" style="min-width:1.4em;text-align:center">${M(k)}</b></span>
        <button class="tp-btn primary" data-run-hist>${h ? "دوباره بخوان" : "جستجوی سوابق این قلم"}</button>
        ${it.hist_done_at ? "" : `<button class="tp-btn" data-mark="hist" title="اگر سوابق را بیرون از سامانه بررسی کرده‌اید">بررسی کردم — علامت بزن</button>`}</div>`;
    if (!h) return `<div class="pad">${head}<div class="tp-note">سوابق خریدِ این قلم از اسنادِ گذشتهٔ شرکت خوانده می‌شود. خریدِ ۱۴۰۴ به بعد ضریب ۱ دارد و هر ماه که عقب‌تر برویم، با شیبی که ضریب زمان تعیین می‌کند، کمتر به حساب می‌آید.</div></div>`;
    if (!h.available) return `<div class="pad">${head}<div class="tp-note warn">هنوز هیچ سابقهٔ خریدی بارگذاری نشده است. مدیر از تب <b>«سوابق تأمین»</b> فایل اسناد را می‌دهد.</div></div>`;
    if (!h.suppliers.length) return `<div class="pad">${head}<div class="tp-note">برای این قلم سابقهٔ خریدی در ${M(h.total_rows)} سطرِ اسناد پیدا نشد (از ${esc(h.oldest || "—")} تا ${esc(h.newest || "—")}). می‌توانید از «جستجوی هوشمند» یا «افزودن تأمین‌کننده» در تب استعلامات شروع کنید.</div></div>`;

    const rows = calcHist(h, k);
    const RK = (key, label) => `<th class="rk ${S.hsort === key ? "on" : ""}" data-hsort="${key}" title="برای مرتب‌سازی کلیک کنید">${label}${S.hsort === key ? " ▾" : ""}</th>`;
    const prof = S.prof ? rows.find((r) => TP.nrm(r.name) === TP.nrm(S.prof)) : null;
    const profile = prof ? `<div class="tp-note" style="display:block;margin:8px 0;background:rgba(79,140,255,.08)">
        <div class="toolrow" style="margin:0"><b style="font-size:1rem">${esc(prof.name)}</b>
          ${prof.contact ? `${prof.contact.city ? `<span class="chip">${esc(prof.contact.city)}</span>` : ""}${prof.contact.phone ? `<span class="chip num">☎ ${esc(prof.contact.phone)}</span>` : ""}${prof.contact.tel2 ? `<span class="chip num">☎ ${esc(prof.contact.tel2)}</span>` : ""}${prof.contact.email ? `<span class="chip">✉ ${esc(prof.contact.email)}</span>` : ""}${prof.contact.site ? `<span class="chip">${esc(prof.contact.site)}</span>` : ""}`
            : `<span class="chip warn">راه تماس ثبت نشده — بعداً از پایگاه تأمین‌کنندگان پر می‌شود</span>`}
          <button class="tp-btn xs" data-prof="" style="margin-inline-start:auto">بستن</button></div>
        <div style="font-size:.85rem;margin-top:6px">${M(prof.totalCount)} خرید در کل · ${M(prof.buys.length)} خرید از همین قلم · مبلغ خامِ همین قلم ${M(Math.round(prof.itemRaw).toLocaleString("en-US"))} ریال</div>
        <div class="tp-scroll" style="max-height:200px;margin-top:6px"><table class="tp-table"><thead><tr><th>تاریخ</th><th>قلم</th><th>مقدار</th><th>فی</th><th>مبلغ</th><th>پروژه / مرکز</th><th>ضریب</th></tr></thead><tbody>
          ${prof.buys.map((b) => `<tr><td class="num">${esc(b.date)}</td><td>${esc(b.title || "")}</td><td class="num">${b.qty == null ? "—" : M(b.qty)}</td><td class="num">${b.price == null ? "—" : M(Math.round(b.price).toLocaleString("en-US"))}</td><td class="num">${M(Math.round(b.amount).toLocaleString("en-US"))}</td><td class="dim">${esc(b.party || "—")}</td><td class="num">${TP.recencyWeight(b.date.slice(0, 7), h.oldest, k).toFixed(2)}</td></tr>`).join("")}
        </tbody></table></div></div>` : "";

    return `<div class="pad">${head}${profile}
      <div class="toolrow"><span class="chip">${M(rows.length)} تأمین‌کننده</span>
        ${h.fuzzy ? `<span class="chip warn" title="عنوان قلم دقیقاً پیدا نشد؛ روی دو کلمهٔ اول تطبیق شد">تطبیق تقریبی</span>` : ""}
        <span class="chip" style="background:#FFF6E3;border-color:#E2C57E;color:#7A5A08">سرستون‌های زردِ «رتبه» قابل کلیک‌اند — ترتیب جدول عوض می‌شود</span>
        <span class="dim" style="font-size:.82rem">مبنا ${esc(h.base)} · قدیمی‌ترین سند ${esc(h.oldest)} · کفِ ضریب ${h.floor}</span></div>
      <div class="tp-scroll" style="max-height:52vh"><table class="tp-table"><thead><tr>
        <th></th><th class="rt">تأمین‌کننده</th>${RK("item", "رتبهٔ این قلم")}<th>سهم قلم</th><th>مبلغ وزنیِ قلم</th>${RK("total", "رتبهٔ کل خرید")}<th>سهم کل</th><th>مبلغ وزنیِ کل</th><th>خریدها</th></tr></thead><tbody>
        ${rows.map((r) => `<tr class="${prof && prof.name === r.name ? "sel" : ""}">
          <td>${added.has(TP.nrm(r.name)) ? `<span class="chip ok">در استعلامات</span>` : `<button class="tp-btn xs primary" data-add-sup="${esc(r.name)}" title="فقط نام تأمین‌کننده به تب استعلامات می‌رود؛ قیمت با پیش‌فاکتور یا فاکتور دستی">افزودن</button>`}</td>
          <td class="rt"><a href="#" data-prof="${esc(r.name)}" style="color:inherit;font-weight:600">${esc(r.name)}</a>${r.contact ? "" : ` <span class="dim" style="font-size:.72rem">(بی تماس)</span>`}</td>
          <td class="num rkc">${M(r.itemRank)}</td><td class="num">${(r.itemShare * 100).toFixed(1)}٪</td><td class="num">${M(Math.round(r.itemW).toLocaleString("en-US"))}</td>
          <td class="num rkc">${M(r.totalRank)}</td><td class="num">${(r.totalShare * 100).toFixed(1)}٪</td><td class="num">${M(Math.round(r.totalW).toLocaleString("en-US"))}</td>
          <td class="num"><button class="tp-btn xs" data-prof="${esc(r.name)}">${M(r.buys.length)} / ${M(r.totalCount)}</button></td></tr>`).join("")}
      </tbody></table></div>
      <div class="tp-note" style="display:block">مبلغِ وزنی = جمعِ مبلغِ هر خرید × ضریب ماهش. خریدِ ${esc(h.base)} به بعد ضریب ۱؛ قدیمی‌ترین ماه با ضریب زمانِ ۱۰ به ${h.floor} می‌رسد و با ۱ به ${(1 - 0.1 * (1 - h.floor)).toFixed(3)} — هیچ خریدی صفر یا منفی نمی‌شود. «سهم» = مبلغ وزنیِ تأمین‌کننده ÷ جمعِ همه.</div></div>`;
  }

  /* ---------- تب جستجوی هوشمند (زیرساخت: پارامترها + علامت دستی) ---------- */
  function vSmart(it) {
    const sm = S.smart[it.id];
    return `<div class="pad"><div class="two"><div class="main">
      <div class="toolrow"><b style="font-size:1.02rem">ملاحظات جستجو برای «${esc(it.title)}»</b>${it.smart_done_at ? `<span class="chip ok">اجرا شد — ${TP.fmt(it.smart_done_at)}</span>` : ""}</div>
      <textarea class="tp-textarea" id="notes" placeholder="مثلاً: تأمین‌کنندهٔ داخلی، ترجیحاً تولیدکننده نه واسطه">${esc(S.srch.notes || "تامین‌کننده داخلی، ترجیحاً تولیدکننده نه واسطه")}</textarea>
      <div class="toolrow" style="margin-top:12px"><button class="tp-btn primary" data-run-smart>اجرای مدل ${S.scope === "all" ? "روی تمام اقلام" : "برای همین قلم"}</button>
        ${it.smart_done_at ? "" : `<button class="tp-btn" data-mark="smart">جستجو را بیرون از سامانه انجام دادم — علامت بزن</button>`}</div>
      <div class="tp-note ${sm && sm.available === false ? "warn" : ""}">${sm ? esc(sm.message) : "مدل با این ملاحظات و محدوده‌های ستون کنار، تأمین‌کنندگان تازه را پیدا و درگاه تماس، اعتبار و قیمت روزشان را استخراج می‌کند."} <span class="chip mock">در انتظار اتصال به مدل</span></div>
      <div class="tp-note">پلتفرم‌های پیام (تلگرام، واتساپ، بله، روبیکا) و ارسال از اکانت خودتان، بعد از اتصال روی هر تأمین‌کننده فعال می‌شود. قالب‌های پیام از همین حالا ذخیره می‌شوند («قالب‌های پیام» در نوار بالا).</div>
    </div>${vSide()}</div></div>`;
  }
  function vSide() {
    const t = S.now;
    return `<div class="side"><h4>محدوده جستجو</h4><div class="dim" style="font-size:.8rem">این‌ها به‌علاوهٔ متن ملاحظات به مدل داده می‌شوند.</div>
      <div class="grp"><b>دامنه اجرا</b><label><input type="radio" name="sc" data-scope="item" ${S.scope === "item" ? "checked" : ""}> فقط همین قلم</label><label><input type="radio" name="sc" data-scope="all" ${S.scope === "all" ? "checked" : ""}> تمام اقلام این درخواست</label></div>
      <div class="grp"><b>قابلیت‌ها</b>${[["contact", "استخراج درگاه تماس"], ["cred", "بررسی سابقه و اعتبار"], ["reviews", "نظرات خریداران"], ["price", "استخراج قیمت روز"]].map(([k, l]) => `<label><input type="checkbox" data-cap="${k}" ${S.caps[k] ? "checked" : ""}> ${l}</label>`).join("")}</div>
      <div class="grp"><b>مشخصات موردنظر (دستی)</b>
        <div class="fld"><b>برند محصول</b><input class="tp-input" data-s="brand" value="${esc(S.srch.brand)}"></div>
        <div class="fld"><b>شرکت سازنده</b><input class="tp-input" data-s="maker" value="${esc(S.srch.maker)}"></div>
        <div class="fld"><b>سال ساخت</b><div class="two2"><input class="tp-input" data-s="yMin" value="${esc(S.srch.yMin)}" placeholder="از" inputmode="numeric"><input class="tp-input" data-s="yMax" value="${esc(S.srch.yMax)}" placeholder="تا" inputmode="numeric"></div></div>
        <div class="fld"><b>وضعیت کالا</b><select class="tp-select" data-s="cond">${["نو", "دست دوم", "فرقی ندارد"].map((x) => `<option ${S.srch.cond === x ? "selected" : ""}>${x}</option>`).join("")}</select></div>
        <div class="fld"><b>مشخصات فنی</b><textarea class="tp-textarea" data-s="spec" style="min-height:52px">${esc(S.srch.spec)}</textarea></div>
        <div class="fld"><b>محل تأمین</b><input class="tp-input" data-s="origin" value="${esc(S.srch.origin)}" placeholder="مثلاً تهران، اصفهان"></div></div>
      <div class="grp"><b>نوع خرید</b><label><input type="radio" name="tr" data-tr="داخلی" ${S.srch.trade === "داخلی" ? "checked" : ""}> داخلی</label><label><input type="radio" name="tr" data-tr="خارجی" ${S.srch.trade === "خارجی" ? "checked" : ""}> خارجی</label>
        <div class="fld" style="margin-top:6px"><b>محل دقیق تحویل</b><input class="tp-input" data-s="place" value="${esc(S.srch.place)}" placeholder="${S.srch.trade === "خارجی" ? "مثلاً بندر عباس، تحویل CFR" : "مثلاً انبار مرکزی کرج"}"></div></div>
      <div class="grp"><b>محدودیت تاریخ تحویل</b><input class="tp-input date" data-date="maxDelivery" value="${esc(S.f.maxDelivery)}" placeholder="حداکثر تا …" readonly style="width:100%"></div>
      <div class="grp"><b>قیمت</b><label><input type="checkbox" data-po ${S.f.priceOnly ? "checked" : ""}> فقط مواردی که قیمت اعلام کرده‌اند</label></div>
      <div class="grp"><b>حداکثر سن آگهی (روز)</b><input type="range" min="0" max="365" value="${S.f.adMax}" data-admax style="width:100%;accent-color:#4f8cff"><div class="dim num" style="font-size:.8rem">از ${TP.fmtD(t - S.f.adMax * DAY)} تا امروز</div></div></div>`;
  }

  /* ---------- تب استعلامات (واقعی) ---------- */
  function vQuotes() {
    const r = S.d.request, its = items(), Q = S.d.quotes;
    return `<div class="pad">
      <div class="toolrow"><button class="tp-btn" data-add-row>افزودن تأمین‌کننده</button>
        <span class="chip">${qCount()} استعلام ثبت‌شده</span><span class="chip">${pCount()} پیش‌فاکتور</span>
        <span class="dim" style="font-size:.85rem">اجباری: واحد، مقدار، قیمت واحد، زمان تحویل، شرایط تسویه، نوع فاکتور (پیش‌فرض رسمی). بقیه اختیاری‌اند و خالی بودنشان مانع ثبت نیست. هر ویرایش، «ثبت موقت» را برمی‌دارد.</span></div>
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

  /* ---------- تب جدول کمیسیون (فرم TSA-PS-FO-02) ---------- */
  function commData() {
    const sup = []; S.d.quotes.filter((q) => q.final && q.saved).forEach((q) => { let g = sup.find((x) => x.name === q.supplier_name); if (!g) { g = { name: q.supplier_name, rows: {}, pay: q.pay, valid: q.valid_days, dtime: q.dtime, deal: q.deal, invoice: q.invoice, vat: q.vat }; sup.push(g); } g.rows[q.item_id] = q; });
    return { sup };
  }
  function vComm() {
    const a = A(), r = S.d.request;
    if (!a.commission_at) return `<div class="pad"><div class="empty"><b>جدول کمیسیون هنوز ساخته نشده.</b>از تب استعلامات، تأمین‌کنندگان منتخب را «تأیید نهایی» کنید و «تولید جدول کمیسیون» را بزنید.</div></div>`;
    const d = commData();
    if (!d.sup.length) return `<div class="pad"><div class="empty">هیچ استعلام تأییدنهایی‌شده‌ای نیست.</div></div>`;
    return `<div class="pad"><div class="toolrow noprint"><b>جدول کمیسیون — درخواست <span class="num">${esc(r.id)}</span></b><span class="chip">${d.sup.length} تأمین‌کننده · ${items().filter((it) => d.sup.some((g) => g.rows[it.id])).length} از ${items().length} قلم</span>
        <button class="tp-btn sm" data-xls style="margin-inline-start:auto">دانلود اکسل</button><button class="tp-btn sm" data-print>پرینت / PDF (برگه درخواست + جدول)</button></div>
      <div class="tp-note noprint" style="display:block;margin-bottom:10px">
        <b>توضیحات تدارکات و پشتیبانی</b> — این متن پای برگهٔ کمیسیون چاپ می‌شود. از بات تلگرام هم با <code>/tozihat</code> می‌توانید بنویسید.
        <textarea class="tp-input" data-notes rows="3" maxlength="1500" placeholder="مثلاً: تأمین‌کندهٔ دوم زمان تحویل بهتری داشت ولی قیمتش بالاتر است…"
          style="width:100%;margin-top:8px;resize:vertical;font-family:inherit">${esc(a.notes || "")}</textarea>
        <div style="display:flex;gap:8px;align-items:center;margin-top:6px">
          <button class="tp-btn sm primary" data-save-notes>ذخیرهٔ توضیحات</button><span class="dim" data-notes-msg style="font-size:.85rem"></span></div>
      </div>
      <div class="tp-scroll" style="max-height:64vh;background:#fff"><div id="printarea">${reqForm(r)}${commForm(r, d)}</div></div>
      <div class="tp-note noprint">قالب مطابق فرم <b>TSA-PS-FO-02</b> و راست‌به‌چپ: ردیف و شرح اقلام سمت راست، بلوک هر تأمین‌کننده به سمت چپ. ارزش افزوده ۱۰٪. مبلغ کل هر سطر = قیمت واحد × تعداد. <b>قالب برگهٔ درخواست موقت است</b> و با فرمت راهکاران جایگزین می‌شود.</div></div>`;
  }
  function commForm(r, d) {
    /* فقط قلم‌هایی که تأمین‌کنندهٔ تیک‌خورده برایشان قیمت داده — همان قاعدهٔ سرور */
    const its = items().filter((it) => d.sup.some((g) => g.rows[it.id])), N = d.sup.length, span = 4 + 3 * N;
    const mAll = [], mVat = [], mTot = [];
    /* تأمین‌کننده‌ای که گفته ارزش افزوده ندارد، سطر ارزش افزوده‌اش صفر است */
    d.sup.forEach((g) => { let t = 0; its.forEach((it) => { const q = g.rows[it.id]; if (q) t += (+q.price || 0) * (+q.qty || 0); }); const v = g.vat === "ندارد" ? 0 : Math.round(t * VAT_RATE); mAll.push(t); mVat.push(v); mTot.push(t + v); });
    const B = (fn) => d.sup.map((g, k) => fn(g, k)).join("");
    const chk = (v, t) => v === t ? "☑" : "☐", dealChk = (v) => d.sup.some((g) => g.deal === v) ? "☑" : "☐";
    return `<table class="cf">
      <tr><td class="ttl" colspan="4">مقایسه استعلام بها</td><td class="lbl rt" colspan="${3 * N}">کد: TSA-PS-FO-02 &nbsp; شماره بازنگری: ۱ &nbsp; تاریخ تنظیم سند: ${TP.fmtD(S.now)}</td></tr>
      <tr><td class="rt" colspan="${4 + Math.max(0, N - 2) * 3}">محل معامله: ${dealChk("کارگاه")} کارگاه &nbsp; ${dealChk("دفتر مرکزی")} دفتر مرکزی</td>
          <td class="rt" colspan="${Math.min(3 * N, 3)}">نوع معامله: ${chk(r.head_deal_type || "خرید", "خرید")} خرید &nbsp; ${chk(r.head_deal_type, "فروش")} فروش</td>
          <td class="rt" colspan="${Math.max(1, span - 4 - Math.max(0, N - 2) * 3 - Math.min(3 * N, 3))}">نوع درخواست: ${chk(r.head_req_type, "فوری")} فوری &nbsp; ${chk(r.head_req_type || "عادی", "عادی")} عادی</td></tr>
      <tr><td class="rt" colspan="2">شماره درخواست: ${esc(r.id)}</td><td class="rt" colspan="2">تاریخ درخواست خرید: ${esc(r.date)}</td>
          <td class="rt" colspan="${Math.max(1, Math.floor(3 * N / 2))}">محل پروژه: ${esc(r.head_site == null ? r.party : r.head_site)}</td><td class="rt" colspan="${Math.max(1, 3 * N - Math.max(1, Math.floor(3 * N / 2)))}">تاریخ نیاز: ${esc((its[0] || {}).need_date || "—")}</td></tr>
      <tr><td class="lbl" colspan="4">خریدار: ${COMPANY}</td><td class="lbl" colspan="${3 * N}">فروشنده / ارائه‌دهنده خدمات</td></tr>
      <tr><td class="lbl">ردیف</td><td class="lbl">شرح اقلام</td><td class="lbl">تعداد</td><td class="lbl">واحد</td>${B((g) => `<td class="sup" colspan="3">${esc(g.name)}</td>`)}</tr>
      <tr><td colspan="4"></td>${B(() => `<td class="lbl">جنس</td><td class="lbl">مبلغ کل (ریال)</td><td class="lbl">مبلغ واحد (ریال)</td>`)}</tr>
      ${its.map((it, i) => `<tr><td class="num">${i + 1}</td><td class="rt">${esc(it.title)}</td><td class="num">${it.qty == null ? "" : M(it.qty)}</td><td>${esc(it.unit)}</td>
        ${B((g) => { const q = g.rows[it.id]; const tot = q ? (+q.price || 0) * (+q.qty || 0) : ""; return `<td>${q ? esc(q.spec) : ""}</td><td class="num">${q ? M(tot) : ""}</td><td class="num">${q ? M(q.price) : ""}</td>`; })}</tr>`).join("")}
      <tr><td class="lbl rt" colspan="4">جمع کل بدون ارزش افزوده (ریال):</td>${B((g, k) => `<td class="num" colspan="3">${M(mAll[k])}</td>`)}</tr>
      <tr><td class="lbl rt" colspan="4">ارزش افزوده (۱۰٪):</td>${B((g, k) => `<td class="num" colspan="3">${g.vat === "ندارد" ? "ندارد" : M(mVat[k])}</td>`)}</tr>
      <tr><td class="lbl rt" colspan="4">جمع کل با ارزش افزوده (ریال):</td>${B((g, k) => `<td class="num" colspan="3" style="font-weight:700">${M(mTot[k])}</td>`)}</tr>
      <tr><td class="lbl rt" colspan="4">نوع فاکتور و میزان مالیات و عوارض:</td>${B((g) => `<td colspan="3">${esc(g.invoice || "—")}</td>`)}</tr>
      <tr><td class="lbl rt" colspan="4">مدت اعتبار پیش‌فاکتور:</td>${B((g) => `<td colspan="3">${g.valid ? esc(g.valid) + " روز" : "—"}</td>`)}</tr>
      <tr><td class="lbl rt" colspan="4">شرایط تسویه:</td>${B((g) => `<td colspan="3">${esc(g.pay || "—")}</td>`)}</tr>
      <tr><td class="lbl rt" colspan="4">زمان تحویل:</td>${B((g) => `<td colspan="3">${esc(g.dtime || "—")}</td>`)}</tr>
      <tr><td class="lbl rt" colspan="4">تاییدیه فنی:</td>${B(() => `<td colspan="3">—</td>`)}</tr>
      <tr class="tall"><td class="rt" colspan="${Math.ceil(span / 2)}">نظر کارگاه:</td><td class="rt" colspan="${span - Math.ceil(span / 2)}">توضیحات تدارکات و پشتیبانی:${A().notes ? `<div style="font-weight:400;padding-top:4px;white-space:pre-wrap">${esc(A().notes)}</div>` : ""}</td></tr>
      <tr class="tall"><td class="rt" colspan="${Math.ceil(span / 2)}">نظر واحد فنی:</td><td class="rt" colspan="${span - Math.ceil(span / 2)}">نظر واحد حقوقی:</td></tr>
      <tr class="tall"><td class="rt" colspan="${Math.ceil(span / 2)}">امضا کارشناس خرید: ${esc(S.expert.name)}</td><td class="rt" colspan="${span - Math.ceil(span / 2)}">امضا مدیر پشتیبانی:</td></tr>
      <tr class="tall"><td class="rt" colspan="${Math.ceil(span / 3)}">عضو کمیسیون</td><td class="rt" colspan="${Math.ceil(span / 3)}">عضو کمیسیون</td><td class="rt" colspan="${span - 2 * Math.ceil(span / 3)}">عضو کمیسیون</td></tr></table>`;
  }
  /* ستون‌های برگهٔ درخواست خرید، از راست به چپ — همان ترتیبِ فرم چاپی.
     فایل Word هم دقیقاً همین‌هاست (worker/reqdoc.js)؛ اگر یکی عوض شد، آن یکی هم. */
  const RQC = ["ردیف", "کد قلم", "نام قلم", "مقدار", "واحد", "تاریخ نیاز", "مصرف کننده", "وضعیت",
    "تامین کننده", "کارشناس خرید", "روند خرید", "مهلت استعلام"];

  /** تأمین‌کنندهٔ هر قلم از استعلامِ ثبت‌شده — ترجیح با تأییدنهایی */
  function supplierOf(itemId) {
    let best = null;
    for (const q of S.d.quotes) {
      if (q.item_id !== itemId || !q.saved) continue;
      if (!best || (q.final && !best.final)) best = q;
    }
    return best ? best.supplier_name : "";
  }

  function reqForm(r) {
    const a = A(), its = items(), N = RQC.length;
    const deadline = a.deadline_at ? TP.fmtD(a.deadline_at) : "";
    const note = [...new Set(its.map((i) => (i.note || "").trim()).filter(Boolean))].join(" · ");
    /* هر سطرِ کادر مشخصات باید دقیقاً ${N} ستون بشود، وگرنه جدول کج می‌نشیند:
       برچسب(۱) + مقدار(۳) + برچسب(۲) + مقدار(۳) + جای خالی(۳) */
    const pair = (k, v, kw, vw) => `<td class="lbl rt" colspan="${kw}">${esc(k)}</td><td class="rt" colspan="${vw}">${esc(v == null || v === "" ? "—" : v)}</td>`;
    const info = (k1, v1, k2, v2) => `<tr>${pair(k1, v1, 1, 3)}${pair(k2, v2, 2, 3)}<td colspan="${N - 9}"></td></tr>`;
    const third = Math.round(N / 3);
    return `<table class="cf rq" style="margin-bottom:14px">
      <tr><td colspan="${N - 2 * third}"></td><td class="ttl" colspan="${third}">درخواست خرید<div style="font-weight:400;font-size:.85em">شرکت ${COMPANY}</div></td>
          <td class="rt" colspan="${third}" style="font-size:.85em">شماره صفحه: ۱<br>تاریخ گزارش: ${esc(TP.fmtD(S.now))}</td></tr>
      ${info("شماره درخواست", r.id, "مرکز درخواست کننده", r.center)}
      ${info("تاریخ درخواست", r.date, "درخواست کننده", r.requester)}
      ${info("واحد/رمز تامین", r.buy_type, "نوع طرف مقابل", r.party_type)}
      ${info("نوع قلم", r.head_req_type || "کالا", "طرف مقابل", r.party)}
      <tr><td class="lbl rt">توضیحات</td><td class="rt" colspan="${N - 1}">${esc(note)}</td></tr>
      <tr>${RQC.map((t) => `<th class="hd">${t}</th>`).join("")}</tr>
      ${its.map((it, i) => `<tr><td class="num">${M(i + 1)}</td><td class="num">${esc(it.code || "")}</td><td class="rt">${esc(it.title)}</td>
        <td class="num">${it.qty == null ? "" : M(it.qty)}</td><td class="num">${esc(it.unit || "")}</td><td class="num">${esc(it.need_date || "")}</td>
        <td class="rt">${esc(it.consumer || "")}</td><td class="num">${esc(it.src_status || "")}</td><td class="rt">${esc(supplierOf(it.id))}</td>
        <td class="rt">${esc(S.expert.name)}</td><td class="num">${esc(r.buy_flow || "")}</td><td class="num">${esc(deadline)}</td></tr>`).join("")}
      <tr class="tall"><td class="rt" colspan="${Math.ceil(N / 2)}">نام صادر کننده: ${esc(r.requester || "")}<br><br>امضا</td>
          <td class="rt" colspan="${N - Math.ceil(N / 2)}">نام تایید کننده:<br><br>امضا</td></tr></table>`;
  }
  function downloadXls() {
    const r = S.d.request, d = commData();
    const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>کمیسیون</x:Name><x:WorksheetOptions><x:DisplayRightToLeft/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
      <style>table,td,th{border:1px solid #666;border-collapse:collapse;font-family:Tahoma;font-size:11pt}td{padding:3px}</style></head><body dir="rtl">${reqForm(r)}<br>${commForm(r, d)}</body></html>`;
    const blob = new Blob(["﻿" + html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `کمیسیون-${r.id}.xls`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
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
      d.querySelectorAll(".tok").forEach((b) => b.onclick = () => { const tk = "{" + b.dataset.k + "}", s = ta.selectionStart, e = ta.selectionEnd; ta.value = ta.value.slice(0, s) + tk + ta.value.slice(e); const pos = s + tk.length; ta.focus(); ta.setSelectionRange(pos, pos); });
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
    try { S.d = await TP.api(`/assignments/${aid}`); S.settings = S.d.settings; S.now = Date.now(); if (!keepTab) { S.itemIdx = 0; S.tab = "history"; } if (S.itemIdx >= S.d.items.length) S.itemIdx = 0; S.screen = "detail"; render();
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
    const bk = G("[data-back]"); if (bk) bk.onclick = () => { S.screen = "list"; S.d = null; loadTray(); };
    Q("[data-item]").forEach((x) => x.onclick = () => { S.itemIdx = +x.dataset.item; render(); });
    Q("[data-tab]").forEach((x) => x.onclick = () => { S.tab = x.dataset.tab; render(); });
    Q("[data-idone]").forEach((c) => c.onchange = async (e) => { try { await TP.api(`/items/${e.target.dataset.idone}/commission`, { body: { ok: e.target.checked } }); await reload(); } catch (er) { TP.modal("خطا", esc(er.message), null, "باشد", ""); } });
    Q("[data-eact]").forEach((b) => b.onclick = () => doExpertAct(b.dataset.eact));
    const tp = G("[data-tpl]"); if (tp) tp.onclick = pickTemplate;
    /* سوابق / جستجو */
    Q("[data-w]").forEach((i) => i.oninput = (e) => { e.target.value = e.target.value.replace(/[^0-9]/g, ""); S.weights[+e.target.dataset.w] = +e.target.value || 0; });
    const rh = G("[data-run-hist]"); if (rh) rh.onclick = async () => {
      const it = item();
      try { S.hist[it.id] = await TP.api(`/suppliers/history?item=${encodeURIComponent(it.title)}&code=${encodeURIComponent(it.code || "")}`); }
      catch (e) { TP.modal("خطا", esc(e.message), null, "باشد", ""); return; }
      /* خواندنِ سوابق همان «بررسی سوابق» است — باکس دوم سبز می‌شود */
      if (!it.hist_done_at && S.hist[it.id].available) { try { await TP.api(`/items/${it.id}/progress`, { body: { stage: "hist" } }); await reload(); return; } catch (_) { /* نمایش مهم‌تر است */ } }
      render();
    };
    const rec = G("[data-rec]"); if (rec) rec.oninput = (e) => { S.recency = +e.target.value; try { localStorage.setItem(recKey, String(S.recency)); } catch (_) {} render(); };
    Q("[data-hsort]").forEach((th) => th.onclick = () => { S.hsort = th.dataset.hsort; render(); });
    Q("[data-prof]").forEach((el) => el.onclick = (e) => { e.preventDefault(); S.prof = el.dataset.prof && S.prof !== el.dataset.prof ? el.dataset.prof : null; render(); });
    Q("[data-add-sup]").forEach((b) => b.onclick = async () => {
      /* فقط نام می‌رود؛ قیمت با پیش‌فاکتور یا فاکتور دستی */
      const it = item();
      try { await TP.api("/quotes", { body: { assignment_id: A().id, item_id: it.id, supplier_name: b.dataset.addSup } }); await reload(); }
      catch (e) { TP.modal("خطا", esc(e.message), null, "باشد", ""); }
    });
    const rs = G("[data-run-smart]"); if (rs) rs.onclick = async () => { const it = item(); S.srch.notes = (G("#notes") || {}).value; S.smart[it.id] = await TP.api("/search/smart", { body: { item: it.title, code: it.code, notes: S.srch.notes, scope: S.scope, caps: S.caps, srch: S.srch, filters: S.f } }); render(); };
    Q("[data-mark]").forEach((b) => b.onclick = async () => { const it = item(); const stage = b.dataset.mark; const ids = S.scope === "all" && stage === "smart" ? items().map((x) => x.id) : [it.id]; for (const id of ids) await TP.api(`/items/${id}/progress`, { body: { stage } }); await reload(); });
    Q("[data-scope]").forEach((x) => x.onchange = (e) => { S.scope = e.target.dataset.scope; render(); });
    Q("[data-cap]").forEach((x) => x.onchange = (e) => { S.caps[e.target.dataset.cap] = e.target.checked; });
    Q("[data-s]").forEach((x) => x.oninput = x.onchange = (e) => { S.srch[e.target.dataset.s] = e.target.value; if (e.target.tagName === "SELECT") render(); });
    Q("[data-tr]").forEach((x) => x.onchange = (e) => { S.srch.trade = e.target.dataset.tr; render(); });
    const po = G("[data-po]"); if (po) po.onchange = (e) => { S.f.priceOnly = e.target.checked; };
    const am = G("[data-admax]"); if (am) am.oninput = (e) => { S.f.adMax = +e.target.value; e.target.nextElementSibling.textContent = `از ${TP.fmtD(S.now - S.f.adMax * DAY)} تا امروز`; };
    Q("[data-date]").forEach((i) => i.onclick = () => TP.openDatePicker(i, (v) => { S.f.maxDelivery = v; render(); }, { single: true }));
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
    Q("[data-h]").forEach((x) => x.onchange = async (e) => { const k = e.target.dataset.h; await TP.api(`/requests/${encodeURIComponent(S.d.request.id)}/head`, { method: "PUT", body: { [k]: e.target.value } }); S.d.request["head_" + k] = e.target.value; render(); });
    const mc = G("[data-make-comm]"); if (mc) mc.onclick = async () => { try { await TP.api(`/assignments/${A().id}/commission`, { body: {} }); S.tab = "comm"; await reload(); } catch (e) { TP.modal("تولید جدول کمیسیون", esc(e.message) + (e.data && e.data.missing && e.data.missing.length ? `<br><br>${e.data.missing.map((m) => `• ${esc(m.title)} (${m.n} از ${e.data.need})`).join("<br>")}` : ""), null, "باشد", ""); } };
    const dx = G("[data-xls]"); if (dx) dx.onclick = downloadXls;
    const sn = G("[data-save-notes]");
    if (sn) sn.onclick = async () => {
      const box = G("[data-notes]"), msg = G("[data-notes-msg]");
      try {
        await TP.api(`/assignments/${A().id}/notes`, { method: "PUT", body: { notes: box.value } });
        A().notes = box.value;            /* تا بدون بارگذاری دوباره، در خود فرم دیده شود */
        msg.textContent = "ذخیره شد ✅";
        render();
      } catch (e) { msg.textContent = e.message; }
    };
    const pr = G("[data-print]"); if (pr) pr.onclick = () => TP.modal("پرینت", "دو برگه با هم چاپ می‌شوند:<br><br>۱. برگه درخواست خرید<br>۲. جدول مقایسه استعلام بها (کمیسیون)<br><br>برای PDF، در پنجرهٔ چاپ «Save as PDF» را انتخاب کنید.", () => window.print(), "چاپ کن");
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
