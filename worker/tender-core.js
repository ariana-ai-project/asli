/**
 * قواعدِ ناب «مناقصهٔ معکوس» (مهر ۱۴۰۵، درخواست مالک) — بی پایگاه داده، تا آزمون‌پذیر باشند.
 *
 * تأمین‌کنندگان قیمتِ واحد (ریال) را پایین می‌آورند و کمترین قیمت در پایان برنده است:
 *   • اولین پیشنهاد حداکثر «قیمتِ شروع» (سقف) است؛ هر پیشنهادِ بعدی دست‌کم «گامِ کاهش» از بهترینِ فعلی کمتر.
 *   • کف: هیچ پیشنهادی پایین‌تر از «قیمتِ شروع × (۱ − حداکثرِ کاهش٪)» پذیرفته نمی‌شود (جلوی قیمتِ غیرمنطقی).
 *   • ضدِ اشتباهِ تایپی: هر پیشنهاد حداکثر «پرشِ مجاز٪» از بهترینِ فعلی پایین‌تر است (صفرِ جاافتاده ده برابر ارزان‌تر می‌کند و رد می‌شود).
 *   • ضدِ لحظهٔ آخر: پیشنهادِ معتبر در «پنجرهٔ تمدید»ِ پایانی، پایان را به «اکنون + مدتِ تمدید» می‌برد — هر بار.
 * افزوده‌های دورِ دوم (مهر ۱۴۰۵):
 *   • «دورِ سربسته»: از شروع تا sealed_end_at هر کس یک پیشنهادِ پنهان می‌دهد (فقط پایین‌تر از پیشنهادِ قبلیِ خودش)؛ بعد دورِ زنده
 *     از کمترینِ همان پیشنهادها ادامه می‌یابد. تمدیدِ لحظهٔ آخر در دورِ سربسته نیست.
 *   • «فقط رتبه» (show_prices=0): کمترین قیمت پیدا نیست؛ هر کس فقط از پیشنهادِ خودش پایین می‌آید و رتبه‌اش را می‌بیند.
 *   • «پیشنهادِ خودکار» (proxyRun): هر کس کفِ قیمتِ خودش را می‌دهد و سامانه به‌جایش کمترین لازم را پایین می‌آید.
 * همهٔ عددها صحیح (ریال)؛ درصدها عددِ معمولی (۰٫۵ یعنی نیم درصد).
 */

export const TENDER_DEFAULTS = Object.freeze({
  step_pct: 0.5,      // حداقلِ کاهشِ هر پیشنهاد نسبت به بهترینِ فعلی (٪)
  step_min: 0,        // حداقلِ کاهش به ریال (هر کدام بیشتر بود)
  floor_pct: 30,      // کف: حداکثر کاهش نسبت به قیمتِ شروع (٪)
  jump_pct: 10,       // حداکثر کاهشِ یکباره نسبت به بهترینِ فعلی (٪)
  ext_window_s: 180,  // پیشنهاد در این چند ثانیهٔ آخر ← تمدید
  ext_s: 180,         // تمدید تا «اکنون + این چند ثانیه»
  ext_max: 0,         // سقفِ دفعاتِ تمدید (۰ = بی سقف)
  duration_s: 1800,   // مدتِ پیش‌فرض (نیم ساعت)
  sealed_s: 0,        // دورِ سربسته پیش از دورِ زنده (۰ = ندارد)
  show_names: 0,      // نامِ تأمین‌کنندگان برای یکدیگر
  show_prices: 1,     // کمترین قیمت و پیشنهادهای دیگران پیداست (۰ = «فقط رتبه»)
  proxy_on: 1,        // «پیشنهادِ خودکار» مجاز است
  require_accept: 0,  // پیش از اولین پیشنهاد، پذیرشِ شرایط لازم است
  outbid_sms: 1,      // وقتی رتبهٔ کسی پایین آمد پیامک (و تلگرامِ بات) بگیرد
  outbid_gap_s: 120,  // دست‌کم این فاصله میانِ دو پیامکِ «عقب افتادید» به یک نفر
  thanks_sms: 1,      // در پایان به شرکت‌کنندگانِ غیرِبرنده پیامِ تشکر برود
});

