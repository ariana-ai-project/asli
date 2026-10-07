/* ============================================================
   پنل «پشتیبانی» تدارکات (مهر ۱۴۰۵ — مرحله‌های ۱ تا ۳)

   نظارتِ فقط‌خواندنی بر کار کارشناسان — درخواست‌ها، کارشناسان، مکاتبات با تأمین‌کنندگان و گزارش کامل
   رخدادها با زمان دقیق — و تنها نوشتنِ کاری‌اش: تیکِ «تأیید کمیسیون» هر قلم، که از پنل و بات کارشناس
   برداشته شد. سرور: worker/support.js (مسیرهای /support/*).
   ورود با رمز مشترک پشتیبانی: اولین بازدیدکننده رمز را می‌گذارد و اگر فراموش شد، مدیر با کد مدیر رمز تازه
   می‌گذارد. نشانهٔ ورود (۱۲ ساعته) فقط در sessionStorage همین تب می‌ماند.
   فاز ۲: تیکِ «🤖 هوشمند / ✋ دستی» هر کارشناس و داشبوردِ کارشناس هوشمند. طرح «خرید هوشمند»: زیرنمای «💵 نرخ دلار» (worker/usd.js) و تبِ «🧩 تغییرات اقلام» (worker/structure.js). فاز ۳: قواعدِ «حداقلِ استعلام» و مهلتش (زیرِ تبِ
   کارشناس هوشمند، worker/ai-rules.js)، کارهای «واگذارشده» به کارشناس، و تبِ «📥 تحویل‌های هوشمند»: جدول کمیسیون، برگهٔ
   درخواست و نامهٔ هر کارِ تمام‌شده، با تأیید یا ردِ کمیسیون.
   ============================================================ */
