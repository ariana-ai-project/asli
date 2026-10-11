/* ============================================================
   تبِ «🔨 مناقصه» در پنل پشتیبانی (مهر ۱۴۰۵، درخواست مالک) — ساخت، دعوت و پایشِ زندهٔ مزایدهٔ معکوس
   • فهرستِ مناقصه‌ها (کارت)، «⚙️ تنظیمات» (پیش‌فرض‌های قواعد، شرایطِ پیش‌فرض، درگاهِ پیامک و پیامکِ آزمایشی) و «➕ مناقصهٔ تازه»
     در چهار گام: اقلام (یک یا چند قلم از سوابقِ خرید) · تأمین‌کنندگان (سوابقِ همان اقلام با تیک، شمارهٔ قابلِ ویرایش، افزودنِ دستی و
     جستجو در دفترچه) · قیمت‌ها و قواعد · بازبینی و «ساخت، شروع و ارسال دعوت».
   • نمای زنده: قلم‌های گروه، شمارشِ معکوس (و دورِ سربسته)، کمترین قیمت با نام، نمودار با خطِ سوابق، همهٔ پیشنهادها با «اصلاح» و
     «باطل»، فهرستِ دعوت با پیامک و «رمزِ تلفنی»، نمایش/پنهانِ نام‌ها، قواعد، پایان و لغو، گزارش (اکسل و PDF)، «ثبت در درخواست»
     و «🔎 جستجوی هوشمند در وب».
   window.TP_TENDER: configure({api, render, download, cmResult}) · mount(root) · view() · load(force) · active(on) · live()
   شنونده‌ها روی data-td* (یک بار روی #app). سرور: worker/tender.js (/support/tenders…).
   ============================================================ */
