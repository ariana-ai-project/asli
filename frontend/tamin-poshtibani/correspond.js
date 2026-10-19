/* ============================================================
   مکاتبات کارشناس با تأمین‌کنندگان (دموی مهر ۱۴۰۵) — مرورگر و مینی‌اپ تلگرام
   چیدمان (از ۹۶۱ پیکسل به بالا): راست، دو ستونِ درخواست‌ها و تأمین‌کنندگانِ درخواستِ انتخاب‌شده (با شمار
   نخوانده)؛ وسط، «اقلام و تصمیم‌ها»؛ چپ، گفت‌وگو داخلِ قابِ آیفون به سبک پیام‌رسانِ iOS 26 (درخواست مالک،
   مهر ۱۴۰۵): حباب‌های شیشه‌ای — پیامِ ما آبیِ لوگو، پیامِ تأمین‌کننده طوسیِ خیلی کمرنگ. زیرِ آن پهنا (گوشی
   واقعی و مینی‌اپ) همان صفحهٔ گفت‌وگو تمام‌صفحه و بی‌قاب است و «اقلام و تصمیم‌ها» با دکمهٔ 📦 بالای گفت‌وگو باز می‌شود.
   هر گفت‌وگو = یک درخواست × یک تأمین‌کننده. «اقلام و تصمیم‌ها»: بسته‌هایی که تأمین‌کننده فرستاده و تصمیم روی
   آن‌ها؛ خوانش هوشمند پیش‌فاکتور با جدول تطابق (✅ ⚠️ ⚪ ❌) و تیکِ هر ردیفِ غیرسبز (پیش‌فاکتور ملاک)، و تأیید
   نهایی ← تب استعلامات. پیامِ هر بسته در گفت‌وگو کارتی است که کلیکش به همان بسته می‌رود.
   کارشناس «🤖 هوشمند» (تیکش در پنل پشتیبانی — فاز ۲): گفت‌وگوهای کارشناس هوشمند 🔒 و بسته‌اند؛ «🚨 پرسش از کارشناس» همان
   گفت‌وگو را تا پاسخِ کارشناس باز می‌کند (فقط پاسخ در گفت‌وگو — تصمیمِ بسته‌ها با کارشناس هوشمند) و با پاسخ دوباره می‌بندد.
   فاز ۴ طرح «خرید هوشمند، کارشناس ناظر»: «خوانش هوشمند پیش‌فاکتور» (کلیدِ پنل پشتیبانی) پیش‌فرض خاموش است — بسته بعد از بررسی
   یکراست «🏁 تأیید نهایی» می‌شود (مقدارهای خودِ تأمین‌کننده و پیش‌فاکتورِ سامانه، با «👁 پیش‌فاکتور»، چاپ به PDF و Word) یا با
   توضیح برمی‌گردد؛ پیش‌فاکتورِ خودِ تأمین‌کننده فقط پیوست است. عنوان و لایه‌های 🔓ِ پیشنهادیِ تأمین‌کننده کنارِ هر قلم.
   فاز ۴ب گام ۴ («⏱ با مهلت / ⏸ بی‌مهلت»): گفت‌وگو باز و فقط‌خواندنی است — هر پیشنهادِ کارشناس هوشمند سرِ جای خودش در گفت‌وگو
   می‌نشیند (W3، آزمونِ مالک — ph-props.js): «🏁 تأیید نهایی» و «🧾 تصمیمِ بسته» درست زیرِ کارتِ همان بسته با «🏁 تأیید نهایی»،
   «↩️ برگشت با توضیح»، «❌ رد» و «⏸ بعداً خودم»؛ «💬 پاسخ» درست بعد از پیامِ تأمین‌کننده‌ای که جوابش است با «✅ ارسال» و «✏️ رد»
   (علتِ اجباری و پیامِ خودِ کارشناس). پیامِ کادرِ پایین فقط با تأییدِ صریح و علت جای پیشنهادِ پیام می‌نشیند — هیچ ردِ بی‌صدایی؛
   نوارِ وضعیت «🚨 باز کردنِ اضطراری» و راهِ رسیدن به پیشنهادهای بالاتر را دارد و سرِ گفت‌وگو شمارِ پیشنهادهای معطل.
   ?th=<گفت‌وگو> همان گفت‌وگو را باز می‌کند.
   ورود: کد کارشناس یا initData مینی‌اپ.
   ============================================================ */
