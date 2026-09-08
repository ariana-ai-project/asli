/* ============================================================
   میز ارجاع خرید — پنل مدیر
   داده از API (D1) می‌آید؛ منطق رنگ مراحل/مهلت/فرمول‌ها همان مرجع است.

   مدل: هر سطر جدول یک «ارجاع» (درخواست × کارشناس) است و اطلاعات درخواست
   روی سطرهایش کشیده می‌شود؛ اقلامِ بی‌کارشناس هم یک سطر با انتخاب خالی
   می‌گیرند. اقلام هر درخواست در کشوی بازشدنی زیرش دیده می‌شوند.
   ============================================================ */
(function () {
  "use strict";
  const CFG = window.TAMIN_POSHTIBANI_CONFIG, TP = window.TP;
  const esc = TP.esc, M = TP.M, DAY = TP.DAY;

  /* ---------- وضعیت برنامه ---------- */
  const S = {
    tab: "desk", now: Date.now(),
    data: { requests: [], experts: [], settings: null }, scores: { scores: [], weights: [] },
    decisions: [], events: [],
    filter: { expert: "", status: "", state: "", window: CFG.defaults.window || "3d" },
    q: { id: "", date: "", party: "", item: "" },
    page: { limit: 300, offset: 0, total: 0 },   // صفحه‌بندی سمت سرور برای بازه‌های بزرگ
    open: {},            // کشوی اقلام هر درخواست
    loading: false, error: "",
  };
  const settings = () => S.data.settings || CFG.defaults;
  /* بازهٔ میز → تاریخ شروع (شمسی) که سرور با آن فیلتر می‌کند؛ «همه» = بدون فیلتر */
  const WINDOWS = [["3d", "امروز و دو روز گذشته", 2], ["7d", "هفتهٔ اخیر", 6], ["30d", "ماه اخیر", 29], ["all", "همه تاریخ‌ها", null]];
  const fromDate = () => { const w = WINDOWS.find((x) => x[0] === S.filter.window); return w && w[2] != null ? TP.fmtD(S.now - w[2] * DAY) : ""; };

  /* ---------- گروه کالایی (همان الگوهای مرجع؛ زیرساخت ارجاع/مهلت هوشمند) ---------- */
  const NORMCAT = [
    [/آچار|انبردست|پیچ.?گوشتی|پتک|چکش|بکس|گیره/, "ابزار دستی"],
    [/لوله|زانو|سه.?راه|بوش|شیلنگ|سرشیلنگی|فلنج|شیر|لرزه.?گیر|عایق/, "اتصالات و لوله"],
    [/تابلو|کابل|کنترلر|برق|حضور و غیاب|لپ.?تاپ|جی پی اس|سرسیم|سیم/, "برق و الکترونیک"],
    [/پمپ|توربو|ترموستات|جک|بلبرینگ|کلاچ|دیسک|صفحه|انژکتور|سوزن|مهره|واشر|پیچ|دم تیغ|کیت|اورینگ|لوازم|تعمیر|فیلتر|روغن|گریس/, "قطعات ماشین‌آلات"],
    [/سیفون|مخزن|توالت|دستشویی|درجه|مانومتر|سیمان|آجر|گچ/, "تاسیسات و ساختمانی"],
  ];
  const CATS = ["ابزار دستی", "اتصالات و لوله", "برق و الکترونیک", "قطعات ماشین‌آلات", "تاسیسات و ساختمانی", "متفرقه"];
  function catOf(title) { const t = String(title || ""); for (const [re, c] of NORMCAT) if (re.test(t)) return c; return "متفرقه"; }
  const reqCat = (r) => catOf((r.items[0] || {}).title);

  /* ---------- مشتقات ---------- */
  const openItems = (r) => r.items.filter((i) => i.state === "open" || i.state === "hold");
  const unassignedOpen = (r) => openItems(r).filter((i) => !i.assignment_id);
  const itemsOf = (r, a) => r.items.filter((i) => i.assignment_id === a.id);
  const isActive = (r, a) => !!a.dispatched_at && itemsOf(r, a).some((i) => i.state === "open");
  function doneFlags(r, a) {
    const its = itemsOf(r, a);
    return [!!a.viewed_at, its.some((i) => i.hist_done_at), its.some((i) => i.smart_done_at), a.quote_count > 0, a.proforma_count > 0, !!a.commission_at];
  }
  const reqState = (r) => openItems(r).length ? (r.items.every((i) => i.state === "hold" || i.state === "closed" || i.state === "stop") && r.items.some((i) => i.state === "hold") ? "hold" : "open")
    : r.items.some((i) => i.state === "stop") ? "stop" : "closed";
  const readyAssignments = () => S.data.requests.flatMap((r) => r.assignments.filter((a) => !a.dispatched_at && Number(a.days) > 0 && itemsOf(r, a).length));

  function load(e) { const s = e.speed || 1; return s; }
  function expertLoad(e) { return Math.min(1, (e.open_load || 0) / (settings().capacity || 8)); }
  const scoreOf = (eid, kind, key) => { const s = S.scores.scores.find((x) => x.expert_id === eid && x.kind === kind && x.key === key); return s ? s.score : 3; };
  const weightOf = (kind, key) => { const w = S.scores.weights.find((x) => x.kind === kind && x.key === key); return w ? w.w : 1; };
  function asgScore(e, r) {
    const A = settings().assign;
    const g = scoreOf(e.id, "category", reqCat(r)) / 5 * 100, p = scoreOf(e.id, "party", r.party) / 5 * 100, l = expertLoad(e) * 100;
    const t1 = (+A.a || 0) / 100 * g, t2 = (+A.b || 0) / 100 * p, t3 = (+A.c || 0) / 100 * l;
    const s1 = A.op1 === "+" ? t1 + t2 : t1 - t2;
    return A.op2 === "+" ? s1 + t3 : s1 - t3;
  }
  function smartDays(r, e) {
    const D = settings().deadline;
    const b = +D.base || 1, we = (e.speed || 1) * (+D.we || 1), wp = weightOf("party", r.party) * (+D.wp || 1), wi = weightOf("category", reqCat(r)) * (+D.wi || 1);
    const f = (x, op, y) => op === "×" ? x * y : op === "÷" ? x / (y || 1) : op === "+" ? x + y : x - y;
    let v = f(b, D.op1, we); v = f(v, D.op2, wp); v = f(v, D.op3, wi);
    return Math.max(1, Math.round(v));
  }

  /* ---------- فیلتر (بازه و صفحه سمت سرور؛ جستجوی ستونی سمت کلاینت روی همان صفحه) ---------- */
  const dateList = () => String(S.q.date || "").split("،").map((s) => s.trim()).filter(Boolean);
  function visible() {
    return S.data.requests.filter((r) => {
      if (!TP.hit(r.id, S.q.id)) return false;
      const L = dateList(); if (L.length && !L.includes(r.date)) return false;
      if (!TP.hit(r.party, S.q.party)) return false;
      if (S.q.item && !r.items.some((i) => TP.hit(i.title, S.q.item) || TP.hit(i.code, S.q.item))) return false;
      if (S.filter.expert) { const eid = +S.filter.expert; if (!r.assignments.some((a) => a.expert_id === eid)) return false; }
      if (S.filter.status && !r.items.some((i) => i.src_status === S.filter.status)) return false;
      const anyPending = r.assignments.some((a) => !a.dispatched_at) || unassignedOpen(r).length > 0;
      const anySent = r.assignments.some((a) => a.dispatched_at);
      if (S.filter.state === "pending" && !anyPending) return false;
      if (S.filter.state === "sent" && !anySent) return false;
      if (S.filter.state === "ready" && !r.assignments.some((a) => !a.dispatched_at && Number(a.days) > 0)) return false;
      if (S.filter.state === "closed" && openItems(r).length) return false;
      return true;
    });
  }

  /* ---------- بارگذاری داده ---------- */
  async function refresh() {
    S.loading = true; S.error = ""; render();
    try {
      S.now = Date.now();
      const qs = `?from=${encodeURIComponent(fromDate())}&limit=${S.page.limit}&offset=${S.page.offset}`;
      const [d, sc, dec] = await Promise.all([TP.api("/desk" + qs), TP.api("/scores"), TP.api("/decisions")]);
      S.data = d; S.scores = sc; S.decisions = dec.decisions || [];
      S.page.total = d.total || d.requests.length;
    } catch (e) {
      if (e.status === 401 || e.status === 503) { TP.manager.clear(); S.error = e.message; }
      else S.error = e.message;
    }
    S.loading = false; render();
  }

  /* ---------- ورود مدیر ---------- */
  function vLogin() {
    return `<div class="tp-card tp-login"><h2>ورود مدیر تدارکات</h2><p>کد مدیر را وارد کنید.</p>
      <input id="mcode" class="tp-input" type="password" inputmode="numeric" autocomplete="off" autofocus>
      <button class="tp-btn primary" data-login style="width:100%;margin-top:14px">ورود</button>
      <div class="err">${esc(S.error)}</div>
      <a class="tp-back" href="index.html">← بازگشت به تدارکات</a></div>`;
  }

  /* ---------- سرآیند و تب‌ها ---------- */
  function vTop() {
    const R = S.data.requests, items = R.reduce((a, r) => a + r.items.length, 0);
    const TABS = [["desk", "میز ارجاع"], ["alerts", "تنظیم اعلانات"], ["asg", "ارجاع هوشمند"], ["dl", "مهلت هوشمند"], ["norm", "اقلام و کدها"], ["log", "تصمیم‌ها و رویدادها"]];
    return `<header class="tp-top">
      <div class="brand"><img src="../assets/logo-new.jpg" alt=""><div><h1>میز ارجاع خرید</h1><div class="sub">${S.page.total > R.length ? `${M(S.page.total)} درخواست در بازه · ${R.length} بارگذاری‌شده` : `${R.length} درخواست`} · ${M(items)} قلم · ${esc(CFG.company)}</div></div></div>
      <span class="spacer"></span>
      <button class="tp-btn" data-import>بارگذاری درخواست‌های روزانه</button>
      <button class="tp-btn sm" data-refresh title="به‌روزرسانی">↻</button>
      <a class="tp-back" href="index.html">تدارکات</a>
      <button class="tp-btn xs" data-logout title="خروج">خروج</button>
    </header>
    <div class="tp-tabs">${TABS.map(([k, l]) => `<button class="tp-tab ${S.tab === k ? "on" : ""}" data-tab="${k}">${l}${k === "log" && S.decisions.length ? `<span class="cnt">${S.decisions.length}</span>` : ""}</button>`).join("")}
      <label class="chip ${settings().approvalRequired ? "warn" : ""}" style="margin-inline-start:auto;display:inline-flex;gap:6px;align-items:center;cursor:pointer;padding:4px 12px">
        <input type="checkbox" data-approval ${settings().approvalRequired ? "checked" : ""}> توقف / تعلیق / خاتمه توسط کارشناس منوط به تأیید من باشد</label>
    </div>`;
  }

  /* ---------- میز ارجاع ---------- */
  function vFilters() {
    const E = S.data.experts.filter((e) => e.active);
    const statuses = [...new Set(S.data.requests.flatMap((r) => r.items.map((i) => i.src_status)).filter(Boolean))];
    return `<div class="tp-filters">
      <span class="lab">کارشناس</span><select class="tp-select" data-f="expert"><option value="">همه</option>${E.map((e) => `<option value="${e.id}" ${String(S.filter.expert) === String(e.id) ? "selected" : ""}>${esc(e.label || e.name)}</option>`).join("")}</select>
      <span class="lab">وضعیت مبدأ</span><select class="tp-select" data-f="status"><option value="">همه</option>${statuses.map((s) => `<option ${S.filter.status === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>
      <span class="lab">مرحله</span><select class="tp-select" data-f="state"><option value="">همه</option>
        <option value="pending" ${S.filter.state === "pending" ? "selected" : ""}>ارسال‌نشده</option><option value="ready" ${S.filter.state === "ready" ? "selected" : ""}>آماده ارسال</option>
        <option value="sent" ${S.filter.state === "sent" ? "selected" : ""}>ارسال‌شده</option><option value="closed" ${S.filter.state === "closed" ? "selected" : ""}>بسته/متوقف</option></select>
      <span class="lab">بازه</span><select class="tp-select" data-f="window">${WINDOWS.map(([k, l]) => `<option value="${k}" ${S.filter.window === k ? "selected" : ""}>${l}</option>`).join("")}</select>
      <button class="tp-btn sm" data-clear>پاک کردن فیلترها</button>
      <span class="end">${visible().length} از ${S.data.requests.length} درخواست${S.page.total > S.page.limit ? ` · صفحهٔ ${Math.floor(S.page.offset / S.page.limit) + 1} از ${Math.ceil(S.page.total / S.page.limit)}
        <button class="tp-btn xs" data-page="-1" ${S.page.offset ? "" : "disabled"}>قبلی</button><button class="tp-btn xs" data-page="1" ${S.page.offset + S.page.limit < S.page.total ? "" : "disabled"}>بعدی</button>` : ""}</span></div>`;
  }

  function stageBoxes(r, a) {
    const A = { dispatchedAt: a.dispatched_at, days: a.days, done: doneFlags(r, a), active: isActive(r, a) };
    return TP.STAGES.map((s, i) => {
      let lab = ""; if (i === 3 && a.quote_count) lab = `<span class="cnt">${a.quote_count}</span>`; if (i === 4 && a.proforma_count) lab = `<span class="cnt">${a.proforma_count}</span>`;
      return `<td class="console"><div class="box b-${TP.stageColor(A, i, settings().thresholds, S.now)}" title="${s}">${lab}</div></td>`;
    }).join("");
  }

  function vDesk() {
    if (!S.data.requests.length && (S.data.all_total || 0) > 0 && S.filter.window !== "all") {
      /* بازهٔ تاریخ خالی است ولی درخواست باز داریم — نگوییم «فایلی نیست» */
      const w = WINDOWS.find((x) => x[0] === S.filter.window);
      return `<div class="empty"><b>در بازهٔ «${esc(w ? w[1] : "")}» درخواست بازی نیست.</b>${M(S.data.all_total)} درخواست باز با تاریخ قدیمی‌تر در سامانه هست.<br><br><button class="tp-btn primary" data-win-all>نمایش همه تاریخ‌ها</button></div>`;
    }
    if (!S.data.requests.length) return `<div class="empty"><b>هنوز فایلی بارگذاری نشده است.</b>با دکمه «بارگذاری درخواست‌های روزانه» فایل خروجی راهکاران (.xlsx) را انتخاب کنید.</div>`;
    const rows = visible();
    if (!rows.length) return `<div class="empty">با این فیلترها درخواستی در این بازه نیست.${S.q.id.trim().length >= 4
      ? `<br><br><button class="tp-btn" data-lookup="${esc(S.q.id.trim())}">جستجوی شماره «${esc(S.q.id.trim())}» در کل سامانه (خارج از بازه)</button>` : ""}</div>`;
    const E = S.data.experts.filter((e) => e.active);
    let h = `<div class="tp-scroll" data-keep-scroll style="max-height:calc(100vh - 300px)"><table class="tp-table"><thead>
      <tr class="group"><th colspan="6">داده فایل ورودی</th><th colspan="3" class="sep">تصمیم مدیر</th><th colspan="7" class="console sep">پایش مراحل</th><th colspan="2" class="sep">اقدام</th></tr>
      <tr><th class="stick"></th><th>شماره<br>درخواست</th><th>تاریخ</th><th class="rt">طرف مقابل</th><th>اقلام</th><th>وضعیت</th>
        <th class="sep">کارشناس خرید<br><button class="tp-btn xs" data-auto="asg" title="ارجاع هوشمند روی همه درخواست‌های ارسال‌نشده">خودکار</button></th>
        <th>مهلت (روز کاری)<br><button class="tp-btn xs" data-auto="dl" title="مهلت هوشمند روی همه ارسال‌نشده‌های کارشناس‌دار">خودکار</button></th><th>قلم</th>
        <th class="console sep">ارسال</th>${TP.STAGES.map((s) => `<th class="console">${s.replace(" ", "<br>")}</th>`).join("")}
        <th class="sep">وضعیت و اقدام</th><th>پنل</th></tr>
      <tr class="flt"><th class="stick"></th><th><input class="tp-input ${S.q.id ? "on" : ""}" data-q="id" value="${esc(S.q.id)}" placeholder="جستجو"></th>
        <th><input class="tp-input date ${S.q.date ? "on" : ""}" data-q="date" value="${esc(S.q.date)}" placeholder="تاریخ" readonly></th>
        <th><input class="tp-input ${S.q.party ? "on" : ""}" data-q="party" value="${esc(S.q.party)}" placeholder="جستجو"></th>
        <th><input class="tp-input ${S.q.item ? "on" : ""}" data-q="item" value="${esc(S.q.item)}" placeholder="عنوان یا کد قلم"></th>
        <th></th><th class="sep"></th><th></th><th></th><th class="console sep"></th>${TP.STAGES.map(() => `<th class="console"></th>`).join("")}<th class="sep"></th><th></th></tr>
      </thead><tbody>`;
    for (const r of rows) {
      const un = unassignedOpen(r);
      const units = [...r.assignments.map((a) => ({ a })), ...(un.length ? [{ un }] : [])];
      if (!units.length) units.push({ none: true });
      const n = units.length, rs = ` rowspan="${n}"`;
      const st = reqState(r), STL = TP.STATES[st];
      const srcChips = [...new Set(r.items.map((i) => i.src_status).filter(Boolean))].map((s) => `<span class="st ${TP.SRC_CLS[s] || "st-reg"}">${esc(s)}</span>`).join(" ");
      units.forEach((u, k) => {
        h += `<tr>`;
        if (k === 0) {
          h += `<td class="stick"${rs}><button class="tp-btn xs" data-toggle="${esc(r.id)}" title="اقلام">${S.open[r.id] ? "▾" : "◂"} ${r.items.length}</button></td>
            <td class="id num"${rs}>${esc(r.id)}</td><td class="num"${rs}>${esc(r.date)}</td>
            <td class="party"${rs}>${esc(r.party)}${r.center ? `<div class="dim" style="font-size:.75rem">${esc(r.center)}</div>` : ""}</td>
            <td class="item"${rs}><div style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.items.map((i) => i.title).join(" · "))}">${esc(r.items[0] ? r.items[0].title : "")}</div>${r.items.length > 1 ? `<div class="dim" style="font-size:.75rem">و ${r.items.length - 1} قلم دیگر</div>` : ""}</td>
            <td${rs}>${srcChips}</td>`;
        }
        if (u.a) {
          const a = u.a, lock = a.dispatched_at ? "disabled" : "", its = itemsOf(r, a);
          h += `<td class="sep"><select class="tp-select" data-assign="${esc(r.id)}" data-aid="${a.id}" ${lock}>${E.map((e) => `<option value="${e.id}" ${e.id === a.expert_id ? "selected" : ""}>${esc(e.label || e.name)}</option>`).join("")}</select>
              ${its.some((i) => i.src_expert && TP.nrm(i.src_expert) !== TP.nrm(a.expert_name)) ? `<span class="chip warn" title="کارشناس فایل راهکاران متفاوت است">⚠ فایل: ${esc(its.find((i) => i.src_expert).src_expert)}</span>` : ""}</td>
            <td><input class="tp-input num ${a.days ? "" : "unset"}" style="width:64px;text-align:center" data-days="${a.id}" value="${esc(a.days || "")}" inputmode="numeric" ${lock}></td>
            <td class="num">${its.length}</td>
            <td class="console sep"><div class="box b-${TP.dispatchColor(r.imported_at || S.now, settings().dispatchDays, a.dispatched_at, S.now)}" title="${a.dispatched_at ? "ارسال شد " + TP.fmt(a.dispatched_at) : "ارسال‌نشده"}"></div></td>
            ${stageBoxes(r, a)}
            <td class="sep" style="white-space:nowrap"><span class="st ${STL.cls}">${isActive(r, a) ? "در جریان" : STL.label}</span><br>
              <button class="tp-btn xs warn" data-act="hold|${a.id}">تعلیق</button><button class="tp-btn xs danger" data-act="stop|${a.id}">توقف</button><button class="tp-btn xs" data-act="closed|${a.id}">خاتمه</button>
              ${its.some((i) => i.state === "hold") ? `<button class="tp-btn xs" data-act="open|${a.id}">بازگشت</button>` : ""}</td>
            <td><button class="tp-btn xs" data-open="${a.id}">مشاهده</button> <button class="tp-btn xs" data-move="${a.id}" ${a.dispatched_at ? "" : "disabled"}>تغییر</button></td>`;
        } else if (u.un) {
          h += `<td class="sep"><select class="tp-select unset" data-assign="${esc(r.id)}"><option value="">— انتخاب کارشناس —</option>${E.map((e) => `<option value="${e.id}">${esc(e.label || e.name)}</option>`).join("")}</select>
              ${r.items.some((i) => i.src_expert) ? `<div class="dim" style="font-size:.75rem">فایل: ${esc([...new Set(r.items.map((i) => i.src_expert).filter(Boolean))].join("، "))}</div>` : ""}</td>
            <td><input class="tp-input num unset" style="width:64px;text-align:center" disabled placeholder="—"></td><td class="num">${u.un.length}</td>
            <td class="console sep"><div class="box b-${TP.dispatchColor(r.imported_at || S.now, settings().dispatchDays, null, S.now)}"></div></td>
            ${TP.STAGES.map(() => `<td class="console"><div class="box b-idle"></div></td>`).join("")}
            <td class="sep"><span class="st ${STL.cls}">${STL.label}</span><br><span class="dim" style="font-size:.75rem">بدون کارشناس</span></td><td></td>`;
        } else {
          h += `<td class="sep" colspan="3"><span class="dim">قلم بازی ندارد</span></td><td class="console sep"><div class="box b-muted"></div></td>${TP.STAGES.map(() => `<td class="console"><div class="box b-muted"></div></td>`).join("")}
            <td class="sep"><span class="st ${STL.cls}">${STL.label}</span></td><td></td>`;
        }
        h += `</tr>`;
      });
      if (S.open[r.id]) {
        h += `<tr class="drawer"><td colspan="18"><div class="drawer-in"><table><thead><tr><th>#</th><th>کد قلم</th><th>عنوان</th><th>مشخصه فنی</th><th>مقدار</th><th>واحد</th><th>تاریخ نیاز</th><th>مصرف‌کننده</th><th>وضعیت راهکاران</th><th>کارشناس فایل</th><th>وضعیت سامانه</th><th>کارشناس</th><th>توضیحات</th></tr></thead><tbody>
          ${r.items.map((i) => { const a = r.assignments.find((x) => x.id === i.assignment_id); return `<tr><td class="num">${i.line_no}</td><td class="num">${esc(i.code)}</td><td>${esc(i.title)}</td><td class="dim">${esc(i.spec || "")}</td><td class="num">${i.qty == null ? "" : M(i.qty)}</td><td>${esc(i.unit)}</td><td class="num">${esc(i.need_date || "")}</td><td class="dim">${esc(i.consumer || "")}</td>
            <td><span class="st ${TP.SRC_CLS[i.src_status] || "st-reg"}">${esc(i.src_status || "")}</span></td><td class="dim">${esc(i.src_expert || "—")}</td><td><span class="st ${TP.STATES[i.state].cls}">${TP.STATES[i.state].label}</span></td>
            <td>${a ? esc(a.expert_label || a.expert_name) : (i.state === "open" ? `<span class="chip warn">بدون کارشناس</span>` : "—")}</td><td class="dim">${esc(i.note || "")}</td></tr>`; }).join("")}
          </tbody></table></div></td></tr>`;
      }
    }
    return h + `</tbody></table></div>`;
  }

  function vFoot() {
    const n = readyAssignments().length;
    return `<div class="tp-foot"><button class="tp-btn primary" data-dispatch ${n ? "" : "disabled"}>تأیید نهایی و ارسال (${n})</button>
      <span class="hint">${n ? "ارسال، ساعت‌شمار مهلت کارشناس را شروع می‌کند و اعلان می‌رود." : "برای ارسال، کارشناس و مهلت را کامل کنید."}</span>
      <span class="legend"><span><i class="b-empty"></i>در مهلت</span><span><i class="b-warn"></i>از آستانه گذشت</span><span><i class="b-late"></i>از آستانه بعدی هم گذشت</span><span><i class="b-over"></i>مهلت تمام شد</span><span><i class="b-done"></i>انجام شد</span><span><i class="b-muted"></i>هشدار خاموش</span><span><i class="b-idle"></i>ارسال‌نشده</span></span></div>`;
  }

  /* ---------- تنظیم اعلانات ---------- */
  function vAlerts() {
    const s = settings();
    return `<div class="tp-card tp-pane"><h2>تنظیم اعلانات</h2>
      <p class="lead">هر درصد یعنی چند درصد از مهلت کارشناس باید بگذرد تا اگر آن مرحله انجام نشده باشد، هشدار برود. خالی = هشدار آن مرحله خاموش.</p>
      <div class="tp-grid6">${TP.STAGES.map((st, i) => `<div class="cell"><b>${st}</b><input class="tp-input" data-thr="${i}" value="${s.thresholds[i] === "" || s.thresholds[i] == null ? "" : s.thresholds[i]}" inputmode="numeric" placeholder="خالی"></div>`).join("")}</div>
      <div id="thrErr" style="color:#fca5a5;min-height:20px;font-size:.88rem"></div>
      <div class="tp-row">
        <div class="tp-field"><b>مهلت ارسال توسط مدیر (روز کاری از لحظهٔ بارگذاری)</b><input class="tp-input" id="ddays" value="${s.dispatchDays}" inputmode="numeric" style="width:110px;text-align:center"></div>
        <div class="tp-field"><b>حداقل تأمین‌کننده به ازای هر قلم</b><input class="tp-input" id="minsup" value="${s.minSuppliers}" inputmode="numeric" style="width:110px;text-align:center"></div>
        <div class="tp-field"><b>ظرفیت درخواست باز هر کارشناس (بار کاری)</b><input class="tp-input" id="capacity" value="${s.capacity}" inputmode="numeric" style="width:110px;text-align:center"></div>
        <button class="tp-btn primary" data-save-alerts>ذخیره</button></div>
      <div class="tp-note">«جدول کمیسیون» روی ۱۰۰ هرگز زرد نمی‌شود و مستقیم قرمز می‌شود. برای هشدار زودتر عددی کمتر بگذارید.</div>
      <div class="tp-note">کارشناس تا وقتی هر قلم به تعداد «حداقل تأمین‌کننده» استعلامِ ثبت‌شده نداشته باشد، نمی‌تواند جدول کمیسیون بسازد.</div></div>`;
  }

  /* ---------- ارجاع هوشمند ---------- */
  function vAssign() {
    const E = S.data.experts.filter((e) => e.active), A = settings().assign;
    const pend = S.data.requests.filter((r) => unassignedOpen(r).length);
    const target = pend[0] || S.data.requests[0];
    const parties = [...new Set(S.data.requests.map((r) => r.party))];
    const opSel = (k, v) => `<select class="tp-select op" data-asg-op="${k}">${["+", "−"].map((o) => `<option ${o === v ? "selected" : ""}>${o}</option>`).join("")}</select>`;
    const shortP = (p) => p.replace(/^مرکز هزینه\s*/, "").slice(0, 26) + (p.length > 32 ? "…" : "");
    const scored = target ? E.map((e) => ({ e, s: asgScore(e, target) })).sort((a, b) => b.s - a.s) : [];
    return `<div class="tp-card tp-pane" style="max-width:none">
      <div class="tp-row" style="background:rgba(79,140,255,.08);border:1px solid var(--tp-line);border-radius:12px;padding:12px 14px">
        <button class="tp-btn primary" data-apply-asg ${pend.length ? "" : "disabled"}>اعمال پیشنهاد روی همه درخواست‌های بی‌کارشناس (${pend.length})</button>
        ${target ? `<span style="font-size:.9rem">نمونه — درخواست <b>${esc(target.id)}</b> · گروه «${esc(reqCat(target))}»: ${scored.slice(0, 3).map((x, i) => `${i + 1}. <b>${esc(x.e.label || x.e.name)}</b> (${x.s.toFixed(1)})`).join(" · ")}</span>` : ""}
        <button class="tp-btn" data-save-scores style="margin-inline-start:auto">ذخیره ضرایب و ماتریس‌ها</button></div>
      <h2>ارجاع هوشمند</h2><p class="lead">سیستم برای هر درخواست یک کارشناس پیشنهاد می‌دهد. پیشنهاد الزام‌آور نیست و مدیر می‌تواند ردش کند.</p>
      <div class="tp-formula"><span class="eq">امتیاز =</span>
        <span class="term"><input class="tp-input" data-asg="a" value="${A.a}">٪ <b>تخصص در گروه کالایی</b></span>${opSel("op1", A.op1)}
        <span class="term"><input class="tp-input" data-asg="b" value="${A.b}">٪ <b>سابقه در این پروژه</b></span>${opSel("op2", A.op2)}
        <span class="term"><input class="tp-input" data-asg="c" value="${A.c}">٪ <b>بار کاری فعلی</b></span></div>
      <div class="tp-note">«بار کاری» = درخواست‌های ارسال‌شدهٔ بازِ کارشناس تقسیم بر ظرفیت ${settings().capacity}. امتیاز ۱ تا ۵ در ماتریس‌ها را خودتان می‌دهید؛ پیش‌فرض ۳.</div>
      <div class="tp-sect"><h3>۱. ماتریس کارشناس / گروه کالایی <span>امتیاز ۱ تا ۵</span></h3><div class="tp-scroll" data-keep-scroll style="max-height:320px"><table class="tp-mx"><thead><tr><th>کارشناس</th>${CATS.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>
        ${E.map((e) => `<tr><td class="name">${esc(e.label || e.name)}</td>${CATS.map((c) => `<td><input class="tp-input" data-g="${e.id}|${esc(c)}" value="${scoreOf(e.id, "category", c)}" inputmode="numeric"></td>`).join("")}</tr>`).join("")}</tbody></table></div></div>
      <div class="tp-sect"><h3>۲. ماتریس کارشناس / پروژه <span>امتیاز ۱ تا ۵ — فقط طرف‌های موجود در میز</span></h3><div class="tp-scroll" data-keep-scroll style="max-height:320px"><table class="tp-mx"><thead><tr><th>کارشناس</th>${parties.map((p) => `<th title="${esc(p)}">${esc(shortP(p))}</th>`).join("")}</tr></thead><tbody>
        ${E.map((e) => `<tr><td class="name">${esc(e.label || e.name)}</td>${parties.map((p) => `<td><input class="tp-input" data-p="${e.id}|${esc(p)}" value="${scoreOf(e.id, "party", p)}" inputmode="numeric"></td>`).join("")}</tr>`).join("")}</tbody></table></div></div>
      <div class="tp-sect"><h3>۳. بار کاری فعلی <span>ظرفیت ${settings().capacity} درخواست باز</span></h3><div class="tp-scroll" style="max-height:320px"><table class="tp-mx"><thead><tr><th>کارشناس</th><th>درخواست باز</th><th>اشغال</th><th>ضریب اثر</th></tr></thead><tbody>
        ${E.map((e) => `<tr><td class="name">${esc(e.label || e.name)}</td><td class="num">${e.open_load || 0}</td><td><span class="bar-load"><i style="width:${Math.round(expertLoad(e) * 100)}%"></i></span> ${Math.round(expertLoad(e) * 100)}٪</td><td class="num">${(expertLoad(e) * 100 * (+A.c || 0) / 100).toFixed(1)}</td></tr>`).join("")}</tbody></table></div></div>
      ${target ? `<div class="tp-note" style="margin-top:14px"><b>محاسبه کامل نمونه</b> — درخواست ${esc(target.id)} · ${esc(target.party)}<br>${scored.map((x, i) => `${i + 1}. <b>${esc(x.e.label || x.e.name)}</b> — امتیاز ${x.s.toFixed(1)} <span class="dim">(تخصص ${scoreOf(x.e.id, "category", reqCat(target))}/۵ · پروژه ${scoreOf(x.e.id, "party", target.party)}/۵ · اشغال ${Math.round(expertLoad(x.e) * 100)}٪)</span>`).join("<br>")}</div>` : ""}</div>`;
  }

  /* ---------- مهلت هوشمند ---------- */
  function vDeadline() {
    const E = S.data.experts.filter((e) => e.active), D = settings().deadline;
    const pend = S.data.requests.filter((r) => r.assignments.some((a) => !a.dispatched_at));
    const t = pend[0] || S.data.requests[0]; const e = t && t.assignments[0] ? E.find((x) => x.id === t.assignments[0].expert_id) || E[0] : E[0];
    const parties = [...new Set(S.data.requests.map((r) => r.party))];
    const opSel = (k, v) => `<select class="tp-select op" data-dl-op="${k}">${["×", "÷", "+", "−"].map((o) => `<option ${o === v ? "selected" : ""}>${o}</option>`).join("")}</select>`;
    const shortP = (p) => p.replace(/^مرکز هزینه\s*/, "").slice(0, 30) + (p.length > 36 ? "…" : "");
    return `<div class="tp-card tp-pane" style="max-width:none">
      <div class="tp-row" style="background:rgba(79,140,255,.08);border:1px solid var(--tp-line);border-radius:12px;padding:12px 14px">
        <button class="tp-btn primary" data-apply-dl ${pend.length ? "" : "disabled"}>اعمال روی همه ارجاع‌های ارسال‌نشده (${pend.reduce((n, r) => n + r.assignments.filter((a) => !a.dispatched_at).length, 0)})</button>
        ${t && e ? `<span style="font-size:.9rem">نمونه — درخواست <b>${esc(t.id)}</b> · ${esc(e.label || e.name)} · گروه «${esc(reqCat(t))}» ⇒ <b>${smartDays(t, e)} روز کاری</b></span>` : ""}
        <button class="tp-btn" data-save-scores style="margin-inline-start:auto">ذخیره ضرایب</button></div>
      <h2>مهلت هوشمند</h2><p class="lead">پیشنهاد تعداد روز مهلت بر اساس سرعت کارشناس، پروژه و گروه کالایی. نتیجه گرد و حداقل ۱ روز می‌شود.</p>
      <div class="tp-formula"><span class="eq">مهلت (روز) =</span>
        <span class="term"><input class="tp-input" data-dl="base" value="${D.base}"> <b>پایه</b></span>${opSel("op1", D.op1)}
        <span class="term"><input class="tp-input" data-dl="we" value="${D.we}"> <b>ضریب کارشناس</b></span>${opSel("op2", D.op2)}
        <span class="term"><input class="tp-input" data-dl="wp" value="${D.wp}"> <b>ضریب پروژه</b></span>${opSel("op3", D.op3)}
        <span class="term"><input class="tp-input" data-dl="wi" value="${D.wi}"> <b>ضریب گروه کالایی</b></span></div>
      <div class="tp-sect"><h3>۱. سرعت انجام کار کارشناس <span>عدد کمتر یعنی سریع‌تر</span></h3><div class="tp-scroll" data-keep-scroll style="max-height:300px"><table class="tp-mx"><thead><tr><th>کارشناس</th><th>ضریب</th></tr></thead><tbody>
        ${E.map((x) => `<tr><td class="name">${esc(x.label || x.name)}</td><td><input class="tp-input" data-sp="${x.id}" value="${x.speed}"></td></tr>`).join("")}</tbody></table></div></div>
      <div class="tp-sect"><h3>۲. زمان موردنیاز گروه کالایی</h3><div class="tp-scroll" style="max-height:300px"><table class="tp-mx"><thead><tr><th>گروه کالایی</th><th>ضریب</th></tr></thead><tbody>
        ${CATS.map((c) => `<tr><td class="name">${c}</td><td><input class="tp-input" data-cw="${esc(c)}" value="${weightOf("category", c)}"></td></tr>`).join("")}</tbody></table></div></div>
      <div class="tp-sect"><h3>۳. زمان موردنیاز پروژه</h3><div class="tp-scroll" data-keep-scroll style="max-height:300px"><table class="tp-mx"><thead><tr><th>پروژه</th><th>ضریب</th></tr></thead><tbody>
        ${parties.map((p) => `<tr><td class="name" title="${esc(p)}">${esc(shortP(p))}</td><td><input class="tp-input" data-pw="${esc(p)}" value="${weightOf("party", p)}"></td></tr>`).join("")}</tbody></table></div></div></div>`;
  }

  /* ---------- اقلام و کدها (کد واقعی راهکاران — نیازی به کدِ ساختگی نیست) ---------- */
  function vNorm() {
    const seen = new Map();
    S.data.requests.forEach((r) => r.items.forEach((it) => { const k = it.code || it.title; if (!seen.has(k)) seen.set(k, { code: it.code, title: it.title, unit: it.unit, n: 0, cat: catOf(it.title) }); seen.get(k).n++; }));
    const list = [...seen.values()].sort((a, b) => b.n - a.n);
    return `<div class="tp-card tp-pane" style="max-width:1100px"><h2>اقلام و کدها</h2>
      <p class="lead">کد هر قلم همان «کد قلم خریدنی» راهکاران است (یک کد ⇄ یک عنوان). گروه کالایی برای ارجاع/مهلت هوشمند از روی عنوان حدس زده می‌شود و در ماتریس‌ها قابل تنظیم است.</p>
      <div class="tp-scroll" style="max-height:60vh"><table class="tp-mx"><thead><tr><th>کد قلم</th><th style="width:44%">عنوان</th><th>واحد</th><th>تکرار در میز</th><th>گروه کالایی</th></tr></thead><tbody>
        ${list.map((x) => `<tr><td class="num" style="color:var(--tp-accent);font-weight:700">${esc(x.code || "—")}</td><td class="name" style="white-space:normal">${esc(x.title)}</td><td>${esc(x.unit)}</td><td class="num">${x.n}</td><td>${esc(x.cat)}</td></tr>`).join("")}
      </tbody></table></div></div>`;
  }

  /* ---------- تصمیم‌ها و رویدادها ---------- */
  const KIND = { dispatch: "ارسال", reassign: "تغییر کارشناس", hold: "تعلیق", stop: "توقف", closed: "خاتمه", close: "خاتمه", open: "بازگشت به جریان", import: "بارگذاری فایل", commission: "جدول کمیسیون", decision_requested: "درخواست تصمیم کارشناس" };
  function vLog() {
    const D = S.decisions;
    return `<div class="tp-card tp-pane" style="max-width:1100px"><h2>تصمیم‌های در انتظار تأیید <span class="chip ${D.length ? "warn" : ""}">${D.length}</span></h2>
      ${D.length ? D.map((d) => `<div class="conf"><div style="flex:1"><b>${esc(d.expert_name)}</b> برای درخواست <b class="num">${esc(d.request_id)}</b> درخواستِ <b>${({ hold: "تعلیق", stop: "توقف", end: "خاتمه" })[d.action]}</b> داده — ${TP.fmt(d.requested_at)}</div>
        <button class="tp-btn sm primary" data-dec="approve|${d.id}">تأیید</button><button class="tp-btn sm" data-dec="reject|${d.id}">رد</button></div>`).join("")
      : `<p class="lead">تصمیمی در انتظار نیست.${settings().approvalRequired ? "" : " (تأیید مدیر برای تصمیم کارشناس غیرفعال است.)"}</p>`}
      <div class="tp-sect"><h3>رویدادهای اخیر <span>${S.events.length}</span> <button class="tp-btn xs" data-load-events style="margin-inline-start:8px">بارگیری</button></h3>
      <div class="tp-scroll" style="max-height:50vh"><table class="tp-mx"><thead><tr><th>زمان</th><th>عامل</th><th>رویداد</th><th>درخواست</th><th>جزئیات</th></tr></thead><tbody>
        ${S.events.map((e) => { let p = {}; try { p = JSON.parse(e.payload_json || "{}"); } catch (_) { /* خالی */ } return `<tr><td class="num" style="white-space:nowrap">${TP.fmt(e.at)}</td><td>${e.actor === "manager" ? "مدیر" : esc(e.actor)}</td><td>${KIND[e.kind] || esc(e.kind)}</td><td class="num">${esc(e.request_id || "")}</td><td class="dim" style="white-space:normal;text-align:right">${esc(Object.entries(p).filter(([k]) => k !== "notify").map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(" · "))}${p.notify ? ` <span class="chip mock">اعلان ${p.notify} — در انتظار اتصال</span>` : ""}</td></tr>`; }).join("")}
      </tbody></table></div></div></div>`;
  }

  /* ---------- رندر ---------- */
  function render() {
    const app = document.getElementById("app");
    if (!TP.manager.get()) { app.innerHTML = vLogin(); wire(); return; }
    app.innerHTML = vTop() + (S.error ? `<div class="tp-note warn" style="margin:10px 18px">${esc(S.error)}</div>` : "") +
      (S.loading && !S.data.requests.length ? `<div class="empty">در حال بارگیری…</div>` :
        S.tab === "desk" ? vFilters() + `<div class="tp-wrap">${vDesk()}</div>` + vFoot()
        : `<div class="tp-wrap">${S.tab === "alerts" ? vAlerts() : S.tab === "asg" ? vAssign() : S.tab === "dl" ? vDeadline() : S.tab === "norm" ? vNorm() : vLog()}</div>`);
    wire();
    TP.stickHeader(app.querySelector("table.tp-table"));
  }

  /* ---------- اتصال رویدادها ---------- */
  function wire() {
    const a = document.getElementById("app"), Q = (s) => a.querySelectorAll(s), G = (s) => a.querySelector(s);
    const lg = G("[data-login]"); if (lg) { const go = async () => { const c = G("#mcode").value.trim(); if (!c) return; TP.manager.set(c); try { await TP.api("/login", { body: { role: "manager", code: c } }); S.error = ""; await refresh(); } catch (e) { TP.manager.clear(); S.error = e.message; render(); } }; lg.onclick = go; G("#mcode").onkeydown = (e) => { if (e.key === "Enter") go(); }; return; }
    Q("[data-tab]").forEach((b) => b.onclick = () => { S.tab = b.dataset.tab; if (S.tab === "log") loadEvents(); render(); });
    const rf = G("[data-refresh]"); if (rf) rf.onclick = refresh;
    const lo = G("[data-logout]"); if (lo) lo.onclick = () => { TP.manager.clear(); render(); };
    const ap = G("[data-approval]"); if (ap) ap.onchange = async (e) => { await save({ approvalRequired: e.target.checked }); };
    const im = G("[data-import]"); if (im) im.onclick = pickAndImport;
    Q("[data-f]").forEach((s) => s.onchange = (e) => { S.filter[e.target.dataset.f] = e.target.value; if (e.target.dataset.f === "window") { S.page.offset = 0; refresh(); } else render(); });
    const wa = G("[data-win-all]"); if (wa) wa.onclick = () => { S.filter.window = "all"; S.page.offset = 0; refresh(); };
    Q("[data-page]").forEach((b) => b.onclick = () => { S.page.offset = Math.max(0, S.page.offset + (+b.dataset.page) * S.page.limit); refresh(); });
    Q("[data-lookup]").forEach((b) => b.onclick = async () => {
      try { const d = await TP.api(`/desk?id=${encodeURIComponent(b.dataset.lookup)}`);
        if (!d.requests.length) return TP.modal("پیدا نشد", `درخواست «${esc(b.dataset.lookup)}» در سامانه نیست. اگر در راهکاران هست، فایل روزانه را دوباره بارگذاری کنید.`, null, "باشد", "");
        d.requests.forEach((r) => { if (!S.data.requests.some((x) => x.id === r.id)) S.data.requests.unshift(r); }); render(); }
      catch (e) { TP.modal("خطا", esc(e.message), null, "باشد", ""); } });
    const cl = G("[data-clear]"); if (cl) cl.onclick = () => { const w = S.filter.window; S.filter = { expert: "", status: "", state: "", window: w }; S.q = { id: "", date: "", party: "", item: "" }; render(); };
    Q("[data-q]").forEach((i) => { if (i.dataset.q === "date") i.onclick = () => TP.openDatePicker(i, (v) => { S.q.date = v; render(); }); else i.oninput = (e) => { S.q[e.target.dataset.q] = e.target.value; TP.keepFocus(e.target, "q", render); }; });
    Q("[data-toggle]").forEach((b) => b.onclick = () => { S.open[b.dataset.toggle] = !S.open[b.dataset.toggle]; render(); });
    Q("select[data-assign]").forEach((s) => s.onchange = async (e) => {
      const rid = e.target.dataset.assign, aid = e.target.dataset.aid ? +e.target.dataset.aid : null, eid = +e.target.value || null;
      try { if (aid && eid) await TP.api("/reassign", { body: { assignment_id: aid, expert_id: eid } }); else await TP.api("/assign", { body: { request_id: rid, expert_id: eid } }); await refresh(); } catch (er) { TP.modal("خطا", esc(er.message), null, "باشد", ""); }
    });
    Q("input[data-days]").forEach((i) => { i.oninput = (e) => { e.target.value = e.target.value.replace(/[^0-9]/g, ""); e.target.className = "tp-input num" + (e.target.value ? "" : " unset"); };
      i.onchange = async (e) => { try { await TP.api("/assign/days", { body: { assignment_id: +e.target.dataset.days, days: +e.target.value || null } }); const r = S.data.requests.find((x) => x.assignments.some((y) => y.id === +e.target.dataset.days)); if (r) r.assignments.find((y) => y.id === +e.target.dataset.days).days = +e.target.value || null; render(); } catch (er) { TP.modal("خطا", esc(er.message), null, "باشد", ""); } }; });
    Q("[data-auto]").forEach((b) => b.onclick = () => b.dataset.auto === "asg" ? applyAssignAll() : applyDeadlineAll());
    const dp = G("[data-dispatch]"); if (dp) dp.onclick = doDispatch;
    Q("[data-act]").forEach((b) => b.onclick = () => { const [st, aid] = b.dataset.act.split("|"); doAct(st, +aid); });
    Q("[data-open]").forEach((b) => b.onclick = () => openDetail(+b.dataset.open));
    Q("[data-move]").forEach((b) => b.onclick = () => moveDialog(+b.dataset.move));
    /* اعلانات */
    Q("[data-thr]").forEach((i) => i.oninput = (e) => { e.target.value = e.target.value.replace(/[^0-9]/g, ""); const vals = [...Q("[data-thr]")].map((x) => x.value === "" ? "" : +x.value); const act = vals.filter((v) => v !== ""); const ok = act.every((v, k) => k === 0 || v > act[k - 1]) && act.every((v) => v >= 1 && v <= 100); G("#thrErr").textContent = ok ? "" : "درصدها باید صعودی و بین ۱ تا ۱۰۰ باشند."; });
    const sa = G("[data-save-alerts]"); if (sa) sa.onclick = async () => { if (G("#thrErr").textContent) return; await save({ thresholds: [...Q("[data-thr]")].map((x) => x.value === "" ? "" : +x.value), dispatchDays: +G("#ddays").value || 0, minSuppliers: Math.max(1, +G("#minsup").value || 1), capacity: Math.max(1, +G("#capacity").value || 8) }); TP.modal("ذخیره شد", "تنظیمات اعلانات به‌روز شد.", null, "باشد", ""); };
    /* ارجاع/مهلت هوشمند — تغییر محلی؛ دکمهٔ ذخیره روی سرور می‌نویسد */
    Q("[data-asg]").forEach((i) => i.oninput = (e) => { settings().assign[e.target.dataset.asg] = e.target.value.replace(/[^0-9]/g, ""); TP.keepFocus(e.target, "asg", render); });
    Q("[data-asg-op]").forEach((s) => s.onchange = (e) => { settings().assign[e.target.dataset.asgOp] = e.target.value; render(); });
    Q("[data-dl]").forEach((i) => i.oninput = (e) => { settings().deadline[e.target.dataset.dl] = e.target.value.replace(/[^0-9.]/g, ""); TP.keepFocus(e.target, "dl", render); });
    Q("[data-dl-op]").forEach((s) => s.onchange = (e) => { settings().deadline[e.target.dataset.dlOp] = e.target.value; render(); });
    const setScore = (eid, kind, key, v) => { const x = S.scores.scores.find((s) => s.expert_id === eid && s.kind === kind && s.key === key); const score = Math.max(0, Math.min(5, +String(v).replace(/[^0-9]/g, "") || 0)); if (x) x.score = score; else S.scores.scores.push({ expert_id: eid, kind, key, score }); };
    const setW = (kind, key, v) => { const x = S.scores.weights.find((s) => s.kind === kind && s.key === key); const w = +v || 1; if (x) x.w = w; else S.scores.weights.push({ kind, key, w }); };
    Q("[data-g]").forEach((i) => i.oninput = (e) => { const [eid, c] = e.target.dataset.g.split("|"); setScore(+eid, "category", c, e.target.value); TP.keepFocus(e.target, "g", render); });
    Q("[data-p]").forEach((i) => i.oninput = (e) => { const [eid, p] = e.target.dataset.p.split("|"); setScore(+eid, "party", p, e.target.value); TP.keepFocus(e.target, "p", render); });
    Q("[data-sp]").forEach((i) => i.onchange = async (e) => { const ex = S.data.experts.find((x) => x.id === +e.target.dataset.sp); ex.speed = +e.target.value || 1; await TP.api(`/experts/${ex.id}`, { method: "PUT", body: { speed: ex.speed } }); render(); });
    Q("[data-cw]").forEach((i) => i.oninput = (e) => { setW("category", e.target.dataset.cw, e.target.value); TP.keepFocus(e.target, "cw", render); });
    Q("[data-pw]").forEach((i) => i.oninput = (e) => { setW("party", e.target.dataset.pw, e.target.value); TP.keepFocus(e.target, "pw", render); });
    Q("[data-save-scores]").forEach((b) => b.onclick = async () => { await Promise.all([save({ assign: settings().assign, deadline: settings().deadline }), TP.api("/scores", { method: "PUT", body: S.scores })]); TP.modal("ذخیره شد", "ضرایب و ماتریس‌ها ذخیره شدند.", null, "باشد", ""); });
    const aa = G("[data-apply-asg]"); if (aa) aa.onclick = applyAssignAll;
    const ad = G("[data-apply-dl]"); if (ad) ad.onclick = applyDeadlineAll;
    Q("[data-dec]").forEach((b) => b.onclick = async () => { const [what, id] = b.dataset.dec.split("|"); await TP.api(`/decisions/${id}/${what}`, { body: {} }); await refresh(); });
    const le = G("[data-load-events]"); if (le) le.onclick = loadEvents;
  }

  async function save(patch) { try { S.data.settings = await TP.api("/settings", { method: "PUT", body: patch }); render(); } catch (e) { TP.modal("خطا در ذخیره", esc(e.message), null, "باشد", ""); } }
  async function loadEvents() { try { S.events = (await TP.api("/events")).events || []; render(); } catch (e) { S.error = e.message; render(); } }

  /* ---------- اقدام‌های گروهی ---------- */
  async function applyAssignAll() {
    const E = S.data.experts.filter((e) => e.active), pend = S.data.requests.filter((r) => unassignedOpen(r).length);
    if (!pend.length) return TP.modal("ارجاع هوشمند", "درخواستِ بی‌کارشناسی نیست.", null, "باشد", "");
    const b = TP.busy("اعمال ارجاع هوشمند…", `${pend.length} درخواست`); let n = 0;
    for (const r of pend) { const best = E.map((e) => ({ e, s: asgScore(e, r) })).sort((x, y) => y.s - x.s)[0]; if (best) { await TP.api("/assign", { body: { request_id: r.id, expert_id: best.e.id } }); n++; b.set(`${n} از ${pend.length}`); } }
    b.close(); await refresh(); S.tab = "desk"; render();
    TP.modal("ارجاع هوشمند اعمال شد", `برای ${n} درخواست کارشناس پیشنهادی گذاشته شد. هرکدام را می‌توانید دستی عوض کنید.`, null, "باشد", "");
  }
  async function applyDeadlineAll() {
    const list = S.data.requests.flatMap((r) => r.assignments.filter((a) => !a.dispatched_at).map((a) => ({ r, a })));
    if (!list.length) return TP.modal("مهلت هوشمند", "ارجاع ارسال‌نشده‌ای نیست.", null, "باشد", "");
    const b = TP.busy("اعمال مهلت هوشمند…", `${list.length} ارجاع`); let n = 0;
    for (const { r, a } of list) { const e = S.data.experts.find((x) => x.id === a.expert_id); if (!e) continue; await TP.api("/assign/days", { body: { assignment_id: a.id, days: smartDays(r, e) } }); n++; b.set(`${n} از ${list.length}`); }
    b.close(); await refresh(); S.tab = "desk"; render();
    TP.modal("مهلت هوشمند اعمال شد", `برای ${n} ارجاع ارسال‌نشده مهلت پیشنهادی گذاشته شد.`, null, "باشد", "");
  }
  function doDispatch() {
    const list = readyAssignments(); const by = {};
    list.forEach((a) => by[a.expert_label || a.expert_name] = (by[a.expert_label || a.expert_name] || 0) + 1);
    TP.modal(`ارسال ${list.length} ارجاع`, `ساعت‌شمار مهلت شروع می‌شود و برای این کارشناسان اعلان می‌رود:<br><br>${Object.entries(by).map(([e, c]) => `${esc(e)} — ${c} درخواست`).join("<br>")}<br><br><span class="chip mock">اعلان تلگرام — در انتظار اتصال</span>`,
      async () => { try { await TP.api("/dispatch", { body: { assignment_ids: list.map((a) => a.id) } }); await refresh(); } catch (e) { TP.modal("خطا", esc(e.message), null, "باشد", ""); } }, "تأیید و ارسال");
  }
  const ACT = {
    hold: ["تعلیق", "<b>تعلیق موقت است.</b> پایش و اعلان متوقف می‌شود و درخواست از کارتابل خارج می‌شود، ولی هر زمان با «بازگشت» دوباره در جریان می‌افتد."],
    stop: ["توقف", "<b>توقف نهایی است.</b> اقلام کنسل می‌شوند و از کارتابل خارج می‌شوند. برای ادامه باید در راهکاران دوباره فعال شوند."],
    closed: ["خاتمه", "اقلام خاتمه‌یافته تلقی می‌شوند و از کارتابل خارج می‌شوند."],
    open: ["بازگشت به جریان", "اقلام از تعلیق خارج و دوباره وارد کارتابل کارشناس می‌شوند. پایش از سر گرفته می‌شود."],
  };
  function doAct(st, aid) {
    const r = S.data.requests.find((x) => x.assignments.some((a) => a.id === aid)); const a = r && r.assignments.find((x) => x.id === aid); if (!a) return;
    TP.modal(`${ACT[st][0]} — درخواست ${esc(r.id)}`, `<b>${esc(r.party)}</b> · کارشناس ${esc(a.expert_label || a.expert_name)}<br><br>${ACT[st][1]}<br><br><span class="chip mock">اعلان تلگرام به کارشناس — در انتظار اتصال</span>`,
      async () => { try { await TP.api("/items/state", { body: { assignment_id: aid, request_id: r.id, state: st } }); await refresh(); } catch (e) { TP.modal("خطا", esc(e.message), null, "باشد", ""); } }, `تأیید ${ACT[st][0]}`);
  }
  function moveDialog(aid) {
    const r = S.data.requests.find((x) => x.assignments.some((a) => a.id === aid)); const a = r.assignments.find((x) => x.id === aid);
    const E = S.data.experts.filter((e) => e.active && e.id !== a.expert_id);
    const d = TP.modal(`تغییر کارشناس — درخواست ${esc(r.id)}`, `کارشناس فعلی: <b>${esc(a.expert_label || a.expert_name)}</b><br><br>
      <select class="tp-select" id="mv-exp" style="width:100%"><option value="">— کارشناس جدید —</option>${E.map((e) => `<option value="${e.id}">${esc(e.label || e.name)}</option>`).join("")}</select>
      <div class="tp-field" style="margin-top:10px"><b>مهلت جدید (روز کاری)</b><input class="tp-input" id="mv-days" value="${a.days || ""}" inputmode="numeric" style="width:110px;text-align:center"></div>
      <p class="dim" style="margin-top:10px;font-size:.85rem">اقلام، استعلام‌ها و پیش‌فاکتورها منتقل می‌شوند، ساعت‌شمار از نو شروع می‌شود و به هر دو کارشناس اعلان می‌رود.</p>`,
      /* مودال پیش از اجرای onYes از DOM جدا می‌شود؛ مقدارها را از خودِ عنصر مودال می‌خوانیم، نه document */
      async () => { const eid = +d.querySelector("#mv-exp").value, days = +d.querySelector("#mv-days").value; if (!eid) return; try { await TP.api("/reassign", { body: { assignment_id: aid, expert_id: eid, days } }); await refresh(); } catch (e) { TP.modal("خطا", esc(e.message), null, "باشد", ""); } }, "تغییر ارجاع");
    d.querySelector("#mv-exp").focus();
  }
  async function openDetail(aid) {
    try {
      const d = await TP.api(`/assignments/${aid}`); const a = d.assignment, its = d.items;
      const b = TP.budget(a.dispatched_at || S.now, a.days || 1), el = a.dispatched_at ? TP.wh(a.dispatched_at, S.now) : 0;
      TP.modal(`پنل کارشناس (فقط‌خواندنی) — درخواست ${esc(a.request_id)}`,
        `<div class="kpi"><div class="k"><b>کارشناس</b><span style="font-size:.95rem">${esc(a.expert_label || a.expert_name)}</span></div><div class="k"><b>مهلت</b><span>${a.days || "—"} روز</span></div><div class="k"><b>سپری‌شده</b><span>${a.dispatched_at ? Math.min(100, Math.round(el / (b || 1) * 100)) : 0}٪</span></div><div class="k"><b>استعلام ثبت‌شده</b><span>${d.quotes.filter((q) => q.saved).length}</span></div><div class="k"><b>پیش‌فاکتور</b><span>${d.proformas.length}</span></div></div>
        <table class="tp-mx" style="margin-top:12px"><thead><tr><th>قلم</th><th>مقدار</th><th>سوابق</th><th>جستجو</th><th>استعلام</th><th>کمیسیون</th><th>وضعیت</th></tr></thead><tbody>
        ${its.map((i) => `<tr><td class="name" style="white-space:normal">${esc(i.title)}</td><td class="num">${i.qty == null ? "" : M(i.qty)} ${esc(i.unit)}</td><td>${i.hist_done_at ? "✓" : "—"}</td><td>${i.smart_done_at ? "✓" : "—"}</td><td class="num">${d.quotes.filter((q) => q.item_id === i.id && q.saved).length}</td><td>${i.commission_ok ? "✓" : "—"}</td><td><span class="st ${TP.STATES[i.state].cls}">${TP.STATES[i.state].label}</span></td></tr>`).join("")}</tbody></table>
        ${d.quotes.length ? `<div class="tp-sect"><h3>استعلام‌ها</h3><table class="tp-mx"><thead><tr><th>تأمین‌کننده</th><th>قیمت واحد</th><th>تحویل</th><th>تسویه</th><th>ثبت</th><th>نهایی</th></tr></thead><tbody>${d.quotes.map((q) => `<tr><td class="name">${esc(q.supplier_name)}</td><td class="num">${q.price == null ? "—" : M(q.price)}</td><td class="num">${esc(q.dtime || "—")}</td><td>${esc(q.pay || "—")}</td><td>${q.saved ? "✓" : "—"}</td><td>${q.final ? "✓" : "—"}</td></tr>`).join("")}</tbody></table></div>` : ""}`,
        null, "باشد", "");
    } catch (e) { TP.modal("خطا", esc(e.message), null, "باشد", ""); }
  }

  /* ---------- بارگذاری اکسل: خواندن در مرورگر → ارسال دسته‌ای → تعارض‌ها → اعمال ---------- */
  function pickAndImport() {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".xlsx";
    inp.onchange = async () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      const busy = TP.busy("در حال خواندن فایل…", `${esc(f.name)} — ${(f.size / 1024 / 1024).toFixed(1)} مگابایت`);
      try {
        const parsed = await TP.importExcel(f, (t) => busy.set(esc(t)));
        const st = parsed.stats;
        const payload = TP.importPayload(parsed);
        busy.set(`ارسال ${payload.open.length} درخواست باز به سامانه…`);
        const { import_id } = await TP.api("/import/begin", { body: { filename: f.name, stats: st } });
        const chunks = TP.chunkRequests(payload.open, 600); let k = 0, newR = 0;
        for (const c of chunks) { const r = await TP.api("/import/chunk", { body: { import_id, requests: c } }); newR += r.newRequests || 0; k++; busy.set(`ارسال دستهٔ ${k} از ${chunks.length}…`); }
        busy.set("بررسی تعارض با وضعیت فعلی سامانه…");
        const fin = await TP.api("/import/finish", { body: { import_id, closedIds: payload.closedIds } });
        busy.close();
        S.filter = { expert: "", status: "", state: "", window: "3d" }; S.q = { id: "", date: "", party: "", item: "" }; S.page.offset = 0; S.tab = "desk";
        await refresh();
        const unknown = Object.entries(st.unknownStatuses || {});
        const summary = `<b>${M(st.requests)}</b> درخواست · <b>${M(st.itemRows)}</b> سطر قلم · <b>${st.parties}</b> طرف مقابل · بازه ${esc(st.dateMin)} تا ${esc(st.dateMax)}<br>
          <b>${M(st.openRequests)}</b> درخواست با قلم باز به سامانه فرستاده شد (${M(newR)} تازه) · <b>${M(st.closedRequests)}</b> درخواست کاملاً بسته/متوقف فقط برای همگام‌سازی.<br>
          <b>${M(st.unassignedOpen)}</b> درخواست باز بدون کارشناس · تعارض کارشناس: ${st.expertConflictAuto} مورد خودکار حل شد، <b>${st.expertConflictDecision}</b> مورد دو نام متفاوت (⚠).<br>
          ${st.statusMixed} درخواست وضعیت مختلط دارند (وضعیت روی قلم نگه داشته می‌شود). بزرگ‌ترین درخواست: ${st.maxItems} قلم.
          ${unknown.length ? `<br><span style="color:#fcd34d">وضعیت ناشناخته در فایل: ${unknown.map(([k, v]) => `«${esc(k)}» ×${v}`).join("، ")} — باز فرض شد.</span>` : ""}
          ${st.badQty ? `<br><span style="color:#fcd34d">${st.badQty} سطر مقدار غیرعددی داشت.</span>` : ""}
          <br><br>${visible().length === 0 ? '<span style="color:#fca5a5">در بازه «امروز و دو روز گذشته» درخواستی نیست — بازه را روی «همه تاریخ‌ها» بگذارید.</span>' : `<b>${visible().length}</b> درخواست در بازهٔ فعلی.`}`;
        const nConf = fin.closeCandidates.length + fin.stateDrift.length + fin.expertDrift.length;
        if (!nConf) return TP.modal("فایل بارگذاری شد", summary, null, "باشد", "");
        showConflicts(summary, fin);
      } catch (e) { busy.close(); TP.modal("خطا در بارگذاری", esc(e.message).replace(/\n/g, "<br>"), null, "باشد", ""); }
    };
    inp.click();
  }
  function showConflicts(summary, fin) {
    const rows = [
      ...fin.closeCandidates.map((c) => ({ key: `close|${c.request_id}`, html: `<b>درخواست ${esc(c.request_id)}</b> — در راهکاران کاملاً بسته/متوقف شده ولی در سامانه <b>${c.n}</b> قلم باز دارد${c.expert ? ` (کارشناس ${esc(c.expert)})` : ""}<br><span class="old">سامانه: باز</span> ← <span class="new">فایل جدید: بسته</span><br><span class="dim" style="font-size:.8rem">با اعمال، پایش و اعلان متوقف و از کارتابل خارج می‌شود.</span>` })),
      ...fin.stateDrift.map((d) => ({ key: `item|${d.id}|${TP.SRC2STATE[d.src_status] || "open"}`, html: `<b>درخواست ${esc(d.request_id)}</b> · ${esc(d.title)}${d.expert ? ` (${esc(d.expert)})` : ""}<br><span class="old">سامانه: ${TP.STATES[d.state].label}</span> ← <span class="new">فایل جدید: ${esc(d.src_status)}</span>` })),
      ...fin.expertDrift.map((d) => ({ key: `noop|${d.id}`, html: `<b>درخواست ${esc(d.request_id)}</b> · ${esc(d.title)}<br><span class="old">کارشناس سامانه: ${esc(d.expert)}</span> ← <span class="new">کارشناس فایل: ${esc(d.src_expert)}</span><br><span class="dim" style="font-size:.8rem">تغییر کارشناس از ستون «تغییر» انجام می‌شود؛ اینجا فقط اطلاع است.</span>`, info: true })),
    ];
    const d = TP.modal("بارگذاری فایل درخواست‌های روزانه", `${summary}<br><br><b style="color:#fca5a5">${rows.filter((r) => !r.info).length} تعارض با وضعیت فعلی سامانه:</b><br><br>
      ${rows.map((r, i) => `<div class="conf">${r.info ? "" : `<input type="checkbox" data-c="${i}" checked>`}<div>${r.html}</div></div>`).join("")}
      <div class="dim" style="font-size:.88rem">ملاک همیشه فایل جدید است، ولی اعمال با تأیید شماست. مواردی که تیک ندارند دست‌نخورده می‌مانند.</div>`,
      async () => {
        const chosen = [...d.querySelectorAll("[data-c]:checked")].map((c) => rows[+c.dataset.c].key);
        const body = { closeRequests: chosen.filter((k) => k.startsWith("close|")).map((k) => k.split("|")[1]), items: chosen.filter((k) => k.startsWith("item|")).map((k) => { const [, id, state] = k.split("|"); return { id: +id, state }; }) };
        try { await TP.api("/import/apply", { body }); await refresh(); } catch (e) { TP.modal("خطا", esc(e.message), null, "باشد", ""); }
      }, "اعمال موارد تیک‌دار", "بدون اعمال");
  }

  /* ---------- شروع ---------- */
  if (TP.manager.get()) refresh(); else render();
  setInterval(() => { if (S.tab === "desk" && TP.manager.get()) { S.now = Date.now(); render(); } }, 60000);
})();
