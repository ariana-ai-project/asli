/* ============================================================
   «⭐ ارزیابی ربات» در پنل پشتیبانی (مهر ۱۴۰۵، درخواستِ مالک) — امتیازها و نظرهای کارشناسان به کارشناس هوشمند
   داده از worker/ai-feedback.js (جدول ai_feedback، با عکسِ زمینهٔ هر بازخورد):
     · میانگینِ امتیازِ پیام‌ها، مکاتبه‌ها و نامه‌ها، و سرنوشتِ پیشنهادهای «⏱ با مهلت» (فرستاد / رد / خودکار)
     · پخشِ ستاره‌ها، روندِ میانگین، جدولِ کارشناسان، واژه‌های پرتکرارِ علت‌های امتیازِ کم و رد
     · «🤖 برایند» با مدل (فقط با کلیک)، فهرستِ همهٔ نظرها با فیلتر و «🔎 زمینه»ٔ هر کدام
     · «📦 جعبه‌های نقد» (worker/critique.js): شمارِ هر جعبه — پرتکرارترین یعنی جزئی که اول باید اصلاح شود — به تفکیکِ مدل و ماه؛
       با زدنِ هر جعبه فهرست همان‌ها را نشان می‌دهد
     · خروجیِ اکسل (CSV) و دادهٔ آموزشِ مدل (JSONL — هر خط یک بازخورد با زمینه؛ ردها جفتِ «ردشده/برگزیده»)
   window.TP_FB: configure({api, render, download}) · mount(root) · view() · load(force)
   ============================================================ */