const int = (v) => Math.round(Number(v) || 0);

/** وضعیتِ مناقصه در لحظهٔ now: draft | scheduled | sealed | live | ended | cancelled */
export function tenderState(t, now) {
  if (!t) return "draft";
  if (t.state === "cancelled") return "cancelled";
  if (t.state === "ended") return "ended";
  if (t.state === "draft" || !t.start_at || !t.end_at) return "draft";
  if (now < t.start_at) return "scheduled";
  if (now >= t.end_at) return "ended";
  if (t.sealed_end_at && now < t.sealed_end_at) return "sealed";
  return "live";
}

/** گامِ کاهش برای مبلغِ مرجع (ریال؛ دست‌کم ۱) */
export function stepOf(t, best) {
  const pct = Number(t.step_pct ?? TENDER_DEFAULTS.step_pct);
  return Math.max(1, int(t.step_min || 0), Math.ceil((Number(best) || 0) * pct / 100));
}

/** کفِ مطلق (ریال) */
export const floorOf = (t) => Math.ceil(Number(t.start_price) * (1 - Number(t.floor_pct ?? TENDER_DEFAULTS.floor_pct) / 100));
const jumpMin = (t, ref) => Math.ceil(ref * (1 - Number(t.jump_pct ?? TENDER_DEFAULTS.jump_pct) / 100));
const pricesShown = (t) => Number(t.show_prices ?? 1) !== 0;

/**
 * بازهٔ مجازِ پیشنهادِ بعدی: {max, min, step, floor, mode}
 * mine: کمترین پیشنهادِ معتبرِ همین نفر (برای دورِ سربسته و «فقط رتبه»). sealed: دورِ سربسته است.
 * mode: open (بهترینِ همه مرجع است) | own (پیشنهادِ خودِ نفر مرجع است) | sealed
 */
export function bidRange(t, mine, sealed) {
  const floor = floorOf(t), start = int(t.start_price);
  const own = mine == null ? null : Number(mine);
  if (sealed) {
    /* سربسته: هر مبلغی تا سقف و تا کف؛ دوباره فقط پایین‌تر از پیشنهادِ خودِ همان نفر */
    if (own == null) return { max: start, min: floor, step: 0, floor, mode: "sealed" };
    const step = stepOf(t, own);
    return { max: own - step, min: floor, step, floor, mode: "sealed" };
  }
  if (!pricesShown(t)) {
    if (own == null) return { max: start, min: Math.max(floor, jumpMin(t, start)), step: 0, floor, mode: "own" };
    const step = stepOf(t, own);
    return { max: own - step, min: Math.max(floor, jumpMin(t, own)), step, floor, mode: "own" };
  }
  const best = t.best_amount == null ? null : Number(t.best_amount);
  if (best == null) return { max: start, min: floor, step: 0, floor, mode: "open" };
  const step = stepOf(t, best);
  return { max: best - step, min: Math.max(floor, jumpMin(t, best)), step, floor, mode: "open" };
}

const fa = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, "٬").replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[+d]);

/**
 * پیشنهادِ amount از نفرِ alias در لحظهٔ now پذیرفتنی است؟ خروجی {ok:true, range, phase} یا {ok:false, code, error, range}.
 * mine: کمترین پیشنهادِ معتبرِ همین نفر (یا null). code: state | own | high | low | floor | nan
 */
