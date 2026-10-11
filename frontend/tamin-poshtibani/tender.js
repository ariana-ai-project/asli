/* ============================================================
   صفحهٔ مناقصهٔ تأمین‌کننده (مهر ۱۴۰۵، درخواست مالک) — مزایدهٔ معکوسِ زنده
   لینکِ پیامکِ دعوت: tender.html#t=<کد>. ورود هر بار با شمارهٔ همراه و رمزِ شش‌رقمیِ پیامکی (نشست فقط در همین زبانه).
   قیمتِ واحد را پایین می‌آورید؛ کمترین قیمت در پایان برنده است. پیشنهادِ دقیقه‌های آخر مناقصه را تمدید می‌کند.
   پیش از ثبت، مبلغ با حروف و جمعِ کل در پنجرهٔ «مطمئنید؟» می‌آید (ضدِ صفرِ جاافتاده). سرور: worker/tender.js.
   ============================================================ */
(function () {
  "use strict";
  const TP = window.TP, UI = TP.ui, D = window.TDUI;
  const { esc, fa, money, short } = D;
  const app = document.getElementById("app");
  const store = (st) => ({ get(k) { try { return st.getItem(k) || ""; } catch (_) { return ""; } }, set(k, v) { try { if (v) st.setItem(k, v); else st.removeItem(k); } catch (_) { /* حالت خصوصی */ } } });
  const ss = store(window.sessionStorage), ls = store(window.localStorage);
  const hp = new URLSearchParams(location.hash.slice(1));
  let code = String(hp.get("t") || "").toLowerCase().replace(/[^0-9a-f]/g, "");
  if (code) ss.set("td.code", code); else code = ss.get("td.code");

  const S = { tok: code ? ss.get(`td.tok.${code}`) : "", info: null, v: null, off: 0, mkt: null, calc: {}, draft: "", busy: false, prev: null, poll: null, tick: null, mktT: null, title: document.title };
  try { S.calc = JSON.parse(ss.get("td.calc") || "{}") || {}; } catch (_) { S.calc = {}; }
  const api = (path, opt = {}) => TP.api(`/tender/${code}${path}`, { ...opt, headers: { ...(opt.headers || {}), ...(S.tok ? { "X-Tender-Token": S.tok } : {}) } });
  const now = () => Date.now() + S.off;
  const setTok = (t) => { S.tok = t || ""; ss.set(`td.tok.${code}`, S.tok); };

  /* ---------- ورود ---------- */
  function timingOf(I) {
    if (!I) return "";
    if (I.state === "scheduled") return `شروع: ${D.when(I.start_at)}`;
    if (I.state === "live") return `در جریان — ${D.clock(I.end_at - now())} مانده`;
    if (I.state === "ended") return "این مناقصه تمام شده است؛ برای دیدنِ نتیجه وارد شوید.";
    if (I.state === "cancelled") return "این مناقصه لغو شده است.";
    return "";
  }
  function renderLogin(msg, ok) {
    stopLoops();
    UI.mountBg("fog");
    const I = S.info || {};
    app.innerHTML = `<div class="tp-auth"><form class="tp-auth-card td-login" novalidate>
      <div class="tp-auth-head"><div class="tp-auth-brand"><img src="../assets/logo-new.jpg" alt=""><div><b>${esc(I.company || "تونل سد آریانا")}</b><span>مناقصهٔ خرید</span></div></div>${UI.themeBtn()}</div>
      <h1>ورود به مناقصه</h1><p class="tp-auth-sub">${I.state ? `${D.stChip(I.state)} ` : ""}${esc(timingOf(I))}</p>
      <input id="ph" class="tp-auth-pass" type="tel" inputmode="tel" autocomplete="tel" placeholder="شمارهٔ همراه — همان که پیامکِ دعوت را گرفت" aria-label="شمارهٔ همراه" dir="ltr" value="${esc(ls.get("td.phone"))}">
      <button type="button" class="tp-btn" data-sendpass style="width:100%;justify-content:center;margin-top:10px">📱 ارسال رمز به پیامک</button>
      <input id="pw" class="tp-auth-pass" type="password" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="رمز شش‌رقمی" aria-label="رمز شش‌رقمی" dir="ltr" style="margin-top:10px">
      <button class="tp-auth-go" type="submit" data-login><span class="tp-go-3d" aria-hidden="true"><i></i><i></i><i></i></span><span>ورود</span></button>
      <div class="tp-auth-err ${ok ? "ok" : ""}" role="alert" aria-live="polite">${esc(msg || "")}</div>
      <div class="tp-auth-foot"><span class="dim" style="font-size:.78rem">برای امنیت، هر بار ورود رمز می‌خواهد.</span><button type="button" data-help="login.tender">راهنما</button></div></form></div>`;
    UI.help.set("login.tender");
    const f = app.querySelector("form"), err = app.querySelector(".tp-auth-err");
    const setErr = (m, good) => { err.textContent = m || ""; err.classList.toggle("ok", !!good); };
    const ph = () => app.querySelector("#ph").value.trim();
    app.querySelector("[data-sendpass]").onclick = async (e) => {
      const b = e.currentTarget;
      if (!ph()) { setErr("اول شمارهٔ همراه را بنویسید."); return app.querySelector("#ph").focus(); }
      b.disabled = true; setErr("");
      try { const d = await api("/pass", { body: { phone: ph() } }); ls.set("td.phone", ph()); setErr(`رمز به ${fa(d.to)} پیامک شد.`, true); app.querySelector("#pw").focus(); }
      catch (x) { setErr(x.message); }
      setTimeout(() => { b.disabled = false; }, 4000);
    };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const pw = D.latin(app.querySelector("#pw").value).replace(/\D/g, "");
      if (!ph()) return setErr("شمارهٔ همراه را بنویسید.");
      if (pw.length !== 6) return setErr("رمز شش رقم است.");
      const go = app.querySelector("[data-login]"); go.disabled = true; setErr("");
      try { const d = await api("/login", { body: { phone: ph(), pass: pw } }); ls.set("td.phone", ph()); setTok(d.token); await loadState(); }
      catch (x) { setErr(x.message); go.disabled = false; }
    };
    if (!S.info || S.info.state === "live" || S.info.state === "scheduled") S.tick = setInterval(() => { const p = app.querySelector(".tp-auth-sub"); if (p && S.info) p.innerHTML = `${D.stChip(S.info.state)} ${esc(timingOf(S.info))}`; }, 1000);
  }

  /* ---------- وضعیت و نظرسنجی ---------- */
  async function loadState() {
    const v = await api("/state");
    accept(v, true);
    startLoops();
  }
  function accept(v, first) {
    const was = S.v;
    S.off = (v.now || Date.now()) - Date.now();
    S.v = v;
    if (!first && was) notify(was, v);
    renderMain();
  }
  /** خبرِ تغییرها: پیشتازی از دست رفت، تمدید، پایان */
  function notify(a, b) {
    const ta = a.tender, tb = b.tender;
    if (a.me.lead && !b.me.lead && tb.state === "live") {
      UI.success("قیمتِ پایین‌تری ثبت شد");
      try { if (navigator.vibrate) navigator.vibrate([120, 60, 120]); } catch (_) { /* بی‌اهمیت */ }
      if (document.hidden) document.title = "⚠️ قیمتِ پایین‌تر ثبت شد — مناقصه";
      S.flash = true;
    } else if (a.best && b.best && b.best.amount < a.best.amount) S.flash = true;
    if (tb.ext_count > ta.ext_count) UI.success(`⏱ مناقصه تمدید شد — ${D.clock(tb.end_at - now())} مانده`);
    if (ta.state !== tb.state && tb.state === "ended") UI.success(tb.winner === "you" ? "🎉 برندهٔ مناقصه شما هستید" : "مناقصه تمام شد");
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { document.title = S.title; if (S.v) poll(); } });
  async function poll() {
    if (!S.tok || !S.v || S.busy) return;
    try {
      const r = await api(`/state?rev=${S.v.tender.rev}`);
      if (r.same) { S.off = r.now - Date.now(); return; }
      accept(r);
    } catch (e) {
      if (e.status === 401 || e.status === 403) { setTok(""); return boot(e.status === 403 ? e.message : "نشستِ شما تمام شده است؛ دوباره وارد شوید."); }
    }
  }
  function stopLoops() { clearInterval(S.poll); clearInterval(S.tick); clearInterval(S.mktT); S.poll = S.tick = S.mktT = null; }
  function startLoops() {
    stopLoops();
    const every = () => (S.v && S.v.tender.state === "live" ? 2000 : 8000);
    let last = 0;
    S.poll = setInterval(() => { if (document.hidden) return; if (Date.now() - last >= every()) { last = Date.now(); poll(); } }, 1000);
    S.tick = setInterval(tick, 1000);
    loadMarket(); S.mktT = setInterval(loadMarket, 60000);
  }
  /** شمارشِ ثانیه‌ای بی رسمِ دوباره؛ رسیدنِ شروع یا پایان ← نظرسنجیِ فوری */
  function tick() {
    if (!S.v) return;
    const t = S.v.tender, n = now();
    if (t.state === "live") {
      D.tickRing(app, t.end_at - n, Math.max(1, t.end_at - t.start_at));
      if (n >= t.end_at) poll();
    } else if (t.state === "scheduled") {
      D.tickRing(app, t.start_at - n, Math.max(1, t.start_at - (S.ref || n)));
      if (n >= t.start_at) poll();
    }
  }
  async function loadMarket() {
    try { S.mkt = await TP.api("/tender/market"); } catch (_) { S.mkt = { ok: false }; }
    const box = app.querySelector("[data-mkt]"); if (box) box.innerHTML = D.market(S.mkt);
    const rate = D.dollar(S.mkt), cb = app.querySelector("[data-calcbox]");
    if (cb && rate && !cb.dataset.rate) { cb.dataset.rate = "1"; cb.innerHTML = D.calc(calcVals(), rate); }
  }

  /* ---------- رسم ---------- */
  const pctTxt = (a, b) => (b ? `${fa(((1 - a / b) * 100).toFixed(1).replace(".", "٫"))}٪` : "");
  function calcVals() {
    const v = S.v, t = v.tender;
    return { cost: S.calc.cost || "", usd: S.calc.usd || "", price: S.calc.price || String(v.me.best || (v.best ? t.range.max : t.start_price) || ""), qty: S.calc.qty || String(t.qty) };
  }
  function heroHtml() {
    const v = S.v, t = v.tender, me = v.me, best = v.best, n = now();
    const ring = t.state === "live" ? D.ring(t.end_at - n, Math.max(1, t.end_at - t.start_at), "تا پایان")
      : t.state === "scheduled" ? D.ring(t.start_at - n, Math.max(1, t.start_at - n), "تا شروع") : D.ring(0, 1, D.ST[t.state]);
    let meChip;
    if (t.state === "ended") meChip = t.winner === "you" ? `<span class="td-me lead">🎉 برندهٔ مناقصه شما هستید</span>` : `<span class="td-me none">مناقصه تمام شد${me.rank ? ` — رتبهٔ شما ${fa(me.rank)}` : ""}</span>`;
    else if (t.state === "cancelled") meChip = `<span class="td-me none">این مناقصه لغو شد${t.cancel_reason ? `: ${esc(t.cancel_reason)}` : ""}</span>`;
    else if (me.lead) meChip = `<span class="td-me lead">🏆 شما پیشتازید</span>`;
    else if (me.rank) meChip = `<span class="td-me out">رتبهٔ شما ${fa(me.rank)} — بهترینِ شما ${money(me.best)}</span>`;
    else meChip = `<span class="td-me none">هنوز پیشنهاد نداده‌اید</span>`;
    const cls = t.state === "live" ? (me.lead ? "lead" : me.rank ? "out" : "") : t.winner === "you" ? "lead" : "";
    return `<section class="td-card td-hero ${cls}">${ring}
      <div class="td-best"><span class="cap">${best ? "کمترین قیمتِ فعلی — هر " + esc(t.unit) : "قیمتِ شروع — هر " + esc(t.unit)}</span>
        <span class="num ${S.flash ? "flash" : ""}">${money(best ? best.amount : t.start_price)}<small>ریال</small></span>
        <span class="sub">${best ? `<span>جمع: <b>${short(best.amount * t.qty)}</b> ریال</span><span><b>${pctTxt(best.amount, t.start_price)}</b> زیرِ قیمتِ شروع</span><span>${best.mine ? "مالِ شما" : esc(best.label)}</span>` : `<span>هنوز پیشنهادی ثبت نشده — اولین نفر باشید</span>`}
          ${t.ext_count ? `<span class="td-ext">⏱ ${fa(t.ext_count)} بار تمدید</span>` : ""}</span>${meChip}</div></section>`;
  }
  function bidHtml() {
    const v = S.v, t = v.tender, r = t.range, me = v.me;
    const fixes = (v.fixes || []).map((x) => `<div class="tp-note warn">پشتیبانی پیشنهادِ ${money(x.orig_amount)} ریالِ شما را ${x.state === "void" ? "باطل کرد" : `به ${money(x.amount)} ریال اصلاح کرد`}${x.reason ? ` — علت: ${esc(x.reason)}` : ""}</div>`).join("");
    let body;
    if (t.state === "scheduled") body = `<div class="td-lock">${UI.ICON.clock}<b>مناقصه هنوز شروع نشده</b><span>شروع: ${esc(D.when(t.start_at))}</span></div>`;
    else if (t.state === "ended" || t.state === "cancelled") body = `<div class="td-lock">${UI.ICON.flag}<b>${t.state === "ended" ? (t.winner === "you" ? "برندهٔ این مناقصه شما هستید؛ همکارانِ تدارکات با شما تماس می‌گیرند." : "این مناقصه تمام شد.") : "این مناقصه لغو شد."}</b></div>`;
    else if (me.lead) body = `<div class="td-lock">${UI.ICON.check}<b>کمترین قیمت مالِ شماست</b><span>تا وقتی کسی پایین‌تر نرود لازم نیست کاری کنید؛ اگر رفت، همین‌جا خبردار می‌شوید.</span></div>`;
    else {
      const base = v.best ? v.best.amount : t.start_price;
      const q = (p) => Math.max(r.min, Math.min(r.max, Math.floor((base * (1 - p / 100)) / 1000) * 1000));
      const quick = [["حداکثرِ مجاز", r.max], ...(v.best ? [["۰٫۵٪ پایین‌تر", q(0.5)], ["۱٪ پایین‌تر", q(1)], ["۲٪ پایین‌تر", q(2)]] : [])].filter(([, a], i, all) => a >= r.min && all.findIndex((x) => x[1] === a) === i);
      body = `<div class="row"><input id="amt" class="td-amt" inputmode="numeric" autocomplete="off" placeholder="${esc(money(r.max))}" aria-label="قیمتِ واحدِ پیشنهادی به ریال" value="${esc(S.draft)}">
          <button type="button" class="td-go" data-bid disabled>ثبتِ پیشنهاد</button></div>
        <div class="td-words" data-words>${wordsLine(D.parseAmt(S.draft))}</div>
        <div class="td-quick">${quick.map(([l, a]) => `<button type="button" data-q="${a}" title="${esc(money(a))} ریال">${esc(l)}</button>`).join("")}</div>
        <div class="td-range"><div><small>حداکثرِ مجاز</small><b>${money(r.max)}</b></div><div><small>گامِ کاهش</small><b>${r.step ? money(r.step) : "—"}</b></div><div><small>کف</small><b>${money(r.floor)}</b></div></div>`;
    }
    return `<section class="td-card td-bid"><h3>ثبتِ پیشنهاد <span class="sub">قیمتِ واحد به ریال، بی ارزش افزوده</span>
        ${me.rank && t.state === "live" ? `<span class="end"><button type="button" class="tp-btn xs" data-fixreq>اشتباه زدم؟</button></span>` : ""}</h3>${fixes}${body}</section>`;
  }
  /** خطِ حروف و هشدارِ بازه زیرِ کادرِ مبلغ */
  function wordsLine(a) {
    if (!S.v || !(a > 0)) return `<span class="dim">مبلغ را بنویسید؛ همین‌جا با حروف نشان داده می‌شود.</span>`;
    const t = S.v.tender, r = t.range;
    const err = a > r.max ? `حداکثرِ مجاز ${money(r.max)} ریال است.` : a < r.floor ? `کمتر از کف (${money(r.floor)} ریال) پذیرفته نمی‌شود.` : a < r.min ? `هر پیشنهاد حداکثر ${fa(String(t.jump_pct).replace(".", "٫"))}٪ پایین‌تر از کمترین قیمت است: دست‌کم ${money(r.min)} ریال.` : "";
    return `<b>${esc(D.words(a))} ریال</b> · ${money(Math.round(a / 10))} تومان · جمع: ${short(a * t.qty)} ریال${err ? `<br><span class="err">${esc(err)}</span>` : ""}`;
  }
  const amtOk = (a) => { const r = S.v.tender.range; return a > 0 && a <= r.max && a >= r.min; };
  function bidsHtml() {
    const v = S.v, t = v.tender;
    const list = v.bids.map((b, i) => `<div class="td-b ${b.mine ? "me" : ""} ${i === 0 && v.best && b.amount === v.best.amount ? "best" : ""}">
        <span class="av" style="--av:${b.mine ? "#22c55e" : D.avColor(b.av)}" aria-hidden="true">${b.mine ? "ش" : fa(b.av)}</span>
        <span class="w"><b>${esc(b.label)}</b><small>${esc(D.hms(b.at))}${b.ext ? " · ⏱ تمدید" : ""}${b.fixed ? " · اصلاحِ پشتیبانی" : ""}</small></span>
        <span class="a"><b>${money(b.amount)}</b><small>${pctTxt(b.amount, t.start_price)} زیرِ شروع</small></span></div>`).join("");
    return `<section class="td-card"><h3>پیشنهادها <span class="sub">${fa(v.bids.length)} پیشنهاد · ${fa(v.bidders)} از ${fa(v.invited)} دعوت‌شده</span></h3>
      ${list ? `<div class="td-bids">${list}</div>` : `<div class="td-empty">هنوز پیشنهادی نیست.</div>`}</section>`;
  }
  function rulesHtml() {
    const t = S.v.tender, m = (s) => fa(Math.round(s / 60));
    return `<section class="td-card"><h3>قواعدِ این مناقصه</h3><ul class="td-rules">
      <li>• قیمتِ واحد را پایین می‌آورید؛ <b>کمترین قیمت در پایان برنده است</b>.</li>
      <li>• هر پیشنهاد دست‌کم <b>${fa(String(t.step_pct).replace(".", "٫"))}٪</b>${t.step_min ? ` (و دست‌کم ${money(t.step_min)} ریال)` : ""} پایین‌تر از کمترین قیمتِ فعلی.</li>
      <li>• هر پیشنهاد حداکثر <b>${fa(String(t.jump_pct).replace(".", "٫"))}٪</b> پایین‌تر از کمترین قیمت، و هیچ‌وقت کمتر از <b>${money(t.range.floor)}</b> ریال (کف).</li>
      ${t.ext_window_s && t.ext_s ? `<li>• پیشنهاد در <b>${m(t.ext_window_s)} دقیقهٔ آخر</b> پایان را تا <b>${m(t.ext_s)} دقیقه</b> بعد از آن جلو می‌برد${t.ext_max ? ` (حداکثر ${fa(t.ext_max)} بار)` : " — هر بار"}.</li>` : ""}
      <li>• نامِ تأمین‌کنندگان ${t.show_names ? "<b>پیداست</b>" : "<b>پنهان</b> است؛ دیگران شما را با شمارهٔ ناشناس می‌بینند"}.</li>
      ${t.terms ? `<li>• شرایط: ${esc(t.terms)}</li>` : ""}</ul></section>`;
  }
  function renderMain() {
    const v = S.v; if (!v) return;
    const t = v.tender, me = v.me;
    /* پیش‌نویسِ مبلغ و فوکوس با رسمِ دوباره نمی‌پرد */
    const was = document.getElementById("amt"), focus = was && document.activeElement === was;
    if (was) S.draft = was.value;
    UI.mountBg("");
    const top = UI.topbar({ title: "مناقصهٔ خرید", sub: esc(v.company || ""), home: "#", homeTitle: "",
      user: { name: me.name, sub: me.label, initial: String(me.name || "؟").trim()[0] },
      items: [{ label: "راهنما", icon: "help", attrs: 'data-help="tender.page"' }, "-", { label: "خروج", icon: "logout", attrs: "data-logout", cls: "danger" }] });
    app.innerHTML = `${top}<div class="td-wrap">
      <section class="td-card"><div class="td-head"><span class="ic" aria-hidden="true">${UI.ICON.box}</span>
        <div class="t"><h1>${esc(t.title)}</h1><div class="meta"><span>مقدار: <b>${fa(t.qty)} ${esc(t.unit)}</b></span>${t.item_code ? `<span>کدِ کالا: <b dir="ltr">${esc(t.item_code)}</b></span>` : ""}
          <span>قیمتِ شروع: <b>${money(t.start_price)}</b> ریال</span><span>${t.state === "scheduled" ? `شروع: <b>${esc(D.when(t.start_at))}</b>` : `پایان: <b>${esc(D.hms(t.end_at))}</b>`}</span></div></div>${D.stChip(t.state)}</div>
        ${t.spec ? `<details class="sv-spec" style="margin-top:10px"><summary>مشخصاتِ کالا</summary><p style="white-space:pre-wrap;margin:6px 0 0">${esc(t.spec)}</p></details>` : ""}</section>
      ${heroHtml()}
      <div class="td-grid"><div class="td-col">${bidHtml()}
          <section class="td-card"><h3>ماشین‌حسابِ سود و زیان</h3><div data-calcbox ${D.dollar(S.mkt) ? 'data-rate="1"' : ""}>${D.calc(calcVals(), D.dollar(S.mkt))}</div></section>${rulesHtml()}</div>
        <div class="td-col"><section class="td-card"><h3>روندِ قیمت <span class="sub">کمترین قیمت در طولِ مناقصه · نقطهٔ سبز: پیشنهادِ شما</span></h3>
            ${D.chart({ series: v.series, start: t.start_price, floor: t.range.floor, from: t.start_at, to: t.state === "live" ? now() : t.ended_at || t.end_at })}</section>
          ${bidsHtml()}
          <section class="td-card"><h3>بازارِ امروز <span class="sub">قیمتِ لحظه‌ای</span></h3><div data-mkt>${D.market(S.mkt)}</div></section></div></div></div>`;
    S.flash = false; S.ref = now();
    /* «؟» شناور روی دکمهٔ ثبت می‌افتاد؛ راهنما در منوی پروفایل است */
    UI.help.set("tender.page", { fab: false });
    const inp = document.getElementById("amt");
    if (inp) { syncAmt(inp); if (focus) { inp.focus(); const e = inp.value.length; try { inp.setSelectionRange(e, e); } catch (_) { /* بی‌اهمیت */ } } }
  }
  function syncAmt(inp) {
    const a = D.parseAmt(inp.value);
    const w = app.querySelector("[data-words]"); if (w) w.innerHTML = wordsLine(a);
    inp.classList.toggle("bad", !!inp.value && !amtOk(a));
    const b = app.querySelector("[data-bid]"); if (b) b.disabled = !amtOk(a) || S.busy;
  }

  /* ---------- پیشنهاد ---------- */
  function confirmBid(a) {
    const v = S.v, t = v.tender, best = v.best;
    const drop = best ? (1 - a / best.amount) * 100 : (1 - a / t.start_price) * 100;
    const digitsDiff = best && String(a).length !== String(best.amount).length;
    const warn = digitsDiff ? `تعدادِ رقم‌های این مبلغ با کمترین قیمتِ فعلی فرق دارد؛ صفرها را یک بار دیگر بشمارید.`
      : drop >= 3 ? `این پیشنهاد ${fa(drop.toFixed(1).replace(".", "٫"))}٪ پایین‌تر از ${best ? "کمترین قیمتِ فعلی" : "قیمتِ شروع"} است. آیا مطمئنید؟` : "";
    TP.modal("آیا مطمئنید؟", `<div class="td-confirm"><div class="big">${money(a)} <small>ریال</small></div><div class="wd">${esc(D.words(a))} ریال</div>
      <div class="kv"><span>هر ${esc(t.unit)}</span><b>${money(a)}</b><span>جمعِ کل (${fa(t.qty)} ${esc(t.unit)})</span><b>${money(a * t.qty)}</b>
        ${best ? `<span>نسبت به کمترینِ فعلی</span><b>${fa(drop.toFixed(2).replace(".", "٫"))}٪ پایین‌تر</b>` : ""}<span>معادلِ تومان</span><b>${money(Math.round(a / 10))}</b></div>
      ${warn ? `<div class="warn">⚠️ ${esc(warn)}</div>` : ""}<p class="dim" style="font-size:.8rem;margin:10px 0 0">پیشنهادِ ثبت‌شده پس گرفته نمی‌شود؛ اگر اشتباه شد «اشتباه زدم؟» را بزنید تا پشتیبانی بررسی کند.</p></div>`,
      () => sendBid(a), "بله، ثبت شود", "نه، اصلاح می‌کنم");
  }
  async function sendBid(a) {
    if (S.busy) return;
    S.busy = true;
    { const inp = document.getElementById("amt"); if (inp) syncAmt(inp); }
    try {
      const r = await api("/bid", { body: { amount: a } });
      S.draft = ""; const inp = document.getElementById("amt"); if (inp) inp.value = "";
      S.busy = false;
      accept(r.view, true);
      UI.success(r.extended ? "ثبت شد — مناقصه تمدید شد" : "پیشنهادِ شما ثبت شد");
    } catch (e) {
      S.busy = false;
      if (e.status === 401) { setTok(""); return boot("نشستِ شما تمام شده است؛ دوباره وارد شوید."); }
      if (e.data && e.data.view) accept(e.data.view, true);
      TP.modal("ثبت نشد", `<p>${esc(e.message)}</p>`, null, "باشد", "");
    }
  }
  function fixReq() {
    const d = TP.modal("اشتباه زدم", `<p class="dim" style="margin-top:0">بنویسید کدام پیشنهاد اشتباه است و مبلغِ درست چیست. پشتیبانی همین حالا خبردار می‌شود و بررسی می‌کند.</p>
      <textarea class="tp-input" data-fixnote style="width:100%;min-height:90px" maxlength="400" placeholder="مثلاً: پیشنهادِ ۹۸٬۰۰۰ را اشتباه زدم؛ درستش ۹۸۰٬۰۰۰ است"></textarea>`, async () => {
      const note = (d.querySelector("[data-fixnote]") || {}).value || "";
      try { await api("/fixreq", { body: { note } }); UI.success("به پشتیبانی خبر داده شد"); }
      catch (e) { TP.modal("نشد", `<p>${esc(e.message)}</p>`, null, "باشد", ""); }
    }, "بفرست", "انصراف");
  }

  /* ---------- رفتارها ---------- */
  app.addEventListener("input", (e) => {
    const t = e.target;
    if (t.id === "amt") {
      const digits = D.latin(t.value).replace(/[^\d]/g, "");
      t.value = digits ? Number(digits).toLocaleString("en-US") : "";
      S.draft = t.value; syncAmt(t);
    } else if (t.dataset.calc) {
      S.calc[t.dataset.calc] = t.value; ss.set("td.calc", JSON.stringify(S.calc));
      const box = app.querySelector("[data-calcbox]"); if (!box) return;
      const tmp = document.createElement("div"); tmp.innerHTML = D.calc(calcVals(), D.dollar(S.mkt));
      box.querySelector(".res").innerHTML = tmp.querySelector(".res").innerHTML;
      const cost = box.querySelector('[data-calc="cost"]'); if (cost) cost.disabled = !!S.calc.usd && !!D.dollar(S.mkt);
    }
  });
  app.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.id === "amt") { e.preventDefault(); const b = app.querySelector("[data-bid]"); if (b && !b.disabled) b.click(); } });
  app.addEventListener("click", (e) => {
    const t = e.target.closest("[data-bid],[data-q],[data-logout],[data-fixreq]");
    if (!t || t.disabled) return;
    if (t.dataset.q) { const inp = document.getElementById("amt"); if (inp) { inp.value = Number(t.dataset.q).toLocaleString("en-US"); S.draft = inp.value; syncAmt(inp); inp.focus(); } return; }
    if (t.dataset.bid !== undefined) { const a = D.parseAmt((document.getElementById("amt") || {}).value); if (amtOk(a)) confirmBid(a); return; }
    if (t.dataset.fixreq !== undefined) return fixReq();
    if (t.dataset.logout !== undefined) {
      TP.modal("خروج", "<p>برای ورودِ دوباره رمز لازم است.</p>", async () => { try { await api("/logout", { body: {} }); } catch (_) { /* نشست از قبل باطل */ } setTok(""); S.v = null; boot("خارج شدید.", true); }, "خروج", "انصراف");
    }
  });

  /* ---------- شروع ---------- */
  async function boot(msg, ok) {
    stopLoops();
    if (!code) {
      UI.mountBg("fog");
      app.innerHTML = `<div class="tp-auth"><div class="tp-auth-card"><div class="tp-auth-head"><div class="tp-auth-brand"><img src="../assets/logo-new.jpg" alt=""><div><b>تونل سد آریانا</b><span>مناقصهٔ خرید</span></div></div>${UI.themeBtn()}</div>
        <h1>لینکِ مناقصه ناقص است</h1><p class="tp-auth-sub">لینک را از همان پیامکِ دعوت باز کنید.</p></div></div>`;
      return;
    }
    try { S.info = await api("/info"); S.off = S.info.now - Date.now(); }
    catch (e) {
      UI.mountBg("fog");
      app.innerHTML = `<div class="tp-auth"><div class="tp-auth-card"><div class="tp-auth-head"><div class="tp-auth-brand"><img src="../assets/logo-new.jpg" alt=""><div><b>تونل سد آریانا</b><span>مناقصهٔ خرید</span></div></div>${UI.themeBtn()}</div>
        <h1>مناقصه پیدا نشد</h1><p class="tp-auth-sub">${esc(e.message)}</p></div></div>`;
      return;
    }
    if (!S.tok) return renderLogin(msg, ok);
    try { await loadState(); }
    catch (e) { setTok(""); renderLogin(e.status === 401 ? "دوباره وارد شوید." : e.message); }
  }
  boot();
})();
