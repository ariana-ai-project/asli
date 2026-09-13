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
    S.loading = true; S.error = ""; WL = null; WL_ERR = null; render();
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
    const TABS = [["desk", "میز ارجاع"], ["alerts", "تنظیم اعلانات"], ["asg", "ارجاع هوشمند"], ["dl", "مهلت هوشمند"], ["norm", "اقلام و کدها"], ["hist", "سوابق تأمین"], ["log", "تصمیم‌ها و رویدادها"]];
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
    if (!S.data.requests.length) return `<div class="empty"><b>هنوز فایلی بارگذاری نشده است.</b>با دکمه «بارگذاری درخواست‌های روزانه» فایل خروجی راهکاران (.xlsx) را انتخاب کنید — یا فایل را همین‌جا روی صفحه رها کنید.</div>`;
    const rows = visible();
    /* نتیجهٔ خالیِ فیلتر هم سرآیند و ردیف فیلترها را نگه می‌دارد؛ وگرنه کادرهای جستجو
       ناپدید می‌شدند و راهی جز «پاک کردن فیلترها» برای برگشتن نمی‌ماند. */
    const noRows = rows.length ? "" : `<tr><td colspan="18"><div class="empty">با این فیلترها درخواستی در این بازه نیست.${S.q.id.trim().length >= 4
      ? `<br><br><button class="tp-btn" data-lookup="${esc(S.q.id.trim())}">جستجوی شماره «${esc(S.q.id.trim())}» در کل سامانه (خارج از بازه)</button>` : ""}</div></td></tr>`;
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
          h += `<td class="stick"${rs}><button class="tp-btn xs" data-toggle="${esc(r.id)}" title="اقلام">${S.open[r.id] ? "▾" : "◂"} ${r.items.length}</button>
              <button class="tp-btn xs danger" data-del="${esc(r.id)}" title="حذف این درخواست از سامانه">✕</button></td>
            <td class="id num"${rs}>${esc(r.id)}</td><td class="num"${rs}>${esc(r.date)}</td>
            <td class="party"${rs}>${esc(r.party)}${r.center ? `<div class="dim" style="font-size:.75rem">${esc(r.center)}</div>` : ""}</td>
            <td class="item"${rs}><div style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.items.map((i) => i.title).join(" · "))}">${esc(r.items[0] ? r.items[0].title : "")}</div>${r.items.length > 1 ? `<div class="dim" style="font-size:.75rem">و ${r.items.length - 1} قلم دیگر</div>` : ""}</td>
            <td${rs}>${srcChips}</td>`;
        }
        if (u.a) {
          const a = u.a, lock = a.dispatched_at ? "disabled" : "", its = itemsOf(r, a);
          h += `<td class="sep expcell"><select class="tp-select" data-assign="${esc(r.id)}" data-aid="${a.id}" ${lock}>${E.map((e) => `<option value="${e.id}" ${e.id === a.expert_id ? "selected" : ""}>${esc(e.label || e.name)}</option>`).join("")}</select>${fileExpert(its, a.expert_name)}</td>
            <td><input class="tp-input num ${a.days ? "" : "unset"}" style="width:64px;text-align:center" data-days="${a.id}" value="${esc(a.days || "")}" inputmode="numeric" ${lock}></td>
            <td class="num">${its.length}</td>
            <td class="console sep"><div class="box b-${TP.dispatchColor(r.imported_at || S.now, settings().dispatchDays, a.dispatched_at, S.now)}" title="${a.dispatched_at ? "ارسال شد " + TP.fmt(a.dispatched_at) : "ارسال‌نشده"}"></div></td>
            ${stageBoxes(r, a)}
            <td class="sep" style="white-space:nowrap"><span class="st ${STL.cls}">${isActive(r, a) ? "در جریان" : STL.label}</span>${itemStates(its)}<br>
              <button class="tp-btn xs warn" data-act="hold|${a.id}">تعلیق</button><button class="tp-btn xs danger" data-act="stop|${a.id}">توقف</button><button class="tp-btn xs" data-act="closed|${a.id}">خاتمه</button>
              ${its.some((i) => i.state === "hold") ? `<button class="tp-btn xs" data-act="open|${a.id}">بازگشت</button>` : ""}</td>
            <td><button class="tp-btn xs" data-open="${a.id}">مشاهده</button> <button class="tp-btn xs" data-move="${a.id}" ${a.dispatched_at ? "" : "disabled"}>تغییر</button></td>`;
        } else if (u.un) {
          h += `<td class="sep expcell"><select class="tp-select unset" data-assign="${esc(r.id)}"><option value="">— انتخاب کارشناس —</option>${E.map((e) => `<option value="${e.id}">${esc(e.label || e.name)}</option>`).join("")}</select>${fileExpert(u.un.some((i) => i.src_expert) ? u.un : r.items, null)}</td>
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
    return h + noRows + `</tbody></table></div>`;
  }

  /* ---------- سوابق خرید ---------- */
  /* ym = سال×۱۲ + ماه — همان چیزی که سرور برای فاصلهٔ ماهانه نگه می‌دارد */
  const ymFa = (v) => { if (!v) return "—"; const y = Math.floor((v - 1) / 12); return `${TP.JM[v - y * 12 - 1]} ${y}`; };
  function vHist() {
    const h = S.hist, c = h && h.current;
    const k = (lab, val) => `<div class="k"><b>${lab}</b><span style="font-size:.95rem">${val}</span></div>`;
    return `<div class="tp-card tp-pane" style="max-width:1000px"><h2>سوابق تأمین</h2>
      <p class="lead">فایل مرجع خریدهای گذشتهٔ شرکت. کارشناس در تب «بررسی سوابق» هر قلم، تأمین‌کنندگان همان قلم، سهم و رتبه‌شان را از همین فایل می‌بیند — بدون مدل زبانی و با کوئری ثابت.</p>
      ${!h ? `<div class="empty">در حال بارگیری وضعیت…</div>`
        : c ? `<div class="kpi">${k("فایل", esc(c.filename || "—"))}${k("بارگذاری", TP.fmt(c.finished_at || c.imported_at))}
            ${k("ردیف", M(c.rows))}${k("تأمین‌کننده", M(c.suppliers))}${k("کد قلم", M(c.codes))}
            ${k("بازه", `${ymFa(c.minYm)} تا ${ymFa(c.maxYm)}`)}${k("مبنای ارزش", h.base.label)}</div>
          ${c.noIndex ? `<div class="tp-note warn">${M(c.noIndex)} ردیف «شاخص تعدیل» ندارند و مبلغ ۱۴۰۴ برایشان ساخته نشد؛ در جمع‌ها صفر حساب می‌شوند.</div>` : ""}`
        : `<div class="empty"><b>هنوز فایل سوابقی بارگذاری نشده است.</b>تا آن زمان تب «بررسی سوابق» کارشناس پیام «بارگذاری نشده» می‌دهد.</div>`}
      ${h && h.loading ? `<div class="tp-note warn">یک بارگذاری نیمه‌کاره از ${TP.fmt(h.loading.imported_at)} هست («${esc(h.loading.filename || "")}»). تا پایان نگرفتنش، سوابق قبلی در دسترس نیست — فایل را دوباره بارگذاری کنید.</div>` : ""}
      <div class="tp-row"><button class="tp-btn primary" data-hist-import>بارگذاری فایل سوابق (.xlsx)</button>
        <span class="dim" style="font-size:.85rem">یا فایل را وقتی روی همین تب هستید روی صفحه رها کنید.</span></div>
      <div class="tp-note">ستون‌های لازم: <b>تاریخ سفارش</b> · <b>عنوان قلم خریدنی</b> · <b>تامین کننده</b> · <b>مبلغ به ارز عملیاتی</b> · <b>شاخص تعدیل</b> · <b>کد قلم جدید</b>.
        ستون‌های «قیمت کل (۱۴۰۴)» و «قیمت واحد (۱۴۰۴)» در فایل فرمول‌اند؛ اگر مقدارِ ذخیره‌شده نداشته باشند، از روی مبلغ × شاخص تعدیل ساخته می‌شوند.
        بارگذاری تازه <b>جای فایل قبلی را می‌گیرد</b>.</div>
      <div class="tp-sect"><h3>نرمال‌سازی اقلام <span>مرحلهٔ بعد</span></h3>
        <p class="lead">هم‌اکنون هر قلم با «کد قلم خریدنی» راهکاران و اگر نبود با عنوانش به سوابق وصل می‌شود، و اگر ردیف‌های پیداشده «کد قلم جدید» داشته باشند، همهٔ نگارش‌های آن کد با هم دیده می‌شوند.
          نرمال‌سازی، همین کار را برای قلم‌هایی می‌کند که تفاوت نگارشی (مثلاً «نمره» و «عدد») از سابقه‌شان جدایشان کرده است: مدل عنوان قلم را با فهرست سوابق و لایه‌های طبقه‌بندی می‌سنجد و کد استاندارد را روی قلم می‌نویسد.</p>
        <button class="tp-btn" data-normalize>نرمال‌سازی اقلام</button>
        <span class="chip mock">در انتظار اتصال به مدل</span></div></div>`;
  }


  /* ---------- بارگذاری سوابق خرید ----------
     همان الگوی درخواست‌های روزانه: خواندن در مرورگر، ارسال دسته‌ای، پایان.
     تفاوتش این است که begin جدول سوابق را از نو می‌سازد — پس اگر بارگذاری وسط
     راه بماند فایل قبلی رفته است و باید دوباره فرستاده شود. برای همین قبلش
     صریح می‌پرسیم. */
  async function loadHist() { try { S.hist = await TP.api("/history/status"); } catch (e) { S.hist = { ready: false, error: e.message }; } render(); }

  function pickHistory() {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".xlsx";
    inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) askHistoryImport(f); };
    inp.click();
  }
  /* فایل پیش از هر پرسشی خوانده می‌شود تا اثر انگشتش را داشته باشیم: اگر همان
     فایلِ بارگذاری‌شده باشد، اصلاً نباید چیزی از مدیر پرسیده شود. */
  async function askHistoryImport(f) {
    const busy = TP.busy("در حال خواندن فایل سوابق…", `${esc(f.name)} — ${(f.size / 1048576).toFixed(1)} مگابایت`);
    let parsed;
    try { parsed = await TP.importHistory(f, (t) => busy.set(esc(t))); }
    catch (e) { busy.close(); TP.modal("فایل خوانده نشد", esc(e.message).replace(/\n/g, "<br>"), null, "باشد", ""); return; }
    busy.close();
    const st = parsed.stats;
    if (!st.rows) return TP.modal("فایل خالی بود", "هیچ ردیف معتبری نداشت؛ هر ردیف باید تاریخ، عنوان قلم و تأمین‌کننده داشته باشد.", null, "باشد", "");

    const c = S.hist && S.hist.current;
    if (c && c.fingerprint && c.fingerprint === st.fingerprint) {
      return TP.modal("همین فایل از قبل بارگذاری شده", `<b>${esc(f.name)}</b> دقیقاً همان سوابقی است که الان در سامانه است
        (${M(c.rows)} ردیف). چیزی نوشته نشد و سهمیهٔ دیتابیس هم مصرف نشد.`, null, "باشد", "");
    }
    TP.modal("بارگذاری سوابق خرید", `<b>${esc(f.name)}</b> — ${M(st.rows)} ردیف معتبر${st.dups ? ` (${M(st.dups)} ردیفِ کاملاً یکسان که جداگانه شمرده می‌شوند)` : ""}
      ${c ? `<br><br>سوابق فعلی: ${M(c.rows)} ردیف از «${esc(c.filename || "—")}». ردیف‌های مشترک دوباره نوشته نمی‌شوند.`
          : "<br><br>اولین بارگذاری سوابق است."}
      <br><br>ارسال چند دقیقه طول می‌کشد و در این مدت پنجره را نبندید.`,
      () => importHistoryFile(f, parsed), "بارگذاری کن");
  }
  async function importHistoryFile(f, parsed) {
    const st = parsed.stats;
    const busy = TP.busy("بارگذاری سوابق…", `${esc(f.name)} — ${M(st.rows)} ردیف`);
    try {
      const beg = await TP.api("/history/begin", { body: { filename: f.name, rows: st.rows, stats: st, fingerprint: st.fingerprint } });
      if (beg.skipped) {
        busy.close(); await loadHist();
        return TP.modal("چیزی برای نوشتن نبود", "این فایل دقیقاً همان سوابقِ موجود است.", null, "باشد", "");
      }
      const chunks = TP.chunkHistory(parsed.rows);
      let sent = 0, ins = 0, dup = 0;
      for (let i = 0; i < chunks.length; i++) {
        const r = await TP.api("/history/chunk", { body: { import_id: beg.import_id, rows: chunks[i] } });
        sent += chunks[i].length; ins += r.inserted || 0; dup += r.dup || 0;
        busy.set(`ارسال ${M(sent)} از ${M(st.rows)} ردیف — ${M(ins)} تازه، ${M(dup)} تکراری`);
      }
      busy.set("ساخت نمایه‌ها و آمار مرجع…");
      const fin = await TP.api("/history/finish", { body: { import_id: beg.import_id, fingerprint: st.fingerprint } });
      busy.close();
      await loadHist();
      TP.modal("سوابق خرید بارگذاری شد", `<b>${M(ins)}</b> ردیف تازه نوشته شد${dup ? ` و <b>${M(dup)}</b> ردیف چون از قبل بود دوباره نوشته نشد` : ""}.
        <br>اکنون <b>${M(fin.stats.rows)}</b> ردیف · <b>${M(fin.stats.suppliers)}</b> تأمین‌کننده · <b>${M(fin.stats.codes)}</b> کد قلم · بازه ${ymFa(fin.stats.minYm)} تا ${ymFa(fin.stats.maxYm)}
        ${beg.mode === "replace" ? `<br><span class="dim">این بار جدول از نو ساخته شد چون ردیف‌های قدیمی کلید یکتا نداشتند؛ از این پس فقط ردیف‌های تازه نوشته می‌شوند.</span>` : ""}
        ${st.skipped ? `<br><span style="color:#fcd34d">${M(st.skipped)} سطر ناقص رد شد.</span>` : ""}
        ${fin.stats.noIndex ? `<br><span style="color:#fcd34d">${M(fin.stats.noIndex)} ردیف شاخص تعدیل نداشتند.</span>` : ""}
        ${st.noCode ? `<br><span style="color:#fcd34d">${M(st.noCode)} ردیف «کد قلم جدید» ندارند؛ تطبیق با کد راهکاران یا عنوان انجام می‌شود.</span>` : ""}`, null, "باشد", "");
    } catch (e) { busy.close(); TP.modal("خطا در بارگذاری سوابق", esc(e.message).replace(/\n/g, "<br>"), null, "باشد", ""); }
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
        ${AUTOSAVED}</div>
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
        <button class="tp-btn primary" data-apply-asg ${pend.length && P ? "" : "disabled"}>اعمال پیشنهاد روی همه درخواست‌های بی‌کارشناس (${pend.length})</button>
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
    const list = S.data.requests.flatMap((r) => r.assignments.filter((a) => !a.dispatched_at).map((a) => ({ r, a })));
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
        <button class="tp-btn primary" data-apply-dl ${list.length && WL ? "" : "disabled"}>اعمال روی همه ارجاع‌های ارسال‌نشده (${list.length})</button>
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

  /* ---------- رندر ---------- */
  function render() {
    const app = document.getElementById("app");
    if (!TP.manager.get()) { app.innerHTML = vLogin(); wire(); return; }
    const restore = TP.snapScroll();
    app.innerHTML = vTop() + (S.error ? `<div class="tp-note warn" style="margin:10px 18px">${esc(S.error)}</div>` : "") +
      (S.loading && !S.data.requests.length ? `<div class="empty">در حال بارگیری…</div>` :
        S.tab === "desk" ? vFilters() + `<div class="tp-wrap">${vDesk()}</div>` + vFoot()
        : `<div class="tp-wrap">${S.tab === "alerts" ? vAlerts() : S.tab === "asg" ? vAssign() : S.tab === "dl" ? vDeadline() : S.tab === "norm" ? vNorm() : S.tab === "hist" ? vHist() : vLog()}</div>`);
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
    const nz = G("[data-normalize]"); if (nz) nz.onclick = async () => {
      const r = await TP.api("/items/normalize", { body: {} }).catch((e) => ({ message: e.message }));
      TP.modal("نرمال‌سازی اقلام", `${esc(r.message || "")}<br><br>تا آن زمان، تطبیق با «کد قلم خریدنی» راهکاران و عنوان انجام می‌شود و برای بیشتر اقلام کار می‌کند.`, null, "باشد", "");
    };
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
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (!f) return;
      if (!/\.xlsx$/i.test(f.name)) { TP.modal("فایل نامناسب", `فقط فایل اکسل (.xlsx) پذیرفته می‌شود؛ «${esc(f.name)}» نیست.`, null, "باشد", ""); return; }
      /* روی تب سوابق، فایلِ رهاشده همان فایل سوابق است نه درخواست‌های روزانه */
      if (S.tab === "hist") askHistoryImport(f); else importFile(f);
    };
    Q("[data-f]").forEach((s) => s.onchange = (e) => { S.filter[e.target.dataset.f] = e.target.value; if (e.target.dataset.f === "window") { S.page.offset = 0; refresh(); } else render(); });
    const wa = G("[data-win-all]"); if (wa) wa.onclick = () => { S.filter.window = "all"; S.page.offset = 0; refresh(); };
    Q("[data-del]").forEach((b) => b.onclick = () => askDelete([b.dataset.del]));
    const pg = G("[data-purge]"); if (pg) pg.onclick = () => askDelete(null);
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
        await TP.api("/assign", { body: { request_id: p.r.id, expert_id: p.e.id, item_ids: unassignedOpen(p.r).map((i) => i.id) } });
        n++; b.set(`${n} از ${P.plan.length}`);
      }
    } catch (e) { b.close(); WL = null; await refresh(); return TP.modal("ارجاع هوشمند نیمه‌کاره ماند", `${n} درخواست ارجاع شد؛ بعد خطا: ${esc(e.message)}`, null, "باشد", ""); }
    b.close(); await refresh(); S.tab = "desk"; render();
    TP.modal("ارجاع هوشمند اعمال شد", `برای ${n} درخواست کارشناس پیشنهادی گذاشته شد — توزیع با فرض تأیید همه متوازن شده است. هرکدام را می‌توانید دستی عوض کنید.`, null, "باشد", "");
  }
  async function applyDeadlineAll() {
    const list = S.data.requests.flatMap((r) => r.assignments.filter((a) => !a.dispatched_at).map((a) => ({ r, a })));
    if (!list.length) return TP.modal("مهلت هوشمند", "ارجاع ارسال‌نشده‌ای نیست.", null, "باشد", "");
    const b = TP.busy("اعمال مهلت هوشمند…", `${list.length} ارجاع`); let n = 0;
    try {
      await loadWorkload();
      for (const x of planDeadlines(list)) { await TP.api("/assign/days", { body: { assignment_id: x.a.id, days: x.days } }); n++; b.set(`${n} از ${list.length}`); }
    } catch (e) { b.close(); await refresh(); return TP.modal("مهلت هوشمند نیمه‌کاره ماند", `${n} ارجاع مهلت گرفت؛ بعد خطا: ${esc(e.message)}`, null, "باشد", ""); }
    b.close(); await refresh(); S.tab = "desk"; render();
    TP.modal("مهلت هوشمند اعمال شد", `برای ${n} ارجاع ارسال‌نشده مهلت گذاشته شد — با حساب تعداد اقلام، سختی گروه‌ها، پروژه و اشغال هر کارشناس پس از تأیید همهٔ ارجاع‌ها.`, null, "باشد", "");
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
        S.filter = { expert: "", status: "", state: "", window: "3d" }; S.q = { id: "", date: "", party: "", item: "" }; S.page.offset = 0; S.tab = "desk";
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
  setInterval(() => { if (S.tab === "desk" && TP.manager.get()) { S.now = Date.now(); render(); } }, 60000);
})();
