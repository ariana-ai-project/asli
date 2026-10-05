/* ============================================================
   پنل «پشتیبانی» تدارکات (مهر ۱۴۰۵ — مرحلهٔ ۱)

   نظارتِ فقط‌خواندنی بر کار کارشناسان — درخواست‌ها، کارشناسان، مکاتبات با تأمین‌کنندگان و گزارش کامل
   رخدادها با زمان دقیق — و تنها نوشتنِ کاری‌اش: تیکِ «تأیید کمیسیون» هر قلم، که از پنل و بات کارشناس
   برداشته شد. سرور: worker/support.js (مسیرهای /support/*).
   ورود با رمز مشترک پشتیبانی: اولین بازدیدکننده رمز را می‌گذارد و اگر فراموش شد، مدیر با کد مدیر رمز تازه
   می‌گذارد. نشانهٔ ورود (۱۲ ساعته) فقط در sessionStorage همین تب می‌ماند.
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
  const TABS = [["req", "درخواست‌ها"], ["exp", "کارشناسان"], ["chat", "مکاتبات"], ["log", "گزارش رخدادها"], ["cm", "تأیید کمیسیون"]];
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
    render();
  }
  function setTab(k) {
    S.tab = k;
    try { history.replaceState(null, "", "#" + k); } catch (_) { /* بی‌اهمیت */ }
    loadTab();
  }

  /* ---------- سرآیند ---------- */
  function vTop() {
    const wait = S.experts.reduce((a, e) => a + (e.cm_wait || 0), 0);
    return `<header class="tp-top">
      <div class="brand"><img src="../assets/logo-new.jpg" alt=""><div><h1>پنل پشتیبانی تدارکات</h1><div class="sub">نظارت بر کار کارشناسان و تأیید کمیسیون · ${esc(CFG.company || "")}</div></div></div>
      <span class="spacer"></span>
      ${TP.themeBtn()}
      <button class="tp-btn sm" data-refresh title="به‌روزرسانی">↻</button>
      <button class="tp-btn sm" data-pass>تغییر رمز</button>
      <a class="tp-back" href="index.html">تدارکات</a>
      <button class="tp-btn xs" data-logout title="خروج">خروج</button>
    </header>
    <div class="tp-tabs">${TABS.map(([k, l]) => `<button class="tp-tab ${S.tab === k ? "on" : ""}" data-tab="${k}">${l}${k === "cm" && wait ? `<span class="cnt" title="قلم‌هایی که جدول کمیسیونشان ساخته شده و منتظر تأیید پشتیبانی‌اند">${wait}</span>` : ""}</button>`).join("")}</div>`;
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

  /* ---------- رسم ---------- */
  function vTab() {
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
    return null;
  }
  app.addEventListener("click", (e) => {
    const t = e.target.closest("[data-tab],[data-refresh],[data-logout],[data-pass],[data-do],[data-mode],[data-asg],[data-cmprev],[data-cmdl],[data-goto],[data-ex],[data-exback],[data-th],[data-th-open],[data-thf-clear],[data-rid-clear],[data-lookup],[data-lmore],[data-lclear],[data-lrid-set],[data-ld],[data-csel],[data-cok],[data-cone]");
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
    return null;
  });
  /* جستجوی متنی: با هر نویسه، بی از دست رفتنِ فوکوس */
  app.addEventListener("input", (e) => {
    const t = e.target, k = t.dataset.fq;
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
