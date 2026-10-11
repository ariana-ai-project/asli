/**
 * قواعدِ ناب «مناقصهٔ معکوس» (مهر ۱۴۰۵، درخواست مالک) — بی پایگاه داده، تا آزمون‌پذیر باشند.
 *
 * تأمین‌کنندگان قیمتِ واحد (ریال) را پایین می‌آورند و کمترین قیمت در پایان برنده است:
 *   • اولین پیشنهاد حداکثر «قیمتِ شروع» (سقف) است؛ هر پیشنهادِ بعدی دست‌کم «گامِ کاهش» از بهترینِ فعلی کمتر.
 *   • کف: هیچ پیشنهادی پایین‌تر از «قیمتِ شروع × (۱ − حداکثرِ کاهش٪)» پذیرفته نمی‌شود (جلوی قیمتِ غیرمنطقی).
 *   • ضدِ اشتباهِ تایپی: هر پیشنهاد حداکثر «پرشِ مجاز٪» از بهترینِ فعلی پایین‌تر است (صفرِ جاافتاده ده برابر ارزان‌تر می‌کند و رد می‌شود).
 *   • ضدِ لحظهٔ آخر: پیشنهادِ معتبر در «پنجرهٔ تمدید»ِ پایانی، پایان را به «اکنون + مدتِ تمدید» می‌برد — هر بار.
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
});

const int = (v) => Math.round(Number(v) || 0);

/** وضعیتِ مناقصه در لحظهٔ now: draft | scheduled | live | ended | cancelled */
export function tenderState(t, now) {
  if (!t) return "draft";
  if (t.state === "cancelled") return "cancelled";
  if (t.state === "ended") return "ended";
  if (t.state === "draft" || !t.start_at || !t.end_at) return "draft";
  if (now < t.start_at) return "scheduled";
  if (now >= t.end_at) return "ended";
  return "live";
}

/** گامِ کاهش برای بهترینِ فعلی (ریال؛ دست‌کم ۱) */
export function stepOf(t, best) {
  const pct = Number(t.step_pct ?? TENDER_DEFAULTS.step_pct);
  return Math.max(1, int(t.step_min || 0), Math.ceil((Number(best) || 0) * pct / 100));
}

/** کفِ مطلق (ریال) */
export const floorOf = (t) => Math.ceil(Number(t.start_price) * (1 - Number(t.floor_pct ?? TENDER_DEFAULTS.floor_pct) / 100));

/**
 * بازهٔ مجازِ پیشنهادِ بعدی: {max, min, step, floor}
 * max: بالاترین مبلغِ پذیرفتنی (بی پیشنهاد = قیمتِ شروع؛ وگرنه بهترین − گام) — min: پایین‌ترین (کف یا پرشِ مجاز، هر کدام بالاتر).
 */
export function bidRange(t) {
  const best = t.best_amount == null ? null : Number(t.best_amount);
  const floor = floorOf(t);
  if (best == null) return { max: int(t.start_price), min: floor, step: 0, floor };
  const step = stepOf(t, best);
  const jumpMin = Math.ceil(best * (1 - Number(t.jump_pct ?? TENDER_DEFAULTS.jump_pct) / 100));
  return { max: best - step, min: Math.max(floor, jumpMin), step, floor };
}

const fa = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, "٬").replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[+d]);

/**
 * پیشنهادِ amount از نفرِ alias در لحظهٔ now پذیرفتنی است؟ خروجی {ok:true, range} یا {ok:false, code, error, range}.
 * code: state | own | high | low | floor | nan
 */
export function checkBid(t, amount, alias, now) {
  const st = tenderState(t, now);
  const range = bidRange(t);
  if (st !== "live") return { ok: false, code: "state", range, error: st === "scheduled" ? "مناقصه هنوز شروع نشده است." : st === "ended" ? "مناقصه تمام شده است." : "این مناقصه باز نیست." };
  const a = Number(amount);
  if (!Number.isFinite(a) || a <= 0 || Math.round(a) !== a) return { ok: false, code: "nan", range, error: "مبلغ را به ریال و بی اعشار بنویسید." };
  if (t.best_alias != null && Number(t.best_alias) === Number(alias)) return { ok: false, code: "own", range, error: "بهترین قیمت همین حالا مالِ شماست؛ لازم نیست خودتان را پایین بیاورید." };
  if (a > range.max) {
    return { ok: false, code: "high", range, error: t.best_amount == null
      ? `اولین پیشنهاد حداکثر ${fa(range.max)} ریال (قیمتِ شروع) است.`
      : `پیشنهاد باید دست‌کم ${fa(range.step)} ریال کمتر از بهترین قیمت باشد: حداکثر ${fa(range.max)} ریال.` };
  }
  if (a < range.floor) return { ok: false, code: "floor", range, error: `کمتر از ${fa(range.floor)} ریال پذیرفته نمی‌شود (کفِ این مناقصه).` };
  if (a < range.min) return { ok: false, code: "low", range, error: `هر پیشنهاد حداکثر ${fa(t.jump_pct ?? TENDER_DEFAULTS.jump_pct)}٪ از بهترین قیمت پایین‌تر است: دست‌کم ${fa(range.min)} ریال. اگر واقعاً این قیمت را می‌دهید، چند مرحله پایین بیایید.` };
  return { ok: true, range };
}

/**
 * پایانِ تازه با پیشنهادِ معتبر در لحظهٔ now: {end_at, extended}
 * فقط اگر تا پایان کمتر از «پنجرهٔ تمدید» مانده و سقفِ دفعات پر نشده؛ پایان هیچ‌وقت عقب نمی‌رود.
 */
export function extendOnBid(t, now) {
  const win = int(t.ext_window_s ?? TENDER_DEFAULTS.ext_window_s) * 1000, len = int(t.ext_s ?? TENDER_DEFAULTS.ext_s) * 1000;
  const max = int(t.ext_max ?? 0), cnt = int(t.ext_count || 0);
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
  const order = [...mine.values()].sort((a, b) => a.amount - b.amount || a.at - b.at);
  return new Map(order.map((x, i) => [x.alias, { rank: i + 1, amount: x.amount }]));
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