(function () {
  "use strict";
  const D = window.TDUI, TP = window.TP;
  const { esc, fa, money, short } = D;
  let C = { api: null, render: () => {}, download: null, cmResult: null };
  const T = {
    list: null, err: "", loading: false, filter: "", sms: null, cfg: null,
    id: null, d: null, dErr: "", sq: null, bhits: null, req: null,
    w: null,          /* جادوگرِ ساخت */
    poll: null, tick: null, on: false, off: 0,
  };
  const ICON = () => TP.ui.ICON;
  /** عددِ اعشاری با جداکنندهٔ فارسی (۰٫۵ نه ۰.۵ که در راست‌به‌چپ وارونه خوانده می‌شود) */
  const faD = (v) => fa(String(v == null ? "" : v).replace(".", "٫"));
  const now = () => Date.now() + T.off;
  const rerender = () => C.render();
  const nameKey = (s) => String(s || "").replace(/[يى]/g, "ی").replace(/ك/g, "ک").replace(/[‌\s]+/g, " ").trim().toLowerCase();
  const sw = (on, label, attrs) => TP.ui.switchEl({ on, label, attrs });

  /* ---------- بارگذاری ---------- */
  async function loadCfg() { try { T.cfg = await C.api("/tender-settings"); } catch (_) { /* با پیش‌فرض‌های جادوگر */ } }
  async function loadList() {
    T.loading = true; T.err = ""; rerender();
    try { const r = await C.api("/tenders"); T.list = r.tenders || []; T.sms = r.sms; T.off = r.now - Date.now(); } catch (e) { T.err = e.message; }
    if (!T.cfg) await loadCfg();
    T.loading = false; rerender();
  }
  async function loadOne(id, quiet) {
    if (!quiet) { T.id = id; T.d = null; T.dErr = ""; T.req = null; rerender(); }
    try { const d = await C.api(`/tenders/${id}`); if (T.id !== id) return; T.d = d; T.off = d.now - Date.now(); }
    catch (e) { if (!quiet) T.dErr = e.message; }
    rerender();
  }
  /** نظرسنجیِ نمای زنده هر سه ثانیه (فقط وقتی همین تب پیداست) و شمارشِ ثانیه‌ای */
  function loops(on) {
    clearInterval(T.poll); clearInterval(T.tick); T.poll = T.tick = null;
    if (!on) return;
    T.poll = setInterval(() => {
      if (document.hidden || !T.on || document.querySelector(".tp-modal-bg, .sup-ov, .tp-cmres")) return;
      const a = document.activeElement; if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;
      if (T.id && T.d && ["live", "scheduled", "sealed"].includes(T.d.tender.state)) loadOne(T.id, true);
      else if (!T.id && !T.w && T.list && T.list.some((x) => ["live", "scheduled", "sealed"].includes(x.state))) loadList();
    }, 3000);
    T.tick = setInterval(() => {
      if (!T.on) return;
      const t = T.d && T.d.tender; const root = document.getElementById("app");
      if (t && t.state === "live") D.tickRing(root, t.end_at - now(), Math.max(1, t.end_at - (t.sealed_end_at || t.start_at)));
      if (t && t.state === "sealed") D.tickRing(root, t.sealed_end_at - now(), Math.max(1, t.sealed_end_at - t.start_at));
      document.querySelectorAll("[data-tdleft]").forEach((el) => { el.textContent = D.clock(Number(el.dataset.tdleft) - now()); });
    }, 1000);
  }

  /* ---------- فهرست ---------- */
  const FILTERS = [["", "همه"], ["live", "در جریان"], ["sealed", "دورِ سربسته"], ["scheduled", "شروع‌نشده"], ["draft", "پیش‌نویس"], ["ended", "تمام‌شده"]];
  function timeLine(t) {
    if (t.state === "live") return `<span>تا پایان <b data-tdleft="${t.end_at}">${D.clock(t.end_at - now())}</b></span>`;
    if (t.state === "sealed") return `<span>سربسته تا <b data-tdleft="${t.sealed_end_at}">${D.clock(t.sealed_end_at - now())}</b></span>`;
    if (t.state === "scheduled") return `<span>تا شروع <b data-tdleft="${t.start_at}">${D.clock(t.start_at - now())}</b></span>`;
    if (t.state === "ended") return `<span>پایان: ${esc(D.when(t.ended_at || t.end_at))}</span>`;
    if (t.state === "cancelled") return `<span>لغو شد</span>`;
    return `<span>هنوز شروع نشده</span>`;
  }
  function card(t, i) {
    return `<article class="td-card td-item" data-tdopen="${t.id}" role="button" tabindex="0" style="--i:${Math.min(i, 12)}" aria-label="مناقصهٔ ${esc(t.title)}">
      <header><b>${esc(t.title)}</b>${t.lots > 1 ? `<span class="chip" title="مناقصهٔ چندقلمی">قلم ${fa(t.lot_no || 1)} از ${fa(t.lots)}</span>` : ""}${D.stChip(t.state)}</header>
      <div class="dim" style="font-size:.82rem;display:flex;gap:6px 14px;flex-wrap:wrap"><span>${fa(t.qty)} ${esc(t.unit)}</span>${timeLine(t)}${t.ext_count ? `<span class="td-ext">⏱ ${fa(t.ext_count)} تمدید</span>` : ""}${t.req_aid ? `<span class="chip ok">ثبت در درخواست</span>` : ""}</div>
      <div class="px"><div><small>قیمتِ شروع</small><b>${short(t.start_price)}</b></div><div><small>کمترین</small><b>${t.best_amount ? short(t.best_amount) : "—"}</b></div><div><small>شرکت‌کننده</small><b>${fa(t.bidders)} / ${fa(t.invited)}</b></div></div>
      ${t.best_name ? `<div style="font-size:.84rem">${t.state === "ended" ? "🏆 برنده" : "پیشتاز"}: <b>${esc(t.best_name)}</b></div>` : ""}</article>`;
  }
  function vList() {
    const L = (T.list || []).filter((t) => !T.filter || t.state === T.filter);
    const cnt = (k) => (T.list || []).filter((t) => !k || t.state === k).length;
    let h = `<div class="mg-bar"><button class="tp-btn primary" data-tdnew>${ICON().plus} مناقصهٔ تازه</button>
        <div class="tp-pills">${FILTERS.map(([k, l]) => cnt(k) || !k ? `<button type="button" class="tp-pill ${T.filter === k ? "on" : ""}" data-tdf="${k}">${l} <span class="n">${fa(cnt(k))}</span></button>` : "").join("")}</div>
        <span class="spacer"></span><span class="mg-count">${T.loading ? "…" : ""}</span><button class="tp-btn" data-tdcfg title="پیش‌فرض‌های قواعد و درگاهِ پیامک">${ICON().settings} تنظیمات</button></div>`;
    if (T.sms === false) h += `<div class="tp-note warn" style="margin:8px 18px 0">درگاه پیامک وصل نیست — دعوت‌ها و رمزها پیامک نمی‌شوند؛ «⚙️ تنظیمات» را ببینید یا از «رمزِ تلفنی» استفاده کنید.</div>`;
    if (T.err) h += `<div class="tp-note warn">${esc(T.err)}</div>`;
    if (!T.list) return h + `<div class="empty">در حال بارگذاری…</div>`;
    if (!L.length) return h + `<div class="lg-none">${ICON().flag}<b>${T.list.length ? "مناقصه‌ای در این دسته نیست" : "هنوز مناقصه‌ای نساخته‌اید"}</b>${T.list.length ? "" : `<button class="tp-btn primary" data-tdnew>${ICON().plus} اولین مناقصه</button>`}</div>`;
    return h + `<div class="td-list" style="padding:14px 18px 32px">${L.map(card).join("")}</div>`;
  }

  /* ---------- تنظیماتِ پشتیبان: پیش‌فرض‌ها و درگاهِ پیامک ---------- */
  const RULE_FIELDS = [["step_pct", "حداقلِ کاهشِ هر پیشنهاد (٪)", ""], ["step_min", "حداقلِ کاهش (ریال)", "اختیاری"], ["floor_pct", "کف: حداکثر کاهش از قیمتِ شروع (٪)", ""],
    ["jump_pct", "حداکثر کاهشِ یکباره (٪)", "ضدِ صفرِ جاافتاده"], ["ext_window_min", "پنجرهٔ تمدید (دقیقهٔ آخر)", ""], ["ext_min", "تمدید تا (دقیقه بعد)", ""],
    ["ext_max", "سقفِ دفعاتِ تمدید", "۰ = بی سقف"], ["outbid_gap_min", "فاصلهٔ دو پیامکِ «عقب افتادید» به یک نفر (دقیقه)", "۰ = هر بار"]];
  const SWITCHES = [["show_names", "نامِ تأمین‌کنندگان برای یکدیگر پیدا باشد"], ["show_prices", "کمترین قیمت پیدا باشد (خاموش = «فقط رتبه»)"], ["proxy_on", "«پیشنهادِ خودکار» مجاز باشد"],
    ["require_accept", "پیش از اولین پیشنهاد، پذیرشِ شرایط لازم باشد"], ["outbid_sms", "وقتی رتبهٔ کسی پایین آمد پیامک بگیرد"], ["thanks_sms", "در پایان به بقیه پیامِ تشکر برود"]];
  /** پیش‌فرض‌های سرور (ثانیه) → فیلدهای فرم (دقیقه) */
  function formOf(d) {
    const x = d || {};
    return { step_pct: String(x.step_pct ?? 0.5), step_min: x.step_min ? String(x.step_min) : "", floor_pct: String(x.floor_pct ?? 30), jump_pct: String(x.jump_pct ?? 10),
      ext_window_min: String(Math.round((x.ext_window_s ?? 180) / 6) / 10), ext_min: String(Math.round((x.ext_s ?? 180) / 6) / 10), ext_max: String(x.ext_max ?? 0),
      outbid_gap_min: String(Math.round((x.outbid_gap_s ?? 120) / 6) / 10), duration_min: String(Math.round((x.duration_s ?? 1800) / 60)), sealed_min: String(Math.round((x.sealed_s ?? 0) / 60)),
      show_names: !!x.show_names, show_prices: x.show_prices !== 0 && x.show_prices !== false, proxy_on: x.proxy_on !== 0 && x.proxy_on !== false, require_accept: !!x.require_accept,
      outbid_sms: x.outbid_sms !== 0 && x.outbid_sms !== false, thanks_sms: x.thanks_sms !== 0 && x.thanks_sms !== false };
  }
  const n0 = (v) => D.latin(String(v == null ? "" : v)).replace(/[,٬\s]/g, "").replace(/٫/g, ".");
  /** فرم → بدنهٔ سرور (ثانیه) */
  function rulesBody(f) {
    const m = (k) => String(Math.round((Number(n0(f[k])) || 0) * 60));
    return { step_pct: n0(f.step_pct), step_min: n0(f.step_min) || "0", floor_pct: n0(f.floor_pct), jump_pct: n0(f.jump_pct), ext_window_s: m("ext_window_min"), ext_s: m("ext_min"),
      ext_max: n0(f.ext_max) || "0", outbid_gap_s: m("outbid_gap_min"), show_names: !!f.show_names, show_prices: !!f.show_prices, proxy_on: !!f.proxy_on, require_accept: !!f.require_accept,
      outbid_sms: !!f.outbid_sms, thanks_sms: !!f.thanks_sms };
  }
  const ruleInputs = (f, attr) => RULE_FIELDS.map(([k, l, sub]) => `<label>${l}${sub ? ` <small>${sub}</small>` : ""}<input class="tp-input" ${attr}="${k}" value="${esc(faD(f[k]))}" inputmode="decimal"></label>`).join("");
  const ruleSwitches = (f, attr) => `<div class="td-sw">${SWITCHES.map(([k, l]) => sw(!!f[k], l, `${attr}="${k}"`)).join("")}</div>`;
  /** خواندنِ فرم از پنجره (ورودی‌ها و کلیدها) */
  function readForm(root, attr, base) {
    const f = { ...base };
    root.querySelectorAll(`[${attr}]`).forEach((el) => { const k = el.getAttribute(attr); f[k] = el.classList.contains("tp-switch") ? el.classList.contains("on") : el.value; });
    return f;
  }
  async function settingsDialog() {
    if (!T.cfg) await loadCfg(); else await Promise.race([loadCfg(), new Promise((r) => setTimeout(r, 400))]);
    const c = T.cfg || { defaults: {}, sms: {} }, f = formOf(c.defaults), s = c.sms || {};
    const dlg = TP.modal("⚙️ تنظیماتِ مناقصه", `<h4 class="sv-h" style="margin-top:0">پیش‌فرضِ قواعدِ مناقصهٔ تازه</h4>
      <div class="td-form">${ruleInputs(f, "data-tdc")}<label>مدت (دقیقه)<input class="tp-input" data-tdc="duration_min" value="${esc(fa(f.duration_min))}" inputmode="numeric"></label>
        <label>دورِ سربسته (دقیقه) <small>۰ = ندارد</small><input class="tp-input" data-tdc="sealed_min" value="${esc(fa(f.sealed_min))}" inputmode="numeric"></label></div>
      ${ruleSwitches(f, "data-tdc")}
      <label style="display:flex;flex-direction:column;gap:4px;margin-top:10px;font-size:.8rem;color:var(--tp-muted)">شرایطِ پیش‌فرض <small>تحویل، پرداخت، فاکتور… — در هر مناقصه قابلِ تغییر</small>
        <textarea class="tp-input" data-tdcterms style="min-height:70px">${esc(c.terms || "")}</textarea></label>
      <h4 class="sv-h">درگاهِ پیامک</h4>
      <div class="tp-note ${s.ready ? "" : "warn"}">${s.ready ? `وصل است — ${s.shared ? "همان درگاهِ TextBeeِ مکاتبات" : `TextBee با کلیدِ جدای مناقصه (${esc(s.key_tail)})`}${s.device ? ` · دستگاه ${esc(s.device)}` : ""}.` : "وصل نیست: نه کلیدِ مکاتبات ست شده و نه کلیدِ جدا."}</div>
      <div class="td-form" style="margin-top:8px"><label>کلیدِ API ویژهٔ مناقصه <small>خالی = همان کلیدِ مکاتبات</small><input class="tp-input" type="password" data-tdckey autocomplete="new-password" dir="ltr" placeholder="${s.own_key ? esc(s.key_tail) : "همان مکاتبات"}"></label>
        <label>شناسهٔ دستگاه <small>اختیاری</small><input class="tp-input" data-tdcdev dir="ltr" value="${esc(s.device || "")}"></label>
        <label>پیامکِ آزمایشی به<input class="tp-input" data-tdctest inputmode="tel" dir="ltr" placeholder="09…"></label></div>
      <div class="td-foot"><button type="button" class="tp-btn" data-tdctestgo>📱 پیامکِ آزمایشی</button>${s.own_key ? `<button type="button" class="tp-btn" data-tdcshared>برگشت به درگاهِ مکاتبات</button>` : ""}<span class="dim" data-tdcmsg style="font-size:.82rem"></span></div>`,
    async () => {
      const g = readForm(dlg, "data-tdc", f);
      const body = { defaults: { ...rulesBody(g), duration_s: String(Math.round((Number(n0(g.duration_min)) || 30) * 60)), sealed_s: String(Math.round((Number(n0(g.sealed_min)) || 0) * 60)) },
        terms: dlg.querySelector("[data-tdcterms]").value, sms: { device: dlg.querySelector("[data-tdcdev]").value } };
      const key = dlg.querySelector("[data-tdckey]").value.trim(); if (key) body.sms.key = key;
      try { T.cfg = await C.api("/tender-settings", { method: "PUT", body }); TP.ui.success("تنظیمات ذخیره شد"); loadList(); }
      catch (e) { TP.modal("نشد", esc(e.message), null, "باشد", ""); }
    }, "ذخیره", "انصراف");
    const msg = dlg.querySelector("[data-tdcmsg]");
    dlg.querySelector("[data-tdctestgo]").onclick = async (e) => {
      e.preventDefault(); msg.textContent = "…";
      try { await C.api("/tender-settings/test", { body: { phone: dlg.querySelector("[data-tdctest]").value } }); msg.textContent = "پیامک رفت؛ گوشی را ببینید."; }
      catch (x) { msg.textContent = x.message; }
    };
    const back = dlg.querySelector("[data-tdcshared]");
    if (back) back.onclick = async (e) => { e.preventDefault(); try { T.cfg = await C.api("/tender-settings", { method: "PUT", body: { sms: { key: "" } } }); msg.textContent = "برگشت به درگاهِ مکاتبات."; loadList(); } catch (x) { msg.textContent = x.message; } };
  }

  /* ---------- جادوگرِ ساخت ---------- */
  const STEPS = ["اقلام", "تأمین‌کنندگان", "قیمت‌ها و قواعد", "بازبینی"];
  const W0 = () => {
    const f = formOf(T.cfg && T.cfg.defaults);
    return { step: 0, q: "", hits: null, items: [], sups: [], loading: 0, extra: { name: "", phone: "" }, f: { ...f, start_in_min: "0", terms: (T.cfg && T.cfg.terms) || "" } };
  };
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
    if (!w.hits) return `<div class="dim" style="font-size:.84rem;margin-top:8px">دست‌کم دو حرف از نام یا کدِ کالا. برای مناقصهٔ چندقلمی چند قلم را یکی‌یکی بیفزایید.</div>`;
    if (!w.hits.length) return `<div class="dim" style="font-size:.84rem;margin-top:8px">در سوابقِ خرید پیدا نشد؛ «قلمِ بی‌سابقه» را بزنید.</div>`;
    return `<div class="td-hits">${w.hits.map((x) => { const on = w.items.some((i) => i.item_code === x.item_code);
      return `<button type="button" class="td-hit ${on ? "on" : ""}" data-tditem="${esc(x.item_code)}" ${on ? "disabled" : ""}>
        <b>${esc(x.title)}</b><small dir="ltr">${esc(x.item_code)}</small><small>${fa(x.n)} خرید · ${fa(x.sups)} تأمین‌کننده · آخرین ${esc(fa(x.last || ""))}</small><span class="chip">${on ? "افزوده شد" : "افزودن"}</span></button>`; }).join("")}</div>`;
  };
  function paintHits() { const box = document.querySelector("[data-tdhits]"); if (box) box.innerHTML = hitsHtml(); }
  /** تأمین‌کنندگانِ سوابقِ یک قلم در فهرستِ دعوت ادغام می‌شوند (هر نام یک بار، با اقلامِ فروخته‌اش) */
  function mergeSups(list, title) {
    const w = T.w;
    for (const s of list) {
      const k = nameKey(s.name), have = w.sups.find((x) => nameKey(x.name) === k);
      if (have) { have.n = (have.n || 0) + (s.n || 0); have.items = [...new Set([...(have.items || []), title])]; if (!have.phone && s.phone) have.phone = s.phone; }
      else w.sups.push({ ...s, on: true, phone: s.phone || "", source: "history", items: [title] });
    }
  }
  async function addItem(code) {
    const w = T.w, x = (w.hits || []).find((h) => h.item_code === code); if (!x || w.items.some((i) => i.item_code === code)) return;
    w.items.push({ item_code: x.item_code, item_title: x.title, title: x.title, unit: x.unit || "", qty: "", start_price: "", spec: "", n: x.n });
    w.loading++; rerender();
    try { const r = await C.api(`/tender-suppliers?code=${encodeURIComponent(code)}`); if (T.w === w) mergeSups(r.suppliers || [], x.title); }
    catch (e) { TP.modal("نشد", esc(e.message), null, "باشد", ""); }
    w.loading--; if (T.w === w) rerender();
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
  const SMS_FA = { sent: ["ok", "پیامک رفت"], off: ["warn", "درگاه خاموش"], error: ["bad", "نرسید"], nophone: ["warn", "بی‌شماره"] };
  const smsChip = (s) => (s.sms_state ? `<span class="chip ${SMS_FA[s.sms_state] ? SMS_FA[s.sms_state][0] : ""}" title="${esc(s.sms_err || (s.sms_at ? D.when(s.sms_at) : ""))}">${esc(SMS_FA[s.sms_state] ? SMS_FA[s.sms_state][1] : s.sms_state)}</span>` : `<span class="chip">دعوت نرفته</span>`);
  function supRow(s, i, mode) {
    const off = !s.on;
    const sub = mode === "w"
      ? `${s.n ? `${fa(s.n)} خرید${s.last ? ` · آخرین ${esc(fa(s.last))}` : ""}` : esc(s.source === "smart" ? "جستجوی هوشمند" : s.source === "book" ? "دفترچه" : "دستی")}${s.grade ? ` · ردهٔ ${esc(s.grade)}` : ""}${(s.items || []).length > 1 ? ` · ${fa(s.items.length)} قلم` : ""}`
      : `${esc(s.label)}${s.rank ? ` · رتبهٔ ${fa(s.rank)} — ${money(s.best)}` : ""}${s.seen_at ? " · وارد شد" : ""}${s.proxy_min ? ` · 🤖 خودکار تا ${money(s.proxy_min)}` : ""}${s.accepted_at ? " · شرایط را پذیرفت" : ""}${s.notify_off ? " · پیامکِ رتبه را بسته" : ""}${s.outbid_n ? ` · ${fa(s.outbid_n)} پیامکِ رتبه` : ""}`;
    return `<div class="td-sup ${off ? "off" : ""}"><input type="checkbox" ${s.on ? "checked" : ""} ${mode === "w" ? `data-tdson="${i}"` : `data-tdinvon="${s.alias}"`} aria-label="دعوتِ ${esc(s.name)}">
      <span class="w"><b>${esc(s.name)}</b><small>${sub}</small></span>
      <input class="tp-input ph ${!s.phone ? "bad" : phoneBad(s.phone) ? "bad" : ""}" ${mode === "w" ? `data-tdsph="${i}"` : `data-tdinvph="${s.alias}"`} value="${esc(s.phone || "")}" placeholder="${s.phone ? "" : "شماره ندارد"}" inputmode="tel" dir="ltr" aria-label="شمارهٔ ${esc(s.name)}">
      <span class="tags">${mode === "w" ? (s.phones && s.phones.length > 1 ? `<span class="chip" title="${esc(s.phones.map((p) => `${p.phone}${p.label ? ` (${p.label})` : ""}`).join("، "))}">${fa(s.phones.length)} شماره</span>` : "")
        : `${smsChip(s)}<button type="button" class="tp-btn xs" data-tdpass="${s.alias}" title="رمزی بسازید و تلفنی به او بگویید">رمزِ تلفنی</button>${s.phone && s.on ? `<button type="button" class="tp-btn xs" data-tdresend="${s.alias}">پیامک</button>` : ""}`}</span></div>`;
  }
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
  function priceHint(it) {
    const a = D.parseAmt(it.start_price), q = Number(D.latin(it.qty)) || 0;
    return a > 0 ? `${esc(D.words(a))} ریال${q ? ` · جمع: ${short(a * q)}` : ""} · کف: ${money(Math.ceil(a * (1 - (Number(n0(T.w.f.floor_pct)) || 0) / 100)))}` : "سقفِ قیمتِ واحد (ریال)";
  }
  function itemRow(it, i) {
    return `<div class="td-irow"><label class="dim" style="font-size:.78rem">عنوان<input class="tp-input" data-tdit="${i}:title" value="${esc(it.title)}">${it.item_code ? `<small dir="ltr">${esc(it.item_code)}</small>` : ""}</label>
      <label class="dim" style="font-size:.78rem">مقدار<input class="tp-input" data-tdit="${i}:qty" value="${esc(it.qty)}" inputmode="decimal"></label>
      <label class="dim" style="font-size:.78rem">واحد<input class="tp-input" data-tdit="${i}:unit" value="${esc(it.unit)}"></label>
      <label class="dim" style="font-size:.78rem">قیمتِ شروع (ریال)<input class="tp-input" data-tdit="${i}:start_price" value="${esc(it.start_price)}" inputmode="numeric" dir="ltr" style="font-weight:800"><small data-tdith="${i}">${priceHint(it)}</small></label>
      <button type="button" class="tp-icon-btn sm" data-tditdel="${i}" title="برداشتنِ این قلم" aria-label="برداشتنِ ${esc(it.title)}">${ICON().x}</button>
      <label class="dim" style="font-size:.78rem;grid-column:1/-1">مشخصاتِ کالا <small>بعد از ورود دیده می‌شود، نه در پیامک</small><input class="tp-input" data-tdit="${i}:spec" value="${esc(it.spec)}"></label></div>`;
  }
  function vWizard() {
    const w = T.w, f = w.f;
    const steps = `<div class="td-steps">${STEPS.map((s, i) => `<span class="${i === w.step ? "on" : i < w.step ? "done" : ""}">${fa(i + 1)}. ${s}</span>`).join("")}</div>`;
    let body = "";
    if (w.step === 0) {
      body = `<div class="td-form"><label class="wide">نام یا کدِ کالا (در سوابقِ خرید)<input class="tp-input" data-tdq value="${esc(w.q)}" placeholder="مثلاً میلگرد ۱۶" autocomplete="off" autofocus></label></div>
        ${w.items.length ? `<div class="td-chips">${w.items.map((it, i) => `<button type="button" class="mg-chip" data-tditdel="${i}" title="برداشتن">${esc(it.title)} ${ICON().x}</button>`).join("")}</div>` : ""}
        <div data-tdhits>${hitsHtml()}</div>
        <div class="td-foot"><button class="tp-btn" data-tdfree>قلمِ بی‌سابقه (نامِ نوشته‌شده)</button><span class="spacer"></span><button class="tp-btn" data-tdcancelw>انصراف</button>
          <button class="tp-btn primary" data-tdstep="1" ${w.items.length ? "" : "disabled"}>تأمین‌کنندگان ←</button></div>`;
    } else if (w.step === 1) {
      const S = w.sups;
      body = `<div class="dim" style="font-size:.86rem;margin-bottom:8px">تأمین‌کنندگانِ سوابقِ ${w.items.length > 1 ? `${fa(w.items.length)} قلم` : `«${esc(w.items[0].title)}»`} — تیک‌خورده‌ها دعوت می‌شوند؛ شمارهٔ هر کدام را می‌شود عوض کرد یا گذاشت.</div>
        ${w.loading ? `<div class="empty">در حال خواندنِ سوابق…</div>` : S.length ? `<div class="td-sups">${S.map((s, i) => supRow(s, i, "w")).join("")}</div>` : `<div class="dim">کسی در سوابق نیست؛ دستی یا از دفترچه بیفزایید.</div>`}
        ${addBox("w")}
        <div class="td-foot"><button class="tp-btn" data-tdstep="0">→ اقلام</button><span class="spacer"></span><span class="dim">${fa(S.filter((s) => s.on).length)} نفر تیک خورده</span><button class="tp-btn primary" data-tdstep="2">قیمت‌ها و قواعد ←</button></div>`;
    } else if (w.step === 2) {
      body = `<h4 class="sv-h" style="margin-top:0">${w.items.length > 1 ? `اقلام <span class="chip">${fa(w.items.length)} قلم — هر کدام مزایدهٔ خودش، با یک دعوت و یک ورود</span>` : "قلم"}</h4>
        <div class="td-items">${w.items.map(itemRow).join("")}</div>
        <h4 class="sv-h">زمان</h4>
        <div class="td-form">${fld("start_in_min", "شروع چند دقیقهٔ دیگر", "۰ = همین حالا", 'inputmode="numeric"')}${fld("sealed_min", "دورِ سربسته (دقیقه)", "۰ = ندارد", 'inputmode="numeric"')}${fld("duration_min", "مدتِ دورِ زنده (دقیقه)", "", 'inputmode="numeric"')}</div>
        <h4 class="sv-h">قواعد</h4>
        <div class="td-form">${RULE_FIELDS.map(([k, l, sub]) => fld(k, l, sub, 'inputmode="decimal"')).join("")}</div>
        ${ruleSwitches(f, "data-tdwsw")}
        <label style="display:flex;flex-direction:column;gap:4px;margin-top:10px;font-size:.8rem;color:var(--tp-muted)">شرایط <small>زمان و محلِ تحویل، پرداخت، فاکتور…</small><textarea class="tp-input" data-tdfld="terms" rows="2">${esc(f.terms)}</textarea></label>
        <div class="td-foot"><button class="tp-btn" data-tdstep="1">→ تأمین‌کنندگان</button><span class="spacer"></span><button class="tp-btn primary" data-tdstep="3">بازبینی ←</button></div>`;
    } else {
      const on = w.sups.filter((s) => s.on), noPh = on.filter((s) => !String(s.phone || "").trim());
      body = `<div class="td-card" style="padding:14px"><h3>${w.items.length > 1 ? `مناقصهٔ ${fa(w.items.length)} قلمی` : esc(w.items[0].title)}</h3>
          <div class="td-items">${w.items.map((it) => `<div class="td-range" style="margin-top:0"><div><small>قلم</small><b>${esc(it.title)}</b></div><div><small>مقدار</small><b>${fa(it.qty)} ${esc(it.unit)}</b></div><div><small>قیمتِ شروع</small><b>${money(D.parseAmt(it.start_price))}</b></div></div>`).join("")}</div>
          <ul class="td-rules" style="margin-top:10px"><li>• شروع: <b>${Number(n0(f.start_in_min)) ? `${fa(f.start_in_min)} دقیقهٔ دیگر` : "همین حالا"}</b>${Number(n0(f.sealed_min)) ? ` · دورِ سربسته <b>${fa(f.sealed_min)}</b> دقیقه` : ""} · دورِ زنده <b>${fa(f.duration_min)}</b> دقیقه</li>
            <li>• گام: <b>${faD(f.step_pct)}٪</b>${n0(f.step_min) && n0(f.step_min) !== "0" ? ` (حداقل ${money(D.parseAmt(f.step_min))} ریال)` : ""} · کف: <b>${faD(f.floor_pct)}٪</b> زیرِ شروع · پرشِ یکباره: <b>${faD(f.jump_pct)}٪</b></li>
            <li>• تمدید: پیشنهاد در <b>${faD(f.ext_window_min)}</b> دقیقهٔ آخر ← <b>${faD(f.ext_min)}</b> دقیقه بعد${Number(n0(f.ext_max)) ? ` (حداکثر ${fa(f.ext_max)} بار)` : " — هر بار"}</li>
            <li>• نام‌ها: <b>${f.show_names ? "پیدا" : "پنهان"}</b> · قیمت‌ها: <b>${f.show_prices ? "پیدا" : "فقط رتبه"}</b> · خودکار: <b>${f.proxy_on ? "مجاز" : "بسته"}</b>${f.require_accept ? " · <b>پذیرشِ شرایط لازم</b>" : ""}</li>
            <li>• پیامکِ «رتبهٔ شما پایین آمد»: <b>${f.outbid_sms ? `روشن (هر ${faD(f.outbid_gap_min)} دقیقه حداکثر یکی)` : "خاموش"}</b> · پیامِ تشکرِ پایان: <b>${f.thanks_sms ? "روشن" : "خاموش"}</b></li>
            <li>• دعوت: <b>${fa(on.length)}</b> نفر${noPh.length ? ` — <span style="color:#fcd34d">${fa(noPh.length)} نفر شماره ندارند (پیامک نمی‌گیرند)</span>` : ""}</li></ul>
          <div class="tp-note" style="margin-top:10px">متنِ پیامکِ دعوت فقط لینک و زمان است — نامِ کالا و مقدار در آن نمی‌آید.</div></div>
        <div class="td-foot"><button class="tp-btn" data-tdstep="2">→ قیمت‌ها و قواعد</button><span class="spacer"></span>
          <button class="tp-btn" data-tdcreate="draft">ذخیرهٔ پیش‌نویس</button><button class="tp-btn primary" data-tdcreate="go">🚀 ساخت، شروع و ارسال دعوت</button></div>`;
    }
    return `<div class="sv-exone" style="max-width:1080px"><div class="mg-bar" style="padding:0"><button class="tp-btn sm" data-tdcancelw>→ همهٔ مناقصه‌ها</button><h2 style="margin:0;font-size:1.1rem">مناقصهٔ تازه</h2></div>
      <section class="td-card">${steps}${body}</section></div>`;
  }
  function stepCheck(to) {
    const w = T.w;
    if (to >= 1 && !w.items.length) return "دست‌کم یک قلم بیفزایید.";
    if (to >= 2 && !w.sups.some((s) => s.on)) return "دست‌کم یک تأمین‌کننده را تیک بزنید.";
    if (to >= 2) { const bad = w.sups.find((s) => s.on && phoneBad(s.phone)); if (bad) return `شمارهٔ «${bad.name}» درست نیست.`; }
    if (to >= 3) {
      for (const it of w.items) {
        if (!String(it.title).trim()) return "عنوانِ هر قلم را بنویسید.";
        if (!(Number(n0(it.qty)) > 0)) return `مقدارِ «${it.title}» را بنویسید.`;
        if (!String(it.unit).trim()) return `واحدِ «${it.title}» را بنویسید.`;
        if (!(D.parseAmt(it.start_price) > 0)) return `قیمتِ شروعِ «${it.title}» را به ریال بنویسید.`;
      }
    }
    return "";
  }
  async function create(go) {
    const w = T.w, f = w.f, err = stepCheck(3); if (err) return TP.modal("کامل نیست", esc(err), null, "باشد", "");
    const lots = w.items.map((it) => ({ title: it.title, item_code: it.item_code || "", item_title: it.item_title || "", qty: n0(it.qty), unit: it.unit, start_price: it.start_price, spec: it.spec }));
    const body = { ...(lots.length > 1 ? { lots } : lots[0]), terms: f.terms, ...rulesBody(f),
      duration_s: String(Math.round((Number(n0(f.duration_min)) || 30) * 60)), sealed_s: String(Math.round((Number(n0(f.sealed_min)) || 0) * 60)),
      invites: w.sups.map((s) => ({ name: s.name, phone: s.phone, source: s.source || "history", on: !!s.on, supplier_id: s.supplier_id, info: s.n ? { n: s.n, last: s.last, grade: s.grade } : null })) };
    const b = TP.busy(go ? "ساخت و شروع…" : "ذخیره…", "مناقصه");
    try {
      let d = await C.api("/tenders", { body });
      if (go) {
        d = await C.api(`/tenders/${d.tender.id}/schedule`, { body: { start_in_min: n0(f.start_in_min), duration_min: n0(f.duration_min), sealed_min: n0(f.sealed_min) } });
        d = await C.api(`/tenders/${d.tender.id}/invite`, { body: {} });
      }
      T.w = null; T.id = d.tender.id; T.d = d; T.list = null;
      b.close(); rerender();
      if (go && d.result) TP.ui.success(d.result.sent ? `دعوت برای ${fa(d.result.sent)} نفر پیامک شد` : "مناقصه شروع شد");
      if (go && d.result && (d.result.off || d.result.error || d.result.nophone)) inviteReport(d.result);
    } catch (e) { b.close(); TP.modal("نشد", esc(e.message), null, "باشد", ""); }
  }
  function inviteReport(r) {
    TP.modal("نتیجهٔ پیامکِ دعوت", `<ul class="td-rules"><li>• رفت: <b>${fa(r.sent)}</b>${r.tg ? ` · در باتِ تلگرام: <b>${fa(r.tg)}</b>` : ""}</li>${r.off ? `<li>• درگاهِ پیامک وصل نیست: <b>${fa(r.off)}</b> — لینک را خودتان بفرستید یا «رمزِ تلفنی» بدهید.</li>` : ""}
      ${r.error ? `<li>• نرسید: <b>${fa(r.error)}</b></li>` : ""}${r.nophone ? `<li>• بی‌شماره: <b>${fa(r.nophone)}</b> — شماره بگذارید و «پیامک» را بزنید.</li>` : ""}</ul>`, null, "باشد", "");
  }

  /* ---------- نمای زنده ---------- */
  function histHtml(h, t) {
    if (!h) return "";
    const same = h.unit === t.unit;
    return `<section class="td-card"><h3>سوابقِ همین کالا <span class="sub">${h.usd ? "به قیمتِ روز (با نرخِ دلار)" : "قیمتِ ثبت‌شده"} · هر ${esc(h.unit || "")} · فقط شما می‌بینید</span></h3>
      <div class="td-hist"><div><small>آخرین خرید</small><b>${money(h.last.today ?? h.last.price)}</b><small>${esc(fa(h.last.date || ""))} · ${esc(h.last.supplier || "")}</small></div>
        <div><small>میانهٔ ${fa(h.n)} خریدِ آخر</small><b>${money(h.median)}</b></div><div><small>کمترین</small><b>${money(h.min)}</b></div></div>
      ${h.dropped ? `<div class="dim" style="font-size:.76rem;margin-top:6px">${fa(h.dropped)} خرید با مقیاسِ ناجور (احتمالاً ثبت به میلیون) کنار گذاشته شد.</div>` : ""}
      ${same && t.best_amount ? `<div class="dim" style="font-size:.82rem;margin-top:8px">کمترین قیمتِ مناقصه ${t.best_amount <= h.median ? `<b style="color:#6ee7b7">${faD(((1 - t.best_amount / h.median) * 100).toFixed(1))}٪ زیرِ</b>` : `<b style="color:#fcd34d">${faD(((t.best_amount / h.median - 1) * 100).toFixed(1))}٪ بالای</b>`} میانهٔ سوابق است.</div>`
        : !same ? `<div class="dim" style="font-size:.8rem;margin-top:8px">واحدِ سوابق (${esc(h.unit || "—")}) با واحدِ مناقصه (${esc(t.unit)}) یکی نیست؛ مقایسه با احتیاط.</div>` : ""}</section>`;
  }
  function linkHtml(d) {
    const t = d.tender;
    if (t.state !== "ended" || !t.best_amount) return "";
    const R = T.req;
    return `<section class="td-card"><h3>ثبت در درخواست <span class="sub">پیشنهادِ هر شرکت‌کننده یک خطِ استعلامِ ثبت‌شده؛ برنده «تأیید نهایی»</span></h3>
      ${t.req_aid ? `<div class="tp-note">${esc(D.when(t.req_at))} در درخواست ثبت شد.</div><div class="td-foot"><button class="tp-btn primary" data-tdcmres="${t.req_aid}">🏆 نتیجهٔ کمیسیون</button></div>` : ""}
      <div class="td-form"><label>شمارهٔ درخواست<input class="tp-input" data-tdrid dir="ltr" value="${esc(R && R.rid || "")}" placeholder="مثلاً 1405-123"></label></div>
      <div class="td-foot"><button class="tp-btn" data-tdridgo>اقلامِ بازِ درخواست</button></div>
      ${R && R.items ? (R.items.length ? `<div class="td-hits">${R.items.map((x) => `<button type="button" class="td-hit" data-tdlink="${x.id}"><b>${esc(x.title)}</b><small>${fa(x.qty)} ${esc(x.unit || "")}</small><small>${esc(x.expert || "")}</small><span class="chip">${t.req_item === x.id ? "دوباره ثبت" : "ثبت"}</span></button>`).join("")}</div>`
        : `<div class="dim">قلمِ بازی در ارجاع‌های ارسال‌شدهٔ این درخواست نیست.</div>`) : ""}</section>`;
  }
  function vDetail() {
    const back = `<button class="tp-btn sm" data-tdback>→ همهٔ مناقصه‌ها</button>`;
    if (T.dErr) return `<div class="sv-exone">${back}<div class="tp-note warn">${esc(T.dErr)}</div></div>`;
    if (!T.d) return `<div class="sv-exone">${back}<div class="empty">در حال بارگذاری…</div></div>`;
    const d = T.d, t = d.tender, n = now(), inv = d.invites, names = new Map(inv.map((i) => [i.alias, i.name]));
    const bestName = t.best_alias != null ? names.get(t.best_alias) : null;
    const ring = t.state === "live" ? D.ring(t.end_at - n, Math.max(1, t.end_at - (t.sealed_end_at || t.start_at)), "تا پایان")
      : t.state === "sealed" ? D.ring(t.sealed_end_at - n, Math.max(1, t.sealed_end_at - t.start_at), "تا دورِ زنده")
        : t.state === "scheduled" ? D.ring(t.start_at - n, Math.max(1, t.start_at - n), "تا شروع") : D.ring(0, 1, D.ST[t.state]);
    const open = ["draft", "scheduled", "sealed", "live"].includes(t.state), many = (d.lots || []).length > 1;
    const acts = [
      t.state === "draft" ? `<button class="tp-btn primary" data-tdstart>▶️ شروع${many ? "ِ همهٔ قلم‌ها" : ""}</button>` : "",
      open && t.state !== "draft" ? `<button class="tp-btn" data-tdinvite>📨 دعوتِ نفرستاده‌ها</button>` : t.state === "draft" ? `<button class="tp-btn" data-tdinvite>📨 ارسالِ دعوت</button>` : "",
      `<button class="tp-btn" data-tdcopy="${esc(d.link)}" title="${esc(d.link)}">🔗 کپیِ لینک</button>`,
      open ? `<button class="tp-btn" data-tdrules>⚙️ قواعد</button>` : "",
      ["live", "sealed"].includes(t.state) ? `<button class="tp-btn" data-tdend>⏹ پایان همین حالا</button>` : "",
      open ? `<button class="tp-btn danger" data-tdcancel>✖ لغو</button>` : "",
      `<button class="tp-btn" data-tdcsv>⬇️ اکسل</button><button class="tp-btn" data-tdprint>🖨 گزارش / PDF</button>`,
    ].join("");
    const bestBid = d.bids.filter((x) => x.state !== "void").sort((p, q) => p.amount - q.amount || p.at - q.at)[0];
    const bids = d.bids.slice().reverse().map((b) => `<div class="td-b ${b.state === "void" ? "void" : ""} ${bestBid && b.id === bestBid.id ? "best" : ""}">
        <span class="av" style="--av:${D.avColor(b.alias)}" aria-hidden="true">${fa(b.alias)}</span>
        <span class="w"><b>${esc(b.name)}${b.auto ? `<span class="td-tag auto">خودکار</span>` : ""}${b.sealed ? `<span class="td-tag">سربسته</span>` : ""}</b><small>${esc(D.hms(b.at))}${b.ext ? " · ⏱ تمدید" : ""}${b.state === "fixed" ? ` · اصلاح از ${money(b.orig_amount)}` : ""}${b.state === "void" ? " · باطل" : ""}${b.fix_reason ? ` — ${esc(b.fix_reason)}` : ""}</small></span>
        <span class="a"><b>${money(b.amount)}</b><small>${t.start_price ? `${faD(((1 - b.amount / t.start_price) * 100).toFixed(1))}٪ زیرِ شروع` : ""}</small></span>
        ${b.state !== "void" && t.state !== "cancelled" ? `<span class="acts"><button class="tp-btn xs" data-tdfix="${b.id}">اصلاح</button><button class="tp-btn xs danger" data-tdvoid="${b.id}">باطل</button></span>` : ""}</div>`).join("");
    const job = (d.jobs || [])[0];
    const jobHtml = !job ? "" : job.state === "pending" || job.state === "running" ? `<div class="tp-note"><span class="tp-spin"></span> جستجو برای «${esc(job.query)}» در جریان است؛ چند دقیقه طول می‌کشد.</div>`
      : job.state === "error" ? `<div class="tp-note warn">جستجو نشد: ${esc(job.error || "")}</div>`
        : `<div class="td-hits">${((job.result && job.result.suppliers) || []).map((s, i) => `<button type="button" class="td-hit" data-tdsmart="${i}"><b>${esc(s.name)}</b><small dir="ltr">${esc((s.phones || [])[0] || "بی‌شماره")}</small>
            <small>${esc([s.type, s.price, s.website].filter(Boolean).join(" · "))}</small><span class="chip">افزودن</span></button>`).join("") || `<div class="dim">چیزی پیدا نشد.</div>`}</div>`;
    const ref = d.hist && d.hist.unit === t.unit && d.hist.median ? { v: d.hist.median, label: "میانهٔ سوابق (قیمتِ روز)" } : null;
    const flags = [t.sealed_end_at ? "دورِ سربسته" : "", !t.show_prices ? "فقط رتبه" : "", t.proxy_on ? "خودکار مجاز" : "", t.require_accept ? "پذیرشِ شرایط" : "", t.outbid_sms ? "پیامکِ رتبه" : ""].filter(Boolean);
    return `<div class="td-wrap" style="padding:0 0 32px">
      ${many ? `<nav class="td-lots" aria-label="قلم‌های این مناقصه">${d.lots.map((l) => `<button type="button" class="${l.id === t.id ? "on" : ""}" data-tdopen="${l.id}">${esc(l.title)}<small>${esc(D.ST[l.state] || "")}</small></button>`).join("")}</nav>` : ""}
      <section class="td-card"><div class="td-head">${back}<span class="ic" aria-hidden="true">${ICON().box}</span>
        <div class="t"><h1>${esc(t.title)}</h1><div class="meta"><span>${fa(t.qty)} ${esc(t.unit)}</span>${t.item_code ? `<span dir="ltr">${esc(t.item_code)}</span>` : ""}<span>شروع: <b>${money(t.start_price)}</b></span>
          ${t.start_at ? `<span>${esc(D.when(t.start_at))} ← ${esc(D.hms(t.end_at))}</span>` : ""}${flags.map((x) => `<span class="chip">${x}</span>`).join("")}</div></div>${D.stChip(t.state)}</div>
        <div class="td-foot" style="margin-top:12px">${acts}<span class="spacer"></span>${open ? sw(t.show_names, t.show_names ? "نام‌ها پیدا" : "نام‌ها پنهان", "data-tdshow") : ""}</div></section>
      <section class="td-card td-hero ${t.best_amount ? "lead" : ""}">${ring}
        <div class="td-best"><span class="cap">${t.best_amount ? `کمترین قیمت — هر ${esc(t.unit)}${t.state === "sealed" ? " (سربسته؛ تأمین‌کنندگان نمی‌بینند)" : ""}` : "قیمتِ شروع"}</span><span class="num">${money(t.best_amount || t.start_price)}<small>ریال</small></span>
          <span class="sub">${t.best_amount ? `<span>جمع: <b>${short(t.best_amount * t.qty)}</b></span><span><b>${faD(((1 - t.best_amount / t.start_price) * 100).toFixed(1))}٪</b> زیرِ شروع</span>` : "<span>هنوز پیشنهادی نیست</span>"}
            <span>${fa(new Set(d.bids.filter((b) => b.state !== "void").map((b) => b.alias)).size)} از ${fa(inv.filter((i) => i.on).length)} شرکت کرده‌اند</span>${t.ext_count ? `<span class="td-ext">⏱ ${fa(t.ext_count)} تمدید</span>` : ""}</span>
          ${bestName ? `<span class="td-me lead">${t.state === "ended" ? "🏆 برنده" : "پیشتاز"}: ${esc(bestName)}</span>` : ""}</div></section>
      <div class="td-grid"><div class="td-col">
          <section class="td-card"><h3>روندِ قیمت${ref ? ` <span class="sub">خطِ سبز: میانهٔ سوابق</span>` : ""}</h3>${D.chart({ series: d.series, start: t.start_price, floor: t.range.floor, from: t.start_at, to: ["live", "sealed"].includes(t.state) ? n : t.ended_at || t.end_at, ref })}</section>
          ${histHtml(d.hist, t)}${linkHtml(d)}
          <section class="td-card"><h3>پیشنهادها <span class="sub">${fa(d.bids.length)} پیشنهاد · اصلاح و ابطال با علت، در رخدادها می‌ماند</span></h3>${bids ? `<div class="td-bids" style="max-height:520px">${bids}</div>` : `<div class="td-empty">هنوز پیشنهادی نیست.</div>`}</section></div>
        <div class="td-col">
          <section class="td-card"><h3>دعوت‌شده‌ها <span class="sub">${fa(inv.filter((i) => i.on).length)} نفر${many ? " — برای همهٔ قلم‌ها" : ""}</span></h3><div class="td-sups">${inv.map((s) => supRow(s, 0, "d")).join("")}</div>${open ? addBox("d") : ""}</section>
          ${open ? `<section class="td-card"><h3>🔎 جستجوی هوشمند در وب <span class="sub">تأمین‌کنندهٔ تازه برای همین کالا</span></h3>
            <div class="td-form"><label class="wide">چه چیزی جستجو شود؟<input class="tp-input" data-tdsq value="${esc(T.sq != null ? T.sq : t.title)}"></label></div>
            <div class="td-foot"><button class="tp-btn" data-tdsmartgo ${job && ["pending", "running"].includes(job.state) ? "disabled" : ""}>جستجو</button></div>${jobHtml}</section>` : ""}</div></div></div>`;
  }
  /** گزارشِ چاپی (و «ذخیره به PDF» از همان پنجرهٔ چاپ) */
  function printReport() {
    const d = T.d, t = d.tender;
    const rows = d.invites.filter((i) => i.rank).sort((a, b) => a.rank - b.rank);
    const css = `body{font-family:Vazirmatn,Tahoma,sans-serif;font-size:11pt;color:#111}h1{font-size:15pt;margin:0 0 6px}table{width:100%;border-collapse:collapse;margin-top:10px}
      th,td{border:1px solid #bbb;padding:5px 7px;text-align:right}th{background:#eef2f8}.k{display:flex;gap:18px;flex-wrap:wrap;margin:6px 0}.k b{font-weight:800}svg{width:100%;height:200px}
      .td-chart .grid{stroke:#ddd}.td-chart .ln{fill:none;stroke:#2f6fe4;stroke-width:2}.td-chart .ar{fill:rgba(47,111,228,.12)}.td-chart .dot{fill:#2f6fe4}.td-chart .lab{font-size:9px;fill:#666}.td-chart .start{stroke:#e0ac08;stroke-dasharray:4 4}.td-chart .floor{stroke:#d63a3f;stroke-dasharray:4 4}.td-chart .ref{stroke:#16a34a;stroke-dasharray:2 5}`;
    const html = `<h1>گزارشِ مناقصهٔ «${esc(t.title)}»</h1>
      <div class="k"><span>مقدار: <b>${fa(t.qty)} ${esc(t.unit)}</b></span><span>قیمتِ شروع: <b>${money(t.start_price)}</b> ریال</span><span>کمترین: <b>${t.best_amount ? money(t.best_amount) : "—"}</b> ریال</span>
        <span>وضعیت: <b>${esc(D.ST[t.state] || t.state)}</b></span><span>شروع: ${t.start_at ? esc(D.when(t.start_at)) : "—"}</span><span>پایان: ${esc(D.when(t.ended_at || t.end_at || Date.now()))}</span><span>تمدید: ${fa(t.ext_count)}</span></div>
      ${D.chart({ series: d.series, start: t.start_price, floor: t.range.floor, from: t.start_at, to: t.ended_at || t.end_at })}
      <table><thead><tr><th>رتبه</th><th>تأمین‌کننده</th><th>بهترین پیشنهاد (ریال)</th><th>جمعِ کل (ریال)</th><th>شماره</th></tr></thead><tbody>
        ${rows.map((i) => `<tr><td>${fa(i.rank)}</td><td>${esc(i.name)}</td><td>${money(i.best)}</td><td>${money(i.best * t.qty)}</td><td dir="ltr">${esc(i.phone || "")}</td></tr>`).join("") || `<tr><td colspan="5">پیشنهادی نیست</td></tr>`}</tbody></table>
      <table><thead><tr><th>زمان</th><th>تأمین‌کننده</th><th>مبلغ (ریال)</th><th>توضیح</th></tr></thead><tbody>
        ${d.bids.map((b) => `<tr><td>${esc(D.hms(b.at))}</td><td>${esc(b.name)}</td><td>${money(b.amount)}</td><td>${[b.auto ? "خودکار" : "", b.sealed ? "سربسته" : "", b.ext ? "تمدید" : "", b.state === "void" ? "باطل" : "", b.state === "fixed" ? `اصلاح از ${money(b.orig_amount)}` : "", b.fix_reason || ""].filter(Boolean).map(esc).join(" · ")}</td></tr>`).join("")}</tbody></table>`;
    if (window.PH && window.PH.printDoc) window.PH.printDoc(`مناقصه-${t.code}`, css, html, () => TP.modal("نشد", "پنجرهٔ چاپ باز نشد.", null, "باشد", ""));
  }

  /* ---------- رفتارها ---------- */
  function onClick(e) {
    const el = e.target.closest("[data-tdnew],[data-tdf],[data-tdopen],[data-tdback],[data-tdcancelw],[data-tditem],[data-tdfree],[data-tdstep],[data-tdcreate],[data-tdxadd],[data-tdbook],[data-tdstart],[data-tdinvite],[data-tdcopy],[data-tdrules],[data-tdend],[data-tdcancel],[data-tdfix],[data-tdvoid],[data-tdpass],[data-tdresend],[data-tdshow],[data-tdsmartgo],[data-tdsmart],[data-tdcfg],[data-tditdel],[data-tdwsw],[data-tdcsv],[data-tdprint],[data-tdridgo],[data-tdlink],[data-tdcmres]");
    if (!el || el.disabled || !T.on) return;
    const d = el.dataset;
    if (d.tdcfg !== undefined) return settingsDialog();
    if (d.tdnew !== undefined) { const go = () => { T.w = W0(); T.id = null; T.d = null; rerender(); }; return T.cfg ? go() : loadCfg().then(go); }
    if (d.tdf !== undefined) { T.filter = d.tdf; return rerender(); }
    if (d.tdopen) return loadOne(Number(d.tdopen));
    if (d.tdback !== undefined) { T.id = null; T.d = null; T.sq = null; T.req = null; return loadList(); }
    if (d.tdcancelw !== undefined) { T.w = null; return T.list ? rerender() : loadList(); }
    if (d.tditem) return addItem(d.tditem);
    if (d.tditdel !== undefined) { T.w.items.splice(Number(d.tditdel), 1); return rerender(); }
    if (d.tdfree !== undefined) {
      const title = (T.w.q || "").trim();
      if (!title) return TP.modal("نام", "نامِ کالا را در کادرِ جستجو بنویسید و دوباره بزنید.", null, "باشد", "");
      T.w.items.push({ item_code: "", item_title: "", title, unit: "", qty: "", start_price: "", spec: "" }); return rerender();
    }
    if (d.tdwsw !== undefined) { T.w.f[d.tdwsw] = !T.w.f[d.tdwsw]; return null; }
    if (d.tdstep) { const to = Number(d.tdstep), err = to > T.w.step ? stepCheck(to) : ""; if (err) return TP.modal("کامل نیست", esc(err), null, "باشد", ""); T.w.step = to; return rerender(); }
    if (d.tdcreate) return create(d.tdcreate === "go");
    if (d.tdxadd) return addExtra(d.tdxadd);
    if (d.tdbook !== undefined) { const s = (T.bhits || [])[Number(d.tdbook)]; if (s) return addSup({ name: s.name, phone: s.phone || "", source: "book", supplier_id: s.supplier_id, n: s.n, grade: s.grade }); return null; }
    if (d.tdsmart !== undefined) { const j = (T.d.jobs || [])[0], s = j && j.result && j.result.suppliers[Number(d.tdsmart)]; if (s) return addSup({ name: s.name, phone: (s.phones || [])[0] || "", source: "smart", info: { website: s.website } }); return null; }
    if (d.tdcopy) { try { navigator.clipboard.writeText(d.tdcopy); TP.ui.success("لینک کپی شد"); } catch (_) { TP.modal("لینک", `<p dir="ltr" style="word-break:break-all">${esc(d.tdcopy)}</p>`, null, "باشد", ""); } return null; }
    const id = T.id;
    if (d.tdcsv !== undefined) { if (C.download) C.download(`/tenders/${id}/csv`, `مناقصه-${T.d.tender.code}.csv`).catch((x) => TP.modal("نشد", esc(x.message), null, "باشد", "")); return null; }
    if (d.tdprint !== undefined) return printReport();
    if (d.tdshow !== undefined) return act(() => C.api(`/tenders/${id}`, { method: "PUT", body: { show_names: !T.d.tender.show_names } }));
    if (d.tdstart !== undefined) return startDialog();
    if (d.tdinvite !== undefined) return act(async () => { const r = await C.api(`/tenders/${id}/invite`, { body: {} }); inviteReport(r.result); return r; });
    if (d.tdresend) return act(async () => { const r = await C.api(`/tenders/${id}/invite`, { body: { aliases: [Number(d.tdresend)] } }); TP.ui.success(r.result.sent ? "پیامک رفت" : "پیامک نرفت"); return r; });
    if (d.tdrules !== undefined) return rulesDialog();
    if (d.tdend !== undefined) return endDialog();
    if (d.tdcancel !== undefined) return reasonDialog("لغوِ مناقصه", "علتِ لغو", (reason, all) => C.api(`/tenders/${id}/cancel`, { body: { reason, all } }), "لغو شود", (T.d.lots || []).length > 1);
    if (d.tdvoid) return reasonDialog("ابطالِ پیشنهاد", "علت (تأمین‌کننده هم می‌بیند)", (reason) => C.api(`/tenders/${id}/bids/${d.tdvoid}`, { body: { void: true, reason } }), "باطل شود");
    if (d.tdfix) return fixDialog(Number(d.tdfix));
    if (d.tdpass) return C.api(`/tenders/${id}/invites/${d.tdpass}/pass`, { body: {} }).then((r) => TP.modal("رمزِ تلفنی", `<p>این رمز را تلفنی به <b>${esc(r.name)}</b> بگویید؛ با شمارهٔ <b dir="ltr">${esc(r.phone)}</b> و این رمز وارد می‌شود (تا ${fa(r.valid_h)} ساعت):</p>
        <div class="td-confirm"><div class="big" style="letter-spacing:.3em">${fa(r.pass)}</div></div><p class="dim" style="font-size:.8rem">رمز فقط همین یک بار نشان داده می‌شود.</p>`, null, "باشد", "")).catch((x) => TP.modal("نشد", esc(x.message), null, "باشد", ""));
    if (d.tdsmartgo !== undefined) { const q = (document.querySelector("[data-tdsq]") || {}).value || ""; return act(() => C.api(`/tenders/${id}/discover`, { body: { query: q } })); }
    if (d.tdridgo !== undefined) {
      const rid = ((document.querySelector("[data-tdrid]") || {}).value || "").trim();
      if (!rid) return null;
      return C.api(`/tender-req-items?rid=${encodeURIComponent(rid)}`).then((r) => { T.req = { rid, items: r.items || [] }; rerender(); }).catch((x) => TP.modal("نشد", esc(x.message), null, "باشد", ""));
    }
    if (d.tdlink) {
      const it = (T.req && T.req.items || []).find((x) => x.id === Number(d.tdlink));
      return TP.modal("ثبت در درخواست", `<p>پیشنهادِ هر شرکت‌کننده یک خطِ استعلامِ ثبت‌شده برای «${esc(it ? it.title : "")}» می‌شود و برنده «تأیید نهایی» می‌گیرد.${it && it.unit && it.unit !== T.d.tender.unit ? `<br><b style="color:#fcd34d">واحدِ قلم (${esc(it.unit)}) با واحدِ مناقصه (${esc(T.d.tender.unit)}) یکی نیست.</b>` : ""}</p>`,
        () => act(async () => { const r = await C.api(`/tenders/${id}/link`, { body: { item_id: Number(d.tdlink) } }); TP.ui.success(`${fa(r.linked.lines)} خط در درخواست ثبت شد`); return r; }), "ثبت شود", "انصراف");
    }
    if (d.tdcmres) { if (C.cmResult) C.cmResult(Number(d.tdcmres)); return null; }
    return null;
  }
  async function act(fn) {
    try { const r = await fn(); if (r && r.tender && T.id === r.tender.id) { T.d = r; T.off = r.now - Date.now(); } else if (T.id) await loadOne(T.id, true); rerender(); }
    catch (e) { TP.modal("نشد", esc(e.message), null, "باشد", ""); }
  }
  function addSup(s) {
    if (T.w) {
      if (T.w.sups.some((x) => nameKey(x.name) === nameKey(s.name))) return TP.modal("تکراری", `«${esc(s.name)}» از قبل در فهرست است.`, null, "باشد", "");
      T.w.sups = [...T.w.sups, { ...s, on: true }]; T.w.extra = { name: "", phone: "" }; T.bhits = null;
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
  function reasonDialog(title, label, fn, yes, allOpt) {
    const dlg = TP.modal(title, `<textarea class="tp-input" data-tdwhy style="width:100%;min-height:80px" maxlength="300" placeholder="${esc(label)}"></textarea>
      ${allOpt ? `<label style="display:flex;gap:8px;align-items:center;margin-top:8px"><input type="checkbox" data-tdall> همهٔ قلم‌های این گروه</label>` : ""}`, () => {
      const reason = (dlg.querySelector("[data-tdwhy]") || {}).value || "", all = !!(dlg.querySelector("[data-tdall]") || {}).checked;
      act(() => fn(reason, all));
    }, yes, "انصراف");
  }
  function endDialog() {
    const many = (T.d.lots || []).length > 1;
    const dlg = TP.modal("پایانِ همین حالا", `<p>مناقصه همین حالا بسته می‌شود و کمترین قیمت برنده است.</p>${many ? `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-tdall> همهٔ قلم‌های این گروه</label>` : ""}`,
      () => { const all = !!(dlg.querySelector("[data-tdall]") || {}).checked; act(() => C.api(`/tenders/${T.id}/end`, { body: { all } })); }, "ببند", "انصراف");
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
    const dlg = TP.modal("شروعِ مناقصه", `<div class="td-form"><label>شروع چند دقیقهٔ دیگر <small>۰ = همین حالا</small><input class="tp-input" data-tdsin value="۰" inputmode="numeric"></label>
        <label>دورِ سربسته (دقیقه) <small>۰ = ندارد</small><input class="tp-input" data-tdssealed value="${fa(Math.round((t.sealed_s || 0) / 60))}" inputmode="numeric"></label>
        <label>مدتِ دورِ زنده (دقیقه)<input class="tp-input" data-tdsdur value="${fa(Math.round(t.duration_s / 60))}" inputmode="numeric"></label></div>
      <p class="dim" style="font-size:.82rem">بعد از شروع «ارسالِ دعوت» را بزنید تا پیامک برود.${(T.d.lots || []).length > 1 ? " همهٔ قلم‌های پیش‌نویسِ گروه با هم شروع می‌شوند." : ""}</p>`, () => {
      const start_in_min = n0(dlg.querySelector("[data-tdsin]").value), duration_min = n0(dlg.querySelector("[data-tdsdur]").value), sealed_min = n0(dlg.querySelector("[data-tdssealed]").value);
      act(() => C.api(`/tenders/${T.id}/schedule`, { body: { start_in_min, duration_min, sealed_min } }));
    }, "شروع", "انصراف");
  }
  function rulesDialog() {
    const t = T.d.tender, f = formOf(t), hasBids = t.best_amount != null;
    const dlg = TP.modal("⚙️ قواعدِ مناقصه", `<div class="td-form">
        <label>قیمتِ شروع (ریال) <small>${hasBids ? "بعد از اولین پیشنهاد ثابت" : ""}</small><input class="tp-input" data-tdr="start_price" value="${esc(money(t.start_price))}" inputmode="numeric" ${hasBids ? "disabled" : ""}></label>
        ${ruleInputs(f, "data-tdr")}
        ${t.state !== "draft" ? `<label>پایانِ تازه: چند دقیقه از حالا <small>خالی = همان</small><input class="tp-input" data-tdr="end_in_min" value="" inputmode="numeric"></label>` : ""}</div>
      ${ruleSwitches(f, "data-tdr")}${(T.d.lots || []).length > 1 ? `<p class="dim" style="font-size:.8rem">قواعد برای همهٔ قلم‌های بازِ گروه یکی است.</p>` : ""}`, () => {
      const g = readForm(dlg, "data-tdr", f), body = rulesBody(g);
      if (!hasBids) body.start_price = n0(g.start_price);
      if (n0(g.end_in_min)) body.end_in_min = n0(g.end_in_min);
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
    if (d.tdfld && T.w) { T.w.f[d.tdfld] = t.value; return null; }
    if (d.tdit && T.w) {
      const [i, k] = d.tdit.split(":"), it = T.w.items[Number(i)]; if (!it) return null;
      if (k === "start_price") { const dg = D.latin(t.value).replace(/[^\d]/g, ""); t.value = dg ? Number(dg).toLocaleString("en-US") : ""; }
      it[k] = t.value;
      const h = document.querySelector(`[data-tdith="${i}"]`); if (h && (k === "start_price" || k === "qty")) h.innerHTML = priceHint(it);
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
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("article[data-tdopen]")) { e.preventDefault(); loadOne(Number(e.target.dataset.tdopen)); }
    if (e.key === "Enter" && e.target.dataset && e.target.dataset.tdrid !== undefined) { e.preventDefault(); const b = document.querySelector("[data-tdridgo]"); if (b) b.click(); }
  }

  window.TP_TENDER = {
    configure(o) { C = { ...C, ...o }; },
    mount(root) { root.addEventListener("click", onClick); root.addEventListener("input", onInput); root.addEventListener("change", onChange); root.addEventListener("keydown", onKey); },
    /** تب پیدا شد/پنهان شد — نظرسنجی فقط وقتی پیداست */
    active(on) { const was = T.on; T.on = !!on; if (on && !was) loops(true); if (!on && was) loops(false); },
    load(force) { if (T.id) return loadOne(T.id, !force); if (!T.w && (force || !T.list)) return loadList(); return null; },
    view() { return T.w ? vWizard() : T.id ? vDetail() : vList(); },
    live: () => !!(T.list && T.list.some((x) => ["live", "sealed"].includes(x.state))),
  };
})();