(function () {
  "use strict";
  const CFG = window.TAMIN_POSHTIBANI_CONFIG || {}, TP = window.TP;
  const esc = TP.esc, M = TP.M, DAY = TP.DAY;
  const app = document.getElementById("app");
  const p2 = (n) => String(n).padStart(2, "0");
  const jOf = (d) => TP.g2j(d.getFullYear(), d.getMonth() + 1, d.getDate());
  /** «سه‌شنبه 1405/07/13 — 10:42:07»: زمانِ دقیق تا ثانیه */
  const fmtS = (ms) => { if (!ms) return "—"; const d = new Date(ms), [y, m, dd] = jOf(d); return `${TP.WD[d.getDay()]} ${y}/${p2(m)}/${p2(dd)} — ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`; };
  const fmtShort = (ms) => { if (!ms) return "—"; const d = new Date(ms), [y, m, dd] = jOf(d); return `${y}/${p2(m)}/${p2(dd)} ${p2(d.getHours())}:${p2(d.getMinutes())}`; };
  const digits = (s) => (TP.digits ? TP.digits(s) : String(s || ""));

  /* ---------- نشست ---------- */
  const SS = "tp.support";
  const sess = {
    get() { try { const s = JSON.parse(sessionStorage.getItem(SS) || "null"); return s && s.token && s.exp > Date.now() ? s : null; } catch (_) { return null; } },
    set(s) { try { sessionStorage.setItem(SS, JSON.stringify({ token: s.token, exp: s.exp })); } catch (_) { /* حالت خصوصی — فقط تا بستن صفحه */ } },
    clear() { try { sessionStorage.removeItem(SS); } catch (_) { /* بی‌اهمیت */ } },
  };
  const BASE = () => (CFG.apiBase || "/tamin-poshtibani/api") + "/support";
  /** فراخوانی /support/* با نشانهٔ ورود؛ ۴۰۱ یعنی نشست تمام شده — برمی‌گردیم به صفحهٔ ورود */
  async function api(path, opt = {}) {
    const s = sess.get();
    const headers = { ...(opt.headers || {}) };
    if (s) headers["X-Support-Token"] = s.token;
    try { return await TP.api("/support" + path, { ...opt, headers }); }
    catch (e) {
      if (e.status === 401 && s) { sess.clear(); S.err = e.message; loadStatus(); }
      throw e;
    }
  }
  /** دانلود فایل — لینک مستقیم هدر نشانه را نمی‌فرستد، پس fetch و blob */
  async function download(path, name) {
    const s = sess.get();
    const res = await fetch(BASE() + path, { headers: s ? { "X-Support-Token": s.token } : {} });
    if (!res.ok) { let msg = `خطای سرور ${res.status}`; try { msg = (await res.json()).error || msg; } catch (_) { /* متن خام */ } throw new Error(msg); }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  /* ---------- وضعیت ---------- */
  const TABS = [["req", "درخواست‌ها"], ["exp", "کارشناسان"], ["chg", "🧩 تغییرات اقلام"], ["ai", "🤖 کارشناس هوشمند"], ["dl", "📥 تحویل‌های هوشمند"], ["chat", "مکاتبات"], ["log", "گزارش رخدادها"], ["cm", "تأیید کمیسیون"]];
  const tabOfHash = () => { const h = location.hash.slice(1); return TABS.some(([k]) => k === h) ? h : null; };
  const S = {
    view: "boot", status: null, mode: "login", err: "", busy: false,
    tab: tabOfHash() || "req", now: Date.now(),
    experts: [], settings: null,
    desk: null, deskErr: "", deskLoading: false, rf: { win: "7d", project: "", expert: "", status: "", q: "", id: "" },
    exId: null, ex: null, exErr: "",
    th: null, thErr: "", thLoading: false, thF: { expert: "", rid: "", q: "" }, thId: null, thData: null,
    log: null, logErr: "", logLoading: false, logF: { from: "", to: "", expert: "", rid: "", g: "" }, logMore: false, logNext: null,
    cm: null, cmErr: "", cmLoading: false, cmF: { scope: "ready", expert: "", q: "" }, cmSel: new Set(), cmMin: 1,
    /* کارشناس هوشمند (فاز ۲): فهرستِ کارشناسان با تیکِ هوشمند/دستی، و داشبوردِ یک کارشناس (expert-ai.js) */
    ai: null, aiErr: "", aiLoading: false, aiEx: null,
    /* فاز ۳: قواعدِ «حداقلِ استعلام» (زیرنمای تبِ کارشناس هوشمند) و تحویل‌های کارشناس هوشمند */
    aiView: "list", rules: null, rulesDraft: null, rulesErr: "", rulesBusy: false,
    dl: null, dlErr: "", dlLoading: false, dlF: { state: "new" }, dlId: null, dlD: null, dlDErr: "",
    /* طرح «خرید هوشمند، کارشناس ناظر»: نرخ دلار (زیرنمای تبِ کارشناس هوشمند، worker/usd.js) */
    usd: null, usdErr: "", usdLoading: false,
    /* فاز ۲: وزن‌های رتبهٔ نهایی و «قاعدهٔ دعوت» (worker/ranking.js) */
    rank: null, rankDraft: null, rankErr: "", rankBusy: false,
    /* فاز ۴: «🎛 کلیدها» — خوانش هوشمند پیش‌فاکتور (worker/switches.js، پیش‌فرض خاموش) */
    sw: null, swErr: "", swBusy: false,
    /* فاز ۴ب: «🧭 حالت اقلام» — حالتِ هر نوع قلم برای کارشناس هوشمند (worker/ai-modes.js) */
    md: null, mdDraft: null, mdErr: "", mdBusy: false, mdQ: "", mdHits: [],
    /* «🧩 تغییرات اقلام» (فاز ۱): یک پیام برای هر قلمِ نرمال‌شده — فرقِ ساختارِ تأییدشده با پیشنهادِ سامانه (worker/structure.js) */
    chg: null, chgErr: "", chgLoading: false, chgF: { expert: "", rid: "", changed: "1", frozen: "" }, chgMore: false, chgNext: null,
  };
  const thr = () => (S.settings && S.settings.thresholds) || (CFG.defaults && CFG.defaults.thresholds) || [10, 30, 50, 70, 90, 100];
  const exName = (id) => { const e = S.experts.find((x) => x.id === Number(id)); return e ? e.label || e.name : id ? `کارشناس ${id}` : "—"; };
  const expertOpts = (sel) => S.experts.map((e) => `<option value="${e.id}" ${String(e.id) === String(sel) ? "selected" : ""}>${e.senior ? "★ " : ""}${esc(e.label || e.name)}</option>`).join("");
  const ORIGIN = { history: "سوابق", smart: "جستجوی هوشمند", manual: "دستی", proforma: "پیش‌فاکتور", supplier: "پنل تأمین‌کننده" };

  /* ---------- ورود ---------- */
  async function loadStatus() {
    try { S.status = await TP.api("/support/status"); } catch (e) { S.err = S.err || e.message; S.status = S.status || { set: true }; }
    S.view = "login"; render();
  }
  function vLogin() {
    const st = S.status || {};
    const locked = st.locked_until && st.locked_until > Date.now();
    const pw = (id, ph, ac) => `<input id="${id}" class="tp-input" type="password" placeholder="${ph}" autocomplete="${ac}" dir="ltr">`;
    let h;
    if (S.mode === "reset") {
      h = `<h2>رمز تازهٔ پشتیبانی</h2><p>فقط مدیر: کد مدیر و رمز تازهٔ پشتیبانی را وارد کنید.</p>
        <input id="mgr" class="tp-input" type="password" inputmode="numeric" placeholder="کد مدیر" autocomplete="off" dir="ltr">
        ${pw("p1", "رمز تازه (دست‌کم ۶ نویسه)", "new-password")}${pw("p2", "تکرار رمز تازه", "new-password")}
        <button class="tp-btn primary" data-do="reset" style="width:100%;margin-top:14px" ${S.busy ? "disabled" : ""}>ثبت رمز تازه و ورود</button>`;
    } else if (!st.set) {
      h = `<h2>تعیین رمز پشتیبانی</h2><p>این پنل هنوز رمز ندارد. رمزی که این‌جا بگذارید، از این پس رمز ورود پشتیبانی است — آن را به همکاران پشتیبانی بدهید.</p>
        ${pw("p1", "رمز (دست‌کم ۶ نویسه)", "new-password")}${pw("p2", "تکرار رمز", "new-password")}
        <button class="tp-btn primary" data-do="setup" style="width:100%;margin-top:14px" ${S.busy ? "disabled" : ""}>ثبت رمز و ورود</button>`;
    } else {
      h = `<h2>ورود پشتیبانی</h2><p>رمز پشتیبانی را وارد کنید.</p>${pw("p1", "رمز", "current-password")}
        <button class="tp-btn primary" data-do="login" style="width:100%;margin-top:14px" ${S.busy || locked ? "disabled" : ""}>ورود</button>`;
    }
    const alt = S.mode === "reset" ? `<div class="alt"><button data-mode="login">بازگشت به ورود</button></div>`
      : st.set ? `<div class="alt"><button data-mode="reset">رمز را فراموش کرده‌اید؟ (مدیر با کد مدیر)</button></div>` : "";
    return `<div class="tp-card tp-login sup-login">${h}<div class="err">${esc(S.err)}${locked && !S.err ? `ورود تا ${fmtShort(st.locked_until)} بسته است.` : ""}</div>${alt}
      <a class="tp-back" href="index.html" style="margin-top:14px">← بازگشت به تدارکات</a></div>`;
  }
  async function doAuth(kind) {
    const v = (id) => { const el = document.getElementById(id); return el ? el.value : ""; };
    const p1 = v("p1"), p2v = v("p2");
    if (!p1) { S.err = "رمز را وارد کنید."; return render(); }
    if (kind !== "login" && p1 !== p2v) { S.err = "دو رمز یکی نیستند."; return render(); }
    S.err = ""; S.busy = true; render();
    try {
      let r;
      if (kind === "setup") r = await TP.api("/support/setup", { body: { pass: p1 } });
      else if (kind === "login") r = await TP.api("/support/login", { body: { pass: p1 } });
      else r = await TP.api("/support/reset", { body: { pass: p1 }, headers: { "X-Manager-Code": digits(v("mgr")).trim() } });
      sess.set(r); S.mode = "login"; S.busy = false;
      await enter();
    } catch (e) {
      S.busy = false; S.err = e.message;
      if (e.data && e.data.set === true) S.status = { ...(S.status || {}), set: true };
      if (e.data && e.data.locked_until) S.status = { ...(S.status || {}), locked_until: e.data.locked_until };
      render();
    }
  }
  async function enter() {
    S.view = "app"; render();
    try { await loadExperts(); } catch (_) { return; /* ۴۰۱ → صفحهٔ ورود */ }
    loadTab();
    if (S.tab !== "ai") aiPulse();
  }
  function changePass() {
    const d = TP.modal("تغییر رمز پشتیبانی", `<div style="display:flex;flex-direction:column;gap:8px">
        <input class="tp-input" type="password" data-pc="cur" placeholder="رمز فعلی" autocomplete="current-password" dir="ltr">
        <input class="tp-input" type="password" data-pc="p1" placeholder="رمز تازه (دست‌کم ۶ نویسه)" autocomplete="new-password" dir="ltr">
        <input class="tp-input" type="password" data-pc="p2" placeholder="تکرار رمز تازه" autocomplete="new-password" dir="ltr">
        <span class="dim" style="font-size:.85rem">با تغییر رمز، همهٔ نشست‌های باز (روی دستگاه‌های دیگر) بیرون می‌روند.</span></div>`, async () => {
      const g = (k) => d.querySelector(`[data-pc="${k}"]`).value;
      if (g("p1") !== g("p2")) return TP.modal("نشد", "دو رمز تازه یکی نیستند.", null, "باشد", "");
      try { sess.set(await api("/pass", { body: { current: g("cur"), pass: g("p1") } })); TP.modal("انجام شد", "رمز پشتیبانی عوض شد.", null, "باشد", ""); }
      catch (e) { TP.modal("نشد", esc(e.message), null, "باشد", ""); }
    }, "ثبت رمز تازه");
  }

  /* ---------- بارگذاری‌ها ---------- */
  async function loadExperts() { const r = await api("/experts"); S.experts = r.experts || []; render(); }
  function loadTab(force) {
    if (S.tab === "req" && (force || !S.desk)) loadDesk();
    else if (S.tab === "exp") { if (S.exId) loadExpert(S.exId); else if (force) loadExperts().catch(() => {}); }
    else if (S.tab === "chat" && (force || !S.th)) loadThreads();
    else if (S.tab === "log" && (force || !S.log)) loadLog();
    else if (S.tab === "cm" && (force || !S.cm)) loadCm();
    else if (S.tab === "chg" && (force || !S.chg)) loadChg();
    else if (S.tab === "ai") { if (force || !S.ai) loadAi(); if (force && S.aiEx && window.TP_AI) window.TP_AI.load(); if (S.aiView === "rules" && (force || !S.rules)) loadRules(); if (S.aiView === "usd" && (force || !S.usd)) loadUsd(); if (S.aiView === "rank" && (force || !S.rank)) loadRank(); if (S.aiView === "sw" && (force || !S.sw)) loadSw(); if (S.aiView === "md" && (force || !S.md)) loadMd(); }
    else if (S.tab === "dl") { if (S.dlId) { if (force || !S.dlD) loadDl(S.dlId); } else if (force || !S.dl) loadDls(); }
    render();
  }
  function setTab(k) {
    S.tab = k;
    try { history.replaceState(null, "", "#" + k); } catch (_) { /* بی‌اهمیت */ }
    loadTab();
  }

  /* ---------- سرآیند ---------- */
  function vTop() {
    return `<header class="tp-top">
      <div class="brand"><img src="../assets/logo-new.jpg" alt=""><div><h1>پنل پشتیبانی تدارکات</h1><div class="sub">نظارت بر کار کارشناسان و تأیید کمیسیون · ${esc(CFG.company || "")}</div></div></div>
      <span class="spacer"></span>
      ${TP.themeBtn()}
      <button class="tp-btn sm" data-refresh title="به‌روزرسانی">↻</button>
      <button class="tp-btn sm" data-pass>تغییر رمز</button>
      <a class="tp-back" href="index.html">تدارکات</a>
      <button class="tp-btn xs" data-logout title="خروج">خروج</button>
    </header>
    ${vTabs()}`;
  }
  function vTabs() {
    const wait = S.experts.reduce((a, e) => a + (e.cm_wait || 0), 0);
    return `<div class="tp-tabs">${TABS.map(([k, l]) => `<button class="tp-tab ${S.tab === k ? "on" : ""}" data-tab="${k}">${l}${k === "cm" && wait ? `<span class="cnt" title="قلم‌هایی که جدول کمیسیونشان ساخته شده و منتظر تأیید پشتیبانی‌اند">${wait}</span>` : ""}${k === "ai" && S.ai && S.ai.asks.length ? `<span class="cnt" title="پرسش‌های بی‌پاسخِ کارشناس هوشمند از کارشناسان">🚨 ${S.ai.asks.length}</span>` : ""}${k === "ai" && S.ai && S.ai.handovers && S.ai.handovers.length ? `<span class="cnt" title="کارهایی که به حداقلِ استعلام نرسیدند و به کارشناس واگذار شدند">⚠️ ${S.ai.handovers.length}</span>` : ""}${k === "dl" && S.ai && S.ai.deliveries && S.ai.deliveries.new ? `<span class="cnt" title="تحویل‌های بررسی‌نشدهٔ کارشناس هوشمند">${S.ai.deliveries.new}</span>` : ""}</button>`).join("")}</div>`;
  }

  /* ---------- مراحل (همان شش باکس میز مدیر) ---------- */
  function boxes(flags, a, active) {
    const A = { dispatchedAt: a.dispatched_at, days: a.days, done: flags, active };
    return TP.STAGES.map((s, i) => {
      const cnt = i === 3 && a.quote_count ? a.quote_count : i === 4 && a.proforma_count ? a.proforma_count : "";
      return `<td class="console"><div class="box sm b-${TP.stageColor(A, i, thr(), S.now)}" title="${s}">${cnt ? `<span class="cnt">${cnt}</span>` : ""}</div></td>`;
    }).join("");
  }

  /* ---------- تب «درخواست‌ها» ---------- */
  const WINDOWS = [["3d", "امروز و دو روز گذشته", 2], ["7d", "هفتهٔ اخیر", 6], ["30d", "ماه اخیر", 29], ["all", "همه تاریخ‌ها", null]];
  const RS = { new: ["ارجاع‌نشده", "st-reg"], ready: ["ارسال‌نشده", "st-hold"], run: ["در جریان", "st-run"], hold: ["معلق", "st-hold"], stop: ["متوقف", "st-stop"], closed: ["بسته", "st-cls"] };
  function reqStatus(r) {
    const live = r.items.filter((i) => i.state === "open" || i.state === "hold");
    if (!live.length) return r.items.some((i) => i.state === "closed") ? "closed" : r.items.some((i) => i.state === "stop") ? "stop" : "closed";
    if (live.every((i) => i.state === "hold")) return "hold";
    if (live.some((i) => !i.assignment_id)) return "new";
    if (r.assignments.some((a) => !a.dispatched_at && live.some((i) => i.assignment_id === a.id))) return "ready";
    return "run";
  }
  async function loadDesk() {
    S.deskLoading = true; S.deskErr = ""; render();
    const qs = new URLSearchParams({ limit: "600" });
    if (S.rf.id) qs.set("id", S.rf.id);
    else {
      const w = WINDOWS.find((x) => x[0] === S.rf.win);
      if (w && w[2] != null) qs.set("from", TP.fmtD(Date.now() - w[2] * DAY));
      if (S.rf.status === "closed" || S.rf.status === "stop") qs.set("scope", "all");
    }
    try { const d = await api("/desk?" + qs); S.desk = d; S.settings = d.settings || S.settings; }
    catch (e) { S.deskErr = e.message; }
    S.deskLoading = false; render();
  }
  function reqRows() {
    if (!S.desk) return [];
    const f = S.rf;
    return S.desk.requests.filter((r) => {
      if (f.project && (r.project || "—") !== f.project) return false;
      if (f.expert && !r.assignments.some((a) => String(a.expert_id) === f.expert)) return false;
      if (f.status && reqStatus(r) !== f.status) return false;
      if (f.q && !(TP.hit(r.id, f.q) || TP.hit(r.party, f.q) || r.items.some((i) => TP.hit(i.title, f.q) || TP.hit(i.code, f.q)))) return false;
      return true;
    });
  }
  function vReq() {
    const d = S.desk, f = S.rf;
    const projects = d ? [...new Set(d.requests.map((r) => r.project || "—"))].sort((a, b) => a.localeCompare(b, "fa")) : [];
    const rows = reqRows();
    let h = `<div class="tp-filters">
      <span class="lab">بازه</span><select class="tp-select" data-rf="win" ${f.id ? "disabled" : ""}>${WINDOWS.map(([k, l]) => `<option value="${k}" ${f.win === k ? "selected" : ""}>${l}</option>`).join("")}</select>
      <span class="lab">پروژه</span><select class="tp-select" data-rf="project"><option value="">همه</option>${projects.map((p) => `<option ${f.project === p ? "selected" : ""}>${esc(p)}</option>`).join("")}</select>
      <span class="lab">کارشناس</span><select class="tp-select" data-rf="expert"><option value="">همه</option>${expertOpts(f.expert)}</select>
      <span class="lab">وضعیت</span><select class="tp-select" data-rf="status"><option value="">همه</option>${Object.entries(RS).map(([k, [l]]) => `<option value="${k}" ${f.status === k ? "selected" : ""}>${l}</option>`).join("")}</select>
      <input class="tp-input" data-fq="req" value="${esc(f.q)}" placeholder="شماره، طرف مقابل یا قلم…" style="min-width:220px">
      ${f.id ? `<span class="chip info">فقط درخواست ${esc(f.id)} <button class="tp-btn xs" data-rid-clear>×</button></span>` : ""}
      <span class="end">${d ? `${rows.length} از ${d.requests.length} درخواست` : ""}${S.deskLoading && d ? " · در حال به‌روزرسانی…" : ""}</span></div>`;
    if (S.deskErr) h += `<div class="tp-note warn">${esc(S.deskErr)}</div>`;
    if (!d) return h + (S.deskLoading ? `<div class="empty">در حال بارگذاری…</div>` : "");
    if (!rows.length) {
      const q = f.q.trim();
      return h + `<div class="empty"><b>درخواستی با این فیلترها نیست.</b>${q.length >= 4 && !f.id ? `<br><button class="tp-btn" data-lookup="${esc(q)}">جستجوی شمارهٔ «${esc(q)}» در کل سامانه</button>` : ""}</div>`;
    }
    h += `<div class="tp-scroll" data-keep-scroll style="max-height:calc(100vh - 240px);margin-top:10px"><table class="tp-table" data-stick><thead><tr>
      <th>شماره</th><th>تاریخ</th><th class="rt">طرف مقابل</th><th>پروژه</th><th>اقلام<br><span class="dim">باز / کل</span></th>
      <th class="sep">کارشناس</th><th>ارسال</th>${TP.STAGES.map((s) => `<th class="console">${s.replace(" ", "<br>")}</th>`).join("")}
      <th class="sep">تأیید کمیسیون<br><span class="dim">تأیید / باز</span></th><th>وضعیت</th><th></th></tr></thead><tbody>`;
    for (const r of rows) {
      const live = r.items.filter((i) => i.state === "open" || i.state === "hold").length;
      const asg = r.assignments.length ? r.assignments : [null];
      const st = reqStatus(r), span = asg.length;
      asg.forEach((a, k) => {
        const its = a ? r.items.filter((i) => i.assignment_id === a.id) : r.items;
        h += "<tr>";
        if (!k) h += `<td rowspan="${span}" class="id num">${esc(r.id)}</td><td rowspan="${span}" class="num">${esc(r.date)}</td><td rowspan="${span}" class="party">${esc(r.party)}</td>
          <td rowspan="${span}">${esc(r.project || "—")}</td><td rowspan="${span}" class="num">${live} / ${r.items.length}</td>`;
        if (a) {
          const open = its.filter((i) => i.state === "open");
          const flags = [!!a.viewed_at, its.some((i) => i.hist_done_at), its.some((i) => i.smart_done_at), a.quote_count > 0, a.proforma_count > 0, !!a.commission_at];
          h += `<td class="sep">${esc(a.expert_label || a.expert_name)}</td>
            <td class="num" title="${a.dispatched_at ? esc(fmtS(a.dispatched_at)) : ""}">${a.dispatched_at ? TP.fmtD(a.dispatched_at) : `<span class="dim">ارسال‌نشده</span>`}</td>
            ${boxes(flags, a, !!a.dispatched_at && open.length > 0)}
            <td class="sep num">${open.filter((i) => i.commission_ok).length} / ${open.length}</td>`;
        } else h += `<td class="sep dim">بی‌کارشناس</td><td></td>${TP.STAGES.map(() => `<td class="console"></td>`).join("")}<td class="sep"></td>`;
        if (!k) h += `<td rowspan="${span}"><span class="st ${RS[st][1]}">${RS[st][0]}</span></td>`;
        h += `<td>${a ? `<button class="tp-btn xs" data-asg="${a.id}">جزئیات</button>` : ""}</td></tr>`;
      });
    }
    return h + "</tbody></table></div>";
  }

  /* ---------- جزئیاتِ یک ارجاع (روی صفحه) ---------- */
  function overlay(title, html) {
    const el = document.createElement("div"); el.className = "sup-ov";
    el.innerHTML = `<div class="tp-card sheet" role="dialog" aria-modal="true"><div class="hd"><h3 data-ovt></h3><span style="margin-inline-start:auto"></span><button class="tp-btn sm" data-close>بستن ✕</button></div><div data-ovb></div></div>`;
    const set = (t, b) => { el.querySelector("[data-ovt]").innerHTML = t; el.querySelector("[data-ovb]").innerHTML = b; };
    set(title, html);
    el.addEventListener("click", (e) => {
      if (e.target === el || e.target.closest("[data-close]")) { el.remove(); return; }
      const t = e.target.closest("[data-cmprev],[data-cmdl],[data-goto],[data-asg]");
      if (t) { if (t.dataset.goto) el.remove(); act(t); }
    });
    document.body.appendChild(el);
    return { el, set, close: () => el.remove() };
  }
  async function openAsg(aid) {
    const ov = overlay("جزئیات ارجاع", `<div class="empty">در حال بارگذاری…</div>`);
    try {
      const d = await api(`/assignments/${aid}`);
      ov.set(`درخواست <span class="num">${esc(d.request ? d.request.id : "")}</span> — ${esc(d.assignment.expert_label || d.assignment.expert_name)}`, asgHtml(d));
    } catch (e) { ov.set("خطا", `<div class="tp-note warn">${esc(e.message)}</div>`); }
  }
  function asgHtml(d) {
    const a = d.assignment, r = d.request || {}, its = d.items || [], qs = d.quotes || [], pfs = d.proformas || [];
    const qOf = (id) => qs.filter((q) => q.item_id === id);
    const k = (lab, val) => `<div class="k"><b>${lab}</b><span style="font-size:.8rem;font-weight:600">${val}</span></div>`;
    return `<div class="kpi">${k("طرف مقابل", esc(r.party || "—"))}${k("ارسال برای کارشناس", a.dispatched_at ? fmtS(a.dispatched_at) : "ارسال‌نشده")}
        ${k("مشاهدهٔ کارشناس", a.viewed_at ? fmtS(a.viewed_at) : "—")}${k("پایان مهلت", a.deadline_at ? fmtS(a.deadline_at) : `${a.days || "—"} روز کاری`)}
        ${k("جدول کمیسیون", a.commission_no ? `TSA-PS-FO-${a.commission_no}<br>${fmtS(a.commission_at)}` : "ساخته نشده")}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
        ${a.commission_no ? `<button class="tp-btn sm" data-cmprev="${a.id}">پیش‌نمایش جدول کمیسیون</button><button class="tp-btn sm" data-cmdl="${a.id}" data-rid="${esc(r.id)}">دانلود جدول کمیسیون (اکسل)</button>` : ""}
        <button class="tp-btn sm" data-goto="chat" data-rid="${esc(r.id)}">مکاتبات این درخواست</button>
        <button class="tp-btn sm" data-goto="log" data-rid="${esc(r.id)}">رخدادهای این درخواست</button></div>
      ${a.notes ? `<div class="tp-note">توضیحات کارشناس (پای جدول کمیسیون): ${esc(a.notes)}</div>` : ""}
      <h4 class="sup-h">اقلام (${its.length})</h4>
      <table class="sup-tbl"><thead><tr><th>#</th><th>قلم</th><th class="c">مقدار</th><th class="c">وضعیت</th><th class="c">بررسی سوابق</th><th class="c">نرمال‌سازی</th><th class="c">استعلام<br>ثبت / خط</th><th class="c">تأیید نهایی</th><th class="c">تأیید کمیسیون</th></tr></thead><tbody>
      ${its.map((i) => { const q = qOf(i.id); const s = TP.STATES[i.state] || TP.STATES.open; return `<tr><td class="num">${i.line_no}</td>
        <td>${esc(i.title)}${i.sp_lock ? ` <span class="chip info" title="برای تأمین‌کننده رفته؛ ساختارش قفل است">🔒</span>` : ""}</td>
        <td class="c num">${i.qty == null ? "" : M(i.qty)} ${esc(i.unit || "")}</td><td class="c"><span class="st ${s.cls}">${s.label}</span></td>
        <td class="c" title="${i.hist_done_at ? esc(fmtS(i.hist_done_at)) : ""}">${i.hist_done_at ? "✓" : "—"}</td>
        <td class="c" title="${i.norm_at ? esc(fmtS(i.norm_at)) : ""}">${i.norm_at ? "✓" : "—"}</td>
        <td class="c num">${q.filter((x) => x.saved).length} / ${q.length}</td>
        <td class="c">${q.filter((x) => x.final).map((x) => esc(x.supplier_name)).join("، ") || "—"}</td>
        <td class="c">${i.commission_ok ? `<span class="ok-mark">✓</span>` : "—"}</td></tr>`; }).join("")}</tbody></table>
      <h4 class="sup-h">خط‌های استعلام (${qs.length})</h4>
      ${qs.length ? `<div style="overflow:auto"><table class="sup-tbl"><thead><tr><th>تأمین‌کننده</th><th>قلم</th><th class="c">مقدار</th><th class="c">قیمت واحد (ریال)</th><th class="c">تحویل</th><th class="c">اعتبار</th><th class="c">فاکتور</th><th class="c">پرداخت</th><th class="c">ثبت موقت</th><th class="c">تأیید نهایی</th><th class="c">از کجا</th><th class="c">افزوده شد</th></tr></thead><tbody>
        ${qs.map((q) => { const it = its.find((i) => i.id === q.item_id); return `<tr><td>${esc(q.supplier_name)}</td><td>${esc(it ? it.title : "")}</td>
          <td class="c num">${q.qty == null ? "" : M(q.qty)} ${esc(q.unit || "")}</td><td class="c num">${q.price == null ? "—" : M(q.price)}</td>
          <td class="c">${esc(q.dtime || "—")}</td><td class="c">${esc(q.valid_days || "—")}</td><td class="c">${esc(q.invoice || "—")}</td><td class="c">${esc(q.pay || "—")}</td>
          <td class="c">${q.saved ? "✓" : "—"}</td><td class="c" title="${q.final_at ? esc(fmtS(q.final_at)) : ""}">${q.final ? `<span class="ok-mark">✓</span>` : "—"}</td>
          <td class="c">${esc(ORIGIN[q.origin] || q.origin || "—")}${q.source === "ai" ? " 🤖" : ""}</td><td class="c num" style="font-size:.75rem">${fmtShort(q.created_at)}</td></tr>`; }).join("")}</tbody></table></div>`
        : `<div class="dim">خط استعلامی ثبت نشده.</div>`}
      <h4 class="sup-h">پیش‌فاکتورها (${pfs.length})</h4>
      ${pfs.length ? `<table class="sup-tbl"><thead><tr><th>تأمین‌کننده</th><th>فایل</th><th class="c">بارگذاری</th><th class="c">از</th><th class="c">خواندن هوشمند</th></tr></thead><tbody>
        ${pfs.map((p) => `<tr><td>${esc(p.supplier_name)}</td><td>${esc(p.filename || "—")}</td><td class="c num" style="font-size:.78rem">${fmtS(p.uploaded_at)}</td>
          <td class="c">${esc({ panel: "پنل", telegram: "تلگرام", supplier: "پنل تأمین‌کننده" }[p.source] || p.source || "—")}</td><td class="c">${esc({ ok: "✓ خوانده شد", refused: "خوانا نبود", failed: "نشد", pending: "در حال خواندن" }[p.extract_state] || "—")}</td></tr>`).join("")}</tbody></table>`
        : `<div class="dim">پیش‌فاکتوری نیامده.</div>`}`;
  }
  async function cmPreview(aid) {
    const ov = overlay("پیش‌نمایش جدول کمیسیون", `<div class="empty">در حال ساختن برگه…</div>`);
    try {
      const d = await api(`/assignments/${aid}/sheet/commission?format=html`);
      ov.set("پیش‌نمایش جدول کمیسیون", `<iframe title="جدول کمیسیون"></iframe>`);
      ov.el.querySelector("iframe").srcdoc = `<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
        <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700&display=swap" rel="stylesheet">
        <style>body{margin:12px;font-family:Vazirmatn,Tahoma,sans-serif;font-size:11px;background:#fff;color:#000}${d.css || ""}</style></head><body>${d.html || ""}</body></html>`;
    } catch (e) { ov.set("خطا", `<div class="tp-note warn">${esc(e.message)}</div>`); }
  }

  /* ---------- تب «کارشناسان» ---------- */
  function vExperts() {
    const E = S.experts;
    if (!E.length) return `<div class="empty">در حال بارگذاری…</div>`;
    const sum = (k) => E.reduce((a, e) => a + (e[k] || 0), 0);
    return `<div class="kpi" style="margin-bottom:12px"><div class="k"><b>کارشناس فعال</b><span>${E.length}</span></div><div class="k"><b>ارجاع باز</b><span>${sum("open_asg")}</span></div>
        <div class="k"><b>قلم باز</b><span>${sum("open_items")}</span></div><div class="k"><b>از مهلت گذشته</b><span>${sum("overdue")}</span></div>
        <div class="k"><b>دیده‌نشده</b><span>${sum("unseen")}</span></div><div class="k"><b>منتظر تأیید کمیسیون</b><span>${sum("cm_wait")}</span></div></div>
      <div class="tp-scroll" data-keep-scroll style="max-height:calc(100vh - 300px)"><table class="tp-table" data-stick><thead><tr>
        <th class="rt">کارشناس</th><th>ارجاع باز</th><th>قلم باز</th><th>از مهلت گذشته</th><th>دیده‌نشده</th><th>منتظر تأیید کمیسیون</th><th>گفت‌وگو با تأمین‌کننده</th><th>کارشناس هوشمند</th><th>تلگرام</th><th></th></tr></thead><tbody>
      ${E.map((e) => `<tr class="rowlink" data-ex="${e.id}"><td class="rt"><b>${e.senior ? "★ " : ""}${esc(e.label || e.name)}</b>${e.label && e.label !== e.name ? `<div class="dim" style="font-size:.75rem">${esc(e.name)}</div>` : ""}</td>
        <td class="num"><b>${e.open_asg}</b></td><td class="num">${e.open_items}</td>
        <td class="num">${e.overdue ? `<span class="chip bad">${e.overdue}</span>` : "0"}</td><td class="num">${e.unseen ? `<span class="chip warn">${e.unseen}</span>` : "0"}</td>
        <td class="num">${e.cm_wait ? `<span class="chip info">${e.cm_wait}</span>` : "0"}</td><td class="num">${e.threads}</td>
        <td>${e.ai === "on" ? `<span class="chip" style="border-color:rgba(167,139,250,.5)">🤖 روشن</span>` : e.ai ? `<span class="dim">${esc(e.ai)}</span>` : "—"}</td>
        <td>${e.tg ? "✓" : "—"}</td><td><button class="tp-btn xs" data-ex="${e.id}">جزئیات</button></td></tr>`).join("")}</tbody></table></div>`;
  }
  async function loadExpert(id) {
    S.exId = id; S.ex = null; S.exErr = ""; render();
    try { S.ex = await api(`/experts/${id}`); } catch (e) { S.exErr = e.message; }
    render();
  }
  function vExpert() {
    const back = `<button class="tp-btn sm" data-exback>→ همهٔ کارشناسان</button>`;
    if (S.exErr) return `${back}<div class="tp-note warn">${esc(S.exErr)}</div>`;
    if (!S.ex) return `${back}<div class="empty">در حال بارگذاری…</div>`;
    const e = S.ex.expert, row = S.experts.find((x) => x.id === e.id) || {}, A = S.ex.assignments || [];
    const k = (lab, v) => `<div class="k"><b>${lab}</b><span>${v}</span></div>`;
    let h = `<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:10px">${back}<h2 style="margin:0;font-size:1.15rem">${e.senior ? "★ " : ""}${esc(e.label || e.name)}</h2>
        <button class="tp-btn xs" data-goto="log" data-ex-log="${e.id}">همهٔ رخدادهای این کارشناس</button><button class="tp-btn xs" data-goto="chat" data-ex-chat="${e.id}">مکاتباتش</button></div>
      <div class="kpi" style="margin-bottom:12px">${k("ارجاع باز", row.open_asg ?? A.length)}${k("قلم باز", row.open_items ?? "—")}${k("از مهلت گذشته", row.overdue ?? "—")}${k("دیده‌نشده", row.unseen ?? "—")}${k("منتظر تأیید کمیسیون", row.cm_wait ?? "—")}</div>`;
    h += A.length ? `<div class="tp-scroll" data-keep-scroll style="max-height:46vh"><table class="tp-table" data-stick><thead><tr>
        <th>درخواست</th><th>تاریخ</th><th class="rt">طرف مقابل</th><th>ارسال</th><th>پایان مهلت</th>${TP.STAGES.map((s) => `<th class="console">${s.replace(" ", "<br>")}</th>`).join("")}
        <th class="sep">اقلام<br><span class="dim">باز / کل</span></th><th>استعلام<br><span class="dim">ثبت / خط</span></th><th>تأیید نهایی</th><th>تأیید کمیسیون</th><th>مکاتبه</th><th></th></tr></thead><tbody>
      ${A.map((a) => { const flags = [!!a.viewed_at, a.hist_count > 0, a.smart_count > 0, a.quote_count > 0, a.proforma_count > 0, !!a.commission_at];
        const late = a.deadline_at && a.deadline_at < S.now && a.open_count > 0;
        return `<tr><td class="id num">${esc(a.request_id)}</td><td class="num">${esc(a.date)}</td><td class="party">${esc(a.party)}</td>
          <td class="num" title="${esc(fmtS(a.dispatched_at))}">${TP.fmtD(a.dispatched_at)}</td><td class="num ${late ? "" : ""}" title="${a.deadline_at ? esc(fmtS(a.deadline_at)) : ""}">${a.deadline_at ? `${late ? `<span class="chip bad">` : ""}${fmtShort(a.deadline_at)}${late ? "</span>" : ""}` : "—"}</td>
          ${boxes(flags, a, a.open_count > 0)}
          <td class="sep num">${a.open_count} / ${a.item_count}</td><td class="num">${a.quote_count} / ${a.quote_lines}</td><td class="num">${a.final_count}</td>
          <td class="num">${a.ok_count} / ${a.open_count}</td><td class="num">${a.threads}</td><td><button class="tp-btn xs" data-asg="${a.id}">جزئیات</button></td></tr>`; }).join("")}</tbody></table></div>`
      : `<div class="empty">ارجاعِ بازی ندارد.</div>`;
    h += `<h3 class="sup-h">آخرین رخدادها</h3>${feedTable(S.ex.activity || [], false)}`;
    return h;
  }

  /* ---------- تب «مکاتبات» (فقط‌خواندنی) ---------- */
  async function loadThreads() {
    S.thLoading = true; S.thErr = ""; render();
    const qs = new URLSearchParams();
    if (S.thF.expert) qs.set("expert", S.thF.expert);
    if (S.thF.rid) qs.set("rid", S.thF.rid);
    try { S.th = (await api("/threads?" + qs)).threads || []; } catch (e) { S.thErr = e.message; }
    S.thLoading = false; render();
  }
  async function openThread(id) {
    S.thId = id; S.thData = null; render();
    try { S.thData = await api(`/threads/${id}`); } catch (e) { S.thData = { error: e.message }; }
    render();
    const box = app.querySelector("[data-chat]"); if (box) box.scrollTop = box.scrollHeight;
  }
  function vChat() {
    const f = S.thF;
    const list = (S.th || []).filter((t) => !f.q || TP.hit(t.supplier, f.q) || TP.hit(t.request_id, f.q) || TP.hit(t.party, f.q));
    let h = `<div class="tp-filters"><span class="lab">کارشناس</span><select class="tp-select" data-thf="expert"><option value="">همه</option>${expertOpts(f.expert)}</select>
      ${f.rid ? `<span class="chip info">درخواست ${esc(f.rid)} <button class="tp-btn xs" data-thf-clear>×</button></span>` : ""}
      <input class="tp-input" data-fq="th" value="${esc(f.q)}" placeholder="تأمین‌کننده، شمارهٔ درخواست یا طرف مقابل…" style="min-width:240px">
      <span class="end">${S.th ? `${list.length} گفت‌وگو · ` : ""}فقط‌خواندنی — نگاه پشتیبانی پیامی را «خوانده‌شده» نمی‌کند</span></div>`;
    if (S.thErr) h += `<div class="tp-note warn">${esc(S.thErr)}</div>`;
    if (!S.th) return h + (S.thLoading ? `<div class="empty">در حال بارگذاری…</div>` : "");
    h += `<div class="sup-split" style="margin-top:10px"><div class="sup-list">${list.map((t) => `<button class="sup-th ${t.id === S.thId ? "on" : ""}" data-th="${t.id}">
        <div class="l1"><span>${esc(t.supplier)}${t.demo ? ` <span class="chip mock">دمو</span>` : ""}</span><span class="dim num" style="font-size:.75rem;font-weight:400">${fmtShort(t.last_at)}</span></div>
        <div class="l2"><span>درخواست <b class="num">${esc(t.request_id)}</b></span><span>${esc(exName(t.expert_id))}</span><span>${t.msgs} پیام</span>${t.ai_msgs ? `<span>🤖 ${t.ai_msgs}</span>` : ""}${t.finals ? `<span class="ok-mark">✓ ${t.finals} تأیید نهایی</span>` : ""}</div>
        <div class="l3">${t.last_who === "s" ? "تأمین‌کننده: " : t.last_who === "e" ? "کارشناس: " : ""}${esc(t.last_kind === "voice" ? "🎤 پیام صوتی" : t.last_body || "")}</div></button>`).join("") || `<div class="empty">گفت‌وگویی نیست.</div>`}</div>
      <div>${vThread()}</div></div>`;
    return h;
  }
  function vThread() {
    if (!S.thId) return `<div class="tp-card" style="padding:18px"><div class="empty">یک گفت‌وگو را از فهرست انتخاب کنید.</div></div>`;
    const d = S.thData;
    if (!d) return `<div class="tp-card" style="padding:18px"><div class="empty">در حال بارگذاری…</div></div>`;
    if (d.error) return `<div class="tp-note warn">${esc(d.error)}</div>`;
    const t = d.thread, lines = d.lines || [], msgs = d.msgs || [];
    return `<div class="tp-card" style="padding:14px 16px">
      <div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap"><b style="font-size:1.02rem">${esc(t.supplier)}</b>${t.demo ? `<span class="chip mock">دمو</span>` : ""}
        <span class="muted">درخواست <b class="num">${esc(t.request_id)}</b>${t.party ? ` · ${esc(t.party)}` : ""}</span><span class="muted">کارشناس: ${esc(t.expert || "")}</span>
        <span class="dim num" style="font-size:.8rem" dir="ltr">${esc(t.phone || "")}</span>${t.phone_label ? `<span class="dim" style="font-size:.8rem">${esc(t.phone_label)}</span>` : ""}
        <span style="margin-inline-start:auto"></span>
        <button class="tp-btn xs" data-goto="log" data-rid="${esc(t.request_id)}">رخدادهای درخواست</button>
        ${t.assignment_id ? `<button class="tp-btn xs" data-asg="${t.assignment_id}">جزئیات ارجاع</button>` : ""}</div>
      ${lines.length ? `<table class="sup-tbl" style="margin-top:8px"><thead><tr><th>کد</th><th>قلم</th><th class="c">مقدار</th><th class="c">قیمت واحد</th><th class="c">جمع</th><th class="c">وضعیت</th></tr></thead><tbody>
        ${lines.map((l) => `<tr><td class="num">${l.no || ""}</td><td>${esc(l.title)}</td><td class="c num">${l.qty == null ? "—" : M(l.qty)} ${esc(l.unit || l.req_unit || "")}</td>
          <td class="c num">${l.price == null ? "—" : M(l.price)}</td><td class="c num">${l.total == null ? "—" : M(l.total)}</td><td class="c"><span class="chip">${esc(l.state_fa || l.state)}</span></td></tr>`).join("")}</tbody></table>` : ""}
      <div class="sup-chat" data-chat style="margin-top:10px">${msgs.map(bubble).join("") || `<div class="empty">پیامی نیست.</div>`}</div></div>`;
  }
  function bubble(m) {
    const meta = m.meta || {};
    const at = `<span class="meta num">${fmtS(m.at)}</span>`;
    if (m.kind === "note") return `<div class="bub note"><b>📝 یادداشت درونی${meta.ai ? " — 🤖 کارشناس هوشمند" : " کارشناس"}</b>\n${esc(m.body)}${at}</div>`;
    if (m.kind === "event") return `<div class="bub ev">${esc(m.body)}${at}</div>`;
    const who = m.who === "s" ? "s" : "e";
    const lab = who === "s" ? "تأمین‌کننده" : meta.ai ? "🤖 کارشناس هوشمند" : "کارشناس";
    const v = meta.voice || {};
    const body = m.kind === "voice" ? `🎤 پیام صوتی${v.dur ? ` (${Math.round(v.dur)} ثانیه)` : ""}${m.body ? `\n${esc(m.body)}` : ""}` : esc(m.body);
    return `<div class="bub ${who}${who === "e" && meta.ai ? " ai" : ""}"><b style="font-size:.75rem">${lab}</b>\n${body}${at}</div>`;
  }

  /* ---------- تب «گزارش رخدادها» ---------- */
  const GROUPS = [["", "همه"], ["asg", "ارجاع و تصمیم‌های مدیر"], ["work", "کار کارشناسان"], ["chat", "مکاتبات و پیامک"], ["support", "پشتیبانی"]];
  const BY = { manager: "مدیر", expert: "کارشناس", ai: "🤖 کارشناس هوشمند", supplier: "تأمین‌کننده", support: "پشتیبانی", system: "سامانه" };
  async function loadLog(more) {
    S.logLoading = true; S.logErr = ""; render();
    const f = S.logF, qs = new URLSearchParams({ limit: "200" });
    const from = f.from ? TP.jStr2ms(f.from) : null, to = f.to ? TP.jStr2ms(f.to) : null;
    if (from) qs.set("from", String(from));
    if (to) qs.set("to", String(to + DAY - 1));
    if (f.expert) qs.set("expert", f.expert);
    if (f.rid) qs.set("rid", f.rid);
    if (f.g) qs.set("g", f.g);
    if (more && S.logNext) qs.set("before", String(S.logNext));
    try {
      const r = await api("/activity?" + qs);
      if (more && S.log) { const have = new Set(S.log.map((x) => x.key)); S.log = S.log.concat(r.rows.filter((x) => !have.has(x.key))); }
      else S.log = r.rows;
      S.logMore = r.more; S.logNext = r.next;
    } catch (e) { S.logErr = e.message; }
    S.logLoading = false; render();
  }
  function feedTable(rows, withExpert) {
    if (!rows.length) return `<div class="empty">رخدادی نیست.</div>`;
    return `<div class="tp-scroll sup-feed" data-keep-scroll style="max-height:calc(100vh - 260px)"><table class="tp-table" data-stick><thead><tr>
      <th>زمان</th><th>کنشگر</th>${withExpert ? "<th>کارشناس</th>" : ""}<th>درخواست</th><th class="rt">شرح</th></tr></thead><tbody>
      ${rows.map((x) => `<tr><td class="t">${fmtS(x.at)}</td><td><span class="by by-${esc(x.by)}">${BY[x.by] || esc(x.by)}</span></td>
        ${withExpert ? `<td>${x.expert_id ? esc(exName(x.expert_id)) : "—"}</td>` : ""}
        <td class="num">${x.request_id ? `<button class="tp-btn xs" data-lrid-set="${esc(x.request_id)}" title="فقط رخدادهای همین درخواست">${esc(x.request_id)}</button>` : "—"}</td>
        <td class="txt">${esc(x.text)}${x.demo ? ` <span class="chip mock">دمو</span>` : ""}${x.thread_id ? ` <button class="tp-btn xs" data-th-open="${x.thread_id}">گفت‌وگو</button>` : ""}${x.assignment_id ? ` <button class="tp-btn xs" data-asg="${x.assignment_id}">ارجاع</button>` : ""}</td></tr>`).join("")}
      </tbody></table></div>`;
  }
  function vLog() {
    const f = S.logF;
    let h = `<div class="tp-filters">
      <span class="lab">از</span><input class="tp-input date ${f.from ? "on" : ""}" data-ld="from" value="${esc(f.from)}" placeholder="تاریخ" readonly style="width:110px">
      <span class="lab">تا</span><input class="tp-input date ${f.to ? "on" : ""}" data-ld="to" value="${esc(f.to)}" placeholder="تاریخ" readonly style="width:110px">
      <span class="lab">کارشناس</span><select class="tp-select" data-lf="expert"><option value="">همه</option>${expertOpts(f.expert)}</select>
      <span class="lab">درخواست</span><input class="tp-input ${f.rid ? "on" : ""}" data-lrid value="${esc(f.rid)}" placeholder="شمارهٔ درخواست ↵" style="width:150px">
      <span class="lab">نوع</span><select class="tp-select" data-lf="g">${GROUPS.map(([k, l]) => `<option value="${k}" ${f.g === k ? "selected" : ""}>${l}</option>`).join("")}</select>
      <button class="tp-btn sm" data-lclear>پاک کردن فیلترها</button>
      <span class="end">${S.log ? `${S.log.length} رخداد` : ""}${S.logLoading ? " · در حال بارگذاری…" : ""}</span></div>`;
    if (S.logErr) h += `<div class="tp-note warn">${esc(S.logErr)}</div>`;
    if (!S.log) return h + (S.logLoading ? `<div class="empty">در حال بارگذاری…</div>` : "");
    h += `<div style="margin-top:10px">${feedTable(S.log, true)}</div>`;
    if (S.logMore) h += `<div style="text-align:center;margin-top:10px"><button class="tp-btn" data-lmore ${S.logLoading ? "disabled" : ""}>رخدادهای قدیمی‌تر</button></div>`;
    return h;
  }

  /* ---------- تب «تأیید کمیسیون» ---------- */
  async function loadCm() {
    S.cmLoading = true; S.cmErr = ""; render();
    const qs = new URLSearchParams({ scope: S.cmF.scope });
    if (S.cmF.expert) qs.set("expert", S.cmF.expert);
    try { const r = await api("/commission?" + qs); S.cm = r.items || []; S.cmMin = r.min || 1; }
    catch (e) { S.cmErr = e.message; }
    S.cmSel = new Set([...S.cmSel].filter((id) => (S.cm || []).some((i) => i.id === id)));
    S.cmLoading = false; render();
  }
  const cmRows = () => (S.cm || []).filter((i) => !S.cmF.q || TP.hit(i.request_id, S.cmF.q) || TP.hit(i.title, S.cmF.q) || TP.hit(i.party, S.cmF.q) || TP.hit(i.final_sup, S.cmF.q));
  function vCm() {
    const rows = cmRows(), sel = rows.filter((i) => S.cmSel.has(i.id));
    const nOn = sel.filter((i) => !i.commission_ok).length, nOff = sel.filter((i) => i.commission_ok).length;
    let h = `<div class="tp-filters">
      <span class="lab">نمایش</span><select class="tp-select" data-cf="scope">${[["ready", "جدول کمیسیونشان ساخته شده"], ["open", "همهٔ اقلامِ باز"], ["ok", "تأییدشده‌ها (منتظر خاتمهٔ کارشناس)"]].map(([k, l]) => `<option value="${k}" ${S.cmF.scope === k ? "selected" : ""}>${l}</option>`).join("")}</select>
      <span class="lab">کارشناس</span><select class="tp-select" data-cf="expert"><option value="">همه</option>${expertOpts(S.cmF.expert)}</select>
      <input class="tp-input" data-fq="cm" value="${esc(S.cmF.q)}" placeholder="شماره، قلم، طرف مقابل یا تأمین‌کننده…" style="min-width:240px">
      <span class="end">${S.cm ? `${rows.length} قلم` : ""}${S.cmLoading ? " · در حال بارگذاری…" : ""}</span></div>
      <div class="tp-note">تیکِ «تأیید کمیسیون» فقط در همین پنل زده می‌شود. با هر تأیید، کارشناسِ همان درخواست در تلگرام خبردار می‌شود و «خاتمه»ی همان اقلام را می‌زند؛ برداشتن تأیید هم به او خبر داده می‌شود.</div>`;
    if (S.cmErr) h += `<div class="tp-note warn">${esc(S.cmErr)}</div>`;
    if (!S.cm) return h + (S.cmLoading ? `<div class="empty">در حال بارگذاری…</div>` : "");
    if (!rows.length) return h + `<div class="empty"><b>قلمی نیست.</b>${S.cmF.scope === "ready" ? "هنوز جدول کمیسیونِ ارجاعِ بازی ساخته نشده؛ «همهٔ اقلامِ باز» را ببینید." : ""}</div>`;
    h += `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0">
        <button class="tp-btn sm" data-csel="all">انتخاب همه (${rows.length})</button><button class="tp-btn sm" data-csel="none" ${S.cmSel.size ? "" : "disabled"}>لغو انتخاب</button>
        <button class="tp-btn sm primary" data-cok="1" ${nOn ? "" : "disabled"}>✓ تأیید کمیسیونِ ${nOn} قلمِ انتخاب‌شده</button>
        <button class="tp-btn sm danger" data-cok="0" ${nOff ? "" : "disabled"}>برداشتن تأییدِ ${nOff} قلم</button></div>
      <div class="tp-scroll" data-keep-scroll style="max-height:calc(100vh - 330px)"><table class="tp-table" data-stick><thead><tr>
        <th></th><th>درخواست</th><th class="rt">طرف مقابل</th><th>کارشناس</th><th class="rt">قلم</th><th>مقدار</th><th>استعلام ثبت‌شده<br><span class="dim">حداقل ${S.cmMin}</span></th>
        <th class="rt">برندهٔ تأیید نهایی</th><th>قیمت واحد (ریال)</th><th>جدول کمیسیون</th><th>وضعیت</th><th></th></tr></thead><tbody>
      ${rows.map((i) => `<tr><td><input type="checkbox" data-cpick="${i.id}" ${S.cmSel.has(i.id) ? "checked" : ""} aria-label="انتخاب"></td>
        <td class="id num">${esc(i.request_id)}</td><td class="party">${esc(i.party)}</td><td>${esc(exName(i.expert_id))}</td><td class="item">${esc(i.title)}</td>
        <td class="num">${i.qty == null ? "" : M(i.qty)} ${esc(i.unit || "")}</td>
        <td class="num">${i.saved}${i.saved < S.cmMin ? ` <span class="chip warn" title="کمتر از حداقل استعلامِ مدیر">کم</span>` : ""}</td>
        <td class="rt">${i.finals ? esc(i.final_sup) : `<span class="chip warn">ندارد</span>`}</td><td class="num">${i.final_price == null ? "—" : M(i.final_price)}</td>
        <td>${i.commission_no ? `<button class="tp-btn xs" data-cmprev="${i.aid}" title="${esc(fmtS(i.commission_at))}">TSA-PS-FO-${i.commission_no}</button>` : `<span class="dim">ساخته نشده</span>`}</td>
        <td>${i.commission_ok ? `<span class="chip ok">✓ تأیید شد</span>` : `<span class="chip">منتظر</span>`}</td>
        <td>${i.commission_ok ? `<button class="tp-btn xs danger" data-cone="${i.id}" data-ok="0">برداشتن</button>` : `<button class="tp-btn xs primary" data-cone="${i.id}" data-ok="1">✓ تأیید</button>`}
          <button class="tp-btn xs" data-asg="${i.aid}">جزئیات</button></td></tr>`).join("")}</tbody></table></div>`;
    return h;
  }
  function cmSet(ids, ok) {
    const its = (S.cm || []).filter((i) => ids.includes(i.id));
    const noFinal = its.filter((i) => !i.finals).length, few = its.filter((i) => i.saved < S.cmMin).length;
    const body = ok
      ? `کمیسیونِ <b>${ids.length}</b> قلم تأیید شود؟<br>کارشناسِ هر درخواست در تلگرام خبردار می‌شود و می‌تواند «خاتمه» را بزند.`
        + (noFinal ? `<br><br>⚠️ ${noFinal} قلم هنوز «تأیید نهایی» ندارد.` : "") + (few ? `<br>⚠️ ${few} قلم کمتر از حداقل استعلامِ مدیر (${S.cmMin}) دارد.` : "")
      : `تأیید کمیسیونِ <b>${ids.length}</b> قلم برداشته شود؟<br>کارشناس خبردار می‌شود و تا تأییدِ دوباره نمی‌تواند این اقلام را خاتمه بزند.`;
    TP.modal(ok ? "تأیید کمیسیون" : "برداشتن تأیید کمیسیون", body, async () => {
      try {
        await api("/commission", { body: { item_ids: ids, ok: !!ok } });
        S.cmSel.clear();
        await Promise.all([loadCm(), loadExperts().catch(() => {})]);
      } catch (e) { TP.modal("نشد", esc(e.message), null, "باشد", ""); }
    }, ok ? "تأیید" : "برداشتن تأیید");
  }

  /* ---------- تب «🤖 کارشناس هوشمند» (فاز ۲) ----------
     تیکِ «🤖 هوشمند / ✋ دستی» هر کارشناس (هوشمند: کارهای تازه‌اش را کارشناس هوشمند انجام می‌دهد و همان کارها برایش قفل
     است)، «🚨 پرسش از کارشناس»های بی‌پاسخ، و داشبوردِ هر کارشناس — همان تبِ قدیمیِ پنل کارشناس (expert-ai.js) با مسیرهای
     /support/ai/<کارشناس>/… */
  async function loadAi() {
    S.aiLoading = true; S.aiErr = ""; render();
    try { S.ai = await api("/ai/experts"); } catch (e) { S.aiErr = e.message; }
    S.aiLoading = false; render();
  }
  if (window.TP_AI) {
    window.TP_AI.configure({
      api: (p, o) => api(`/ai/${S.aiEx}${p.slice(3)}`, o),
      download: (path, name) => download(path.startsWith("/ai/") ? `/ai/${S.aiEx}${path.slice(3)}` : path, name),
      active: () => S.view === "app" && S.tab === "ai" && !!S.aiEx,
      chat: (r) => `<button class="tp-btn sm" data-goto="chat" data-rid="${esc(r.request_id)}">💬 مکاتباتِ این درخواست</button>`,
    });
  }
  function vAi() {
    if (S.aiEx && window.TP_AI) {
      return `<div style="display:flex;gap:10px;align-items:center;margin-bottom:6px"><button class="tp-btn sm" data-aiback>→ همهٔ کارشناسان</button>
        <span class="muted">${esc(exName(S.aiEx))}</span></div>${window.TP_AI.view(S)}`;
    }
    const sub = `<div class="tp-tabs" style="padding:0 0 10px">${[["list", "👥 کارشناسان و کارها"], ["rules", "⚙️ قواعدِ حداقلِ استعلام"], ["rank", "🏅 رتبه‌بندی و دعوت"], ["usd", "💵 نرخ دلار"], ["md", "🧭 حالت اقلام"], ["sw", "🎛 کلیدها"]].map(([k, l]) => `<button class="tp-tab ${S.aiView === k ? "on" : ""}" data-aiview="${k}">${l}</button>`).join("")}</div>`;
    if (S.aiView === "rules") return sub + vRules();
    if (S.aiView === "usd") return sub + vUsd();
    if (S.aiView === "rank") return sub + vRank();
    if (S.aiView === "sw") return sub + vSw();
    if (S.aiView === "md") return sub + vMd();
    let h = sub + `<div class="tp-note">تیکِ <b>🤖 هوشمند</b>: ارجاع‌های تازهٔ این کارشناس قلم‌به‌قلم پیش می‌روند — کارشناس ساختار را تأیید می‌کند، «بررسی سوابق» را می‌زند و در «🎯 فهرست دعوت»ِ هر قلم
      (پنج نفر اول به ترتیبِ رتبهٔ نهایی و «قاعدهٔ دعوت» از پیش تیک‌خورده) «🚀 شروع» را می‌زند؛ کارشناس هوشمند فقط همان تیک‌خورده‌ها را دعوت می‌کند و مذاکره، جدول کمیسیون و نامه با اوست
      (این دو برای کارشناس قفل‌اند). کارشناس هوشمند خودش جستجوی هوشمند نمی‌زند. گفت‌وگوهای کارشناس هوشمند برای کارشناس بسته است، مگر وقتی کارشناس هوشمند سؤالی دارد که جوابش در پروندهٔ درخواست نیست
      («🚨 پرسش از کارشناس»: تا پاسخِ او باز می‌شود و در تلگرامش هم خبر می‌رود). کارشناس فقط خطِ استعلامِ دستیِ خودش را می‌تواند بیفزاید.
      <b>✋ دستی</b> همه‌چیز را به خودِ کارشناس برمی‌گرداند. کارشناس هوشمند تا هر قلم به «حداقلِ استعلامِ» خودش نرسد نمی‌بندد؛ اگر در مهلت نرسید، کار به کارشناس واگذار می‌شود (⚙️ قواعد).
      هر کارِ تمام‌شده در «📥 تحویل‌های هوشمند» برای تأیید یا ردِ کمیسیون می‌آید.</div>`;
    if (S.aiErr) h += `<div class="tp-note warn">${esc(S.aiErr)}</div>`;
    if (!S.ai) return h + (S.aiLoading ? `<div class="empty">در حال بارگذاری…</div>` : "");
    const A = S.ai;
    if (A.asks.length) {
      h += `<h3 class="sup-h">🚨 پرسش‌های بی‌پاسخ از کارشناسان (${A.asks.length})</h3>
        <div class="tp-scroll" style="margin-bottom:14px"><table class="tp-table"><thead><tr><th>زمان</th><th>کارشناس</th><th>درخواست</th><th class="rt">تأمین‌کننده</th><th class="rt">پرسش</th><th></th></tr></thead><tbody>
        ${A.asks.map((x) => `<tr><td class="num" style="font-size:.8rem">${fmtShort(x.at)}</td><td>${esc(exName(x.expert_id))}</td><td class="num">${esc(x.request_id)}</td>
          <td class="rt">${esc(x.supplier)}</td><td class="rt" style="white-space:normal;max-width:460px">${esc(x.q)}</td><td><button class="tp-btn xs" data-th-open="${x.thread_id}">گفت‌وگو</button></td></tr>`).join("")}</tbody></table></div>`;
    }
    if (A.handovers && A.handovers.length) {
      h += `<h3 class="sup-h">⚠️ واگذار به کارشناس — مهلتِ حداقلِ استعلام گذشت (${A.handovers.length})</h3>
        <div class="tp-scroll" style="margin-bottom:14px"><table class="tp-table"><thead><tr><th>از کِی</th><th>کارشناس</th><th>درخواست</th><th class="rt">اقلامِ کم</th><th></th></tr></thead><tbody>
        ${A.handovers.map((x) => `<tr><td class="num" style="font-size:.8rem">${fmtShort(x.at)}</td><td>${esc(exName(x.expert_id))}</td><td class="num">${esc(x.request_id)}</td>
          <td class="rt" style="white-space:normal;max-width:460px">${x.items.map((i) => `${esc(i.title)} <b>${M(i.have)} از ${M(i.need)}</b>`).join("، ")}</td>
          <td><button class="tp-btn xs" data-asg="${x.assignment_id}">جزئیات</button> <button class="tp-btn xs" data-aiex="${x.expert_id}">داشبورد</button></td></tr>`).join("")}</tbody></table></div>`;
    }
    h += `<div class="tp-scroll"><table class="tp-table" data-stick><thead><tr><th class="rt">کارشناس</th><th>حالت</th><th>کارِ زنده</th><th>همهٔ کارها</th><th>🚨 پرسش</th><th>هزینهٔ مدل</th><th>از کِی</th><th></th></tr></thead><tbody>
      ${A.experts.map((e) => `<tr><td class="rt"><b>${e.senior ? "★ " : ""}${esc(e.label || e.name)}</b>${e.tg ? "" : ` <span class="dim" title="تلگرامِ کارشناس وصل نیست؛ پرسش‌ها فقط در پنلش دیده می‌شوند">(بی تلگرام)</span>`}</td>
        <td><button class="tp-btn xs ${e.on ? "primary" : ""}" data-aitoggle="${e.id}" data-on="${e.on ? 0 : 1}" title="${e.on ? "کلیک: دستی شود" : "کلیک: هوشمند شود"}">${e.on ? "🤖 هوشمند" : "✋ دستی"}</button></td>
        <td class="num">${e.live || 0}</td><td class="num">${e.runs || 0}</td><td class="num">${e.asks ? `<span class="chip warn">🚨 ${e.asks}</span>` : "—"}</td>
        <td class="num" dir="ltr">${e.cost ? `$${Number(e.cost).toFixed(e.cost < 1 ? 4 : 2)}` : "—"}</td>
        <td class="num" style="font-size:.8rem">${e.on && e.on_at ? fmtShort(e.on_at) : "—"}</td>
        <td><button class="tp-btn xs" data-aiex="${e.id}">داشبورد</button></td></tr>`).join("")}</tbody></table></div>
      <p class="dim" style="font-size:.82rem;margin-top:8px">«از کِی»: ارجاع‌هایی که بعد از این لحظه برسند خودکار برداشته می‌شوند؛ قدیمی‌ترها از داشبوردِ همان کارشناس با «▶️ شروع». پیامک فقط به شماره‌هایی می‌رود که تیکِ «پنل» دارند (داشبورد ← دفترچهٔ شماره‌ها). ${A.sms ? "" : "درگاه پیامک (TextBee) وصل نیست — پیامک‌ها شبیه‌سازی می‌شوند."}</p>`;
    return h;
  }
  /* ---------- «⚙️ قواعدِ حداقلِ استعلام» (فاز ۳) ----------
     بازه‌های قیمت واحد، قیمت کل و مقدار با حداقلِ پیشنهادِ تأییدنهایی از تأمین‌کنندگانِ مختلف، و مهلتِ رسیدن به حد — سراسری،
     برای همهٔ کارشناس‌های هوشمند (worker/ai-rules.js). عددها همان‌طور که تایپ شده‌اند می‌روند (رقم فارسی و جداکننده هم). */
  const fmtIn = (v) => (v == null || v === "" ? "" : Number.isFinite(Number(v)) ? Number(v).toLocaleString("en-US") : String(v));
  const draftOf = (r) => ({ ...Object.fromEntries(["unit", "total", "qty"].map((k) => [k, (r[k] || []).map((x) => ({ from: fmtIn(x.from), to: fmtIn(x.to), min: String(x.min) }))])), waitHours: String(r.waitHours) });
  async function loadRules() {
    S.rulesErr = ""; render();
    try { S.rules = await api("/ai/rules"); S.rulesDraft = draftOf(S.rules.rules); } catch (e) { S.rulesErr = e.message; }
    render();
  }
  async function saveRulesUi() {
    S.rulesBusy = true; S.rulesErr = ""; render();
    try {
      const r = await api("/ai/rules", { method: "PUT", body: S.rulesDraft });
      S.rules.rules = r.rules; S.rulesDraft = draftOf(r.rules);
      TP.modal("ذخیره شد", "قواعدِ حداقلِ استعلام ذخیره شد؛ کارهای در حالِ مذاکره همین حالا با آن سنجیده می‌شوند.", null, "باشد", "");
    } catch (e) { S.rulesErr = e.message; }
    S.rulesBusy = false; render();
  }
  function vRules() {
    let h = `<div class="tp-note">کارشناس هوشمند تا هر قلم به این تعداد <b>پیشنهادِ تأییدنهایی از تأمین‌کنندگانِ مختلف</b> نرسد، مذاکره را نمی‌بندد و جدول و نامه نمی‌سازد؛
      استعلام را فقط از خودِ تأمین‌کنندگان می‌گیرد. قیمتِ سنجیدنی بالاترین قیمتی است که برای همان قلم رسیده؛ قیمت کل = همان قیمت واحد × مقدار؛ مقدار = مقدارِ درخواست به واحدِ خودِ قلم.
      حدِ هر قلم بیشترینِ این‌هاست: حدِ پایه و هر بازه‌ای که قلم در آن می‌افتد. بازه از «از» (خودش هم) تا «تا» (خودش نه)؛ «تا»ی خالی یعنی بی سقف.</div>`;
    if (S.rulesErr) h += `<div class="tp-note warn">${esc(S.rulesErr)}</div>`;
    if (!S.rules || !S.rulesDraft) return h + `<div class="empty">در حال بارگذاری…</div>`;
    const R = S.rulesDraft;
    const dims = S.rules.dims || [{ key: "unit", fa: "قیمت واحد", unit: "ریال" }, { key: "total", fa: "قیمت کل", unit: "ریال" }, { key: "qty", fa: "مقدار", unit: "به واحدِ خودِ قلم" }];
    const inp = (d, i, k, w, ph) => `<input class="tp-input num" data-rr="${d}:${i}:${k}" value="${esc(R[d][i][k])}" inputmode="numeric" dir="ltr" style="width:${w}px" ${ph ? `placeholder="${ph}"` : ""}>`;
    h += dims.map((d) => `<div class="tp-card" style="padding:12px 14px;margin:12px 0"><h3 class="sup-h" style="margin-top:0">${esc(d.fa)} <span class="dim">(${esc(d.unit)})</span></h3>
      ${R[d.key].length ? `<table class="sup-tbl" style="width:auto"><thead><tr><th>از</th><th>تا</th><th>حداقلِ استعلام</th><th></th></tr></thead><tbody>
        ${R[d.key].map((r, i) => `<tr><td>${inp(d.key, i, "from", 170, "0")}</td><td>${inp(d.key, i, "to", 170, "بی سقف")}</td><td>${inp(d.key, i, "min", 70, "")}</td>
          <td><button class="tp-btn xs danger" data-rdel="${d.key}:${i}" title="حذفِ این بازه">✕</button></td></tr>`).join("")}</tbody></table>` : `<div class="dim">بازه‌ای نیست — فقط حدِ پایه.</div>`}
      <button class="tp-btn xs" data-radd="${d.key}" style="margin-top:8px">➕ بازهٔ تازه</button></div>`).join("");
    h += `<div class="tp-card" style="padding:12px 14px;margin:12px 0"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <b>مهلتِ رسیدن به حد</b><input class="tp-input num" data-rwait value="${esc(R.waitHours)}" inputmode="numeric" dir="ltr" style="width:90px"> ساعت
        <span class="dim">— از اولین دعوت. اگر قلمی هنوز به حدش نرسیده بود، کارشناس در تلگرام آلارم می‌گیرد تا در «🎯 فهرست دعوت» تأمین‌کنندهٔ بیشتری تیک بزند یا خطِ دستی بیفزاید (۰ یعنی بی مهلت).</span></div>
      <p class="dim" style="margin:8px 0 0">حدِ پایه (همهٔ اقلام): <b>${M(S.rules.base)}</b> — همان «حداقل تأمین‌کننده به ازای هر قلم» در تنظیمات مدیر. مدل و تنظیماتِ مذاکرهٔ هر کارشناس: «داشبورد» همان کارشناس ← «تنظیمات».</p></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button class="tp-btn primary" data-rsave ${S.rulesBusy ? "disabled" : ""}>ذخیرهٔ قواعد</button>
        <button class="tp-btn" data-rreset>برگرداندنِ تغییرها</button>
        <span class="dim">${S.rules.rules.updated_at ? `آخرین تغییر: ${fmtShort(S.rules.rules.updated_at)}` : "هنوز ذخیره نشده — پیش‌فرض: بی بازه، مهلت ۲۴ ساعت"}</span></div>`;
    return h;
  }

  /* ---------- تبِ «🧩 تغییرات اقلام» (طرح «خرید هوشمند، کارشناس ناظر»، فاز ۱) ----------
     برای هر قلمی که کارشناس ساختارش را تأیید کرده یک پیام: چه کسی، کی، و دقیقاً چه چیزی با پیشنهادِ سامانه فرق دارد (نوع قلم،
     لایه‌ها، نرخ‌های تبدیل، 🔒/🔓)؛ «تاریخچه» همهٔ ذخیره‌های همان قلم را نشان می‌دهد (worker/structure.js). */
  const CHG_KIND = { norm: "ذخیرهٔ ساختار", clear: "برداشتنِ ذخیره", revert: "برگشت به فهرست اقلام", freeze: "🤖 سپردن به کارشناس هوشمند (انجماد)" };
  const SUGG_SRC = { catalog: "فهرست اقلام — همین کد", title: "فهرست اقلام — همین عنوان", edit: "ویرایشِ قبلیِ کارشناسان در دیتابیس", cache: "پیشنهادِ مدل (از پیش)", model: "پیشنهادِ مدل" };
  const actorFa = (a) => { const m = /^expert:(\d+)$/.exec(String(a || "")); return m ? exName(m[1]) : a === "support" ? "پشتیبانی" : a === "manager" ? "مدیر" : a || "—"; };
  async function loadChg(more) {
    S.chgLoading = true; S.chgErr = ""; render();
    const qs = new URLSearchParams({ limit: "120" });
    for (const [k, v] of Object.entries(S.chgF)) if (v) qs.set(k, v);
    if (more && S.chgNext != null) qs.set("offset", String(S.chgNext));
    try {
      const r = await api(`/changes?${qs}`);
      S.chg = more && S.chg ? [...S.chg, ...r.items] : r.items; S.chgMore = !!r.more; S.chgNext = r.next;
    } catch (e) { S.chgErr = e.message; }
    S.chgLoading = false; render();
  }
  function vChg() {
    const f = S.chgF;
    let h = `<div class="tp-filters">
      <span class="lab">کارشناس</span><select class="tp-select" data-chgf="expert"><option value="">همه</option>${expertOpts(f.expert)}</select>
      <span class="lab">درخواست</span><input class="tp-input num" data-chgf="rid" value="${esc(f.rid)}" placeholder="شماره" style="width:110px">
      <label class="chkline"><input type="checkbox" data-chgf="changed" ${f.changed ? "checked" : ""}> فقط اقلامِ تغییرکرده</label>
      <label class="chkline"><input type="checkbox" data-chgf="frozen" ${f.frozen ? "checked" : ""}> فقط سپرده‌شده به کارشناس هوشمند</label>
      <span class="end">${S.chg ? `${M(S.chg.length)} قلم${S.chgMore ? "+" : ""}` : ""}${S.chgLoading ? " · در حال بارگذاری…" : ""}</span></div>
      <div class="tp-note">نرمال‌سازی اجباری است و اول از همه: کارشناس ساختارِ هر قلم را می‌بیند، اصلاح یا تأیید می‌کند و کنارِ عنوان، مقدار و هر لایه 🔒 یا 🔓 می‌گذارد.
      برای هر قلم یک پیام می‌آید: ساختارِ تأییدشده دقیقاً در چه با <b>پیشنهادِ سامانه</b> (همان که کارشناس اول دید) فرق دارد. با «بررسی سوابق و سپردن به کارشناس هوشمند»، ساختار منجمد می‌شود (🔒 منجمد).
      «تاریخچه» هر ذخیره را با کنشگر و زمان نشان می‌دهد.</div>`;
    if (S.chgErr) h += `<div class="tp-note warn">${esc(S.chgErr)}</div>`;
    if (!S.chg) return h + (S.chgLoading ? `<div class="empty">در حال بارگذاری…</div>` : "");
    if (!S.chg.length) return h + `<div class="empty"><b>قلمی نیست.</b>${f.changed ? "قلمِ تغییرکرده‌ای با این صافی‌ها نیست؛ تیکِ «فقط اقلامِ تغییرکرده» را بردارید تا همهٔ اقلامِ نرمال‌شده بیایند." : ""}</div>`;
    const lockTxt = (k) => `${k.title ? "🔒" : "🔓"} عنوان · ${k.qty ? "🔒" : "🔓"} مقدار${Object.entries(k.layers || {}).map(([n, v]) => ` · ${v ? "🔒" : "🔓"} ${esc(n)}`).join("")}`;
    h += S.chg.map((x) => `<div class="tp-card" style="padding:12px 16px;margin:10px 0">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><b>${esc(x.title)}</b>
        <span class="chip num">${esc(x.request_id)}</span><span class="dim">${esc(x.party || "")}</span>
        <span style="flex:1"></span>${x.frozen_at ? `<span class="chip info" title="ساختار منجمد شد و به کارشناس هوشمند سپرده شد">🔒 منجمد ${fmtShort(x.frozen_at)}</span>` : ""}
        <span class="dim" style="font-size:.8rem" title="آخرین تأییدِ ساختار">${fmtS(x.norm_at)}</span></div>
      <div class="dim" style="font-size:.85rem;margin:4px 0 6px">کارشناس: ${esc(exName(x.expert_id))}${x.by && x.by !== `expert:${x.expert_id}` ? ` (ذخیره: ${esc(actorFa(x.by))})` : ""} · نوع قلم: <b>${esc(x.head)}</b>${x.qty != null ? ` · مقدار ${M(x.qty)} ${esc(x.unit || "")}` : ""}${x.sugg_source ? ` · پیشنهادِ سامانه از: ${esc(SUGG_SRC[x.sugg_source] || x.sugg_source)}` : ""}</div>
      ${x.lines.length ? `<ul style="margin:0;padding-inline-start:20px;line-height:1.9">${x.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`
        : x.has_sugg ? `<div style="color:#86efac">✓ بی‌تغییر — همان پیشنهادِ سامانه تأیید شد (همه 🔒).</div>`
        : `<div class="dim">پیشنهادِ سامانه برای این قلم ثبت نشده (پیش از این بخش نرمال شده بود).</div>`}
      <div class="dim" style="font-size:.8rem;margin-top:6px">${lockTxt(x.locks)}</div>
      <div style="display:flex;gap:8px;margin-top:8px"><button class="tp-btn xs" data-chglog="${x.id}">تاریخچه (${M(x.changes)})</button><button class="tp-btn xs" data-asg="${x.aid}">جزئیاتِ ارجاع</button></div></div>`).join("");
    if (S.chgMore) h += `<div style="text-align:center;margin:10px 0"><button class="tp-btn sm" data-chgmore>بیشتر…</button></div>`;
    return h;
  }
  async function chgLog(id) {
    const ov = overlay("تاریخچهٔ ساختارِ قلم", `<div class="empty">در حال بارگذاری…</div>`);
    try {
      const r = await api(`/changes/${id}`);
      const it = r.item || {};
      ov.set(`تاریخچهٔ ساختار — ${esc(it.title || "")}`, r.changes.length ? `<div class="tp-scroll"><table class="tp-table"><thead><tr><th>زمان</th><th>کنشگر</th><th>کار</th><th class="rt">تغییرها</th></tr></thead><tbody>
        ${r.changes.map((c) => `<tr><td class="num" style="font-size:.8rem">${fmtS(c.at)}</td><td>${esc(actorFa(c.actor))}</td><td>${esc(CHG_KIND[c.kind] || c.kind)}</td>
          <td class="rt" style="white-space:normal">${c.lines.length ? c.lines.map((l) => `<div>${esc(l)}</div>`).join("") : `<span class="dim">${c.kind === "norm" || c.kind === "freeze" ? "بی‌تغییر" : "—"}</span>`}</td></tr>`).join("")}</tbody></table></div>`
        : `<div class="empty">هنوز تغییری ثبت نشده — این قلم پیش از این بخش نرمال شده بود.</div>`);
    } catch (e) { ov.set("خطا", `<div class="tp-note warn">${esc(e.message)}</div>`); }
  }

  /* ---------- «🏅 رتبه‌بندی و دعوت» (طرح «خرید هوشمند، کارشناس ناظر»، فاز ۲) ----------
     وزن‌های رتبهٔ نهایی (میانگینِ وزنیِ رتبه‌های نسبیِ دفعات، مقدار، گشتاور، ارزش خرید به قیمت روز، و رده) و «قاعدهٔ دعوت»: کدام
     رده‌های سوابقِ عین قلم جدا از رتبه و تا چند نفر، و بعد از آن نوع قلم یا عین قلم — worker/ranking.js. */
  async function loadRank() {
    S.rankErr = ""; render();
    try {
      S.rank = await api("/ai/ranking");
      S.rankDraft = { weights: { ...S.rank.weights }, dispatch: { tier: { ...S.rank.dispatch.tier }, then: S.rank.dispatch.then } };
    } catch (e) { S.rankErr = e.message; }
    render();
  }
  async function saveRankUi() {
    S.rankBusy = true; S.rankErr = ""; render();
    try {
      const r = await api("/ai/ranking", { method: "PUT", body: S.rankDraft });
      S.rank = { ...S.rank, ...r }; S.rankDraft = { weights: { ...r.weights }, dispatch: { tier: { ...r.dispatch.tier }, then: r.dispatch.then } };
      TP.modal("ذخیره شد", "وزن‌ها و قاعدهٔ دعوت ذخیره شد؛ از همین حالا در جدول سوابقِ کارشناسان و نوبتِ پیامک‌های کارشناس هوشمند (کارهای تازه) به کار می‌رود.", null, "باشد", "");
    } catch (e) { S.rankErr = e.message; }
    S.rankBusy = false; render();
  }
  function vRank() {
    let h = `<div class="tp-note"><b>رتبهٔ نهایی</b> هر تأمین‌کننده در سوابق، میانگینِ وزنیِ رتبه‌های نسبیِ او در چهار ستون است — دفعات خرید، مقدار، امتیاز گشتاوری و
      <b>ارزش خرید به قیمت روز</b> (با نرخ دلار) — به‌اضافهٔ ردهٔ او (A صد درصد، B شصت‌وشش، C سی‌وسه، بی‌رده صفر). جدول سوابقِ کارشناسان پیش‌فرض با همین مرتب می‌شود
      و کارشناس هوشمند پیامک‌ها را به همین ترتیب (با «قاعدهٔ دعوت» پایین) می‌فرستد — فقط به شماره‌هایی که تیکِ «پنل» دارند.</div>`;
    if (S.rankErr) h += `<div class="tp-note warn">${esc(S.rankErr)}</div>`;
    if (!S.rank || !S.rankDraft) return h + `<div class="empty">در حال بارگذاری…</div>`;
    const W = S.rankDraft.weights, D = S.rankDraft.dispatch, fa = S.rank.fa || {}, tf = S.rank.then_fa || {};
    const inp = (attr, v, w = 80) => `<input class="tp-input num" ${attr} value="${esc(v)}" inputmode="decimal" dir="ltr" style="width:${w}px">`;
    h += `<div class="tp-card" style="padding:12px 14px;margin:12px 0"><h3 class="sup-h" style="margin-top:0">وزن‌های رتبهٔ نهایی <span class="dim">(۰ تا ۱۰؛ صفر یعنی آن ستون اثری ندارد)</span></h3>
      <table class="sup-tbl" style="width:auto"><tbody>${Object.keys(fa).map((k) => `<tr><td>${esc(fa[k])}</td><td>${inp(`data-rw="${k}"`, W[k])}</td></tr>`).join("")}
        <tr><td>ضریب گشتاور <span class="dim">(۱ تا ۱۰ — ۱: گذشتهٔ دور تقریباً هم‌وزنِ امروز، ۱۰: فقط خریدهای تازه)</span></td><td>${inp(`data-rw="k"`, W.k, 60)}</td></tr></tbody></table></div>
      <div class="tp-card" style="padding:12px 14px;margin:12px 0"><h3 class="sup-h" style="margin-top:0">قاعدهٔ دعوت</h3>
      <p style="margin:0 0 6px"><b>۱.</b> از سوابقِ <b>«عین قلم»</b>، جدا از رتبهٔ نهایی، این رده‌ها اول دعوت می‌شوند (درونِ هر رده به ترتیبِ رتبهٔ نهایی؛ ۰ یعنی آن رده جدا نمی‌آید):</p>
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin:0 0 10px">${["A", "B", "C"].map((g) => `<label>ردهٔ <b>${g}</b> تا ${inp(`data-rt="${g}"`, D.tier[g], 60)} نفر</label>`).join("")}</div>
      <p style="margin:0 0 6px"><b>۲.</b> بعد از آن:</p>
      ${Object.entries(tf).map(([k, l]) => `<label class="chkline" style="display:flex;margin:3px 0"><input type="radio" name="rthen" data-rthen="${k}" ${D.then === k ? "checked" : ""}> ${esc(l)}</label>`).join("")}
      <p class="dim" style="margin:8px 0 0"><b>۳.</b> پنج نفر اولِ این ترتیب در «🎯 فهرست دعوت»ِ هر قلم از پیش تیک می‌خورند؛ کارشناس (بسته به حالتِ نوع قلم در «🧭 حالت اقلام») کم و زیادشان می‌کند و از «جستجوی هوشمند» فقط با انتخابِ خودش می‌افزاید.
        سقفِ تیکِ هر قلم و مدلِ مذاکره: داشبوردِ همان کارشناس ← «تنظیمات». قاعدهٔ تازه برای فهرست‌هایی است که از این پس ساخته می‌شوند («↻ بازسازی» فهرستِ سپرده‌نشده را تازه می‌کند).</p></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button class="tp-btn primary" data-rksave ${S.rankBusy ? "disabled" : ""}>ذخیرهٔ وزن‌ها و قاعده</button>
        <button class="tp-btn" data-rkreset>برگرداندنِ تغییرها</button>
        <span class="dim">${S.rank.updated_at ? `آخرین تغییر: ${fmtShort(S.rank.updated_at)}` : "هنوز ذخیره نشده — پیش‌فرض: دفعات ۱، مقدار ۰، گشتاور ۱، ارزش ۱، رده ۱، ضریب گشتاور ۵؛ ردهٔ A عین قلم تا ۵ نفر، بعد نوع قلم"}</span></div>`;
    return h;
  }

  /* ---------- «🎛 کلیدها» (طرح «خرید هوشمند، کارشناس ناظر»، فاز ۴) ----------
     خوانش هوشمند پیش‌فاکتور (worker/switches.js): خاموش (پیش‌فرض) — پیش‌فاکتور را سامانه از فیلدهای تأمین‌کننده می‌سازد و بسته بعد از
     بررسی یکراست «تأیید نهایی» می‌شود؛ روشن — همان مسیرِ پیشین: تأیید مشخصات، بارگذاری پیش‌فاکتور، خوانش هوشمند و جدول تطابق. */
  async function loadSw() {
    S.swErr = ""; render();
    try { S.sw = await api("/ai/switches"); } catch (e) { S.swErr = e.message; }
    render();
  }
  function swToggle(on) {
    const go = async () => {
      S.swBusy = true; S.swErr = ""; render();
      try { const r = await api("/ai/switches", { method: "PUT", body: { pfRead: on } }); S.sw = { ...S.sw, ...r }; } catch (e) { S.swErr = e.message; }
      S.swBusy = false; render();
    };
    TP.modal(on ? "روشن کردنِ خوانش هوشمند پیش‌فاکتور" : "خاموش کردنِ خوانش هوشمند پیش‌فاکتور", on
      ? "از این پس تأمین‌کننده بعد از «تأیید مشخصات» پیش‌فاکتورِ خودش را بارگذاری می‌کند، مدل آن را می‌خواند و جدول تطابق می‌سازد و «تأیید نهایی» با مقدارهای همان سند است (مسیرِ پیشین). بسته‌های فرستاده‌شده همان‌جا که هستند می‌مانند."
      : "از این پس پیش‌فاکتور را سامانه از همان فیلدهای تأمین‌کننده می‌سازد (Word و پیش‌نمایش)، «تأیید» همان «تأیید نهایی» است و هیچ سندی خوانده نمی‌شود. بسته‌های در راه (تأییدشده یا با پیش‌فاکتور) هم مستقیم تأیید نهایی می‌شوند.",
      go, on ? "روشن شود" : "خاموش شود", "انصراف");
  }
  function vSw() {
    let h = `<div class="tp-note">کلیدهای سراسریِ مسیرِ خرید — برای همهٔ کارشناسان، کارشناس هوشمند، پنل تأمین‌کننده و بات‌ها، همان لحظه (تا یک دقیقه).</div>`;
    if (S.swErr) h += `<div class="tp-note warn">${esc(S.swErr)}</div>`;
    if (!S.sw) return h + `<div class="empty">در حال بارگذاری…</div>`;
    const on = !!S.sw.pfRead;
    h += `<div class="tp-card" style="padding:12px 14px;margin:12px 0"><h3 class="sup-h" style="margin-top:0">📄 خوانش هوشمند پیش‌فاکتور
        <span class="chip ${on ? "info" : "ok"}" style="margin-inline-start:8px">${on ? "روشن" : "خاموش (پیش‌فرض)"}</span></h3>
      <p style="margin:0 0 8px;line-height:1.9">${esc((S.sw.fa && S.sw.fa.pfRead) || "")}</p>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <button class="tp-btn ${on ? "" : "primary"}" data-swtoggle data-on="0" ${!on || S.swBusy ? "disabled" : ""}>⏹ خاموش — پیش‌فاکتورِ سامانه</button>
        <button class="tp-btn ${on ? "primary" : ""}" data-swtoggle data-on="1" ${on || S.swBusy ? "disabled" : ""}>▶️ روشن — خوانش پیش‌فاکتورِ تأمین‌کننده</button>
        <span class="dim">${S.sw.updated_at ? `آخرین تغییر: ${fmtShort(S.sw.updated_at)}` : "هنوز عوض نشده — پیش‌فرض خاموش"}</span></div></div>`;
    return h;
  }

  /* ---------- «🧭 حالت اقلام» (طرح «خرید هوشمند، کارشناس ناظر»، فاز ۴ب) ----------
     حالتِ هر نوع قلم برای کارشناس هوشمند — سپردن یا برگشت / انتخاب کارشناس / مستقیم — و «حالت تأیید مجاز»؛ نوع قلمِ نام‌نبرده «انتخاب
     کارشناس» است. هر قلمِ درخواست با حالتِ نوعِ خودش جلو می‌رود (worker/ai-modes.js). */
  const MD_HELP = {
    handoff: "بعد از بررسی سوابق، کارشناس فقط به کارشناس هوشمند می‌سپارد، یا با توضیح به مدیر برمی‌گرداند تا دستی شود.",
    pick: "کارشناس تأمین‌کنندگان را کم و زیاد می‌کند (برداشتنِ پنج نفر اول با توضیح) و «شروع» را می‌زند؛ مکاتبهٔ مستقیم ندارد.",
    direct: "کارشناس خودش مکاتبه می‌کند، یا به انتخابِ خودش می‌سپارد — بی توضیح و بی اجازه؛ مدیر هم بی توضیح دستی‌اش می‌کند.",
  };
  const mdDraftOf = (heads) => Object.entries(heads || {}).map(([head, v]) => ({ head, mode: v.mode, supervise: !!v.supervise }));
  async function loadMd() {
    S.mdErr = ""; render();
    try { S.md = await api("/ai/modes"); S.mdDraft = mdDraftOf(S.md.heads); } catch (e) { S.mdErr = e.message; }
    render();
  }
  async function saveMdUi() {
    S.mdBusy = true; S.mdErr = ""; render();
    try {
      const heads = {}; for (const x of S.mdDraft) heads[x.head] = { mode: x.mode, supervise: x.supervise };
      const r = await api("/ai/modes", { method: "PUT", body: { heads } });
      S.md = { ...S.md, ...r }; S.mdDraft = mdDraftOf(r.heads);
      TP.modal("ذخیره شد", "حالتِ اقلام ذخیره شد؛ از همین حالا (تا یک دقیقه) در ارجاع‌ها و سپردن‌های تازه به کار می‌رود. کارِ سپرده‌شده عوض نمی‌شود.", null, "باشد", "");
    } catch (e) { S.mdErr = e.message; }
    S.mdBusy = false; render();
  }
  let mdTimer = null;
  function mdSearch(q) {
    S.mdQ = q;
    clearTimeout(mdTimer);
    mdTimer = setTimeout(async () => {
      if (!q.trim()) { S.mdHits = []; return render(); }
      try { S.mdHits = (await api(`/ai/heads?q=${encodeURIComponent(q.trim())}`)).heads || []; } catch (_) { S.mdHits = []; }
      const inp = document.querySelector("[data-mdq]"); const pos = inp ? inp.selectionStart : null;
      render();
      const again = document.querySelector("[data-mdq]"); if (again) { again.focus(); if (pos != null) again.setSelectionRange(pos, pos); }
    }, 250);
  }
  function vMd() {
    let h = `<div class="tp-note">هر قلمِ درخواست با حالتِ <b>نوع قلمِ</b> خودش جلو می‌رود و کارشناس کارتِ هر قلم را جدا پیش می‌برد. نوع قلمی که این‌جا نیامده
      «<b>انتخاب کارشناس</b>» است و حالت تأیید ندارد. «حالت تأیید مجاز» یعنی مدیر می‌تواند به کارشناس اجازه دهد پیام‌ها و تصمیم‌های کارشناس هوشمند پیش از رفتن به تأییدش برسد
      (یا کارشناس پیش از شروع با توضیح بخواهد).</div>`;
    if (S.mdErr) h += `<div class="tp-note warn">${esc(S.mdErr)}</div>`;
    if (!S.md || !S.mdDraft) return h + `<div class="empty">در حال بارگذاری…</div>`;
    const fa = S.md.fa || {};
    h += `<div class="tp-card" style="padding:12px 14px;margin:12px 0"><h3 class="sup-h" style="margin-top:0">حالت‌ها</h3>
      <table class="sup-tbl" style="width:auto"><tbody>${Object.keys(MD_HELP).map((k) => `<tr><td><b>${esc(fa[k] || k)}</b></td><td class="dim" style="white-space:normal">${esc(MD_HELP[k])}</td></tr>`).join("")}</tbody></table></div>`;
    const have = new Set(S.mdDraft.map((x) => x.head));
    h += `<div class="tp-card" style="padding:12px 14px;margin:12px 0"><h3 class="sup-h" style="margin-top:0">افزودنِ نوع قلم</h3>
      <input class="tp-input" data-mdq value="${esc(S.mdQ)}" placeholder="بخشی از نامِ نوع قلم، مثلاً دستکش" style="width:min(360px,100%)">
      ${S.mdHits.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${S.mdHits.map((x) => `<button class="tp-btn xs" data-mdadd="${esc(x)}" ${have.has(x) ? "disabled" : ""}>${have.has(x) ? "✓ " : "➕ "}${esc(x)}</button>`).join("")}</div>`
        : S.mdQ.trim() ? `<div class="dim" style="margin-top:6px">نوع قلمی با این نام در فهرست اقلام نیست.</div>` : ""}</div>`;
    h += `<div class="tp-card" style="padding:12px 14px;margin:12px 0"><h3 class="sup-h" style="margin-top:0">نوع قلم‌های تعیین‌شده (${M(S.mdDraft.length)})</h3>`;
    h += S.mdDraft.length ? `<div class="tp-scroll"><table class="tp-table"><thead><tr><th class="rt">نوع قلم</th><th>حالت</th><th>حالت تأیید مجاز</th><th></th></tr></thead><tbody>
      ${S.mdDraft.map((x, i) => `<tr><td class="rt">${esc(x.head)}</td>
        <td><select class="tp-select" data-mdmode="${i}">${Object.keys(MD_HELP).map((k) => `<option value="${k}" ${x.mode === k ? "selected" : ""}>${esc(fa[k] || k)}</option>`).join("")}</select></td>
        <td><label class="chkline"><input type="checkbox" data-mdsup="${i}" ${x.supervise ? "checked" : ""}> مجاز</label></td>
        <td><button class="tp-btn xs danger" data-mddel="${i}" title="برداشتن — همان پیش‌فرض">✕</button></td></tr>`).join("")}</tbody></table></div>`
      : `<div class="dim">هنوز نوع قلمی تعیین نشده — همه «انتخاب کارشناس»اند.</div>`;
    h += `</div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button class="tp-btn primary" data-mdsave ${S.mdBusy ? "disabled" : ""}>ذخیرهٔ حالتِ اقلام</button>
      <button class="tp-btn" data-mdreset>برگرداندنِ تغییرها</button><span class="dim">${S.md.updated_at ? `آخرین تغییر: ${fmtShort(S.md.updated_at)}` : "هنوز ذخیره نشده"}</span></div>`;
    return h;
  }

  /* ---------- «💵 نرخ دلار» (طرح «خرید هوشمند، کارشناس ناظر»، مهر ۱۴۰۵) ----------
     پایهٔ «قیمت روز»ِ سوابق و رتبهٔ «ارزش خرید»: نرخ هر روز از کانال عمومی «قیمت لحظه‌ای دلار تهران» (ربات روزانه از ۶ صبح)،
     از فایل اکسلِ همان ربات یا دستی؛ روزهای بی‌معامله با درون‌یابیِ خطی (worker/usd.js). */
  const USD_SRC = { excel: ["فایل", ""], bot: ["کانال", "ok"], manual: ["دستی", "warn"], interp: ["درون‌یابی", ""] };
  const USD_HOW = { summary: "پیام «پایان معاملات»", last_trade: "آخرین «معامله شد» (پیام پایانی عدد نداشت)", last_trade_no_marker: "آخرین «معامله شد» روز", last_trade_fix: "آخرین «معامله شد» (عدد پیام پایانی اشتباه بود)" };
  const wdOf = (j) => { const ms = TP.jStr2ms(j); return ms ? TP.WD[new Date(ms).getDay()] : ""; };
  async function loadUsd() {
    S.usdLoading = true; S.usdErr = ""; render();
    try { S.usd = await api("/usd?days=60"); } catch (e) { S.usdErr = e.message; }
    S.usdLoading = false; render();
  }
  function vUsd() {
    let h = `<div class="tp-note">«قیمت روز»ِ سوابق خرید با نسبتِ <b>نرخ دلارِ امروز به نرخِ روزِ خرید</b> حساب می‌شود و رتبهٔ «ارزش خرید» هم بر همین پایه است
      (تیکِ «مرکز آمار» در سوابق، تعدیلِ فصلیِ زمستان ۱۴۰۴ را نشان می‌دهد). نرخ هر روز از کانال عمومی «قیمت لحظه‌ای دلار تهران» خوانده می‌شود:
      روزی یک بار، ساعت ۶:۰۳ صبح، نرخِ پایانیِ دیروز (عدد «آخرین معامله»ٔ پیام «پایان معاملات»؛ اگر عدد نداشت، آخرین «معامله شد»ِ فردایی پیش از آن)؛ روزی که نشد، صبحِ بعد همراهِ دیروز.
      روزهای بی‌معامله (جمعه، تعطیل) با درون‌یابیِ خطی بین روزِ قبل و بعد پر می‌شوند.</div>`;
    if (S.usdErr) h += `<div class="tp-note warn">${esc(S.usdErr)}</div>`;
    const U = S.usd;
    if (!U) return h + (S.usdLoading ? `<div class="empty">در حال بارگذاری…</div>` : "");
    const L = U.latest, last = U.bot.runs[0];
    const chip = (src) => { const c = USD_SRC[src] || [src, ""]; return `<span class="chip ${c[1]}">${c[0]}</span>`; };
    h += `<div class="tp-card" style="padding:12px 16px;margin:10px 0;display:flex;gap:18px;flex-wrap:wrap;align-items:center">
      <div><div class="dim" style="font-size:.8rem">آخرین نرخ</div><div style="font-size:1.35rem;font-weight:700" class="num">${L ? M(L.rate) : "—"} <span class="dim" style="font-size:.85rem">ریال</span></div>
        <div class="dim" style="font-size:.82rem">${L ? `${esc(wdOf(L.jday))} ${esc(L.jday)} ${chip(L.src)}` : "هنوز نرخی نیست — فایل نرخ‌ها را بارگذاری کنید"}</div></div>
      <div><div class="dim" style="font-size:.8rem">روزهای ثبت‌شده</div><div class="num"><b>${M(U.count)}</b> روز <span class="dim">(${M(U.real)} نرخِ واقعی، ${M(U.count - U.real)} درون‌یابی)</span></div>
        <div class="dim" style="font-size:.82rem">${U.first ? `از ${esc(U.first)} تا ${esc(U.last)}` : ""}</div></div>
      <div><div class="dim" style="font-size:.8rem">ربات روزانه</div><div>${last ? `آخرین اجرا ${fmtShort(last.at)}` : "هنوز اجرا نشده"}</div>
        <div class="dim" style="font-size:.82rem">${last ? (last.error ? `⚠️ ${esc(last.error)}` : last.found.length ? `ثبت: ${last.found.map((x) => esc(x.jday)).join("، ")}` : last.failed.length ? `هنوز نیامده: ${last.failed.map(esc).join("، ")}` : "چیزِ تازه‌ای نبود") : `روزی یک بار، ساعت ${esc(U.bot.time || "6:03")} صبح — روزِ جاافتاده صبحِ بعد خوانده می‌شود`}</div></div>
      <span style="flex:1"></span>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="tp-btn sm" data-usdfetch>🔄 خواندن از کانال</button>
        <label class="tp-btn sm" style="cursor:pointer">📤 بارگذاری فایل نرخ‌ها<input type="file" accept=".xlsx,.xls" data-usdfile hidden></label>
        <button class="tp-btn sm" data-usdman>✏️ نرخ دستیِ یک روز</button></div></div>`;
    if (U.rows.length) {
      h += `<h3 class="sup-h">${M(U.rows.length)} روزِ آخر</h3><div class="tp-scroll"><table class="tp-table" data-stick><thead><tr><th>روز</th><th class="c">نرخ دلار (ریال)</th><th>منبع</th><th class="rt">مأخذ</th></tr></thead><tbody>
        ${U.rows.map((r) => `<tr${r.src === "interp" ? ` class="dim"` : ""}><td class="num">${esc(wdOf(r.jday))} ${esc(r.jday)}</td><td class="c num">${M(r.rate)}</td><td>${chip(r.src)}</td>
          <td class="rt" style="font-size:.8rem">${r.src === "bot" && r.ref ? `<a href="https://${esc(r.ref)}" target="_blank" rel="noopener" dir="ltr">${esc(r.ref)}</a>` : r.src === "interp" ? `بینِ ${esc(String(r.ref || "").replace("~", " و "))}` : esc(r.ref || "")}</td></tr>`).join("")}</tbody></table></div>`;
    }
    if (U.bot.runs.length) {
      h += `<h3 class="sup-h">اجراهای ربات</h3><div class="tp-scroll"><table class="tp-table"><thead><tr><th>زمان</th><th class="rt">نتیجه</th><th class="c">درخواست به کانال</th></tr></thead><tbody>
        ${U.bot.runs.map((r) => `<tr><td class="num" style="font-size:.8rem">${fmtShort(r.at)}</td><td class="rt" style="white-space:normal">
          ${r.found.map((x) => `<div>✓ ${esc(x.jday)}: <b class="num">${M(x.rate)}</b> — ${esc(USD_HOW[x.how] || x.how)}${x.note ? ` <span class="dim">(${esc(x.note)})</span>` : ""}</div>`).join("")}
          ${r.none.length ? `<div class="dim">بی‌معامله: ${r.none.map(esc).join("، ")}</div>` : ""}${r.failed.length ? `<div>⏳ هنوز نیامده: ${r.failed.map(esc).join("، ")}</div>` : ""}${r.error ? `<div>⚠️ ${esc(r.error)}</div>` : ""}</td>
          <td class="c num">${M(r.requests)}</td></tr>`).join("")}</tbody></table></div>`;
    }
    return h;
  }
  async function usdFetch() {
    const b = TP.busy("خواندن از کانال…", "نرخ دلارِ روزهای جاافتاده");
    try {
      const r = (await api("/usd/fetch", { method: "POST" })).usd || {};
      const msg = r.state === "upToDate" ? `نرخ‌ها به‌روزند (آخرین روز: ${esc(r.last)}).` : r.state === "empty" ? esc(r.note || "")
        : (r.found && r.found.length ? `ثبت شد: ${r.found.map((x) => `${esc(x.jday)} ← ${M(x.rate)} ریال`).join("، ")}` : "نرخِ تازه‌ای پیدا نشد.")
          + (r.none && r.none.length ? `<br>بی‌معامله: ${r.none.map(esc).join("، ")}` : "") + (r.failed && r.failed.length ? `<br>هنوز نیامده: ${r.failed.map(esc).join("، ")}` : "")
          + (r.error ? `<br>⚠️ ${esc(r.error)}` : "");
      b.close();
      TP.modal("نرخ دلار", msg, null, "باشد", "");
      await loadUsd();
    } catch (e) { b.close(); TP.modal("نشد", esc(e.message), null, "باشد", ""); }
  }
  /** کتابخانهٔ اکسل فقط وقتِ بارگذاری (۹۰۰ کیلوبایت) */
  function ensureXlsx() {
    if (window.XLSX) return Promise.resolve();
    return new Promise((ok, no) => { const sc = document.createElement("script"); sc.src = "vendor/xlsx.full.min.js"; sc.onload = ok; sc.onerror = () => no(new Error("کتابخانهٔ اکسل بار نشد.")); document.head.appendChild(sc); });
  }
  /** فایلِ ربات نرخ دلار: برگهٔ «نرخ دلار» با «سال | ماه | روز | نرخ دلار (ریال)»؛ اگر سرستون «تومان» بگوید ×۱۰ */
  async function usdUpload(file) {
    const b = TP.busy("بارگذاری نرخ‌ها…", esc(file.name));
    const num = (v) => { const x = Number(digits(String(v == null ? "" : v)).replace(/[,٬\s]/g, "")); return Number.isFinite(x) ? x : null; };
    try {
      await ensureXlsx();
      const wb = window.XLSX.read(await file.arrayBuffer());
      const sheets = wb.SheetNames.map((name) => ({ name, rows: window.XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null }) }));
      const head = (sh) => String((sh.rows[0] || [])[3] || "");
      const sh = sheets.find((x) => /ریال/.test(head(x))) || sheets.find((x) => x.name === "نرخ دلار") || sheets[0];
      const k = sh && /تومان/.test(head(sh)) ? 10 : 1;
      const rows = [];
      for (const r of (sh ? sh.rows : [])) {
        const y = num(r[0]), m = num(r[1]), d = num(r[2]), v = num(r[3]);
        if (y >= 1300 && y <= 1500 && m >= 1 && m <= 12 && d >= 1 && d <= 31 && v > 0) rows.push({ jday: `${y}/${p2(m)}/${p2(d)}`, rate: Math.round(v * k) });
      }
      if (!rows.length) throw new Error("ردیفی با «سال، ماه، روز و نرخ دلار (ریال)» پیدا نشد.");
      let written = 0, bad = 0;
      for (let i = 0; i < rows.length; i += 300) {
        b.set(`${esc(file.name)}<br>${M(Math.min(i + 300, rows.length))} از ${M(rows.length)} روز…`);
        const r = await api("/usd/rows", { body: { rows: rows.slice(i, i + 300), file: file.name } });
        written += r.written || 0; bad += r.bad || 0;
      }
      b.close();
      TP.modal("بارگذاری شد", `${M(written)} روز ثبت شد${bad ? `؛ ${M(bad)} ردیفِ نامعتبر کنار گذاشته شد` : ""}. روزهای خالیِ میانِ آن‌ها با درون‌یابی پر شد.`, null, "باشد", "");
      await loadUsd();
    } catch (e) { b.close(); TP.modal("نشد", esc(e.message), null, "باشد", ""); }
  }
  function usdManual() {
    const d = TP.modal("✏️ نرخ دستیِ یک روز", `<div style="display:flex;flex-direction:column;gap:8px">
        <label>روز (شمسی)<input class="tp-input" data-um="jday" placeholder="1405/07/13" dir="ltr"></label>
        <label>نرخ دلار (ریال)<input class="tp-input num" data-um="rate" inputmode="numeric" dir="ltr"></label>
        <span class="dim" style="font-size:.85rem">نرخ را خالی بگذارید تا نرخِ آن روز برداشته شود (با درون‌یابی پر می‌شود).</span></div>`, async () => {
      const g = (k) => digits(d.querySelector(`[data-um="${k}"]`).value).trim();
      try {
        const r = await api("/usd/rows", { body: { rows: [{ jday: g("jday"), rate: g("rate").replace(/[,٬\s]/g, "") || null }], src: "manual" } });
        if (!r.written) throw new Error("روز یا نرخ نامعتبر است (نرخ به ریال، مثلاً ۲٬۶۹۴٬۰۰۰).");
        await loadUsd();
      } catch (e) { TP.modal("نشد", esc(e.message), null, "باشد", ""); }
    }, "ثبت");
  }

  /* ---------- تبِ «📥 تحویل‌های هوشمند» (فاز ۳) ----------
     هر کاری که کارشناس هوشمند تمام کرد — جدول کمیسیون، برگهٔ درخواست خرید و نامه — این‌جا اعلام می‌شود؛ پشتیبانی می‌بیند و
     کمیسیون را تأیید یا (با دلیل) رد می‌کند. تأیید همان تیکِ «تأیید کمیسیون» همهٔ اقلامِ درخواست است؛ رد درخواست را کامل به
     کارشناس برمی‌گرداند (worker/ai-agent.js:reviewDelivery). */
  async function loadDls() {
    S.dlLoading = true; S.dlErr = ""; render();
    try { S.dl = (await api(`/ai/deliveries${S.dlF.state ? `?state=${S.dlF.state}` : ""}`)).deliveries || []; } catch (e) { S.dlErr = e.message; }
    S.dlLoading = false; render();
  }
  async function loadDl(id) {
    S.dlId = id; S.dlD = null; S.dlDErr = ""; render();
    try { S.dlD = await api(`/ai/deliveries/${id}`); } catch (e) { S.dlDErr = e.message; }
    render();
  }
  const REV_CHIP = { new: `<span class="chip warn">🆕 منتظرِ بررسی</span>`, ok: `<span class="chip ok">✓ کمیسیون تأیید شد</span>`, rejected: `<span class="chip bad">✗ رد شد</span>` };
  function vDl() {
    if (S.dlId) return vDlOne();
    let h = `<div class="tp-filters"><span class="lab">نمایش</span><select class="tp-select" data-dlf="state">${[["new", "منتظرِ بررسی"], ["ok", "تأییدشده"], ["rejected", "ردشده"], ["", "همه"]].map(([k, l]) => `<option value="${k}" ${S.dlF.state === k ? "selected" : ""}>${l}</option>`).join("")}</select>
      <span class="end">${S.dl ? `${S.dl.length} تحویل` : ""}${S.dlLoading ? " · در حال بارگذاری…" : ""}</span></div>
      <div class="tp-note">هر کاری که کارشناس هوشمند تمام می‌کند — جدول کمیسیون، برگهٔ درخواست خرید و نامه — این‌جا می‌آید. بازش کنید، اسناد را ببینید و کمیسیون را تأیید یا با دلیل رد کنید.
      تأیید همان تیکِ «تأیید کمیسیون» همهٔ اقلامِ آن درخواست است (کارشناس در تلگرام خبردار می‌شود و «خاتمه» را می‌زند)؛ رد، درخواست را کامل به کارشناس برمی‌گرداند.</div>`;
    if (S.dlErr) h += `<div class="tp-note warn">${esc(S.dlErr)}</div>`;
    if (!S.dl) return h + (S.dlLoading ? `<div class="empty">در حال بارگذاری…</div>` : "");
    if (!S.dl.length) return h + `<div class="empty"><b>تحویلی نیست.</b>${S.dlF.state === "new" ? "تحویلِ بررسی‌نشده‌ای نمانده." : ""}</div>`;
    h += `<div class="tp-scroll"><table class="tp-table" data-stick><thead><tr><th>وضعیت</th><th>درخواست</th><th class="rt">طرف مقابل</th><th>کارشناس</th><th>اقلام</th><th>پیشنهادِ نهایی</th><th>جدول کمیسیون</th><th>تحویل</th><th></th></tr></thead><tbody>
      ${S.dl.map((x) => `<tr class="rowlink" data-dlopen="${x.id}"><td>${REV_CHIP[x.review.state] || "—"}${x.short.length ? ` <span class="chip warn" title="${esc(x.short.map((c) => `${c.title}: ${c.have} از ${c.need}`).join("، "))}">⚠️ کمتر از حد</span>` : ""}</td>
        <td class="id num">${esc(x.request_id)}</td><td class="party">${esc(x.party)}</td><td>${esc(exName(x.expert_id))}</td>
        <td class="num">${M(x.items)}${x.ok_items ? ` <span class="dim">(${M(x.ok_items)} تأییدشده)</span>` : ""}</td><td class="num">${M(x.finals)}</td>
        <td class="num">${x.commission_no ? `TSA-PS-FO-${x.commission_no}` : "—"}</td><td class="num" style="font-size:.8rem">${fmtShort(x.review.at || x.finished_at)}</td>
        <td><button class="tp-btn xs primary" data-dlopen="${x.id}">بررسی</button></td></tr>`).join("")}</tbody></table></div>`;
    return h;
  }
  function vDlOne() {
    const D = S.dlD;
    let h = `<div style="display:flex;gap:10px;align-items:center;margin-bottom:8px"><button class="tp-btn sm" data-dlback>→ همهٔ تحویل‌ها</button>${D ? REV_CHIP[D.run.review.state] || "" : ""}</div>`;
    if (S.dlDErr) return h + `<div class="tp-note warn">${esc(S.dlDErr)}</div>`;
    if (!D) return h + `<div class="empty">در حال بارگذاری…</div>`;
    const r = D.request, rv = D.run.review || {}, aid = D.run.assignment_id, rid = r.id;
    h += `<div class="tp-card" style="padding:14px 16px"><h2 style="margin:0 0 6px">درخواست <span class="num">${esc(rid)}</span> — ${esc(r.party || "")}</h2>
      <div class="dim">کارشناس: ${esc(r.expert)} (🤖 کارشناس هوشمند) · تحویل: ${fmtS(rv.at)}${r.commission_no ? ` · جدول کمیسیون TSA-PS-FO-${r.commission_no}` : ""}${D.why ? ` · پایانِ مذاکره: ${esc(D.why)}` : ""}</div>
      ${rv.state === "rejected" ? `<div class="tp-note warn">✗ ${fmtS(rv.decided_at)} رد شد: ${esc(rv.reason || "")}</div>` : rv.state === "ok" ? `<div class="tp-note">✓ ${fmtS(rv.decided_at)} کمیسیون تأیید شد.</div>` : ""}
      ${D.short.length ? `<div class="tp-note warn">⚠️ کمتر از حداقلِ استعلام: ${D.short.map((c) => `${esc(c.title)} — ${M(c.have)} از ${M(c.need)}`).join("، ")}</div>` : ""}
      ${D.run.handover ? `<div class="tp-note warn">⚠️ ${fmtS(D.run.handover.at)} مهلتِ ${M(D.run.handover.hours)} ساعتهٔ حدِ استعلام گذشت و کار برای استعلامِ بیشتر به کارشناس هم واگذار شد.</div>` : ""}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
        <button class="tp-btn sm" data-cmprev="${aid}">👁 جدول کمیسیون</button>
        <button class="tp-btn sm" data-cmdl="${aid}" data-rid="${esc(rid)}">⬇️ جدول (Excel)</button>
        <button class="tp-btn sm" data-dlrq="${aid}">👁 برگهٔ درخواست خرید</button>
        <button class="tp-btn sm" data-dlrqf="${aid}" data-rid="${esc(rid)}">⬇️ درخواست خرید (Word)</button>
        ${D.letter && D.letter.file ? `<button class="tp-btn sm" data-dlletter="${aid}" data-rid="${esc(rid)}">⬇️ نامه (Word)</button>` : ""}
        ${D.run.md ? `<button class="tp-btn sm" data-dlmd="${D.run.id}" data-ex-id="${D.run.expert_id}" data-rid="${esc(rid)}">📝 پروندهٔ مذاکره</button>` : ""}
        <button class="tp-btn sm" data-asg="${aid}">جزئیاتِ ارجاع</button>
        <button class="tp-btn sm" data-goto="chat" data-rid="${esc(rid)}">💬 مکاتبات</button></div></div>`;
    h += `<h3 class="sup-h">اقلام و پیشنهادهای تأییدنهایی‌شده</h3><div class="tp-scroll"><table class="sup-tbl"><thead><tr><th>قلم</th><th class="c">مقدار</th><th class="c">حداقلِ استعلام</th><th>تأمین‌کننده</th><th class="c">قیمت واحد (ریال)</th><th class="c">تحویل</th><th class="c">تسویه</th><th class="c">تأیید کمیسیون</th></tr></thead><tbody>
      ${D.items.map((i) => { const qs = i.quotes.length ? i.quotes : [null]; return qs.map((q, k) => `<tr>${k ? "" : `<td rowspan="${qs.length}">${esc(i.title)}${i.state !== "open" ? ` <span class="dim">(${esc(i.state)})</span>` : ""}</td>
        <td class="c num" rowspan="${qs.length}">${i.qty == null ? "" : M(i.qty)} ${esc(i.unit || "")}</td>
        <td class="c" rowspan="${qs.length}" title="${esc(i.cover ? i.cover.why : "")}">${i.cover ? `${M(i.cover.have)} از ${M(i.cover.need)}${i.cover.have < i.cover.need ? " ⚠️" : " ✓"}` : "—"}</td>`}
        <td>${q ? `${esc(q.supplier_name)}${q.source === "ai" ? " 🤖" : ""}` : `<span class="dim">پیشنهادِ نهایی ندارد</span>`}</td>
        <td class="c num">${q && q.price != null ? M(q.price) : "—"}</td><td class="c">${q ? esc(q.dtime || "—") : ""}</td><td class="c">${q ? esc(q.pay || "—") : ""}</td>
        ${k ? "" : `<td class="c" rowspan="${qs.length}">${i.commission_ok ? `<span class="ok-mark">✓</span>` : "—"}</td>`}</tr>`).join(""); }).join("")}</tbody></table></div>`;
    const rep = D.report;
    if (rep) h += `<h3 class="sup-h">شرحِ کارِ کارشناس هوشمند</h3><div class="tp-card" style="padding:12px 16px;line-height:1.9">${esc(rep.narrative || "")}
      ${rep.criteria && rep.criteria.length ? `<h4 class="sup-h">معیارهای انتخاب</h4><ul>${rep.criteria.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      ${rep.challenges && rep.challenges.length ? `<h4 class="sup-h">چالش‌ها</h4><ul>${rep.challenges.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      ${rep.picks && rep.picks.length ? `<h4 class="sup-h">پیشنهاد برای هر قلم</h4><ul>${rep.picks.map((p) => `<li><b>${esc(p.item)}</b>: ${esc(p.supplier)} — ${esc(p.why)}</li>`).join("")}</ul>` : ""}</div>`;
    if (D.letter) h += `<h3 class="sup-h">نامهٔ کمیسیون</h3><div class="tp-card" style="padding:12px 16px;line-height:2">${D.letter.to ? `<b>${esc(D.letter.to)}</b><br>` : ""}${D.letter.subject ? `<b>موضوع: ${esc(D.letter.subject)}</b>` : ""}
      ${D.letter.paragraphs.map((p) => `<p style="margin:8px 0">${esc(p)}</p>`).join("")}${D.letter.closing ? `<p>${esc(D.letter.closing)}</p>` : ""}</div>`;
    h += `<div class="tp-card" style="padding:12px 16px;margin-top:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <b>تصمیمِ کمیسیون:</b>
      <button class="tp-btn primary" data-dlok="${D.run.id}" ${rv.state === "ok" ? "disabled" : ""}>✓ تأیید کمیسیون</button>
      <button class="tp-btn danger" data-dlrej="${D.run.id}" ${rv.state === "rejected" ? "disabled" : ""}>✗ رد</button>
      <span class="dim">تأیید: تیکِ «تأیید کمیسیون» همهٔ اقلامِ بازِ این درخواست و پیامِ «🔒 خاتمه» به کارشناس. رد: درخواست با دلیلِ شما کامل به کارشناس برمی‌گردد.</span></div>`;
    return h;
  }
  function dlDecide(id, ok) {
    if (ok) return TP.modal("✓ تأیید کمیسیون", "کمیسیونِ همهٔ اقلامِ بازِ این درخواست تأیید شود؟ کارشناس در تلگرام خبردار می‌شود و «خاتمه» را می‌زند.", () => dlSend(id, { ok: true }), "تأیید");
    const d = TP.modal("✗ ردِ تحویل", `<p>دلیلِ رد را بنویسید — برای کارشناس فرستاده می‌شود و درخواست کامل به او برمی‌گردد (گفت‌وگوها و خط‌های کارشناس هوشمند هم برایش باز می‌شوند).</p>
      <textarea class="tp-input tp-textarea" data-dlreason style="width:100%;min-height:90px"></textarea>`, () => {
      const reason = ((d && d.querySelector("[data-dlreason]")) || {}).value || "";
      if (!reason.trim()) return TP.modal("نشد", "دلیلِ رد را بنویسید.", null, "باشد", "");
      return dlSend(id, { ok: false, reason });
    }, "رد");
    return d;
  }
  async function dlSend(id, body) {
    try { await api(`/ai/deliveries/${id}/review`, { body }); await loadDl(id); aiPulse(); loadExperts().catch(() => {}); }
    catch (e) { TP.modal("نشد", esc(e.message), null, "باشد", ""); }
  }
  /** پیش‌نمایشِ برگهٔ درخواست خرید — همان مدلی که فایل Word را می‌سازد */
  async function reqPreview(aid) {
    const ov = overlay("پیش‌نمایش برگهٔ درخواست خرید", `<div class="empty">در حال ساختن برگه…</div>`);
    try {
      const d = await api(`/assignments/${aid}/sheet/request?format=html`);
      ov.set("پیش‌نمایش برگهٔ درخواست خرید", `<iframe title="برگهٔ درخواست خرید"></iframe>`);
      ov.el.querySelector("iframe").srcdoc = `<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
        <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700&display=swap" rel="stylesheet">
        <style>body{margin:12px;font-family:Vazirmatn,Tahoma,sans-serif;font-size:11px;background:#fff;color:#000}${d.css || ""}</style></head><body>${d.html || ""}</body></html>`;
    } catch (e) { ov.set("خطا", `<div class="tp-note warn">${esc(e.message)}</div>`); }
  }
  function fileDl(path, name, label) {
    const b = TP.busy("ساختن فایل…", label);
    return download(path, name).catch((e) => TP.modal("نشد", esc(e.message), null, "باشد", "")).finally(() => b.close());
  }

  /* «🚨 پرسش از کارشناس»ِ تازه بی ↻ هم دیده شود: هر ۴۵ ثانیه و با برگشتن به صفحه (پنجرهٔ دیده‌شده، بی پنجرهٔ باز) فهرست بی‌صدا تازه می‌شود؛ روی همین
     تب جدول از نو رسم می‌شود (مگر وسطِ تایپ)، وگرنه فقط نوارِ تب‌ها و نشانِ 🚨 */
  async function aiPulse() {
    if (S.view !== "app" || document.hidden || document.querySelector(".tp-modal-bg")) return;
    let r; try { r = await api("/ai/experts"); } catch (_) { return; }
    S.ai = r;
    const typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (S.tab === "ai" && !S.aiEx && S.aiView === "list") { if (!typing) render(); return; }
    const bar = app.querySelector(".tp-tabs"); if (bar) bar.outerHTML = vTabs();
  }
  setInterval(aiPulse, 45000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) aiPulse(); });
  function aiToggle(id, on) {
    TP.modal(on ? "🤖 هوشمند" : "✋ دستی", on
      ? `از این لحظه هر ارجاعِ تازهٔ <b>${esc(exName(id))}</b> را کارشناس هوشمند پیش می‌برد و همین کارها (سوابق، جستجو، ساختار، کمیسیون، نامه و گفت‌وگوهای او) برای خودِ کارشناس قفل می‌شود. هوشمند شود؟`
      : `همهٔ کارهای کارشناس هوشمندِ <b>${esc(exName(id))}</b> همان لحظه نگه داشته می‌شود و قفل‌ها برداشته می‌شوند؛ از این پس خودِ کارشناس دستی کار می‌کند. دستی شود؟`,
    async () => {
      try { await api(`/ai/${id}/mode`, { method: "PUT", body: { on } }); await loadAi(); if (S.aiEx === id && window.TP_AI) window.TP_AI.load(); }
      catch (e) { TP.modal("نشد", esc(e.message), null, "باشد", ""); }
    }, on ? "هوشمند شود" : "دستی شود");
  }

  /* ---------- رسم ---------- */
  function vTab() {
    if (S.tab === "ai") return vAi();
    if (S.tab === "dl") return vDl();
    if (S.tab === "chg") return vChg();
    if (S.tab === "req") return vReq();
    if (S.tab === "exp") return S.exId ? vExpert() : vExperts();
    if (S.tab === "chat") return vChat();
    if (S.tab === "log") return vLog();
    return vCm();
  }
  function render() {
    S.now = Date.now();
    const restore = TP.snapScroll();
    if (S.view === "boot") app.innerHTML = `<div class="empty">در حال بارگذاری…</div>`;
    else if (S.view === "login") app.innerHTML = vLogin();
    else app.innerHTML = vTop() + `<div class="tp-wrap">${vTab()}</div>`;
    restore();
    app.querySelectorAll("table[data-stick]").forEach((t) => TP.stickHeader(t));
    /* داشبوردِ کارشناس هوشمند شنونده‌های خودش را دارد (data-ai-*) */
    if (S.view === "app" && S.tab === "ai" && S.aiEx && window.TP_AI) window.TP_AI.wire(app, S, render);
  }

  /* ---------- رفتارها (یک شنونده برای همه، تا با هر رسم دوباره بسته نشوند) ---------- */
  function goto(tab, t) {
    const rid = t.dataset.rid || "";
    if (tab === "chat") { S.thF = { expert: t.dataset.exChat || "", rid, q: "" }; S.th = null; S.thId = null; S.thData = null; }
    if (tab === "log") { S.logF = { from: "", to: "", expert: t.dataset.exLog || "", rid, g: "" }; S.log = null; }
    if (tab === "req") { S.rf = { ...S.rf, id: rid }; S.desk = null; }
    setTab(tab);
  }
  function act(t) {
    const d = t.dataset;
    if (d.tab) return setTab(d.tab);
    if (d.refresh !== undefined) { loadExperts().catch(() => {}); return loadTab(true); }
    if (d.logout !== undefined) { sess.clear(); S.view = "login"; S.err = ""; S.mode = "login"; return loadStatus(); }
    if (d.pass !== undefined) return changePass();
    if (d.do) return doAuth(d.do);
    if (d.mode) { S.mode = d.mode; S.err = ""; return render(); }
    if (d.asg) return openAsg(d.asg);
    if (d.cmprev) return cmPreview(d.cmprev);
    if (d.cmdl) { const b = TP.busy("ساختن فایل…", "جدول کمیسیون (اکسل)"); return download(`/assignments/${d.cmdl}/sheet/commission`, `کمیسیون-${d.rid || d.cmdl}.xlsx`).catch((e) => TP.modal("نشد", esc(e.message), null, "باشد", "")).finally(() => b.close()); }
    if (d.goto) return goto(d.goto, t);
    if (d.ex) return loadExpert(Number(d.ex));
    if (d.exback !== undefined) { S.exId = null; S.ex = null; loadExperts().catch(() => {}); return render(); }
    if (d.th) return openThread(Number(d.th));
    if (d.thOpen) { S.thF = { expert: "", rid: "", q: "" }; S.th = null; setTab("chat"); return openThread(Number(d.thOpen)); }
    if (d.thfClear !== undefined) { S.thF.rid = ""; return loadThreads(); }
    if (d.ridClear !== undefined) { S.rf.id = ""; return loadDesk(); }
    if (d.lookup) { S.rf.id = d.lookup; S.rf.q = ""; return loadDesk(); }
    if (d.lmore !== undefined) return loadLog(true);
    if (d.lclear !== undefined) { S.logF = { from: "", to: "", expert: "", rid: "", g: "" }; return loadLog(); }
    if (d.lridSet) { S.logF.rid = d.lridSet; if (S.tab !== "log") { S.log = null; return setTab("log"); } return loadLog(); }
    if (d.ld) return TP.openDatePicker(t, (v) => { S.logF[d.ld] = v; loadLog(); }, { single: true });
    if (d.csel) { if (d.csel === "all") cmRows().forEach((i) => S.cmSel.add(i.id)); else S.cmSel.clear(); return render(); }
    if (d.cok !== undefined) { const ok = d.cok === "1"; const ids = cmRows().filter((i) => S.cmSel.has(i.id) && !!i.commission_ok !== ok).map((i) => i.id); return ids.length && cmSet(ids, ok); }
    if (d.cone) return cmSet([Number(d.cone)], d.ok === "1");
    if (d.aiex) { if (window.TP_AI) window.TP_AI.reset(); S.aiEx = Number(d.aiex); return render(); }
    if (d.aiback !== undefined) { S.aiEx = null; if (window.TP_AI) window.TP_AI.reset(); return loadAi(); }
    if (d.aitoggle) return aiToggle(Number(d.aitoggle), d.on === "1");
    /* فاز ۳: قواعدِ حداقلِ استعلام و تحویل‌ها */
    if (d.aiview) { S.aiView = d.aiview; if (S.aiView === "rules" && !S.rules) return loadRules(); if (S.aiView === "usd" && !S.usd) return loadUsd(); if (S.aiView === "rank" && !S.rank) return loadRank(); if (S.aiView === "sw" && !S.sw) return loadSw(); if (S.aiView === "md" && !S.md) return loadMd(); return render(); }
    if (d.mdsave !== undefined) return saveMdUi();
    if (d.mdreset !== undefined) { S.mdDraft = mdDraftOf(S.md.heads); S.mdErr = ""; return render(); }
    if (d.mdadd) { if (!S.mdDraft.some((x) => x.head === d.mdadd)) S.mdDraft.unshift({ head: d.mdadd, mode: "direct", supervise: false }); return render(); }
    if (d.mddel !== undefined) { S.mdDraft.splice(Number(d.mddel), 1); return render(); }
    if (d.swtoggle !== undefined) return swToggle(d.on === "1");
    if (d.rksave !== undefined) return saveRankUi();
    if (d.rkreset !== undefined) { S.rankDraft = { weights: { ...S.rank.weights }, dispatch: { tier: { ...S.rank.dispatch.tier }, then: S.rank.dispatch.then } }; S.rankErr = ""; return render(); }
    if (d.usdfetch !== undefined) return usdFetch();
    if (d.chglog) return chgLog(Number(d.chglog));
    if (d.chgmore !== undefined) return loadChg(true);
    if (d.usdman !== undefined) return usdManual();
    if (d.radd) { S.rulesDraft[d.radd].push({ from: "", to: "", min: "" }); return render(); }
    if (d.rdel) { const [k, i] = d.rdel.split(":"); S.rulesDraft[k].splice(Number(i), 1); return render(); }
    if (d.rsave !== undefined) return saveRulesUi();
    if (d.rreset !== undefined) { S.rulesDraft = draftOf(S.rules.rules); S.rulesErr = ""; return render(); }
    if (d.dlopen) return loadDl(Number(d.dlopen));
    if (d.dlback !== undefined) { S.dlId = null; S.dlD = null; return loadDls(); }
    if (d.dlok) return dlDecide(Number(d.dlok), true);
    if (d.dlrej) return dlDecide(Number(d.dlrej), false);
    if (d.dlrq) return reqPreview(d.dlrq);
    if (d.dlrqf) return fileDl(`/assignments/${d.dlrqf}/sheet/request`, `درخواست-خرید-${d.rid || d.dlrqf}.docx`, "برگهٔ درخواست خرید (Word)");
    if (d.dlletter) return fileDl(`/assignments/${d.dlletter}/letter/file`, `نامه-${d.rid || d.dlletter}.docx`, "نامهٔ کمیسیون (Word)");
    if (d.dlmd) return fileDl(`/ai/${d.exId}/runs/${d.dlmd}/md`, `پرونده-مذاکره-${d.rid || d.dlmd}.md`, "پروندهٔ مذاکره");
    return null;
  }
  app.addEventListener("click", (e) => {
    const t = e.target.closest("[data-tab],[data-refresh],[data-logout],[data-pass],[data-do],[data-mode],[data-asg],[data-cmprev],[data-cmdl],[data-goto],[data-ex],[data-exback],[data-th],[data-th-open],[data-thf-clear],[data-rid-clear],[data-lookup],[data-lmore],[data-lclear],[data-lrid-set],[data-ld],[data-csel],[data-cok],[data-cone],[data-aiex],[data-aiback],[data-aitoggle],[data-aiview],[data-radd],[data-rdel],[data-rsave],[data-rreset],[data-dlopen],[data-dlback],[data-dlok],[data-dlrej],[data-dlrq],[data-dlrqf],[data-dlletter],[data-dlmd],[data-usdfetch],[data-usdman],[data-chglog],[data-chgmore],[data-rksave],[data-rkreset],[data-swtoggle],[data-mdsave],[data-mdreset],[data-mdadd],[data-mddel]");
    if (!t || !app.contains(t) || t.disabled) return;
    /* ردیفِ کارشناس قابل کلیک است؛ کلیکِ دکمهٔ «جزئیات» همان کار را می‌کند */
    act(t);
  });
  app.addEventListener("change", (e) => {
    const t = e.target, d = t.dataset;
    if (d.rf) { S.rf[d.rf] = t.value; if (d.rf === "win" || d.rf === "status") return loadDesk(); return render(); }
    if (d.thf) { S.thF[d.thf] = t.value; return loadThreads(); }
    if (d.lf) { S.logF[d.lf] = t.value; return loadLog(); }
    if (d.lrid !== undefined) { S.logF.rid = t.value.trim(); return loadLog(); }
    if (d.cf) { S.cmF[d.cf] = t.value; S.cmSel.clear(); return loadCm(); }
    if (d.cpick) { const id = Number(d.cpick); if (t.checked) S.cmSel.add(id); else S.cmSel.delete(id); return render(); }
    if (d.dlf) { S.dlF[d.dlf] = t.value; return loadDls(); }
    if (d.usdfile !== undefined && t.files && t.files[0]) { const file = t.files[0]; t.value = ""; return usdUpload(file); }
    if (d.rthen && S.rankDraft) { S.rankDraft.dispatch.then = d.rthen; return null; }
    if (d.mdmode !== undefined && S.mdDraft) { S.mdDraft[Number(d.mdmode)].mode = t.value; return null; }
    if (d.mdsup !== undefined && S.mdDraft) { S.mdDraft[Number(d.mdsup)].supervise = t.checked; return null; }
    if (d.chgf) { S.chgF[d.chgf] = t.type === "checkbox" ? (t.checked ? "1" : "") : t.value.trim(); S.chg = null; return loadChg(); }
    return null;
  });
  /* جستجوی متنی: با هر نویسه، بی از دست رفتنِ فوکوس */
  app.addEventListener("input", (e) => {
    const t = e.target, k = t.dataset.fq;
    /* پیش‌نویسِ قواعد: بی رسمِ دوباره، تا فوکوس نپرد */
    if (t.dataset.rr && S.rulesDraft) { const [dm, i, fk] = t.dataset.rr.split(":"); if (S.rulesDraft[dm] && S.rulesDraft[dm][+i]) S.rulesDraft[dm][+i][fk] = t.value; return; }
    if (t.dataset.rwait !== undefined && S.rulesDraft) { S.rulesDraft.waitHours = t.value; return; }
    /* وزن‌ها و سقفِ رده‌ها (فاز ۲): همان پیش‌نویس، بی رسمِ دوباره */
    if (t.dataset.rw && S.rankDraft) { S.rankDraft.weights[t.dataset.rw] = t.value; return; }
    if (t.dataset.rt && S.rankDraft) { S.rankDraft.dispatch.tier[t.dataset.rt] = t.value; return; }
    if (t.dataset.mdq !== undefined) return mdSearch(t.value);
    if (!k) return;
    if (k === "req") S.rf.q = t.value; else if (k === "th") S.thF.q = t.value; else if (k === "cm") S.cmF.q = t.value;
    TP.keepFocus(t, "fq", render);
  });
  app.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const t = e.target;
    if (S.view === "login" && t.tagName === "INPUT") { e.preventDefault(); const b = app.querySelector("[data-do]"); if (b && !b.disabled) doAuth(b.dataset.do); }
    else if (t.dataset && t.dataset.lrid !== undefined) { e.preventDefault(); t.blur(); }
  });
  window.addEventListener("tp-theme", render);

  /* ---------- شروع ---------- */
  (async function boot() {
    render();
    if (sess.get()) await enter();
    else await loadStatus();
  })();
})();
