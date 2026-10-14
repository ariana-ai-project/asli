/* ============================================================
   حرکتِ پنل‌ها (مهر ۱۴۰۵، DESIGN_STACK: GSAP) — فقط ظاهر؛ به منطق، داده و رندرِ پنل‌ها دست نمی‌زند.
   بار: defer. خودش ../vendor/gsap-3.15.0.min.js را بعد از load صفحه بار می‌کند تا رندرِ اولِ پنل روی اینترنتِ کند منتظرش نماند؛
   تا رسیدنش (یا اگر نرسید، یا «حرکت کمتر») ۱ و ۲ کاری نمی‌کنند و همه‌چیز مثلِ قبل است. ۳ به GSAP نیاز ندارد.
   الگوها از کتابخانهٔ React Bits گرفته و بومی (بی React) نوشته شده‌اند، راست‌به‌چپ و بی شکستنِ حروفِ فارسی:
   ۱) نشانگرِ لغزانِ تب‌ها (PillNav): حبابِ تبِ فعالِ .tp-seg / .tabs / .tp-pills با کلیک از جای قبلی تا تبِ تازه می‌لغزد.
      ظاهرِ حباب از خودِ تبِ فعال کپی می‌شود؛ تبِ فعال در همین چند صدم ثانیه پس‌زمینه‌اش را پنهان می‌کند. اگر پنل در این
      میان دوباره رندر کند، تب‌های تازه بی این کلاس‌اند و چیزی نمی‌ماند.
   ۲) شمارشِ اعداد (CountUp): عددِ کارت‌برگ‌ها (.tp-stat، «⭐ ارزیابی ربات»، داشبوردِ کارشناس هوشمند) بارِ اولِ دیده شدن از صفر،
      و بعد فقط وقتی عوض شد از عددِ قبلی تا تازه می‌شمارد. رقم‌ها (فارسی/لاتین)، جداکنندهٔ هزارگان، اعشار و ٪ همان متنِ اصلی‌اند
      و آخرِ کار دقیقاً همان متنِ اصلی نوشته می‌شود. بازرندرِ خودکارِ پنل با همان عدد، چیزی را نمی‌شمارد.
   ۳) عوض کردنِ حالتِ شب و روز: پوستهٔ تازه از جای دکمهٔ خورشید/ماه به شکلِ دایره پهن می‌شود (View Transitions؛
      مرورگرِ بی آن همان عوض شدنِ فوری). خودِ عوض کردن همان کدِ shared.js / ui.js است، دست‌نخورده.
   ============================================================ */
