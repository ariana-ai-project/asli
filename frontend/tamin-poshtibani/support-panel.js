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
  const TABS = [["req", "درخواست‌ها"], ["exp", "کارشناسان"], ["chat", "مکاتبات"], ["cm", "تأیید کمیسیون"], ["td", "🔨 مناقصه"], ["ai", "🤖 کارشناس هوشمند"], ["dl", "📥 تحویل‌های هوشمند"], ["log", "رخدادها"], ["chg", "🧩 تغییرات اقلام"]];
  const tabOfHash = () => { const h = location.hash.slice(1); return TABS.some(([k]) => k === h) ? h : null; };
  const S = {
    view: "boot", status: null, mode: "login", err: "", busy: false,
    tab: tabOfHash() || "req", now: Date.now(),
    experts: [], settings: null,
    desk: null, deskErr: "", deskLoading: false, rf: { win: "7d", project: "", expert: "", status: "", q: "", id: "" }, rfOpen: false, rOpen: {},
    exId: null, ex: null, exErr: "", exQ: "",
    /* کدهای ورود (فقط پشتیبانی می‌بیند و عوض می‌کند) */
    codes: null, codesOpen: false, codesErr: "",
    th: null, thErr: "", thLoading: false, thF: { expert: "", rid: "", q: "" }, thId: null, thData: null, thStick: false,
    log: null, logErr: "", logLoading: false, logF: { from: "", to: "", expert: "", rid: "", g: "" }, logMore: false, logNext: null, lfOpen: false,
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
    alarms: [], alerts: null,
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
  /* کارتِ ورود با همان پوستهٔ ورودِ مدیر و کارشناس (ui.css)؛ رمزِ پشتیبانی هم ۴ رقم است، ولی یک فیلد تا رمزِ قدیمیِ بلندتر هم وارد شود (مهر ۱۴۰۵) */
  function vLogin() {
    const st = S.status || {};
    const locked = st.locked_until && st.locked_until > Date.now();
    const pw = (id, ph, ac, n) => `<input id="${id}" class="tp-auth-pass" type="password" placeholder="${ph}" aria-label="${ph}" autocomplete="${ac}" dir="ltr"${n ? ' inputmode="numeric" maxlength="4"' : ""}>`;
    const go = (kind, label, dis) => `<button class="tp-auth-go" type="submit" data-do="${kind}" ${dis ? "disabled" : ""}><span class="tp-go-3d" aria-hidden="true"><i></i><i></i><i></i></span><span>${label}</span></button>`;
    let h;
    if (S.mode === "reset") {
      h = `<h1>رمز تازهٔ پشتیبانی</h1><p class="tp-auth-sub">فقط مدیر: کد مدیر و رمز تازهٔ پشتیبانی</p>
        <input id="mgr" class="tp-auth-pass" type="password" inputmode="numeric" placeholder="کد مدیر" aria-label="کد مدیر" autocomplete="off" dir="ltr">
        ${pw("p1", "رمز تازه (۴ رقم)", "new-password", 1)}${pw("p2", "تکرار رمز تازه", "new-password", 1)}${go("reset", "ثبت رمز تازه و ورود", S.busy)}`;
    } else if (!st.set) {
      h = `<h1>تعیین رمز پشتیبانی</h1><p class="tp-auth-sub">این پنل هنوز رمز ندارد؛ رمزی که می‌گذارید رمز ورود همهٔ همکاران پشتیبانی است</p>
        ${pw("p1", "رمز (۴ رقم)", "new-password", 1)}${pw("p2", "تکرار رمز", "new-password", 1)}${go("setup", "ثبت رمز و ورود", S.busy)}`;
    } else {
      h = `<h1>ورود پشتیبانی</h1><p class="tp-auth-sub">رمز پشتیبانی را وارد کنید</p>${pw("p1", "رمز", "current-password")}${go("login", "ورود", S.busy || locked)}`;
    }
    const alt = S.mode === "reset" ? `<button type="button" data-mode="login">بازگشت به ورود</button>`
      : st.set ? `<button type="button" data-mode="reset">رمز را فراموش کرده‌اید؟ (مدیر با کد مدیر)</button>` : "<span></span>";
    return `<div class="tp-auth"><form class="tp-auth-card" data-login-card novalidate>
      <div class="tp-auth-head"><div class="tp-auth-brand"><img src="../assets/logo-new.jpg" alt=""><div><b>${esc(CFG.company || "تونل سد آریانا")}</b><span>پنل پشتیبانی تدارکات</span></div></div>${TP.themeBtn()}</div>
      ${h}<div class="tp-auth-err" role="alert">${esc(S.err)}${locked && !S.err ? `ورود تا ${fmtShort(st.locked_until)} بسته است.` : ""}</div>
      <div class="tp-auth-foot"><a href="index.html">← بازگشت به تدارکات</a>${alt}</div></form></div>`;
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
    loadAlarms();
    loadTab();
    if (S.tab !== "ai") aiPulse();
  }
  function changePass() {
    const d = TP.modal("تغییر رمز پشتیبانی", `<div style="display:flex;flex-direction:column;gap:8px">
        <input class="tp-input" type="password" data-pc="cur" placeholder="رمز فعلی" autocomplete="current-password" dir="ltr">
        <input class="tp-input" type="password" data-pc="p1" placeholder="رمز تازه (۴ رقم)" autocomplete="new-password" dir="ltr" inputmode="numeric" maxlength="4">
        <input class="tp-input" type="password" data-pc="p2" placeholder="تکرار رمز تازه" autocomplete="new-password" dir="ltr" inputmode="numeric" maxlength="4">
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
    else if (S.tab === "td" && window.TP_TENDER) window.TP_TENDER.load(force);
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
  /* نوار بالا با منوی پروفایل و کپسولِ بخش‌ها — مثلِ پنل مدیر: چهار بخشِ روزمره و دو گروهِ ▾ (مهر ۱۴۰۵) */
  const TAB_FA = { req: "درخواست‌ها", exp: "کارشناسان", chat: "مکاتبات", cm: "تأیید کمیسیون", td: "🔨 مناقصه", ai: "🤖 کارشناس هوشمند", dl: "📥 تحویل‌های هوشمند", log: "رخدادها", chg: "🧩 تغییرات اقلام" };
  function vTop() {
    return TP.ui.topbar({ title: "پنل پشتیبانی تدارکات", sub: esc(CFG.company || ""),
      user: { name: "پشتیبانی", sub: esc(CFG.company || ""), initial: "پ" },
      items: [{ label: "به‌روزرسانی", icon: "refresh", attrs: "data-refresh" }, { label: "تغییر رمز", icon: "key", attrs: "data-pass" }, { label: "گیرندگان هشدار", icon: "bell", attrs: "data-alerts" },
        { label: "تدارکات", icon: "home", href: "index.html" }, "-", { label: "خروج", icon: "logout", attrs: "data-logout", cls: "danger" }] })
      + vTabs();
  }
  function vTabs() {
    const wait = S.experts.reduce((a, e) => a + (e.cm_wait || 0), 0);
    const dlNew = (S.ai && S.ai.deliveries && S.ai.deliveries.new) || 0;
    /* پرسش‌های بی‌پاسخِ کارشناس هوشمند و کارهای واگذارشده به کارشناس */
    const aiN = S.ai ? (S.ai.asks || []).length + (S.ai.handovers || []).length : 0;
    const chev = TP.ui.ICON.chevron.replace("<svg", '<svg style="width:14px;height:14px;opacity:.7"');
    const cnt = (n) => (n ? `<span class="cnt">${n}</span>` : "");
    const tab = (k, n) => `<button class="${S.tab === k ? "on" : ""}" data-tab="${k}" role="tab" aria-selected="${S.tab === k ? "true" : "false"}">${TAB_FA[k]}${cnt(n)}</button>`;
    const N = { ai: aiN, dl: dlNew };
    const grp = (label, keys) => TP.ui.menu({ cls: keys.includes(S.tab) ? "on start" : "start",
      btn: `<button type="button" data-menu-toggle aria-haspopup="menu" aria-expanded="false">${keys.includes(S.tab) ? TAB_FA[S.tab] : label}${cnt(keys.reduce((a, k) => a + (N[k] || 0), 0))}${chev}</button>`,
      items: keys.map((k) => ({ label: TAB_FA[k], attrs: `data-tab="${k}"`, cnt: N[k] || null })) });
    return `<div class="tp-subbar"><div class="tp-seg" role="tablist">${tab("req")}${tab("exp")}${tab("chat")}${tab("cm", wait)}${tab("td", window.TP_TENDER && window.TP_TENDER.live() ? "●" : 0)}${grp("هوشمند", ["ai", "dl"])}${grp("گزارش‌ها", ["log", "chg"])}</div>
      <span class="spacer"></span>${TP.ui.info(S.tab === "ai" ? aiHelp() : `support.${S.tab}`, "راهنمای این بخش")}</div>`;
  }

  /* ---------- تب «درخواست‌ها»: کارت‌های میز مدیر، فقط‌خواندنی (مهر ۱۴۰۵) ---------- */
  const WINDOWS = [["3d", "امروز و دو روز گذشته", 2], ["7d", "هفتهٔ اخیر", 6], ["30d", "ماه اخیر", 29], ["all", "همه تاریخ‌ها", null]];
  const RS = { new: ["ارجاع‌نشده", "st-reg"], ready: ["ارسال‌نشده", "st-hold"], run: ["در جریان", "st-run"], hold: ["معلق", "st-hold"], stop: ["متوقف", "st-stop"], closed: ["بسته", "st-cls"] };
  const FUNNEL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 5h17l-6.6 7.6v5.6l-3.8 1.9v-7.5z"/></svg>`;
  const avOf = (name, label, cls) => `<span class="ex-av ${cls || "sm"}" style="--av:${TP.ui.avColor(name || label)}" aria-hidden="true">${esc(TP.ui.avInitial(label || name))}</span>`;
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
    /* پاسخِ درخواستِ کهنه‌تر (پیش از عوض شدنِ بازه) جای پاسخِ تازه را نمی‌گیرد */
    const seq = (S.deskSeq = (S.deskSeq || 0) + 1);
    try { const d = await api("/desk?" + qs); if (seq !== S.deskSeq) return; S.desk = d; S.settings = d.settings || S.settings; }
    catch (e) { if (seq !== S.deskSeq) return; S.deskErr = e.message; }
    S.deskLoading = false; render();
  }
  function reqRows(noStatus) {
    if (!S.desk) return [];
    const f = S.rf;
    return S.desk.requests.filter((r) => {
      if (f.project && (r.project || "—") !== f.project) return false;
      if (f.expert && !r.assignments.some((a) => String(a.expert_id) === f.expert)) return false;
      if (!noStatus && f.status && reqStatus(r) !== f.status) return false;
      if (f.q && !(TP.hit(r.id, f.q) || TP.hit(r.party, f.q) || r.items.some((i) => TP.hit(i.title, f.q) || TP.hit(i.code, f.q)))) return false;
      return true;
    });
  }
  /** نوارِ مهلت و شش مرحلهٔ یک ارجاع — همان نوارهای میز مدیر. flags: شش مرحله؛ active: کارِ باز دارد */
  function stageBars(a, flags, active) {
    const A = { dispatchedAt: a.dispatched_at, days: a.days, done: flags, active };
    const segs = TP.STAGES.map((s, i) => ({ label: TP.ui.STAGE_SHORT[i], title: s, cls: `c-${TP.stageColor(A, i, thr(), S.now)}`, done: flags[i],
      cnt: i === 3 && a.quote_count ? a.quote_count : i === 4 && a.proforma_count ? a.proforma_count : "" }));
    if (!a.dispatched_at) return { html: TP.ui.bar.progress(segs), lvl: "" };
    const b = TP.budget(a.dispatched_at, a.days || 1), el = TP.wh(a.dispatched_at, S.now), pct = b ? Math.min(100, el / b * 100) : 0;
    const lvl = !active ? "" : el >= b ? "over" : pct >= 85 ? "late" : pct >= 60 ? "warn" : "";
    return { html: TP.ui.bar.deadline(pct, lvl, "مهلت", `${a.days || "—"} روز`) + TP.ui.bar.progress(segs), lvl };
  }
  const LV = { warn: 1, late: 2, over: 3 };
  function supCard(r, i) {
    const st = reqStatus(r);
    let lvl = "";
    const units = r.assignments.map((a) => {
      const its = r.items.filter((x) => x.assignment_id === a.id), open = its.filter((x) => x.state === "open");
      const flags = [!!a.viewed_at, its.some((x) => x.hist_done_at), its.some((x) => x.smart_done_at), a.quote_count > 0, a.proforma_count > 0, !!a.commission_at];
      const B = stageBars(a, flags, !!a.dispatched_at && open.length > 0);
      if ((LV[B.lvl] || 0) > (LV[lvl] || 0)) lvl = B.lvl;
      const ok = open.filter((x) => x.commission_ok).length;
      return TP.ui.unitRow({
        who: `${avOf(a.expert_name, a.expert_label)}<span class="uname" title="${esc(a.expert_name || "")}">${esc(a.expert_label || a.expert_name || "—")}</span>`,
        days: a.dispatched_at ? `<span title="ارسال ${esc(fmtS(a.dispatched_at))}">${TP.ui.ICON.clock}${esc(TP.fmtD(a.dispatched_at))}</span>` : `<span class="dim">ارسال‌نشده</span>`,
        bars: B.html,
        status: `${open.length ? `<span class="chip ${ok === open.length ? "ok" : ""}" title="تأیید کمیسیونِ اقلامِ باز">🏆 ${M(ok)}/${M(open.length)}</span>` : ""}<span class="dim">${M(its.length)} قلم</span>`,
        acts: `<button class="tp-icon-btn sm" type="button" data-asg="${a.id}" title="جزئیاتِ ارجاع" aria-label="جزئیاتِ ارجاع">${TP.ui.ICON.more}</button>` });
    });
    if (!units.length) units.push(`<div class="tp-unit none">بی‌کارشناس</div>`);
    const need = r.items.map((x) => x.need_date).filter(Boolean).sort()[0] || "";
    const drawer = `<div class="sv-items">${r.items.map((x) => `<div class="sv-item"><span class="num dim">${x.line_no}</span><b>${esc(x.title)}</b><span class="num">${x.qty == null ? "" : M(x.qty)} ${esc(x.unit || "")}</span>
      <span class="st ${(TP.STATES[x.state] || TP.STATES.open).cls}">${(TP.STATES[x.state] || TP.STATES.open).label}</span>${x.commission_ok ? `<span class="chip ok">🏆</span>` : ""}</div>`).join("")}</div>`;
    return TP.ui.reqCard({ i, lvl, rid: r.id, date: r.date, need, project: r.project, party: r.party, center: r.center,
      chips: `<span class="st ${RS[st][1]}">${RS[st][0]}</span>`,
      items: { first: r.items[0] ? r.items[0].title : "", total: r.items.length }, toggleAttrs: `data-rtog="${esc(r.id)}" aria-expanded="${S.rOpen[r.id] ? "true" : "false"}"`,
      drawerOpen: !!S.rOpen[r.id], drawerHtml: drawer, units });
  }
  function vReqBar(rows) {
    const d = S.desk, f = S.rf, win = WINDOWS.find((w) => w[0] === f.win);
    const act = [];
    if (f.project) act.push(["پروژه", f.project, "project"]);
    if (f.expert) act.push(["کارشناس", exName(f.expert), "expert"]);
    if (f.id) act.push(["درخواست", f.id, "id"]);
    const all = reqRows(true), counts = {};
    all.forEach((r) => { const s = reqStatus(r); counts[s] = (counts[s] || 0) + 1; });
    const pill = (k, l, n) => `<button type="button" class="tp-pill ${f.status === k ? "on" : ""}" data-rst="${k}" aria-pressed="${f.status === k ? "true" : "false"}">${l}${n != null ? ` <span class="n">${M(n)}</span>` : ""}</button>`;
    const projects = d ? [...new Set(d.requests.map((r) => r.project || "—"))].sort((a, b) => a.localeCompare(b, "fa")) : [];
    return `<div class="mg-bar">
      <button type="button" class="mg-fbtn ${S.rfOpen ? "on" : ""}" data-rfopen aria-expanded="${S.rfOpen ? "true" : "false"}" title="فیلترها">${FUNNEL}<span>فیلتر</span>${act.length ? `<i class="badge">${M(act.length)}</i>` : ""}</button>
      <div class="mg-chips">${act.map(([l, v, k]) => `<button type="button" class="mg-chip" data-rdrop="${k}" title="برداشتن این فیلتر">${esc(l)}: <b>${esc(v)}</b> ${TP.ui.ICON.x}</button>`).join("")}</div>
      <input class="tp-input sv-q" data-fq="req" value="${esc(f.q)}" placeholder="جستجو: شماره، طرف مقابل یا قلم" aria-label="جستجوی درخواست">
      <span class="spacer"></span><span class="mg-count"><b>${M(rows.length)}</b> از ${M(d ? d.requests.length : 0)} درخواست · ${esc(f.id ? `درخواست ${f.id}` : win ? win[1] : "")}${S.deskLoading && d ? " · …" : ""}</span></div>
      <div class="tp-pills sv-st">${pill("", "همه", all.length)}${Object.entries(RS).map(([k, [l]]) => counts[k] ? pill(k, l, counts[k]) : "").join("")}</div>
      ${S.rfOpen ? `<div class="mg-fpanel" data-fpanel-box role="region" aria-label="فیلترهای درخواست‌ها">
        <div class="mg-frow"><span class="lab">بازه</span><div class="tp-pills">${WINDOWS.map(([k, l]) => `<button type="button" class="tp-pill ${f.win === k ? "on" : ""}" data-rwin="${k}" ${f.id ? "disabled" : ""}>${l}</button>`).join("")}</div></div>
        <div class="mg-frow"><span class="lab">پروژه</span><select class="tp-select" data-rf="project"><option value="">همه</option>${projects.map((p) => `<option ${f.project === p ? "selected" : ""}>${esc(p)}</option>`).join("")}</select>
          <span class="lab">کارشناس</span><select class="tp-select" data-rf="expert"><option value="">همه</option>${expertOpts(f.expert)}</select></div>
        <div class="mg-ffoot"><button class="tp-btn sm" data-rclear>پاک کردن همه</button><span class="spacer"></span><button class="tp-btn primary" data-rfopen>${TP.ui.ICON.check} بستن</button></div></div>` : ""}`;
  }
  function vReq() {
    const d = S.desk, f = S.rf, rows = reqRows();
    let h = vReqBar(rows);
    if (S.deskErr) h += `<div class="tp-note warn">${esc(S.deskErr)}</div>`;
    if (!d) return h + (S.deskLoading ? `<div class="empty">در حال بارگذاری…</div>` : "");
    if (!rows.length) {
      const q = f.q.trim();
      return h + `<div class="empty"><b>درخواستی با این فیلترها نیست.</b>${f.win !== "all" && !f.id ? `<br><br><button class="tp-btn" data-rwin="all">همهٔ تاریخ‌ها</button>` : ""}${q.length >= 4 && !f.id ? ` <button class="tp-btn" data-lookup="${esc(q)}">جستجوی «${esc(q)}» در کل سامانه</button>` : ""}</div>`;
    }
    return h + `<div class="tp-cards wide ${TP.ui.once("sup.req")}">${rows.map(supCard).join("")}</div>`;
  }

  /* ---------- جزئیاتِ یک ارجاع (روی صفحه) ---------- */
  function overlay(title, html) {
    const el = document.createElement("div"); el.className = "sup-ov";
    el.innerHTML = `<div class="tp-card sheet" role="dialog" aria-modal="true"><div class="hd"><h3 data-ovt></h3><span style="margin-inline-start:auto"></span><button class="tp-btn sm" data-close>بستن ✕</button></div><div data-ovb></div></div>`;
    const set = (t, b) => { el.querySelector("[data-ovt]").innerHTML = t; el.querySelector("[data-ovb]").innerHTML = b; };
    set(title, html);
    el.addEventListener("click", (e) => {
      if (e.target === el || e.target.closest("[data-close]")) { el.remove(); return; }
      const t = e.target.closest("[data-cmprev],[data-cmdl],[data-goto],[data-asg],[data-cres]");
      if (t) { if (t.dataset.goto || t.dataset.cres) el.remove(); act(t); }
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
    const stat = (label, value, icon, tone, sub) => TP.ui.stat({ label, value, icon, tone, sub });
    const late = a.deadline_at && a.deadline_at < S.now && its.some((i) => i.state === "open");
    const okN = its.filter((i) => i.state === "open" && i.commission_ok).length, openN = its.filter((i) => i.state === "open").length;
    const qCard = (q) => `<div class="sv-qc ${q.final ? "fin" : ""}"><b>${esc(q.supplier_name)}</b>${q.source === "ai" ? ` <span title="کارشناس هوشمند">🤖</span>` : ""}
        <span class="num pr">${q.price == null ? "—" : M(q.price)} <small>ریال</small></span>
        <span class="dim">${[q.dtime ? `تحویل ${esc(q.dtime)}` : "", q.pay ? esc(q.pay) : "", q.invoice ? `فاکتور ${esc(q.invoice)}` : ""].filter(Boolean).join(" · ")}</span>
        <span class="tags">${q.saved ? `<span class="chip">ثبت‌شده</span>` : `<span class="chip warn">ثبت‌نشده</span>`}${q.final ? `<span class="chip ok" title="${q.final_at ? esc(fmtS(q.final_at)) : ""}">✓ تأیید نهایی</span>` : ""}<span class="dim">${esc(ORIGIN[q.origin] || q.origin || "")}</span></span></div>`;
    return `<div class="sv-asg">
      <div class="tp-stats">${stat("طرف مقابل", esc(r.party || "—"), "project")}${stat("ارسال برای کارشناس", a.dispatched_at ? esc(TP.fmtD(a.dispatched_at)) : "ارسال‌نشده", "user", "", a.viewed_at ? `مشاهده ${esc(fmtShort(a.viewed_at))}` : "هنوز ندیده")}
        ${stat("پایان مهلت", a.deadline_at ? esc(fmtShort(a.deadline_at)) : `${esc(a.days || "—")} روز کاری`, "clock", late ? "bad" : "")}
        ${stat("جدول کمیسیون", a.commission_no ? `TSA-PS-FO-${esc(a.commission_no)}` : "ساخته نشده", "file", a.commission_no ? "ok" : "", a.commission_at ? esc(fmtShort(a.commission_at)) : "")}
        ${stat("تأیید کمیسیون", `${M(okN)} / ${M(openN)}`, "check", openN && okN === openN ? "ok" : "")}</div>
      <div class="sv-acts">
        <button class="tp-btn primary" data-cres="${a.id}" title="برنده و علتِ هر قلم؛ تأیید کمیسیون و پیامِ تشکر به بقیه">🏆 نتیجهٔ کمیسیون</button>
        ${a.commission_no ? `<button class="tp-btn" data-cmprev="${a.id}">${TP.ui.ICON.search} جدول کمیسیون</button><button class="tp-btn" data-cmdl="${a.id}" data-rid="${esc(r.id)}">${TP.ui.ICON.upload} اکسل</button>` : ""}
        <button class="tp-btn" data-goto="chat" data-rid="${esc(r.id)}">💬 مکاتبات</button>
        <button class="tp-btn" data-goto="log" data-rid="${esc(r.id)}">${TP.ui.ICON.clock} رخدادها</button></div>
      ${a.notes ? `<div class="sv-notes"><b>توضیحات کارشناس</b> (پای جدول کمیسیون)<p>${esc(a.notes)}</p></div>` : ""}
      <h4 class="sv-h">اقلام <span class="chip">${M(its.length)}</span></h4>
      <div class="sv-its">${its.map((i) => { const q = qOf(i.id), s = TP.STATES[i.state] || TP.STATES.open;
        return `<article class="sv-it"><header><span class="num dim">${i.line_no}</span><b>${esc(i.title)}</b>${i.sp_lock ? ` <span title="برای تأمین‌کننده رفته؛ ساختارش قفل است">🔒</span>` : ""}
            <span class="num">${i.qty == null ? "" : M(i.qty)} ${esc(i.unit || "")}</span><span class="st ${s.cls}">${s.label}</span>${i.commission_ok ? `<span class="chip ok">🏆 کمیسیون</span>` : ""}</header>
          <div class="sv-flags"><span class="${i.norm_at ? "on" : ""}" title="${i.norm_at ? esc(fmtS(i.norm_at)) : ""}">ساختار</span><span class="${i.hist_done_at ? "on" : ""}" title="${i.hist_done_at ? esc(fmtS(i.hist_done_at)) : ""}">سوابق</span>
            <span class="${q.some((x) => x.saved) ? "on" : ""}">استعلام ${M(q.filter((x) => x.saved).length)}/${M(q.length)}</span><span class="${q.some((x) => x.final) ? "on" : ""}">تأیید نهایی ${M(q.filter((x) => x.final).length)}</span></div>
          ${q.length ? `<div class="sv-qs">${q.map(qCard).join("")}</div>` : `<div class="dim sv-none">استعلامی ثبت نشده.</div>`}</article>`; }).join("")}</div>
      ${pfs.length ? `<h4 class="sv-h">پیش‌فاکتورها <span class="chip">${M(pfs.length)}</span></h4><div class="sv-pfs">${pfs.map((p) => `<span class="sv-pf">📄 <b>${esc(p.supplier_name)}</b><span class="dim">${esc(p.filename || "")}</span>
          <span class="dim">${esc({ panel: "پنل", telegram: "تلگرام", supplier: "پنل تأمین‌کننده", generated: "سامانه" }[p.source] || p.source || "")} · ${esc(fmtShort(p.uploaded_at))}</span>
          ${p.extract_state ? `<span class="chip ${p.extract_state === "ok" ? "ok" : p.extract_state === "pending" ? "" : "warn"}">${esc({ ok: "خوانده شد", refused: "خوانا نبود", failed: "نشد", pending: "در حال خواندن" }[p.extract_state] || p.extract_state)}</span>` : ""}</span>`).join("")}</div>` : ""}
    </div>`;
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

  /* ---------- تب «کارشناسان»: کارت‌ها مثلِ تخته‌ی کارشناسانِ پنل مدیر (مهر ۱۴۰۵) ---------- */
  /* کدهای ورود کارشناسان و کد مدیر — تنها جای دیدن و تغییرشان (تصمیم مالک، مهر ۱۴۰۵) */
  function vCodes() {
    const C = S.codes;
    if (S.codesErr) return `<div class="tp-note warn">${esc(S.codesErr)}</div>`;
    if (!C) return `<div class="empty">در حال خواندن کدها…</div>`;
    const inp = (attrs, v, bad, label) => `<input class="tp-input sv-code ${bad ? "bad" : ""}" ${attrs} value="${esc(v)}" inputmode="numeric" maxlength="4" pattern="[0-9]*" autocomplete="off" dir="ltr" aria-label="${esc(label)}" title="چهار رقم؛ Enter یا خروج از کادر = ذخیره">`;
    return `<section class="tp-box sv-codes"><div class="tp-box-h"><span class="bi">${TP.ui.ICON.key}</span><h2>کدهای ورود</h2><span class="sub">چهار رقم</span>
        <span class="end">${TP.ui.info("support.exp", "راهنمای کدها")}</span></div>
      <div class="sv-codegrid"><label class="sv-codecard mgr"><span class="ex-av" style="--av:#1c3c8c" aria-hidden="true">م</span><b>کد مدیر</b>${inp("data-code-mgr", C.manager, !/^\d{4}$/.test(C.manager), "کد مدیر")}</label>
        ${C.experts.map((e) => `<label class="sv-codecard">${avOf(e.name, e.label)}<b>${e.senior ? "★ " : ""}${esc(e.label || e.name)}</b>${inp(`data-code-ex="${e.id}"`, e.code, !e.ok, `کد ${e.label || e.name}`)}${e.ok ? "" : `<span class="chip warn">چهاررقمی نیست</span>`}${e.tg ? `<span class="sv-tg" title="تلگرام وصل است">${TP.ui.ICON.telegram}</span>` : ""}</label>`).join("")}</div></section>`;
  }
  async function loadCodes() { S.codesErr = ""; try { S.codes = await api("/codes"); } catch (e) { S.codesErr = e.message; } render(); }
  async function saveCode(body) {
    try { S.codes = await api("/codes", { method: "PUT", body }); S.codesErr = ""; TP.ui.success("کد ذخیره شد"); }
    catch (e) { TP.modal("ذخیره نشد", esc(e.message), null, "باشد", ""); }
    render();
  }
  const metric = (label, v, tone) => `<span class="sv-m ${v && tone ? tone : ""}"><b class="num">${M(v || 0)}</b><small>${label}</small></span>`;
  /* سه عددِ اصلی همیشه؛ دیرکرد، دیده‌نشده و منتظرِ کمیسیون فقط وقتی هستند — کارتِ کارشناسِ بی‌کار کم‌رنگ */
  function exCard(e, i) {
    const alerts = [e.overdue ? `<span class="chip bad">${M(e.overdue)} دیرکرد</span>` : "", e.unseen ? `<span class="chip warn">${M(e.unseen)} دیده‌نشده</span>` : "",
      e.cm_wait ? `<span class="chip info">${M(e.cm_wait)} منتظر کمیسیون</span>` : ""].join("");
    const idle = !e.open_asg && !e.open_items && !e.threads;
    return `<article class="sv-ex ${idle ? "idle" : ""} ${e.overdue ? "late" : ""}" data-ex="${e.id}" role="button" tabindex="0" style="--i:${Math.min(i, 14)}" aria-label="${esc(e.label || e.name)}">
      <header>${avOf(e.name, e.label, "lg")}<div class="t"><b>${e.senior ? `<span class="sv-star" title="کارشناس ارشد">★</span>` : ""}${esc(e.label || e.name)}</b>${e.label && e.label !== e.name ? `<small>${esc(e.name)}</small>` : ""}</div>
        <span class="tags">${e.ai === "on" ? `<span class="chip ai" title="کارشناس هوشمند روشن">🤖</span>` : ""}${e.tg ? `<span class="sv-tg" title="تلگرام وصل است">${TP.ui.ICON.telegram}</span>` : ""}</span></header>
      <div class="sv-ms">${metric("ارجاع باز", e.open_asg)}${metric("قلم باز", e.open_items)}${metric("گفت‌وگو", e.threads)}</div>
      ${alerts ? `<div class="sv-al">${alerts}</div>` : idle ? `<div class="sv-al dim">کارِ بازی ندارد</div>` : ""}</article>`;
  }
  function vExperts() {
    const E = S.experts;
    if (!E.length) return `<div class="empty">در حال بارگذاری…</div>`;
    const sum = (k) => E.reduce((a, e) => a + (e[k] || 0), 0);
    const q = (S.exQ || "").trim();
    /* پرکارها و دیرکردها اول؛ بقیه به همان ترتیبِ سرور */
    const load = (e) => (e.overdue ? 2 : 0) + (e.open_asg || e.open_items || e.threads ? 1 : 0);
    const list = E.filter((e) => !q || TP.hit(e.label, q) || TP.hit(e.name, q)).sort((a, b) => load(b) - load(a));
    const stat = (label, value, icon, tone) => TP.ui.stat({ label, value: M(value), icon, tone });
    return `<div class="sv-exwrap ${TP.ui.once("sup.exp")}">
      <div class="tp-stats">${stat("کارشناس فعال", E.length, "users")}${stat("ارجاع باز", sum("open_asg"), "project")}${stat("قلم باز", sum("open_items"), "box")}
        ${stat("از مهلت گذشته", sum("overdue"), "clock", sum("overdue") ? "bad" : "ok")}${stat("دیده‌نشده", sum("unseen"), "search", sum("unseen") ? "warn" : "")}${stat("منتظر تأیید کمیسیون", sum("cm_wait"), "check", sum("cm_wait") ? "warn" : "")}</div>
      <div class="mg-bar"><input class="tp-input sv-q" data-fq="ex" value="${esc(S.exQ || "")}" placeholder="جستجوی کارشناس" aria-label="جستجوی کارشناس"><span class="spacer"></span>
        <button class="tp-btn ${S.codesOpen ? "primary" : ""}" data-codes aria-expanded="${S.codesOpen ? "true" : "false"}">${TP.ui.ICON.key} کدهای ورود</button></div>
      ${S.codesOpen ? vCodes() : ""}
      <div class="sv-exgrid">${list.map(exCard).join("") || `<div class="empty">کارشناسی با «${esc(q)}» نیست.</div>`}</div></div>`;
  }
  async function loadExpert(id) {
    S.exId = id; S.ex = null; S.exErr = ""; render();
    try { S.ex = await api(`/experts/${id}`); } catch (e) { S.exErr = e.message; }
    render();
  }
  function aCard(a, i) {
    const flags = [!!a.viewed_at, a.hist_count > 0, a.smart_count > 0, a.quote_count > 0, a.proforma_count > 0, !!a.commission_at];
    const B = stageBars(a, flags, a.open_count > 0);
    return `<article class="tp-rcard mgr ${B.lvl ? `lvl-${B.lvl}` : ""}" style="--i:${Math.min(i, 12)}">
      <header><span class="rid">${esc(a.request_id)}</span><span class="rdate">${esc(a.date || "")}</span><span class="chips">${a.ok_count && a.ok_count === a.open_count ? `<span class="chip ok">🏆 کمیسیون</span>` : ""}</span>
        <button class="tp-icon-btn sm" type="button" data-asg="${a.id}" title="جزئیاتِ ارجاع" aria-label="جزئیاتِ ارجاع">${TP.ui.ICON.more}</button></header>
      <div class="rproj">${TP.ui.ICON.project}<span>${esc(a.party || "—")}</span></div>
      <div class="tp-units"><div class="tp-unit"><div class="u-bars">${B.html}</div></div></div>
      <div class="sv-ms">${metric("قلم باز", a.open_count)}${metric("استعلام", a.quote_count)}${metric("تأیید نهایی", a.final_count)}${metric("کمیسیون", a.ok_count)}${metric("گفت‌وگو", a.threads)}</div></article>`;
  }
  function vExpert() {
    const back = `<button class="tp-btn sm" data-exback>→ همهٔ کارشناسان</button>`;
    if (S.exErr) return `${back}<div class="tp-note warn">${esc(S.exErr)}</div>`;
    if (!S.ex) return `${back}<div class="empty">در حال بارگذاری…</div>`;
    const e = S.ex.expert, row = S.experts.find((x) => x.id === e.id) || {}, A = S.ex.assignments || [];
    return `<div class="sv-exone">
      <section class="tp-box sv-exhead">${back}${avOf(e.name, e.label, "lg")}<div class="t"><h2>${e.senior ? `<span class="sv-star">★</span>` : ""}${esc(e.label || e.name)}</h2><small>${esc(e.name)}</small></div>
        <span class="end"><button class="tp-btn sm" data-goto="chat" data-ex-chat="${e.id}">💬 مکاتباتش</button><button class="tp-btn sm" data-goto="log" data-ex-log="${e.id}">${TP.ui.ICON.clock} رخدادهایش</button></span></section>
      <div class="sv-ms big">${metric("ارجاع باز", row.open_asg ?? A.length)}${metric("قلم باز", row.open_items)}${metric("دیرکرد", row.overdue, "bad")}${metric("دیده‌نشده", row.unseen, "warn")}${metric("منتظر کمیسیون", row.cm_wait, "info")}</div>
      <h4 class="sv-h">ارجاع‌های باز <span class="chip">${M(A.length)}</span></h4>
      ${A.length ? `<div class="tp-cards wide">${A.map(aCard).join("")}</div>` : `<div class="empty">ارجاعِ بازی ندارد.</div>`}
      <h4 class="sv-h">آخرین رخدادها</h4>${feedTl(S.ex.activity || [], false)}</div>`;
  }

  /* ---------- تب «مکاتبات»: فهرستِ گفت‌وگوها و گوشیِ آیفونِ فقط‌خواندنی — همان صفحهٔ مکاتباتِ کارشناس (مهر ۱۴۰۵) ----------
     دسکتاپ (۹۶۱ پیکسل به بالا): فهرست | اقلام و مشخصاتِ گفت‌وگو | گوشی. گوشیِ واقعی: فهرست، و با انتخاب، گفت‌وگوی تمام‌صفحه
     با دکمهٔ برگشت. نگاهِ پشتیبانی پیامی را «خوانده‌شده» نمی‌کند (worker/support.js:supportThread). */
  const PH = window.PH;
  const PHONE = window.matchMedia("(min-width: 961px)");
  let phoneMode = PHONE.matches;
  const onPhone = () => { if (phoneMode === PHONE.matches) return; phoneMode = PHONE.matches; if (S.view === "app") render(); };
  if (PHONE.addEventListener) PHONE.addEventListener("change", onPhone); else if (PHONE.addListener) PHONE.addListener(onPhone);
  /* گفت‌وگوی تمام‌صفحه روی گوشیِ واقعی */
  const mChat = () => S.view === "app" && S.tab === "chat" && !phoneMode && !!S.thId;
  const AI_ST = { human: ["✋", "اضطراری دستِ کارشناس", "bad"], ask: ["🚨", "کارشناس هوشمند از کارشناس پرسیده", "warn"], closed: ["🤖", "کارشناس هوشمند — بسته شد", ""] };
  const aiSt = (st) => (st ? AI_ST[st] || ["🤖", "دستِ کارشناس هوشمند", "info"] : null);
  /** ساعتِ امروز، روزِ هفته در هفتهٔ اخیر، وگرنه ماه/روز */
  function whenS(ms) {
    if (!ms) return "";
    const d = new Date(ms), n = new Date();
    if (d.toDateString() === n.toDateString()) return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
    if (n - d < 6 * DAY) return TP.WD[d.getDay()];
    const [, m, dd] = jOf(d); return `${p2(m)}/${p2(dd)}`;
  }
  async function loadThreads() {
    S.thLoading = true; S.thErr = ""; render();
    const qs = new URLSearchParams();
    if (S.thF.expert) qs.set("expert", S.thF.expert);
    if (S.thF.rid) qs.set("rid", S.thF.rid);
    const seq = (S.thSeq = (S.thSeq || 0) + 1);
    try { const r = (await api("/threads?" + qs)).threads || []; if (seq !== S.thSeq) return; S.th = r; } catch (e) { if (seq !== S.thSeq) return; S.thErr = e.message; }
    S.thLoading = false; render();
  }
  async function openThread(id, quiet) {
    if (!quiet) { S.thId = id; S.thData = null; S.thStick = true; render(); }
    try { S.thData = await api(`/threads/${id}`); } catch (e) { if (!quiet) S.thData = { error: e.message }; }
    if (S.thId === id) render();
  }
  const thRows = () => (S.th || []).filter((t) => !S.thF.q || TP.hit(t.supplier, S.thF.q) || TP.hit(t.request_id, S.thF.q) || TP.hit(t.party, S.thF.q) || TP.hit(exName(t.expert_id), S.thF.q));
  function thRow(t) {
    const st = aiSt(t.ai_state);
    const who = t.last_who === "e" ? (t.ai_msgs && st ? "🤖 " : "کارشناس: ") : "";
    const pv = t.last_kind === "voice" ? "🎤 پیام صوتی" : esc(t.last_body || "");
    return TP.ui.chatRow({ on: t.id === S.thId, cls: t.ai_state === "human" ? "ask" : st ? "watch" : "",
      attrs: `data-th="${t.id}" aria-label="${esc(t.supplier)} — درخواست ${esc(t.request_id)}"`,
      av: { text: TP.ui.avInitial(t.supplier), color: TP.ui.avColor(t.supplier) },
      title: `${st ? `${st[0]} ` : ""}${esc(t.supplier)}${t.demo ? ` <span class="sp-tag">فرضی</span>` : ""}`, time: whenS(t.last_at),
      sub: `<span class="sv-pvr">${esc(t.request_id)} · ${esc(exName(t.expert_id))}</span>${pv ? `<br>${who}${pv}` : ""}`,
      badges: t.finals ? `<span class="sp-badge" title="تأیید نهایی">✓ ${M(t.finals)}</span>` : "" });
  }
  function vChatList() {
    const f = S.thF, list = thRows();
    const body = S.thErr ? `<div class="tp-note warn">${esc(S.thErr)}</div>` : !S.th ? `<div class="empty">در حال بارگذاری…</div>`
      : list.length ? list.map(thRow).join("") : `<div class="empty">گفت‌وگویی${f.q ? ` با «${esc(f.q)}»` : ""} نیست.</div>`;
    return `<aside class="sv-chl"><div class="sv-chh">
        <select class="tp-select" data-thf="expert" aria-label="کارشناس"><option value="">همهٔ کارشناسان</option>${expertOpts(f.expert)}</select>
        ${f.rid ? `<button type="button" class="mg-chip" data-thf-clear title="برداشتن این فیلتر">درخواست: <b>${esc(f.rid)}</b> ${TP.ui.ICON.x}</button>` : ""}
        <span class="sv-chn">${S.th ? `${M(list.length)} گفت‌وگو` : ""}${S.thLoading && S.th ? " · …" : ""}</span></div>
      <div class="tp-chat-search"><input data-fq="th" value="${esc(f.q)}" placeholder="تأمین‌کننده، درخواست یا کارشناس" aria-label="جستجوی گفت‌وگو" autocomplete="off"></div>
      <div class="scroll" data-keep-scroll>${body}</div></aside>`;
  }
  const TERM_FA = { dtime: "تحویل", pay: "پرداخت", invoice: "فاکتور", vat: "ارزش افزوده", valid_days: "اعتبار" };
  const termsLine = (t) => Object.keys(TERM_FA).filter((k) => t && String(t[k] ?? "").trim()).map((k) => `${TERM_FA[k]}: ${PH.fa(t[k])}${k === "valid_days" ? " روز" : ""}`).join(" · ");
  /** مشخصاتِ گفت‌وگو: تأمین‌کننده، درخواست، کارشناس، حالتِ کارشناس هوشمند و اقلام با قیمت */
  function thInfo(d) {
    const t = d.thread, lines = d.lines || [], st = aiSt(t.ai_state);
    const sum = lines.reduce((x, l) => x + (l.total || 0), 0), priced = lines.filter((l) => l.price != null).length;
    const finals = (d.bundles || []).filter((b) => b.state === "final").length;
    const stat = (label, value, icon, tone, sub) => TP.ui.stat({ label, value, icon, tone, sub });
    return `<div class="sv-thi">
      <header class="sv-thh">${avOf(t.supplier, "", "lg")}<div class="t"><h3>${esc(t.supplier)}${t.demo ? ` <span class="sp-tag">فرضی</span>` : ""}</h3>
          <span class="dim">${t.phone ? `📞 <span dir="ltr">${esc(t.phone)}</span>${t.phone_label ? ` (${esc(t.phone_label)})` : ""}` : "شماره‌ای ثبت نشده"}</span></div></header>
      <div class="sv-thm"><span>${TP.ui.ICON.project}درخواست <b class="num">${esc(t.request_id)}</b>${t.party ? ` · ${esc(t.party)}` : ""}</span>
        <span>${avOf(exName(t.expert_id), "")}${esc(exName(t.expert_id))}</span>${st ? `<span class="chip ${st[2]}">${st[0]} ${st[1]}</span>` : ""}</div>
      <div class="tp-stats">${stat("اقلام", M(lines.length), "box", "", `${M(priced)} با قیمت`)}${stat("پیام", M((d.msgs || []).length), "chat")}
        ${stat("تأیید نهایی", M(finals), "check", finals ? "ok" : "")}${stat("جمع پیشنهادها", sum ? M(sum) : "—", "file", "", sum ? "ریال" : "")}</div>
      ${termsLine(t.terms) ? `<div class="sv-terms">🧾 ${esc(termsLine(t.terms))}</div>` : ""}
      <div class="sv-acts"><button class="tp-btn sm" data-goto="log" data-rid="${esc(t.request_id)}">${TP.ui.ICON.clock} رخدادهای درخواست</button>
        ${t.assignment_id ? `<button class="tp-btn sm" data-asg="${t.assignment_id}">${TP.ui.ICON.more} جزئیاتِ ارجاع</button>` : ""}</div>
      <h4 class="sv-h">اقلام <span class="chip">${M(lines.length)}</span></h4>
      ${lines.length ? `<div class="sv-lns">${lines.map((l) => `<div class="sv-ln"><div class="t">${l.no ? `<span class="sp-code">کد ${PH.fa(l.no)}</span>` : ""}<b>${esc(l.title)}</b><span class="chip">${esc(l.state_fa || l.state)}</span></div>
          <div class="d num">${l.qty == null ? "—" : M(l.qty)} ${esc(l.unit || l.req_unit || "")}${l.price != null ? ` × ${M(l.price)} = <b>${M(l.total)}</b> ریال` : ""}</div></div>`).join("")}</div>`
        : `<div class="dim">قلمی در این گفت‌وگو نیست.</div>`}
      ${(d.files || []).length ? `<h4 class="sv-h">فایل‌ها <span class="chip">${M(d.files.length)}</span></h4><div class="sv-pfs">${d.files.map((x) => `<span class="sv-pf">📎 <b>${esc((d.labels && d.labels[x.label]) || x.label || "فایل")}</b><span class="dim">${esc(x.filename || "")}</span><span class="dim">${esc(fmtShort(x.at))}</span></span>`).join("")}</div>` : ""}</div>`;
  }
  /** یادداشتِ درونیِ کارشناس برای پشتیبانی «یادداشت» است، نه «فقط شما می‌بینید» */
  const supMsgs = (msgs) => (msgs || []).map((m) => (m.kind === "note" ? { ...m, kind: "event", meta: {}, body: `📝 یادداشتِ درونیِ ${m.meta && m.meta.ai ? "کارشناس هوشمند" : "کارشناس"}: ${m.body || ""}` } : m));
  /** صفحهٔ گوشی: framed = داخلِ قابِ آیفون؛ وگرنه تمام‌صفحه روی گوشیِ واقعی */
  function thScreen(framed) {
    const d = S.thData;
    if (!S.thId || !d || d.error) {
      return PH.screen({ framed, body: null, void: d && d.error ? `<b>باز نشد</b>${esc(d.error)}` : S.thId ? `<span class="tp-spin"></span>` : `<b>مکاتبات</b>یک گفت‌وگو را از فهرست انتخاب کنید تا این‌جا باز شود.` });
    }
    const t = d.thread, I = PH.I;
    const circ = (attrs, label, icon) => `<button class="ph-glass ph-circ" type="button" ${attrs} aria-label="${label}" title="${label}">${icon}</button>`;
    return PH.screen({
      framed, label: `گفت‌وگو با ${t.supplier}`,
      body: PH.feed(supMsgs(d.msgs), {
        mine: (m) => m.who === "e", ai: (m) => !!(m.meta && m.meta.ai), transcript: true,
        rich: (m) => PH.evCard(m, { mine: m.who === "e", termsLine }),
        empty: `<div class="ph-void"><b>هنوز پیامی نیست</b>کارشناس هنوز برای ${esc(t.supplier)} چیزی نفرستاده.</div>` }),
      nav: {
        start: framed ? "" : circ("data-thback", "بازگشت به فهرست", I.back),
        title: `${t.ai_state === "human" ? "✋ " : ""}${t.supplier}`, initial: TP.ui.avInitial(t.supplier),
        whoAttrs: framed ? "" : "data-thinfo", whoTitle: `${t.supplier} · درخواست ${t.request_id} · ${exName(t.expert_id)}`,
        acts: `${circ("data-thre", "به‌روزرسانیِ گفت‌وگو", TP.ui.ICON.refresh)}${framed ? "" : circ("data-thinfo", "اقلام و مشخصات", I.box)}`,
      },
      composer: { readonly: `<span class="ph-ro-t">👁 <b>فقط دیدن</b> — نگاهِ پشتیبانی پیامی را «خوانده‌شده» نمی‌کند</span>` },
    });
  }
  function vChat() {
    if (!phoneMode) return `<div class="sv-chat m">${vChatList()}</div>`;
    const d = S.thData;
    const info = !S.thId ? `<div class="sv-thnone">${TP.ui.ICON.chat}<b>یک گفت‌وگو را انتخاب کنید</b><span>اقلام و مشخصاتش این‌جا و پیام‌ها در گوشی می‌آیند.</span></div>`
      : !d ? `<div class="empty">در حال بارگذاری…</div>` : d.error ? `<div class="tp-note warn">${esc(d.error)}</div>` : thInfo(d);
    return `<div class="sv-chat">${vChatList()}<section class="sv-chm" data-keep-scroll>${info}</section>
      <section class="ph-stage">${PH.frame(thScreen(true))}</section></div>`;
  }
  /** صدای پیامِ صوتی با نشانهٔ ورودِ پشتیبانی (worker/api.js: /support/msg/:id/voice) */
  async function loadVoice(id) {
    const s = sess.get();
    const r = await fetch(`${BASE()}/msg/${id}/voice`, { headers: s ? { "X-Support-Token": s.token } : {} });
    if (!r.ok) throw new Error("پخش نشد");
    return r.blob();
  }
  /** پس از هر رسم: صدای پیام‌ها و جای اسکرولِ گفت‌وگو (پایینِ گفت‌وگو در بازکردن؛ همان‌جا در رسم‌های بعدی) */
  function afterChat(prev) {
    const c = document.getElementById("chat");
    if (!c) return;
    PH.bindVoices(c, loadVoice);
    if (S.thStick && S.thData) { c.scrollTop = c.scrollHeight; S.thStick = false; }
    else if (prev && prev.id === S.thId) c.scrollTop = prev.bottom ? c.scrollHeight : prev.top;
    else c.scrollTop = c.scrollHeight;
  }
  function chatPos() {
    const c = document.getElementById("chat");
    return c ? { id: S.thId, top: c.scrollTop, bottom: c.scrollHeight - c.scrollTop - c.clientHeight < 60 } : null;
  }
  function thInfoSheet() {
    if (!S.thData || S.thData.error) return;
    overlay(`گفت‌وگو با ${esc(S.thData.thread.supplier)}`, thInfo(S.thData));
  }

  /* ---------- تب «رخدادها»: خط زمانیِ روزبه‌روز — همان «رویدادهای اخیر»ِ پنل مدیر (مهر ۱۴۰۵) ---------- */
  const GROUPS = [["", "همه"], ["asg", "ارجاع و تصمیم‌های مدیر"], ["work", "کار کارشناسان"], ["chat", "مکاتبات و پیامک"], ["support", "پشتیبانی"]];
  const BY = { manager: "مدیر", expert: "کارشناس", ai: "🤖 کارشناس هوشمند", supplier: "تأمین‌کننده", support: "پشتیبانی", system: "سامانه" };
  const BY_IC = { manager: "flag", expert: "user", ai: "settings", supplier: "chat", support: "key", system: "data" };
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
    const seq = (S.logSeq = (S.logSeq || 0) + 1);
    try {
      const r = await api("/activity?" + qs);
      if (seq !== S.logSeq) return;
      if (more && S.log) { const have = new Set(S.log.map((x) => x.key)); S.log = S.log.concat(r.rows.filter((x) => !have.has(x.key))); }
      else S.log = r.rows;
      S.logMore = r.more; S.logNext = r.next;
    } catch (e) { if (seq !== S.logSeq) return; S.logErr = e.message; }
    S.logLoading = false; render();
  }
  const dayOfS = (ms) => fmtS(ms).split(" — ")[0];
  const timeOfS = (ms) => fmtS(ms).split(" — ")[1] || "";
  /** رخدادها روزبه‌روز؛ هر رخداد با کنشگر، درخواست و پیوند به گفت‌وگو یا ارجاعش */
  function feedTl(rows, withExpert) {
    if (!rows.length) return `<div class="lg-none">${TP.ui.ICON.clock}<b>رخدادی نیست</b></div>`;
    const groups = [];
    rows.forEach((x) => { const d = dayOfS(x.at), g = groups[groups.length - 1]; if (g && g[0] === d) g[1].push(x); else groups.push([d, [x]]); });
    return `<div class="lg-tl sv-tl" data-keep-scroll>${groups.map(([d, list]) => `<div class="lg-day"><h4>${esc(d)}</h4>${list.map((x) => `<div class="lg-ev sv-by-${esc(x.by)}">
        <span class="lg-ic" aria-hidden="true">${x.by === "ai" ? "🤖" : TP.ui.ICON[BY_IC[x.by] || "data"]}</span>
        <div class="lg-eb"><div class="lg-et"><span class="by by-${esc(x.by)}">${BY[x.by] || esc(x.by)}</span>${withExpert && x.expert_id ? `<span class="lg-who">${esc(exName(x.expert_id))}</span>` : ""}
            ${x.request_id ? `<button type="button" class="chip num sv-rchip" data-lrid-set="${esc(x.request_id)}" title="فقط رخدادهای همین درخواست">${esc(x.request_id)}</button>` : ""}${x.demo ? `<span class="chip mock">دمو</span>` : ""}</div>
          <div class="lg-ed">${esc(x.text)}</div>
          ${x.thread_id || x.assignment_id ? `<div class="sv-lacts">${x.thread_id ? `<button class="tp-btn xs" data-th-open="${x.thread_id}">💬 گفت‌وگو</button>` : ""}${x.assignment_id ? `<button class="tp-btn xs" data-asg="${x.assignment_id}">${TP.ui.ICON.more} ارجاع</button>` : ""}</div>` : ""}</div>
        <time title="${esc(fmtS(x.at))}">${esc(timeOfS(x.at))}</time></div>`).join("")}</div>`).join("")}</div>`;
  }
  function vLog() {
    const f = S.logF;
    const act = [];
    if (f.from) act.push(["از", f.from, "from"]);
    if (f.to) act.push(["تا", f.to, "to"]);
    if (f.expert) act.push(["کارشناس", exName(f.expert), "expert"]);
    if (f.rid) act.push(["درخواست", f.rid, "rid"]);
    let h = `<div class="lg-wrap sv-log ${TP.ui.once("sup.log")}"><section class="tp-box"><div class="tp-box-h"><span class="bi">${TP.ui.ICON.clock}</span><h2>رخدادها</h2>
        <span class="sub">${S.log ? `${M(S.log.length)} رخداد` : ""}${S.logLoading ? " · …" : ""}</span>
        <span class="end"><button type="button" class="mg-fbtn ${S.lfOpen ? "on" : ""}" data-lfopen aria-expanded="${S.lfOpen ? "true" : "false"}" title="فیلترها">${FUNNEL}<span>فیلتر</span>${act.length ? `<i class="badge">${M(act.length)}</i>` : ""}</button></span></div>
      ${act.length ? `<div class="mg-chips sv-lchips">${act.map(([l, v, k]) => `<button type="button" class="mg-chip" data-ldrop="${k}" title="برداشتن این فیلتر">${esc(l)}: <b>${esc(v)}</b> ${TP.ui.ICON.x}</button>`).join("")}</div>` : ""}
      ${S.lfOpen ? `<div class="mg-fpanel" role="region" aria-label="فیلترهای رخدادها">
        <div class="mg-frow"><span class="lab">از</span><input class="tp-input date ${f.from ? "on" : ""}" data-ld="from" value="${esc(f.from)}" placeholder="تاریخ" readonly style="width:120px">
          <span class="lab">تا</span><input class="tp-input date ${f.to ? "on" : ""}" data-ld="to" value="${esc(f.to)}" placeholder="تاریخ" readonly style="width:120px"></div>
        <div class="mg-frow"><span class="lab">کارشناس</span><select class="tp-select" data-lf="expert"><option value="">همه</option>${expertOpts(f.expert)}</select>
          <span class="lab">درخواست</span><input class="tp-input ${f.rid ? "on" : ""}" data-lrid value="${esc(f.rid)}" placeholder="شمارهٔ درخواست ↵" style="width:160px" dir="ltr"></div>
        <div class="mg-ffoot"><button class="tp-btn sm" data-lclear>پاک کردن همه</button><span class="spacer"></span><button class="tp-btn primary" data-lfopen>${TP.ui.ICON.check} بستن</button></div></div>` : ""}
      <div class="tp-pills lg-cats">${GROUPS.map(([k, l]) => `<button type="button" class="tp-pill ${f.g === k ? "on" : ""}" data-lg="${k}" aria-pressed="${f.g === k ? "true" : "false"}">${l}</button>`).join("")}</div>`;
    if (S.logErr) h += `<div class="tp-note warn">${esc(S.logErr)}</div>`;
    if (!S.log) return h + (S.logLoading ? `<div class="empty">در حال بارگذاری…</div>` : "") + `</section></div>`;
    h += feedTl(S.log, true);
    if (S.logMore) h += `<div class="sv-more"><button class="tp-btn" data-lmore ${S.logLoading ? "disabled" : ""}>رخدادهای قدیمی‌تر</button></div>`;
    return h + `</section></div>`;
  }

  /* ---------- تب «تأیید کمیسیون» ---------- */
  async function loadCm() {
    S.cmLoading = true; S.cmErr = ""; render();
    const qs = new URLSearchParams({ scope: S.cmF.scope });
    if (S.cmF.expert) qs.set("expert", S.cmF.expert);
    const seq = (S.cmSeq = (S.cmSeq || 0) + 1);
    try { const r = await api("/commission?" + qs); if (seq !== S.cmSeq) return; S.cm = r.items || []; S.cmMin = r.min || 1; }
    catch (e) { if (seq !== S.cmSeq) return; S.cmErr = e.message; }
    S.cmSel = new Set([...S.cmSel].filter((id) => (S.cm || []).some((i) => i.id === id)));
    S.cmLoading = false; render();
  }
  const cmRows = () => (S.cm || []).filter((i) => !S.cmF.q || TP.hit(i.request_id, S.cmF.q) || TP.hit(i.title, S.cmF.q) || TP.hit(i.party, S.cmF.q) || TP.hit(i.final_sup, S.cmF.q));
  /* کارت برای هر ارجاع: اقلامش با برنده، قیمت و وضعیتِ تأیید؛ «🏆 نتیجه و تأیید» یک‌جا برای همان ارجاع (مهر ۱۴۰۵) */
  const CM_SCOPE = [["ready", "جدول کمیسیون ساخته شده"], ["open", "همهٔ اقلامِ باز"], ["ok", "تأییدشده‌ها"]];
  function cmCard(g, i) {
    const its = g.items, a = its[0], okN = its.filter((x) => x.commission_ok).length, allOk = okN === its.length;
    const picked = its.filter((x) => S.cmSel.has(x.id)).length;
    return `<article class="sv-cm ${allOk ? "ok" : ""}" style="--i:${Math.min(i, 12)}">
      <header><label class="sv-chk" title="انتخابِ همهٔ اقلامِ این ارجاع"><input type="checkbox" data-cgrp="${a.aid}" ${picked === its.length ? "checked" : ""} aria-label="انتخابِ همهٔ اقلامِ درخواست ${esc(a.request_id)}"></label>
        <span class="rid num">${esc(a.request_id)}</span><span class="dim">${esc(a.date || "")}</span>
        <span class="who">${avOf(exName(a.expert_id), "")}${esc(exName(a.expert_id))}</span>
        <span class="chip ${allOk ? "ok" : okN ? "info" : ""}" title="تأیید کمیسیون">🏆 ${M(okN)}/${M(its.length)}</span></header>
      <div class="rproj">${TP.ui.ICON.project}<span>${esc(a.party || "—")}</span>${a.commission_no ? `<button class="chip sv-cmno" data-cmprev="${a.aid}" title="پیش‌نمایشِ جدول کمیسیون — ${esc(fmtS(a.commission_at))}">TSA-PS-FO-${esc(a.commission_no)}</button>` : `<span class="chip">جدول کمیسیون ساخته نشده</span>`}</div>
      <div class="sv-cmits">${its.map((x) => `<label class="sv-cmit ${x.commission_ok ? "ok" : ""}"><input type="checkbox" data-cpick="${x.id}" ${S.cmSel.has(x.id) ? "checked" : ""} aria-label="انتخابِ ${esc(x.title)}">
          <span class="t"><b>${esc(x.title)}</b><small class="num">${x.qty == null ? "" : M(x.qty)} ${esc(x.unit || "")} · ${M(x.saved)} استعلام${x.saved < S.cmMin ? ` <span class="chip warn" title="کمتر از حداقل استعلامِ مدیر (${M(S.cmMin)})">کم</span>` : ""}</small></span>
          <span class="w">${x.cr_winner ? `<b title="برندهٔ ثبت‌شدهٔ کمیسیون">🏆 ${esc(x.cr_winner)}</b><small class="num">${x.cr_price == null ? "—" : M(x.cr_price)} ریال</small>`
            : x.finals ? `<b>${esc(x.final_sup)}</b><small class="num">${x.final_price == null ? "—" : M(x.final_price)} ریال · تأیید نهایی</small>` : `<span class="chip warn">تأیید نهایی ندارد</span>`}</span>
          <span class="s">${x.commission_ok ? `<span class="chip ok">✓ تأیید شد</span><button type="button" class="tp-btn xs danger" data-cone="${x.id}" data-ok="0">برداشتن</button>` : `<span class="chip">منتظر</span>`}</span></label>`).join("")}</div>
      <footer>${allOk ? "" : `<button class="tp-btn primary" data-cres="${a.aid}" title="برنده و علتِ هر قلم؛ تأیید کمیسیون و پیامِ تشکر به بقیه">🏆 نتیجه و تأیید</button>`}
        <button class="tp-btn" data-asg="${a.aid}">${TP.ui.ICON.more} جزئیات</button>${a.commission_no ? `<button class="tp-btn" data-cmdl="${a.aid}" data-rid="${esc(a.request_id)}">${TP.ui.ICON.upload} اکسل</button>` : ""}</footer></article>`;
  }
  function vCm() {
    const rows = cmRows(), sel = rows.filter((i) => S.cmSel.has(i.id));
    const nOn = sel.filter((i) => !i.commission_ok).length, nOff = sel.filter((i) => i.commission_ok).length;
    const groups = []; rows.forEach((x) => { const g = groups.find((y) => y.aid === x.aid); if (g) g.items.push(x); else groups.push({ aid: x.aid, items: [x] }); });
    let h = `<div class="mg-bar"><div class="tp-pills">${CM_SCOPE.map(([k, l]) => `<button type="button" class="tp-pill ${S.cmF.scope === k ? "on" : ""}" data-cscope="${k}" aria-pressed="${S.cmF.scope === k ? "true" : "false"}">${l}</button>`).join("")}</div>
        <select class="tp-select" data-cf="expert" aria-label="کارشناس"><option value="">همهٔ کارشناسان</option>${expertOpts(S.cmF.expert)}</select>
        <input class="tp-input sv-q" data-fq="cm" value="${esc(S.cmF.q)}" placeholder="شماره، قلم، طرف مقابل یا تأمین‌کننده" aria-label="جستجو در اقلام">
        <span class="spacer"></span><span class="mg-count">${S.cm ? `<b>${M(rows.length)}</b> قلم در ${M(groups.length)} ارجاع` : ""}${S.cmLoading ? " · …" : ""}</span></div>`;
    if (S.cmErr) h += `<div class="tp-note warn">${esc(S.cmErr)}</div>`;
    if (!S.cm) return h + (S.cmLoading ? `<div class="empty">در حال بارگذاری…</div>` : "");
    if (!rows.length) return h + `<div class="lg-none">${TP.ui.ICON.check}<b>قلمی نیست</b>${S.cmF.scope === "ready" ? `<span>هنوز جدول کمیسیونِ ارجاعِ بازی ساخته نشده.</span><button class="tp-btn" data-cscope="open">همهٔ اقلامِ باز</button>` : ""}</div>`;
    h += `<div class="sv-cmbar ${S.cmSel.size ? "on" : ""}"><button class="tp-btn sm" data-csel="${sel.length === rows.length ? "none" : "all"}">${sel.length === rows.length ? "لغو انتخاب" : `انتخاب همه (${M(rows.length)})`}</button>
        ${S.cmSel.size ? `<span class="dim">${M(sel.length)} قلم انتخاب شده</span><span class="spacer"></span>
        <button class="tp-btn sm primary" data-cok="1" ${nOn ? "" : "disabled"}>🏆 نتیجه و تأییدِ ${M(nOn)} قلم</button>
        <button class="tp-btn sm danger" data-cok="0" ${nOff ? "" : "disabled"}>برداشتن تأییدِ ${M(nOff)} قلم</button>` : ""}</div>
      <div class="sv-cms ${TP.ui.once("sup.cm")}">${groups.map(cmCard).join("")}</div>`;
    return h;
  }
  /** «🏆 نتیجهٔ کمیسیون» (cm-result.js): برنده و علتِ هر قلم، تیکِ تأیید و پیامِ تشکر به بقیه */
  function cmResult(aid, then) {
    window.TP_CMRES.open({ api, aid, onDone: async (r) => {
      S.cmSel.clear();
      await Promise.all([S.tab === "cm" ? loadCm() : null, loadExperts().catch(() => {})]);
      if (then) then(r);
    } });
  }
  function cmResultQueue(aids) { if (aids.length) cmResult(aids[0], () => cmResultQueue(aids.slice(1))); }
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
  const AI_VIEWS = [["list", "👥 کارشناسان و کارها"], ["rules", "⚙️ قواعدِ حداقلِ استعلام"], ["rank", "🏅 رتبه‌بندی و دعوت"], ["usd", "💵 نرخ دلار"], ["md", "🧭 حالت اقلام"], ["sw", "🎛 کلیدها"]];
  /** راهنمای هر زیرنمای تبِ هوشمند */
  const aiHelp = () => (S.aiView === "list" || S.aiEx ? "support.ai" : `support.${S.aiView}`);
  const aiCost = (c) => (c ? `$${Number(c).toFixed(c < 1 ? 4 : 2)}` : "—");
  function aiCard(e, i) {
    return `<article class="sv-ai ${e.on ? "on" : ""}" style="--i:${Math.min(i, 14)}">
      <header>${avOf(e.name, e.label, "lg")}<div class="t"><b>${e.senior ? `<span class="sv-star" title="کارشناس ارشد">★</span>` : ""}${esc(e.label || e.name)}</b>
          <small>${e.tg ? "تلگرام وصل" : `<span title="تلگرامِ کارشناس وصل نیست؛ پرسش‌ها فقط در پنلش دیده می‌شوند">بی تلگرام</span>`}${e.on && e.on_at ? ` · هوشمند از ${esc(fmtShort(e.on_at))}` : ""}</small></div>
        <div class="tp-seg sm sv-mode" role="group" aria-label="حالتِ ${esc(e.label || e.name)}">
          <button type="button" class="${e.on ? "on" : ""}" ${e.on ? "aria-pressed=\"true\"" : `data-aitoggle="${e.id}" data-on="1" aria-pressed="false"`} title="${e.on ? "هوشمند است" : "کلیک: هوشمند شود"}">🤖 هوشمند</button>
          <button type="button" class="${e.on ? "" : "on"}" ${e.on ? `data-aitoggle="${e.id}" data-on="0" aria-pressed="false"` : "aria-pressed=\"true\""} title="${e.on ? "کلیک: دستی شود" : "دستی است"}">✋ دستی</button></div></header>
      <div class="sv-ms sv-ms4">${metric("کارِ زنده", e.live)}${metric("همهٔ کارها", e.runs)}${metric("پرسش", e.asks, "warn")}<span class="sv-m"><b class="num" dir="ltr">${aiCost(e.cost)}</b><small>هزینهٔ مدل</small></span></div>
      <footer><button class="tp-btn sm" data-aiex="${e.id}">${TP.ui.ICON.data} داشبورد</button></footer></article>`;
  }
  function vAi() {
    if (S.aiEx && window.TP_AI) {
      return `<div class="sv-aiback"><button class="tp-btn sm" data-aiback>→ همهٔ کارشناسان</button>${avOf(exName(S.aiEx), "")}<b>${esc(exName(S.aiEx))}</b></div>${window.TP_AI.view(S)}`;
    }
    const sub = `<div class="sv-aibar"><div class="tp-seg sm sv-aiseg" role="tablist">${AI_VIEWS.map(([k, l]) => `<button type="button" role="tab" class="${S.aiView === k ? "on" : ""}" aria-selected="${S.aiView === k}" data-aiview="${k}">${l}</button>`).join("")}</div>
</div>`;
    if (S.aiView === "rules") return sub + vRules();
    if (S.aiView === "usd") return sub + vUsd();
    if (S.aiView === "rank") return sub + vRank();
    if (S.aiView === "sw") return sub + vSw();
    if (S.aiView === "md") return sub + vMd();
    let h = sub;
    if (S.aiErr) h += `<div class="tp-note warn">${esc(S.aiErr)}</div>`;
    if (!S.ai) return h + (S.aiLoading ? `<div class="empty">در حال بارگذاری…</div>` : "");
    const A = S.ai;
    h += `<div class="sv-aiwrap ${TP.ui.once("sup.ai")}">`;
    if (!A.sms) h += `<div class="tp-note warn">درگاه پیامک (TextBee) وصل نیست — پیامک‌ها شبیه‌سازی می‌شوند.</div>`;
    if (A.asks.length) {
      h += `<h4 class="sv-h">🚨 پرسش‌های بی‌پاسخ از کارشناسان <span class="chip warn">${M(A.asks.length)}</span></h4>
        <div class="sv-asks">${A.asks.map((x) => `<article class="sv-ask"><header>${avOf(exName(x.expert_id), "")}<b>${esc(exName(x.expert_id))}</b><span class="chip num">${esc(x.request_id)}</span><span class="dim">${esc(fmtShort(x.at))}</span></header>
          <div class="sv-askq"><span class="dim">${esc(x.supplier)}:</span> ${esc(x.q)}</div>
          <footer><button class="tp-btn sm" data-th-open="${x.thread_id}">💬 گفت‌وگو</button></footer></article>`).join("")}</div>`;
    }
    if (A.handovers && A.handovers.length) {
      h += `<h4 class="sv-h">⚠️ واگذار به کارشناس — مهلتِ حداقلِ استعلام گذشت <span class="chip warn">${M(A.handovers.length)}</span></h4>
        <div class="sv-asks">${A.handovers.map((x) => `<article class="sv-ask ho"><header>${avOf(exName(x.expert_id), "")}<b>${esc(exName(x.expert_id))}</b><span class="chip num">${esc(x.request_id)}</span><span class="dim">${esc(fmtShort(x.at))}</span></header>
          <div class="sv-askq">${x.items.map((i) => `${esc(i.title)} <b>${M(i.have)} از ${M(i.need)}</b>`).join("، ")}</div>
          <footer><button class="tp-btn sm" data-asg="${x.assignment_id}">${TP.ui.ICON.more} جزئیات</button><button class="tp-btn sm" data-aiex="${x.expert_id}">${TP.ui.ICON.data} داشبورد</button></footer></article>`).join("")}</div>`;
    }
    const on = A.experts.filter((e) => e.on).length;
    h += `<h4 class="sv-h">کارشناسان <span class="chip">${M(on)} هوشمند از ${M(A.experts.length)}</span></h4>
      <div class="sv-aigrid">${A.experts.slice().sort((a, b) => (b.on ? 1 : 0) - (a.on ? 1 : 0)).map(aiCard).join("")}</div></div>`;
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
    let h = "";
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
      <span class="end">${S.chg ? `${M(S.chg.length)} قلم${S.chgMore ? "+" : ""}` : ""}${S.chgLoading ? " · در حال بارگذاری…" : ""}</span></div>`;
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
      ${x.lines.length ? `<ul style="margin:0;padding-inline-start:20px;line-height:1.9">${x.lines.map((l) => `<li>${TP.rtlArrow(esc(l))}</li>`).join("")}</ul>`
        : x.has_sugg ? `<div style="color:#86efac">✓ بی‌تغییر — همان پیشنهادِ سامانه تأیید شد (همه 🔒).</div>`
        : `<div class="dim">پیشنهادِ سامانه برای این قلم ثبت نشده (پیش از این بخش نرمال شده بود).</div>`}
      ${x.reason ? `<div class="chg-why">📝 علتِ کارشناس: <b>${esc(x.reason)}</b></div>` : ""}
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
          <td class="rt" style="white-space:normal">${c.lines.length ? c.lines.map((l) => `<div>${TP.rtlArrow(esc(l))}</div>`).join("") : `<span class="dim">${c.kind === "norm" || c.kind === "freeze" ? "بی‌تغییر" : "—"}</span>`}${c.reason ? `<div class="chg-why">📝 علت: ${esc(c.reason)}</div>` : ""}</td></tr>`).join("")}</tbody></table></div>`
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
    let h = "";
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
    let h = "";
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
    let h = "";
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
    let h = "";
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
  const DL_ST = [["new", "منتظرِ بررسی"], ["ok", "تأییدشده"], ["rejected", "ردشده"], ["", "همه"]];
  function dlCard(x, i) {
    return `<article class="sv-dl ${x.review.state || ""}" data-dlopen="${x.id}" role="button" tabindex="0" style="--i:${Math.min(i, 12)}" aria-label="تحویلِ درخواست ${esc(x.request_id)}">
      <header><span class="rid num">${esc(x.request_id)}</span>${REV_CHIP[x.review.state] || ""}${x.short.length ? ` <span class="chip warn" title="${esc(x.short.map((c) => `${c.title}: ${c.have} از ${c.need}`).join("، "))}">⚠️ کمتر از حد</span>` : ""}</header>
      <div class="rproj">${TP.ui.ICON.project}<span>${esc(x.party || "—")}</span></div>
      <div class="who">${avOf(exName(x.expert_id), "")}<span>${esc(exName(x.expert_id))}</span><span class="dim">· ${esc(fmtShort(x.review.at || x.finished_at))}</span></div>
      <div class="sv-ms">${metric("اقلام", x.items)}${metric("پیشنهادِ نهایی", x.finals)}${metric("کمیسیون تأییدشده", x.ok_items, "info")}</div>
      <footer>${x.commission_no ? `<span class="chip">TSA-PS-FO-${esc(x.commission_no)}</span>` : `<span class="dim">جدول کمیسیون ساخته نشده</span>`}<span class="spacer"></span><span class="tp-btn sm ${x.review.state === "new" ? "primary" : ""}">بررسی ‹</span></footer></article>`;
  }
  function vDl() {
    if (S.dlId) return vDlOne();
    let h = `<div class="mg-bar"><div class="tp-pills">${DL_ST.map(([k, l]) => `<button type="button" class="tp-pill ${S.dlF.state === k ? "on" : ""}" data-dlst="${k}" aria-pressed="${S.dlF.state === k}">${l}</button>`).join("")}</div>
      <span class="spacer"></span><span class="mg-count">${S.dl ? `<b>${M(S.dl.length)}</b> تحویل` : ""}${S.dlLoading ? " · …" : ""}</span></div>`;
    if (S.dlErr) h += `<div class="tp-note warn">${esc(S.dlErr)}</div>`;
    if (!S.dl) return h + (S.dlLoading ? `<div class="empty">در حال بارگذاری…</div>` : "");
    if (!S.dl.length) return h + `<div class="lg-none">${TP.ui.ICON.check}<b>تحویلی نیست</b>${S.dlF.state === "new" ? "<span>تحویلِ بررسی‌نشده‌ای نمانده.</span>" : ""}</div>`;
    return h + `<div class="sv-dls ${TP.ui.once("sup.dl")}">${S.dl.map(dlCard).join("")}</div>`;
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
    if (ok && S.dlD && S.dlD.run && S.dlD.run.id === id) return cmResult(S.dlD.run.assignment_id, () => dlSend(id, { ok: true }));
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
    loadAlarms();
    let r; try { r = await api("/ai/experts"); } catch (_) { return; }
    S.ai = r;
    const typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (S.tab === "ai" && !S.aiEx && S.aiView === "list") { if (!typing) render(); return; }
    /* شمارِ تب‌ها بی رسمِ کلِ صفحه؛ منوی بازِ «هوشمند» یا «گزارش‌ها» بسته نمی‌شود */
    const bar = app.querySelector(".tp-subbar"); if (bar && !bar.querySelector(".tp-menu.open")) bar.outerHTML = vTabs();
  }
  setInterval(aiPulse, 45000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) aiPulse(); });
  /* هشدارها (worker/alarms.js) — نوارِ بالای پنل، «دیدم» جداگانهٔ پشتیبان */
  async function loadAlarms() {
    try {
      const r = await api("/alarms");
      const sig = (x) => (x || []).map((a) => a.id).join(",");
      if (sig(r.alarms) !== sig(S.alarms)) { S.alarms = r.alarms || []; const typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName); if (!typing) render(); }
    } catch (_) { /* بعداً */ }
  }
  async function alarmAckUi(id) {
    try { await api(`/alarms/${id}/ack`, { body: {} }); S.alarms = S.alarms.filter((a) => a.id !== id); render(); }
    catch (e) { TP.modal("نشد", esc(e.message), null, "باشد", ""); }
  }
  /** «📣 گیرندگان هشدار»: شمارهٔ پیامکِ مدیر و پشتیبان؛ وضعیتِ تلگرامِ هر دو */
  async function alertsDialog() {
    let c; try { c = await api("/alert-contacts"); } catch (e) { return TP.modal("نشد", esc(e.message), null, "باشد", ""); }
    const st = (on, cmd) => (on ? `<span class="chip ok">✅ وصل است</span>` : `<span class="chip">وصل نیست</span> <span class="dim">— بات اصلی را به گروهِ تلگرام اضافه کنید و در گروه بفرستید: <b dir="ltr">${cmd}</b></span>`);
    const d = TP.modal("📣 گیرندگان هشدار", `<div class="al-cfg">
        <div class="al-row"><b>مدیر</b><div>تلگرام: ${st(c.manager_tg, "/manager")}</div>
          <input class="tp-input" data-ap="manager_phone" inputmode="tel" dir="ltr" placeholder="شمارهٔ همراه برای پیامک (اختیاری)" value="${esc(c.manager_phone)}"></div>
        <div class="al-row"><b>پشتیبان</b><div>تلگرام: ${st(c.support_tg, "/support")}</div>
          <input class="tp-input" data-ap="support_phone" inputmode="tel" dir="ltr" placeholder="شمارهٔ همراه برای پیامک (اختیاری)" value="${esc(c.support_phone)}"></div>
        ${c.sms ? "" : `<div class="dim">درگاه پیامک وصل نیست؛ تا وصل شود فقط پنل و تلگرام خبر می‌دهند.</div>`}</div>`, async () => {
      const v = (k) => (d.querySelector(`[data-ap="${k}"]`) || {}).value || "";
      try { await api("/alert-contacts", { method: "PUT", body: { manager_phone: v("manager_phone"), support_phone: v("support_phone") } }); TP.ui.success("ذخیره شد"); }
      catch (e) { TP.modal("نشد", esc(e.message), null, "باشد", ""); }
    }, "ذخیره", "بستن");
  }
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
    if (S.tab === "td") return window.TP_TENDER ? window.TP_TENDER.view() : "";
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
    const restore = TP.snapScroll(), pos = chatPos();
    /* گفت‌وگوی تمام‌صفحه روی گوشیِ واقعی: صفحه ثابت و هم‌قدِ بخشِ دیدنی (ph-chat.js: lockView) */
    const mc = mChat();
    app.classList.toggle("sp-app", mc);
    PH.lockView(mc, mc);
    if (S.view === "boot") app.innerHTML = `<div class="empty">در حال بارگذاری…</div>`;
    else if (S.view === "login") { TP.ui.mountBg("fog"); app.innerHTML = vLogin(); TP.ui.help.set("login.support"); const f = app.querySelector("form[data-login-card]"); if (f) f.onsubmit = (e) => { e.preventDefault(); const b = f.querySelector("[data-do]"); if (b && !b.disabled) b.click(); }; }
    else if (mChat()) { TP.ui.mountBg(""); app.innerHTML = `<div class="sv-mfull">${thScreen(false)}</div>`; TP.ui.help.set("support.chat", { fab: false }); }
    else { TP.ui.mountBg(""); app.innerHTML = vTop() + TP.ui.alarmBar(S.alarms, (a) => (a.thread_id ? `<button class="tp-btn sm" type="button" data-th-open="${a.thread_id}">گفت‌وگو</button>` : "")) + `<div class="tp-wrap ${S.tab === "chat" && phoneMode ? "sv-wide" : ""}">${vTab()}</div>`; TP.ui.help.set(S.tab === "ai" ? aiHelp() : `support.${S.tab}`, S.tab === "chat" && phoneMode ? { side: "right" } : undefined); }
    restore();
    if (S.view === "app" && S.tab === "chat") afterChat(pos);
    /* مناقصه: نظرسنجیِ نمای زنده فقط وقتی همین تب پیداست */
    if (window.TP_TENDER) window.TP_TENDER.active(S.view === "app" && S.tab === "td");
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
    if (d.alarmAck) return alarmAckUi(Number(d.alarmAck));
    if (d.alerts !== undefined) return alertsDialog();
    if (d.do) return doAuth(d.do);
    if (d.mode) { S.mode = d.mode; S.err = ""; return render(); }
    if (d.asg) return openAsg(d.asg);
    if (d.cmprev) return cmPreview(d.cmprev);
    if (d.cmdl) { const b = TP.busy("ساختن فایل…", "جدول کمیسیون (اکسل)"); return download(`/assignments/${d.cmdl}/sheet/commission`, `کمیسیون-${d.rid || d.cmdl}.xlsx`).catch((e) => TP.modal("نشد", esc(e.message), null, "باشد", "")).finally(() => b.close()); }
    if (d.goto) return goto(d.goto, t);
    if (d.codes !== undefined) { S.codesOpen = !S.codesOpen; if (S.codesOpen && !S.codes) loadCodes(); return render(); }
    if (d.ex) return loadExpert(Number(d.ex));
    if (d.exback !== undefined) { S.exId = null; S.ex = null; loadExperts().catch(() => {}); return render(); }
    if (d.th) return openThread(Number(d.th));
    if (d.thback !== undefined) { S.thId = null; S.thData = null; return render(); }
    if (d.thinfo !== undefined) return thInfoSheet();
    if (d.thre !== undefined) { if (S.thId) openThread(S.thId, true); return loadThreads(); }
    /* درخواست‌ها: فیلترِ بازشونده، وضعیت، بازه، کشوی اقلام */
    if (d.rfopen !== undefined) { S.rfOpen = !S.rfOpen; return render(); }
    if (d.rst !== undefined) { const was = S.rf.status; S.rf.status = d.rst; return (d.rst === "closed" || d.rst === "stop") !== (was === "closed" || was === "stop") ? loadDesk() : render(); }
    if (d.rwin) { S.rf.win = d.rwin; S.rf.id = ""; return loadDesk(); }
    if (d.rdrop) { if (d.rdrop === "id") { S.rf.id = ""; return loadDesk(); } S.rf[d.rdrop] = ""; return render(); }
    if (d.rclear !== undefined) { const reload = !!S.rf.id || S.rf.win !== "7d"; S.rf = { win: "7d", project: "", expert: "", status: "", q: "", id: "" }; return reload ? loadDesk() : render(); }
    if (d.rtog) { S.rOpen[d.rtog] = !S.rOpen[d.rtog]; return render(); }
    /* رخدادها */
    if (d.lfopen !== undefined) { S.lfOpen = !S.lfOpen; return render(); }
    if (d.ldrop) { S.logF[d.ldrop] = ""; return loadLog(); }
    if (d.lg !== undefined) { S.logF.g = d.lg; return loadLog(); }
    /* تأیید کمیسیون */
    if (d.cscope) { S.cmF.scope = d.cscope; S.cmSel.clear(); return loadCm(); }
    if (d.thOpen) { S.thF = { expert: "", rid: "", q: "" }; S.th = null; setTab("chat"); return openThread(Number(d.thOpen)); }
    if (d.thfClear !== undefined) { S.thF.rid = ""; return loadThreads(); }
    if (d.ridClear !== undefined) { S.rf.id = ""; return loadDesk(); }
    if (d.lookup) { S.rf.id = d.lookup; S.rf.q = ""; return loadDesk(); }
    if (d.lmore !== undefined) return loadLog(true);
    if (d.lclear !== undefined) { S.logF = { from: "", to: "", expert: "", rid: "", g: "" }; return loadLog(); }
    if (d.lridSet) { S.logF.rid = d.lridSet; if (S.tab !== "log") { S.log = null; return setTab("log"); } return loadLog(); }
    if (d.ld) return TP.openDatePicker(t, (v) => { S.logF[d.ld] = v; loadLog(); }, { single: true });
    if (d.csel) { if (d.csel === "all") cmRows().forEach((i) => S.cmSel.add(i.id)); else S.cmSel.clear(); return render(); }
    if (d.cok !== undefined) {
      const ok = d.cok === "1"; const rows = cmRows().filter((i) => S.cmSel.has(i.id) && !!i.commission_ok !== ok);
      if (!rows.length) return;
      if (!ok) return cmSet(rows.map((i) => i.id), false);
      return cmResultQueue([...new Set(rows.map((i) => i.aid))]);
    }
    if (d.cres) return cmResult(Number(d.cres));
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
    if (d.dlst !== undefined) { S.dlF.state = d.dlst; return loadDls(); }
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
    const t = e.target.closest("[data-tab],[data-thback],[data-thinfo],[data-thre],[data-rfopen],[data-rst],[data-rwin],[data-rdrop],[data-rclear],[data-rtog],[data-lfopen],[data-ldrop],[data-lg],[data-cscope],[data-refresh],[data-logout],[data-pass],[data-do],[data-mode],[data-asg],[data-cmprev],[data-cmdl],[data-goto],[data-ex],[data-exback],[data-codes],[data-th],[data-th-open],[data-thf-clear],[data-rid-clear],[data-lookup],[data-lmore],[data-lclear],[data-lrid-set],[data-ld],[data-csel],[data-cok],[data-cone],[data-cres],[data-alarm-ack],[data-alerts],[data-aiex],[data-aiback],[data-aitoggle],[data-aiview],[data-radd],[data-rdel],[data-rsave],[data-rreset],[data-dlopen],[data-dlst],[data-dlback],[data-dlok],[data-dlrej],[data-dlrq],[data-dlrqf],[data-dlletter],[data-dlmd],[data-usdfetch],[data-usdman],[data-chglog],[data-chgmore],[data-rksave],[data-rkreset],[data-swtoggle],[data-mdsave],[data-mdreset],[data-mdadd],[data-mddel]");
    if (!t || !app.contains(t) || t.disabled) return;
    /* ردیفِ کارشناس قابل کلیک است؛ کلیکِ دکمهٔ «جزئیات» همان کار را می‌کند */
    act(t);
  });
  app.addEventListener("change", (e) => {
    const t = e.target, d = t.dataset;
    if (d.codeEx) return saveCode({ expert_id: Number(d.codeEx), code: t.value });
    if (d.codeMgr !== undefined) return saveCode({ manager: t.value });
    if (d.rf) { S.rf[d.rf] = t.value; if (d.rf === "win" || d.rf === "status") return loadDesk(); return render(); }
    if (d.thf) { S.thF[d.thf] = t.value; return loadThreads(); }
    if (d.lf) { S.logF[d.lf] = t.value; return loadLog(); }
    if (d.lrid !== undefined) { S.logF.rid = t.value.trim(); return loadLog(); }
    if (d.cf) { S.cmF[d.cf] = t.value; S.cmSel.clear(); return loadCm(); }
    if (d.cpick) { const id = Number(d.cpick); if (t.checked) S.cmSel.add(id); else S.cmSel.delete(id); return render(); }
    if (d.cgrp) { cmRows().filter((i) => String(i.aid) === d.cgrp).forEach((i) => (t.checked ? S.cmSel.add(i.id) : S.cmSel.delete(i.id))); return render(); }
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
    if (k === "req") S.rf.q = t.value; else if (k === "th") S.thF.q = t.value; else if (k === "cm") S.cmF.q = t.value; else if (k === "ex") S.exQ = t.value;
    TP.keepFocus(t, "fq", render);
  });
  app.addEventListener("keydown", (e) => {
    /* کارتِ کارشناس (role=button) با Enter و فاصله */
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("article[data-ex], article[data-dlopen]")) { e.preventDefault(); return act(e.target); }
    if (e.key !== "Enter") return;
    const t = e.target;
    if (S.view === "login" && t.tagName === "INPUT") { e.preventDefault(); const b = app.querySelector("[data-do]"); if (b && !b.disabled) doAuth(b.dataset.do); }
    else if (t.dataset && (t.dataset.lrid !== undefined || t.dataset.codeEx || t.dataset.codeMgr !== undefined)) { e.preventDefault(); t.blur(); }
  });
  window.addEventListener("tp-theme", render);

  /* تبِ «🔨 مناقصه» (tender-admin.js): همان api و رسمِ همین پنل */
  if (window.TP_TENDER) { window.TP_TENDER.configure({ api, render }); window.TP_TENDER.mount(app); }

  /* ---------- شروع ---------- */
  (async function boot() {
    render();
    if (sess.get()) await enter();
    else await loadStatus();
  })();
})();