(function () {
  "use strict";
  const TP = window.TP;
  const esc = TP.esc;
  /* رقم فارسی (ui.js) — شمارها هم فارسی، برخلافِ TP.M */
  const fa = (x) => (TP.ui && TP.ui.fa ? TP.ui.fa(x) : String(x));
  const M = (n) => fa(Number(n || 0).toLocaleString("en-US")).replace(/,/g, "٬");
  let C = { api: null, render: () => {}, download: null };
  const S = { f: { win: "30d", expert: "", kind: "", low: false, q: "", box: "" }, d: null, items: [], loading: false, err: "", more: false, sum: {}, sumBusy: false, sumErr: "", seq: 0, experts: [] };
  const WINS = [["7d", "۷ روز"], ["30d", "۳۰ روز"], ["90d", "۹۰ روز"], ["365d", "یک سال"], ["all", "همه"]];
  const KIND_FA = { msg: "پیام", thread: "کلِ مکاتبه", letter: "نامهٔ کمیسیون", prop: "پیشنهادِ با مهلت", request: "کلِ مذاکرهٔ درخواست" };
  /* نامِ فارسیِ جعبه‌ها از همان پاسخِ سرور */
  const boxFa = (c) => { const b = ((S.d && S.d.boxes && S.d.boxes.list) || []).find((x) => x.code === c); return b ? b.fa : c; };
  const boxChips = (codes) => ((codes || []).length ? `<span class="sv-fbbx">${codes.map((c) => `<span class="chip warn">📦 ${esc(boxFa(c))}</span>`).join("")}</span>` : "");
  const OUT_FA = { ok: "✅ فرستاد", no: "✏️ رد کرد", auto: "⏱ خودکار رفت" };
  const fa1 = (n) => (n == null ? "—" : fa(String(Math.round(n * 10) / 10).replace(".", "٫")));
  const pct = (a, b) => (b ? `${fa(Math.round((a / b) * 100))}٪` : "—");
  const stars = (n) => (n == null ? "" : `<span class="sv-fbst" aria-label="${fa(n)} از ۵ ستاره" title="${fa(n)} از ۵">${"★".repeat(n)}<i>${"★".repeat(5 - n)}</i></span>`);
  const p2 = (n) => String(n).padStart(2, "0");
  const dShort = (ms) => { const [, m, d] = TP.todayJ(ms); return fa(`${p2(m)}/${p2(d)}`); };
  const when = (ms) => { const [y, m, d] = TP.todayJ(ms), x = new Date(ms); return fa(`${y}/${p2(m)}/${p2(d)} ${p2(x.getHours())}:${p2(x.getMinutes())}`); };
  const sumKey = () => `${S.f.win}|${S.f.expert}`;

  function qs(extra) {
    const q = new URLSearchParams({ win: S.f.win, ...(S.f.expert ? { expert: S.f.expert } : {}), ...(S.f.kind ? { kind: S.f.kind } : {}), ...(S.f.low ? { low: "1" } : {}), ...(S.f.q ? { q: S.f.q } : {}), ...(S.f.box ? { box: S.f.box } : {}), ...(extra || {}) });
    return q.toString();
  }
  async function load(force, more) {
    if (!C.api) return;
    if (S.d && !force && !more) return C.render();
    const seq = ++S.seq;
    S.loading = true; S.err = ""; C.render();
    try {
      const r = await C.api(`/ai/feedback?${qs({ limit: "40", offset: String(more ? S.items.length : 0) })}`);
      if (seq !== S.seq) return;
      S.d = r; S.items = more ? [...S.items, ...r.items] : r.items; S.more = S.items.length < r.total;
    } catch (e) { if (seq === S.seq) S.err = e.message; }
    if (seq === S.seq) { S.loading = false; C.render(); }
  }

  /* ---------- نما ---------- */
  function kpis(d) {
    const k = d.kinds || {}, m = k.msg || {}, t = k.thread || {}, l = k.letter || {}, p = k.prop || {};
    const dec = (p.ok || 0) + (p.no || 0) + (p.auto || 0);
    const tile = (label, val, sub, tone) => `<div class="sv-fbk ${tone || ""}"><small>${label}</small><b>${val}</b><em>${sub}</em></div>`;
    return `<div class="sv-fbks">
      ${tile("⭐ میانگینِ پیام‌ها", m.n ? `${fa1(m.avg)}<span> از ۵</span>` : "—", m.n ? `${M(m.n)} امتیاز · ${pct(m.low, m.n)} زیرِ سه` : "هنوز امتیازی نیست", m.n && m.avg < 3 ? "bad" : m.n && m.avg >= 4 ? "ok" : "")}
      ${tile("💬 کلِ مکاتبه‌ها", t.n ? `${fa1(t.avg)}<span> از ۵</span>` : "—", t.n ? `${M(t.n)} مکاتبه` : "—", t.n && t.avg < 3 ? "bad" : "")}
      ${tile("📝 نامه‌های کمیسیون", l.n ? `${fa1(l.avg)}<span> از ۵</span>` : "—", l.n ? `${M(l.n)} نامه` : "—", l.n && l.avg < 3 ? "bad" : "")}
      ${tile("⏱ پیشنهادهای با مهلت", dec ? `${pct(p.no || 0, dec)}<span> رد</span>` : "—", dec ? `✅ ${M(p.ok || 0)} · ✏️ ${M(p.no || 0)} · ⏱ ${M(p.auto || 0)} خودکار` : "هنوز تصمیمی نیست", dec && (p.no || 0) / dec > 0.3 ? "bad" : "")}
    </div>`;
  }
  function distBox(d) {
    const rows = (kind, label) => {
      const a = (d.dist || {})[kind]; if (!a) return "";
      const max = Math.max(1, ...a);
      return `<div class="sv-fbdist"><b>${label}</b>${[5, 4, 3, 2, 1].map((s) => `<div class="r ${s < 3 ? "low" : ""}"><span class="s">${fa(s)}★</span><span class="bar"><i style="width:${(a[s - 1] / max) * 100}%"></i></span><span class="n">${M(a[s - 1])}</span></div>`).join("")}</div>`;
    };
    const h = rows("msg", "پیام‌ها") + rows("thread", "کلِ مکاتبه‌ها") + rows("letter", "نامه‌ها");
    return `<section class="tp-box sv-fbbox"><div class="tp-box-h"><h2>پخشِ ستاره‌ها</h2></div>${h || `<div class="dim">هنوز امتیازی نیست.</div>`}</section>`;
  }
  function trendBox(d) {
    const T = d.trend || [];
    if (T.length < 2) return `<section class="tp-box sv-fbbox"><div class="tp-box-h"><h2>روندِ میانگینِ پیام‌ها</h2></div><div class="dim">برای نمودار دست‌کم دو ${d.bucket === "day" ? "روز" : "هفته"} امتیاز لازم است.</div></section>`;
    const W = 320, H = 110, P = 14, x0 = T[0].at, x1 = T[T.length - 1].at || x0 + 1;
    const X = (t) => P + ((t - x0) / Math.max(1, x1 - x0)) * (W - 2 * P), Y = (v) => H - P - ((v - 1) / 4) * (H - 2 * P);
    const pts = T.map((t) => `${X(t.at).toFixed(1)},${Y(t.avg).toFixed(1)}`).join(" ");
    return `<section class="tp-box sv-fbbox"><div class="tp-box-h"><h2>روندِ میانگینِ پیام‌ها</h2><span class="sub">${d.bucket === "day" ? "روزانه" : "هفتگی"}</span></div>
      <svg class="sv-fbtr" viewBox="0 0 ${W} ${H}" role="img" aria-label="روندِ میانگینِ امتیازِ پیام‌ها">
        ${[1, 3, 5].map((v) => `<line x1="${P}" x2="${W - P}" y1="${Y(v)}" y2="${Y(v)}" class="g"/><text x="${W - 2}" y="${Y(v) + 3}" class="l">${fa(v)}</text>`).join("")}
        <polyline points="${pts}" class="p"/>
        ${T.map((t) => `<circle cx="${X(t.at).toFixed(1)}" cy="${Y(t.avg).toFixed(1)}" r="3.2" class="${t.avg < 3 ? "c low" : "c"}"><title>${dShort(t.at)} — ${fa1(t.avg)} از ۵ (${M(t.n)} امتیاز)</title></circle>`).join("")}
      </svg><div class="sv-fbtrx"><span>${dShort(x0)}</span><span>${dShort(x1)}</span></div></section>`;
  }
  function aiBox() {
    const s = S.sum[sumKey()];
    const head = `<div class="tp-box-h"><h2>🤖 برایندِ نظرها</h2>${TP.ui.info("support.fb", "راهنمای ارزیابی ربات")}
      <span class="end"><button type="button" class="tp-btn sm ${s ? "" : "primary"}" data-fbsum ${S.sumBusy ? "disabled" : ""}>${S.sumBusy ? "در حال تحلیل…" : s ? "↻ تحلیلِ دوباره" : "تحلیل کن"}</button></span></div>`;
    if (S.sumErr) return `<section class="tp-box sv-fbai">${head}<div class="tp-note warn">${esc(S.sumErr)}</div></section>`;
    if (!s) return `<section class="tp-box sv-fbai">${head}<div class="dim">برای این بازه «تحلیل کن» را بزنید.</div></section>`;
    return `<section class="tp-box sv-fbai">${head}<p class="sum">${esc(s.summary)}</p>
      ${(s.problems || []).length ? `<h3>⚠️ ایرادهای پرتکرار</h3><ul>${s.problems.map((p) => `<li><b>${esc(p.title)}</b>${p.share ? ` <span class="chip">${esc(p.share)}</span>` : ""}<div class="dim">${esc(p.detail)}</div></li>`).join("")}</ul>` : ""}
      ${(s.strengths || []).length ? `<h3>✅ نقطه‌های قوت</h3><ul>${s.strengths.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      ${(s.actions || []).length ? `<h3>🛠 پیشنهادِ اصلاح</h3><ol>${s.actions.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>` : ""}
      <div class="dim" style="font-size:.8rem">بر پایهٔ ${M(s.n)} نظر · ${when(s.at)}</div></section>`;
  }
  function wordsBox(d) {
    const W = d.words || [];
    return `<section class="tp-box sv-fbbox"><div class="tp-box-h"><h2>پرتکرار در علت‌های امتیازِ کم و رد</h2></div>
      ${W.length ? `<div class="sv-fbw">${W.map((w) => `<button type="button" class="chip" data-fbword="${esc(w.w)}">${esc(w.w)} <b>${M(w.n)}</b></button>`).join("")}</div>` : `<div class="dim">هنوز علتی تکرار نشده.</div>`}</section>`;
  }
  function boxesBox(d) {
    const B = d.boxes;
    if (!B || !B.n) return "";
    const L = B.list.filter((b) => b.n), max = Math.max(1, ...L.map((b) => b.n));
    const models = Object.entries(B.models || {}).map(([m, o]) => [m, Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 3)]);
    const months = Object.keys(B.months || {}).sort().slice(-4);
    return `<section class="tp-box sv-fbbox"><div class="tp-box-h"><h2>📦 جعبه‌های نقد</h2><span class="sub">${M(B.n)} بازخورد با جعبه</span>${TP.ui.info("support.fb", "راهنمای ارزیابی ربات")}</div>
      <div class="sv-fbdist bx">${L.map((b, i) => `<div class="r ${i === 0 ? "low" : ""}"><button type="button" class="linkish s" data-fbbox="${b.code}" title="${esc(b.stage)} — ${esc(b.part)}">${esc(b.fa)}</button><span class="bar"><i style="width:${(b.n / max) * 100}%"></i></span><span class="n">${M(b.n)}</span></div>`).join("")}</div>
      ${models.length ? `<div class="dim" style="font-size:.82rem;margin-top:8px">${models.map(([m, top]) => `<div><span dir="ltr">${esc(m)}</span>: ${top.map(([c, n]) => `${esc(boxFa(c))} ${M(n)}`).join("، ")}</div>`).join("")}</div>` : ""}
      ${months.length > 1 ? `<div class="dim" style="font-size:.82rem;margin-top:6px">${months.map((mo) => { const o = B.months[mo]; const top = Object.entries(o).sort((a, b) => b[1] - a[1])[0]; return `${fa(mo)}: ${esc(boxFa(top[0]))} ${M(top[1])}`; }).join(" · ")}</div>` : ""}</section>`;
  }
  function expertsBox(d) {
    const E = d.experts || [];
    if (!E.length) return "";
    const c = (o) => (o && o.n ? `${fa1(o.avg)} <span class="dim">(${M(o.n)})</span>` : "—");
    return `<section class="tp-box"><div class="tp-box-h"><h2>کارشناسان</h2>${TP.ui.info("support.fb", "راهنمای ارزیابی ربات")}</div>
      <div class="tp-scroll"><table class="tp-table sv-fbt"><thead><tr><th class="rt">کارشناس</th><th>بازخورد</th><th>پیام‌ها</th><th>زیرِ سه</th><th>مکاتبه‌ها</th><th>نامه‌ها</th><th>پیشنهادها ✅/✏️/⏱</th><th>رد</th></tr></thead><tbody>
      ${E.map((e) => { const p = e.prop || {}, dec = (p.ok || 0) + (p.no || 0) + (p.auto || 0);
        return `<tr><td class="rt"><button type="button" class="linkish" data-fbexp-id="${e.expert_id}">${esc(e.name)}</button></td><td>${M(e.n)}</td><td>${c(e.msg)}</td><td>${e.msg ? M(e.msg.low) : "—"}</td><td>${c(e.thread)}</td><td>${c(e.letter)}</td>
          <td>${dec ? `${M(p.ok || 0)} / ${M(p.no || 0)} / ${M(p.auto || 0)}` : "—"}</td><td>${pct(p.no || 0, dec)}</td></tr>`; }).join("")}</tbody></table></div></section>`;
  }
  function item(x) {
    const low = (x.stars != null && x.stars < 3) || x.outcome === "no";
    return `<article class="sv-fbit ${low ? "low" : ""}">
      <header><span class="chip">${KIND_FA[x.kind] || x.kind}</span>${stars(x.stars)}${x.outcome ? `<span class="chip ${x.outcome === "no" ? "warn" : x.outcome === "ok" ? "ok" : ""}">${OUT_FA[x.outcome] || x.outcome}</span>` : ""}
        <span class="who">${esc(x.expert_name || "—")}</span><span class="dim">${when(x.at)}</span></header>
      <div class="meta dim">درخواست <b>${esc(x.request_id || "—")}</b>${x.supplier ? ` · ${esc(x.supplier)}` : ""}${x.model ? ` · <span dir="ltr">${esc(x.model)}</span>` : ""}</div>
      ${x.note ? `<div class="note">💬 ${esc(x.note)}</div>` : ""}${boxChips(x.boxes)}
      ${x.ai_text ? `<div class="txt ai"><small>🤖 متنِ ربات</small>${esc(x.ai_text)}</div>` : ""}
      ${x.human_text ? `<div class="txt hu"><small>✏️ جایگزینِ کارشناس</small>${esc(x.human_text)}</div>` : ""}
      <footer><button type="button" class="tp-btn xs" data-fbctx="${x.id}">🔎 زمینه</button>${x.thread_id ? `<button type="button" class="tp-btn xs" data-th-open="${x.thread_id}">💬 گفت‌وگو</button>` : ""}</footer></article>`;
  }
  function view() {
    const f = S.f, d = S.d;
    let h = `<div class="sv-fb"><div class="mg-bar sv-fbbar"><div class="tp-pills">${WINS.map(([k, l]) => `<button type="button" class="tp-pill ${f.win === k ? "on" : ""}" data-fbwin="${k}" aria-pressed="${f.win === k}">${l}</button>`).join("")}</div>
        <select class="tp-select" data-fbf="expert" aria-label="کارشناس"><option value="">همهٔ کارشناسان</option>${(d ? d.experts : []).map((e) => `<option value="${e.expert_id}" ${String(f.expert) === String(e.expert_id) ? "selected" : ""}>${esc(e.name)}</option>`).join("")}${f.expert && !(d && d.experts.some((e) => String(e.expert_id) === String(f.expert))) ? `<option value="${esc(f.expert)}" selected>کارشناسِ انتخابی</option>` : ""}</select>
        <span class="spacer"></span>
        <button type="button" class="tp-btn sm" data-fbdl="csv" title="همهٔ بازخوردهای همین بازه برای اکسل">⬇️ اکسل</button>
        <button type="button" class="tp-btn sm" data-fbdl="jsonl" title="هر بازخورد با زمینه‌اش (گفت‌وگو، اقلام، مدل) — دادهٔ آموزشِ مدل؛ ردها جفتِ ردشده/برگزیده‌اند">🧠 دادهٔ آموزش</button></div>`;
    if (S.err) h += `<div class="tp-note warn">${esc(S.err)}</div>`;
    if (!d) return h + (S.loading ? TP.ui.loader() : "") + `</div>`;
    const any = Object.keys(d.kinds || {}).length;
    h += kpis(d);
    if (!any) return h + `<div class="lg-none">⭐<b>هنوز بازخوردی در این بازه نیست</b>${TP.ui.info("support.fb", "راهنمای ارزیابی ربات")}</div></div>`;
    h += `<div class="sv-fbgrid">${distBox(d)}${trendBox(d)}</div>${aiBox()}<div class="sv-fbgrid">${wordsBox(d)}${boxesBox(d)}</div>${expertsBox(d)}`;
    h += `<section class="tp-box"><div class="tp-box-h"><h2>نظرها و امتیازها</h2><span class="sub">${M(d.total)} مورد</span></div>
      <div class="sv-fbf"><div class="tp-seg sm">${[["", "همه"], ["msg", "پیام"], ["thread", "مکاتبه"], ["letter", "نامه"], ["prop", "پیشنهاد"], ["request", "درخواست"]].map(([k, l]) => `<button type="button" class="${f.kind === k ? "on" : ""}" data-fbkind="${k}">${l}</button>`).join("")}</div>
        <label class="chkline"><input type="checkbox" data-fblow ${f.low ? "checked" : ""}> فقط کم‌امتیازها و ردها</label>
        ${f.box ? `<button type="button" class="chip warn" data-fbbox="" title="برداشتنِ فیلترِ جعبه">📦 ${esc(boxFa(f.box))} ✕</button>` : ""}
        <input class="tp-input" data-fbq value="${esc(f.q)}" placeholder="جستجو در نظر، متنِ ربات، درخواست یا تأمین‌کننده ↵" style="flex:1;min-width:200px"></div>
      ${S.items.length ? `<div class="sv-fbits">${S.items.map(item).join("")}</div>` : `<div class="dim" style="padding:10px 0">چیزی با این فیلترها نیست.</div>`}
      ${S.more ? `<div class="sv-more"><button type="button" class="tp-btn" data-fbmore ${S.loading ? "disabled" : ""}>بیشتر</button></div>` : ""}</section>`;
    return h + `</div>`;
  }

  /* ---------- رفتارها ---------- */
  async function showCtx(id) {
    let r; try { r = await C.api(`/ai/feedback/${id}`); } catch (e) { return TP.modal("نشد", esc(e.message), null, "باشد", ""); }
    const who = { supplier: "تأمین‌کننده", ai: "🤖 ربات", expert: "کارشناس" };
    const tr = (r.context && r.context.transcript) || [];
    const its = r.items || [];
    TP.modal(`🔎 زمینهٔ بازخورد — ${KIND_FA[r.kind] || r.kind}`, `<div class="sv-fbctx">
        <div class="dim">درخواست <b>${esc(r.request_id || "—")}</b>${r.supplier ? ` · ${esc(r.supplier)}` : ""} · ${esc(r.expert_name || "")} · ${when(r.at)}</div>
        ${its.length ? `<div class="its">${its.map((i) => `<span class="chip">${esc(i.title)} — ${i.qty == null ? "" : fa(i.qty)} ${esc(i.unit || "")}${i.price ? ` × ${fa(Number(i.price).toLocaleString("en-US")).replace(/,/g, "٬")} ریال` : ""}</span>`).join("")}</div>` : ""}
        ${tr.length ? `<div class="tr">${tr.map((m) => `<div class="m ${m.who}"><small>${who[m.who] || m.who}${m.kind === "note" ? " · یادداشت" : ""}</small>${esc(m.text)}</div>`).join("")}</div>` : ""}
        ${r.ai_text ? `<div class="m ai focus"><small>🤖 ${r.kind === "prop" ? "پیشنهادِ ربات" : r.kind === "letter" ? "نامهٔ ربات" : "همین پیام"}</small>${esc(r.ai_text)}</div>` : ""}
        ${r.human_text ? `<div class="m expert focus"><small>✏️ جایگزینِ کارشناس</small>${esc(r.human_text)}</div>` : ""}
        ${r.stars != null || r.note ? `<div class="verdict">${stars(r.stars)} ${r.note ? `<b>💬 ${esc(r.note)}</b>` : ""}</div>` : ""}${boxChips(r.boxes)}</div>`, null, "بستن", "");
  }
  async function runSum() {
    S.sumBusy = true; S.sumErr = ""; C.render();
    try { S.sum[sumKey()] = await C.api("/ai/feedback/summary", { body: { win: S.f.win, expert: S.f.expert || null } }); }
    catch (e) { S.sumErr = e.message; }
    S.sumBusy = false; C.render();
  }
  function onClick(e) {
    const t = e.target.closest("[data-fbwin],[data-fbkind],[data-fbmore],[data-fbsum],[data-fbctx],[data-fbdl],[data-fbword],[data-fbexp-id],[data-fbbox]");
    if (!t) return;
    const d = t.dataset;
    if (d.fbwin) { S.f.win = d.fbwin; S.sumErr = ""; return load(true); }
    if (d.fbkind !== undefined) { S.f.kind = d.fbkind; return load(true); }
    if (d.fbmore !== undefined) return load(true, true);
    if (d.fbsum !== undefined) return runSum();
    if (d.fbctx) return showCtx(+d.fbctx);
    if (d.fbword) { S.f.q = d.fbword; S.f.low = true; return load(true); }
    if (d.fbexpId) { S.f.expert = d.fbexpId; S.sumErr = ""; return load(true); }
    if (d.fbbox !== undefined) { S.f.box = d.fbbox; return load(true); }
    if (d.fbdl) {
      const fmt = d.fbdl, q = new URLSearchParams({ win: S.f.win, format: fmt, ...(S.f.expert ? { expert: S.f.expert } : {}) });
      return C.download(`/ai/feedback/export?${q}`, `ai-feedback-${S.f.win}.${fmt}`).catch((er) => TP.modal("نشد", esc(er.message), null, "باشد", ""));
    }
  }
  function onChange(e) {
    const t = e.target;
    if (t.matches("[data-fbf]")) { S.f.expert = t.value; S.sumErr = ""; return load(true); }
    if (t.matches("[data-fblow]")) { S.f.low = t.checked; return load(true); }
  }
  function onKey(e) {
    if (e.key === "Enter" && e.target.matches("[data-fbq]")) { e.preventDefault(); S.f.q = e.target.value.trim(); load(true); }
  }

  window.TP_FB = {
    configure(o) { C = { ...C, ...o }; },
    mount(root) { root.addEventListener("click", onClick); root.addEventListener("change", onChange); root.addEventListener("keydown", onKey); },
    view, load,
  };
})();
