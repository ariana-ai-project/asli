/* ============================================================
   مناقصه — ابزارهای مشترکِ صفحهٔ تأمین‌کننده (tender.js) و نمای زندهٔ پنل پشتیبانی (tender-admin.js) (مهر ۱۴۰۵)
   window.TDUI: عدد و مبلغ، عدد به حروف، شمارشِ معکوسِ حلقه‌ای، نمودارِ قیمت (SVG بی کتابخانه)، کارت‌های بازار، ماشین‌حساب.
   ============================================================ */
(function () {
  "use strict";
  const FA = "۰۱۲۳۴۵۶۷۸۹";
  const fa = (s) => String(s == null ? "" : s).replace(/\d/g, (d) => FA[+d]);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const latin = (s) => String(s == null ? "" : s).replace(/[۰-۹]/g, (d) => FA.indexOf(d)).replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
  /** ۱۲٬۳۴۵٬۰۰۰ */
  const money = (n) => (n == null || !isFinite(n) ? "—" : fa(Math.round(Number(n)).toLocaleString("en-US")).replace(/,/g, "٬"));
  /** ورودیِ مبلغ با هر رقم و جداکننده → عددِ صحیح یا NaN */
  const parseAmt = (s) => { const t = latin(s).replace(/[,٬،\s]/g, "").replace(/ریال|تومان/g, ""); return /^\d+$/.test(t) ? Number(t) : NaN; };
  /** نمایشِ کوتاه: «۲٫۶۵ میلیون» */
  function short(n) {
    const a = Math.abs(Number(n) || 0);
    const [d, u] = a >= 1e12 ? [1e12, "هزار میلیارد"] : a >= 1e9 ? [1e9, "میلیارد"] : a >= 1e6 ? [1e6, "میلیون"] : a >= 1e3 ? [1e3, "هزار"] : [1, ""];
    const v = Math.round((a / d) * 100) / 100;
    return `${fa(String(v).replace(".", "٫"))}${u ? ` ${u}` : ""}`;
  }
  const ONES = ["", "یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه"];
  const TEENS = ["ده", "یازده", "دوازده", "سیزده", "چهارده", "پانزده", "شانزده", "هفده", "هجده", "نوزده"];
  const TENS = ["", "", "بیست", "سی", "چهل", "پنجاه", "شصت", "هفتاد", "هشتاد", "نود"];
  const HUNDS = ["", "یکصد", "دویست", "سیصد", "چهارصد", "پانصد", "ششصد", "هفتصد", "هشتصد", "نهصد"];
  const SCALES = ["", "هزار", "میلیون", "میلیارد", "هزار میلیارد"];
  function three(n) {
    const h = Math.floor(n / 100), r = n % 100, out = [];
    if (h) out.push(HUNDS[h]);
    if (r >= 10 && r < 20) out.push(TEENS[r - 10]);
    else { if (Math.floor(r / 10)) out.push(TENS[Math.floor(r / 10)]); if (r % 10) out.push(ONES[r % 10]); }
    return out.join(" و ");
  }
  /** عدد به حروف — همان worker/tender-core.js:numWords */
  function words(v) {
    let n = Math.floor(Math.abs(Number(v) || 0));
    if (!n) return "صفر";
    const parts = [];
    for (let i = 0; n > 0 && i < SCALES.length; i++) { const g = n % 1000; n = Math.floor(n / 1000); if (g) parts.unshift(`${three(g)}${SCALES[i] ? ` ${SCALES[i]}` : ""}`); }
    return parts.join(" و ");
  }
  /** «۰۲:۵۹» یا «۱:۰۲:۵۹» یا «۲ روز و ۳ ساعت» */
  function clock(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    if (s >= 86400) { const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600); return `${fa(d)} روز${h ? ` و ${fa(h)} ساعت` : ""}`; }
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60, p = (n) => String(n).padStart(2, "0");
    return fa(h ? `${h}:${p(m)}:${p(x)}` : `${p(m)}:${p(x)}`);
  }
  const dtf = (o) => { try { return new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: "Asia/Tehran", ...o }); } catch (_) { return null; } };
  const F_HMS = dtf({ hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }), F_WHEN = dtf({ weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hour12: false });
  const hms = (ms) => (F_HMS ? F_HMS.format(new Date(ms)) : fa(new Date(ms).toLocaleTimeString()));
  const when = (ms) => (F_WHEN ? F_WHEN.format(new Date(ms)) : fa(new Date(ms).toLocaleString()));
  const ST = { draft: "پیش‌نویس", scheduled: "شروع‌نشده", sealed: "دورِ سربسته", live: "در جریان", ended: "تمام شد", cancelled: "لغو شد" };
  const stChip = (st) => `<span class="td-st ${esc(st)}"><i></i>${ST[st] || esc(st)}</span>`;

  /** حلقهٔ شمارشِ معکوس — left/total به میلی‌ثانیه؛ data-ring برای به‌روزرسانیِ ثانیه‌ای */
  function ring(left, total, label) {
    const R = 64, C = 2 * Math.PI * R, f = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0;
    const cls = left <= 60e3 ? "hot" : left <= 180e3 ? "warn" : "";
    return `<div class="td-ring ${cls}" data-ring role="timer" aria-live="off"><svg viewBox="0 0 150 150" aria-hidden="true">
      <defs><linearGradient id="tdGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6aa0ff"/><stop offset="1" stop-color="#a78bfa"/></linearGradient></defs>
      <circle class="bg" cx="75" cy="75" r="${R}" fill="none" stroke-width="10"/>
      <circle class="fg" cx="75" cy="75" r="${R}" fill="none" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - f)).toFixed(1)}" data-c="${C.toFixed(1)}"/></svg>
      <div class="in"><span class="clock" data-clock>${clock(left)}</span><span class="lbl">${esc(label || "تا پایان")}</span></div></div>`;
  }
  /** به‌روزرسانیِ ثانیه‌ایِ حلقه بی رسمِ دوباره */
  function tickRing(root, left, total) {
    const r = root && root.querySelector("[data-ring]"); if (!r) return;
    const c = r.querySelector("[data-clock]"); if (c) c.textContent = clock(left);
    const fg = r.querySelector(".fg"), C = Number(fg && fg.dataset.c) || 0;
    if (fg) fg.setAttribute("stroke-dashoffset", (C * (1 - (total > 0 ? Math.max(0, Math.min(1, left / total)) : 0))).toFixed(1));
    r.classList.toggle("hot", left <= 60e3); r.classList.toggle("warn", left > 60e3 && left <= 180e3);
  }

  /**
   * نمودارِ «بهترین قیمت» در طولِ زمان (پله‌ای) با نقطهٔ هر پیشنهاد؛ خطِ قیمتِ شروع و کف.
   * o: {series:[{at, amount, best, mine}], start, floor, from, to}
   */
  function chart(o) {
    const S = (o.series || []).slice().sort((a, b) => a.at - b.at);
    if (!S.length) return `<div class="td-empty">هنوز پیشنهادی ثبت نشده؛ نمودار با اولین پیشنهاد کشیده می‌شود.</div>`;
    const W = 600, H = 220, L = 8, R = 70, Tp = 12, B = 24;
    const t0 = Math.min(o.from || S[0].at, S[0].at), t1 = Math.max(o.to || 0, S[S.length - 1].at, t0 + 60e3);
    const refV = o.ref && o.ref.v > 0 ? [o.ref.v] : [];
    const lo0 = Math.min(...S.map((p) => p.amount), ...refV), hi0 = Math.max(o.start || 0, ...S.map((p) => p.amount));
    const pad = Math.max(1, (hi0 - lo0) * 0.12);
    const lo = Math.max(0, lo0 - pad), hi = hi0 + pad * 0.4;
    const x = (t) => L + ((t - t0) / (t1 - t0)) * (W - L - R), y = (v) => Tp + (1 - (v - lo) / (hi - lo || 1)) * (H - Tp - B);
    let d = `M${x(S[0].at).toFixed(1)},${y(S[0].best).toFixed(1)}`;
    for (let i = 1; i < S.length; i++) d += ` H${x(S[i].at).toFixed(1)} V${y(S[i].best).toFixed(1)}`;
    d += ` H${x(t1).toFixed(1)}`;
    const area = `${d} V${H - B} H${x(S[0].at).toFixed(1)} Z`;
    const grid = [0, 0.25, 0.5, 0.75, 1].map((k) => { const v = lo + (hi - lo) * k, yy = y(v);
      return `<line class="grid" x1="${L}" x2="${W - R}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}"/><text class="lab" x="${W - R + 6}" y="${(yy + 3).toFixed(1)}">${esc(short(v))}</text>`; }).join("");
    const line = (v, cls, t) => (v >= lo && v <= hi ? `<line class="${cls}" x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"><title>${esc(t)}</title></line>` : "");
    const dots = S.map((p) => `<circle class="dot ${p.mine ? "me" : ""}" cx="${x(p.at).toFixed(1)}" cy="${y(p.amount).toFixed(1)}" r="${p.mine ? 4.2 : 3.2}"><title>${esc(`${money(p.amount)} ریال — ${hms(p.at)}`)}</title></circle>`).join("");
    return `<svg class="td-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="نمودارِ کمترین قیمت در طولِ مناقصه">
      <defs><linearGradient id="tdArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6aa0ff" stop-opacity=".32"/><stop offset="1" stop-color="#6aa0ff" stop-opacity="0"/></linearGradient></defs>
      ${grid}${line(o.start, "start", "قیمتِ شروع")}${line(o.floor, "floor", "کف")}${o.ref ? line(o.ref.v, "ref", o.ref.label) : ""}<path class="ar" d="${area}"/><path class="ln" d="${d}"/>${dots}
      <text class="lab" x="${L}" y="${H - 6}">${esc(hms(t0))}</text><text class="lab" x="${W - R}" y="${H - 6}" text-anchor="end">${esc(hms(t1))}</text></svg>`;
  }

  /** کارت‌های بازار — مبلغ‌های ریالی به تومان */
  function market(m) {
    if (!m) return `<div class="td-empty">در حال خواندنِ قیمت‌ها…</div>`;
    if (!m.ok) return `<div class="td-empty">${esc(m.error || "قیمتِ لحظه‌ای در دسترس نیست.")}</div>`;
    return `<div class="td-mkt">${m.items.map((i) => `<div class="td-tick" title="بیشترین ${esc(i.usd ? money(i.h) : money(i.h / 10))} · کمترین ${esc(i.usd ? money(i.l) : money(i.l / 10))}">
        <small>${esc(i.fa)}</small><b>${i.usd ? `$${esc(fa(i.p.toLocaleString("en-US")))}` : `${money(i.p / 10)} <small>تومان</small>`}</b>
        ${i.dp ? `<i class="${i.dt === "low" ? "dn" : "up"}">${i.dt === "low" ? "▼" : "▲"} ${fa(String(i.dp).replace(".", "٫"))}٪</i>` : `<i>${esc(fa(i.t || ""))}</i>`}</div>`).join("")}</div>
      <div class="td-mkt-foot">منبع: ${esc(m.src || "")} · به‌روزرسانی ${esc(hms(m.at))}</div>`;
  }
  const dollar = (m) => { const i = m && m.ok && m.items.find((x) => x.k === "price_dollar_rl"); return i ? i.p : null; };

  /** ماشین‌حسابِ سود و زیان — c: {cost, usd, price, qty}؛ rate: نرخِ دلار (ریال) */
  function calc(c, rate) {
    const usd = Number(latin(c.usd).replace(/[,٬\s]/g, "").replace(/٫/g, "."));
    const cost = c.usd && rate ? (usd > 0 ? Math.round(usd * rate) : NaN) : parseAmt(c.cost);
    const price = parseAmt(c.price), qty = Number(latin(c.qty).replace(/[,٬\s]/g, "")) || 0;
    const ok = isFinite(cost) && isFinite(price) && cost > 0 && price > 0;
    const per = ok ? price - cost : null, tot = ok ? per * qty : null, pct = ok ? (per / price) * 100 : null;
    const tone = per == null ? "" : per >= 0 ? "ok" : "bad";
    const cell = (l, v) => `<div class="${tone}"><small>${l}</small><b>${v}</b></div>`;
    return `<div class="td-calc">
      <label>قیمتِ تمام‌شدهٔ شما (هر واحد، ریال)<input data-calc="cost" inputmode="numeric" value="${esc(c.cost || "")}" placeholder="مثلاً ۸۵۰٬۰۰۰" ${c.usd ? "disabled" : ""}></label>
      <label>یا بهای دلاری هر واحد${rate ? ` <span>(دلار ${money(rate / 10)} تومان)</span>` : ""}<input data-calc="usd" inputmode="decimal" value="${esc(c.usd || "")}" placeholder="مثلاً ۳۲۰" ${rate ? "" : "disabled"}></label>
      <label>قیمتِ پیشنهادی (هر واحد، ریال)<input data-calc="price" inputmode="numeric" value="${esc(c.price || "")}"></label>
      <label>مقدار<input data-calc="qty" inputmode="decimal" value="${esc(c.qty || "")}"></label>
      <div class="res">${cell("سودِ هر واحد", per == null ? "—" : `${per < 0 ? "−" : ""}${money(Math.abs(per))}`)}${cell("سودِ کل", tot == null ? "—" : `${tot < 0 ? "−" : ""}${short(Math.abs(tot))}`)}${cell("حاشیهٔ سود", pct == null ? "—" : `${fa(pct.toFixed(1).replace(".", "٫"))}٪`)}</div></div>`;
  }

  /** رنگِ ثابتِ نشانِ هر شمارهٔ ناشناس */
  const avColor = (n) => ["#4f8cff", "#a78bfa", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#14b8a6"][Math.abs(Number(n) || 0) % 10];

  window.TDUI = { fa, esc, latin, money, parseAmt, short, words, clock, hms, when, ST, stChip, ring, tickRing, chart, market, dollar, calc, avColor };
})();
