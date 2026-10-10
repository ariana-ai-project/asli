/* ============================================================
   سامانهٔ پشتیبانی خرید — جعبه‌ابزارِ تعامل (مهر ۱۴۰۵) — بر TP.ui افزوده می‌شود
   اصولِ طراحی که مالک برای همهٔ سامانه خواست:
   - هر تأییدِ کاربر یک پاسخِ دیدنی دارد: دایره‌ای وسط صفحه که تیکِ سبز می‌خورد (TP.ui.success).
   - دکمه‌های ناوبری (میز ارجاع، کارشناسان، تنظیمات …) با نشستنِ موشواره می‌درخشند — تکان نمی‌خورند — و نور
     دنبالِ موشواره می‌آید؛ با کلیک، «روحی» از نورِ سفیدِ شیشه‌ای از دکمهٔ فعال به دکمهٔ تازه می‌پرد.
     هر دو از پنل پشتیبانیِ صفحهٔ خانه روشن و خاموش می‌شوند (GET /site → fx).
   - تنظیم با حرکت، نه تیک: کلید (switch)، دایرهٔ چرخان (knob)، لغزنده (slider)، امتیازِ نقطه‌ای (rating) و
     نوارِ آستانه‌ها با دستگیره‌های کشیدنی (track). همه با صفحه‌کلید هم کار می‌کنند.
   - کادرهای بازشونده با حرکت باز و بسته می‌شوند و وقتی بازند ساکن‌اند (TP.ui.reveal).
   مقدارِ تازه با رویدادهای «tp-input» (حین کشیدن) و «tp-change» (پایانِ تغییر) روی خودِ عنصر خبر داده می‌شود.
   ============================================================ */
