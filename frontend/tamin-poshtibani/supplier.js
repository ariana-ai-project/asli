/* ============================================================
   پنل تأمین‌کنندگان (دموی مهر ۱۴۰۵) — مرورگر و مینی‌اپ تلگرام
   ورود: لینک پیامک (#k=…) + رمز ۶ رقمیِ همان پیامک → نشست (localStorage).
   داخل تلگرام: initData مینی‌اپ (هدر X-TG-Init) — همان گفت‌وگویی که در بات وارد شده.
   تب‌ها: مشخصات اقلام (کارت هر قلم: لایه‌های قفل، لایهٔ تازه، مقدار/واحد/قیمت، پیوست‌ها) ·
          آمادهٔ ارسال (چند قلم با هم، و پیش‌فاکتورِ بسته‌های تأییدشده) · گفت‌وگو با کارشناس.
   وضعیت یکی است با بات تأمین‌کنندگان: هر تغییری این‌جا در بات هم دیده می‌شود و برعکس.
   ============================================================ */
(function () {
  "use strict";
  const API = "/tamin-poshtibani/api";
  const app = document.getElementById("app");
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const FA = "۰۱۲۳۴۵۶۷۸۹";
  const fa = (s) => String(s == null ? "" : s).replace(/\d/g, (d) => FA[+d]);
  const latin = (s) => String(s == null ? "" : s).replace(/[۰-۹]/g, (d) => FA.indexOf(d)).replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
  const toNum = (v) => { const s = latin(v).replace(/[,٬،\s]/g, "").replace(/٫/g, "."); if (!s) return null; const n = Number(s); return isFinite(n) && n >= 0 ? n : NaN; };
  const money = (n) => (n == null || !isFinite(n) ? "—" : fa(Math.round(Number(n)).toLocaleString("en-US")).replace(/,/g, "٬"));
  const qty = (n) => (n == null ? "—" : fa(String(Math.round(Number(n) * 1000) / 1000)));
  /* کدِ افزایشیِ قلم در پنل همین تأمین‌کننده — در پیام‌ها و بات هم همین کد می‌آید */
  const code = (l) => (l && l.no ? `<span class="sp-code">کد ${fa(l.no)}</span> ` : "");
  const EDITABLE = ["new", "draft", "returned", "ready"];
  const pad = (n) => String(n).padStart(2, "0");
  function when(ms) {
    try {
      const d = new Date(ms);
      const p = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: "Asia/Tehran", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
      return p;
    } catch (_) { const d = new Date(ms); return fa(`${pad(d.getHours())}:${pad(d.getMinutes())}`); }
  }

  /* ---------- پارامترهای ورود: لینک پیامک یا مینی‌اپ تلگرام ---------- */
  const hp = new URLSearchParams(location.hash.slice(1));
  const store = {
    get(k) { try { return localStorage.getItem(k) || ""; } catch (_) { return ""; } },
    set(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (_) { /* حالت خصوصی */ } },
    sget(k) { try { return sessionStorage.getItem(k) || ""; } catch (_) { return ""; } },
    sset(k, v) { try { sessionStorage.setItem(k, v); } catch (_) { /* حالت خصوصی */ } },
  };
  let tgData = hp.get("tgWebAppData") || "";
  if (tgData) store.sset("sp.tg", tgData); else tgData = store.sget("sp.tg");
  if (!tgData && /[?&]tg=1/.test(location.search)) tgData = "";
  const inTg = !!tgData;
  const key = hp.get("k") || store.get("sp.k");
  if (hp.get("k")) store.set("sp.k", hp.get("k"));
  if (inTg) {
    /* پوستهٔ تلگرام (روشن/تیره) اگر کاربر خودش چیزی انتخاب نکرده */
    try {
      const tp = JSON.parse(hp.get("tgWebAppThemeParams") || "null");
      const bg = tp && tp.bg_color;
      if (bg && !store.get("sp.theme")) {
        const v = parseInt(bg.slice(1), 16), lum = ((v >> 16) & 255) * 0.299 + ((v >> 8) & 255) * 0.587 + (v & 255) * 0.114;
        document.documentElement.dataset.theme = lum < 128 ? "dark" : "light";
      }
    } catch (_) { /* بی‌اهمیت */ }
    /* اسکریپت تلگرام فقط برای ready/expand؛ اگر بارگذاری نشد (فیلترینگ) صفحه بی آن کار می‌کند */
    const s = document.createElement("script"); s.src = "https://telegram.org/js/telegram-web-app.js"; s.async = true;
    s.onload = () => { try { window.Telegram.WebApp.ready(); window.Telegram.WebApp.expand(); } catch (_) { /* بی‌اهمیت */ } };
    document.head.appendChild(s);
  }

  const S = { session: store.get("sp.session"), me: null, threads: [], th: null, d: null, tab: "spec", dirty: new Set(), extra: {}, lastMsg: 0, rev: -1, unseen: 0, company: "تونل سد آریانا", labels: [], botLogin: null, busy: false };

  async function api(path, opt) {
    opt = opt || {};
    const headers = { Accept: "application/json", ...(opt.headers || {}) };
    if (opt.json !== undefined) headers["Content-Type"] = "application/json";
    if (inTg) headers["X-TG-Init"] = tgData; else if (S.session) headers["X-SP-Session"] = S.session;
    const res = await fetch(API + path, { method: opt.method || (opt.json !== undefined || opt.body ? "POST" : "GET"), headers, body: opt.json !== undefined ? JSON.stringify(opt.json) : opt.body });
    const txt = await res.text();
    let data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch (_) { data = { error: txt.slice(0, 200) }; }
    if (!res.ok) { const e = new Error((data && data.error) || `خطای سرور ${res.status}`); e.status = res.status; e.data = data; throw e; }
    return data;
  }

  function modal(title, body, onYes, yes, no) {
    const d = document.createElement("div"); d.className = "tp-modal-bg";
    d.innerHTML = `<div class="tp-modal" role="dialog" aria-modal="true"><h3>${title}</h3><div class="tp-body">${body}</div>
      <div class="tp-acts">${yes !== null ? `<button class="tp-btn primary" data-y>${yes || "باشد"}</button>` : ""}${no ? `<button class="tp-btn" data-n>${no}</button>` : ""}</div></div>`;
    document.body.appendChild(d);
    const y = d.querySelector("[data-y]"); if (y) y.onclick = () => { d.remove(); onYes && onYes(); };
    const n = d.querySelector("[data-n]"); if (n) n.onclick = () => d.remove();
    d.onclick = (e) => { if (e.target === d) d.remove(); };
    return d;
  }
  const say = (msg, title) => modal(title || "توجه", `<p style="white-space:pre-line">${esc(msg)}</p>`, null, "باشد");

  /* ---------- سرآیند ---------- */
  function top() {
    const dark = document.documentElement.dataset.theme === "dark";
    return `<header class="tp-top"><div class="brand"><img src="../assets/logo-new.jpg" alt=""><div><h1>پنل تأمین‌کنندگان</h1>
      <div class="sub">${S.me ? `${esc(S.me.name)}${S.me.demo ? " <span class=\"sp-tag\">فرضی</span>" : ""} · ` : ""}شرکت ${esc(S.company)}</div></div></div>
      <span class="spacer"></span><button class="tp-btn sm" data-theme-btn title="${dark ? "حالت روز" : "حالت شب"}">${dark ? "☀️" : "🌙"}</button>
      ${S.me ? `<button class="tp-btn xs" data-logout>خروج</button>` : ""}</header>`;
  }
  /* «data-theme» روی خودِ <html> است؛ دکمه نام دیگری دارد تا closest به ریشهٔ صفحه نرسد */
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-theme-btn]");
    if (b) {
      const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = t; store.set("sp.theme", t);
      b.textContent = t === "dark" ? "☀️" : "🌙";
    }
    if (e.target.closest("[data-logout]")) modal("خروج", "<p>بعد از خروج، برای ورود دوباره باید «ارسال رمز به پیامک» را بزنید.</p>", logout, "خروج", "انصراف");
  });

  /* ---------- ورود ---------- */
  function renderLogin(msg, ok) {
    S.me = null;
    app.innerHTML = `${top()}<div class="sp-center"><div class="sp-box">
      <h2>ورود به پنل تأمین‌کنندگان</h2>
      <p class="lead">رمز ۶ رقمیِ پیامک را وارد کنید. همین پنل را در تلگرام هم دارید (لینک دوم پیامک).</p>
      ${key ? `<input class="tp-input sp-pass" id="pw" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="••••••" aria-label="رمز ورود">
        <div class="sp-row" style="margin-top:12px"><button class="tp-btn primary sp-grow" id="go">ورود</button></div>
        <div class="sp-row" style="margin-top:10px"><button class="tp-btn sm" id="rs">📱 رمز ندارم — ارسال رمز به پیامک</button></div>`
        : `<div class="sp-err">لینک ورود ناقص است؛ لینک را از آخرین پیامک باز کنید.</div>`}
      <div id="msg" class="${ok ? "sp-ok" : "sp-err"}">${esc(msg || "")}</div>
      <p class="sp-muted" style="margin-top:16px">این پنل برای پاسخ به استعلام‌های خرید شرکت ${esc(S.company)} است: مشخصات و قیمت هر قلم، پیوست‌ها، پیش‌فاکتور و گفت‌وگو با کارشناس خرید.</p>
    </div></div>`;
    if (!key) return;
    const pw = $("#pw"), m = $("#msg");
    pw.focus();
    const go = async () => {
      m.className = "sp-err"; m.textContent = "";
      try {
        const d = await api("/sp/login", { json: { k: key, password: latin(pw.value).trim() } });
        S.session = d.session; store.set("sp.session", d.session);
        boot();
      } catch (e) { m.textContent = e.message; }
    };
    $("#go").onclick = go;
    pw.onkeydown = (e) => { if (e.key === "Enter") go(); };
    $("#rs").onclick = async () => {
      try { const d = await api("/sp/resend", { json: { k: key } }); m.className = "sp-ok"; m.textContent = `رمز تازه به ${d.to} پیامک شد.\n${d.note || ""}`; }
      catch (e) { m.className = "sp-err"; m.textContent = e.message; }
    };
  }

  async function logout() {
    try { await api("/sp/logout", { json: {} }); } catch (_) { /* نشست از قبل باطل */ }
    S.session = ""; store.set("sp.session", "");
    stopPoll();
    if (inTg) { app.innerHTML = `${top()}<div class="sp-center"><div class="sp-box"><h2>خارج شدید</h2><p class="lead">اتصال این گفت‌وگوی تلگرام برداشته شد. برای ورود دوباره، لینک پیامک را در بات باز کنید و «ارسال رمز به پیامک» را بزنید.</p></div></div>`; return; }
    renderLogin("خارج شدید. برای ورود دوباره «ارسال رمز به پیامک» را بزنید.", true);
  }

  /* ---------- راه‌اندازی ---------- */
  async function boot() {
    if (!inTg && !S.session) return renderLogin();
    try {
      const d = await api("/sp/me");
      S.me = d.me; S.threads = d.threads || []; S.labels = d.labels || []; S.company = d.company || S.company; S.botLogin = d.botLogin;
      if (!S.threads.length) { app.innerHTML = `${top()}<div class="sp-center"><div class="sp-box"><h2>فعلاً استعلامی نیست</h2><p class="lead">وقتی کارشناس خرید استعلامی بفرستد، همین‌جا دیده می‌شود.</p></div></div>`; return; }
      const want = parseInt(hp.get("t") || store.sget("sp.th"), 10);
      await openThread(S.threads.some((t) => t.id === want) ? want : S.threads[0].id);
      startPoll();
    } catch (e) {
      if (e.status === 401 && !inTg) { S.session = ""; store.set("sp.session", ""); return renderLogin(e.data && e.data.relogin ? "نشست شما تمام شده است؛ دوباره وارد شوید." : ""); }
      if (e.status === 404 && inTg) e.message = "این صفحهٔ تأمین‌کننده است؛ این گفت‌وگوی تلگرام به‌عنوان کارشناس وصل است.";
      app.innerHTML = `${top()}<div class="sp-center"><div class="sp-box"><h2>نشد</h2><p class="sp-err">${esc(e.message)}</p></div></div>`;
    }
  }

  async function openThread(id) {
    if (S.dirty.size && S.th !== id && !confirm("تغییرات ذخیره‌نشده دارید. بی ذخیره بروید؟")) return;
    S.th = id; store.sset("sp.th", String(id));
    S.dirty.clear(); S.extra = {};
    await loadThread();
  }
  async function loadThread() {
    const d = await api(`/sp/thread/${S.th}`);
    S.d = d; S.rev = d.thread.rev; S.lastMsg = d.msgs.length ? d.msgs[d.msgs.length - 1].id : 0;
    for (const l of d.lines) if (!S.dirty.has(l.id)) S.extra[l.id] = l.extra.slice();
    const t = S.threads.find((x) => x.id === S.th); if (t) t.unread = 0;
    render();
  }

  /* ---------- رسم ---------- */
  function tabBtn(id, label, n, warn) {
    return `<button class="sp-tab ${S.tab === id ? "on" : ""}" data-tab="${id}">${label}${n ? ` <span class="sp-badge ${warn ? "wait" : "soft"}">${fa(n)}</span>` : ""}</button>`;
  }
  function render() {
    const d = S.d, th = d.thread;
    const todo = d.lines.filter((l) => EDITABLE.includes(l.state) && l.state !== "ready").length;
    const ready = d.lines.filter((l) => l.state === "ready").length;
    const needPf = d.bundles.filter((b) => b.state === "approved").length;
    const keep = keepScroll();
    app.innerHTML = `${top()}<div class="sp-wrap">
      ${S.threads.length > 1 ? `<div class="sp-pills">${S.threads.map((t) => `<button class="sp-pill ${S.th === t.id ? "on" : ""}" data-th="${t.id}">استعلام ${esc(t.request_id)}${t.unread ? ` <span class="sp-badge">${fa(t.unread)}</span>` : ""}${t.need_pf ? ` <span class="sp-badge wait">پیش‌فاکتور</span>` : ""}</button>`).join("")}</div>` : ""}
      <div class="sp-row" style="margin-top:8px"><b>استعلام ${esc(th.request_id)}</b><span class="sp-muted">کارشناس خرید: ${esc(th.expert)}</span>
        <span class="sp-grow"></span>${S.botLogin && !inTg ? `<a class="tp-btn xs" href="${esc(S.botLogin)}" target="_blank" rel="noopener">🤖 همین پنل در تلگرام</a>` : ""}</div>
      <nav class="sp-tabs">${tabBtn("spec", "مشخصات اقلام", todo)}${tabBtn("ready", "آمادهٔ ارسال", ready + needPf, needPf > 0)}${tabBtn("chat", "گفت‌وگو", S.unseen)}</nav>
      <section id="pane">${S.tab === "spec" ? specPane() : S.tab === "ready" ? readyPane() : chatPane()}</section>
    </div>`;
    bind();
    keep();
    if (S.tab === "chat") { const c = $(".sp-chat"); if (c) c.scrollTop = c.scrollHeight; }
  }
  function keepScroll() { const y = window.scrollY; return () => window.scrollTo(0, y); }

  /* --- مشخصات --- */
  const fileRow = (f, ed) => `<div class="sp-file"><b>${esc(f.label)}</b><span class="nm" title="${esc(f.filename)}">${esc(f.filename || "")}${f.note ? ` — ${esc(f.note)}` : ""}</span>
    <button class="tp-btn xs" data-open-file="${f.id}">👁 دیدن</button>${ed ? `<button class="tp-btn xs danger" data-del-file="${f.id}">🗑</button>` : ""}</div>`;
  function lockedMsg(l) {
    return { submitted: "فرستاده شد؛ منتظر بررسی کارشناس.", approved: "مشخصات تأیید شد؛ پیش‌فاکتور را از تب «آمادهٔ ارسال» بفرستید.",
      proforma: "پیش‌فاکتور رسید؛ منتظر تأیید نهایی کارشناس.", final: "✓ تأیید نهایی شد.", rejected: "این قلم رد شد." }[l.state] || "";
  }
  /* «آمادهٔ ارسال» که خورد، کارت قفل می‌شود و فقط دو راه دارد: «✏️ ویرایش» (برگشت به پیش‌نویس) یا «📤 ارسال» */
  function lineCard(l) {
    const ed = EDITABLE.includes(l.state) && l.state !== "ready";
    const ro = ed ? "" : "readonly";
    const files = S.d.files.filter((f) => f.line_id === l.id);
    const extra = S.extra[l.id] || l.extra;
    const opts = S.labels.map((x) => `<option>${esc(x)}</option>`).join("") + `<option value="__o">سایر (برچسب دلخواه)…</option>`;
    return `<article class="sp-card" data-line="${l.id}">
      <header><h3>${code(l)}${esc(l.title)}</h3><span class="sp-st ${l.state}">${esc(l.state_fa)}</span></header>
      ${l.head ? `<div class="sp-muted">نوع قلم: ${esc(l.head)}</div>` : ""}
      <div class="sp-sec"><b>🔒 مشخصات کارشناس — قفل؛ اگر حرفی درباره‌اش دارید در «گفت‌وگو» بنویسید</b>
        <div class="sp-chips">${l.layers.length ? l.layers.map((x) => `<span class="sp-chip lock"><i>${esc(x.k)}:</i> ${esc(x.v)}</span>`).join("") : `<span class="sp-muted">—</span>`}</div></div>
      <div class="sp-sec"><b>➕ لایه‌های افزودهٔ شما (برند، استاندارد، کشور سازنده…)</b>
        <div class="sp-chips">${extra.length ? extra.map((x, i) => `<span class="sp-chip add"><i>${esc(x.k)}:</i> ${esc(x.v)}${ed ? `<button data-rm-layer="${i}" title="حذف">✕</button>` : ""}</span>`).join("") : `<span class="sp-muted">—</span>`}</div>
        ${ed ? `<div class="sp-addlayer"><input class="tp-input" data-nk placeholder="نام لایه (مثلاً برند)"><input class="tp-input" data-nv placeholder="مقدار"><button class="tp-btn sm" data-add-layer>افزودن</button></div>` : ""}</div>
      <div class="sp-sec"><div class="sp-grid4">
        <label>مقدار<input class="tp-input" data-f="qty" inputmode="decimal" value="${l.qty == null ? "" : esc(l.qty)}" ${ro}></label>
        <label>واحد<input class="tp-input" data-f="unit" value="${esc(l.unit || "")}" ${ro}></label>
        <label>قیمت واحد (ریال، بدون ارزش افزوده)<input class="tp-input" data-f="price" inputmode="numeric" value="${l.price == null ? "" : esc(l.price)}" ${ro}></label>
        <label>قیمت کل (ریال)<div class="sp-total" data-total>${money(l.total)}</div></label>
      </div><div class="sp-muted" style="margin-top:4px">خواستهٔ کارشناس: ${qty(l.req_qty)} ${esc(l.req_unit || "")}</div></div>
      <div class="sp-sec"><b>توضیح</b><textarea class="tp-input tp-textarea" data-f="note" rows="2" style="min-height:54px" ${ro}>${esc(l.note || "")}</textarea></div>
      <div class="sp-sec"><b>📎 پیوست‌ها — هر پیوست یک برچسب دارد</b><div class="sp-files">${files.map((f) => fileRow(f, ed)).join("") || `<span class="sp-muted">—</span>`}</div>
        ${!["final", "rejected"].includes(l.state) ? `<div class="sp-upl"><select class="tp-select" data-flabel>${opts}</select><input class="tp-input hide" data-flabel2 placeholder="برچسب دلخواه">
          <input class="tp-input" data-fnote placeholder="توضیح پیوست (اختیاری)"><input class="tp-input full" type="file" data-file accept=".pdf,image/*,.doc,.docx,.xls,.xlsx">
          <button class="tp-btn sm full" data-upload>بارگذاری پیوست</button></div>` : ""}</div>
      ${ed ? `<div class="sp-actions"><button class="tp-btn" data-save>ذخیره</button><button class="tp-btn primary" data-ready="1">✓ آمادهٔ ارسال</button></div>`
        : l.state === "ready" ? `<div class="sp-lockedmsg">✅ این قلم آمادهٔ ارسال است. برای تغییر «✏️ ویرایش»، برای فرستادن به کارشناس «📤 ارسال».</div>
          <div class="sp-actions"><button class="tp-btn" data-ready="0">✏️ ویرایش</button><button class="tp-btn primary" data-send-ready>📤 ارسال</button></div>`
        : `<div class="sp-lockedmsg">${esc(lockedMsg(l))}</div>`}
    </article>`;
  }
  function specPane() {
    const d = S.d;
    const ret = d.bundles.filter((b) => b.state === "returned" && b.comment).slice(-1)[0];
    return `${ret ? `<div class="tp-note warn">↩️ کارشناس برگرداند: ${esc(ret.comment)}</div>` : ""}
      <p class="sp-muted">برای هر قلم مقدار، واحد و قیمت واحد (ریال، بدون ارزش افزوده) را بنویسید — قیمت کل خودکار است — اگر لازم است لایهٔ تازه و پیوست اضافه کنید و «آمادهٔ ارسال» را بزنید؛ بعد «📤 ارسال». در تب «آمادهٔ ارسال» هم می‌شود چند قلم را با هم فرستاد.</p>
      ${d.lines.map(lineCard).join("")}`;
  }

  /* --- آمادهٔ ارسال --- */
  function readyPane() {
    const d = S.d;
    const ready = d.lines.filter((l) => l.state === "ready");
    const byId = new Map(d.lines.map((l) => [l.id, l]));
    const sum = ready.reduce((s, l) => s + (l.total || 0), 0);
    let h = `<div class="sp-card"><header><h3>اقلام آمادهٔ ارسال</h3></header>`;
    h += ready.length ? `<div class="sp-scroll"><table class="sp-table"><thead><tr><th></th><th>قلم</th><th>مقدار</th><th>واحد</th><th>قیمت واحد (ریال)</th><th>قیمت کل (ریال)</th></tr></thead><tbody>
      ${ready.map((l) => `<tr><td><input type="checkbox" data-pick="${l.id}" checked></td><td class="t">${code(l)}${esc(l.title)}</td><td>${qty(l.qty)}</td><td>${esc(l.unit || "")}</td><td>${money(l.price)}</td><td>${money(l.total)}</td></tr>`).join("")}
      </tbody><tfoot><tr><td></td><td class="t">جمع</td><td colspan="3"></td><td>${money(sum)}</td></tr></tfoot></table></div>
      <div class="sp-actions"><button class="tp-btn primary" data-submit>📤 ارسال مشخصات اقلام تیک‌خورده</button></div>`
      : `<p class="sp-muted">هنوز قلمی «آمادهٔ ارسال» نیست. در تب «مشخصات اقلام» هر قلم را کامل کنید و «آمادهٔ ارسال» بزنید.</p>`;
    h += `</div>`;
    const bundles = d.bundles.slice().reverse();
    if (bundles.length) h += `<h3 style="margin:18px 0 0;font-size:1rem">ارسال‌های شما</h3>`;
    for (const b of bundles) {
      const ls = b.line_ids.map((id) => byId.get(id)).filter(Boolean);
      h += `<div class="sp-bundle"><header><b>بستهٔ ${fa(b.id)}</b><span class="sp-st ${b.state}">${esc(b.state_fa)}</span><span class="sp-muted">${when(b.created_at)}</span></header>
        <div class="sp-muted">${ls.map((l) => `${code(l)}${esc(l.title)} — ${qty(l.qty)} ${esc(l.unit || "")} × ${money(l.price)}`).join("<br>")}</div>
        ${b.comment ? `<div class="sp-comment">${esc(b.comment)}</div>` : ""}
        ${b.state === "approved" ? `<div class="tp-note">مشخصات تأیید شد. پیش‌فاکتورِ همین ${fa(ls.length)} قلم را بارگذاری کنید — لایه‌ها، مقدار، واحد و قیمت واحدِ هر قلم و شرایط فاکتور (زمان تحویل، تسویه، ارزش افزوده) باید صریح در آن آمده باشد.</div>
          <div class="sp-row"><input class="tp-input sp-grow" type="file" data-pf-file="${b.id}" accept=".pdf,image/*"><button class="tp-btn primary sm" data-pf="${b.id}">بارگذاری پیش‌فاکتور</button></div>` : ""}
        ${b.state === "proforma" ? `<div class="sp-row"><span>📄 ${esc(b.pf ? b.pf.name : "")}</span><button class="tp-btn xs" data-open-pf="${b.id}">👁 دیدن</button>
          <span class="sp-grow"></span><input class="tp-input" type="file" data-pf-file="${b.id}" accept=".pdf,image/*" style="max-width:220px"><button class="tp-btn xs" data-pf="${b.id}">عوض کردن</button></div>
          <div class="sp-muted">منتظر بررسی و تأیید نهایی کارشناس.</div>` : ""}
        ${b.state === "final" ? `<div class="sp-ok">✓ تأیید نهایی شد.</div>` : ""}
      </div>`;
    }
    return h;
  }

  /* --- گفت‌وگو --- */
  function msgHtml(m) {
    if (m.kind === "event") return `<div class="sp-msg ev">${esc(m.body)}<time>${when(m.at)}</time></div>`;
    const me = m.who === "s";
    return `<div class="sp-msg ${me ? "me" : ""}"><span class="who">${me ? "شما" : `کارشناس — ${esc(S.d.thread.expert)}`}</span>${esc(m.body)}<time>${when(m.at)}</time></div>`;
  }
  function chatPane() {
    S.unseen = 0;
    return `<div class="sp-chat" id="chat">${S.d.msgs.length ? S.d.msgs.map(msgHtml).join("") : `<div class="sp-empty">هنوز پیامی نیست.</div>`}</div>
      <div class="sp-composer"><textarea class="tp-input" id="msgIn" placeholder="پیام به کارشناس خرید…" rows="2"></textarea><button class="tp-btn primary" id="sendMsg">ارسال</button></div>
      <p class="sp-muted">اگر دربارهٔ مشخصات قفل‌شده (مثلاً جنس یا اندازه) پیشنهاد دیگری دارید، همین‌جا بنویسید؛ تغییرش با کارشناس است.</p>`;
  }

  /* ---------- رفتار ---------- */
  function cardOf(el) { const c = el.closest("[data-line]"); return c ? { c, id: +c.dataset.line } : null; }
  function recalc(c) {
    const q = toNum($('[data-f="qty"]', c).value), p = toNum($('[data-f="price"]', c).value);
    $("[data-total]", c).textContent = q != null && p != null && !isNaN(q) && !isNaN(p) ? money(q * p) : "—";
  }
  function bind() {
    $$("[data-tab]").forEach((b) => { b.onclick = () => { S.tab = b.dataset.tab; render(); }; });
    $$("[data-th]").forEach((b) => { b.onclick = () => openThread(+b.dataset.th).catch((e) => say(e.message)); });
    $$("[data-f]").forEach((i) => { i.oninput = () => { const x = cardOf(i); S.dirty.add(x.id); if (i.dataset.f === "qty" || i.dataset.f === "price") recalc(x.c); }; });
    $$("[data-add-layer]").forEach((b) => {
      b.onclick = () => {
        const x = cardOf(b); const k = $("[data-nk]", x.c).value.trim(), v = $("[data-nv]", x.c).value.trim();
        if (!k || !v) return say("نام لایه و مقدارش را بنویسید.");
        const l = S.d.lines.find((y) => y.id === x.id);
        if (l.layers.some((y) => y.k.trim() === k)) return say(`«${k}» لایهٔ قفل‌شدهٔ کارشناس است؛ تغییرش فقط با مذاکره در گفت‌وگوست.`);
        S.extra[x.id] = [...(S.extra[x.id] || []).filter((y) => y.k !== k), { k, v }];
        S.dirty.add(x.id); rerenderCard(x.id);
      };
    });
    $$("[data-rm-layer]").forEach((b) => { b.onclick = () => { const x = cardOf(b); S.extra[x.id].splice(+b.dataset.rmLayer, 1); S.dirty.add(x.id); rerenderCard(x.id); }; });
    $$("[data-save]").forEach((b) => { b.onclick = () => saveLine(cardOf(b).id).then(() => loadThread()).catch((e) => say(e.message)); });
    $$("[data-ready]").forEach((b) => {
      b.onclick = async () => {
        const id = cardOf(b).id;
        try {
          if (S.dirty.has(id)) await saveLine(id);
          await api(`/sp/line/${id}/ready`, { json: { on: b.dataset.ready === "1" } });
          await loadThread();
        } catch (e) { say(e.message); }
      };
    });
    $$("[data-flabel]").forEach((s) => { s.onchange = () => $("[data-flabel2]", cardOf(s).c).classList.toggle("hide", s.value !== "__o"); });
    $$("[data-upload]").forEach((b) => { b.onclick = () => uploadFile(cardOf(b)); });
    $$("[data-open-file]").forEach((b) => { b.onclick = () => openUrl(`/sp/file/${b.dataset.openFile}/url`); });
    $$("[data-del-file]").forEach((b) => { b.onclick = () => modal("حذف پیوست", "<p>این پیوست حذف شود؟</p>", async () => { try { await api(`/sp/file/${b.dataset.delFile}`, { method: "DELETE" }); await loadThread(); } catch (e) { say(e.message); } }, "حذف", "انصراف"); });
    const sub = $("[data-submit]");
    if (sub) sub.onclick = () => submitDialog($$("[data-pick]").filter((x) => x.checked).map((x) => +x.dataset.pick));
    /* «📤 ارسال» روی کارتِ قلمِ آماده: همهٔ اقلامِ آمادهٔ همین استعلام (فهرستشان در پنجره هست) */
    $$("[data-send-ready]").forEach((b) => { b.onclick = () => submitDialog(S.d.lines.filter((l) => l.state === "ready").map((l) => l.id)); });
    $$("[data-pf]").forEach((b) => { b.onclick = () => uploadPf(+b.dataset.pf); });
    $$("[data-open-pf]").forEach((b) => { b.onclick = () => openUrl(`/sp/bundle/${b.dataset.openPf}/pf-url`); });
    const send = $("#sendMsg");
    if (send) {
      const inp = $("#msgIn");
      const go = async () => {
        const text = inp.value.trim(); if (!text) return;
        send.disabled = true;
        try { const r = await api(`/sp/thread/${S.th}/msg`, { json: { text } }); inp.value = ""; addMsgs(r.msgs); } catch (e) { say(e.message); }
        send.disabled = false; inp.focus();
      };
      send.onclick = go;
      inp.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); go(); } };
    }
  }
  function submitDialog(ids) {
    if (!ids.length) return say("دست‌کم یک قلم را تیک بزنید.");
    const ls = S.d.lines.filter((l) => ids.includes(l.id));
    modal("ارسال مشخصات", `<p>مشخصات ${fa(ids.length)} قلم برای کارشناس فرستاده شود؟ تا تصمیم کارشناس، این اقلام قابل ویرایش نیستند.</p>
      <p class="sp-muted">${ls.map((l) => `• ${code(l)}${esc(l.title)} — ${qty(l.qty)} ${esc(l.unit || "")} × ${money(l.price)} ریال`).join("<br>")}</p>`, async () => {
      try { await api(`/sp/thread/${S.th}/submit`, { json: { line_ids: ids } }); await loadThread(); say("فرستاده شد. نتیجهٔ بررسی را همین‌جا و در «گفت‌وگو» می‌بینید.", "✓ ارسال شد"); } catch (e) { say(e.message); }
    }, "📤 ارسال", "انصراف");
  }
  function rerenderCard(id) {
    const card = $(`[data-line="${id}"]`);
    const l = S.d.lines.find((x) => x.id === id);
    const vals = {}; $$("[data-f]", card).forEach((i) => { vals[i.dataset.f] = i.value; });
    const t = document.createElement("div"); t.innerHTML = lineCard(l);
    const fresh = t.firstElementChild; card.replaceWith(fresh);
    $$("[data-f]", fresh).forEach((i) => { if (vals[i.dataset.f] !== undefined) i.value = vals[i.dataset.f]; });
    recalc(fresh);
    bind();
  }
  async function saveLine(id) {
    const c = $(`[data-line="${id}"]`);
    const body = { extra: S.extra[id] || [] };
    $$("[data-f]", c).forEach((i) => { body[i.dataset.f] = i.value; });
    for (const f of ["qty", "price"]) { const n = toNum(body[f]); if (Number.isNaN(n)) throw new Error(f === "qty" ? "مقدار باید عدد باشد." : "قیمت واحد باید عدد باشد."); body[f] = n; }
    await api(`/sp/line/${id}`, { method: "PUT", json: body });
    S.dirty.delete(id);
  }
  async function uploadFile(x) {
    const sel = $("[data-flabel]", x.c).value;
    const label = sel === "__o" ? $("[data-flabel2]", x.c).value.trim() : sel;
    const file = $("[data-file]", x.c).files[0];
    if (!label) return say("برای پیوست یک برچسب بنویسید.");
    if (!file) return say("فایل را انتخاب کنید.");
    if (file.size > 20 * 1048576) return say("حجم فایل بیشتر از ۲۰ مگابایت است.");
    const note = $("[data-fnote]", x.c).value.trim();
    const b = $("[data-upload]", x.c); b.disabled = true; b.textContent = "در حال بارگذاری…";
    try {
      await api(`/sp/line/${x.id}/file?filename=${encodeURIComponent(file.name)}&label=${encodeURIComponent(label)}&note=${encodeURIComponent(note)}`,
        { method: "POST", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
      await loadThread();
    } catch (e) { say(e.message); b.disabled = false; b.textContent = "بارگذاری پیوست"; }
  }
  async function uploadPf(bid) {
    const inp = $(`[data-pf-file="${bid}"]`); const file = inp && inp.files[0];
    if (!file) return say("فایل پیش‌فاکتور (PDF یا عکس) را انتخاب کنید.");
    if (file.size > 20 * 1048576) return say("حجم فایل بیشتر از ۲۰ مگابایت است.");
    try {
      await api(`/sp/bundle/${bid}/proforma?filename=${encodeURIComponent(file.name)}`, { method: "POST", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
      await loadThread();
      say("پیش‌فاکتور رسید و برای کارشناس فرستاده شد.", "✓ بارگذاری شد");
    } catch (e) { say(e.message); }
  }
  async function openUrl(path) {
    const w = inTg ? null : window.open("", "_blank");
    try {
      const d = await api(path);
      if (inTg && window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.openLink) window.Telegram.WebApp.openLink(d.url);
      else if (w) w.location = d.url; else location.href = d.url;
    } catch (e) { if (w) w.close(); say(e.message); }
  }

  /* ---------- پیام‌های تازه (نظرسنجی سبک) ---------- */
  function addMsgs(list) {
    const fresh = (list || []).filter((m) => m.id > S.lastMsg);
    if (!fresh.length) return;
    S.d.msgs.push(...fresh); S.lastMsg = fresh[fresh.length - 1].id;
    const c = $("#chat");
    if (S.tab === "chat" && c) {
      const empty = $(".sp-empty", c); if (empty) empty.remove();
      c.insertAdjacentHTML("beforeend", fresh.map(msgHtml).join(""));
      c.scrollTop = c.scrollHeight;
    } else if (fresh.some((m) => m.who !== "s")) {
      S.unseen += fresh.filter((m) => m.who !== "s").length;
      const tab = $('[data-tab="chat"]'); if (tab) tab.innerHTML = `گفت‌وگو <span class="sp-badge">${fa(S.unseen)}</span>`;
    }
  }
  let timer = null, tick = 0;
  function startPoll() { stopPoll(); timer = setInterval(poll, 6000); }
  function stopPoll() { if (timer) clearInterval(timer); timer = null; }
  async function poll() {
    if (document.hidden || !S.th || S.busy) return;
    S.busy = true;
    try {
      const r = await api(`/sp/poll?t=${S.th}&since=${S.lastMsg}`);
      addMsgs(r.msgs);
      if (r.rev !== S.rev && !S.dirty.size && !(document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))) await loadThread();
      if (++tick % 5 === 0 && S.threads.length > 1) { const d = await api("/sp/me"); S.threads = d.threads || S.threads; }
    } catch (e) { if (e.status === 401 && !inTg) { stopPoll(); renderLogin("نشست شما تمام شده است؛ دوباره وارد شوید."); } }
    S.busy = false;
  }
  window.addEventListener("beforeunload", (e) => { if (S.dirty.size) { e.preventDefault(); e.returnValue = ""; } });

  boot();
})();
