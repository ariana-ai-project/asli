/* ============================================================
   تبِ «🔨 مناقصه» در پنل پشتیبانی (مهر ۱۴۰۵، درخواست مالک) — ساخت، دعوت و پایشِ زندهٔ مزایدهٔ معکوس
   • فهرستِ مناقصه‌ها (کارت) و «➕ مناقصهٔ تازه» در چهار گام: قلم (جستجو در سوابق) · تأمین‌کنندگان (سوابقِ همان قلم با تیک، شمارهٔ
     قابلِ ویرایش، افزودنِ دستی و جستجو در دفترچه) · قیمت و قواعد · بازبینی و «ساخت، شروع و ارسال دعوت».
   • نمای زنده: شمارشِ معکوس، کمترین قیمت با نام، نمودار، همهٔ پیشنهادها با «اصلاح» و «باطل»، فهرستِ دعوت با پیامک، «رمزِ تلفنی»،
     نمایش/پنهانِ نام‌ها، قواعد، پایان و لغو، و «🔎 جستجوی هوشمند در وب» برای تأمین‌کنندهٔ تازه.
   window.TP_TENDER: configure({api, render, overlay, esc, M}) · view(S) · load(force) · active(on)
   شنونده‌ها روی data-td* (یک بار روی #app). سرور: worker/tender.js (/support/tenders…).
   ============================================================ */
