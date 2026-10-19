/* ============================================================
   کشوی «👤 پروفایل تأمین‌کننده» و «🕸 کاوش گراف» — فاز ۱ طرح «پیام اول، استراتژی‌ها، پروفایل و گراف» (مهر ۱۴۰۵)
   داده: worker/sreg.js (مسیرهای /sreg/*). هر صفحه‌ای که نامِ تأمین‌کننده را نشان می‌دهد فقط این را صدا می‌زند:
     TP.supProfile.open({ sid, name, head, tab })    — کشو را باز می‌کند (پروفایل، نظرها، روابط، گراف) و مسیرِ برگشت را از نو
     TP.supProfile.enabled()                         — Promise<boolean>: کلیدِ «دفتر تأمین‌کنندگان» در پنل پشتیبانی روشن است؟
     TP.supProfile.btn(name, extra)                  — دکمهٔ کوچکِ 👤 با data-supp (شنونده‌اش را همین فایل می‌گذارد)
     TP.supProfile.configure({ api, onEdit })        — پنل پشتیبانی api با نشانهٔ ورود خودش را می‌دهد، و onEdit({sn, name, sid}) برای
                                                       دکمهٔ «🏷 ویرایشِ رده و مشخصات» (فقط همان‌جا؛ cr-admin.js)
     TP.supProfile.refresh()                         — کشوِ باز دوباره خوانده می‌شود (بعد از ذخیرهٔ همان ویرایش)
     TP.supProfile.graph(svg, data, { onNode })      — رسمِ گراف به اندازهٔ ظرف: با گرهِ root شعاعی، بی آن (نمای کاملِ پشتیبانی) نیرویی
     TP.supProfile.legend(data)                      — راهنمای رنگِ خط‌ها و گره‌ها
     TP.supProfile.lib                               — تابع‌های خالص (فرمِ پیوند، چیدمان) برای آزمون‌ها (tests/sup-profile.test.mjs)
   درونِ کشو فقط یک لایه است: زدنِ گره کارتِ کوچکی می‌دهد («👤 پروفایل» / «🎯 مرکز») و رفتن به تأمین‌کنندهٔ دیگر مسیرِ برگشت (↩) می‌سازد —
   نه کشوِ تازه روی کشو و نه گراف روی گراف.
   نظرها فقط برای کارکنان است؛ کارشناس هوشمند فقط نظرهای همان تأمین‌کننده را، در بخشِ محرمانه، برای سنجیدن می‌بیند و هرگز بازگو نمی‌کند.
   «ردهٔ سوابق» ردهٔ مؤثرِ سوابقِ خرید است (با «(تغییر پشتیبانی)» وقتی پشتیبانی عوضش کرده — «🏷 تأمین‌کنندگان»)؛ «ردهٔ تحقیق» جداست.
   ============================================================ */
