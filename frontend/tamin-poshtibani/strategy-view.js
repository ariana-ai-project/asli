/* ============================================================
   «📘 سند راهبرد» و «🧭 مذاکرهٔ کارشناس هوشمند» — نمای مشترکِ پنل کارشناس و مکاتبات (مهر ۱۴۰۵؛ درخواست مالک: «نمایشِ استراتژی
   مذاکره و استراتژی استعلام چه شد؟» — بعد از «🚀 شروع» سند و حالِ مذاکره دیده نمی‌شد)
   داده: worker/strategy-doc.js (GET /cr/doc) و worker/neg-view.js (کلیدِ neg گفت‌وگو و GET /sp/x/thread/:id/neg). همین یک فایل:
     TP.stratView.docBody(x, nums, o)   نمای تیترواریِ سند: «در یک نگاه»، چهار کاشی (بازار، استعلام، مذاکره، 🔒 عددهای درونی)،
                                        وضعیت‌های محتمل و «≡ جزئیات» — بازبینیِ پیش از «🚀 شروع» (expert.js:pkDocUI) و نمای فقط‌خواندنی
     TP.stratView.docHead(L, o)         سرآیندِ نسخه، وضعیت، منبع و امتیاز (o.ro: «🔒 فقط‌خواندنی»)
     TP.stratView.openDoc(o)            «📘 سند راهبرد» فقط‌خواندنی، بی امتیاز و تأیید: پس از «🚀 شروع» در پنل کارشناس و از کارتِ
                                        مذاکرهٔ مکاتبات — نسخهٔ تأییدشده، همان که در زمینهٔ کارشناس هوشمند می‌رود
     TP.stratView.negCard(n, o)         کارتِ «🧭 مذاکرهٔ کارشناس هوشمند» در مکاتبات: تیتر (دورِ n از ۵، آخرین حرکت، پیشنهادِ ما و
                                        تأمین‌کننده، 🔒 هدف و حد) و بقیه زیرِ «≡ جزئیات»
     TP.stratView.MS_FA / MODE_FA / MV_FA / GL_MOVE …  نام‌ها و کلیدهای واژه‌نامه (help-content.js، gl.*)
   عددهای درونی (قیمت مرجع، هدف، حد، بهترین پیشنهادِ دیگران) فقط در صفحه‌های کارکنان رسم می‌شوند؛ سرور هم آن‌ها را فقط به
   کارشناس می‌دهد و هیچ‌کدام به پنل یا باتِ تأمین‌کننده نمی‌رود.
   ============================================================ */
