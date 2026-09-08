/* ============================================================
   سامانهٔ پشتیبانی خرید — کتابخانهٔ مشترک پنل مدیر و پنل کارشناس
   تقویم شمسی، ساعات کاری، وضعیت‌ها، رنگ مراحل، مودال، تقویم کوچک، API

   منطق تقویم و ساعات کاری عیناً از نسخهٔ مرجع (Render) پورت شده و
   با اعداد آن یکی است؛ اینجا منطق تازه‌ای ساخته نشده.
   ============================================================ */
(function () {
  "use strict";

  const CFG = window.TAMIN_POSHTIBANI_CONFIG || {};
  const TP = (window.TP = window.TP || {});

  /* ---------- ثابت‌ها ---------- */
  TP.HOUR = 3600000;
  TP.DAY = 86400000;

  /* شش مرحلهٔ پایش کارشناس — ترتیب همان ترتیب ستون‌های میز ارجاع */
  TP.STAGES = ["مشاهده", "بررسی سوابق", "جستجوی هوشمند", "استعلامات", "پیش فاکتور", "جدول کمیسیون"];

  /* چرخهٔ عمر قلم در سامانه */
  TP.STATES = {
    open:   { label: "باز",        cls: "st-run" },
    hold:   { label: "معلق",       cls: "st-hold" },
    stop:   { label: "متوقف شده",  cls: "st-stop" },
    closed: { label: "بسته شده",   cls: "st-cls" },
  };

  /* وضعیت خام راهکاران → چرخهٔ عمر سامانه.
     هر چیز ناشناخته «باز» فرض می‌شود و در آمار بارگذاری گزارش می‌شود
     تا بی‌صدا از دست نرود. */
  TP.SRC2STATE = {
    "ثبت شده": "open", "تایید شده": "open", "در جریان": "open", "بررسی مجدد": "open",
    "معلق": "hold", "متوقف شده": "stop", "بسته شده": "closed",
  };
  /* رنگ چیپ وضعیت خام برای نمایش در جدول */
  TP.SRC_CLS = {
    "ثبت شده": "st-reg", "تایید شده": "st-apr", "در جریان": "st-run", "بررسی مجدد": "st-hold",
    "معلق": "st-hold", "متوقف شده": "st-stop", "بسته شده": "st-cls",
  };

  /* ---------- متن ---------- */
  TP.esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  TP.M = (n) => Number(n || 0).toLocaleString("en-US");
  /* نرمال‌سازی برای مقایسه: ي/ك عربی → فارسی، نیم‌فاصله → فاصله، فاصله‌های تکراری → یکی */
  TP.nrm = (x) => String(x == null ? "" : x).replace(/[ي]/g, "ی").replace(/[ك]/g, "ک").replace(/‌/g, " ").replace(/\s+/g, " ").toLowerCase().trim();
  TP.hit = (v, q) => !q || TP.nrm(v).includes(TP.nrm(q));
  /* مقدار راهکاران: «2,000» یا «12.5» → عدد */
  TP.num = (v) => { const s = String(v == null ? "" : v).replace(/,/g, "").trim(); if (!s) return null; const n = Number(s); return isNaN(n) ? null : n; };

  /* ---------- تقویم شمسی ↔ میلادی ----------
     تقسیم با کوتاه‌سازی به سمت صفر (نه Math.floor) — با floor نتیجه برای ماه‌های ۹ تا ۱۲ اشتباه می‌شود. */
  const dv = (a, b) => Math.trunc(a / b), md = (a, b) => a - dv(a, b) * b;
  function jalCal(jy) {
    const br = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2137];
    let gy = jy + 621, leapJ = -14, jp = br[0], jm = 0, jump = 0;
    for (let i = 1; i < br.length; i++) { jm = br[i]; jump = jm - jp; if (jy < jm) break; leapJ += dv(jump, 33) * 8 + dv(md(jump, 33), 4); jp = jm; }
    let n = jy - jp;
    leapJ += dv(n, 33) * 8 + dv(md(n, 33) + 3, 4);
    if (md(jump, 33) === 4 && jump - n === 4) leapJ++;
    const leapG = dv(gy, 4) - dv((dv(gy, 100) + 1) * 3, 4) - 150;
    const march = 20 + leapJ - leapG;
    if (jump - n < 6) n = n - jump + dv(jump + 4, 33) * 33;
    let leap = md(md(n + 1, 33) - 1, 4); if (leap === -1) leap = 4;
    return { leap, gy, march };
  }
  function g2d(gy, gm, gd) {
    const d = dv((gy + dv(gm - 8, 6) + 100100) * 1461, 4) + dv(153 * md(gm + 9, 12) + 2, 5) + gd - 34840408;
    return d - dv(dv(gy + 100100 + dv(gm - 8, 6), 100) * 3, 4) + 752;
  }
  function d2g(jdn) {
    let j = 4 * jdn + 139361631;
    j = j + dv(dv(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    const i = dv(md(j, 1461), 4) * 5 + 308;
    const gd = dv(md(i, 153), 5) + 1, gm = md(dv(i, 153), 12) + 1, gy = dv(j, 1461) - 100100 + dv(8 - gm, 6);
    return [gy, gm, gd];
  }
  function j2d(jy, jm, jd) { const r = jalCal(jy); return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - dv(jm, 7) * (jm - 7) + jd - 1; }
  function j2g(jy, jm, jd) { return d2g(j2d(jy, jm, jd)); }
  function g2j(gy_, gm_, gd_) {
    const jdn = g2d(gy_, gm_, gd_), gy = d2g(jdn)[0]; let jy = gy - 621;
    const r = jalCal(jy), jdn1f = g2d(gy, 3, r.march); let k = jdn - jdn1f;
    if (k >= 0) { if (k <= 185) return [jy, 1 + dv(k, 31), md(k, 31) + 1]; k -= 186; }
    else { jy -= 1; k += 179; if (r.leap === 1) k += 1; }
    return [jy, 7 + dv(k, 30), md(k, 30) + 1];
  }
  function jLen(jy, jm) { if (jm <= 6) return 31; if (jm <= 11) return 30; return jalCal(jy).leap === 0 ? 30 : 29; }

  TP.JM = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
  TP.WD = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];
  TP.WS = ["ش", "ی", "د", "س", "چ", "پ", "ج"];
  const p2 = (n) => String(n).padStart(2, "0");
  TP.p2 = p2; TP.j2g = j2g; TP.g2j = g2j; TP.jLen = jLen;

  /* «یکشنبه 1405/06/17 — 09:30» */
  TP.fmt = (ms) => { const d = new Date(ms), [y, m, dd] = g2j(d.getFullYear(), d.getMonth() + 1, d.getDate()); return `${TP.WD[d.getDay()]} ${y}/${p2(m)}/${p2(dd)} — ${p2(d.getHours())}:${p2(d.getMinutes())}`; };
  /* «1405/06/17» */
  TP.fmtD = (ms) => { const d = new Date(ms), [y, m, dd] = g2j(d.getFullYear(), d.getMonth() + 1, d.getDate()); return `${y}/${p2(m)}/${p2(dd)}`; };
  /* «1405/6/17» یا «1405/06/17» → میلی‌ثانیهٔ نیمه‌شب محلی؛ نامعتبر → null */
  TP.jStr2ms = (s) => { const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(String(s || "").trim()); if (!m) return null; const [gy, gm, gd] = j2g(+m[1], +m[2], +m[3]); return new Date(gy, gm - 1, gd).getTime(); };
  /* یکسان‌سازی «1405/6/7» → «1405/06/07» تا مقایسهٔ متنی تاریخ‌ها درست باشد */
  TP.jNorm = (s) => { const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(String(s || "").trim()); return m ? `${m[1]}/${p2(+m[2])}/${p2(+m[3])}` : String(s || "").trim(); };
  TP.todayJ = (ms) => { const d = new Date(ms == null ? Date.now() : ms); return g2j(d.getFullYear(), d.getMonth() + 1, d.getDate()); };

  /* ---------- ساعات کاری: شنبه–چهارشنبه ۸–۱۷ · پنجشنبه ۸–۱۳ · جمعه تعطیل ---------- */
  function win(d) { const g = d.getDay(); if (g === 5) return null; if (g === 4) return [8, 13]; return [8, 17]; }
  /* ساعات کاری بین دو لحظه */
  TP.wh = function (a, b) {
    if (b <= a) return 0; let t = 0; const c = new Date(a); c.setHours(0, 0, 0, 0);
    while (c.getTime() < b) {
      const w = win(c);
      if (w) { const s = new Date(c); s.setHours(w[0], 0, 0, 0); const e = new Date(c); e.setHours(w[1], 0, 0, 0);
        const f = Math.max(s.getTime(), a), o = Math.min(e.getTime(), b); if (o > f) t += (o - f) / TP.HOUR; }
      c.setDate(c.getDate() + 1);
    }
    return t;
  };
  /* پایان n‌امین روز کاری پس از st */
  TP.endN = function (st, n) {
    const c = new Date(st); let k = 0;
    for (;;) {
      const w = win(c);
      if (w) { const e = new Date(c); e.setHours(w[1], 0, 0, 0); if (e.getTime() > st) { k++; if (k >= n) return e.getTime(); } }
      c.setDate(c.getDate() + 1); c.setHours(0, 0, 0, 0);
    }
  };
  /* بودجهٔ مهلت به ساعت کاری */
  TP.budget = (dispatchedAt, days) => TP.wh(dispatchedAt, TP.endN(dispatchedAt, Number(days) || 1));

  /* ---------- رنگ باکس‌های پایش ----------
     a = { dispatchedAt, days, done:[۶ بولی], active:bool }   thr = آستانه‌های درصدی (خالی = هشدار خاموش)
     idle: ارسال‌نشده · done: انجام‌شده · muted: هشدار خاموش یا خارج از کارتابل
     empty: در مهلت · warn: از آستانه گذشت · late: از آستانهٔ بعدی هم گذشت · over: مهلت تمام شد */
  TP.stageColor = function (a, i, thr, nowMs) {
    if (!a.dispatchedAt) return "idle";
    if (!a.active) return a.done[i] ? "done" : "muted";
    if (a.done[i]) return "done";
    const act = thr.map((p, k) => ({ i: k, p })).filter((t) => t.p !== "" && t.p != null && !isNaN(t.p));
    const mine = act.find((t) => t.i === i); if (!mine) return "muted";
    const b = TP.budget(a.dispatchedAt, a.days); if (b <= 0) return "empty";
    const el = TP.wh(a.dispatchedAt, nowMs); if (el >= b) return "over";
    const t = Math.max(mine.p / 100 * b, 1), nx = act.find((t2) => t2.i > i);
    if (nx && el >= Math.max(nx.p / 100 * b, 1)) return "late";
    return el >= t ? "warn" : "empty";
  };
  /* رنگ باکس «ارسال» مدیر: مهلت ارسال از لحظهٔ بارگذاری */
  TP.dispatchColor = function (importedAt, dispatchDays, dispatchedAt, nowMs) {
    if (dispatchedAt) return "done";
    if (!dispatchDays) return "muted";
    return nowMs >= TP.endN(importedAt, dispatchDays) ? "warn" : "empty";
  };

  /* ---------- CSS مشترک (یک‌بار تزریق می‌شود) ---------- */
  const SHARED_CSS = `
  .tp-modal-bg{position:fixed;inset:0;background:rgba(3,8,20,.62);display:flex;align-items:center;justify-content:center;z-index:900;padding:20px;backdrop-filter:blur(4px)}
  .tp-modal{background:#0b1730;color:#eef4ff;border:1px solid rgba(158,197,255,.22);border-radius:16px;max-width:600px;width:100%;padding:22px 24px;max-height:86vh;overflow:auto;box-shadow:0 24px 70px rgba(0,0,0,.55)}
  .tp-modal h3{margin:0 0 10px;font-size:1.1rem}.tp-modal .tp-body{color:#b7c6e6;line-height:1.9}
  .tp-modal .tp-acts{display:flex;gap:8px;margin-top:18px;flex-wrap:wrap}
  .tp-btn{border:1px solid rgba(158,197,255,.3);background:rgba(120,165,255,.08);color:#eef4ff;border-radius:10px;padding:8px 16px;cursor:pointer;font:inherit}
  .tp-btn:hover{background:rgba(120,165,255,.16)}
  .tp-btn.primary{background:linear-gradient(135deg,#2f6fe4,#4f8cff);border-color:#4f8cff;font-weight:700}
  .tp-btn.primary:hover{filter:brightness(1.1)}
  .tp-btn[disabled]{opacity:.45;cursor:not-allowed}
  .jdp{position:fixed;z-index:950;background:#0b1730;color:#eef4ff;border:1px solid rgba(158,197,255,.3);border-radius:12px;box-shadow:0 12px 34px rgba(0,0,0,.5);padding:10px;width:240px;font-size:.9rem}
  .jdp-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
  .jdp-head button{border:1px solid rgba(158,197,255,.3);background:none;color:inherit;border-radius:6px;padding:2px 9px;cursor:pointer}
  .jdp-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center}
  .jdp-grid .wd{color:#9fb2d8;font-size:.72rem;padding:2px 0}
  .jdp-grid button{border:1px solid transparent;background:none;color:inherit;border-radius:6px;padding:5px 0;cursor:pointer;font-variant-numeric:tabular-nums;font:inherit}
  .jdp-grid button:hover{background:rgba(120,165,255,.16)}
  .jdp-grid button.today{border-color:#4f8cff}
  .jdp-grid button.sel{background:#4f8cff;color:#fff;font-weight:700}
  .jdp-sel{margin-top:8px;font-size:.78rem;color:#9fb2d8;text-align:center}
  .jdp-foot{display:flex;justify-content:space-between;margin-top:8px;gap:6px}
  .jdp-foot button{flex:1;border:1px solid rgba(158,197,255,.3);background:none;color:inherit;border-radius:6px;padding:4px;font-size:.78rem;cursor:pointer}`;
  let cssDone = false;
  function ensureCss() { if (cssDone) return; cssDone = true; const s = document.createElement("style"); s.textContent = SHARED_CSS; document.head.appendChild(s); }

  /* ---------- مودال تأیید ---------- */
  /* modal(title, bodyHtml, onYes, yesLabel="تایید", noLabel="انصراف"); noLabel="" → فقط یک دکمه */
  TP.modal = function (title, body, onYes, yes = "تایید", no = "انصراف") {
    ensureCss();
    const d = document.createElement("div"); d.className = "tp-modal-bg";
    d.innerHTML = `<div class="tp-modal" role="dialog" aria-modal="true"><h3>${title}</h3><div class="tp-body">${body}</div>
      <div class="tp-acts"><button class="tp-btn primary" data-y="1">${yes}</button>${no ? `<button class="tp-btn" data-n="1">${no}</button>` : ""}</div></div>`;
    document.body.appendChild(d);
    d.querySelector("[data-y]").onclick = () => { d.remove(); onYes && onYes(); };
    const n = d.querySelector("[data-n]"); if (n) n.onclick = () => d.remove();
    d.onclick = (e) => { if (e.target === d) d.remove(); };
    return d;
  };
  /* مودال «در حال کار…» بدون دکمه — برگشتی: تابع بستن */
  TP.busy = function (title, body) {
    ensureCss();
    const d = document.createElement("div"); d.className = "tp-modal-bg";
    d.innerHTML = `<div class="tp-modal"><h3>${title}</h3><div class="tp-body" data-body>${body || ""}</div></div>`;
    document.body.appendChild(d);
    return { set: (html) => { d.querySelector("[data-body]").innerHTML = html; }, close: () => d.remove() };
  };

  /* ---------- تقویم شمسی کوچک چندانتخابی ----------
     مقدار ورودی می‌تواند چند تاریخ جداشده با «،» باشد؛ کلیک دوباره = برداشتن انتخاب */
  TP.openDatePicker = function (inputEl, onPick, opts) {
    ensureCss();
    const multi = !(opts && opts.single);
    document.querySelectorAll(".jdp").forEach((x) => x.remove());
    let picked = String(inputEl.value || "").split("،").map((s) => s.trim()).filter(Boolean);
    const first = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(picked[0] || "");
    const todayJ = TP.todayJ();
    let jy = first ? +first[1] : todayJ[0], jm = first ? +first[2] : todayJ[1];
    const box = document.createElement("div"); box.className = "jdp";
    const commit = () => onPick(picked.join("، "));
    function close() { box.remove(); document.removeEventListener("mousedown", onDoc); }
    function onDoc(e) { if (!box.contains(e.target) && e.target !== inputEl) { commit(); close(); } }
    function paint() {
      const len = jLen(jy, jm);
      const [gy, gm, gd] = j2g(jy, jm, 1);
      const startDow = (new Date(gy, gm - 1, gd).getDay() + 1) % 7;   // هفته از شنبه
      let cells = "";
      for (let i = 0; i < startDow; i++) cells += "<span></span>";
      for (let d = 1; d <= len; d++) {
        const iso = `${jy}/${p2(jm)}/${p2(d)}`;
        const cur = jy === todayJ[0] && jm === todayJ[1] && d === todayJ[2];
        cells += `<button type="button" data-d="${d}" class="${cur ? "today" : ""}${picked.includes(iso) ? " sel" : ""}">${d}</button>`;
      }
      box.innerHTML = `<div class="jdp-head"><button type="button" data-nav="-1">‹</button><b>${TP.JM[jm - 1]} ${jy}</b><button type="button" data-nav="1">›</button></div>
        <div class="jdp-grid">${TP.WS.map((w) => `<span class="wd">${w}</span>`).join("")}${cells}</div>
        <div class="jdp-sel">${picked.length ? `${picked.length} تاریخ انتخاب شد` : multi ? "چند روز را می‌توانید انتخاب کنید" : "یک روز را انتخاب کنید"}</div>
        <div class="jdp-foot"><button type="button" data-clear="1">پاک کردن</button><button type="button" data-today="1">امروز</button><button type="button" data-done="1">تایید</button></div>`;
      box.querySelector('[data-nav="-1"]').onclick = () => { jm--; if (jm < 1) { jm = 12; jy--; } paint(); };
      box.querySelector('[data-nav="1"]').onclick = () => { jm++; if (jm > 12) { jm = 1; jy++; } paint(); };
      box.querySelectorAll("[data-d]").forEach((b) => b.onclick = () => {
        const iso = `${jy}/${p2(jm)}/${p2(+b.dataset.d)}`;
        if (!multi) { picked = [iso]; commit(); close(); return; }
        const i = picked.indexOf(iso); if (i >= 0) picked.splice(i, 1); else picked.push(iso); paint();
      });
      box.querySelector("[data-clear]").onclick = () => { picked = []; commit(); close(); };
      box.querySelector("[data-today]").onclick = () => { const iso = `${todayJ[0]}/${p2(todayJ[1])}/${p2(todayJ[2])}`; if (!multi) { picked = [iso]; commit(); close(); return; } if (!picked.includes(iso)) picked.push(iso); jy = todayJ[0]; jm = todayJ[1]; paint(); };
      box.querySelector("[data-done]").onclick = () => { commit(); close(); };
    }
    paint();
    document.body.appendChild(box);
    /* موقعیت‌دهی: زیر فیلد، اگر جا نبود بالای آن */
    const r = inputEl.getBoundingClientRect(), bw = box.offsetWidth || 240, bh = box.offsetHeight || 330;
    const vw = window.innerWidth || 1024, vh = window.innerHeight || 768;
    let top = r.bottom + 4; if (top + bh > vh) top = Math.max(4, r.top - bh - 4);
    let left = r.left; if (left + bw > vw) left = vw - bw - 4; if (left < 4) left = 4;
    box.style.top = top + "px"; box.style.left = left + "px";
    setTimeout(() => document.addEventListener("mousedown", onDoc), 0);
  };

  /* ---------- نشست کارشناس (کد ورود در sessionStorage همین تب) ---------- */
  TP.session = {
    get() { try { return JSON.parse(sessionStorage.getItem("tp.expert") || "null"); } catch (_) { return null; } },
    set(x) { try { sessionStorage.setItem("tp.expert", JSON.stringify(x)); } catch (_) { /* حالت خصوصی */ } },
    clear() { try { sessionStorage.removeItem("tp.expert"); } catch (_) { /* بی‌اهمیت */ } },
  };
  /* کد مدیر — فقط در همین تب */
  TP.manager = {
    get() { try { return sessionStorage.getItem("tp.manager") || ""; } catch (_) { return ""; } },
    set(c) { try { sessionStorage.setItem("tp.manager", c); } catch (_) { /* حالت خصوصی */ } },
    clear() { try { sessionStorage.removeItem("tp.manager"); } catch (_) { /* بی‌اهمیت */ } },
  };

  /* ---------- فراخوانی API ----------
     api("/requests?window=3d") · api("/dispatch", {method:"POST", body:{...}})
     کد کارشناس (اگر وارد شده) و نقش مدیر با هدر می‌رود. خطای سرور → Error با پیام سرور. */
  TP.api = async function (path, opt = {}) {
    const base = CFG.apiBase || "/tamin-poshtibani/api";
    const headers = { "Accept": "application/json", ...(opt.headers || {}) };
    if (opt.body !== undefined) headers["Content-Type"] = "application/json";
    const ex = TP.session.get(); if (ex && ex.code) headers["X-Expert-Code"] = ex.code;
    const mg = TP.manager.get(); if (mg) headers["X-Manager-Code"] = mg;
    const res = await fetch(base + path, { method: opt.method || (opt.body !== undefined ? "POST" : "GET"), headers, body: opt.body !== undefined ? JSON.stringify(opt.body) : undefined });
    let data = null; const txt = await res.text();
    try { data = txt ? JSON.parse(txt) : null; } catch (_) { data = { error: txt.slice(0, 300) }; }
    if (!res.ok) { const e = new Error((data && (data.error || data.detail)) || `خطای سرور ${res.status}`); e.status = res.status; e.data = data; throw e; }
    return data;
  };

  /* ---------- کوچک‌های UI ---------- */
  /* بازرندر با حفظ فوکوس و مکان‌نما روی همان فیلد */
  TP.keepFocus = function (el, attr, render) {
    const key = el.dataset[attr], pos = el.selectionStart;
    const wraps = [...document.querySelectorAll("[data-keep-scroll]")].map((w) => [w.scrollTop, w.scrollLeft]);
    render();
    const n = document.querySelector(`[data-${attr}="${CSS.escape(key)}"]`);
    document.querySelectorAll("[data-keep-scroll]").forEach((w, i) => { if (wraps[i]) { w.scrollTop = wraps[i][0]; w.scrollLeft = wraps[i][1]; } });
    if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (_) { /* غیرمتنی */ } }
  };
  /* سرآیند چسبان چندطبقه: top هر ردیف = مجموع ارتفاع ردیف‌های بالاتر */
  TP.stickHeader = function (table) {
    if (!table || !table.tHead) return; let top = 0;
    [...table.tHead.rows].forEach((tr) => { [...tr.cells].forEach((c) => c.style.top = top + "px"); top += tr.getBoundingClientRect().height; });
  };
})();
