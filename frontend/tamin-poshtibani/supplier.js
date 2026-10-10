/* ============================================================
   پنل تأمین‌کنندگان (دموی مهر ۱۴۰۵) — مرورگر و مینی‌اپ تلگرام
   ورود: لینک پیامک (#k=…) + رمز ۶ رقمیِ همان پیامک → نشست (localStorage).
   داخل تلگرام: initData مینی‌اپ (هدر X-TG-Init) — همان گفت‌وگویی که در بات وارد شده.

   چیدمان (درخواست مالک، مهر ۱۴۰۵):
   • دسکتاپ (از ۹۶۱ پیکسل): یک صفحه — چپ، گوشی با گفت‌وگوی زنده (ph-chat.js، همان طراحیِ مکاتباتِ کارشناس)؛ راست،
     مشخصات اقلام و درخواست: کارت هر قلم در سه کادر (مقدار و واحد و قیمت · شرایط فاکتور · نوع قلم و لایه‌ها)، «آمادهٔ
     ارسال» و «📤 ارسال» — که مشخصات را به‌شکل کارت در همان گفت‌وگو می‌نشاند — و ارسال‌ها و پیش‌فاکتور.
   • موبایل: فقط همان گفت‌وگو، با همهٔ کارهای بات تأمین‌کنندهٔ تلگرام همان‌جا (worker/sp-bot.js): منوی ثابت (📋 استعلام‌ها ·
     📦 اقلام · 💬 گفت‌وگو · 🚪 خروج)، کارت اقلام و کارت هر قلم با دکمه‌ها، پر کردن گام‌به‌گامِ مقدار و قیمت و شرایط،
     «✅ آمادهٔ ارسال» ← «✏️ ویرایش» یا «📤 ارسال» (با پیش‌فاکتور یا بی آن)، پیش‌فاکتور، پیوست. منوی بات در گوشیِ دسکتاپ هم هست.
   • پیامِ صوتی در هر دو (دکمهٔ میکروفون)؛ متنش برای کارشناس و کارشناس هوشمند پیاده می‌شود و این‌جا نشان داده نمی‌شود.
   • پیامِ کارشناس هوشمند همان پیامِ کارشناس است — «🤖» هیچ‌جا برای تأمین‌کننده نیست.
   وضعیت یکی است با بات تأمین‌کنندگان: هر تغییری این‌جا در بات هم دیده می‌شود و برعکس.
   ============================================================ */