(function () {
  "use strict";
  const TP = window.TP;
  if (!TP) return;
  const esc = TP.esc, M = TP.M;
  const FA = "۰۱۲۳۴۵۶۷۸۹";
  const fa = (s) => String(s == null ? "" : s).replace(/\d/g, (d) => FA[+d]);

  /* حالت‌های استعلام — همان worker/cr-engine.js:MODE_FA */
  const MODE_FA = { BROAD: "گسترده (حداکثری)", STANDARD: "استاندارد", SIMULTANEOUS_INDEX: "هم‌زمان قیمت‌مرجع", MULTICHANNEL: "چندکاناله", LIMITED_STAGED: "محدود و مرحله‌ای",
    CONSULT_THEN_COMPETE: "مشورت سپس رقابت", DIRECT_PLUS_MARKET_TEST: "مستقیم با آزمون بازار", FRAMEWORK_CALLOFF: "قرارداد چارچوب", STAGED_BROADENING: "مرحله‌ای با گسترش مشروط" };
  /* همان worker/strategy/config.js:MS_NAMES */
  const MS_FA = { "MS-0": "دادهٔ ناکافی", "MS-1": "رقابتی استاندارد", "MS-2": "رقابتی متمایز (کیفیت/برند)", "MS-3": "کالای پایهٔ قیمت‌مرجع",
    "MS-4": "متمرکز (چندتأمین‌کننده‌ای محدود)", "MS-5": "قطعهٔ اصلی/برند وابسته به واردات", "MS-6": "خدمات و کار سفارشی" };
  /* دو گزینهٔ ثابتِ «🧭 چینش» و حالت‌های خانوادهٔ محتاط (worker/cr-engine.js:CAUTIOUS) */
  const VAR_FA = { broad: "چینش گسترده", cautious: "چینش محتاط" };
  const CAUTIOUS = new Set(["LIMITED_STAGED", "STAGED_BROADENING", "DIRECT_PLUS_MARKET_TEST"]);
  /* ده حرکتِ مذاکره (worker/strategy/kb-data.js:MOVES) با نامِ کوتاه */
  const MV_FA = { "M-ANCHOR": "لنگر", "M-COUNTER": "پیشنهادِ متقابل", "M-PACKAGE": "بستهٔ معاوضه", "M-FACT": "بیانِ واقعیت", "M-ASK": "پرسش", "M-PAUSE": "مکث",
    "M-SPLIT": "تقسیمِ سفارش", "M-CLOSE": "جمع‌بندی", "M-WALK": "ترکِ مؤدبانه", "M-ESCALATE": "ارجاع به کارشناس" };
  const MV_TONE = { "M-PACKAGE": "ok", "M-CLOSE": "ok", "M-WALK": "bad", "M-ESCALATE": "warn" };
  /** حرکتِ مذاکره ← اصطلاحِ واژه‌نامه (help-content.js) */
  const GL_MOVE = { "M-ANCHOR": "gl.anchor", "M-COUNTER": "gl.counter", "M-PACKAGE": "gl.package", "M-FACT": "gl.fact", "M-ASK": "gl.ask", "M-PAUSE": "gl.pause",
    "M-SPLIT": "gl.split", "M-CLOSE": "gl.close", "M-WALK": "gl.walk", "M-ESCALATE": "gl.escalate" };

  /** «؟»ِ کوچکِ واژه‌نامه کنارِ یک نام — فقط اگر آن اصطلاح در راهنما هست */
  const glq = (key, name) => { const T = key && window.TP_HELP && window.TP_HELP.topics; return T && T[key] && TP.ui ? TP.ui.info(key, `«${name || T[key].title}» چیست؟`, "sm") : ""; };
  const rial = (n) => (n == null ? "—" : M(Math.round(n)));
  const pctS = (x) => (x == null || !Number.isFinite(Number(x)) ? "—" : `${x > 0 ? "+" : x < 0 ? "−" : ""}${M(Math.abs(Math.round(x * 1000) / 10))}٪`);
  /* آهنگ از c (worker/strategy-doc.js:PACE): ۰٫۳ شکیبا، ۰٫۵ متعادل، ۱ یکنواخت — c=۰٫۶ِ کلاس‌های متمایز «متعادل» */
  const paceFa = (c) => (c == null || c === "" ? "—" : c <= 0.35 ? "شکیبا" : c < 0.9 ? "متعادل" : "یکنواخت");
  /** «در یک نگاه»: نخستین جملهٔ خلاصهٔ سند (و دومی اگر اولی کوتاه است) — متنِ کامل زیرِ «≡ جزئیات» */
  const glanceOf = (s) => {
    const a = (String(s || "").replace(/\s+/g, " ").match(/[^.!؟]+[.!؟]?/g) || []).map((x) => x.trim()).filter(Boolean);
    let g = a[0] || ""; if (g.length < 90 && a[1]) g += ` ${a[1]}`;
    return g.length > 300 ? `${g.slice(0, 299)}…` : g;
  };
  /* مبلغِ فارسی با «٬» (همان شکلِ مکاتبات) و زمانِ شمسی با رقمِ فارسی */
  const faM = (n) => (n == null || !Number.isFinite(Number(n)) ? "—" : fa(Math.round(Number(n)).toLocaleString("en-US")).replace(/,/g, "٬"));
  const faNum = (x) => fa(String(x)).replace(/\./g, "٫");
  const when = (ms) => (ms && TP.fmt ? fa(TP.fmt(ms)) : "");
  const det = (o) => (TP.ui && TP.ui.det ? TP.ui.det(o) : "");
  const helpBtn = (key, title) => (TP.ui && TP.ui.info ? TP.ui.info(key, title) : "");

  /* ------------------------------------------------------------------ */
  /* «📘 سند راهبرد»                                                     */
  /* ------------------------------------------------------------------ */
  /**
   * نمای تیترواریِ یک نسخهٔ سند (همان doc_json یا final_json). nums: عددهای درونیِ همین قلم (docView.numbers). o: {dk (کلیدِ
   * «≡ جزئیات»، برای هر بار بازشدن تازه)، builder (برچسب‌های سازندهٔ پارامتری از docView)، variant (چینشِ فعلیِ فهرستِ دعوتِ همین قلم)}
   */
  function docBody(x, nums, o = {}) {
    const n = x.negotiation || {}, r = x.rfq || {}, mv = x.market_view || {}, rp = n.rules_pct || {};
    const ul = (a) => (a && a.length ? `<ul>${a.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : "");
    const dh = (t) => `<span class="dh">${t}</span>`;
    const tile = (lab, main, sub, cls, tip) => `<div class="doc-tile ${cls || ""}"${tip ? ` title="${esc(tip)}"` : ""}><span class="tl">${lab}</span><b>${main}</b>${sub ? `<span class="dim">${sub}</span>` : ""}</div>`;
    /* لنگر = پیشنهادِ دورِ اولِ ما نسبت به قیمت مرجع: از عددهای همین قلم اگر هست (با قاعده‌های همین سند)، وگرنه درصدهای سند */
    const ok = nums && nums.status === "OK";
    const o0 = ok && nums.ref && (nums.offers || []).length ? nums.offers[0] / nums.ref - 1 : null;
    const first = o0 != null ? o0 : (rp.offers_by_round_vs_ref || [])[0];
    const risks = x.risks || [], hard = n.hard_constraints || [], need = x.needs_approval || [], pk = n.packages || [];
    /* چینشِ فهرستِ همین قلم اگر با خانوادهٔ سند (سیاستِ پیش‌فرضِ نوع قلم) فرق دارد */
    const v = o.variant || null, docV = CAUTIOUS.has(r.competition_mode || r.mode) ? "cautious" : "broad";
    const tiles = [
      tile("بازار", `${esc(MS_FA[mv.ms] || mv.ms || "—")}${glq("gl.ms", "ساختار بازار")}`, mv.confidence_band ? `اطمینان ${esc(mv.confidence_band)}` : ""),
      tile("استعلام", `${esc(MODE_FA[r.mode] || r.mode || "—")}${glq(`gl.mode.${r.mode}`, MODE_FA[r.mode])}`,
        `موج اول ${M(r.n_wave1 || 0)} از ${M(r.n_max || 0)}${r.waves > 1 ? " · دو موج" : ""}${v && v !== docV ? ` · فهرستِ این قلم: «${VAR_FA[v]}»` : ""}`),
      tile("مذاکره", `لنگر ${first != null ? pctS(first) : "از هدف"}${glq("gl.anchor", "لنگر")}`,
        `${M(n.rounds || 0)} دور · <span class="nw">آهنگِ ${paceFa(n.concession_c)}${glq("gl.pace", "آهنگِ امتیازدهی")}</span>${pk.length ? ` · ${M(pk.length)} بستهٔ معاوضه` : ""}`, "", "لنگر: پیشنهادِ دورِ اولِ ما نسبت به قیمت مرجع"),
      ok ? tile("🔒 عددهای درونی", `مرجع ${rial(nums.ref)}${glq("gl.ref", "قیمت مرجع")}`,
        `<span class="nw">هدف ${rial(nums.target)}${glq("gl.target", "هدف")}</span> · <span class="nw">حد ${rial(nums.reservation)}${glq("gl.reservation", "حد")}</span> · <span class="nw">ریال${nums.unit ? `/${esc(nums.unit)}` : ""}</span>`, "lock", "درونی — به تأمین‌کننده گفته نمی‌شود")
        : tile("🔒 عددهای درونی", `<span class="nw">هدف ${pctS(rp.target_vs_ref)}${glq("gl.target", "هدف")}</span> · <span class="nw">حد ${pctS(rp.rv_tol)}${glq("gl.reservation", "حد")}</span>`,
          `نسبت به قیمت مرجع${nums && nums.status ? ` — ${esc(nums.action || "قیمت مرجعِ این قلم نیست")}` : ""}`, "lock", "درونی — به تأمین‌کننده گفته نمی‌شود"),
    ].join("");
    const states = (x.anticipated_states || []).map((s) => `<details class="doc-st"><summary><span class="nm">${esc(s.name || s.state_id)}</span><span class="chip ${MV_TONE[s.move] || ""}">${esc(MV_FA[s.move] || s.move)}</span>${glq(GL_MOVE[s.move], MV_FA[s.move])}${s.blocked ? ` <span class="chip bad" title="${esc(s.blocked.join("؛ "))}">⛔ افشاگر — نمی‌رود</span>` : ""}</summary>
      <p>«${esc(s.prepared_reply_fa)}»</p>${s.blocked ? `<p class="dim">چرا نمی‌رود: ${esc(s.blocked.join("؛ "))}</p>` : ""}</details>`).join("");
    const rq = [...(r.why || []), ...(r.distribution_explained || []), ...(r.anti_leak_measures || [])];
    const B = x.builder, BL = o.builder || {};
    const tabs = [
      { k: "why", t: "متن و قاعده‌ها", html: [
        x.summary_fa ? dh("خلاصهٔ کامل") + `<pre class="fm-text">${esc(x.summary_fa)}</pre>` : "",
        (mv.key_facts || []).length ? dh("بازار") + ul(mv.key_facts) : "",
        rq.length ? dh("استعلام") + ul(rq) : "",
        n.anchor_rule || n.reservation_rule ? dh("لنگر، هدف و حد") + ul([n.anchor_rule, n.reservation_rule].filter(Boolean)) : "",
        dh("آهنگ و دورها") + `<div class="dim">آهنگِ ${paceFa(n.concession_c)} (c=${esc(n.concession_c)}) · ${M(n.rounds || 0)} دور${n.parallel_with ? ` · هم‌زمان با ${M(n.parallel_with)} تأمین‌کننده` : ""}</div>`,
        pk.length ? dh("بسته‌های معاوضه") + `<div>${pk.map((p) => `<span class="chip ok">${esc(p.description_fa)}${p.effect_pct != null ? ` (${esc(String(p.effect_pct))}٪)` : ""}</span>`).join(" ")}</div>` : "",
        ok ? dh("🔒 پیشنهادِ ما در هر دور — درونی") + `<div class="dim">${nums.offers.map(rial).join(" ← ")} ریال${nums.unit ? ` (${esc(nums.unit)})` : ""}</div>` : "",
        mv.ms || (mv.labels || []).length ? dh("کلاس و برچسب‌ها") + `<div class="dim">${esc(mv.ms || "")} · ${esc((mv.labels || []).join(" "))} · اطمینان ${esc(mv.confidence_band || "—")}</div>` : "",
        x.notes_for_buyer ? dh("یادداشت برای کارشناس") + `<div>${esc(x.notes_for_buyer)}</div>` : ""].join("") },
      { k: "risk", t: `ریسک‌ها${risks.length ? ` ${M(risks.length)}` : ""}`, html: risks.length ? `<ul>${risks.map((k) => `<li>${esc(k.risk)} — <span class="dim">${esc(k.control)}</span></li>`).join("")}</ul>` : "" },
      { k: "hard", t: "قیدها و تأییدِ شما", html: (hard.length ? dh("قیدهای سخت — معامله نمی‌شوند") + ul(hard) : "") + (need.length ? dh("آنچه تأییدِ شما را می‌خواهد") + ul(need) : "") },
      { k: "build", t: "سازندهٔ پارامتری", html: B ? `<div class="dim">وزن‌ها: ${Object.entries(B.weights || {}).map(([k, w]) => `${esc((BL.weights || {})[k] || k)} ${M(w)}`).join("، ")} · آهنگِ ${esc((BL.pace || {})[B.pace] || "")} · پیشنهادِ دیگران: ${esc((BL.others || {})[B.others] || "")}${B.split_ok ? " · تقسیمِ سفارش مجاز" : ""}</div>
        <div class="dim">هدف ${pctS(B.target_vs_ref)} و تحملِ حد ${pctS(B.rv_tol)} نسبت به مرجع · ${M(B.rounds || 0)} دور · حداکثر ${M(B.max_pay_months || 0)} ماه تعویقِ پرداخت${B.panel_rate != null ? ` · نرخِ ماهانهٔ پنل ${pctS(B.panel_rate)}` : ""}</div>
        ${(B.tradeables || []).length ? `<div class="dim">قابلِ معامله: ${B.tradeables.map(esc).join("، ")}</div>` : ""}${B.note ? `<div class="dim">یادداشت: ${esc(B.note)}</div>` : ""}` : "" },
    ];
    const sub = [risks.length ? `ریسک‌ها ${M(risks.length)}` : "", hard.length ? `قیدهای سخت ${M(hard.length)}` : "", need.length ? `تأیید ${M(need.length)}` : "", B ? "سازندهٔ پارامتری" : ""].filter(Boolean).join(" · ") || "متن و قاعده‌ها";
    const glance = glanceOf(x.summary_fa);
    return `${glance ? `<p class="doc-glance"><b>در یک نگاه:</b> ${esc(glance)}</p>` : ""}
      <div class="doc-tiles">${tiles}</div>
      ${states ? `<div class="doc-states"><b>وضعیت‌های محتمل</b> <span class="dim">— پاسخِ آماده با زدنِ هر ردیف</span>${states}</div>` : ""}
      ${det({ key: o.dk || `doc-${Date.now()}`, sub, tabs })}`;
  }

  /** سرآیندِ نسخه: «نسخهٔ n · وضعیت · منبع · امتیاز» — o.ro: «🔒 فقط‌خواندنی» */
  function docHead(L, o = {}) {
    const tone = L ? (L.state === "approved" ? "ok" : L.state === "failed" ? "bad" : L.state === "draft" ? "warn" : "") : "";
    return `<div class="doc-head dim">${helpBtn("expert.picks", "راهنمای سند راهبرد")} ${L ? `نسخهٔ ${M(L.version)} · <span class="chip ${tone}">${esc(L.state_fa)}</span>${L.source === "builder" ? " · سازندهٔ پارامتری" : L.model ? ` · <span dir="ltr">${esc(L.model)}</span>` : ""}${L.review && L.review.score ? ` · امتیازِ ${esc(L.review.by || "")}: ${M(L.review.score)}` : ""}` : "هنوز سندی نیست"}${o.ro ? ` · <span class="chip info" title="${esc(o.roTip || "بازبینی و تأیید پیش از «🚀 شروع» است؛ این‌جا فقط دیدن")}">🔒 فقط‌خواندنی</span>` : ""}</div>`;
  }

  /**
   * بدنهٔ «📘 سند راهبرد»ِ فقط‌خواندنی از پاسخِ GET /cr/doc: نسخهٔ تأییدشده (همان که در زمینهٔ کارشناس هوشمند می‌رود)، وگرنه آخرین
   * نسخه با وضعیتش؛ بی امتیاز، تأیید، ویرایش و سازنده. o: {why (یک خطِ زیرِ سرآیند)، dk، variant}
   */
  function roHtml(d, o = {}) {
    const A = d.approved, L = A || d.latest, x = L && (L.final || L.doc);
    const newer = A && d.latest && d.latest.id !== A.id && d.latest.version > A.version ? d.latest : null;
    const notes = [o.why ? esc(o.why) : "",
      newer ? `نسخهٔ تازه‌ترِ ${M(newer.version)} «${esc(newer.state_fa)}» است؛ کارشناس هوشمند تا تأییدِ آن با همین نسخهٔ تأییدشده مذاکره می‌کند.` : "",
      !A && L ? "این نسخه هنوز تأیید نشده؛ کارشناس هوشمند فقط سندِ تأییدشده را در زمینهٔ مذاکره دارد." : ""].filter(Boolean);
    /* عددهای درونی با قاعده‌های همان نسخه‌ای که دیده می‌شود (worker/strategy-doc.js:docView — numbers_approved وقتی نسخهٔ تازه‌تری هست) */
    const nums = A && d.numbers_approved ? d.numbers_approved : d.numbers;
    return `${docHead(L, { ro: true, roTip: o.roTip })}${notes.length ? `<div class="tp-note" style="margin:6px 0">${notes.join("<br>")}</div>` : ""}
      ${x ? docBody(x, nums, { dk: o.dk || `docro-${Date.now()}`, builder: d.builder, variant: o.variant }) : `<div class="tp-note warn" style="margin:8px 0">هنوز سندی برای این نوع قلم نیست${L ? ` (${esc(L.state_fa)})` : ""}.</div>`}`;
  }

  /**
   * «📘 سند راهبرد» فقط‌خواندنی در پنجره — o: {head, code, api (پیش‌فرض TP.api؛ مکاتبات با هدرِ مینی‌اپ)، why، variant، roTip}.
   * بی enqueue: دیدنِ سند چیزی نمی‌سازد.
   */
  async function openDoc(o = {}) {
    const api = o.api || ((p) => TP.api(p));
    const q = `/cr/doc?head=${encodeURIComponent(o.head || "")}${o.code ? `&code=${encodeURIComponent(o.code)}` : ""}`;
    const b = TP.busy("📘 سند راهبرد", esc(o.head || ""));
    let d;
    try { d = await api(q); } catch (e) { b.close(); return TP.modal("نشد", esc(e.message), null, "باشد", ""); }
    b.close();
    if (!d || !d.available) return TP.modal("📘 سند راهبرد", "این نوع قلم در دادهٔ تحقیق نیست؛ سند ندارد.", null, "باشد", "");
    const m = TP.modal(`📘 سند راهبرد — ${esc(d.head)}`, `<div data-doc>${roHtml(d, o)}</div>`, null, "بستن", "");
    m.querySelector(".tp-modal").classList.add("fm-modal", "doc-modal");
    return m;
  }

  /* ------------------------------------------------------------------ */
  /* «🧭 مذاکرهٔ کارشناس هوشمند» (مکاتبات)                                 */
  /* ------------------------------------------------------------------ */
  const NEG_TONE = { active: "info", ask: "warn", human: "warn", final: "ok", declined: "bad" };
  /**
   * تیترِ کارت: [برچسب، مقدار (HTML)، کلاس، توضیح] — دورِ n از ۵ · آخرین حرکت · پیشنهادِ ما / تأمین‌کننده · 🔒 هدف / حد. با مذاکرهٔ
   * همیشگی (حرکتی ثبت نمی‌شود؛ L.stale یعنی از دورهای پیشینِ موتور است) به‌جای حرکت «وضعیت» و به‌جای پیشنهادها قیمتِ پنل.
   */
  function negHead(n) {
    const r = n.round, L = n.last, p = n.plan, turn = n.engine === "turn";
    const out = [["دور", r ? `${fa(Math.min(r.used, r.max))} از ${fa(r.max)}` : "—", r && r.used >= r.max ? "warn" : "", "سقفِ دورهای کارشناس هوشمند در این گفت‌وگو؛ پر که شد، گفت‌وگو دستِ شماست"]];
    if (L && L.move && !L.stale) out.push(["آخرین حرکت", `${esc(MV_FA[L.move] || L.move_fa || L.move)}${L.held ? " ⛔" : ""}${glq(GL_MOVE[L.move], MV_FA[L.move])}`, L.held ? "bad" : "",
      L.held ? "پیامِ این دور از اعتبارسنج نگذشت و نرفت — پیش‌نویسش در یادداشتِ گفت‌وگوست" : L.move_fa || ""]);
    else out.push(["وضعیت", esc(n.state_fa || "—"), "", ""]);
    const theirs = n.their_last != null ? n.their_last : n.panel ? n.panel.price : null;
    if (turn && (n.our_last != null || theirs != null)) out.push(["پیشنهادِ ما / تأمین‌کننده", `${faM(n.our_last)} / ${faM(theirs)}`, "", "قیمتِ مؤثرِ واحد به ریال (با شرایطِ پرداخت و ارزش افزوده)؛ جزئیات زیرِ «≡ جزئیات»"]);
    else if (!turn && n.panel) out.push(["قیمتِ پنلِ تأمین‌کننده", `${faM(n.panel.price)}`, "", "قیمتِ واحدِ ثبت‌شده در پنل (اسمی، به ریال)"]);
    if (p) out.push(["🔒 هدف / حد", `${faM(p.target)} / ${faM(p.reservation)}`, "lock",
      `درونی — به تأمین‌کننده گفته نمی‌شود${p.batna != null ? "؛ هدف و حد هرگز بالاتر از بهترین پیشنهادِ واقعیِ دیگران نیست" : ""}`]);
    return out;
  }
  /**
   * کارتِ «🧭 مذاکرهٔ کارشناس هوشمند» برای کلیدِ neg (worker/neg-view.js) — فقط صفحهٔ کارشناس. o: {key (حافظهٔ «≡ جزئیات»)، help (دکمهٔ «؟»)}.
   * دکمهٔ «📘 سند راهبرد» data-negdoc با data-head و data-code دارد؛ شنونده‌اش با صفحه است (openDoc با هدرهای همان صفحه).
   */
  function negCard(n, o = {}) {
    if (!n) return "";
    const p = n.plan, L = n.last, d = n.doc, it = n.item;
    const li = (a) => { const x = a.filter(Boolean); return x.length ? `<ul>${x.map((s) => `<li>${s}</li>`).join("")}</ul>` : ""; };
    const dh = (t) => `<span class="dh">${t}</span>`;
    const docBtn = (label) => (d ? `<button type="button" class="tp-btn xs" data-negdoc data-head="${esc(d.head)}" data-code="${esc(d.code || "")}" title="سندِ راهبردِ تأییدشدهٔ «${esc(d.head)}» — فقط‌خواندنی؛ همان که در زمینهٔ کارشناس هوشمند است">${label}</button>` : "");
    const head = negHead(n).map(([k, v, cls, tip]) => `<span class="neg-k ${cls}"${tip ? ` title="${esc(tip)}"` : ""}><i>${k}</i><b>${v}</b></span>`).join("");
    const unit = p && p.unit ? `/${esc(p.unit)}` : "";
    const planTab = p ? dh("🔒 عددهای درونی — به تأمین‌کننده گفته نمی‌شود") + li([
      p.ref != null ? `قیمت مرجع${glq("gl.ref", "قیمت مرجع")}: <b>${faM(p.ref)}</b> ریال${unit}` : "",
      `لنگر${glq("gl.anchor", "لنگر")}: <b>${faM(p.anchor)}</b> · هدف${glq("gl.target", "هدف")}: <b>${faM(p.target)}</b> · حد${glq("gl.reservation", "حد")}: <b>${faM(p.reservation)}</b>`,
      p.batna != null ? `بهترین پیشنهادِ واقعیِ دیگران${glq("gl.batna", "BATNA")} (بی نام): <b>${faM(p.batna)}</b>` : "",
      `آهنگِ ${paceFa(p.c)}${glq("gl.pace", "آهنگِ امتیازدهی")} (c=${faNum(p.c)}) · برنامه ${fa(p.rounds)} دور`,
      (p.offers || []).length ? `پیشنهادِ ما در هر دور: ${p.offers.map(faM).join(" ← ")}` : "",
      p.next != null ? `پیشنهادِ بعدیِ ما: <b>${faM(p.next)}</b> (دورِ ${fa(Math.min(p.rounds, (n.t || 0) + 1))} از ${fa(p.rounds)})` : "",
    ]) + `<div class="dim">${p.src === "engine" ? `همان برنامه‌ای که «مذاکرهٔ دوگامی» با آن پیشنهاد می‌دهد: قیمت مرجعِ همین کد${p.rules ? "، قاعده‌های سندِ تأییدشده" : ""} و بهترین پیشنهادِ واقعیِ دیگران — همه قیمتِ مؤثرِ واحد.`
      : "عددهای درونیِ «📘 سند راهبرد» که در زمینهٔ هر پیامِ کارشناس هوشمند می‌رود (مذاکرهٔ همیشگی)."}</div>`
      : `<div class="dim">${n.engine === "turn" ? "عددِ برنامه هنوز نیست: قیمت مرجعِ هم‌واحد یا پیشنهادِ واقعیِ دیگری برای این قلم ثبت نشده." : "عددِ برنامه‌ای در زمینهٔ کارشناس هوشمند نیست (سند راهبرد خاموش است یا قیمت مرجع ندارد) — با محکِ سوابق چانه می‌زند."}</div>`;
    const turnsTab = li([
      `موتور: ${n.engine === "turn" ? "مذاکرهٔ دوگامی (طبقه‌بند و مذاکره‌گر)" : "مذاکرهٔ همیشگی"}${n.items > 1 ? ` · این گفت‌وگو ${fa(n.items)} قلم دارد؛ عددها مالِ «${esc(it ? it.title : "")}» است` : ""}`,
      n.round ? `دورهای کارشناس هوشمند در این گفت‌وگو: ${fa(Math.min(n.round.used, n.round.max))} از ${fa(n.round.max)}${p ? ` · دورِ برنامه (پیشنهادهای شمرده‌شدهٔ ما): ${fa(n.t || 0)} از ${fa(p.rounds)}` : ""}` : "",
      L && (L.states || []).length ? `آخرین وضعیت‌ها: ${L.states.map((s) => `${esc(s.name)} <span class="dim" dir="ltr">${esc(s.id)}</span>${s.confidence != null ? ` (${faNum(Math.round(s.confidence * 100) / 100)})` : ""}`).join(" · ")}` : "",
      L && L.move ? `${L.stale ? "آخرین حرکتِ مذاکرهٔ دوگامی (پیش از مذاکرهٔ همیشگی)" : "آخرین حرکت"}: ${esc(MV_FA[L.move] || L.move)} <span class="dim" dir="ltr">${esc(L.move)}</span>${L.held ? " — ⛔ از اعتبارسنج نگذشت و نرفت" : L.rewritten ? " — یک بار بازنویسی شد" : ""}${L.at ? ` <span class="dim">· ${when(L.at)}</span>` : ""}` : "",
      L && L.accept ? `سنجشِ پذیرش: ${L.accept.accept ? "✅ پذیرفتنی" : "نه"}${L.accept.reason ? ` — ${esc(L.accept.reason)}` : ""}` : "",
      (n.ours || []).length ? `پیشنهادهای ما (مؤثر): ${n.ours.map(faM).join(" ← ")}${n.our_nominal != null ? ` · آخرین قیمتِ گفته‌شده: ${faM(n.our_nominal)}` : ""}` : "",
      ...(n.theirs || []).map((f) => `پیشنهادِ تأمین‌کننده: <b>${faM(f.eff)}</b> مؤثر — <span class="dim">${esc(f.text)}${f.at ? ` · ${when(f.at)}` : ""}</span>`),
      n.panel ? `قیمتِ ثبت‌شده در پنل: ${faM(n.panel.price)} ریال${n.panel.unit ? `/${esc(n.panel.unit)}` : ""}` : "",
    ]) || `<div class="dim">هنوز دورِ مذاکره‌ای ثبت نشده.</div>`;
    const memoTab = (n.memo ? dh("یادداشتِ درونیِ کارشناس هوشمند") + `<pre class="fm-text">${esc(n.memo)}</pre>` : "")
      + ((n.facts || []).length ? dh("واقعیت‌های ثبت‌شدهٔ همین گفت‌وگو") + li(n.facts.map((f) => `${esc(f.type)}: ${esc(f.value)}`)) : "");
    const docTab = d ? dh(`نسخهٔ ${fa(d.version)} — ${d.source === "builder" ? "سازندهٔ پارامتری" : "مدل"}${d.reviewed_by ? `، تأییدِ ${esc(d.reviewed_by)}` : ""}`) + li([
      d.ms ? `بازار: ${esc(d.ms_fa || MS_FA[d.ms] || d.ms)}${glq("gl.ms", "ساختار بازار")}` : "",
      d.mode ? `استعلام: ${esc(d.mode_fa || MODE_FA[d.mode] || d.mode)}${glq(`gl.mode.${d.mode}`, MODE_FA[d.mode])}` : "",
      `مذاکره: ${fa(d.rounds || 0)} دور · آهنگِ ${paceFa(d.c)}${glq("gl.pace", "آهنگِ امتیازدهی")}`,
      d.anchor_rule ? `لنگر و هدف: ${esc(d.anchor_rule)}` : "", d.reservation_rule ? `حد: ${esc(d.reservation_rule)}` : "",
      (d.hard || []).length ? `قیدهای سخت: ${d.hard.map(esc).join(" · ")}` : "", (d.packages || []).length ? `بسته‌های معاوضه: ${d.packages.map(esc).join(" · ")}` : "",
    ]) + (d.summary ? `<div class="dim">${esc(d.summary)}</div>` : "")
      + (d.newer ? `<div class="tp-note" style="margin:6px 0">نسخهٔ تازه‌ترِ ${fa(d.newer.version)} «${esc(d.newer.state_fa)}» است؛ تا تأییدش کارشناس هوشمند با همین نسخه مذاکره می‌کند.</div>` : "")
      + `<div style="margin-top:6px">${docBtn("📘 دیدنِ کاملِ سند")}</div>`
      : `<div class="dim">سندِ راهبردِ تأییدشده‌ای در کار نیست — کلیدِ «سند راهبرد» در پنل پشتیبانی خاموش است یا این نوع قلم سند ندارد.</div>`;
    const tabs = [{ k: "plan", t: "برنامه و عددها", html: planTab }, { k: "turns", t: "دورها و پیشنهادها", html: turnsTab },
      { k: "memo", t: "یادداشت", html: memoTab }, { k: "doc", t: "سند راهبرد", html: docTab }];
    const ag = n.agreement;
    const itTxt = it && it.title ? `${esc(it.title)}${it.head ? ` · <span title="نوع قلم">${esc(it.head)}</span>` : ""}${n.engine === "turn" ? "" : " · مذاکرهٔ همیشگی"}` : "";
    return `<section class="neg-card" data-neg aria-label="مذاکرهٔ کارشناس هوشمند">
      <div class="neg-hd"><b>🧭 مذاکرهٔ کارشناس هوشمند</b><span class="chip ${NEG_TONE[n.state] || ""}">${esc(n.state_fa || n.state || "")}</span>${o.help || ""}</div>
      ${itTxt || d ? `<div class="neg-it"><span class="dim">${itTxt}</span><span class="sp"></span>${docBtn("📘 سند راهبرد")}</div>` : ""}
      <div class="neg-line">${head}</div>
      ${ag ? `<div class="neg-ok">🤝 توافقِ موقت روی ${faM(ag.price)} ریال${ag.eff != null ? ` (مؤثر ${faM(ag.eff)})` : ""} — تأمین‌کننده باید همان را در پنل ثبت کند؛ تصمیمِ نهایی با کمیسیون.</div>` : ""}
      ${det({ key: o.key || "neg", sub: "برنامه · دورها · یادداشت · سند", tabs })}</section>`;
  }

  TP.stratView = {
    MODE_FA, MS_FA, VAR_FA, CAUTIOUS, MV_FA, MV_TONE, GL_MOVE,
    glq, rial, pctS, paceFa, glanceOf, docBody, docHead, openDoc, negCard,
    /* تابع‌های خالص برای آزمون‌ها (tests/neg-view.test.mjs) */
    lib: { negHead, roHtml, faM },
  };
})();
