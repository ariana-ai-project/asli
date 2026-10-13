/* ============================================================
   کشوی «👤 پروفایل تأمین‌کننده» و «🕸 کاوش گراف» — فاز ۱ طرح «پیام اول، استراتژی‌ها، پروفایل و گراف» (مهر ۱۴۰۵)
   داده: worker/sreg.js (مسیرهای /sreg/*). هر صفحه‌ای که نامِ تأمین‌کننده را نشان می‌دهد فقط این را صدا می‌زند:
     TP.supProfile.open({ sid, name, head })        — کشو را باز می‌کند (پروفایل، نظرها، روابط، گراف)
     TP.supProfile.enabled()                         — Promise<boolean>: کلیدِ «دفتر تأمین‌کنندگان» در پنل پشتیبانی روشن است؟
     TP.supProfile.btn(name, extra)                  — دکمهٔ کوچکِ 👤 با data-supp (شنونده‌اش را همین فایل می‌گذارد)
     TP.supProfile.configure({ api })                — پنل پشتیبانی api با نشانهٔ ورود خودش را می‌دهد
     TP.supProfile.graph(el, data, { onNode })       — رسمِ گراف (پنل پشتیبانی هم همین را برای نمای کامل به کار می‌برد)
   نظرها فقط برای کارکنان است؛ کارشناس هوشمند فقط نظرهای همان تأمین‌کننده را، در بخشِ محرمانه، برای سنجیدن می‌بیند و هرگز بازگو نمی‌کند.
   ============================================================ */