(function () {
  "use strict";
  const TP = window.TP;
  if (!TP) return;
  const esc = TP.esc;
  const fa = (x) => (TP.ui && TP.ui.fa ? TP.ui.fa(x) : String(x == null ? "" : x).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[+d]));
  let C = { api: (p, o) => TP.api(p, o) };
  let flagsP = null;
  const S = { sid: null, name: "", head: "", tab: "info", d: null, err: "", loading: false, g: null, gL: null, gDepth: 2, gErr: "", gSel: null, seq: 0, gSeq: 0, trail: [], lf: null };
  const VER_FA = { 2: ["ok", "✔ همهٔ دروازه‌ها"], 1: ["info", "هویت قابل احراز"], 0: ["warn", "هنوز راستی‌آزمایی نشده"], "-1": ["bad", "رد در دروازه"] };
  const KIND_FA = { old: "از سوابق خرید", new: "کشف‌شده", loc: "فقط در سامانه" };
  /* ردهٔ سوابق (A/B/C با تغییرِ پشتیبانی — worker/supplier-over.js)؛ جدا از «ردهٔ تحقیق» */
  const GRADE_TONE = { A: "ok", B: "info", C: "warn" };
  const gradeChip = (g) => `<span class="chip ${GRADE_TONE[g && g.grade] || ""}">${esc((g && g.grade) || "بی‌رده")}</span>`;
  const bySup = (on) => (on ? ` <span class="dim" style="font-size:.76rem">(پشتیبانی)</span>` : "");
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
.spp-hd { flex: 1; min-width: 0; }
.spp-panel > header h2 { margin: 0; font-size: 1.1rem; line-height: 1.6; }
.spp-panel > header .sub { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; font-size: .8rem; }
.spp-trail { display: flex; align-items: center; gap: 4px 6px; flex-wrap: wrap; font-size: .8rem; color: var(--tp-muted); margin-bottom: 4px; }
.spp-trail b { color: var(--tp-fg); font-weight: 700; }
.spp-back { border: 1px solid var(--tp-line); background: transparent; color: inherit; border-radius: 999px; padding: 0 9px; font: inherit; line-height: 1.8; cursor: pointer; }
.spp-back:hover { border-color: var(--tp-accent); color: var(--tp-accent); }
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
.spp-edge .nat, .spp-gcard .nat { display: inline-flex; align-items: center; gap: 4px; font-weight: 700; font-size: .8rem; }
.spp-edge .nat i, .spp-gcard .nat i { width: 18px; height: 3px; border-radius: 2px; display: inline-block; }
.spp-edge .nat i.dash, .spp-gcard .nat i.dash { background: repeating-linear-gradient(90deg, var(--c) 0 4px, transparent 4px 7px) !important; }
.spp-edge .ev { font-size: .78rem; color: var(--tp-muted); flex-basis: 100%; }
.spp-link { background: none; border: 0; padding: 0; font: inherit; color: var(--tp-accent); cursor: pointer; text-align: start; }
.spp-hits { max-height: 180px; overflow: auto; display: flex; flex-direction: column; gap: 2px; }
.spp-hits label { display: flex; gap: 8px; align-items: center; font-size: .88rem; padding: 2px 4px; border-radius: 8px; }
.spp-hits label:hover { background: rgba(79, 140, 255, 0.08); }
.spp-empty { font-size: .86rem; color: var(--tp-muted); padding: 2px 4px; }
.spp-hint { font-size: .8rem; color: var(--tp-muted); }
.spp-picks { display: flex; gap: 6px; flex-wrap: wrap; }
.spp-pick { display: inline-flex; align-items: center; gap: 2px; border: 1px solid var(--tp-accent, #4f8cff); border-radius: 999px; padding: 0 10px 0 2px; font-size: .84rem; line-height: 1.9; }
.spp-pick button { border: 0; background: transparent; color: var(--tp-muted); cursor: pointer; font: inherit; padding: 0 6px; }
.spp-legend { display: flex; gap: 6px 10px; flex-wrap: wrap; align-items: center; font-size: .78rem; margin: 6px 0; }
.spp-legend span { display: inline-flex; gap: 5px; align-items: center; }
.spp-legend i { width: 20px; height: 3px; border-radius: 2px; display: inline-block; }
.spp-legend i.dash { background: repeating-linear-gradient(90deg, var(--tp-muted, #9ca3af) 0 4px, transparent 4px 7px); }
.spp-legend b.dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.spp-gtool { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 6px; font-size: .8rem; }
.spp-gwrap { position: relative; }
.spp-graph { display: block; width: 100%; height: auto; border: 1px solid var(--tp-line); border-radius: 14px; background: rgba(3, 8, 20, 0.18); direction: rtl; }
:root[data-theme="light"] .spp-graph { background: rgba(255, 255, 255, 0.6); }
.spp-graph text { font-family: Vazirmatn, system-ui, sans-serif; fill: var(--tp-fg); paint-order: stroke; stroke: var(--ui-thick, #0f1a36); stroke-width: 3px; stroke-linejoin: round; }
:root[data-theme="light"] .spp-graph text { stroke: #fff; }
.spp-graph .gn { cursor: pointer; outline: none; }
.spp-graph .gn .hit { fill: transparent; }
.spp-graph .gn .dot { stroke: rgba(255, 255, 255, 0.9); stroke-width: 1.5; }
.spp-graph .gn .halo { fill: none; stroke: #f59e0b; stroke-width: 2.5; }
.spp-graph .gn:hover .dot, .spp-graph .gn:focus-visible .dot, .spp-graph .gn.sel .dot { stroke: var(--tp-accent, #4f8cff); stroke-width: 3; }
.spp-graph .gl.hide { visibility: hidden; }
.spp-graph .gn:hover .gl, .spp-graph .gn:focus-visible .gl, .spp-graph .gn.sel .gl { visibility: visible; font-weight: 700; }
.spp-graph .gmore { cursor: pointer; }
.spp-graph .gmore rect { fill: var(--ui-thick, #0f1a36); stroke: var(--tp-muted, #9fb2d8); }
:root[data-theme="light"] .spp-graph .gmore rect { fill: #fff; }
.spp-graph .gmore text { fill: var(--tp-muted, #9fb2d8); stroke: none; font-weight: 700; }
.spp-gcard { margin-top: 8px; border: 1px solid var(--tp-line); border-radius: 14px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; background: rgba(79, 140, 255, 0.06); }
.spp-gcard:empty { display: none; }
.spp-gcard .hd { display: flex; align-items: flex-start; gap: 8px; }
.spp-gcard .hd b { flex: 1; line-height: 1.7; }
.spp-gcard .row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
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

  /* ---------- فرمِ «🔗 پیوند تازه»: وضعیتِ خالص ----------
     پیش‌تر هر پاسخِ جست‌وجو کلِ کشو را از نو می‌ساخت و متنِ کادر را با نسخهٔ trim‌شده جایگزین می‌کرد: فاصلهٔ آخر می‌پرید («آهن آلات» ←
     «آهنآلات»، پس چیزی پیدا نمی‌شد و «ثبت پیوند» خاموش می‌ماند)، و هر تیک نوعِ رابطه و یادداشت را به پیش‌فرض برمی‌گرداند. حالا همه در
     S.lf می‌ماند و فقط فهرستِ یافته‌ها و دکمه دوباره رسم می‌شوند — کادرِ جست‌وجو هرگز (فوکوس و صفحه‌کلیدِ گوشی می‌ماند). */
  const nk = (s) => String(s == null ? "" : s).replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/[\s‌‎‏]+/g, " ").trim()
    .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).toLowerCase();
  const hitKey = (h) => h.sid || `n:${nk(h.name)}`;
  const lfInit = () => ({ q: "", nature: "", note: "", picks: [], hits: null, hq: "", err: "", busy: false, saving: false, seq: 0 });
  function lfReduce(s, a) {
    switch (a.type) {
      case "q": return { ...s, q: String(a.value == null ? "" : a.value) };       /* خام، با همان فاصلهٔ آخر */
      case "nature": return { ...s, nature: String(a.value || "") };
      case "note": return { ...s, note: String(a.value == null ? "" : a.value) };
      case "ask": return { ...s, seq: s.seq + 1, busy: true };                    /* جست‌وجوی تازه؛ پاسخِ قبلی دیگر پذیرفته نمی‌شود */
      case "clear": return { ...s, seq: s.seq + 1, busy: false, hits: null, hq: "", err: "" };
      case "hits": return a.seq !== s.seq ? s : { ...s, busy: false, hits: Array.isArray(a.list) ? a.list : [], hq: String(a.q || ""), err: a.err || "" };
      case "pick": {
        const key = hitKey(a.hit), on = a.on == null ? !s.picks.some((p) => p.key === key) : !!a.on, rest = s.picks.filter((p) => p.key !== key);
        return { ...s, picks: on ? [...rest, { key, sid: a.hit.sid || null, name: String(a.hit.name || ""), sys: !!a.hit.sys, free: false }] : rest };
      }
      case "free": {   /* نامی که در دفتر نیست: با نام می‌رود و سرور ردیفِ «L:» می‌سازد */
        const name = String(a.name != null ? a.name : s.q).trim().replace(/\s+/g, " "), key = `n:${nk(name)}`;
        if (nk(name).length < 2 || s.picks.some((p) => p.key === key)) return s;
        return { ...s, picks: [...s.picks, { key, sid: null, name, sys: false, free: true }] };
      }
      case "unpick": return { ...s, picks: s.picks.filter((p) => p.key !== a.key) };
      case "saving": return { ...s, saving: !!a.on };
      case "saved": return { ...lfInit(), nature: s.nature, seq: s.seq + 1 };
      default: return s;
    }
  }
  /** بدنهٔ POST /sreg/links: نامِ نمایشیِ خودش کنارِ sid (برای «L:» بی ردیف، تا کلیدِ نرمال جای نام ننشیند)؛ تازه و «در سامانه» فقط با نام */
  const linkBody = (s, me) => ({ sid: me.sid, name: me.name, nature: s.nature, note: s.note.trim(),
    to: s.picks.map((p) => (p.sid ? { sid: p.sid, name: p.name } : { name: p.name })) });
  function vLinkForm(s, natures) {
    return `<div class="spp-sec"><h4>🔗 پیوند تازه</h4><div class="spp-form">
        <input class="tp-input" data-link-q value="${esc(s.q)}" placeholder="نام تأمین‌کنندهٔ دیگر — هر واژه‌ای از نامش" autocomplete="off" enterkeyhint="search" aria-label="جست‌وجوی تأمین‌کننده">
        <div data-link-box>${vLinkBox(s)}</div>
        <div class="row"><select class="tp-input" data-link-nature aria-label="نوع رابطه">${(natures || []).map((n) => `<option value="${esc(n.key)}"${n.key === s.nature ? " selected" : ""}>${esc(n.fa)}</option>`).join("")}</select>
          <input class="tp-input" data-link-note value="${esc(s.note)}" placeholder="یادداشت (اختیاری)" maxlength="300" style="flex:1;min-width:140px"></div>
        <div class="row" data-link-act>${vLinkAct(s)}</div></div></div>`;
  }
  /** فهرستِ یافته‌ها، «پیدا نشد» با افزودنِ نامِ تازه، و انتخاب‌شده‌ها — همین و دکمه با هر پاسخ دوباره رسم می‌شوند، نه کادرِ جست‌وجو */
  function vLinkBox(s) {
    const q = s.q.trim().replace(/\s+/g, " "), qk = nk(q);
    let out = "";
    if (s.err) out = `<div class="tp-note warn">جست‌وجو نشد: ${esc(s.err)}</div>`;
    else if (s.hits && s.hits.length) out = `<div class="spp-hits" role="group" aria-label="یافته‌ها">${s.hits.map((h) => { const k = hitKey(h);
      return `<label><input type="checkbox" data-link-pick="${esc(k)}"${s.picks.some((p) => p.key === k) ? " checked" : ""}> <span>${esc(h.name)}</span>${h.sys ? ` <span class="chip">در سامانه</span>` : ""} <span class="dim" style="font-size:.78rem">${esc(h.hub || h.city || "")}</span></label>`; }).join("")}</div>`;
    else if (s.hits && nk(s.hq).length >= 2) out = `<div class="spp-empty">پیدا نشد.</div>`;
    else if (s.busy) out = `<div class="spp-hint">در جست‌وجو…</div>`;
    /* نامی که عیناً در یافته‌ها نیست: «تأمین‌کنندهٔ تازه» (فقط وقتی پاسخِ همین متن رسیده، تا دکمه با متنِ کهنه نیاید) */
    if (s.hits && !s.busy && !s.err && qk.length >= 2 && nk(s.hq) === qk && !s.hits.some((h) => nk(h.name) === qk) && !s.picks.some((p) => p.key === `n:${qk}`))
      out += `<button type="button" class="tp-btn sm" data-link-free="${esc(q)}">＋ «${esc(q)}» تأمین‌کنندهٔ تازه</button>`;
    if (s.picks.length) out += `<div class="spp-picks" aria-label="انتخاب‌شده">${s.picks.map((p) => `<span class="spp-pick">${esc(p.name)}${p.free ? ` <span class="dim">(تازه)</span>` : ""}<button type="button" data-link-unpick="${esc(p.key)}" aria-label="برداشتنِ ${esc(p.name)}">✕</button></span>`).join("")}</div>`;
    return out;
  }
  function vLinkAct(s) {
    const n = s.picks.length;
    return `<button type="button" class="tp-btn primary sm" data-link-save${n && !s.saving ? "" : " disabled"}>${s.saving ? "در ثبت…" : `ثبت پیوند${n > 1 ? ` (${fa(n)})` : ""}`}</button>${n ? "" : `<span class="spp-hint">نامی را جست‌وجو و تیک بزنید، یا اگر پیدا نشد «تأمین‌کنندهٔ تازه» را بزنید.</span>`}`;
  }

  /* ---------- گراف: چیدمانِ قطعی و برچسب‌های بیرونِ گره ---------- */
  const KIND = { old: ["#2f6fe4", "سوابق"], new: ["#14b8a6", "کشف‌شده"], loc: ["#9ca3af", "سامانه"] };
  const kindOf = (n) => (n && (n.kind === "old" || n.kind === "new") ? n.kind : "loc");
  const CONFIRMED = "تأییدشده", PROPOSED = "پیشنهادی", STR = { "قوی": 0, "متوسط": 1, "ضعیف": 2 };
  /** اولویتِ یال: تأییدشده پیش از پیشنهادی، بعد قوت (پیوندِ کارشناس شدت ندارد ← متوسط) */
  const edgeRank = (e) => (e && e.status === CONFIRMED ? 0 : 10) + (e && e.strength in STR ? STR[e.strength] : 1);
  const edgeW = (e) => (e.strength === "قوی" ? 3.4 : e.strength === "ضعیف" ? 1.3 : 2.2);
  const CW = 0.58;                                       /* عرضِ میانگینِ هر نویسه به اندازهٔ قلم (Vazirmatn، کمی بیشتر برای اطمینان) */
  const estW = (s, fs) => String(s).length * fs * CW + 2;
  /** کوتاه کردن در مرزِ واژه با «…» (حداکثر max نویسه با خودِ «…»)؛ واژهٔ تنهای بلند از وسط بریده می‌شود */
  function cut(s, max) {
    s = String(s == null ? "" : s).trim().replace(/\s+/g, " ");
    if (s.length <= max) return s;
    const head = s.slice(0, Math.max(1, max - 1)), sp = head.lastIndexOf(" ");
    return `${(sp >= Math.max(2, Math.floor(max * 0.4)) ? head.slice(0, sp) : head).replace(/[\s،,.:\-–—]+$/, "")}…`;
  }
  /** نامی که در px جا شود؛ کمتر از چهار نویسه و «…» به کار نمی‌آید ← هیچ */
  const fitTo = (s, px, fs) => { s = String(s == null ? "" : s).trim(); const n = Math.floor((px - 2) / (fs * CW)); return n >= s.length ? s : n < 5 ? "" : cut(s, n); };

  /**
   * برچسبِ هر گره بیرونِ دایره‌اش: اول سمتِ بیرون (راست یا چپ)، بعد زیر یا بالا (وسط، یا کشیده به یک سو)، اول با نامِ بلندتر و بعد
   * کوتاه‌تر — نخستین جایی که در قاب جا شود و روی گره، نشان یا برچسبِ دیگری نیفتد؛ وگرنه پنهان (با زدن، نگه داشتنِ موشواره یا فوکوس پیدا
   * می‌شود). order: به ترتیبِ اولویت؛ مرکز همیشه دیده می‌شود.
   * گراف direction=rtl دارد: «end» یعنی پایانِ متن (لبهٔ چپش) روی x و متن به راست می‌رود؛ «start» یعنی آغاز (لبهٔ راست) روی x و متن به چپ.
   */
  function placeLabels(L, order) {
    const pad = 4, gap = 2, placed = [];
    const hit = (a, b) => a[0] < b[2] + gap && b[0] < a[2] + gap && a[1] < b[3] + gap && b[1] < a[3] + gap;
    const inside = (b) => b[0] >= pad && b[1] >= pad && b[2] <= L.W - pad && b[3] <= L.H - pad;
    const obst = L.nodes.map((n) => ({ n, b: [n.x - n.r - 1, n.y - n.r - 1, n.x + n.r + 1, n.y + n.r + 1] }))
      .concat(L.chips.map((c) => ({ n: null, b: [c.x, c.y, c.x + c.w, c.y + c.h] })));
    for (const n of order) {
      const fs = n.fs, full = n.ring === 0 ? L.W * 0.5 : n.ring === 2 ? Math.min(130, L.W * 0.26) : Math.min(160, L.W * 0.3);
      const side = (dir, mw) => {
        const x0 = n.x + dir * (n.r + 5), t = fitTo(n.name, Math.min(mw, dir > 0 ? L.W - pad - x0 : x0 - pad), fs);
        if (!t) return [];
        const w = estW(t, fs);
        return [{ t, x: x0, y: n.y + fs * 0.35, anchor: dir > 0 ? "end" : "start", box: dir > 0 ? [x0, n.y - fs * 0.85, x0 + w, n.y + fs * 0.5] : [x0 - w, n.y - fs * 0.85, x0, n.y + fs * 0.5] }];
      };
      const vert = (dir, mw) => {
        const t = fitTo(n.name, Math.min(mw, L.W - 2 * pad), fs);
        if (!t) return [];
        const w = estW(t, fs), y = dir > 0 ? n.y + n.r + 3 + fs * 0.85 : n.y - n.r - 4 - fs * 0.4;
        /* وسط، یا کشیده به سمتِ بیرون، یا به سمتِ دیگر — هر سه بیرونِ گره‌اند (زیر یا بالایش) */
        const xs = [n.x, n.x + (n.ux >= 0 ? 1 : -1) * (w / 2 - n.r), n.x - (n.ux >= 0 ? 1 : -1) * (w / 2 - n.r)];
        return xs.map((cx0) => { const x = Math.min(L.W - pad - w / 2, Math.max(pad + w / 2, cx0)); return { t, x, y, anchor: "middle", box: [x - w / 2, y - fs * 0.85, x + w / 2, y + fs * 0.4] }; });
      };
      const h = n.ux >= 0 ? 1 : -1, v = n.uy >= 0 ? 1 : -1, cands = [], whole = String(n.name).trim();
      for (const mw of [full, Math.max(48, full * 0.55)]) cands.push(...(Math.abs(n.ux) >= 0.38 ? [...side(h, mw), ...vert(v, mw), ...vert(-v, mw)] : [...vert(v, mw), ...side(h, mw), ...side(-h, mw)]));
      cands.sort((a, b) => (a.t !== whole) - (b.t !== whole));   /* نامِ کامل در جای دوم بهتر از نامِ بریده در جای اول (sort پایدار است) */
      const free = (c) => inside(c.box) && !obst.some((o) => o.n !== n && hit(o.b, c.box)) && !placed.some((b) => hit(b, c.box));
      const ok = cands.find(free) || (n.ring === 0 ? cands.find((c) => inside(c.box)) : null);
      n.label = ok ? { ...ok, hide: false } : cands[0] ? { ...cands[0], hide: true } : null;
      if (ok) placed.push(ok.box);
    }
  }

  /**
   * چیدمانِ شعاعیِ گرافِ یک تأمین‌کننده (قطعی، بی تصادف): مرکز خودش؛ حلقهٔ ۱ همسایه‌های مستقیم به تفکیکِ نوعِ رابطه (حداکثر ۱۲: تأییدشده
   * پیش از پیشنهادی، بعد قوت)؛ حلقهٔ ۲ همسایه‌های دو قدمی درونِ بخشِ والدشان (حداکثر ۳ برای هر والد و ۲۴ روی هم). مازادِ حلقهٔ ۱ یک «+k»
   * در گوشه و مازادِ هر والد «+k» کنارِ خودش. پیش‌تر چیدمانِ نیرویی هر دو قدم را درهم می‌ریخت و برچسب‌ها روی هم می‌افتادند.
   * o.total1: شمارِ همهٔ همسایه‌های مستقیم از پروفایل (گراف سقفِ ۶۰ گره دارد)
   */
  function radial(g, W, H, o) {
    o = o || {};
    const by = new Map(g.nodes.map((n) => [n.sid, n]));
    const F = g.nodes.find((n) => n.root) || g.nodes[0];
    const natI = (k) => { const i = (g.natures || []).findIndex((n) => n.key === k); return i < 0 ? 99 : i; };
    const nm = (sid) => String((by.get(sid) || {}).name || sid);
    const byName = (a, b) => nm(a).localeCompare(nm(b), "fa");
    /* یال‌های هر جفت (بهترین اول) و همسایگی */
    const pairs = new Map(), adj = new Map();
    const pk = (x, y) => (x < y ? `${x}\n${y}` : `${y}\n${x}`);
    for (const e of g.edges || []) {
      if (e.a === e.b || !by.has(e.a) || !by.has(e.b)) continue;
      if (!pairs.has(pk(e.a, e.b))) pairs.set(pk(e.a, e.b), []);
      pairs.get(pk(e.a, e.b)).push(e);
      for (const [x, y] of [[e.a, e.b], [e.b, e.a]]) { if (!adj.has(x)) adj.set(x, new Set()); adj.get(x).add(y); }
    }
    for (const list of pairs.values()) list.sort((a, b) => edgeRank(a) - edgeRank(b) || natI(a.nature) - natI(b.nature));
    const best = (x, y) => (pairs.get(pk(x, y)) || [])[0];
    /* حلقهٔ ۱ */
    const all1 = [...(adj.get(F.sid) || [])].map((sid) => ({ sid, e: best(F.sid, sid) })).sort((a, b) => edgeRank(a.e) - edgeRank(b.e) || byName(a.sid, b.sid));
    const prio1 = all1.slice(0, 12);
    const more1 = Math.max(all1.length, o.total1 || 0) - prio1.length;
    const ring1 = prio1.slice().sort((a, b) => natI(a.e.nature) - natI(b.e.nature));   /* پایدار: درونِ هر گروه همان اولویت */
    const groups = [];
    for (const x of ring1) { const last = groups[groups.length - 1]; if (last && last.k === x.e.nature) last.n++; else groups.push({ k: x.e.nature, n: 1 }); }
    const gapU = groups.length > 1 ? 0.6 : 0, step = ring1.length ? (2 * Math.PI) / (ring1.length + gapU * groups.length) : 0;
    let u = 0, gi = 0, inG = 0;
    for (const x of ring1) { x.a = -Math.PI / 2 + (u + 0.5) * step; u++; if (++inG === groups[gi].n) { u += gapU; gi++; inG = 0; } }
    if (ring1.length === 1) ring1[0].a = 0;   /* تنها همسایه کنارِ مرکز، نه زیرِ نامش */
    /* حلقهٔ ۲: هر همسایهٔ دو قدمی زیرِ والدی که پیوندش با او بهتر است */
    const shown = new Set([F.sid, ...ring1.map((x) => x.sid)]), best2 = new Map();
    prio1.forEach((p, pi) => {
      for (const c of adj.get(p.sid) || []) {
        if (shown.has(c)) continue;
        const r = edgeRank(best(p.sid, c)), cur = best2.get(c);
        if (!cur || r < cur.r || (r === cur.r && pi < cur.pi)) best2.set(c, { sid: c, p: p.sid, r, pi });
      }
    });
    const kids = new Map(prio1.map((p) => [p.sid, []]));
    for (const c of best2.values()) kids.get(c.p).push(c);
    const more2 = new Map();
    let n2 = 0;
    for (const p of prio1) {
      const ks = kids.get(p.sid).sort((a, b) => a.r - b.r || byName(a.sid, b.sid)), take = Math.max(0, Math.min(3, ks.length, 24 - n2));
      kids.set(p.sid, ks.slice(0, take)); n2 += take;
      if (ks.length > take) more2.set(p.sid, ks.length - take);
    }
    /* هندسه: بیضیِ بیرونی جای برچسب‌های کناری را در قاب نگه می‌دارد؛ بی حلقهٔ ۲ حلقهٔ ۱ همان‌جا می‌نشیند */
    const cx = W / 2, cy = H / 2, lab = Math.min(150, Math.max(64, W * 0.2));
    const rxO = Math.max(70, cx - lab - 14), ryO = Math.max(70, cy - 30);
    const [rx1, ry1] = n2 ? [rxO * 0.56, ryO * 0.56] : [rxO * 0.92, ryO * 0.74];
    const node = (sid, ring, a, rx, ry, extra) => {
      const m = by.get(sid) || {};
      return { sid, name: nm(sid), kind: kindOf(m), hub: m.hub || m.city || "", ring, a, x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a), ux: Math.cos(a), uy: Math.sin(a),
        r: ring === 0 ? 15 : ring === 1 ? 9 : 6.5, fs: ring === 0 ? 13 : ring === 1 ? 12 : 11, ...extra };
    };
    const N = [node(F.sid, 0, Math.PI / 2, 0, 0, { prio: -1, via: null })];
    for (const x of ring1) N.push(node(x.sid, 1, x.a, rx1, ry1, { prio: prio1.indexOf(x), via: F.sid }));
    const sp = Math.min(step / 3, 0.42);
    for (const p of ring1) {
      const ks = kids.get(p.sid), pp = prio1.indexOf(p);
      ks.forEach((c, j) => N.push(node(c.sid, 2, p.a + (j - (ks.length - 1) / 2) * sp, rxO, ryO, { prio: 100 + pp * 3 + j, via: p.sid })));
    }
    const at = new Map(N.map((n) => [n.sid, n]));
    /* نشانِ «+k» */
    const chips = [];
    if (more1 > 0) { const t = `+${fa(more1)}`, w = estW(t, 12) + 14; chips.push({ sid: "", k: more1, t, x: 6, y: H - 6 - 22, w, h: 22, fs: 12, title: `${fa(more1)} همسایهٔ مستقیمِ دیگر — فهرستِ کامل در «🔗 روابط»` }); }
    for (const [sid, k] of more2) {
      const p = at.get(sid), t = `+${fa(k)}`, w = estW(t, 11) + 10, h = 17;
      const x = Math.min(W - 4 - w, Math.max(4, p.ux >= 0 ? p.x + p.r - 3 : p.x - p.r + 3 - w)), y = Math.max(4, p.y - p.r - h - 1);
      chips.push({ sid, k, t, x, y, w, h, fs: 11, title: `${fa(k)} پیوندِ دیگرِ ${nm(sid)} — در «🔗 روابط»ِ خودش` });
    }
    /* یال‌ها: پره‌های مرکز و والد⇠فرزند پررنگ، بقیهٔ پیوندهای میانِ گره‌های دیده‌شده کم‌رنگ؛ چند نوعِ رابطه میانِ یک جفت کنارِ هم */
    const E = [];
    for (const [key, list] of pairs) {
      const [x, y] = key.split("\n"), A = at.get(x), B = at.get(y);
      if (!A || !B) continue;
      const main = A.ring === 0 || B.ring === 0 || A.via === B.sid || B.via === A.sid;
      const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
      list.slice(0, 3).forEach((e, i, arr) => {
        const off = (i - (arr.length - 1) / 2) * 3.2;
        E.push({ a: x, b: y, x1: A.x + nx * off, y1: A.y + ny * off, x2: B.x + nx * off, y2: B.y + ny * off, color: e.color || "#6b7280", w: edgeW(e), dash: e.status === PROPOSED,
          op: main ? 0.9 : 0.35, title: `${e.fa || e.nature_fa || e.nature} — ${e.status || ""}` });
      });
    }
    const L = { W, H, cx, cy, focal: F.sid, nodes: N, edges: E, chips, more1, step, sp };
    placeLabels(L, N.slice().sort((a, b) => a.prio - b.prio));
    return L;
  }

  /** نمای کاملِ پشتیبانی (بی مرکز): همان چیدمانِ نیرویی (فروچترمن–راینگولد، بی کتابخانه) در قابِ ظرف، با برچسب‌گذاریِ مشترک */
  function force(g, W, H) {
    const N0 = g.nodes.length, idx = new Map(g.nodes.map((n, i) => [n.sid, i]));
    const P = g.nodes.map((n, i) => ({ x: W / 2 + W * 0.3 * Math.cos((2 * Math.PI * i) / N0), y: H / 2 + H * 0.3 * Math.sin((2 * Math.PI * i) / N0) }));
    const E0 = (g.edges || []).map((e) => [idx.get(e.a), idx.get(e.b), e]).filter(([a, b]) => a != null && b != null && a !== b);
    const k = Math.sqrt((W * H) / Math.max(1, N0)) * 0.6;
    let temp = W / 8;
    for (let it = 0; it < 220; it++) {
      const disp = P.map(() => ({ x: 0, y: 0 }));
      for (let i = 0; i < N0; i++) for (let j = i + 1; j < N0; j++) {
        let dx = P[i].x - P[j].x, dy = P[i].y - P[j].y; const d = Math.sqrt(Math.max(0.01, dx * dx + dy * dy)), f = (k * k) / d;
        dx /= d; dy /= d; disp[i].x += dx * f; disp[i].y += dy * f; disp[j].x -= dx * f; disp[j].y -= dy * f;
      }
      for (const [a, b] of E0) {
        let dx = P[a].x - P[b].x, dy = P[a].y - P[b].y; const d = Math.max(0.01, Math.sqrt(dx * dx + dy * dy)), f = (d * d) / k;
        dx /= d; dy /= d; disp[a].x -= dx * f; disp[a].y -= dy * f; disp[b].x += dx * f; disp[b].y += dy * f;
      }
      for (let i = 0; i < N0; i++) {
        const d = Math.max(0.01, Math.hypot(disp[i].x, disp[i].y));
        P[i].x = Math.min(W - 30, Math.max(30, P[i].x + (disp[i].x / d) * Math.min(d, temp)));
        P[i].y = Math.min(H - 24, Math.max(24, P[i].y + (disp[i].y / d) * Math.min(d, temp)));
      }
      temp *= 0.97;
    }
    const deg = new Map();
    for (const [a, b] of E0) { deg.set(a, (deg.get(a) || 0) + 1); deg.set(b, (deg.get(b) || 0) + 1); }
    const N = g.nodes.map((n, i) => { const dx = P[i].x - W / 2, dy = P[i].y - H / 2, d = Math.hypot(dx, dy) || 1;
      return { sid: n.sid, name: String(n.name || n.sid), kind: kindOf(n), hub: n.hub || "", ring: 1, x: P[i].x, y: P[i].y, ux: dx / d, uy: dy / d, r: 7, fs: 11, prio: -(deg.get(i) || 0), via: null }; });
    const E = E0.map(([a, b, e]) => ({ a: g.nodes[a].sid, b: g.nodes[b].sid, x1: P[a].x, y1: P[a].y, x2: P[b].x, y2: P[b].y, color: e.color || "#6b7280", w: edgeW(e), dash: e.status === PROPOSED, op: 0.85,
      title: `${e.fa || e.nature} — ${e.status || ""}` }));
    const L = { W, H, cx: W / 2, cy: H / 2, focal: null, nodes: N, edges: E, chips: [], more1: 0 };
    placeLabels(L, N.slice().sort((a, b) => a.prio - b.prio || a.name.localeCompare(b.name, "fa")));
    return L;
  }

  /** نشانه‌گذاریِ درونِ svg از روی چیدمان (پیش‌تر برچسبِ ۱۱ نقطه‌ای وسطِ گره و برش در ۲۲ نویسه) */
  function paint(L, sel) {
    const f = (v) => Math.round(v * 10) / 10;
    const lines = L.edges.slice().sort((a, b) => a.op - b.op).map((e) => `<line x1="${f(e.x1)}" y1="${f(e.y1)}" x2="${f(e.x2)}" y2="${f(e.y2)}" stroke="${esc(e.color)}" stroke-width="${e.w}"${e.dash ? ' stroke-dasharray="6 4"' : ""} stroke-linecap="round" opacity="${e.op}"><title>${esc(e.title)}</title></line>`).join("");
    const nodes = L.nodes.map((n) => {
      const lb = n.label;
      return `<g class="gn r${n.ring}${n.sid === sel ? " sel" : ""}" data-gnode="${esc(n.sid)}" data-gname="${esc(n.name)}" tabindex="0" role="button" aria-label="${esc(n.name)}"><title>${esc(n.name)}${n.hub ? ` — ${esc(n.hub)}` : ""}</title>`
        + `<circle class="hit" cx="${f(n.x)}" cy="${f(n.y)}" r="${Math.max(14, n.r + 6)}"/>${n.ring === 0 ? `<circle class="halo" cx="${f(n.x)}" cy="${f(n.y)}" r="${n.r + 4}"/>` : ""}`
        + `<circle class="dot" cx="${f(n.x)}" cy="${f(n.y)}" r="${n.r}" fill="${KIND[n.kind][0]}"/>`
        + (lb ? `<text class="gl${lb.hide ? " hide" : ""}" x="${f(lb.x)}" y="${f(lb.y)}" text-anchor="${lb.anchor}" font-size="${n.fs}"${n.ring === 0 ? ' font-weight="800"' : ""}>${esc(lb.t)}</text>` : "") + `</g>`;
    }).join("");
    const chips = L.chips.map((c) => `<g class="gmore" data-gmore="${esc(c.sid)}" tabindex="0" role="button" aria-label="${esc(c.title)}"><title>${esc(c.title)}</title><rect x="${f(c.x)}" y="${f(c.y)}" width="${f(c.w)}" height="${c.h}" rx="${c.h / 2}"/>`
      + `<text x="${f(c.x + c.w / 2)}" y="${f(c.y + c.h / 2 + c.fs * 0.36)}" text-anchor="middle" font-size="${c.fs}">${esc(c.t)}</text></g>`).join("");
    return `<g class="ge">${lines}</g>${nodes}${chips}`;
  }

  /** رسم در svg به اندازهٔ ظرف (یک واحد = یک پیکسل، پس متن دست‌کم ۱۱ پیکسل می‌ماند؛ پیش‌تر ۵۶۰ واحد روی گوشی تا ~۶٫۷ پیکسل کوچک می‌شد) */
  function graph(svg, g, opts) {
    css();
    const o = opts || {};
    if (!g || !g.nodes || !g.nodes.length) { svg.outerHTML = `<div class="dim">گره‌ای نیست.</div>`; return null; }
    const host = svg.parentElement;
    const W = Math.round(Math.min(1200, Math.max(300, (host && host.clientWidth) || svg.clientWidth || 560)));
    const isRadial = g.nodes.some((n) => n.root), vh = (typeof window.innerHeight === "number" && window.innerHeight) || 800, few = g.nodes.length <= 7;
    /* گوشی: قابِ ایستاده (جای برچسب‌های کناری کم است، بیضی از بلندی کمک می‌گیرد)؛ چند گرهِ کم: قابِ کوتاه‌تر */
    const H = Math.round(isRadial ? Math.min(640, Math.max(300, W * (W < 480 ? (few ? 1 : 1.25) : few ? 0.62 : 0.86))) : Math.max(320, Math.min(W * 0.68, vh * 0.72)));
    const L = isRadial ? radial(g, W, H, o) : force(g, W, H);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("width", String(W)); svg.setAttribute("height", String(H));
    /* جهتِ متن صریح (نه ارث از صفحه): placeLabels با همین rtl لنگرِ start/end را انتخاب می‌کند */
    svg.setAttribute("direction", "rtl"); if (svg.style) svg.style.direction = "rtl";
    svg.innerHTML = paint(L, o.sel);
    const act = (t, viaKey) => {
      if (t.dataset.gmore !== undefined) return o.onMore && o.onMore(t.dataset.gmore || null);
      svg.querySelectorAll(".gn.sel").forEach((x) => x.classList.remove("sel"));
      t.classList.add("sel");
      if (!viaKey && t.parentNode) t.parentNode.appendChild(t);   /* برچسبِ پنهانِ گرهِ زده‌شده روی بقیه */
      if (o.onNode) o.onNode(t.dataset.gnode, t.dataset.gname);
    };
    svg.onclick = (ev) => { const t = ev.target.closest && ev.target.closest("[data-gnode],[data-gmore]"); if (t) act(t, false); };
    svg.onkeydown = (ev) => { if (ev.key !== "Enter" && ev.key !== " ") return; const t = ev.target.closest && ev.target.closest("[data-gnode],[data-gmore]"); if (t) { ev.preventDefault(); act(t, true); } };
    return L;
  }
  /** راهنما: رنگِ هر نوع رابطهٔ موجود، خط‌چین و ضخامت، و رنگِ گره‌ها */
  function legend(g) {
    const used = new Set(((g && g.edges) || []).map((e) => e.nature)), nat = ((g && g.natures) || []).filter((n) => used.has(n.key));
    return `<div class="spp-legend">${nat.map((n) => `<span><i style="background:${esc(n.color)}"></i>${esc(n.fa)}</span>`).join("")}<span><i class="dash"></i>خط‌چین = پیشنهادی (تأییدنشده)</span><span class="dim">ضخامتِ خط = قوت</span></div>
      <div class="spp-legend">${Object.values(KIND).map(([c, l]) => `<span><b class="dot" style="background:${c}"></b>${l}</span>`).join("")}</div>`;
  }

  /* ---------- باز کردن، رفتن و برگشتن ---------- */
  let root = null, qTimer = null;
  function close() { clearTimeout(qTimer); if (root) { root.remove(); root = null; } document.removeEventListener("keydown", onEsc); }
  const onEsc = (e) => { if (e.key === "Escape") close(); };
  /** از بیرون: مسیرِ برگشت از نو */
  const open = (o) => show(o, []);
  /** از درونِ کشو به تأمین‌کنندهٔ دیگر: جای فعلی به مسیرِ برگشت می‌رود (حداکثر ۸ قدم) */
  function go(o) {
    if (o.sid && o.sid === S.sid) { S.tab = o.tab || S.tab; draw(); if (S.tab === "graph" && !S.g) loadGraph(); return; }
    show({ ...o, head: S.head }, [...S.trail, { sid: S.sid, name: S.name, tab: S.tab }].slice(-8));
  }
  async function show(o, trail) {
    css();
    S.sid = (o && o.sid) || null; S.name = (o && o.name) || ""; S.head = (o && o.head) || ""; S.tab = (o && o.tab) || "info";
    S.d = null; S.err = ""; S.g = null; S.gL = null; S.gErr = ""; S.gSel = null; S.lf = lfInit(); S.trail = Array.isArray(trail) ? trail : [];
    clearTimeout(qTimer);
    if (!root) {
      root = document.createElement("div"); root.className = "spp"; root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true");
      document.body.appendChild(root);
      root.addEventListener("click", onClick); root.addEventListener("input", onInput); root.addEventListener("change", onChange); root.addEventListener("keydown", onKey);
      document.addEventListener("keydown", onEsc);
    }
    draw();
    await load();
  }
  async function load() {
    const seq = ++S.seq;
    S.loading = true; S.g = null; S.gL = null; draw();
    /* نام هم کنارِ sid: «L:»ِ بی ردیف نامِ نمایشی‌اش را نگه می‌دارد، نه کلیدِ نرمال */
    const q = new URLSearchParams();
    if (S.sid) q.set("sid", S.sid);
    if (S.name) q.set("name", S.name);
    if (S.head) q.set("head", S.head);
    try {
      const d = await C.api(`/sreg/profile?${q}`); if (seq !== S.seq) return;
      S.d = d; S.sid = d.sid; S.name = d.name;
      if (!S.lf.nature && d.natures && d.natures[0]) S.lf = lfReduce(S.lf, { type: "nature", value: d.natures[0].key });
    } catch (e) { if (seq !== S.seq) return; S.err = e.message; }
    S.loading = false; draw();
    if (S.tab === "graph") loadGraph();
  }
  async function loadGraph() {
    if (!S.sid) return;
    const seq = ++S.gSeq, sid = S.sid;
    S.gErr = ""; S.g = null; S.gL = null; draw();
    try {
      const g = await C.api(`/sreg/graph?sid=${encodeURIComponent(sid)}&depth=${S.gDepth}`); if (seq !== S.gSeq || sid !== S.sid) return;
      S.g = g; if (S.gSel && !g.nodes.some((n) => n.sid === S.gSel)) S.gSel = null;
    } catch (e) { if (seq !== S.gSeq) return; S.gErr = e.message; }
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
    const r = d.research || {}, g = d.grade, sp = d.support || {};
    /* فقط پنل پشتیبانی onEdit می‌دهد (cr-admin.js): ویرایشِ رده و مشخصات در «🏷 تأمین‌کنندگان»، از همین کشو */
    const edit = typeof C.onEdit === "function" && d.sn ? `<div style="margin-top:6px"><button type="button" class="tp-btn xs" data-spp-edit>🏷 ویرایشِ رده و مشخصات</button></div>` : "";
    /* ردهٔ سوابقِ خرید — مؤثر، با نشانِ «تغییر پشتیبانی» و ردهٔ خودِ سوابق کنارش */
    const gradeSec = g || d.support || edit ? `<div class="spp-sec"><h4>ردهٔ سوابق</h4>${kv([
      ["رده", `${gradeChip(g)}${g && g.over ? ` <b style="font-size:.8rem">(تغییر پشتیبانی)</b>${g.imported !== g.grade ? ` <span class="dim" style="font-size:.8rem">— در سوابق: ${esc(g.imported || "بی‌رده")}</span>` : ""}` : ""}`],
      ["چرا این رده", esc((g && g.reason) || "")], ["کد تأمین‌کننده", ltr(g && g.code)], ["تغییرِ پشتیبانی", g && g.over && g.at ? esc(when(g.at)) : ""],
      ["یادداشتِ پشتیبانی", esc(sp.note || "")]])}${edit}</div>` : "";
    return `${gradeSec}
      <div class="spp-sec"><h4>هویت</h4>${kv([["نام رسمی", esc(d.identity.legal_name || "") + bySup(sp.legal_name)], ["نام تجاری", esc(d.identity.brand_name || "")],
        ["شمارهٔ ثبت", d.identity.reg_no ? ltr(d.identity.reg_no) + bySup(sp.reg_no) : ""], ["شناسهٔ ملی", d.identity.national_id ? ltr(d.identity.national_id) + bySup(sp.national_id) : ""],
        ["نوع", esc(d.identity.type || "")], ["نقش در زنجیره", esc(d.identity.role || "")], ["مدیر", esc(d.identity.manager || "")], ["تأسیس", esc(d.identity.established || "")], ["وضعیت ثبتی", esc(d.identity.registry_status || "")]])}</div>
      <div class="spp-sec"><h4>تماس</h4>${kv([["تلفن (پشتیبانی)", ltr(d.contact.support_phones)], ["نشانی", esc(d.contact.address || "") + bySup(sp.address)], ["تلفن", ltr(d.contact.phones)], ["همراه", ltr(d.contact.mobiles)], ["وب‌سایت", d.contact.website ? links(/^https?:/.test(d.contact.website) ? d.contact.website : `https://${d.contact.website}`) : ""],
        ["ایمیل", ltr(d.contact.email)], ["تماسِ تأییدشده", ltr(d.contact.verified)]])}</div>
      <div class="spp-sec"><h4>بازار</h4>${kv([["کشور", esc(d.market.country || "")], ["استان و شهر", esc([d.market.province, d.market.city].filter(Boolean).join("، "))], ["بازار یا پاساژ", esc(d.market.hub || "")],
        ["برندها", esc(d.market.brands || "")], ["محصولات (به نقل از خودش)", esc(d.market.products || "")]])}</div>
      <div class="spp-sec"><h4>راستی‌آزمایی</h4>${kv([["سطح", `<span class="chip ${v[0]}">${v[1]}</span>`], ["دروازه‌ها", esc(d.verification.gates || "")], ["مانده یا رد", esc(d.verification.open || "")],
        ["آخرین نشانهٔ فعالیت", esc([d.verification.last_activity_date, d.verification.last_activity].filter(Boolean).join(" — "))], ["نام نزدیک (G4)", esc(d.verification.g4 || "")],
        ["کامل بودن پرونده", d.verification.completeness != null ? fa(Math.round(d.verification.completeness * 100)) + "٪" : ""], ["بررسی", esc(d.verification.checked || "")], ["منابع", links(d.verification.sources)]])}</div>
      <div class="spp-sec"><h4>${d.kind === "old" ? "در تحقیق (سوابق ۱۳۹۸ تا ۱۴۰۵)" : "در رتبه‌بندیِ کشف"}</h4>${d.kind === "old"
        ? kv([["ردهٔ تحقیق", esc(r.rank || "")], ["مبلغ (میلیارد ریال)", r.spend_bn != null ? fa(Math.round(r.spend_bn)) : ""], ["شمار نوع قلم", r.heads != null ? fa(r.heads) : ""], ["سال‌های همکاری", r.years != null ? fa(r.years) : ""],
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
  const natChip = (e) => `<span class="nat" style="--c:${esc(e.color)}"><i class="${e.status === PROPOSED ? "dash" : ""}" style="background:${esc(e.color)}"></i>${esc(e.nature_fa || e.fa || "")}</span>`;
  function vRel(d) {
    const rows = d.edges.map((e) => `<div class="spp-edge">${natChip(e)}<button class="spp-link" data-supp-sid="${esc(e.other)}" data-supp="${esc(e.other_name)}">${esc(e.other_name)}</button>
        <span class="chip ${e.status === CONFIRMED ? "ok" : ""}">${esc(e.status)}</span><span class="dim" style="font-size:.78rem">${esc(e.source)}${e.by ? ` · ${esc(e.by)}` : ""}</span>
        ${e.status === PROPOSED ? `<button class="tp-btn xs" data-edge-ok="${e.id}">تأیید</button><button class="tp-btn xs" data-edge-no="${e.id}">رد</button>` : ""}
        ${e.evidence || e.ev || e.note ? `<span class="ev">${esc([e.ev, e.evidence, e.note].filter(Boolean).join(" — "))}</span>` : ""}</div>`).join("");
    return `${vLinkForm(S.lf, d.natures)}
      <div class="spp-legend">${d.natures.map((n) => `<span><i style="background:${esc(n.color)}"></i>${esc(n.fa)}</span>`).join("")}<span><i class="dash"></i>پیشنهادی</span></div>
      ${rows || `<div class="dim">رابطه‌ای ثبت نشده.</div>`}`;
  }
  /** کارتِ گرهِ زده‌شده: نام کامل، نوع، رابطه با مرکز (یا با والدش)، «👤 پروفایل» و «🎯 مرکز» — به‌جای کشوی تازه روی همین کشو */
  function vCard() {
    const L = S.gL, sid = S.gSel;
    const n = L && sid && S.g ? L.nodes.find((x) => x.sid === sid) : null;
    if (!n) return "";
    const rel = n.via ? S.g.edges.filter((e) => (e.a === sid && e.b === n.via) || (e.b === sid && e.a === n.via)) : [];
    const viaName = n.ring === 2 ? (L.nodes.find((x) => x.sid === n.via) || {}).name : "";
    return `<div class="hd"><b>${esc(n.name)}</b><button type="button" class="tp-icon-btn" data-gclose aria-label="بستنِ کارت">✕</button></div>
      <div class="row"><span class="chip">${esc(KIND_FA[n.kind] || "")}</span>${n.hub ? `<span class="dim" style="font-size:.8rem">${esc(n.hub)}</span>` : ""}</div>
      ${rel.length ? `<div class="row">${rel.map((e) => `${natChip(e)}<span class="chip ${e.status === CONFIRMED ? "ok" : ""}">${esc(e.status)}</span>`).join("")}${viaName ? `<span class="dim" style="font-size:.8rem">با ${esc(viaName)}</span>` : ""}</div>` : ""}
      <div class="row">${n.ring === 0 ? `<button type="button" class="tp-btn sm" data-spp-tab="info">👤 پروفایل</button><button type="button" class="tp-btn sm" data-spp-tab="rel">🔗 روابط</button>`
        : `<button type="button" class="tp-btn sm" data-gopen="${esc(sid)}" data-gname="${esc(n.name)}">👤 پروفایل</button><button type="button" class="tp-btn sm primary" data-gcenter="${esc(sid)}" data-gname="${esc(n.name)}">🎯 مرکز</button>`}</div>`;
  }
  function vGraph() {
    const tool = `<div class="spp-gtool"><div class="tp-seg"><button class="${S.gDepth === 1 ? "on" : ""}" data-gdepth="1">یک قدم</button><button class="${S.gDepth === 2 ? "on" : ""}" data-gdepth="2">دو قدم</button></div>
      <span class="dim">روی هر گره بزنید؛ «🎯 مرکز» گراف را دورِ همان می‌چیند</span></div>`;
    if (S.gErr) return `${tool}<div class="tp-note warn">${esc(S.gErr)}</div>`;
    if (!S.g) return tool + (TP.ui && TP.ui.loader ? TP.ui.loader("") : "…");
    return `${tool}${legend(S.g)}<div class="spp-gwrap"><svg class="spp-graph" data-graph role="img" aria-label="گراف روابطِ ${esc(S.name)}"></svg></div>
      ${S.g.nodes.length <= 1 ? `<div class="spp-hint" style="margin-top:6px">رابطه‌ای ثبت نشده — از «🔗 روابط» پیوند بزنید.</div>` : ""}<div class="spp-gcard" data-gcard></div>`;
  }
  function draw() {
    if (!root) return;
    const d = S.d;
    const head = d ? `<h2>${esc(d.name)}<div class="sub"><span class="chip">${esc(KIND_FA[d.kind] || d.kind)}</span>${d.grade ? `<span class="chip ${GRADE_TONE[d.grade.grade] || ""}" title="ردهٔ سوابقِ خرید${d.grade.over ? " — تغییرِ پشتیبانی" : ""}">ردهٔ سوابق ${esc(d.grade.grade || "بی‌رده")}${d.grade.over ? " ✎" : ""}</span>` : ""}${d.market && d.market.hub ? `<span class="chip">${esc(d.market.hub)}</span>` : ""}${(() => { const v = VER_FA[String(d.verification && d.verification.level)]; return v ? `<span class="chip ${v[0]}">${v[1]}</span>` : ""; })()}</div></h2>`
      : `<h2>${esc(S.name || "تأمین‌کننده")}</h2>`;
    const back = S.trail[S.trail.length - 1];
    const crumbs = back ? `<nav class="spp-trail" aria-label="مسیرِ برگشت"><button type="button" class="spp-back" data-trail="${S.trail.length - 1}" title="برگشت به ${esc(back.name || "")}">↩</button>${S.trail.map((t, i) => `<button type="button" class="spp-link" data-trail="${i}">${esc(cut(t.name || t.sid || "", 22))}</button><span aria-hidden="true">←</span>`).join("")}<b>${esc(cut(d ? d.name : S.name, 26))}</b></nav>` : "";
    const tab = (k, l) => `<button class="${S.tab === k ? "on" : ""}" data-spp-tab="${k}">${l}</button>`;
    const body = S.err ? `<div class="tp-note warn">${esc(S.err)}</div>` : !d ? (TP.ui && TP.ui.loader ? TP.ui.loader("") : "…")
      : S.tab === "ops" ? vOps(d) : S.tab === "rel" ? vRel(d) : S.tab === "graph" ? vGraph() : vInfo(d);
    root.innerHTML = `<div class="spp-scrim" data-spp-close></div><div class="spp-panel"><header><div class="spp-hd">${crumbs}${head}</div><button class="tp-icon-btn" data-spp-close aria-label="بستن">✕</button></header>
      <nav class="spp-tabs">${tab("info", "👤 پروفایل")}${tab("ops", `💬 نظرها${d ? ` (${fa(d.opinions.filter((o) => !o.hidden).length)})` : ""}`)}${tab("rel", `🔗 روابط${d ? ` (${fa(d.edges.length)})` : ""}`)}${tab("graph", "🕸 کاوش گراف")}</nav>
      <div class="spp-body">${body}</div></div>`;
    paintGraph();
  }
  const gName = (sid) => ((S.g && S.g.nodes.find((n) => n.sid === sid)) || {}).name || "";
  const gOpts = () => ({ sel: S.gSel, total1: S.d && S.d.sid === S.sid ? new Set(S.d.edges.map((e) => e.other)).size : 0,
    onNode: (sid) => { S.gSel = sid; paintCard(true); },
    onMore: (sid) => { if (sid) return go({ sid, name: gName(sid), tab: "rel" }); S.tab = "rel"; draw(); } });
  function paintGraph() {
    const svg = root && root.querySelector("[data-graph]");
    if (!svg || !S.g) return;
    S.gL = graph(svg, S.g, gOpts());
    paintCard(false);
  }
  function paintCard(scroll) {
    const c = root && root.querySelector("[data-gcard]");
    if (!c) return;
    c.innerHTML = vCard();
    if (scroll && S.gSel && c.scrollIntoView) { try { c.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (_) { /* بی‌اهمیت */ } }
  }
  /** فقط فهرستِ یافته‌ها و دکمهٔ ثبت (نه کادرِ جست‌وجو) */
  function paintLink() {
    if (!root) return;
    const box = root.querySelector("[data-link-box]"), act = root.querySelector("[data-link-act]");
    if (box) { const old = box.querySelector(".spp-hits"), top = old ? old.scrollTop : 0; box.innerHTML = vLinkBox(S.lf); const nw = box.querySelector(".spp-hits"); if (nw) nw.scrollTop = top; }
    if (act) act.innerHTML = vLinkAct(S.lf);
  }

  /* ---------- رفتارها ---------- */
  async function searchLinks() {
    const q = S.lf.q.trim().replace(/\s+/g, " ");
    if (nk(q).length < 2) { S.lf = lfReduce(S.lf, { type: "clear" }); return paintLink(); }
    S.lf = lfReduce(S.lf, { type: "ask" });
    const seq = S.lf.seq, sid = S.sid;
    paintLink();
    let list = [], err = "";
    try { list = ((await C.api(`/sreg/search?q=${encodeURIComponent(q)}${sid ? `&not=${encodeURIComponent(sid)}` : ""}`)).list || []).filter((h) => !h.sid || h.sid !== sid); }
    catch (e) { err = e.message || "خطا"; }
    if (sid !== S.sid) return;
    S.lf = lfReduce(S.lf, { type: "hits", seq, q, list, err });
    paintLink();
  }
  async function onClick(e) {
    const t = e.target.closest("[data-spp-close],[data-spp-tab],[data-spp-edit],[data-supp],[data-supp-sid],[data-op-edit],[data-op-hide],[data-edge-ok],[data-edge-no],[data-link-save],[data-link-free],[data-link-unpick],[data-gdepth],[data-trail],[data-gopen],[data-gcenter],[data-gclose]");
    if (!t) return;
    const d = t.dataset;
    if (d.sppClose !== undefined) return close();
    if (d.sppEdit !== undefined) { if (S.d && typeof C.onEdit === "function") C.onEdit({ sn: S.d.sn, name: S.d.name, sid: S.d.sid }); return; }
    if (d.sppTab) { S.tab = d.sppTab; draw(); if (S.tab === "graph" && !S.g) loadGraph(); return; }
    if (d.gdepth) { S.gDepth = Number(d.gdepth); return loadGraph(); }
    if (d.trail !== undefined) { const i = Number(d.trail), x = S.trail[i]; if (x) show({ ...x, head: S.head }, S.trail.slice(0, i)); return; }
    if (d.gopen || d.gcenter) return go({ sid: d.gopen || d.gcenter, name: d.gname || "", tab: d.gcenter ? "graph" : "info" });
    if (d.gclose !== undefined) { S.gSel = null; root.querySelectorAll(".spp-graph .gn.sel").forEach((x) => x.classList.remove("sel")); return paintCard(false); }
    if (d.suppSid || d.supp !== undefined) { if (t.classList.contains("spp-link")) return go({ sid: d.suppSid || null, name: d.supp || "", tab: "info" }); }
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
    if (d.linkFree !== undefined) { S.lf = lfReduce(S.lf, { type: "free", name: d.linkFree }); return paintLink(); }
    if (d.linkUnpick) { S.lf = lfReduce(S.lf, { type: "unpick", key: d.linkUnpick }); return paintLink(); }
    if (d.linkSave !== undefined) {
      if (!S.lf.picks.length || S.lf.saving) return;
      S.lf = lfReduce(S.lf, { type: "saving", on: true }); paintLink();
      try {
        await C.api("/sreg/links", { body: linkBody(S.lf, { sid: S.sid, name: S.name }) });
        S.lf = lfReduce(S.lf, { type: "saved" });
        if (TP.ui && TP.ui.success) TP.ui.success("پیوند ثبت شد");
        await load();
      } catch (er) { S.lf = lfReduce(S.lf, { type: "saving", on: false }); paintLink(); TP.modal("پیوند ثبت نشد", esc(er.message), null, "باشد", ""); }
    }
  }
  function onInput(e) {
    const t = e.target;
    if (t.matches("[data-link-q]")) {
      /* متنِ خام همان لحظه در وضعیت؛ جست‌وجو پس از مکث و فقط فهرست دوباره رسم می‌شود */
      S.lf = lfReduce(S.lf, { type: "q", value: t.value });
      clearTimeout(qTimer); qTimer = setTimeout(searchLinks, 260);
      return;
    }
    if (t.matches("[data-link-note]")) S.lf = lfReduce(S.lf, { type: "note", value: t.value });
  }
  function onKey(e) {
    if (e.key === "Enter" && e.target.matches && e.target.matches("[data-link-q]")) { e.preventDefault(); clearTimeout(qTimer); searchLinks(); }
  }
  async function onChange(e) {
    const t = e.target;
    if (t.matches("[data-link-pick]")) {
      const h = (S.lf.hits || []).find((x) => hitKey(x) === t.dataset.linkPick);
      if (h) S.lf = lfReduce(S.lf, { type: "pick", hit: h, on: t.checked });
      return paintLink();
    }
    if (t.matches("[data-link-nature]")) { S.lf = lfReduce(S.lf, { type: "nature", value: t.value }); return; }
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
  /* چرخشِ گوشی یا تغییرِ اندازه: گراف دوباره به اندازهٔ ظرف */
  let rzT = null;
  if (typeof window.addEventListener === "function") window.addEventListener("resize", () => { clearTimeout(rzT); rzT = setTimeout(() => { if (root && S.tab === "graph") paintGraph(); }, 200); });

  S.lf = lfInit();
  /* refresh: کشوِ باز (همان تأمین‌کننده و زبانه) دوباره خوانده می‌شود — مثلاً بعد از ذخیرهٔ «🏷 ویرایشِ رده و مشخصات»ِ پشتیبانی */
  TP.supProfile = { open, close, enabled, btn, graph, legend, css, refresh: () => (root ? load() : null), configure(o) { C = { ...C, ...o }; flagsP = null; },
    lib: { nk, hitKey, lfInit, lfReduce, linkBody, vLinkForm, vLinkBox, vLinkAct, cut, fitTo, estW, edgeRank, placeLabels, radial, force, paint, legend } };
})();