(function () {
  "use strict";
  window.TP.asExpert = true;
  const TP = window.TP;
  const app = document.getElementById("app");
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = TP.esc;
  const FA = "۰۱۲۳۴۵۶۷۸۹";
  const fa = (s) => String(s == null ? "" : s).replace(/\d/g, (d) => FA[+d]);
  const money = (n) => (n == null || !isFinite(n) ? "—" : fa(Math.round(Number(n)).toLocaleString("en-US")).replace(/,/g, "٬"));
  /** مبلغِ کوتاه برای کادرهای خلاصه: [عدد، واحد] — «۱۱٫۳» و «میلیارد ریال»؛ عددِ کامل در title */
  const short = (n) => {
    const v = Math.abs(Number(n) || 0);
    const cut = (x) => fa(String(Math.round(x * 10) / 10).replace(".", "٫"));
    if (v >= 1e9) return [cut(n / 1e9), "میلیارد ریال"];
    if (v >= 1e6) return [cut(n / 1e6), "میلیون ریال"];
    if (v >= 1e4) return [cut(n / 1e3), "هزار ریال"];
    return [money(n), "ریال"];
  };
  const qty = (n) => (n == null ? "—" : fa(String(Math.round(Number(n) * 1000) / 1000)));
  const code = (l) => (l && l.no ? `<span class="sp-code">کد ${fa(l.no)}</span> ` : "");
  function when(ms) {
    try { return new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: "Asia/Tehran", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ms)); }
    catch (_) { return fa(new Date(ms).toLocaleTimeString()); }
  }
  /* گوشی و گفت‌وگو: ph-chat.js (مشترک با پنل تأمین‌کننده) */
  const PH = window.PH;

  /* قابِ آیفون فقط از ۹۶۱ پیکسل به بالا؛ با عبور از این مرز صفحه دوباره رسم می‌شود */
  const PHONE = window.matchMedia("(min-width: 961px)");
  let phoneMode = PHONE.matches;
  const onPhoneMode = () => { if (phoneMode === PHONE.matches) return; phoneMode = PHONE.matches; if (app.classList.contains("sp-app")) render(); };
  if (PHONE.addEventListener) PHONE.addEventListener("change", onPhoneMode); else if (PHONE.addListener) PHONE.addListener(onPhoneMode);

  /* ---------- مینی‌اپ تلگرام ---------- */
  const hp = new URLSearchParams(location.hash.slice(1));
  const ss = { get(k) { try { return sessionStorage.getItem(k) || ""; } catch (_) { return ""; } }, set(k, v) { try { sessionStorage.setItem(k, v); } catch (_) { /* حالت خصوصی */ } } };
  let tgData = hp.get("tgWebAppData") || "";
  if (tgData) ss.set("sp.tg.e", tgData); else tgData = ss.get("sp.tg.e");
  /* spApp: مینی‌اپِ بات مکاتبات همین صفحه را مستقیم باز کرده است. از پنل کارشناسِ مینی‌اپِ بات کارشناسان هم
     می‌شود به این‌جا آمد (TP.tg در shared.js) — آن‌وقت راهِ برگشت به پنل کارشناس می‌ماند. */
  const spApp = !!tgData;
  if (!tgData) tgData = TP.tg || "";
  const inTg = !!tgData;
  if (spApp) {
    try {
      const tp = JSON.parse(hp.get("tgWebAppThemeParams") || "null");
      if (tp && tp.bg_color && !localStorage.getItem("tp.theme")) {
        const v = parseInt(tp.bg_color.slice(1), 16), lum = ((v >> 16) & 255) * 0.299 + ((v >> 8) & 255) * 0.587 + (v & 255) * 0.114;
        TP.theme.apply(lum < 128 ? "dark" : "light");
      }
    } catch (_) { /* بی‌اهمیت */ }
    if (!TP.tg) {
      const s = document.createElement("script"); s.src = "https://telegram.org/js/telegram-web-app.js"; s.async = true;
      s.onload = () => { try { window.Telegram.WebApp.ready(); window.Telegram.WebApp.expand(); } catch (_) { /* بی‌اهمیت */ } };
      document.head.appendChild(s);
    }
  }
  const api = (path, opt) => TP.api(path, { ...(opt || {}), headers: { ...((opt && opt.headers) || {}), ...(inTg ? { "X-TG-Init": tgData } : {}) } });

  /* کارتِ پیشنهاد در بات کارشناسان (فاز ۴ب گام ۴) با ?th=<گفت‌وگو> همین‌جا را باز می‌کند */
  const qTh = +new URLSearchParams(location.search).get("th") || null;
  const S = { me: null, reqs: [], unread: 0, waiting: 0, asks: 0, props: 0, aid: +ss.get("sp.aid") || null, th: qTh || +ss.get("sp.th.e") || null, d: null, tab: "chat", view: "req",
    lastMsg: 0, rev: -1, bot: null, via: "web", busy: false, termFa: {}, unseen: 0, goto: null, drafts: {}, pfRead: false, propSig: null,
    rq: "", sq: "" };   /* جستجوی فهرستِ درخواست‌ها و تأمین‌کنندگان (سمت کلاینت) */
  const TERM_FIELDS = ["dtime", "pay", "invoice", "vat", "valid_days"];
  const termsLine = (t) => TERM_FIELDS.filter((f) => t && String(t[f] ?? "").trim()).map((f) => `${(S.termFa[f] || f).replace(" (روز)", "")}: ${fa(t[f])}${f === "valid_days" ? " روز" : ""}`).join(" · ");

  /* ---------- پنجره با دکمه‌های دلخواه؛ fn(close) — اگر false برگرداند پنجره می‌ماند ---------- */
  function dlg(title, body, buttons) {
    const d = document.createElement("div"); d.className = "tp-modal-bg";
    d.innerHTML = `<div class="tp-modal" role="dialog" aria-modal="true"><h3>${title}</h3><div class="tp-body">${body}</div><div class="tp-acts"></div></div>`;
    const acts = d.querySelector(".tp-acts");
    const close = () => d.remove();
    for (const b of buttons || [{ label: "باشد", cls: "primary" }]) {
      const el = document.createElement("button"); el.className = `tp-btn ${b.cls || ""}`; el.textContent = b.label;
      el.onclick = async () => { if (!b.fn) return close(); el.disabled = true; try { const r = await b.fn(d); if (r !== false) close(); } catch (e) { const er = d.querySelector("[data-err]"); if (er) er.textContent = e.message; else alert(e.message); } el.disabled = false; };
      acts.appendChild(el);
    }
    d.onclick = (e) => { if (e.target === d) close(); };
    document.body.appendChild(d);
    return d;
  }
  const say = (msg, title) => dlg(title || "توجه", `<p style="white-space:pre-line">${esc(msg)}</p>`);

  /* ---------- ورود ---------- */
  /* نوار بالا: پنل اصلیِ مکاتبات (نه «دمو»)؛ بات مکاتبات، پنل کارشناس و تدارکات در منوی پروفایل (ui.js، مهر ۱۴۰۵) */
  function top() {
    TP.ui.mountBg("");
    const items = [...(S.me && S.via !== "telegram" ? [{ label: "بات مکاتبات در تلگرام", icon: "telegram", attrs: "data-tg" }] : []),
      ...(S.me && !spApp ? [{ label: "پنل کارشناس", icon: "user", href: "expert" }, { label: "تدارکات", icon: "home", href: "./" }] : [])];
    /* «بازگشت» در گوشی و تبلت (یک‌ستونه): یک پله بالا — گفت‌وگو ← تأمین‌کنندگان ← درخواست‌ها ← پنل کارشناس.
       در دسکتاپ (ستون‌ها کنار هم) پنهان است؛ مینی‌اپ تلگرام دکمهٔ بازگشتِ خودش را دارد */
    const back = spApp ? null : S.view === "chat" && S.th ? { attrs: 'data-back="sup"', label: "بازگشت به تأمین‌کنندگان" }
      : S.view === "sup" ? { attrs: 'data-back="req"', label: "بازگشت به درخواست‌ها" } : { href: "expert", label: "بازگشت به پنل کارشناس" };
    return TP.ui.topbar({ title: "مکاتبات با تأمین‌کنندگان", sub: S.me ? esc(S.me.label || S.me.name) : "", home: spApp ? "#" : "expert", homeTitle: "پنل کارشناس",
      back, user: S.me ? { name: S.me.label || S.me.name, sub: "کارشناس خرید" } : null, items });
  }
  function renderLogin(msg) {
    app.classList.remove("sp-app");
    PH.lockView(false);
    TP.ui.mountBg("fog");
    app.innerHTML = TP.ui.login({ title: "ورود کارشناس", sub: "همان کد ورود پنل کارشناس", len: 4, max: 4, error: msg, back: { href: "expert", label: "← پنل کارشناس" } });
    TP.ui.help.set("login.expert");
    TP.ui.bindLogin(app, { onSubmit: async (c) => { const r = await TP.api("/login", { body: { code: c } }); TP.session.set(r.expert); boot(); } });
  }

  /* ---------- بارگذاری ---------- */
  async function loadList() {
    const d = await api("/sp/x/threads");
    S.reqs = d.requests || []; S.unread = d.unread; S.waiting = d.waiting; S.asks = d.asks || 0; S.props = d.props || 0; S.me = d.me; S.bot = d.bot; S.via = d.via; S.termFa = d.term_fa || S.termFa;
    S.pfRead = d.pf_read === true;
  }
  async function boot() {
    const ses = TP.session.get();
    if (!inTg && !(ses && ses.code)) return renderLogin();
    try {
      await loadList();
      if (S.th && !findThread(S.th)) S.th = null;
      if (S.aid && !S.reqs.some((g) => g.assignment_id === S.aid)) S.aid = null;
      if (!S.aid) { const g = S.reqs.find((x) => x.threads.length); if (g) S.aid = g.assignment_id; }
      if (S.th) { S.view = "chat"; await loadThread(); } else { S.view = S.aid ? "sup" : "req"; render(); }
      startPoll();
      /* اعلانِ گوشهٔ صفحه برای پیامِ تأمین‌کنندهٔ دیگری جز گفت‌وگوی باز (shared.js: TP.inbox)؛ کلیکش همان گفت‌وگو را
         همین‌جا باز می‌کند و فهرست‌ها شمارِ نخوانده را همان لحظه می‌گیرند */
      TP.inbox.start({ api, summary: false, active: () => !!S.me, current: () => (S.d ? S.th : null),
        open: (m) => { if (m) openThread(m.thread_id); }, onNew: () => refreshLists().catch(() => {}),
        onAsks: (k) => { if (k !== S.asks) refreshLists().catch(() => {}); }, onAi: aiChanged });
      /* اعلانِ گوشی و مرورگر (ui.js: TP.ui.push) — همان اشتراکِ پنل کارشناس؛ نه در مینی‌اپ تلگرام */
      if (!inTg && ses && ses.id) TP.ui.push.mount({ role: "expert", who: ses.id, api: (p, b) => TP.api(p, b === undefined ? {} : { body: b }) });
      TP.ui.help.assistant({ role: "expert", api: (p, b) => api(p, b === undefined ? {} : { body: b }), name: (ses && ses.name) || null });
    } catch (e) {
      if (e.status === 401 && !inTg) { TP.session.clear(); return renderLogin(e.message); }
      app.innerHTML = `${top()}<div class="sp-center"><div class="sp-box"><h2>نشد</h2><p class="sp-err">${esc(e.message)}</p></div></div>`;
    }
  }
  function findThread(id) { for (const g of S.reqs) for (const t of g.threads) if (t.id === id) return { g, t }; return null; }
  /**
   * «🤖 هوشمند / ✋ دستی»ِ پنل پشتیبانی یا تکلیفِ تازهٔ درخواست‌ها (shared.js: TP.inbox، onAi): فهرست‌ها و گفت‌وگوی باز همان لحظه — قفلِ
   * «🤖 فقط دیدن»، «⏱ با مهلت» یا «✋ دستِ شما» عوض می‌شود. وسطِ نوشتن، گفت‌وگو پیش‌نویس را نگه می‌دارد و دورِ بعدِ نظرسنجی می‌خواند.
   */
  async function aiChanged() {
    try { await refreshLists(); } catch (_) { /* فهرستِ قبلی می‌ماند */ }
    if (!S.th || !S.d) return;
    const typing = document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName);
    if (typing || document.querySelector(".tp-modal-bg")) { S.rev = -1; return; }
    try { await loadThread(); } catch (e) { if (e.status === 423) await shut(e.message); }
  }
  /** باز کردنِ یک گفت‌وگو — از فهرستِ تأمین‌کنندگان یا از اعلانِ گوشهٔ صفحه؛ پیش‌نویسِ گفت‌وگوی قبلی می‌ماند */
  function openThread(id) {
    S.pane = null;
    const was = $("#msgIn"); if (was && was.dataset.draft) S.drafts[was.dataset.draft] = was.value;
    S.th = id; S.view = "chat"; S.tab = "chat"; S.mainScroll = 0; S.unseen = 0;
    loadThread().catch((e) => (e.status === 423 ? shut(e.message) : say(e.message)));
  }
  /** گفت‌وگوی بستهٔ کارشناس هوشمند (۴۲۳): از صفحه بیرون می‌رود و فهرست تازه می‌شود */
  async function shut(msg, title) {
    S.th = null; S.d = null; S.view = S.aid ? "sup" : "req"; ss.set("sp.th.e", "");
    try { await loadList(); } catch (_) { /* فهرستِ قبلی می‌ماند */ }
    render();
    if (msg) say(msg, title || "🔒 گفت‌وگوی کارشناس هوشمند");
  }
  /** «🚨 باز کردنِ اضطراری»: علت اجباری؛ مدیر و پشتیبان همان لحظه هشدار می‌گیرند (worker/ai-takeover.js) */
  function takeoverDialog() {
    if (!S.th) return;
    const th = S.th;
    dlg("🚨 باز کردنِ اضطراریِ گفت‌وگو", `<p class="sp-muted" style="margin-top:0">کارشناس هوشمند دیگر در این گفت‌وگو جواب نمی‌دهد و ادامه با شماست. <b>مدیر و پشتیبان همین حالا هشدار می‌گیرند.</b></p>
        <textarea class="tp-input tp-textarea" data-sos-why style="width:100%;min-height:96px" maxlength="500" placeholder="علتِ فوریت (اجباری) — مثلاً تأمین‌کننده تلفنی گفت فقط تا امروز این قیمت را نگه می‌دارد"></textarea>
        <div class="sp-err" data-err></div>`,
      [{ label: "🚨 باز کن و هشدار بده", cls: "danger", fn: async (dd) => {
        const why = ($("[data-sos-why]", dd).value || "").trim();
        if (why.length < 3) throw new Error("علتِ باز کردنِ اضطراری را بنویسید.");
        await api(`/sp/x/thread/${th}/takeover`, { body: { reason: why } });
        await loadThread(); render(); if (TP.ui && TP.ui.success) TP.ui.success("گفت‌وگو دستِ شماست");
      } }, { label: "انصراف" }]);
    setTimeout(() => { const t = $("[data-sos-why]"); if (t) t.focus(); }, 60);
  }
  function handbackDialog() {
    if (!S.th) return;
    const th = S.th;
    dlg("🤖 برگرداندن به کارشناس هوشمند", `<p class="sp-muted" style="margin-top:0">این گفت‌وگو دوباره دستِ کارشناس هوشمند می‌رود و برای شما «فقط دیدن» می‌شود.</p>`,
      [{ label: "🤖 برگردان", cls: "primary", fn: async () => { await api(`/sp/x/thread/${th}/handback`, { body: {} }); await loadThread(); render(); if (TP.ui && TP.ui.success) TP.ui.success("به کارشناس هوشمند برگشت"); } },
        { label: "انصراف" }]);
  }
  async function refreshLists() {
    await loadList();
    const a = $("[data-reqs]"), b = $("[data-sups]");
    if (a) a.innerHTML = reqList();
    if (b) b.innerHTML = supList();
    bind();
  }
  async function loadThread() {
    const d = await api(`/sp/thread/${S.th}`);
    S.d = d; S.rev = d.thread.rev; S.lastMsg = d.msgs.length ? d.msgs[d.msgs.length - 1].id : 0;
    /* «⏱ با مهلت»: شمارش با ساعتِ سرور، نه ساعتِ دستگاه */
    S.skew = d.watch && d.watch.now ? d.watch.now - Date.now() : 0;
    if (typeof d.pf_read === "boolean") S.pfRead = d.pf_read;
    const pend = (d.watch && d.watch.pending) || [];
    S.propSig = d.watch ? `${pend.reduce((m, p) => Math.max(m, p.id), 0)}:${pend.length}` : null;
    /* «🧭 مذاکره»: همان امضایی که نظرسنجی برمی‌گرداند (worker/neg-view.js:negSig) */
    S.negSig = d.neg ? d.neg.sig : null;
    const f = findThread(S.th); if (f) { S.unread -= f.t.unread; f.g.unread -= f.t.unread; f.t.unread = 0; S.aid = f.g.assignment_id; }
    ss.set("sp.th.e", String(S.th)); ss.set("sp.aid", String(S.aid || ""));
    render();
  }

  /* ---------- رسم ---------- */
  const badge = (n, cls) => (n ? `<span class="sp-badge ${cls || ""}">${fa(n)}</span>` : "");
  /* ---------- فهرست‌ها به سبک تلگرام (مهر ۱۴۰۵): آواتار، نام، پیش‌نمایشِ آخرین پیام، زمان و نشان‌ها ---------- */
  const KIND_FA = { voice: "🎤 پیام صوتی", file: "📎 پیوست", note: "📝 یادداشت" };
  /* پیش‌نمایشِ آخرین پیامِ یک گفت‌وگو (last_msg = «که|نوع|متن» از سرور): «شما:» برای پیام‌های کارشناس؛ رویدادها همان متنِ کوتاهشان */
  function preview(t) {
    if (!t || !t.last_msg) return "";
    const [who, kind, ...rest] = String(t.last_msg).split("|"), body = rest.join("|").trim();
    const txt = KIND_FA[kind] ? KIND_FA[kind] + (body && kind !== "voice" ? ` ${body}` : "") : body;
    return `${who === "e" && kind !== "event" ? `<span class="me">شما:</span> ` : ""}${esc(txt)}`;
  }
  /* زمان به سبک تلگرام: امروز ساعت، همین هفته نام روز، وگرنه ماه/روز */
  function when(ms) {
    if (!ms) return "";
    const d = new Date(ms), n = new Date();
    if (d.toDateString() === n.toDateString()) return fa(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    if (n - d < 6 * 86400000) return TP.WD[d.getDay()];
    const [, m, dd] = TP.todayJ(ms); return fa(`${String(m).padStart(2, "0")}/${String(dd).padStart(2, "0")}`);
  }
  const hit = (s, q) => !q || String(s || "").toLowerCase().includes(q);
  function reqList() {
    const q = String(S.rq || "").trim().toLowerCase();
    const all = S.reqs.filter((g) => hit(g.request_id, q) || hit(g.party, q) || g.threads.some((t) => hit(t.supplier, q)));
    const withT = all.filter((g) => g.threads.length), rest = all.filter((g) => !g.threads.length);
    const item = (g) => {
      const last = g.threads.slice().sort((a, b) => b.last_at - a.last_at).find((t) => t.last_msg);
      const sub = last ? `<b>${esc(last.supplier)}:</b> ${preview(last)}` : `${esc(g.party || "")}${g.threads.length ? ` · ${fa(g.threads.length)} تأمین‌کننده` : ` · ${fa(g.open_items)} قلم باز`}`;
      return TP.ui.chatRow({ on: S.aid === g.assignment_id, attrs: `data-aid="${g.assignment_id}" aria-label="درخواست ${esc(g.request_id)}"`, cls: g.asks ? "ask" : "",
        av: { text: TP.ui.avInitial(g.party || g.request_id), color: TP.ui.avColor(String(g.request_id)) },
        title: `${esc(g.request_id)}<small>${esc(g.party || "")}</small>`, time: when(g.last_at), sub,
        badges: `${g.asks ? `<span class="sp-badge ask" title="کارشناس هوشمند در این درخواست از شما سؤال دارد">🚨 ${fa(g.asks)}</span>` : ""}${propBadge(g.props)}${badge(g.unread)}${badge(g.waiting, "wait")}` });
    };
    return (withT.map(item).join("") || (q ? `<div class="sp-empty">چیزی با «${esc(S.rq)}» پیدا نشد.</div>` : `<div class="sp-empty">هنوز گفت‌وگویی نیست.</div>`))
      + (rest.length ? `<div class="tp-chat-sep">درخواست‌های باز بدون گفت‌وگو</div>${rest.map(item).join("")}` : "");
  }
  function supList() {
    const g = S.reqs.find((x) => x.assignment_id === S.aid);
    if (!g) return `<div class="sp-empty">یک درخواست را انتخاب کنید.</div>`;
    if (!g.threads.length) return `<div class="sp-empty">برای این درخواست هنوز به تأمین‌کننده‌ای استعلام نرفته است.</div>`;
    const q = String(S.sq || "").trim().toLowerCase();
    const T = g.threads.filter((t) => hit(t.supplier, q) || hit(t.phone, q));
    if (!T.length) return `<div class="sp-empty">چیزی با «${esc(S.sq)}» پیدا نشد.</div>`;
    return T.map((t) => {
      const av = { text: TP.ui.avInitial(t.supplier), color: TP.ui.avColor(t.supplier) };
      if (t.ai === "locked") return TP.ui.chatRow({ on: S.th === t.id, cls: "lock", lock: true, av, attrs: `data-th="${t.id}" title="گفت‌وگوی کارشناس هوشمند — فقط دیدن"`,
        title: esc(t.supplier), time: when(t.last_at), sub: preview(t) ? `🤖 ${preview(t)}` : `🤖 دستِ کارشناس هوشمند · فقط دیدن · ${fa(t.lines)} قلم` });
      /* «⏱ با مهلت»: شمارِ پیشنهادهای معطل همان‌جا که چشم می‌رود (W3) — بی پیشنهاد، همان «با تأیید شما» */
      const sub = t.ai === "ask" ? `🤖 سؤال: ${esc(t.ask || "")}` : t.ai === "watch" ? (t.props ? `⏱ ${fa(t.props)} پیشنهادِ کارشناس هوشمند منتظرِ شماست` : `👁 با تأیید شما · ${fa(t.lines)} قلم`)
        : preview(t) || `📞 ${esc(t.phone || "")}${t.phone_label ? ` (${esc(t.phone_label)})` : ""} · ${fa(t.lines)} قلم`;
      return TP.ui.chatRow({ on: S.th === t.id, cls: t.ai === "ask" ? "ask" : t.ai === "watch" ? "watch" : "", av, attrs: `data-th="${t.id}" aria-label="${esc(t.supplier)}"`,
        title: `${t.ai === "ask" ? "🚨 " : t.ai === "watch" ? "⏱ " : t.ai === "human" ? "✋ " : ""}${esc(t.supplier)}`, time: when(t.last_at), sub,
        badges: `${propBadge(t.props)}${badge(t.unread)}${badge(t.waiting, "wait")}` });
    }).join("");
  }
  /* «⏱ با مهلت»: شمارِ پیشنهادهای کارشناس هوشمند که منتظرِ «تأیید» یا «رد»ِ شمایند (سرور: sp-core.js:expertThreads، همان یک کوئریِ فهرست) */
  const propBadge = (n) => (n ? `<span class="sp-badge prop" title="${fa(n)} پیشنهادِ کارشناس هوشمند منتظرِ «تأیید» یا «رد»ِ شما — با مهلت، بی‌پاسخ سرِ مهلت خودکار می‌رود">⏱ ${fa(n)}</span>` : "");
  function render() {
    const g = S.reqs.find((x) => x.assignment_id === S.aid);
    /* پیش‌نویسِ نیمه‌کارهٔ هر گفت‌وگو با رسمِ دوباره (تغییر پهنا، تصمیم روی بسته) پاک نمی‌شود */
    const was = $("#msgIn"); if (was && was.dataset.draft) S.drafts[was.dataset.draft] = was.value;
    const on = !!(S.th && S.d);
    const screenInMain = !phoneMode && on && S.tab !== "items";
    const main = !on ? `<div class="sp-empty" style="margin-top:12vh">یک تأمین‌کننده را انتخاب کنید.</div>`
      : screenInMain ? screen(false) : convo();
    app.classList.add("sp-app");
    PH.lockView(!phoneMode, screenInMain);
    app.innerHTML = `${top()}<div class="sp-full"><div class="sp-cols ${phoneMode ? "ph-mode" : ""}" data-view="${S.view}">
      <aside class="sp-col reqs"><h4>درخواست‌ها ${S.asks ? `<span class="sp-badge ask" title="«پرسش از کارشناس»های بی‌پاسخ">🚨 ${fa(S.asks)}</span>` : ""}${propBadge(S.props)}${badge(S.unread)}${badge(S.waiting, "wait")}</h4>
        ${S.reqs.length > 4 || S.rq ? `<div class="tp-chat-search"><input data-rq value="${esc(S.rq)}" placeholder="جستجوی درخواست یا تأمین‌کننده" aria-label="جستجوی درخواست یا تأمین‌کننده" autocomplete="off"></div>` : ""}
        <div class="scroll" data-reqs>${reqList()}</div></aside>
      <aside class="sp-col sups"><h4><button class="tp-btn xs sp-back" data-back="req" aria-label="بازگشت به درخواست‌ها">→</button>${g ? `تأمین‌کنندگانِ ${esc(g.request_id)}` : "تأمین‌کنندگان"}</h4>
        ${g && (g.threads.length > 6 || S.sq) ? `<div class="tp-chat-search"><input data-sq value="${esc(S.sq)}" placeholder="جستجوی تأمین‌کننده" aria-label="جستجوی تأمین‌کننده" autocomplete="off"></div>` : ""}
        <div class="scroll" data-sups>${supList()}</div>${g && g.open_items ? `<div class="sp-colfoot"><button class="tp-btn primary sm" data-send>➕ ارسال استعلام</button></div>` : ""}</aside>
      <section class="sp-main ${screenInMain ? "is-screen" : ""}">${main}</section>
      ${phoneMode ? `<section class="ph-stage"><div class="ph"><img class="ph-frame" src="phone-frame.svg" alt="" draggable="false">${screen(true)}</div></section>` : ""}
    </div></div>`;
    bind();
    /* راهنما: در دسکتاپ گوشی سمت چپ است، پس دکمهٔ «؟» سمت راست؛ در گوشیِ واقعی، گفت‌وگوی تمام‌صفحه «؟» را در نوارِ خودش دارد
       و فهرست‌ها (درخواست‌ها، تأمین‌کنندگان) دکمهٔ شناور را */
    TP.ui.help.set("corr.main", phoneMode ? { side: "right" } : screenInMain && S.view === "chat" ? { fab: false } : {});
    const inp = $("#msgIn"); if (inp && S.drafts[S.th]) { inp.value = S.drafts[S.th]; composerState(inp); }
    const c = $("#chat"); if (c) c.scrollTop = S.chatPos != null ? S.chatPos : c.scrollHeight;
    S.chatPos = null;
    if (S.goto) { const sel = S.goto; S.goto = null; jumpTo(sel); }
    else if ((phoneMode || S.tab === "items") && S.mainScroll) { const m = $(".sp-main"); if (m) m.scrollTop = S.mainScroll; }
  }
  /** کلیک روی پیامِ بسته یا قلم: همان کارت پیدا و چشمک‌زن می‌شود — نوار تب‌ها بالا می‌ماند */
  function jumpTo(sel) {
    const el = $(sel);
    if (!el) return;
    el.scrollIntoView({ block: "start" });
    const m = $(".sp-main"); if (m) m.scrollTop = Math.max(0, m.scrollTop - 56);
    el.classList.add("sp-flash");
    setTimeout(() => el.classList.remove("sp-flash"), 1600);
  }
  /* خوانش هوشمند خاموش: بستهٔ «تأییدشده» (راهِ پیشین) هم تصمیمِ تأیید نهایی می‌خواهد */
  const waitingCount = () => S.d.bundles.filter((b) => ["pending", "proforma", ...(S.pfRead ? [] : ["approved"])].includes(b.state)).length;
  /** اقلام و تصمیم‌ها: در چیدمانِ گوشی ستونِ وسط؛ در صفحهٔ باریک جای گفت‌وگو با دکمهٔ برگشت به آن */
  /* بخش‌های ستونِ وسط (مهر ۱۴۰۵): یک بخش در هر لحظه — «منتظر تصمیم»، «اقلام»، «تصمیم‌های قبلی»، «👁 پیشنهادها» */
  const OPEN_ST = ["pending", "approved", "proforma"];
  const panes = () => {
    const d = S.d, w = watchOf();
    return [["wait", "منتظر تصمیم", d.bundles.filter((b) => OPEN_ST.includes(b.state)).length], ["items", "اقلام", d.lines.length],
      ["done", "تصمیم‌های قبلی", d.bundles.filter((b) => !OPEN_ST.includes(b.state)).length], ...(w && (w.done || []).length ? [["props", "⏱ پیشنهادها", w.done.length]] : [])];
  };
  const curPane = () => { const L = panes(); if (S.pane && L.some((p) => p[0] === S.pane)) return S.pane; return L[0][2] ? "wait" : "items"; };
  /** کارت یا بسته‌ای که باید دیده شود در کدام بخش است */
  const paneFor = (sel) => { const m = /data-b="(\d+)"/.exec(sel); if (!m) return "items"; const b = S.d.bundles.find((x) => x.id === +m[1]); return b && !OPEN_ST.includes(b.state) ? "done" : "wait"; };
  function convo() {
    const th = S.d.thread, pane = curPane();
    const back = phoneMode ? "" : `<button class="tp-btn sm" data-tab="chat" title="برگشت به گفت‌وگو">→ گفت‌وگو${badge(S.unseen)}</button>`;
    const sum = S.d.lines.reduce((x, l) => x + (l.total || 0), 0), priced = S.d.lines.filter((l) => l.price != null).length;
    const av = `<span class="sp-av" style="--av:${TP.ui.avColor(th.supplier)}" aria-hidden="true">${esc(TP.ui.avInitial(th.supplier))}</span>`;
    /* «👤 پروفایل تأمین‌کننده» (sup-profile.js) — فقط وقتی کلیدِ دفتر تأمین‌کنندگان در پنل پشتیبانی روشن است */
    if (S.crReg === undefined && TP.supProfile) { S.crReg = null; TP.supProfile.enabled().then((v) => { S.crReg = v; if (v) render(); }); }
    return `<div class="sp-conv"><div class="sp-head sp-head2 ${phoneMode ? "" : "sp-sticky"}">${av}<div class="hd"><h3>${esc(th.supplier)}${S.crReg ? ` ${TP.supProfile.btn(th.supplier)}` : ""}${propChip("sp-badge prop sp-pjump")}</h3>
        <span class="sp-muted">📞 <span dir="ltr">${esc(th.phone || "—")}</span>${th.phone_label ? ` (${esc(th.phone_label)})` : ""} · درخواست <b>${esc(th.request_id)}</b></span></div>${back}</div>
      <div class="sp-kpis">${TP.ui.stat({ label: "اقلام", value: fa(S.d.lines.length), icon: "box", sub: `${fa(priced)} با قیمت` })}
        ${TP.ui.stat({ label: "منتظر تصمیم", value: fa(waitingCount()), icon: "flag", tone: waitingCount() ? "warn" : "ok" })}
        ${TP.ui.stat({ label: "جمع پیشنهادها", value: sum ? short(sum)[0] : "—", icon: "file", tone: "sum", sub: sum ? short(sum)[1] : "", attrs: sum ? `title="${money(sum)} ریال"` : "" })}</div>
      ${termsLine(th.terms) ? `<div class="sp-terms">🧾 ${esc(termsLine(th.terms))}</div>` : ""}
      ${negHtml()}
      <div class="tp-seg sm sp-panes" role="tablist">${panes().map(([k, l, n]) => `<button type="button" role="tab" class="${pane === k ? "on" : ""}" aria-selected="${pane === k}" data-pane="${k}">${l}${n ? `<span class="cnt">${fa(n)}</span>` : ""}</button>`).join("")}</div>
      <div id="pane">${itemsPane(pane)}</div></div>`;
  }

  /* --- گفت‌وگو به سبک پیام‌رسانِ iOS 26 (ph-chat.js): پیامِ ما (کارشناس و کارشناس هوشمند) سمت راست و آبیِ لوگو، پیامِ
     تأمین‌کننده سمت چپ و طوسیِ خیلی کمرنگ؛ پیامِ صوتیِ تأمین‌کننده با پخش و متنِ پیاده‌شده‌اش (فقط همین‌جا — تأمین‌کننده
     متن را نمی‌بیند)؛ رخدادِ بسته و قلم کارتی است که کلیکش به همان بسته یا قلم در «اقلام و تصمیم‌ها» می‌رود --- */
  /** «🚨 پرسش از کارشناس»: سؤال و راهنما در انتهای گفت‌وگو، درست بالای کادرِ پیام */
  const askOf = () => (S.d && S.d.thread.ai && S.d.thread.ai.ask) || null;
  const askNote = () => { const k = askOf(); return k ? `<div class="ph-ask" role="note"><b>🚨 کارشناس هوشمند از شما می‌پرسد ${TP.ui.info("corr.main", "راهنمای مکاتبات")}</b>${esc(k.q)}<i>پاسخ را همین پایین بنویسید.</i></div>` : ""; };
  /* «⏱ با مهلت / ⏸ بی‌مهلت» (فاز ۴ب گام ۴): پیشنهادهای معطلِ کارشناس هوشمند — هر کدام سرِ جای خودش در گفت‌وگو (W3، propPlaces) */
  const watchOf = () => (S.d && S.d.watch) || null;
  /** شمارِ پیشنهادهای معطلِ همین گفت‌وگو */
  const pendN = () => { const w = watchOf(); return w ? (w.pending || []).length : 0; };
  /** نشانِ «⏱ n» سرِ گفت‌وگو (W3): کلیکش به اولین پیشنهادِ معطل در گفت‌وگو می‌رود */
  const propChip = (cls) => {
    const n = pendN();
    return n ? ` <button type="button" class="${cls}" data-prop-jump aria-label="${fa(n)} پیشنهادِ کارشناس هوشمند منتظرِ شما — رفتن به آن" title="${fa(n)} پیشنهادِ کارشناس هوشمند منتظرِ «تأیید» یا «رد»ِ شما — رفتن به آن">⏱ ${fa(n)}</button>` : "";
  };
  /* گفت‌وگوی کارشناس هوشمند: فقط دیدن (locked) یا «🚨 اضطراری» بازشده و دستِ کارشناس (human) */
  const roOf = () => !!(S.d && S.d.thread.ai && S.d.thread.ai.locked);
  const humanOf = () => !!(S.d && S.d.thread.ai && S.d.thread.ai.human);
  /* سقفِ ۵ دورِ کارشناس هوشمند در هر گفت‌وگو (ai-lock.js:TURN_CAP): «دورِ n از ۵»، و وقتی پر شد گفت‌وگو دستِ کارشناس است (cap) */
  const turnsOf = () => (S.d && S.d.thread.ai && S.d.thread.ai.turns) || null;
  const turnsTxt = () => { const t = turnsOf(); return t ? ` · دورِ ${fa(Math.min(t.used, t.max))} از ${fa(t.max)}` : ""; };
  const capNote = () => { const c = humanOf() && S.d.thread.ai.cap; return c ? `<div class="ph-ask ph-watch" role="note"><b>✋ سقفِ ${fa(c.max)} دورِ کارشناس هوشمند پر شد ${TP.ui.info("corr.main", "راهنمای مکاتبات")}</b>گفت‌وگو با خودِ شماست؛ «🤖» در بالای صفحه ${fa(c.max)} دورِ تازه به کارشناس هوشمند می‌دهد.</div>` : ""; };
  /* «🧭 مذاکرهٔ کارشناس هوشمند» (worker/neg-view.js، strategy-view.js): بالای «اقلام و تصمیم‌ها» — دورِ n از ۵، آخرین حرکت، پیشنهادِ ما و
     تأمین‌کننده و 🔒 هدف و حد؛ برنامه، دورها، یادداشت و سند زیرِ «≡ جزئیات». فقط همین صفحهٔ کارشناس — سرور آن را به تأمین‌کننده نمی‌دهد */
  const negOf = () => (S.d && S.d.neg) || null;
  const negHtml = () => { const n = negOf(); return n && TP.stratView ? TP.stratView.negCard(n, { key: `neg-${S.th}`, help: TP.ui.info("corr.main", "راهنمای مکاتبات") }) : ""; };
  /** امضای کارت در نظرسنجی عوض شد (دورِ تازه، حالتِ گفت‌وگو یا نوبتِ موتور): فقط همین کارت از نو — گفت‌وگو و پیش‌نویس دست نمی‌خورند */
  async function refreshNeg() {
    const th = S.th;
    const r = await api(`/sp/x/thread/${th}/neg`);
    if (S.th !== th || !S.d) return;
    S.d.neg = r.neg || null; S.negSig = S.d.neg ? S.d.neg.sig : null;
    const el = $("[data-neg]");
    if (el) { el.outerHTML = negHtml(); bind(); }
  }
  /** «📘 سند راهبرد» از کارت: همان نمای فقط‌خواندنیِ پنل کارشناس (strategy-view.js:openDoc)، با هدرهای همین صفحه (مینی‌اپ) */
  const negDoc = (b) => TP.stratView.openDoc({ head: b.dataset.head, code: b.dataset.code || null, api,
    roTip: "بازبینی و تأییدِ سند در پنل کارشناس و پیش از «🚀 شروع» است؛ این‌جا فقط دیدن",
    why: `همان سندی که کارشناس هوشمند با آن با «${S.d ? S.d.thread.supplier : ""}» مذاکره می‌کند.` });
  const ACT_FA = { approve: "✅ تأییدِ مشخصات", return: "↩️ برگشت برای اصلاح", reject: "❌ رد", accept_rows: "☑️ پذیرشِ مغایرت", final: "🏁 تأیید نهایی" };
  function bundleSum(bid) {
    const b = S.d.bundles.find((x) => x.id === bid);
    if (!b) return "";
    const ls = b.line_ids.map((id) => S.d.lines.find((l) => l.id === id)).filter(Boolean);
    return `${ls.map((l) => `• ${esc(l.title)} — ${qty(l.qty)} ${esc(l.unit || "")} × ${money(l.price)} ریال`).join("\n")}\nجمع: <b>${money(ls.reduce((s, l) => s + (l.total || 0), 0))}</b> ریال`;
  }
  /* --- «⏱ با مهلت» (مهر ۱۴۰۵): پیشنهادِ کارشناس هوشمند با شمارشِ معکوس (ساعتِ سرور) — سرِ صفر خودِ صفحه «سرِ مهلت» را می‌زند --- */
  const leftMs = (p) => (p && p.due_at ? p.due_at - (Date.now() + (S.skew || 0)) : null);
  const mmss = (ms) => { const x = Math.max(0, Math.ceil(ms / 1000)); return fa(`${Math.floor(x / 60)}:${String(x % 60).padStart(2, "0")}`); };
  /* «🏁 تأیید نهایی» سرِ مهلت خودکار تأیید می‌شود و بقیه خودکار می‌روند — برچسبِ شمارش همین را می‌گوید */
  const dueLabel = (p) => {
    const l = leftMs(p), fin = p && p.kind === "final";
    return l == null ? "" : l > 0 ? `بی‌پاسخ، ${fin ? "خودکار تأیید نهایی می‌شود" : "خودکار می‌رود"} تا <b class="num">${mmss(l)}</b>` : `⏳ مهلت تمام شد — در حالِ ${fin ? "تأیید نهاییِ" : "ارسالِ"} خودکار…`;
  };
  const duePct = (p) => { const l = leftMs(p), tot = p.due_at && p.created_at ? p.due_at - p.created_at : 0; return tot > 0 ? Math.max(0, Math.min(1, l / tot)).toFixed(3) : 0; };
  /**
   * کارتِ یک پیشنهاد (W3): anchored یعنی سرِ جای خودش نشسته — «🏁 تأیید نهایی» درست زیرِ کارتِ همان بسته (فهرستِ اقلامش همان بالاست)،
   * «💬 پاسخ» درست بعد از پیامِ تأمین‌کننده؛ وگرنه ته گفت‌وگو و با خلاصهٔ بسته. دکمه‌ها به نوعِ پیشنهاد (ph-props.js:acts).
   */
  function propCard(p, anchored) {
    const fin = p.kind === "final";
    const what = fin ? `${anchored ? `همین بسته (بستهٔ ${fa(p.bundle_id)})` : `بستهٔ ${fa(p.bundle_id)}`} را تأیید نهایی کند`
      : p.kind === "act" ? "این تصمیمِ بسته را بگیرد" : anchored ? "این پاسخ را بفرستد" : "این پیام را بفرستد";
    return `<div class="ph-ask ph-prop${anchored ? " anch" : ""}${fin ? " fin" : ""}" role="group" aria-label="پیشنهادِ کارشناس هوشمند: ${esc(p.kind_fa || "")}" data-prop="${p.id}"><b>${p.due_at ? "⏱" : "⏸"} کارشناس هوشمند می‌خواهد ${what} ${TP.ui.info("corr.main", "راهنمای مکاتبات")}</b>
      ${fin && !anchored ? `<div class="ph-prop-body">${bundleSum(p.bundle_id)}</div>` : ""}
      ${p.kind === "act" ? `<div class="ph-prop-body">${(p.actions || []).map((a) => `• ${esc(ACT_FA[a.type] || a.type)} — بستهٔ ${fa(a.bundle_id)}${a.comment ? `: «${esc(a.comment)}»` : ""}`).join("\n")}</div>` : ""}
      ${p.body ? `<div class="ph-prop-body">${esc(p.body)}</div>` : ""}
      ${p.due_at ? `<div class="ph-due" data-due="${p.id}" style="--p:${duePct(p)}"><span class="bar"><i></i></span><span class="t" data-due-t>${dueLabel(p)}</span></div>` : `<div class="ph-due"><span class="t">⏸ بی‌مهلت — تا تصمیمِ شما نمی‌رود</span></div>`}
      ${PH.props.acts(p)}</div>`;
  }
  /** «⏸ بعداً خودم»: بستهٔ بازی که تصمیمش با خودِ کارشناس است — زیرِ کارتِ همان بسته با دکمه‌های همیشگیِ تصمیم (/sp/x/bundle/:id/decide) */
  function manualCard(b) {
    const acts = S.pfRead ? `<button type="button" class="tp-btn sm" data-goto-b="${b.id}">📦 تصمیم در «اقلام و تصمیم‌ها»</button>`
      : `<button type="button" class="tp-btn primary sm" data-bact="${b.id}:final" ${b.ready ? "" : `disabled title="${esc(`هنوز کامل نیست: ${(b.problems || []).join("، ")}`)}"`}>🏁 تأیید نهایی</button>`
        + `<button type="button" class="tp-btn warn sm" data-bact="${b.id}:return">↩️ برگرداندن با توضیح</button><button type="button" class="tp-btn danger sm" data-bact="${b.id}:reject">❌ رد</button>`;
    return `<div class="ph-ask ph-watch ph-manual" role="group" aria-label="تصمیمِ بستهٔ ${fa(b.id)} با شما" data-manual="${b.id}"><b>⏸ تصمیمِ بستهٔ ${fa(b.id)} با خودِ شماست ${TP.ui.info("corr.main", "راهنمای مکاتبات")}</b><span class="ph-wline">کارشناس هوشمند این بسته را خودکار تأیید نمی‌کند؛ هر وقت آماده بودید همین‌جا تصمیم بگیرید.</span><div class="ph-prop-acts">${acts}</div></div>`;
  }
  /**
   * جای کارت‌های «⏱ با مهلت» در گفت‌وگو (W3): هر پیشنهادِ معطل زیرِ پیامی که به آن مربوط است (ph-props.js:anchors)، و بسته‌ای که
   * «⏸ بعداً خودم» خورده و هنوز باز است زیرِ کارتِ همان بسته. خروجی: {at: {msgId: html} برای PH.feed، tail: html ته گفت‌وگو، up: شمارِ
   * پیشنهادهایی که بالاتر از آخرین پیام نشسته‌اند}.
   */
  function propPlaces() {
    const w = watchOf(), out = { at: {}, tail: "", up: 0 };
    if (!w || !S.d) return out;
    const msgs = S.d.msgs, pend = w.pending || [], last = msgs.length ? String(msgs[msgs.length - 1].id) : "";
    const add = (id, h) => { out.at[id] = (out.at[id] || "") + h; };
    /* اول کارتِ خودِ بسته («⏸ تصمیم با شما»)، بعد پیشنهادهای همان‌جا به ترتیب — کارتِ بسته درست زیرِ همان بسته می‌ماند */
    for (const bid of w.manual || []) {
      const b = S.d.bundles.find((x) => x.id === bid && OPEN_ST.includes(x.state));
      if (!b || pend.some((p) => PH.props.bundlesOf(p).includes(bid))) continue;
      const m = PH.props.bundleEv(msgs, [bid]);
      if (m) add(m.id, manualCard(b)); else out.tail += manualCard(b);
    }
    const A = PH.props.anchors(msgs, pend);
    for (const [id, L] of Object.entries(A.at)) { add(id, L.map((p) => propCard(p, true)).join("")); if (id !== last) out.up += L.length; }
    out.tail = A.tail.map((p) => propCard(p, false)).join("") + out.tail;
    return out;
  }
  const cfgBtn = `<button type="button" class="ph-cfg" data-supcfg title="حالتِ مکاتباتِ کارشناس هوشمند: با مهلت، بی‌مهلت یا خودکار">⚙️ تغییر</button>`;
  /** کفِ حالت از «حالت کار»ِ نوع قلم — فقط وضعیت؛ توضیح در راهنما */
  const floorNote = (w) => (w.floor ? `<span class="sp-muted">نوع قلمِ «${esc(w.floor.head)}» «${esc(w.floor.workflow)}» است</span>` : "");
  /**
   * نوارِ وضعیتِ «⏱ با مهلت / ⏸ بی‌مهلت» ته گفت‌وگو — همیشه، حتی با پیشنهادِ معطل (W3): مهلت، دورها، «⚙️ تغییر»، شمارِ پیشنهادهای
   * منتظر با «⤴ رفتن» به پیشنهادهای بالاتر، و «🚨 باز کردنِ اضطراری»؛ بعدش کارت‌هایی که لنگرشان در صفحه نیست.
   */
  function watchNote(P) {
    const w = watchOf();
    if (!w) return "";
    const n = (w.pending || []).length;
    return `<div class="ph-ask ph-watch ph-wbar" role="note"><b>${w.hold ? "⏸ بی‌مهلت" : `⏱ با مهلتِ ${fa(w.minutes || 10)} دقیقه`}${turnsTxt()} ${cfgBtn}${TP.ui.info("corr.main", "راهنمای مکاتبات")}</b>${floorNote(w)}`
      + (n ? `<span class="ph-wline">${fa(n)} پیشنهادِ کارشناس هوشمند منتظرِ «تأیید» یا «رد»ِ شماست${P.up ? ` <button type="button" class="ph-cfg" data-prop-jump>⤴ رفتن به پیشنهاد</button>` : ""}</span>` : "")
      + `<span class="ph-wacts"><button type="button" class="ph-sos-mini" data-takeover title="گفت‌وگو را خودتان ادامه دهید — کارشناس هوشمند دیگر در آن جواب نمی‌دهد و مدیر و پشتیبان خبردار می‌شوند">🚨 باز کردنِ اضطراری</button></span></div>`
      + P.tail;
  }
  /* «🤖 خودکار»: گفت‌وگو بسته است و کارشناس هوشمند خودش مذاکره می‌کند */
  const autoNote = () => (roOf() ? `<div class="ph-ask ph-watch" role="note"><b>🤖 خودکار ${cfgBtn}${TP.ui.info("corr.main", "راهنمای مکاتبات")}</b></div>` : "");
  const feedHtml = () => { const P = propPlaces(); return msgsHtml(P.at) + rateNote() + askNote() + capNote() + autoNote() + watchNote(P) + threadRateCard(); };
  /** «⏱ n» سرِ گفت‌وگو و «⤴ رفتن به پیشنهاد»: اولین پیشنهادِ معطل در گفت‌وگو پیدا و چشمک‌زن می‌شود (صفحهٔ باریک: اول برگشت به گفت‌وگو) */
  function jumpProp() {
    if (!phoneMode && S.tab === "items") { S.tab = "chat"; render(); }
    const c = $("#chat"), el = c && $("[data-prop]", c);
    if (!el) return;
    c.scrollTop = Math.max(0, c.scrollTop + el.getBoundingClientRect().top - c.getBoundingClientRect().top - c.clientHeight / 4);
    el.classList.add("sp-flash");
    setTimeout(() => el.classList.remove("sp-flash"), 1600);
  }

  /* --- ⭐ امتیاز به کارِ کارشناس هوشمند (مهر ۱۴۰۵): هر پیامش ۱ تا ۵ ستاره (کمتر از سه با علت)، و کلِ مکاتبه بعد از بسته شدن با نظرِ
     اجباری. «خاتمه»ِ درخواست تا همهٔ امتیازها داده نشده معلق است (worker/ai-rates.js) --- */
  const ratesOf = () => (S.d && S.d.rates) || null;
  /* «جعبه‌های نقد» (worker/critique.js، کلیدِ boxes پشتیبانی): کدام جزءِ کارِ کارشناس هوشمند درست نبود — برای ستارهٔ کم و «✏️ رد»
     اجباری، برای کلِ مکاتبه اختیاری */
  const critique = () => (S.d && S.d.critique) || null;
  const boxPicker = (sel = [], label = "کدام جزء درست نبود؟") => (critique() ? `<div class="sp-cboxes" role="group" aria-label="جعبه‌های نقد"><b>${label}</b>
      ${critique().map((b) => `<label class="sp-cbox" title="${esc(b.desc)}"><input type="checkbox" data-box="${b.code}" ${sel.includes(b.code) ? "checked" : ""}> ${esc(b.fa)}</label>`).join("")}</div>` : "");
  const boxesFrom = (root) => [...root.querySelectorAll("[data-box]:checked")].map((x) => x.dataset.box);
  const STAR = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.75 5.86 6.4.78-4.73 4.4 1.23 6.33L12 17.03l-5.65 3.14 1.23-6.33-4.73-4.4 6.4-.78z"/></svg>`;
  /* ستاره‌ها از پنج به یک در DOM؛ با row-reverse یکِ اول سمتِ راست است و «~» ستاره‌های پیش از خودش را هم روشن می‌کند */
  const stars = (attr, id, on) => [5, 4, 3, 2, 1].map((n) => `<button type="button" class="ph-star${on && n <= on ? " on" : ""}" ${attr}="${id}:${n}" aria-label="${fa(n)} ستاره" title="${fa(n)} از ۵">${STAR}</button>`).join("");
  const rateOf = (m) => {
    const R = ratesOf();
    if (!R || m.who !== "e" || !(m.meta && m.meta.ai) || (m.meta && m.meta.tpl) || m.pending) return null;
    const r = R.msgs[m.id];
    return { cls: r ? `rated${r.stars < 3 ? " low" : ""}` : "unrated",
      html: `<div class="ph-rate${r ? " done" : ""}" role="group" aria-label="امتیاز به این پیامِ کارشناس هوشمند">${r ? "" : `<span class="hint">⭐ امتیاز بدهید</span>`}<span class="stars">${stars("data-rate-star", m.id, r && r.stars)}</span>${r && r.note ? `<span class="why" title="${esc(r.note)}">💬</span>` : ""}</div>` };
  };
  const unrated = () => { const R = ratesOf(); return R ? S.d.msgs.filter((m) => rateOf(m) && !R.msgs[m.id]).length : 0; };
  const rateNote = () => { const n = unrated(); return n ? `<div class="ph-ask ph-ratehint" role="note"><b>⭐ ${fa(n)} پیامِ کارشناس هوشمند منتظرِ امتیازِ شماست ${TP.ui.info("corr.main", "راهنمای مکاتبات")}</b></div>` : ""; };
  function threadRateCard() {
    const R = ratesOf();
    if (!R || !R.rateable || !R.closed) return "";
    if (R.thread && !S.trateEdit) return `<div class="ph-ask ph-trate done" role="note"><b>⭐ امتیازِ شما به کلِ این مکاتبه</b><span class="ph-rate done big ro" aria-label="${fa(R.thread.stars)} از ۵ ستاره"><span class="stars">${[5, 4, 3, 2, 1].map((n) => `<span class="ph-star${n <= R.thread.stars ? " on" : ""}">${STAR}</span>`).join("")}</span></span><div class="ph-prop-body">${esc(R.thread.note || "")}</div>
      <div class="ph-prop-acts"><button type="button" class="tp-btn sm" data-trate-edit>✏️ ویرایش</button></div></div>`;
    const v = S.trate || (R.thread && R.thread.stars) || 0;
    return `<div class="ph-ask ph-trate" role="note"><b>⭐ به کلِ این مکاتبه امتیاز بدهید</b>مذاکرهٔ کارشناس هوشمند با ${esc(S.d.thread.supplier)} از یک تا پنج ستاره، و نظرتان (اجباری) — همین در ارزیابیِ او می‌ماند و «خاتمه» تا آن موقع معلق است.
      <span class="ph-rate big"><span class="stars">${stars("data-trate-star", S.th, v)}</span></span>
      <textarea class="tp-input tp-textarea" data-trate-note style="min-height:64px" placeholder="نظرتان دربارهٔ کلِ این مکاتبه (اجباری)">${esc(S.trateNote != null ? S.trateNote : (R.thread && R.thread.note) || "")}</textarea>
      ${boxPicker(S.tboxes || (R.thread && R.thread.boxes) || [], "جعبه‌های نقد (اختیاری)")}
      <div class="sp-err" data-trate-err></div><div class="ph-prop-acts"><button type="button" class="tp-btn primary sm" data-trate-save ${v ? "" : "disabled"}>ثبتِ امتیاز و نظر</button></div></div>`;
  }
  /* after: کارت‌های «⏱ با مهلت» زیرِ همان پیامی که به آن مربوط‌اند (propPlaces) */
  const msgsHtml = (after) => PH.feed(S.d.msgs.concat(PH.outboxMsgs((S.outbox || []).filter((x) => x.th === S.th), S.d.msgs, "e")), {
    mine: (m) => m.who === "e",
    ai: (m) => !!(m.meta && m.meta.ai), /* پیامِ کارشناس هوشمند (worker/ai-agent.js) */
    rate: rateOf,
    after: after || {},
    rich: (m) => PH.evCard(m, { mine: m.who === "e", termsLine, goLabel: "دیدن در اقلام و تصمیم‌ها" }),
    transcript: true,
    empty: `<div class="ph-void"><b>هنوز پیامی نیست</b>اولین پیام را برای ${esc(S.d.thread.supplier)} بنویسید.</div>`,
  });
  const I = PH.I;
  const clock = PH.clock;
  /** صفحهٔ گفت‌وگو: framed = داخلِ قابِ آیفون (با نوار وضعیت و جزیرهٔ دوربین)؛ وگرنه تمام‌صفحه در گوشیِ واقعی */
  function screen(framed) {
    if (!(S.th && S.d)) {
      const g = S.reqs.find((x) => x.assignment_id === S.aid);
      return PH.screen({ framed, body: null, void: g && !g.threads.length ? `<b>هنوز گفت‌وگویی نیست</b>برای ${esc(g.request_id)} از ستونِ تأمین‌کنندگان «ارسال استعلام» را بزنید.` : `<b>مکاتبات</b>یک تأمین‌کننده را از فهرست انتخاب کنید تا گفت‌وگو این‌جا باز شود.` });
    }
    S.unseen = 0;
    const th = S.d.thread, waiting = waitingCount();
    return PH.screen({
      framed, body: feedHtml(), label: `گفت‌وگو با ${th.supplier}`,
      nav: {
        /* در گوشی «بازگشت به تأمین‌کنندگان» در نوار بالای صفحه است (top())؛ دو دکمهٔ هم‌کار روی هم نمی‌آید. جای خالیِ همین سمت: نشانِ
           «⏱ n»ِ پیشنهادهای معطل (W3) — کلیکش به اولین پیشنهاد می‌رود */
        start: propChip("ph-glass ph-pchip").trim(),
        title: `${humanOf() ? "✋ " : ""}${th.supplier}`, initial: String(th.supplier || "").replace(/^(تأمین‌کنندهٔ|شرکت|فروشگاه)\s+/, "").trim()[0] || "؟",
        whoAttrs: "data-items", whoTitle: `${th.supplier} · 📞 ${th.phone || ""} · درخواست ${th.request_id}`,
        acts: `${humanOf() ? `<button class="ph-glass ph-circ" type="button" data-handback aria-label="برگرداندن به کارشناس هوشمند" title="✋ اضطراری دستِ شماست — برگرداندن به کارشناس هوشمند">🤖</button>` : ""}${framed ? "" : `<button class="ph-glass ph-circ" type="button" data-help="corr.main" aria-label="راهنما" title="راهنما">${TP.ui.ICON.help}</button>`}<button class="ph-glass ph-circ" data-clear-chat aria-label="پاک کردن گفت‌وگو" title="پاک کردن گفت‌وگو — فقط از صفحهٔ شما">${I.erase}</button>
          <button class="ph-glass ph-circ" data-items aria-label="اقلام و تصمیم‌ها${waiting ? ` — ${fa(waiting)} بسته منتظر تصمیم` : ""}" title="اقلام و تصمیم‌ها">${I.box}${waiting ? `<b class="ph-dot">${fa(waiting)}</b>` : ""}</button>`,
      },
      composer: roOf()
        ? { readonly: `<span class="ph-ro-t">🤖 کارشناس هوشمند این گفت‌وگو را پیش می‌برد — <b>فقط دیدن</b>${turnsTxt()}</span><button type="button" class="ph-ro-sos" data-takeover title="گفت‌وگو را خودتان ادامه دهید — مدیر و پشتیبان خبردار می‌شوند">🚨 باز کردنِ اضطراری</button>` }
        /* «⏱ با مهلت»: پیامِ کادر فقط با تأییدِ صریح و علت جای پیشنهادِ پیامِ کارشناس هوشمند می‌رود (W3 — دامِ تایپ؛ composeWatch) */
        : { placeholder: askOf() ? "پاسخ به پرسشِ کارشناس هوشمند" : watchOf() ? (PH.props.target(watchOf().pending) ? "✏️ پیامِ خودتان، به‌جای پیشنهادِ کارشناس هوشمند" : "⏱ پیام فقط به‌جای پیشنهادِ کارشناس هوشمند")
          : `پیام به ${th.supplier}`, draft: S.th },
    });
  }
  const composerState = PH.grow;
  /** صدای پیامِ صوتی با همان هدرِ ورودِ این صفحه */
  async function loadVoice(id) {
    const r = await fetch(`${(window.TAMIN_POSHTIBANI_CONFIG || {}).apiBase || "/tamin-poshtibani/api"}/sp/msg/${id}/voice`, { headers: { ...TP.authHeaders(), ...(inTg ? { "X-TG-Init": tgData } : {}) } });
    if (!r.ok) throw new Error("پخش نشد");
    return r.blob();
  }

  /* --- جدول تطابق: ✅ همان · ⚠️ مطمئن نیست · ⚪ مطمئن است که نیامده · ❌ مطمئن است که فرق دارد --- */
  const ICON = { ok: "✅", warn: "⚠️", none: '<span class="sp-dot"></span>', bad: "❌" };
  const TIP = { ok: "همان", warn: "خوانش مطمئن نیست", none: "مطمئن است که در پیش‌فاکتور نیامده", bad: "مطمئن است که با پیش‌فاکتور فرق دارد" };
  /* هر ردیفِ غیرسبز تیک می‌خورد: پیش‌فاکتور به‌جای درخواست ملاک — مقدارِ سند، یا خالی اگر سند چیزی نگفته */
  const acceptable = (row) => !!row && row.status !== "ok";
  const val = (v, row) => (v == null || v === "" ? "—" : row.key === "price" ? money(v) : typeof v === "number" ? qty(v) : row.kind === "terms" ? esc(fa(v)) : esc(v));
  function matchTable(b) {
    const ai = b.ai, acc = b.accept || {};
    const tr = (row, k) => {
      const on = !!acc[k] && acceptable(row);
      const empty = on && (row.val === null || (row.val === undefined && (row.got == null || row.got === "")));
      return `<tr class="${row.gate ? "" : "info"} ${on ? "acc" : ""}"><td class="t">${esc(row.label)}${row.gate ? "" : ` <span class="sp-muted">(اطلاعاتی)</span>`}</td>
        <td>${row.kind === "terms" && (row.want == null || row.want === "") ? `<span class="sp-muted">—</span>` : val(row.want, row)}</td>
        <td>${val(row.got, row)}${row.def ? ` <span class="sp-muted">(پیش‌فرض شرکت)</span>` : ""}${row.note ? `<div class="sp-muted">${esc(row.note)}</div>` : ""}${empty ? `<div class="sp-warn">خالی می‌ماند</div>` : ""}</td>
        <td class="sp-mst" title="${TIP[row.status] || ""}">${ICON[row.status] || "⚠️"}</td>
        <td>${acceptable(row) && b.state === "proforma" ? `<label class="sp-acc" title="پیش‌فاکتور به‌جای درخواست ملاک شود"><input type="checkbox" data-acc="${esc(k)}" ${on ? "checked" : ""}> پیش‌فاکتور ملاک</label>` : ""}</td></tr>`;
    };
    let h = `<div class="sp-match"><div class="sp-row"><b>🤖 جدول تطابق با پیش‌فاکتور</b></div>
      <div class="sp-legend">✅ همان · ⚠️ مطمئن نیست · <span class="sp-dot"></span> مطمئن است که نیامده · ❌ مطمئن است که فرق دارد · ☑️ تیک: پیش‌فاکتور به‌جای درخواست ملاک</div>`;
    for (const ln of ai.lines || []) {
      const l = S.d.lines.find((x) => x.id === ln.line_id) || ln;
      h += `<h5>${code(l)}${esc(ln.title)}${ln.found === false ? ` <span class="sp-err">— در پیش‌فاکتور پیدا نشد</span>` : ln.doc_title ? ` <span class="sp-muted">— در سند: «${esc(ln.doc_title)}»</span>` : ""}</h5>
        <div class="sp-scroll"><table class="sp-table sp-mt"><thead><tr><th class="t">لایه / فیلد</th><th>بستهٔ تأمین‌کننده</th><th>پیش‌فاکتور</th><th>وضعیت</th><th>تیک</th></tr></thead>
        <tbody>${(ln.rows || []).map((row) => tr(row, `${ln.line_id}|${row.key}`)).join("")}</tbody></table></div>`;
    }
    h += `<h5>شرایط فاکتور</h5><div class="sp-scroll"><table class="sp-table sp-mt"><thead><tr><th class="t">فیلد</th><th>اعلامِ تأمین‌کننده</th><th>پیش‌فاکتور</th><th>وضعیت</th><th>تیک</th></tr></thead>
      <tbody>${(ai.header || []).map((row) => tr(row, `h|${row.key}`)).join("")}</tbody></table></div>`;
    h += b.ready ? `<div class="sp-ok">✅ همه‌چیز برای تأیید نهایی آماده است — مقدارهای پیش‌فاکتور به تب استعلامات می‌روند.</div>`
      + (b.gaps && b.gaps.length ? `<div class="sp-warn">این‌ها خالی می‌مانند و خط استعلام «ثبت موقت» نمی‌شود: ${b.gaps.map(esc).join("، ")}</div>` : "")
      : `<div class="sp-err">⛔ مانده — تیک بزنید (پیش‌فاکتور ملاک) یا بسته را برگردانید:\n${(b.problems || []).map((p) => `• ${esc(p)}`).join("\n")}</div>`;
    return h + `</div>`;
  }

  /* --- اقلام و تصمیم‌ها --- */
  const fileLinks = (lineId) => S.d.files.filter((f) => f.line_id === lineId)
    .map((f) => `<button class="tp-btn xs" data-file="${f.id}" title="${esc(f.note || "")}">📎 ${esc(f.label)}</button>`).join(" ");
  /** آنچه تأمین‌کننده روی 🔓ها پیشنهاد داده (فاز ۴)، لایه‌های افزوده با واحد، مقدارِ کمتر و توضیحِ زیرِ قلم */
  const extraTxt = (x) => `${esc(x.k)}: ${esc(x.v)}${x.u ? ` ${esc(x.u)}` : ""}`;
  function lineMore(l) {
    const out = [];
    if (l.s_title) out.push(`🔓 عنوانِ پیشنهادی: <b>${esc(l.s_title)}</b>`);
    for (const x of l.layers || []) if (x.s) out.push(`🔓 ${esc(x.k)}: <b>${esc(x.s)}</b> (درخواست: ${esc(x.v)})`);
    if (l.extra.length) out.push(`➕ ${l.extra.map(extraTxt).join("، ")}`);
    if (l.locks && !l.locks.legacy && l.req_qty != null && l.qty != null && Number(l.qty) < Number(l.req_qty)) out.push(`🔓 مقدار کمتر از درخواست (${qty(l.req_qty)} ${esc(l.req_unit || "")})`);
    if (l.note) out.push(`📝 ${esc(l.note)}`);
    return out.length ? `<div class="sp-muted">${out.join("<br>")}</div>` : "";
  }
  function bundleCard(b, byId) {
    const ls = b.line_ids.map((id) => byId.get(id)).filter(Boolean);
    const sum = ls.reduce((s, l) => s + (l.total || 0), 0);
    let h = `<div class="sp-bundle" data-b="${b.id}"><header><b>بستهٔ ${fa(b.id)}</b><span class="sp-st ${b.state}">${esc(b.state_fa)}</span><span class="sp-muted">${when(b.created_at)}</span></header>
      <div class="sp-scroll"><table class="sp-table"><thead><tr><th class="t">قلم</th><th>مقدار</th><th>قیمت واحد (ریال)</th><th>قیمت کل (ریال)</th></tr></thead><tbody>
      ${ls.map((l) => `<tr><td class="t">${code(l)}${esc(l.title)}${lineMore(l)}${fileLinks(l.id) ? `<div>${fileLinks(l.id)}</div>` : ""}</td>
        <td>${qty(l.qty)} ${esc(l.unit || "")}</td><td><b>${money(l.price)}</b></td><td><b>${money(l.total)}</b></td></tr>`).join("")}
      </tbody><tfoot><tr><td class="t">جمع</td><td></td><td></td><td>${money(sum)}</td></tr></tfoot></table></div>`;
    if (termsLine(b.terms)) h += `<div class="sp-muted" style="margin-top:4px">🧾 شرایط اعلامی: ${esc(termsLine(b.terms))}</div>`;
    if (b.comment) h += `<div class="sp-comment">${esc(b.comment)}</div>`;
    if (!S.pfRead) return h + genActs(b) + `</div>`;
    if (b.pf) h += `<div class="sp-row" style="margin-top:6px">📄 پیش‌فاکتور: <b>${esc(b.pf.name || "")}</b><button class="tp-btn xs" data-pf="${b.id}">👁 دیدن</button></div>`;
    if (b.ai && b.state === "proforma") h += matchTable(b);
    const wa = ["pending", "approved", "proforma"].includes(b.state) ? watchActs(b) : null;
    if (wa != null) return h + wa + `</div>`;
    if (b.state === "pending") {
      h += `<div class="sp-actions"><button class="tp-btn primary" data-act="approve">✅ تأیید و درخواست پیش‌فاکتور</button><button class="tp-btn warn" data-act="return">↩️ برگرداندن با توضیح</button><button class="tp-btn danger" data-act="reject">❌ رد</button></div>`;
    } else if (b.state === "approved") {
      h += `<div class="sp-muted" style="margin-top:6px">منتظر پیش‌فاکتورِ تأمین‌کننده.</div><div class="sp-actions"><button class="tp-btn warn" data-act="return">↩️ برگرداندن با توضیح</button><button class="tp-btn danger" data-act="reject">❌ رد</button></div>`;
    } else if (b.state === "proforma") {
      const open = b.ai ? countOpen(b) : 0;
      h += `<div class="sp-actions"><button class="tp-btn ${b.ai ? "" : "primary"}" data-act="ai">🤖 ${b.ai ? "خوانش دوباره" : "خوانش هوشمند پیش‌فاکتور"}</button>
        ${open > 1 ? `<button class="tp-btn" data-act="acceptall">☑️ تیکِ همهٔ غیرسبزها (${fa(open)})</button>` : ""}
        <button class="tp-btn ${b.ready ? "primary" : ""}" data-act="final" ${b.ai ? "" : "title=\"اول خوانش هوشمند\""}>🏁 تأیید نهایی</button>
        <button class="tp-btn warn" data-act="return">↩️ برگرداندن با توضیح</button><button class="tp-btn danger" data-act="reject">❌ رد</button></div>
        ${b.ai ? "" : `<div class="sp-muted">تأیید نهایی بدون «خوانش هوشمند» ممکن نیست ${TP.ui.info("corr.main", "راهنمای مکاتبات")}</div>`}`;
    }
    return h + `</div>`;
  }
  /**
   * خوانش هوشمند خاموش (فاز ۴، تصمیم ۱۳): بسته از هر وضعیتِ باز یکراست «🏁 تأیید نهایی» می‌شود — با مقدارهای خودِ تأمین‌کننده و
   * پیش‌فاکتورِ سامانه — یا با توضیح برمی‌گردد یا رد می‌شود. پیش‌فاکتورِ خودِ تأمین‌کننده فقط پیوست است.
   */
  function genActs(b) {
    const open = ["pending", "approved", "proforma"].includes(b.state);
    let h = `<div class="sp-row" style="margin-top:6px"><button class="tp-btn xs" data-gen="${b.id}">👁 پیش‌فاکتور</button><button class="tp-btn xs" data-gen-word="${b.id}">⬇️ Word</button>
      ${b.pf ? `<span class="sp-muted">📎 پیوستِ تأمین‌کننده: ${esc(b.pf.name || "")}</span><button class="tp-btn xs" data-pf="${b.id}">دیدنِ پیوست</button>` : ""}</div>`;
    if (!open) return h;
    const wa = watchActs(b);
    if (wa != null) return h + wa;
    h += b.ready ? `<div class="sp-ok">✅ همهٔ فیلدهای اجباری و شرایط پر است — «🏁 تأیید نهایی» پیشنهاد را با همین مقدارها به تب استعلامات می‌برد و از تأمین‌کننده تشکر می‌کند.</div>`
      : `<div class="sp-err">⛔ هنوز کامل نیست — برگردانید تا تأمین‌کننده پر کند:\n${(b.problems || []).map((p) => `• ${esc(p)}`).join("\n")}</div>`;
    return h + `<div class="sp-actions"><button class="tp-btn ${b.ready ? "primary" : ""}" data-act="final" ${b.ready ? "" : "disabled"}>🏁 تأیید نهایی</button>
      <button class="tp-btn warn" data-act="return">↩️ برگرداندن با توضیح</button><button class="tp-btn danger" data-act="reject">❌ رد</button></div>`;
  }
  /**
   * «⏱ با مهلت»: تصمیمِ بسته با پیشنهادِ کارشناس هوشمند و تأییدِ شماست — مگر بسته‌ای که پیشنهادش را رد کرده‌اید یا «⏸ بعداً خودم»
   * زده‌اید (manual)؛ null یعنی دکمه‌های همیشگیِ تصمیم. همان دکمه‌های کارتِ گفت‌وگو (ph-props.js:acts — «🏁 تأیید نهایی» چهار راه دارد).
   */
  function watchActs(b) {
    if (roOf()) return `<div class="sp-muted" style="margin-top:6px">🤖 تصمیمِ این بسته با کارشناس هوشمند است — فقط دیدن.</div>`;
    const w = watchOf();
    if (!w || (w.manual || []).includes(b.id)) return null;
    const p = (w.pending || []).find((x) => PH.props.bundlesOf(x).includes(b.id));
    return p ? `<div class="sp-watch-box">${p.due_at ? "⏱" : "⏸"} پیشنهادِ کارشناس هوشمند: <b>${esc(p.kind_fa)}</b> — منتظرِ «تأیید» یا «رد»ِ شما${p.due_at ? "؛ بی‌پاسخ سرِ مهلت خودکار می‌رود" : ""}
        ${PH.props.acts(p, { size: "", short: true })}</div>`
      : `<div class="sp-muted" style="margin-top:6px">⏱ تصمیمِ این بسته را کارشناس هوشمند پیشنهاد می‌کند و اول به شما نشان داده می‌شود.</div>`;
  }
  function countOpen(b) {
    let n = 0;
    for (const ln of b.ai.lines || []) for (const row of ln.rows || []) if (acceptable(row) && !(b.accept || {})[`${ln.line_id}|${row.key}`]) n++;
    for (const row of b.ai.header || []) if (acceptable(row) && !(b.accept || {})[`h|${row.key}`]) n++;
    return n;
  }
  function itemsPane(pane) {
    const d = S.d, byId = new Map(d.lines.map((l) => [l.id, l]));
    const open = d.bundles.filter((b) => OPEN_ST.includes(b.state)).reverse();
    const done = d.bundles.filter((b) => !OPEN_ST.includes(b.state)).reverse();
    const none = (t) => `<div class="sp-none">${TP.ui.ICON.check}<span>${t}</span></div>`;
    if (pane === "wait") return open.length ? open.map((b) => bundleCard(b, byId)).join("") : none("بسته‌ای منتظر تصمیم شما نیست.");
    if (pane === "done") return done.length ? done.map((b) => bundleCard(b, byId)).join("") : none("هنوز تصمیمی گرفته نشده.");
    if (pane === "props") {
      const w = watchOf();
      return w && (w.done || []).length ? `<div class="sp-card sp-props-done">${w.done.map((p) => `<div>${esc(p.state_fa)} — ${esc(p.kind_fa)}${p.bundle_id ? ` بستهٔ ${fa(p.bundle_id)}` : ""}
        <span class="sp-muted">${when(p.decided_at || p.created_at)}</span>${p.reason ? `<div class="r">علت: ${esc(p.reason)}</div>` : ""}${p.own ? `<div class="r">پیامِ شما: ${esc(p.own)}</div>` : ""}</div>`).join("")}</div>` : none("پیشنهادی نیست.");
    }
    let h = "";
    /* 🔒 ثابت · 🔓 قابل تغییر (فاز ۴): پیشنهادِ تأمین‌کننده روی 🔓ها کنارِ مقدارِ درخواست */
    const chip = (x) => (x.lock === false ? `<span class="sp-chip ${x.s ? "add" : "lock"}">🔓 <i>${esc(x.k)}:</i> ${x.s ? `<b>${esc(x.s)}</b> <span class="sp-muted">(درخواست: ${esc(x.v)})</span>` : esc(x.v)}</span>`
      : `<span class="sp-chip lock">🔒 <i>${esc(x.k)}:</i> ${esc(x.v)}</span>`);
    const qLock = (l) => (!l.locks || l.locks.legacy ? "" : l.locks.qty ? " 🔒" : " 🔓");
    /* کارتِ قلم: عنوان و وضعیت، خطِ قیمت، نوع قلم و سه ویژگیِ اول؛ بقیه و توضیح‌ها با «بیشتر» */
    const SHOW = 3;
    h += d.lines.slice().sort((a, b) => b.id - a.id).map((l) => {
      const chips = [...l.layers.map(chip), ...l.extra.map((x) => `<span class="sp-chip add">➕ <i>${esc(x.k)}:</i> ${esc(x.v)}${x.u ? ` ${esc(x.u)}` : ""}</span>`)];
      const shown = chips.slice(0, SHOW), rest = chips.slice(SHOW);
      return `<div class="sp-card sp-it2" data-no="${l.no || ""}"><header>${code(l)}<h3>${esc(l.title)}</h3><span class="sp-st ${l.state}">${esc(l.state_fa)}</span></header>
      <div class="sp-price">${l.price != null ? `<b class="p">${money(l.price)}</b><span class="sp-muted">ریال × ${qty(l.qty)} ${esc(l.unit || "")}</span><b class="t">= ${money(l.total)}</b>` : `<span class="sp-muted">هنوز قیمتی نیامده</span>`}
        <span class="sp-muted q" title="مقدارِ درخواست">خواسته${qLock(l)}: ${qty(l.req_qty)} ${esc(l.req_unit || "")}</span></div>
      <div class="sp-chips">${l.head ? `<span class="sp-chip lock"><i>نوع:</i> ${esc(l.head)}</span>` : ""}${shown.join("")}</div>
      ${rest.length || l.s_title || l.note ? `<details class="sp-more"><summary>${rest.length ? `${fa(rest.length)} ویژگیِ دیگر` : "جزئیات"}${l.note ? " · توضیح تأمین‌کننده" : ""}</summary>
        ${l.s_title ? `<div class="sp-muted">🔓 عنوانِ پیشنهادی: <b>${esc(l.s_title)}</b></div>` : ""}${rest.length ? `<div class="sp-chips">${rest.join("")}</div>` : ""}${l.note ? `<div class="sp-muted">📝 ${esc(l.note)}</div>` : ""}</details>` : ""}
      ${fileLinks(l.id) ? `<div class="sp-files">${fileLinks(l.id)}</div>` : ""}
      ${l.quote_id ? `<div class="sp-ok">✓ در تب استعلامات</div>` : ""}</div>`;
    }).join("") || none("قلمی در این گفت‌وگو نیست.");
    return h;
  }

  /* ---------- رفتار ---------- */
  function bind() {
    /* جستجوی فهرست‌ها: فقط همان ستون دوباره رسم می‌شود تا فوکوسِ کادر نپرد */
    const rq = $("[data-rq]"); if (rq) rq.oninput = () => { S.rq = rq.value; const a = $("[data-reqs]"); if (a) { a.innerHTML = reqList(); bind(); } };
    const sq = $("[data-sq]"); if (sq) sq.oninput = () => { S.sq = sq.value; const b = $("[data-sups]"); if (b) { b.innerHTML = supList(); bind(); } };
    $$("[data-aid]").forEach((b) => { b.onclick = () => { S.aid = +b.dataset.aid; S.view = "sup"; S.sq = ""; ss.set("sp.aid", String(S.aid)); render(); }; });
    $$("[data-th]").forEach((b) => { b.onclick = () => openThread(+b.dataset.th); });
    /* «🚨 باز کردنِ اضطراری»: کادرِ «فقط دیدن»ِ 🤖 خودکار و نوارِ وضعیتِ «⏱ با مهلت / ⏸ بی‌مهلت» (W3) */
    $$("[data-takeover]").forEach((b) => { b.onclick = takeoverDialog; });
    /* «📘 سند راهبرد»ِ فقط‌خواندنی از کارتِ «🧭 مذاکرهٔ کارشناس هوشمند» (W9) */
    $$("[data-negdoc]").forEach((b) => { b.onclick = () => negDoc(b); });
    const hb = $("[data-handback]"); if (hb) hb.onclick = handbackDialog;
    $$("[data-th-lock]").forEach((b) => { b.onclick = () => say("این گفت‌وگو را کارشناس هوشمند پیش می‌برد و تا وقتی تیکِ شما در «پنل پشتیبانی» روی «🤖 هوشمند» است برای شما بسته است.\nاگر سؤالی از شما داشته باشد همین‌جا با 🚨 باز می‌شود و در تلگرام هم خبر می‌دهد.", "🔒 گفت‌وگوی کارشناس هوشمند"); });
    $$("[data-back]").forEach((b) => { b.onclick = () => { S.view = b.dataset.back; render(); }; });
    $$("[data-tab]").forEach((b) => { b.onclick = () => { S.tab = b.dataset.tab; S.mainScroll = 0; render(); }; });
    $$("[data-pane]").forEach((b) => { b.onclick = () => { S.pane = b.dataset.pane; S.mainScroll = 0; render(); }; });
    const tg = $("[data-tg]"); if (tg) tg.onclick = connectTg;
    const snd = $("[data-send]"); if (snd) snd.onclick = () => sendDialog().catch((e) => say(e.message));
    $$("[data-file]").forEach((b) => { b.onclick = () => openUrl(`/sp/file/${b.dataset.file}/url`); });
    $$("[data-pf]").forEach((b) => { b.onclick = () => openUrl(`/sp/bundle/${b.dataset.pf}/pf-url`); });
    $$("[data-gen]").forEach((b) => { b.onclick = () => pfDialog(+b.dataset.gen); });
    $$("[data-gen-word]").forEach((b) => { b.onclick = () => downloadDocx(+b.dataset.genWord).catch((e) => say(e.message)); });
    $$("[data-act]").forEach((b) => { b.onclick = () => act(+b.closest("[data-b]").dataset.b, b.dataset.act); });
    $$("[data-prop-ok]").forEach((b) => { b.onclick = () => propOk(+b.dataset.propOk, b); });
    $$("[data-prop-no]").forEach((b) => { b.onclick = () => propNo(+b.dataset.propNo); });
    /* «🏁 تأیید نهایی»: «↩️ برگشت با توضیح»، «❌ رد» و «⏸ بعداً خودم» — <پیشنهاد>:<سرنوشتِ بسته> (W3) */
    $$("[data-prop-fin]").forEach((b) => { b.onclick = () => { const [id, fate] = b.dataset.propFin.split(":"); propFin(+id, fate); }; });
    $$("[data-prop-jump]").forEach((b) => { b.onclick = (e) => { e.stopPropagation(); jumpProp(); }; });
    /* بستهٔ «⏸ بعداً خودم» در گفت‌وگو: همان تصمیم‌های «اقلام و تصمیم‌ها» (act) */
    $$("[data-bact]").forEach((b) => { b.onclick = (e) => { e.stopPropagation(); const [bid, a] = b.dataset.bact.split(":"); act(+bid, a); }; });
    $$("[data-supcfg]").forEach((b) => { b.onclick = () => supCfgDialog(); });
    $$("[data-rate-star]").forEach((b) => { b.onclick = (e) => { e.stopPropagation(); const [id, n] = b.dataset.rateStar.split(":").map(Number); rateMsg(id, n); }; });
    /* گوشی: لمسِ پیامِ بی‌امتیاز ستاره‌ها را نشان می‌دهد (بی نشانگرِ موشواره) */
    $$("[data-rate-row]").forEach((r) => { r.onclick = () => { $$(".ph-row.show-rate").forEach((x) => { if (x !== r) x.classList.remove("show-rate"); }); r.classList.toggle("show-rate"); }; });
    $$("[data-trate-star]").forEach((b) => { b.onclick = () => { S.trate = +b.dataset.trateStar.split(":")[1]; const t = $("[data-trate-note]"); S.trateNote = t ? t.value : S.trateNote; const c = b.closest(".ph-trate"); if (c && critique()) S.tboxes = boxesFrom(c); repaintChat(); }; });
    const tn = $("[data-trate-note]"); if (tn) tn.oninput = () => { S.trateNote = tn.value; };
    const ts = $("[data-trate-save]"); if (ts) ts.onclick = () => rateThread(ts);
    const te = $("[data-trate-edit]"); if (te) te.onclick = () => { S.trateEdit = true; S.trate = (ratesOf().thread || {}).stars || 0; repaintChat(); };
    $$("[data-acc]").forEach((c) => {
      c.onchange = async () => {
        const bid = +c.closest("[data-b]").dataset.b;
        const m = $(".sp-main"); S.mainScroll = m ? m.scrollTop : 0;
        try { await api(`/sp/x/bundle/${bid}/accept`, { body: { keys: [c.dataset.acc], on: c.checked } }); await loadThread(); }
        catch (e) { c.checked = !c.checked; say(e.message); }
      };
    });
    /* کلیک روی کارتِ پیامِ بسته یا قلم: «اقلام و تصمیم‌ها» روی همان بسته یا قلم — در چیدمانِ گوشی ستونِ وسط همان‌جا
       اسکرول می‌خورد و گفت‌وگو سرِ جایش می‌ماند */
    const goto = (sel) => { const p = paneFor(sel); if (phoneMode && p === curPane()) return jumpTo(sel); S.pane = p; S.tab = "items"; S.goto = sel; render(); };
    const press = (el, fn) => { el.onclick = (e) => { e.stopPropagation(); fn(); }; el.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } }; };
    $$("[data-goto-b]").forEach((el) => press(el, () => goto(`[data-b="${el.dataset.gotoB}"]`)));
    $$("[data-goto-no]").forEach((el) => press(el, () => goto(`[data-no="${el.dataset.gotoNo}"]`)));
    /* 📦 و نامِ تأمین‌کننده بالای گفت‌وگو: اقلام و تصمیم‌ها — اولین بستهٔ منتظر تصمیم، وگرنه سرِ همان ستون */
    $$("[data-items]").forEach((el) => {
      el.onclick = () => {
        if (!phoneMode) { S.tab = "items"; S.mainScroll = 0; return render(); }
        const open = S.d && S.d.bundles.filter((b) => ["pending", "approved", "proforma"].includes(b.state)).pop();
        if (open) { if (curPane() !== "wait") { S.pane = "wait"; S.goto = `[data-b="${open.id}"]`; return render(); } return jumpTo(`[data-b="${open.id}"]`); }
        const m = $(".sp-main"); if (m) m.scrollTo({ top: 0, behavior: "smooth" });
        const hd = $(".sp-main .sp-head"); if (hd) { hd.classList.add("sp-flash"); setTimeout(() => hd.classList.remove("sp-flash"), 1600); }
      };
    });
    const chat = $("#chat"); if (chat) PH.bindVoices(chat, loadVoice);
    const clr = $("[data-clear-chat]");
    if (clr) clr.onclick = () => dlg("پاک کردن گفت‌وگو", "<p>پیام‌های تا این لحظه از صفحهٔ شما پاک می‌شوند. در سامانه می‌مانند و تأمین‌کننده هنوز آن‌ها را می‌بیند.</p><div class=\"sp-err\" data-err></div>",
      [{ label: "🧹 پاک شود", cls: "primary", fn: async () => { await api(`/sp/thread/${S.th}/clear`, { body: {} }); await loadThread(); } }, { label: "انصراف" }]);
    const send = $("#sendMsg");
    if (send) {
      const inp = $("#msgIn");
      const go = async () => {
        const text = inp.value.trim(); if (!text) return;
        send.disabled = true;
        if (askOf()) { send.disabled = false; return answerAsk(text); }
        /* «⏱ با مهلت / ⏸ بی‌مهلت» (W3، دامِ تایپ): پیامِ کادر فقط با تأییدِ صریح و علت جای پیشنهادِ پیامِ کارشناس هوشمند می‌رود —
           هیچ ردِ بی‌صدایی، و «🏁 تأیید نهایی» هرگز با پیامِ کادر رد نمی‌شود */
        if (watchOf()) { send.disabled = false; return composeWatch(text); }
        /* حباب همان لحظه می‌آید؛ پاسخِ سرور جایش را با پیامِ واقعی عوض می‌کند (مهر ۱۴۰۵) */
        const th = S.th, p = { at: Date.now(), body: text, th };
        S.outbox = (S.outbox || []).concat(p); inp.value = ""; S.drafts[S.th] = "";
        const paint = () => { const c = $("#chat"); if (c && S.th === th) { c.innerHTML = feedHtml(); c.scrollTop = c.scrollHeight; bind(); } };
        paint();
        try {
          const r = await api(`/sp/thread/${th}/msg`, { body: { text } });
          S.outbox = S.outbox.filter((x) => x !== p);
          const last = S.lastMsg; addMsgs(r.msgs); if (S.lastMsg === last) paint();
        } catch (e) {
          S.outbox = S.outbox.filter((x) => x !== p); paint();
          if (!inp.value) inp.value = text;
          if (e.status === 423 && !(e.data && e.data.ai_watch)) return shut(e.message); say(e.message); if (e.data && e.data.ai_watch) await loadThread().catch(() => {});
        }
        composerState(inp); inp.focus();
      };
      send.onclick = go;
      inp.oninput = () => composerState(inp);
      inp.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); go(); } };
    }
  }

  /** پاسخ به «🚨 پرسش از کارشناس»: برای تأمین‌کننده هم می‌رود؛ بعدش گفت‌وگو دوباره دستِ کارشناس هوشمند است */
  function answerAsk(text) {
    const th = S.d.thread, id = S.th;
    dlg("🚨 پاسخ به کارشناس هوشمند", `<p>این پاسخ برای <b>${esc(th.supplier)}</b> هم فرستاده می‌شود و کارشناس هوشمند با آن مذاکره را ادامه می‌دهد؛ بعد از فرستادن، این گفت‌وگو دوباره برای شما بسته است.</p><div class="sp-sms">${esc(text)}</div><div class="sp-err" data-err></div>`,
      [{ label: "بفرست", cls: "primary", fn: async () => {
        await api(`/sp/thread/${id}/msg`, { body: { text } });
        S.drafts[id] = ""; const inp = $("#msgIn"); if (inp) inp.value = "";
        await shut("پاسخ شما رفت و کارشناس هوشمند مذاکره را ادامه می‌دهد. گزارشِ کارش در «پنل پشتیبانی» است.", "✅ پاسخ فرستاده شد");
      } }, { label: "انصراف" }]);
  }
  /* --- «⏱ با مهلت»: تأیید (بی توضیح) و رد (علتِ اجباری؛ پیامِ تازهٔ خودِ کارشناس یا سرنوشتِ بسته) — همه POST /sp/x/prop/:id --- */
  const propOf = (id) => ((watchOf() || {}).pending || []).find((p) => p.id === id) || null;
  async function propOk(id, btn) {
    const m = $(".sp-main"); S.mainScroll = m ? m.scrollTop : 0;
    if (btn) btn.disabled = true;
    try { await api(`/sp/x/prop/${id}`, { body: { action: "ok" } }); await afterDecide(); }
    catch (e) { if (btn) btn.disabled = false; say(e.message, e.status === 409 ? "پیشنهاد کنار رفت" : "نشد"); if (e.status === 409) await afterDecide().catch(() => {}); }
  }
  /** تا نوشتنِ علت و پیام، مهلت دست‌کم سه دقیقه تمدید می‌شود تا وسطِ نوشتن خودکار نرود */
  const holdProp = (p) => api(`/sp/x/prop/${p.id}`, { body: { action: "hold" } }).then((r) => { if (r && r.due_at) p.due_at = r.due_at; }).catch(() => {});
  const holdNote = (p) => (p.due_at ? `<div class="sp-muted" style="margin-top:6px">⏱ برای نوشتن، مهلت تا دست‌کم سه دقیقهٔ دیگر تمدید شد.</div>` : "");
  /**
   * ثبتِ رد؛ پیشنهادی که همان لحظه رفت یا کنار رفت (۴۰۹) صفحه را هم تازه می‌کند و خطایش در همان پنجره می‌ماند. done: بعد از ثبت و
   * پیش از رسمِ دوباره (مثلاً خالی کردنِ کادرِ پیام — وگرنه رسمِ دوباره پیش‌نویس را برمی‌گرداند)
   */
  async function propSend(p, body, done) {
    try { await api(`/sp/x/prop/${p.id}`, { body }); }
    catch (e) { if (e.status === 409) afterDecide().catch(() => {}); throw e; }
    if (done) done();
    await afterDecide();
  }
  /** کادرِ پیامِ همین گفت‌وگو خالی (پیش‌نویسش هم) */
  const clearDraft = (tid) => () => { S.drafts[tid] = ""; const inp = $("#msgIn"); if (inp && S.th === tid) { inp.value = ""; composerState(inp); } };
  /** «✏️ رد و نوشتن پیام خودم»ِ «💬 پاسخ» و «🧾 تصمیمِ بسته» — «🏁 تأیید نهایی» راه‌های خودش را دارد (propFin) */
  function propNo(id) {
    const p = propOf(id);
    if (!p) return say("این پیشنهاد دیگر منتظرِ شما نیست؛ صفحه تازه شد.", "⏱ پیشنهاد");
    if (p.kind === "final") return propFin(id, "return");
    const th = S.d.thread, tid = S.th, needText = !!p.body;
    holdProp(p);
    const d = dlg("✏️ رد و نوشتن پیام خودم", `<p>چرا ردش می‌کنید؟ همین توضیح به کارشناس هوشمند می‌رسد تا دفعهٔ بعد درست‌تر بنویسد (تأمین‌کننده نمی‌بیند).</p>
      <textarea class="tp-input tp-textarea" data-r style="min-height:70px" placeholder="علتِ رد (اجباری)"></textarea>
      ${boxPicker([], "کدام جزء درست نبود؟ (دست‌کم یکی)")}
      ${p.body ? `<div class="sp-muted" style="margin-top:10px">پیشنهادِ کارشناس هوشمند: <button type="button" class="tp-btn xs" data-copy-prop>📋 شروع از همین متن</button></div><div class="sp-sms">${esc(p.body)}</div>` : ""}
      <b style="display:block;margin-top:10px">پیامِ تازهٔ خودتان برای ${esc(th.supplier)} ${needText ? "(اجباری — همین به‌جای پیامِ ردشده می‌رود)" : "(اختیاری — خالی یعنی هیچ پیامی نرود)"}</b>
      <textarea class="tp-input tp-textarea" data-t style="min-height:80px"></textarea>
      ${holdNote(p)}<div class="sp-err" data-err></div>`,
    [{ label: "✏️ رد و ارسالِ پیامِ من", cls: "danger", fn: async (dd) => {
      const reason = $("[data-r]", dd).value.trim();
      if (!reason) throw new Error("علتِ رد را بنویسید.");
      const boxes = boxesFrom(dd);
      if (critique() && !boxes.length) throw new Error("دست‌کم یک جعبهٔ نقد بزنید — کدام جزءِ کارِ کارشناس هوشمند درست نبود؟");
      const text = $("[data-t]", dd).value.trim();
      if (needText && !text) throw new Error("پیامِ تازهٔ خودتان را بنویسید — به‌جای پیامِ ردشده همین می‌رود.");
      await propSend(p, { action: "no", reason, text, ...(critique() ? { boxes } : {}) }, clearDraft(tid));
    } }, { label: "انصراف" }]);
    const cp = $("[data-copy-prop]", d); if (cp) cp.onclick = () => { const t = $("[data-t]", d); t.value = p.body; t.focus(); };
    setTimeout(() => { const r = $("[data-r]", d); if (r) r.focus(); }, 30);
  }
  /**
   * «🏁 تأیید نهایی»ِ پیشنهادی (W3): «↩️ برگشت با توضیح»، «❌ رد» یا «⏸ بعداً خودم» — همان «رد»ِ پیشنهاد با سرنوشتِ بسته
   * (ph-props.js:finBody): سرور بسته را با همان تصمیمِ صفحهٔ مکاتبات برمی‌گرداند یا رد می‌کند، و «⏸» بسته را منتظرِ تصمیمِ خودِ
   * شما نگه می‌دارد و ارسالِ خودکارِ پیشنهاد را برمی‌دارد. علت همیشه اجباری است (به کارشناس هوشمند می‌رسد).
   */
  function propFin(id, fate) {
    const p = propOf(id);
    if (!p) return say("این پیشنهاد دیگر منتظرِ شما نیست؛ صفحه تازه شد.", "⏱ پیشنهاد");
    if (!PH.props.FATES.includes(fate)) return;
    holdProp(p);
    const th = S.d.thread, sup = esc(th.supplier), n = fa(p.bundle_id), keep = fate === "keep";
    const K = {
      return: { h: `↩️ برگشتِ بستهٔ ${n} با توضیح`, lead: `بسته برای اصلاح به <b>${sup}</b> برمی‌گردد و اقلامش دوباره قابل ویرایش می‌شود.`,
        t: `چه چیزی باید اصلاح شود؟ (اجباری — برای ${sup} می‌رود)`, ok: "↩️ برگردان", cls: "warn", done: "بسته برای اصلاح برگشت" },
      reject: { h: `❌ ردِ بستهٔ ${n}`, lead: `پیشنهادِ <b>${sup}</b> برای این بسته رد می‌شود.`, t: `پیام برای ${sup} (اختیاری)`, ok: "❌ رد کن", cls: "danger", done: "بسته رد شد" },
      keep: { h: `⏸ تصمیمِ بستهٔ ${n} با خودم`, lead: "این تأیید نهایی <b>خودکار نمی‌رود</b> و بسته منتظرِ تصمیمِ خودِ شما می‌ماند — هر وقت آماده بودید، زیرِ کارتِ همین بسته در گفت‌وگو یا در «اقلام و تصمیم‌ها» «🏁 تأیید نهایی»، «↩️ برگرداندن» یا «❌ رد» را بزنید. برای تأمین‌کننده پیامی نمی‌رود.",
        t: null, ok: "⏸ نگه دار، با خودم", cls: "primary", done: "تصمیمِ بسته با شماست" },
    }[fate];
    const d = dlg(K.h, `<p style="margin-top:0">${K.lead} پیشنهادِ «🏁 تأیید نهایی»ِ کارشناس هوشمند رد می‌شود.</p>
      ${K.t ? `<b style="display:block;margin-top:6px">${K.t}</b><textarea class="tp-input tp-textarea" data-t style="min-height:80px"></textarea>` : ""}
      <b style="display:block;margin-top:10px">چرا پیشنهادِ کارشناس هوشمند را نمی‌پذیرید؟ (اجباری — فقط کارشناس هوشمند می‌بیند)</b>
      <textarea class="tp-input tp-textarea" data-r style="min-height:60px" placeholder="${keep ? "مثلاً می‌خواهم اول با پیشنهادِ بقیه مقایسه کنم" : "مثلاً قیمت از سوابق بالاتر است"}"></textarea>
      ${boxPicker([], "کدام جزء درست نبود؟ (دست‌کم یکی)")}
      ${holdNote(p)}<div class="sp-err" data-err></div>`,
    [{ label: K.ok, cls: K.cls, fn: async (dd) => {
      const t = $("[data-t]", dd);
      const body = PH.props.finBody(fate, { reason: $("[data-r]", dd).value, text: t ? t.value : "", boxes: boxesFrom(dd), needBoxes: !!critique() });
      await propSend(p, body);
      if (TP.ui && TP.ui.success) TP.ui.success(K.done);
    } }, { label: "انصراف" }]);
    setTimeout(() => { const f = $(keep ? "[data-r]" : "[data-t]", d); if (f) f.focus(); }, 30);
  }
  /**
   * دامِ تایپ (W3): پیامِ کادرِ پایین در «⏱ با مهلت / ⏸ بی‌مهلت». اگر پیشنهادِ پیامی منتظر است (ph-props.js:target — آخرین «💬 پاسخ»، وگرنه
   * «🧾 تصمیمِ بسته»ِ پیام‌دار؛ هرگز «🏁 تأیید نهایی»)، پنجرهٔ صریحِ «پیشنهاد رد می‌شود و پیامِ شما جایش می‌رود» با علتِ اجباری؛ وگرنه
   * توضیح و راهِ «🚨 باز کردنِ اضطراری». متنِ نوشته‌شده تا ارسالِ واقعی در کادر می‌ماند.
   */
  function composeWatch(text) {
    const w = watchOf(), p = PH.props.target(w.pending);
    const th = S.d.thread, tid = S.th;
    if (!p) {
      const fin = (w.pending || []).some((x) => x.kind === "final");
      return dlg("⏱ پیامِ آزاد در این گفت‌وگو بسته است", `<p style="margin-top:0">در «${w.hold ? "⏸ بی‌مهلت" : "⏱ با مهلت"}» پیامِ شما فقط <b>به‌جای پیشنهادِ پیامِ کارشناس هوشمند</b> می‌رود و الان چنین پیشنهادی منتظرِ شما نیست${fin ? "؛ دربارهٔ «🏁 تأیید نهایی» با دکمه‌های زیرِ کارتِ همان بسته تصمیم بگیرید" : ""}.</p>
        <p class="sp-muted">برای نوشتنِ آزاد، گفت‌وگو را با «🚨 باز کردنِ اضطراری» دستِ خودتان بگیرید — متنی که نوشتید در کادر می‌ماند.</p>`,
      [{ label: "🚨 باز کردنِ اضطراری", cls: "danger", fn: () => { setTimeout(takeoverDialog, 0); } }, { label: "باشد", cls: "primary" }]);
    }
    holdProp(p);
    const act = p.kind === "act";
    const d = dlg("✏️ پیامِ شما به‌جای پیشنهادِ کارشناس هوشمند", `<p style="margin-top:0">با فرستادنِ این پیام، <b>پیشنهادِ کارشناس هوشمند رد می‌شود</b>${act ? " (تصمیمِ بسته‌هایش هم اجرا نمی‌شود و تصمیمِ آن بسته‌ها با خودِ شما می‌ماند)" : ""} و پیامِ شما به‌جایش برای <b>${esc(th.supplier)}</b> می‌رود.</p>
      <div class="sp-muted">پیشنهادِ کارشناس هوشمند — <b>نمی‌رود</b>:</div><div class="sp-sms">${esc(p.body)}</div>
      <div class="sp-muted" style="margin-top:8px">پیامِ شما — <b>می‌رود</b>:</div><textarea class="tp-input tp-textarea" data-t style="min-height:70px">${esc(text)}</textarea>
      <b style="display:block;margin-top:10px">چرا پیشنهاد را رد می‌کنید؟ (اجباری — فقط کارشناس هوشمند می‌بیند)</b>
      <textarea class="tp-input tp-textarea" data-r style="min-height:60px" placeholder="علتِ رد"></textarea>
      ${boxPicker([], "کدام جزء درست نبود؟ (دست‌کم یکی)")}
      ${holdNote(p)}<div class="sp-err" data-err></div>`,
    [{ label: "✏️ رد کن و پیامِ من برود", cls: "danger", fn: async (dd) => {
      const body = PH.props.replaceBody({ text: $("[data-t]", dd).value, reason: $("[data-r]", dd).value, boxes: boxesFrom(dd), needBoxes: !!critique() });
      await propSend(p, body, clearDraft(tid));
      if (TP.ui && TP.ui.success) TP.ui.success("پیامِ شما رفت و پیشنهاد کنار رفت");
    } }, { label: "انصراف" }]);
    setTimeout(() => { const r = $("[data-r]", d); if (r) r.focus(); }, 30);
    return d;
  }
  /* سرِ صفرِ شمارش: خودِ صفحه «سرِ مهلت» را می‌زند (Cron هم هر دقیقه)؛ بعدش گفت‌وگو دوباره خوانده می‌شود */
  const dueFired = new Set();
  function dueTick() {
    const w = watchOf(); if (!w || !(w.pending || []).length) return;
    for (const el of $$("[data-due]")) {
      const p = propOf(+el.dataset.due); if (!p) continue;
      el.style.setProperty("--p", duePct(p));
      const t = $("[data-due-t]", el); if (t) t.innerHTML = dueLabel(p);
      el.classList.toggle("soon", (leftMs(p) || 0) < 60000);
      if (leftMs(p) <= 0 && !dueFired.has(p.id) && !document.querySelector(".tp-modal-bg")) {
        dueFired.add(p.id);
        api(`/sp/x/prop/${p.id}`, { body: { action: "due" } }).catch(() => {}).then(() => setTimeout(() => loadThread().catch(() => {}), 600));
      }
    }
  }
  setInterval(dueTick, 1000);
  /* «⏱ با مهلت / 🤖 خودکار»: فقط خودِ کارشناس — همین‌جا یا «حساب من» */
  async function supCfgDialog() {
    let s; try { s = await api("/me/supervise"); } catch (e) { return say(e.message); }
    const c = s.cfg || { mode: "timer", minutes: 10 };
    const d = dlg("⚙️ مکاتباتِ کارشناس هوشمند", `<p class="sp-muted" style="margin-top:0">برای همهٔ گفت‌وگوهای کارشناس هوشمندِ شما.</p>
      <label class="sp-check sp-mode"><input type="radio" name="supm" value="timer" ${c.mode === "timer" ? "checked" : ""}> <b>⏱ با مهلت</b> — هر پیام و تصمیم اول به شما نشان داده می‌شود؛ «ارسال» یا «رد»، و بی‌پاسخ سرِ مهلت خودکار می‌رود.</label>
      <div class="sp-row" style="gap:8px;margin:4px 26px 10px"><span>مهلت</span><input class="tp-input num" data-supmin type="text" inputmode="numeric" maxlength="3" value="${c.minutes}" style="width:90px" dir="ltr" aria-label="مهلت به دقیقه"> <span>دقیقه (${fa(s.min || 1)} تا ${fa(s.max || 60)})</span></div>
      ${s.hold_ok ? `<label class="sp-check sp-mode"><input type="radio" name="supm" value="hold" ${c.mode === "hold" ? "checked" : ""}> <b>⏸ بی‌مهلت</b> — هر پیام و تصمیم منتظرِ «ارسال» یا «رد»ِ شما می‌ماند و هیچ‌وقت خودکار نمی‌رود.</label>` : ""}
      <label class="sp-check sp-mode"><input type="radio" name="supm" value="auto" ${c.mode === "auto" ? "checked" : ""}> <b>🤖 خودکار</b> — کارشناس هوشمند خودش مذاکره می‌کند و فقط وقتی جوابِ شما لازم است اعلان می‌دهد. پیشنهادهای معطل همین حالا می‌روند.</label>
      ${s.hold_ok ? `<p class="sp-muted" style="font-size:.84rem">«حالت کار»ِ نوع قلم هم اثر دارد و سخت‌گیرترینِ دو تا اجرا می‌شود: «کارشناس‌محور» همیشه بی‌مهلت و «ترکیبی» دست‌کم با مهلت.</p>` : ""}
      <div class="sp-err" data-err></div>`,
    [{ label: "ذخیره", cls: "primary", fn: async (dd) => {
      const mode = ($('input[name="supm"]:checked', dd) || {}).value || "timer";
      const r = await api("/me/supervise", { method: "PUT", body: { mode, minutes: TP.digits($("[data-supmin]", dd).value) } });
      await loadThread().catch(() => {});
      if (TP.ui && TP.ui.success) TP.ui.success(r.cfg.mode === "auto" ? `خودکار شد${r.sent ? ` — ${fa(r.sent)} پیشنهاد رفت` : ""}` : r.cfg.mode === "hold" ? "بی‌مهلت شد" : `با مهلتِ ${fa(r.cfg.minutes)} دقیقه`);
    } }, { label: "انصراف" }]);
    return d;
  }
  /* ⭐ امتیازِ یک پیام: سه ستاره و بیشتر همان لحظه؛ کمتر علت می‌خواهد */
  async function rateMsg(id, n) {
    const send = async (note, boxes) => {
      const r = await api("/sp/x/rate", { body: { kind: "msg", msg_id: id, stars: n, note, ...(boxes ? { boxes } : {}) } });
      S.d.rates.msgs[id] = { stars: r.stars, note: r.note, boxes: r.boxes || [] };
      repaintChat();
      if (TP.ui && TP.ui.success && !unrated()) TP.ui.success("همهٔ پیام‌ها امتیاز گرفتند ⭐");
    };
    if (n >= 3) return send("").catch((e) => say(e.message));
    const d = dlg(`⭐ ${fa(n)} ستاره — چه چیزِ این پیام درست نبود؟`, `<p class="sp-muted" style="margin-top:0">برای کمتر از سه ستاره علت لازم است؛ همین به کارشناس هوشمند می‌رسد تا دفعهٔ بعد بهتر بنویسد.</p>
      <textarea class="tp-input tp-textarea" data-why style="min-height:70px" placeholder="مثلاً لحنش تند بود، زود تخفیف خواست، پاسخ نداد…"></textarea>${boxPicker([], "کدام جزء درست نبود؟ (دست‌کم یکی)")}<div class="sp-err" data-err></div>`,
    [{ label: "ثبتِ امتیاز", cls: "primary", fn: async (dd) => {
      const w = $("[data-why]", dd).value.trim(); if (w.length < 3) throw new Error("علت را بنویسید.");
      const boxes = boxesFrom(dd); if (critique() && !boxes.length) throw new Error("دست‌کم یک جعبهٔ نقد بزنید.");
      await send(w, critique() ? boxes : null);
    } }, { label: "انصراف" }]);
    setTimeout(() => { const t = $("[data-why]", d); if (t) t.focus(); }, 30);
  }
  async function rateThread(btn) {
    const note = ($("[data-trate-note]") || {}).value || "", err = $("[data-trate-err]");
    if (!S.trate) { if (err) err.textContent = "ستاره‌ها را انتخاب کنید."; return; }
    if (note.trim().length < 3) { if (err) err.textContent = "نظرتان را بنویسید — اجباری است."; return; }
    if (btn) btn.disabled = true;
    try {
      const card = btn ? btn.closest(".ph-trate") : null, boxes = card ? boxesFrom(card) : [];
      const r = await api("/sp/x/rate", { body: { kind: "thread", thread_id: S.th, stars: S.trate, note, ...(critique() ? { boxes } : {}) } });
      S.d.rates.thread = { stars: r.stars, note: r.note, boxes: r.boxes || [] }; S.trate = 0; S.trateNote = null; S.trateEdit = false; S.tboxes = null;
      repaintChat(); if (TP.ui && TP.ui.success) TP.ui.success("امتیازِ مکاتبه ثبت شد ⭐");
    } catch (e) { if (btn) btn.disabled = false; if (err) err.textContent = e.message; }
  }
  /* فقط فهرستِ پیام‌ها دوباره رسم می‌شود، با همان جای اسکرول */
  function repaintChat() {
    const c = $("#chat"); if (!c) return render();
    const top = c.scrollTop; c.innerHTML = feedHtml(); c.scrollTop = top; bind();
  }
  async function act(bid, action) {
    const m = $(".sp-main"); S.mainScroll = m ? m.scrollTop : 0;
    if (action === "approve") {
      return dlg("تأیید مشخصات", `<p>مشخصات این بسته تأیید و از تأمین‌کننده پیش‌فاکتور خواسته شود؟</p><textarea class="tp-input tp-textarea" data-c placeholder="توضیح برای تأمین‌کننده (اختیاری)" style="min-height:70px"></textarea><div class="sp-err" data-err></div>`,
        [{ label: "تأیید و درخواست پیش‌فاکتور", cls: "primary", fn: (d) => decide(bid, "approve", { comment: $("[data-c]", d).value }) }, { label: "انصراف" }]);
    }
    if (action === "return" || action === "reject") {
      const ret = action === "return";
      return dlg(ret ? "برگرداندن با توضیح" : "رد", `<p>${ret ? "چه چیزی باید اصلاح شود؟ همین متن برای تأمین‌کننده فرستاده می‌شود و اقلام دوباره قابل ویرایش می‌شوند." : "این بسته رد شود؟ دلیل (اختیاری) برای تأمین‌کننده فرستاده می‌شود."}</p>
        <textarea class="tp-input tp-textarea" data-c style="min-height:90px"></textarea><div class="sp-err" data-err></div>`,
      [{ label: ret ? "برگرداندن" : "رد", cls: ret ? "warn" : "danger", fn: (d) => decide(bid, action, { comment: $("[data-c]", d).value }) }, { label: "انصراف" }]);
    }
    if (action === "ai") {
      return dlg("🤖 خوانش هوشمند پیش‌فاکتور", `<p>مدل پیش‌فاکتور را می‌خواند: هر سطرِ سند را از دریچهٔ نوع قلم و لایه‌های ویژگی می‌سنجد، مقدار، واحد و قیمت واحدِ هر قلم و شرایط فاکتور (زمان تحویل، تسویه، نوع فاکتور، ارزش افزوده، اعتبار) را برمی‌دارد و هر کدام را با بستهٔ تأمین‌کننده مقایسه می‌کند (✅ ⚠️ ⚪ ❌).</p>
        <p>انجام شود؟</p><div class="sp-err" data-err></div>`,
      [{ label: "بله، بخوان", cls: "primary", fn: async (d) => {
        $(".tp-body", d).insertAdjacentHTML("beforeend", `<p class="sp-muted">در حال خواندن پیش‌فاکتور… (چند ثانیه)</p>`);
        await api(`/sp/x/bundle/${bid}/ai`, { body: { confirm: true } });
        S.tab = "items"; await loadThread();
      } }, { label: "انصراف" }]);
    }
    if (action === "acceptall") {
      return dlg("تیکِ همهٔ غیرسبزها", "<p>برای همهٔ ردیف‌های ⚠️ ⚪ ❌ <b>پیش‌فاکتور به‌جای درخواست ملاک</b> شود؟ مقدار همیشه از سند است؛ آنچه سند نگفته خالی می‌ماند.</p><div class=\"sp-err\" data-err></div>",
        [{ label: "بله، پیش‌فاکتور ملاک", cls: "primary", fn: async () => { await api(`/sp/x/bundle/${bid}/accept`, { body: { all: true } }); await loadThread(); } }, { label: "انصراف" }]);
    }
    if (action === "final" && !S.pfRead) {
      /* فاز ۴: بی خوانش سند — مقدارهای خودِ تأمین‌کننده به تب استعلامات، Word تولیدی به پیش‌فاکتورها و پیامِ تشکر */
      return dlg("🏁 تأیید نهایی", `<p>پیشنهادِ این بسته با همان مقدارهایی که تأمین‌کننده ثبت کرده به تب استعلامات می‌رود، پیش‌فاکتورِ Word را سامانه می‌سازد و برای تأمین‌کننده پیامِ تأیید و تشکر می‌رود.</p>
        <textarea class="tp-input tp-textarea" data-c placeholder="توضیح برای تأمین‌کننده (اختیاری)" style="min-height:60px"></textarea><div class="sp-err" data-err></div>`,
      [{ label: "🏁 تأیید نهایی", cls: "primary", fn: async (d) => {
        const r = await api(`/sp/x/bundle/${bid}/decide`, { body: { action: "final", comment: $("[data-c]", d).value } });
        await afterDecide();
        say(`تأیید نهایی شد و ${fa(r.quote_ids.length)} قلم با مقدارهای تأمین‌کننده به تب استعلامات همین درخواست رفت (ثبت موقت و تیک «تأیید نهایی»)${r.gen ? "؛ پیش‌فاکتورِ Word سامانه هم در پیش‌فاکتورهای همان تب است" : "؛ پیش‌فاکتوری که خودتان برای این تأمین‌کننده گذاشته‌اید سرِ جایش ماند (یا انبار فایل وصل نیست)"}.`, "🏁 تأیید نهایی");
      } }, { label: "انصراف" }]);
    }
    if (action === "final") {
      const b = S.d.bundles.find((x) => x.id === bid) || {};
      const go = async () => {
        const r = await api(`/sp/x/bundle/${bid}/decide`, { body: { action: "final" } });
        await afterDecide();
        say(`تأیید نهایی شد و ${fa(r.quote_ids.length)} قلم با مقدارهای پیش‌فاکتور به تب استعلامات همین درخواست رفت${r.gaps && r.gaps.length ? `؛ این‌ها خالی ماند و آن خط‌ها «ثبت موقت» نشدند: ${r.gaps.join("، ")}` : " (ثبت موقت و تیک «تأیید نهایی»)"}.`, "🏁 تأیید نهایی");
      };
      if (b.ready && b.gaps && b.gaps.length) {
        return dlg("🏁 تأیید نهایی با جای خالی", `<p>با تیک‌هایی که زده‌اید این فیلدهای اجباری از پیش‌فاکتور خالی می‌مانند و خط استعلامِ آن اقلام «ثبت موقت» نمی‌شود:</p><p>${b.gaps.map(esc).join("<br>")}</p><p>ادامه می‌دهید؟</p><div class="sp-err" data-err></div>`,
          [{ label: "بله، تأیید نهایی", cls: "primary", fn: go }, { label: "انصراف" }]);
      }
      try { await go(); }
      catch (e) { say(`${e.message}\n\nهر ردیفِ غیرسبز را می‌توانید تیک بزنید (پیش‌فاکتور ملاک)؛ یا بسته را با توضیح برگردانید تا تأمین‌کننده پیش‌فاکتور کامل بفرستد.`, "هنوز نه"); }
    }
  }
  async function decide(bid, action, opts) {
    await api(`/sp/x/bundle/${bid}/decide`, { body: { action, ...opts } });
    await afterDecide();
  }
  async function afterDecide() { await loadList(); await loadThread(); }

  async function openUrl(path) {
    const w = inTg ? null : window.open("", "_blank");
    try {
      const d = await api(path);
      if (inTg && window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.openLink) window.Telegram.WebApp.openLink(d.url);
      else if (w) w.location = d.url; else location.href = d.url;
    } catch (e) { if (w) w.close(); say(e.message); }
  }

  /* --- پیش‌فاکتورِ سامانه (فاز ۴؛ worker/pfdoc.js): دیدن، چاپ به PDF و Word --- */
  async function pfDialog(bid) {
    let r;
    try { r = await api(`/sp/bundle/${bid}/proforma`); } catch (e) { return say(e.message); }
    const d = dlg(`📄 ${esc(r.name)}`, `<style>${r.css}</style><div class="sp-pfview">${r.html}</div><div class="sp-err" data-err></div>`, [
      { label: "🖨 چاپ یا ذخیرهٔ PDF", fn: () => { PH.printDoc(r.name, r.css, r.html, () => say("چاپ در این مرورگر باز نشد؛ فایل Word را بگیرید.")); return false; } },
      { label: "⬇️ Word", fn: async () => { await downloadDocx(bid, r.name); return false; } },
      { label: "بستن", cls: "primary" }]);
    d.classList.add("sp-pfmodal");
  }
  async function downloadDocx(bid, name) {
    const base = (window.TAMIN_POSHTIBANI_CONFIG || {}).apiBase || "/tamin-poshtibani/api";
    const res = await fetch(`${base}/sp/bundle/${bid}/proforma?format=docx`, { headers: { ...TP.authHeaders(), ...(inTg ? { "X-TG-Init": tgData } : {}) } });
    if (!res.ok) { let m = `خطای سرور ${res.status}`; try { m = (await res.json()).error || m; } catch (_) { /* بی بدنه */ } throw new Error(m); }
    PH.saveBlob(await res.blob(), `${name || `پیش‌فاکتور — بستهٔ ${bid}`}.docx`);
  }

  async function connectTg() {
    if (!S.bot) return say("بات مکاتبات هنوز روی سامانه فعال نشده است.");
    const w = window.open("", "_blank");
    try { const r = await api("/sp/x/tglink", { body: {} }); if (w) w.location = r.url; else location.href = r.url; }
    catch (e) { if (w) w.close(); say(e.message); }
  }

  /* --- «ارسال استعلام» از همین صفحه: فقط تأمین‌کنندهٔ واقعی با نام و شماره — «🧪 تأمین‌کنندهٔ فرضی» برداشته شد (مهر ۱۴۰۵) --- */
  async function sendDialog() {
    const g = S.reqs.find((x) => x.assignment_id === S.aid);
    const items = (await api(`/sp/x/items?aid=${S.aid}`)).items || [];
    if (!items.length) return say("در این درخواست قلم بازی نمانده است.");
    const body = `<p class="sp-muted">درخواست ${esc(g.request_id)} — ${esc(g.party || "")}</p>
      <b>اقلام</b><div class="sp-modal-list">${items.map((i, n) => `<label><input type="checkbox" data-it="${i.id}" ${n === 0 ? "checked" : ""}> ${esc(i.title)} — ${qty(i.qty)} ${esc(i.unit || "")}${i.locked ? ` <span title="قبلاً برای تأمین‌کنندهٔ دیگری رفته؛ عنوان، لایه‌ها، مقدار و واحدش قفل است و عیناً همان می‌رود">🔒</span>` : ""}</label>`).join("")}</div>
      ${items.some((i) => i.locked) ? `<p class="sp-muted">🔒 یعنی آن قلم برای تأمین‌کنندهٔ دیگری فرستاده شده و بسته‌اش قفل است: برای همه عیناً همان عنوان، لایه‌های ویژگی، مقدار و واحد می‌رود.</p>` : ""}
      <b style="display:block;margin-top:10px">تأمین‌کننده</b>
      <div class="sp-upl"><input class="tp-input" data-n placeholder="نام تأمین‌کننده" autocomplete="off"><input class="tp-input" data-p placeholder="شماره (09…)" inputmode="tel" dir="ltr">
        <input class="tp-input full" data-l placeholder="برچسب شماره (همراه، دفتر، فروش…)"></div>
      <b style="display:block;margin-top:10px">متن پیام (اولِ پیامک و اولین پیامِ گفت‌وگو)</b>
      <textarea class="tp-input tp-textarea" data-t style="min-height:90px">سلام، از شرکت تونل سد آریانا.\nبرای اقلامی که در پنل می‌بینید استعلام قیمت داریم؛ ${S.pfRead ? "لطفاً مشخصات، قیمت و پیش‌فاکتور را از لینک زیر ثبت کنید." : "لطفاً قیمت و شرایط را از لینک زیر ثبت کنید؛ پیش‌فاکتور را خودِ سامانه از همان‌ها می‌سازد."}\n${esc((S.me && (S.me.label || S.me.name)) || "")}</textarea>
      <div class="sp-err" data-err></div>`;
    const d = dlg("📨 ارسال استعلام", body, [{ label: "ارسال", cls: "primary", fn: async (dd) => {
      const ids = $$("[data-it]", dd).filter((x) => x.checked).map((x) => +x.dataset.it);
      if (!ids.length) throw new Error("دست‌کم یک قلم را تیک بزنید.");
      const name = $("[data-n]", dd).value.trim(), phone = $("[data-p]", dd).value.trim();
      if (!name) throw new Error("نام تأمین‌کننده را بنویسید.");
      if (!phone) throw new Error("شمارهٔ تأمین‌کننده را بنویسید (مثل 09121234567).");
      const r = await api("/sp/x/send", { body: { assignment_id: S.aid, item_ids: ids, text: $("[data-t]", dd).value, supplier_name: name, phone, label: $("[data-l]", dd).value } });
      S.th = r.thread_id; S.view = "chat"; S.tab = "chat";
      await loadList(); await loadThread();
      smsDialog(r);
    } }, { label: "انصراف" }]);
    $("[data-n]", d).focus();
    $("[data-n]", d).onchange = async () => {
      const name = $("[data-n]", d).value.trim(); if (!name) return;
      try {
        const r = await api(`/sp/x/phones?name=${encodeURIComponent(name)}`);
        if (r.phones.length && !$("[data-p]", d).value) { $("[data-p]", d).value = r.phones[0].phone; $("[data-l]", d).value = r.phones[0].label || ""; }
      } catch (_) { /* پیشنهاد است، نه شرط */ }
    };
  }
  function smsDialog(r) {
    /* پیامکِ واقعی (درگاه پیامک — TextBee یا IPPanel) رفت: رمزِ ورودِ تأمین‌کننده فقط در گوشیِ خودش است و این‌جا نشان داده نمی‌شود */
    if (r.sms.sent) return dlg("📱 پیامک فرستاده شد", `<p class="sp-muted">${esc(r.sms.note || "")} لینک پنل، لینک بات و رمز ورود فقط در همان پیامک است؛ گفت‌وگو و پاسخ‌های تأمین‌کننده همین‌جا می‌آید.</p>`);
    dlg("📱 پیامک شبیه‌سازی‌شده", `<p class="sp-muted">${r.sms.error ? `⚠️ پیامکِ واقعی نرفت: ${esc(r.sms.error)}. ` : "پیامک فعلاً خاموش است؛ "}همین متن به‌جای پیامک برای ${esc(r.sms.to)} (${esc(r.sms.label || "—")}) است. لینک‌ها واقعی‌اند — برای دیدن سمت تأمین‌کننده بازشان کنید.</p>
      <div class="sp-sms">${esc(r.sms.text)}</div>
      <div class="sp-row" style="margin-top:10px"><a class="tp-btn sm" href="${esc(r.links.panel)}" target="_blank" rel="noopener">🌐 پنل تأمین‌کننده</a>${r.links.bot ? `<a class="tp-btn sm" href="${esc(r.links.bot)}" target="_blank" rel="noopener">🤖 بات تأمین‌کننده</a>` : ""}</div>`);
  }

  /* ---------- تازه‌سازی ---------- */
  function addMsgs(list) {
    const fresh = (list || []).filter((m) => m.id > S.lastMsg);
    if (!fresh.length) return;
    S.d.msgs.push(...fresh); S.lastMsg = fresh[fresh.length - 1].id;
    const c = $("#chat");
    if (c) {
      /* گروه‌بندی و دُمِ حباب‌ها به پیامِ قبلی بسته است، پس فهرست از نو رسم می‌شود؛ اگر کاربر بالاتر را می‌خواند
         سرِ جایش می‌ماند، مگر پیامِ تازه از خودِ ما باشد */
      const atEnd = c.scrollHeight - c.scrollTop - c.clientHeight < 90;
      c.innerHTML = feedHtml();
      if (atEnd || fresh.some((m) => m.who === "e")) c.scrollTop = c.scrollHeight;
      bind();
    } else {
      /* روی «اقلام و تصمیم‌ها»ی صفحهٔ باریک هستیم: دکمهٔ برگشت به گفت‌وگو شمارِ تازه‌ها را نشان می‌دهد */
      const n = fresh.filter((m) => m.who !== "e").length;
      if (n) { S.unseen += n; const t = $('[data-tab="chat"]'); if (t) t.innerHTML = `→ گفت‌وگو${badge(S.unseen)}`; }
    }
  }
  let timer = null, tick = 0;
  function startPoll() { if (timer) clearInterval(timer); timer = setInterval(poll, 5000); }
  async function poll() {
    if (document.hidden || S.busy || document.querySelector(".tp-modal-bg")) return;
    onPhoneMode(); /* پشتیبانِ رویدادِ change در جاهایی که نمی‌رسد (پنجرهٔ پس‌زمینه) */
    S.busy = true;
    try {
      if (S.th && S.d) {
        const r = await api(`/sp/poll?t=${S.th}&since=${S.lastMsg}`);
        addMsgs(r.msgs);
        const typing = document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName);
        /* «👁 با تأیید»: پیشنهادِ تازه یا کنار رفته هم گفت‌وگو را دوباره می‌خواند */
        if ((r.rev !== S.rev || (r.prop != null && r.prop !== S.propSig)) && !typing) {
          const m = $(".sp-main"), c = $("#chat"); S.mainScroll = m ? m.scrollTop : 0;
          S.chatPos = c && c.scrollHeight - c.scrollTop - c.clientHeight > 90 ? c.scrollTop : null;
          const keep = S.unseen; await loadThread(); S.unseen = phoneMode || S.tab === "chat" ? 0 : keep;
        } else if (r.neg != null && S.d && r.neg !== S.negSig) {
          /* «🧭 مذاکره»: کارشناس هوشمند دورِ تازه زد یا حالتِ گفت‌وگو عوض شد — فقط همان کارت تازه می‌شود */
          await refreshNeg().catch(() => {});
        }
      }
      const ck = $(".ph-clock"); if (ck) ck.textContent = clock();
      if (++tick % 4 === 0) await refreshLists();
    } catch (e) {
      if (e.status === 401 && !inTg) { clearInterval(timer); TP.session.clear(); renderLogin("نشست شما تمام شده است؛ دوباره وارد شوید."); }
      else if (e.status === 423 && S.th) await shut(e.message);
    }
    S.busy = false;
  }

  boot();
})();