export function checkBid(t, amount, alias, now, mine) {
  const st = tenderState(t, now);
  const sealed = st === "sealed";
  const range = bidRange(t, mine, sealed);
  if (st !== "live" && !sealed) return { ok: false, code: "state", range, error: st === "scheduled" ? "مناقصه هنوز شروع نشده است." : st === "ended" ? "مناقصه تمام شده است." : "این مناقصه باز نیست." };
  const a = Number(amount);
  if (!Number.isFinite(a) || a <= 0 || Math.round(a) !== a) return { ok: false, code: "nan", range, error: "مبلغ را به ریال و بی اعشار بنویسید." };
  if (!sealed && t.best_alias != null && Number(t.best_alias) === Number(alias)) return { ok: false, code: "own", range, error: "بهترین قیمت همین حالا مالِ شماست؛ لازم نیست خودتان را پایین بیاورید." };
  if (a > range.max) {
    const msg = range.mode === "open" && t.best_amount != null
      ? `پیشنهاد باید دست‌کم ${fa(range.step)} ریال کمتر از بهترین قیمت باشد: حداکثر ${fa(range.max)} ریال.`
      : mine != null ? `پیشنهادِ تازه باید دست‌کم ${fa(range.step)} ریال کمتر از پیشنهادِ قبلیِ خودتان باشد: حداکثر ${fa(range.max)} ریال.`
        : `اولین پیشنهاد حداکثر ${fa(range.max)} ریال (قیمتِ شروع) است.`;
    return { ok: false, code: "high", range, error: msg };
  }
  if (a < range.floor) return { ok: false, code: "floor", range, error: `کمتر از ${fa(range.floor)} ریال پذیرفته نمی‌شود (کفِ این مناقصه).` };
  if (a < range.min) return { ok: false, code: "low", range, error: `هر پیشنهاد حداکثر ${fa(t.jump_pct ?? TENDER_DEFAULTS.jump_pct)}٪ پایین‌تر از ${range.mode === "own" ? "پیشنهادِ قبلیِ خودتان" : "بهترین قیمت"} است: دست‌کم ${fa(range.min)} ریال. اگر واقعاً این قیمت را می‌دهید، چند مرحله پایین بیایید.` };
  return { ok: true, range, phase: sealed ? "sealed" : "live" };
}

/**
 * پایانِ تازه با پیشنهادِ معتبر در لحظهٔ now: {end_at, extended}
 * فقط در دورِ زنده، اگر تا پایان کمتر از «پنجرهٔ تمدید» مانده و سقفِ دفعات پر نشده؛ پایان هیچ‌وقت عقب نمی‌رود.
 */
export function extendOnBid(t, now) {
  const win = int(t.ext_window_s ?? TENDER_DEFAULTS.ext_window_s) * 1000, len = int(t.ext_s ?? TENDER_DEFAULTS.ext_s) * 1000;
  const max = int(t.ext_max ?? 0), cnt = int(t.ext_count || 0);
  if (t.sealed_end_at && now < t.sealed_end_at) return { end_at: t.end_at, extended: false };
  if (!win || !len || !t.end_at || t.end_at - now > win || (max && cnt >= max)) return { end_at: t.end_at, extended: false };
  const end = Math.max(t.end_at, now + len);
  return { end_at: end, extended: end > t.end_at };
}

/** بهترین (کمترین) پیشنهادِ معتبر از میانِ پیشنهادها؛ هم‌قیمت‌ها: زودتر برنده — null اگر هیچ */
export function bestOf(bids) {
  let b = null;
  for (const x of bids || []) {
    if (x.state === "void") continue;
    if (!b || x.amount < b.amount || (x.amount === b.amount && (x.at < b.at || (x.at === b.at && x.id < b.id)))) b = x;
  }
  return b;
}

/** رتبهٔ هر نفر (۱ = کمترین) از بهترین پیشنهادِ معتبرِ خودش: Map(alias → {rank, amount}) */
export function ranksOf(bids) {
  const mine = new Map();
  for (const x of bids || []) {
    if (x.state === "void") continue;
    const m = mine.get(x.alias);
    if (!m || x.amount < m.amount || (x.amount === m.amount && x.at < m.at)) mine.set(x.alias, x);
  }
  const order = [...mine.values()].sort((a, b) => a.amount - b.amount || a.at - b.at || (a.id || 0) - (b.id || 0));
  return new Map(order.map((x, i) => [x.alias, { rank: i + 1, amount: x.amount }]));
}
/** کمترین پیشنهادِ معتبرِ یک نفر (یا null) */
export function mineOf(bids, alias) {
  let m = null;
  for (const x of bids || []) if (x.state !== "void" && x.alias === alias && (m == null || x.amount < m)) m = x.amount;
  return m;
}

