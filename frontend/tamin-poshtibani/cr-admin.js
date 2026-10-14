/* ============================================================
   «🧭 استراتژی و دفتر» در پنل پشتیبانی — طرح «پیام اول، استراتژی‌ها، پروفایل و گراف» (مهر ۱۴۰۵)
   سرور: worker/cr-api.js (مسیرهای /support/cr، /support/strategy، /support/sreg و /support/graph)
     · 🧭 حالت‌های استعلام: نوع قلم‌های هر حالت و خانواده (حداکثری / محتاط / ویژه)، جابه‌جایی و استثنای شمار با دلیل، و
       جدولِ شمارِ موج اول و سقفِ هر حالت و رده
     · 🔁 نام نزدیک (G4): یکی بودنِ کشف‌شده با تأمین‌کنندهٔ سوابق را تأیید یا رد کنید
     · 🕸 گراف: نمای کاملِ روابط با فیلترِ نوع قلم یا بازار؛ روی هر گره پروفایلش باز می‌شود
     · ⚙️ کلیدها و ورود: هر بخشِ طرح پیش‌فرض خاموش است؛ وضعیتِ ورودِ دادهٔ تحقیق
   window.TP_CR: configure({api, raw, render}) · mount(root) · boot() · view() · load(force) · reg()
   ============================================================ */