(function () {
  "use strict";
  if (typeof document === "undefined") return;
  const TP = (window.TP = window.TP || {});
  const UI = (TP.ui = TP.ui || {});
  const esc = UI.esc || ((s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  const fa = UI.fa || ((s) => String(s == null ? "" : s).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[+d]));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const reduced = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const emit = (el, name, detail) => el.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));
  const roundTo = (v, step) => { const k = Math.round(v / step) * step; const d = String(step).includes(".") ? String(step).split(".")[1].length : 0; return +k.toFixed(d); };
  /* رقم‌ها مثلِ خودِ صفحه: پنل‌هایی که shared.js دارند (TP.M) رقمِ لاتین، پنل تأمین‌کننده رقمِ فارسی */
  const nf = (s) => (TP.M ? String(s) : fa(s));
  const num = (v, step) => nf(String(step && step < 1 ? (+v).toFixed(String(step).split(".")[1].length) : Math.round(+v)));

  /* ---------- جلوه‌های سراسری: درخشش و روح ---------- */
  const FX_KEY = "tp.fx";
  const fx = (() => {
    let cur = { glow: true, ghost: true };
    try { const s = JSON.parse(localStorage.getItem(FX_KEY) || "null"); if (s && typeof s === "object") cur = { glow: s.glow !== false, ghost: s.ghost !== false }; } catch (_) { /* حالت خصوصی */ }
    const apply = () => { const r = document.documentElement; r.classList.toggle("fx-glow", !!cur.glow); r.classList.toggle("fx-ghost", !!cur.ghost); };
    apply();
    const base = (window.TAMIN_POSHTIBANI_CONFIG && window.TAMIN_POSHTIBANI_CONFIG.apiBase) || "/tamin-poshtibani/api";
    fetch(base + "/site").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d || !d.fx) return;
      cur = { glow: d.fx.glow !== false, ghost: d.fx.ghost !== false };
      try { localStorage.setItem(FX_KEY, JSON.stringify(cur)); } catch (_) { /* حالت خصوصی */ }
      apply();
    }).catch(() => { /* آفلاین — همان مقدارِ آخر */ });
    return { get: () => ({ ...cur }) };
  })();

  /* درخشش: نور دنبالِ موشواره روی دکمه‌های ناوبری (فقط متغیرِ CSS؛ دکمه جابه‌جا نمی‌شود) */
  const NAV = ".tp-seg > button, .tp-seg > .tp-menu > button, .tp-seg .tp-menu-list > button, .tp-tab, .tp-nav-btn, .tp-nav > a, .tp-nav > button";
  document.addEventListener("pointermove", (e) => {
    if (!document.documentElement.classList.contains("fx-glow")) return;
    const b = e.target && e.target.closest && e.target.closest(NAV); if (!b) return;
    const r = b.getBoundingClientRect();
    b.style.setProperty("--mx", `${e.clientX - r.left}px`); b.style.setProperty("--my", `${e.clientY - r.top}px`);
  }, { passive: true });

  /* روح: هالهٔ نورِ شیشه‌ای از دکمهٔ فعال تا دکمهٔ کلیک‌شده. پیش از رسمِ دوباره (فاز capture) جای هر دو خوانده می‌شود */
  const GROUP = ".tp-seg, .tp-tabs, [data-ghost-group]";
  const ACTIVE = ":scope > button.on, :scope > .tp-menu.on > button, :scope > .tp-tab.on, :scope > [aria-selected='true'], :scope > button[aria-pressed='true']";
  const activeIn = (g) => { try { return g.querySelector(ACTIVE); } catch (_) { return g.querySelector("button.on, .tp-tab.on"); } };
  document.addEventListener("click", (e) => {
    const root = document.documentElement;
    if (!root.classList.contains("fx-ghost") || reduced()) return;
    const t = e.target && e.target.closest && e.target.closest("button, a"); if (!t || t.disabled) return;
    if (t.hasAttribute("data-menu-toggle")) return;             /* بازکردنِ منو ناوبری نیست */
    const g = t.closest(GROUP); if (!g) return;
    /* گزینهٔ منوی درونِ کپسول ← خودِ دکمهٔ آن منو مقصد است */
    const target = t.closest(".tp-menu-list") ? (t.closest(".tp-menu").querySelector("[data-menu-toggle]") || t) : t;
    const src = activeIn(g);
    if (!src || src === target || src.contains(target)) return;
    const a = src.getBoundingClientRect(), b0 = target.getBoundingClientRect();
    if (!a.width || !b0.width) return;
    /* دکمه‌ها پس از رسمِ دوباره کمی جابه‌جا می‌شوند (برچسبِ منو عوض می‌شود)؛ مقصدِ نهایی را یک فریم بعد می‌خوانیم */
    requestAnimationFrame(() => requestAnimationFrame(() => {
      let b = b0;
      const cx = b0.left + b0.width / 2, cy = b0.top + b0.height / 2;
      let best = null, bd = 1e9;
      document.querySelectorAll(GROUP).forEach((gg) => { const x = activeIn(gg); if (!x) return; const r = x.getBoundingClientRect(); const d = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy); if (d < bd) { bd = d; best = r; } });
      if (best && bd < Math.max(60, b0.width)) b = best;
      ghost(a, b);
    }));
  }, true);
  function ghost(a, b) {
    const mk = (cls) => { const el = document.createElement("div"); el.className = `tp-ghost ${cls}`; el.setAttribute("aria-hidden", "true"); document.body.appendChild(el); return el; };
    const frame = (r) => ({ left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    const mid = { left: `${(a.left + b.left) / 2}px`, top: `${(a.top + b.top) / 2 - 2}px`, width: `${(a.width + b.width) / 2 * 1.18}px`, height: `${(a.height + b.height) / 2 * 0.86}px` };
    [["core", 0, 0.95], ["trail", 55, 0.5]].forEach(([cls, delay, op]) => {
      const el = mk(cls);
      const anim = el.animate([{ ...frame(a), opacity: 0 }, { ...frame(a), opacity: op, offset: 0.08 }, { ...mid, opacity: op, offset: 0.5 }, { ...frame(b), opacity: op * 0.9, offset: 0.82 }, { ...frame(b), opacity: 0 }],
        { duration: 340, delay, easing: "cubic-bezier(.2,.8,.2,1)", fill: "both" });
      anim.onfinish = () => el.remove(); anim.oncancel = () => el.remove();
    });
  }

  /* ---------- پاسخِ تأیید: دایره و تیکِ سبز وسط صفحه ---------- */
  function success(label, o) {
    const el = document.createElement("div");
    el.className = `tp-success ${o && o.tone === "bad" ? "bad" : ""}`;
    el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite");
    const mark = o && o.tone === "bad" ? '<path class="k" d="M18 18l16 16M34 18L18 34"/>' : '<path class="k" d="M15.5 27l7.2 7.2L37 19.5"/>';
    el.innerHTML = `<div class="tp-success-disc"><svg viewBox="0 0 52 52" aria-hidden="true"><circle class="c" cx="26" cy="26" r="23"/>${mark}</svg><i class="burst"></i></div>${label ? `<b>${esc(label)}</b>` : ""}`;
    document.body.appendChild(el);
    const life = reduced() ? 900 : 1250;
    setTimeout(() => el.classList.add("out"), life);
    setTimeout(() => el.remove(), life + 380);
  }

  /* ---------- کادرِ بازشونده با حرکت (فقط هنگامِ باز و بسته شدن) ---------- */
  function reveal(el, open, done) {
    if (!el) { if (done) done(); return; }
    if (reduced()) { if (done) done(); return; }
    el.classList.remove("tp-reveal-in", "tp-reveal-out"); void el.offsetWidth;
    el.classList.add(open ? "tp-reveal-in" : "tp-reveal-out");
    let fin = false;
    const end = () => { if (fin) return; fin = true; el.classList.remove("tp-reveal-in", "tp-reveal-out"); if (done) done(); };
    el.addEventListener("animationend", (e) => { if (e.target === el) end(); }, { once: true });
    setTimeout(end, 700);
  }

  /* ---------- کلید ---------- */
  /** o: { attrs, on, label, sub, disabled, title } */
  const switchEl = (o) => `<button type="button" class="tp-switch ${o.on ? "on" : ""}" role="switch" aria-checked="${o.on ? "true" : "false"}" ${o.disabled ? "disabled" : ""} ${o.attrs || ""} title="${esc(o.title || o.label || "")}">
    <span class="tr"><i></i></span>${o.label ? `<span class="lb"><b>${esc(o.label)}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ""}</span>` : ""}</button>`;
  document.addEventListener("click", (e) => {
    const s = e.target && e.target.closest && e.target.closest(".tp-switch"); if (!s || s.disabled) return;
    const on = !s.classList.contains("on");
    s.classList.toggle("on", on); s.setAttribute("aria-checked", on ? "true" : "false");
    emit(s, "tp-change", { value: on });
  });

  /* ---------- دایرهٔ چرخان ---------- */
  /** o: { attrs, value, min, max, step, unit, label, size } — با کشیدن دورِ دایره، کلیدهای جهت، یا − و + */
  const KA = 270, K0 = 225;                                    /* کمانِ ۲۷۰ درجه (ساعتگرد از بالا) از پایینِ چپ تا پایینِ راست */
  const arcPath = (r, from, to) => {
    const p = (deg) => { const a = (deg - 90) * Math.PI / 180; return [50 + r * Math.cos(a), 50 + r * Math.sin(a)]; };
    const [x1, y1] = p(from), [x2, y2] = p(to);
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  };
  function knobPaint(k, v) {
    const min = +k.dataset.min, max = +k.dataset.max, step = +k.dataset.step || 1;
    const f = max > min ? (v - min) / (max - min) : 0;
    const to = K0 + 0.0001 + KA * clamp(f, 0, 1);
    const val = k.querySelector(".v"); if (val) val.textContent = num(v, step);
    const arc = k.querySelector(".fill"); if (arc) arc.setAttribute("d", arcPath(40, K0, to));
    const dot = k.querySelector(".dot");
    if (dot) { const a = (to - 90) * Math.PI / 180; dot.setAttribute("cx", (50 + 40 * Math.cos(a)).toFixed(2)); dot.setAttribute("cy", (50 + 40 * Math.sin(a)).toFixed(2)); }
    k.dataset.value = v; const d = k.querySelector(".dial"); if (d) d.setAttribute("aria-valuenow", v);
  }
  function knob(o) {
    const min = o.min ?? 0, max = o.max ?? 100, step = o.step || 1, v = clamp(+o.value || 0, min, max);
    const html = `<div class="tp-knob" ${o.attrs || ""} data-min="${min}" data-max="${max}" data-step="${step}" data-value="${v}">
      <div class="dial" role="slider" tabindex="0" aria-label="${esc(o.label || "")}" aria-valuemin="${min}" aria-valuemax="${max}" aria-valuenow="${v}">
        <svg viewBox="0 0 100 100" aria-hidden="true"><path class="bg" d="${arcPath(40, K0, K0 + KA)}"/><path class="fill" d=""/><circle class="dot" r="6" cx="50" cy="50"/></svg>
        <span class="mid"><b class="v">${num(v, step)}</b>${o.unit ? `<small>${esc(o.unit)}</small>` : ""}</span></div>
      <div class="kb"><button type="button" class="kbtn" data-kstep="-1" aria-label="کمتر">−</button><span class="kl">${esc(o.label || "")}</span><button type="button" class="kbtn" data-kstep="1" aria-label="بیشتر">+</button></div></div>`;
    return html;
  }
  /* رسمِ اولیهٔ کمان پس از درج در صفحه (مسیر به اندازهٔ واقعی نیاز ندارد ولی مقدار را یک‌جا می‌نشانیم) */
  function paintAll(root) { (root || document).querySelectorAll(".tp-knob").forEach((k) => knobPaint(k, +k.dataset.value)); (root || document).querySelectorAll(".tp-range").forEach(rangePaint); }
  const setKnob = (k, v, final) => {
    const min = +k.dataset.min, max = +k.dataset.max, step = +k.dataset.step || 1;
    const nv = clamp(roundTo(v, step), min, max);
    if (nv !== +k.dataset.value) { knobPaint(k, nv); emit(k, "tp-input", { value: nv }); }
    if (final) emit(k, "tp-change", { value: +k.dataset.value });
  };
  let drag = null;
  document.addEventListener("pointerdown", (e) => {
    const d = e.target && e.target.closest && e.target.closest(".tp-knob .dial"); if (!d) return;
    const k = d.closest(".tp-knob"); e.preventDefault(); d.focus();
    drag = { k, d, id: e.pointerId }; d.setPointerCapture && d.setPointerCapture(e.pointerId); k.classList.add("drag");
    knobMove(e);
  });
  function knobMove(e) {
    if (!drag) return;
    const r = drag.d.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let deg = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI + 90; if (deg < 0) deg += 360;
    /* کمان از ۲۲۵° تا ۴۹۵° (ساعتگرد از بالا)؛ در شکافِ پایین به سرِ نزدیک‌تر می‌چسبد */
    let rel = deg - K0; if (rel < 0) rel += 360;
    if (rel > KA) rel = rel > KA + (360 - KA) / 2 ? 0 : KA;
    const k = drag.k, min = +k.dataset.min, max = +k.dataset.max;
    setKnob(k, min + (max - min) * rel / KA, false);
  }
  document.addEventListener("pointermove", (e) => { if (drag && e.pointerId === drag.id) knobMove(e); });
  const endDrag = (e) => { if (!drag || (e && e.pointerId !== drag.id)) return; const k = drag.k; k.classList.remove("drag"); drag = null; emit(k, "tp-change", { value: +k.dataset.value }); };
  document.addEventListener("pointerup", endDrag); document.addEventListener("pointercancel", endDrag);
  document.addEventListener("keydown", (e) => {
    const d = e.target && e.target.closest && e.target.closest(".tp-knob .dial"); if (!d) return;
    const k = d.closest(".tp-knob"), step = +k.dataset.step || 1, v = +k.dataset.value;
    const map = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step, PageUp: step * 5, PageDown: -step * 5 };
    if (e.key in map) { e.preventDefault(); setKnob(k, v + map[e.key], true); }
    else if (e.key === "Home") { e.preventDefault(); setKnob(k, +k.dataset.min, true); }
    else if (e.key === "End") { e.preventDefault(); setKnob(k, +k.dataset.max, true); }
  });
  /* − و +: با نگه داشتن تکرار می‌شود */
  let rep = null;
  document.addEventListener("pointerdown", (e) => {
    const b = e.target && e.target.closest && e.target.closest(".tp-knob [data-kstep], .tp-step [data-sstep]"); if (!b) return;
    e.preventDefault();
    const box = b.closest(".tp-knob, .tp-step"), dir = +(b.dataset.kstep || b.dataset.sstep);
    const one = () => (box.classList.contains("tp-knob") ? setKnob(box, +box.dataset.value + dir * (+box.dataset.step || 1), false) : stepBy(box, dir, false));
    one(); let n = 0;
    rep = setInterval(() => { if (++n > 3) one(); }, 110);
    const stop = () => { clearInterval(rep); rep = null; emit(box, "tp-change", { value: +box.dataset.value }); document.removeEventListener("pointerup", stop); document.removeEventListener("pointercancel", stop); };
    document.addEventListener("pointerup", stop); document.addEventListener("pointercancel", stop);
  });

  /* ---------- شمارنده (− عدد +) ---------- */
  /** o: { attrs, value, min, max, step, label, unit } */
  const stepper = (o) => { const step = o.step || 1; return `<div class="tp-step" ${o.attrs || ""} data-min="${o.min ?? 0}" data-max="${o.max ?? 999}" data-step="${step}" data-value="${o.value}" role="group" aria-label="${esc(o.label || "")}">
    <button type="button" data-sstep="-1" aria-label="کمتر">−</button><b class="v">${num(o.value, step)}</b>${o.unit ? `<small>${esc(o.unit)}</small>` : ""}<button type="button" data-sstep="1" aria-label="بیشتر">+</button></div>`; };
  function stepBy(box, dir, final) {
    const min = +box.dataset.min, max = +box.dataset.max, step = +box.dataset.step || 1;
    const nv = clamp(roundTo(+box.dataset.value + dir * step, step), min, max);
    if (nv !== +box.dataset.value) { box.dataset.value = nv; box.querySelector(".v").textContent = num(nv, step); box.classList.remove("bump"); void box.offsetWidth; box.classList.add("bump"); emit(box, "tp-input", { value: nv }); }
    if (final) emit(box, "tp-change", { value: nv });
  }

  /* ---------- لغزنده (input range با پرکنندهٔ شیشه‌ای) ---------- */
  /** o: { attrs, value, min, max, step, label, unit } — رویدادهای input/change خودِ مرورگر */
  const range = (o) => `<label class="tp-range" style="--p:${(((+o.value) - (o.min ?? 0)) / (((o.max ?? 100) - (o.min ?? 0)) || 1)) * 100}%">
    <span class="rh"><b>${esc(o.label || "")}</b><output>${num(o.value, o.step)}${o.unit ? `<small>${esc(o.unit)}</small>` : ""}</output></span>
    <input type="range" min="${o.min ?? 0}" max="${o.max ?? 100}" step="${o.step || 1}" value="${o.value}" ${o.attrs || ""} aria-label="${esc(o.label || "")}"></label>`;
  function rangePaint(lab) {
    const i = lab.querySelector("input"); if (!i) return;
    lab.style.setProperty("--p", `${((+i.value - +i.min) / ((+i.max - +i.min) || 1)) * 100}%`);
    const out = lab.querySelector("output"); if (out && out.firstChild) out.firstChild.nodeValue = num(i.value, +i.step);
  }
  document.addEventListener("input", (e) => { const l = e.target && e.target.closest && e.target.closest(".tp-range"); if (l) rangePaint(l); });

  /* ---------- امتیازِ نقطه‌ای ۱ تا ۵ ---------- */
  /** o: { attrs, value, max, label } — کلیک روی نقطهٔ n مقدار n؛ رویداد tp-change */
  const rating = (o) => { const max = o.max || 5, v = +o.value || 0; return `<span class="tp-rate" role="radiogroup" aria-label="${esc(o.label || "امتیاز")}" data-value="${v}" ${o.attrs || ""}>${Array.from({ length: max }, (_, i) => `<button type="button" role="radio" aria-checked="${i + 1 === v ? "true" : "false"}" aria-label="${fa(i + 1)}" data-rv="${i + 1}" class="${i < v ? "on" : ""}"><i></i></button>`).join("")}</span>`; };
  document.addEventListener("click", (e) => {
    const b = e.target && e.target.closest && e.target.closest(".tp-rate [data-rv]"); if (!b) return;
    const box = b.closest(".tp-rate"), v = +b.dataset.rv;
    box.dataset.value = v;
    box.querySelectorAll("[data-rv]").forEach((x) => { const n = +x.dataset.rv; x.classList.toggle("on", n <= v); x.setAttribute("aria-checked", n === v ? "true" : "false"); x.classList.toggle("pop", n === v); });
    emit(box, "tp-change", { value: v });
  });
  document.addEventListener("keydown", (e) => {
    const b = e.target && e.target.closest && e.target.closest(".tp-rate [data-rv]"); if (!b) return;
    const d = { ArrowLeft: 1, ArrowRight: -1, ArrowUp: 1, ArrowDown: -1 }[e.key]; if (!d) return;
    e.preventDefault(); const box = b.closest(".tp-rate"), n = clamp((+box.dataset.value || 0) + d, 1, box.querySelectorAll("[data-rv]").length);
    const t = box.querySelector(`[data-rv="${n}"]`); if (t) { t.click(); t.focus(); }
  });

  /* ---------- نوارِ آستانه‌ها: دستگیره‌های کشیدنی روی مهلت (۰ تا ۱۰۰٪) ----------
     o: { attrs, points: [{ label, value (null = خاموش), color }] } — هر دستگیره بینِ همسایه‌های روشنش می‌ماند (صعودی، ۱ تا ۱۰۰).
     رویدادها: tp-input / tp-change با { index, value }. در راست‌به‌چپ ۰٪ سمتِ راست است. */
  function track(o) {
    const P = o.points;
    return `<div class="tp-track" ${o.attrs || ""}><div class="rail"><i class="fillr"></i>
      ${[25, 50, 75].map((t) => `<span class="tick" style="--x:${t}%"><em>${nf(t)}٪</em></span>`).join("")}
      ${P.map((p, i) => p.value == null ? "" : `<button type="button" class="h ${i % 2 ? "lo" : ""}" role="slider" data-ti="${i}" style="--x:${p.value}%;--c:${p.color}" aria-label="${esc(p.label)}" aria-valuemin="1" aria-valuemax="100" aria-valuenow="${p.value}" title="${esc(p.label)}"><span class="hv">${nf(p.value)}٪</span><span class="hl">${esc(p.label)}</span></button>`).join("")}</div>
      <div class="ends"><span>آغاز مهلت</span><span>پایان مهلت</span></div></div>`;
  }
  const trackVals = (t) => [...t.querySelectorAll(".h")].map((h) => ({ i: +h.dataset.ti, v: +h.getAttribute("aria-valuenow") }));
  function trackSet(t, h, v, final) {
    const i = +h.dataset.ti, vals = trackVals(t).sort((a, b) => a.i - b.i);
    const prev = vals.filter((x) => x.i < i).pop(), next = vals.find((x) => x.i > i);
    const nv = clamp(Math.round(v), prev ? prev.v + 1 : 1, next ? next.v - 1 : 100);
    if (nv !== +h.getAttribute("aria-valuenow")) {
      h.style.setProperty("--x", `${nv}%`); h.setAttribute("aria-valuenow", nv); h.querySelector(".hv").textContent = `${nf(nv)}٪`;
      emit(t, "tp-input", { index: i, value: nv });
    }
    if (final) emit(t, "tp-change", { index: i, value: +h.getAttribute("aria-valuenow") });
  }
  let tdrag = null;
  document.addEventListener("pointerdown", (e) => {
    const h = e.target && e.target.closest && e.target.closest(".tp-track .h"); if (!h) return;
    e.preventDefault(); h.focus();
    tdrag = { t: h.closest(".tp-track"), h, id: e.pointerId }; h.setPointerCapture && h.setPointerCapture(e.pointerId); h.classList.add("drag");
  });
  document.addEventListener("pointermove", (e) => {
    if (!tdrag || e.pointerId !== tdrag.id) return;
    const r = tdrag.t.querySelector(".rail").getBoundingClientRect();
    const rtl = getComputedStyle(tdrag.t).direction === "rtl";
    const f = rtl ? (r.right - e.clientX) / r.width : (e.clientX - r.left) / r.width;
    trackSet(tdrag.t, tdrag.h, f * 100, false);
  });
  const tEnd = (e) => { if (!tdrag || (e && e.pointerId !== tdrag.id)) return; const { t, h } = tdrag; h.classList.remove("drag"); tdrag = null; trackSet(t, h, +h.getAttribute("aria-valuenow"), true); };
  document.addEventListener("pointerup", tEnd); document.addEventListener("pointercancel", tEnd);
  document.addEventListener("keydown", (e) => {
    const h = e.target && e.target.closest && e.target.closest(".tp-track .h"); if (!h) return;
    const rtl = getComputedStyle(h).direction === "rtl";
    const d = { ArrowUp: 1, ArrowDown: -1, ArrowLeft: rtl ? 1 : -1, ArrowRight: rtl ? -1 : 1, PageUp: 10, PageDown: -10 }[e.key]; if (!d) return;
    e.preventDefault(); trackSet(h.closest(".tp-track"), h, +h.getAttribute("aria-valuenow") + d, true);
  });

  /* ---------- کارت‌برگ (KPI) ---------- */
  /** o: { label, value, sub, icon, tone (ok|warn|bad|info), attrs } */
  const stat = (o) => `<div class="tp-stat ${o.tone || ""}" ${o.attrs || ""}>${o.icon ? `<span class="si">${(UI.ICON && UI.ICON[o.icon]) || o.icon}</span>` : ""}<span class="sb"><small>${esc(o.label)}</small><b>${o.value}</b>${o.sub ? `<em>${o.sub}</em>` : ""}</span></div>`;

  Object.assign(UI, { fx, success, reveal, switchEl, knob, stepper, range, rating, track, stat, paintAll });
})();
