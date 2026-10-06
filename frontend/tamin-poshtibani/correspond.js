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
   ورود: کد کارشناس یا initData مینی‌اپ.
   ============================================================ */
(function () {
  "use strict";
  const TP = window.TP;
  const app = document.getElementById("app");
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = TP.esc;
  const FA = "۰۱۲۳۴۵۶۷۸۹";
  const fa = (s) => String(s == null ? "" : s).replace(/\d/g, (d) => FA[+d]);
  const money = (n) => (n == null || !isFinite(n) ? "—" : fa(Math.round(Number(n)).toLocaleString("en-US")).replace(/,/g, "٬"));
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

  const S = { me: null, reqs: [], unread: 0, waiting: 0, asks: 0, aid: +ss.get("sp.aid") || null, th: +ss.get("sp.th.e") || null, d: null, tab: "chat", view: "req",
    lastMsg: 0, rev: -1, bot: null, via: "web", demoName: "", busy: false, termFa: {}, unseen: 0, goto: null, drafts: {} };
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
  function top() {
    return `<header class="tp-top"><div class="brand"><img src="../assets/logo-new.jpg" alt=""><div><h1>مکاتبات با تأمین‌کنندگان</h1>
      <div class="sub">${S.me ? `${esc(S.me.label || S.me.name)} · ` : ""}دموی پنل تأمین‌کننده</div></div></div><span class="spacer"></span>
      ${S.me && S.via !== "telegram" ? `<button class="tp-btn sm" data-tg>💬 بات مکاتبات</button>` : ""}
      ${TP.themeBtn()}${S.me && !spApp ? `<a class="tp-back" href="expert.html">پنل کارشناس</a>` : ""}</header>`;
  }
  function renderLogin(msg) {
    app.classList.remove("sp-app");
    app.innerHTML = `${top()}<div class="sp-center"><div class="sp-box"><h2>ورود کارشناس</h2><p class="lead">همان کد ورود پنل کارشناس.</p>
      <input class="tp-input" id="code" inputmode="numeric" placeholder="کد ورود" style="width:100%"><div class="sp-row" style="margin-top:12px"><button class="tp-btn primary sp-grow" id="go">ورود</button></div>
      <div class="sp-err" id="msg">${esc(msg || "")}</div></div></div>`;
    const go = async () => {
      try { const r = await TP.api("/login", { body: { code: TP.digits ? TP.digits($("#code").value).trim() : $("#code").value.trim() } }); TP.session.set(r.expert); boot(); }
      catch (e) { $("#msg").textContent = e.message; }
    };
    $("#go").onclick = go; $("#code").onkeydown = (e) => { if (e.key === "Enter") go(); }; $("#code").focus();
  }

  /* ---------- بارگذاری ---------- */
  async function loadList() {
    const d = await api("/sp/x/threads");
    S.reqs = d.requests || []; S.unread = d.unread; S.waiting = d.waiting; S.asks = d.asks || 0; S.me = d.me; S.bot = d.bot; S.via = d.via; S.demoName = d.demo; S.termFa = d.term_fa || S.termFa;
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
        onAsks: (k) => { if (k !== S.asks) refreshLists().catch(() => {}); } });
    } catch (e) {
      if (e.status === 401 && !inTg) { TP.session.clear(); return renderLogin(e.message); }
      app.innerHTML = `${top()}<div class="sp-center"><div class="sp-box"><h2>نشد</h2><p class="sp-err">${esc(e.message)}</p></div></div>`;
    }
  }
  function findThread(id) { for (const g of S.reqs) for (const t of g.threads) if (t.id === id) return { g, t }; return null; }
  /** باز کردنِ یک گفت‌وگو — از فهرستِ تأمین‌کنندگان یا از اعلانِ گوشهٔ صفحه؛ پیش‌نویسِ گفت‌وگوی قبلی می‌ماند */
  function openThread(id) {
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
    const f = findThread(S.th); if (f) { S.unread -= f.t.unread; f.g.unread -= f.t.unread; f.t.unread = 0; S.aid = f.g.assignment_id; }
    ss.set("sp.th.e", String(S.th)); ss.set("sp.aid", String(S.aid || ""));
    render();
  }

  /* ---------- رسم ---------- */
  const badge = (n, cls) => (n ? `<span class="sp-badge ${cls || ""}">${fa(n)}</span>` : "");
  function reqList() {
    const withT = S.reqs.filter((g) => g.threads.length), rest = S.reqs.filter((g) => !g.threads.length);
    const item = (g) => `<button class="sp-item ${S.aid === g.assignment_id ? "on" : ""}" data-aid="${g.assignment_id}">
      <div class="t"><span>${esc(g.request_id)}</span>${g.asks ? `<span class="sp-badge ask" title="کارشناس هوشمند در این درخواست از شما سؤال دارد">🚨 ${fa(g.asks)}</span>` : ""}${badge(g.unread)}${badge(g.waiting, "wait")}</div>
      <div class="m">${esc(g.party || "")}${g.threads.length ? ` · ${fa(g.threads.length)} تأمین‌کننده` : ` · ${fa(g.open_items)} قلم باز`}</div></button>`;
    return (withT.map(item).join("") || `<div class="sp-empty">هنوز گفت‌وگویی نیست.</div>`)
      + (rest.length ? `<div class="sp-muted" style="padding:8px 12px">درخواست‌های باز بدون گفت‌وگو</div>${rest.map(item).join("")}` : "");
  }
  function supList() {
    const g = S.reqs.find((x) => x.assignment_id === S.aid);
    if (!g) return `<div class="sp-empty">یک درخواست را انتخاب کنید.</div>`;
    if (!g.threads.length) return `<div class="sp-empty">برای این درخواست هنوز به تأمین‌کننده‌ای استعلام نرفته است.</div>`;
    return g.threads.map((t) => t.ai === "locked"
      ? `<button class="sp-item sp-ai-lock" data-th-lock="${t.id}" title="گفت‌وگوی کارشناس هوشمند — برای شما بسته است">
      <div class="t"><span>🔒 ${esc(t.supplier)}</span>${t.demo ? `<span class="sp-tag">فرضی</span>` : ""}</div>
      <div class="m">🤖 دستِ کارشناس هوشمند · ${fa(t.lines)} قلم</div></button>`
      : `<button class="sp-item ${S.th === t.id ? "on" : ""} ${t.ai === "ask" ? "sp-ask" : ""}" data-th="${t.id}">
      <div class="t"><span>${t.ai === "ask" ? "🚨 " : ""}${esc(t.supplier)}</span>${t.demo ? `<span class="sp-tag">فرضی</span>` : ""}${badge(t.unread)}${badge(t.waiting, "wait")}</div>
      <div class="m">${t.ai === "ask" ? `🤖 سؤال: ${esc(t.ask || "")}` : `📞 ${esc(t.phone || "")}${t.phone_label ? ` (${esc(t.phone_label)})` : ""} · ${fa(t.lines)} قلم`}</div></button>`).join("");
  }
  function render() {
    const g = S.reqs.find((x) => x.assignment_id === S.aid);
    /* پیش‌نویسِ نیمه‌کارهٔ هر گفت‌وگو با رسمِ دوباره (تغییر پهنا، تصمیم روی بسته) پاک نمی‌شود */
    const was = $("#msgIn"); if (was && was.dataset.draft) S.drafts[was.dataset.draft] = was.value;
    const on = !!(S.th && S.d);
    const screenInMain = !phoneMode && on && S.tab !== "items";
    const main = !on ? `<div class="sp-empty" style="margin-top:12vh">یک تأمین‌کننده را انتخاب کنید.<br><span class="sp-muted">${phoneMode ? "گفت‌وگو در گوشیِ کنار صفحه و اقلام و تصمیم‌ها همین‌جا می‌آیند." : "پیام‌ها، اقلام و تصمیم‌ها این‌جا می‌آیند."}</span></div>`
      : screenInMain ? screen(false) : convo();
    app.classList.add("sp-app");
    app.innerHTML = `${top()}<div class="sp-full"><div class="sp-cols ${phoneMode ? "ph-mode" : ""}" data-view="${S.view}">
      <aside class="sp-col reqs"><h4>درخواست‌ها ${S.asks ? `<span class="sp-badge ask" title="«پرسش از کارشناس»های بی‌پاسخ">🚨 ${fa(S.asks)}</span>` : ""}${badge(S.unread)}${badge(S.waiting, "wait")}</h4><div class="scroll" data-reqs>${reqList()}</div></aside>
      <aside class="sp-col sups"><h4><button class="tp-btn xs sp-back" data-back="req" aria-label="بازگشت به درخواست‌ها">→</button>${g ? `تأمین‌کنندگانِ ${esc(g.request_id)}` : "تأمین‌کنندگان"}</h4>
        <div class="scroll" data-sups>${supList()}</div>${g && g.open_items ? `<div class="sp-colfoot"><button class="tp-btn primary sm" data-send>➕ ارسال استعلام</button></div>` : ""}</aside>
      <section class="sp-main ${screenInMain ? "is-screen" : ""}">${main}</section>
      ${phoneMode ? `<section class="ph-stage"><div class="ph"><img class="ph-frame" src="phone-frame.svg" alt="" draggable="false">${screen(true)}</div></section>` : ""}
    </div></div>`;
    bind();
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
  const waitingCount = () => S.d.bundles.filter((b) => ["pending", "proforma"].includes(b.state)).length;
  /** اقلام و تصمیم‌ها: در چیدمانِ گوشی ستونِ وسط؛ در صفحهٔ باریک جای گفت‌وگو با دکمهٔ برگشت به آن */
  function convo() {
    const th = S.d.thread;
    const back = phoneMode ? "" : `<button class="tp-btn sm" data-tab="chat" title="برگشت به گفت‌وگو">→ گفت‌وگو${badge(S.unseen)}</button>`;
    return `<div class="sp-conv"><div class="sp-head ${phoneMode ? "" : "sp-sticky"}">${back}<h3>${esc(th.supplier)}</h3>${th.demo ? `<span class="sp-tag">تأمین‌کنندهٔ فرضی</span>` : ""}
      <span class="sp-muted">📞 ${esc(th.phone || "")}${th.phone_label ? ` (${esc(th.phone_label)})` : ""} · درخواست ${esc(th.request_id)}</span></div>
      <div id="pane">${itemsPane()}</div></div>`;
  }

  /* --- گفت‌وگو به سبک پیام‌رسانِ iOS 26 (ph-chat.js): پیامِ ما (کارشناس و کارشناس هوشمند) سمت راست و آبیِ لوگو، پیامِ
     تأمین‌کننده سمت چپ و طوسیِ خیلی کمرنگ؛ پیامِ صوتیِ تأمین‌کننده با پخش و متنِ پیاده‌شده‌اش (فقط همین‌جا — تأمین‌کننده
     متن را نمی‌بیند)؛ رخدادِ بسته و قلم کارتی است که کلیکش به همان بسته یا قلم در «اقلام و تصمیم‌ها» می‌رود --- */
  /** «🚨 پرسش از کارشناس»: سؤال و راهنما در انتهای گفت‌وگو، درست بالای کادرِ پیام */
  const askOf = () => (S.d && S.d.thread.ai && S.d.thread.ai.ask) || null;
  const askNote = () => { const k = askOf(); return k ? `<div class="ph-ask" role="note"><b>🚨 کارشناس هوشمند از شما می‌پرسد</b>${esc(k.q)}<i>پاسخ را همین پایین بنویسید؛ برای ${esc(S.d.thread.supplier)} هم فرستاده می‌شود و بعدش گفت‌وگو دوباره دستِ کارشناس هوشمند است.</i></div>` : ""; };
  const feedHtml = () => msgsHtml() + askNote();
  const msgsHtml = () => PH.feed(S.d.msgs, {
    mine: (m) => m.who === "e",
    ai: (m) => !!(m.meta && m.meta.ai), /* پیامِ کارشناس هوشمند (worker/ai-agent.js) */
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
        start: framed ? "" : `<button class="ph-glass ph-circ" data-back="sup" aria-label="بازگشت به تأمین‌کنندگان" title="بازگشت به تأمین‌کنندگان">${I.back}</button>`,
        title: th.supplier, initial: String(th.supplier || "").replace(/^(تأمین‌کنندهٔ|شرکت|فروشگاه)\s+/, "").trim()[0] || "؟",
        whoAttrs: "data-items", whoTitle: `${th.supplier} · 📞 ${th.phone || ""} · درخواست ${th.request_id}`,
        acts: `<button class="ph-glass ph-circ" data-clear-chat aria-label="پاک کردن گفت‌وگو" title="پاک کردن گفت‌وگو — فقط از صفحهٔ شما">${I.erase}</button>
          <button class="ph-glass ph-circ" data-items aria-label="اقلام و تصمیم‌ها${waiting ? ` — ${fa(waiting)} بسته منتظر تصمیم` : ""}" title="اقلام و تصمیم‌ها">${I.box}${waiting ? `<b class="ph-dot">${fa(waiting)}</b>` : ""}</button>`,
      },
      composer: { placeholder: askOf() ? "پاسخ به پرسشِ کارشناس هوشمند" : `پیام به ${th.supplier}`, draft: S.th },
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
  function bundleCard(b, byId) {
    const ls = b.line_ids.map((id) => byId.get(id)).filter(Boolean);
    const sum = ls.reduce((s, l) => s + (l.total || 0), 0);
    let h = `<div class="sp-bundle" data-b="${b.id}"><header><b>بستهٔ ${fa(b.id)}</b><span class="sp-st ${b.state}">${esc(b.state_fa)}</span><span class="sp-muted">${when(b.created_at)}</span></header>
      <div class="sp-scroll"><table class="sp-table"><thead><tr><th class="t">قلم</th><th>مقدار</th><th>قیمت واحد (ریال)</th><th>قیمت کل (ریال)</th></tr></thead><tbody>
      ${ls.map((l) => `<tr><td class="t">${code(l)}${esc(l.title)}${l.extra.length ? `<div class="sp-muted">➕ ${l.extra.map((x) => `${esc(x.k)}: ${esc(x.v)}`).join("، ")}</div>` : ""}${fileLinks(l.id) ? `<div>${fileLinks(l.id)}</div>` : ""}</td>
        <td>${qty(l.qty)} ${esc(l.unit || "")}</td><td>${money(l.price)}</td><td>${money(l.total)}</td></tr>`).join("")}
      </tbody><tfoot><tr><td class="t">جمع</td><td></td><td></td><td>${money(sum)}</td></tr></tfoot></table></div>`;
    if (termsLine(b.terms)) h += `<div class="sp-muted" style="margin-top:4px">🧾 شرایط اعلامی: ${esc(termsLine(b.terms))}</div>`;
    if (b.comment) h += `<div class="sp-comment">${esc(b.comment)}</div>`;
    if (b.pf) h += `<div class="sp-row" style="margin-top:6px">📄 پیش‌فاکتور: <b>${esc(b.pf.name || "")}</b><button class="tp-btn xs" data-pf="${b.id}">👁 دیدن</button></div>`;
    if (b.ai && b.state === "proforma") h += matchTable(b);
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
        ${b.ai ? "" : `<div class="sp-muted">برای پر شدنِ همهٔ فیلدهای اجباری از پیش‌فاکتور و جدول تطابق، «خوانش هوشمند» را بزنید — تأیید نهایی بدون آن ممکن نیست.</div>`}`;
    }
    return h + `</div>`;
  }
  function countOpen(b) {
    let n = 0;
    for (const ln of b.ai.lines || []) for (const row of ln.rows || []) if (acceptable(row) && !(b.accept || {})[`${ln.line_id}|${row.key}`]) n++;
    for (const row of b.ai.header || []) if (acceptable(row) && !(b.accept || {})[`h|${row.key}`]) n++;
    return n;
  }
  function itemsPane() {
    const d = S.d, byId = new Map(d.lines.map((l) => [l.id, l]));
    const open = d.bundles.filter((b) => ["pending", "approved", "proforma"].includes(b.state)).reverse();
    const done = d.bundles.filter((b) => !["pending", "approved", "proforma"].includes(b.state)).reverse();
    let h = open.length ? `<h3 class="sp-h3">منتظر تصمیم شما</h3>${open.map((b) => bundleCard(b, byId)).join("")}` : `<div class="tp-note">بسته‌ای منتظر تصمیم نیست.</div>`;
    h += `<h3 class="sp-h3">همهٔ اقلام این گفت‌وگو</h3>`;
    if (termsLine(d.thread.terms)) h += `<div class="sp-muted" style="margin-bottom:8px">🧾 شرایطِ فاکتورِ اعلامیِ تأمین‌کننده: ${esc(termsLine(d.thread.terms))}</div>`;
    h += d.lines.slice().sort((a, b) => b.id - a.id).map((l) => `<div class="sp-card" data-no="${l.no || ""}"><header><h3>${code(l)}${esc(l.title)}</h3><span class="sp-st ${l.state}">${esc(l.state_fa)}</span></header>
      <div class="sp-chips">${l.head ? `<span class="sp-chip lock"><i>نوع قلم:</i> ${esc(l.head)}</span>` : ""}${l.layers.map((x) => `<span class="sp-chip lock">🔒 <i>${esc(x.k)}:</i> ${esc(x.v)}</span>`).join("")}${l.extra.map((x) => `<span class="sp-chip add">➕ <i>${esc(x.k)}:</i> ${esc(x.v)}</span>`).join("")}</div>
      <div class="sp-row" style="margin-top:8px">${qty(l.qty)} ${esc(l.unit || "")} × ${money(l.price)} ریال = <b>${money(l.total)}</b> ریال <span class="sp-muted">(خواسته: ${qty(l.req_qty)} ${esc(l.req_unit || "")})</span></div>
      ${l.note ? `<div class="sp-muted">توضیح تأمین‌کننده: ${esc(l.note)}</div>` : ""}${fileLinks(l.id) ? `<div style="margin-top:6px">${fileLinks(l.id)}</div>` : ""}
      ${l.quote_id ? `<div class="sp-ok">✓ با مقدارهای پیش‌فاکتور در تب استعلامات است.</div>` : ""}</div>`).join("");
    if (done.length) h += `<h3 class="sp-h3">تصمیم‌های قبلی</h3>${done.map((b) => bundleCard(b, byId)).join("")}`;
    return h;
  }

  /* ---------- رفتار ---------- */
  function bind() {
    $$("[data-aid]").forEach((b) => { b.onclick = () => { S.aid = +b.dataset.aid; S.view = "sup"; ss.set("sp.aid", String(S.aid)); render(); }; });
    $$("[data-th]").forEach((b) => { b.onclick = () => openThread(+b.dataset.th); });
    $$("[data-th-lock]").forEach((b) => { b.onclick = () => say("این گفت‌وگو را کارشناس هوشمند پیش می‌برد و تا وقتی تیکِ شما در «پنل پشتیبانی» روی «🤖 هوشمند» است برای شما بسته است.\nاگر سؤالی از شما داشته باشد همین‌جا با 🚨 باز می‌شود و در تلگرام هم خبر می‌دهد.", "🔒 گفت‌وگوی کارشناس هوشمند"); });
    $$("[data-back]").forEach((b) => { b.onclick = () => { S.view = b.dataset.back; render(); }; });
    $$("[data-tab]").forEach((b) => { b.onclick = () => { S.tab = b.dataset.tab; S.mainScroll = 0; render(); }; });
    const tg = $("[data-tg]"); if (tg) tg.onclick = connectTg;
    const snd = $("[data-send]"); if (snd) snd.onclick = () => sendDialog().catch((e) => say(e.message));
    $$("[data-file]").forEach((b) => { b.onclick = () => openUrl(`/sp/file/${b.dataset.file}/url`); });
    $$("[data-pf]").forEach((b) => { b.onclick = () => openUrl(`/sp/bundle/${b.dataset.pf}/pf-url`); });
    $$("[data-act]").forEach((b) => { b.onclick = () => act(+b.closest("[data-b]").dataset.b, b.dataset.act); });
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
    const goto = (sel) => { if (phoneMode) return jumpTo(sel); S.tab = "items"; S.goto = sel; render(); };
    const press = (el, fn) => { el.onclick = (e) => { e.stopPropagation(); fn(); }; el.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } }; };
    $$("[data-goto-b]").forEach((el) => press(el, () => goto(`[data-b="${el.dataset.gotoB}"]`)));
    $$("[data-goto-no]").forEach((el) => press(el, () => goto(`[data-no="${el.dataset.gotoNo}"]`)));
    /* 📦 و نامِ تأمین‌کننده بالای گفت‌وگو: اقلام و تصمیم‌ها — اولین بستهٔ منتظر تصمیم، وگرنه سرِ همان ستون */
    $$("[data-items]").forEach((el) => {
      el.onclick = () => {
        if (!phoneMode) { S.tab = "items"; S.mainScroll = 0; return render(); }
        const open = S.d && S.d.bundles.filter((b) => ["pending", "approved", "proforma"].includes(b.state)).pop();
        if (open) return jumpTo(`[data-b="${open.id}"]`);
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
        try { const r = await api(`/sp/thread/${S.th}/msg`, { body: { text } }); inp.value = ""; S.drafts[S.th] = ""; addMsgs(r.msgs); } catch (e) { if (e.status === 423) return shut(e.message); say(e.message); }
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

  async function connectTg() {
    if (!S.bot) return say("بات مکاتبات هنوز روی سامانه فعال نشده است.");
    const w = window.open("", "_blank");
    try { const r = await api("/sp/x/tglink", { body: {} }); if (w) w.location = r.url; else location.href = r.url; }
    catch (e) { if (w) w.close(); say(e.message); }
  }

  /* --- «ارسال استعلام» از همین صفحه --- */
  async function sendDialog() {
    const g = S.reqs.find((x) => x.assignment_id === S.aid);
    const items = (await api(`/sp/x/items?aid=${S.aid}`)).items || [];
    if (!items.length) return say("در این درخواست قلم بازی نمانده است.");
    const body = `<p class="sp-muted">درخواست ${esc(g.request_id)} — ${esc(g.party || "")}</p>
      <b>اقلام</b><div class="sp-modal-list">${items.map((i, n) => `<label><input type="checkbox" data-it="${i.id}" ${n === 0 ? "checked" : ""}> ${esc(i.title)} — ${qty(i.qty)} ${esc(i.unit || "")}${i.locked ? ` <span title="قبلاً برای تأمین‌کنندهٔ دیگری رفته؛ عنوان، لایه‌ها، مقدار و واحدش قفل است و عیناً همان می‌رود">🔒</span>` : ""}</label>`).join("")}</div>
      ${items.some((i) => i.locked) ? `<p class="sp-muted">🔒 یعنی آن قلم برای تأمین‌کنندهٔ دیگری فرستاده شده و بسته‌اش قفل است: برای همه عیناً همان عنوان، لایه‌های ویژگی، مقدار و واحد می‌رود.</p>` : ""}
      <b style="display:block;margin-top:10px">تأمین‌کننده</b>
      <label class="sp-check"><input type="radio" name="who" value="demo" checked> 🧪 ${esc(S.demoName)} — پیامکش (شبیه‌سازی) همین‌جا نشان داده می‌شود</label>
      <label class="sp-check"><input type="radio" name="who" value="real"> تأمین‌کنندهٔ دیگر:</label>
      <div class="sp-upl" data-real style="opacity:.5"><input class="tp-input" data-n placeholder="نام تأمین‌کننده"><input class="tp-input" data-p placeholder="شماره (09…)" inputmode="tel">
        <input class="tp-input full" data-l placeholder="برچسب شماره (همراه، دفتر، فروش…)"></div>
      <b style="display:block;margin-top:10px">متن پیام (اولِ پیامک و اولین پیامِ گفت‌وگو)</b>
      <textarea class="tp-input tp-textarea" data-t style="min-height:90px">سلام، از شرکت تونل سد آریانا.\nبرای اقلامی که در پنل می‌بینید استعلام قیمت داریم؛ لطفاً مشخصات، قیمت و پیش‌فاکتور را از لینک زیر ثبت کنید.\n${esc((S.me && (S.me.label || S.me.name)) || "")}</textarea>
      <div class="sp-err" data-err></div>`;
    const d = dlg("📨 ارسال استعلام", body, [{ label: "ارسال", cls: "primary", fn: async (dd) => {
      const ids = $$("[data-it]", dd).filter((x) => x.checked).map((x) => +x.dataset.it);
      if (!ids.length) throw new Error("دست‌کم یک قلم را تیک بزنید.");
      const demo = $('input[name="who"]:checked', dd).value === "demo";
      const b = { assignment_id: S.aid, item_ids: ids, text: $("[data-t]", dd).value, demo };
      if (!demo) Object.assign(b, { supplier_name: $("[data-n]", dd).value, phone: $("[data-p]", dd).value, label: $("[data-l]", dd).value });
      const r = await api("/sp/x/send", { body: b });
      S.th = r.thread_id; S.view = "chat"; S.tab = "chat";
      await loadList(); await loadThread();
      smsDialog(r);
    } }, { label: "انصراف" }]);
    $$('input[name="who"]', d).forEach((x) => { x.onchange = () => { $("[data-real]", d).style.opacity = $('input[name="who"]:checked', d).value === "real" ? 1 : 0.5; }; });
    $("[data-n]", d).onchange = async () => {
      const name = $("[data-n]", d).value.trim(); if (!name) return;
      try {
        const r = await api(`/sp/x/phones?name=${encodeURIComponent(name)}`);
        if (r.phones.length && !$("[data-p]", d).value) { $("[data-p]", d).value = r.phones[0].phone; $("[data-l]", d).value = r.phones[0].label || ""; }
      } catch (_) { /* پیشنهاد است، نه شرط */ }
    };
  }
  function smsDialog(r) {
    /* پیامکِ واقعی (TextBee) رفت: رمزِ ورودِ تأمین‌کننده فقط در گوشیِ خودش است و این‌جا نشان داده نمی‌شود */
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
        if (r.rev !== S.rev && !typing) {
          const m = $(".sp-main"), c = $("#chat"); S.mainScroll = m ? m.scrollTop : 0;
          S.chatPos = c && c.scrollHeight - c.scrollTop - c.clientHeight > 90 ? c.scrollTop : null;
          const keep = S.unseen; await loadThread(); S.unseen = phoneMode || S.tab === "chat" ? 0 : keep;
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
