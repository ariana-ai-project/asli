/* ============================================================
   سامانهٔ پشتیبانی خرید — ماژول ظاهرِ مشترک (مهر ۱۴۰۵) — window.TP.ui
   نوار بالا با منوی پروفایل، دکمهٔ شب و روز (فقط آیکون)، منوی بازشونده، کارت ورود با خانه‌های کد و
   دکمهٔ سه‌بعدی، نوار مهلت و پیشرفت، پس‌زمینهٔ متحرک، راهنمای شناور (؟) با کشوی موضوع‌ها، و
   بازخوانی خودکارِ بی‌پرش. سبک‌ها: ui.css. متن‌های راهنما: help-content.js (window.TP_HELP).
   shared.js لازم نیست (پنل تأمین‌کننده آن را بار نمی‌کند)؛ هرجا هست، از TP.theme و TP.esc استفاده می‌شود.
   ============================================================ */
(function () {
  "use strict";
  if (typeof document === "undefined") return;
  const TP = (window.TP = window.TP || {});
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const FA = "۰۱۲۳۴۵۶۷۸۹";
  const fa = (s) => String(s == null ? "" : s).replace(/\d/g, (d) => FA[+d]);
  const digits = (s) => String(s == null ? "" : s).replace(/[۰-۹]/g, (d) => FA.indexOf(d)).replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const ls = { get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* حالت خصوصی */ } } };

  /* ---------- نمادهای خطی (رنگ از currentColor) ---------- */
  const svg = (d, extra = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
  const ICON = {
    sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', 'class="ui-sun"'),
    moon: svg('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>', 'class="ui-moon"'),
    user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.2-7 8-7s7 2.5 8 7"/>'),
    chevron: svg('<path d="M6 9l6 6 6-6"/>'),
    help: svg('<circle cx="12" cy="12" r="9.5"/><path d="M9.3 9.3a2.8 2.8 0 1 1 4 2.6c-.9.5-1.3 1.1-1.3 2.1"/><circle cx="12" cy="17.2" r=".9" fill="currentColor" stroke="none"/>'),
    x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
    more: svg('<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>'),
    refresh: svg('<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>'),
    telegram: svg('<path d="M21.5 3.5L2.8 10.7c-1 .4-1 1 0 1.3l4.8 1.5 1.8 5.6c.2.6.4.8.9.8.5 0 .7-.2 1-.5l2.5-2.4 5 3.7c.9.5 1.6.2 1.8-.8l3.3-15.4c.3-1.3-.5-1.9-1.4-1.5z"/>'),
    home: svg('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>'),
    logout: svg('<path d="M10 4H5v16h5"/><path d="M14 8l4 4-4 4M18 12H9"/>'),
    chat: svg('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.2-4.4A8 8 0 1 1 21 12z"/>'),
    back: svg('<path d="M9 5l7 7-7 7"/>'),
    box: svg('<path d="M12 2.8l8 4.3v9.8l-8 4.3-8-4.3V7.1z"/><path d="M4 7.1l8 4.4 8-4.4M12 11.5v9.7"/>'),
    flag: svg('<path d="M5 21V4"/><path d="M5 4h12l-2 4 2 4H5"/>'),
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    project: svg('<path d="M3 21h18"/><path d="M5 21V8l7-5 7 5v13"/><path d="M9 21v-6h6v6"/>'),
    settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    data: svg('<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>'),
    users: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.8 3.4-6 6.5-6s5.7 2.2 6.5 6"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 14.4c2.6.2 4.7 2.2 5.5 5.6"/>'),
    upload: svg('<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 20h16"/>'),
    key: svg('<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M15 8l2 2M18 5l2 2"/>'),
    bell: svg('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 21a2 2 0 0 0 4 0"/>'),
    edit: svg('<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M13.5 6.5l3 3"/>'),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    file: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>'),
    send: svg('<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>'),
  };

  /* ---------- حالت شب و روز (کلیدِ ذخیره را هر صفحه می‌دهد؛ کارشناس tp.theme، تأمین‌کننده sp.theme) ---------- */
  const theme = {
    key: "tp.theme",
    get() { const t = document.documentElement.dataset.theme; return t === "light" ? "light" : "dark"; },
    apply(t) {
      document.documentElement.dataset.theme = t;
      const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute("content", t === "light" ? "#eef2f8" : "#030814");
      $$("[data-theme-toggle]").forEach((b) => { const lab = t === "light" ? "حالت شب" : "حالت روز"; b.title = lab; b.setAttribute("aria-label", lab); });
    },
    set(t) { ls.set(theme.key, t); if (TP.theme && TP.theme.set) TP.theme.set(t); else theme.apply(t); },
    toggle() { theme.set(theme.get() === "light" ? "dark" : "light"); },
  };
  /** دکمهٔ خورشید/ماه — فقط آیکون (خواستهٔ مالک)؛ هر دو نماد هستند و CSS با data-theme یکی را نشان می‌دهد */
  const themeBtn = (cls) => { const lab = theme.get() === "light" ? "حالت شب" : "حالت روز"; return `<button class="tp-icon-btn tp-theme ${cls || ""}" type="button" data-theme-toggle title="${lab}" aria-label="${lab}">${ICON.sun}${ICON.moon}</button>`; };
  /* shared.js شنوندهٔ خودش را روی [data-theme-toggle] دارد (پنل‌های کارشناس و مدیر)؛ بی shared.js خودمان عوض می‌کنیم */
  document.addEventListener("click", (e) => {
    const b = e.target && e.target.closest && e.target.closest("[data-theme-toggle]");
    if (!b || (TP.theme && TP.theme.toggle)) return;
    theme.toggle();
    window.dispatchEvent(new Event("tp-theme"));
  });
  window.addEventListener("tp-theme", () => theme.apply(theme.get()));

  /* ---------- پس‌زمینه ---------- */
  function mountBg(kind) {
    if (!$(".tp-sky")) {
      document.body.insertAdjacentHTML("afterbegin", `<div class="tp-sky" aria-hidden="true"><i class="b1"></i><i class="b2"></i><i class="b3"></i></div><div class="tp-orbs" aria-hidden="true">${"<i></i>".repeat(9)}</div>`);
      document.body.classList.add("has-sky");
    }
    $(".tp-sky").classList.toggle("fog", kind === "fog");
  }

  /* ---------- منو ---------- */
  /** items: [{ label, icon, attrs, cls, cnt, href }] یا "-" (جداکننده) یا { cap } (سرفصل) یا { head: {name, sub} } */
  function menuItems(items) {
    return items.map((it) => {
      if (it === "-") return `<div class="tp-menu-sep"></div>`;
      if (it.cap) return `<div class="tp-menu-cap">${esc(it.cap)}</div>`;
      if (it.head) return `<div class="tp-menu-head"><b>${esc(it.head.name)}</b>${it.head.sub ? `<span>${esc(it.head.sub)}</span>` : ""}</div>`;
      const inner = `${it.icon ? `<span class="ico">${ICON[it.icon] || it.icon}</span>` : ""}<span>${it.label}</span>${it.cnt != null && it.cnt !== "" ? `<span class="chip cnt ${it.cntCls || ""}">${it.cnt}</span>` : ""}`;
      if (it.href) return `<a href="${esc(it.href)}" class="${it.cls || ""}" ${it.attrs || ""} role="menuitem">${inner}</a>`;
      return `<button type="button" class="${it.cls || ""}" ${it.attrs || ""} ${it.disabled ? "disabled" : ""} role="menuitem">${inner}</button>`;
    }).join("");
  }
  /** menu({ btn: html دکمه (با data-menu-toggle)، items, cls }) */
  const menu = (o) => `<div class="tp-menu ${o.cls || ""}">${o.btn}<div class="tp-menu-list" role="menu">${menuItems(o.items)}</div></div>`;
  /* باز و بسته شدن با کلیک (لمس) — روی دسکتاپ با نشستنِ موشواره هم باز می‌شود (CSS) */
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-menu-toggle]");
    $$(".tp-menu.open").forEach((m) => { if (!m.contains(e.target) || e.target.closest(".tp-menu-list")) m.classList.remove("open"); });
    if (t) { const m = t.closest(".tp-menu"); if (m) { m.classList.toggle("open"); t.setAttribute("aria-expanded", m.classList.contains("open") ? "true" : "false"); } }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $$(".tp-menu.open").forEach((m) => m.classList.remove("open")); });

  /* ---------- نوار بالا ----------
     o: { title, sub, home (href برند), nav: html, actions: html (دکمه‌های اصلی)، user: {name, sub, initial, img}, items: [منوی پروفایل], theme (پیش‌فرض بله) } */
  function topbar(o) {
    const u = o.user;
    const av = u ? `<span class="tp-avatar ${u.img ? "img" : ""}">${u.img ? `<img src="${esc(u.img)}" alt="">` : esc((u.initial || String(u.name || "؟").trim()[0] || "؟"))}</span>` : "";
    const prof = u ? menu({ cls: "tp-profile", btn: `<button class="tp-avatar-btn" type="button" data-menu-toggle aria-haspopup="menu" aria-expanded="false" title="${esc(u.name || "")}">${av}<span class="nm">${esc(u.name || "")}</span>${ICON.chevron.replace("<svg", '<svg style="width:14px;height:14px;opacity:.6"')}</button>`,
      items: [{ head: { name: u.name, sub: u.sub } }, ...(o.items || [])] }) : "";
    return `<header class="tp-top ui"><a class="brand" href="${esc(o.home || "index.html")}" title="${esc(o.homeTitle || "تدارکات")}"><img src="../assets/logo-new.jpg" alt=""><div><h1>${esc(o.title)}</h1>${o.sub ? `<div class="sub">${o.sub}</div>` : ""}</div></a>
      ${o.nav ? `<nav class="tp-nav">${o.nav}</nav>` : ""}<span class="spacer"></span>
      <div class="tp-tools">${o.actions || ""}${o.theme === false ? "" : themeBtn()}${prof}</div></header>`;
  }

  /* ---------- نوارها ---------- */
  const bar = {
    /** مهلت: p درصدِ سپری‌شده (۰..۱۰۰)؛ lvl: "" | warn | late | over */
    deadline(p, lvl, label, right) {
      return `<div class="tp-dl"><div class="tp-dl-h"><span>${label || "مهلت"}</span><b class="${lvl === "over" ? "over" : ""}">${right || ""}</b></div><div class="tp-bar ${lvl || ""}"><i style="--p:${Math.max(0, Math.min(100, Math.round(p)))}%"></i></div></div>`;
    },
    /** پیشرفت: segs [{ cls, done, cnt, label, title }] */
    progress(segs, big) {
      return `<div class="tp-prog ${big ? "big" : ""}"><div class="tp-prog-track">${segs.map((s) => `<i class="${s.cls || (s.done ? "done" : "")}" title="${esc(s.title || s.label || "")}">${s.cnt ? `<span class="cnt">${esc(s.cnt)}</span>` : ""}</i>`).join("")}</div>
        <div class="tp-prog-labels">${segs.map((s) => `<span class="${s.done ? "done" : ""}" title="${esc(s.title || s.label || "")}">${esc(s.label || "")}</span>`).join("")}</div></div>`;
    },
  };
  /* نام‌های کوتاهِ شش مرحله برای زیرِ نوار */
  const STAGE_SHORT = ["مشاهده", "سوابق", "جستجو", "استعلام", "پیش‌فاکتور", "کمیسیون"];

  /* ---------- ورود ----------
     o: { title, sub, len (۴)، max (۸)، password (بی خانه، یک فیلد)، placeholder، submit (برچسب)، back: {href, label}، alt: html، extra: html، error } */
  function login(o) {
    const cells = Array.from({ length: o.len || 4 }, (_, i) => `<input class="tp-otp-cell" type="${o.secret ? "password" : "text"}" inputmode="numeric" pattern="[0-9]*" autocomplete="${i === 0 ? "one-time-code" : "off"}" aria-label="رقم ${fa(i + 1)}">`).join("");
    return `<div class="tp-auth"><form class="tp-auth-card" data-login-card novalidate>
      <div class="tp-auth-head"><div class="tp-auth-brand"><img src="../assets/logo-new.jpg" alt=""><div><b>${esc(o.company || "تونل سد آریانا")}</b><span>${esc(o.system || "سامانه پشتیبانی خرید")}</span></div></div>${themeBtn()}</div>
      <h1>${esc(o.title)}</h1>${o.sub ? `<p class="tp-auth-sub">${o.sub}</p>` : ""}
      ${o.password ? `<input class="tp-auth-pass" id="${esc(o.id || "pass")}" type="password" autocomplete="${esc(o.autocomplete || "current-password")}" placeholder="${esc(o.placeholder || "")}" aria-label="${esc(o.placeholder || "رمز")}">${o.extra || ""}`
        : `<div class="tp-otp" data-otp data-len="${o.len || 4}" data-max="${o.max || o.len || 4}" role="group" aria-label="${esc(o.placeholder || "کد ورود")}">${cells}</div>`}
      <button class="tp-auth-go" type="submit" data-login><span class="tp-go-3d" aria-hidden="true"><i></i><i></i><i></i></span><span>${esc(o.submit || "ورود")}</span></button>
      <div class="tp-auth-err ${o.ok ? "ok" : ""}" role="alert" aria-live="polite">${esc(o.error || "")}</div>
      ${o.alt ? `<div class="tp-auth-extra">${o.alt}</div>` : ""}
      ${o.back || o.foot ? `<div class="tp-auth-foot">${o.back ? `<a href="${esc(o.back.href)}">${o.back.label || "← بازگشت به تدارکات"}</a>` : "<span></span>"}${o.foot || ""}</div>` : ""}
    </form></div>`;
  }
  /** رفتارِ خانه‌های کد و ارسال؛ o.onSubmit(code) → Promise (خطا ← پیام زیر دکمه) */
  function bindLogin(root, o) {
    const card = $("[data-login-card]", root); if (!card) return;
    const otp = $("[data-otp]", card), err = $(".tp-auth-err", card), go = $("[data-login]", card);
    const value = () => (otp ? $$(".tp-otp-cell", otp).map((c) => c.value).join("") : digits(($("input", card) || {}).value || "").trim());
    const setErr = (m, ok) => { err.textContent = m || ""; err.classList.toggle("ok", !!ok); if (m && !ok && otp) { otp.classList.remove("shake"); void otp.offsetWidth; otp.classList.add("shake"); } };
    const submit = async () => {
      const code = value();
      if (!code) { setErr(o.emptyMsg || "کد را وارد کنید."); const f = otp ? $(".tp-otp-cell", otp) : $("input", card); if (f) f.focus(); return; }
      go.disabled = true; setErr("");
      try { await o.onSubmit(code); }
      catch (e) { setErr(e && e.message ? e.message : String(e)); if (otp) { $$(".tp-otp-cell", otp).forEach((c) => { c.value = ""; c.classList.remove("filled"); }); trim(); $(".tp-otp-cell", otp).focus(); } }
      finally { go.disabled = false; }
    };
    card.onsubmit = (e) => { e.preventDefault(); submit(); };
    if (!otp) { const f = $("input", card); if (f) setTimeout(() => f.focus(), 50); card._setErr = setErr; return { setErr, submit }; }
    const len = +otp.dataset.len || 4, max = +otp.dataset.max || len;
    const cells = () => $$(".tp-otp-cell", otp);
    const mk = () => { const c = document.createElement("input"); c.className = "tp-otp-cell extra"; c.type = $(".tp-otp-cell", otp).type; c.inputMode = "numeric"; c.autocomplete = "off"; c.setAttribute("aria-label", `رقم ${fa(cells().length + 1)}`); otp.appendChild(c); return c; };
    /* خانه‌های اضافه (کدهای بلندتر از ۴ رقم) تا وقتی خالی‌اند بعد از خانهٔ پایه برداشته می‌شوند */
    const trim = () => { let L = cells(); while (L.length > len && !L[L.length - 1].value && !L[L.length - 2].value && document.activeElement !== L[L.length - 1]) { L[L.length - 1].remove(); L = cells(); } };
    const fill = (start, str) => {
      const d = digits(str).replace(/\D/g, ""); if (!d) return;
      let L = cells(), i = start;
      for (const ch of d) { if (i >= L.length) { if (L.length >= max) break; mk(); L = cells(); } L[i].value = ch; L[i].classList.add("filled"); i++; }
      if (i < L.length) L[i].focus(); else if (L.length < max) mk().focus(); else L[L.length - 1].focus();
    };
    otp.addEventListener("input", (e) => {
      const c = e.target, L = cells(), i = L.indexOf(c);
      const d = digits(c.value).replace(/\D/g, "");
      c.value = d.slice(-1);
      c.classList.toggle("filled", !!c.value);
      if (d.length > 1) { fill(i, d); return; }
      if (c.value) { if (i < L.length - 1) L[i + 1].focus(); else if (L.length < max) mk().focus(); }
    });
    otp.addEventListener("keydown", (e) => {
      const c = e.target, L = cells(), i = L.indexOf(c);
      if (e.key === "Backspace" && !c.value && i > 0) { e.preventDefault(); L[i - 1].value = ""; L[i - 1].classList.remove("filled"); L[i - 1].focus(); trim(); }
      else if (e.key === "ArrowLeft" && i > 0) { e.preventDefault(); L[i - 1].focus(); }
      else if (e.key === "ArrowRight" && i < L.length - 1) { e.preventDefault(); L[i + 1].focus(); }
      else if (e.key === "Enter") { e.preventDefault(); submit(); }
    });
    otp.addEventListener("paste", (e) => { e.preventDefault(); fill(0, (e.clipboardData || window.clipboardData).getData("text")); });
    otp.addEventListener("focusin", (e) => { e.target.select && e.target.select(); });
    otp.addEventListener("focusout", () => setTimeout(trim, 0));
    setTimeout(() => { const f = $(".tp-otp-cell", otp); if (f) f.focus(); }, 50);
    card._setErr = setErr;
    return { setErr, submit };
  }

  /* ---------- راهنما ----------
     TP.ui.help.set("expert.tray") در هر رسم؛ TP.ui.help.open(key) از دکمهٔ «؟»؛ محتوا window.TP_HELP */
  const help = (() => {
    let cur = "", panel = null, fab = null, lastFocus = null, q = "";
    const H = () => window.TP_HELP || { area: {}, topics: {} };
    const topics = () => H().topics || {};
    const areaOf = (k) => String(k || "").split(".")[0];
    const areaName = (a) => (H().area || {})[a] || a;
    const nrm = (x) => String(x == null ? "" : x).replace(/[ي]/g, "ی").replace(/[ك]/g, "ک").replace(/‌/g, " ").replace(/\s+/g, " ").toLowerCase().trim();
    const plain = (t) => [t.title, t.summary, ...(t.steps || []), ...(t.tips || []), ...((t.faq || []).flatMap((f) => [f.q, f.a]))].map(nrm).join(" ");
    const find = (k) => { const T = topics(); if (T[k]) return [k, T[k]]; const p = String(k || "").split("."); while (p.length > 1) { p.pop(); const kk = p.join("."); if (T[kk]) return [kk, T[kk]]; } return [null, null]; };
    function mountFab() {
      if (fab && fab.isConnected) return;
      fab = document.createElement("button"); fab.className = "tp-help-fab"; fab.type = "button"; fab.setAttribute("aria-label", "راهنما"); fab.setAttribute("aria-expanded", "false"); fab.title = "راهنما (؟)";
      fab.innerHTML = `${ICON.help}<span>راهنما</span>`;
      if (!ls.get("tp.help.seen")) fab.classList.add("pulse");
      fab.onclick = () => open();
      document.body.appendChild(fab);
    }
    function topicHtml(k, t) {
      const rel = (t.related || []).filter((r) => topics()[r]).map((r) => `<button type="button" data-help-go="${esc(r)}">${esc(topics()[r].title)}</button>`).join("");
      return `<section class="tp-help-topic"><h3>${esc(t.title)}<span class="area">${esc(areaName(areaOf(k)))}</span></h3>
        ${t.summary ? `<p>${t.summary}</p>` : ""}
        ${(t.steps || []).length ? `<div class="tip-h">گام‌به‌گام</div><ol>${t.steps.map((s) => `<li>${s}</li>`).join("")}</ol>` : ""}
        ${(t.tips || []).length ? `<div class="tip-h">نکته‌ها</div><ul class="tips">${t.tips.map((s) => `<li>${s}</li>`).join("")}</ul>` : ""}
        ${(t.faq || []).length ? `<div class="tip-h">پرسش‌های رایج</div><ul>${t.faq.map((f) => `<li><b>${f.q}</b><br>${f.a}</li>`).join("")}</ul>` : ""}
        ${rel ? `<div class="tip-h">مرتبط</div><div class="rel">${rel}</div>` : ""}</section>`;
    }
    function listHtml(key) {
      const T = topics(), a = areaOf(key), qq = nrm(q);
      const keys = Object.keys(T).filter((k) => (qq ? plain(T[k]).includes(qq) : areaOf(k) === a));
      if (!keys.length) return `<div class="tp-help-none">${qq ? "چیزی با این واژه پیدا نشد." : "موضوعی برای این بخش ثبت نشده."}</div>`;
      const groups = new Map();
      keys.forEach((k) => { const g = areaOf(k); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(k); });
      return [...groups].map(([g, ks]) => `<h4>${esc(areaName(g))}</h4><div class="grp">${ks.map((k) => `<button type="button" class="${k === key ? "on" : ""}" data-help-go="${esc(k)}">${esc(T[k].title)}</button>`).join("")}</div>`).join("");
    }
    function paint(key) {
      const body = $(".tp-help-body", panel); if (!body) return;
      const [k, t] = find(key);
      body.innerHTML = (t && !nrm(q) ? topicHtml(k, t) : "") + `<nav class="tp-help-list">${listHtml(k || key)}</nav>`;
      body.scrollTop = 0;
    }
    function open(key) {
      ls.set("tp.help.seen", "1"); if (fab) fab.classList.remove("pulse");
      const k = key || cur || "";
      if (!panel) {
        panel = document.createElement("div"); panel.className = "tp-help";
        panel.innerHTML = `<div class="tp-help-scrim" data-help-close></div><aside class="tp-help-panel" role="dialog" aria-modal="true" aria-labelledby="tp-help-title">
          <header><h2 id="tp-help-title">${ICON.help} راهنما</h2><button class="tp-icon-btn" type="button" data-help-close aria-label="بستن راهنما" title="بستن (Esc)">${ICON.x}</button></header>
          <div class="tp-help-search"><input type="search" placeholder="جستجو در راهنما…" aria-label="جستجو در راهنما"></div><div class="tp-help-body"></div></aside>`;
        panel.classList.toggle("right", !!(fab && fab.classList.contains("right")));
        document.body.appendChild(panel);
        panel.addEventListener("click", (e) => { if (e.target.closest("[data-help-close]")) close(); const g = e.target.closest("[data-help-go]"); if (g) { q = ""; $("input", panel).value = ""; paint(g.dataset.helpGo); } });
        $("input", panel).addEventListener("input", (e) => { q = e.target.value; paint(cur); });
        panel.addEventListener("keydown", (e) => {
          if (e.key === "Escape") { e.preventDefault(); close(); return; }
          if (e.key !== "Tab") return;
          const f = $$("button, input, [href]", panel).filter((x) => !x.disabled && x.offsetParent !== null);
          if (!f.length) return;
          if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
          else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
        });
      }
      lastFocus = document.activeElement;
      panel.hidden = false; q = ""; $("input", panel).value = "";
      paint(k);
      if (fab) fab.setAttribute("aria-expanded", "true");
      if (window.matchMedia("(max-width: 640px)").matches) document.body.style.overflow = "hidden";
      setTimeout(() => { const b = $("[data-help-close].tp-icon-btn", panel); if (b) b.focus(); }, 30);
    }
    function close() {
      if (!panel || panel.hidden) return;
      panel.hidden = true; document.body.style.overflow = "";
      if (fab) fab.setAttribute("aria-expanded", "false");
      if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (_) { /* بی‌اهمیت */ }
    }
    /* دکمه‌های کوچکِ «؟» کنار بخش‌ها و میان‌بر «?» (بیرون از فیلدها) */
    document.addEventListener("click", (e) => { const b = e.target.closest("[data-help]"); if (b) { e.preventDefault(); e.stopPropagation(); open(b.dataset.help); } });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target; if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault(); if (panel && !panel.hidden) close(); else open();
    });
    /** set(key, { fab: false (بی دکمهٔ شناور — صفحه دکمهٔ «؟» خودش را دارد)، side: "right" (وقتی گوشی سمت چپ است) }) */
    return { set(key, o) { cur = key || ""; mountFab(); fab.hidden = !!(o && o.fab === false); const right = !!(o && o.side === "right"); fab.classList.toggle("right", right); if (panel) panel.classList.toggle("right", right); if (panel && !panel.hidden) paint(cur); }, open, close, current: () => cur };
  })();
  /** دکمهٔ «؟» کنار بخش‌های پیچیده */
  const info = (key, title) => `<button type="button" class="tp-info" data-help="${esc(key)}" title="${esc(title || "راهنما")}" aria-label="${esc(title || "راهنما")}">؟</button>`;

  /* ---------- بازخوانیِ خودکارِ بی‌پرش ----------
     هر ms میلی‌ثانیه (پنجرهٔ پنهان: نه)، فقط وقتی کاربر وسطِ کاری نیست: فیلدی فوکوس ندارد، پنجره‌ای باز نیست، منویی باز نیست.
     fn() می‌تواند Promise برگرداند؛ guard() اختیاری برای شرطِ صفحه. */
  function autoRefresh(fn, ms, guard) {
    let timer = null, busy = false;
    const idle = () => {
      const a = document.activeElement;
      if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable)) return false;
      if ($(".tp-modal-bg, .tp-menu.open, .tp-help:not([hidden]), .chart-bg, .jdp, .fpop")) return false;
      return true;
    };
    const tick = async () => {
      if (document.hidden || busy || !idle() || (guard && !guard())) return;
      busy = true; try { await fn(); } catch (_) { /* بازخوانیِ فرعی */ } busy = false;
    };
    const start = () => { stop(); timer = setInterval(tick, ms || 60000); };
    const stop = () => { if (timer) clearInterval(timer); timer = null; };
    document.addEventListener("visibilitychange", () => { if (!document.hidden && timer) tick(); });
    start();
    return { start, stop, now: tick };
  }

  /* ---------- کارتِ درخواست برای میز مدیر و تیمِ ارشد (یک درخواست، چند ارجاع) ----------
     o: { attrs, lvl ("" | warn | late | over), rid, date, need, project, party, center, chips (html)، menu (html)،
          items: { first, total }, drawerOpen, drawerHtml (html اقلام)، toggleAttrs (دکمهٔ باز/بسته)، units: [html هر ارجاع]، foot (html) } */
  function reqCard(o) {
    const proj = o.project || o.party || "—";
    return `<article class="tp-rcard mgr ${o.lvl ? `lvl-${o.lvl}` : ""}" ${o.attrs || ""} style="--i:${Math.min(o.i || 0, 12)}">
      <header><span class="rid">${esc(o.rid)}</span>${o.date ? `<span class="rdate">${esc(o.date)}</span>` : ""}${o.need ? `<span class="chip" title="نزدیک‌ترین تاریخ نیاز اقلام">نیاز ${esc(o.need)}</span>` : ""}<span class="chips">${o.chips || ""}</span>${o.menu ? `<span class="more" data-stop>${o.menu}</span>` : ""}</header>
      <div class="rproj" title="${esc(proj)}">${ICON.project}<span>${esc(proj)}</span>${o.project && o.party && o.project !== o.party ? `<span class="dim">(${esc(o.party)})</span>` : ""}${o.center ? `<span class="dim">· ${esc(o.center)}</span>` : ""}</div>
      ${o.items ? `<div class="rmeta ritems"><button type="button" class="tp-btn xs" ${o.toggleAttrs || ""} title="اقلام" data-stop>${o.drawerOpen ? "▾" : "◂"} ${esc(o.items.total)} قلم</button><span class="rfirst" title="${esc(o.items.first || "")}">${esc(o.items.first || "")}</span>${o.items.total > 1 ? `<span class="dim">و ${esc(o.items.total - 1)} قلم دیگر</span>` : ""}</div>` : ""}
      ${(o.units || []).length ? `<div class="tp-units">${o.units.join("")}</div>` : ""}
      ${o.drawerOpen && o.drawerHtml ? `<div class="tp-drawer">${o.drawerHtml}</div>` : ""}
      ${o.foot || ""}</article>`;
  }
  /** یک ارجاع داخلِ کارت: o: { who (html کارشناس)، days (html)، ticks (html)، status (html)، bars (html)، acts (html منو) } */
  const unitRow = (o) => `<div class="tp-unit"><div class="u-who">${o.who || ""}${o.ticks ? `<span class="u-ticks">${o.ticks}</span>` : ""}</div><div class="u-days">${o.days || ""}</div><div class="u-bars">${o.bars || ""}</div><div class="u-st">${o.status || ""}</div><div class="u-acts">${o.acts || ""}</div></div>`;

  /* ---------- ردیفِ فهرستِ گفت‌وگو به سبک تلگرام (مکاتبات) ----------
     o: { attrs, cls, on, av: { text | img, color }, title (html), sub (html پیش‌نمایش)، time, badges (html)، lock } */
  const AV_COLORS = ["#e17076", "#eda86c", "#a695e7", "#7bc862", "#6ec9cb", "#65aadd", "#ee7aae", "#5f8ad6"];
  const avColor = (s) => { let h = 0; for (const c of String(s || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0; return AV_COLORS[h % AV_COLORS.length]; };
  const avInitial = (s) => (String(s || "").replace(/^(تأمین‌کنندهٔ|شرکت|فروشگاه|آقای|خانم|مهندس)\s+/, "").trim()[0] || "؟");
  function chatRow(o) {
    const av = o.av || {};
    return `<button type="button" class="tp-chat ${o.on ? "on" : ""} ${o.cls || ""}" ${o.attrs || ""}>
      <span class="av ${av.img ? "img" : ""}" style="--av:${av.color || avColor(o.title)}">${av.img ? `<img src="${esc(av.img)}" alt="">` : esc(av.text || avInitial(o.title))}${o.lock ? `<i class="lk">${ICON.key.replace("<svg", '<svg style="width:10px;height:10px"')}</i>` : ""}</span>
      <span class="body"><span class="l1"><span class="nm">${o.title}</span>${o.time ? `<span class="tm">${esc(o.time)}</span>` : ""}</span>
        <span class="l2"><span class="pv">${o.sub || ""}</span><span class="bd">${o.badges || ""}</span></span></span></button>`;
  }

  /* انیمیشنِ ورودِ کارت‌ها فقط بارِ اولی که فهرست نشان داده می‌شود؛ بازرندرهای بعدی (ذخیرهٔ یک فیلد، بازخوانی خودکار)
     کلاس settled می‌گیرند تا کارت‌ها «نپرند». resetOnce وقتی کاربر دوباره به آن فهرست می‌آید. */
  const shown = new Set();
  const once = (key) => { if (shown.has(key)) return "settled"; shown.add(key); return ""; };
  const resetOnce = (key) => { shown.delete(key); };

  TP.ui = { ICON, esc, fa, digits, theme, themeBtn, mountBg, menu, menuItems, topbar, bar, STAGE_SHORT, login, bindLogin, help, info, autoRefresh, reqCard, unitRow, chatRow, avColor, avInitial, once, resetOnce };
})();
