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
    document.body.classList.toggle("sky-fog", kind === "fog");   /* ui.css (گوشی): رنگِ بومِ زیرِ صفحه = لبهٔ پایینِ مه */
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
  const MOBILE = window.matchMedia ? matchMedia("(max-width: 720px)") : { matches: false, addEventListener() {} };
  /* نوار بالای گوشی مثل نوارِ اپ‌ها: با اسکرول به پایین کنار می‌رود و با کمی بالا آمدن برمی‌گردد (ui.css: .tp-top.ui.tp-away).
     بالای صفحه، یا وقتی منوی پروفایلِ داخلش باز است، همیشه پیداست. فقط روی گوشی؛ رویدادِ passive و یک بار در هر فریم. */
  (() => {
    let lastY = 0, ticking = false;
    const run = () => {
      ticking = false;
      const bar = document.querySelector(".tp-top.ui"); if (!bar) return;
      const y = window.scrollY || 0;
      if (!MOBILE.matches || y < 70 || bar.querySelector(".tp-menu.open, :focus-within")) { bar.classList.remove("tp-away"); lastY = y; return; }
      if (y > lastY + 8) bar.classList.add("tp-away");
      else if (y < lastY - 8) bar.classList.remove("tp-away");
      else return;
      lastY = y;
    };
    window.addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(run); } }, { passive: true });
    MOBILE.addEventListener && MOBILE.addEventListener("change", run);
  })();
  /** menu({ btn: html دکمه (با data-menu-toggle)، items, cls }) */
  const menu = (o) => `<div class="tp-menu ${o.cls || ""}">${o.btn}<div class="tp-menu-list" role="menu">${menuItems(o.items)}</div></div>`;
  /* گوشی: لمسِ پس‌زمینهٔ تیرهٔ برگه (::afterِ خودِ .tp-menu) فقط منو را می‌بندد — در فازِ capture، پیش از آنکه به کارت یا ردیفِ
     دربرگیرنده برسد و آن را باز کند؛ فوکوس هم جابه‌جا نمی‌شود */
  const scrimOf = (e) => (MOBILE.matches && e.target && e.target.classList && e.target.classList.contains("tp-menu") && e.target.classList.contains("open") ? e.target : null);
  document.addEventListener("pointerdown", (e) => { if (scrimOf(e)) e.preventDefault(); }, true);
  document.addEventListener("click", (e) => {
    const m = scrimOf(e); if (!m) return;
    e.preventDefault(); e.stopPropagation();
    m.classList.remove("open");
    const t = m.querySelector("[data-menu-toggle]"); if (t) t.setAttribute("aria-expanded", "false");
    if (document.activeElement && m.contains(document.activeElement)) document.activeElement.blur();
    unfree();
  }, true);
  /* باز و بسته شدن با کلیک (لمس) — روی دسکتاپ با نشستنِ موشواره هم باز می‌شود (CSS) */
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-menu-toggle]");
    /* گوشی: منو برگهٔ پایین است و لمسِ پس‌زمینهٔ تیره‌اش (::after همان .tp-menu) می‌بندد */
    $$(".tp-menu.open").forEach((m) => {
      if (!m.contains(e.target) || e.target === m || e.target.closest(".tp-menu-list")) {
        m.classList.remove("open");
        if (e.target === m && document.activeElement && m.contains(document.activeElement)) document.activeElement.blur();
      }
    });
    if (t) { const m = t.closest(".tp-menu"); if (m) { m.classList.toggle("open"); t.setAttribute("aria-expanded", m.classList.contains("open") ? "true" : "false"); if (m.classList.contains("open")) fitMenu(m); } }
    unfree();
  });
  /* فهرستِ باز از لبهٔ صفحه بیرون نزند (گوشی: دکمهٔ «⋯» وسطِ ردیف است و فهرست از سمتِ راست بیرون می‌رفت) */
  /* برگهٔ fixed فقط وقتی به خودِ صفحه می‌چسبد که هیچ جدی transform، filter، backdrop-filter، will-change یا contain نداشته باشد
     (انیمیشنِ ورودِ کارت‌ها با fill-mode: both یک transformِ «هیچ‌کاره» جا می‌گذارد). تا برگه باز است آن جدها بی این‌ها می‌مانند. */
  const XF = ["transform", "filter", "backdropFilter", "perspective"];
  function freeFixed(m) {
    for (let p = m.parentElement; p && p !== document.body; p = p.parentElement) {
      const c = getComputedStyle(p);
      if (XF.some((k) => c[k] && c[k] !== "none") || (c.willChange && c.willChange !== "auto") || (c.contain && c.contain !== "none")) p.classList.add("tp-xfree");
    }
  }
  const unfree = () => { if (!document.querySelector(".tp-menu.open")) $$(".tp-xfree").forEach((x) => x.classList.remove("tp-xfree")); };
  function fitMenu(m) {
    const l = m && m.querySelector(":scope > .tp-menu-list"); if (!l) return;
    l.style.left = ""; l.style.right = "";
    if (MOBILE.matches) { freeFixed(m); return; } /* گوشی: برگهٔ پایینِ صفحه (ui.css)، همیشه داخلِ قاب */
    const vw = document.documentElement.clientWidth, r = l.getBoundingClientRect(), pad = 8;
    const d = r.right > vw - pad ? vw - pad - r.right : r.left < pad ? pad - r.left : 0;
    if (!d) return;
    l.style.right = "auto"; l.style.left = `${l.offsetLeft + d}px`;
  }
  document.addEventListener("pointerover", (e) => { const m = e.pointerType === "mouse" && e.target.closest && e.target.closest(".tp-menu"); if (m && !m.contains(e.relatedTarget)) fitMenu(m); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { $$(".tp-menu.open").forEach((m) => m.classList.remove("open")); unfree(); } });

  /* ---------- نوار بالا ----------
     o: { title, sub, home (href برند), nav: html, actions: html (دکمه‌های اصلی)، user: {name, sub, initial, img}, items: [منوی پروفایل], theme (پیش‌فرض بله) } */
  function topbar(o) {
    const u = o.user;
    const av = u ? `<span class="tp-avatar ${u.img ? "img" : ""}">${u.img ? `<img src="${esc(u.img)}" alt="">` : esc((u.initial || String(u.name || "؟").trim()[0] || "؟"))}</span>` : "";
    const prof = u ? menu({ cls: "tp-profile", btn: `<button class="tp-avatar-btn" type="button" data-menu-toggle aria-haspopup="menu" aria-expanded="false" title="${esc(u.name || "")}">${av}<span class="nm">${esc(u.name || "")}</span>${ICON.chevron.replace("<svg", '<svg style="width:14px;height:14px;opacity:.6"')}</button>`,
      items: [{ head: { name: u.name, sub: u.sub } }, ...(o.items || [])] }) : "";
    /* o.back = { href | attrs, label }: دکمهٔ «بازگشت» پیش از نشان — فقط گوشی و تبلت (ui.css .tp-back)؛ دسکتاپ بی‌تغییر */
    const bl = esc((o.back && o.back.label) || "بازگشت");
    const back = !o.back ? "" : o.back.href
      ? `<a class="tp-back" href="${esc(o.back.href)}" title="${bl}" aria-label="${bl}">${ICON.back}</a>`
      : `<button type="button" class="tp-back" ${o.back.attrs || ""} title="${bl}" aria-label="${bl}">${ICON.back}</button>`;
    return `<header class="tp-top ui">${back}<a class="brand" href="${esc(o.home || "./")}" title="${esc(o.homeTitle || "تدارکات")}"><img src="../assets/logo-new.jpg" alt=""><div><h1>${esc(o.title)}</h1>${o.sub ? `<div class="sub">${o.sub}</div>` : ""}</div></a>
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
    /* «دستیار سامانه» (worker/help-bot.js): فقط وقتی پنلِ کارکنان بعد از ورود assistant({role, api, name}) را داده باشد */
    let asst = null, mode = "topics";
    const chat = { msgs: null, busy: false, err: "", sure: false };
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
    const ASK_ICON = svg('<path d="M21 12a8.5 8.5 0 0 1-12.4 7.5L3 21l1.5-5.4A8.5 8.5 0 1 1 21 12z"/><path d="M8.5 10.5h7M8.5 14h4.5"/>');
    const askCard = () => (asst ? `<button type="button" class="tp-help-ask" data-help-ask><span class="ic" aria-hidden="true">${ASK_ICON}</span>
      <span class="tx"><b>سؤالت را از دستیار سامانه بپرس</b><small>همکارِ هوشمندی که کلِ سامانه را می‌شناسد</small></span><span class="go" aria-hidden="true">‹</span></button>` : "");

    /* ---------- «🗺 نقشهٔ کار» (مهر ۱۴۰۵، خواستهٔ مالک): فلوچارتِ جریانِ کارِ هر صفحه زیرِ کارتِ دستیار ----------
       داده در help-flows.js (window.TP_FLOWS) و با اولین بازشدنِ راهنما بار می‌شود تا صفحه‌ها سنگین نشوند. کارت یک پیش‌نمایشِ
       کوچک از همان نمودار است؛ کلیکش نمودار را مثل یک تصویر وسطِ صفحه باز می‌کند (بزرگ‌نمایی، Esc، تمام‌صفحه روی گوشی). */
    const FL = { data: null, wait: null, lb: null, zoom: 1, back: null, ov: "" };
    const MAP_ICON = svg('<path d="M9 4 3 6.5V20l6-2.5 6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>');
    const EXPAND_ICON = svg('<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>');
    const THUMB_W = 560;
    function flowLoad() {
      if (FL.data || FL.wait) return FL.wait || Promise.resolve(FL.data);
      FL.wait = new Promise((res) => {
        const sc = document.createElement("script"); sc.src = "help-flows.js?v=3"; sc.async = true;
        sc.onload = () => { FL.data = window.TP_FLOWS || null; res(FL.data); };
        sc.onerror = () => { FL.wait = null; sc.remove(); res(null); };
        document.head.appendChild(sc);
      });
      return FL.wait;
    }
    /** نمودارِ همین کلید، یا نامِ مستعارش، یا نمودارِ بخشِ بالاتر (expert.terms ← expert.history) */
    function flowOf(key) {
      const D = FL.data; if (!D || !key) return null;
      const F = D.flows || {}, A = D.alias || {}, p = String(key).split(".");
      while (p.length) { const k = p.join("."); if (F[k]) return [k, F[k]]; if (A[k] && F[A[k]]) return [A[k], F[A[k]]]; p.pop(); }
      return null;
    }
    const isStep = (n) => !n.k && !n.q;
    function flowHtml(f) {
      const W = (FL.data && FL.data.who) || {};
      const main = f.s.filter(isStep), no = new Map(main.map((n, i) => [n, i + 1]));
      const col = (w) => (w && W[w] ? ` style="--c:${W[w][1]}"` : "");
      const who = (w) => (w && W[w] ? `<span class="fc-who"${col(w)}>${esc(W[w][0])}</span>` : "");
      const tx = (n) => `<span class="fc-tx"><b>${esc(n.t)}</b>${n.d ? `<small>${esc(n.d)}</small>` : ""}</span>`;
      const node = (n, top) => (n.k ? `<div class="fc-n fc-${n.k === "end" ? "end" : "start"}">${tx(n)}</div>`
        : `<div class="fc-n fc-step"${col(n.w)}>${top && no.has(n) ? `<span class="fc-no">${fa(no.get(n))}</span>` : `<span class="fc-dot" aria-hidden="true"></span>`}${tx(n)}${who(n.w)}</div>`);
      /* «ادامه»: نامِ همان گره‌ای که بعد از این تصمیم می‌آید — تا خطِ زیرِ تصمیم با شاخهٔ وسط اشتباه نشود */
      const nextLabel = (x) => (!x ? "ادامه" : x.k === "end" ? `■ ${x.t}` : x.q ? `؟ ${x.q}` : no.has(x) ? `گام ${fa(no.get(x))} · ${x.t}` : x.t);
      const go = (g, after) => (g === "end" ? `<div class="fc-go end">■ پایان</div>` : g === "next" ? `<div class="fc-go next">↓ ادامه<small>${esc(nextLabel(after))}</small></div>`
        : typeof g === "number" ? `<div class="fc-go">↩ برو به گام ${fa(g)}<small>${esc((main[g - 1] || {}).t || "")}</small></div>` : `<div class="fc-go end">${esc(g)}</div>`);
      const A = `<div class="fc-a" aria-hidden="true"></div>`, AD = `<div class="fc-a dash" aria-hidden="true"></div>`;
      const dec = (n, after) => `<div class="fc-d"><div class="fc-q"><span class="fc-qi" aria-hidden="true">؟</span>${tx({ t: n.q, d: n.d })}</div>${A}
        <div class="fc-brs" style="--n:${n.b.length}">${n.b.map((b) => `<div class="fc-br"><span class="fc-bl">${esc(b.l)}</span>${(b.s || []).length ? A + seq(b.s, false) : ""}${b.go != null ? A + go(b.go, after) : ""}</div>`).join("")}</div></div>`;
      const seq = (arr, top) => arr.map((n, i) => (i ? (arr[i - 1].q ? AD : A) : "") + (n.q ? dec(n, arr[i + 1]) : node(n, top))).join("");
      return `<div class="tp-fc">${seq(f.s, true)}</div>`;
    }
    function flowCard(key) {
      if (!FL.data) return FL.wait ? `<div class="tp-flowcard wait" data-flow-wait aria-hidden="true"><span class="hd"><span class="ic">${MAP_ICON}</span><span class="tx"><b>نقشهٔ کارِ این صفحه</b><small>…</small></span></span><span class="thumb"></span></div>` : "";
      const r = flowOf(key); if (!r) return "";
      const [fk, f] = r, here = flowOf(cur), n = f.s.filter(isStep).length;
      return `<div class="tp-flowcard" role="button" tabindex="0" data-help-flow="${esc(fk)}" aria-label="${esc(`نقشهٔ کار: ${f.t} — باز کردنِ نمودار`)}">
        <span class="hd"><span class="ic" aria-hidden="true">${MAP_ICON}</span><span class="tx"><b>${here && here[0] === fk ? "نقشهٔ کارِ این صفحه" : "نقشهٔ کارِ این بخش"}</b><small>${esc(f.t)} · ${fa(n)} گام</small></span><span class="go" aria-hidden="true">${EXPAND_ICON}</span></span>
        <span class="thumb" aria-hidden="true"><span class="in">${flowHtml(f)}</span></span></div>`;
    }
    function fitThumbs(root) {
      root.querySelectorAll(".tp-flowcard .thumb").forEach((t) => { const w = t.clientWidth; if (w) t.style.setProperty("--s", String(Math.min(1, w / THUMB_W))); });
    }
    function flowOpen(fk) {
      const f = FL.data && (FL.data.flows || {})[fk]; if (!f) return;
      flowClose(true);
      FL.back = document.activeElement; FL.zoom = 1; FL.ov = document.body.style.overflow;
      const W = FL.data.who || {}, used = [];
      const walk = (arr) => arr.forEach((n) => { if (n.w && W[n.w] && !used.includes(n.w)) used.push(n.w); (n.b || []).forEach((b) => walk(b.s || [])); });
      walk(f.s);
      const lb = document.createElement("div"); lb.className = "tp-flowlb";
      lb.innerHTML = `<div class="tp-flowlb-scrim" data-flow-close></div>
        <figure class="tp-flowlb-sheet" role="dialog" aria-modal="true" aria-labelledby="tp-flowlb-t">
          <header><span class="ic" aria-hidden="true">${MAP_ICON}</span><div class="tt"><h2 id="tp-flowlb-t">${esc(f.t)}</h2>${f.d ? `<small>${esc(f.d)}</small>` : ""}</div>
            <div class="zm" role="group" aria-label="بزرگ‌نمایی"><button type="button" data-flow-zoom="-1" aria-label="کوچک‌تر" title="کوچک‌تر">−</button><button type="button" class="pct" data-flow-zoom="0" aria-label="اندازهٔ اصلی" title="اندازهٔ اصلی">${fa(100)}٪</button><button type="button" data-flow-zoom="1" aria-label="بزرگ‌تر" title="بزرگ‌تر">+</button></div>
            <button type="button" class="tp-icon-btn" data-flow-close aria-label="بستن نمودار" title="بستن (Esc)">${ICON.x}</button></header>
          <div class="tp-flowlb-body"><div class="tp-fcbox">${flowHtml(f)}</div></div>
          <figcaption class="tp-flowlb-legend">${used.map((w) => `<span class="fc-who"${` style="--c:${W[w][1]}"`}>${esc(W[w][0])}</span>`).join("")}
            <span class="lg"><i class="q" aria-hidden="true">؟</i>تصمیم: هر شاخه یک مسیر</span><span class="lg">↩ برگشت به گام</span><span class="lg">■ پایان</span></figcaption></figure>`;
      document.body.appendChild(lb); FL.lb = lb; document.body.style.overflow = "hidden";
      lb.addEventListener("click", (e) => {
        if (e.target.closest("[data-flow-close]")) return flowClose();
        const z = e.target.closest("[data-flow-zoom]"); if (z) flowZoom(Number(z.dataset.flowZoom));
      });
      lb.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); flowClose(); return; }
        if (e.key === "+" || e.key === "=") { e.preventDefault(); return flowZoom(1); }
        if (e.key === "-") { e.preventDefault(); return flowZoom(-1); }
        if (e.key !== "Tab") return;
        const f2 = $$("button, [tabindex]", lb).filter((x) => !x.disabled && x.offsetParent !== null);
        if (!f2.length) return;
        if (e.shiftKey && document.activeElement === f2[0]) { e.preventDefault(); f2[f2.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f2[f2.length - 1]) { e.preventDefault(); f2[0].focus(); }
      });
      setTimeout(() => { const b = $("[data-flow-close].tp-icon-btn", lb); if (b) b.focus(); }, 30);
    }
    const ZOOMS = [0.6, 0.75, 0.9, 1, 1.15, 1.3, 1.5, 1.75];
    function flowZoom(d) {
      if (!FL.lb) return;
      const i = ZOOMS.indexOf(FL.zoom);
      FL.zoom = d === 0 ? 1 : ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? 3 : i) + d))];
      const box = $(".tp-fcbox", FL.lb); if (box) box.style.zoom = String(FL.zoom);
      const p = $(".pct", FL.lb); if (p) p.textContent = `${fa(Math.round(FL.zoom * 100))}٪`;
    }
    function flowClose(quiet) {
      if (!FL.lb) return;
      FL.lb.remove(); FL.lb = null; document.body.style.overflow = FL.ov;
      if (!quiet && FL.back && FL.back.focus) try { FL.back.focus(); } catch (_) { /* بی‌اهمیت */ }
    }
    function paint(key) {
      const body = $(".tp-help-body", panel); if (!body) return;
      if (mode === "chat" && asst) return paintChat(true);
      const [k, t] = find(key);
      body.innerHTML = (!nrm(q) ? askCard() + flowCard(k || key) : "") + (t && !nrm(q) ? topicHtml(k, t) : "") + `<nav class="tp-help-list">${listHtml(k || key)}</nav>`;
      body.dataset.flowKey = k || key || "";
      fitThumbs(body);
      body.scrollTop = 0;
    }
    /* help-flows.js تازه رسید: فقط جای کارتِ «در حالِ آمدن» عوض می‌شود (اسکرول و بقیهٔ کشو دست نمی‌خورد) */
    function flowArrived() {
      const body = panel && $(".tp-help-body", panel), w = body && $("[data-flow-wait]", body);
      if (!w) return;
      const h = flowCard(body.dataset.flowKey || cur);
      if (!h) { w.remove(); return; }
      w.insertAdjacentHTML("afterend", h); w.remove(); fitThumbs(body);
    }
    /* ---------- گفت‌وگو با دستیار ---------- */
    const first = (n) => { const w = String(n || "").replace(/^(آقای|خانم|جناب)\s+/, "").split(/\s+/).filter(Boolean); while (w.length > 1 && /^(سید|سیده|میر|حاج|حاجی)$/.test(w[0])) w.shift(); return w[0] || ""; };
    const fmt = (t) => esc(t).replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>");
    const SUGGEST = {
      expert: ["این صفحه به چه کاری می‌آید؟", "استعلام را چطور برای تأمین‌کننده بفرستم؟", "جدول کمیسیون را چطور بسازم؟", "کارشناس هوشمند چه کاری انجام می‌دهد؟"],
      manager: ["فایل روزانهٔ درخواست‌ها را چطور بارگذاری کنم؟", "ارجاع هوشمند چطور کار می‌کند؟", "رنگ کارت‌های میز ارجاع یعنی چه؟", "گزارش عملکرد کارشناسان را کجا ببینم؟"],
      support: ["مناقصه را چطور بسازم و شروع کنم؟", "تیک «هوشمند» کارشناس یعنی چه؟", "تأیید کمیسیون را کجا بزنم؟", "اعلان‌های گوشی را چطور روشن کنم؟"],
    };
    /* k: موضوعی که باید نشان داده شود (دکمهٔ «؟» کنارِ هر بخش)؛ بی آن، موضوعِ همین صفحه */
    function setMode(m, k) {
      mode = m === "chat" && asst ? "chat" : "topics";
      if (!panel) return;
      panel.classList.toggle("chat", mode === "chat");
      const h = $(".tp-help-panel > header", panel);
      h.innerHTML = mode === "chat"
        ? `<button class="tp-icon-btn" type="button" data-help-back aria-label="برگشت به راهنما" title="برگشت به راهنما">${svg('<path d="M9 6l6 6-6 6"/>')}</button>
           <h2 id="tp-help-title">${ASK_ICON} دستیار سامانه</h2><span class="sp"></span>
           <button class="tp-btn sm ghost" type="button" data-help-new title="پاک کردن این گفت‌وگو">${chat.sure ? "مطمئنی؟ پاک شود" : "گفت‌وگوی تازه"}</button>
           <button class="tp-icon-btn" type="button" data-help-close aria-label="بستن" title="بستن (Esc)">${ICON.x}</button>`
        : `<h2 id="tp-help-title">${ICON.help} راهنما</h2><button class="tp-icon-btn" type="button" data-help-close aria-label="بستن راهنما" title="بستن (Esc)">${ICON.x}</button>`;
      $(".tp-help-search", panel).hidden = mode === "chat";
      $(".tp-help-compose", panel).hidden = mode !== "chat";
      if (mode === "chat") { paintChat(true); if (chat.msgs == null) loadChat(); setTimeout(() => { const t = $(".tp-help-compose textarea", panel); if (t && !MOBILE.matches) t.focus(); }, 60); }
      else paint(k || cur);
    }
    function bubble(m) {
      const me = m.who === "u";
      return `<div class="tp-cm ${me ? "me" : "bot"}${m.err ? " err" : ""}">${me ? "" : `<img src="../assets/logo-new.jpg" alt="" aria-hidden="true">`}<div class="b">${fmt(m.text)}${m.retry ? `<button type="button" class="tp-btn xs" data-help-retry>دوباره بفرست</button>` : ""}</div></div>`;
    }
    function paintChat(toEnd) {
      const body = $(".tp-help-body", panel); if (!body) return;
      const n = first(asst && asst.name);
      const hello = { who: "a", text: `سلام${n ? ` ${n} جان` : ""}! 👋 من دستیار سامانه‌ام. هر جای سامانه گیر کردی، نمی‌دونستی کاری رو کجا انجام بدی یا فکر کردی چیزی درست کار نمی‌کنه، همین‌جا بپرس؛ کل سامانه رو می‌شناسم.` };
      const list = chat.msgs || [];
      const sugg = !list.length && !chat.busy ? `<div class="tp-csugg">${(SUGGEST[asst && asst.role] || SUGGEST.expert).map((x) => `<button type="button" data-help-q="${esc(x)}">${esc(x)}</button>`).join("")}</div>` : "";
      body.innerHTML = `<div class="tp-chatlog" aria-live="polite">${chat.msgs == null ? `<div class="tp-cload">${loader("")}</div>` : [hello, ...list].map(bubble).join("") + sugg
        + (chat.busy ? `<div class="tp-cm bot typing"><img src="../assets/logo-new.jpg" alt=""><div class="b"><i></i><i></i><i></i></div></div>` : "")}</div>`;
      if (toEnd) body.scrollTop = body.scrollHeight;
    }
    async function loadChat() {
      try { const r = await asst.api(`/help/chat?role=${encodeURIComponent(asst.role)}`); chat.msgs = r.messages || []; if (r.name && !asst.name) asst.name = r.name; }
      catch (e) { chat.msgs = [{ who: "a", text: `گفت‌وگوهای قبلی خوانده نشد: ${e.message || e}`, err: true }]; }
      if (mode === "chat") paintChat(true);
    }
    async function send(text) {
      const t = String(text || "").trim(); if (!t || chat.busy || !asst) return;
      if (t.length > 1200) { chat.msgs = [...(chat.msgs || []), { who: "a", text: "پیامت کمی بلند است؛ لطفاً کوتاه‌ترش کن (حداکثر ۱۲۰۰ نویسه).", err: true }]; return paintChat(true); }
      chat.msgs = (chat.msgs || []).filter((m) => !m.retry);
      chat.msgs.push({ who: "u", text: t, pending: true }); chat.busy = true; chat.last = t; paintChat(true);
      try {
        const r = await asst.api("/help/chat", { role: asst.role, text: t, page: cur });
        chat.msgs = chat.msgs.filter((m) => !m.pending).concat(r.messages || []);
      } catch (e) {
        chat.msgs = chat.msgs.filter((m) => !m.pending);
        chat.msgs.push({ who: "u", text: t }, { who: "a", text: e.message || "پاسخ نیامد.", err: true, retry: true });
      }
      chat.busy = false; paintChat(true);
    }
    async function clearChat() {
      if (!chat.sure) { chat.sure = true; setMode("chat"); setTimeout(() => { if (chat.sure) { chat.sure = false; if (mode === "chat") setMode("chat"); } }, 4000); return; }
      chat.sure = false;
      try { await asst.api("/help/chat/clear", { role: asst.role }); chat.msgs = []; } catch (e) { chat.msgs = [...(chat.msgs || []), { who: "a", text: e.message || "پاک نشد.", err: true }]; }
      setMode("chat");
    }
    /* گوشی: کیبورد برگه را نپوشاند — پایین و ارتفاعِ برگه با viewportِ دیدنی */
    function fitKeyboard() {
      const vv = window.visualViewport, a = panel && $(".tp-help-panel", panel); if (!a) return;
      if (!vv || !MOBILE.matches || mode !== "chat" || panel.hidden) { a.style.bottom = ""; a.style.height = ""; return; }
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      a.style.bottom = kb ? `${kb}px` : ""; a.style.height = kb ? `${Math.round(vv.height * 0.96)}px` : "";
    }
    if (window.visualViewport) { window.visualViewport.addEventListener("resize", fitKeyboard); window.visualViewport.addEventListener("scroll", fitKeyboard); }
    function open(key) {
      ls.set("tp.help.seen", "1"); if (fab) fab.classList.remove("pulse");
      const k = key || cur || "";
      if (!panel) {
        panel = document.createElement("div"); panel.className = "tp-help";
        panel.innerHTML = `<div class="tp-help-scrim" data-help-close></div><aside class="tp-help-panel" role="dialog" aria-modal="true" aria-labelledby="tp-help-title">
          <header><h2 id="tp-help-title">${ICON.help} راهنما</h2><button class="tp-icon-btn" type="button" data-help-close aria-label="بستن راهنما" title="بستن (Esc)">${ICON.x}</button></header>
          <div class="tp-help-search"><input type="search" placeholder="جستجو در راهنما…" aria-label="جستجو در راهنما"></div><div class="tp-help-body"></div>
          <form class="tp-help-compose" hidden><textarea rows="1" placeholder="سؤالت را بنویس…" aria-label="پیام به دستیار سامانه" maxlength="1200"></textarea>
            <button class="tp-help-send" type="submit" aria-label="فرستادن">${svg('<path d="M20 4L3 11l7 2 2 7 8-16z"/>')}</button></form></aside>`;
        panel.classList.toggle("right", !!(fab && fab.classList.contains("right")));
        document.body.appendChild(panel);
        panel.addEventListener("click", (e) => {
          if (e.target.closest("[data-help-close]")) return close();
          const g = e.target.closest("[data-help-go]"); if (g) { q = ""; $("input", panel).value = ""; paint(g.dataset.helpGo); return; }
          if (e.target.closest("[data-help-ask]")) return setMode("chat");
          const fl = e.target.closest("[data-help-flow]"); if (fl) return flowOpen(fl.dataset.helpFlow);
          if (e.target.closest("[data-help-back]")) { chat.sure = false; return setMode("topics"); }
          if (e.target.closest("[data-help-new]")) return clearChat();
          const sq = e.target.closest("[data-help-q]"); if (sq) return send(sq.dataset.helpQ);
          if (e.target.closest("[data-help-retry]")) { const t = chat.last; chat.msgs = (chat.msgs || []).filter((m) => !m.retry); if (chat.msgs.length && chat.msgs[chat.msgs.length - 1].who === "u") chat.msgs.pop(); return send(t); }
        });
        const form = $(".tp-help-compose", panel), ta = $("textarea", form);
        const grow = () => { ta.style.height = "auto"; ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`; };
        ta.addEventListener("input", grow);
        ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit")); } });
        ta.addEventListener("focus", () => setTimeout(fitKeyboard, 250));
        form.addEventListener("submit", (e) => { e.preventDefault(); const t = ta.value; if (!t.trim() || chat.busy) return; ta.value = ""; grow(); send(t); });
        $("input", panel).addEventListener("input", (e) => { q = e.target.value; paint(cur); });
        panel.addEventListener("keydown", (e) => {
          if (e.key === "Escape") { e.preventDefault(); close(); return; }
          if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("[data-help-flow]")) { e.preventDefault(); flowOpen(e.target.dataset.helpFlow); return; }
          if (e.key !== "Tab") return;
          const f = $$("button, input, textarea, [href]", panel).filter((x) => !x.disabled && x.offsetParent !== null);
          if (!f.length) return;
          if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
          else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
        });
      }
      lastFocus = document.activeElement;
      panel.hidden = false; q = ""; $("input", panel).value = "";
      if (!FL.data) flowLoad().then(flowArrived);
      setMode(key ? "topics" : mode, k);
      if (fab) fab.setAttribute("aria-expanded", "true");
      if (window.matchMedia("(max-width: 640px)").matches) document.body.style.overflow = "hidden";
      setTimeout(() => { const b = $("[data-help-close].tp-icon-btn", panel); if (b) b.focus(); }, 30);
    }
    function close() {
      if (!panel || panel.hidden) return;
      panel.hidden = true; document.body.style.overflow = ""; chat.sure = false; fitKeyboard();
      if (fab) fab.setAttribute("aria-expanded", "false");
      if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (_) { /* بی‌اهمیت */ }
    }
    /* دکمه‌های کوچکِ «؟» کنار بخش‌ها و میان‌بر «?» (بیرون از فیلدها) */
    document.addEventListener("click", (e) => { const b = e.target.closest("[data-help]"); if (b) { e.preventDefault(); e.stopPropagation(); open(b.dataset.help); } });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target; if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (FL.lb) return;
      e.preventDefault(); if (panel && !panel.hidden) close(); else open();
    });
    window.addEventListener("resize", () => { if (panel && !panel.hidden) fitThumbs(panel); });
    /** set(key, { fab: false (بی دکمهٔ شناور — صفحه دکمهٔ «؟» خودش را دارد)، side: "right" (وقتی گوشی سمت چپ است) }) */
    /** assistant({role, api(path, body), name}) بعد از ورودِ کارکنان؛ null در خروج */
    function assistant(o) {
      const same = asst && o && asst.role === o.role && asst.name === (o.name || null);
      if (!same) { chat.msgs = null; chat.busy = false; }
      asst = o ? { role: o.role, api: o.api, name: o.name || null } : null;
      if (!asst && mode === "chat") mode = "topics";
      if (panel && !panel.hidden && !same) setMode(mode);
    }
    return { set(key, o) { cur = key || ""; mountFab(); fab.hidden = !!(o && o.fab === false); const right = !!(o && o.side === "right"); fab.classList.toggle("right", right); if (panel) panel.classList.toggle("right", right); if (panel && !panel.hidden && mode !== "chat") paint(cur); }, open, close, current: () => cur, assistant };
  })();
  /** دکمهٔ «؟» کنار بخش‌های پیچیده */
  const info = (key, title) => `<button type="button" class="tp-info" data-help="${esc(key)}" title="${esc(title || "راهنما")}" aria-label="${esc(title || "راهنما")}">؟</button>`;

  /* ---------- بازخوانیِ خودکارِ بی‌پرش ----------
     هر ms میلی‌ثانیه (پنجرهٔ پنهان: نه)، فقط وقتی کاربر وسطِ کاری نیست: فیلدی فوکوس ندارد، پنجره‌ای باز نیست، منویی باز نیست.
     fn() می‌تواند Promise برگرداند؛ guard() اختیاری برای شرطِ صفحه. idle() همان نگهبان برای صفحه‌ها (تازه‌سازیِ پنل کارشناس با تیکِ «🤖 / ✋»). */
  function idle() {
    const a = document.activeElement;
    if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable)) return false;
    if ($(".tp-modal-bg, .tp-menu.open, .tp-help:not([hidden]), .tp-flowlb, .chart-bg, .jdp, .fpop")) return false;
    return true;
  }
  function autoRefresh(fn, ms, guard) {
    let timer = null, busy = false;
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
      <header><span class="rid">${esc(o.rid)}</span>${o.date ? `<span class="rdate">${esc(o.date)}</span>` : ""}${o.need ? `<span class="chip" title="نزدیک‌ترین تاریخ نیاز اقلام">نیاز ${esc(o.need)}</span>` : ""}<span class="chips">${o.size || ""}${o.chips || ""}</span>${o.menu ? `<span class="more" data-stop>${o.menu}</span>` : ""}</header>
      <div class="rproj" title="${esc(proj)}">${ICON.project}<span>${esc(proj)}</span>${o.project && o.party && o.project !== o.party ? `<span class="dim">(${esc(o.party)})</span>` : ""}${o.center ? `<span class="dim">· ${esc(o.center)}</span>` : ""}</div>
      ${o.items ? `<div class="rmeta ritems"><button type="button" class="tp-btn xs" ${o.toggleAttrs || ""} title="اقلام" data-stop>${o.drawerOpen ? "▾" : "◂"} ${esc(o.items.total)} قلم</button><span class="rfirst" title="${esc(o.items.first || "")}">${esc(o.items.first || "")}</span>${o.items.est || ""}${o.items.total > 1 ? `<span class="dim">و ${esc(o.items.total - 1)} قلم دیگر</span>` : ""}</div>` : ""}
      ${(o.units || []).length ? `<div class="tp-units">${o.units.join("")}</div>` : ""}
      ${o.drawerOpen && o.drawerHtml ? `<div class="tp-drawer">${o.drawerHtml}</div>` : ""}
      ${o.foot || ""}</article>`;
  }
  /* ---------- برچسبِ اندازهٔ درخواست و برآوردِ قیمتِ قلم (worker/size.js، worker/estimate.js) ----------
     مبلغ‌ها در دیتابیس ریالی‌اند؛ مرزهای رده به تومان (۱ تومان = ۱۰ ریال). size از سرور: {cat, total_rial, n, est, miss, pend, partial} */
  const SIZE_FA = { s: "جزئی", m: "متوسط", l: "بزرگ", b: "عمده" };
  const nM = (n) => Math.round(Number(n) || 0).toLocaleString("en-US");
  function sizeChip(sz, cm) {
    if (!sz || !sz.n) return "";
    /* برچسبِ لحظهٔ جدول کمیسیون (bundle.js:commissionSize): جمعِ بالاترین پیشنهادِ کلِ هر قلم */
    if (cm) {
      if (!sz.cat) return "";
      const t = `برچسبِ کمیسیون: جمعِ بالاترین پیشنهادِ کلِ اقلام ≈ ${nM(sz.total_rial / 10)} تومان (${nM(sz.total_rial)} ریال) · ${nM(sz.quoted)} از ${nM(sz.n)} قلم پیشنهاد داشت`;
      return `<span class="chip sz sz-${sz.cat}" title="${esc(t)}">🏷 ${SIZE_FA[sz.cat]}${sz.partial ? `<i class="sz-part" aria-label="ناقص">◐</i>` : ""}</span>`;
    }
    if (!sz.cat) {
      return sz.pend ? `<span class="chip sz" title="برآوردِ قیمتِ اقلام هنوز در صف است">⏳ برآورد</span>`
        : `<span class="chip sz" title="هیچ قلمی خریدِ هم‌واحد و هم‌لایه در سوابق نداشت">بی‌برآورد</span>`;
    }
    const tip = `برآوردِ کل ≈ ${nM(sz.total_rial / 10)} تومان (${nM(sz.total_rial)} ریال) · ${nM(sz.est)} از ${nM(sz.n)} قلم برآورد شد${sz.partial ? ` — ${sz.pend ? `${nM(sz.pend)} قلم در صف، ` : ""}${nM(sz.miss)} قلم بی‌برآورد` : ""}`;
    return `<span class="chip sz sz-${sz.cat}" title="${esc(tip)}">${SIZE_FA[sz.cat]}${sz.partial ? `<i class="sz-part" aria-label="ناقص">◐</i>` : ""}</span>`;
  }
  /** برآوردِ قیمت واحدِ یک قلم کنارِ نامش — title: برآوردِ کل (قیمت واحد × مقدار) */
  function estTxt(it) {
    if (!it) return "";
    if (it.est_unit_rial > 0) {
      const tot = it.qty > 0 ? it.est_unit_rial * it.qty : null;
      return `<span class="est num" title="${esc(`برآوردِ قیمت واحد از سوابق (قیمت روز)${tot ? ` · برآوردِ کل ≈ ${nM(tot)} ریال (${nM(tot / 10)} تومان)` : ""}`)}">≈ ${nM(it.est_unit_rial)} ریال</span>`;
    }
    return it.est_at ? `<span class="est none" title="در سوابق خریدِ هم‌واحد و هم‌لایه پیدا نشد">بی‌برآورد</span>` : `<span class="est none" title="برآورد در صف است">⏳</span>`;
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

  /** در حال بارگذاری: لوگوی آریانا با نوار دایره‌ایِ چرخان دورش (ui.css: .ui-load)؛ page = وسطِ کلِ صفحه */
  function loader(text, page) {
    return `<div class="ui-load${page ? " page" : ""}" role="status" aria-live="polite"><span class="ui-load-ring" aria-hidden="true"><i></i><img src="../assets/logo-new.jpg" alt=""></span><span class="ui-load-t">${esc(text || "در حال بارگذاری…")}</span></div>`;
  }

  /* ---------- اعلانِ گوشی و مرورگر (Web Push؛ سرور: worker/push.js، سرویس‌ورکر: push-sw.js) ----------
     push.mount({ role: "expert"|"manager"|"support", who, api(path, body) }) — بعد از ورود، در هر رسم صدا زدنش بی‌خطر است.
     • آیفون فقط وقتی پنل «Add to Home Screen» شده و از همان‌جا باز شده اعلان می‌گیرد (iOS 16.4+)؛ در Safari معمولی
       کارتِ راهنمای افزودن به صفحهٔ اصلی می‌آید. کامپیوتر و اندروید: کارتِ «روشن کردن اعلان‌ها».
     • requestPermission باید مستقیم در کلیک باشد (آیفون بعد از await اجازه نمی‌پرسد)؛ سرویس‌ورکر از قبل ثبت می‌شود.
     • اجازه از قبل هست ← اشتراک بی‌صدا به همین کاربر بسته می‌شود (هر شش ساعت یک بار، یا با عوض شدنِ کاربر).
     • push.off() در خروج: این دستگاه دیگر اعلانِ این کاربر را نمی‌گیرد. */
  const push = (() => {
    let cfg = null, card = null, regP = null;
    const ok = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && window.isSecureContext;
    const ios = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone = () => (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
    const mobile = () => ios() || /Android/i.test(navigator.userAgent);
    const SNOOZE = "tp.push.snooze", BOUND = "tp.push.bound";
    const snoozed = () => Number(ls.get(SNOOZE) || 0) > Date.now();
    const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const unb64 = (s) => { const t = s.replace(/-/g, "+").replace(/_/g, "/"); const b = atob(t + "===".slice((t.length + 3) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
    function reg() {
      if (!regP) regP = navigator.serviceWorker.register("push-sw.js", { scope: "./" }).then(async (r) => {
        if (r.active) return r;
        const w = r.installing || r.waiting;
        if (w) await new Promise((res) => { const f = () => { if (w.state === "activated") { w.removeEventListener("statechange", f); res(); } }; w.addEventListener("statechange", f); f(); });
        return r;
      });
      return regP;
    }
    /** اشتراکِ این مرورگر ← سرور (با نقش و کاربرِ فعلی) */
    async function bind(force) {
      const r = await reg();
      const { key } = await cfg.api("/push/key");
      let s = await r.pushManager.getSubscription();
      /* کلیدِ سرور عوض شده؟ اشتراکِ قدیمی دیگر کار نمی‌کند */
      if (s && s.options && s.options.applicationServerKey && b64(s.options.applicationServerKey) !== key) { await s.unsubscribe().catch(() => {}); s = null; }
      if (!s) s = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64(key) });
      const mark = `${cfg.role}:${cfg.who}:${s.endpoint.slice(-24)}`;
      const was = (ls.get(BOUND) || "").split("|");
      if (!force && was[0] === mark && Date.now() - Number(was[1] || 0) < 6 * 3600000) return s;
      await cfg.api("/push/subscribe", { role: cfg.role, sub: s.toJSON() });
      ls.set(BOUND, `${mark}|${Date.now()}`);
      return s;
    }
    function hide() { if (card) { card.remove(); card = null; } }
    function show(html, wire) {
      hide();
      card = document.createElement("div"); card.className = "tp-pushcard"; card.setAttribute("role", "dialog"); card.setAttribute("aria-label", "اعلان‌ها");
      card.innerHTML = `<span class="ic" aria-hidden="true">${svg('<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>')}</span><div class="tx">${html}</div>`;
      document.body.appendChild(card);
      wire(card);
    }
    const later = (days) => { ls.set(SNOOZE, String(Date.now() + days * 86400000)); hide(); };
    function render() {
      if (!cfg) return;
      const p = ok() ? Notification.permission : "na";
      if (p === "granted") { hide(); bind().catch((e) => console.warn("push bind", e && e.message)); return; }
      if (snoozed() || p === "denied") return hide();
      /* آیفون در Safari معمولی: اول افزودن به صفحهٔ اصلی */
      if (ios() && !standalone()) {
        if (card && card.dataset.k === "ios") return;
        show(`<b>اعلان روی آیفون</b><p>پنل را به صفحهٔ اصلی بیفزایید: در Safari دکمهٔ اشتراک‌گذاری (مربع با فلشِ رو به بالا) و بعد «Add to Home Screen» را بزنید؛ سپس پنل را از همان نماد باز کنید تا اعلان‌ها را روشن کنید.</p>
          <div class="acts"><button type="button" class="tp-btn sm" data-pl="14">باشه</button></div>`, (c) => { c.dataset.k = "ios"; c.querySelector("[data-pl]").onclick = () => later(14); });
        return;
      }
      if (p === "na") return hide();
      if (card && card.dataset.k === "ask") return;
      const where = mobile() ? "روی همین گوشی" : "در همین مرورگر، حتی وقتی پنل بسته است";
      const what = { expert: "ارجاع تازه، پیام تأمین‌کننده، یادآوری مهلت و پرسش‌های کارشناس هوشمند", manager: "درخواست‌های تأیید، تغییر وضعیت، عبور از مهلت و هشدارها",
        support: "هشدارها، تحویل‌های کارشناس هوشمند و رخدادهای زندهٔ مناقصه" }[cfg.role] || "خبرهای مربوط به شما";
      show(`<b>اعلان‌ها را روشن کنید</b><p>${what} ${where} خبر داده می‌شود.</p>
        <div class="acts"><button type="button" class="tp-btn primary sm" data-pon>روشن کردن اعلان‌ها</button><button type="button" class="tp-btn sm" data-pl="3">بعداً</button></div>
        <p class="err" role="alert" hidden></p>`, (c) => {
        c.dataset.k = "ask";
        c.querySelector("[data-pl]").onclick = () => later(3);
        c.querySelector("[data-pon]").onclick = (ev) => {
          const b = ev.currentTarget, err = c.querySelector(".err");
          b.disabled = true;
          /* مستقیم در همان کلیک (شرطِ آیفون و فایرفاکس) */
          Notification.requestPermission().then(async (res) => {
            if (res !== "granted") { err.hidden = false; err.textContent = res === "denied" ? "اجازهٔ اعلان داده نشد. از تنظیمات مرورگر یا گوشی می‌توانید بعداً روشنش کنید." : "اجازه داده نشد."; b.disabled = false; if (res === "denied") setTimeout(hide, 6000); return; }
            try {
              await bind(true);
              await cfg.api("/push/test", { role: cfg.role }).catch(() => {});
              c.querySelector(".tx").innerHTML = `<b>اعلان‌ها روشن شد ✓</b><p>یک اعلانِ آزمایشی فرستاده شد. از این به بعد هر خبرِ مربوط به شما همین‌جا می‌آید.</p>`;
              setTimeout(hide, 5000);
            } catch (e) { err.hidden = false; err.textContent = `روشن نشد: ${e.message || e}`; b.disabled = false; }
          });
        };
      });
    }
    return {
      supported: ok,
      mount(o) {
        const same = cfg && cfg.role === o.role && cfg.who === String(o.who);
        cfg = { role: o.role, who: String(o.who == null ? "" : o.who), api: o.api };
        if (ok()) reg().catch(() => {});
        if (!same || !card) render();
      },
      /** خروج: این دستگاه دیگر اعلانِ این کاربر را نمی‌گیرد (اشتراکِ مرورگر می‌ماند تا ورودِ بعدی دوباره بسته شود) */
      async off(api) {
        hide();
        const call = api || (cfg && cfg.api); cfg = null;
        ls.set(BOUND, "");
        if (!ok() || !call) return;
        try { const r = await navigator.serviceWorker.getRegistration("./"); const s = r && await r.pushManager.getSubscription(); if (s) await call("/push/unsubscribe", { endpoint: s.endpoint }); } catch (_) { /* بی‌صدا */ }
      },
      /** آزمایش از منو */
      async test() { if (!cfg) return; await bind(true); return cfg.api("/push/test", { role: cfg.role }); },
      state: () => (ok() ? Notification.permission : ios() && !standalone() ? "ios-tab" : "na"),
    };
  })();

  TP.ui = { ICON, esc, fa, digits, theme, themeBtn, mountBg, menu, menuItems, topbar, bar, STAGE_SHORT, login, bindLogin, help, info, autoRefresh, idle, reqCard, unitRow, sizeChip, estTxt, chatRow, avColor, avInitial, once, resetOnce, loader, push };
})();