(function () {
  "use strict";
  const PH = window.PH;
  const API = "/tamin-poshtibani/api";
  const app = document.getElementById("app");
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const { esc, fa, money, qty } = PH;
  const FA = "۰۱۲۳۴۵۶۷۸۹";
  const latin = (s) => String(s == null ? "" : s).replace(/[۰-۹]/g, (d) => FA.indexOf(d)).replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
  const toNum = (v) => { const s = latin(v).replace(/[,٬،\s]/g, "").replace(/٫/g, "."); if (!s) return null; const n = Number(s); return isFinite(n) && n >= 0 ? n : NaN; };
  /* کدِ افزایشیِ قلم در پنل همین تأمین‌کننده — در پیام‌ها و بات هم همین کد می‌آید */
  const code = (l) => (l && l.no ? `<span class="sp-code">کد ${fa(l.no)}</span> ` : "");
  const tag = (l, n = 60) => { const t = String(l.title || ""); return `${l.no ? `کد ${fa(l.no)} · ` : ""}${t.length > n ? t.slice(0, n - 1) + "…" : t}`; };
  const EDITABLE = ["new", "draft", "returned", "ready"];
  const FILLING = ["new", "draft", "returned"];
  const pad = (n) => String(n).padStart(2, "0");
  function when(ms) {
    try { return new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: "Asia/Tehran", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ms)); }
    catch (_) { const d = new Date(ms); return fa(`${pad(d.getHours())}:${pad(d.getMinutes())}`); }
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

  /* termsDraft: شرایطِ فاکتورِ در حالِ ویرایش در فرمِ راست (برای همهٔ اقلامِ استعلام یکی است). pfFile: پیش‌فاکتوری که با «📄
     پیش‌فاکتور +» همراهِ مشخصات می‌رود. bot: کارت‌های گذرای بات در گفت‌وگو ({id, after: شناسهٔ آخرین پیام، html}) و flow:
     گامِ نیمه‌کارهٔ بات (مقدار، قیمت، شرط، برچسب پیوست) که متنِ بعدیِ کادرِ پیام جوابِ آن است. pending: صوتی‌های در راه. */
  /* pfRead: «خوانش هوشمند پیش‌فاکتور» (پنل پشتیبانی). خاموش (پیش‌فرضِ فاز ۴ طرح «خرید هوشمند، کارشناس ناظر»): پیش‌فاکتور را
     سامانه از همین فیلدها می‌سازد — «👁 پیش‌نمایش پیش‌فاکتور» و بعد «ارسال»؛ پیش‌فاکتورِ خودِ تأمین‌کننده اختیاری و فقط پیوست است. */
  const S = { session: store.get("sp.session"), me: null, threads: [], th: null, d: null, tab: "spec", dirty: new Set(), extra: {}, lastMsg: 0, rev: -1,
    company: "تونل سد آریانا", labels: [], botLogin: null, busy: false, enums: {}, termFa: {}, termsDraft: null, termsDirty: false, pfFile: null,
    bot: [], seq: 0, flow: null, pending: [], outbox: [], drafts: {}, pfRead: false,
    /* wz: کارت‌های نوبتیِ «📝 پر کردن اطلاعات» ({line, steps, i, cardId}) · kbFull: کارتِ قلمی که «ویرایش یک مورد» را باز کرده ·
       formOpen: کارتِ فرمِ راست که به‌جای خلاصه، فرمِ کامل را نشان می‌دهد (مهر ۱۴۰۵) */
    wz: null, kbFull: {}, formOpen: {} };
  const TERM_FIELDS = ["dtime", "pay", "invoice", "vat", "valid_days"];
  /* شرایطِ اجباری از خودِ سرور (/sp/me) — فاز ۴: اعتبار پیش‌فاکتور هم */
  let TERM_REQUIRED = ["dtime", "pay", "invoice", "vat", "valid_days"];
  /* قفل‌های هر قلم (فاز ۴): 🔒 ثابت، 🔓 قابل تغییر؛ خطِ پیش از فاز ۴ (legacy): عنوان و لایه‌ها 🔒، مقدار و واحد آزاد */
  const lockOf = (l) => l.locks || { legacy: true, title: true, qty: false, unit: false };
  const layerTxt = (x) => `${x.k}: ${x.v}${x.u ? ` ${x.u}` : ""}`;
  /** «وزن: ۵ کیلوگرم» ← لایهٔ کمّی با واحد؛ «برند: 3M» و «اندازه: M8» کیفی می‌مانند (همان sp-bot.js:extraOf) */
  function extraOf(k, v) {
    const m = /^([0-9۰-۹٠-٩][0-9۰-۹٠-٩.,٫٬]*)(?:\s+(\S.{0,19}))?$/.exec(String(v).trim());
    const n = m ? toNum(m[1]) : null;
    return m && n != null && !Number.isNaN(n) ? { k, v: String(n), t: "num", ...(m[2] ? { u: m[2].trim() } : {}) } : { k, v: String(v).trim() };
  }
  /* تاریخِ امروز در تقویم شمسی (برای انتخاب تاریخ تحویل) */
  const J_MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
  function jToday() {
    try {
      const p = new Intl.DateTimeFormat("en-u-ca-persian-nu-latn", { timeZone: "Asia/Tehran", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date());
      const g = (t) => parseInt((p.find((x) => x.type === t) || {}).value, 10) || 0;
      return { y: g("year") || 1405, m: g("month") || 1, d: g("day") || 1 };
    } catch (_) { return { y: 1405, m: 1, d: 1 }; }
  }

  /* دسکتاپ: گوشی + فرم؛ زیرش فقط گفت‌وگو */
  const PHONE = window.matchMedia("(min-width: 961px)");
  let phoneMode = PHONE.matches;
  /* گوشیِ واقعی: صفحهٔ ثابت و هم‌قدِ بخشِ دیدنی (ph-chat.js: PH.lockView) */
  const lockPhone = (on) => PH.lockView(on, on);
  const onPhoneMode = () => { if (phoneMode === PHONE.matches) return; phoneMode = PHONE.matches; if (S.d) renderAll(); };
  if (PHONE.addEventListener) PHONE.addEventListener("change", onPhoneMode); else if (PHONE.addListener) PHONE.addListener(onPhoneMode);

  const authHeaders = () => (inTg ? { "X-TG-Init": tgData } : S.session ? { "X-SP-Session": S.session } : {});
  async function api(path, opt) {
    opt = opt || {};
    const headers = { Accept: "application/json", ...(opt.headers || {}), ...authHeaders() };
    if (opt.json !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(API + path, { method: opt.method || (opt.json !== undefined || opt.body ? "POST" : "GET"), headers, body: opt.json !== undefined ? JSON.stringify(opt.json) : opt.body });
    const txt = await res.text();
    let data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch (_) { data = { error: txt.slice(0, 200) }; }
    if (!res.ok) { const e = new Error((data && data.error) || `خطای سرور ${res.status}`); e.status = res.status; e.data = data; throw e; }
    return data;
  }
  async function loadVoice(id) {
    const r = await fetch(`${API}/sp/msg/${id}/voice`, { headers: authHeaders() });
    if (!r.ok) throw new Error("پخش نشد");
    return r.blob();
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

  /* ---------- سرآیند (دسکتاپ و صفحهٔ ورود) ---------- */
  /* پوستهٔ مشترک (ui.js): حالت شب و روزِ این صفحه در sp.theme می‌ماند (تأمین‌کننده بیرون از شرکت است، پیش‌فرض روشن) */
  const UI = window.TP.ui;
  UI.theme.key = "sp.theme";
  function top() {
    UI.mountBg("");
    const items = [...(S.botLogin && !inTg ? [{ label: "همین پنل در تلگرام", icon: "telegram", href: S.botLogin, attrs: 'target="_blank" rel="noopener"' }] : []),
      { label: "راهنما", icon: "help", attrs: 'data-help="sup.panel"' }, "-", { label: "خروج", icon: "logout", attrs: "data-logout", cls: "danger" }];
    return UI.topbar({ title: "پنل تأمین‌کنندگان", sub: `شرکت ${esc(S.company)}`, home: "#", homeTitle: "",
      user: S.me ? { name: S.me.name, sub: S.me.demo ? "تأمین‌کنندهٔ فرضی" : "تأمین‌کننده" } : null, items: S.me ? items : [] });
  }
  document.addEventListener("click", (e) => { if (e.target.closest("[data-logout]")) askLogout(); });
  const askLogout = () => modal("خروج", "<p>بعد از خروج، برای ورود دوباره باید «ارسال رمز به پیامک» را بزنید.</p>", logout, "خروج", "انصراف");

  /* ---------- ورود ---------- */
  /* کارتِ ورود با شش خانهٔ رمزِ پیامک (ui.js) روی «مه ساحلی» */
  function renderLogin(msg, ok) {
    S.me = null;
    app.className = ""; lockPhone(false);
    UI.mountBg("fog");
    app.innerHTML = key
      ? UI.login({ title: "ورود به پنل تأمین‌کنندگان", sub: "رمز ۶ رقمیِ پیامک را بنویسید", len: 6, max: 6, error: msg, ok, company: S.company, system: "پاسخ به استعلام خرید",
        alt: `<button class="tp-btn" type="button" id="rs">📱 رمز ندارم — ارسال رمز به پیامک</button>`, foot: `<button type="button" data-help="login.supplier">راهنما</button>` })
      : `<div class="tp-auth"><div class="tp-auth-card"><div class="tp-auth-head"><div class="tp-auth-brand"><img src="../assets/logo-new.jpg" alt=""><div><b>${esc(S.company)}</b><span>پنل تأمین‌کنندگان</span></div></div>${UI.themeBtn()}</div>
          <h1>لینک ورود ناقص است</h1><p class="tp-auth-sub">لینک را از آخرین پیامک باز کنید.</p></div></div>`;
    UI.help.set("login.supplier");
    if (!key) return;
    const L = UI.bindLogin(app, { onSubmit: async (code) => { const d = await api("/sp/login", { json: { k: key, password: code } }); S.session = d.session; store.set("sp.session", d.session); boot(); } });
    $("#rs").onclick = async () => {
      try { const d = await api("/sp/resend", { json: { k: key } }); L.setErr(d.sent ? `رمز تازه به ${d.to} پیامک شد.` : (d.note || "پیامک فرستاده نشد."), d.sent); }
      catch (e) { L.setErr(e.message); }
    };
  }

  async function logout() {
    try { await api("/sp/logout", { json: {} }); } catch (_) { /* نشست از قبل باطل */ }
    S.session = ""; store.set("sp.session", "");
    stopPoll();
    if (inTg) { app.className = ""; lockPhone(false); app.innerHTML = `${top()}<div class="sp-center"><div class="sp-box"><h2>خارج شدید</h2><p class="lead">اتصال این گفت‌وگوی تلگرام برداشته شد. برای ورود دوباره، لینک پیامک را در بات باز کنید و «ارسال رمز به پیامک» را بزنید.</p></div></div>`; return; }
    renderLogin("خارج شدید. برای ورود دوباره «ارسال رمز به پیامک» را بزنید.", true);
  }

  /* ---------- راه‌اندازی ---------- */
  async function boot() {
    if (!inTg && !S.session) return renderLogin();
    try {
      const d = await api("/sp/me");
      S.me = d.me; S.threads = d.threads || []; S.labels = d.labels || []; S.company = d.company || S.company; S.botLogin = d.botLogin;
      S.enums = d.term_enums || {}; S.termFa = d.term_fa || {};
      if (Array.isArray(d.term_required) && d.term_required.length) TERM_REQUIRED = d.term_required;
      S.pfRead = d.pf_read === true;
      if (!S.threads.length) { app.className = ""; lockPhone(false); app.innerHTML = `${top()}<div class="sp-center"><div class="sp-box"><h2>فعلاً استعلامی نیست</h2><p class="lead">وقتی کارشناس خرید استعلامی بفرستد، همین‌جا دیده می‌شود.</p></div></div>`; return; }
      const want = parseInt(hp.get("t") || store.sget("sp.th"), 10);
      await openThread(S.threads.some((t) => t.id === want) ? want : S.threads[0].id, true);
      startPoll();
    } catch (e) {
      if (e.status === 401 && !inTg) { S.session = ""; store.set("sp.session", ""); return renderLogin(e.data && e.data.relogin ? "نشست شما تمام شده است؛ دوباره وارد شوید." : ""); }
      if (e.status === 404 && inTg) e.message = "این صفحهٔ تأمین‌کننده است؛ این گفت‌وگوی تلگرام به‌عنوان کارشناس وصل است.";
      app.className = ""; lockPhone(false); app.innerHTML = `${top()}<div class="sp-center"><div class="sp-box"><h2>نشد</h2><p class="sp-err">${esc(e.message)}</p></div></div>`;
    }
  }

  async function openThread(id, first) {
    if (!first && (S.dirty.size || S.termsDirty) && S.th !== id && !confirm("تغییرات ذخیره‌نشده دارید. بی ذخیره بروید؟")) return false;
    const was = $("#msgIn"); if (was && was.dataset.draft) S.drafts[was.dataset.draft] = was.value;
    S.th = id; store.sset("sp.th", String(id));
    S.dirty.clear(); S.extra = {}; S.termsDraft = null; S.termsDirty = false; S.pfFile = null; S.bot = []; S.flow = null; S.wz = null; S.pending = []; S.outbox = [];
    await loadThread();
    return true;
  }
  /** خواندنِ دوبارهٔ استعلام؛ quiet: فقط داده (کارِ بات خودش کارت می‌گذارد و یک بار رسم می‌کند) */
  async function loadThread(quiet) {
    const d = await api(`/sp/thread/${S.th}`);
    S.d = d; S.rev = d.thread.rev; S.lastMsg = d.msgs.length ? d.msgs[d.msgs.length - 1].id : 0;
    if (typeof d.pf_read === "boolean") S.pfRead = d.pf_read;
    for (const l of d.lines) if (!S.dirty.has(l.id)) S.extra[l.id] = l.extra.slice();
    if (!S.termsDirty) S.termsDraft = { ...(d.thread.terms || {}) };
    const t = S.threads.find((x) => x.id === S.th); if (t) t.unread = 0;
    if (!quiet) renderAll();
  }
  const lineOf = (id) => S.d.lines.find((x) => x.id === +id);
  const termFa = (f) => S.termFa[f] || f;
  const termsLine = (t) => TERM_FIELDS.filter((f) => t && String(t[f] ?? "").trim()).map((f) => `${termFa(f).replace(" (روز)", "")}: ${fa(t[f])}${f === "valid_days" ? " روز" : ""}`).join(" · ");
  const threadTerms = () => (S.d && S.d.thread.terms) || {};
  const termsMissing = (t) => TERM_REQUIRED.filter((f) => !String((t || {})[f] ?? "").trim()).map(termFa);

  /* ================================================================
     رسم
     ================================================================ */
  function renderAll() {
    const keepSide = keepSideState();
    const chatPos = chatScroll();
    app.className = "sp-app sup-app";
    lockPhone(!phoneMode);
    app.innerHTML = phoneMode
      ? `${top()}<div class="sp-full"><div class="sup-cols"><section class="sup-side" id="side">${sideHtml()}</section>
          <section class="ph-stage">${PH.frame(screenHtml(true))}</section></div></div>`
      : `<div class="sp-full sup-mobile">${screenHtml(false)}</div>`;
    bindSide(); bindChat();
    /* راهنما: در دسکتاپ گوشی سمت چپ است، پس دکمهٔ «؟» سمت راست؛ در موبایل دکمهٔ «؟» داخلِ نوارِ گفت‌وگوست */
    UI.help.set("sup.panel", phoneMode ? { side: "right" } : { fab: false });
    keepSide();
    restoreChat(chatPos);
  }
  /** فقط گوشی دوباره رسم می‌شود (پیامِ تازه، کارتِ بات) — فرمِ راست با چیزهای نیمه‌نوشته‌اش دست نمی‌خورد */
  function renderChat(stick) {
    const scr = $(".ph-screen");
    if (!scr) return renderAll();
    const pos = chatScroll();
    /* فقط فهرستِ پیام‌ها، نوارِ بالا، منو و راهنمای گام عوض می‌شوند؛ کادرِ پیام (با فوکوس، متنِ نیمه‌نوشته و ضبطِ صدا) همان می‌ماند */
    const t0 = document.createElement("div"); t0.innerHTML = screenHtml(!!scr.closest(".ph"));
    const neu = t0.firstElementChild;
    const chat = $("#chat", scr), nchat = neu && $("#chat", neu), comp = $(".ph-compose", scr), ncomp = neu && $(".ph-compose", neu);
    const inp = comp && $("#msgIn", comp), ninp = ncomp && $("#msgIn", ncomp);
    if (chat && nchat && comp && ncomp && inp && ninp && inp.dataset.draft === ninp.dataset.draft) {
      if (chat.innerHTML !== nchat.innerHTML) chat.innerHTML = nchat.innerHTML;
      const nav = $(".ph-nav", scr), nnav = $(".ph-nav", neu);
      if (nav && nnav && nav.innerHTML !== nnav.innerHTML) nav.replaceWith(nnav);
      const field = $(".ph-field", comp);
      for (const sel of [".ph-kb", ".ph-hint"]) {
        const a = $(sel, comp), b = $(sel, ncomp);
        if (a && b) { if (a.outerHTML !== b.outerHTML) a.replaceWith(b); }
        else if (a) a.remove();
        else if (b) comp.insertBefore(b, field);
      }
      inp.placeholder = ninp.placeholder; inp.setAttribute("aria-label", ninp.getAttribute("aria-label") || "");
      if (scr.className !== neu.className) scr.className = neu.className;
      bindChat();
      const c = $("#chat"); if (c) c.scrollTop = stick || pos == null ? c.scrollHeight : pos;
      return;
    }
    const focused = document.activeElement && document.activeElement.id === "msgIn";
    const was = $("#msgIn"); if (was && was.dataset.draft) S.drafts[was.dataset.draft] = was.value;
    const t = document.createElement("div"); t.innerHTML = screenHtml(!!scr.closest(".ph"));
    scr.replaceWith(t.firstElementChild);
    bindChat();
    restoreChat(stick ? null : pos);
    if (focused) { const i = $("#msgIn"); if (i) i.focus(); }
  }
  const chatScroll = () => { const c = $("#chat"); if (!c) return null; return c.scrollHeight - c.scrollTop - c.clientHeight < 90 ? null : c.scrollTop; };
  function restoreChat(pos) {
    const c = $("#chat"); if (c) c.scrollTop = pos == null ? c.scrollHeight : pos;
    const inp = $("#msgIn"); if (inp && S.drafts[S.th]) { inp.value = S.drafts[S.th]; PH.grow(inp); }
  }

  /* ---------- گوشی: گفت‌وگو + بات ---------- */
  const MENU = [{ key: "list", label: "📋 استعلام‌ها" }, { key: "items", label: "📦 اقلام" }, { key: "chat", label: "💬 گفت‌وگو" }, { key: "out", label: "🚪 خروج" }];
  function screenHtml(framed) {
    const th = S.d.thread;
    const lastId = S.d.msgs.length ? S.d.msgs[S.d.msgs.length - 1].id : 0;
    const after = {};
    for (const c of S.bot) { const a = c.after > lastId ? lastId : c.after; after[a] = (after[a] || "") + c.html; }
    const list = S.d.msgs.concat(PH.outboxMsgs(S.outbox, S.d.msgs, "s"), S.pending.map((p, i) => ({ id: -(i + 1), pending: true, who: "s", kind: "voice", at: p.at, meta: { voice: { dur: p.dur } } })));
    const body = PH.feed(list, {
      mine: (m) => m.who === "s",
      rich: (m) => PH.evCard(m, { mine: m.who === "s", termsLine, goLabel: phoneMode ? "دیدن در فرمِ کنار" : "دیدن و پر کردن", actions: evActions }),
      transcript: false, after,
      empty: `<div class="ph-void"><b>گفت‌وگو با کارشناس خرید</b>برای پر کردن اقلام «📦 اقلام» را بزنید.</div>`,
    });
    const waiting = S.d.lines.filter((l) => FILLING.includes(l.state)).length + S.d.bundles.filter((b) => b.state === "approved").length;
    return PH.screen({
      framed, body, label: "گفت‌وگو با کارشناس خرید",
      nav: {
        /* گوشیِ واقعی (بی‌قاب): حالت شب و روز و «؟» داخلِ خودِ نوار — نوار بالای صفحه و دکمهٔ شناور نیست */
        start: !framed ? `<button class="ph-glass ph-circ tp-theme" type="button" data-theme-toggle title="حالت روز یا شب" aria-label="حالت روز یا شب">${UI.ICON.sun}${UI.ICON.moon}</button>` : "",
        title: th.expert ? `کارشناس خرید — ${th.expert}` : "کارشناس خرید", avatar: '<img src="../assets/logo-new.jpg" alt="">',
        whoAttrs: 'data-bot="ic"', whoTitle: `استعلام ${th.request_id} · شرکت ${S.company}${th.expert ? ` · ${th.expert}` : ""}`,
        acts: `${!framed ? `<button class="ph-glass ph-circ" type="button" data-help="sup.panel" aria-label="راهنما" title="راهنما">${UI.ICON.help}</button>` : ""}<button class="ph-glass ph-circ" data-clear-chat aria-label="پاک کردن گفت‌وگو" title="پاک کردن گفت‌وگو — فقط از صفحهٔ شما">${PH.I.erase}</button>
          <button class="ph-glass ph-circ" data-bot="ic" aria-label="اقلام${waiting ? ` — ${fa(waiting)} کار مانده` : ""}" title="اقلام و قیمت‌ها">${PH.I.box}${waiting ? `<b class="ph-dot">${fa(waiting)}</b>` : ""}</button>`,
      },
      composer: { placeholder: S.flow ? S.flow.ph || "بنویسید…" : "پیام به کارشناس خرید", draft: S.th, hint: S.flow ? S.flow.hint : "", keys: MENU, mic: true },
    });
  }
  /** دکمهٔ زیرِ کارتِ رخداد — همان دکمه‌های بات (sp-push.js:actionKb) */
  function evActions(m) {
    const ev = m.meta && m.meta.ev;
    if (S.pfRead && ev === "approve" && m.meta.bundle) {
      const b = S.d.bundles.find((x) => x.id === m.meta.bundle);
      if (b && b.state === "approved") return ikb([[{ t: "📄 ارسال پیش‌فاکتور", d: `sp:${b.id}` }]]);
    }
    /* پیش‌فاکتورِ سامانه (فاز ۴): کارتِ ارسال و تأیید نهایی دکمهٔ دیدنش را دارند */
    if (!S.pfRead && ["submit", "final"].includes(ev) && m.meta.bundle && S.d.bundles.some((x) => x.id === m.meta.bundle)) return ikb([[{ t: "👁 پیش‌فاکتور", d: `pv:${m.meta.bundle}` }]]);
    if (["rfq", "remind", "return"].includes(ev) && S.d.lines.some((l) => FILLING.includes(l.state))) return ikb([[{ t: "📝 دیدن و پر کردن اقلام", d: "ic" }]]);
    return "";
  }

  /* --- کارت‌های بات: پیامِ طرفِ شرکت با دکمه‌های زیرش (مثل صفحه‌کلیدِ درون‌خطیِ تلگرام) --- */
  const ikb = (rows) => (rows && rows.length ? `<div class="ph-ikb">${rows.filter((r) => r.length).map((r) => `<div class="r">${r.map((b) => `<button type="button" class="ph-ib" data-bot="${esc(b.d)}">${esc(b.t)}</button>`).join("")}</div>`).join("")}</div>` : "");
  const lastRealId = () => (S.d.msgs.length ? S.d.msgs[S.d.msgs.length - 1].id : 0);
  /** کارتِ تازه (یا ویرایشِ همان کارت، مثل editMessageText بات) */
  function card(html, kb, replace) {
    const body = `<div class="ph-row them first"><div class="ph-bot">${html}${ikb(kb)}</div></div>`;
    const old = replace ? S.bot.find((c) => c.id === replace) : null;
    if (old) { old.html = body.replace('class="ph-bot"', `class="ph-bot" data-card="${old.id}"`); renderChat(false); return old.id; }
    const id = ++S.seq;
    S.bot.push({ id, after: lastRealId(), html: body.replace('class="ph-bot"', `class="ph-bot" data-card="${id}"`) });
    renderChat(true);
    /* کارتِ نوبتیِ «پر کردن اطلاعات» با فنر می‌آید (یک بار؛ با رسمِ دوباره تکرار نمی‌شود) */
    if (S.wz) requestAnimationFrame(() => { const el = $(`[data-card="${id}"]`); if (el) el.classList.add("wz-in"); });
    return id;
  }
  /** متنی که تأمین‌کننده در جوابِ بات نوشت — مثل تلگرام در گفت‌وگو می‌ماند ولی برای کارشناس نمی‌رود */
  function echo(text) { S.bot.push({ id: ++S.seq, after: lastRealId(), html: `<div class="ph-row me first"><div class="ph-b me tail">${esc(text)}</div></div>` }); }
  const say2 = (msg, replace) => card(`<div class="ph-bot-t">⚠️ ${esc(msg)}</div>`, null, replace);

  const VAL_PROMPT = {
    q: "🔢 مقدار را بنویسید (فقط عدد):", u: "📏 واحد را بنویسید (مثلاً عدد، کیلوگرم، متر):", p: "💰 قیمت واحد را به <b>ریال و بدون ارزش افزوده</b> بنویسید:",
    n: "📝 توضیح را بنویسید (یا «-» برای پاک کردن):",
    l: "➕ لایهٔ تازه را این‌طور بنویسید: «نام لایه: مقدار» — مثلاً «برند: فولاد مبارکه». لایهٔ کمّی را با عدد و واحد بنویسید، مثلاً «وزن: ۵ کیلوگرم».",
    t: "🔓 عنوانِ پیشنهادیِ خودتان را بنویسید (یا «-» برای همان عنوانِ درخواست):",
  };
  const VAL_PH = { q: "مقدار (عدد)…", u: "واحد…", p: "قیمت واحد به ریال…", n: "توضیح…", l: "نام لایه: مقدار", t: "عنوانِ پیشنهادی…", y: "مقدارِ پیشنهادی…" };
  const TERM_KEY = { d: "dtime", p: "pay", i: "invoice", v: "vat", x: "valid_days" };
  const TERM_BTN = { d: "🚚 زمان تحویل", p: "💳 تسویه", i: "🧾 نوع فاکتور", v: "➕ ارزش افزوده", x: "📅 اعتبار" };
  const TERM_PROMPT = { d: "🚚 <b>زمان تحویل</b> را بنویسید — تاریخ شمسی (مثل ۱۴۰۵/۰۸/۰۱) یا شمار روز (مثل ۱۰ یا ۱۰ روز کاری):", x: "📅 <b>اعتبار پیش‌فاکتور</b> را به روز بنویسید (مثلاً ۷):" };
  const TERM_OPTS = { p: "pay", i: "invoice", v: "vat" };
  const lineSumTxt = (l) => `${qty(l.qty)} ${esc(l.unit || "")} × ${money(l.price)} = ${money(l.qty != null && l.price != null ? l.qty * l.price : null)} ریال`;

  function threadsCard(replace) {
    const kb = S.threads.map((t) => [{ t: `${t.unread ? `🔴${fa(t.unread)} ` : ""}${S.pfRead && t.need_pf ? "📄 " : ""}استعلام ${t.request_id} — ${fa(t.lines)} قلم${t.todo ? ` (${fa(t.todo)} مانده)` : ""}${t.id === S.th ? " ✓" : ""}`, d: `st:${t.id}` }]);
    return card(`<div class="ph-bot-t">📋 <b>استعلام‌های شما</b><br><i>🔴 پیام نخوانده${S.pfRead ? " · 📄 منتظر پیش‌فاکتور" : ""}</i></div>`, kb, replace);
  }
  function itemsCard(head, replace) {
    const th = S.d.thread, L = S.d.lines.slice().sort((a, b) => b.id - a.id);
    const ready = L.filter((l) => l.state === "ready"), tm = threadTerms(), miss = termsMissing(tm);
    const waitPf = S.pfRead ? S.d.bundles.filter((b) => b.state === "approved") : [];
    const rows = L.map((l) => `<li><b>${esc(tag(l))}</b> <span class="sp-st ${l.state}">${esc(l.state_fa)}</span><div class="ph-bot-s">${lineSumTxt(l)}</div></li>`).join("");
    const html = `${head ? `<div class="ph-bot-t">${head}</div>` : ""}<div class="ph-bot-t">📦 <b>اقلام استعلام ${esc(th.request_id)}</b> <i>(تازه‌ترها بالا)</i></div><ul class="ph-bot-l">${rows}</ul>
      <div class="ph-bot-t">🧾 <b>شرایط فاکتور</b> (برای همهٔ اقلام): ${termsLine(tm) ? esc(termsLine(tm)) : "—"}${miss.length ? `<br><i>مانده: ${esc(miss.join("، "))}</i>` : ""}</div>
      ${waitPf.length ? `<div class="ph-bot-t">📄 ${fa(waitPf.length)} بسته منتظر پیش‌فاکتور شماست.</div>` : ""}
      <div class="ph-bot-t"><i>روی هر قلم بزنید و «📝 پر کردن اطلاعات» را بزنید؛ بعد «آمادهٔ ارسال».</i></div>`;
    const kb = L.slice(0, 30).map((l) => [{ t: `${FILLING.includes(l.state) ? "✏️" : l.state === "ready" ? "☑️" : "📌"} ${tag(l, 30)}`, d: `si:${l.id}` }]);
    if (ready.length) kb.push([{ t: `📤 ارسال برای کارشناس (${fa(ready.length)} قلمِ آماده)`, d: "ss" }]);
    for (const b of waitPf) kb.push([{ t: `📄 ارسال پیش‌فاکتور (بستهٔ ${fa(b.id)})`, d: `sp:${b.id}` }]);
    return card(html, kb, replace);
  }
  /** کارت یک قلم — همان سه بخشِ بات و همان دکمه‌ها؛ «آمادهٔ ارسال» که خورد فقط «✏️ ویرایش» و «📤 ارسال» */
  function lineCard(l, head, replace) {
    const tm = threadTerms(), files = S.d.files.filter((f) => f.line_id === l.id);
    const others = S.d.lines.filter((x) => x.id !== l.id && FILLING.includes(x.state)).length;
    const ed = FILLING.includes(l.state);
    /* فاز ۴: 🔒 فقط‌خواندنی، 🔓 قابل تغییر — مقدارِ 🔒 یعنی کلِ مقدار و 🔓 یعنی کمتر هم می‌شود؛ واحد همان واحدِ درخواست (sp-push.js:lineCard) */
    const lk = lockOf(l);
    const qtyLock = lk.legacy ? ` <i>(درخواست: ${qty(l.req_qty)} ${esc(l.req_unit || "")})</i>` : lk.qty ? " 🔒 <i>(کلِ مقدارِ درخواست)</i>" : ` 🔓 <i>(کمتر هم می‌شود؛ حداکثر ${qty(l.req_qty)})</i>`;
    let h = `${head ? `<div class="ph-bot-t">${head}</div>` : ""}<div class="ph-bot-t">✏️ <b>${esc(tag(l, 80))}</b><br>وضعیت: <i>${esc(l.state_fa)}</i>
        ${lk.legacy ? "" : `<br>${lk.title ? "🔒 عنوان ثابت است" : `🔓 عنوان: <b>${esc(l.s_title || l.title)}</b>${l.s_title ? " <i>(پیشنهادِ شما)</i>" : ""}`}`}</div>
      <div class="ph-bot-sec"><b>📦 مقدار، واحد و قیمت</b>مقدار: <b>${qty(l.qty)} ${esc(l.unit || "")}</b>${qtyLock}<br>
        قیمت واحد (ریال، بدون ارزش افزوده): <b>${money(l.price)}</b><br>قیمت کل: <b>${money(l.total)}</b> ریال</div>
      <div class="ph-bot-sec"><b>🧾 شرایط فاکتور</b> <i>(برای همهٔ اقلامِ این استعلام)</i><br>${TERM_FIELDS.map((f) => `${esc(termFa(f))}: <b>${String(tm[f] ?? "").trim() ? esc(fa(tm[f])) : "—"}</b>`).join("<br>")}</div>
      <div class="ph-bot-sec"><b>🔒 نوع قلم و لایه‌های ویژگی</b>${lk.legacy ? "" : " <i>(🔒 ثابت · 🔓 قابل تغییر)</i>"}<br>${l.head ? `نوع قلم: ${esc(l.head)}<br>` : ""}${l.layers.length ? l.layers.map((x) => `${x.lock === false ? "🔓" : "•"} ${esc(x.k)}: ${esc(x.s || x.v)}${x.s ? ` <i>(درخواست: ${esc(x.v)})</i>` : ""}`).join("<br>") : "—"}
        <br>➕ لایه‌های افزودهٔ شما: ${l.extra.length ? l.extra.map((x) => esc(layerTxt(x))).join("، ") : "—"}</div>
      ${l.note ? `<div class="ph-bot-t">📝 توضیح: ${esc(l.note)}</div>` : ""}<div class="ph-bot-t">📎 پیوست‌ها: ${files.length ? files.map((f) => esc(f.label)).join("، ") : "—"}</div>`;
    const kb = [];
    if (l.state === "ready") {
      h += `<div class="ph-bot-t">✅ <b>این قلم آمادهٔ ارسال است.</b> برای تغییر «✏️ ویرایش»، برای فرستادن برای کارشناس «📤 ارسال».</div>`;
      kb.push([{ t: "✏️ ویرایش", d: `sr:${l.id}:0` }, { t: "📤 ارسال", d: "ss" }]);
      if (others) kb.push([{ t: `📦 اقلام دیگر (${fa(others)} قلمِ مانده)`, d: "ic" }]);
      return card(h, kb, replace);
    }
    const miss = [...(l.missing || []), ...termsMissing(tm)];
    if (ed && miss.length) h += `<div class="ph-bot-t"><i>مانده برای «آمادهٔ ارسال»: ${esc(miss.join("، "))}</i></div>`;
    if (!ed && !EDITABLE.includes(l.state)) h += `<div class="ph-bot-t"><i>${esc(lockedMsg(l))}</i></div>`;
    if (ed) {
      /* یک دکمهٔ اصلی: «📝 پر کردن اطلاعات» — کارت‌های نوبتی (مهر ۱۴۰۵)؛ دکمه‌های تک‌فیلد زیرِ «✏️ ویرایش یک مورد…» */
      kb.push([{ t: "📝 پر کردن اطلاعات", d: `wz:${l.id}` }]);
      if (!S.kbFull[l.id]) {
        kb.push([{ t: "✏️ ویرایش یک مورد…", d: `wz:${l.id}:m` }, { t: "✅ آمادهٔ ارسال", d: `sr:${l.id}:1` }]);
      } else {
        /* مقدارِ 🔒 و واحدِ ثابت دکمه ندارند */
        kb.push([...(lk.legacy || !lk.qty ? [{ t: "🔢 مقدار", d: `sv:${l.id}:q` }] : []), ...(lk.legacy || !lk.unit ? [{ t: "📏 واحد", d: `sv:${l.id}:u` }] : []), { t: "💰 قیمت واحد", d: `sv:${l.id}:p` }]);
        kb.push(["d", "p", "i"].map((k) => ({ t: TERM_BTN[k], d: `tk:${l.id}:${k}` })));
        kb.push(["v", "x"].map((k) => ({ t: TERM_BTN[k], d: `tk:${l.id}:${k}` })));
        /* 🔓ها: عنوان و هر لایهٔ باز (sy:<خط>:<شمارهٔ لایه>) */
        const open = [...(!lk.legacy && !lk.title ? [{ t: "🔓 عنوان", d: `sv:${l.id}:t` }] : []),
          ...l.layers.map((x, i) => (x.lock === false ? { t: `🔓 ${x.k.length > 14 ? x.k.slice(0, 13) + "…" : x.k}`, d: `sy:${l.id}:${i}` } : null)).filter(Boolean)];
        for (let i = 0; i < open.length && i < 8; i += 2) kb.push(open.slice(i, i + 2));
        kb.push([{ t: "➕ لایهٔ تازه", d: `sv:${l.id}:l` }, { t: "📝 توضیح", d: `sv:${l.id}:n` }, { t: "📎 پیوست", d: `sa:${l.id}` }]);
        const ex = []; l.extra.slice(0, 8).forEach((x, i) => ex.push({ t: `🗑 ${x.k.length > 14 ? x.k.slice(0, 13) + "…" : x.k}`, d: `sl:${l.id}:${i}` }));
        for (let i = 0; i < ex.length; i += 2) kb.push(ex.slice(i, i + 2));
        kb.push([{ t: miss.length ? "✅ آمادهٔ ارسال (اول مانده‌ها را پر کنید)" : "✅ آمادهٔ ارسال", d: `sr:${l.id}:1` }]);
      }
    }
    if (l.state === "final" && S.d.revise) {
      h += `<div class="ph-bot-t">🏁 اگر قیمت یا شرایطِ بهتری دارید، «✏️ اصلاحِ پیشنهاد» را بزنید و دوباره بفرستید؛ پیشنهادِ تازه جای قبلی را می‌گیرد.</div>`;
      kb.push([{ t: "✏️ اصلاحِ پیشنهاد", d: `rv:${l.id}` }]);
    }
    kb.push([{ t: "📦 فهرست اقلام", d: "ic" }]);
    return card(h, kb, replace);
  }
  function lockedMsg(l) {
    if (!S.pfRead) {
      return { submitted: "فرستاده شد؛ منتظر بررسی کارشناس.", approved: "منتظر تأیید نهایی کارشناس.", proforma: "منتظر تأیید نهایی کارشناس.",
        final: "✓ تأیید نهایی شد — ممنون از همکاری‌تان.", rejected: "این قلم رد شد." }[l.state] || "";
    }
    return { submitted: "فرستاده شد؛ منتظر بررسی کارشناس.", approved: "مشخصات تأیید شد؛ پیش‌فاکتور را بفرستید.",
      proforma: "پیش‌فاکتور رسید؛ منتظر تأیید نهایی کارشناس.", final: "✓ تأیید نهایی شد.", rejected: "این قلم رد شد." }[l.state] || "";
  }
  /** پرسیدنِ یک مقدار؛ جواب، متنِ بعدیِ کادرِ پیام است. f «y»: لایهٔ 🔓ِ شمارهٔ yi */
  function askValue(l, f, head, yi, extraKb) {
    let prompt = VAL_PROMPT[f];
    const lk = lockOf(l);
    if (f === "q" && !lk.legacy && !lk.qty && l.req_qty != null) prompt = `🔢 مقدار را بنویسید (فقط عدد) — 🔓 کمتر هم می‌شود، حداکثر ${qty(l.req_qty)} ${esc(l.req_unit || "")}:`;
    if (f === "y") {
      const x = l.layers[yi];
      if (!x || x.lock !== false) return lineCard(l, "این لایه قابل تغییر نیست.");
      prompt = `🔓 <b>${esc(x.k)}</b> — مقدارِ پیشنهادیِ خودتان را بنویسید (یا «-» برای همان مقدارِ درخواست: ${esc(x.v)}):`;
    }
    S.flow = { step: "val", line: l.id, f, ...(f === "y" ? { i: yi } : {}), hint: `${prompt.replace(/<[^>]+>/g, "")} — ${tag(l, 30)}`, ph: VAL_PH[f] };
    const kb = [];
    if (f === "q" && l.req_qty != null) kb.push([{ t: `✔️ همان مقدار درخواست (${qty(l.req_qty)} ${l.req_unit || ""})`, d: `sv:${l.id}:qd` }]);
    (extraKb || []).forEach((r) => kb.push(r));
    kb.push([{ t: "✖️ انصراف", d: `si:${l.id}` }]);
    const id = card(`${head ? `<div class="ph-bot-t">${head}</div>` : ""}<div class="ph-bot-t"><b>${esc(tag(l))}</b><br>${prompt}</div>`, kb);
    focusComposer();
    return id;
  }
  function askTerm(l, k, head, extraKb) {
    const f = TERM_KEY[k];
    const top = `${head ? `<div class="ph-bot-t">${head}</div>` : ""}<div class="ph-bot-t"><b>${esc(tag(l))}</b></div>`;
    if (TERM_OPTS[k]) {
      S.flow = null;
      /* فاز ۴ب گام ۳: شرطِ 🔒ِ شرکت — فقط گزینه‌های مجاز (شمارهٔ گزینه همان شمارهٔ فهرستِ کامل می‌ماند) */
      const allow = allowOf(f);
      const kb = (S.enums[TERM_OPTS[k]] || []).map((v, i) => ({ v, i })).filter((x) => !allow || allow.includes(x.v)).map(({ v, i }) => [{ t: v, d: `tv:${l.id}:${k}:${i}` }]);
      (extraKb || []).forEach((r) => kb.push(r));
      kb.push([{ t: "✖️ انصراف", d: `si:${l.id}` }]);
      return card(`${top}<div class="ph-bot-t">🧾 <b>${esc(termFa(f))}</b> را انتخاب کنید <i>(برای همهٔ اقلامِ این استعلام)</i>:${limHint(f, l) ? `<br>${limHint(f, l)}` : ""}</div>`, kb);
    }
    S.flow = { step: "term", line: l.id, k, hint: `${TERM_PROMPT[k].replace(/<[^>]+>/g, "")}`, ph: k === "d" ? "۱۰ روز کاری یا ۱۴۰۵/۰۸/۰۱" : "شمار روز…" };
    const id = card(`${top}<div class="ph-bot-t">${TERM_PROMPT[k]}${f === "dtime" && limHint(f, l) ? `<br>${limHint(f, l)}` : ""}<br><i>(برای همهٔ اقلامِ این استعلام)</i></div>`, [...(extraKb || []), [{ t: "✖️ انصراف", d: `si:${l.id}` }]]);
    focusComposer();
    return id;
  }
  const focusComposer = () => { const i = $("#msgIn"); if (i && phoneMode) i.focus(); };
  /** بعد از ذخیرهٔ هر مقدار: در کارت‌های نوبتی گامِ بعدی؛ وگرنه اگر چیزِ ضروری‌ای مانده همان را می‌پرسد (گام‌به‌گام)؛ وگرنه کارت قلم */
  async function afterSave(lineId, head) {
    await loadThread(true);
    refreshSide();
    if (S.wz && S.wz.line === lineId) return wzNext(head);
    const l = lineOf(lineId);
    if (!l) return itemsCard(head);
    const tm = threadTerms();
    if (FILLING.includes(l.state)) {
      if ((l.missing || []).includes("مقدار")) return askValue(l, "q", head);
      if ((l.missing || []).includes("قیمت واحد")) return askValue(l, "p", head);
      for (const k of ["d", "p", "i", "v", "x"]) if (TERM_REQUIRED.includes(TERM_KEY[k]) && !String(tm[TERM_KEY[k]] ?? "").trim()) return askTerm(l, k, head);
    }
    const all = [...(l.missing || []), ...termsMissing(tm)];
    return lineCard(l, `${head}${all.length ? "" : " همه‌چیز پر است؛ «✅ آمادهٔ ارسال» را بزنید."}`);
  }
  /* ================================================================
     «📝 پر کردن اطلاعات» — کارت‌های نوبتی (خواستهٔ مالک، مهر ۱۴۰۵): هر کارت یک چیز می‌پرسد و با پاسخ، کارتِ پرسش
     برداشته می‌شود و کارتِ بعدی با فنر می‌آید. گام‌ها از خودِ قلم: عنوانِ 🔓، مقدار (اگر باز)، واحد (اگر خالی)، قیمت واحد،
     لایه‌های 🔓، شرایطِ خالیِ فاکتور (برای همهٔ اقلام یکی است)، توضیح و پیوست (اختیاری). همان ترتیب در بات تلگرام (sp-bot.js).
     ================================================================ */
  function wzSteps(l) {
    const lk = lockOf(l), tm = threadTerms(), st = [];
    if (!lk.legacy && !lk.title) st.push({ k: "t" });
    if (lk.legacy || !lk.qty) st.push({ k: "q" });
    if ((lk.legacy || !lk.unit) && !String(l.unit || "").trim()) st.push({ k: "u" });
    st.push({ k: "p" });
    l.layers.forEach((x, i) => { if (x.lock === false) st.push({ k: "y", i }); });
    for (const k of ["d", "p", "i", "v", "x"]) if (TERM_REQUIRED.includes(TERM_KEY[k]) && !String(tm[TERM_KEY[k]] ?? "").trim()) st.push({ k: "term", t: k });
    st.push({ k: "n" }, { k: "a" });
    return st;
  }
  const wzHead = () => { const w = S.wz; return `📝 <b>پر کردن اطلاعات</b> — گام ${fa(w.i + 1)} از ${fa(w.steps.length)}<div class="tp-bar" style="margin-top:.4em"><i style="--p:${Math.round(w.i / w.steps.length * 100)}%"></i></div>`; };
  function wzStart(l) {
    S.wz = { line: l.id, steps: wzSteps(l), i: -1, cardId: null };
    return wzNext();
  }
  /** کارتِ پرسشِ قبلی می‌رود، گامِ بعدی می‌آید؛ در پایان، کارتِ قلم با «✅ آمادهٔ ارسال» */
  function wzNext(msg) {
    const w = S.wz; if (!w) return;
    if (w.cardId) { S.bot = S.bot.filter((c) => c.id !== w.cardId); w.cardId = null; }
    const l = lineOf(w.line);
    if (!l || !FILLING.includes(l.state)) { S.wz = null; return l ? lineCard(l, msg) : itemsCard(msg); }
    w.i++;
    if (w.i >= w.steps.length) {
      S.wz = null; S.flow = null;
      const miss = [...(l.missing || []), ...termsMissing(threadTerms())];
      return lineCard(l, `${msg ? `${msg} ` : ""}🎉 <b>اطلاعاتِ این قلم کامل شد.</b>${miss.length ? ` <i>مانده: ${esc(miss.join("، "))}</i>` : " حالا «✅ آمادهٔ ارسال» را بزنید."}`);
    }
    const s = w.steps[w.i];
    /* واحدی که در همین مسیر پر شد (مثلاً با «همان مقدار درخواست») دیگر پرسیده نمی‌شود */
    if (s.k === "u" && String(l.unit || "").trim()) return wzNext(msg);
    const head = `${msg ? `<div class="ph-bot-t">${msg}</div>` : ""}${wzHead()}`;
    const skip = { t: "⏭ رد شدن", d: `wz:${l.id}:s` };
    const keep = (v) => ({ t: `⏭ همین که هست (${v})`, d: `wz:${l.id}:s` });
    const short = (x) => { const t = String(x || ""); return t.length > 20 ? `${t.slice(0, 19)}…` : t; };
    let id;
    if (s.k === "term") id = askTerm(l, s.t, head, [[skip]]);
    else if (s.k === "a") id = card(`${head}<div class="ph-bot-t">📎 <b>پیوست</b> — اگر مدرک یا عکسی دارید (گواهی کیفیت، تصویر محصول، …) بیفزایید؛ وگرنه رد شوید.</div>`, [[{ t: "📎 افزودن پیوست", d: `sa:${l.id}` }], [skip], [{ t: "✖️ انصراف", d: `si:${l.id}` }]]);
    else {
      const ly = s.k === "y" ? l.layers[s.i] : null;
      /* مقدار: اگر همان مقدارِ درخواست است، دکمهٔ «✔️ همان مقدار درخواست» کافی است */
      const extra = s.k === "q" && l.qty != null && !(l.req_qty != null && Number(l.qty) === Number(l.req_qty)) ? [[keep(`${qty(l.qty)} ${l.unit || ""}`)]] : s.k === "p" && l.price != null ? [[keep(`${money(l.price)} ریال`)]]
        : s.k === "u" && l.unit ? [[keep(l.unit)]] : s.k === "n" ? [[l.note ? keep(short(l.note)) : skip]] : s.k === "t" ? [[l.s_title ? keep(short(l.s_title)) : skip]]
          : s.k === "y" ? [[ly && ly.s ? keep(short(ly.s)) : skip]] : [];
      id = askValue(l, s.k, head, s.i, extra);
    }
    if (S.wz) S.wz.cardId = id || null;
    return id;
  }
  /** فرمِ راست (دسکتاپ) بعد از کارِ بات، بی آن‌که چیزی که کاربر نیمه نوشته بپرد */
  function refreshSide() {
    const side = $("#side"); if (!side) return;
    if (S.dirty.size || S.termsDirty) return;
    const keep = keepSideState();
    side.innerHTML = sideHtml(); bindSide(); keep();
  }

  /** فایل‌گیر — باید در همان کلیک باز شود (مرورگر بی کلیکِ کاربر پنجرهٔ فایل باز نمی‌کند) */
  function pickFile(accept, fn) {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = accept; inp.style.display = "none";
    inp.onchange = () => { const f = inp.files && inp.files[0]; inp.remove(); if (!f) return; if (f.size > 20 * 1048576) return say2("حجم فایل بیشتر از ۲۰ مگابایت است."); fn(f); };
    document.body.appendChild(inp); inp.click();
  }

  /** دکمه‌های بات (همان callback_dataهای worker/sp-bot.js) */
  async function bot(data, cardId) {
    const p = String(data).split(":"), a = p[0], n = (i) => parseInt(p[i], 10) || 0;
    try {
      if (a === "ic") { S.flow = null; S.wz = null; return itemsCard("", cardId); }
      if (a === "list") return threadsCard();
      if (a === "st") { if (n(1) !== S.th) { if (await openThread(n(1))) itemsCard(); return; } return itemsCard("", cardId); }
      if (a === "si") { S.flow = null; S.wz = null; const l = lineOf(n(1)); return l ? lineCard(l, "", cardId) : itemsCard("", cardId); }
      /* کارت‌های نوبتی: wz:<قلم> شروع · wz:<قلم>:s رد شدن از گام · wz:<قلم>:m دکمه‌های تک‌فیلد روی کارتِ قلم */
      if (a === "wz") {
        const l = lineOf(n(1)); if (!l) return;
        if (p[2] === "m") { S.kbFull[l.id] = true; return lineCard(l, "", cardId); }
        if (p[2] === "s") { S.flow = null; return S.wz && S.wz.line === l.id ? wzNext() : lineCard(l, "", cardId); }
        return wzStart(l);
      }
      if (a === "sv") {
        const l = lineOf(n(1)); if (!l) return;
        if (p[2] === "qd") {
          await api(`/sp/line/${l.id}`, { method: "PUT", json: { qty: l.req_qty, unit: l.req_unit } });
          S.flow = null; return afterSave(l.id, "✅ مقدار ثبت شد.");
        }
        return askValue(l, p[2]);
      }
      /* sy:<خط>:<شمارهٔ لایه> — مقدارِ پیشنهادیِ تأمین‌کننده برای لایهٔ 🔓 (فاز ۴) */
      if (a === "sy") { const l = lineOf(n(1)); return l ? askValue(l, "y", "", n(2)) : null; }
      /* پیش‌فاکتورِ سامانه: pv بستهٔ فرستاده‌شده، pw پیش‌نمایشِ اقلامِ آماده پیش از ارسال */
      if (a === "pv") return bundlePfDialog(n(1));
      if (a === "pw") return previewDialog(S.d.lines.filter((l) => l.state === "ready").map((l) => l.id), false);
      if (a === "tk") { const l = lineOf(n(1)); return l ? askTerm(l, p[2]) : null; }
      if (a === "rv") {
        await api(`/sp/line/${n(1)}/revise`, { json: {} });
        await loadThread(true); refreshSide();
        const l = lineOf(n(1));
        return l ? lineCard(l, "✏️ پیشنهاد دوباره باز شد: عوضش کنید و دوباره «✅ آمادهٔ ارسال» و «📤 ارسال» را بزنید؛ پیشنهادِ قبلی تا ارسالِ تازه سرِ جایش است.") : null;
      }
      if (a === "tv") {
        const v = (S.enums[TERM_OPTS[p[2]]] || [])[n(3)]; if (!v) return;
        const r = await api(`/sp/thread/${S.th}/terms`, { json: { [TERM_KEY[p[2]]]: v } });
        if (!S.termsDirty) S.termsDraft = { ...r.terms };
        if (S.wz) echo(v);
        return afterSave(n(1), `✅ ${termFa(TERM_KEY[p[2]])}: ${esc(v)}`);
      }
      if (a === "sl") {
        const l = lineOf(n(1)); if (!l) return;
        const extra = l.extra.slice(); extra.splice(n(2), 1);
        await api(`/sp/line/${l.id}`, { method: "PUT", json: { extra } });
        await loadThread(true); refreshSide();
        return lineCard(lineOf(l.id), "", cardId);
      }
      if (a === "sa") {
        const l = lineOf(n(1)); if (!l) return;
        if (p[2] === undefined) {
          const kb = S.labels.map((x, i) => [{ t: x, d: `sa:${l.id}:${i}` }]);
          kb.push([{ t: "✏️ برچسب دیگر…", d: `sa:${l.id}:o` }], [S.wz && S.wz.line === l.id ? { t: "⏭ رد شدن", d: `wz:${l.id}:s` } : { t: "↩️ کارت قلم", d: `si:${l.id}` }]);
          return card(`<div class="ph-bot-t">📎 برچسب این پیوست چیست؟ <i>(${esc(tag(l, 30))})</i></div>`, kb, cardId);
        }
        if (p[2] === "o") { S.flow = { step: "label", line: l.id, hint: "برچسب پیوست را بنویسید (مثلاً «گواهی استاندارد»)", ph: "برچسب پیوست…" }; card(`<div class="ph-bot-t">برچسب پیوست را بنویسید (مثلاً «گواهی استاندارد»):</div>`, [[{ t: "✖️ انصراف", d: `si:${l.id}` }]]); return focusComposer(); }
        const label = S.labels[n(2)]; if (!label) return;
        return pickFile(".pdf,image/*,.doc,.docx,.xls,.xlsx", (f) => uploadAttach(l.id, label, f));
      }
      if (a === "sf") { const l = lineOf(n(1)); const label = decodeURIComponent(p.slice(2).join(":")); return l ? pickFile(".pdf,image/*,.doc,.docx,.xls,.xlsx", (f) => uploadAttach(l.id, label, f)) : null; }
      if (a === "sr") {
        const on = p[2] === "1";
        try { await api(`/sp/line/${n(1)}/ready`, { json: { on } }); }
        catch (e) { if (on) return afterSave(n(1), `⚠️ هنوز کامل نیست: ${esc(e.message)}`); throw e; }
        await loadThread(true); refreshSide();
        return lineCard(lineOf(n(1)), on ? "" : "✏️ حالا می‌توانید ویرایش کنید؛ بعد دوباره «✅ آمادهٔ ارسال».", cardId);
      }
      if (a === "ss") {
        const cnt = S.d.lines.filter((l) => l.state === "ready").length;
        if (!cnt) return say2("هیچ قلمِ «آمادهٔ ارسال»ی نیست.");
        /* فاز ۴: «👁 پیش‌نمایش پیش‌فاکتور» و بعد «ارسال» — پیش‌فاکتورِ خودِ تأمین‌کننده اختیاری و فقط پیوست (همان sp-bot.js) */
        if (!S.pfRead) {
          const ready = S.d.lines.filter((l) => l.state === "ready"), tm = threadTerms(), miss = termsMissing(tm);
          const sum = ready.reduce((s, l) => s + (l.total || 0), 0);
          const rows = ready.map((l) => `<li><b>${esc(l.s_title || l.title)}</b>${l.no ? ` <i>(کد ${fa(l.no)})</i>` : ""}<div class="ph-bot-s">${qty(l.qty)} ${esc(l.unit || "")} × <b>${money(l.price)}</b> = <b>${money(l.total)}</b> ریال</div>${l.note ? `<div class="ph-bot-s">📝 ${esc(l.note)}</div>` : ""}</li>`).join("");
          return card(`<div class="ph-bot-t">👁 <b>پیش‌نمایش پیش‌فاکتور</b> — استعلام ${esc(S.d.thread.request_id)}<br><i>همین را سامانه از فیلدهای شما می‌سازد و با «📤 ارسال» برای کارشناس می‌رود.</i></div><ul class="ph-bot-l">${rows}</ul>
            <div class="ph-bot-t">جمع (بی ارزش افزوده): <b>${money(sum)}</b> ریال<br>🧾 ${esc(termsLine(tm)) || "—"}${miss.length ? `<br>⛔ <b>هنوز کامل نیست:</b> ${esc(miss.join("، "))}` : ""}</div>`,
            [...(miss.length ? [] : [[{ t: `📤 ارسال برای کارشناس (${fa(ready.length)} قلم)`, d: "sq:go" }]]), [{ t: "👁 پیش‌فاکتورِ کامل", d: "pw" }],
              [{ t: "📎 ارسال همراه با پیش‌فاکتورِ خودم (اختیاری)", d: "sq:pf" }], [{ t: "✖️ انصراف", d: "x" }]], cardId);
        }
        return card(`<div class="ph-bot-t">📤 <b>ارسالِ ${fa(cnt)} قلمِ آماده برای کارشناس</b><br>پیش‌فاکتورِ همین اقلام را هم دارید؟ اگر همراهش بفرستید، مرحلهٔ «تأیید مشخصات و درخواست پیش‌فاکتور» لازم نیست.</div>`,
          [[{ t: "📄 بله، همراه با پیش‌فاکتور", d: "sq:pf" }], [{ t: "📤 نه، فقط مشخصات", d: "sq:go" }], [{ t: "✖️ انصراف", d: "x" }]]);
      }
      if (a === "sq") {
        const ids = S.d.lines.filter((l) => l.state === "ready").map((l) => l.id);
        if (!ids.length) return say2("هیچ قلمِ «آمادهٔ ارسال»ی نیست.");
        if (p[1] === "pf") return pickFile(".pdf,image/*", (f) => submitBot(ids, f, cardId));
        return submitBot(ids, null, cardId);
      }
      if (a === "sp") return pickFile(".pdf,image/*", (f) => pfBot(n(1), f));
      if (a === "x") { S.flow = null; S.wz = null; return card(`<div class="ph-bot-t">باشد، کنار گذاشته شد.</div>`, null, cardId); }
    } catch (e) { say2(e.message); }
  }
  async function uploadAttach(lineId, label, file) {
    try {
      await api(`/sp/line/${lineId}/file?filename=${encodeURIComponent(file.name)}&label=${encodeURIComponent(label)}&note=`, { method: "POST", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
      S.flow = null; await loadThread(true); refreshSide();
      if (S.wz && S.wz.line === lineId) return wzNext(`✅ پیوستِ «${esc(label)}» ثبت شد.`);
      lineCard(lineOf(lineId), `✅ پیوستِ «${esc(label)}» ثبت شد.`);
    } catch (e) { say2(e.message); }
  }
  async function submitBot(ids, pf, cardId) {
    try {
      const r = pf
        ? await api(`/sp/thread/${S.th}/submit-pf?ids=${ids.join(",")}&filename=${encodeURIComponent(pf.name)}`, { method: "POST", body: pf, headers: { "Content-Type": pf.type || "application/octet-stream" } })
        : await api(`/sp/thread/${S.th}/submit`, { json: { line_ids: ids } });
      await loadThread(true); refreshSide();
      itemsCard(S.pfRead ? `✅ ${pf ? "مشخصات و پیش‌فاکتور با هم" : ""}${pf ? " " : ""}برای کارشناس فرستاده شد (بستهٔ ${fa(r.bundle_id)}). نتیجهٔ بررسی را همین‌جا خبر می‌دهیم.`
        : `✅ پیشنهادتان با پیش‌فاکتورِ سامانه${pf ? " (و پیوستِ پیش‌فاکتورِ خودتان)" : ""} برای کارشناس فرستاده شد (بستهٔ ${fa(r.bundle_id)}). نتیجهٔ بررسی را همین‌جا خبر می‌دهیم.`, cardId);
    } catch (e) { say2(e.message); }
  }
  async function pfBot(bid, file) {
    try {
      await api(`/sp/bundle/${bid}/proforma?filename=${encodeURIComponent(file.name)}`, { method: "POST", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
      await loadThread(true); refreshSide();
      card(`<div class="ph-bot-t">${S.pfRead ? "✅ پیش‌فاکتور رسید و برای کارشناس فرستاده شد. نتیجهٔ بررسی را همین‌جا خبر می‌دهیم." : "📎 پیش‌فاکتورِ خودتان پیوستِ همین ارسال شد."}</div>`);
    } catch (e) { say2(e.message); }
  }
  /** متنِ کادرِ پیام وقتی بات منتظر جواب است (مقدار، قیمت، شرط، برچسب) */
  async function flowInput(text) {
    const f = S.flow;
    echo(text);
    if (f.step === "val") {
      const clear = text.trim() === "-";
      const lyr = f.f === "y" ? (lineOf(f.line) || { layers: [] }).layers[f.i] : null;
      const body = f.f === "q" ? { qty: toNum(text) } : f.f === "p" ? { price: toNum(text) } : f.f === "u" ? { unit: text } : f.f === "n" ? { note: clear ? "" : text }
        : f.f === "t" ? { title: clear ? "" : text } : f.f === "y" && lyr ? { layers: { [lyr.k]: clear ? "" : text } } : null;
      try {
        if (f.f === "l") {
          const m = /^(.{1,40}?)\s*[:：=]\s*(.+)$/.exec(text);
          if (!m) { renderChat(true); return say2("به این شکل بنویسید: «نام لایه: مقدار» — مثلاً «برند: فولاد مبارکه» یا «وزن: ۵ کیلوگرم»"); }
          const l = lineOf(f.line), x = extraOf(m[1].trim(), m[2].trim());
          /* نامِ لایه‌های همین بسته را سرور نمی‌پذیرد: 🔒 ثابت است و 🔓 سرِ جای خودش عوض می‌شود */
          await api(`/sp/line/${f.line}`, { method: "PUT", json: { extra: [...l.extra.filter((y) => y.k !== x.k), x] } });
        } else if (!body) { renderChat(true); return say2("این لایه دیگر نیست."); } else {
          if ((f.f === "q" || f.f === "p") && (body[f.f === "q" ? "qty" : "price"] == null || Number.isNaN(body[f.f === "q" ? "qty" : "price"]))) { renderChat(true); return say2(f.f === "q" ? "مقدار باید عدد باشد." : "قیمت واحد باید عدد باشد."); }
          await api(`/sp/line/${f.line}`, { method: "PUT", json: body });
        }
        S.flow = null;
        return afterSave(f.line, "✅ ذخیره شد.");
      } catch (e) { renderChat(true); return say2(e.message); }
    }
    if (f.step === "term") {
      try {
        const r = await api(`/sp/thread/${S.th}/terms`, { json: { [TERM_KEY[f.k]]: text } });
        if (!S.termsDirty) S.termsDraft = { ...r.terms };
        S.flow = null;
        return afterSave(f.line, "✅ ذخیره شد.");
      } catch (e) { renderChat(true); return say2(e.message); }
    }
    if (f.step === "label") {
      const label = text.slice(0, 40);
      S.flow = null;
      return card(`<div class="ph-bot-t">حالا فایلِ «${esc(label)}» را انتخاب کنید — PDF یا عکس.</div>`, [[{ t: "📎 انتخاب فایل", d: `sf:${f.line}:${encodeURIComponent(label)}` }], [{ t: "✖️ انصراف", d: `si:${f.line}` }]]);
    }
  }

  /* --- رفتارِ گوشی --- */
  function bindChat() {
    const scr = $(".ph-screen"); if (!scr) return;
    PH.bindComposer(scr, {
      /* کادر پیش از رسمِ دوباره خالی می‌شود — وگرنه پیش‌نویسِ نگه‌داشته همان متنِ فرستاده را برمی‌گرداند */
      onSend: async (text) => {
        const clear = () => { const i = $("#msgIn"); if (i) i.value = ""; S.drafts[S.th] = ""; };
        if (S.flow) { clear(); await flowInput(text); return; }
        /* حباب همان لحظه می‌آید (کادر خالی و آماده)؛ پاسخِ سرور جایش را با پیامِ واقعی عوض می‌کند — شبکهٔ کند دیگر «لگ» به نظر نمی‌رسد */
        const p = { at: Date.now(), body: text };
        S.outbox.push(p); clear(); renderChat(true);
        try {
          const r = await api(`/sp/thread/${S.th}/msg`, { json: { text } });
          S.outbox = S.outbox.filter((x) => x !== p);
          const last = S.lastMsg; addMsgs(r.msgs, true); if (S.lastMsg === last) renderChat(true);
        } catch (e) {
          S.outbox = S.outbox.filter((x) => x !== p); renderChat(false);
          const i = $("#msgIn"); if (i && !i.value) { i.value = text; PH.grow(i); }
          say(e.message); throw e;
        }
      },
      onVoice: sendVoice,
      onKey: (k) => {
        if (k === "list") return bot("list");
        if (k === "items") return bot("ic");
        if (k === "chat") { S.bot = []; S.flow = null; return renderChat(true); }
        if (k === "out") return askLogout();
      },
      onFlowCancel: () => { S.flow = null; renderChat(false); },
      onError: (m) => say(m),
    });
    $$("[data-bot]", scr).forEach((b) => { b.onclick = (e) => { e.stopPropagation(); const c = b.closest("[data-card]"); bot(b.dataset.bot, c ? +c.dataset.card : null); }; });
    const chat = $("#chat"); if (chat) PH.bindVoices(chat, loadVoice);
    /* کلیک روی کارتِ رخداد: دسکتاپ همان بسته یا قلم در فرمِ کنار؛ موبایل کارتِ بات */
    const go = (sel, fallback) => { if (phoneMode) { S.tab = sel.startsWith("[data-bundle") ? "ready" : "spec"; const side = $("#side"); if (side) { side.innerHTML = sideHtml(); bindSide(); } return jumpTo(sel); } fallback(); };
    $$("[data-goto-b]", scr).forEach((el) => { el.onclick = () => go(`[data-bundle="${el.dataset.gotoB}"]`, () => bot("ic")); });
    $$("[data-goto-no]", scr).forEach((el) => { el.onclick = (e) => { e.stopPropagation(); const l = S.d.lines.find((x) => String(x.no) === el.dataset.gotoNo); go(`[data-line-no="${el.dataset.gotoNo}"]`, () => (l ? lineCard(l) : bot("ic"))); }; });
    const clr = $("[data-clear-chat]", scr);
    if (clr) clr.onclick = () => modal("پاک کردن گفت‌وگو", "<p>پیام‌های تا این لحظه از صفحهٔ شما پاک می‌شوند. در سامانه می‌مانند و کارشناس هنوز آن‌ها را می‌بیند.</p>", async () => {
      try { await api(`/sp/thread/${S.th}/clear`, { json: {} }); S.bot = []; S.flow = null; await loadThread(); } catch (e) { say(e.message); }
    }, "🧹 پاک شود", "انصراف");
  }
  /** پیامِ صوتی: تا رسیدن، حبابِ «در حال ارسال»؛ متنش را این‌جا هرگز نمی‌بینیم */
  async function sendVoice(blob, dur) {
    const p = { at: Date.now(), dur };
    S.pending.push(p); renderChat(true);
    try {
      const r = await api(`/sp/thread/${S.th}/voice?dur=${dur}`, { method: "POST", body: blob, headers: { "Content-Type": blob.type || "audio/webm" } });
      S.pending = S.pending.filter((x) => x !== p);
      addMsgs(r.msgs, true);
    } catch (e) { S.pending = S.pending.filter((x) => x !== p); renderChat(false); say(e.message); }
  }

  /* ================================================================
     فرمِ راست (دسکتاپ): مشخصات اقلام · ارسال‌ها و پیش‌فاکتور
     ================================================================ */
  function sideHtml() {
    const d = S.d, th = d.thread;
    const todo = d.lines.filter((l) => FILLING.includes(l.state)).length;
    const ready = d.lines.filter((l) => l.state === "ready").length;
    const needPf = S.pfRead ? d.bundles.filter((b) => b.state === "approved").length : 0;
    const tab = (id, label, n, warn) => `<button class="sp-tab ${S.tab === id ? "on" : ""}" data-tab="${id}">${label}${n ? ` <span class="sp-badge ${warn ? "wait" : "soft"}">${fa(n)}</span>` : ""}</button>`;
    return `<div class="sup-in">
      ${S.threads.length > 1 ? `<div class="sp-pills">${S.threads.map((t) => `<button class="sp-pill ${S.th === t.id ? "on" : ""}" data-th="${t.id}">استعلام ${esc(t.request_id)}${t.unread ? ` <span class="sp-badge">${fa(t.unread)}</span>` : ""}${S.pfRead && t.need_pf ? ` <span class="sp-badge wait">پیش‌فاکتور</span>` : ""}</button>`).join("")}</div>` : ""}
      <div class="sup-head"><div><h2>استعلام ${esc(th.request_id)}</h2><div class="sp-muted">کارشناس خرید: ${esc(th.expert)} · شرکت ${esc(S.company)}</div></div>
        ${S.botLogin && !inTg ? `<a class="tp-btn xs" href="${esc(S.botLogin)}" target="_blank" rel="noopener">📲 همین پنل در تلگرام</a>` : ""}</div>
      <nav class="sp-tabs sp-sticky">${tab("spec", "📝 مشخصات اقلام", todo)}${tab("ready", "📤 ارسال‌ها و پیش‌فاکتور", ready + needPf, needPf > 0)}</nav>
      <section id="pane">${S.tab === "spec" ? specPane() : readyPane()}</section></div>`;
  }
  /* فیلدهای هر کارت: data-f (مقدار، واحد، قیمت، توضیح، عنوانِ 🔓) و data-ly (لایه‌های 🔓) */
  const fieldsOf = (c) => $$("[data-f], [data-ly]", c);
  const fkey = (i) => (i.dataset.f ? `f:${i.dataset.f}` : `y:${i.dataset.ly}`);
  /** پیش از رسمِ دوبارهٔ فرم: مقدارهای نیمه‌نوشتهٔ کارت‌های تغییرکرده و جای اسکرول */
  function keepSideState() {
    const side = $("#side");
    const y = side ? side.scrollTop : 0;
    const vals = {};
    for (const id of S.dirty) { const c = $(`[data-line="${id}"]`); if (c) { vals[id] = {}; fieldsOf(c).forEach((i) => { vals[id][fkey(i)] = i.value; }); } }
    return () => {
      const s = $("#side"); if (s) s.scrollTop = y;
      for (const id of Object.keys(vals)) { const c = $(`[data-line="${id}"]`); if (!c) continue; fieldsOf(c).forEach((i) => { if (vals[id][fkey(i)] !== undefined) i.value = vals[id][fkey(i)]; }); recalc(c); }
    };
  }
  function jumpTo(sel) {
    const el = $(sel);
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    el.classList.add("sp-flash");
    setTimeout(() => el.classList.remove("sp-flash"), 1600);
  }

  /* --- مشخصات: هر قلم در سه کادر --- */
  const fileRow = (f, ed) => `<div class="sp-file"><b>${esc(f.label)}</b><span class="nm" title="${esc(f.filename)}">${esc(f.filename || "")}${f.note ? ` — ${esc(f.note)}` : ""}</span>
    <button class="tp-btn xs" data-open-file="${f.id}">👁 دیدن</button>${ed ? `<button class="tp-btn xs danger" data-del-file="${f.id}">🗑</button>` : ""}</div>`;
  /** شرایطِ فاکتورِ یک قلم: بستهٔ فرستاده‌شده عکسِ خودش را دارد؛ قلمِ قابل ویرایش شرایطِ جاریِ استعلام را */
  function termsFor(l) {
    if (l.bundle_id && !EDITABLE.includes(l.state)) { const b = S.d.bundles.find((x) => x.id === l.bundle_id); if (b && b.terms && Object.keys(b.terms).length) return b.terms; }
    return S.termsDraft || {};
  }
  const setTerm = (f, v) => { S.termsDraft = { ...(S.termsDraft || {}), [f]: v }; S.termsDirty = true; };
  /* فاز ۴ب گام ۳: «📋 شرایط خرید»ِ شرکت — قیدِ 🔒ِ مشترکِ اقلامِ قابلِ ویرایش (sp-core.js:threadFull) و خواستهٔ 🔓ِ هر قلم.
     🔒 بیرون از قید پذیرفته نیست (سرور هم می‌سنجد)؛ اقلامِ ناسازگار جدا فرستاده می‌شوند */
  const TL = () => (S.d && S.d.terms_lock) || { lock: {}, conflict: [] };
  const allowOf = (f) => { const t = TL(); return t.conflict.includes(f) ? null : t.lock[f] && t.lock[f].length ? t.lock[f] : null; };
  const rangeFa = (d) => (d.from && d.to ? `بین ${fa(d.from)} و ${fa(d.to)}` : d.to ? `حداکثر تا ${fa(d.to)}` : `از ${fa(d.from)} به بعد`);
  function limHint(f, l) {
    const t = TL(), L = l && l.limits && l.limits[f];
    if (t.conflict.includes(f)) return `<i class="sp-lim warn">⚠️ اقلامِ این استعلام شرطِ متفاوت دارند؛ هر بار اقلامِ هم‌شرط را با هم بفرستید</i>`;
    if (f === "dtime") {
      const d = t.lock.dtime;
      if (d && (d.from || d.to)) return `<i class="sp-lim">🔒 ${esc(rangeFa(d))}</i>`;
      return L && (L.from || L.to) ? `<i class="sp-lim open">🔓 خواستهٔ شرکت: ${esc(rangeFa(L))}</i>` : "";
    }
    const a = allowOf(f);
    if (a) return `<i class="sp-lim">🔒 فقط ${esc(a.join(" یا "))}</i>`;
    return L && L.opts ? `<i class="sp-lim open">🔓 خواستهٔ شرکت: ${esc(L.opts.join(" یا "))}</i>` : "";
  }
  /** «✏️ اصلاحِ پیشنهاد» (تصمیم ۲۵): پیشنهادِ تأییدنهایی‌شده در کارِ کارشناس هوشمند دوباره باز می‌شود؛ ارسالِ تازه جای قبلی را می‌گیرد */
  function reviseLine(id) {
    modal("✏️ اصلاحِ پیشنهاد", "<p>این پیشنهاد تأیید نهایی شده است. اگر قیمت یا شرایطِ بهتری دارید، دوباره باز می‌شود: عوضش کنید و «ارسال» را بزنید — پیشنهادِ تازه همان لحظه جای قبلی را می‌گیرد و تا آن موقع پیشنهادِ قبلی سرِ جایش است.</p>",
      async () => { try { await api(`/sp/line/${id}/revise`, { json: {} }); await loadThread(); } catch (e) { say(e.message); } }, "باز شود", "انصراف");
  }
  /* زمان تحویل (فاز ۴): «شمار روز» یا «تاریخ از تقویم» — مقدار همان رشته‌ای است که سرور می‌پذیرد: «10»، «10 روز کاری» یا «1405/08/01» */
  const J_RE = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/;
  function dtimeBox(v, ed) {
    const s = latin(String(v == null ? "" : v)).trim(), m = J_RE.exec(s), td = jToday();
    const date = !!m, y = m ? +m[1] : td.y, mo = m ? +m[2] : td.m, dd = m ? +m[3] : td.d;
    const dis = ed ? "" : "disabled";
    const years = [td.y, td.y + 1].concat(m && y !== td.y && y !== td.y + 1 ? [y] : []);
    return `<div class="sp-dt" data-dt>
      <select class="tp-select" data-dtm ${dis} aria-label="نوع زمان تحویل"><option value="d" ${date ? "" : "selected"}>شمار روز</option><option value="j" ${date ? "selected" : ""}>تاریخ</option></select>
      <input class="tp-input ${date ? "hide" : ""}" data-dtd inputmode="numeric" placeholder="مثلاً ۱۰ یا ۱۰ روز کاری" value="${date ? "" : esc(s)}" ${ed ? "" : "readonly"} aria-label="شمار روز">
      <span class="sp-jd ${date ? "" : "hide"}">
        <select class="tp-select" data-jd ${dis} aria-label="روز">${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}" ${i + 1 === dd ? "selected" : ""}>${fa(i + 1)}</option>`).join("")}</select>
        <select class="tp-select" data-jm ${dis} aria-label="ماه">${J_MONTHS.map((n, i) => `<option value="${i + 1}" ${i + 1 === mo ? "selected" : ""}>${n}</option>`).join("")}</select>
        <select class="tp-select" data-jy ${dis} aria-label="سال">${years.map((x) => `<option value="${x}" ${x === y ? "selected" : ""}>${fa(x)}</option>`).join("")}</select>
      </span></div>`;
  }
  /** مقدارِ زمان تحویل از کنترل‌های یک کارت */
  function dtimeOf(box) {
    if ($("[data-dtm]", box).value === "j") return `${$("[data-jy]", box).value}/${pad($("[data-jm]", box).value)}/${pad($("[data-jd]", box).value)}`;
    return latin($("[data-dtd]", box).value).trim();
  }
  /** همان زمان تحویل در کارت‌های دیگر (شرایط برای همهٔ اقلامِ استعلام یکی است) */
  function paintDt(box, v) {
    const s = latin(String(v == null ? "" : v)).trim(), m = J_RE.exec(s);
    $("[data-dtm]", box).value = m ? "j" : "d";
    $("[data-dtd]", box).classList.toggle("hide", !!m);
    $(".sp-jd", box).classList.toggle("hide", !m);
    if (!m) { $("[data-dtd]", box).value = s; return; }
    const ys = $("[data-jy]", box);
    if (![...ys.options].some((o) => +o.value === +m[1])) ys.insertAdjacentHTML("beforeend", `<option value="${+m[1]}">${fa(+m[1])}</option>`);
    ys.value = String(+m[1]); $("[data-jm]", box).value = String(+m[2]); $("[data-jd]", box).value = String(+m[3]);
  }
  function termsBox(l, ed) {
    const t = termsFor(l);
    const opt = (f) => `<option value="">—</option>${(S.enums[f] || []).filter((v) => !allowOf(f) || allowOf(f).includes(v)).map((v) => `<option ${t[f] === v ? "selected" : ""}>${esc(v)}</option>`).join("")}`;
    const ro = ed ? "" : "disabled";
    const req = (f) => (TERM_REQUIRED.includes(f) ? " <i class=\"sp-req\">*</i>" : "");
    return `<div class="sp-box3 terms"><b class="sp-bt">🧾 شرایط فاکتور <span class="sp-muted">(برای همهٔ اقلامِ این استعلام یکی است)</span></b>
      <div class="sp-grid5">
        <div class="sp-field sp-dtl">${termFa("dtime")}${req("dtime")}${limHint("dtime", l)}${dtimeBox(t.dtime, ed)}</div>
        <label>${termFa("pay")}${req("pay")}${limHint("pay", l)}<select class="tp-select" data-t="pay" ${ro}>${opt("pay")}</select></label>
        <label>${termFa("invoice")}${req("invoice")}${limHint("invoice", l)}<select class="tp-select" data-t="invoice" ${ro}>${opt("invoice")}</select></label>
        <label>${termFa("vat")}${req("vat")}${limHint("vat", l)}<select class="tp-select" data-t="vat" ${ro}>${opt("vat")}</select></label>
        <label>${termFa("valid_days")}${req("valid_days")}<input class="tp-input" data-t="valid_days" inputmode="numeric" placeholder="مثلاً ۷" value="${esc(t.valid_days ?? "")}" ${ed ? "" : "readonly"}></label>
      </div></div>`;
  }
  /*
   * کارت هر قلم. فاز ۴ (طرح «خرید هوشمند، کارشناس ناظر»): 🔒 فقط‌خواندنی، 🔓 قابل تغییر — عنوانِ 🔓 و هر لایهٔ 🔓 کادرِ خودش را
   * دارد؛ مقدارِ 🔒 کلِ مقدارِ درخواست است و 🔓 کمتر هم می‌شود؛ واحد همان واحدِ درخواست. لایهٔ تازه کیفی (متن) یا کمّی (عدد و واحد).
   * «آمادهٔ ارسال» که خورد، کارت قفل می‌شود و فقط دو راه دارد: «✏️ ویرایش» (برگشت به پیش‌نویس) یا «📤 ارسال».
   */
  function formCard(l) {
    const ed = FILLING.includes(l.state);
    /* پیش‌فرض: خلاصه با «📝 پر کردن اطلاعات»؛ فرمِ کامل فقط با «ویرایش جزئی» */
    if (ed && !S.formOpen[l.id]) return summaryCard(l);
    const ro = ed ? "" : "readonly";
    const lk = lockOf(l);
    const files = S.d.files.filter((f) => f.line_id === l.id);
    const extra = S.extra[l.id] || l.extra;
    const opts = S.labels.map((x) => `<option>${esc(x)}</option>`).join("") + `<option value="__o">سایر (برچسب دلخواه)…</option>`;
    const qLock = !lk.legacy && lk.qty, uLock = !lk.legacy && lk.unit;
    const req = `${qty(l.req_qty)} ${esc(l.req_unit || "")}`;
    const qHint = lk.legacy ? `خواستهٔ کارشناس: ${req}` : lk.qty ? `🔒 مقدار ثابت است: کلِ ${req}ِ درخواست. اگر کمتر دارید، زیر همین قلم بنویسید.`
      : `🔓 کمتر هم می‌شود — حداکثر ${req} (مقدارِ درخواست).`;
    const lockChips = l.layers.filter((x) => x.lock !== false).map((x) => `<span class="sp-chip lock">🔒 <i>${esc(x.k)}:</i> ${esc(x.v)}</span>`).join("");
    const openRows = l.layers.filter((x) => x.lock === false).map((x) => `<label class="sp-open">🔓 ${esc(x.k)} <span class="sp-muted">(درخواست: ${esc(x.v)} — خالی یعنی همان)</span>
        <input class="tp-input" data-ly="${esc(x.k)}" value="${esc(x.s || "")}" placeholder="${esc(x.v)}" ${ro}></label>`).join("");
    const readyMsg = S.pfRead ? "✅ این قلم آمادهٔ ارسال است. برای تغییر «✏️ ویرایش»، برای فرستادن به کارشناس «📤 ارسال» — اگر پیش‌فاکتور دارید با «📄 پیش‌فاکتور +» همراهش بفرستید."
      : "✅ این قلم آمادهٔ ارسال است. برای تغییر «✏️ ویرایش»، برای فرستادن به کارشناس «📤 ارسال» — پیش از ارسال، پیش‌نمایشِ پیش‌فاکتور را می‌بینید.";
    return `<article class="sp-card" data-line="${l.id}" data-line-no="${l.no || ""}">
      <header><h3>${code(l)}${esc(l.title)}</h3><span class="sp-st ${l.state}">${esc(l.state_fa)}</span></header>
      ${!lk.legacy && !lk.title ? `<label class="sp-open sp-title">🔓 عنوانِ پیشنهادیِ شما <span class="sp-muted">(اختیاری؛ خالی یعنی همان عنوانِ درخواست)</span>
        <input class="tp-input" data-f="title" value="${esc(l.s_title || "")}" placeholder="${esc(l.title)}" ${ro}></label>` : ""}
      <div class="sp-box3 amount"><b class="sp-bt">📦 مقدار، واحد و قیمت</b><div class="sp-grid4">
        <label>مقدار${qLock ? " 🔒" : lk.legacy ? "" : " 🔓"}<input class="tp-input" data-f="qty" inputmode="decimal" value="${l.qty == null ? "" : esc(l.qty)}" ${ed && !qLock ? "" : "readonly"}></label>
        <label>واحد${uLock ? " 🔒" : ""}<input class="tp-input" data-f="unit" value="${esc(l.unit || "")}" ${ed && !uLock ? "" : "readonly"}></label>
        <label>قیمت واحد (ریال، بدون ارزش افزوده)<input class="tp-input sp-strong" data-f="price" inputmode="numeric" value="${l.price == null ? "" : esc(l.price)}" ${ro}></label>
        <label>قیمت کل (ریال)<div class="sp-total" data-total>${money(l.total)}</div></label>
      </div><div class="sp-muted" style="margin-top:4px">${qHint}</div></div>
      ${termsBox(l, ed)}
      <div class="sp-box3 layers"><b class="sp-bt">${lk.legacy ? "🔒 نوع قلم و لایه‌های ویژگی" : `نوع قلم و لایه‌های ویژگی <span class="sp-muted">(🔒 ثابت · 🔓 قابل تغییر)</span>`}</b>
        ${l.head ? `<div class="sp-head-name">نوع قلم: <b>${esc(l.head)}</b></div>` : ""}
        ${lockChips ? `<div class="sp-chips">${lockChips}</div>` : openRows ? "" : `<span class="sp-muted">—</span>`}
        ${openRows ? `<div class="sp-opens">${openRows}</div>` : ""}
        ${extra.length ? `<div class="sp-chips" style="margin-top:6px">${extra.map((x, i) => `<span class="sp-chip add">➕ <i>${esc(x.k)}:</i> ${esc(x.v)}${x.u ? ` ${esc(x.u)}` : ""}${x.t === "num" ? ` <span class="sp-muted" title="لایهٔ کمّی">🔢</span>` : ""}${ed ? `<button data-rm-layer="${i}" title="حذف">✕</button>` : ""}</span>`).join("")}</div>` : ""}
        ${ed ? `<div class="sp-addlayer"><input class="tp-input" data-nk placeholder="لایهٔ تازه (مثلاً برند یا وزن)"><input class="tp-input" data-nv placeholder="مقدار">
          <select class="tp-select" data-nt aria-label="نوع لایه"><option value="">کیفی (متن)</option><option value="num">کمّی (عدد)</option></select>
          <input class="tp-input hide" data-nu placeholder="واحد (مثلاً کیلوگرم)"><button class="tp-btn sm" data-add-layer>➕ افزودن</button></div>` : ""}</div>
      <div class="sp-sec"><b>📝 توضیح زیر همین قلم</b><textarea class="tp-input tp-textarea" data-f="note" rows="2" style="min-height:54px" placeholder="اگر دربارهٔ لایه‌های 🔒، مقدار، تحویل یا کالای جایگزین توضیحی دارید همین‌جا بنویسید" ${ro}>${esc(l.note || "")}</textarea></div>
      <div class="sp-sec"><b>📎 پیوست‌ها — هر پیوست یک برچسب دارد</b><div class="sp-files">${files.map((f) => fileRow(f, ed)).join("") || `<span class="sp-muted">—</span>`}</div>
        ${!["final", "rejected"].includes(l.state) ? `<div class="sp-upl"><select class="tp-select" data-flabel>${opts}</select><input class="tp-input hide" data-flabel2 placeholder="برچسب دلخواه">
          <input class="tp-input" data-fnote placeholder="توضیح پیوست (اختیاری)"><input class="tp-input full" type="file" data-file accept=".pdf,image/*,.doc,.docx,.xls,.xlsx">
          <button class="tp-btn sm full" data-upload>بارگذاری پیوست</button></div>` : ""}</div>
      ${ed ? `<div class="sp-actions"><button class="tp-btn" data-form-close="${l.id}">↩ خلاصه</button><button class="tp-btn" data-save>ذخیره</button><button class="tp-btn primary" data-ready="1">✓ آمادهٔ ارسال</button></div>`
        : l.state === "ready" ? `<div class="sp-lockedmsg">${readyMsg}</div>
          <div class="sp-actions"><button class="tp-btn" data-ready="0">✏️ ویرایش</button><button class="tp-btn primary" data-send-ready>📤 ارسال</button></div>`
        : `<div class="sp-lockedmsg">${esc(lockedMsg(l))}</div>${l.state === "final" && S.d.revise ? `<div class="sp-actions"><button class="tp-btn" data-revise="${l.id}" title="قیمت یا شرایطِ بهتری دارید؟ پیشنهاد دوباره باز می‌شود؛ ارسالِ تازه جای قبلی را می‌گیرد">✏️ اصلاحِ پیشنهاد</button></div>` : ""}`}
    </article>`;
  }
  /** کادرِ ارسال: هم در «مشخصات اقلام»، هم در «ارسال‌ها». خوانش هوشمند خاموش (فاز ۴): پیش‌نمایشِ پیش‌فاکتورِ سامانه و بعد ارسال */
  function sendBox(where) {
    const ready = S.d.lines.filter((l) => l.state === "ready");
    const cnt = `${ready.length ? `${fa(ready.length)} قلمِ آماده${where === "spec" ? "" : " (تیک‌خورده‌های جدول)"}` : "هنوز قلمی «آمادهٔ ارسال» نیست"}`;
    if (!S.pfRead) {
      return `<div class="sp-sendbox">
        <div class="sp-row"><b>📤 ارسال برای کارشناس</b><span class="sp-muted">${cnt} — پیش‌فاکتور را سامانه از همین فیلدها می‌سازد؛ پیش از ارسال پیش‌نمایشش را می‌بینید.</span></div>
        <div class="sp-row" style="margin-top:8px">
          <label class="tp-btn sm sp-pfplus">📎 پیش‌فاکتورِ خودم<input type="file" data-pf-pick accept=".pdf,image/*" hidden></label>
          ${S.pfFile ? `<span class="sp-pfname">📎 ${esc(S.pfFile.name)} <button class="tp-btn xs" data-pf-clear title="برداشتن">✕</button></span>` : `<span class="sp-muted">اختیاری — فقط پیوستِ همین ارسال می‌شود.</span>`}
          <span class="sp-grow"></span><button class="tp-btn" data-preview="${where}">👁 پیش‌نمایش پیش‌فاکتور</button>
          <button class="tp-btn primary" data-send-box="${where}" ${ready.length ? "" : "disabled"}>📤 ارسال…</button>
        </div></div>`;
    }
    return `<div class="sp-sendbox">
      <div class="sp-row"><b>📤 ارسال برای کارشناس</b><span class="sp-muted">${cnt} — مشخصات به‌شکل کارت در گفت‌وگو هم می‌نشیند.</span></div>
      <div class="sp-row" style="margin-top:8px">
        <label class="tp-btn sm sp-pfplus">📄 پیش‌فاکتور +<input type="file" data-pf-pick accept=".pdf,image/*" hidden></label>
        ${S.pfFile ? `<span class="sp-pfname">📄 ${esc(S.pfFile.name)} <button class="tp-btn xs" data-pf-clear title="برداشتن">✕</button></span>` : `<span class="sp-muted">اختیاری — اگر پیش‌فاکتور دارید همین‌جا اضافه کنید تا با مشخصات یک‌جا برود.</span>`}
        <span class="sp-grow"></span><button class="tp-btn primary" data-send-box="${where}" ${ready.length ? "" : "disabled"}>📤 ارسال${S.pfFile ? " با پیش‌فاکتور" : ""}</button>
      </div></div>`;
  }
  function specPane() {
    const d = S.d;
    const ret = d.bundles.filter((b) => b.state === "returned" && b.comment).slice(-1)[0];
    const lines = d.lines.slice().sort((a, b) => b.id - a.id);
    const locked = d.lines.some((l) => !lockOf(l).legacy);
    return `${ret ? `<div class="tp-note warn">↩️ کارشناس برگرداند: ${esc(ret.comment)}</div>` : ""}
      ${sendBox("spec")}
      <p class="sp-muted">${locked ? "🔒 ثابت · 🔓 قابل تغییر — " : ""}هر قلم را با «📝 پر کردن اطلاعات» (در گوشی) یا «ویرایش جزئی» کامل کنید؛ بعد «✓ آمادهٔ ارسال» و «📤 ارسال». ${UI.info("sup.panel", "راهنما")}</p>
      ${lines.map(formCard).join("")}`;
  }
  /** کارتِ خلاصهٔ هر قلم در فرمِ راست (دسکتاپ): چیپ‌های مشخصات، یک خطِ مقدار و قیمت، مانده‌ها و سه دکمه (مهر ۱۴۰۵) */
  function summaryCard(l) {
    const tm = termsFor(l), files = S.d.files.filter((f) => f.line_id === l.id), lk = lockOf(l);
    const miss = [...(l.missing || []), ...termsMissing(threadTerms())];
    const extra = S.extra[l.id] || l.extra;
    return `<article class="sp-card sp-sum" data-line="${l.id}" data-line-no="${l.no || ""}">
      <header><h3>${code(l)}${esc(l.s_title || l.title)}</h3><span class="sp-st ${l.state}">${esc(l.state_fa)}</span></header>
      <div class="sp-chips">${l.head ? `<span class="sp-chip lock"><i>نوع قلم:</i> ${esc(l.head)}</span>` : ""}${l.layers.map((x) => `<span class="sp-chip ${x.lock === false ? "add" : "lock"}">${x.lock === false ? "🔓" : "🔒"} <i>${esc(x.k)}:</i> ${esc(x.s || x.v)}</span>`).join("")}${extra.map((x) => `<span class="sp-chip add">➕ <i>${esc(x.k)}:</i> ${esc(x.v)}${x.u ? ` ${esc(x.u)}` : ""}</span>`).join("")}</div>
      <div class="sp-row" style="margin-top:8px"><b>${qty(l.qty)} ${esc(l.unit || "")}</b> × <b>${money(l.price)}</b> = <b>${money(l.total)}</b> ریال <span class="sp-muted">(درخواست${lk.legacy ? "" : lk.qty ? " 🔒" : " 🔓"}: ${qty(l.req_qty)} ${esc(l.req_unit || "")})</span></div>
      <div class="sp-muted">🧾 ${esc(termsLine(tm)) || "شرایط فاکتور: —"}</div>
      ${l.note ? `<div class="sp-muted">📝 ${esc(l.note)}</div>` : ""}${files.length ? `<div class="sp-muted">📎 ${files.map((f) => esc(f.label)).join("، ")}</div>` : ""}
      ${miss.length ? `<div class="sp-muted" style="margin-top:6px">مانده: <b>${esc(miss.join("، "))}</b></div>` : `<div class="sp-ok">همه‌چیز پر است؛ «✓ آمادهٔ ارسال» را بزنید.</div>`}
      <div class="sp-actions"><button class="tp-btn ${miss.length ? "primary" : ""}" data-wz="${l.id}">📝 پر کردن اطلاعات</button><button class="tp-btn" data-form-open="${l.id}">✏️ ویرایش جزئی</button><button class="tp-btn ${miss.length ? "" : "primary"}" data-ready-sum="1" ${miss.length ? "disabled" : ""}>✓ آمادهٔ ارسال</button></div>
    </article>`;
  }
  function readyPane() {
    const d = S.d;
    const ready = d.lines.filter((l) => l.state === "ready");
    const byId = new Map(d.lines.map((l) => [l.id, l]));
    const sum = ready.reduce((s, l) => s + (l.total || 0), 0);
    let h = `<div class="sp-card"><header><h3>اقلام آمادهٔ ارسال</h3></header>`;
    h += ready.length ? `<div class="sp-scroll"><table class="sp-table"><thead><tr><th></th><th>قلم</th><th>مقدار</th><th>واحد</th><th>قیمت واحد (ریال)</th><th>قیمت کل (ریال)</th></tr></thead><tbody>
      ${ready.map((l) => `<tr><td><input type="checkbox" data-pick="${l.id}" checked></td><td class="t">${code(l)}${esc(l.s_title || l.title)}</td><td>${qty(l.qty)}</td><td>${esc(l.unit || "")}</td><td><b>${money(l.price)}</b></td><td><b>${money(l.total)}</b></td></tr>`).join("")}
      </tbody><tfoot><tr><td></td><td class="t">جمع</td><td colspan="3"></td><td>${money(sum)}</td></tr></tfoot></table></div>
      <div class="sp-muted" style="margin-top:6px">🧾 شرایط فاکتور: ${esc(termsLine(S.termsDraft)) || "—"}</div>`
      : `<p class="sp-muted">هنوز قلمی «آمادهٔ ارسال» نیست. در «مشخصات اقلام» هر قلم را کامل کنید و «آمادهٔ ارسال» بزنید.</p>`;
    h += `${sendBox("ready")}</div>`;
    const bundles = d.bundles.slice().reverse();
    if (bundles.length) h += `<h3 style="margin:18px 0 0;font-size:1rem">ارسال‌های شما</h3>`;
    for (const b of bundles) {
      const ls = b.line_ids.map((id) => byId.get(id)).filter(Boolean);
      const open = ["pending", "approved", "proforma"].includes(b.state);
      /* خوانش هوشمند خاموش: پیش‌فاکتورِ سامانه دیدنی و Word؛ پیش‌فاکتورِ خودِ تأمین‌کننده فقط پیوست */
      const gen = !S.pfRead ? `<div class="sp-row"><button class="tp-btn xs" data-gen-pf="${b.id}">👁 پیش‌فاکتور</button><button class="tp-btn xs" data-gen-word="${b.id}">⬇️ Word</button>
          ${b.pf ? `<span class="sp-muted">📎 پیوست: ${esc(b.pf.name)}</span><button class="tp-btn xs" data-open-pf="${b.id}">دیدنِ پیوست</button>` : ""}</div>
        ${open ? `<div class="sp-muted">منتظر ${b.state === "pending" ? "بررسیِ" : "تأیید نهاییِ"} کارشناس.</div>
          <div class="sp-row"><input class="tp-input sp-grow" type="file" data-pf-file="${b.id}" accept=".pdf,image/*"><button class="tp-btn xs" data-pf="${b.id}">📎 ${b.pf ? "عوض کردنِ پیوست" : "پیوستِ پیش‌فاکتورِ خودم"}</button></div>` : ""}` : "";
      h += `<div class="sp-bundle" data-bundle="${b.id}"><header><b>بستهٔ ${fa(b.id)}</b><span class="sp-st ${b.state}">${esc(b.state_fa)}</span><span class="sp-muted">${when(b.created_at)}</span></header>
        <div class="sp-muted">${ls.map((l) => `${code(l)}${esc(l.s_title || l.title)} — ${qty(l.qty)} ${esc(l.unit || "")} × <b>${money(l.price)}</b>`).join("<br>")}</div>
        ${termsLine(b.terms) ? `<div class="sp-muted">🧾 ${esc(termsLine(b.terms))}</div>` : ""}
        ${b.comment ? `<div class="sp-comment">${esc(b.comment)}</div>` : ""}
        ${gen}
        ${S.pfRead && b.state === "approved" ? `<div class="tp-note">مشخصات تأیید شد. پیش‌فاکتورِ همین ${fa(ls.length)} قلم را بارگذاری کنید — لایه‌ها، مقدار، واحد و قیمت واحدِ هر قلم و شرایط فاکتور (زمان تحویل، تسویه، نوع فاکتور، ارزش افزوده) باید صریح در آن آمده باشد.</div>
          <div class="sp-row"><input class="tp-input sp-grow" type="file" data-pf-file="${b.id}" accept=".pdf,image/*"><button class="tp-btn primary sm" data-pf="${b.id}">بارگذاری پیش‌فاکتور</button></div>` : ""}
        ${S.pfRead && b.state === "proforma" ? `<div class="sp-row"><span>📄 ${esc(b.pf ? b.pf.name : "")}</span><button class="tp-btn xs" data-open-pf="${b.id}">👁 دیدن</button>
          <span class="sp-grow"></span><input class="tp-input" type="file" data-pf-file="${b.id}" accept=".pdf,image/*" style="max-width:220px"><button class="tp-btn xs" data-pf="${b.id}">عوض کردن</button></div>
          <div class="sp-muted">منتظر بررسی و تأیید نهایی کارشناس.</div>` : ""}
        ${b.state === "final" ? `<div class="sp-ok">✓ تأیید نهایی شد${S.pfRead ? "" : " — ممنون از همکاری‌تان"}.</div>` : ""}
      </div>`;
    }
    return h;
  }

  function cardOf(el) { const c = el.closest("[data-line]"); return c ? { c, id: +c.dataset.line } : null; }
  function recalc(c) {
    const qi = $('[data-f="qty"]', c), pi = $('[data-f="price"]', c), t = $("[data-total]", c);
    if (!qi || !pi || !t) return;   /* کارتِ خلاصه فیلد ندارد */
    const q = toNum(qi.value), p = toNum(pi.value);
    t.textContent = q != null && p != null && !isNaN(q) && !isNaN(p) ? money(q * p) : "—";
  }
  /** شناسه‌های اقلامی که کادرِ ارسال برایشان است: جدولِ «ارسال‌ها» (تیک‌خورده‌ها) یا همهٔ آماده‌ها */
  function sendIds(where) {
    const side = $("#side"), picks = side ? $$("[data-pick]", side) : [];
    return where === "ready" && picks.length ? picks.filter((x) => x.checked).map((x) => +x.dataset.pick) : S.d.lines.filter((l) => l.state === "ready").map((l) => l.id);
  }
  function bindSide() {
    const side = $("#side"); if (!side) return;
    const Q = (s) => $$(s, side);
    Q("[data-tab]").forEach((b) => { b.onclick = () => { S.tab = b.dataset.tab; side.innerHTML = sideHtml(); bindSide(); }; });
    Q("[data-th]").forEach((b) => { b.onclick = () => openThread(+b.dataset.th).catch((e) => say(e.message)); });
    /* کارتِ خلاصه: «📝 پر کردن اطلاعات» کارت‌های نوبتی را در گوشی می‌آورد؛ «ویرایش جزئی» فرمِ کامل را باز می‌کند */
    Q("[data-wz]").forEach((b) => { b.onclick = () => { bot(`wz:${b.dataset.wz}`); const ph = $(".ph-screen"); if (ph) ph.scrollIntoView({ block: "nearest", behavior: "smooth" }); }; });
    Q("[data-form-open]").forEach((b) => { b.onclick = () => { S.formOpen[+b.dataset.formOpen] = true; rerenderCard(+b.dataset.formOpen); }; });
    Q("[data-form-close]").forEach((b) => { b.onclick = () => { const id = +b.dataset.formClose; if (S.dirty.has(id) && !confirm("تغییرات ذخیره‌نشده دارید. بی ذخیره بسته شود؟")) return; S.dirty.delete(id); delete S.formOpen[id]; rerenderCard(id); }; });
    Q("[data-ready-sum]").forEach((b) => { b.onclick = async () => { const id = cardOf(b).id; try { await api(`/sp/line/${id}/ready`, { json: { on: true } }); await loadThread(); } catch (e) { say(e.message); } }; });
    Q("[data-f], [data-ly]").forEach((i) => { i.oninput = () => { const x = cardOf(i); S.dirty.add(x.id); if (i.dataset.f === "qty" || i.dataset.f === "price") recalc(x.c); }; });
    /* شرایط فاکتور در همهٔ کارت‌ها یکی است: نوشتن در یکی، بقیه را هم همان می‌کند */
    Q("[data-t]").forEach((i) => {
      const sync = () => {
        setTerm(i.dataset.t, i.value);
        Q(`[data-t="${i.dataset.t}"]`).forEach((o) => { if (o !== i && !o.disabled && !o.readOnly) o.value = i.value; });
      };
      i.oninput = sync; i.onchange = sync;
    });
    Q("[data-dt]").forEach((box) => {
      const upd = () => {
        const date = $("[data-dtm]", box).value === "j";
        $("[data-dtd]", box).classList.toggle("hide", date);
        $(".sp-jd", box).classList.toggle("hide", !date);
        const v = dtimeOf(box);
        setTerm("dtime", v);
        Q("[data-dt]").forEach((o) => { if (o !== box && !$("[data-dtm]", o).disabled) paintDt(o, v); });
      };
      $$("select, input", box).forEach((i) => { i.oninput = upd; i.onchange = upd; });
    });
    Q("[data-nt]").forEach((s) => { s.onchange = () => $("[data-nu]", cardOf(s).c).classList.toggle("hide", s.value !== "num"); });
    Q("[data-add-layer]").forEach((b) => {
      b.onclick = () => {
        const x = cardOf(b); const k = $("[data-nk]", x.c).value.trim(), v = $("[data-nv]", x.c).value.trim();
        const num = $("[data-nt]", x.c).value === "num", u = $("[data-nu]", x.c).value.trim();
        if (!k || !v) return say("نام لایه و مقدارش را بنویسید.");
        const l = lineOf(x.id);
        const own = l.layers.find((y) => y.k.trim() === k);
        if (own) return say(own.lock === false ? `«${k}» از لایه‌های همین قلم است و 🔓 است؛ مقدارش را سرِ جای خودش عوض کنید.` : `«${k}» لایهٔ قفل‌شدهٔ کارشناس (🔒) است و تغییر نمی‌کند؛ اگر توضیحی دارید زیر همان قلم بنویسید.`);
        let item = { k, v };
        if (num) {
          const n = toNum(v);
          if (n == null || Number.isNaN(n)) return say(`لایهٔ «${k}» کمّی است و مقدارش باید عدد باشد.`);
          item = { k, v: String(n), t: "num", ...(u ? { u } : {}) };
        }
        S.extra[x.id] = [...(S.extra[x.id] || []).filter((y) => y.k !== k), item];
        S.dirty.add(x.id); rerenderCard(x.id);
      };
    });
    Q("[data-rm-layer]").forEach((b) => { b.onclick = () => { const x = cardOf(b); S.extra[x.id].splice(+b.dataset.rmLayer, 1); S.dirty.add(x.id); rerenderCard(x.id); }; });
    Q("[data-save]").forEach((b) => { b.onclick = () => saveLine(cardOf(b).id).then(() => loadThread()).catch((e) => say(e.message)); });
    Q("[data-revise]").forEach((b) => { b.onclick = () => reviseLine(+b.dataset.revise); });
    Q("[data-ready]").forEach((b) => {
      b.onclick = async () => {
        const id = cardOf(b).id;
        try {
          if (b.dataset.ready === "1") await saveLine(id);
          await api(`/sp/line/${id}/ready`, { json: { on: b.dataset.ready === "1" } });
          await loadThread();
        } catch (e) { say(e.message); }
      };
    });
    Q("[data-flabel]").forEach((s) => { s.onchange = () => $("[data-flabel2]", cardOf(s).c).classList.toggle("hide", s.value !== "__o"); });
    Q("[data-upload]").forEach((b) => { b.onclick = () => uploadFile(cardOf(b)); });
    Q("[data-open-file]").forEach((b) => { b.onclick = () => openUrl(`/sp/file/${b.dataset.openFile}/url`); });
    Q("[data-del-file]").forEach((b) => { b.onclick = () => modal("حذف پیوست", "<p>این پیوست حذف شود؟</p>", async () => { try { await api(`/sp/file/${b.dataset.delFile}`, { method: "DELETE" }); await loadThread(); } catch (e) { say(e.message); } }, "حذف", "انصراف"); });
    Q("[data-pf-pick]").forEach((inp) => { inp.onchange = () => { const f = inp.files && inp.files[0]; if (!f) return; if (f.size > 20 * 1048576) return say("حجم فایل بیشتر از ۲۰ مگابایت است."); S.pfFile = f; side.innerHTML = sideHtml(); bindSide(); }; });
    Q("[data-pf-clear]").forEach((b) => { b.onclick = () => { S.pfFile = null; side.innerHTML = sideHtml(); bindSide(); }; });
    Q("[data-send-box]").forEach((b) => { b.onclick = () => submitDialog(sendIds(b.dataset.sendBox)); });
    Q("[data-preview]").forEach((b) => { b.onclick = () => previewDialog(sendIds(b.dataset.preview), true); });
    Q("[data-send-ready]").forEach((b) => { b.onclick = () => submitDialog(S.d.lines.filter((l) => l.state === "ready").map((l) => l.id)); });
    Q("[data-pf]").forEach((b) => { b.onclick = () => uploadPf(+b.dataset.pf); });
    Q("[data-open-pf]").forEach((b) => { b.onclick = () => openUrl(`/sp/bundle/${b.dataset.openPf}/pf-url`); });
    Q("[data-gen-pf]").forEach((b) => { b.onclick = () => bundlePfDialog(+b.dataset.genPf); });
    Q("[data-gen-word]").forEach((b) => { b.onclick = () => downloadDocx(`/sp/bundle/${b.dataset.genWord}/proforma?format=docx`, `پیش‌فاکتور — درخواست ${S.d.thread.request_id} — بستهٔ ${b.dataset.genWord}`); });
  }
  function submitDialog(ids) {
    if (!ids.length) return say("دست‌کم یک قلم را تیک بزنید.");
    /* خوانش هوشمند خاموش: اول پیش‌نمایشِ همان پیش‌فاکتوری که سامانه می‌سازد، «📤 ارسال» در همان پنجره */
    if (!S.pfRead) return previewDialog(ids, true);
    const ls = S.d.lines.filter((l) => ids.includes(l.id));
    const pf = S.pfFile;
    modal("ارسال مشخصات", `<p>مشخصات ${fa(ids.length)} قلم برای کارشناس فرستاده شود؟ تا تصمیم کارشناس، این اقلام قابل ویرایش نیستند.</p>
      <p class="sp-muted">${ls.map((l) => `• ${code(l)}${esc(l.title)} — ${qty(l.qty)} ${esc(l.unit || "")} × ${money(l.price)} ریال`).join("<br>")}</p>
      <p class="sp-muted">🧾 ${esc(termsLine(S.termsDraft)) || "—"}</p>
      <p>${pf ? `📄 همراه با پیش‌فاکتور «<b>${esc(pf.name)}</b>» — مرحلهٔ «تأیید و درخواست پیش‌فاکتور» لازم نیست.` : "📄 بدون پیش‌فاکتور — بعد از تأیید کارشناس می‌فرستید (یا اول با «📄 پیش‌فاکتور +» اضافه کنید)."}</p>`, async () => {
      try {
        if (pf) {
          await api(`/sp/thread/${S.th}/submit-pf?ids=${ids.join(",")}&filename=${encodeURIComponent(pf.name)}`, { method: "POST", body: pf, headers: { "Content-Type": pf.type || "application/octet-stream" } });
          S.pfFile = null;
        } else await api(`/sp/thread/${S.th}/submit`, { json: { line_ids: ids } });
        await loadThread();
      } catch (e) { say(e.message); }
    }, pf ? "📤 ارسال با پیش‌فاکتور" : "📤 ارسال", "انصراف");
  }

  /* ---------- پیش‌فاکتورِ سامانه (فاز ۴؛ worker/pfdoc.js): پیش‌نمایش، چاپ به PDF و Word ---------- */
  /** پیش از پیش‌نمایش، کارت‌های تغییرکرده و شرایط ذخیره می‌شوند — پیش‌نمایش از همان مقدارهای ذخیره‌شده ساخته می‌شود */
  async function saveDirty() {
    const had = S.dirty.size > 0 || S.termsDirty;
    for (const id of [...S.dirty]) await saveLine(id);
    if (S.termsDirty) await saveTerms();
    return had;
  }
  const pfTools = () => `<div class="sp-row sp-pftools"><button class="tp-btn xs" data-pf-print>🖨 چاپ یا ذخیرهٔ PDF</button><button class="tp-btn xs" data-pf-word>⬇️ فایل Word</button></div>`;
  function bindPfTools(root, o) {
    const p = $("[data-pf-print]", root); if (p) p.onclick = () => printHtml(o.name, o.css, o.html);
    const w = $("[data-pf-word]", root); if (w) w.onclick = o.word;
  }
  /** پیش‌نمایشِ پیش‌فاکتور پیش از ارسال (اقلامِ ids، وگرنه «آمادهٔ ارسال»ها یا همهٔ قابل ویرایش‌ها)؛ canSend: «📤 ارسال» در همین پنجره */
  async function previewDialog(ids, canSend) {
    let r;
    try {
      if (await saveDirty()) await loadThread();
      r = await api(`/sp/thread/${S.th}/preview`, { json: { line_ids: ids && ids.length ? ids : null } });
    } catch (e) { return say(e.message); }
    const send = !!(canSend && ids && ids.length && r.ready);
    const miss = r.missing.length ? `<div class="tp-note warn">⛔ هنوز کامل نیست — خانه‌های قرمز را پر کنید${r.missing.some((m) => /^(qty|price):/.test(m)) ? " (مقدار یا قیمتِ بعضی اقلام هم مانده)" : ""}؛ بعد «آمادهٔ ارسال» و «📤 ارسال».</div>` : "";
    const tail = send ? `<p class="sp-muted">با «📤 ارسال»، همین پیش‌فاکتور و مشخصاتِ ${fa(r.line_ids.length)} قلم برای کارشناس می‌رود و تا تصمیمِ او قابل ویرایش نیست.${S.pfFile ? ` پیوست: پیش‌فاکتورِ خودتان «${esc(S.pfFile.name)}».` : ""}</p>` : "";
    const d = modal("👁 پیش‌نمایش پیش‌فاکتور", `${miss}${pfTools()}<style>${r.css}</style><div class="sp-pfview">${r.html}</div>${tail}`,
      send ? () => doSubmit(r.line_ids) : null, send ? "📤 ارسال برای کارشناس" : null, "بستن");
    d.classList.add("sp-pfmodal");
    bindPfTools(d, { css: r.css, html: r.html, name: `پیش‌نمایش پیش‌فاکتور — درخواست ${S.d.thread.request_id}`,
      word: () => downloadDocx(`/sp/thread/${S.th}/preview?format=docx`, `پیش‌نمایش پیش‌فاکتور — درخواست ${S.d.thread.request_id}`, { line_ids: r.line_ids }) });
  }
  /** پیش‌فاکتورِ یک بستهٔ فرستاده‌شده */
  async function bundlePfDialog(bid) {
    let r;
    try { r = await api(`/sp/bundle/${bid}/proforma`); } catch (e) { return say(e.message); }
    const d = modal(`📄 ${esc(r.name)}`, `${pfTools()}<style>${r.css}</style><div class="sp-pfview">${r.html}</div>`, null, null, "بستن");
    d.classList.add("sp-pfmodal");
    bindPfTools(d, { css: r.css, html: r.html, name: r.name, word: () => downloadDocx(`/sp/bundle/${bid}/proforma?format=docx`, r.name) });
  }
  async function doSubmit(ids) {
    const pf = S.pfFile;
    try {
      const r = pf
        ? await api(`/sp/thread/${S.th}/submit-pf?ids=${ids.join(",")}&filename=${encodeURIComponent(pf.name)}`, { method: "POST", body: pf, headers: { "Content-Type": pf.type || "application/octet-stream" } })
        : await api(`/sp/thread/${S.th}/submit`, { json: { line_ids: ids } });
      S.pfFile = null;
      await loadThread();
      say(`پیشنهادتان با پیش‌فاکتورِ سامانه${pf ? " و پیوستِ پیش‌فاکتورِ خودتان" : ""} برای کارشناس فرستاده شد (بستهٔ ${fa(r.bundle_id)}). نتیجهٔ بررسی را در همین گفت‌وگو خبر می‌دهیم.`, "✓ فرستاده شد");
    } catch (e) { say(e.message); }
  }
  /** چاپ — مرورگر از همان پنجره «ذخیره به PDF» هم می‌دهد (ph-chat.js) */
  const printHtml = (title, css, html) => PH.printDoc(title, css, html, () => say("چاپ در این مرورگر باز نشد؛ فایل Word را بگیرید."));
  /** فایل Word — با همان نشستِ این صفحه */
  async function downloadDocx(path, name, body) {
    try {
      const res = await fetch(API + path, body ? { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(body) } : { headers: authHeaders() });
      if (!res.ok) { let m = `خطای سرور ${res.status}`; try { m = (await res.json()).error || m; } catch (_) { /* بی بدنه */ } throw new Error(m); }
      PH.saveBlob(await res.blob(), `${name}.docx`);
    } catch (e) { say(e.message); }
  }
  function rerenderCard(id) {
    const c = $(`[data-line="${id}"]`);
    const vals = {}; fieldsOf(c).forEach((i) => { vals[fkey(i)] = i.value; });
    const t = document.createElement("div"); t.innerHTML = formCard(lineOf(id));
    const fresh = t.firstElementChild; c.replaceWith(fresh);
    fieldsOf(fresh).forEach((i) => { if (vals[fkey(i)] !== undefined) i.value = vals[fkey(i)]; });
    recalc(fresh);
    bindSide();
  }
  async function saveTerms() {
    const tb = {}; for (const f of TERM_FIELDS) tb[f] = S.termsDraft ? S.termsDraft[f] ?? "" : "";
    const r = await api(`/sp/thread/${S.th}/terms`, { json: tb });
    S.termsDraft = { ...r.terms }; S.termsDirty = false;
  }
  /** ذخیرهٔ کارت: مقدار، واحد، قیمت، توضیح، لایه‌های افزوده و (فاز ۴) عنوان و لایه‌های 🔓 — و اگر شرایط فاکتور عوض شده، آن هم (برای همهٔ اقلام) */
  async function saveLine(id) {
    const c = $(`[data-line="${id}"]`);
    if (!c) return;
    const body = { extra: S.extra[id] || [] };
    $$("[data-f]", c).forEach((i) => { body[i.dataset.f] = i.value; });
    const ly = $$("[data-ly]", c);
    if (ly.length) { body.layers = {}; ly.forEach((i) => { body.layers[i.dataset.ly] = i.value; }); }
    for (const f of ["qty", "price"]) { const n = toNum(body[f]); if (Number.isNaN(n)) throw new Error(f === "qty" ? "مقدار باید عدد باشد." : "قیمت واحد باید عدد باشد."); body[f] = n; }
    if (S.termsDirty) await saveTerms();
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
      say(S.pfRead ? "پیش‌فاکتور رسید و برای کارشناس فرستاده شد." : "پیش‌فاکتورِ خودتان پیوستِ همین ارسال شد.", "✓ بارگذاری شد");
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
  function addMsgs(list, mine) {
    const fresh = (list || []).filter((m) => m.id > S.lastMsg);
    if (!fresh.length) return;
    S.d.msgs.push(...fresh); S.lastMsg = fresh[fresh.length - 1].id;
    renderChat(!!mine || chatScroll() == null);
  }
  let timer = null, tick = 0;
  function startPoll() { stopPoll(); timer = setInterval(poll, 6000); }
  function stopPoll() { if (timer) clearInterval(timer); timer = null; }
  async function poll() {
    if (document.hidden || !S.th || S.busy || document.querySelector(".tp-modal-bg")) return;
    onPhoneMode();
    S.busy = true;
    try {
      const r = await api(`/sp/poll?t=${S.th}&since=${S.lastMsg}`);
      addMsgs(r.msgs);
      const typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
      if (r.rev !== S.rev && !S.dirty.size && !S.termsDirty && !typing && !S.flow) await loadThread();
      if (++tick % 5 === 0 && S.threads.length > 1) { const d = await api("/sp/me"); S.threads = d.threads || S.threads; }
      const ck = $(".ph-clock"); if (ck) ck.textContent = PH.clock();
    } catch (e) { if (e.status === 401 && !inTg) { stopPoll(); renderLogin("نشست شما تمام شده است؛ دوباره وارد شوید."); } }
    S.busy = false;
  }
  window.addEventListener("beforeunload", (e) => { if (S.dirty.size || S.termsDirty) { e.preventDefault(); e.returnValue = ""; } });

  boot();
})();