(function () {
  "use strict";
  if (!document.body || window.TP_MOTION) return;
  window.TP_MOTION = true;
  const RM = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const reduced = () => !!(RM && RM.matches);
  let G = window.gsap || null;
  /* GSAP بعد از load (و کمی بیکاری)؛ «حرکت کمتر» ← اصلاً بار نمی‌شود */
  const loadGsap = () => {
    if (G || reduced() || loadGsap.done) return;
    loadGsap.done = true;
    const s = document.createElement("script");
    s.src = "../vendor/gsap-3.15.0.min.js";
    s.async = true;
    s.onload = () => { G = window.gsap || null; };
    document.head.appendChild(s);
  };
  const soon = () => (window.requestIdleCallback ? window.requestIdleCallback(loadGsap, { timeout: 1500 }) : setTimeout(loadGsap, 300));
  if (document.readyState === "complete") soon(); else window.addEventListener("load", soon, { once: true });

  /* ---------- ۱) نشانگرِ لغزانِ تب‌ها ---------- */
  const TAB_SET = ".tp-seg, .tabs, .tp-pills";
  const TAB_ITEM = ".tp-seg > button, .tp-seg > .tp-menu > button, .tp-seg .tp-menu-list [data-tab], .tabs > .tab, .tp-pills > .tp-pill";
  /* تبِ فعالِ یک مجموعه: دکمهٔ .on، یا دکمهٔ منوی .on (تب‌های گروه‌شده در «تنظیمات ▾»)، یا aria-selected */
  function activeOf(set) {
    for (const c of set.children) {
      if (c.classList.contains("mo-tab-ind")) continue;
      if (c.classList.contains("tp-menu")) { if (c.classList.contains("on")) return c.querySelector(":scope > button"); continue; }
      if (c.classList.contains("on") || c.getAttribute("aria-selected") === "true") return c;
    }
    return null;
  }
  const idOf = (el) => (el && (el.dataset.tab || el.getAttribute("data-fbwin") || el.textContent.trim())) || "";
  const countOf = (set) => { let n = 0; for (const c of set.children) if (!c.classList.contains("mo-tab-ind")) n++; return n; };
  const CSS_COPY = ["backgroundColor", "backgroundImage", "backgroundSize", "backgroundPosition", "backgroundRepeat", "boxShadow",
    "borderTopLeftRadius", "borderTopRightRadius", "borderBottomLeftRadius", "borderBottomRightRadius",
    "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth", "borderTopStyle", "borderRightStyle", "borderBottomStyle", "borderLeftStyle",
    "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor"];

  let watch = 0;
  document.addEventListener("click", (e) => {
    if (reduced() || !G) return;
    const item = e.target && e.target.closest ? e.target.closest(TAB_ITEM) : null;
    if (!item) return;
    const set = item.closest(TAB_SET);
    const from = set && activeOf(set);
    if (!from) return;
    const idx = Array.prototype.indexOf.call(document.querySelectorAll(TAB_SET), set);
    const fr = from.getBoundingClientRect(), fromId = idOf(from), n = countOf(set);
    const tok = ++watch, t0 = performance.now();
    /* پنل ممکن است همان لحظه، یا بعد از خواندنِ داده، دوباره رندر کند؛ تا ۱٫۵ ثانیه نگاه می‌کنیم.
       همان مجموعه = همان شماره در صفحه و همان تعدادِ تب؛ وگرنه کاری نمی‌کنیم */
    const look = () => {
      if (tok !== watch) return;
      const s2 = document.querySelectorAll(TAB_SET)[idx];
      const a2 = s2 && countOf(s2) === n ? activeOf(s2) : null;
      if (a2 && idOf(a2) !== fromId) {
        const r2 = a2.getBoundingClientRect();
        if (r2.width && (Math.abs(r2.left - fr.left) > 1 || Math.abs(r2.top - fr.top) > 1)) slide(s2, a2, fr, idx, n);
        return;
      }
      if (performance.now() - t0 < 1500) requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  }, true);

  const DUR = 0.42;
  /* مختصاتِ یک مستطیلِ صفحه نسبت به درونِ مجموعهٔ تب (با اسکرولِ افقیِ .tabs) */
  const rel = (set, r) => {
    const sr = set.getBoundingClientRect();
    const ox = sr.left + set.clientLeft - set.scrollLeft, oy = sr.top + set.clientTop - set.scrollTop;
    return { left: r.left - ox, top: r.top - oy, width: r.width, height: r.height };
  };
  function slide(set, el, fr, idx, n) {
    const toId = idOf(el);
    const cs = getComputedStyle(el);
    const ind = document.createElement("i");
    ind.className = "mo-tab-ind";
    ind.setAttribute("aria-hidden", "true");
    for (const k of CSS_COPY) ind.style[k] = cs[k];
    let cur = null, tw = null, done = false;
    const t0 = performance.now();
    const attach = (s, a) => {
      cur = { set: s, el: a, ownPos: s.style.position };
      if (getComputedStyle(s).position === "static") s.style.position = "relative";
      s.classList.add("mo-tabs");
      a.classList.add("mo-tab-on");
      s.appendChild(ind);
    };
    const release = () => {
      if (!cur) return;
      cur.el.classList.remove("mo-tab-on");
      cur.set.classList.remove("mo-tabs");
      cur.set.style.position = cur.ownPos;
    };
    const finish = () => {
      if (done) return;
      done = true;
      mo.disconnect();
      if (tw) tw.kill();
      ind.remove();
      release();
    };
    const go = (a, dur) => {
      const B = rel(cur.set, a.getBoundingClientRect());
      if (tw) tw.kill();
      tw = G.to(ind, { left: B.left, top: B.top, width: B.width, height: B.height, duration: dur, ease: "power3.out", onComplete: finish });
    };
    /* پنل وسطِ لغزیدن دوباره رندر کرد (مثلاً دادهٔ همان تب رسید): حباب به تب‌های تازه می‌رود و از همان‌جا ادامه می‌دهد.
       MutationObserver پیش از نقاشیِ بعدی صدا می‌خورد، پس هیچ قابی بی حباب یا با پس‌زمینهٔ تبِ تازه دیده نمی‌شود */
    const mo = new MutationObserver(() => {
      if (done || ind.isConnected) return;
      const s3 = document.querySelectorAll(TAB_SET)[idx];
      const a3 = s3 && countOf(s3) === n ? activeOf(s3) : null;
      if (!a3 || idOf(a3) !== toId) { finish(); return; }
      release();
      attach(s3, a3);
      go(a3, Math.max(0.12, DUR - (performance.now() - t0) / 1000));
    });
    attach(set, el);
    const A = rel(set, fr);
    Object.assign(ind.style, { left: `${A.left}px`, top: `${A.top}px`, width: `${A.width}px`, height: `${A.height}px` });
    mo.observe(document.body, { childList: true, subtree: true });
    go(el, DUR);
    setTimeout(finish, 1500);
  }

  /* ---------- ۲) شمارشِ اعداد ---------- */
  const NUM_SEL = ".tp-stat .sb > b, .sv-fbk > b, .kpi .k > span";
  const FA = "۰۱۲۳۴۵۶۷۸۹", AR = "٠١٢٣٤٥٦٧٨٩";
  const NUM_RE = /^([+\-−]?)([0-9۰-۹٠-٩]{1,3}(?:[٬,][0-9۰-۹٠-٩]{3})+|[0-9۰-۹٠-٩]+)(?:([.٫])([0-9۰-۹٠-٩]+))?(\s?[%٪])?$/;
  const toLatin = (s) => s.replace(/[۰-۹]/g, (d) => FA.indexOf(d)).replace(/[٠-٩]/g, (d) => AR.indexOf(d));
  function parse(raw) {
    const t = raw.trim(), m = NUM_RE.exec(t);
    if (!m) return null;
    const int = toLatin(m[2]).replace(/[٬,]/g, ""), frac = m[4] ? toLatin(m[4]) : "";
    const v = parseFloat(`${m[1] ? "-" : ""}${int}${frac ? `.${frac}` : ""}`);
    if (!isFinite(v)) return null;
    return { v, sign: m[1] || "", dec: frac.length, decSep: m[3] || "", group: /[٬,]/.test(m[2]) ? (m[2].includes("٬") ? "٬" : ",") : "",
      digits: /[۰-۹]/.test(t) ? FA : /[٠-٩]/.test(t) ? AR : null, suffix: m[5] || "", lead: raw.match(/^\s*/)[0], trail: raw.match(/\s*$/)[0] };
  }
  function format(v, p) {
    const a = Math.abs(v).toFixed(p.dec);
    let [i, f] = a.split(".");
    if (p.group) i = i.replace(/\B(?=(\d{3})+(?!\d))/g, p.group);
    let s = f ? `${i}${p.decSep || "."}${f}` : i;
    if (p.digits) s = s.replace(/[0-9]/g, (d) => p.digits[d]);
    return `${p.lead}${v < 0 ? p.sign || "-" : ""}${s}${p.suffix}${p.trail}`;
  }
  function labelOf(el) {
    const st = el.closest(".tp-stat");
    if (st) { const s = st.querySelector(".sb > small"); return s && s.textContent.trim(); }
    const fk = el.closest(".sv-fbk");
    if (fk) { const s = fk.querySelector(":scope > small"); return s && s.textContent.trim(); }
    const k = el.closest(".kpi .k");
    if (k) { const s = k.querySelector(":scope > b"); return s && s.textContent.trim(); }
    return "";
  }
  const seen = new Map(), running = new Map();
  const inView = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight; };
  function countUp(el) {
    const tn = el.firstChild;
    if (!tn || tn.nodeType !== 3) return;
    const raw = tn.nodeValue, p = parse(raw), lab = p && labelOf(el);
    if (!p || !lab) return;
    const key = `${location.pathname}${location.hash}|${lab}`;
    const prev = seen.get(key);
    seen.set(key, p.v);
    /* شمارشِ همین عدد هنوز در کار است و پنل همان کارت‌برگ را دوباره ساخت: از همان عددِ میانه روی گرهٔ تازه ادامه بده
       (وگرنه عدد یک‌باره از میانه به آخر می‌پرید)؛ گرهٔ قبلی اگر هنوز در صفحه است متنِ نهایی‌اش را می‌گیرد */
    const run = running.get(key);
    let from, dur;
    if (run) {
      from = run.o.v;
      dur = Math.max(0.2, run.tw.duration() - run.tw.time());
      run.tw.kill();
      if (run.tn.isConnected) run.tn.nodeValue = run.raw;
      running.delete(key);
    } else {
      from = prev === undefined ? 0 : prev;
      dur = prev === undefined ? 0.9 : 0.6;
      if (prev === undefined && !inView(el)) return;
    }
    if (reduced() || !G || from === p.v) return;
    const o = { v: from };
    tn.nodeValue = format(from, p);
    const tw = G.to(o, { v: p.v, duration: dur, ease: "power2.out",
      onUpdate: () => { tn.nodeValue = format(o.v, p); },
      onComplete: () => { tn.nodeValue = raw; running.delete(key); } });
    running.set(key, { tw, o, tn, raw });
  }
  const scan = (n) => {
    if (n.nodeType !== 1) return;
    if (n.matches(NUM_SEL)) countUp(n);
    n.querySelectorAll(NUM_SEL).forEach(countUp);
  };
  new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) scan(n); }).observe(document.body, { childList: true, subtree: true });
  scan(document.body);

  /* ---------- ۳) شب و روز: پهن شدنِ دایره‌ای از جای دکمه ---------- */
  let passThrough = false;
  window.addEventListener("click", (e) => {
    if (passThrough || reduced() || typeof document.startViewTransition !== "function") return;
    const b = e.target && e.target.closest ? e.target.closest("[data-theme-toggle]") : null;
    if (!b) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    const r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const R = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    const root = document.documentElement;
    root.classList.add("mo-vt-theme");
    let vt;
    try {
      vt = document.startViewTransition(() => { passThrough = true; try { b.click(); } finally { passThrough = false; } });
    } catch (_) { root.classList.remove("mo-vt-theme"); passThrough = true; try { b.click(); } finally { passThrough = false; } return; }
    vt.ready.then(() => {
      root.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${R}px at ${x}px ${y}px)`] },
        { duration: 560, easing: "cubic-bezier(.2, .8, .2, 1)", pseudoElement: "::view-transition-new(root)" });
    }).catch(() => {});
    vt.finished.finally(() => root.classList.remove("mo-vt-theme"));
  }, true);
})();