(function () {
  "use strict";
  const TP = window.TP;
  if (!TP) return;
  const esc = TP.esc;
  const fa = (x) => (TP.ui && TP.ui.fa ? TP.ui.fa(x) : String(x == null ? "" : x).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[+d]));
  let C = { api: (p, o) => TP.api(p, o) };
  let flagsP = null;
  const S = { sid: null, name: "", head: "", tab: "info", d: null, err: "", loading: false, g: null, gDepth: 1, gErr: "", hits: [], pick: new Map(), seq: 0 };
  const VER_FA = { 2: ["ok", "✔ همهٔ دروازه‌ها"], 1: ["info", "هویت قابل احراز"], 0: ["warn", "هنوز راستی‌آزمایی نشده"], "-1": ["bad", "رد در دروازه"] };
  const KIND_FA = { old: "از سوابق خرید", new: "کشف‌شده", loc: "فقط در سامانه" };
  const ymFa = (ym) => { if (!ym) return "—"; const y = Math.floor((ym - 1) / 12), m = ym - y * 12; return fa(`${y}/${String(m).padStart(2, "0")}`); };
  const money = (v) => (v == null ? "—" : fa(Math.round(Number(v) / 1e6).toLocaleString("en-US")).replace(/,/g, "٬") + " م.ر");
  const when = (ms) => { if (!ms) return ""; const [y, m, d] = TP.todayJ ? TP.todayJ(ms) : [0, 0, 0]; return fa(`${y}/${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}`); };

  /* ---------- سبک (یک بار) ---------- */
  function css() {
    if (document.getElementById("sp-prof-css")) return;
    const s = document.createElement("style"); s.id = "sp-prof-css";
    s.textContent = `
.spp { position: fixed; inset: 0; z-index: 900; }
.spp-scrim { position: absolute; inset: 0; background: rgba(3, 8, 20, 0.45); }
:root[data-theme="light"] .spp-scrim { background: rgba(15, 27, 51, 0.28); }
.spp-panel { position: absolute; top: 0; bottom: 0; right: 0; width: min(600px, 100%); display: flex; flex-direction: column; color: var(--tp-fg);
  background: var(--ui-thick, #0f1a36); border-inline-start: 1px solid var(--ui-edge, rgba(255,255,255,.14)); -webkit-backdrop-filter: blur(26px) saturate(140%); backdrop-filter: blur(26px) saturate(140%);
  box-shadow: -30px 0 70px -30px rgba(0, 8, 30, 0.8); animation: sppIn .32s cubic-bezier(.2,.8,.2,1) both; }
@keyframes sppIn { from { transform: translateX(24px); opacity: 0; } }
.spp-panel > header { display: flex; align-items: flex-start; gap: 10px; padding: 14px 16px 6px; }
.spp-panel > header h2 { margin: 0; font-size: 1.1rem; flex: 1; line-height: 1.6; }
.spp-panel > header .sub { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; font-size: .8rem; }
.spp-tabs { display: flex; gap: 4px; padding: 0 12px 8px; flex-wrap: wrap; border-bottom: 1px solid var(--tp-line); }
.spp-tabs button { border: 0; background: transparent; color: var(--tp-muted); font: inherit; font-weight: 700; font-size: .88rem; padding: 6px 12px; border-radius: 10px; cursor: pointer; }
.spp-tabs button.on { color: var(--tp-fg); background: rgba(79, 140, 255, 0.16); }
.spp-body { flex: 1; min-height: 0; overflow-y: auto; padding: 12px 16px 28px; overscroll-behavior: contain; }
.spp-sec { margin-bottom: 14px; }
.spp-sec h4 { margin: 0 0 6px; font-size: .8rem; color: var(--tp-muted); font-weight: 800; }
.spp-kv { display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; font-size: .9rem; line-height: 1.8; }
.spp-kv > b { color: var(--tp-muted); font-weight: 600; }
.spp-kv a { color: var(--tp-accent); }
.spp-note { font-size: .82rem; color: var(--tp-muted); background: rgba(79, 140, 255, 0.08); border: 1px solid rgba(79, 140, 255, 0.22); border-radius: 12px; padding: 8px 10px; margin-bottom: 10px; line-height: 1.8; }
.spp-op { border: 1px solid var(--tp-line); border-radius: 14px; padding: 10px 12px; margin-bottom: 8px; }
.spp-op.hid { opacity: .55; }
.spp-op .meta { font-size: .78rem; color: var(--tp-muted); display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.spp-op .txt { white-space: pre-wrap; line-height: 1.9; margin: 4px 0; }
.spp-form { display: flex; flex-direction: column; gap: 8px; border: 1px dashed var(--tp-line-2, var(--tp-line)); border-radius: 14px; padding: 10px 12px; }
.spp-form .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.spp-form .row[hidden] { display: none; }
.spp-form textarea { min-height: 70px; resize: vertical; }
.spp-edge { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 6px 0; border-bottom: 1px solid var(--tp-line); font-size: .9rem; }
.spp-edge .nat { display: inline-flex; align-items: center; gap: 4px; font-weight: 700; font-size: .8rem; }
.spp-edge .nat i { width: 18px; height: 3px; border-radius: 2px; display: inline-block; }
.spp-edge .nat i.dash { background: repeating-linear-gradient(90deg, var(--c) 0 4px, transparent 4px 7px) !important; }
.spp-edge .ev { font-size: .78rem; color: var(--tp-muted); flex-basis: 100%; }
.spp-link { background: none; border: 0; padding: 0; font: inherit; color: var(--tp-accent); cursor: pointer; text-align: start; }
.spp-hits { max-height: 180px; overflow: auto; display: flex; flex-direction: column; gap: 2px; }
.spp-hits label { display: flex; gap: 8px; align-items: center; font-size: .88rem; padding: 2px 4px; border-radius: 8px; }
.spp-hits label:hover { background: rgba(79, 140, 255, 0.08); }
.spp-legend { display: flex; gap: 10px; flex-wrap: wrap; font-size: .78rem; margin: 6px 0; }
.spp-legend span { display: inline-flex; gap: 5px; align-items: center; }
.spp-legend i { width: 20px; height: 3px; border-radius: 2px; display: inline-block; }
.spp-graph { width: 100%; border: 1px solid var(--tp-line); border-radius: 14px; background: rgba(3, 8, 20, 0.18); touch-action: none; }
:root[data-theme="light"] .spp-graph { background: rgba(255, 255, 255, 0.6); }
.spp-graph text { font: 11px Vazirmatn, system-ui, sans-serif; fill: var(--tp-fg); paint-order: stroke; stroke: var(--ui-thick, #0f1a36); stroke-width: 3px; }
.spp-graph circle { cursor: pointer; }
.supp-btn { border: 1px solid var(--tp-line); background: transparent; color: inherit; border-radius: 999px; padding: 0 6px; font: inherit; font-size: .78rem; line-height: 1.6; cursor: pointer; vertical-align: 1px; }
.supp-btn:hover { border-color: var(--tp-accent); color: var(--tp-accent); }
@media (max-width: 640px) {
  .spp-panel { top: auto; left: 0; right: 0; width: auto; height: 90vh; height: 90dvh; border-radius: 24px 24px 0 0; border-inline-start: 0; border-top: 1px solid var(--ui-edge); }
}`;
    document.head.appendChild(s);
  }

  /* ---------- کلید ---------- */
  function enabled() {
    if (!flagsP) flagsP = C.api("/cr/flags").then((r) => !!(r && r.flags && r.flags.registry)).catch(() => false);
    return flagsP;
  }
  const btn = (name, extra) => `<button type="button" class="supp-btn" data-supp="${esc(name || "")}"${extra && extra.sid ? ` data-supp-sid="${esc(extra.sid)}"` : ""}${extra && extra.head ? ` data-supp-head="${esc(extra.head)}"` : ""} title="پروفایل، نظرها و روابط">👤</button>`;

  /* ---------- باز کردن ---------- */
  let root = null;
  function close() { if (root) { root.remove(); root = null; } document.removeEventListener("keydown", onEsc); }
  const onEsc = (e) => { if (e.key === "Escape") close(); };
  async function open(o) {
    css();
    S.sid = (o && o.sid) || null; S.name = (o && o.name) || ""; S.head = (o && o.head) || ""; S.tab = (o && o.tab) || "info";
    S.d = null; S.err = ""; S.g = null; S.gErr = ""; S.hits = []; S.pick = new Map();
    if (!root) {
      root = document.createElement("div"); root.className = "spp"; root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true");
      document.body.appendChild(root);
      root.addEventListener("click", onClick); root.addEventListener("input", onInput); root.addEventListener("change", onChange);
      document.addEventListener("keydown", onEsc);
    }
    draw();
    await load();
  }
  async function load() {
    const seq = ++S.seq;
    S.loading = true; draw();
    const q = new URLSearchParams(S.sid ? { sid: S.sid } : { name: S.name });
    if (S.head) q.set("head", S.head);
    try { const d = await C.api(`/sreg/profile?${q}`); if (seq !== S.seq) return; S.d = d; S.sid = d.sid; S.name = d.name; }
    catch (e) { if (seq !== S.seq) return; S.err = e.message; }
    S.loading = false; draw();
    if (S.tab === "graph") loadGraph();
  }
  async function loadGraph() {
    if (!S.sid) return;
    S.gErr = ""; S.g = null; draw();
    try { S.g = await C.api(`/sreg/graph?sid=${encodeURIComponent(S.sid)}&depth=${S.gDepth}`); } catch (e) { S.gErr = e.message; }
    draw();
  }

  /* ---------- نما ---------- */
  function kv(rows) {
    const r = rows.filter(([, v]) => v != null && v !== "" && v !== false);
    return r.length ? `<div class="spp-kv">${r.map(([k, v]) => `<b>${k}</b><span>${v}</span>`).join("")}</div>` : `<div class="dim" style="font-size:.85rem">—</div>`;
  }
  const ltr = (v) => (v ? `<span dir="ltr">${esc(v)}</span>` : "");
  const links = (s) => String(s || "").split(/\s+/).filter((u) => /^https?:\/\//.test(u)).slice(0, 6).map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u.replace(/^https?:\/\//, "").slice(0, 40))}</a>`).join("<br>");
  function vInfo(d) {
    const v = VER_FA[String(d.verification.level)] || ["", "—"];
    const r = d.research || {};
    return `
      <div class="spp-sec"><h4>هویت</h4>${kv([["نام رسمی", esc(d.identity.legal_name || "")], ["نام تجاری", esc(d.identity.brand_name || "")], ["شناسهٔ ملی", ltr(d.identity.national_id)],
        ["نوع", esc(d.identity.type || "")], ["نقش در زنجیره", esc(d.identity.role || "")], ["مدیر", esc(d.identity.manager || "")], ["تأسیس", esc(d.identity.established || "")], ["وضعیت ثبتی", esc(d.identity.registry_status || "")]])}</div>
      <div class="spp-sec"><h4>تماس</h4>${kv([["نشانی", esc(d.contact.address || "")], ["تلفن", ltr(d.contact.phones)], ["همراه", ltr(d.contact.mobiles)], ["وب‌سایت", d.contact.website ? links(/^https?:/.test(d.contact.website) ? d.contact.website : `https://${d.contact.website}`) : ""],
        ["ایمیل", ltr(d.contact.email)], ["تماسِ تأییدشده", ltr(d.contact.verified)]])}</div>
      <div class="spp-sec"><h4>بازار</h4>${kv([["کشور", esc(d.market.country || "")], ["استان و شهر", esc([d.market.province, d.market.city].filter(Boolean).join("، "))], ["بازار یا پاساژ", esc(d.market.hub || "")],
        ["برندها", esc(d.market.brands || "")], ["محصولات (به نقل از خودش)", esc(d.market.products || "")]])}</div>
      <div class="spp-sec"><h4>راستی‌آزمایی</h4>${kv([["سطح", `<span class="chip ${v[0]}">${v[1]}</span>`], ["دروازه‌ها", esc(d.verification.gates || "")], ["مانده یا رد", esc(d.verification.open || "")],
        ["آخرین نشانهٔ فعالیت", esc([d.verification.last_activity_date, d.verification.last_activity].filter(Boolean).join(" — "))], ["نام نزدیک (G4)", esc(d.verification.g4 || "")],
        ["کامل بودن پرونده", d.verification.completeness != null ? fa(Math.round(d.verification.completeness * 100)) + "٪" : ""], ["بررسی", esc(d.verification.checked || "")], ["منابع", links(d.verification.sources)]])}</div>
      <div class="spp-sec"><h4>${d.kind === "old" ? "در تحقیق (سوابق ۱۳۹۸ تا ۱۴۰۵)" : "در رتبه‌بندیِ کشف"}</h4>${d.kind === "old"
        ? kv([["رده", esc(r.rank || "")], ["مبلغ (میلیارد ریال)", r.spend_bn != null ? fa(Math.round(r.spend_bn)) : ""], ["شمار نوع قلم", r.heads != null ? fa(r.heads) : ""], ["سال‌های همکاری", r.years != null ? fa(r.years) : ""],
          ["از تا", r.first_yr ? fa(`${r.first_yr} تا ${r.last_yr || "—"}`) : ""], ["نوع قلم‌های غالب", esc(r.dominant_heads || "")]])
        : kv([["بهترین رتبه", r.best_rank != null ? fa(r.best_rank) : ""], ["در نوع قلمِ", esc(r.best_rank_unit || "")], ["شمار در ده‌تای اول", r.n_top10 != null ? fa(r.n_top10) : ""], ["ده‌تای اولِ", esc(r.top10_units || "")]])}</div>
      ${d.buys ? `<div class="spp-sec"><h4>خرید از او در «${esc(d.buys.head)}»</h4>${d.buys.n ? kv([["شمار خرید", fa(d.buys.n)], ["مبلغ تعدیلی", money(d.buys.value)], ["از تا", `${ymFa(d.buys.first_ym)} تا ${ymFa(d.buys.last_ym)}`]]) : `<div class="dim">در سوابقِ این نوع قلم خریدی نیست.</div>`}</div>` : ""}
      ${d.aliases && d.aliases.length ? `<div class="spp-sec"><h4>ادغام و نام‌های دیگر</h4>${d.aliases.map((a) => `<div class="dim" style="font-size:.84rem">${esc(a.kind === "merge" ? "ادغام" : a.kind === "g4" ? "نام نزدیک" : a.kind)}: ${esc(a.alias)} ← ${esc(a.sid || "؟")} · ${esc(a.status)}</div>`).join("")}</div>` : ""}`;
  }
  function vOps(d) {
    const me = (o) => o.mine;
    const list = d.opinions.map((o) => `<div class="spp-op ${o.hidden ? "hid" : ""}" data-op="${o.id}">
        <div class="meta"><b>${esc(o.author || "")}</b>${o.voice === "other" ? `<span class="chip">از زبان ${esc(o.holder || "")}${o.holder_role ? ` (${esc(o.holder_role)})` : ""}</span>` : `<span class="chip">از طرف خودم</span>`}
          ${o.topic ? `<span class="chip">${esc(o.topic)}</span>` : ""}${o.conf ? `<span title="اطمینان">${"●".repeat(o.conf)}${"○".repeat(5 - o.conf)}</span>` : ""}<span>${when(o.at)}${o.edited ? " · ویرایش‌شده" : ""}</span></div>
        <div class="txt">${esc(o.body)}</div>
        ${o.hidden ? `<div class="dim" style="font-size:.8rem">پنهان شد: ${esc(o.hidden_note || "")}</div>` : `<div class="row" style="display:flex;gap:6px">${me(o) ? `<button class="tp-btn xs" data-op-edit="${o.id}">ویرایش</button>` : ""}<button class="tp-btn xs" data-op-hide="${o.id}">پنهان کردن</button></div>`}
      </div>`).join("");
    return `<div class="spp-note">نظرها فقط برای کارکنان است. کارشناس هوشمند در گفت‌وگو با همین تأمین‌کننده فقط برای سنجیدن از آن‌ها استفاده می‌کند و هرگز بازگو نمی‌کند؛ پیامی که تکه‌ای از آن‌ها داشته باشد نمی‌رود.</div>
      <form class="spp-form" data-op-form>
        <div class="row"><label class="chkline"><input type="radio" name="voice" value="self" checked> از طرف خودم</label><label class="chkline"><input type="radio" name="voice" value="other"> از زبان دیگری</label></div>
        <div class="row" data-holder hidden><input class="tp-input" name="holder" placeholder="صاحب‌نظر (نام)" style="flex:1;min-width:140px"><input class="tp-input" name="holder_role" placeholder="کیست؟ مثلاً تأمین‌کنندهٔ دیگر" style="flex:1;min-width:140px"></div>
        <div class="row"><select class="tp-input" name="topic"><option value="">موضوع (اختیاری)</option>${d.topics.map((t) => `<option>${esc(t)}</option>`).join("")}</select>
          <select class="tp-input" name="conf"><option value="">اطمینان (اختیاری)</option>${[1, 2, 3, 4, 5].map((n) => `<option value="${n}">${fa(n)} از ۵</option>`).join("")}</select></div>
        <textarea class="tp-input" name="body" placeholder="نظر" maxlength="2000"></textarea>
        <div class="row"><button class="tp-btn primary sm" type="submit">ثبت نظر</button></div>
      </form>
      <div style="margin-top:12px">${list || `<div class="dim">هنوز نظری ثبت نشده.</div>`}</div>`;
  }
  const natChip = (e) => `<span class="nat" style="--c:${esc(e.color)}"><i class="${e.status === "پیشنهادی" ? "dash" : ""}" style="background:${esc(e.color)}"></i>${esc(e.nature_fa || e.fa || "")}</span>`;
  function vRel(d) {
    const rows = d.edges.map((e) => `<div class="spp-edge">${natChip(e)}<button class="spp-link" data-supp-sid="${esc(e.other)}" data-supp="${esc(e.other_name)}">${esc(e.other_name)}</button>
        <span class="chip ${e.status === "تأییدشده" ? "ok" : ""}">${esc(e.status)}</span><span class="dim" style="font-size:.78rem">${esc(e.source)}${e.by ? ` · ${esc(e.by)}` : ""}</span>
        ${e.status === "پیشنهادی" ? `<button class="tp-btn xs" data-edge-ok="${e.id}">تأیید</button><button class="tp-btn xs" data-edge-no="${e.id}">رد</button>` : ""}
        ${e.evidence || e.ev || e.note ? `<span class="ev">${esc([e.ev, e.evidence, e.note].filter(Boolean).join(" — "))}</span>` : ""}</div>`).join("");
    const picks = [...S.pick.values()];
    return `<div class="spp-sec"><h4>🔗 پیوند تازه</h4><div class="spp-form">
        <input class="tp-input" data-link-q placeholder="نام تأمین‌کنندهٔ دیگر را بنویسید…" autocomplete="off">
        <div class="spp-hits">${S.hits.map((h) => `<label><input type="checkbox" data-link-pick="${esc(h.sid)}" data-link-name="${esc(h.name)}" ${S.pick.has(h.sid) ? "checked" : ""}> ${esc(h.name)} <span class="dim" style="font-size:.78rem">${esc(h.hub || h.city || "")}</span></label>`).join("")}</div>
        ${picks.length ? `<div class="dim" style="font-size:.82rem">انتخاب‌شده: ${picks.map((p) => esc(p)).join("، ")}</div>` : ""}
        <div class="row"><select class="tp-input" data-link-nature>${d.natures.map((n) => `<option value="${esc(n.key)}">${esc(n.fa)}</option>`).join("")}</select>
          <input class="tp-input" data-link-note placeholder="یادداشت (اختیاری)" style="flex:1;min-width:140px">
          <button class="tp-btn primary sm" data-link-save ${picks.length ? "" : "disabled"}>ثبت پیوند</button></div></div></div>
      <div class="spp-legend">${d.natures.map((n) => `<span><i style="background:${esc(n.color)}"></i>${esc(n.fa)}</span>`).join("")}<span><i style="background:repeating-linear-gradient(90deg,#999 0 4px,transparent 4px 7px)"></i>پیشنهادی</span></div>
      ${rows || `<div class="dim">رابطه‌ای ثبت نشده.</div>`}`;
  }
  function vGraph() {
    return `<div class="row" style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
        <div class="tp-seg"><button class="${S.gDepth === 1 ? "on" : ""}" data-gdepth="1">یک قدم</button><button class="${S.gDepth === 2 ? "on" : ""}" data-gdepth="2">دو قدم</button></div>
        <span class="dim" style="font-size:.8rem">روی هر گره بزنید تا پروفایلش باز شود</span></div>
      ${S.gErr ? `<div class="tp-note warn">${esc(S.gErr)}</div>` : !S.g ? TP.ui && TP.ui.loader ? TP.ui.loader("") : "…" : `<div class="spp-legend">${S.g.natures.map((n) => `<span><i style="background:${esc(n.color)}"></i>${esc(n.fa)}</span>`).join("")}<span>خط‌چین = پیشنهادی</span></div><svg class="spp-graph" data-graph viewBox="0 0 560 420" role="img" aria-label="گراف روابط"></svg>`}`;
  }
  function draw() {
    if (!root) return;
    const d = S.d;
    const head = d ? `<h2>${esc(d.name)}<div class="sub"><span class="chip">${esc(KIND_FA[d.kind] || d.kind)}</span>${d.market && d.market.hub ? `<span class="chip">${esc(d.market.hub)}</span>` : ""}${(() => { const v = VER_FA[String(d.verification && d.verification.level)]; return v ? `<span class="chip ${v[0]}">${v[1]}</span>` : ""; })()}</div></h2>`
      : `<h2>${esc(S.name || "تأمین‌کننده")}</h2>`;
    const tab = (k, l) => `<button class="${S.tab === k ? "on" : ""}" data-spp-tab="${k}">${l}</button>`;
    const body = S.err ? `<div class="tp-note warn">${esc(S.err)}</div>` : !d ? (TP.ui && TP.ui.loader ? TP.ui.loader("") : "…")
      : S.tab === "ops" ? vOps(d) : S.tab === "rel" ? vRel(d) : S.tab === "graph" ? vGraph() : vInfo(d);
    root.innerHTML = `<div class="spp-scrim" data-spp-close></div><div class="spp-panel"><header>${head}<button class="tp-icon-btn" data-spp-close aria-label="بستن">✕</button></header>
      <nav class="spp-tabs">${tab("info", "👤 پروفایل")}${tab("ops", `💬 نظرها${d ? ` (${fa(d.opinions.filter((o) => !o.hidden).length)})` : ""}`)}${tab("rel", `🔗 روابط${d ? ` (${fa(d.edges.length)})` : ""}`)}${tab("graph", "🕸 کاوش گراف")}</nav>
      <div class="spp-body">${body}</div></div>`;
    const svg = root.querySelector("[data-graph]");
    if (svg && S.g) graph(svg, S.g, { onNode: (sid, name) => open({ sid, name, head: S.head, tab: "graph" }) });
  }

  /* ---------- گراف: چیدمانِ نیرویی (فروچترمن–راینگولد)، بی کتابخانه ---------- */
  function graph(svg, g, opts) {
    css();
    const W = 560, H = 420, N = g.nodes.length;
    if (!N) { svg.outerHTML = `<div class="dim">گره‌ای نیست.</div>`; return; }
    const idx = new Map(g.nodes.map((n, i) => [n.sid, i]));
    const P = g.nodes.map((n, i) => (n.root ? { x: W / 2, y: H / 2 } : { x: W / 2 + 160 * Math.cos((2 * Math.PI * i) / N), y: H / 2 + 140 * Math.sin((2 * Math.PI * i) / N) }));
    const E = g.edges.map((e) => [idx.get(e.a), idx.get(e.b), e]).filter(([a, b]) => a != null && b != null);
    const k = Math.sqrt((W * H) / Math.max(1, N)) * 0.6;
    let temp = W / 8;
    for (let it = 0; it < 220; it++) {
      const disp = P.map(() => ({ x: 0, y: 0 }));
      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
        let dx = P[i].x - P[j].x, dy = P[i].y - P[j].y; const d2 = Math.max(0.01, dx * dx + dy * dy), d = Math.sqrt(d2);
        const f = (k * k) / d; dx /= d; dy /= d;
        disp[i].x += dx * f; disp[i].y += dy * f; disp[j].x -= dx * f; disp[j].y -= dy * f;
      }
      for (const [a, b] of E) {
        let dx = P[a].x - P[b].x, dy = P[a].y - P[b].y; const d = Math.max(0.01, Math.sqrt(dx * dx + dy * dy));
        const f = (d * d) / k; dx /= d; dy /= d;
        disp[a].x -= dx * f; disp[a].y -= dy * f; disp[b].x += dx * f; disp[b].y += dy * f;
      }
      for (let i = 0; i < N; i++) {
        if (g.nodes[i].root) continue;
        const d = Math.max(0.01, Math.hypot(disp[i].x, disp[i].y));
        P[i].x = Math.min(W - 30, Math.max(30, P[i].x + (disp[i].x / d) * Math.min(d, temp)));
        P[i].y = Math.min(H - 24, Math.max(24, P[i].y + (disp[i].y / d) * Math.min(d, temp)));
      }
      temp *= 0.97;
    }
    const sw = (e) => (e.strength === "قوی" ? 3.2 : e.strength === "ضعیف" ? 1.2 : 2);
    const nodeFill = (n) => (n.root ? "#f59e0b" : n.kind === "old" ? "#2f6fe4" : n.kind === "new" ? "#14b8a6" : "#9ca3af");
    const lines = E.map(([a, b, e]) => `<line x1="${P[a].x.toFixed(1)}" y1="${P[a].y.toFixed(1)}" x2="${P[b].x.toFixed(1)}" y2="${P[b].y.toFixed(1)}" stroke="${esc(e.color)}" stroke-width="${sw(e)}" ${e.status === "پیشنهادی" ? 'stroke-dasharray="6 4"' : ""} opacity=".9"><title>${esc(e.fa)} — ${esc(e.status)}</title></line>`).join("");
    const nodes = g.nodes.map((n, i) => `<g><circle cx="${P[i].x.toFixed(1)}" cy="${P[i].y.toFixed(1)}" r="${n.root ? 11 : 8}" fill="${nodeFill(n)}" stroke="#fff" stroke-width="1.5" data-gnode="${esc(n.sid)}" data-gname="${esc(n.name)}"><title>${esc(n.name)}${n.hub ? ` — ${esc(n.hub)}` : ""}</title></circle>
      <text x="${P[i].x.toFixed(1)}" y="${(P[i].y - 13).toFixed(1)}" text-anchor="middle">${esc(String(n.name).slice(0, 22))}</text></g>`).join("");
    svg.innerHTML = lines + nodes;
    svg.querySelectorAll("[data-gnode]").forEach((c) => c.addEventListener("click", () => opts && opts.onNode && opts.onNode(c.dataset.gnode, c.dataset.gname)));
  }

  /* ---------- رفتارها ---------- */
  let qTimer = null;
  async function onClick(e) {
    const t = e.target.closest("[data-spp-close],[data-spp-tab],[data-supp],[data-supp-sid],[data-op-edit],[data-op-hide],[data-edge-ok],[data-edge-no],[data-link-save],[data-gdepth]");
    if (!t) return;
    const d = t.dataset;
    if (d.sppClose !== undefined) return close();
    if (d.sppTab) { S.tab = d.sppTab; draw(); if (S.tab === "graph" && !S.g) loadGraph(); return; }
    if (d.gdepth) { S.gDepth = Number(d.gdepth); return loadGraph(); }
    if (d.suppSid || d.supp !== undefined) { if (t.classList.contains("spp-link")) return open({ sid: d.suppSid || null, name: d.supp || "", head: S.head, tab: "info" }); }
    if (d.opEdit) {
      const o = S.d.opinions.find((x) => String(x.id) === d.opEdit);
      const m = TP.modal("ویرایش نظر", `<textarea class="tp-input" data-op-text style="width:100%;min-height:110px">${esc(o.body)}</textarea>`, async () => {
        try { await C.api(`/sreg/opinions/${o.id}`, { method: "PUT", body: { body: m.querySelector("[data-op-text]").value } }); await load(); } catch (er) { TP.modal("نشد", esc(er.message), null, "باشد", ""); }
      }, "ذخیره");
      return;
    }
    if (d.opHide) {
      const m = TP.modal("پنهان کردن نظر", `<p>نظر حذف نمی‌شود؛ با دلیل پنهان می‌ماند.</p><input class="tp-input" data-op-why placeholder="دلیل" style="width:100%">`, async () => {
        try { await C.api(`/sreg/opinions/${d.opHide}/hide`, { body: { note: m.querySelector("[data-op-why]").value } }); await load(); } catch (er) { TP.modal("نشد", esc(er.message), null, "باشد", ""); }
      }, "پنهان کن");
      return;
    }
    if (d.edgeOk || d.edgeNo) {
      const id = d.edgeOk || d.edgeNo, ok = !!d.edgeOk;
      if (ok) { try { await C.api(`/sreg/edges/${id}/review`, { body: { ok: true } }); await load(); } catch (er) { TP.modal("نشد", esc(er.message), null, "باشد", ""); } return; }
      const m = TP.modal("رد پیوند پیشنهادی", `<p>پیوندِ ردشده دیگر در گزینشِ گیرنده اثر ندارد.</p><input class="tp-input" data-edge-why placeholder="دلیل رد" style="width:100%">`, async () => {
        try { await C.api(`/sreg/edges/${id}/review`, { body: { ok: false, note: m.querySelector("[data-edge-why]").value } }); await load(); } catch (er) { TP.modal("نشد", esc(er.message), null, "باشد", ""); }
      }, "رد کن");
      return;
    }
    if (d.linkSave !== undefined) {
      const nature = root.querySelector("[data-link-nature]").value, note = root.querySelector("[data-link-note]").value;
      try { await C.api("/sreg/links", { body: { sid: S.sid, to: [...S.pick.keys()].map((sid) => ({ sid })), nature, note } }); S.pick = new Map(); S.hits = []; await load(); }
      catch (er) { TP.modal("نشد", esc(er.message), null, "باشد", ""); }
    }
  }
  function onInput(e) {
    const t = e.target;
    if (t.matches("[data-link-q]")) {
      clearTimeout(qTimer);
      const q = t.value.trim();
      qTimer = setTimeout(async () => {
        if (q.length < 2) { S.hits = []; } else { try { S.hits = ((await C.api(`/sreg/search?q=${encodeURIComponent(q)}`)).list || []).filter((h) => h.sid !== S.sid); } catch (_) { S.hits = []; } }
        const keep = root.querySelector("[data-link-q]"), pos = keep ? keep.selectionStart : 0;
        draw();
        const again = root.querySelector("[data-link-q]"); if (again) { again.value = q; again.focus(); try { again.setSelectionRange(pos, pos); } catch (_) { /* بی‌اهمیت */ } }
      }, 260);
    }
  }
  async function onChange(e) {
    const t = e.target;
    if (t.matches("[data-link-pick]")) { if (t.checked) S.pick.set(t.dataset.linkPick, t.dataset.linkName); else S.pick.delete(t.dataset.linkPick); const q = root.querySelector("[data-link-q]"), v = q ? q.value : ""; draw(); const q2 = root.querySelector("[data-link-q]"); if (q2) q2.value = v; return; }
    if (t.name === "voice") { const h = root.querySelector("[data-holder]"); if (h) h.hidden = t.value !== "other"; }
  }
  document.addEventListener("submit", async (e) => {
    const f = e.target;
    if (!root || !root.contains(f) || !f.matches("[data-op-form]")) return;
    e.preventDefault();
    const v = (n) => (f.elements[n] ? f.elements[n].value : "");
    try {
      await C.api("/sreg/opinions", { body: { sid: S.sid, name: S.name, voice: v("voice"), holder: v("holder"), holder_role: v("holder_role"), topic: v("topic"), conf: v("conf"), body: v("body") } });
      await load();
    } catch (er) { TP.modal("ثبت نشد", esc(er.message), null, "باشد", ""); }
  });
  /* هر دکمهٔ 👤 در هر صفحه */
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("button.supp-btn[data-supp]");
    if (!b || (root && root.contains(b))) return;
    e.preventDefault(); e.stopPropagation();
    open({ sid: b.dataset.suppSid || null, name: b.dataset.supp || "", head: b.dataset.suppHead || "" });
  }, true);

  TP.supProfile = { open, close, enabled, btn, graph, css, configure(o) { C = { ...C, ...o }; flagsP = null; } };
})();