(function () {
  "use strict";
  const TP = window.TP;
  const esc = TP.esc;
  const fa = (x) => (TP.ui && TP.ui.fa ? TP.ui.fa(x) : String(x == null ? "" : x).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[+d]));
  let C = { api: null, raw: null, render: () => {} };
  const S = { view: "heads", flags: null, names: {}, status: null, hd: null, hF: { family: "", mode: "", q: "", page: 0 }, rfqn: null, rfqnDraft: null,
    g4: null, g4F: "پیشنهادی", gr: null, grF: { head: "", hub: "" }, err: "", loading: false, seq: 0 };
  const VIEWS = [["heads", "🧭 حالت‌های استعلام"], ["g4", "🔁 نام نزدیک"], ["graph", "🕸 گراف"], ["flags", "⚙️ کلیدها و ورود"]];
  const FAM_TONE = { max: "ok", cautious: "warn", special: "info" };

  async function boot() {
    try { const r = await C.api("/cr/flags"); S.flags = r.flags; S.names = r.names || {}; } catch (_) { S.flags = S.flags || {}; }
    C.render();
  }
  const reg = () => !!(S.flags && S.flags.registry);
  async function load(force) {
    if (!C.api) return;
    const seq = ++S.seq;
    S.loading = true; S.err = ""; C.render();
    try {
      if (!S.flags || force) { const r = await C.api("/cr/flags"); S.flags = r.flags; S.names = r.names || {}; }
      if (S.view === "heads") {
        const q = new URLSearchParams(Object.entries(S.hF).filter(([, v]) => v !== "" && v != null).map(([k, v]) => [k, String(v)]));
        const [hd, rq] = await Promise.all([C.api(`/strategy/heads?${q}`), S.rfqn && !force ? Promise.resolve(S.rfqn) : C.api("/strategy/rfqn")]);
        if (seq !== S.seq) return;
        S.hd = hd; S.rfqn = rq;
      } else if (S.view === "g4") { const r = await C.api(`/sreg/g4?state=${encodeURIComponent(S.g4F)}`); if (seq !== S.seq) return; S.g4 = r; }
      else if (S.view === "graph") { const q = new URLSearchParams(Object.entries(S.grF).filter(([, v]) => v)); const r = await C.api(`/graph?${q}`); if (seq !== S.seq) return; S.gr = r; }
      else if (S.view === "flags") { const [r, pn] = await Promise.all([C.api("/cr/status"), C.api("/cr/panel").catch(() => null)]); if (seq !== S.seq) return; S.status = r; S.panel = pn; }
    } catch (e) { if (seq === S.seq) S.err = e.message; }
    if (seq === S.seq) { S.loading = false; C.render(); }
  }

  /* ---------- نماها ---------- */
  /** «حالت کار»ِ نوع قلم با تغییرِ پشتیبانی و کفِ مکاتبات («⏸ بی‌مهلت» وقتی کلیدِ hold روشن است) */
  function wfCell(d, h) {
    const wf = h.wf_over ? h.wf_over.value : h.workflow;
    const w = (d.workflows || []).find((x) => x.key === wf);
    const floor = w && w.sup !== "auto" && (S.flags || {}).hold ? ` <span class="chip ${w.sup === "hold" ? "warn" : ""}" title="کفِ حالتِ مکاتباتِ کارشناس هوشمند برای این نوع قلم">${esc(w.sup_fa)}</span>` : "";
    return `${esc(wf || "")}${floor}${h.wf_over ? `<div class="dim" style="font-size:.76rem">به تصمیم ${esc(h.wf_over.by || "")}: ${esc(h.wf_over.reason || "")}</div>` : ""}`;
  }
  /** وضعیتِ «📘 سند راهبرد»ِ نوع قلم (آخرین نسخه) */
  function docCell(d, h) {
    const x = (d.docs || {})[h.head];
    if (!x) return `<span class="dim">—</span>`;
    const tone = x.state === "approved" ? "ok" : x.state === "failed" ? "bad" : x.state === "draft" ? "warn" : "";
    return `<span class="chip ${tone}" title="نسخهٔ ${fa(x.version)}">${esc(x.state_fa || x.state)}</span>`;
  }
  function vHeads() {
    const d = S.hd;
    if (!d) return TP.ui.loader("");
    const fam = (k, l) => `<button class="${S.hF.family === k && !S.hF.mode ? "on" : ""}" data-cr-fam="${k}">${l}</button>`;
    const modes = Object.entries(d.modes || {});
    const rows = d.list.map((h) => `<tr><td class="rt"><b>${esc(h.head)}</b> <span class="dim" style="font-size:.78rem">${esc(h.cluster || "")}</span></td>
        <td><span class="chip ${FAM_TONE[h.moved ? "special" : h.family] || ""}">${esc(h.moved ? (d.modes[h.moved.value] || h.moved.value) : h.mode_fa || h.rfq_mode)}</span>${h.moved ? `<div class="dim" style="font-size:.76rem">به تصمیم ${esc(h.moved.by || "")}: ${esc(h.moved.reason || "")}</div>` : ""}</td>
        <td class="num">${h.n_over ? `${fa(h.n_over.value.n_wave1)}/${fa(h.n_over.value.n_max)} <span class="chip warn" title="${esc(h.n_over.reason || "")}">استثنا</span>` : `${fa(h.n_wave1 || "—")}/${fa(h.n_max || "—")}`}</td>
        <td>${esc(h.tier || "")}</td><td>${wfCell(d, h)}</td><td>${esc(h.priority || "")}</td><td>${docCell(d, h)}</td>
        <td><button class="tp-btn xs" data-cr-move="${esc(h.head)}">جابه‌جایی یا استثنا</button></td></tr>`).join("");
    const T = S.rfqnDraft || (S.rfqn && S.rfqn.table) || {};
    const rfq = S.rfqn ? `<details class="tp-card" style="margin-top:12px;padding:10px 14px"><summary><b>جدولِ شمارِ موج اول و سقف</b> <span class="dim">— پیش‌فرض از بسته؛ «۶» همان گسترده در ردهٔ A</span></summary>
        <div class="tp-scroll" style="margin-top:8px"><table class="tp-table"><thead><tr><th class="rt">حالت</th><th>ردهٔ A</th><th>ردهٔ B</th><th>ردهٔ C</th></tr></thead><tbody>
        ${Object.entries(S.rfqn.modes).map(([m, fam]) => `<tr><td class="rt">${esc(fam)}</td>${["A", "B", "C"].map((t) => { const v = (T[m] || {})[t] || [0, 0]; return `<td><input class="tp-input num" style="width:52px" data-rq="${m}:${t}:0" value="${v[0]}"> / <input class="tp-input num" style="width:52px" data-rq="${m}:${t}:1" value="${v[1]}"></td>`; }).join("")}</tr>`).join("")}
        </tbody></table></div><div class="toolrow" style="margin-top:8px"><button class="tp-btn primary sm" data-cr-rqsave>ذخیرهٔ جدول</button><button class="tp-btn sm" data-cr-rqreset>برگشت به بسته</button></div></details>` : "";
    return `<div class="toolrow" style="flex-wrap:wrap;gap:8px">
        <div class="tp-seg">${fam("", "همه")}${fam("max", "حداکثری")}${fam("cautious", "محتاط")}${fam("special", "ویژه")}</div>
        <select class="tp-input" data-cr-mode><option value="">هر حالت</option>${modes.map(([k, v]) => `<option value="${k}" ${S.hF.mode === k ? "selected" : ""}>${esc(v)} (${fa((d.counts || {})[k] || 0)})</option>`).join("")}</select>
        <input class="tp-input" data-cr-q placeholder="نوع قلم…" value="${esc(S.hF.q)}" style="min-width:160px"></div>
      <div class="tp-scroll" style="margin-top:8px"><table class="tp-table" style="width:100%"><thead><tr><th class="rt">نوع قلم</th><th>حالت استعلام</th><th title="موج اول / سقف">شمار</th><th>رده</th><th>حالت کار</th><th>اولویت پرسش</th><th>📘 سند</th><th></th></tr></thead>
        <tbody>${rows || `<tr><td colspan="8" class="dim">نوع قلمی نیست — دادهٔ تحقیق هنوز وارد نشده؟</td></tr>`}</tbody></table></div>
      <div class="toolrow" style="margin-top:6px">${S.hF.page > 0 ? `<button class="tp-btn sm" data-cr-page="-1">قبلی</button>` : ""}${d.list.length === d.per ? `<button class="tp-btn sm" data-cr-page="1">بعدی</button>` : ""}</div>${rfq}`;
  }
  function vG4() {
    const d = S.g4;
    const st = (k) => `<button class="${S.g4F === k ? "on" : ""}" data-cr-g4f="${k}">${k}</button>`;
    return `<div class="tp-note">فایل ۶ برای این کشف‌شده‌ها نامی نزدیک به یک تأمین‌کنندهٔ سوابق یافته است. با تأیید، نشانی و تلفنِ کشف به پروفایلِ همان تأمین‌کنندهٔ سوابق می‌رود و دو شناسه یکی شمرده می‌شوند.</div>
      <div class="tp-seg" style="margin:8px 0">${st("پیشنهادی")}${st("تأییدشده")}${st("ردشده")}</div>
      ${!d ? TP.ui.loader("") : d.list.length ? `<div class="tp-scroll"><table class="tp-table" style="width:100%"><thead><tr><th class="rt">کشف‌شده</th><th class="rt">تأمین‌کنندهٔ سوابق</th><th class="rt">یادداشتِ تحقیق</th><th></th></tr></thead><tbody>
        ${d.list.map((r) => `<tr><td class="rt"><b>${esc(r.new_name || r.alias)}</b> ${TP.supProfile ? TP.supProfile.btn(r.new_name, { sid: r.alias }) : ""}<div class="dim" style="font-size:.78rem">${esc(r.hub || "")} <span dir="ltr">${esc(r.mobiles || r.phones || "")}</span></div></td>
          <td class="rt">${r.old_name ? `${esc(r.old_name)} ${TP.supProfile ? TP.supProfile.btn(r.old_name, { sid: r.sid }) : ""}` : `<span class="dim">پیدا نشد — شناسه را بنویسید</span>`}</td>
          <td class="rt" style="white-space:normal;font-size:.82rem">${esc(r.note || "")}</td>
          <td>${S.g4F === "پیشنهادی" ? `<button class="tp-btn xs primary" data-cr-g4ok="${esc(r.alias)}" data-sid="${esc(r.sid || "")}">یکی است</button> <button class="tp-btn xs" data-cr-g4no="${esc(r.alias)}">نیست</button>` : esc(r.by_name || "")}</td></tr>`).join("")}</tbody></table></div>`
        : `<div class="empty">موردی نیست.</div>`}`;
  }
  function vGraph() {
    const d = S.gr;
    return `<div class="toolrow" style="flex-wrap:wrap;gap:8px"><input class="tp-input" data-cr-gh placeholder="نوع قلم (مثلاً ورق)" value="${esc(S.grF.head)}" style="min-width:160px">
        <input class="tp-input" data-cr-gb placeholder="بازار یا پاساژ" value="${esc(S.grF.hub)}" style="min-width:160px"><button class="tp-btn sm" data-cr-gload>نمایش</button>
        <span class="dim" style="font-size:.8rem">بی فیلتر: تازه‌ترین یال‌ها. روی هر گره بزنید تا پروفایلش باز شود.</span></div>
      ${!d ? TP.ui.loader("") : `<div class="spp-legend" style="display:flex;gap:10px;flex-wrap:wrap;font-size:.8rem;margin:8px 0">${d.natures.map((n) => `<span style="display:inline-flex;gap:5px;align-items:center"><i style="width:20px;height:3px;border-radius:2px;display:inline-block;background:${esc(n.color)}"></i>${esc(n.fa)}</span>`).join("")}<span>خط‌چین = پیشنهادی</span>
        <span class="dim">${fa(d.nodes.length)} گره · ${fa(d.edges.length)} یال</span></div>
        <svg class="spp-graph" data-cr-graph viewBox="0 0 560 420" style="width:100%;max-height:70vh"></svg>`}`;
  }
  function vFlags() {
    const f = S.flags || {}, st = S.status;
    const row = (k) => `<label class="chkline" style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--tp-line)"><input type="checkbox" data-cr-flag="${k}" ${f[k] ? "checked" : ""}> <b>${esc(S.names[k] || k)}</b></label>`;
    return `<div class="tp-card" style="padding:12px 16px"><h4 style="margin:0 0 6px">کلیدهای طرح</h4><div class="dim" style="font-size:.84rem;margin-bottom:6px">هر بخش تا روشن نشده رفتارِ امروزِ سامانه را عوض نمی‌کند. خاموش کردن رفتارِ امروز را برمی‌گرداند.</div>
        ${Object.keys(S.names || {}).map(row).join("")}</div>
      <div class="tp-card" style="padding:12px 16px;margin-top:12px"><h4 style="margin:0 0 6px">دادهٔ تحقیق</h4>${!st ? TP.ui.loader("") : `<div class="spp-kv" style="display:grid;grid-template-columns:max-content 1fr;gap:4px 12px">
        <b>نوع قلم</b><span>${fa(st.heads)}</span><b>واحدِ کشف</b><span>${fa(st.units)}</span><b>تأمین‌کننده در دفتر</b><span>${fa(st.suppliers)}</span><b>یال</b><span>${fa(st.edges)}</span>
        <b>نظر</b><span>${fa(st.opinions)}</span><b>نام دیگر و ادغام</b><span>${fa(st.aliases)}</span><b>نسخه</b><span>${esc(st.version || "—")}</span></div>
        ${!st.heads ? `<div class="tp-note warn" style="margin-top:8px">دادهٔ تحقیق هنوز وارد نشده است (ابزارِ tools/cr02-import.mjs).</div>` : ""}`}</div>
      ${vPanel()}`;
  }
  /** «📘 سند راهبرد»: مدلِ سند، تنظیم‌های قیمتِ مؤثر (نرخِ ماهانهٔ پنل…) و پیشرفتِ پیش‌ساختِ نوع قلم‌های پرهزینه */
  function vPanel() {
    const pn = S.panel;
    if (!pn) return "";
    const p = pn.panel, pr = pn.progress || {}, bs = pr.by_state || {};
    const pc = (v) => (v == null ? "" : String(Math.round(v * 1000) / 10));
    const inp = (k, label, v, hint) => `<label class="tp-field"><b>${label}</b><input class="tp-input num" data-pn="${k}" value="${v}" style="width:90px" dir="ltr" placeholder="${hint || ""}"></label>`;
    return `<div class="tp-card" style="padding:12px 16px;margin-top:12px"><h4 style="margin:0 0 6px">📘 سند راهبرد و قیمتِ مؤثر ${TP.ui.info("support.cr", "راهنمای استراتژی و دفتر")}</h4>
      <div class="toolrow" style="gap:8px;flex-wrap:wrap;align-items:end">
        <label class="tp-field"><b>مدلِ سند</b><select class="tp-input" data-pn-model>${Object.entries(pn.models || {}).map(([k, v]) => `<option value="${k}" ${k === pn.model ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>
        ${inp("panel_rate", "نرخِ ماهانهٔ پنل (٪)", pc(p.panel_rate), "مثلاً ۳")}${inp("fx_growth", "رشدِ ماهانهٔ دلار (٪)", pc(p.fx_growth), "اختیاری")}${inp("vat_rate", "ارزش افزوده (٪)", pc(p.vat_rate))}${inp("no_invoice_premium", "ریسکِ بی صورتحساب (٪)", pc(p.no_invoice_premium))}
        <label class="tp-field"><b>مبنای تنزیل</b><select class="tp-input" data-pn-basis>${[["max", "بیشینهٔ نرخ پنل و دلار"], ["panel", "نرخ پنل"], ["fx", "رشد دلار"]].map(([k, v]) => `<option value="${k}" ${k === p.basis ? "selected" : ""}>${v}</option>`).join("")}</select></label></div>
      <label class="chkline"><input type="checkbox" data-pn-flag="vat_creditable" ${p.vat_creditable ? "checked" : ""}> ارزش افزوده قابلِ استرداد است</label>
      <label class="chkline"><input type="checkbox" data-pn-flag="say_panel_rate" ${p.say_panel_rate ? "checked" : ""}> کارشناس هوشمند خودِ نرخِ پنل را بگوید (وگرنه از نیمهٔ آن شروع می‌کند)</label>
      <div class="toolrow" style="margin-top:6px"><button class="tp-btn primary sm" data-pn-save>ذخیره</button></div>
      <div class="dim" style="font-size:.84rem;margin-top:8px">پیش‌ساختِ ${fa(pr.target || 0)} نوع قلمِ پرهزینه: تأییدشده ${fa(bs.approved || 0)} · منتظرِ بازبینی ${fa(bs.draft || 0)} · در صف ${fa((bs.queued || 0) + (bs.building || 0))} · ناموفق ${fa(bs.failed || 0)} — ${fa(pr.built || 0)} سند، حدود ${fa(Math.round((pr.cost_usd || 0) * 100) / 100)} دلار</div></div>`;
  }
  function view() {
    const sub = VIEWS.map(([k, l]) => `<button class="${S.view === k ? "on" : ""}" data-cr-view="${k}">${l}</button>`).join("");
    const body = S.err ? `<div class="tp-note warn">${esc(S.err)}</div>` : S.view === "g4" ? vG4() : S.view === "graph" ? vGraph() : S.view === "flags" ? vFlags() : vHeads();
    if (TP.supProfile && TP.supProfile.css) TP.supProfile.css();
    setTimeout(drawGraph, 0);
    return `<div class="tp-seg" style="margin-bottom:10px;flex-wrap:wrap">${sub}</div>${body}`;
  }
  function drawGraph() {
    const svg = document.querySelector("[data-cr-graph]");
    if (!svg || !S.gr || !TP.supProfile || svg.dataset.drawn) return;
    svg.dataset.drawn = "1";
    TP.supProfile.graph(svg, { ...S.gr, nodes: S.gr.nodes.map((n) => ({ ...n, root: false })) }, { onNode: (sid, name) => TP.supProfile.open({ sid, name, tab: "graph" }) });
  }

  /* ---------- رفتارها ---------- */
  function moveUI(head) {
    const d = S.hd, h = d.list.find((x) => x.head === head);
    const m = TP.modal(`جابه‌جایی یا استثنا — ${esc(head)}`, `<div style="display:flex;flex-direction:column;gap:8px">
        <label class="tp-field"><b>حالت استعلام</b><select class="tp-input" data-mv-mode><option value="">بی تغییر</option>${Object.entries(d.modes).map(([k, v]) => `<option value="${k}" ${h && h.moved && h.moved.value === k ? "selected" : ""}>${esc(v)}</option>`).join("")}<option value="__clear">برگشت به حالتِ تحقیق</option></select></label>
        <div class="toolrow" style="gap:8px"><label class="tp-field"><b>موج اول</b><input class="tp-input num" data-mv-n1 style="width:70px" value="${h && h.n_over ? h.n_over.value.n_wave1 : ""}"></label>
          <label class="tp-field"><b>سقف</b><input class="tp-input num" data-mv-n2 style="width:70px" value="${h && h.n_over ? h.n_over.value.n_max : ""}"></label>
          <label class="chkline"><input type="checkbox" data-mv-nclear> برداشتنِ استثنای شمار</label></div>
        <label class="tp-field"><b>حالت کار</b><select class="tp-input" data-mv-wf><option value="">بی تغییر (${esc(h ? (h.wf_over ? h.wf_over.value : h.workflow) || "—" : "—")})</option>${(d.workflows || []).map((w) => `<option value="${esc(w.key)}">${esc(w.key)}${w.sup !== "auto" ? ` — مکاتبات دست‌کم ${esc(w.sup_fa)}` : ""}</option>`).join("")}${h && h.wf_over ? `<option value="__clear">برگشت به دادهٔ تحقیق (${esc(h.workflow || "")})</option>` : ""}</select></label>
        <label class="tp-field"><b>دلیل (اجباری)</b><input class="tp-input" data-mv-why style="width:100%" placeholder="چرا این نوع قلم جابه‌جا می‌شود؟"></label>
        <div class="dim" style="font-size:.8rem">تاریخچه می‌ماند و ورودِ دوبارهٔ تحقیق این تصمیم را پاک نمی‌کند.</div></div>`, async () => {
      const g = (k) => m.querySelector(k);
      const body = { reason: g("[data-mv-why]").value };
      const mode = g("[data-mv-mode]").value, clear = [];
      if (mode === "__clear") clear.push("mode"); else if (mode) body.mode = mode;
      if (g("[data-mv-nclear]").checked) clear.push("n");
      const wf = g("[data-mv-wf]").value;
      if (wf === "__clear") clear.push("workflow"); else if (wf) body.workflow = wf;
      else if (g("[data-mv-n1]").value && g("[data-mv-n2]").value) body.n = { n_wave1: Number(TP.digits ? TP.digits(g("[data-mv-n1]").value) : g("[data-mv-n1]").value), n_max: Number(TP.digits ? TP.digits(g("[data-mv-n2]").value) : g("[data-mv-n2]").value) };
      if (clear.length) body.clear = clear;
      try { await C.api(`/strategy/heads/${encodeURIComponent(head)}`, { method: "PUT", body }); await load(true); }
      catch (e) { TP.modal("نشد", esc(e.message), null, "باشد", ""); }
    }, "ثبت");
  }
  async function onClick(e) {
    const t = e.target.closest("[data-cr-view],[data-cr-fam],[data-cr-page],[data-cr-move],[data-cr-rqsave],[data-cr-rqreset],[data-cr-g4f],[data-cr-g4ok],[data-cr-g4no],[data-cr-gload],[data-pn-save]");
    if (!t) return;
    const d = t.dataset;
    if (d.crView) { S.view = d.crView; S.err = ""; return load(); }
    if (d.crFam !== undefined) { S.hF.family = d.crFam; S.hF.mode = ""; S.hF.page = 0; return load(); }
    if (d.crPage) { S.hF.page = Math.max(0, S.hF.page + Number(d.crPage)); return load(); }
    if (d.crMove) return moveUI(d.crMove);
    if (d.crRqsave !== undefined) {
      const tbl = {};
      document.querySelectorAll("[data-rq]").forEach((x) => { const [m, tier, i] = x.dataset.rq.split(":"); ((tbl[m] ||= {})[tier] ||= [0, 0])[+i] = Number(TP.digits ? TP.digits(x.value) : x.value); });
      try { S.rfqn = { ...S.rfqn, table: (await C.api("/strategy/rfqn", { method: "PUT", body: { table: tbl } })).table }; S.rfqnDraft = null; TP.ui && TP.ui.success && TP.ui.success("جدول ذخیره شد"); C.render(); }
      catch (er) { TP.modal("نشد", esc(er.message), null, "باشد", ""); }
      return;
    }
    if (d.crRqreset !== undefined) { try { S.rfqn = { ...S.rfqn, table: (await C.api("/strategy/rfqn", { method: "PUT", body: { table: {} } })).table }; C.render(); } catch (er) { TP.modal("نشد", esc(er.message), null, "باشد", ""); } return; }
    if (d.pnSave !== undefined) {
      const g = (k) => { const x = document.querySelector(`[data-pn="${k}"]`); const v = x ? TP.digits(x.value).trim() : ""; return v === "" ? null : Number(v) / 100; };
      const fl = (k) => { const x = document.querySelector(`[data-pn-flag="${k}"]`); return !!(x && x.checked); };
      const body = { panel_rate: g("panel_rate"), fx_growth: g("fx_growth"), vat_rate: g("vat_rate"), no_invoice_premium: g("no_invoice_premium"), vat_creditable: fl("vat_creditable"),
        say_panel_rate: fl("say_panel_rate"), basis: (document.querySelector("[data-pn-basis]") || {}).value, model: (document.querySelector("[data-pn-model]") || {}).value };
      try { const r = await C.api("/cr/panel", { method: "PUT", body }); S.panel = { ...S.panel, panel: r.panel, model: r.model }; TP.ui && TP.ui.success && TP.ui.success("ذخیره شد"); C.render(); }
      catch (er) { TP.modal("نشد", esc(er.message), null, "باشد", ""); }
      return;
    }
    if (d.crG4f) { S.g4F = d.crG4f; return load(); }
    if (d.crG4ok) {
      const m = TP.modal("یکی است", `<label class="tp-field"><b>شناسهٔ تأمین‌کنندهٔ سوابق</b><input class="tp-input" data-g4-sid value="${esc(d.sid || "")}" dir="ltr" style="width:100%"></label><input class="tp-input" data-g4-note placeholder="یادداشت (اختیاری)" style="width:100%;margin-top:8px">`, async () => {
        try { await C.api(`/sreg/g4/${encodeURIComponent(d.crG4ok)}`, { body: { same: true, sid: m.querySelector("[data-g4-sid]").value.trim(), note: m.querySelector("[data-g4-note]").value } }); await load(true); }
        catch (er) { TP.modal("نشد", esc(er.message), null, "باشد", ""); }
      }, "تأیید");
      return;
    }
    if (d.crG4no) { try { await C.api(`/sreg/g4/${encodeURIComponent(d.crG4no)}`, { body: { same: false } }); await load(true); } catch (er) { TP.modal("نشد", esc(er.message), null, "باشد", ""); } return; }
    if (d.crGload !== undefined) {
      const h = document.querySelector("[data-cr-gh]"), b = document.querySelector("[data-cr-gb]");
      S.grF = { head: h ? h.value.trim() : "", hub: b ? b.value.trim() : "" }; S.gr = null; return load();
    }
  }
  async function onChange(e) {
    const t = e.target;
    if (t.matches("[data-cr-mode]")) { S.hF.mode = t.value; S.hF.family = ""; S.hF.page = 0; return load(); }
    if (t.matches("[data-cr-flag]")) {
      try { const r = await C.api("/cr/flags", { method: "PUT", body: { [t.dataset.crFlag]: t.checked } }); S.flags = r.flags; C.render(); }
      catch (er) { TP.modal("نشد", esc(er.message), null, "باشد", ""); }
    }
  }
  let qT = null;
  function onInput(e) {
    const t = e.target;
    if (t.matches("[data-cr-q]")) { clearTimeout(qT); const v = t.value; qT = setTimeout(() => { S.hF.q = v.trim(); S.hF.page = 0; load().then(() => { const x = document.querySelector("[data-cr-q]"); if (x) { x.focus(); x.setSelectionRange(x.value.length, x.value.length); } }); }, 300); }
  }
  window.TP_CR = {
    configure(o) { C = { ...C, ...o }; },
    mount(root) { root.addEventListener("click", onClick); root.addEventListener("change", onChange); root.addEventListener("input", onInput); },
    boot, view, load, reg,
  };
})();
