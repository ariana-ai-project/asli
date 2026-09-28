/* ============================================================
   تب «پشتیبانی» صفحهٔ اول — وضعیت کارت‌ها و رمز مشترک

   وضعیت هر بخش (فعال / در حال توسعه / به‌زودی) روی سرور نگه داشته می‌شود
   (settings → siteCards)، پس برای همهٔ بازدیدکننده‌ها یکی است و با استقرار
   تازه هم پاک نمی‌شود. این فایل:
     ۱) هنگام بارگذاری صفحه وضعیت‌ها را می‌گیرد و روی کارت‌ها می‌نشاند؛
        کارتِ غیرفعال href ندارد، پس اصلاً باز نمی‌شود.
     ۲) با کلیک روی «پشتیبانی» در نوار بالا، پنل کوچکی باز می‌کند که با رمز
        باز می‌شود و از داخلش وضعیت هر کارت عوض می‌شود.
   رمز: همان رمز مشترک تب، یا کد مدیر (تا اولین رمز تعریف شود).
   ============================================================ */
(function () {
  "use strict";
  const API = "/tamin-poshtibani/api";
  const SKEY = "ariana.site";            /* رمز تب در همین تب مرورگر می‌ماند */
  const LABEL = { active: "فعال", soon: "در حال توسعه", off: "به زودی" };
  const ORDER = ["active", "soon", "off"];
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const cards = () => [...document.querySelectorAll(".cards-grid .card[data-dept]")];
  const code = {
    get: () => { try { return sessionStorage.getItem(SKEY) || ""; } catch (_) { return ""; } },
    set: (v) => { try { sessionStorage.setItem(SKEY, v); } catch (_) { /* حالت ناشناس */ } },
    clear: () => { try { sessionStorage.removeItem(SKEY); } catch (_) { /* حالت ناشناس */ } },
  };

  async function api(path, opts = {}) {
    const headers = {};
    if (opts.body) headers["Content-Type"] = "application/json";
    if (opts.auth) headers["X-Site-Code"] = code.get();
    const res = await fetch(API + path, { method: opts.method || (opts.body ? "POST" : "GET"), headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `خطای سرور (${res.status})`);
    return data;
  }

  /* ---------- نشاندن وضعیت روی کارت‌ها ---------- */
  function paint(map) {
    for (const el of cards()) {
      const state = map[el.dataset.dept];
      if (state) el.dataset.status = state;
      const on = el.dataset.status === "active";
      const href = el.dataset.href || "";
      if (on && href) { el.setAttribute("href", href); el.removeAttribute("aria-disabled"); }
      else { el.removeAttribute("href"); el.setAttribute("aria-disabled", "true"); }
      const badge = el.querySelector(".card-status");
      if (badge) badge.textContent = LABEL[el.dataset.status] || badge.textContent;
    }
  }

  /* ---------- پنل ---------- */
  let box = null, state = { cards: {}, hasPass: false };

  function css() {
    if (document.getElementById("sp-css")) return;
    const s = document.createElement("style");
    s.id = "sp-css";
    s.textContent = `
.sp-bg{position:fixed;inset:0;background:rgba(3,8,20,.72);backdrop-filter:blur(6px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px}
.sp-box{width:min(560px,100%);max-height:86vh;overflow:auto;background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,0) 30%),#0b1424;border:1px solid rgba(120,160,255,.28);border-radius:18px;padding:20px;color:#e8eefc;box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 24px 70px rgba(0,0,0,.55)}
.sp-box h3{margin:0 0 4px;font-size:1.15rem}
.sp-box p.sp-hint{margin:0 0 16px;color:#93a4c4;font-size:.85rem;line-height:1.9}
.sp-row{display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid rgba(120,160,255,.14)}
.sp-row:first-of-type{border-top:0}
.sp-name{flex:1;font-size:.95rem}
.sp-name small{display:block;color:#7c8aa8;font-size:.72rem}
.sp-opt{background:linear-gradient(180deg,rgba(255,255,255,.1),rgba(255,255,255,.015) 60%),rgba(120,160,255,.08);border:1px solid rgba(180,208,255,.22);color:#c8d6f5;border-radius:9px;padding:5px 10px;font:inherit;font-size:.78rem;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.16);transition:background-color .2s ease,scale .15s ease}
.sp-opt:hover{background-color:rgba(120,160,255,.18)}
.sp-opt:active,.sp-btn:active{scale:.97}
.sp-opt[aria-pressed="true"]{color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.34),0 4px 12px -5px rgba(0,0,0,.6)}
.sp-opt[data-state="active"][aria-pressed="true"]{background:linear-gradient(180deg,rgba(255,255,255,.18),rgba(255,255,255,0) 55%),rgba(21,128,61,.9);border-color:rgba(74,222,128,.6)}
.sp-opt[data-state="soon"][aria-pressed="true"]{background:linear-gradient(180deg,rgba(255,255,255,.18),rgba(255,255,255,0) 55%),rgba(161,98,7,.92);border-color:rgba(251,191,36,.6)}
.sp-opt[data-state="off"][aria-pressed="true"]{background:linear-gradient(180deg,rgba(255,255,255,.18),rgba(255,255,255,0) 55%),rgba(153,27,27,.9);border-color:rgba(248,113,113,.6)}
.sp-box input{background:rgba(255,255,255,.06);border:1px solid rgba(120,160,255,.28);color:#e8eefc;border-radius:10px;padding:9px 12px;font:inherit;width:140px;text-align:center;letter-spacing:.2em}
.sp-btn{background:linear-gradient(180deg,rgba(255,255,255,.2),rgba(255,255,255,0) 55%),linear-gradient(135deg,rgba(40,100,220,.9),rgba(60,122,240,.86));border:1px solid rgba(150,190,255,.55);color:#fff;border-radius:10px;padding:9px 16px;font:inherit;font-weight:600;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 6px 18px -7px rgba(47,111,228,.75);transition:filter .2s ease,scale .15s ease}
.sp-btn:hover{filter:brightness(1.08)}
.sp-btn.ghost{background:linear-gradient(180deg,rgba(255,255,255,.09),rgba(255,255,255,.015) 60%),rgba(120,165,255,.08);border-color:rgba(180,208,255,.22);color:#c8d6f5;box-shadow:inset 0 1px 0 rgba(255,255,255,.16)}
.sp-btn:focus-visible,.sp-opt:focus-visible{outline:2px solid #4f8cff;outline-offset:2px}
.sp-foot{display:flex;gap:10px;align-items:center;margin-top:18px;padding-top:14px;border-top:1px solid rgba(120,160,255,.14);flex-wrap:wrap}
.sp-msg{min-height:20px;margin-top:10px;font-size:.82rem;color:#7ee0a8}
.sp-msg.bad{color:#ffa8a8}`;
    document.head.appendChild(s);
  }

  function close() { if (box) { box.remove(); box = null; } }

  function msg(text, bad) {
    const el = box && box.querySelector(".sp-msg");
    if (el) { el.textContent = text || ""; el.classList.toggle("bad", !!bad); }
  }

  function lockView() {
    return `<h3>تب پشتیبانی</h3>
      <p class="sp-hint">برای دیدن و عوض کردن وضعیت بخش‌ها، رمز تب را بزنید.${state.hasPass ? "" : " هنوز رمزی تعریف نشده؛ فعلاً با کد مدیر وارد شوید."}</p>
      <div class="sp-foot" style="border:0;margin:0;padding:0">
        <input type="password" inputmode="numeric" autocomplete="off" id="sp-code" placeholder="رمز" />
        <button class="sp-btn" data-act="unlock">ورود</button>
        <button class="sp-btn ghost" data-act="close">بستن</button>
      </div>
      <div class="sp-msg"></div>`;
  }

  function adminView() {
    const rows = cards().map((el) => {
      const dept = el.dataset.dept;
      const name = (el.querySelector("h3") || {}).textContent || dept;
      const cur = state.cards[dept] || el.dataset.status || "off";
      const opts = ORDER.map((s) => `<button class="sp-opt" data-state="${s}" data-dept="${esc(dept)}" aria-pressed="${s === cur}">${LABEL[s]}</button>`).join("");
      return `<div class="sp-row"><span class="sp-name">${esc(name)}${el.dataset.href ? "" : "<small>هنوز صفحه‌ای ندارد؛ با «فعال» هم باز نمی‌شود</small>"}</span>${opts}</div>`;
    }).join("");
    return `<h3>وضعیت بخش‌ها</h3>
      <p class="sp-hint">روی هر گزینه که بزنید همان لحظه ذخیره می‌شود. فقط بخشِ «فعال» باز می‌شود؛ دو حالت دیگر قابل ورود نیستند.</p>
      ${rows}
      <div class="sp-foot">
        <span style="flex:1;font-size:.9rem">${state.hasPass ? "تغییر رمز تب" : "تعریف رمز تب"}</span>
        <input type="password" inputmode="numeric" autocomplete="off" id="sp-pass" placeholder="۴ تا ۸ رقم" />
        <button class="sp-btn" data-act="pass">ذخیرهٔ رمز</button>
        <button class="sp-btn ghost" data-act="close">بستن</button>
      </div>
      <div class="sp-msg"></div>`;
  }

  function draw(view) {
    css();
    if (!box) {
      box = document.createElement("div");
      box.className = "sp-bg";
      box.innerHTML = '<div class="sp-box" role="dialog" aria-modal="true"></div>';
      box.addEventListener("click", (e) => { if (e.target === box) close(); });
      document.body.appendChild(box);
      document.addEventListener("keydown", function onEsc(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", onEsc); } });
    }
    box.querySelector(".sp-box").innerHTML = view;
    const first = box.querySelector("input");
    if (first) first.focus();
  }

  async function unlock(c) {
    try {
      const r = await api("/site/login", { body: { code: c } });
      code.set(c);
      state = { cards: r.cards || {}, hasPass: !!r.hasPass };
      paint(state.cards);
      draw(adminView());
    } catch (e) { msg(e.message, true); }
  }

  async function setCard(dept, st) {
    try {
      const r = await api("/site", { method: "PUT", auth: true, body: { cards: { [dept]: st } } });
      state = { cards: r.cards || {}, hasPass: !!r.hasPass };
      paint(state.cards);
      draw(adminView());
      msg("ذخیره شد ✓");
    } catch (e) {
      if (/رمز/.test(e.message)) { code.clear(); draw(lockView()); }
      msg(e.message, true);
    }
  }

  async function savePass(p) {
    try {
      const r = await api("/site", { method: "PUT", auth: true, body: { pass: p } });
      state.hasPass = !!r.hasPass;
      draw(adminView());
      msg("رمز تب ذخیره شد ✓");
    } catch (e) { msg(e.message, true); }
  }

  async function open() {
    try { state = await api("/site"); } catch (_) { /* آفلاین — با وضعیت فعلی صفحه کار می‌کنیم */ }
    if (code.get()) {
      /* رمزِ همین تب مرورگر را یک بار می‌سنجیم تا اگر عوض شده دوباره بپرسد */
      try { await api("/site/login", { body: { code: code.get() } }); draw(adminView()); return; } catch (_) { code.clear(); }
    }
    draw(lockView());
  }

  /* ---------- سیم‌کشی ---------- */
  document.addEventListener("click", (e) => {
    const nav = e.target.closest('.nav-links a[href="#footer"], .footer-support a[data-support]');
    if (nav) { e.preventDefault(); open(); return; }
    if (!box) return;
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.act === "close") return close();
    if (b.dataset.act === "unlock") { const i = box.querySelector("#sp-code"); return unlock((i.value || "").trim()); }
    if (b.dataset.act === "pass") { const i = box.querySelector("#sp-pass"); return savePass((i.value || "").trim()); }
    if (b.dataset.dept) return setCard(b.dataset.dept, b.dataset.state);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !box) return;
    if (e.target.id === "sp-code") { e.preventDefault(); unlock((e.target.value || "").trim()); }
    if (e.target.id === "sp-pass") { e.preventDefault(); savePass((e.target.value || "").trim()); }
  });

  /* وضعیت‌ها را همان اول می‌گیریم؛ اگر سرور در دسترس نبود، همان چیزی که در HTML است می‌ماند */
  api("/site").then((r) => { state = r; paint(r.cards || {}); }).catch(() => { paint({}); });
})();