/**
 * کسانی که رتبه‌شان با پیشنهادهای تازه پایین آمد: [{alias, from, to}] — جز خودِ پیشنهاددهنده‌های همین دور (skip)
 * before/after: خروجیِ ranksOf
 */
export function rankDrops(before, after, skip) {
  const out = [];
  for (const [alias, b] of before) {
    if (skip && skip.has(alias)) continue;
    const a = after.get(alias);
    if (a && a.rank > b.rank) out.push({ alias, from: b.rank, to: a.rank });
  }
  return out;
}

/**
 * «پیشنهادِ خودکار»: هر نفری که کفِ خودکارش اجازه می‌دهد، کمترین لازم را پایین می‌آید تا پیشتاز شود؛ اگر پیشتازِ فعلی هم
 * خودکار دارد، مستقیم به نتیجه می‌پرد (کسی که کفِ پایین‌تری دارد، یک گام زیرِ کفِ دیگری برنده می‌شود).
 * t: {start_price, step_pct, step_min, best_amount, best_alias}؛ proxies: [{alias, min, at}].
 * خروجی: [{alias, amount}] به ترتیب — پرشِ مجاز (ضدِ اشتباهِ تایپی) برای ماشین لازم نیست؛ کف را خودِ min رعایت کرده است.
 */
export function proxyRun(t, proxies) {
  const P = (proxies || []).filter((p) => p && p.min != null && Number(p.min) > 0).map((p) => ({ alias: p.alias, min: int(p.min), at: p.at || 0 }))
    .sort((a, b) => a.min - b.min || a.at - b.at);
  const out = [];
  let best = t.best_amount == null ? null : Number(t.best_amount), lead = t.best_alias == null ? null : Number(t.best_alias);
  const push = (alias, amount) => { out.push({ alias, amount }); best = amount; lead = alias; };
  for (let i = 0; i < 40 && P.length; i++) {
    if (best == null) {
      const c = P.find((p) => p.min <= int(t.start_price));
      if (!c) break;
      push(c.alias, int(t.start_price));
      continue;
    }
    const need = best - stepOf(t, best);
    const c = P.find((p) => p.alias !== lead && p.min <= need);
    if (!c) break;
    const lp = P.find((p) => p.alias === lead && p.min < best);
    if (!lp) { push(c.alias, Math.max(c.min, need)); continue; }
    const beatLeaderLimit = lp.min - stepOf(t, lp.min);
    if (c.min <= beatLeaderLimit) {
      /* پیشتاز تا کفِ خودش می‌آید و چالش‌گر یک گام زیرِ آن */
      push(lp.alias, lp.min);
      push(c.alias, Math.max(c.min, beatLeaderLimit));
    } else {
      /* چالش‌گر تا کفِ خودش؛ پیشتاز اگر بتواند یک گام زیرِ آن */
      push(c.alias, c.min);
      const back = c.min - stepOf(t, c.min);
      if (lp.min <= back) push(lp.alias, Math.max(lp.min, back));
    }
  }
  return out;
}

/** تبدیلِ عدد به حروفِ فارسی (برای پنجرهٔ «آیا مطمئنید؟»؛ تا ده‌ها هزار میلیارد) */
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
export function numWords(v) {
  let n = Math.floor(Math.abs(Number(v) || 0));
  if (!n) return "صفر";
  const parts = [];
  for (let i = 0; n > 0 && i < SCALES.length; i++) {
    const g = n % 1000; n = Math.floor(n / 1000);
    if (g) parts.unshift(`${three(g)}${SCALES[i] ? ` ${SCALES[i]}` : ""}`);
  }
  return parts.join(" و ");
}