(function () {
  "use strict";
  const D = window.TDUI, TP = window.TP;
  const { esc, fa, money, short } = D;
  let C = { api: null, render: () => {} };
  const T = {
    list: null, err: "", loading: false, filter: "",
    id: null, d: null, dErr: "",
    w: null,          /* جادوگرِ ساخت: {step, q, hits, item, sups, extra, bq, bhits, f} */
    poll: null, tick: null, on: false, off: 0,
  };
  const ICON = () => TP.ui.ICON;
  /** عددِ اعشاری با جداکنندهٔ فارسی (۰٫۵ نه ۰.۵ که در راست‌به‌چپ وارونه خوانده می‌شود) */
  const faD = (v) => fa(String(v == null ? "" : v).replace(".", "٫"));
  const now = () => Date.now() + T.off;
  const rerender = () => C.render();

  /* ---------- بارگذاری ---------- */
  async function loadList() {
    T.loading = true; T.err = ""; rerender();
    try { const r = await C.api("/tenders"); T.list = r.tenders || []; T.sms = r.sms; T.off = r.now - Date.now(); } catch (e) { T.err = e.message; }
    T.loading = false; rerender();
  }
  async function loadOne(id, quiet) {
    if (!quiet) { T.id = id; T.d = null; T.dErr = ""; rerender(); }
    try { const d = await C.api(`/tenders/${id}`); if (T.id !== id) return; T.d = d; T.off = d.now - Date.now(); }
    catch (e) { if (!quiet) T.dErr = e.message; }
    rerender();
  }
  /** نظرسنجیِ نمای زنده هر سه ثانیه (فقط وقتی همین تب پیداست) و شمارشِ ثانیه‌ای */
  function loops(on) {
    clearInterval(T.poll); clearInterval(T.tick); T.poll = T.tick = null;
    if (!on) return;
    T.poll = setInterval(() => {
      if (document.hidden || !T.on || document.querySelector(".tp-modal-bg, .sup-ov")) return;
      if (T.id && T.d && ["live", "scheduled"].includes(T.d.tender.state)) loadOne(T.id, true);
      else if (!T.id && !T.w && T.list && T.list.some((x) => ["live", "scheduled"].includes(x.state))) loadList();
    }, 3000);
    T.tick = setInterval(() => {
      if (!T.on) return;
      const t = T.d && T.d.tender; const root = document.getElementById("app");
      if (t && t.state === "live") D.tickRing(root, t.end_at - now(), Math.max(1, t.end_at - t.start_at));
      document.querySelectorAll("[data-tdleft]").forEach((el) => { el.textContent = D.clock(Number(el.dataset.tdleft) - now()); });
    }, 1000);
  }

  /* ---------- فهرست ---------- */
  const FILTERS = [["", "همه"], ["live", "در جریان"], ["scheduled", "شروع‌نشده"], ["draft", "پیش‌نویس"], ["ended", "تمام‌شده"]];
  function timeLine(t) {
    if (t.state === "live") return `<span>تا پایان <b data-tdleft="${t.end_at}">${D.clock(t.end_at - now())}</b></span>`;
    if (t.state === "scheduled") return `<span>تا شروع <b data-tdleft="${t.start_at}">${D.clock(t.start_at - now())}</b></span>`;
    if (t.state === "ended") return `<span>پایان: ${esc(D.when(t.ended_at || t.end_at))}</span>`;
    if (t.state === "cancelled") return `<span>لغو شد</span>`;
    return `<span>هنوز شروع نشده</span>`;
  }
  function card(t, i) {
    return `<article class="td-card td-item" data-tdopen="${t.id}" role="button" tabindex="0" style="--i:${Math.min(i, 12)}" aria-label="مناقصهٔ ${esc(t.title)}">
      <header><b>${esc(t.title)}</b>${D.stChip(t.state)}</header>
      <div class="dim" style="font-size:.82rem;display:flex;gap:6px 14px;flex-wrap:wrap"><span>${fa(t.qty)} ${esc(t.unit)}</span>${timeLine(t)}${t.ext_count ? `<span class="td-ext">⏱ ${fa(t.ext_count)} تمدید</span>` : ""}</div>
      <div class="px"><div><small>قیمتِ شروع</small><b>${short(t.start_price)}</b></div><div><small>کمترین</small><b>${t.best_amount ? short(t.best_amount) : "—"}</b></div><div><small>شرکت‌کننده</small><b>${fa(t.bidders)} / ${fa(t.invited)}</b></div></div>
      ${t.best_name ? `<div style="font-size:.84rem">${t.state === "ended" ? "🏆 برنده" : "پیشتاز"}: <b>${esc(t.best_name)}</b></div>` : ""}</article>`;
  }
  function vList() {
    const L = (T.list || []).filter((t) => !T.filter || t.state === T.filter);
    const cnt = (k) => (T.list || []).filter((t) => !k || t.state === k).length;
    let h = `<div class="mg-bar"><button class="tp-btn primary" data-tdnew>${ICON().plus} مناقصهٔ تازه</button>
        <div class="tp-pills">${FILTERS.map(([k, l]) => cnt(k) || !k ? `<button type="button" class="tp-pill ${T.filter === k ? "on" : ""}" data-tdf="${k}">${l} <span class="n">${fa(cnt(k))}</span></button>` : "").join("")}</div>
        <span class="spacer"></span><span class="mg-count">${T.loading ? "…" : ""}</span></div>`;
    if (T.sms === false) h += `<div class="tp-note warn" style="margin:8px 18px 0">درگاه پیامک وصل نیست — دعوت‌ها و رمزها پیامک نمی‌شوند؛ از «رمزِ تلفنی» استفاده کنید.</div>`;
    if (T.err) h += `<div class="tp-note warn">${esc(T.err)}</div>`;
    if (!T.list) return h + `<div class="empty">در حال بارگذاری…</div>`;
    if (!L.length) return h + `<div class="lg-none">${ICON().flag}<b>${T.list.length ? "مناقصه‌ای در این دسته نیست" : "هنوز مناقصه‌ای نساخته‌اید"}</b>${T.list.length ? "" : `<button class="tp-btn primary" data-tdnew>${ICON().plus} اولین مناقصه</button>`}</div>`;
    return h + `<div class="td-list" style="padding:14px 18px 32px">${L.map(card).join("")}</div>`;
  }

  /* ---------- جادوگرِ ساخت ---------- */
  const STEPS = ["قلم", "تأمین‌کنندگان", "قیمت و قواعد", "بازبینی"];
  const W0 = () => ({ step: 0, q: "", hits: null, item: null, free: false, sups: [], extra: { name: "", phone: "" }, bq: "", bhits: null,
    f: { title: "", qty: "", unit: "", start_price: "", spec: "", terms: "", duration_min: "30", start_in_min: "0", step_pct: "0.5", step_min: "", floor_pct: "30", jump_pct: "10", ext_window_min: "3", ext_min: "3", ext_max: "0", show_names: false } });
  let qT = null;
  function searchItems(q) {
    clearTimeout(qT);
    qT = setTimeout(async () => {
      if (!T.w) return;
      if (q.trim().length < 2) { T.w.hits = null; return paintHits(); }
      try { const r = await C.api(`/tender-items?q=${encodeURIComponent(q.trim())}`); if (T.w && T.w.q === q) { T.w.hits = r.items || []; paintHits(); } } catch (_) { /* بی‌صدا */ }
    }, 300);
  }
  const hitsHtml = () => {
    const w = T.w;
    if (!w.hits) return `<div class="dim" style="font-size:.84rem;margin-top:8px">دست‌کم دو حرف از نام یا کدِ کالا.</div>`;
    if (!w.hits.length) return `<div class="dim" style="font-size:.84rem;margin-top:8px">در سوابقِ خرید پیدا نشد؛ «قلمِ بی‌سابقه» را بزنید.</div>`;
    return `<div class="td-hits">${w.hits.map((x) => `<button type="button" class="td-hit ${w.item && w.item.item_code === x.item_code ? "on" : ""}" data-tditem="${esc(x.item_code)}">
        <b>${esc(x.title)}</b><small dir="ltr">${esc(x.item_code)}</small><small>${fa(x.n)} خرید · ${fa(x.sups)} تأمین‌کننده · آخرین ${esc(fa(x.last || ""))}</small></button>`).join("")}</div>`;
  };
  function paintHits() { const box = document.querySelector("[data-tdhits]"); if (box) box.innerHTML = hitsHtml(); }
  async function pickItem(code) {
    const w = T.w, x = (w.hits || []).find((h) => h.item_code === code); if (!x) return;
    w.item = x; w.free = false;
    w.f.title = x.title; w.f.unit = x.unit || w.f.unit;
    w.sups = null; w.step = 1; rerender();
    try { const r = await C.api(`/tender-suppliers?code=${encodeURIComponent(code)}`); if (T.w === w) { w.sups = (r.suppliers || []).map((s) => ({ ...s, on: true, phone: s.phone || "", source: "history" })); rerender(); } }
    catch (e) { if (T.w === w) { w.sups = []; TP.modal("نشد", esc(e.message), null, "باشد", ""); rerender(); } }
  }
  let bT = null;
  function searchBook(q) {
    clearTimeout(bT);
    bT = setTimeout(async () => {
      if (!T.w && !T.id) return;
      const box = document.querySelector("[data-tdbhits]");
      if (q.trim().length < 2) { if (box) box.innerHTML = ""; return; }
      try {
        const r = await C.api(`/tender-book?q=${encodeURIComponent(q.trim())}`);
        T.bhits = r.suppliers || [];
        if (box) box.innerHTML = T.bhits.length ? T.bhits.map((s, i) => `<button type="button" class="td-hit" data-tdbook="${i}"><b>${esc(s.name)}</b><small dir="ltr">${esc(s.phone || "")}</small><small>${s.n ? `${fa(s.n)} خرید` : "دفترچه"}${s.grade ? ` · ردهٔ ${esc(s.grade)}` : ""}</small><span class="chip">افزودن</span></button>`).join("") : `<div class="dim" style="font-size:.84rem">پیدا نشد؛ با نام و شماره دستی بیفزایید.</div>`;
      } catch (_) { /* بی‌صدا */ }
    }, 300);
  }
  const phoneBad = (p) => !!String(p || "").trim() && !/^(\+?98|0)?9\d{9}$/.test(D.latin(p).replace(/[\s-]/g, ""));
  function supRow(s, i, mode) {
    const off = !s.on;
    return `<div class="td-sup ${off ? "off" : ""}"><input type="checkbox" ${s.on ? "checked" : ""} ${mode === "w" ? `data-tdson="${i}"` : `data-tdinvon="${s.alias}"`} aria-label="دعوتِ ${esc(s.name)}">
      <span class="w"><b>${esc(s.name)}</b><small>${mode === "w" ? `${s.n ? `${fa(s.n)} خرید${s.last ? ` · آخرین ${esc(fa(s.last))}` : ""}` : esc(s.source === "smart" ? "جستجوی هوشمند" : s.source === "book" ? "دفترچه" : "دستی")}${s.grade ? ` · ردهٔ ${esc(s.grade)}` : ""}`
        : `${esc(s.label)}${s.rank ? ` · رتبهٔ ${fa(s.rank)} — ${money(s.best)}` : ""}${s.seen_at ? " · وارد شد" : ""}`}</small></span>
      <input class="tp-input ph ${!s.phone ? "bad" : phoneBad(s.phone) ? "bad" : ""}" ${mode === "w" ? `data-tdsph="${i}"` : `data-tdinvph="${s.alias}"`} value="${esc(s.phone || "")}" placeholder="${s.phone ? "" : "شماره ندارد"}" inputmode="tel" dir="ltr" aria-label="شمارهٔ ${esc(s.name)}">
      <span class="tags">${mode === "w" ? (s.phones && s.phones.length > 1 ? `<span class="chip" title="${esc(s.phones.map((p) => `${p.phone}${p.label ? ` (${p.label})` : ""}`).join("، "))}">${fa(s.phones.length)} شماره</span>` : "")
        : `${smsChip(s)}<button type="button" class="tp-btn xs" data-tdpass="${s.alias}" title="رمزی بسازید و تلفنی به او بگویید">رمزِ تلفنی</button>${s.phone && s.on ? `<button type="button" class="tp-btn xs" data-tdresend="${s.alias}">پیامک</button>` : ""}`}</span></div>`;
  }
  const SMS_FA = { sent: ["ok", "پیامک رفت"], off: ["warn", "درگاه خاموش"], error: ["bad", "نرسید"], nophone: ["warn", "بی‌شماره"] };
  const smsChip = (s) => (s.sms_state ? `<span class="chip ${SMS_FA[s.sms_state] ? SMS_FA[s.sms_state][0] : ""}" title="${esc(s.sms_err || (s.sms_at ? D.when(s.sms_at) : ""))}">${esc(SMS_FA[s.sms_state] ? SMS_FA[s.sms_state][1] : s.sms_state)}</span>` : `<span class="chip">دعوت نرفته</span>`);
  function addBox(scope) {
    const w = T.w || {}, e = w.extra || {};
    return `<div class="td-card" style="margin-top:12px;padding:12px 14px"><h3 style="font-size:.9rem">افزودنِ تأمین‌کنندهٔ دیگر</h3>
      <div class="td-form"><label>جستجو در دفترچه‌ها و سوابق<input class="tp-input" data-tdbq placeholder="نام تأمین‌کننده" autocomplete="off"></label>
        <label>یا نامِ تازه<input class="tp-input" data-tdxname value="${esc(e.name || "")}" placeholder="مثلاً بازرگانی نو"></label>
        <label>شمارهٔ همراه<input class="tp-input" data-tdxph value="${esc(e.phone || "")}" inputmode="tel" dir="ltr" placeholder="09…"></label></div>
      <div class="td-hits" data-tdbhits></div>
      <div class="td-foot"><button class="tp-btn" data-tdxadd="${scope}">${ICON().plus} افزودن به فهرست</button></div></div>`;
  }
  const fld = (k, label, sub, attrs) => `<label>${label}${sub ? ` <small>${sub}</small>` : ""}<input class="tp-input" data-tdfld="${k}" value="${esc(T.w.f[k])}" ${attrs || ""}></label>`;
  function startPriceHint() {
    const a = D.parseAmt(T.w.f.start_price), q = Number(D.latin(T.w.f.qty)) || 0;
    return a > 0 ? `${esc(D.words(a))} ریال · ${money(Math.round(a / 10))} تومان${q ? ` · جمع: ${short(a * q)} ریال` : ""} · کف: ${money(Math.ceil(a * (1 - (Number(D.latin(T.w.f.floor_pct)) || 0) / 100)))}` : "سقفِ قیمتِ واحد؛ اولین پیشنهاد حداکثر همین است.";
  }
  function vWizard() {
    const w = T.w, f = w.f;
    const steps = `<div class="td-steps">${STEPS.map((s, i) => `<span class="${i === w.step ? "on" : i < w.step ? "done" : ""}">${fa(i + 1)}. ${s}</span>`).join("")}</div>`;
    let body = "";
    if (w.step === 0) {
      body = `<div class="td-form"><label class="wide">نام یا کدِ کالا (در سوابقِ خرید)<input class="tp-input" data-tdq value="${esc(w.q)}" placeholder="مثلاً میلگرد ۱۶" autocomplete="off" autofocus></label></div>
        <div data-tdhits>${hitsHtml()}</div>
        <div class="td-foot"><button class="tp-btn" data-tdfree>قلمِ بی‌سابقه (نام را خودم می‌نویسم)</button><span class="spacer"></span><button class="tp-btn" data-tdcancelw>انصراف</button></div>`;
    } else if (w.step === 1) {
      const S = w.sups;
      body = `<div class="dim" style="font-size:.86rem;margin-bottom:8px">${w.item ? `تأمین‌کنندگانِ «${esc(w.item.title)}» در سوابق — تیک‌خورده‌ها دعوت می‌شوند؛ شمارهٔ هر کدام را می‌شود عوض کرد یا گذاشت.` : "تأمین‌کنندگان را دستی یا از دفترچه بیفزایید."}</div>
        ${S == null ? `<div class="empty">در حال خواندنِ سوابق…</div>` : S.length ? `<div class="td-sups">${S.map((s, i) => supRow(s, i, "w")).join("")}</div>` : `<div class="dim">کسی در سوابق نیست.</div>`}
        ${addBox("w")}
        <div class="td-foot"><button class="tp-btn" data-tdstep="0">→ قلم</button><span class="spacer"></span><span class="dim">${fa((S || []).filter((s) => s.on).length)} نفر تیک خورده</span><button class="tp-btn primary" data-tdstep="2">قیمت و قواعد ←</button></div>`;
    } else if (w.step === 2) {
      body = `<div class="td-form">${fld("title", "عنوانِ مناقصه (نام کالا)", "", "")}${fld("qty", "مقدار", "", 'inputmode="decimal"')}${fld("unit", "واحد", "", "")}
          <label class="wide">قیمتِ شروع (سقفِ قیمتِ واحد، ریال)<input class="tp-input" data-tdfld="start_price" value="${esc(f.start_price)}" inputmode="numeric" dir="ltr" style="font-size:1.1rem;font-weight:800"><small data-tdsph-hint>${startPriceHint()}</small></label>
          <label class="wide">مشخصاتِ کالا <small>بعد از ورود دیده می‌شود، نه در پیامک</small><textarea class="tp-input" data-tdfld="spec" rows="3">${esc(f.spec)}</textarea></label>
          <label class="wide">شرایط <small>زمان و محلِ تحویل، پرداخت، فاکتور…</small><textarea class="tp-input" data-tdfld="terms" rows="2">${esc(f.terms)}</textarea></label>
          ${fld("start_in_min", "شروع چند دقیقهٔ دیگر", "۰ = همین حالا", 'inputmode="numeric"')}${fld("duration_min", "مدت (دقیقه)", "", 'inputmode="numeric"')}
          ${fld("step_pct", "حداقلِ کاهشِ هر پیشنهاد (٪)", "", 'inputmode="decimal"')}${fld("step_min", "حداقلِ کاهش (ریال)", "اختیاری", 'inputmode="numeric"')}
          ${fld("floor_pct", "کف: حداکثر کاهش از قیمتِ شروع (٪)", "", 'inputmode="decimal"')}${fld("jump_pct", "حداکثر کاهشِ یکباره (٪)", "ضدِ صفرِ جاافتاده", 'inputmode="decimal"')}
          ${fld("ext_window_min", "پنجرهٔ تمدید (دقیقهٔ آخر)", "", 'inputmode="decimal"')}${fld("ext_min", "تمدید تا (دقیقه بعد)", "", 'inputmode="decimal"')}${fld("ext_max", "سقفِ دفعاتِ تمدید", "۰ = بی سقف", 'inputmode="numeric"')}
          <label>نامِ تأمین‌کنندگان${TP.ui.switchEl({ on: f.show_names, label: f.show_names ? "پیدا برای همه" : "پنهان (پیش‌فرض)", attrs: "data-tdnames" })}</label></div>
        <div class="td-foot"><button class="tp-btn" data-tdstep="1">→ تأمین‌کنندگان</button><span class="spacer"></span><button class="tp-btn primary" data-tdstep="3">بازبینی ←</button></div>`;
    } else {
      const on = (w.sups || []).filter((s) => s.on), noPh = on.filter((s) => !String(s.phone || "").trim());
      const a = D.parseAmt(f.start_price);
      body = `<div class="td-card" style="padding:14px"><h3>${esc(f.title)}</h3>
          <div class="td-range" style="margin-top:0"><div><small>مقدار</small><b>${fa(f.qty)} ${esc(f.unit)}</b></div><div><small>قیمتِ شروع</small><b>${money(a)}</b></div><div><small>مدت</small><b>${fa(f.duration_min)} دقیقه</b></div></div>
          <ul class="td-rules" style="margin-top:10px"><li>• شروع: <b>${Number(D.latin(f.start_in_min)) ? `${fa(f.start_in_min)} دقیقهٔ دیگر` : "همین حالا"}</b></li>
            <li>• گام: <b>${faD(f.step_pct)}٪</b>${f.step_min ? ` (حداقل ${money(D.parseAmt(f.step_min))} ریال)` : ""} · کف: <b>${faD(f.floor_pct)}٪</b> زیرِ شروع · پرشِ یکباره: <b>${faD(f.jump_pct)}٪</b></li>
            <li>• تمدید: پیشنهاد در <b>${faD(f.ext_window_min)}</b> دقیقهٔ آخر ← <b>${faD(f.ext_min)}</b> دقیقه بعد${Number(D.latin(f.ext_max)) ? ` (حداکثر ${fa(f.ext_max)} بار)` : " — هر بار"}</li>
            <li>• نام‌ها: <b>${f.show_names ? "پیدا" : "پنهان"}</b> · دعوت: <b>${fa(on.length)}</b> نفر${noPh.length ? ` — <span style="color:#fcd34d">${fa(noPh.length)} نفر شماره ندارند (پیامک نمی‌گیرند)</span>` : ""}</li></ul>
          <div class="tp-note" style="margin-top:10px">متنِ پیامکِ دعوت فقط لینک و زمان است — نامِ کالا و مقدار در آن نمی‌آید.</div></div>
        <div class="td-foot"><button class="tp-btn" data-tdstep="2">→ قیمت و قواعد</button><span class="spacer"></span>
          <button class="tp-btn" data-tdcreate="draft">ذخیرهٔ پیش‌نویس</button><button class="tp-btn primary" data-tdcreate="go">🚀 ساخت، شروع و ارسال دعوت</button></div>`;
    }
    return `<div class="sv-exone" style="max-width:1000px"><div class="mg-bar" style="padding:0"><button class="tp-btn sm" data-tdcancelw>→ همهٔ مناقصه‌ها</button><h2 style="margin:0;font-size:1.1rem">مناقصهٔ تازه</h2></div>
      <section class="td-card">${steps}${body}</section></div>`;
  }
  function stepCheck(to) {
    const w = T.w, f = w.f;
    if (to >= 2 && !(w.sups || []).some((s) => s.on)) return "دست‌کم یک تأمین‌کننده را تیک بزنید.";
    if (to >= 2) { const bad = (w.sups || []).find((s) => s.on && phoneBad(s.phone)); if (bad) return `شمارهٔ «${bad.name}» درست نیست.`; }
    if (to >= 3) {
      if (!f.title.trim()) return "عنوان را بنویسید.";
      if (!(Number(D.latin(f.qty)) > 0)) return "مقدار را بنویسید.";
      if (!f.unit.trim()) return "واحد را بنویسید.";
      if (!(D.parseAmt(f.start_price) > 0)) return "قیمتِ شروع را به ریال بنویسید.";
    }
    return "";
  }
  async function create(go) {
    const w = T.w, f = w.f, err = stepCheck(3); if (err) return TP.modal("کامل نیست", esc(err), null, "باشد", "");
    const body = { title: f.title, item_code: w.item ? w.item.item_code : "", item_title: w.item ? w.item.title : "", qty: f.qty, unit: f.unit, start_price: f.start_price, spec: f.spec, terms: f.terms,
      step_pct: f.step_pct, step_min: f.step_min, floor_pct: f.floor_pct, jump_pct: f.jump_pct, ext_window_s: Math.round((Number(D.latin(f.ext_window_min)) || 0) * 60), ext_s: Math.round((Number(D.latin(f.ext_min)) || 0) * 60),
      ext_max: f.ext_max, show_names: !!f.show_names, duration_s: Math.round((Number(D.latin(f.duration_min)) || 30) * 60),
      invites: (w.sups || []).map((s) => ({ name: s.name, phone: s.phone, source: s.source || "history", on: !!s.on, supplier_id: s.supplier_id, info: s.n ? { n: s.n, last: s.last, grade: s.grade } : null })) };
    const b = TP.busy(go ? "ساخت و شروع…" : "ذخیره…", "مناقصه");
    try {
      let d = await C.api("/tenders", { body });
      if (go) {
        d = await C.api(`/tenders/${d.tender.id}/schedule`, { body: { start_in_min: f.start_in_min, duration_min: f.duration_min } });
        d = await C.api(`/tenders/${d.tender.id}/invite`, { body: {} });
      }
      T.w = null; T.id = d.tender.id; T.d = d; T.list = null;
      b.close(); rerender();
      if (go && d.result) TP.ui.success(d.result.sent ? `دعوت برای ${fa(d.result.sent)} نفر پیامک شد` : "مناقصه شروع شد");
      if (go && d.result && (d.result.off || d.result.error || d.result.nophone)) inviteReport(d.result);
    } catch (e) { b.close(); TP.modal("نشد", esc(e.message), null, "باشد", ""); }
  }
  function inviteReport(r) {
    TP.modal("نتیجهٔ پیامکِ دعوت", `<ul class="td-rules"><li>• رفت: <b>${fa(r.sent)}</b></li>${r.off ? `<li>• درگاهِ پیامک وصل نیست: <b>${fa(r.off)}</b> — لینک را خودتان بفرستید یا «رمزِ تلفنی» بدهید.</li>` : ""}
      ${r.error ? `<li>• نرسید: <b>${fa(r.error)}</b></li>` : ""}${r.nophone ? `<li>• بی‌شماره: <b>${fa(r.nophone)}</b> — شماره بگذارید و «پیامک» را بزنید.</li>` : ""}</ul>`, null, "باشد", "");
  }

  /* ---------- نمای زنده ---------- */
  function vDetail() {
    const back = `<button class="tp-btn sm" data-tdback>→ همهٔ مناقصه‌ها</button>`;
    if (T.dErr) return `<div class="sv-exone">${back}<div class="tp-note warn">${esc(T.dErr)}</div></div>`;
    if (!T.d) return `<div class="sv-exone">${back}<div class="empty">در حال بارگذاری…</div></div>`;
    const d = T.d, t = d.tender, n = now(), inv = d.invites, names = new Map(inv.map((i) => [i.alias, i.name]));
    const bestName = t.best_alias != null ? names.get(t.best_alias) : null;
    const ring = t.state === "live" ? D.ring(t.end_at - n, Math.max(1, t.end_at - t.start_at), "تا پایان") : t.state === "scheduled" ? D.ring(t.start_at - n, Math.max(1, t.start_at - n), "تا شروع") : D.ring(0, 1, D.ST[t.state]);
    const open = ["draft", "scheduled", "live"].includes(t.state);
    const acts = [
      t.state === "draft" ? `<button class="tp-btn primary" data-tdstart>▶️ شروع</button>` : "",
      open && t.state !== "draft" ? `<button class="tp-btn" data-tdinvite>📨 دعوتِ نفرستاده‌ها</button>` : t.state === "draft" ? `<button class="tp-btn" data-tdinvite>📨 ارسالِ دعوت</button>` : "",
      `<button class="tp-btn" data-tdcopy="${esc(d.link)}" title="${esc(d.link)}">🔗 کپیِ لینک</button>`,
      open ? `<button class="tp-btn" data-tdrules>⚙️ قواعد</button>` : "",
      t.state === "live" ? `<button class="tp-btn" data-tdend>⏹ پایان همین حالا</button>` : "",
      open ? `<button class="tp-btn danger" data-tdcancel>✖ لغو</button>` : "",
    ].join("");
    const bids = d.bids.slice().reverse().map((b) => `<div class="td-b ${b.state === "void" ? "void" : ""} ${b.id === (d.bids.filter((x) => x.state !== "void").sort((p, q) => p.amount - q.amount || p.at - q.at)[0] || {}).id ? "best" : ""}">
        <span class="av" style="--av:${D.avColor(b.alias)}" aria-hidden="true">${fa(b.alias)}</span>
        <span class="w"><b>${esc(b.name)}</b><small>${esc(D.hms(b.at))}${b.ext ? " · ⏱ تمدید" : ""}${b.state === "fixed" ? ` · اصلاح از ${money(b.orig_amount)}` : ""}${b.state === "void" ? " · باطل" : ""}${b.fix_reason ? ` — ${esc(b.fix_reason)}` : ""}</small></span>
        <span class="a"><b>${money(b.amount)}</b><small>${t.start_price ? `${fa(((1 - b.amount / t.start_price) * 100).toFixed(1).replace(".", "٫"))}٪ زیرِ شروع` : ""}</small></span>
        ${b.state !== "void" && t.state !== "cancelled" ? `<span class="acts"><button class="tp-btn xs" data-tdfix="${b.id}">اصلاح</button><button class="tp-btn xs danger" data-tdvoid="${b.id}">باطل</button></span>` : ""}</div>`).join("");
    const job = (d.jobs || [])[0];
    const jobHtml = !job ? "" : job.state === "pending" || job.state === "running" ? `<div class="tp-note"><span class="tp-spin"></span> جستجو برای «${esc(job.query)}» در جریان است؛ چند دقیقه طول می‌کشد.</div>`
      : job.state === "error" ? `<div class="tp-note warn">جستجو نشد: ${esc(job.error || "")}</div>`
        : `<div class="td-hits">${((job.result && job.result.suppliers) || []).map((s, i) => `<button type="button" class="td-hit" data-tdsmart="${i}"><b>${esc(s.name)}</b><small dir="ltr">${esc((s.phones || [])[0] || "بی‌شماره")}</small>
            <small>${esc([s.type, s.price, s.website].filter(Boolean).join(" · "))}</small><span class="chip">افزودن</span></button>`).join("") || `<div class="dim">چیزی پیدا نشد.</div>`}</div>`;
    return `<div class="td-wrap" style="padding:0 0 32px">
      <section class="td-card"><div class="td-head">${back}<span class="ic" aria-hidden="true">${ICON().box}</span>
        <div class="t"><h1>${esc(t.title)}</h1><div class="meta"><span>${fa(t.qty)} ${esc(t.unit)}</span>${t.item_code ? `<span dir="ltr">${esc(t.item_code)}</span>` : ""}<span>شروع: <b>${money(t.start_price)}</b></span>
          ${t.start_at ? `<span>${esc(D.when(t.start_at))} ← ${esc(D.hms(t.end_at))}</span>` : ""}</div></div>${D.stChip(t.state)}</div>
        <div class="td-foot" style="margin-top:12px">${acts}<span class="spacer"></span>${open ? TP.ui.switchEl({ on: t.show_names, label: t.show_names ? "نام‌ها پیدا" : "نام‌ها پنهان", attrs: "data-tdshow" }) : ""}</div></section>
      <section class="td-card td-hero ${t.best_amount ? "lead" : ""}">${ring}
        <div class="td-best"><span class="cap">${t.best_amount ? `کمترین قیمت — هر ${esc(t.unit)}` : "قیمتِ شروع"}</span><span class="num">${money(t.best_amount || t.start_price)}<small>ریال</small></span>
          <span class="sub">${t.best_amount ? `<span>جمع: <b>${short(t.best_amount * t.qty)}</b></span><span><b>${fa(((1 - t.best_amount / t.start_price) * 100).toFixed(1).replace(".", "٫"))}٪</b> زیرِ شروع</span>` : "<span>هنوز پیشنهادی نیست</span>"}
            <span>${fa(new Set(d.bids.filter((b) => b.state !== "void").map((b) => b.alias)).size)} از ${fa(inv.filter((i) => i.on).length)} شرکت کرده‌اند</span>${t.ext_count ? `<span class="td-ext">⏱ ${fa(t.ext_count)} تمدید</span>` : ""}</span>
          ${bestName ? `<span class="td-me lead">${t.state === "ended" ? "🏆 برنده" : "پیشتاز"}: ${esc(bestName)}</span>` : ""}</div></section>
      <div class="td-grid"><div class="td-col">
          <section class="td-card"><h3>روندِ قیمت</h3>${D.chart({ series: d.series, start: t.start_price, floor: t.range.floor, from: t.start_at, to: t.state === "live" ? n : t.ended_at || t.end_at })}</section>
          <section class="td-card"><h3>پیشنهادها <span class="sub">${fa(d.bids.length)} پیشنهاد · اصلاح و ابطال با علت، در رخدادها می‌ماند</span></h3>${bids ? `<div class="td-bids" style="max-height:520px">${bids}</div>` : `<div class="td-empty">هنوز پیشنهادی نیست.</div>`}</section></div>
        <div class="td-col">
          <section class="td-card"><h3>دعوت‌شده‌ها <span class="sub">${fa(inv.filter((i) => i.on).length)} نفر</span></h3><div class="td-sups">${inv.map((s) => supRow(s, 0, "d")).join("")}</div>${open ? addBox("d") : ""}</section>
          ${open ? `<section class="td-card"><h3>🔎 جستجوی هوشمند در وب <span class="sub">تأمین‌کنندهٔ تازه برای همین کالا</span></h3>
            <div class="td-form"><label class="wide">چه چیزی جستجو شود؟<input class="tp-input" data-tdsq value="${esc(T.sq != null ? T.sq : t.title)}"></label></div>
            <div class="td-foot"><button class="tp-btn" data-tdsmartgo ${job && ["pending", "running"].includes(job.state) ? "disabled" : ""}>جستجو</button></div>${jobHtml}</section>` : ""}</div></div></div>`;
  }

  /* ---------- رفتارها ---------- */
  function onClick(e) {
    const el = e.target.closest("[data-tdnew],[data-tdf],[data-tdopen],[data-tdback],[data-tdcancelw],[data-tditem],[data-tdfree],[data-tdstep],[data-tdcreate],[data-tdxadd],[data-tdbook],[data-tdnames],[data-tdstart],[data-tdinvite],[data-tdcopy],[data-tdrules],[data-tdend],[data-tdcancel],[data-tdfix],[data-tdvoid],[data-tdpass],[data-tdresend],[data-tdshow],[data-tdsmartgo],[data-tdsmart]");
    if (!el || el.disabled || !T.on) return;
    const d = el.dataset;
    if (d.tdnew !== undefined) { T.w = W0(); T.id = null; T.d = null; return rerender(); }
    if (d.tdf !== undefined) { T.filter = d.tdf; return rerender(); }
    if (d.tdopen) return loadOne(Number(d.tdopen));
    if (d.tdback !== undefined) { T.id = null; T.d = null; T.sq = null; return loadList(); }
    if (d.tdcancelw !== undefined) { T.w = null; return T.list ? rerender() : loadList(); }
    if (d.tditem) return pickItem(d.tditem);
    if (d.tdfree !== undefined) { T.w.item = null; T.w.free = true; T.w.f.title = T.w.q; T.w.sups = []; T.w.step = 1; return rerender(); }
    if (d.tdstep) { const to = Number(d.tdstep), err = to > T.w.step ? stepCheck(to) : ""; if (err) return TP.modal("کامل نیست", esc(err), null, "باشد", ""); T.w.step = to; return rerender(); }
    if (d.tdcreate) return create(d.tdcreate === "go");
    if (d.tdnames !== undefined) { T.w.f.show_names = !T.w.f.show_names; return rerender(); }
    if (d.tdxadd) return addExtra(d.tdxadd);
    if (d.tdbook !== undefined) { const s = (T.bhits || [])[Number(d.tdbook)]; if (s) return addSup({ name: s.name, phone: s.phone || "", source: "book", supplier_id: s.supplier_id, n: s.n, grade: s.grade }); return null; }
    if (d.tdsmart !== undefined) { const j = (T.d.jobs || [])[0], s = j && j.result && j.result.suppliers[Number(d.tdsmart)]; if (s) return addSup({ name: s.name, phone: (s.phones || [])[0] || "", source: "smart", info: { website: s.website } }); return null; }
    if (d.tdcopy) { try { navigator.clipboard.writeText(d.tdcopy); TP.ui.success("لینک کپی شد"); } catch (_) { TP.modal("لینک", `<p dir="ltr" style="word-break:break-all">${esc(d.tdcopy)}</p>`, null, "باشد", ""); } return null; }
    const id = T.id;
    if (d.tdshow !== undefined) return act(() => C.api(`/tenders/${id}`, { method: "PUT", body: { show_names: !T.d.tender.show_names } }));
    if (d.tdstart !== undefined) return startDialog();
    if (d.tdinvite !== undefined) return act(async () => { const r = await C.api(`/tenders/${id}/invite`, { body: {} }); inviteReport(r.result); return r; });
    if (d.tdresend) return act(async () => { const r = await C.api(`/tenders/${id}/invite`, { body: { aliases: [Number(d.tdresend)] } }); TP.ui.success(r.result.sent ? "پیامک رفت" : "پیامک نرفت"); return r; });
    if (d.tdrules !== undefined) return rulesDialog();
    if (d.tdend !== undefined) return TP.modal("پایانِ همین حالا", "<p>مناقصه همین حالا بسته می‌شود و کمترین قیمت برنده است.</p>", () => act(() => C.api(`/tenders/${id}/end`, { body: {} })), "ببند", "انصراف");
    if (d.tdcancel !== undefined) return reasonDialog("لغوِ مناقصه", "علتِ لغو", (reason) => C.api(`/tenders/${id}/cancel`, { body: { reason } }), "لغو شود");
    if (d.tdvoid) return reasonDialog("ابطالِ پیشنهاد", "علت (تأمین‌کننده هم می‌بیند)", (reason) => C.api(`/tenders/${id}/bids/${d.tdvoid}`, { body: { void: true, reason } }), "باطل شود");
    if (d.tdfix) return fixDialog(Number(d.tdfix));
    if (d.tdpass) return C.api(`/tenders/${id}/invites/${d.tdpass}/pass`, { body: {} }).then((r) => TP.modal("رمزِ تلفنی", `<p>این رمز را تلفنی به <b>${esc(r.name)}</b> بگویید؛ با شمارهٔ <b dir="ltr">${esc(r.phone)}</b> و این رمز وارد می‌شود (تا ${fa(r.valid_h)} ساعت):</p>
        <div class="td-confirm"><div class="big" style="letter-spacing:.3em">${fa(r.pass)}</div></div><p class="dim" style="font-size:.8rem">رمز فقط همین یک بار نشان داده می‌شود.</p>`, null, "باشد", "")).catch((x) => TP.modal("نشد", esc(x.message), null, "باشد", ""));
    if (d.tdsmartgo !== undefined) { const q = (document.querySelector("[data-tdsq]") || {}).value || ""; return act(() => C.api(`/tenders/${id}/discover`, { body: { query: q } })); }
    return null;
  }
  async function act(fn) {
    try { const r = await fn(); if (r && r.tender && T.id === r.tender.id) { T.d = r; T.off = r.now - Date.now(); } else if (T.id) await loadOne(T.id, true); rerender(); }
    catch (e) { TP.modal("نشد", esc(e.message), null, "باشد", ""); }
  }
  function addSup(s) {
    if (T.w) {
      if ((T.w.sups || []).some((x) => x.name === s.name)) return TP.modal("تکراری", `«${esc(s.name)}» از قبل در فهرست است.`, null, "باشد", "");
      T.w.sups = [...(T.w.sups || []), { ...s, on: true }]; T.w.extra = { name: "", phone: "" }; T.bhits = null;
      const q = document.querySelector("[data-tdbq]"); if (q) q.value = "";
      return rerender();
    }
    return act(() => C.api(`/tenders/${T.id}/invites`, { body: { name: s.name, phone: s.phone, source: s.source, supplier_id: s.supplier_id, info: s.info } }));
  }
  function addExtra() {
    const name = ((document.querySelector("[data-tdxname]") || {}).value || "").trim(), phone = ((document.querySelector("[data-tdxph]") || {}).value || "").trim();
    if (!name) return TP.modal("نام", "نامِ تأمین‌کننده را بنویسید (یا از جستجو انتخاب کنید).", null, "باشد", "");
    if (phoneBad(phone)) return TP.modal("شماره", "شمارهٔ همراه درست نیست (مثل ۰۹۱۲۱۲۳۴۵۶۷).", null, "باشد", "");
    return addSup({ name, phone, source: "manual" });
  }
  function reasonDialog(title, label, fn, yes) {
    const dlg = TP.modal(title, `<textarea class="tp-input" data-tdwhy style="width:100%;min-height:80px" maxlength="300" placeholder="${esc(label)}"></textarea>`, () => {
      const reason = (dlg.querySelector("[data-tdwhy]") || {}).value || "";
      act(() => fn(reason));
    }, yes, "انصراف");
  }
  function fixDialog(bidId) {
    const b = T.d.bids.find((x) => x.id === bidId); if (!b) return;
    const dlg = TP.modal("اصلاحِ پیشنهاد", `<p class="dim" style="margin-top:0">${esc(b.name)} — ${money(b.amount)} ریال (${esc(D.hms(b.at))})</p>
      <input class="tp-input" data-tdfixamt inputmode="numeric" dir="ltr" placeholder="مبلغِ درست (ریال)" style="width:100%;font-size:1.1rem;font-weight:800">
      <div class="dim" data-tdfixw style="font-size:.82rem;min-height:1.4em;margin:6px 0"></div>
      <textarea class="tp-input" data-tdwhy style="width:100%;min-height:70px" maxlength="300" placeholder="علت (تأمین‌کننده هم می‌بیند)"></textarea>`, () => {
      const amount = (dlg.querySelector("[data-tdfixamt]") || {}).value || "", reason = (dlg.querySelector("[data-tdwhy]") || {}).value || "";
      act(() => C.api(`/tenders/${T.id}/bids/${bidId}`, { body: { amount, reason } }));
    }, "اصلاح شود", "انصراف");
    const inp = dlg.querySelector("[data-tdfixamt]"), w = dlg.querySelector("[data-tdfixw]");
    inp.oninput = () => { const a = D.parseAmt(inp.value); w.textContent = a > 0 ? `${D.words(a)} ریال` : ""; };
  }
  function startDialog() {
    const t = T.d.tender;
    const dlg = TP.modal("شروعِ مناقصه", `<div class="td-form"><label>شروع چند دقیقهٔ دیگر <small>۰ = همین حالا</small><input class="tp-input" data-tdsin value="0" inputmode="numeric"></label>
        <label>مدت (دقیقه)<input class="tp-input" data-tdsdur value="${fa(Math.round(t.duration_s / 60))}" inputmode="numeric"></label></div>
      <p class="dim" style="font-size:.82rem">بعد از شروع «ارسالِ دعوت» را بزنید تا پیامک برود.</p>`, () => {
      const start_in_min = D.latin(dlg.querySelector("[data-tdsin]").value), duration_min = D.latin(dlg.querySelector("[data-tdsdur]").value);
      act(() => C.api(`/tenders/${T.id}/schedule`, { body: { start_in_min, duration_min } }));
    }, "شروع", "انصراف");
  }
  function rulesDialog() {
    const t = T.d.tender, m = (s) => faD(Math.round(s / 6) / 10);
    const hasBids = t.best_amount != null;
    const f = (k, l, v, sub) => `<label>${l}${sub ? ` <small>${sub}</small>` : ""}<input class="tp-input" data-tdr="${k}" value="${esc(v)}" inputmode="decimal"></label>`;
    const dlg = TP.modal("⚙️ قواعدِ مناقصه", `<div class="td-form">
        ${f("start_price", "قیمتِ شروع (ریال)", money(t.start_price), hasBids ? "بعد از اولین پیشنهاد ثابت" : "")}${f("step_pct", "حداقلِ کاهش (٪)", faD(t.step_pct))}${f("step_min", "حداقلِ کاهش (ریال)", t.step_min ? money(t.step_min) : "")}
        ${f("floor_pct", "کف (٪ زیرِ شروع)", faD(t.floor_pct))}${f("jump_pct", "حداکثر کاهشِ یکباره (٪)", faD(t.jump_pct))}
        ${f("ext_window_min", "پنجرهٔ تمدید (دقیقه)", m(t.ext_window_s))}${f("ext_min", "تمدید تا (دقیقه)", m(t.ext_s))}${f("ext_max", "سقفِ تمدید", fa(t.ext_max), "۰ = بی سقف")}
        ${t.state !== "draft" ? f("end_in_min", "پایانِ تازه: چند دقیقه از حالا", "", "خالی = همان") : ""}</div>`, () => {
      const v = (k) => { const el = dlg.querySelector(`[data-tdr="${k}"]`); return el ? D.latin(el.value).replace(/[,٬\s]/g, "").replace(/٫/g, ".") : undefined; };
      const body = { step_pct: v("step_pct"), step_min: v("step_min") || "0", floor_pct: v("floor_pct"), jump_pct: v("jump_pct"), ext_max: v("ext_max"),
        ext_window_s: String(Math.round(Number(v("ext_window_min")) * 60)), ext_s: String(Math.round(Number(v("ext_min")) * 60)) };
      if (!hasBids) body.start_price = v("start_price");
      if (v("end_in_min")) body.end_in_min = v("end_in_min");
      act(() => C.api(`/tenders/${T.id}`, { method: "PUT", body }));
    }, "ذخیره", "انصراف");
  }
  function onInput(e) {
    const t = e.target, d = t.dataset;
    if (!T.on) return;
    if (d.tdq !== undefined && T.w) { T.w.q = t.value; return searchItems(t.value); }
    if (d.tdbq !== undefined) return searchBook(t.value);
    if (d.tdsq !== undefined) { T.sq = t.value; return null; }
    if (d.tdxname !== undefined && T.w) { T.w.extra.name = t.value; return null; }
    if (d.tdxph !== undefined && T.w) { T.w.extra.phone = t.value; return null; }
    if (d.tdfld && T.w) {
      T.w.f[d.tdfld] = t.value;
      if (d.tdfld === "start_price") { const dg = D.latin(t.value).replace(/[^\d]/g, ""); t.value = dg ? Number(dg).toLocaleString("en-US") : ""; T.w.f.start_price = t.value; }
      const h = document.querySelector("[data-tdsph-hint]"); if (h) h.innerHTML = startPriceHint();
      return null;
    }
    if (d.tdsph !== undefined && T.w) { T.w.sups[Number(d.tdsph)].phone = t.value; t.classList.toggle("bad", !t.value.trim() || phoneBad(t.value)); return null; }
    return null;
  }
  function onChange(e) {
    const t = e.target, d = t.dataset;
    if (!T.on) return;
    if (d.tdson !== undefined && T.w) { T.w.sups[Number(d.tdson)].on = t.checked; return rerender(); }
    if (d.tdinvon !== undefined) return act(() => C.api(`/tenders/${T.id}/invites/${d.tdinvon}`, { method: "PUT", body: { on: t.checked } }));
    if (d.tdinvph !== undefined) return act(() => C.api(`/tenders/${T.id}/invites/${d.tdinvph}`, { method: "PUT", body: { phone: t.value } }));
    return null;
  }
  function onKey(e) {
    if (!T.on) return;
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("[data-tdopen]")) { e.preventDefault(); loadOne(Number(e.target.dataset.tdopen)); }
  }

  window.TP_TENDER = {
    configure(o) { C = { ...C, ...o }; },
    mount(root) { root.addEventListener("click", onClick); root.addEventListener("input", onInput); root.addEventListener("change", onChange); root.addEventListener("keydown", onKey); },
    /** تب پیدا شد/پنهان شد — نظرسنجی فقط وقتی پیداست */
    active(on) { const was = T.on; T.on = !!on; if (on && !was) loops(true); if (!on && was) loops(false); },
    load(force) { if (T.id) return loadOne(T.id, !force ? true : false); if (!T.w && (force || !T.list)) return loadList(); return null; },
    view() { return T.w ? vWizard() : T.id ? vDetail() : vList(); },
    live: () => !!(T.list && T.list.some((x) => x.state === "live")),
  };
})();
