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

  const scoreOf = (eid, kind, key) => { const s = S.scores.scores.find((x) => x.expert_id === eid && x.kind === kind && x.key === key); return s ? s.score : 3; };
  const weightOf = (kind, key) => { const w = S.scores.weights.find((x) => x.kind === kind && x.key === key); return w ? w.w : 1; };
  /* ---------- ارجاع و مهلت هوشمند: توزیع متوازن با فرض تأیید مدیر ----------
     «زحمت» هر ارجاع = ضریب پروژه × (۱ واحد سربار درخواست + جمعِ ضریب گروه کالایی اقلامش)؛
     پس تعداد درخواست، تعداد اقلام، سختی گروه‌ها و اهمیت پروژه همه در آن هست.
     ظرفیت هر کارشناس = ظرفیت تنظیمات × زحمت یک درخواست میانگین ÷ ضریب سرعت او (عدد
     کمتر = سریع‌تر = ظرفیت بیشتر). بار فعلی = همهٔ ارجاع‌های باز، ارسال‌شده و ارسال‌نشده،
     چون فرض این است که مدیر همهٔ پیشنهادها را تأیید می‌کند. */
  const REQ_OVERHEAD = 1;
  const speedOf = (e) => Math.max(0.1, Number(e.speed) || 1);
  const effortOf = (party, titles) => weightOf("party", party) * (REQ_OVERHEAD + titles.reduce((n, t) => n + weightOf("category", catOf(t)), 0));
  let WL = null, WL_LOADING = false, WL_ERR = null;          /* پاسخ /workload */
  function needWorkload() {
    if (WL || WL_LOADING || WL_ERR) return;
    WL_LOADING = true;
    TP.api("/workload").then((r) => { WL = r; }).catch((e) => { WL_ERR = e.message; })
      .finally(() => { WL_LOADING = false; render(); });
  }
  async function loadWorkload() { WL = await TP.api("/workload"); WL_ERR = null; return WL; }
  function baseLoads(E) {
    const L = new Map(E.map((e) => [e.id, { effort: 0, reqs: 0, items: 0 }]));
    for (const g of (WL && WL.assignments) || []) {
      const x = L.get(g.expert_id); if (!x) continue;
      x.effort += effortOf(g.party, g.titles); x.reqs++; x.items += g.titles.length;
    }
    return L;
  }
  /* زحمت یک درخواست میانگین — مبنای تبدیل «ظرفیت n درخواست» به واحد زحمت */
  function unitEffort(extra) {
    const all = [...((WL && WL.assignments) || []).map((g) => effortOf(g.party, g.titles)), ...(extra || [])];
    return all.length ? all.reduce((n, x) => n + x, 0) / all.length : REQ_OVERHEAD + 1;
  }
  const capOf = (e, U) => Math.max(0.5, (Number(settings().capacity) || 8) * U / speedOf(e));

  /**
   * برنامهٔ ارجاع برای همهٔ درخواست‌های بی‌کارشناس با هم.
   * امتیاز کل = Σ تخصص (فرمول مدیر: گروه کالایی، پروژه) − Σ جریمهٔ بار؛ جریمه با مجذورِ
   * درصدِ اشغال رشد می‌کند، پس هر درخواستِ اضافه برای کارشناسِ پرتر گران‌تر است.
   * چیدمان اولیه حریصانه از بزرگ‌ترین درخواست، بعد جابه‌جایی و تعویض دوتایی تا وقتی
   * امتیاز کل بهتر شود.
   */
  function planAssign(pend) {
    const E = S.data.experts.filter((e) => e.active);
    const A = settings().assign;
    const wa = (+A.a || 0) / 100, wb = (+A.b || 0) / 100, wc = (+A.c || 0) / 100;
    const sb = A.op1 === "−" ? -1 : 1, sc = A.op2 === "+" ? 1 : -1;
    const jobs = pend.map((r) => { const titles = unassignedOpen(r).map((i) => i.title); return { r, titles, effort: effortOf(r.party, titles) }; })
      .sort((x, y) => y.effort - x.effort);
    const U = unitEffort(jobs.map((j) => j.effort));
    const before = baseLoads(E);
    const cap = E.map((e) => capOf(e, U));
    const loads = E.map((e) => before.get(e.id).effort);
    const pen = (k, eff) => { const p = 100 * eff / cap[k]; return p * p / 100; };
    const fit = jobs.map((j) => E.map((e) => {
      let ws = 0, ss = 0;
      for (const t of j.titles) { const c = catOf(t), w = weightOf("category", c); ws += w; ss += w * scoreOf(e.id, "category", c); }
      const g = ws ? ss / ws : scoreOf(e.id, "category", reqCat(j.r));
      return wa * (g / 5 * 100) + sb * wb * (scoreOf(e.id, "party", j.r.party) / 5 * 100);
    }));
    const at = [];
    jobs.forEach((j, n) => {
      let best = 0, bestV = -Infinity;
      E.forEach((e, k) => {
        const v = fit[n][k] + sc * wc * (pen(k, loads[k] + j.effort) - pen(k, loads[k]));
        if (v > bestV + 1e-9 || (Math.abs(v - bestV) <= 1e-9 && loads[k] / cap[k] < loads[best] / cap[best])) { best = k; bestV = v; }
      });
      at[n] = best; loads[best] += j.effort;
    });
    for (let pass = 0; pass < 40 && E.length > 1; pass++) {
      let moved = false;
      for (let n = 0; n < jobs.length; n++) {
        const k1 = at[n], ef = jobs[n].effort;
        for (let k2 = 0; k2 < E.length; k2++) {
          if (k2 === k1) continue;
          const d = fit[n][k2] - fit[n][k1] + sc * wc * (pen(k1, loads[k1] - ef) - pen(k1, loads[k1]) + pen(k2, loads[k2] + ef) - pen(k2, loads[k2]));
          if (d > 1e-6) { loads[k1] -= ef; loads[k2] += ef; at[n] = k2; moved = true; break; }
        }
      }
      if (jobs.length <= 400) {
        for (let n = 0; n < jobs.length; n++) {
          for (let m = n + 1; m < jobs.length; m++) {
            const k1 = at[n], k2 = at[m]; if (k1 === k2) continue;
            const e1 = jobs[n].effort, e2 = jobs[m].effort;
            const d = fit[n][k2] + fit[m][k1] - fit[n][k1] - fit[m][k2]
              + sc * wc * (pen(k1, loads[k1] - e1 + e2) - pen(k1, loads[k1]) + pen(k2, loads[k2] - e2 + e1) - pen(k2, loads[k2]));
            if (d > 1e-6) { loads[k1] += e2 - e1; loads[k2] += e1 - e2; at[n] = k2; at[m] = k1; moved = true; }
          }
        }
      }
      if (!moved) break;
    }
    const plan = jobs.map((j, n) => ({ r: j.r, e: E[at[n]], effort: j.effort, items: j.titles.length }));
    const after = new Map(E.map((e, k) => [e.id, { effort: loads[k], reqs: before.get(e.id).reqs, items: before.get(e.id).items }]));
    plan.forEach((p) => { const x = after.get(p.e.id); x.reqs++; x.items += p.items; });
    return { plan, before, after, U, cap: new Map(E.map((e, k) => [e.id, cap[k]])) };
  }

  /* مهلت یک ارجاع: فرمول مدیر (پایه، سرعت کارشناس، ضریب پروژه، میانگینِ ضریب گروهِ اقلام)
     × ریشهٔ دومِ تعداد اقلام × ضریب اشغالِ کارشناس (فقط وقتی از ظرفیتش پرتر است). */
  const OPS = { "×": (x, y) => x * y, "÷": (x, y) => x / (y || 1), "+": (x, y) => x + y, "−": (x, y) => x - y };
  function deadlineOf(party, titles, e, loadPct) {
    const D = settings().deadline, f = (x, op, y) => (OPS[op] || OPS["×"])(x, y);
    const wi = titles.length ? titles.reduce((n, t) => n + weightOf("category", catOf(t)), 0) / titles.length : 1;
    let v = f(+D.base || 1, D.op1, speedOf(e) * (+D.we || 1));
    v = f(v, D.op2, weightOf("party", party) * (+D.wp || 1));
    v = f(v, D.op3, wi * (+D.wi || 1));
    const size = Math.sqrt(Math.max(1, titles.length)), busy = Math.max(1, (loadPct || 0) / 100);
    return { days: Math.max(1, Math.round(v * size * busy)), base: v, size, busy };
  }
  /* list: ارجاع‌های ارسال‌نشده؛ اشغال هر کارشناس از همهٔ ارجاع‌های بازش (با فرض تأیید همه) */
  function planDeadlines(list) {
    const E = S.data.experts.filter((e) => e.active);
    const U = unitEffort(), L = baseLoads(E);
    return list.map(({ r, a }) => {
      const e = S.data.experts.find((x) => x.id === a.expert_id); if (!e) return null;
      const titles = itemsOf(r, a).filter((i) => i.state === "open" || i.state === "hold").map((i) => i.title);
      const x = L.get(e.id), pct = x ? 100 * x.effort / capOf(e, U) : 0;
      return { r, a, e, pct, items: titles.length, ...deadlineOf(r.party, titles, e, pct) };
    }).filter(Boolean);
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
      if (!TP.hit(r.party, S.q.party)) return false;
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
    const TABS = [["desk", "میز ارجاع"], ["experts", "کارشناسان"], ["alerts", "تنظیم اعلانات"], ["asg", "ارجاع هوشمند"], ["dl", "مهلت هوشمند"], ["norm", "اقلام و کدها"], ["hist", "سوابق تأمین"], ["reports", "گزارش‌ها"], ["log", "تصمیم‌ها و رویدادها"]];
    return `<header class="tp-top">
      <div class="brand"><img src="../assets/logo-new.jpg" alt=""><div><h1>میز ارجاع خرید</h1><div class="sub">${S.page.total > R.length ? `${M(S.page.total)} درخواست در بازه · ${R.length} بارگذاری‌شده` : `${R.length} درخواست`} · ${M(items)} قلم · ${esc(CFG.company)}</div></div></div>
      <span class="spacer"></span>
      <button class="tp-btn" data-import>بارگذاری درخواست‌های روزانه</button>
      ${TP.themeBtn()}
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
  function vFilters() {
    const nE = S.filter.experts.length, txt = S.filter.expertText;
    const expLabel = nE || txt ? `${nE ? `${M(nE)} کارشناس` : ""}${nE && txt ? " · " : ""}${txt ? `«${esc(txt)}»` : ""}` : "همه";
    const sel = statusSel(), stLabel = sel.length === STATUS_ALL.length ? "همه" : sel.length === STATUS_DEFAULT.length && STATUS_DEFAULT.every((s) => sel.includes(s)) ? "بازها (پیش‌فرض)" : sel.join("، ");
    return `<div class="tp-filters">
      <span class="lab">کارشناس</span><span class="fwrap"><button class="tp-btn sm ${nE || txt ? "primary" : ""}" data-fopen="expert">${expLabel} ▾</button>${vPop("expert")}</span>
      <span class="lab">وضعیت</span><span class="fwrap"><button class="tp-btn sm ${sel.length !== STATUS_DEFAULT.length || !STATUS_DEFAULT.every((s) => sel.includes(s)) ? "primary" : ""}" data-fopen="status" title="${esc(sel.join("، "))}">${stLabel.length > 40 ? stLabel.slice(0, 38) + "…" : stLabel} ▾</button>${vPop("status")}</span>
      <span class="lab">مرحله</span><select class="tp-select" data-f="state"><option value="">همه</option>
        <option value="pending" ${S.filter.state === "pending" ? "selected" : ""}>ارسال‌نشده</option><option value="ready" ${S.filter.state === "ready" ? "selected" : ""}>آماده ارسال</option>
        <option value="sent" ${S.filter.state === "sent" ? "selected" : ""}>ارسال‌شده</option><option value="closed" ${S.filter.state === "closed" ? "selected" : ""}>بسته/متوقف</option></select>
      <span class="lab">بازه</span><select class="tp-select" data-f="window">${WINDOWS.map(([k, l]) => `<option value="${k}" ${S.filter.window === k ? "selected" : ""}>${l}</option>`).join("")}</select>
      <button class="tp-btn sm" data-clear>پاک کردن فیلترها</button>
      ${S.page.total ? `<button class="tp-btn sm danger" data-purge title="همهٔ درخواست‌ها را از سامانه پاک می‌کند">پاک کردن میز</button>` : ""}
      <span class="end">${visible().length} از ${S.data.requests.length} درخواست${S.page.total > S.page.limit ? ` · صفحهٔ ${Math.floor(S.page.offset / S.page.limit) + 1} از ${Math.ceil(S.page.total / S.page.limit)}
        <button class="tp-btn xs" data-page="-1" ${S.page.offset ? "" : "disabled"}>قبلی</button><button class="tp-btn xs" data-page="1" ${S.page.offset + S.page.limit < S.page.total ? "" : "disabled"}>بعدی</button>` : ""}</span></div>`;
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
  function stageBoxes(r, a) {
    const A = { dispatchedAt: a.dispatched_at, days: a.days, done: doneFlags(r, a), active: isActive(r, a) };
    const thr = thrFor(a.expert_id);
    return TP.STAGES.map((s, i) => {
      let lab = ""; if (i === 3 && a.quote_count) lab = `<span class="cnt">${a.quote_count}</span>`; if (i === 4 && a.proforma_count) lab = `<span class="cnt">${a.proforma_count}</span>`;
      return `<td class="console"><div class="box b-${TP.stageColor(A, i, thr, S.now)}" title="${s}">${lab}</div></td>`;
    }).join("");
  }

  function vDesk() {
    if (!S.data.requests.length && (S.data.all_total || 0) > 0 && S.filter.window !== "all") {
      /* بازهٔ تاریخ خالی است ولی درخواست باز داریم — نگوییم «فایلی نیست» */
      const w = WINDOWS.find((x) => x[0] === S.filter.window);
      return `<div class="empty"><b>در بازهٔ «${esc(w ? w[1] : "")}» درخواست بازی نیست.</b>${M(S.data.all_total)} درخواست باز با تاریخ قدیمی‌تر در سامانه هست.<br><br><button class="tp-btn primary" data-win-all>نمایش همه تاریخ‌ها</button></div>`;
    }
    if (!S.data.requests.length) return `<div class="empty"><b>هنوز فایلی بارگذاری نشده است.</b>با دکمه «بارگذاری درخواست‌های روزانه» فایل خروجی راهکاران (.xlsx) را انتخاب کنید — یا فایل را همین‌جا روی صفحه رها کنید.</div>`;
    const rows = visible();
    /* نتیجهٔ خالیِ فیلتر هم سرآیند و ردیف فیلترها را نگه می‌دارد؛ وگرنه کادرهای جستجو
       ناپدید می‌شدند و راهی جز «پاک کردن فیلترها» برای برگشتن نمی‌ماند. */
    const noRows = rows.length ? "" : `<tr><td colspan="19"><div class="empty">با این فیلترها درخواستی در این بازه نیست.${S.q.id.trim().length >= 4
      ? `<br><br><button class="tp-btn" data-lookup="${esc(S.q.id.trim())}">جستجوی شماره «${esc(S.q.id.trim())}» در کل سامانه (خارج از بازه)</button>` : ""}</div></td></tr>`;
    let h = `<div class="tp-scroll" data-keep-scroll style="max-height:calc(100vh - 300px)"><table class="tp-table"><thead>
      <tr class="group"><th colspan="7">داده فایل ورودی</th><th colspan="3" class="sep">تصمیم مدیر</th><th colspan="7" class="console sep">پایش مراحل</th><th colspan="2" class="sep">اقدام</th></tr>
      <tr><th class="stick"></th><th>شماره<br>درخواست</th><th>تاریخ</th><th>تاریخ نیاز</th><th class="rt">طرف مقابل</th><th>اقلام</th><th>وضعیت</th>
        <th class="sep">کارشناس خرید<br><button class="tp-btn xs" data-auto="asg" title="ارجاع هوشمند روی همه درخواست‌های ارسال‌نشده">خودکار</button></th>
        <th>مهلت (روز کاری)<br><button class="tp-btn xs" data-auto="dl" title="مهلت هوشمند روی همه ارسال‌نشده‌های کارشناس‌دار">خودکار</button></th><th>قلم</th>
        <th class="console sep">ارسال</th>${TP.STAGES.map((s) => `<th class="console">${s.replace(" ", "<br>")}</th>`).join("")}
        <th class="sep">وضعیت و اقدام</th><th>پنل</th></tr>
      <tr class="flt"><th class="stick"></th><th><input class="tp-input ${S.q.id ? "on" : ""}" data-q="id" value="${esc(S.q.id)}" placeholder="جستجو"></th>
        <th><input class="tp-input date ${S.q.date ? "on" : ""}" data-q="date" value="${esc(S.q.date)}" placeholder="تاریخ" readonly></th><th></th>
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
      /* وضعیتِ مؤثر (بسته/در جریان/ثبت شده…) — همان که فیلتر وضعیت روی آن کار می‌کند */
      const srcChips = [...new Set(r.items.map((i) => statusOf(r, i)))].map((s) => `<span class="st ${TP.SRC_CLS[s] || (s === "در جریان" ? "st-run" : "st-reg")}">${esc(s)}</span>`).join(" ");
      const need = r.items.map((i) => i.need_date).filter(Boolean).sort()[0] || "";
      units.forEach((u, k) => {
        h += `<tr>`;
        if (k === 0) {
          h += `<td class="stick"${rs}><button class="tp-btn xs" data-toggle="${esc(r.id)}" title="اقلام">${S.open[r.id] ? "▾" : "◂"} ${r.items.length}</button>
              <button class="tp-btn xs danger" data-del="${esc(r.id)}" title="حذف این درخواست از سامانه">✕</button></td>
            <td class="id num"${rs}>${esc(r.id)}</td><td class="num"${rs}>${esc(r.date)}</td><td class="num"${rs} title="نزدیک‌ترین تاریخ نیاز اقلام">${esc(need)}</td>
            <td class="party"${rs}>${esc(r.party)}${r.center ? `<div class="dim" style="font-size:.75rem">${esc(r.center)}</div>` : ""}</td>
            <td class="item"${rs}><div style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.items.map((i) => i.title).join(" · "))}">${esc(r.items[0] ? r.items[0].title : "")}</div>${r.items.length > 1 ? `<div class="dim" style="font-size:.75rem">و ${r.items.length - 1} قلم دیگر</div>` : ""}</td>
            <td${rs}>${srcChips}</td>`;
        }
        if (u.a) {
          const a = u.a, lock = a.dispatched_at ? "disabled" : "", its = itemsOf(r, a);
          h += `<td class="sep expcell"><select class="tp-select" data-assign="${esc(r.id)}" data-aid="${a.id}" ${lock}><option value="">— انتخاب کارشناس —</option>${expertOpts(a.expert_id)}</select>${fileExpert(its, a.expert_name)}</td>
            <td><input class="tp-input num ${a.days ? "" : "unset"}" style="width:64px;text-align:center" data-days="${a.id}" value="${esc(a.days || "")}" inputmode="numeric" ${lock}></td>
            <td class="num">${its.length}</td>
            <td class="console sep"><div class="box b-${TP.dispatchColor(r.imported_at || S.now, settings().dispatchDays, a.dispatched_at, S.now)}" title="${a.dispatched_at ? "ارسال شد " + TP.fmt(a.dispatched_at) : "ارسال‌نشده"}"></div></td>
            ${stageBoxes(r, a)}
            <td class="sep" style="white-space:nowrap"><span class="st ${STL.cls}">${isActive(r, a) ? "در جریان" : STL.label}</span>${itemStates(its)}<br>
              <button class="tp-btn xs warn" data-act="hold|${a.id}">تعلیق</button><button class="tp-btn xs danger" data-act="stop|${a.id}">توقف</button><button class="tp-btn xs" data-act="closed|${a.id}">خاتمه</button>
              ${its.some((i) => i.state === "hold") ? `<button class="tp-btn xs" data-act="open|${a.id}">بازگشت</button>` : ""}</td>
            <td><button class="tp-btn xs" data-open="${a.id}">مشاهده</button> <button class="tp-btn xs" data-move="${a.id}" ${a.dispatched_at ? "" : "disabled"}>تغییر</button></td>`;
        } else if (u.un) {
          h += `<td class="sep expcell"><select class="tp-select unset" data-assign="${esc(r.id)}"><option value="">— انتخاب کارشناس —</option>${expertOpts(null)}</select>${fileExpert(u.un.some((i) => i.src_expert) ? u.un : r.items, null)}</td>
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
        h += `<tr class="drawer"><td colspan="19"><div class="drawer-in"><table><thead><tr><th>#</th><th>کد قلم</th><th>عنوان</th><th>مشخصه فنی</th><th>توضیحات</th><th>مقدار</th><th>واحد</th><th>تاریخ نیاز</th><th>مهلت استعلام</th><th>مصرف‌کننده</th><th>وضعیت راهکاران</th><th>کارشناس فایل</th><th>وضعیت سامانه</th><th>کارشناس</th></tr></thead><tbody>
          ${r.items.map((i) => { const a = r.assignments.find((x) => x.id === i.assignment_id); return `<tr><td class="num">${i.line_no}</td><td class="num">${esc(i.code)}</td><td>${esc(i.title)}</td><td class="dim">${esc(i.spec || "")}</td><td class="dim">${esc(i.note || "")}</td><td class="num">${i.qty == null ? "" : M(i.qty)}</td><td>${esc(i.unit)}</td><td class="num">${esc(i.need_date || "")}</td><td class="num">${esc(i.quote_deadline || "")}</td><td class="dim">${esc(i.consumer || "")}</td>
            <td><span class="st ${TP.SRC_CLS[i.src_status] || "st-reg"}">${esc(i.src_status || "")}</span></td><td class="dim">${esc(i.src_expert || "—")}</td><td><span class="st ${TP.STATES[i.state].cls}">${TP.STATES[i.state].label}</span></td>
            <td>${a ? esc(a.expert_label || a.expert_name) : (i.state === "open" ? `<span class="chip warn">بدون کارشناس</span>` : "—")}</td></tr>`; }).join("")}
          </tbody></table></div></td></tr>`;
      }
    }
    return h + noRows + `</tbody></table></div>`;
  }

  /* ---------- کارشناسان ----------
     ستون اول نام (کلیک = ویرایش)، ✕ حذف (غیرفعال)، ★ کارشناس ارشد — ارشدها ستون می‌شوند و در
     خانهٔ (کارشناس × ارشد) تیک سبز یعنی زیر نظر اوست؛ هر کارشناس فقط یک سرپرست.
     «مشاهده اعلانات» می‌گوید پایشِ آن کارشناس برای مدیر بیاید یا فقط برای ارشدش. */
  /* چینش ثابت از راست: «اعلان به مدیر» (تیک، کم‌عرض) · ✕ · ★ · نام — این چهار ستون عرض و جای ثابت
     دارند و با افزودن ارشد تکان نمی‌خورند؛ ستون ارشدها از پنجم به بعد، و «کد ورود» و «بار باز» ته جدول.
     table-layout:fixed + colgroup: عرض هر ستون از خودِ colgroup می‌آید نه از محتوایش. */
  const EX_W = { notify: 58, del: 40, star: 40, name: 230, senior: 120, code: 84, load: 66 };
  function vExperts() {
    const E = expertsSorted(), seniors = E.filter((e) => e.senior), W = EX_W;
    const total = W.notify + W.del + W.star + W.name + seniors.length * W.senior + W.code + W.load;
    const nameCell = (e) => S.editName === e.id
      ? `<input class="tp-input" data-ename="${e.id}" value="${esc(e.label || e.name)}" style="width:100%" autofocus>`
      : `<span class="ename" data-ename-edit="${e.id}" title="برای ویرایش نام کلیک کنید">${esc(e.label || e.name)}</span>`;
    const notifyCell = (e) => {
      const hasSenior = !!(e.senior_id && seniors.some((s) => s.id === e.senior_id));
      const tip = hasSenior ? (e.notify_to === "senior" ? "اعلان‌های این کارشناس فقط برای کارشناس ارشدش می‌رود — تیک بزنید تا برای شما هم بیاید" : "اعلان‌های این کارشناس برای شما هم می‌آید — تیک را بردارید تا فقط برای ارشدش برود")
        : "این کارشناس زیر نظر ارشدی نیست؛ اعلان‌هایش همیشه برای شما می‌آید";
      return `<input type="checkbox" data-enotify="${e.id}" ${!hasSenior || e.notify_to !== "senior" ? "checked" : ""} ${hasSenior ? "" : "disabled"} title="${tip}">`;
    };
    return `<div class="tp-card tp-pane" style="max-width:none"><h2>کارشناسان</h2>
      <p class="lead">روی نام هر کارشناس کلیک کنید و عوضش کنید. <b>★</b> او را کارشناس ارشد می‌کند و نامش ستونی می‌شود که زیرِ آن، کارشناسان تیمش را تیک می‌زنید (هر کارشناس فقط زیر نظر یک ارشد). <b>✕</b> کارشناس را از فهرست برمی‌دارد. تیکِ «اعلان به مدیر» یعنی اعلان‌های پایش آن کارشناس برای شما هم بیاید؛ بی‌تیک، فقط برای کارشناس ارشدش می‌رود.</p>
      <div class="tp-scroll" data-keep-scroll style="max-height:60vh"><table class="tp-mx ex-mx" style="width:${total}px"><colgroup>
          <col style="width:${W.notify}px"><col style="width:${W.del}px"><col style="width:${W.star}px"><col style="width:${W.name}px">
          ${seniors.map(() => `<col style="width:${W.senior}px">`).join("")}<col style="width:${W.code}px"><col style="width:${W.load}px"></colgroup>
        <thead><tr><th title="اعلان‌های پایش این کارشناس برای مدیر هم بیاید">اعلان به<br>مدیر</th><th title="حذف از فهرست">✕</th><th title="کارشناس ارشد">★</th><th class="rt">کارشناس</th>
          ${seniors.map((s) => `<th class="sen" title="${esc(s.label || s.name)}">★ ${esc(s.label || s.name)}${s.team_connected ? ` <span class="chip ok" title="گروه تلگرام تیم وصل است">گروه</span>` : ""}</th>`).join("")}<th>کد ورود</th><th>بار باز</th></tr></thead><tbody>
        ${E.map((e) => `<tr>
          <td>${notifyCell(e)}</td>
          <td><button class="tp-btn xs danger" data-edel="${e.id}" title="حذف از فهرست">✕</button></td>
          <td><button class="tp-btn xs ${e.senior ? "primary" : ""}" data-estar="${e.id}" title="${e.senior ? "برداشتن ارشدی" : "کارشناس ارشد شود"}">★</button></td>
          <td class="rt nm">${nameCell(e)}</td>
          ${seniors.map((s) => `<td>${s.id === e.id ? `<span class="dim">—</span>` : `<button class="tri ${e.senior_id === s.id ? "ok" : "unk"}" data-eteam="${e.id}|${s.id}" title="${e.senior_id === s.id ? "زیر نظر " + esc(s.label || s.name) : "زیر نظر " + esc(s.label || s.name) + " قرار بگیرد"}">${e.senior_id === s.id ? "✓" : ""}</button>`}</td>`).join("")}
          <td class="num">${S.editCode === e.id
            ? `<input class="tp-input num" data-ecode="${e.id}" value="${esc(e.code)}" inputmode="numeric" maxlength="8" style="width:100%;text-align:center" title="۴ تا ۸ رقم؛ Enter برای ذخیره">`
            : `<span class="ename" data-ecode-edit="${e.id}" title="کد ورود (رمز پنل) — برای تغییر کلیک کنید">${esc(e.code)}</span>`}</td><td class="num">${M(e.open_load || 0)}</td></tr>`).join("")}
        <tr><td colspan="3"></td><td class="rt" colspan="${3 + seniors.length}"><button class="tp-btn sm" data-eadd>＋ کارشناس جدید</button></td></tr>
      </tbody></table></div>
      <div class="tp-note">این چینش همه‌جا اثر می‌کند: فهرست انتخاب کارشناس در میز ارجاع (ارشدها اول)، تب «تیم کارشناسی» و «ارجاع به تیم» در پنل کارشناس ارشد، و مقصد اعلان‌های تلگرام. گروه‌های «گزارش سه ماهه» جدا ذخیره می‌شوند و این جدول فقط پیش‌فرضِ کارشناسی است که هنوز در آن‌ها جا داده نشده.</div></div>`;
  }
  async function expertPatch(id, body) {
    try { await TP.api(`/experts/${id}`, { method: "PUT", body }); S.data.experts = (await TP.api("/experts")).experts; render(); }
    catch (e) { TP.modal("خطا", esc(e.message), null, "باشد", ""); }
  }
  function addExpertDialog() {
    const d = TP.modal("کارشناس جدید", `<div class="tp-field"><b>نام و نام خانوادگی</b><input class="tp-input" id="ne-name" style="width:100%"></div>
      <div class="tp-field" style="margin-top:8px"><b>نام کوتاه (مثلاً «آقای بهمنی») — اختیاری</b><input class="tp-input" id="ne-label" style="width:100%"></div>
      <div class="tp-field" style="margin-top:8px"><b>کد ورود (فقط رقم)</b><input class="tp-input" id="ne-code" inputmode="numeric" style="width:160px"></div>`,
      async () => {
        try { await TP.api("/experts", { body: { name: d.querySelector("#ne-name").value, label: d.querySelector("#ne-label").value, code: d.querySelector("#ne-code").value } }); S.data.experts = (await TP.api("/experts")).experts; render(); }
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

  function vHist() {
    const h = S.hist, c = h && h.current, v2 = h && h.format === 2;
    const k = (lab, val) => `<div class="k"><b>${lab}</b><span style="font-size:.95rem">${val}</span></div>`;
    const fs = (c && c.file) || {};
    const files = c && c.files ? Object.values(c.files).map((n) => `<span class="chip">${esc(n)}</span>`).join(" ") : "";
    return `<div class="tp-card tp-pane" style="max-width:1000px"><h2>سوابق تأمین</h2>
      <p class="lead">سوابق خرید شرکت به‌همراه فهرست نرمال‌شدهٔ اقلام. کارشناس در تب «بررسی سوابق» تأمین‌کنندگان هر قلم را در دو حالت می‌بیند — <b>عین قلم</b> (همان نوع قلم با همان لایه‌های ویژگی) و <b>نوع قلم</b> (همهٔ اقلام همان نوع) — با مقدار به واحد مرجع و قیمت به زمستان ۱۴۰۴؛ بدون مدل زبانی و با کوئری ثابت.</p>
      ${!h ? `<div class="empty">در حال بارگیری وضعیت…</div>`
        : c && v2 ? `<div class="kpi">${k("بارگذاری", TP.fmt(c.finished_at || c.imported_at))}${k("ردیف خرید", M(c.rows))}${k("تأمین‌کننده", M(c.suppliers))}
            ${k("با کد و رده", M(fs.graded || 0))}${k("کد قلم", M(c.codes))}${k("بازه", `${ymFa(c.minYm)} تا ${ymFa(c.maxYm)}`)}
            ${k("فهرست اقلام", `${M(fs.items || 0)} قلم · ${M(fs.heads || 0)} نوع`)}${k("مبنای قیمت", h.base.priceLabel)}</div>
          ${files ? `<div class="tp-row" style="flex-wrap:wrap;gap:6px">${files}</div>` : ""}
          ${fs.noIndex ? `<div class="tp-note">${M(fs.noIndex)} خرید (${Object.keys(fs.noIndexYears || {}).map((y) => M(y)).join("، ")}) شاخص تعدیل ندارند — آمارشان هنوز منتشر نشده — و با ضریب ۱ آمده‌اند.</div>` : ""}
          ${fs.skipped ? `<div class="tp-note">${M(fs.skipped)} ردیف فایل سوابق تأمین‌کننده نداشت و کنار گذاشته شد (در رتبه‌بندی تأمین‌کنندگان به کاری نمی‌آید).</div>` : ""}
          ${fs.norm ? `<div class="tp-note">${normLine(fs.norm)}</div>` : ""}`
        : c ? `<div class="tp-note warn"><b>سوابق فعلی با قالب قدیمی است</b> (شاخص تعدیل درون هر ردیف، ${M(c.rows)} ردیف از «${esc(c.filename || "—")}»). تا چهار فایل تازه بارگذاری نشود، تب «بررسی سوابق» کارشناس پیام «قالب قدیمی» می‌دهد.</div>`
        : `<div class="empty"><b>هنوز سوابقی بارگذاری نشده است.</b>تا آن زمان تب «بررسی سوابق» کارشناس پیام «بارگذاری نشده» می‌دهد.</div>`}
      ${h && h.loading && h.loading.fp ? `<div class="tp-note warn">یک بارگذاری نیمه‌کاره از ${TP.fmt(h.loading.imported_at)} هست — احتمالاً سهمیهٔ روزانهٔ دیتابیس تمام شده بود. همان چهار فایل را دوباره بارگذاری کنید تا از همان‌جا ادامه یابد؛ ردیف‌های نوشته‌شده دوباره نوشته نمی‌شوند. تا پایانش، سوابق قبلی سر جایش است.</div>` : ""}
      <div class="tp-row"><button class="tp-btn primary" data-hist-import>بارگذاری چهار فایل مرجع (.xlsx)</button>
        <span class="dim" style="font-size:.85rem">هر چهار فایل را با هم انتخاب کنید، یا وقتی روی همین تب هستید روی صفحه رها کنید.</span></div>
      <div class="tp-note">چهار فایل، که از روی کاربرگ‌هایشان شناخته می‌شوند نه از نامشان:
        <b>اقلام</b> (کاربرگ‌های items و item_attributes — نوع قلم و لایه‌های ویژگی هر کد) ·
        <b>شاخص تعدیل</b> (class_index و index_quarterly — شاخص هر طبقهٔ اصناف در هر فصل) ·
        <b>نرخ تبدیل واحد</b> (head_rates، cluster_rates و item_rates) ·
        <b>سوابق خرید</b> (خروجی راهکاران با ستون‌های «کد» و «رده»ی تأمین‌کننده).
        <br>بارگذاری فقط آنچه عوض شده را می‌نویسد: فایل سوابقِ تازه‌تر یعنی فقط ردیف‌های تازه؛ اگر فهرست اقلام یا شاخص‌ها عوض شده باشد، ردیف‌های خرید هم از نو ساخته می‌شوند.
        سقف روزانهٔ دیتابیس در پلن رایگان ${M(DAILY_WRITES)} ردیف نوشتن است؛ اگر وسط کار تمام شود، فردا همان فایل‌ها را دوباره بارگذاری کنید.</div></div>`;
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

  /* ---------- تنظیم اعلانات ---------- */
  function vAlerts() {
    const s = settings(), ticks = Array.isArray(s.mgrStages) && s.mgrStages.length === 6 ? s.mgrStages : [true, false, false, false, true, true];
    return `<div class="tp-card tp-pane"><h2>تنظیم اعلانات</h2>
      <p class="lead">تیکِ بالای هر مرحله یعنی تغییر وضعیت آن مرحله در تلگرام شما اعلام شود. هر درصد یعنی چند درصد از مهلت کارشناس باید بگذرد تا اگر آن مرحله انجام نشده باشد، هشدار برود. خالی = هشدار آن مرحله خاموش.</p>
      <div class="tp-grid6">${TP.STAGES.map((st, i) => `<div class="cell"><label title="اعلان این مرحله در تلگرام مدیر"><input type="checkbox" data-mstage="${i}" ${ticks[i] ? "checked" : ""}> <b>${st}</b></label><input class="tp-input" data-thr="${i}" value="${s.thresholds[i] === "" || s.thresholds[i] == null ? "" : s.thresholds[i]}" inputmode="numeric" placeholder="خالی"></div>`).join("")}</div>
      <div id="thrErr" style="color:#fca5a5;min-height:20px;font-size:.88rem"></div>
      <div class="tp-fields3">
        <div class="tp-field"><b>مهلت ارسال توسط مدیر (روز کاری از لحظهٔ بارگذاری)</b><input class="tp-input" id="ddays" value="${s.dispatchDays}" inputmode="numeric"></div>
        <div class="tp-field"><b>حداقل تأمین‌کننده به ازای هر قلم</b><input class="tp-input" id="minsup" value="${s.minSuppliers}" inputmode="numeric"></div>
        <div class="tp-field"><b>ظرفیت درخواست باز هر کارشناس (بار کاری)</b><input class="tp-input" id="capacity" value="${s.capacity}" inputmode="numeric"></div>
        <div style="padding-bottom:6px">${AUTOSAVED}</div></div>
      <div class="tp-note">«جدول کمیسیون» روی ۱۰۰ هرگز زرد نمی‌شود و مستقیم قرمز می‌شود. برای هشدار زودتر عددی کمتر بگذارید.</div>
      <div class="tp-note">کارشناس تا وقتی هر قلم به تعداد «حداقل تأمین‌کننده» استعلامِ ثبت‌شده نداشته باشد، نمی‌تواند جدول کمیسیون بسازد.</div></div>`;
  }

  /* ---------- ارجاع هوشمند ---------- */
  function vAssign() {
    const E = S.data.experts.filter((e) => e.active), A = settings().assign;
    const pend = S.data.requests.filter((r) => unassignedOpen(r).length);
    const parties = [...new Set(S.data.requests.map((r) => r.party))];
    const opSel = (k, v) => `<select class="tp-select op" data-asg-op="${k}">${["+", "−"].map((o) => `<option ${o === v ? "selected" : ""}>${o}</option>`).join("")}</select>`;
    const shortP = (p) => p.replace(/^مرکز هزینه\s*/, "").slice(0, 26) + (p.length > 32 ? "…" : "");
    needWorkload();
    const P = WL ? planAssign(pend) : null;
    const pctOf = (x, cap) => (cap ? Math.round(100 * x / cap) : 0);
    const bar = (p) => `<span class="bar-load"><i style="width:${Math.min(100, p)}%"></i></span> ${M(p)}٪`;
    const preview = WL_ERR ? `<div class="tp-note warn">بار فعلی کارشناسان خوانده نشد: ${esc(WL_ERR)}</div>`
      : !P ? `<div class="tp-note">در حال خواندن بار فعلی کارشناسان…</div>`
      : `<div class="tp-sect"><h3>پیش‌نمایش توزیع <span>${P.plan.length ? `با فرض تأیید همهٔ ${M(P.plan.length)} پیشنهاد` : "درخواست بی‌کارشناسی نیست — بار فعلی"}</span></h3>
        <div class="tp-scroll" data-keep-scroll style="max-height:380px"><table class="tp-mx"><thead><tr><th>کارشناس</th><th>درخواست باز</th><th>اقلام باز</th><th>زحمت</th><th>ظرفیت</th><th>اشغال فعلی</th><th>پیشنهاد تازه</th><th>اشغال بعد از تأیید</th></tr></thead><tbody>
        ${E.map((e) => {
          const b = P.before.get(e.id), a2 = P.after.get(e.id), cap = P.cap.get(e.id), add = P.plan.filter((p) => p.e.id === e.id);
          return `<tr><td class="name">${esc(e.label || e.name)}</td>
            <td class="num">${M(b.reqs)}${add.length ? ` → <b>${M(a2.reqs)}</b>` : ""}</td><td class="num">${M(b.items)}${add.length ? ` → <b>${M(a2.items)}</b>` : ""}</td>
            <td class="num">${b.effort.toFixed(1)}${add.length ? ` → <b>${a2.effort.toFixed(1)}</b>` : ""}</td><td class="num">${cap.toFixed(1)}</td>
            <td>${bar(pctOf(b.effort, cap))}</td>
            <td style="white-space:normal;max-width:280px">${add.length ? add.slice(0, 6).map((p) => `<span class="chip num" title="${esc(p.r.party)} · ${M(p.items)} قلم">${esc(p.r.id)}</span>`).join(" ") + (add.length > 6 ? ` <span class="dim">و ${M(add.length - 6)} دیگر</span>` : "") : "—"}</td>
            <td>${bar(pctOf(a2.effort, cap))}</td></tr>`;
        }).join("")}
        </tbody></table></div></div>`;
    return `<div class="tp-card tp-pane" style="max-width:none">
      <div class="tp-row" style="background:rgba(79,140,255,.08);border:1px solid var(--tp-line);border-radius:12px;padding:12px 14px">
        <button class="tp-btn primary" data-apply-asg ${pend.length && P ? "" : "disabled"}>اعمال پیشنهاد روی درخواست‌های بی‌کارشناس (${pend.length})</button>
        <span class="dim" style="font-size:.85rem">کارشناسی که خودتان انتخاب کرده‌اید دست نمی‌خورد و در بارِ فعلی حساب شده است.</span>
        <span style="margin-inline-start:auto">${AUTOSAVED}</span></div>
      <h2>ارجاع هوشمند</h2><p class="lead">پیشنهاد برای همهٔ درخواست‌های بی‌کارشناس <b>با هم</b> ساخته می‌شود، با این فرض که مدیر همه را تأیید می‌کند: هر درخواستی که به کسی داده می‌شود، بار او را برای درخواست بعدی بیشتر می‌کند. هدف تعادل دقیق بار کاری است — با حساب تعداد درخواست، تعداد اقلام، سختی گروه‌های کالایی، ضریب پروژه و ظرفیت هر کارشناس — و در همان حال تخصص و سابقهٔ پروژه. پیشنهاد الزام‌آور نیست و مدیر هرکدام را می‌تواند عوض کند.</p>
      <div class="tp-formula"><span class="eq">امتیاز =</span>
        <span class="term"><input class="tp-input" data-asg="a" value="${A.a}">٪ <b>تخصص در گروه کالایی</b></span>${opSel("op1", A.op1)}
        <span class="term"><input class="tp-input" data-asg="b" value="${A.b}">٪ <b>سابقه در این پروژه</b></span>${opSel("op2", A.op2)}
        <span class="term"><input class="tp-input" data-asg="c" value="${A.c}">٪ <b>جریمهٔ بار کاری</b></span></div>
      <div class="tp-note"><b>زحمت هر درخواست</b> = ضریب پروژه × (۱ واحد سربار + جمع ضریب گروه کالایی اقلامش) — ضریب‌ها همان جدول‌های تب «مهلت هوشمند»اند.
        <b>ظرفیت هر کارشناس</b> = ظرفیت تنظیمات (${M(settings().capacity)} درخواست) × زحمت یک درخواست میانگین ÷ ضریب سرعت او.
        <b>جریمهٔ بار</b> با مجذور درصد اشغال بزرگ می‌شود؛ پس هرچه کارشناسی پرتر باشد، هر درخواست اضافه برایش گران‌تر است و توزیع خودبه‌خود متوازن می‌شود.
        بعد از چیدمان اولیه (از بزرگ‌ترین درخواست)، جابه‌جایی‌ها و تعویض‌های دوتایی تا جایی ادامه می‌یابد که امتیاز کل دیگر بهتر نشود. امتیاز ۱ تا ۵ ماتریس‌ها را خودتان می‌دهید؛ پیش‌فرض ۳.</div>
      ${preview}
      <div class="tp-sect"><h3>۱. ماتریس کارشناس / گروه کالایی <span>امتیاز ۱ تا ۵</span></h3><div class="tp-scroll" data-keep-scroll style="max-height:320px"><table class="tp-mx"><thead><tr><th>کارشناس</th>${CATS.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>
        ${E.map((e) => `<tr><td class="name">${esc(e.label || e.name)}</td>${CATS.map((c) => `<td><input class="tp-input" data-g="${e.id}|${esc(c)}" value="${scoreOf(e.id, "category", c)}" inputmode="numeric"></td>`).join("")}</tr>`).join("")}</tbody></table></div></div>
      <div class="tp-sect"><h3>۲. ماتریس کارشناس / پروژه <span>امتیاز ۱ تا ۵ — فقط طرف‌های موجود در میز</span></h3><div class="tp-scroll" data-keep-scroll style="max-height:320px"><table class="tp-mx"><thead><tr><th>کارشناس</th>${parties.map((p) => `<th title="${esc(p)}">${esc(shortP(p))}</th>`).join("")}</tr></thead><tbody>
        ${E.map((e) => `<tr><td class="name">${esc(e.label || e.name)}</td>${parties.map((p) => `<td><input class="tp-input" data-p="${e.id}|${esc(p)}" value="${scoreOf(e.id, "party", p)}" inputmode="numeric"></td>`).join("")}</tr>`).join("")}</tbody></table></div></div></div>`;
  }

  /* ---------- مهلت هوشمند ---------- */
  function vDeadline() {
    const E = S.data.experts.filter((e) => e.active), D = settings().deadline;
    const list = S.data.requests.flatMap((r) => r.assignments.filter((a) => !a.dispatched_at && !(Number(a.days) > 0)).map((a) => ({ r, a })));
    const parties = [...new Set(S.data.requests.map((r) => r.party))];
    const opSel = (k, v) => `<select class="tp-select op" data-dl-op="${k}">${["×", "÷", "+", "−"].map((o) => `<option ${o === v ? "selected" : ""}>${o}</option>`).join("")}</select>`;
    const shortP = (p) => p.replace(/^مرکز هزینه\s*/, "").slice(0, 30) + (p.length > 36 ? "…" : "");
    needWorkload();
    const plans = WL ? planDeadlines(list) : [];
    const x0 = plans[0];
    const preview = WL_ERR ? `<div class="tp-note warn">بار فعلی کارشناسان خوانده نشد: ${esc(WL_ERR)}</div>`
      : !WL ? `<div class="tp-note">در حال خواندن بار فعلی کارشناسان…</div>`
      : plans.length ? `<div class="tp-sect"><h3>پیش‌نمایش مهلت‌ها <span>${M(plans.length)} ارجاع ارسال‌نشده — با فرض تأیید همه</span></h3>
        <div class="tp-scroll" data-keep-scroll style="max-height:360px"><table class="tp-mx"><thead><tr><th>درخواست</th><th>کارشناس</th><th>اقلام</th><th>فرمول</th><th>√اقلام</th><th>اشغال کارشناس</th><th>مهلت پیشنهادی</th></tr></thead><tbody>
        ${plans.slice(0, 60).map((x) => `<tr><td class="num">${esc(x.r.id)}</td><td class="name">${esc(x.e.label || x.e.name)}</td><td class="num">${M(x.items)}</td>
          <td class="num">${x.base.toFixed(2)}</td><td class="num">${x.size.toFixed(2)}</td><td class="num">${M(Math.round(x.pct))}٪${x.busy > 1 ? ` (× ${x.busy.toFixed(2)})` : ""}</td><td class="num"><b>${M(x.days)} روز</b></td></tr>`).join("")}
        </tbody></table></div></div>` : "";
    return `<div class="tp-card tp-pane" style="max-width:none">
      <div class="tp-row" style="background:rgba(79,140,255,.08);border:1px solid var(--tp-line);border-radius:12px;padding:12px 14px">
        <button class="tp-btn primary" data-apply-dl ${list.length && WL ? "" : "disabled"}>اعمال روی ارجاع‌های ارسال‌نشدهٔ بی‌مهلت (${list.length})</button>
        ${x0 ? `<span style="font-size:.9rem">نمونه — درخواست <b>${esc(x0.r.id)}</b> · ${esc(x0.e.label || x0.e.name)}: فرمول ${x0.base.toFixed(2)} × √اقلام ${x0.size.toFixed(2)} × اشغال ${x0.busy.toFixed(2)} ⇒ <b>${M(x0.days)} روز کاری</b></span>` : ""}
        <span style="margin-inline-start:auto">${AUTOSAVED}</span></div>
      <h2>مهلت هوشمند</h2><p class="lead">مهلت هر ارجاع با فرض تأیید همهٔ ارجاع‌ها حساب می‌شود: فرمول زیر (پایه، سرعت کارشناس، ضریب پروژه، و میانگین ضریب گروه کالایی اقلام) × ریشهٔ دوم تعداد اقلام × ضریب اشغال کارشناس. اشغال، بار همهٔ ارجاع‌های باز اوست بر ظرفیتش؛ تا ظرفیت، ضریبش ۱ است و بالاتر از آن مهلت به همان نسبت بلندتر می‌شود. نتیجه گرد و حداقل ۱ روز است.</p>
      <div class="tp-formula"><span class="eq">مهلت (روز) =</span>
        <span class="term"><input class="tp-input" data-dl="base" value="${D.base}"> <b>پایه</b></span>${opSel("op1", D.op1)}
        <span class="term"><input class="tp-input" data-dl="we" value="${D.we}"> <b>ضریب کارشناس</b></span>${opSel("op2", D.op2)}
        <span class="term"><input class="tp-input" data-dl="wp" value="${D.wp}"> <b>ضریب پروژه</b></span>${opSel("op3", D.op3)}
        <span class="term"><input class="tp-input" data-dl="wi" value="${D.wi}"> <b>ضریب گروه کالایی</b></span>
        <span class="eq">× √تعداد اقلام × ضریب اشغال</span></div>
      ${preview}
      <div class="tp-sect"><h3>۱. سرعت انجام کار کارشناس <span>عدد کمتر یعنی سریع‌تر — ظرفیت هم به همان نسبت بیشتر</span></h3><div class="tp-scroll" data-keep-scroll style="max-height:300px"><table class="tp-mx"><thead><tr><th>کارشناس</th><th>ضریب</th></tr></thead><tbody>
        ${E.map((x) => `<tr><td class="name">${esc(x.label || x.name)}</td><td><input class="tp-input" data-sp="${x.id}" value="${x.speed}"></td></tr>`).join("")}</tbody></table></div></div>
      <div class="tp-sect"><h3>۲. زمان موردنیاز گروه کالایی <span>همین ضریب «سختی» قلم در ارجاع هوشمند است</span></h3><div class="tp-scroll" style="max-height:300px"><table class="tp-mx"><thead><tr><th>گروه کالایی</th><th>ضریب</th></tr></thead><tbody>
        ${CATS.map((c) => `<tr><td class="name">${c}</td><td><input class="tp-input" data-cw="${esc(c)}" value="${weightOf("category", c)}"></td></tr>`).join("")}</tbody></table></div></div>
      <div class="tp-sect"><h3>۳. زمان موردنیاز پروژه <span>همین ضریب «اهمیت» پروژه در ارجاع هوشمند است</span></h3><div class="tp-scroll" data-keep-scroll style="max-height:300px"><table class="tp-mx"><thead><tr><th>پروژه</th><th>ضریب</th></tr></thead><tbody>
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

  /* ---------- گزارش‌ها ----------
     دو بخش: «وضعیت درخواست‌ها» (جدول با برش‌دهنده‌های وضعیت / طرف مقابل / کارشناس خرید، مثل فایل
     اکسل واحد، و برگهٔ «گزارش روزانه» با فیلتر ستون‌ها) و «گزارش سه ماهه» (تیک برگه‌ها، سال/فصل/ماه
     چندانتخابی، تیکِ کارشناسانِ همان دوره پیش از ساخت، پیش‌نمایش همان برگه‌ها و نمودارهایی که در
     فایل می‌رود). ساخت داده و فایل در worker/reports.js. */
  const RP = { part: "status", meta: null, metaLoading: false, status: null, loading: false, sheet: "general", sl: { 2: [], 7: [], 11: [] }, hidden: false, limit: 300,
    dq: ["", "", "", "", "", ""], dLimit: 300, pop: null, season: { years: null, seasons: null, months: [], sheets: null, result: null, idx: 0, busy: false } };
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
    } catch (e) { RP.err = e.message; }
    RP.metaLoading = false; render();
  }
  async function loadRepStatus() {
    RP.loading = true;
    try { RP.status = await TP.api("/reports/status"); RP.err = ""; } catch (e) { RP.err = e.message; }
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

  function vReports() {
    const part = RP.part;
    return `<div class="tp-card tp-pane rp" style="max-width:none">
      <div class="rp-head"><h2>گزارش‌ها</h2>
        <div class="rp-seg"><button class="${part === "status" ? "on" : ""}" data-rpart="status">وضعیت درخواست‌ها</button><button class="${part === "season" ? "on" : ""}" data-rpart="season">گزارش سه ماهه</button></div></div>
      ${RP.err ? `<div class="tp-note warn">${esc(RP.err)}</div>` : ""}
      ${part === "status" ? vRepStatus() : vRepSeason()}</div>`;
  }

  function vRepStatus() {
    const D = RP.status;
    if (!D) { if (!RP.loading) loadRepStatus(); return `<div class="empty">در حال ساخت گزارش وضعیت درخواست‌ها…</div>`; }
    const tabs = [["general", "درخواست کلی"], ["daily", "گزارش روزانه"]].map(([k, l]) => `<button class="rp-sheet ${RP.sheet === k ? "on" : ""}" data-rsheet="${k}">${l}</button>`).join("");
    return `<div class="rp-tools"><div class="rp-sheets">${tabs}</div><span class="rp-sp"></span>
        ${RP.sheet === "general" ? `<label class="chip" style="cursor:pointer;padding:3px 10px"><input type="checkbox" data-rhidden ${RP.hidden ? "checked" : ""}> ستون‌های پنهان فایل را هم نشان بده</label>` : ""}
        <button class="tp-btn sm" data-rstatus-reload title="ساخت دوباره از آخرین داده‌ها">↻ به‌روزرسانی</button>
        <button class="tp-btn sm primary" data-rstatus-xlsx>دانلود اکسل (هر دو برگه)</button>
        <span class="dim" style="font-size:.8rem">ساخته‌شده ${TP.fmt(D.generatedAt)}</span></div>
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
      ${rows.length > RP.limit ? `<div class="rp-more"><button class="tp-btn sm" data-rmore>${M(Math.min(300, rows.length - RP.limit))} ردیف بیشتر</button> <span>${M(RP.limit)} از ${M(rows.length)} ردیف نمایش داده شد</span></div>` : ""}</div>`;
    const slicers = SL.map(([c, cap]) => {
      const items = slicerItems(c), sel = RP.sl[c];
      return `<div class="slicer ${c === 7 ? "wide" : ""}"><div class="slh"><b>${cap}</b><button class="slx" data-slclear="${c}" ${sel.length ? "" : "disabled"} title="پاک کردن فیلتر">⊘</button></div>
        <div class="sll">${items.map((it) => `<button class="sli ${!sel.length || sel.includes(it.k) ? "on" : ""} ${it.n ? "" : "nodata"}" data-sl="${c}" data-k="${esc(it.k)}" title="${M(it.n)} درخواست">${esc(it.k)}</button>`).join("")}</div></div>`;
    }).join("");
    return `<div class="rp-count"><b>${M(rows.length)}</b> از ${M(D.general.length)} درخواست ${any ? `<button class="tp-btn xs" data-slall>پاک کردن همهٔ برش‌ها</button>` : ""}
        <span class="dim">روی هر گزینهٔ برش‌دهنده بزنید تا فقط همان بماند؛ گزینه‌های بعدی به انتخاب اضافه می‌شوند.</span></div>
      <div class="rp-grid">${table}<div class="rp-slicers">${slicers}</div></div>`;
  }
  function vRepDaily() {
    const D = RP.status, rows = D.daily.filter((r) => RP.dq.every((q, i) => !q || TP.hit(String(r[i] == null ? "" : r[i]), q)));
    return `<div class="rp-count"><b>${M(rows.length)}</b> از ${M(D.daily.length)} ارجاع ارسال‌شده · به ترتیب تاریخ تحویل به کارشناس</div>
      <div class="rp-paper rp-scroll" data-keep-scroll style="max-width:${RP_DW.reduce((a, w) => a + px(w), 0) + 180}px"><table class="rp-t rp-daily"><colgroup>${RP_DW.map((w) => `<col style="width:${px(w)}px">`).join("")}<col style="width:124px"></colgroup>
        <thead><tr>${D.dailyColumns.map((h) => `<th>${esc(h)}</th>`).join("")}<th></th></tr>
        <tr class="flt">${D.dailyColumns.map((_, i) => `<th>${i ? `<input class="tp-input" data-dq="${i}" value="${esc(RP.dq[i])}" placeholder="فیلتر">` : ""}</th>`).join("")}<th></th></tr></thead>
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
    return `${j(parts)} ${M([...s.years].sort((a, b) => a - b).join(" و "))}`;
  }
  function vRepSeason() {
    const meta = RP.meta, s = RP.season;
    if (!meta) { if (!RP.metaLoading) loadRepMeta(); return `<div class="empty">در حال خواندن سال‌ها و پروژه‌ها…</div>`; }
    const pop = (kind, label, active, body) => `<span class="fwrap"><button class="tp-btn sm ${active ? "primary" : ""}" data-rpop="${kind}">${label} ▾</button>${RP.pop === kind ? `<div class="fpop" data-pop>${body}
      <div class="tp-acts" style="margin-top:8px"><button class="tp-btn xs" data-rpclear="${kind}">پاک کردن</button><button class="tp-btn xs primary" data-rpclose>بستن</button></div></div>` : ""}</span>`;
    const yBody = `<div class="fpop-list">${meta.years.map((y) => `<label><input type="checkbox" data-ry="${y}" ${s.years.includes(y) ? "checked" : ""}> ${M(y)}</label>`).join("") || `<span class="dim">درخواستی در سامانه نیست.</span>`}</div>`;
    const qBody = `<div class="fpop-list">${RP_SEASONS.map((n, i) => `<label><input type="checkbox" data-rq="${i + 1}" ${s.seasons.includes(i + 1) ? "checked" : ""}> ${n} <span class="dim" style="font-size:.78rem">(${RP_MONTHS.slice(i * 3, i * 3 + 3).join("، ")})</span></label>`).join("")}</div>`;
    const mBody = `<div class="fpop-list rp-months">${RP_MONTHS.map((n, i) => `<label><input type="checkbox" data-rm="${i + 1}" ${s.months.includes(i + 1) ? "checked" : ""}> ${n}</label>`).join("")}</div>`;
    const yl = s.years.length ? s.years.slice().sort().map((y) => M(y)).join("، ") : "انتخاب کنید";
    const ql = s.seasons.length ? s.seasons.map((q) => RP_SEASONS[q - 1]).join("، ") : "همه";
    const ml = s.months.length ? (s.months.length > 3 ? `${M(s.months.length)} ماه` : s.months.map((m) => RP_MONTHS[m - 1]).join("، ")) : "همه";
    const R = s.result, sh = R && R.sheets[Math.min(s.idx, R.sheets.length - 1)];
    return `<div class="rp-form">
        <div class="rp-field"><b>برگه‌های گزارش</b><div class="rp-ticks">${meta.sheets.map((x) => `<label class="chip rp-tick ${s.sheets.includes(x.key) ? "on" : ""}"><input type="checkbox" data-rsh="${x.key}" ${s.sheets.includes(x.key) ? "checked" : ""}> ${esc(x.name)}</label>`).join("")}</div></div>
        <div class="rp-field"><b>بازهٔ زمانی</b><div class="rp-ticks">
          <span class="lab">سال</span>${pop("y", yl, s.years.length, yBody)}
          <span class="lab">فصل</span>${pop("q", ql, s.seasons.length, qBody)}
          <span class="lab">ماه</span>${pop("m", ml, s.months.length, mBody)}
          <span class="rp-period">دوره: <b>${esc(repPeriodLabel(s))}</b></span></div>
          <div class="dim" style="font-size:.8rem;margin-top:4px">فصل‌ها و ماه‌های انتخابی با هم جمع می‌شوند و در هر سالِ انتخابی شمرده می‌شوند؛ اگر نه فصلی تیک خورده نه ماهی، کل سال. ستون «پیش از دوره» از فروردین همان سال تا ماهِ پیش از دوره است.</div></div>
        <div class="rp-actions"><button class="tp-btn primary" data-rgen ${s.busy ? "disabled" : ""}>${s.busy ? "در حال ساخت…" : "نمایش گزارش"}</button>
          <button class="tp-btn" data-rgenx ${s.busy ? "disabled" : ""}>دانلود اکسل</button>
          <button class="tp-btn sm" data-rproj title="نام پروژه‌ها، شهر، مدیر پروژه و کلیدواژهٔ تطبیق با «طرف مقابل»">پروژه‌ها و مدیران پروژه</button></div></div>
      ${R ? `<style>${R.css}</style>
        <div class="rp-result-head">گزارش <b>${esc(R.label)}</b> · مقایسه با «${esc(R.priorLabel)}» · ${M(R.workDays)} روز کاری${R.picked && R.picked.n < R.picked.of ? ` · <span class="chip info" title="کارشناسانی که در پنجرهٔ پیش از ساخت تیک خوردند">${M(R.picked.n)} از ${M(R.picked.of)} کارشناس</span>` : ""}${R.hasExpertAmounts ? "" : ` · <span class="chip warn">مبلغ فاکتورِ هر گروه نیاز به ستون «کارشناس خرید» در فایل سوابق دارد</span>`}</div>
        <div class="rp-sheets bottom">${R.sheets.map((x, i) => `<button class="rp-sheet ${i === s.idx ? "on" : ""}" data-rtab="${i}">${esc(x.name)}</button>`).join("")}</div>
        ${(sh.notes || []).map((n) => `<div class="tp-note warn">${esc(n)}</div>`).join("")}
        <div class="rp-paper rp-scroll rp-book" data-keep-scroll>${sh.html}</div>
        ${sh.charts.length ? `<div class="rp-charts">${sh.charts.map((c) => `<div class="rp-chart">${c.svg}</div>`).join("")}</div>` : ""}`
      : s.busy ? `<div class="empty">در حال ساخت گزارش…</div>` : `<div class="empty"><b>برگه‌ها و بازه را انتخاب کنید و «نمایش گزارش» را بزنید.</b>همان برگه‌ها و نمودارهایی نمایش داده می‌شود که در فایل اکسل می‌رود.</div>`}`;
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
        <span class="dim">${e.requests ? `${M(e.requests)} درخواست · ${M(e.items)} قلم` : "در این دوره درخواستی نداشته"}${e.active ? "" : " · غیرفعال"}</span></label>`;
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
          ${rows.map((e) => { const x = st.get(e.id), tip = [e.name, e.active ? "" : "غیرفعال", was(e.id)].filter(Boolean).join(" · "); return `<tr>
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
        try { await TP.api("/settings", { method: "PUT", body: { reportProjects: rows, reportManagers: managers } }); RP.meta = null; RP.season.result = null; render(); }
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
    const rh = G("[data-rhidden]"); if (rh) rh.onchange = (e) => { RP.hidden = e.target.checked; render(); };
    const rr = G("[data-rstatus-reload]"); if (rr) rr.onclick = () => { RP.status = null; render(); };
    const rx = G("[data-rstatus-xlsx]"); if (rx) rx.onclick = () => repDownload("/reports/status.xlsx", null, "وضعیت درخواست ها.xlsx");
    Q("[data-sl]").forEach((b) => b.onclick = () => { const sel = RP.sl[+b.dataset.sl], k = b.dataset.k, i = sel.indexOf(k); if (!sel.length) sel.push(k); else if (i >= 0) sel.splice(i, 1); else sel.push(k); RP.limit = 300; render(); });
    Q("[data-slclear]").forEach((b) => b.onclick = () => { RP.sl[+b.dataset.slclear] = []; render(); });
    const sa = G("[data-slall]"); if (sa) sa.onclick = () => { SL.forEach(([c]) => { RP.sl[c] = []; }); render(); };
    const mo = G("[data-rmore]"); if (mo) mo.onclick = () => { RP.limit += 300; render(); };
    const dm = G("[data-dmore]"); if (dm) dm.onclick = () => { RP.dLimit += 300; render(); };
    Q("[data-dq]").forEach((i) => i.oninput = (e) => { RP.dq[+e.target.dataset.dq] = e.target.value; RP.dLimit = 300; TP.keepFocus(e.target, "dq", render); });
    /* گزارش سه ماهه */
    const s = RP.season, tog = (arr, v, on) => { const i = arr.indexOf(v); if (on && i < 0) arr.push(v); if (!on && i >= 0) arr.splice(i, 1); arr.sort((a, b) => a - b); };
    Q("[data-rpop]").forEach((b) => b.onclick = () => { RP.pop = RP.pop === b.dataset.rpop ? null : b.dataset.rpop; render(); });
    Q("[data-rpclose]").forEach((b) => b.onclick = () => { RP.pop = null; render(); });
    Q("[data-rpclear]").forEach((b) => b.onclick = () => { const k = b.dataset.rpclear; if (k === "y") s.years = []; if (k === "q") s.seasons = []; if (k === "m") s.months = []; render(); });
    Q("[data-ry]").forEach((c) => c.onchange = (e) => { tog(s.years, +e.target.dataset.ry, e.target.checked); render(); });
    Q("[data-rq]").forEach((c) => c.onchange = (e) => { tog(s.seasons, +e.target.dataset.rq, e.target.checked); render(); });
    Q("[data-rm]").forEach((c) => c.onchange = (e) => { tog(s.months, +e.target.dataset.rm, e.target.checked); render(); });
    Q("[data-rsh]").forEach((c) => c.onchange = (e) => { const k = e.target.dataset.rsh, i = s.sheets.indexOf(k); if (e.target.checked && i < 0) s.sheets.push(k); if (!e.target.checked && i >= 0) s.sheets.splice(i, 1); const order = RP.meta.sheets.map((x) => x.key); s.sheets.sort((a, b) => order.indexOf(a) - order.indexOf(b)); render(); });
    const gn = G("[data-rgen]"); if (gn) gn.onclick = () => genSeason(false);
    const gx = G("[data-rgenx]"); if (gx) gx.onclick = () => genSeason(true);
    const pj = G("[data-rproj]"); if (pj) pj.onclick = () => projectsDialog();
    Q("[data-rtab]").forEach((b) => b.onclick = () => { s.idx = +b.dataset.rtab; render(); });
  }

  /* ---------- رندر ---------- */
  function render() {
    const app = document.getElementById("app");
    if (!TP.manager.get()) { app.innerHTML = vLogin(); wire(); return; }
    const restore = TP.snapScroll();
    app.innerHTML = vTop() + (S.error ? `<div class="tp-note warn" style="margin:10px 18px">${esc(S.error)}</div>` : "") +
      (S.loading && !S.data.requests.length ? `<div class="empty">در حال بارگیری…</div>` :
        S.tab === "desk" ? vFilters() + `<div class="tp-wrap">${vDesk()}</div>` + vFoot()
        : `<div class="tp-wrap">${S.tab === "alerts" ? vAlerts() : S.tab === "experts" ? vExperts() : S.tab === "asg" ? vAssign() : S.tab === "dl" ? vDeadline() : S.tab === "norm" ? vNorm() : S.tab === "hist" ? vHist() : S.tab === "reports" ? vReports() : vLog()}</div>`);
    wire();
    TP.stickHeader(app.querySelector("table.tp-table"));
    restore();
  }

  /* ---------- اتصال رویدادها ---------- */
  function wire() {
    const a = document.getElementById("app"), Q = (s) => a.querySelectorAll(s), G = (s) => a.querySelector(s);
    const lg = G("[data-login]"); if (lg) { const go = async () => { const c = G("#mcode").value.trim(); if (!c) return; TP.manager.set(c); try { await TP.api("/login", { body: { role: "manager", code: c } }); S.error = ""; await refresh(); } catch (e) { TP.manager.clear(); S.error = e.message; render(); } }; lg.onclick = go; G("#mcode").onkeydown = (e) => { if (e.key === "Enter") go(); }; return; }
    Q("[data-tab]").forEach((b) => b.onclick = () => { S.tab = b.dataset.tab; if (S.tab === "log") loadEvents(); if (S.tab === "hist") loadHist(); render(); });
    const ih = G("[data-hist-import]"); if (ih) ih.onclick = pickHistory;
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
    /* تب کارشناسان */
    Q("[data-ename-edit]").forEach((x) => x.onclick = () => { S.editName = +x.dataset.enameEdit; render(); const i = G("[data-ename]"); if (i) { i.focus(); i.select(); } });
    Q("[data-ename]").forEach((i) => {
      const done = async () => { const id = +i.dataset.ename, e = S.data.experts.find((x) => x.id === id); const v = i.value.trim(); S.editName = null; if (!v || v === (e.label || e.name)) return render(); await expertPatch(id, { name: v, label: v }); };
      i.onkeydown = (e) => { if (e.key === "Enter") done(); if (e.key === "Escape") { S.editName = null; render(); } };
      i.onblur = done;
    });
    /* کد ورود: کلیک → کادر؛ Enter ذخیره، Esc انصراف. تکراری بودنش را سرور می‌گوید */
    Q("[data-ecode-edit]").forEach((x) => x.onclick = () => { S.editCode = +x.dataset.ecodeEdit; render(); const i = G("[data-ecode]"); if (i) { i.focus(); i.select(); } });
    Q("[data-ecode]").forEach((i) => {
      let busy = false;
      const done = async () => {
        if (busy) return; busy = true;
        const id = +i.dataset.ecode, e = S.data.experts.find((x) => x.id === id);
        const v = i.value.trim().replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
        S.editCode = null;
        if (!v || v === String(e.code)) return render();
        if (!/^\d{4,8}$/.test(v)) { render(); return TP.modal("کد نامعتبر", "کد ورود باید ۴ تا ۸ رقم باشد و فقط عدد.", null, "باشد", ""); }
        await expertPatch(id, { code: v });
      };
      i.onkeydown = (e) => { if (e.key === "Enter") done(); if (e.key === "Escape") { S.editCode = null; render(); } };
      i.onblur = done;
    });
    Q("[data-estar]").forEach((b) => b.onclick = () => { const e = S.data.experts.find((x) => x.id === +b.dataset.estar); expertPatch(e.id, { senior: !e.senior }); });
    Q("[data-edel]").forEach((b) => b.onclick = () => { const e = S.data.experts.find((x) => x.id === +b.dataset.edel);
      TP.modal("حذف کارشناس", `<b>${esc(e.label || e.name)}</b> از فهرست کارشناسان برداشته می‌شود و دیگر نمی‌تواند وارد پنل شود؛ ارجاع‌های فعلی‌اش می‌مانند تا شما به دیگری بدهید.`, () => expertPatch(e.id, { active: false }), "حذف"); });
    Q("[data-eteam]").forEach((b) => b.onclick = () => { const [eid, sid] = b.dataset.eteam.split("|").map(Number); const e = S.data.experts.find((x) => x.id === eid); expertPatch(eid, { senior_id: e.senior_id === sid ? null : sid }); });
    Q("[data-enotify]").forEach((s) => s.onchange = (e) => expertPatch(+e.target.dataset.enotify, { notify_to: e.target.checked ? "manager" : "senior" }));
    const ea = G("[data-eadd]"); if (ea) ea.onclick = addExpertDialog;
    Q("[data-mstage]").forEach((c) => c.onchange = () => autoSave("mstages", () => saveQuiet({ mgrStages: [...Q("[data-mstage]")].map((x) => x.checked) })));
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
        else await TP.api("/assign", { body: { request_id: rid, expert_id: eid } });
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
    /* اعلانات — ذخیرهٔ خودکار بعد از مکث؛ درصدهای نامعتبر فرستاده نمی‌شوند */
    const alertsPatch = () => {
      const thr = [...Q("[data-thr]")];
      if (!thr.length || !G("#ddays")) return null;   /* تب عوض شده؛ چیزی برای خواندن نیست */
      return { thresholds: thr.map((x) => x.value === "" ? "" : +x.value), dispatchDays: +G("#ddays").value || 0,
        minSuppliers: Math.max(1, +G("#minsup").value || 1), capacity: Math.max(1, +G("#capacity").value || 8) };
    };
    const saveAlerts = () => autoSave("alerts", async () => { const p = alertsPatch(); if (p) await saveQuiet(p); });
    Q("[data-thr]").forEach((i) => i.oninput = (e) => { e.target.value = e.target.value.replace(/[^0-9]/g, ""); const vals = [...Q("[data-thr]")].map((x) => x.value === "" ? "" : +x.value); const act = vals.filter((v) => v !== ""); const ok = act.every((v, k) => k === 0 || v > act[k - 1]) && act.every((v) => v >= 1 && v <= 100); G("#thrErr").textContent = ok ? "" : "درصدها باید صعودی و بین ۱ تا ۱۰۰ باشند."; if (ok) saveAlerts(); });
    ["#ddays", "#minsup", "#capacity"].forEach((id) => { const el = G(id); if (el) el.oninput = (e) => { e.target.value = e.target.value.replace(/[^0-9]/g, ""); saveAlerts(); }; });
    /* ارجاع/مهلت هوشمند — هر تغییر همان‌جا روی سرور می‌نشیند */
    const saveCoef = () => autoSave("coef", () => saveQuiet({ assign: settings().assign, deadline: settings().deadline }));
    Q("[data-asg]").forEach((i) => i.oninput = (e) => { settings().assign[e.target.dataset.asg] = e.target.value.replace(/[^0-9]/g, ""); saveCoef(); TP.keepFocus(e.target, "asg", render); });
    Q("[data-asg-op]").forEach((s) => s.onchange = (e) => { settings().assign[e.target.dataset.asgOp] = e.target.value; saveCoef(); render(); });
    Q("[data-dl]").forEach((i) => i.oninput = (e) => { settings().deadline[e.target.dataset.dl] = e.target.value.replace(/[^0-9.]/g, ""); saveCoef(); TP.keepFocus(e.target, "dl", render); });
    Q("[data-dl-op]").forEach((s) => s.onchange = (e) => { settings().deadline[e.target.dataset.dlOp] = e.target.value; saveCoef(); render(); });
    /* ماتریس‌ها — فقط همان خانهٔ تغییرکرده فرستاده می‌شود؛ سرور upsert می‌کند */
    const setScore = (eid, kind, key, v) => { const x = S.scores.scores.find((s) => s.expert_id === eid && s.kind === kind && s.key === key); const score = Math.max(0, Math.min(5, +String(v).replace(/[^0-9]/g, "") || 0)); if (x) x.score = score; else S.scores.scores.push({ expert_id: eid, kind, key, score }); return score; };
    const setW = (kind, key, v) => { const x = S.scores.weights.find((s) => s.kind === kind && s.key === key); const w = +v || 1; if (x) x.w = w; else S.scores.weights.push({ kind, key, w }); return w; };
    Q("[data-g]").forEach((i) => i.oninput = (e) => { const [eid, c] = e.target.dataset.g.split("|"); const score = setScore(+eid, "category", c, e.target.value);
      autoSave(`g:${e.target.dataset.g}`, () => TP.api("/scores", { method: "PUT", body: { scores: [{ expert_id: +eid, kind: "category", key: c, score }] } })); TP.keepFocus(e.target, "g", render); });
    Q("[data-p]").forEach((i) => i.oninput = (e) => { const [eid, p] = e.target.dataset.p.split("|"); const score = setScore(+eid, "party", p, e.target.value);
      autoSave(`p:${e.target.dataset.p}`, () => TP.api("/scores", { method: "PUT", body: { scores: [{ expert_id: +eid, kind: "party", key: p, score }] } })); TP.keepFocus(e.target, "p", render); });
    Q("[data-sp]").forEach((i) => i.onchange = async (e) => { const ex = S.data.experts.find((x) => x.id === +e.target.dataset.sp); ex.speed = +e.target.value || 1; await TP.api(`/experts/${ex.id}`, { method: "PUT", body: { speed: ex.speed } }); savedFlash(); render(); });
    Q("[data-cw]").forEach((i) => i.oninput = (e) => { const w = setW("category", e.target.dataset.cw, e.target.value);
      autoSave(`cw:${e.target.dataset.cw}`, () => TP.api("/scores", { method: "PUT", body: { weights: [{ kind: "category", key: e.target.dataset.cw, w }] } })); TP.keepFocus(e.target, "cw", render); });
    Q("[data-pw]").forEach((i) => i.oninput = (e) => { const w = setW("party", e.target.dataset.pw, e.target.value);
      autoSave(`pw:${e.target.dataset.pw}`, () => TP.api("/scores", { method: "PUT", body: { weights: [{ kind: "party", key: e.target.dataset.pw, w }] } })); TP.keepFocus(e.target, "pw", render); });
    const aa = G("[data-apply-asg]"); if (aa) aa.onclick = applyAssignAll;
    const ad = G("[data-apply-dl]"); if (ad) ad.onclick = applyDeadlineAll;
    Q("[data-dec]").forEach((b) => b.onclick = async () => {
      const [what, id] = b.dataset.dec.split("|");
      if (what === "reject") {
        /* دلیلِ رد برای کارشناس در تلگرام فرستاده می‌شود — همان‌طور که از دکمهٔ تلگرامِ مدیر */
        const d = TP.modal("رد تصمیم کارشناس", `<div class="tp-field"><b>چرا رد می‌کنید؟</b><textarea class="tp-input" id="dec-note" rows="3" style="width:100%;margin-top:6px" placeholder="همین متن برای کارشناس می‌رود"></textarea></div>`,
          async () => { await TP.api(`/decisions/${id}/reject`, { body: { note: (d.querySelector("#dec-note") || {}).value || "" } }); await refresh(); }, "رد و اطلاع به کارشناس");
        return;
      }
      await TP.api(`/decisions/${id}/approve`, { body: {} }); await refresh();
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
      el.textContent = "ذخیره شد ✓"; el.style.color = "#6ee7b7";
      clearTimeout(el._t); el._t = setTimeout(() => { el.textContent = "ذخیرهٔ خودکار روشن است"; el.style.color = ""; }, 1800);
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
  const AUTOSAVED = `<span class="dim" data-autosaved style="font-size:.85rem">ذخیرهٔ خودکار روشن است</span>`;
  async function loadEvents() { try { S.events = (await TP.api("/events")).events || []; render(); } catch (e) { S.error = e.message; render(); } }

  /* ---------- اقدام‌های گروهی ---------- */
  async function applyAssignAll() {
    const pend = S.data.requests.filter((r) => unassignedOpen(r).length);
    if (!pend.length) return TP.modal("ارجاع هوشمند", "درخواستِ بی‌کارشناسی نیست.", null, "باشد", "");
    const b = TP.busy("اعمال ارجاع هوشمند…", `${pend.length} درخواست`); let n = 0;
    try {
      await loadWorkload();
      const P = planAssign(pend);
      for (const p of P.plan) {
        await TP.api("/assign", { body: { request_id: p.r.id, expert_id: p.e.id, item_ids: unassignedOpen(p.r).map((i) => i.id), source: "smart" } });
        n++; b.set(`${n} از ${P.plan.length}`);
      }
    } catch (e) { b.close(); WL = null; await refresh(); return TP.modal("ارجاع هوشمند نیمه‌کاره ماند", `${n} درخواست ارجاع شد؛ بعد خطا: ${esc(e.message)}`, null, "باشد", ""); }
    b.close(); await refresh(); S.tab = "desk"; render();
    TP.modal("ارجاع هوشمند اعمال شد", `برای ${n} درخواست کارشناس پیشنهادی گذاشته شد — توزیع با فرض تأیید همه متوازن شده است. هرکدام را می‌توانید دستی عوض کنید.`, null, "باشد", "");
  }
  /* فقط ارجاع‌های ارسال‌نشده‌ای که هنوز مهلت ندارند (تصمیم مدیر): مهلتی که خودِ مدیر گذاشته نمی‌پرد
     و در اشغالِ کارشناس (بار همهٔ ارجاع‌های باز) از قبل حساب شده است */
  async function applyDeadlineAll() {
    const list = S.data.requests.flatMap((r) => r.assignments.filter((a) => !a.dispatched_at && !(Number(a.days) > 0)).map((a) => ({ r, a })));
    if (!list.length) return TP.modal("مهلت هوشمند", "ارجاع ارسال‌نشده‌ای بدون مهلت نیست؛ مهلت‌هایی که خودتان گذاشته‌اید دست نمی‌خورند.", null, "باشد", "");
    const b = TP.busy("اعمال مهلت هوشمند…", `${list.length} ارجاع`); let n = 0;
    try {
      await loadWorkload();
      for (const x of planDeadlines(list)) { await TP.api("/assign/days", { body: { assignment_id: x.a.id, days: x.days, source: "smart" } }); n++; b.set(`${n} از ${list.length}`); }
    } catch (e) { b.close(); await refresh(); return TP.modal("مهلت هوشمند نیمه‌کاره ماند", `${n} ارجاع مهلت گرفت؛ بعد خطا: ${esc(e.message)}`, null, "باشد", ""); }
    b.close(); await refresh(); S.tab = "desk"; render();
    TP.modal("مهلت هوشمند اعمال شد", `برای ${n} ارجاعِ بی‌مهلت مهلت گذاشته شد — با حساب تعداد اقلام، سختی گروه‌ها، پروژه و اشغال هر کارشناس پس از تأیید همهٔ ارجاع‌ها. مهلت‌هایی که خودتان گذاشته بودید دست نخورد.`, null, "باشد", "");
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
    const E = expertsSorted().filter((e) => e.id !== a.expert_id);
    const d = TP.modal(`تغییر کارشناس — درخواست ${esc(r.id)}`, `کارشناس فعلی: <b>${esc(a.expert_label || a.expert_name)}</b><br><br>
      <select class="tp-select" id="mv-exp" style="width:100%"><option value="">— کارشناس جدید —</option>${E.map((e) => `<option value="${e.id}">${e.senior ? "★ " : ""}${esc(e.label || e.name)}</option>`).join("")}</select>
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
        busy.close();
        S.filter = { experts: [], expertText: "", statuses: null, state: "", window: "3d" }; S.q = { id: "", date: "", party: "", item: "" }; S.page.offset = 0; S.tab = "desk";
        await refresh();
        const unknown = Object.entries(st.unknownStatuses || {});
        const summary = `<b>${M(st.requests)}</b> درخواست · <b>${M(st.itemRows)}</b> سطر قلم · <b>${st.parties}</b> طرف مقابل · بازه ${esc(st.dateMin)} تا ${esc(st.dateMax)}<br>${st.closedItemsSkipped ? `<span class="dim"><b>${M(st.closedItemsSkipped)}</b> قلم «بسته شده» وارد نمی‌شود${st.partlyClosed ? ` (${M(st.partlyClosed)} درخواست فقط بخشی از اقلامش بسته است)` : ""} — <b>${M(st.liveItemRows)}</b> قلم وارد پنل می‌شود.</span><br>` : ""}
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
        TP.modal("پاک شد", `${M(r.requests)} درخواست حذف شد${r.files ? ` و ${M(r.files)} فایل از انبار پاک شد` : ""}.`, null, "باشد", "");
      } catch (e) { TP.modal("حذف نشد", esc(e.message), null, "باشد", ""); }
    }, all ? "پاک کن" : "حذف کن");
    return d;
  }

  /* ---------- شروع ---------- */
  if (TP.manager.get()) refresh(); else render();
  window.addEventListener("tp-theme", render);
  /* هیچ به‌روزرسانی خودکاری نداریم (تصمیم مدیر، شهریور ۱۴۰۵): صفحه فقط با کار خود کاربر
     یا دکمهٔ ↻ تازه می‌شود، تا وسط کار جابه‌جا نشود. همین‌طور ساعت رنگ باکس‌ها هم با
     هر بازخوانی به‌روز می‌شود، نه با تایمر. */
})();
