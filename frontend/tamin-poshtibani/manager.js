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
    decisions: [], events: [], hist: null,
    /* فیلتر کارشناس و وضعیت چندانتخابی‌اند (تصمیم مدیر). وضعیت پیش‌فرض: هرچه بسته/متوقف نیست. */
    filter: { experts: [], expertText: "", statuses: null, state: "", window: CFG.defaults.window || "3d" },
    pop: null,                                   // فیلتر بازشده: "expert" | "status"
    editName: null,                              // کارشناسی که نامش در تب کارشناسان در حال ویرایش است
    q: { id: "", date: "", party: "", item: "" },
    page: { limit: 300, offset: 0, total: 0 },   // صفحه‌بندی سمت سرور برای بازه‌های بزرگ
    open: {},            // کشوی اقلام هر درخواست
    fOpen: false, fAnim: null,                   // کادرِ «فیلتر» میز و حرکتِ بازشدنش
    exQ: "", exPick: null, exPickQ: "", exLand: null,   // تخته‌ی کارشناسان: جستجو، انتخابگرِ عضو، تراشهٔ تازه‌نشسته
    smEx: null, smKind: "guild", dlTab: "speed", dlMore: false,   // ارجاع و مهلت هوشمند
    nm: { q: "", g: "*", sort: "n", limit: 120 },                 // اقلام و کدها
    evCat: "",                                                     // دستهٔ رویدادها
    loading: false, error: "",
  };
  const settings = () => S.data.settings || CFG.defaults;
  /* بازهٔ میز → تاریخ شروع (شمسی) که سرور با آن فیلتر می‌کند؛ «همه» = بدون فیلتر */
  const WINDOWS = [["3d", "امروز و دو روز گذشته", 2], ["7d", "هفتهٔ اخیر", 6], ["30d", "ماه اخیر", 29], ["all", "همه تاریخ‌ها", null]];
  const fromDate = () => { const w = WINDOWS.find((x) => x[0] === S.filter.window); return w && w[2] != null ? TP.fmtD(S.now - w[2] * DAY) : ""; };

  /* ---------- محورهای ارجاع و مهلت هوشمند: گروه اصناف و پروژه ----------
     هر دو از بک‌اند می‌آیند و ثابت‌اند — گروه هر قلم از فهرست اصناف (کد قلم → طبقه → گروه،
     worker/catalog.js:guildsOfItems) و پروژهٔ هر درخواست از کلیدواژه‌های پروژهٔ گزارش
     (worker/reports.js:projectOf). پس ماتریس‌ها یک بار پر می‌شوند و با هر بارگذاری روزانه
     ستون تازه‌ای پیدا نمی‌کنند؛ پنل هم دیگر گروه را از روی عنوان حدس نمی‌زند. */
  let AX = null, AX_LOADING = false, AX_ERR = null;
  function needAxes() {
    if (AX || AX_LOADING || AX_ERR) return;
    AX_LOADING = true;
    TP.api("/axes").then((r) => { AX = r; }).catch((e) => { AX_ERR = e.message; })
      .finally(() => { AX_LOADING = false; render(); });
  }
  const GROUPS = () => (AX && AX.groups) || [];
  const PROJECTS = () => (AX && AX.projects) || [];
  const groupName = (code) => { const g = GROUPS().find((x) => x.code === code); return g ? g.name : "متفرقه"; };
  const PL = () => TP.plan;                                    /* assign-rules.mjs */
  const Wt = () => PL().tables(S.scores.scores, S.scores.weights);
  const guildsOf = (its) => its.map((i) => i.g || PL().MISC_GUILD);
  const projOf = (r) => r.project || PL().NO_PROJECT;
  /* پروژه‌های ماتریس: همهٔ پروژه‌های گزارش، به‌علاوهٔ «بدون پروژه» اگر درخواستی بی‌پروژه روی میز است */
  const projectKeys = () => {
    const L = PROJECTS().map((p) => p.name);
    if (S.data.requests.some((r) => !r.project) || !L.length) L.push(PL().NO_PROJECT);
    return L;
  };

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

  const scoreOf = (eid, kind, key) => { const s = S.scores.scores.find((x) => x.expert_id === eid && x.kind === kind && x.key === key); return s ? s.score : 3; };
  const weightOf = (kind, key) => { const w = S.scores.weights.find((x) => x.kind === kind && x.key === key); return w ? w.w : 1; };
  /* ---------- ارجاع و مهلت هوشمند: توزیع متوازن با فرض تأیید مدیر ----------
     حساب‌ها در assign-rules.mjs اند (تا بی‌مرورگر آزموده شوند) و این‌جا فقط داده‌شان
     ساخته می‌شود: «زحمت» هر ارجاع = ضریب پروژه × (۱ واحد سربار + جمعِ ضریب گروه اصناف
     اقلامش)؛ ظرفیت هر کارشناس از تنظیمات و ضریب سرعت او؛ و دو سقفِ سختِ بار باز
     (درخواست و قلم) که امتیاز ۵ هم از آن‌ها رد نمی‌شود. بار فعلی = همهٔ ارجاع‌های باز،
     ارسال‌شده و ارسال‌نشده، چون فرض این است که مدیر همهٔ پیشنهادها را تأیید می‌کند. */
  const activeExperts = () => S.data.experts.filter((e) => e.active);
  const asgOpts = () => ({ ...settings().assign, capacity: settings().capacity });
  let WL = null, WL_LOADING = false, WL_ERR = null;          /* پاسخ /workload */
  function needWorkload() {
    if (WL || WL_LOADING || WL_ERR) return;
    WL_LOADING = true;
    TP.api("/workload").then((r) => { WL = r; }).catch((e) => { WL_ERR = e.message; })
      .finally(() => { WL_LOADING = false; render(); });
  }
  async function loadWorkload() { WL = await TP.api("/workload"); WL_ERR = null; return WL; }
  const baseLoads = (E, W2) => PL().buildLoads(E, (WL && WL.assignments) || [], W2 || Wt());
  /** درخواست‌های بی‌کارشناس → کارهای ورودیِ چیدمان */
  const jobsOf = (pend) => pend.map((r) => { const its = unassignedOpen(r); return { id: r.id, r, project: projOf(r), guilds: guildsOf(its), items: its.length }; });
  function planAssign(pend) {
    const W2 = Wt(), E = activeExperts();
    return PL().planAssign({ jobs: jobsOf(pend), experts: E, load: baseLoads(E, W2), W: W2, A: asgOpts() });
  }
  /* list: ارجاع‌های ارسال‌نشده؛ اشغال هر کارشناس از همهٔ ارجاع‌های بازش (با فرض تأیید همه) */
  function planDeadlines(list) {
    const W2 = Wt(), E = activeExperts();
    const rows = list.map(({ r, a }) => ({ r, a, expert_id: a.expert_id, project: projOf(r),
      guilds: guildsOf(itemsOf(r, a).filter((i) => i.state === "open" || i.state === "hold")) }));
    return PL().planDeadlines({ list: rows, experts: S.data.experts, load: baseLoads(E, W2), W: W2, D: settings().deadline, capacity: settings().capacity })
      .map((x) => ({ ...x, e: x.expert }));
  }

  /* ---------- فیلتر (بازه و صفحه سمت سرور؛ جستجوی ستونی سمت کلاینت روی همان صفحه) ---------- */
  const dateList = () => String(S.q.date || "").split("،").map((s) => s.trim()).filter(Boolean);
  /* وضعیتِ مؤثر هر قلم: وضعیت سامانه اگر از «باز» بیرون رفته (بسته/متوقف/معلق)، «در جریان» اگر
     ارسال شده، وگرنه وضعیت خامِ فایل (ثبت شده / تایید شده / …). فیلتر وضعیت روی همین است. */
  const STATUS_ALL = ["ثبت شده", "تایید شده", "در جریان", "بررسی مجدد", "معلق", "متوقف شده", "بسته شده"];
  const STATUS_DEFAULT = ["ثبت شده", "تایید شده", "در جریان", "بررسی مجدد", "معلق"];
  const statusOf = (r, i) => {
    if (i.state === "closed") return "بسته شده";
    if (i.state === "stop") return "متوقف شده";
    if (i.state === "hold") return "معلق";
    const a = r.assignments.find((x) => x.id === i.assignment_id);
    if (a && a.dispatched_at) return "در جریان";
    return i.src_status || "ثبت شده";
  };
  const statusSel = () => (S.filter.statuses || STATUS_DEFAULT);
  const needsAllScope = () => statusSel().some((s) => s === "بسته شده" || s === "متوقف شده");
  /* نام‌های کارشناس‌ها، ارشدها اول — همان ترتیبِ فهرست انتخاب کارشناس */
  const expertsSorted = () => [...S.data.experts.filter((e) => e.active)].sort((a, b) => (b.senior || 0) - (a.senior || 0) || String(a.label || a.name).localeCompare(String(b.label || b.name), "fa"));
  const expertOpts = (sel) => expertsSorted().map((e) => `<option value="${e.id}" ${e.id === sel ? "selected" : ""}>${e.senior ? "★ " : ""}${esc(e.label || e.name)}</option>`).join("");
  function visible() {
    return S.data.requests.filter((r) => {
      if (!TP.hit(r.id, S.q.id)) return false;
      const L = dateList(); if (L.length && !L.includes(r.date)) return false;
      /* کادر «پروژه یا طرف مقابل»: هر دو (کارت پروژه را نشان می‌دهد) */
      if (S.q.party && !TP.hit(r.party, S.q.party) && !TP.hit(r.project || "", S.q.party)) return false;
      if (S.q.item && !r.items.some((i) => TP.hit(i.title, S.q.item) || TP.hit(i.code, S.q.item))) return false;
      /* کارشناس: تیک‌ها یا متنِ نوشته‌شده (هرکدام که هست) */
      if (S.filter.experts.length && !r.assignments.some((a) => S.filter.experts.includes(a.expert_id))) return false;
      if (S.filter.expertText && !r.assignments.some((a) => TP.hit(a.expert_label || a.expert_name, S.filter.expertText) || TP.hit(a.expert_name, S.filter.expertText))) return false;
      const sel = statusSel();
      if (sel.length < STATUS_ALL.length && !r.items.some((i) => sel.includes(statusOf(r, i)))) return false;
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
    S.loading = true; S.error = ""; WL = null; WL_ERR = null;
    if (!S.data.requests.length) render();   /* بازخوانیِ پس‌زمینه جدول را چشمک نمی‌زند */
    try {
      S.now = Date.now();
      /* بسته‌ها و متوقف‌ها از سرور فقط وقتی می‌آیند که فیلتر وضعیت آن‌ها را خواسته باشد */
      /* with=all: امتیازها و تصمیم‌های در انتظار در همان پاسخ میز — یک درخواست به‌جای سه (سرعت) */
      const qs = `?from=${encodeURIComponent(fromDate())}&limit=${S.page.limit}&offset=${S.page.offset}${needsAllScope() ? "&scope=all" : ""}&with=all`;
      const d = await TP.api("/desk" + qs);
      S.data = d; S.scores = d.scores || { scores: [], weights: [] }; S.decisions = d.decisions || [];
      S.page.total = d.total || d.requests.length;
    } catch (e) {
      if (e.status === 401 || e.status === 503) { TP.manager.clear(); S.error = e.message; }
      else S.error = e.message;
    }
    S.loading = false; render();
  }

  /* ---------- ورود مدیر ---------- */
  /* کارتِ ورود با خانه‌های کد (ui.js، مهر ۱۴۰۵) */
  function vLogin() {
    return TP.ui.login({ title: "ورود مدیر تدارکات", sub: "کد مدیر را رقم‌به‌رقم بنویسید", len: 4, max: 4, secret: true, error: S.error, back: { href: "index.html" }, company: CFG.company });
  }

  /* ---------- سرآیند و بخش‌ها ----------
     نُه تب در یک کپسول: چهار تبِ پرکاربرد مستقیم، سه تبِ تنظیمات زیرِ «تنظیمات ▾» و دو تبِ داده زیرِ «داده‌ها ▾» (مهر ۱۴۰۵) */
  const TAB_FA = { desk: "میز ارجاع", experts: "کارشناسان", alerts: "تنظیم اعلانات", asg: "ارجاع هوشمند", dl: "مهلت هوشمند", norm: "اقلام و کدها", hist: "سوابق تأمین", reports: "گزارش‌ها", log: "تصمیم‌ها و رویدادها" };
  function vTop() {
    const R = S.data.requests, items = R.reduce((a, r) => a + r.items.length, 0);
    const sub = `${S.page.total > R.length ? `${M(S.page.total)} درخواست در بازه · ${R.length} بارگذاری‌شده` : `${R.length} درخواست`} · ${M(items)} قلم · ${esc(CFG.company)}`;
    const chev = TP.ui.ICON.chevron.replace("<svg", '<svg style="width:14px;height:14px;opacity:.7"');
    const tab = (k) => `<button class="${S.tab === k ? "on" : ""}" data-tab="${k}" role="tab" aria-selected="${S.tab === k ? "true" : "false"}">${TAB_FA[k]}${k === "log" && S.decisions.length ? `<span class="cnt">${S.decisions.length}</span>` : ""}</button>`;
    const grp = (label, icon, keys) => TP.ui.menu({ cls: keys.includes(S.tab) ? "on start" : "start", btn: `<button type="button" data-menu-toggle aria-haspopup="menu" aria-expanded="false">${keys.includes(S.tab) ? TAB_FA[S.tab] : label}${chev}</button>`,
      items: keys.map((k) => ({ label: TAB_FA[k], icon, attrs: `data-tab="${k}"` })) });
    return TP.ui.topbar({ title: "میز ارجاع خرید", sub, actions: `<button class="tp-btn primary" data-import>${TP.ui.ICON.upload}بارگذاری درخواست‌های روزانه</button>`,
      user: { name: "مدیر تدارکات", sub: esc(CFG.company), initial: "م" },
      items: [{ label: "به‌روزرسانی", icon: "refresh", attrs: "data-refresh" }, { label: "تدارکات", icon: "home", href: "index.html" }, "-", { label: "خروج", icon: "logout", attrs: "data-logout", cls: "danger" }] })
      + `<div class="tp-subbar"><div class="tp-seg" role="tablist">${tab("desk")}${tab("experts")}${grp("تنظیمات", "settings", ["alerts", "asg", "dl"])}${grp("داده‌ها", "data", ["norm", "hist"])}${tab("reports")}${tab("log")}</div>
      <span class="spacer"></span>
      <label class="chip ${settings().approvalRequired ? "warn" : ""}" style="display:inline-flex;gap:6px;align-items:center;cursor:pointer;padding:4px 12px" title="توقف / تعلیق / خاتمه توسط کارشناس منوط به تأیید من باشد"><input type="checkbox" data-approval ${settings().approvalRequired ? "checked" : ""}> تصمیم کارشناس با تأیید من</label>
      ${TP.ui.info(`manager.${S.tab}`, "راهنمای این بخش")}</div>`;
  }

  /* ---------- میز ارجاع ---------- */
  /* فیلتر چندانتخابیِ کارشناس (تیک + متن) و وضعیت (تیک) — کادر بازشونده زیر دکمه */
  function vPop(kind) {
    if (S.pop !== kind) return "";
    if (kind === "expert") {
      const E = expertsSorted().filter((e) => TP.hit(e.label || e.name, S.filter.expertText) || TP.hit(e.name, S.filter.expertText));
      return `<div class="fpop" data-pop><input class="tp-input" data-ftext placeholder="نام کارشناس را بنویسید…" value="${esc(S.filter.expertText)}" style="width:100%;margin-bottom:6px">
        <div class="fpop-list">${E.map((e) => `<label><input type="checkbox" data-fexp="${e.id}" ${S.filter.experts.includes(e.id) ? "checked" : ""}> ${e.senior ? "★ " : ""}${esc(e.label || e.name)}</label>`).join("") || `<span class="dim">کارشناسی با این نام نیست.</span>`}</div>
        <div class="tp-acts" style="margin-top:8px"><button class="tp-btn xs" data-fclear="expert">پاک کردن</button><button class="tp-btn xs primary" data-fclose>بستن</button></div></div>`;
    }
    const sel = statusSel();
    return `<div class="fpop" data-pop><div class="fpop-list">${STATUS_ALL.map((s) => `<label><input type="checkbox" data-fst="${esc(s)}" ${sel.includes(s) ? "checked" : ""}> <span class="st ${TP.SRC_CLS[s] || (s === "در جریان" ? "st-run" : "st-reg")}">${esc(s)}</span></label>`).join("")}</div>
      <div class="tp-acts" style="margin-top:8px"><button class="tp-btn xs" data-fclear="status">پیش‌فرض</button><button class="tp-btn xs" data-fall>همه</button><button class="tp-btn xs primary" data-fclose>بستن</button></div></div>`;
  }
  /* ---------- نوارِ میز (مهر ۱۴۰۵): دکمهٔ «فیلتر» که کادرِ فیلترها را با حرکت باز و بسته می‌کند ----------
     همهٔ فیلترها داخلِ کادرند و همان لحظه اعمال می‌شوند؛ «تأیید» کادر را می‌بندد. حرکت فقط هنگامِ باز و بسته شدن است. */
  const FUNNEL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 5h17l-6.6 7.6v5.6l-3.8 1.9v-7.5z"/></svg>`;
  const STAGE_F = { pending: "ارسال‌نشده", ready: "آماده ارسال", sent: "ارسال‌شده", closed: "بسته/متوقف" };
  const statusDefault = () => { const sel = statusSel(); return sel.length === STATUS_DEFAULT.length && STATUS_DEFAULT.every((s) => sel.includes(s)); };
  /** فیلترهای فعال برای چیپ‌های کنارِ دکمه: [برچسب، مقدار، کلید برای برداشتن] */
  function activeFilters() {
    const L = [];
    [["id", "شماره"], ["date", "تاریخ"], ["party", "پروژه"], ["item", "قلم"]].forEach(([k, l]) => { if (String(S.q[k] || "").trim()) L.push([l, S.q[k], `q:${k}`]); });
    const nE = S.filter.experts.length;
    if (nE || S.filter.expertText) L.push(["کارشناس", nE ? `${M(nE)} نفر` : `«${S.filter.expertText}»`, "expert"]);
    if (!statusDefault()) L.push(["وضعیت", statusSel().length === STATUS_ALL.length ? "همه" : `${M(statusSel().length)} مورد`, "status"]);
    if (S.filter.state) L.push(["مرحله", STAGE_F[S.filter.state] || S.filter.state, "state"]);
    return L;
  }
  function vFilterPanel() {
    const nE = S.filter.experts.length, txt = S.filter.expertText;
    const expLabel = nE || txt ? `${nE ? `${M(nE)} کارشناس` : ""}${nE && txt ? " · " : ""}${txt ? `«${esc(txt)}»` : ""}` : "همه";
    const sel = statusSel(), stLabel = sel.length === STATUS_ALL.length ? "همه" : statusDefault() ? "بازها (پیش‌فرض)" : sel.join("، ");
    const field = (k, label, ph, extra) => `<label class="mg-f"><span>${label}</span><input class="tp-input ${extra || ""} ${S.q[k] ? "on" : ""}" data-q="${k}" value="${esc(S.q[k])}" placeholder="${ph}" aria-label="${label}" ${extra ? "readonly" : ""}></label>`;
    const pill = (attr, v, label, on) => `<button type="button" class="tp-pill ${on ? "on" : ""}" data-${attr}="${v}" aria-pressed="${on ? "true" : "false"}">${label}</button>`;
    return `<div class="mg-fpanel" data-fpanel-box role="region" aria-label="فیلترهای میز">
      <div class="mg-fgrid">${field("id", "شماره درخواست", "مثلاً ۱۴۰۵۰۷")}${field("date", "تاریخ", "انتخاب از تقویم", "date")}${field("party", "پروژه یا طرف مقابل", "نام پروژه…")}${field("item", "عنوان یا کد قلم", "سیمان، ۲۰۱۳…")}</div>
      <div class="mg-frow"><span class="lab">کارشناس</span><span class="fwrap"><button class="tp-btn sm ${nE || txt ? "primary" : ""}" data-fopen="expert">${expLabel} ▾</button>${vPop("expert")}</span>
        <span class="lab">وضعیت</span><span class="fwrap"><button class="tp-btn sm ${statusDefault() ? "" : "primary"}" data-fopen="status" title="${esc(sel.join("، "))}">${stLabel.length > 40 ? stLabel.slice(0, 38) + "…" : esc(stLabel)} ▾</button>${vPop("status")}</span></div>
      <div class="mg-frow"><span class="lab">مرحله</span><div class="tp-pills">${pill("fstate", "", "همه", !S.filter.state)}${Object.entries(STAGE_F).map(([k, l]) => pill("fstate", k, l, S.filter.state === k)).join("")}</div></div>
      <div class="mg-frow"><span class="lab">بازه</span><div class="tp-pills">${WINDOWS.map(([k, l]) => pill("fwin", k, l, S.filter.window === k)).join("")}</div></div>
      <div class="mg-ffoot"><button class="tp-btn sm" data-clear>پاک کردن همه</button><span class="spacer"></span><button class="tp-btn primary" data-fok>${TP.ui.ICON.check} تأیید</button></div></div>`;
  }
  function vFilters() {
    const act = activeFilters(), win = WINDOWS.find((w) => w[0] === S.filter.window);
    /* ابزارهای میز در یک منو: ارجاع و مهلتِ هوشمند روی همه، و «پاک کردن میز» دور از دکمه‌های روزمره */
    const tools = TP.ui.menu({ btn: `<button class="tp-btn sm" type="button" data-menu-toggle aria-haspopup="menu" aria-expanded="false" title="ارجاع و مهلت هوشمند روی همهٔ ارسال‌نشده‌ها">${TP.ui.ICON.settings}خودکار ▾</button>`,
      items: [{ label: "ارجاع هوشمند روی همهٔ ارسال‌نشده‌ها", icon: "users", attrs: `data-auto="asg"` }, { label: "مهلت هوشمند روی ارسال‌نشده‌های کارشناس‌دار", icon: "clock", attrs: `data-auto="dl"` },
        ...(S.page.total ? ["-", { label: "پاک کردن میز (همهٔ درخواست‌ها)", icon: "x", attrs: "data-purge", cls: "danger" }] : [])] });
    return `<div class="mg-bar">
      <button type="button" class="mg-fbtn ${S.fOpen ? "on" : ""}" data-fpanel aria-expanded="${S.fOpen ? "true" : "false"}" title="فیلترهای میز">${FUNNEL}<span>فیلتر</span>${act.length ? `<i class="badge">${M(act.length)}</i>` : ""}</button>
      <div class="mg-chips">${act.map(([l, v, k]) => `<button type="button" class="mg-chip" data-fdrop="${esc(k)}" title="برداشتن این فیلتر">${esc(l)}: <b>${esc(String(v).length > 18 ? String(v).slice(0, 17) + "…" : v)}</b> ${TP.ui.ICON.x}</button>`).join("")}
        ${act.length > 1 ? `<button type="button" class="mg-chip clear" data-clear>پاک کردن همه</button>` : ""}</div>
      <span class="spacer"></span>
      <span class="mg-count"><b>${M(visible().length)}</b> از ${M(S.data.requests.length)} درخواست · ${esc(win ? win[1] : "")}${S.page.total > S.page.limit ? ` · صفحهٔ ${M(Math.floor(S.page.offset / S.page.limit) + 1)} از ${M(Math.ceil(S.page.total / S.page.limit))}
        <button class="tp-btn xs" data-page="-1" ${S.page.offset ? "" : "disabled"}>قبلی</button><button class="tp-btn xs" data-page="1" ${S.page.offset + S.page.limit < S.page.total ? "" : "disabled"}>بعدی</button>` : ""}</span>
      ${tools}</div>
      ${S.fOpen ? vFilterPanel() : ""}`;
  }
  /* بستنِ کادرِ فیلتر: اول حرکتِ بسته شدن، بعد رسم */
  function closeFilters() {
    const box = document.querySelector("[data-fpanel-box]"), btn = document.querySelector("[data-fpanel]");
    if (btn) { btn.classList.remove("spin", "spin-back"); void btn.offsetWidth; btn.classList.add("spin-back"); }
    S.pop = null;
    TP.ui.reveal(box, false, () => { S.fOpen = false; render(); });
  }
  /* وضعیت به تفکیک قلم — درخواست یک وضعیت ندارد، هر قلمش دارد.
     تا شش قلم ردیف‌به‌ردیف، بیشتر از آن شمارشِ هر وضعیت؛ فهرست کامل در کشو. */
  function itemStates(its) {
    if (!its.length) return "";
    const same = its.every((i) => i.state === its[0].state);
    if (same && its.length > 1) return `<div class="dim" style="font-size:.72rem">همهٔ ${its.length} قلم: ${TP.STATES[its[0].state].label}</div>`;
    if (its.length <= 6) return `<div style="font-size:.72rem;line-height:1.5;margin-top:2px">${its.map((i) => `<span class="st ${TP.STATES[i.state].cls}" style="font-size:.68rem;padding:0 5px">${TP.STATES[i.state].label}</span> <span class="dim" title="${esc(i.title)}">${esc(i.title.length > 22 ? i.title.slice(0, 21) + "…" : i.title)}</span>`).join("<br>")}</div>`;
    const cnt = {}; its.forEach((i) => { cnt[i.state] = (cnt[i.state] || 0) + 1; });
    return `<div class="dim" style="font-size:.72rem">${Object.entries(cnt).map(([k, n]) => `${n} ${TP.STATES[k].label}`).join(" · ")}</div>`;
  }

  /* نام کارشناسِ ستون «کارشناس خرید» فایل راهکاران — همیشه زیرِ انتخاب کارشناس، حتی بعد از
     ارجاع؛ اگر با انتخابِ مدیر فرق دارد زرد می‌شود. زیرِ باکس است تا عرض ستون ثابت بماند. */
  function fileExpert(its, chosen) {
    const names = [...new Set((its || []).map((i) => i.src_expert).filter(Boolean))];
    if (!names.length) return "";
    const differs = chosen != null && names.some((n) => TP.nrm(n) !== TP.nrm(chosen));
    return `<div class="filexp ${differs ? "warn" : ""}" title="${differs ? "کارشناس فایل راهکاران با کارشناس انتخاب‌شده فرق دارد" : "کارشناس خرید در فایل راهکاران"}">${differs ? "⚠ " : ""}فایل: ${esc(names.join("، "))}</div>`;
  }

  /* آستانه‌های پایشِ هر کارشناس: اگر کارشناس ارشدش برای تیم آستانه گذاشته همان، وگرنه آستانه‌های مدیر
     (تصمیم مدیر، شهریور ۱۴۰۵) — همان چیزی که سرور برای هشدارهای همان کارشناس به کار می‌برد */
  function thrFor(expertId) {
    const E = S.data.experts, e = E.find((x) => x.id === expertId);
    const s = e && e.senior_id ? E.find((x) => x.id === e.senior_id && x.senior && x.active) : null;
    return (s && s.alert_thresholds) || settings().thresholds;
  }
  /* ---------- میز ارجاع به شکل کارت (مهر ۱۴۰۵): یک کارت برای هر درخواست، یک ردیف برای هر ارجاع ---------- */
  /* بدترین رنگِ شش مرحلهٔ یک ارجاع (همان TP.stageColor باکس‌های پایش) → رنگِ کلِ کارت: زرد، نارنجی، قرمز */
  const LVL = { warn: 1, late: 2, over: 3 };
  function unitLevel(r, a) {
    if (!isActive(r, a)) return "";
    const A = { dispatchedAt: a.dispatched_at, days: a.days, done: doneFlags(r, a), active: true }, thr = thrFor(a.expert_id);
    let worst = "";
    TP.STAGES.forEach((_, i) => { const c = TP.stageColor(A, i, thr, S.now); if ((LVL[c] || 0) > (LVL[worst] || 0)) worst = c; });
    return worst;
  }
  const jd = (ms) => { const [y, m, d] = TP.todayJ(ms); return `${y}/${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}`; };
  /* نوارِ مهلت و نوارِ شش مرحلهٔ یک ارجاع — همان دو نوارِ کارتابلِ کارشناس؛ رنگ هر مرحله از TP.stageColor با آستانه‌های همان کارشناس */
  function unitBars(r, a) {
    const A = { dispatchedAt: a.dispatched_at, days: a.days, done: doneFlags(r, a), active: isActive(r, a) }, thr = thrFor(a.expert_id);
    const segs = TP.STAGES.map((s, i) => ({ label: TP.ui.STAGE_SHORT[i], title: s, cls: `c-${TP.stageColor(A, i, thr, S.now)}`, done: A.done[i],
      cnt: i === 3 && a.quote_count ? a.quote_count : i === 4 && a.proforma_count ? a.proforma_count : "" }));
    if (!a.dispatched_at) return TP.ui.bar.progress(segs);
    const b = TP.budget(a.dispatched_at, a.days || 1), el = TP.wh(a.dispatched_at, S.now), pct = b ? Math.min(100, el / b * 100) : 0;
    const lvl = el >= b ? "over" : pct >= 85 ? "late" : pct >= 60 ? "warn" : "";
    return TP.ui.bar.deadline(pct, lvl, "مهلت", `${a.days || "—"} روز`) + TP.ui.bar.progress(segs);
  }
  /* چیپِ «ارسال»: تاریخِ ارسال، یا «ارسال‌نشده» که اگر از مهلتِ ارسالِ تنظیمات گذشته باشد زرد می‌شود (همان TP.dispatchColor) */
  function sendChip(r, a) {
    if (a && a.dispatched_at) return `<span class="tp-sendchip ok" title="ارسال شد ${esc(TP.fmt(a.dispatched_at))}">✓ ارسال ${esc(jd(a.dispatched_at))}</span>`;
    const c = TP.dispatchColor(r.imported_at || S.now, settings().dispatchDays, null, S.now);
    return `<span class="tp-sendchip ${c === "idle" || c === "empty" ? "" : "warn"}" title="هنوز به کارشناس ارسال نشده">ارسال‌نشده</span>`;
  }
  /* یک ردیفِ ارجاع داخلِ کارت: انتخاب کارشناس و مهلت (تا پیش از ارسال)، تیک‌های 🤖/👁، نوارها، وضعیت و منوی ⋯ */
  function deskUnit(r, a, STL) {
    const lock = a.dispatched_at ? "disabled" : "", its = itemsOf(r, a), live = isActive(r, a);
    const who = a.dispatched_at
      ? `<span class="uname" title="${esc(a.expert_name || "")}">${TP.ui.ICON.user}${esc(a.expert_label || a.expert_name || "—")}</span>${fileExpert(its, a.expert_name)}`
      : `<select class="tp-select" data-assign="${esc(r.id)}" data-aid="${a.id}" ${lock} aria-label="کارشناس خرید"><option value="">— انتخاب کارشناس —</option>${expertOpts(a.expert_id)}</select>${fileExpert(its, a.expert_name)}`;
    const days = a.dispatched_at ? `<span title="مهلت (روز کاری)">${TP.ui.ICON.clock}${a.days ? `${esc(a.days)} روز` : "—"}</span>`
      : `<span title="مهلت (روز کاری)">${TP.ui.ICON.clock}</span><input class="tp-input num ${a.days ? "" : "unset"}" data-days="${a.id}" value="${esc(a.days || "")}" inputmode="numeric" placeholder="روز" aria-label="مهلت به روز کاری" ${lock}>`;
    const acts = TP.ui.menu({ btn: `<button class="tp-icon-btn sm" type="button" data-menu-toggle aria-haspopup="menu" aria-expanded="false" aria-label="اقدام‌های این ارجاع" title="اقدام‌ها">${TP.ui.ICON.more}</button>`,
      items: [
        { label: "مشاهدهٔ پنل کارشناس", icon: "search", attrs: `data-open="${a.id}"` },
        ...(a.dispatched_at ? [{ label: "تغییر کارشناس", icon: "users", attrs: `data-move="${a.id}"` }] : []),
        "-",
        { label: "تعلیق", icon: "clock", attrs: `data-act="hold|${a.id}"` },
        ...(its.some((i) => i.state === "hold") ? [{ label: "بازگشت از تعلیق", icon: "refresh", attrs: `data-act="open|${a.id}"` }] : []),
        { label: "توقف", icon: "x", attrs: `data-act="stop|${a.id}"`, cls: "danger" },
        { label: "خاتمه", icon: "check", attrs: `data-act="closed|${a.id}"` },
      ] });
    return TP.ui.unitRow({ who, days, ticks: (aiTick(a) + supTick(a)).trim(), bars: unitBars(r, a),
      status: `<span><span class="st ${STL.cls}">${live ? "در جریان" : STL.label}</span> <span class="dim">${its.length} قلم</span></span>${sendChip(r, a)}${itemStates(its)}`, acts });
  }
  /* اقلامِ بی‌کارشناس: یک ردیف با انتخابِ خالی — با انتخاب، ارجاعِ تازه فقط برای همین اقلام ساخته می‌شود */
  function unassignedUnit(r, un, STL) {
    const who = `<select class="tp-select unset" data-assign="${esc(r.id)}" data-un="${un.map((i) => i.id).join(",")}" aria-label="کارشناس خرید"><option value="">— انتخاب کارشناس —</option>${expertOpts(null)}</select>${fileExpert(un.some((i) => i.src_expert) ? un : r.items, null)}`;
    return TP.ui.unitRow({ who, days: `<span title="مهلت پس از انتخاب کارشناس">${TP.ui.ICON.clock}—</span>`,
      bars: TP.ui.bar.progress(TP.STAGES.map((s, i) => ({ label: TP.ui.STAGE_SHORT[i], title: s, cls: "c-idle" }))),
      status: `<span><span class="st ${STL.cls}">${STL.label}</span> <span class="dim">${un.length} قلم</span></span><span class="chip warn" style="font-size:.72rem">بدون کارشناس</span>${sendChip(r, null)}`, acts: "" });
  }
  function itemsDrawer(r) {
    return `<table><thead><tr><th>#</th><th>کد قلم</th><th>عنوان</th><th>مشخصه فنی</th><th>توضیحات</th><th>مقدار</th><th>واحد</th><th>تاریخ نیاز</th><th>مهلت استعلام</th><th>مصرف‌کننده</th><th>وضعیت راهکاران</th><th>کارشناس فایل</th><th>وضعیت سامانه</th><th>کارشناس</th></tr></thead><tbody>
      ${r.items.map((i) => { const a = r.assignments.find((x) => x.id === i.assignment_id); return `<tr><td class="num">${i.line_no}</td><td class="num">${esc(i.code)}</td><td>${esc(i.title)}</td><td class="dim">${esc(i.spec || "")}</td><td class="dim">${esc(i.note || "")}</td><td class="num">${i.qty == null ? "" : M(i.qty)}</td><td>${esc(i.unit)}</td><td class="num">${esc(i.need_date || "")}</td><td class="num">${esc(i.quote_deadline || "")}</td><td class="dim">${esc(i.consumer || "")}</td>
        <td><span class="st ${TP.SRC_CLS[i.src_status] || "st-reg"}">${esc(i.src_status || "")}</span></td><td class="dim">${esc(i.src_expert || "—")}</td><td><span class="st ${TP.STATES[i.state].cls}">${TP.STATES[i.state].label}</span></td>
        <td>${a ? esc(a.expert_label || a.expert_name) : (i.state === "open" ? `<span class="chip warn">بدون کارشناس</span>` : "—")}</td></tr>`; }).join("")}
      </tbody></table>`;
  }
  /** کارتِ هر درخواست روی میز: شماره، تاریخ، نیاز، پروژه/طرف مقابل، اقلام، و یک ردیف برای هر ارجاع؛ رنگ کارت از بدترین ارجاعش */
  function deskCard(r, i) {
    const un = unassignedOpen(r), st = reqState(r), STL = TP.STATES[st];
    /* وضعیتِ مؤثر (بسته/در جریان/ثبت شده…) — همان که فیلتر وضعیت روی آن کار می‌کند */
    const chips = [...new Set(r.items.map((x) => statusOf(r, x)))].map((s) => `<span class="st ${TP.SRC_CLS[s] || (s === "در جریان" ? "st-run" : "st-reg")}">${esc(s)}</span>`).join(" ");
    const need = r.items.map((x) => x.need_date).filter(Boolean).sort()[0] || "";
    const units = r.assignments.map((a) => deskUnit(r, a, STL));
    if (un.length) units.push(unassignedUnit(r, un, STL));
    if (!units.length) units.push(`<div class="tp-unit none">قلم بازی ندارد</div>`);
    let lvl = ""; r.assignments.forEach((a) => { const c = unitLevel(r, a); if ((LVL[c] || 0) > (LVL[lvl] || 0)) lvl = c; });
    const menu = TP.ui.menu({ btn: `<button class="tp-icon-btn sm" type="button" data-menu-toggle aria-haspopup="menu" aria-expanded="false" aria-label="گزینه‌های درخواست" title="گزینه‌ها">${TP.ui.ICON.more}</button>`,
      items: [{ label: S.open[r.id] ? "بستن فهرست اقلام" : "فهرست اقلام", icon: "box", attrs: `data-toggle="${esc(r.id)}"` }, "-", { label: "حذف از سامانه", icon: "x", attrs: `data-del="${esc(r.id)}"`, cls: "danger" }] });
    return TP.ui.reqCard({ i, lvl, rid: r.id, date: r.date, need, project: r.project, party: r.party, center: r.center, chips, menu,
      items: { first: r.items[0] ? r.items[0].title : "", total: r.items.length }, toggleAttrs: `data-toggle="${esc(r.id)}" aria-expanded="${S.open[r.id] ? "true" : "false"}"`,
      drawerOpen: !!S.open[r.id], drawerHtml: itemsDrawer(r), units });
  }

  function vDesk() {
    if (!S.data.requests.length && (S.data.all_total || 0) > 0 && S.filter.window !== "all") {
      /* بازهٔ تاریخ خالی است ولی درخواست باز داریم — نگوییم «فایلی نیست» */
      const w = WINDOWS.find((x) => x[0] === S.filter.window);
      return `<div class="empty"><b>در بازهٔ «${esc(w ? w[1] : "")}» درخواست بازی نیست.</b>${M(S.data.all_total)} درخواست باز با تاریخ قدیمی‌تر در سامانه هست.<br><br><button class="tp-btn primary" data-win-all>نمایش همه تاریخ‌ها</button></div>`;
    }
    if (!S.data.requests.length) return `<div class="empty"><b>هنوز فایلی بارگذاری نشده است.</b>با دکمه «بارگذاری درخواست‌های روزانه» فایل خروجی راهکاران (.xlsx) را انتخاب کنید — یا فایل را همین‌جا روی صفحه رها کنید.</div>`;
    const rows = visible();
    /* نتیجهٔ خالیِ فیلتر هم نوار جستجو را نگه می‌دارد (vFilters)؛ وگرنه راهی جز «پاک کردن فیلترها» برای برگشتن نمی‌ماند. */
    if (!rows.length) return `<div class="empty">با این فیلترها درخواستی در این بازه نیست.${S.q.id.trim().length >= 4
      ? `<br><br><button class="tp-btn" data-lookup="${esc(S.q.id.trim())}">جستجوی شماره «${esc(S.q.id.trim())}» در کل سامانه (خارج از بازه)</button>` : ""}</div>`;
    return `<div class="tp-cards wide ${TP.ui.once("mgr.desk")}">${rows.map(deskCard).join("")}</div>`;
  }

  /* ---------- کارشناسان: تخته‌ی تیم‌ها (مهر ۱۴۰۵) ----------
     هر کارشناس ارشد یک کارتِ تیم است و اعضایش تراشه‌هایی که می‌شود میانِ تیم‌ها کشید (یا با «＋ افزودن عضو» و منوی ⋯
     جابه‌جا کرد)؛ کارتِ «بی‌سرپرست» کارشناسانی‌اند که زیرِ هیچ ارشدی نیستند. زنگوله روی تراشهٔ عضو = اعلان‌های پایشِ او
     برای مدیر هم بیاید (بی آن فقط برای ارشدش). همان کارهای جدولِ قبلی: نام، ارشد، حذف، تیم، مقصدِ اعلان، بار باز. */
  const exName = (e) => e.label || e.name;
  const exAv = (e, cls) => `<span class="ex-av ${cls || ""}" style="--av:${TP.ui.avColor(e.name)}" aria-hidden="true">${esc(TP.ui.avInitial(exName(e)))}</span>`;
  const exHit = (e) => !S.exQ || TP.hit(exName(e), S.exQ) || TP.hit(e.name, S.exQ);
  const moreBtn = (label) => `<button class="tp-icon-btn sm" type="button" data-menu-toggle aria-haspopup="menu" aria-expanded="false" aria-label="${esc(label)}" title="گزینه‌ها">${TP.ui.ICON.more}</button>`;
  function exNameEl(e, big) {
    if (S.editName === e.id) return `<input class="tp-input ex-edit" data-ename="${e.id}" value="${esc(exName(e))}" aria-label="نام کارشناس">`;
    return `<b class="${big ? "big" : ""}">${big ? "★ " : ""}${esc(exName(e))}</b>${e.label && e.label !== e.name ? `<small>${esc(e.name)}</small>` : ""}`;
  }
  function exChip(e, inTeam) {
    const seniors = S.data.experts.filter((s) => s.active && s.senior && s.id !== e.id && s.id !== e.senior_id);
    const menu = TP.ui.menu({ cls: "start", btn: moreBtn(`گزینه‌های ${exName(e)}`), items: [
      { label: "ویرایش نام", icon: "edit", attrs: `data-ename-edit="${e.id}"` },
      { label: "کارشناس ارشد شود", icon: "users", attrs: `data-estar="${e.id}"` },
      ...(seniors.length ? [{ cap: "انتقال به تیمِ" }, ...seniors.map((s) => ({ label: esc(exName(s)), icon: "users", attrs: `data-eteam="${e.id}|${s.id}"` }))] : []),
      ...(inTeam ? [{ label: "خروج از تیم", icon: "back", attrs: `data-eteam="${e.id}|${e.senior_id}"` }] : []),
      "-", { label: "حذف از فهرست", icon: "x", attrs: `data-edel="${e.id}"`, cls: "danger" }] });
    const bellOn = e.notify_to !== "senior";
    const bell = inTeam ? `<button type="button" class="ex-bell ${bellOn ? "on" : ""}" data-ebell="${e.id}" aria-pressed="${bellOn ? "true" : "false"}" title="${bellOn ? "اعلان‌های پایشِ این کارشناس برای شما هم می‌آید — بزنید تا فقط برای ارشدش برود" : "اعلان‌ها فقط برای ارشدش می‌رود — بزنید تا برای شما هم بیاید"}">${TP.ui.ICON.bell}</button>` : "";
    return `<div class="ex-chip ${S.exLand === e.id ? "land" : ""}" draggable="${S.editName === e.id ? "false" : "true"}" data-exdrag="${e.id}">${exAv(e)}
      <span class="ex-nm">${exNameEl(e)}</span>
      <span class="ex-load ${e.open_load ? "" : "zero"}" title="درخواست‌های باز">${M(e.open_load || 0)}</span>${bell}${menu}</div>`;
  }
  function exPicker(s) {
    const q = S.exPickQ || "";
    const cands = expertsSorted().filter((e) => !e.senior && e.senior_id !== s.id && (TP.hit(exName(e), q) || TP.hit(e.name, q)));
    const sName = (id) => { const x = S.data.experts.find((y) => y.id === id); return x ? exName(x) : ""; };
    return `<div class="fpop ex-pick" data-pop><input class="tp-input" data-epickq placeholder="نام کارشناس…" value="${esc(q)}" aria-label="جستجوی کارشناس" style="width:100%;margin-bottom:6px">
      <div class="fpop-list">${cands.map((e) => `<button type="button" class="ex-pi" data-eteam="${e.id}|${s.id}">${exAv(e, "sm")}<span>${esc(exName(e))}</span>${e.senior_id && sName(e.senior_id) ? `<small>از تیمِ ${esc(sName(e.senior_id))}</small>` : ""}</button>`).join("") || `<span class="dim">کسی نمانده.</span>`}</div>
      <div class="tp-acts" style="margin-top:8px"><button class="tp-btn xs" data-epick-close>بستن</button></div></div>`;
  }
  function exTeam(s, members, i) {
    const load = members.reduce((n, m) => n + (m.open_load || 0), s.open_load || 0);
    const menu = TP.ui.menu({ btn: moreBtn(`گزینه‌های تیم ${exName(s)}`), items: [
      { label: "ویرایش نام", icon: "edit", attrs: `data-ename-edit="${s.id}"` },
      { label: "برداشتن ارشدی", icon: "x", attrs: `data-estar="${s.id}"` },
      "-", { label: "حذف از فهرست", icon: "x", attrs: `data-edel="${s.id}"`, cls: "danger" }] });
    return `<section class="ex-team" data-drop-team="${s.id}" style="--i:${Math.min(i, 10)}" aria-label="تیم ${esc(exName(s))}">
      <header>${exAv(s, "lg")}<div class="ex-th">${exNameEl(s, true)}<small>${M(members.length)} عضو · ${M(load)} درخواست باز${s.team_connected ? ` · <span class="ok">گروه تلگرام وصل</span>` : ""}</small></div>
        <span class="ex-load ${s.open_load ? "" : "zero"}" title="درخواست‌های باز خودِ ارشد">${M(s.open_load || 0)}</span>${menu}</header>
      <div class="ex-members">${members.map((m) => exChip(m, true)).join("") || `<div class="ex-empty">کارشناسی را این‌جا بکشید</div>`}</div>
      <footer><span class="fwrap"><button type="button" class="tp-btn sm" data-eadd-to="${s.id}" aria-expanded="${S.exPick === s.id ? "true" : "false"}">${TP.ui.ICON.plus} افزودن عضو</button>${S.exPick === s.id ? exPicker(s) : ""}</span></footer></section>`;
  }
  function vExperts() {
    const all = expertsSorted(), seniors = all.filter((e) => e.senior), sIds = new Set(seniors.map((s) => s.id));
    const pool = all.filter((e) => !e.senior && !(e.senior_id && sIds.has(e.senior_id)));
    const teams = seniors.map((s) => [s, all.filter((e) => !e.senior && e.senior_id === s.id)]);
    const showTeam = ([s, m]) => !S.exQ || exHit(s) || m.some(exHit);
    const k = (label, value, icon, tone) => TP.ui.stat({ label, value, icon, tone });
    return `<div class="ex-board ${TP.ui.once("mgr.ex")}">
      <section class="tp-box ex-head"><div class="tp-box-h"><span class="bi">${TP.ui.ICON.users}</span><h2>کارشناسان</h2>${TP.ui.info("manager.experts", "راهنمای کارشناسان")}
        <span class="end"><label class="ex-search">${TP.ui.ICON.search}<input class="tp-input" data-exq value="${esc(S.exQ || "")}" placeholder="جستجوی نام…" aria-label="جستجوی کارشناس"></label>
        <button class="tp-btn primary" data-eadd>${TP.ui.ICON.plus} کارشناس جدید</button></span></div>
        <div class="tp-stats">${k("کارشناس فعال", M(all.length), "users")}${k("تیم", M(seniors.length), "flag", "info")}${k("بی‌سرپرست", M(pool.length), "user", pool.length ? "warn" : "ok")}${k("درخواست باز", M(all.reduce((n, e) => n + (e.open_load || 0), 0)), "box")}</div></section>
      <div class="ex-teams">${teams.filter(showTeam).map(([s, m], i) => exTeam(s, m.filter((x) => !S.exQ || exHit(s) || exHit(x)), i)).join("")}
        <section class="ex-team pool" data-drop-team="0" aria-label="بی‌سرپرست"><header><span class="ex-av lg pool" aria-hidden="true">${TP.ui.ICON.user}</span><div class="ex-th"><b class="big">بی‌سرپرست</b><small>${M(pool.length)} کارشناس · اعلان‌هایشان برای شما می‌آید</small></div></header>
          <div class="ex-members">${pool.filter(exHit).map((e) => exChip(e, false)).join("") || `<div class="ex-empty">${S.exQ ? "کسی با این نام نیست" : "همه در تیم‌اند"}</div>`}</div></section></div>
      ${seniors.length ? "" : `<div class="ex-hint">${TP.ui.ICON.users} برای ساختن تیم، از منوی ⋯ یک کارشناس «کارشناس ارشد شود» را بزنید.</div>`}</div>`;
  }
  async function expertPatch(id, body) {
    try { await TP.api(`/experts/${id}`, { method: "PUT", body }); S.data.experts = (await TP.api("/experts")).experts; render(); return true; }
    catch (e) { S.exLand = null; TP.modal("خطا", esc(e.message), null, "باشد", ""); return false; }
  }
  function addExpertDialog() {
    const d = TP.modal("کارشناس جدید", `<div class="tp-field"><b>نام و نام خانوادگی</b><input class="tp-input" id="ne-name" style="width:100%"></div>
      <div class="tp-field" style="margin-top:8px"><b>نام کوتاه (مثلاً «آقای بهمنی») — اختیاری</b><input class="tp-input" id="ne-label" style="width:100%"></div>
      <p class="dim" style="margin:10px 0 0;font-size:.85rem">کد ورودِ چهاررقمی را سامانه می‌سازد؛ در پنل پشتیبانی (کارشناسان ← کدهای ورود) دیده و عوض می‌شود.</p>`,
      async () => {
        try { await TP.api("/experts", { body: { name: d.querySelector("#ne-name").value, label: d.querySelector("#ne-label").value } }); S.data.experts = (await TP.api("/experts")).experts; render(); TP.ui.success("کارشناس افزوده شد"); }
        catch (e) { TP.modal("خطا", esc(e.message), null, "باشد", ""); }
      }, "افزودن");
  }

  /* ---------- سوابق خرید و فهرست اقلام ----------
     چهار فایل مرجع با هم: اقلام (نرمال‌سازی)، شاخص تعدیل، نرخ تبدیل واحد، سوابق خرید.
     در همین مرورگر خوانده و به هم وصل می‌شوند (catalog-import.js) و فقط نتیجه دسته‌دسته
     فرستاده می‌شود. کارشناس در تب «بررسی سوابق» از همین‌ها «عین قلم» و «نوع قلم» را می‌بیند. */
  /* ym = سال×۱۲ + ماه — همان چیزی که سرور برای فاصلهٔ ماهانه نگه می‌دارد */
  const ymFa = (v) => { if (!v) return "—"; const y = Math.floor((v - 1) / 12); return `${TP.JM[v - y * 12 - 1]} ${y}`; };
  /* سقف نوشتنِ روزانهٔ D1 در پلن رایگان Cloudflare — برای هشدار پیش از بارگذاری */
  const DAILY_WRITES = 100000;
  const PLAN_FA = { skip: "بی‌تغییر — نوشته نمی‌شود", append: "فقط ردیف‌های تازه", replace: "از نو ساخته می‌شود" };
  const GROUP_FA = { catalog: "فهرست اقلام، نرخ‌ها و شاخص‌ها", grades: "کد و ردهٔ تأمین‌کنندگان", purchases: "ردیف‌های خرید" };

  /* سوابق تأمین (مهر ۱۴۰۵): کارت‌برگ‌ها، فایل‌ها و جای رها کردنِ فایل؛ جزئیاتِ بارگذاری جمع‌شده و توضیح‌ها در راهنما */
  function vHist() {
    const h = S.hist, c = h && h.current, v2 = h && h.format === 2;
    const fs = (c && c.file) || {};
    const stat = (label, value, icon, tone, sub) => TP.ui.stat({ label, value, icon, tone, sub });
    const state = !h ? ["", "در حال خواندن…"] : h.loading && h.loading.fp ? ["warn", "بارگذاری نیمه‌کاره"] : c && v2 ? ["ok", "به‌روز"] : c ? ["warn", "قالب قدیمی"] : ["bad", "بارگذاری نشده"];
    const files = (c && c.files) || {};
    /* کلیدها همان catalog-import.js: items، indices، units، history */
    const SLOTS = [["items", "اقلام", "box"], ["indices", "شاخص تعدیل", "data"], ["units", "نرخ تبدیل واحد", "settings"], ["history", "سوابق خرید", "file"]];
    const details = [fs.noIndex ? `${M(fs.noIndex)} خرید (${Object.keys(fs.noIndexYears || {}).map((y) => M(y)).join("، ")}) شاخص تعدیل ندارند و با ضریب ۱ آمده‌اند.` : "",
      fs.skipped ? `${M(fs.skipped)} ردیفِ بی‌تأمین‌کننده کنار گذاشته شد.` : "", fs.norm ? normLine(fs.norm) : "",
      h && h.loading && h.loading.fp ? `بارگذاری نیمه‌کاره از ${TP.fmt(h.loading.imported_at)}؛ همان چهار فایل را دوباره بارگذاری کنید تا از همان‌جا ادامه یابد.` : "",
      c && !v2 ? `سوابق فعلی با قالب قدیمی است (${M(c.rows)} ردیف از «${esc(c.filename || "—")}»).` : ""].filter(Boolean);
    return `<div class="hs-wrap ${TP.ui.once("mgr.hist")}">
      ${hero("data", "سوابق تأمین", c ? `آخرین بارگذاری ${esc(TP.fmt(c.finished_at || c.imported_at))}` : "چهار فایل مرجع را بارگذاری کنید",
        `<span class="chip ${state[0]}">${state[1]}</span>${TP.ui.info("manager.hist", "راهنمای سوابق تأمین")}<button class="tp-btn primary" data-hist-import>${TP.ui.ICON.upload} بارگذاری چهار فایل</button>`)}
      ${c && v2 ? `<div class="tp-stats">${stat("ردیف خرید", M(c.rows), "file")}${stat("تأمین‌کننده", M(c.suppliers), "users")}${stat("با کد و رده", M(fs.graded || 0), "check", "ok")}${stat("کد قلم", M(c.codes), "box")}
          ${stat("بازهٔ سوابق", `${ymFa(c.minYm)} – ${ymFa(c.maxYm)}`, "clock", "info")}${stat("فهرست اقلام", `${M(fs.items || 0)} قلم`, "data", "", `${M(fs.heads || 0)} نوع`)}${stat("مبنای قیمت", esc(h.base.priceLabel), "flag")}</div>`
        : c ? `<div class="tp-stats">${stat("ردیف", M(c.rows), "file", "warn")}${stat("فایل", esc(c.filename || "—"), "data")}</div>` : ""}
      <section class="tp-box hs-drop" data-hist-import role="button" tabindex="0" aria-label="بارگذاری چهار فایل مرجع">
        <div class="hs-slots">${SLOTS.map(([k, n, ic]) => { const f = files[k]; return `<div class="hs-slot ${f ? "on" : ""}"><span class="bi">${TP.ui.ICON[ic]}</span><b>${n}</b><small title="${esc(f || "")}">${f ? esc(f) : "—"}</small></div>`; }).join("")}</div>
        <div class="hs-cta">${TP.ui.ICON.upload}<b>چهار فایل را این‌جا رها کنید</b><span>یا بزنید و انتخاب کنید (.xlsx)</span></div></section>
      ${details.length ? `<details class="tp-more hs-more"><summary>جزئیاتِ آخرین بارگذاری</summary><div>${details.map((d) => `<p>${d}</p>`).join("")}</div></details>` : ""}</div>`;
  }

  /* یکسان‌سازی فهرست اقلام (catalog-rules.mjs): لایهٔ کمّی عدد + واحدِ استاندارد، و جنسِ گفته‌نشده با عرفِ نوع قلم */
  const normLine = (n) => {
    const q = n.qty || {}, m = n.mat || {};
    return `<b>یکسان‌سازی لایه‌ها:</b> مقدارهای کمّی — ${M(q.explicit || 0)} با واحدِ گفته‌شده، ${M(q.implicit || 0)} با واحدِ ضمنی (عرفِ همان ویژگی در همان نوع قلم)، `
      + `${M(q.unknown || 0)} بی‌واحد (عرفی نبود؛ حدس زده نشد)${q.text ? `، ${M(q.text)} غیرعددی` : ""}. `
      + `جنس در ${M(n.ruleItems || 0)} قلمِ نوع‌هایی که جنس برایشان مهم است — ${M(m.layer || 0)} از لایه، ${M(m.title || 0)} از عنوان، ${M(m.implied || 0)} ضمنی (عرفِ پذیرفته‌شده، مثل ورقِ بی‌جنس ← آهنی)، ${M(m.none || 0)} نامعلوم. `
      + `${M(n.splitItems || 0)} قلم به نوع قلمِ جنس‌دار رفتند («ورق» ← «ورق آهنی»، «ورق گالوانیزه» …).`;
  };

  async function loadHist() { try { S.hist = await TP.api("/history/status"); } catch (e) { S.hist = { ready: false, error: e.message }; } render(); }

  function pickHistory() {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".xlsx"; inp.multiple = true;
    inp.onchange = () => { if (inp.files && inp.files.length) askCatalogImport(inp.files); };
    inp.click();
  }

  /* همان قاعدهٔ worker/catalog.js:catalogBegin — فقط برای برآورد پیش از پرسیدن. تصمیم نهایی با سرور است. */
  function previewPlan(fp) {
    const c = S.hist && S.hist.format === 2 && S.hist.current, prev = c && c.fp;
    return {
      catalog: prev && prev.cat === fp.cat ? "skip" : "replace",
      grades: prev && prev.grades === fp.grades ? "skip" : "replace",
      purchases: prev && prev.rows === fp.rows && prev.adj === fp.adj ? "skip" : prev && prev.adj === fp.adj ? "append" : "replace",
    };
  }

  /* فایل‌ها پیش از هر پرسشی خوانده می‌شوند تا اثرانگشتشان را داشته باشیم: اگر همان
     فایل‌های بارگذاری‌شده باشند، اصلاً نباید چیزی از مدیر پرسیده شود. */
  async function askCatalogImport(fileList) {
    const list = [...fileList].filter((f) => /\.xlsx$/i.test(f.name || ""));
    if (!list.length) return TP.modal("فایل نامناسب", "فقط فایل اکسل (.xlsx) پذیرفته می‌شود.", null, "باشد", "");
    const busy = TP.busy("خواندن فایل‌ها…", list.map((f) => esc(f.name)).join("<br>"));
    const books = {}, names = {}, unknown = [];
    let out;
    try {
      for (const f of list) {
        busy.set(`خواندن «${esc(f.name)}» — ${(f.size / 1048576).toFixed(1)} مگابایت…`);
        const wb = await TP.readBook(f);
        const kind = TP.catalogKind(wb);
        if (!kind) { unknown.push(f.name); continue; }
        if (books[kind]) throw new Error(`دو فایل «${TP.catalogKindFa[kind]}» انتخاب شده: «${names[kind]}» و «${f.name}».`);
        books[kind] = wb; names[kind] = f.name;
      }
      const missing = Object.keys(TP.catalogKindFa).filter((k) => !books[k]);
      if (missing.length) {
        throw new Error(`این فایل‌ها کم است: ${missing.map((k) => `«${TP.catalogKindFa[k]}»`).join("، ")}.`
          + (unknown.length ? `\nشناخته نشد: ${unknown.join("، ")}` : "") + "\n\nهر چهار فایل را با هم انتخاب کنید.");
      }
      busy.set("اتصال فایل‌ها به هم…");
      await new Promise((r) => setTimeout(r, 30));   /* تا پیام پیش از کار سنگینِ همگام نقش ببندد */
      out = TP.buildCatalog(books, (t) => busy.set(esc(t)));
    } catch (e) { busy.close(); return TP.modal("فایل‌ها خوانده نشدند", esc(e.message).replace(/\n/g, "<br>"), null, "باشد", ""); }
    busy.close();

    const plan = previewPlan(out.fp), st = out.stats;
    if (Object.values(plan).every((p) => p === "skip")) {
      return TP.modal("همین فایل‌ها از قبل بارگذاری شده‌اند", "هیچ چیزی عوض نشده است؛ چیزی نوشته نشد و سهمیهٔ دیتابیس هم مصرف نشد.", null, "باشد", "");
    }
    const rowsOf = (g) => TP.catalogGroups[g].reduce((n, t) => n + out.tables[t].length, 0);
    const est = Object.entries(plan).reduce((n, [g, p]) => n + (p === "skip" ? 0 : rowsOf(g)), 0);
    const line = (g) => `<tr><td class="rt">${GROUP_FA[g]}</td><td>${PLAN_FA[plan[g]]}</td><td class="num">${plan[g] === "skip" ? "—" : (plan[g] === "append" ? "حداکثر " : "") + M(rowsOf(g))}</td></tr>`;
    TP.modal("بارگذاری سوابق و فهرست اقلام", `
      <table class="tp-mx" style="width:100%;margin-bottom:10px"><thead><tr><th class="rt">بخش</th><th>وضعیت</th><th>نوشتن</th></tr></thead>
        <tbody>${Object.keys(plan).map(line).join("")}</tbody></table>
      ${M(st.rows)} ردیف خرید · ${M(st.suppliers)} تأمین‌کننده (${M(st.graded)} با کد و رده) · ${M(st.items)} قلم در ${M(st.heads)} نوع · ${M(st.layers)} لایهٔ ویژگی
      ${st.skipped ? `<br><span class="dim">${M(st.skipped)} ردیف بی‌تأمین‌کننده کنار گذاشته می‌شود.</span>` : ""}
      ${st.noHead ? `<br><span style="color:#fcd34d">${M(st.noHead)} ردیف کدی دارند که در فهرست اقلام نیست؛ در «عین قلم» و «نوع قلم» نمی‌آیند.</span>` : ""}
      ${st.norm ? `<br><br><span class="dim" style="font-size:.88rem">${normLine(st.norm)}</span>` : ""}
      ${est > DAILY_WRITES * 0.9 ? `<br><br><span style="color:#fcd34d"><b>حدود ${M(est)} نوشتن</b> — نزدیک یا بیش از سقف روزانهٔ دیتابیس (${M(DAILY_WRITES)}). اگر وسط کار تمام شد، فردا همین فایل‌ها را دوباره بارگذاری کنید تا ادامه یابد.</span>` : ""}
      <br><br>ارسال چند دقیقه طول می‌کشد و در این مدت پنجره را نبندید. تا پایان کار، سوابق قبلی سر جایش است.`,
    () => importCatalog(out, names), "بارگذاری کن");
  }

  async function importCatalog(out, names) {
    const busy = TP.busy("بارگذاری سوابق و فهرست اقلام…", "شروع…");
    let written = 0, ignored = 0;
    try {
      const beg = await TP.api("/catalog/begin", { body: { fp: out.fp, meta: out.meta, stats: out.stats, files: names, filename: names.history } });
      if (beg.skipped) { busy.close(); await loadHist(); return TP.modal("چیزی برای نوشتن نبود", "این فایل‌ها دقیقاً همان داده‌های موجودند.", null, "باشد", ""); }
      for (const [g, tables] of Object.entries(TP.catalogGroups)) {
        if (beg.plan[g] === "skip") continue;
        for (const t of tables) {
          let sent = 0;
          for (const part of TP.chunkRows(out.tables[t])) {
            const r = await TP.api("/catalog/chunk", { body: { import_id: beg.import_id, table: t, rows: part } });
            written += r.inserted || 0; ignored += r.ignored || 0; sent += part.length;
            busy.set(`${TP.catalogTableFa[t]}: ${M(sent)} از ${M(out.tables[t].length)}<br><span class="dim">${M(written)} ردیف نوشته شد${ignored ? ` · ${M(ignored)} از قبل بود` : ""}</span>`);
          }
        }
      }
      busy.set("جابه‌جایی جدول‌ها و آمار مرجع…");
      const fin = await TP.api("/catalog/finish", { body: { import_id: beg.import_id, writes: written } });
      busy.close();
      await loadHist();
      TP.modal("سوابق و فهرست اقلام بارگذاری شد", `<b>${M(written)}</b> ردیف نوشته شد${ignored ? ` و <b>${M(ignored)}</b> ردیف چون از قبل بود دوباره نوشته نشد` : ""}${beg.resumed ? " (ادامهٔ بارگذاری نیمه‌کارهٔ قبلی)" : ""}.
        <br>اکنون <b>${M(fin.stats.rows)}</b> ردیف خرید · <b>${M(fin.stats.suppliers)}</b> تأمین‌کننده · <b>${M(fin.stats.codes)}</b> کد قلم · بازه ${ymFa(fin.stats.minYm)} تا ${ymFa(fin.stats.maxYm)}.`, null, "باشد", "");
    } catch (e) {
      busy.close(); await loadHist();
      TP.modal("بارگذاری کامل نشد", `${esc(e.message).replace(/\n/g, "<br>")}<br><br>${M(written)} ردیف تا این‌جا نوشته شد و سوابق قبلی هنوز سر جایش است.
        اگر سهمیهٔ روزانهٔ دیتابیس تمام شده، فردا همین چهار فایل را دوباره بارگذاری کنید؛ از همان‌جا ادامه می‌یابد.`, null, "باشد", "");
    }
  }


  function vFoot() {
    const n = readyAssignments().length;
    return `<div class="tp-foot"><button class="tp-btn primary" data-dispatch ${n ? "" : "disabled"}>تأیید نهایی و ارسال (${n})</button>
      <span class="hint">${n ? "ارسال، ساعت‌شمار مهلت کارشناس را شروع می‌کند و اعلان می‌رود." : "برای ارسال، کارشناس و مهلت را کامل کنید."}</span>
      <span class="legend"><span><i class="b-empty"></i>در مهلت</span><span><i class="b-warn"></i>از آستانه گذشت</span><span><i class="b-late"></i>از آستانه بعدی هم گذشت</span><span><i class="b-over"></i>مهلت تمام شد</span><span><i class="b-done"></i>انجام شد</span><span><i class="b-muted"></i>هشدار خاموش</span><span><i class="b-idle"></i>ارسال‌نشده</span></span></div>`;
  }

  /* ---------- تنظیم اعلانات (مهر ۱۴۰۵): نوارِ آستانه‌ها با دستگیره‌های کشیدنی، کلیدها و دایره‌های چرخان ----------
     هر دستگیره آستانهٔ یک مرحله است (درصدی از مهلتِ کارشناس) و فقط میانِ همسایه‌هایش جابه‌جا می‌شود — پس آستانه‌ها
     همیشه صعودی و میان ۱ تا ۱۰۰ می‌مانند و خطای «صعودی نیست» دیگر پیش نمی‌آید. */
  const STAGE_C = ["#60a5fa", "#a78bfa", "#2dd4bf", "#fbbf24", "#f472b6", "#f87171"];
  const SAVED = `<span class="tp-saved" data-autosaved>${"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M5 12.5l4.5 4.5L19 7\"/></svg>"}<span>ذخیرهٔ خودکار</span></span>`;
  const thrList = () => (settings().thresholds || []).map((x) => (x === "" || x == null ? null : +x));
  function vAlerts() {
    const s = settings(), ticks = Array.isArray(s.mgrStages) && s.mgrStages.length === 6 ? s.mgrStages : [true, false, false, false, true, true];
    const T = thrList(), points = TP.STAGES.map((st, i) => ({ label: st, value: T[i], color: STAGE_C[i] }));
    const knob = (k, label, unit, min, max) => TP.ui.knob({ attrs: `data-al="${k}"`, value: +s[k] || 0, min, max: Math.max(max, +s[k] || 0), unit, label });
    return `<div class="al-wrap ${TP.ui.once("mgr.alerts")}">
      <section class="tp-box al-main"><div class="tp-box-h"><span class="bi">${TP.ui.ICON.bell}</span><h2>آستانه‌های هشدار</h2><span class="sub">دستگیره‌ها را روی مهلت بکشید</span>${TP.ui.info("manager.alerts", "راهنمای اعلانات")}<span class="end">${SAVED}</span></div>
        ${TP.ui.track({ attrs: "data-thr-track", points })}
        <div class="al-stages">${points.map((p, i) => `<div class="al-st ${p.value == null ? "off" : ""}" style="--c:${p.color};--i:${i}">
            <div class="al-sth"><i class="no">${M(i + 1)}</i><b>${esc(p.label)}</b><span class="al-v" data-thr-v="${i}">${p.value == null ? "خاموش" : `${M(p.value)}٪`}</span></div>
            ${TP.ui.switchEl({ attrs: `data-thr-on="${i}"`, on: p.value != null, label: "هشدار مهلت" })}
            ${TP.ui.switchEl({ attrs: `data-mstage="${i}"`, on: !!ticks[i], label: "اعلان تلگرام به من" })}</div>`).join("")}</div></section>
      <section class="tp-box al-rules"><div class="tp-box-h"><span class="bi">${TP.ui.ICON.settings}</span><h2>قواعدِ کار</h2><span class="sub">دایره را بچرخانید یا − و + بزنید</span></div>
        <div class="al-knobs">${knob("dispatchDays", "مهلتِ ارسال توسط مدیر", "روز کاری", 0, 10)}${knob("minSuppliers", "حداقل تأمین‌کننده برای هر قلم", "تأمین‌کننده", 1, 10)}${knob("capacity", "ظرفیتِ درخواستِ باز هر کارشناس", "درخواست", 1, 40)}</div></section></div>`;
  }

  /* ---------- ارجاع و مهلت هوشمند (مهر ۱۴۰۵): کارتی، با لغزنده، دایره، شمارنده و امتیازِ نقطه‌ای ---------- */
  const guildKeys = () => GROUPS().map((g) => ({ key: g.code, name: g.name, title: `${g.name} — کد ${g.code}${g.n ? ` · ${g.n} طبقه` : ""}` }));
  const projKeys = () => projectKeys().map((p) => ({ key: p, name: p.length > 30 ? p.slice(0, 29) + "…" : p, title: p }));
  const opSeg = (attr, k, v, ops) => `<div class="sm-op" role="group" aria-label="عملگر">${ops.map((o) => `<button type="button" class="${o === v ? "on" : ""}" data-${attr}="${k}" data-v="${o}" aria-pressed="${o === v ? "true" : "false"}">${o}</button>`).join("")}</div>`;
  const avOf = (e, cls) => `<span class="ex-av ${cls || "sm"}" style="--av:${TP.ui.avColor(e.name)}" aria-hidden="true">${esc(TP.ui.avInitial(e.label || e.name))}</span>`;
  const hero = (icon, title, sub, actions) => `<section class="tp-box sm-hero"><span class="bi big">${TP.ui.ICON[icon]}</span><div class="sm-ht"><h2>${title}</h2><span class="sub">${sub}</span></div><span class="end">${actions}</span></section>`;
  function vAssign() {
    const E = activeExperts(), A = settings().assign, L = PL().limitsOf(A);
    const pend = S.data.requests.filter((r) => unassignedOpen(r).length);
    needWorkload(); needAxes();
    const P = WL && AX ? planAssign(pend) : null;
    const wa = +A.a || 0, wb = +A.b || 0, wc = +A.c || 0, wsum = wa + wb + wc || 1;
    const pctOf = (x, cap) => (cap ? Math.round(100 * x / cap) : 0);
    const preview = WL_ERR || AX_ERR ? `<div class="chip warn">${esc(WL_ERR || AX_ERR)}</div>`
      : !P ? `<div class="sm-wait"><span class="tp-spin"></span>در حال خواندن بار فعلی کارشناسان…</div>`
      : `${P.over ? `<div class="chip warn" style="margin-bottom:10px">⚠ ${M(P.over)} درخواست از سقف همه گذشت و به کم‌بارترین رسید</div>` : ""}
        <div class="sm-exs">${E.map((e, i) => {
          const b = P.before.get(e.id), a2 = P.after.get(e.id), cap = P.cap.get(e.id), add = P.plan.filter((p) => p.expert.id === e.id);
          const pb = pctOf(b.effort, cap), pa = pctOf(a2.effort, cap), full = a2.reqs >= L.maxReq || a2.items >= L.maxItems;
          return `<div class="sm-ex ${add.length ? "has" : ""} ${full ? "full" : ""}" style="--i:${Math.min(i, 14)}"><header>${avOf(e)}<b>${esc(e.label || e.name)}</b><span class="sm-pct ${pa >= 100 ? "over" : pa >= 80 ? "hi" : ""}">${M(add.length ? pa : pb)}٪</span></header>
            <div class="sm-bar" title="اشغال: ${M(pb)}٪${add.length ? ` ← ${M(pa)}٪` : ""}"><i class="now" style="--w:${Math.min(100, pb)}%"></i>${add.length ? `<i class="add" style="--s:${Math.min(100, pb)}%;--w:${Math.max(0, Math.min(100, pa) - Math.min(100, pb))}%"></i>` : ""}</div>
            <div class="sm-nums"><span>درخواست <b>${M(b.reqs)}${add.length ? `→${M(a2.reqs)}` : ""}</b><em>/${M(L.maxReq)}</em></span><span>قلم <b>${M(b.items)}${add.length ? `→${M(a2.items)}` : ""}</b><em>/${M(L.maxItems)}</em></span><span>ظرفیت <b>${cap.toFixed(1)}</b></span></div>
            ${add.length ? `<div class="sm-adds">${add.slice(0, 8).map((p) => `<span class="chip num ${p.over ? "warn" : "info"}" title="${esc(p.job.project)} · ${M(p.items)} قلم${p.over ? " · بیش از سقف" : ""}">${p.over ? "⚠ " : ""}${esc(p.id)}</span>`).join("")}${add.length > 8 ? `<span class="dim">+${M(add.length - 8)}</span>` : ""}</div>` : ""}</div>`;
        }).join("")}</div>`;
    const kind = S.smKind === "project" ? "project" : "guild", keys = kind === "guild" ? guildKeys() : projKeys();
    const ex = E.find((x) => x.id === S.smEx) || E[0];
    const rk = (k) => `${ex.id}|${kind}|${k.key}`;
    const knobL = (k, label, min, max, step) => TP.ui.knob({ attrs: `data-asg-knob="${k}"`, value: L[k], min, max: Math.max(max, L[k]), step, unit: k === "maxReq" ? "درخواست" : "قلم", label });
    return `<div class="sm-wrap ${TP.ui.once("mgr.asg")}">
      ${hero("users", "ارجاع هوشمند", pend.length ? `${M(pend.length)} درخواستِ بی‌کارشناس روی میز` : "همهٔ درخواست‌ها کارشناس دارند",
        `${SAVED}${TP.ui.info("manager.asg", "راهنمای ارجاع هوشمند")}<button class="tp-btn primary" data-apply-asg ${pend.length && P ? "" : "disabled"}>${TP.ui.ICON.check} اعمال پیشنهاد (${M(pend.length)})</button>`)}
      <div class="sm-grid">
        <section class="tp-box"><div class="tp-box-h"><span class="bi">${TP.ui.ICON.settings}</span><h3>وزنِ معیارها</h3></div>
          <div class="sm-mix" aria-hidden="true"><i class="a" style="--w:${wa / wsum * 100}%"></i><i class="b" style="--w:${wb / wsum * 100}%"></i><i class="c" style="--w:${wc / wsum * 100}%"></i></div>
          <div class="sm-w">
            <div class="sm-wr a">${TP.ui.range({ attrs: 'data-asg="a"', value: wa, min: 0, max: 100, step: 5, label: "تخصص در گروه اصناف", unit: "٪" })}</div>${opSeg("asg-op", "op1", A.op1, ["+", "−"])}
            <div class="sm-wr b">${TP.ui.range({ attrs: 'data-asg="b"', value: wb, min: 0, max: 100, step: 5, label: "سابقه در این پروژه", unit: "٪" })}</div>${opSeg("asg-op", "op2", A.op2, ["+", "−"])}
            <div class="sm-wr c">${TP.ui.range({ attrs: 'data-asg="c"', value: wc, min: 0, max: 100, step: 5, label: "جریمهٔ بار کاری", unit: "٪" })}</div></div></section>
        <section class="tp-box"><div class="tp-box-h"><span class="bi">${TP.ui.ICON.box}</span><h3>سقفِ بارِ هر کارشناس</h3></div>
          <div class="al-knobs">${knobL("maxReq", "درخواستِ باز", 1, 40, 1)}${knobL("maxItems", "قلمِ باز", 5, 300, 5)}</div></section></div>
      <section class="tp-box"><div class="tp-box-h"><span class="bi">${TP.ui.ICON.users}</span><h3>پیش‌نمایش توزیع</h3><span class="sub">${P && P.plan.length ? `با فرض تأیید همهٔ ${M(P.plan.length)} پیشنهاد` : "بار فعلی"}</span></div>${preview}</section>
      <section class="tp-box"><div class="tp-box-h"><span class="bi">★</span><h3>امتیازِ کارشناسان</h3><span class="sub">۱ تا ۵ — روی نقطه‌ها بزنید</span>
          <span class="end"><div class="tp-seg sm" role="tablist">${[["guild", "گروه اصناف"], ["project", "پروژه"]].map(([k2, l]) => `<button type="button" role="tab" class="${kind === k2 ? "on" : ""}" aria-selected="${kind === k2}" data-sm-kind="${k2}">${l}</button>`).join("")}</div></span></div>
        ${ex ? `<div class="sm-expick" data-ghost-group>${E.map((e) => `<button type="button" class="sm-exb ${e.id === ex.id ? "on" : ""}" aria-pressed="${e.id === ex.id}" data-sm-ex="${e.id}">${avOf(e)}<span>${esc(e.label || e.name)}</span></button>`).join("")}</div>
        <div class="sm-keys">${keys.map((k2) => `<div class="sm-key"><span title="${esc(k2.title || k2.name)}">${esc(k2.name)}</span>${TP.ui.rating({ attrs: `data-score="${esc(rk(k2))}"`, value: scoreOf(ex.id, kind, k2.key), label: `${ex.label || ex.name} — ${k2.name}` })}</div>`).join("")
          || `<div class="chip warn">${kind === "guild" ? "فهرست اصناف در دیتابیس نیست؛ فایل‌های مرجع را در «سوابق تأمین» بارگذاری کنید." : "پروژه‌ای تعریف نشده است."}</div>`}</div>`
          : `<div class="dim">کارشناس فعالی نیست.</div>`}</section></div>`;
  }

  /* ---------- مهلت هوشمند ---------- */
  function vDeadline() {
    const E = activeExperts(), D = settings().deadline;
    const list = S.data.requests.flatMap((r) => r.assignments.filter((a) => !a.dispatched_at && !(Number(a.days) > 0)).map((a) => ({ r, a })));
    needWorkload(); needAxes();
    const plans = WL && AX ? planDeadlines(list) : [];
    const x0 = plans[0];
    const term = (k, label, step, unit) => `<div class="dl-term"><small>${label}</small>${TP.ui.stepper({ attrs: `data-dl="${k}"`, value: +D[k] || 0, min: 0, max: Math.max(60, +D[k] || 0), step, unit, label })}</div>`;
    const OPS = ["×", "÷", "+", "−"];
    const tab = S.dlTab || "speed";
    const coef = tab === "speed" ? E.map((x) => ({ attrs: `data-sp="${x.id}"`, v: +x.speed || 1, max: 3, name: x.label || x.name, av: avOf(x) }))
      : tab === "guild" ? GROUPS().map((g) => ({ attrs: `data-cw="${esc(g.code)}"`, v: weightOf("guild", g.code), max: 5, name: g.name, sub: `کد ${g.code}` }))
      : projectKeys().map((p) => { const x = PROJECTS().find((y) => y.name === p) || {}; return { attrs: `data-pw="${esc(p)}"`, v: weightOf("project", p), max: 5, name: p, sub: [x.city, x.manager].filter(Boolean).join(" · ") }; });
    const preview = WL_ERR || AX_ERR ? `<div class="chip warn">${esc(WL_ERR || AX_ERR)}</div>`
      : !WL || !AX ? `<div class="sm-wait"><span class="tp-spin"></span>در حال خواندن بار فعلی کارشناسان…</div>`
      : plans.length ? `<div class="dl-prev">${plans.slice(0, S.dlMore ? 200 : 24).map((x, i) => `<div class="dl-p" style="--i:${Math.min(i, 14)}"><div class="dl-pd"><b>${M(x.days)}</b><small>روز</small></div>
            <div class="dl-pt"><b class="num">${esc(x.r.id)}</b><span>${avOf(x.e)} ${esc(x.e.label || x.e.name)}</span><em>${M(x.items)} قلم · اشغال ${M(Math.round(x.pct))}٪${x.busy > 1 ? ` (×${x.busy.toFixed(2)})` : ""}</em></div></div>`).join("")}</div>
          ${plans.length > 24 && !S.dlMore ? `<button class="tp-btn sm" data-dl-more style="margin-top:10px">همهٔ ${M(plans.length)} ارجاع</button>` : ""}`
      : `<div class="dim">ارجاعِ ارسال‌نشدهٔ بی‌مهلتی نیست.</div>`;
    return `<div class="sm-wrap ${TP.ui.once("mgr.dl")}">
      ${hero("clock", "مهلت هوشمند", list.length ? `${M(list.length)} ارجاعِ ارسال‌نشدهٔ بی‌مهلت` : "همهٔ ارجاع‌های ارسال‌نشده مهلت دارند",
        `${SAVED}${TP.ui.info("manager.dl", "راهنمای مهلت هوشمند")}<button class="tp-btn primary" data-apply-dl ${list.length && WL && AX ? "" : "disabled"}>${TP.ui.ICON.check} اعمال روی ${M(list.length)} ارجاع</button>`)}
      <section class="tp-box"><div class="tp-box-h"><span class="bi">${TP.ui.ICON.settings}</span><h3>فرمولِ مهلت</h3><span class="sub">− و + را بزنید یا نگه دارید</span></div>
        <div class="dl-formula"><span class="eq">مهلت =</span>${term("base", "پایه", 0.5, "روز")}${opSeg("dl-op", "op1", D.op1, OPS)}${term("we", "ضریب کارشناس", 0.1)}${opSeg("dl-op", "op2", D.op2, OPS)}${term("wp", "ضریب پروژه", 0.1)}${opSeg("dl-op", "op3", D.op3, OPS)}${term("wi", "ضریب گروه اصناف", 0.1)}<span class="eq">× √اقلام × اشغال</span></div>
        ${x0 ? `<div class="dl-sample">نمونه — <b class="num">${esc(x0.r.id)}</b> · ${esc(x0.e.label || x0.e.name)}: ${x0.base.toFixed(2)} × ${x0.size.toFixed(2)} × ${x0.busy.toFixed(2)} ⇒ <b>${M(x0.days)} روز کاری</b></div>` : ""}</section>
      <section class="tp-box"><div class="tp-box-h"><span class="bi">${TP.ui.ICON.clock}</span><h3>پیش‌نمایش مهلت‌ها</h3></div>${preview}</section>
      <section class="tp-box"><div class="tp-box-h"><span class="bi">${TP.ui.ICON.data}</span><h3>ضریب‌ها</h3>
          <span class="end"><div class="tp-seg sm" role="tablist">${[["speed", "سرعت کارشناسان"], ["guild", "گروه‌های اصناف"], ["project", "پروژه‌ها"]].map(([k, l]) => `<button type="button" role="tab" class="${tab === k ? "on" : ""}" aria-selected="${tab === k}" data-dl-tab="${k}">${l}</button>`).join("")}</div></span></div>
        <div class="dl-coefs">${coef.map((c) => `<div class="dl-c">${c.av || ""}${TP.ui.range({ attrs: c.attrs, value: c.v, min: 0.1, max: Math.max(c.max, c.v), step: 0.1, label: c.name })}${c.sub ? `<small>${esc(c.sub)}</small>` : ""}</div>`).join("")
          || `<div class="chip warn">فهرست اصناف در دیتابیس نیست؛ فایل‌های مرجع را در «سوابق تأمین» بارگذاری کنید.</div>`}</div></section></div>`;
  }

  /* ---------- اقلام و کدها (کد واقعی راهکاران) — کارتی، با جستجو و گروه ---------- */
  function vNorm() {
    needAxes();
    const st = S.nm;
    const seen = new Map();
    S.data.requests.forEach((r) => r.items.forEach((it) => { const k = it.code || it.title; if (!seen.has(k)) seen.set(k, { code: it.code, title: it.title, unit: it.unit, n: 0, g: it.g || "" }); seen.get(k).n++; }));
    const list = [...seen.values()];
    const isMisc = (x) => !x.g || x.g === PL().MISC_GUILD;
    const known = list.filter((x) => !isMisc(x)).length, pct = list.length ? Math.round(100 * known / list.length) : 0;
    const byG = new Map(); list.forEach((x) => { const g = isMisc(x) ? "" : x.g; byG.set(g, (byG.get(g) || 0) + 1); });
    const gs = [...byG].filter(([g]) => g).sort((a, b) => b[1] - a[1]);
    const shown = list.filter((x) => (!st.q || TP.hit(x.title, st.q) || TP.hit(x.code || "", st.q)) && (st.g === "*" ? true : st.g === "" ? isMisc(x) : !st.g || x.g === st.g))
      .sort(st.sort === "code" ? (a, b) => String(a.code || "").localeCompare(String(b.code || "")) : st.sort === "title" ? (a, b) => a.title.localeCompare(b.title, "fa") : (a, b) => b.n - a.n);
    const ring = `<svg class="nm-ring" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.9" class="bg"/><circle cx="18" cy="18" r="15.9" class="fg" style="--p:${pct}"/></svg>`;
    const pill = (g, label, n) => `<button type="button" class="tp-pill ${st.g === g ? "on" : ""}" data-nmg="${esc(g)}">${esc(label)} <span class="n">${M(n)}</span></button>`;
    return `<div class="nm-wrap ${TP.ui.once("mgr.norm")}">
      <section class="tp-box nm-hero"><div class="nm-rw">${ring}<b>${M(pct)}٪</b></div><div class="sm-ht"><h2>اقلام و کدها</h2><span class="sub">${M(known)} از ${M(list.length)} قلمِ میز در فهرست اصناف پیدا شد</span></div>
        <div class="tp-stats nm-st">${TP.ui.stat({ label: "قلمِ یکتا", value: M(list.length), icon: "box" })}${TP.ui.stat({ label: "در فهرست اصناف", value: M(known), icon: "check", tone: "ok" })}${TP.ui.stat({ label: "متفرقه", value: M(list.length - known), icon: "flag", tone: list.length - known ? "warn" : "ok" })}${TP.ui.stat({ label: "گروه اصناف", value: M(gs.length), icon: "data", tone: "info" })}</div>
        <span class="end">${TP.ui.info("manager.norm", "راهنمای اقلام و کدها")}</span></section>
      <section class="tp-box"><div class="nm-tools"><label class="ex-search">${TP.ui.ICON.search}<input class="tp-input" data-nmq value="${esc(st.q)}" placeholder="عنوان یا کد قلم…" aria-label="جستجوی قلم"></label>
          <div class="tp-seg sm" role="tablist">${[["n", "پرتکرار"], ["code", "کد"], ["title", "عنوان"]].map(([k, l]) => `<button type="button" role="tab" class="${st.sort === k ? "on" : ""}" aria-selected="${st.sort === k}" data-nmsort="${k}">${l}</button>`).join("")}</div>
          <span class="dim">${M(shown.length)} قلم</span></div>
        <div class="tp-pills nm-groups">${pill("*", "همه", list.length)}${gs.map(([g, n]) => pill(g, groupName(g), n)).join("")}${byG.get("") ? pill("", "متفرقه", byG.get("")) : ""}</div>
        <div class="nm-grid">${shown.slice(0, st.limit).map((x, i) => `<div class="nm-card ${isMisc(x) ? "misc" : ""}" style="--i:${Math.min(i, 16)}"><div class="nm-ch"><span class="nm-code">${esc(x.code || "—")}</span><span class="nm-n" title="تکرار در میز">×${M(x.n)}</span></div>
            <div class="nm-tt" title="${esc(x.title)}">${esc(x.title)}</div><div class="nm-cf">${x.unit ? `<span class="chip">${esc(x.unit)}</span>` : ""}<span class="chip ${isMisc(x) ? "warn" : "info"}" title="${esc(x.g || "")}">${esc(groupName(x.g))}</span></div></div>`).join("")
          || `<div class="dim">قلمی با این جستجو نیست.</div>`}</div>
        ${shown.length > st.limit ? `<button class="tp-btn sm" data-nm-more style="margin-top:12px">${M(Math.min(120, shown.length - st.limit))} قلم بیشتر</button>` : ""}</section></div>`;
  }

  /* ---------- تصمیم‌ها و رویدادها ---------- */
  /* «انجام دستی» (فاز ۴ب): چند قلم و علتِ کارشناس — با رد، اقلام دستِ کارشناس هوشمند می‌مانند */
  /* «👁 حالت تأیید» (فاز ۴ب گام ۴): چند قلم و توضیحِ کارشناس — با رد، کارشناس هوشمند بی تأیید پیش می‌رود */
  function decWhy(d) {
    if (!["manual", "supervise"].includes(d.action)) return "";
    let p = {}; try { p = JSON.parse(d.payload_json || "{}"); } catch (_) { /* بی بدنه */ }
    return `<div class="dim" style="margin-top:4px">${M((p.item_ids || []).length)} قلم ${d.action === "manual" ? "به‌جای کارشناس هوشمند با خودِ کارشناس" : "با «👁 حالت تأیید»: کارشناس هوشمند اول به کارشناس پیشنهاد می‌کند"}${p.reason ? ` — علت: ${esc(p.reason)}` : ""}</div>`;
  }
  const KIND = { dispatch: "ارسال", reassign: "تغییر کارشناس", hold: "تعلیق", stop: "توقف", closed: "خاتمه", close: "خاتمه", open: "بازگشت به جریان", import: "بارگذاری فایل", commission: "جدول کمیسیون", decision_requested: "درخواست تصمیم کارشناس", ai_tick: "تیکِ هوشمند / دستی", ai_manual: "انجام دستیِ اقلام", ai_modes: "حالتِ اقلامِ کارشناس هوشمند", ai_start: "🚀 شروعِ قلم (کارشناس هوشمند)", ai_pick_more: "📨 دعوت از انتخاب‌های تازه", item_terms: "📋 شرایط خریدِ قلم",
    ai_sup: "تیکِ «👁 حالت تأیید»", ai_sup_item: "«👁 حالت تأیید»ِ اقلام", ai_prop_ok: "✅ تأییدِ پیشنهادِ کارشناس هوشمند", ai_prop_no: "❌ ردِ پیشنهادِ کارشناس هوشمند",
    decision_rejected: "رد تصمیم کارشناس", unassign: "برداشتن کارشناس", delete: "حذف درخواست", viewed: "مشاهده", hist: "بررسی سوابق", smart: "جستجوی هوشمند",
    manual_quote: "استعلام دستی", quote_saved: "ثبت استعلام", quote_deleted: "حذف استعلام", proforma: "پیش‌فاکتور", extract_applied: "ثبت خوانده‌های پیش‌فاکتور",
    commission_table: "جدول کمیسیون", letter: "نامهٔ کمیسیون", deliver: "ارسال مدارک",
    commission_ok: "تأیید کمیسیون", quote_add: "افزودن استعلام", quote_final: "انتخابِ نهایی استعلام", rfq: "ارسال استعلام به تأمین‌کننده",
    code_reset: "🔑 کد ورود تازه", support_login: "ورود به پنل پشتیبانی", support_pass: "تغییر رمز پشتیبانی",
    ai_ask: "🤖 پرسش از کارشناس", ai_answer: "پاسخ به کارشناس هوشمند", ai_delivery: "📥 تحویلِ کارشناس هوشمند", ai_handover: "🤖 سپردن به کارشناس هوشمند", ai_handoff: "🤖 سپردن به کارشناس هوشمند",
    ai_reject: "ردِ تحویلِ کارشناس هوشمند", ai_rules: "قواعدِ حداقلِ استعلام", ai_sup_cfg: "تنظیمِ «👁 حالت تأیید»", ai_ranking: "رتبه‌بندی تأمین‌کنندگان", ai_switches: "کلیدهای کارشناس هوشمند",
    ai_on: "کارشناس هوشمند روشن شد", ai_off: "کارشناس هوشمند خاموش شد" };
  /* عامل رویداد: manager، system یا expert:<id> — کارشناس با نامش، نه شناسه */
  const actorName = (a) => { if (a === "manager") return "مدیر"; if (a === "system") return "سامانه"; if (a === "support") return "پشتیبانی"; if (a === "ai" || /^ai:/.test(a || "")) return "کارشناس هوشمند";
    const m = /^expert:(\d+)$/.exec(a || ""), e = m && S.data.experts.find((x) => x.id === +m[1]);
    return e ? esc(e.label || e.name) : esc(a); };
  /* notify رویداد همان است که واقعاً به صف تلگرام رفت (telegram) یا نرفت (none). تعلیق/توقف/خاتمه/
     بازگشتِ مدیر پیش از مهر ۱۴۰۵ بی‌آنکه پیامی برود telegram می‌نوشت؛ رویدادهای تازه‌اش notified
     (شمار کارشناسانِ خبرشده) هم دارند و فقط همان‌ها معتبرند (worker/api.js، setState). */
  const STATE_KINDS = new Set(["hold", "stop", "closed", "open"]);
  const notifyChip = (kind, p) => p.notify === "telegram" && (!STATE_KINDS.has(kind) || p.notified > 0) ? `<span class="chip info">با اعلان تلگرام</span>` : `<span class="chip">بدون اعلان تلگرام</span>`;
  /* تصمیم‌ها و رویدادها (مهر ۱۴۰۵): کارتِ هر تصمیمِ منتظر با تأیید/رد، و خطِ زمانِ رویدادها به زبانِ آدم —
     کلیدهای فنیِ رویداد (شناسه‌ها، JSON) نشان داده نمی‌شوند؛ فقط آنچه برای مدیر معنا دارد. */
  const DEC_FA = { hold: "تعلیق", stop: "توقف", end: "خاتمه", manual: "انجام دستی", supervise: "👁 حالت تأیید" };
  const DEC_TONE = { hold: "warn", stop: "bad", end: "info", manual: "info", supervise: "info" };
  const EV_CAT = [
    ["assign", "ارجاع و ارسال", "users", ["dispatch", "reassign", "unassign", "delete", "import", "close"]],
    ["state", "وضعیت و تصمیم", "flag", ["hold", "stop", "closed", "open", "decision_requested", "decision_rejected"]],
    ["work", "کارِ کارشناس", "file", ["viewed", "hist", "smart", "manual_quote", "quote_saved", "quote_deleted", "proforma", "extract_applied", "commission", "commission_table", "letter", "deliver", "item_terms"]],
    ["ai", "کارشناس هوشمند", "settings", null],
  ];
  const evCat = (k) => { for (const [c, , , ks] of EV_CAT) if (ks && ks.includes(k)) return c; return /^ai_/.test(k) ? "ai" : "other"; };
  const evIcon = (k) => { const c = EV_CAT.find((x) => x[0] === evCat(k)); return TP.ui.ICON[c ? c[2] : "clock"]; };
  const exById = (id) => { const e = S.data.experts.find((x) => x.id === +id); return e ? (e.label || e.name) : null; };
  const REASON_FA = { codes4: "یکسان‌سازیِ کدها به چهار رقم" };
  const SRC_FA = { import: "فایل روزانه", smart: "هوشمند", manual: "دستی", panel: "پنل", bot: "تلگرام", telegram: "تلگرام", web: "وب" };
  /** جزئیاتِ خوانا از payload: فقط کلیدهای شناخته‌شده؛ شناسه‌ها به نام */
  function evDetails(kind, p) {
    const out = [], add = (l, v) => { if (v != null && v !== "" && !(Array.isArray(v) && !v.length)) out.push(`${l}: <b>${v}</b>`); };
    if (p.from_expert_id || p.to_expert_id) add("کارشناس", `${esc(exById(p.from_expert_id) || "—")} ← ${esc(exById(p.to_expert_id) || "—")}`);
    else if (p.expert || p.expert_id || p.name) add("کارشناس", esc(p.expert || exById(p.expert_id) || p.name || ""));
    if (p.days) add("مهلت", `${M(p.days)} روز`);
    if (p.action) add("درخواستِ", esc(DEC_FA[p.action] || p.action));
    if (typeof p.on === "boolean") add("وضعیت", p.on ? "روشن" : "خاموش");
    if (p.source) add("منبع", esc(SRC_FA[p.source] || p.source));
    if (p.channel) add("از", esc(SRC_FA[p.channel] || p.channel));
    if (p.supplier || p.supplier_name) add("تأمین‌کننده", esc(p.supplier || p.supplier_name));
    if (p.commission_no) add("شمارهٔ کمیسیون", M(p.commission_no));
    const items = p.items || p.item_ids; if (Array.isArray(items)) add("اقلام", `${M(items.length)} قلم`); else if (typeof items === "number") add("اقلام", `${M(items)} قلم`);
    if (typeof p.eligible === "number") add("اقلامِ مجاز", M(p.eligible));
    if (typeof p.closeCandidates === "number") add("پیشنهادِ خاتمه", M(p.closeCandidates));
    if (typeof p.stateDrift === "number" && p.stateDrift) add("تغییرِ وضعیت", M(p.stateDrift));
    if (typeof p.expertDrift === "number" && p.expertDrift) add("تغییرِ کارشناس", M(p.expertDrift));
    if (p.rows) add("ردیف", M(p.rows));
    if (p.file || p.filename) add("فایل", esc(p.file || p.filename));
    if (p.title && typeof p.title === "string") add("قلم", esc(p.title));
    if (p.reason) add("علت", esc(REASON_FA[p.reason] || p.reason));
    if (p.note) add("یادداشت", esc(p.note));
    return out.join(" · ");
  }
  const dayOf = (ms) => String(TP.fmt(ms)).split(" — ")[0];
  const timeOf = (ms) => String(TP.fmt(ms)).split(" — ")[1] || "";
  function vLog() {
    const D = S.decisions, cat = S.evCat || "";
    const evs = S.events.filter((e) => !cat || evCat(e.kind) === cat);
    const groups = []; evs.forEach((e) => { const d = dayOf(e.at); const g = groups[groups.length - 1]; if (g && g[0] === d) g[1].push(e); else groups.push([d, [e]]); });
    const counts = {}; S.events.forEach((e) => { const c = evCat(e.kind); counts[c] = (counts[c] || 0) + 1; });
    const decCard = (d, i) => { const e = S.data.experts.find((x) => x.name === d.expert_name || x.label === d.expert_name) || { name: d.expert_name };
      return `<article class="lg-dec" style="--i:${Math.min(i, 10)}"><header>${avOf(e, "")}<div><b>${esc(d.expert_name)}</b><small>${esc(TP.fmt(d.requested_at))}</small></div>
          <span class="chip ${DEC_TONE[d.action] || "info"}">${esc(DEC_FA[d.action] || d.action)}</span></header>
        <div class="lg-req">${TP.ui.ICON.project}<span>درخواست <b class="num">${esc(d.request_id)}</b></span></div>${decWhy(d)}
        <footer><button class="tp-btn primary" data-dec="approve|${d.id}">${TP.ui.ICON.check} تأیید</button><button class="tp-btn" data-dec="reject|${d.id}">${TP.ui.ICON.x} رد</button></footer></article>`; };
    return `<div class="lg-wrap ${TP.ui.once("mgr.log")}">
      <section class="tp-box"><div class="tp-box-h"><span class="bi">${TP.ui.ICON.flag}</span><h2>تصمیم‌های در انتظار تأیید</h2><span class="chip ${D.length ? "warn" : "ok"}">${M(D.length)}</span>${TP.ui.info("manager.log", "راهنمای تصمیم‌ها")}</div>
        ${D.length ? `<div class="lg-decs">${D.map(decCard).join("")}</div>`
          : `<div class="lg-none">${TP.ui.ICON.check}<b>تصمیمی در انتظار نیست</b>${settings().approvalRequired ? "" : `<span>تأیید مدیر برای تصمیم کارشناس خاموش است</span>`}</div>`}</section>
      <section class="tp-box"><div class="tp-box-h"><span class="bi">${TP.ui.ICON.clock}</span><h2>رویدادهای اخیر</h2><span class="sub">${M(S.events.length)} رویداد</span>
          <span class="end"><button class="tp-icon-btn sm" data-load-events title="به‌روزرسانی" aria-label="به‌روزرسانی رویدادها">${TP.ui.ICON.refresh}</button></span></div>
        <div class="tp-pills lg-cats"><button type="button" class="tp-pill ${!cat ? "on" : ""}" data-evcat="">همه <span class="n">${M(S.events.length)}</span></button>
          ${EV_CAT.map(([c, l]) => counts[c] ? `<button type="button" class="tp-pill ${cat === c ? "on" : ""}" data-evcat="${c}">${l} <span class="n">${M(counts[c])}</span></button>` : "").join("")}
          ${counts.other ? `<button type="button" class="tp-pill ${cat === "other" ? "on" : ""}" data-evcat="other">دیگر <span class="n">${M(counts.other)}</span></button>` : ""}</div>
        ${groups.length ? `<div class="lg-tl">${groups.map(([d, list]) => `<div class="lg-day"><h4>${esc(d)}</h4>${list.map((e) => { let p = {}; try { p = JSON.parse(e.payload_json || "{}"); } catch (_) { /* خالی */ }
            const det = evDetails(e.kind, p), c = evCat(e.kind);
            return `<div class="lg-ev c-${c}"><span class="lg-ic">${evIcon(e.kind)}</span><div class="lg-eb"><div class="lg-et"><b title="${esc(e.kind)}">${KIND[e.kind] || "رویدادِ سامانه"}</b>${e.request_id ? `<span class="chip num">${esc(e.request_id)}</span>` : ""}${p.notify ? notifyChip(e.kind, p) : ""}</div>
              <div class="lg-ed"><span class="lg-who">${actorName(e.actor)}</span>${det ? ` · ${det}` : ""}</div></div><time>${esc(timeOf(e.at))}</time></div>`; }).join("")}</div>`).join("")}</div>`
          : `<div class="lg-none">${TP.ui.ICON.clock}<b>${S.events.length ? "رویدادی در این دسته نیست" : "رویدادی بارگیری نشده"}</b></div>`}</section></div>`;
  }

  /* ---------- گزارش‌ها ----------
     دو بخش: «وضعیت درخواست‌ها» (جدول با برش‌دهنده‌های وضعیت / طرف مقابل / کارشناس خرید، مثل فایل
     اکسل واحد، و برگهٔ «گزارش روزانه» با فیلتر ستون‌ها) و «گزارش سه ماهه» (تیک برگه‌ها، سال/فصل/ماه
     چندانتخابی، تیکِ کارشناسانِ همان دوره پیش از ساخت، پیش‌نمایش همان برگه‌ها و نمودارهایی که در
     فایل می‌رود). ساخت داده و فایل در worker/reports.js. */
  /* بازهٔ «وضعیت درخواست‌ها»: از ابتدای ماه جاری تا «تاکنون» — بایگانی بیست هزار درخواست دارد
     و بی بازه، پاسخ هم سنگین است هم بی‌فایده. مدیر هر دو سر بازه را عوض می‌کند؛ پایانِ خالی
     یعنی تاکنون. */
  const monthStart = () => { const [y, m] = TP.todayJ(); return `${y}/${String(m).padStart(2, "0")}/01`; };
  const RP = { part: "status", meta: null, metaLoading: false, status: null, loading: false, sheet: "general", sl: { 2: [], 7: [], 11: [] }, hidden: false, limit: 300,
    dq: ["", "", "", "", "", ""], dLimit: 300, pop: null, range: { from: monthStart(), to: "" }, rangeKey: "",
    season: { years: null, seasons: null, months: [], sheets: null, result: null, idx: 0, busy: false } };
  const rangeQs = () => `?from=${encodeURIComponent(RP.range.from || "")}&to=${encodeURIComponent(RP.range.to || "")}`;
  const SL = [[2, "وضعیت"], [7, "طرف مقابل"], [11, "کارشناس خرید"]];
  const RP_ST_ORDER = ["بسته شده", "تایید شده", "ثبت شده", "در جریان", "بررسی مجدد", "متوقف شده", "معلق"];
  const RP_MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
  const RP_SEASONS = ["بهار", "تابستان", "پاییز", "زمستان"];
  const RP_BLANK = "(blank)";
  const slKey = (v) => (v === "" || v == null ? RP_BLANK : String(v));

  async function loadRepMeta() {
    RP.metaLoading = true;
    try {
      RP.meta = await TP.api("/reports/meta");
      const s = RP.season;
      if (!s.years) { s.years = [RP.meta.today.year]; s.seasons = [Math.floor((RP.meta.today.month - 1) / 3) + 1]; }
      if (!s.sheets) s.sheets = RP.meta.sheets.map((x) => x.key);
      RP.metaFailed = false;
    } catch (e) { RP.err = e.message; RP.metaFailed = true; }
    RP.metaLoading = false; render();
  }
  /* خطا پرچمِ «ناموفق» می‌گذارد تا render خودکار دوباره نفرستد — وگرنه هر خطا (۴۰۱، ۵xx، قطعی) یک حلقهٔ
     بی‌پایان درخواست می‌شد که هر بار بازهٔ گزارش را از D1 می‌خواند. دوباره فقط با دکمه. */
  async function loadRepStatus() {
    RP.loading = true; RP.rangeKey = `${RP.range.from}|${RP.range.to}`;
    try { RP.status = await TP.api("/reports/status" + rangeQs()); RP.err = ""; RP.statusFailed = false; } catch (e) { RP.err = e.message; RP.statusFailed = true; }
    RP.loading = false; render();
  }
  /* دانلود فایل از مسیرهای گزارش — TP.api فقط JSON می‌خواند */
  async function repDownload(path, body, fallback) {
    const b = TP.busy("ساخت فایل اکسل…", "چند ثانیه طول می‌کشد.");
    try {
      const headers = { "X-Manager-Code": TP.manager.get() }; if (body) headers["Content-Type"] = "application/json";
      const res = await fetch((CFG.apiBase || "/tamin-poshtibani/api") + path, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
      if (!res.ok) { let msg = `خطای سرور ${res.status}`; try { msg = (await res.json()).error || msg; } catch (_) { /* متن غیر JSON */ } throw new Error(msg); }
      const m = /filename\*=UTF-8''([^;]+)/.exec(res.headers.get("content-disposition") || "");
      const blob = await res.blob(), link = document.createElement("a");
      link.href = URL.createObjectURL(blob); link.download = m ? decodeURIComponent(m[1]) : fallback;
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 5000);
      b.close();
    } catch (e) { b.close(); TP.modal("دانلود نشد", esc(e.message), null, "باشد", ""); }
  }

  /* برش‌دهنده‌ها مثل اکسل: هیچ انتخابی = همه؛ خانه‌ای که با فیلترِ برش‌دهنده‌های دیگر ردیفی ندارد کم‌رنگ می‌شود */
  const repRows = (except) => RP.status.general.filter((r) => SL.every(([c]) => c === except || !RP.sl[c].length || RP.sl[c].includes(slKey(r[c]))));
  function slicerItems(c) {
    const all = new Map(); RP.status.general.forEach((r) => all.set(slKey(r[c]), 0));
    repRows(c).forEach((r) => { const k = slKey(r[c]); all.set(k, all.get(k) + 1); });
    const keys = [...all.keys()].sort((a, b) => (a === RP_BLANK ? 1 : b === RP_BLANK ? -1 : c === 2 ? (RP_ST_ORDER.indexOf(a) + 99) % 99 - (RP_ST_ORDER.indexOf(b) + 99) % 99 || a.localeCompare(b, "fa") : a.localeCompare(b, "fa")));
    return keys.map((k) => ({ k, n: all.get(k) }));
  }
  const RP_GW = [8.66, 16.33, 10.33, 17.33, 20.44, 36.33, 16.33, 50.1, 10.44, 19.33, 26.44, 14.66];
  const RP_DW = [9.1, 20.1, 15.3, 21.4, 14.8, 17.2];
  const px = (w) => Math.round(w * 7 + 5);

  /* گزارش‌ها (مهر ۱۴۰۵): کارتی — بازه با چیپ و کلید، کارت‌برگِ هر وضعیت (کلیک = برش)، برش‌دهنده‌ها چیپی، جدول در «کاغذ» */
  const ST_TONE = { "بسته شده": "ok", "تایید شده": "info", "ثبت شده": "", "در جریان": "info", "بررسی مجدد": "warn", "متوقف شده": "bad", "معلق": "warn" };
  function vReports() {
    const part = RP.part;
    return `<div class="rp2 ${TP.ui.once("mgr.rep")}">
      <section class="tp-box sm-hero rp2-hero"><span class="bi big">${TP.ui.ICON.file}</span><div class="sm-ht"><h2>گزارش‌ها</h2><span class="sub">${part === "status" ? "وضعیتِ درخواست‌ها در یک بازه" : "گزارشِ دوره‌ای برای واحد"}</span></div>
        <span class="end"><div class="tp-seg" role="tablist"><button type="button" role="tab" class="${part === "status" ? "on" : ""}" aria-selected="${part === "status"}" data-rpart="status">وضعیت درخواست‌ها</button><button type="button" role="tab" class="${part === "season" ? "on" : ""}" aria-selected="${part === "season"}" data-rpart="season">گزارش سه ماهه</button></div>${TP.ui.info("manager.reports", "راهنمای گزارش‌ها")}</span></section>
      ${RP.err ? `<div class="chip bad" style="margin:0 0 10px">${esc(RP.err)}</div>` : ""}
      ${part === "status" ? vRepStatus() : vRepSeason()}</div>`;
  }

  /* بازهٔ گزارش وضعیت — تاریخ شروع و پایان از تقویم؛ پایانِ خالی یعنی «تاکنون» */
  function vRepRange() {
    const R = RP.range, stale = RP.status && RP.rangeKey !== `${R.from}|${R.to}`;
    const [y] = TP.todayJ(), quick = R.to ? "" : R.from === monthStart() ? "month" : R.from === `${y}/01/01` ? "year" : !R.from ? "all" : "";
    return `<section class="tp-box rp2-range"><span class="lab">${TP.ui.ICON.clock} بازه</span>
      <label class="rp2-date"><small>از</small><input class="tp-input date" data-rfrom value="${esc(R.from)}" placeholder="از ابتدا" readonly aria-label="از تاریخ"></label>
      <label class="rp2-date"><small>تا</small><input class="tp-input date" data-rto value="${esc(R.to)}" placeholder="تاکنون" readonly aria-label="تا تاریخ" ${R.to ? "" : "disabled"}></label>
      ${TP.ui.switchEl({ attrs: "data-rnow", on: !R.to, label: "تاکنون" })}
      <div class="tp-pills">${[["month", "ماه جاری"], ["year", "سال جاری"], ["all", "همه"]].map(([k, l]) => `<button type="button" class="tp-pill ${quick === k ? "on" : ""}" data-rquick="${k}">${l}</button>`).join("")}</div>
      <span class="spacer"></span><button class="tp-btn sm ${stale ? "primary" : ""}" data-rstatus-reload>${stale ? "نمایش این بازه" : `${TP.ui.ICON.refresh} به‌روزرسانی`}</button></section>`;
  }
  function vRepStatus() {
    const D = RP.status;
    if (!D) {
      if (!RP.loading && !RP.statusFailed) loadRepStatus();
      return vRepRange() + `<div class="lg-none">${RP.statusFailed ? `${TP.ui.ICON.x}<b>گزارش ساخته نشد</b><span>«به‌روزرسانی» را بزنید</span>` : `<span class="tp-spin"></span><b>در حال ساخت گزارش…</b>`}</div>`;
    }
    const R = D.range || {};
    /* کارت‌برگِ هر وضعیت: شمار با برش‌های دیگر؛ کلیک = برشِ «وضعیت» (همان برش‌دهندهٔ اکسل) */
    const st = slicerItems(2), sel = RP.sl[2];
    const tiles = `<div class="tp-stats rp2-tiles">${st.map((it) => `<button type="button" class="tp-stat ${ST_TONE[it.k] || ""} ${sel.includes(it.k) ? "on" : ""} ${it.n ? "" : "nodata"}" data-sl="2" data-k="${esc(it.k)}" aria-pressed="${sel.includes(it.k)}"><span class="sb"><small>${esc(it.k)}</small><b>${M(it.n)}</b></span></button>`).join("")}</div>`;
    return vRepRange() + `${tiles}
      <div class="rp2-tools"><div class="tp-seg sm" role="tablist">${[["general", "درخواست کلی"], ["daily", "گزارش روزانه"]].map(([k, l]) => `<button type="button" role="tab" class="${RP.sheet === k ? "on" : ""}" aria-selected="${RP.sheet === k}" data-rsheet="${k}">${l}</button>`).join("")}</div>
        ${RP.sheet === "general" ? TP.ui.switchEl({ attrs: "data-rhidden", on: RP.hidden, label: "ستون‌های پنهان فایل" }) : ""}
        <span class="spacer"></span><span class="dim">${esc(R.from ? `از ${R.from}` : "از ابتدا")} ${esc(R.to ? `تا ${R.to}` : "تاکنون")} · ${esc(TP.fmt(D.generatedAt))}</span>
        <button class="tp-btn sm primary" data-rstatus-xlsx>${TP.ui.ICON.upload} دانلود اکسل</button></div>
      ${D.capped ? `<div class="chip warn" style="margin-bottom:10px">فقط ${M(D.general.length)} درخواستِ تازه‌تر از ${M(D.total)} آمد — بازه را کوچک‌تر کنید</div>` : ""}
      ${RP.sheet === "general" ? vRepGeneral() : vRepDaily()}`;
  }
  function vRepGeneral() {
    const D = RP.status, rows = repRows(null);
    const cols = D.columns.map((h, i) => ({ h, i })).filter((x) => RP.hidden || !D.hidden.includes(x.i + 1));
    const any = SL.some(([c]) => RP.sl[c].length);
    const table = `<div class="rp-paper rp-scroll" data-keep-scroll><table class="rp-t rp-general"><colgroup>${cols.map((x) => `<col style="width:${px(RP_GW[x.i])}px">`).join("")}</colgroup>
      <thead><tr>${cols.map((x) => `<th class="${D.hidden.includes(x.i + 1) ? "hid" : ""}">${esc(x.h)}</th>`).join("")}</tr></thead>
      <tbody>${rows.slice(0, RP.limit).map((r) => `<tr>${cols.map((x) => `<td class="${x.i === 7 || x.i === 8 ? "w" : ""}${D.hidden.includes(x.i + 1) ? " hid" : ""}">${esc(r[x.i])}</td>`).join("")}</tr>`).join("")}
      ${rows.length ? "" : `<tr><td colspan="${cols.length}" class="rp-none">با این برش‌ها درخواستی نیست.</td></tr>`}</tbody></table>
      ${rows.length > RP.limit ? `<div class="rp-more"><button class="tp-btn sm" data-rmore>${M(Math.min(300, rows.length - RP.limit))} ردیف بیشتر</button> <span>${M(RP.limit)} از ${M(rows.length)} ردیف</span></div>` : ""}</div>`;
    const slicers = SL.filter(([c]) => c !== 2).map(([c, cap]) => {
      const items = slicerItems(c), sel = RP.sl[c];
      return `<section class="tp-box rp2-sl"><div class="tp-box-h"><h3>${cap}</h3><span class="end">${sel.length ? `<button class="tp-btn xs" data-slclear="${c}">پاک کردن</button>` : ""}</span></div>
        <div class="tp-pills">${items.map((it) => `<button type="button" class="tp-pill ${sel.includes(it.k) ? "on" : ""} ${it.n ? "" : "nodata"}" data-sl="${c}" data-k="${esc(it.k)}" title="${M(it.n)} درخواست">${esc(it.k)} <span class="n">${M(it.n)}</span></button>`).join("")}</div></section>`;
    }).join("");
    return `<div class="rp-count"><b>${M(rows.length)}</b> از ${M(D.general.length)} درخواست ${any ? `<button class="tp-btn xs" data-slall>پاک کردن همهٔ برش‌ها</button>` : ""}</div>
      <div class="rp2-grid">${table}<div class="rp2-sls">${slicers}</div></div>`;
  }
  function vRepDaily() {
    const D = RP.status, rows = D.daily.filter((r) => RP.dq.every((q, i) => !q || TP.hit(String(r[i] == null ? "" : r[i]), q)));
    return `<div class="rp-count"><b>${M(rows.length)}</b> از ${M(D.daily.length)} ارجاعِ ارسال‌شده · به ترتیب تاریخ تحویل</div>
      <div class="rp-paper rp-scroll" data-keep-scroll style="max-width:${RP_DW.reduce((a, w) => a + px(w), 0) + 180}px"><table class="rp-t rp-daily"><colgroup>${RP_DW.map((w) => `<col style="width:${px(w)}px">`).join("")}<col style="width:124px"></colgroup>
        <thead><tr>${D.dailyColumns.map((h) => `<th>${esc(h)}</th>`).join("")}<th></th></tr>
        <tr class="flt">${D.dailyColumns.map((_, i) => `<th>${i ? `<input class="tp-input" data-dq="${i}" value="${esc(RP.dq[i])}" placeholder="فیلتر" aria-label="فیلتر ${esc(D.dailyColumns[i])}">` : ""}</th>`).join("")}<th></th></tr></thead>
        <tbody>${rows.slice(0, RP.dLimit).map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join("")}<td></td></tr>`).join("")}
        ${rows.length ? "" : `<tr><td colspan="7" class="rp-none">ارجاعی با این فیلترها نیست.</td></tr>`}</tbody></table>
        ${rows.length > RP.dLimit ? `<div class="rp-more"><button class="tp-btn sm" data-dmore>${M(Math.min(300, rows.length - RP.dLimit))} ردیف بیشتر</button></div>` : ""}</div>`;
  }

  /* نام دوره — همان قاعدهٔ worker/reports.js:parsePeriod */
  function repMonths(s) { const set = new Set(s.months); (s.seasons || []).forEach((q) => { for (let m = (q - 1) * 3 + 1; m <= q * 3; m++) set.add(m); }); return set.size ? [...set].sort((a, b) => a - b) : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]; }
  function repPeriodLabel(s) {
    if (!s.years || !s.years.length) return "سالی انتخاب نشده";
    const months = repMonths(s); let rest = months.slice(); const parts = [];
    if (months.length === 12) parts.push("سال");
    else { for (let q = 1; q <= 4; q++) { const sm = [(q - 1) * 3 + 1, (q - 1) * 3 + 2, q * 3]; if (sm.every((m) => rest.includes(m))) { parts.push(`فصل ${RP_SEASONS[q - 1]}`); rest = rest.filter((m) => !sm.includes(m)); } } rest.forEach((m) => parts.push(RP_MONTHS[m - 1])); }
    const j = (a) => (a.length <= 1 ? a.join("") : a.slice(0, -1).join("، ") + " و " + a[a.length - 1]);
    /* سال عدد نیست که جداکنندهٔ هزارگان بگیرد («۱٬۴۰۴»)، و چند سالِ به‌هم‌چسبیده عدد نمی‌شود (NaN) */
    return `${j(parts)} ${[...s.years].sort((a, b) => a - b).join(" و ")}`;
  }
  function vRepSeason() {
    const meta = RP.meta, s = RP.season;
    if (!meta) {
      if (!RP.metaLoading && !RP.metaFailed) loadRepMeta();
      return RP.metaFailed ? `<div class="lg-none">${TP.ui.ICON.x}<b>سال‌ها و پروژه‌ها خوانده نشد</b><button class="tp-btn sm" data-rmeta-retry>تلاش دوباره</button></div>`
        : `<div class="lg-none"><span class="tp-spin"></span><b>در حال خواندن سال‌ها و پروژه‌ها…</b></div>`;
    }
    const tog = (attr, v, on, label, sub) => `<button type="button" class="rp2-tog ${on ? "on" : ""}" data-${attr}="${v}" aria-pressed="${on ? "true" : "false"}"><i class="ck">${TP.ui.ICON.check}</i><span><b>${label}</b>${sub ? `<small>${sub}</small>` : ""}</span></button>`;
    const R = s.result, sh = R && R.sheets[Math.min(s.idx, R.sheets.length - 1)];
    return `<div class="rp2-steps">
        <section class="tp-box rp2-step"><div class="tp-box-h"><span class="bi">۱</span><h3>برگه‌ها</h3><span class="sub">${M(s.sheets.length)} از ${M(meta.sheets.length)}</span></div>
          <div class="rp2-togs">${meta.sheets.map((x) => tog("rsh", x.key, s.sheets.includes(x.key), esc(x.name))).join("")}</div></section>
        <section class="tp-box rp2-step"><div class="tp-box-h"><span class="bi">۲</span><h3>دوره</h3><span class="end"><span class="rp-period">${esc(repPeriodLabel(s))}</span></span></div>
          <div class="rp2-prow"><span class="lab">سال</span><div class="tp-pills">${meta.years.map((y) => `<button type="button" class="tp-pill ${s.years.includes(y) ? "on" : ""}" data-ry="${y}">${y}</button>`).join("") || `<span class="dim">درخواستی در سامانه نیست</span>`}</div></div>
          <div class="rp2-prow"><span class="lab">فصل</span><div class="rp2-togs four">${RP_SEASONS.map((n, i) => tog("rq", i + 1, s.seasons.includes(i + 1), n, RP_MONTHS.slice(i * 3, i * 3 + 3).join("، "))).join("")}</div></div>
          <div class="rp2-prow"><span class="lab">ماه</span><div class="tp-pills">${RP_MONTHS.map((n, i) => `<button type="button" class="tp-pill ${s.months.includes(i + 1) ? "on" : ""}" data-rm="${i + 1}">${n}</button>`).join("")}</div></div></section>
        <section class="tp-box rp2-step rp2-go"><div class="tp-box-h"><span class="bi">۳</span><h3>ساخت</h3></div>
          <button class="tp-btn primary" data-rgen ${s.busy ? "disabled" : ""}>${s.busy ? `<span class="tp-spin"></span> در حال ساخت…` : "نمایش گزارش"}</button>
          <button class="tp-btn" data-rgenx ${s.busy ? "disabled" : ""}>${TP.ui.ICON.upload} دانلود اکسل</button>
          <button class="tp-btn sm" data-rproj>${TP.ui.ICON.project} پروژه‌ها و مدیران پروژه</button></section></div>
      ${R ? `<style>${R.css}</style>
        <section class="tp-box rp2-res"><div class="tp-box-h"><span class="bi">${TP.ui.ICON.file}</span><h3>گزارش ${esc(R.label)}</h3><span class="sub">مقایسه با «${esc(R.priorLabel)}» · ${M(R.workDays)} روز کاری</span>
            <span class="end">${R.picked && R.picked.n < R.picked.of ? `<span class="chip info">${M(R.picked.n)} از ${M(R.picked.of)} کارشناس</span>` : ""}${R.hasExpertAmounts ? "" : `<span class="chip warn" title="مبلغ فاکتورِ هر گروه نیاز به ستون «کارشناس خرید» در فایل سوابق دارد">مبلغ گروه‌ها ناقص</span>`}</span></div>
          <div class="tp-seg sm rp2-tabs" role="tablist">${R.sheets.map((x, i) => `<button type="button" role="tab" class="${i === s.idx ? "on" : ""}" aria-selected="${i === s.idx}" data-rtab="${i}">${esc(x.name)}</button>`).join("")}</div>
          ${(sh.notes || []).map((n) => `<div class="chip warn" style="margin:8px 0 0">${esc(n)}</div>`).join("")}
          <div class="rp-paper rp-scroll rp-book" data-keep-scroll>${sh.html}</div>
          ${sh.charts.length ? `<div class="rp-charts">${sh.charts.map((c) => `<div class="rp-chart">${c.svg}</div>`).join("")}</div>` : ""}</section>`
      : s.busy ? `<div class="lg-none"><span class="tp-spin"></span><b>در حال ساخت گزارش…</b></div>` : `<div class="lg-none">${TP.ui.ICON.file}<b>برگه‌ها و دوره را انتخاب کنید و «نمایش گزارش» را بزنید</b></div>`}`;
  }
  /* پیش از ساخت (تصمیم مدیر، مهر ۱۴۰۵): کارشناسانی که در این دوره در گزارش می‌آیند، هر کدام با تیک —
     پیش‌فرض همه — و گزارش فقط با تیک‌خورده‌ها ساخته می‌شود. خروجی: { ids: شناسهٔ تیک‌خورده‌ها، list: همهٔ
     کارشناسانِ دوره (برای جدول گروه‌بندی)، label: نام دوره }؛ null اگر مدیر انصراف داد؛ undefined اگر
     کارشناسی در دوره نیست (گزارش همان‌طور ساخته می‌شود). */
  async function pickExperts(body) {
    const b = TP.busy("خواندن کارشناسانِ این دوره…", esc(repPeriodLabel(RP.season)));
    let r;
    try { r = await TP.api("/reports/season/experts", { body }); }
    catch (e) { b.close(); TP.modal("خطا", esc(e.message), null, "باشد", ""); return null; }
    b.close();
    const L = r.experts || [];
    if (!L.length) return undefined;
    return new Promise((resolve) => {
      const row = (e) => `<label class="rp-ex"><input type="checkbox" data-rex="${e.id}" checked> <b>${esc(e.name)}</b>
        <span class="dim">${e.requests ? `${M(e.requests)} درخواست · ${M(e.items)} قلم` : "در این دوره درخواستی نداشته"}${e.pseudo ? " · فقط در راهکاران (در جدول کارشناسان نیست)" : e.active ? "" : " · غیرفعال"}</span></label>`;
      const d = TP.modal(`کارشناسانِ گزارش ${esc(r.label)}`, `<p style="margin:0 0 8px">تیکِ هر کارشناسی را که نمی‌خواهید در گزارش بیاید بردارید و «تأیید» را بزنید.
          کارشناسِ بی‌تیک در برگهٔ «کارشناس خرید» و ستون گروه‌ها نمی‌آید؛ آمار پروژه‌ها و جمع کلِ دوره همهٔ درخواست‌ها را می‌شمارد.</p>
        <div class="rp-ex-tools"><button class="tp-btn xs" data-rexall>همه</button><button class="tp-btn xs" data-rexnone>هیچ‌کدام</button><span class="dim" data-rexn></span></div>
        <div class="rp-exlist">${L.map(row).join("")}</div>
        <div class="tp-note warn" data-rexwarn style="display:none;max-width:none;margin:8px 0 0">دست‌کم یک کارشناس را تیک بزنید.</div>`, null, "تأیید", "انصراف");
      d.querySelector(".tp-modal").style.maxWidth = "760px";
      const boxes = [...d.querySelectorAll("[data-rex]")];
      const count = () => { const n = boxes.filter((c) => c.checked).length; d.querySelector("[data-rexn]").textContent = `${M(n)} از ${M(boxes.length)} کارشناس`; return n; };
      boxes.forEach((c) => { c.onchange = count; }); count();
      d.querySelector("[data-rexall]").onclick = () => { boxes.forEach((c) => { c.checked = true; }); count(); };
      d.querySelector("[data-rexnone]").onclick = () => { boxes.forEach((c) => { c.checked = false; }); count(); };
      d.querySelector("[data-y]").onclick = () => {
        if (!count()) { d.querySelector("[data-rexwarn]").style.display = ""; return; }
        d.remove(); resolve({ ids: boxes.filter((c) => c.checked).map((c) => +c.dataset.rex), list: L, label: r.label });
      };
      d.querySelector("[data-n]").onclick = () => { d.remove(); resolve(null); };
      d.onclick = (e) => { if (e.target === d) { d.remove(); resolve(null); } };
    });
  }

  /* جدول گروه‌بندیِ گزارش (تصمیم مدیر، مهر ۱۴۰۵): بعد از تیکِ کارشناسان، همان جدولِ تب کارشناسان فقط با
     تیک‌خورده‌ها — ★ کارشناس را سرگروه می‌کند و نامش ستونی می‌شود، تیکِ ستونِ هر سرگروه اعضای گروهش را. گزارش
     دقیقاً با همین روابط ساخته می‌شود (بدنهٔ team). روابط جدا از تب کارشناسان ذخیره می‌شوند — آن تب مسیر ارجاع،
     تیم ارشد و اعلان‌ها را می‌راند و نباید با چیدنِ ستون‌های یک گزارش عوض شود — و دفعهٔ بعد، در هر دوره‌ای، جدول
     از پیش پر است؛ فقط کارشناسِ تازه، که پیش‌فرضش از تب کارشناسان می‌آید، جا لازم دارد.
     `saved`: نگاشتِ ذخیره‌شده { seniors, parent }. خروجی: { team: روابطِ همین گزارش، merged: نگاشتِ تازه برای
     ذخیره } یا null با انصراف. */
  function teamDialog(list, ids, saved, label) {
    const own = (id) => saved.seniors.includes(id) || Object.prototype.hasOwnProperty.call(saved.parent, id);
    const anySaved = saved.seniors.length > 0 || Object.keys(saved.parent).length > 0;
    const tick = new Set(ids), nm = (e) => e.label || e.name;
    /* پیش‌فرض هر ردیف: رابطهٔ ذخیره‌شده، وگرنه تب کارشناسان */
    const raw = new Map(list.filter((e) => tick.has(e.id)).map((e) => [e.id, own(e.id)
      ? { senior: saved.seniors.includes(e.id), parent: saved.parent[e.id] || null }
      : { senior: !!e.senior, parent: e.senior ? null : e.senior_id || null }]));
    /* سرگروهِ ردیف فقط وقتی به حساب می‌آید که تیک خورده و در همین جدول سرگروه باشد؛ وگرنه ردیف بی‌سرگروه دیده
       می‌شود، ولی رابطهٔ پیشینش تا مدیر خودِ آن ردیف را عوض نکند می‌ماند (mergedOf) */
    const counts = (r) => !!(r.parent && raw.has(r.parent) && raw.get(r.parent).senior);
    const st = new Map([...raw].map(([id, r]) => [id, { senior: r.senior, parent: !r.senior && counts(r) ? r.parent : null }]));
    const init = new Map([...st].map(([id, x]) => [id, { ...x }]));
    const lost = (id) => { const r = raw.get(id), x = st.get(id); return !r.senior && r.parent && !counts(r) && !x.senior && !x.parent ? r.parent : null; };
    const away = (id) => { const p = lost(id); return !!p && !raw.has(p); };   /* سرگروهِ پیشین اصلاً در این گزارش تیک ندارد */
    const nameOf = (id) => { const e = list.find((x) => x.id === id) || (S.data.experts || []).find((x) => x.id === id); return e ? nm(e) : ""; };
    const was = (id) => { const p = lost(id), n = p && nameOf(p); return !p ? "" : n ? `قبلاً زیر ${n}` : "قبلاً زیر سرگروهی که این‌جا نیست"; };
    /* سرگروه‌ها بالا، مثل تب کارشناسان؛ ترتیبِ ردیف‌ها تا بسته شدن جدول ثابت می‌ماند تا زیرِ دست جابه‌جا نشوند */
    const rows = list.filter((e) => st.has(e.id)).sort((a, b) => st.get(b.id).senior - st.get(a.id).senior);
    const heads = () => rows.filter((e) => st.get(e.id).senior);
    const loose = () => rows.filter((e) => !st.get(e.id).senior && !st.get(e.id).parent);
    const same = (id) => { const a = init.get(id), x = st.get(id); return a.senior === x.senior && (x.senior || a.parent === x.parent); };
    /* روابطِ همین گزارش: فقط تیک‌خورده‌ها، عیناً همان که در جدول است؛ ستون‌ها به ترتیب جدول */
    const teamOf = () => { const parent = {}; rows.forEach((e) => { const x = st.get(e.id); if (!x.senior) parent[e.id] = x.parent || null; }); return { seniors: heads().map((e) => e.id), parent }; };
    /* نگاشتِ تازه: ردیفِ دست‌نخورده رابطهٔ پیشینش را نگه می‌دارد — مدخلِ ذخیره‌شده، یا برای کارشناسِ تازه‌ای که
       سرگروهِ تب کارشناسانش اصلاً در این گزارش تیک ندارد هیچ مدخلی (پیش‌فرضش دفعهٔ بعد همان می‌ماند) — تا رابطه
       فقط چون سرگروه این بار در گزارش نبود از بین نرود. ردیفِ تازه یا عوض‌شده از جدول نوشته می‌شود (بی‌سرگروه =
       null). کارشناسی که در جدول نبود دست نمی‌خورد، جز عضوِ سرگروهی که ستاره‌اش همین‌جا برداشته شد: مثل تب
       کارشناسان بی‌سرگروه می‌شود، نه اینکه زیرِ کسی بماند که دیگر سرگروه نیست. */
    const mergedOf = () => {
      const m = { seniors: saved.seniors.slice(), parent: Object.assign({}, saved.parent) };
      rows.forEach((e) => {
        if (same(e.id) && (own(e.id) || away(e.id))) return;
        const x = st.get(e.id);
        m.seniors = m.seniors.filter((id) => id !== e.id); delete m.parent[e.id];
        if (x.senior) m.seniors.push(e.id); else m.parent[e.id] = x.parent || null;
      });
      const heads2 = new Set(m.seniors);
      Object.keys(m.parent).forEach((k) => { if (heads2.has(+k)) delete m.parent[k]; else if (m.parent[k] != null && !heads2.has(m.parent[k])) m.parent[k] = null; });
      return m;
    };
    return new Promise((resolve) => {
      const W = EX_W;
      const d = TP.modal(`گروه‌بندیِ گزارش ${esc(label)}`, `<p style="margin:0 0 6px">مثل جدول تب «کارشناسان»، فقط با کارشناسانِ تیک‌خورده: <b>★</b> کارشناس را سرگروه می‌کند و نامش ستونی می‌شود که زیرِ آن اعضای گروهش را تیک می‌زنید (هر کارشناس فقط در یک گروه). ستونِ هر سرگروه در گزارش یعنی درخواست‌های خودش و اعضایش.</p>
        <p class="dim" style="margin:0 0 8px;font-size:.82rem">روابط برای گزارش‌های بعدی، در هر دوره‌ای، ذخیره می‌شوند و جدول دفعهٔ بعد از پیش پر است. ${anySaved ? "«تازه» یعنی کارشناسی که هنوز جا داده نشده و پیش‌فرضش از تب کارشناسان آمده." : "پیش‌فرضِ این بار از تب کارشناسان آمده."} تب کارشناسان (ارجاع، تیم ارشد و اعلان‌ها) دست نمی‌خورد.</p>
        <div class="rp-ex-tools" data-tcount></div><div data-tgrid></div>`, null, "تأیید", "انصراف");
      const box = d.querySelector(".tp-modal"), grid = d.querySelector("[data-tgrid]");
      const paint = () => {
        const hs = heads(), lo = loose(), total = W.star + W.name + hs.length * W.senior;
        box.style.maxWidth = `${Math.max(760, total + 60)}px`;
        d.querySelector("[data-tcount]").innerHTML = `<span class="chip ${hs.length ? "info" : "warn"}">${hs.length ? `${M(hs.length)} سرگروه` : "هنوز سرگروهی نیست"}</span>
          <span class="chip ${lo.length ? "warn" : "ok"}">${lo.length ? `${M(lo.length)} کارشناس بی‌سرگروه` : "همه در گروه‌اند"}</span>`;
        /* هر کلیک جدول را از نو می‌سازد؛ جای اسکرول می‌ماند تا ردیفِ پایینِ فهرست از زیرِ دست نپرد */
        const old = grid.firstElementChild, top = old ? old.scrollTop : 0, left = old ? old.scrollLeft : 0;
        grid.innerHTML = `<div class="tp-scroll" style="max-height:52vh"><table class="tp-mx ex-mx" style="width:${total}px"><colgroup>
            <col style="width:${W.star}px"><col style="width:${W.name}px">${hs.map(() => `<col style="width:${W.senior}px">`).join("")}</colgroup>
          <thead><tr><th title="سرگروه">★</th><th class="rt">کارشناس</th>${hs.map((s) => `<th class="sen" title="${esc(s.name)}">★ ${esc(nm(s))}</th>`).join("")}</tr></thead><tbody>
          ${rows.map((e) => { const x = st.get(e.id), tip = [e.name, e.pseudo ? "فقط در راهکاران" : e.active ? "" : "غیرفعال", was(e.id)].filter(Boolean).join(" · "); return `<tr>
            <td><button class="tp-btn xs ${x.senior ? "primary" : ""}" data-tstar="${e.id}" title="${x.senior ? "برداشتن سرگروهی" : "سرگروه شود"}">★</button></td>
            <td class="rt nm" title="${esc(tip)}">${esc(nm(e))}${anySaved && !own(e.id) ? ` <span class="chip info">تازه</span>` : ""}</td>
            ${hs.map((s) => `<td>${x.senior ? `<span class="dim">—</span>` : `<button class="tri ${x.parent === s.id ? "ok" : "unk"}" data-tteam="${e.id}|${s.id}" title="${x.parent === s.id ? "در گروه " + esc(nm(s)) : "در گروه " + esc(nm(s)) + " قرار بگیرد"}">${x.parent === s.id ? "✓" : ""}</button>`}</td>`).join("")}</tr>`; }).join("")}
          </tbody></table></div>`;
        const sc = grid.firstElementChild; sc.scrollTop = top; sc.scrollLeft = left;
        grid.querySelectorAll("[data-tstar]").forEach((b) => b.onclick = () => {
          const id = +b.dataset.tstar, x = st.get(id);
          x.senior = !x.senior; x.parent = null;
          /* ستاره برداشته شد: اعضایش بی‌سرگروه می‌شوند، نه اینکه به کسِ دیگری بروند — همان قاعدهٔ تب کارشناسان */
          if (!x.senior) st.forEach((y) => { if (y.parent === id) y.parent = null; });
          paint();
        });
        grid.querySelectorAll("[data-tteam]").forEach((b) => b.onclick = () => {
          const [eid, sid] = b.dataset.tteam.split("|").map(Number), x = st.get(eid);
          x.parent = x.parent === sid ? null : sid;   /* هر کارشناس فقط در یک گروه؛ کلیکِ دوباره یعنی بیرون از گروه */
          paint();
        });
      };
      const finish = () => { d.remove(); resolve({ team: teamOf(), merged: mergedOf() }); };
      d.querySelector("[data-y]").onclick = () => {
        const lo = loose();
        if (!lo.length) return finish();
        /* هشدار روی جدول: «بازگشت و اصلاح» فقط هشدار را می‌بندد و جدول با همین تغییرها سرِ جایش می‌ماند */
        const one = lo.length === 1;
        TP.modal("کارشناسانِ بی‌سرگروه", `${heads().length
            ? `${one ? "این کارشناس زیر هیچ سرگروهی نیست" : `این ${M(lo.length)} کارشناس زیر هیچ سرگروهی نیستند`} و در گزارش در ستونِ <b>«بدون سرگروه»</b> شمرده ${one ? "می‌شود" : "می‌شوند"}:`
            : "هیچ سرگروهی تعیین نشده؛ همهٔ کارشناسان در یک ستونِ <b>«همه کارشناسان»</b> شمرده می‌شوند:"}
          <ul class="rp-loose">${lo.map((e) => `<li>${esc(nm(e))}${was(e.id) ? ` <span class="dim">— ${esc(was(e.id))}</span>` : ""}</li>`).join("")}</ul>`,
          finish, "تأیید", "بازگشت و اصلاح");
      };
      d.querySelector("[data-n]").onclick = () => { d.remove(); resolve(null); };
      /* کلیکِ بیرون از کادر چیزی را نمی‌بندد تا تغییرهای جدول با یک کلیکِ اشتباه از دست نرود */
      d.onclick = null;
      paint();
    });
  }
  /* جدول گروه‌بندی با نگاشتِ ذخیره‌شده، و ذخیرهٔ نگاشتِ تازه اگر چیزی عوض شد. خروجی: روابطِ همین گزارش؛ null با
     انصراف. ذخیره نشد؟ گزارش باز با همین روابط ساخته می‌شود (روابطِ گزارش در بدنهٔ خودش است) و مدیر خبردار می‌شود. */
  async function pickTeam(pk, savedP) {
    const b = TP.busy("خواندن گروه‌بندیِ ذخیره‌شده…", esc(pk.label));
    let saved;
    try { saved = await savedP; } catch (e) { b.close(); TP.modal("گروه‌بندی خوانده نشد", esc(e.message), null, "باشد", ""); return null; }
    b.close();
    const r = await teamDialog(pk.list, pk.ids, saved, pk.label);
    if (!r) return null;
    if (JSON.stringify(r.merged) !== JSON.stringify(saved)) {
      const w = TP.busy("ذخیرهٔ گروه‌بندی…", "");
      try { await TP.api("/reports/team", { method: "PUT", body: r.merged }); w.close(); }
      catch (e) { w.close(); TP.modal("گروه‌بندی ذخیره نشد", `${esc(e.message)}<br>گزارش با همین روابط ساخته می‌شود، ولی دفعهٔ بعد جدول با روابطِ قبلی باز می‌شود.`, null, "باشد", ""); }
    }
    return r.team;
  }

  async function genSeason(asFile) {
    const s = RP.season;
    if (!s.years.length) return TP.modal("سال انتخاب نشده", "دست‌کم یک سال را تیک بزنید.", null, "باشد", "");
    if (!s.sheets.length) return TP.modal("برگه‌ای انتخاب نشده", "دست‌کم یک برگهٔ گزارش را تیک بزنید.", null, "باشد", "");
    const body = { years: s.years, seasons: s.seasons, months: s.months, sheets: s.sheets };
    if (RP.pop) { RP.pop = null; render(); }
    /* گروه‌بندیِ ذخیره‌شده هم‌زمان با کارشناسانِ دوره خوانده می‌شود تا جدولِ بعدی بی‌معطلی باز شود */
    const savedP = TP.api("/reports/team").then((x) => x.team);
    savedP.catch(() => { /* با انصراف یا دورهٔ بی‌کارشناس کسی منتظرش نیست؛ خطایش را pickTeam می‌گوید */ });
    const pk = await pickExperts(body);
    if (pk === null) return;
    if (pk) {
      body.experts = pk.ids;
      const team = await pickTeam(pk, savedP);
      if (!team) return;
      body.team = team;
    }
    if (asFile) return repDownload("/reports/season.xlsx", body, "گزارش سه ماهه.xlsx");
    s.busy = true; render();
    try { s.result = await TP.api("/reports/season", { body }); s.idx = 0; RP.err = ""; }
    catch (e) { TP.modal("گزارش ساخته نشد", esc(e.message), null, "باشد", ""); }
    s.busy = false; render();
  }

  /* چارچوب ثابت گزارش: پروژه‌ها (بلوک جمع کل، شهر، مدیر، نام در برگهٔ مدیران، کلیدواژه‌ها) و ترتیب مدیران */
  function projectsDialog(list) {
    const meta = RP.meta, P = list || meta.projects;
    const row = (p) => `<tr data-prow><td><input class="tp-input" data-pf="block" value="${esc(p.block)}" inputmode="numeric" style="width:46px;text-align:center"></td>
      <td><input class="tp-input" data-pf="name" value="${esc(p.name)}" style="width:100%"></td><td><input class="tp-input" data-pf="city" value="${esc(p.city || "")}" style="width:100%"></td>
      <td><input class="tp-input" data-pf="manager" value="${esc(p.manager || "")}" style="width:100%"></td><td><input class="tp-input" data-pf="managerLabel" value="${esc(p.managerLabel || "")}" placeholder="همان مدیر" style="width:100%"></td>
      <td><input class="tp-input" data-pf="keys" value="${esc((p.keys || []).join("، "))}" style="width:100%"></td>
      <td style="text-align:center"><input type="checkbox" data-pf="noSystem" ${p.noSystem ? "checked" : ""} title="درخواست سیستمی ندارد — ردیف قرمز با «-»"></td>
      <td><button class="tp-btn xs danger" data-prdel title="حذف">✕</button></td></tr>`;
    const d = TP.modal("پروژه‌ها و مدیران پروژه — چارچوب گزارش سه ماهه", `<p style="margin:0 0 8px">هر درخواست با <b>کلیدواژه‌ها</b> (با «،» جدا) در «طرف مقابل» و اگر نخورد در «مرکز درخواست کننده» به پروژه وصل می‌شود؛ طولانی‌ترین کلیدواژهٔ پیداشده برنده است.
        پروژه‌های هم‌<b>بلوک</b> زیر یک «جمع کل» می‌آیند. «نام در برگهٔ مدیران» برای جدا کردن یک مدیر در دو شهر است (مثل مهندس محمدی ماهشهر و کرج).</p>
      <div style="max-height:46vh;overflow:auto;border:1px solid var(--tp-line);border-radius:10px"><table class="tp-mx rp-ptable"><thead><tr><th>بلوک</th><th>نام پروژه</th><th>شهر/کشور</th><th>مدیر پروژه</th><th>نام در برگهٔ مدیران</th><th style="width:30%">کلیدواژه‌ها</th><th>بی‌سیستم</th><th></th></tr></thead>
        <tbody data-pbody>${P.map(row).join("")}</tbody></table></div>
      <div class="tp-row" style="margin:8px 0 0;gap:8px"><button class="tp-btn sm" data-padd>＋ پروژه</button><button class="tp-btn sm" data-preset>بازگشت به پیش‌فرض فایل نمونه</button></div>
      <div class="tp-field" style="margin-top:10px"><b>ترتیب مدیران در برگهٔ «نمودار درصد مدیر پروژه ها» (هر خط یک نام)</b><textarea class="tp-input" data-pmgr rows="4" style="width:100%">${esc((meta.managers || []).join("\n"))}</textarea></div>
      ${meta.unmatched && meta.unmatched.length ? `<div class="tp-note warn" style="max-width:none;margin-top:10px"><b>طرف‌مقابل‌هایی که هنوز به هیچ پروژه‌ای وصل نیستند</b> (در گزارش در ردیف «سایر» می‌آیند):<br>
        ${meta.unmatched.slice(0, 25).map((u) => `${esc(u.party || u.center || "—")} <span class="dim">(${M(u.n)})</span>`).join(" · ")}</div>` : ""}`,
      async () => {
        const rows = [...d.querySelectorAll("[data-prow]")].map((tr) => { const v = (k) => tr.querySelector(`[data-pf="${k}"]`); return {
          block: +v("block").value || 1, name: v("name").value.trim(), city: v("city").value.trim(), manager: v("manager").value.trim(), managerLabel: v("managerLabel").value.trim() || undefined,
          keys: v("keys").value.split(/[،,]/).map((x) => x.trim()).filter(Boolean), noSystem: v("noSystem").checked || undefined }; }).filter((p) => p.name);
        const managers = d.querySelector("[data-pmgr]").value.split("\n").map((x) => x.trim()).filter(Boolean);
        const old = meta.projects.find((p) => p.note); rows.forEach((p) => { const o = meta.projects.find((x) => x.name === p.name && x.note); if (o && p.noSystem) p.note = o.note; });
        /* پروژه‌ها محورِ ماتریس‌های ارجاع و مهلت هوشمند هم هستند */
        try { await TP.api("/settings", { method: "PUT", body: { reportProjects: rows, reportManagers: managers } }); RP.meta = null; RP.metaFailed = false; RP.season.result = null; AX = null; AX_ERR = null; render(); }
        catch (e) { TP.modal("ذخیره نشد", esc(e.message), null, "باشد", ""); }
        void old;
      }, "ذخیره");
    d.querySelector(".tp-modal").style.maxWidth = "1180px";
    const body = d.querySelector("[data-pbody]");
    const wireRows = () => body.querySelectorAll("[data-prdel]").forEach((b) => b.onclick = () => b.closest("tr").remove());
    wireRows();
    d.querySelector("[data-padd]").onclick = () => { body.insertAdjacentHTML("beforeend", row({ block: (P[P.length - 1] || {}).block + 1 || 1, name: "", keys: [] })); wireRows(); };
    d.querySelector("[data-preset]").onclick = () => { body.innerHTML = meta.defaults.projects.map(row).join(""); d.querySelector("[data-pmgr]").value = meta.defaults.managers.join("\n"); wireRows(); };
  }

  function wireReports(Q, G) {
    Q("[data-rpart]").forEach((b) => b.onclick = () => { RP.part = b.dataset.rpart; RP.pop = null; render(); });
    Q("[data-rsheet]").forEach((b) => b.onclick = () => { RP.sheet = b.dataset.rsheet; render(); });
    const rh = G("[data-rhidden]"); if (rh) rh.addEventListener("tp-change", (e) => { RP.hidden = e.detail.value; render(); });
    const rr = G("[data-rstatus-reload]"); if (rr) rr.onclick = () => { RP.status = null; RP.statusFailed = false; RP.limit = 300; RP.dLimit = 300; render(); };
    const mr = G("[data-rmeta-retry]"); if (mr) mr.onclick = () => { RP.metaFailed = false; RP.err = ""; render(); };
    const rx = G("[data-rstatus-xlsx]"); if (rx) rx.onclick = () => repDownload("/reports/status.xlsx" + rangeQs(), null, "وضعیت درخواست ها.xlsx");
    /* بازهٔ گزارش وضعیت */
    const rfr = G("[data-rfrom]"); if (rfr) rfr.onclick = () => TP.openDatePicker(rfr, (v) => { RP.range.from = String(v || "").split("،")[0].trim(); render(); }, { single: true });
    const rto = G("[data-rto]"); if (rto) rto.onclick = () => TP.openDatePicker(rto, (v) => { RP.range.to = String(v || "").split("،")[0].trim(); render(); }, { single: true });
    const rnow = G("[data-rnow]"); if (rnow) rnow.addEventListener("tp-change", (e) => { if (e.detail.value) RP.range.to = ""; else { const [y, m, d] = TP.todayJ(); RP.range.to = `${y}/${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}`; } render(); });
    Q("[data-rquick]").forEach((b) => b.onclick = () => {
      const [y] = TP.todayJ(), k = b.dataset.rquick;
      RP.range = { from: k === "all" ? "" : k === "year" ? `${y}/01/01` : monthStart(), to: "" };
      RP.status = null; RP.statusFailed = false; RP.limit = 300; RP.dLimit = 300; render();
    });
    Q("[data-sl]").forEach((b) => b.onclick = () => { const sel = RP.sl[+b.dataset.sl], k = b.dataset.k, i = sel.indexOf(k); if (i >= 0) sel.splice(i, 1); else sel.push(k); RP.limit = 300; render(); });
    Q("[data-slclear]").forEach((b) => b.onclick = () => { RP.sl[+b.dataset.slclear] = []; render(); });
    const sa = G("[data-slall]"); if (sa) sa.onclick = () => { SL.forEach(([c]) => { RP.sl[c] = []; }); render(); };
    const mo = G("[data-rmore]"); if (mo) mo.onclick = () => { RP.limit += 300; render(); };
    const dm = G("[data-dmore]"); if (dm) dm.onclick = () => { RP.dLimit += 300; render(); };
    Q("[data-dq]").forEach((i) => i.oninput = (e) => { RP.dq[+e.target.dataset.dq] = e.target.value; RP.dLimit = 300; TP.keepFocus(e.target, "dq", render); });
    /* گزارش سه ماهه — کاشی‌ها و چیپ‌ها با کلیک روشن و خاموش می‌شوند */
    const s = RP.season, flip = (arr, v) => { const i = arr.indexOf(v); if (i < 0) arr.push(v); else arr.splice(i, 1); arr.sort((a, b) => a - b); };
    Q("[data-ry]").forEach((b) => b.onclick = () => { flip(s.years, +b.dataset.ry); render(); });
    Q("[data-rq]").forEach((b) => b.onclick = () => { flip(s.seasons, +b.dataset.rq); render(); });
    Q("[data-rm]").forEach((b) => b.onclick = () => { flip(s.months, +b.dataset.rm); render(); });
    Q("[data-rsh]").forEach((b) => b.onclick = () => { const k = b.dataset.rsh, i = s.sheets.indexOf(k); if (i < 0) s.sheets.push(k); else s.sheets.splice(i, 1); const order = RP.meta.sheets.map((x) => x.key); s.sheets.sort((a, c) => order.indexOf(a) - order.indexOf(c)); render(); });
    const gn = G("[data-rgen]"); if (gn) gn.onclick = () => genSeason(false);
    const gx = G("[data-rgenx]"); if (gx) gx.onclick = () => genSeason(true);
    const pj = G("[data-rproj]"); if (pj) pj.onclick = () => projectsDialog();
    Q("[data-rtab]").forEach((b) => b.onclick = () => { s.idx = +b.dataset.rtab; render(); });
  }

  /* ---------- رندر ---------- */
  function render() {
    const app = document.getElementById("app");
    if (!TP.manager.get()) { TP.ui.mountBg("fog"); app.innerHTML = vLogin(); TP.ui.help.set("login.manager"); wire(); return; }
    TP.ui.mountBg("");
    TP.ui.help.set(`manager.${S.tab}`);
    /* میز ارجاع نوار پایینِ چسبان دارد؛ دکمهٔ راهنما بالاتر می‌نشیند */
    document.body.classList.toggle("has-foot", S.tab === "desk");
    const restore = TP.snapScroll();
    app.innerHTML = vTop() + (S.error ? `<div class="tp-note warn" style="margin:10px 18px">${esc(S.error)}</div>` : "") +
      (S.loading && !S.data.requests.length ? `<div class="empty">در حال بارگیری…</div>` :
        S.tab === "desk" ? vFilters() + `<div class="tp-wrap">${vDesk()}</div>` + vFoot()
        : `<div class="tp-wrap">${S.tab === "alerts" ? vAlerts() : S.tab === "experts" ? vExperts() : S.tab === "asg" ? vAssign() : S.tab === "dl" ? vDeadline() : S.tab === "norm" ? vNorm() : S.tab === "hist" ? vHist() : S.tab === "reports" ? vReports() : vLog()}</div>`);
    wire();
    TP.ui.paintAll(app);
    TP.stickHeader(app.querySelector("table.tp-table"));
    restore();
    if (S.fAnim === "in") { S.fAnim = null; const btn = app.querySelector("[data-fpanel]"); if (btn) btn.classList.add("spin"); TP.ui.reveal(app.querySelector("[data-fpanel-box]"), true); }
    if (S.exLand) { const id = S.exLand; S.exLand = null; setTimeout(() => { const c = app.querySelector(`[data-exdrag="${id}"]`); if (c) c.classList.remove("land"); }, 900); }
  }

  /* ---------- اتصال رویدادها ---------- */
  function wire() {
    const a = document.getElementById("app"), Q = (s) => a.querySelectorAll(s), G = (s) => a.querySelector(s);
    if (G("[data-login-card]")) { TP.ui.bindLogin(a, { onSubmit: async (c) => { TP.manager.set(c); try { await TP.api("/login", { body: { role: "manager", code: c } }); S.error = ""; await refresh(); } catch (e) { TP.manager.clear(); throw e; } } }); return; }
    Q("[data-tab]").forEach((b) => b.onclick = () => { S.tab = b.dataset.tab; if (S.tab === "desk") TP.ui.resetOnce("mgr.desk"); if (S.tab === "log") loadEvents(); if (S.tab === "hist") loadHist(); render(); });
    Q("[data-hist-import]").forEach((b) => { b.onclick = (e) => { e.stopPropagation(); pickHistory(); }; b.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pickHistory(); } }; });
    const rf = G("[data-refresh]"); if (rf) rf.onclick = refresh;
    const lo = G("[data-logout]"); if (lo) lo.onclick = () => { TP.manager.clear(); render(); };
    const ap = G("[data-approval]"); if (ap) ap.onchange = async (e) => { await save({ approvalRequired: e.target.checked }); };
    const im = G("[data-import]"); if (im) im.onclick = pickAndImport;
    /* رها کردن فایل اکسل روی صفحه = همان بارگذاری. روی body است تا افتادنِ فایل
       بیرونِ #app هم به‌جای بازشدنِ فایل در مرورگر، بارگذاری شود. */
    const body = document.body;
    body.ondragover = (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) { e.preventDefault(); body.classList.add("tp-drop-over"); } };
    body.ondragleave = (e) => { if (!e.relatedTarget || e.relatedTarget === document.documentElement) body.classList.remove("tp-drop-over"); };
    body.ondrop = (e) => {
      e.preventDefault(); body.classList.remove("tp-drop-over");
      /* روی تب سوابق، فایل‌های رهاشده همان چهار فایل مرجع‌اند نه درخواست‌های روزانه */
      if (S.tab === "hist" && e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { askCatalogImport(e.dataTransfer.files); return; }
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (!f) return;
      if (!/\.xlsx$/i.test(f.name)) { TP.modal("فایل نامناسب", `فقط فایل اکسل (.xlsx) پذیرفته می‌شود؛ «${esc(f.name)}» نیست.`, null, "باشد", ""); return; }
      importFile(f);
    };
    Q("[data-f]").forEach((s) => s.onchange = (e) => { S.filter[e.target.dataset.f] = e.target.value; if (e.target.dataset.f === "window") { S.page.offset = 0; refresh(); } else render(); });
    /* فیلترهای چندانتخابی کارشناس و وضعیت */
    Q("[data-fopen]").forEach((b) => b.onclick = () => { S.pop = S.pop === b.dataset.fopen ? null : b.dataset.fopen; render(); });
    Q("[data-fclose]").forEach((b) => b.onclick = () => { S.pop = null; render(); });
    const ft = G("[data-ftext]"); if (ft) ft.oninput = (e) => { S.filter.expertText = e.target.value; TP.keepFocus(e.target, "ftext", render); };
    Q("[data-fexp]").forEach((c) => c.onchange = (e) => { const id = +e.target.dataset.fexp; const i = S.filter.experts.indexOf(id); if (e.target.checked && i < 0) S.filter.experts.push(id); if (!e.target.checked && i >= 0) S.filter.experts.splice(i, 1); render(); });
    Q("[data-fst]").forEach((c) => c.onchange = (e) => {
      const s = e.target.dataset.fst, cur = statusSel().slice(); const i = cur.indexOf(s);
      if (e.target.checked && i < 0) cur.push(s); if (!e.target.checked && i >= 0) cur.splice(i, 1);
      const wasAll = needsAllScope(); S.filter.statuses = cur;
      if (needsAllScope() !== wasAll) refresh(); else render();
    });
    const fa = G("[data-fall]"); if (fa) fa.onclick = () => { const was = needsAllScope(); S.filter.statuses = STATUS_ALL.slice(); if (!was) refresh(); else render(); };
    Q("[data-fclear]").forEach((b) => b.onclick = () => { if (b.dataset.fclear === "expert") { S.filter.experts = []; S.filter.expertText = ""; render(); } else { const was = needsAllScope(); S.filter.statuses = null; if (was) refresh(); else render(); } });
    /* میز: کادرِ فیلتر — باز و بسته با حرکت؛ هر فیلتر همان لحظه اعمال می‌شود */
    const fpb = G("[data-fpanel]"); if (fpb) fpb.onclick = () => { if (S.fOpen) return closeFilters(); S.fOpen = true; S.fAnim = "in"; render(); };
    const fok = G("[data-fok]"); if (fok) fok.onclick = closeFilters;
    Q("[data-fstate]").forEach((b) => b.onclick = () => { S.filter.state = b.dataset.fstate; render(); });
    Q("[data-fwin]").forEach((b) => b.onclick = () => { if (S.filter.window === b.dataset.fwin) return; S.filter.window = b.dataset.fwin; S.page.offset = 0; refresh(); });
    Q("[data-fdrop]").forEach((b) => b.onclick = () => {
      const k = b.dataset.fdrop;
      if (k.startsWith("q:")) S.q[k.slice(2)] = "";
      else if (k === "expert") { S.filter.experts = []; S.filter.expertText = ""; }
      else if (k === "state") S.filter.state = "";
      else if (k === "status") { const was = needsAllScope(); S.filter.statuses = null; if (was) return refresh(); }
      render();
    });
    /* تب کارشناسان: تخته‌ی تیم‌ها */
    const exq = G("[data-exq]"); if (exq) exq.oninput = (e) => { S.exQ = e.target.value; TP.keepFocus(e.target, "exq", render); };
    Q("[data-ename-edit]").forEach((x) => x.onclick = () => { S.editName = +x.dataset.enameEdit; render(); const i = G("[data-ename]"); if (i) { i.focus(); i.select(); } });
    Q("[data-ename]").forEach((i) => {
      const done = async () => { const id = +i.dataset.ename, e = S.data.experts.find((x) => x.id === id); const v = i.value.trim(); S.editName = null; if (!v || v === (e.label || e.name)) return render(); await expertPatch(id, { name: v, label: v }); };
      i.onkeydown = (e) => { if (e.key === "Enter") done(); if (e.key === "Escape") { S.editName = null; render(); } };
      i.onblur = done;
    });
    Q("[data-estar]").forEach((b) => b.onclick = async () => { const e = S.data.experts.find((x) => x.id === +b.dataset.estar); if (await expertPatch(e.id, { senior: !e.senior })) TP.ui.success(e.senior ? "ارشدی برداشته شد" : "کارشناس ارشد شد"); });
    Q("[data-edel]").forEach((b) => b.onclick = () => { const e = S.data.experts.find((x) => x.id === +b.dataset.edel);
      TP.modal("حذف کارشناس", `<b>${esc(e.label || e.name)}</b> از فهرست کارشناسان برداشته می‌شود و دیگر نمی‌تواند وارد پنل شود؛ ارجاع‌های فعلی‌اش می‌مانند تا شما به دیگری بدهید.`, async () => { if (await expertPatch(e.id, { active: false })) TP.ui.success("کارشناس حذف شد"); }, "حذف"); });
    Q("[data-eteam]").forEach((b) => b.onclick = async () => { const [eid, sid] = b.dataset.eteam.split("|").map(Number); const e = S.data.experts.find((x) => x.id === eid); S.exPick = null; S.exLand = eid; await expertPatch(eid, { senior_id: e.senior_id === sid ? null : sid }); });
    Q("[data-ebell]").forEach((b) => b.onclick = () => { const e = S.data.experts.find((x) => x.id === +b.dataset.ebell); expertPatch(e.id, { notify_to: e.notify_to === "senior" ? "manager" : "senior" }); });
    Q("[data-eadd-to]").forEach((b) => b.onclick = () => { const id = +b.dataset.eaddTo; S.exPick = S.exPick === id ? null : id; S.exPickQ = ""; render(); const i = G("[data-epickq]"); if (i) i.focus(); });
    const epq = G("[data-epickq]"); if (epq) epq.oninput = (e) => { S.exPickQ = e.target.value; TP.keepFocus(e.target, "epickq", render); };
    Q("[data-epick-close]").forEach((b) => b.onclick = () => { S.exPick = null; render(); });
    const ea = G("[data-eadd]"); if (ea) ea.onclick = addExpertDialog;
    /* کشیدن و رها کردنِ کارشناس روی کارتِ تیم (یا «بی‌سرپرست») — همان senior_id */
    Q("[data-exdrag]").forEach((c) => {
      c.ondragstart = (e) => { e.dataTransfer.setData("text/x-expert", c.dataset.exdrag); e.dataTransfer.effectAllowed = "move"; c.classList.add("dragging"); a.classList.add("ex-dragging"); };
      c.ondragend = () => { c.classList.remove("dragging"); a.classList.remove("ex-dragging"); Q(".ex-team.over").forEach((t) => t.classList.remove("over")); };
    });
    Q("[data-drop-team]").forEach((t) => {
      t.ondragover = (e) => { if (![...e.dataTransfer.types].includes("text/x-expert")) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "move"; t.classList.add("over"); };
      t.ondragleave = (e) => { if (!t.contains(e.relatedTarget)) t.classList.remove("over"); };
      t.ondrop = (e) => {
        const id = +e.dataTransfer.getData("text/x-expert"); if (!id) return;
        e.preventDefault(); e.stopPropagation(); t.classList.remove("over");
        const sid = +t.dataset.dropTeam || null, ex = S.data.experts.find((x) => x.id === id);
        if (!ex || ex.id === sid || (ex.senior_id || null) === sid) return;
        S.exLand = id; expertPatch(id, { senior_id: sid });
      };
    });
    const wa = G("[data-win-all]"); if (wa) wa.onclick = () => { S.filter.window = "all"; S.page.offset = 0; refresh(); };
    Q("[data-del]").forEach((b) => b.onclick = () => askDelete([b.dataset.del]));
    const pg = G("[data-purge]"); if (pg) pg.onclick = () => askDelete(null);
    Q("[data-page]").forEach((b) => b.onclick = () => { S.page.offset = Math.max(0, S.page.offset + (+b.dataset.page) * S.page.limit); refresh(); });
    Q("[data-lookup]").forEach((b) => b.onclick = async () => {
      try { const d = await TP.api(`/desk?id=${encodeURIComponent(b.dataset.lookup)}`);
        if (!d.requests.length) return TP.modal("پیدا نشد", `درخواست «${esc(b.dataset.lookup)}» در سامانه نیست. اگر در راهکاران هست، فایل روزانه را دوباره بارگذاری کنید.`, null, "باشد", "");
        d.requests.forEach((r) => { if (!S.data.requests.some((x) => x.id === r.id)) S.data.requests.unshift(r); }); render(); }
      catch (e) { TP.modal("خطا", esc(e.message), null, "باشد", ""); } });
    const cl = G("[data-clear]"); if (cl) cl.onclick = () => { const w = S.filter.window, was = needsAllScope(); S.filter = { experts: [], expertText: "", statuses: null, state: "", window: w }; S.q = { id: "", date: "", party: "", item: "" }; S.pop = null; if (was) refresh(); else render(); };
    Q("[data-q]").forEach((i) => { if (i.dataset.q === "date") i.onclick = () => TP.openDatePicker(i, (v) => { S.q.date = v; render(); }); else i.oninput = (e) => { S.q[e.target.dataset.q] = e.target.value; TP.keepFocus(e.target, "q", render); }; });
    Q("[data-toggle]").forEach((b) => b.onclick = () => { S.open[b.dataset.toggle] = !S.open[b.dataset.toggle]; render(); });
    Q("select[data-assign]").forEach((s) => s.onchange = async (e) => {
      const rid = e.target.dataset.assign, aid = e.target.dataset.aid ? +e.target.dataset.aid : null, eid = +e.target.value || null;
      /* «— انتخاب کارشناس —» روی ارجاعِ ارسال‌نشده: کارشناس برداشته می‌شود و با «ارسال» نمی‌رود */
      try {
        if (aid && eid) await TP.api("/reassign", { body: { assignment_id: aid, expert_id: eid } });
        else if (aid) await TP.api("/unassign", { body: { assignment_id: aid } });
        /* ردیفِ «بدون کارشناس»: فقط همین اقلام — بی item_ids، سرور همهٔ اقلامِ ارسال‌نشده را می‌برد و ارجاعِ
           ارسال‌نشدهٔ کارشناس دیگرِ همین درخواست را هم خالی و حذف می‌کرد */
        else await TP.api("/assign", { body: { request_id: rid, expert_id: eid, item_ids: (e.target.dataset.un || "").split(",").map(Number).filter(Boolean) } });
        await refresh();
      } catch (er) { TP.modal("خطا", esc(er.message), null, "باشد", ""); }
    });
    Q("input[data-days]").forEach((i) => { i.oninput = (e) => { e.target.value = e.target.value.replace(/[^0-9]/g, ""); e.target.className = "tp-input num" + (e.target.value ? "" : " unset"); };
      i.onchange = async (e) => { try { await TP.api("/assign/days", { body: { assignment_id: +e.target.dataset.days, days: +e.target.value || null } }); const r = S.data.requests.find((x) => x.assignments.some((y) => y.id === +e.target.dataset.days)); if (r) r.assignments.find((y) => y.id === +e.target.dataset.days).days = +e.target.value || null; render(); } catch (er) { TP.modal("خطا", esc(er.message), null, "باشد", ""); } }; });
    Q("[data-auto]").forEach((b) => b.onclick = () => b.dataset.auto === "asg" ? applyAssignAll() : applyDeadlineAll());
    const dp = G("[data-dispatch]"); if (dp) dp.onclick = doDispatch;
    Q("[data-act]").forEach((b) => b.onclick = () => { const [st, aid] = b.dataset.act.split("|"); doAct(st, +aid); });
    Q("[data-open]").forEach((b) => b.onclick = () => openDetail(+b.dataset.open));
    Q("[data-move]").forEach((b) => b.onclick = () => moveDialog(+b.dataset.move));
    Q("[data-aitick]").forEach((b) => b.onclick = () => aiTickSet(+b.dataset.aitick, b.dataset.on === "1"));
    Q("[data-suptick]").forEach((b) => b.onclick = () => supTickSet(+b.dataset.suptick, b.dataset.on === "1"));
    /* اعلانات — ذخیرهٔ خودکار بعد از مکث؛ هر چهار مقدار از settings() یک‌جا (یک تایمر برای همه) */
    const saveAlerts = () => autoSave("alerts", () => { const s = settings(); return saveQuiet({ thresholds: s.thresholds, dispatchDays: s.dispatchDays, minSuppliers: s.minSuppliers, capacity: s.capacity }); });
    const thrTrack = G("[data-thr-track]");
    if (thrTrack) {
      thrTrack.addEventListener("tp-input", (e) => { const v = G(`[data-thr-v="${e.detail.index}"]`); if (v) v.textContent = `${M(e.detail.value)}٪`; });
      thrTrack.addEventListener("tp-change", (e) => { const t = (settings().thresholds || []).slice(); t[e.detail.index] = e.detail.value; settings().thresholds = t; saveAlerts(); });
    }
    Q("[data-thr-on]").forEach((sw) => sw.addEventListener("tp-change", (e) => {
      const i = +sw.dataset.thrOn, T = thrList();
      if (!e.detail.value) T[i] = null;
      else {
        /* روشن: میانهٔ جای خالی میانِ همسایه‌های روشن (مرحلهٔ آخر: ۱۰۰ اگر جا هست) */
        let lo = 1, hi = 100;
        for (let k = i - 1; k >= 0; k--) if (T[k] != null) { lo = T[k] + 1; break; }
        for (let k = i + 1; k < T.length; k++) if (T[k] != null) { hi = T[k] - 1; break; }
        if (lo > hi) { sw.classList.remove("on"); sw.setAttribute("aria-checked", "false"); TP.ui.success("میانِ مرحله‌های همسایه جایی نمانده", { tone: "bad" }); return; }
        T[i] = i === T.length - 1 && hi === 100 ? 100 : Math.round((lo + hi) / 2);
      }
      settings().thresholds = T.map((x) => (x == null ? "" : x)); saveAlerts(); render();
    }));
    Q("[data-mstage]").forEach((sw) => sw.addEventListener("tp-change", () => { const m = [...Q("[data-mstage]")].map((x) => x.classList.contains("on")); settings().mgrStages = m; autoSave("mstages", () => saveQuiet({ mgrStages: m })); }));
    Q("[data-al]").forEach((k) => k.addEventListener("tp-change", (e) => { settings()[k.dataset.al] = e.detail.value; saveAlerts(); }));
    /* ارجاع/مهلت هوشمند — هر تغییر همان‌جا روی سرور می‌نشیند؛ حینِ کشیدن دوباره رسم نمی‌شود */
    const saveCoef = () => autoSave("coef", () => saveQuiet({ assign: settings().assign, deadline: settings().deadline }));
    const mix = () => { const A = settings().assign, sum = (+A.a || 0) + (+A.b || 0) + (+A.c || 0) || 1; ["a", "b", "c"].forEach((k) => { const i = G(`.sm-mix .${k}`); if (i) i.style.setProperty("--w", `${(+A[k] || 0) / sum * 100}%`); }); };
    Q("input[data-asg]").forEach((i) => { i.oninput = (e) => { settings().assign[e.target.dataset.asg] = +e.target.value; mix(); saveCoef(); }; i.onchange = () => render(); });
    Q("[data-asg-op]").forEach((b) => b.onclick = () => { settings().assign[b.dataset.asgOp] = b.dataset.v; saveCoef(); render(); });
    Q("[data-asg-knob]").forEach((k) => k.addEventListener("tp-change", (e) => { if (+settings().assign[k.dataset.asgKnob] === e.detail.value) return; settings().assign[k.dataset.asgKnob] = e.detail.value; saveCoef(); render(); }));
    Q(".tp-step[data-dl]").forEach((st) => { st.addEventListener("tp-input", (e) => { settings().deadline[st.dataset.dl] = e.detail.value; saveCoef(); }); st.addEventListener("tp-change", () => render()); });
    Q("[data-dl-op]").forEach((b) => b.onclick = () => { settings().deadline[b.dataset.dlOp] = b.dataset.v; saveCoef(); render(); });
    Q("[data-dl-tab]").forEach((b) => b.onclick = () => { S.dlTab = b.dataset.dlTab; render(); });
    const dlm = G("[data-dl-more]"); if (dlm) dlm.onclick = () => { S.dlMore = true; render(); };
    Q("[data-sm-kind]").forEach((b) => b.onclick = () => { S.smKind = b.dataset.smKind; render(); });
    Q("[data-sm-ex]").forEach((b) => b.onclick = () => { S.smEx = +b.dataset.smEx; render(); });
    /* امتیازها و ضریب‌ها — فقط همان خانهٔ تغییرکرده فرستاده می‌شود؛ سرور upsert می‌کند */
    const setScore = (eid, kind, key, v) => { const x = S.scores.scores.find((s) => s.expert_id === eid && s.kind === kind && s.key === key); const score = Math.max(0, Math.min(5, +String(v).replace(/[^0-9]/g, "") || 0)); if (x) x.score = score; else S.scores.scores.push({ expert_id: eid, kind, key, score }); return score; };
    const setW = (kind, key, v) => { const x = S.scores.weights.find((s) => s.kind === kind && s.key === key); const w = +v || 1; if (x) x.w = w; else S.scores.weights.push({ kind, key, w }); return w; };
    Q(".tp-rate[data-score]").forEach((r) => r.addEventListener("tp-change", (e) => {
      const parts = r.dataset.score.split("|"), eid = +parts[0], kind = parts[1], key = parts.slice(2).join("|");
      const score = setScore(eid, kind, key, e.detail.value);
      autoSave(`s:${r.dataset.score}`, () => TP.api("/scores", { method: "PUT", body: { scores: [{ expert_id: eid, kind, key, score }] } }));
    }));
    Q("input[data-sp]").forEach((i) => i.onchange = async (e) => { const ex = S.data.experts.find((x) => x.id === +e.target.dataset.sp); ex.speed = +e.target.value || 1;
      try { await TP.api(`/experts/${ex.id}`, { method: "PUT", body: { speed: ex.speed } }); savedFlash(); } catch (er) { TP.modal("ذخیره نشد", esc(er.message), null, "باشد", ""); } render(); });
    Q("input[data-cw]").forEach((i) => { i.oninput = (e) => { const w = setW("guild", e.target.dataset.cw, e.target.value);
      autoSave(`cw:${e.target.dataset.cw}`, () => TP.api("/scores", { method: "PUT", body: { weights: [{ kind: "guild", key: e.target.dataset.cw, w }] } })); }; i.onchange = () => render(); });
    Q("input[data-pw]").forEach((i) => { i.oninput = (e) => { const w = setW("project", e.target.dataset.pw, e.target.value);
      autoSave(`pw:${e.target.dataset.pw}`, () => TP.api("/scores", { method: "PUT", body: { weights: [{ kind: "project", key: e.target.dataset.pw, w }] } })); }; i.onchange = () => render(); });
    /* اقلام و کدها */
    const nmq = G("[data-nmq]"); if (nmq) nmq.oninput = (e) => { S.nm.q = e.target.value; S.nm.limit = 120; TP.keepFocus(e.target, "nmq", render); };
    Q("[data-nmg]").forEach((b) => b.onclick = () => { S.nm.g = b.dataset.nmg; S.nm.limit = 120; render(); });
    Q("[data-nmsort]").forEach((b) => b.onclick = () => { S.nm.sort = b.dataset.nmsort; render(); });
    const nmm = G("[data-nm-more]"); if (nmm) nmm.onclick = () => { S.nm.limit += 120; render(); };
    /* رویدادها: دسته‌ها */
    Q("[data-evcat]").forEach((b) => b.onclick = () => { S.evCat = b.dataset.evcat; render(); });
    const aa = G("[data-apply-asg]"); if (aa) aa.onclick = applyAssignAll;
    const ad = G("[data-apply-dl]"); if (ad) ad.onclick = applyDeadlineAll;
    Q("[data-dec]").forEach((b) => b.onclick = async () => {
      const [what, id] = b.dataset.dec.split("|");
      if (what === "reject") {
        /* دلیلِ رد برای کارشناس در تلگرام فرستاده می‌شود — همان‌طور که از دکمهٔ تلگرامِ مدیر */
        const d = TP.modal("رد تصمیم کارشناس", `<div class="tp-field"><b>چرا رد می‌کنید؟</b><textarea class="tp-input" id="dec-note" rows="3" style="width:100%;margin-top:6px" placeholder="همین متن برای کارشناس می‌رود"></textarea></div>`,
          async () => { try { await TP.api(`/decisions/${id}/reject`, { body: { note: (d.querySelector("#dec-note") || {}).value || "" } }); TP.ui.success("رد شد و به کارشناس خبر رفت"); await refresh(); } catch (e) { TP.modal("نشد", esc(e.message), null, "باشد", ""); } }, "رد و اطلاع به کارشناس");
        return;
      }
      b.disabled = true;
      try { await TP.api(`/decisions/${id}/approve`, { body: {} }); TP.ui.success("تصمیم تأیید شد"); await refresh(); } catch (e) { b.disabled = false; TP.modal("نشد", esc(e.message), null, "باشد", ""); }
    });
    const le = G("[data-load-events]"); if (le) le.onclick = loadEvents;
    wireReports(Q, G);
  }

  async function save(patch) { try { S.data.settings = await TP.api("/settings", { method: "PUT", body: patch }); render(); } catch (e) { TP.modal("خطا در ذخیره", esc(e.message), null, "باشد", ""); } }
  /* ---------- ذخیرهٔ خودکار تنظیمات ----------
     هر تغییرِ مدیر بعد از یک مکث کوتاه روی D1 می‌نشیند — آخرین مقدار برنده است
     و رفرش دیگر چیزی را نمی‌پراند. حین تایپ رندر نمی‌کنیم که فوکوس نپرد. */
  async function saveQuiet(patch) { S.data.settings = await TP.api("/settings", { method: "PUT", body: patch }); }
  function savedFlash() {
    document.querySelectorAll("[data-autosaved]").forEach((el) => {
      const t = el.querySelector("span") || el;
      t.textContent = "ذخیره شد"; el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
      clearTimeout(el._t); el._t = setTimeout(() => { t.textContent = "ذخیرهٔ خودکار"; el.classList.remove("flash"); }, 1800);
    });
  }
  const AS_TIMERS = {};
  function autoSave(key, fn, ms = 700) {
    clearTimeout(AS_TIMERS[key]);
    AS_TIMERS[key] = setTimeout(async () => {
      try { await fn(); savedFlash(); }
      catch (e) { TP.modal("ذخیرهٔ خودکار انجام نشد", esc(e.message), null, "باشد", ""); }
    }, ms);
  }
  async function loadEvents() { try { S.events = (await TP.api("/events")).events || []; render(); } catch (e) { S.error = e.message; render(); } }

  /* ---------- اقدام‌های گروهی ---------- */
  async function applyAssignAll() {
    const pend = S.data.requests.filter((r) => unassignedOpen(r).length);
    if (!pend.length) return TP.modal("ارجاع هوشمند", "درخواستِ بی‌کارشناسی نیست.", null, "باشد", "");
    const b = TP.busy("اعمال ارجاع هوشمند…", `${pend.length} درخواست`); let n = 0, P = null;
    try {
      await loadWorkload();
      if (!AX) AX = await TP.api("/axes");
      P = planAssign(pend);
      for (const p of P.plan) {
        await TP.api("/assign", { body: { request_id: p.id, expert_id: p.expert.id, item_ids: unassignedOpen(p.job.r).map((i) => i.id), source: "smart" } });
        n++; b.set(`${n} از ${P.plan.length}`);
      }
    } catch (e) { b.close(); WL = null; await refresh(); return TP.modal("ارجاع هوشمند نیمه‌کاره ماند", `${n} درخواست ارجاع شد؛ بعد خطا: ${esc(e.message)}`, null, "باشد", ""); }
    b.close(); await refresh(); S.tab = "desk"; TP.ui.resetOnce("mgr.desk"); render();
    TP.ui.success(`برای ${M(n)} درخواست کارشناس گذاشته شد`);
    if (P && P.over) setTimeout(() => TP.modal("ارجاع هوشمند", `<b>${M(P.over)} درخواست</b> از سقف همهٔ کارشناسان گذشت و به کم‌بارترین داده شد؛ در «ارجاع هوشمند» با ⚠ دیده می‌شوند.`, null, "باشد", ""), 1500);
  }
  /* فقط ارجاع‌های ارسال‌نشده‌ای که هنوز مهلت ندارند (تصمیم مدیر): مهلتی که خودِ مدیر گذاشته نمی‌پرد
     و در اشغالِ کارشناس (بار همهٔ ارجاع‌های باز) از قبل حساب شده است */
  async function applyDeadlineAll() {
    const list = S.data.requests.flatMap((r) => r.assignments.filter((a) => !a.dispatched_at && !(Number(a.days) > 0)).map((a) => ({ r, a })));
    if (!list.length) return TP.modal("مهلت هوشمند", "ارجاع ارسال‌نشده‌ای بدون مهلت نیست؛ مهلت‌هایی که خودتان گذاشته‌اید دست نمی‌خورند.", null, "باشد", "");
    const b = TP.busy("اعمال مهلت هوشمند…", `${list.length} ارجاع`); let n = 0;
    try {
      await loadWorkload();
      if (!AX) AX = await TP.api("/axes");
      for (const x of planDeadlines(list)) { await TP.api("/assign/days", { body: { assignment_id: x.a.id, days: x.days, source: "smart" } }); n++; b.set(`${n} از ${list.length}`); }
    } catch (e) { b.close(); await refresh(); return TP.modal("مهلت هوشمند نیمه‌کاره ماند", `${n} ارجاع مهلت گرفت؛ بعد خطا: ${esc(e.message)}`, null, "باشد", ""); }
    b.close(); await refresh(); S.tab = "desk"; TP.ui.resetOnce("mgr.desk"); render();
    TP.ui.success(`${M(n)} ارجاع مهلت گرفت`);
  }
  /* طرح «خرید هوشمند، کارشناس ناظر» فاز ۴ب: تیکِ «🤖 هوشمند»ِ هر ارجاع، پیش‌فرض روشن — برداشتنش توضیح می‌خواهد (مگر همهٔ اقلامش از
     نوعِ «مستقیم» باشند)؛ تا کار به کارشناس هوشمند سپرده نشده عوض‌شدنی است. فقط برای کارشناسی که کارشناس هوشمندش روشن است. */
  const aiExpert = (a) => (S.data.ai_experts || []).includes(a.expert_id);
  function aiTick(a) {
    if (!aiExpert(a)) return "";
    const on = a.ai_on !== 0;
    return ` <button class="tp-btn xs ${on ? "" : "warn"}" data-aitick="${a.id}" data-on="${on ? 0 : 1}" title="${on ? "🤖 هوشمند — برای دستی کردن بزنید (با توضیح)" : `✋ دستی${a.ai_note ? ` — ${esc(a.ai_note)}` : ""} — برای هوشمند کردن بزنید`}">${on ? "🤖" : "✋"}</button>`;
  }
  async function aiTickSet(aid, on) {
    const go = async (reason) => {
      try { await TP.api("/assign/ai", { body: { assignment_id: aid, on, ...(reason ? { reason } : {}) } }); await refresh(); return true; }
      catch (e) {
        if (e.status === 422 && e.data && e.data.need_reason) return "reason";
        TP.modal("نشد", esc(e.message), null, "باشد", ""); return true;
      }
    };
    if (on) return go(null);
    if ((await go(null)) !== "reason") return;
    const d = TP.modal("✋ دستی کردنِ این ارجاع", `<p>کارشناس هوشمند روی این درخواست کار نمی‌کند و همهٔ کارهایش با خودِ کارشناس است.</p>
      <div class="tp-field"><b>علت (اجباری)</b><textarea class="tp-input" id="ai-why" rows="3" style="width:100%;margin-top:6px" placeholder="مثلاً خریدِ فوری با تأمین‌کنندهٔ ثابت"></textarea></div>`,
      async () => {
        const why = ((d.querySelector("#ai-why") || {}).value || "").trim();
        if (!why) return TP.modal("علت لازم است", "برای برداشتنِ تیکِ «🤖 هوشمند» علت را بنویسید.", null, "باشد", "");
        await go(why);
      }, "دستی شود");
  }
  /* فاز ۴ب گام ۴: تیکِ «👁 حالت تأیید» کنارِ «🤖» — بی توضیح، روشن یا خاموش؛ فقط وقتی پشتیبانی دست‌کم یک نوع قلم را «مجازِ تأیید» کرده.
     در اقلامِ نوعِ مجاز، کارشناس هوشمند کارهایی را که کارشناس «با تأیید» گذاشته اول به او پیشنهاد می‌کند. */
  function supTick(a) {
    if (!aiExpert(a) || a.ai_on === 0 || !(S.data.sup_heads > 0)) return "";
    const on = a.sup_on === 1;
    return ` <button class="tp-btn xs ${on ? "primary" : ""}" data-suptick="${a.id}" data-on="${on ? 0 : 1}" title="${on ? "👁 با تأیید کارشناس — برای خاموش کردن بزنید" : "👁 حالت تأیید خاموش — برای اجازه دادن بزنید (اقلامِ نوعِ مجاز)"}">👁</button>`;
  }
  async function supTickSet(aid, on) {
    try {
      const r = await TP.api("/assign/sup", { body: { assignment_id: aid, on } });
      await refresh();
      if (on && r.changed && !r.eligible) TP.modal("👁 حالت تأیید", "اجازه ثبت شد، ولی فعلاً هیچ قلمِ این درخواست از نوعی نیست که پشتیبانی «مجازِ حالت تأیید» کرده؛ اگر بعد از نرمال‌سازی نوعِ مجاز شد، با «🚀 شروع» با تأیید پیش می‌رود.", null, "باشد", "");
    } catch (e) { TP.modal("نشد", esc(e.message), null, "باشد", ""); }
  }
  function doDispatch() {
    const list = readyAssignments(); const by = {};
    list.forEach((a) => by[a.expert_label || a.expert_name] = (by[a.expert_label || a.expert_name] || 0) + 1);
    const aiN = list.filter((a) => aiExpert(a) && a.ai_on !== 0).length, manN = list.filter((a) => aiExpert(a) && a.ai_on === 0).length;
    TP.modal(`ارسال ${list.length} ارجاع`, `ساعت‌شمار مهلت شروع می‌شود و برای این کارشناسان اعلان می‌رود:<br><br>${Object.entries(by).map(([e, c]) => `${esc(e)} — ${c} درخواست`).join("<br>")}<br><br><span class="chip info">اعلان تلگرام — اگر تلگرام کارشناس وصل باشد</span>${aiN || manN ? ` <span class="chip">🤖 ${M(aiN)} هوشمند · ✋ ${M(manN)} دستی</span>` : ""}`,
      async () => { try { await TP.api("/dispatch", { body: { assignment_ids: list.map((a) => a.id) } }); TP.ui.success(`${M(list.length)} ارجاع ارسال شد`); await refresh(); } catch (e) { TP.modal("خطا", esc(e.message), null, "باشد", ""); } }, "تأیید و ارسال");
  }
  const ACT = {
    hold: ["تعلیق", "<b>تعلیق موقت است.</b> پایش و یادآوری مهلت متوقف می‌شود و درخواست از کارتابل خارج می‌شود، ولی هر زمان با «بازگشت» دوباره در جریان می‌افتد."],
    stop: ["توقف", "<b>توقف نهایی است.</b> اقلام کنسل می‌شوند و از کارتابل خارج می‌شوند. برای ادامه باید در راهکاران دوباره فعال شوند."],
    closed: ["خاتمه", "اقلام خاتمه‌یافته تلقی می‌شوند و از کارتابل خارج می‌شوند."],
    open: ["بازگشت به جریان", "اقلام از تعلیق خارج و دوباره وارد کارتابل کارشناس می‌شوند. پایش از سر گرفته می‌شود."],
  };
  function doAct(st, aid) {
    const r = S.data.requests.find((x) => x.assignments.some((a) => a.id === aid)); const a = r && r.assignments.find((x) => x.id === aid); if (!a) return;
    /* پیام تلگرام فقط وقتی می‌رود که ارجاع ارسال شده، قلمی واقعاً وضعیت عوض کند و تلگرام کارشناس وصل باشد (worker/api.js، setState) */
    const ex = S.data.experts.find((e) => e.id === a.expert_id), change = itemsOf(r, a).some((i) => i.state !== "closed" && i.state !== st);
    const tg = !a.dispatched_at ? `<span class="chip">ارسال‌نشده؛ اعلانی به کارشناس نمی‌رود</span>`
      : !change ? `<span class="chip">وضعیت اقلام همین است؛ اعلانی نمی‌رود</span>`
      : ex && ex.telegram_chat ? `<span class="chip info">اعلان تلگرام به کارشناس می‌رود</span>` : `<span class="chip warn">تلگرام کارشناس وصل نیست؛ اعلانی نمی‌رود</span>`;
    TP.modal(`${ACT[st][0]} — درخواست ${esc(r.id)}`, `<b>${esc(r.party)}</b> · کارشناس ${esc(a.expert_label || a.expert_name)}<br><br>${ACT[st][1]}<br><br>${tg}`,
      async () => { try { await TP.api("/items/state", { body: { assignment_id: aid, request_id: r.id, state: st } }); TP.ui.success(`${ACT[st][0]} انجام شد`); await refresh(); } catch (e) { TP.modal("خطا", esc(e.message), null, "باشد", ""); } }, `تأیید ${ACT[st][0]}`);
  }
  function moveDialog(aid) {
    const r = S.data.requests.find((x) => x.assignments.some((a) => a.id === aid)); const a = r.assignments.find((x) => x.id === aid);
    const E = expertsSorted().filter((e) => e.id !== a.expert_id);
    const d = TP.modal(`تغییر کارشناس — درخواست ${esc(r.id)}`, `کارشناس فعلی: <b>${esc(a.expert_label || a.expert_name)}</b><br><br>
      <select class="tp-select" id="mv-exp" style="width:100%"><option value="">— کارشناس جدید —</option>${E.map((e) => `<option value="${e.id}">${e.senior ? "★ " : ""}${esc(e.label || e.name)}</option>`).join("")}</select>
      <div class="tp-field" style="margin-top:10px"><b>مهلت جدید (روز کاری)</b><input class="tp-input" id="mv-days" value="${a.days || ""}" inputmode="numeric" style="width:110px;text-align:center"></div>
      <p class="dim" style="margin-top:10px;font-size:.85rem">اقلام، استعلام‌ها و پیش‌فاکتورها منتقل می‌شوند، ساعت‌شمار از نو شروع می‌شود و پیام «ارجاع جدید» در تلگرامِ کارشناس جدید می‌آید (اگر تلگرامش وصل باشد). کارشناس فعلی پیامی نمی‌گیرد.</p>`,
      /* مودال پیش از اجرای onYes از DOM جدا می‌شود؛ مقدارها را از خودِ عنصر مودال می‌خوانیم، نه document */
      async () => { const eid = +d.querySelector("#mv-exp").value, days = +d.querySelector("#mv-days").value; if (!eid) return; try { await TP.api("/reassign", { body: { assignment_id: aid, expert_id: eid, days } }); TP.ui.success("کارشناس عوض شد"); await refresh(); } catch (e) { TP.modal("خطا", esc(e.message), null, "باشد", ""); } }, "تغییر ارجاع");
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
    inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) importFile(f); };
    inp.click();
  }
  /* یک فایل اکسل، از هر راهی که رسیده باشد — دکمه یا رها کردن روی صفحه */
  async function importFile(f) {
    {
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
        /* بایگانیِ همهٔ درخواست‌ها (باز و بسته) برای گزارش سه‌ماهه — فقط ردیفِ تازه یا تغییرکرده فرستاده و نوشته می‌شود.
           ورودِ میز همین حالا تمام شده؛ خطای این مرحله فقط هشدار است تا تعارض‌ها بی‌نمایش نمانند */
        let hist = [], hw = 0, histErr = "";
        try {
          busy.set("بایگانی درخواست‌ها برای گزارش‌ها…");
          hist = TP.requestSummaries(parsed);
          const have = (await TP.api("/import/history")).fp || {}, todo = hist.filter((h) => have[h.id] !== h.fp);
          for (let i = 0; i < todo.length; i += 800) {
            busy.set(`بایگانی درخواست‌ها برای گزارش‌ها: ${M(Math.min(i + 800, todo.length))} از ${M(todo.length)} ردیف تازه یا تغییرکرده…`);
            hw += (await TP.api("/import/history", { body: { rows: todo.slice(i, i + 800) } })).written || 0;
          }
        } catch (e) { histErr = e.message || String(e); }
        busy.close();
        S.filter = { experts: [], expertText: "", statuses: null, state: "", window: "3d" }; S.q = { id: "", date: "", party: "", item: "" }; S.page.offset = 0; S.tab = "desk";
        await refresh();
        const unknown = Object.entries(st.unknownStatuses || {});
        const summary = `<b>${M(st.requests)}</b> درخواست · <b>${M(st.itemRows)}</b> سطر قلم · <b>${st.parties}</b> طرف مقابل · بازه ${esc(st.dateMin)} تا ${esc(st.dateMax)}<br>${st.closedItemsSkipped ? `<span class="dim"><b>${M(st.closedItemsSkipped)}</b> قلم «بسته شده» وارد نمی‌شود${st.partlyClosed ? ` (${M(st.partlyClosed)} درخواست فقط بخشی از اقلامش بسته است)` : ""} — <b>${M(st.liveItemRows)}</b> قلم وارد پنل می‌شود.</span><br>` : ""}
          <b>${M(st.openRequests)}</b> درخواست با قلم باز به سامانه فرستاده شد (${M(newR)} تازه) · <b>${M(st.closedRequests)}</b> درخواست کاملاً بسته/متوقف فقط برای همگام‌سازی.<br>
          ${histErr ? `<span style="color:#fcd34d">بایگانی گزارش‌ها به‌روز نشد (${M(hw)} ردیف نوشته شد): ${esc(histErr)} — با بارگذاری دوبارهٔ همین فایل کامل می‌شود.</span>`
            : `بایگانی گزارش‌ها: <b>${M(hist.length)}</b> درخواست (باز و بسته) — <b>${M(hw)}</b> ردیف تازه یا تغییرکرده نوشته شد.`}<br>
          <b>${M(st.unassignedOpen)}</b> درخواست باز بدون کارشناس · تعارض کارشناس: ${st.expertConflictAuto} مورد خودکار حل شد، <b>${st.expertConflictDecision}</b> مورد دو نام متفاوت (⚠).<br>
          ${st.statusMixed} درخواست وضعیت مختلط دارند (وضعیت روی قلم نگه داشته می‌شود). بزرگ‌ترین درخواست: ${st.maxItems} قلم.
          ${unknown.length ? `<br><span style="color:#fcd34d">وضعیت ناشناخته در فایل: ${unknown.map(([k, v]) => `«${esc(k)}» ×${v}`).join("، ")} — باز فرض شد.</span>` : ""}
          ${st.badQty ? `<br><span style="color:#fcd34d">${st.badQty} سطر مقدار غیرعددی داشت.</span>` : ""}
          <br><br>${visible().length === 0 ? '<span style="color:#fca5a5">در بازه «امروز و دو روز گذشته» درخواستی نیست — بازه را روی «همه تاریخ‌ها» بگذارید.</span>' : `<b>${visible().length}</b> درخواست در بازهٔ فعلی.`}`;
        const nConf = fin.closeCandidates.length + fin.stateDrift.length + fin.expertDrift.length;
        if (!nConf) return TP.modal("فایل بارگذاری شد", summary, null, "باشد", "");
        showConflicts(summary, fin);
      } catch (e) { busy.close(); TP.modal("خطا در بارگذاری", esc(e.message).replace(/\n/g, "<br>"), null, "باشد", ""); }
    }
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

  /* ---------- حذف درخواست ----------
     حذف برگشت‌ناپذیر است و پیش‌فاکتورها و نامه‌ها را هم می‌برد، پس هم می‌گوید
     دقیقاً چه چیزی پاک می‌شود و هم برای «همه» تأیید نوشتاری می‌خواهد. */
  async function askDelete(ids) {
    const all = !ids;
    const body = all
      ? `<b style="color:#fca5a5">همهٔ ${M(S.page.total)} درخواست</b> با اقلام، ارجاع‌ها، استعلام‌ها، پیش‌فاکتورها و نامه‌هایشان پاک می‌شوند.
         فایل‌های ذخیره‌شده هم از انبار حذف می‌شوند.<br><br>این کار برگشت ندارد.<br><br>
         برای تأیید، عبارت <b>پاک کن</b> را بنویسید:<br>
         <input class="tp-input" id="del-ok" style="width:140px;margin-top:6px" autocomplete="off">`
      : `درخواست <b>${esc(ids[0])}</b> با همهٔ اقلام، ارجاع‌ها، استعلام‌ها، پیش‌فاکتورها و نامه‌هایش پاک می‌شود.<br><br>این کار برگشت ندارد.`;
    const d = TP.modal(all ? "پاک کردن کل میز" : "حذف درخواست", body, async () => {
      const confirm = all ? (d.querySelector("#del-ok") || {}).value : null;
      try {
        const r = await TP.api("/requests/delete", { body: all ? { all: true, confirm: (confirm || "").trim() } : { ids } });
        S.page.offset = 0;
        await refresh();
        TP.ui.success(`${M(r.requests)} درخواست حذف شد`);
      } catch (e) { TP.modal("حذف نشد", esc(e.message), null, "باشد", ""); }
    }, all ? "پاک کن" : "حذف کن");
    return d;
  }

  /* ---------- شروع ---------- */
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && S.fOpen && !S.pop && !document.querySelector(".tp-modal-bg, .tp-menu.open")) closeFilters(); });
  if (TP.manager.get()) refresh(); else render();
  window.addEventListener("tp-theme", render);
  /* بازخوانیِ خودکارِ بی‌پرش (خواستهٔ مالک، مهر ۱۴۰۵): فقط میز ارجاع، هر دقیقه، وقتی مدیر وسطِ نوشتن در فیلدی یا پنجره‌ای نیست؛
     فیلترها و جای اسکرول می‌مانند. ساعتِ رنگ باکس‌ها هم با همین بازخوانی به‌روز می‌شود. */
  TP.ui.autoRefresh(refresh, 60000, () => !!TP.manager.get() && S.tab === "desk" && !S.loading && !S.pop);
})();
