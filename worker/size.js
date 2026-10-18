/**
 * برچسبِ اندازهٔ درخواست — «جزئی / متوسط / بزرگ / عمده» (مهر ۱۴۰۵، درخواست مالک)
 *
 * • مرزها به تومان‌اند (۱ تومان = ۱۰ ریال)؛ مبلغ‌های دیتابیس ریالی‌اند — تبدیل فقط همین‌جا (rialToToman).
 *     جزئی ≤ th[0] < متوسط ≤ th[1] < بزرگ ≤ th[2] < عمده
 * • هر قلم برآوردِ قیمت واحد دارد (worker/estimate.js → items.est_unit_rial، ریال)؛ برآوردِ کلِ قلم = قیمت واحد × مقدار.
 *   برچسبِ درخواست = ردهٔ جمعِ برآوردِ کلِ اقلام؛ اگر قلمی بی‌برآورد است برچسب «ناقص» است (partial).
 * • همین تنظیم حداقلِ استعلامِ هر رده (minQ، فاز ۳) و «موجِ دوم» دعوت (waitAt٪ از مهلت، فاز ۴) را هم دارد — یک شیء برای همه:
 *     settings.sizeRules = { th: [50e6, 200e6, 5e9] (تومان), minQ: { s: 3, m: 5, l: 5, b: 7 }, waveAt: 20 }
 * فقط پنل پشتیبانی ذخیره‌اش می‌کند (PUT /support/size-rules)؛ پنل‌های دیگر از settings می‌خوانند.
 */
import { HttpError } from "./http.js";

export const SIZE_KEY = "sizeRules";
export const SIZES = ["s", "m", "l", "b"];
export const SIZE_FA = { s: "جزئی", m: "متوسط", l: "بزرگ", b: "عمده" };
export const SIZE_DEFAULT = { th: [50e6, 200e6, 5e9], minQ: { s: 3, m: 5, l: 5, b: 7 }, waveAt: 20 };
const MAX_MIN = 20;
const FA = "۰۱۲۳۴۵۶۷۸۹";
const faN = (s) => String(s).replace(/\d/g, (d) => FA[+d]);

/** ریال ← تومان */
export const rialToToman = (r) => (r == null || !Number.isFinite(Number(r)) ? null : Number(r) / 10);

/** مبلغِ تومانی به متنِ کوتاه: «۵۰ میلیون»، «۵ میلیارد»، «۱٫۲ میلیارد» */
export function tomanTxt(t) {
  const n = Number(t);
  if (!Number.isFinite(n)) return "—";
  const fmt = (x) => faN(String(Math.round(x * 10) / 10)).replace(".", "٫");
  if (n >= 1e9) return `${fmt(n / 1e9)} میلیارد`;
  if (n >= 1e6) return `${fmt(n / 1e6)} میلیون`;
  if (n >= 1e3) return `${fmt(n / 1e3)} هزار`;
  return fmt(n);
}

/** ورودیِ پنل ← تنظیمِ سنجیده؛ نادرست ← ۴۰۰ با پیامِ فارسی */
export function cleanSizeRules(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const th = Array.isArray(r.th) ? r.th.map(Number) : SIZE_DEFAULT.th.slice();
  if (th.length !== 3 || th.some((x) => !Number.isFinite(x) || x <= 0)) throw new HttpError("سه مرزِ مثبت (تومان) لازم است.");
  if (!(th[0] < th[1] && th[1] < th[2])) throw new HttpError("مرزها باید صعودی باشند: جزئی < متوسط < بزرگ < عمده.");
  const mq = r.minQ && typeof r.minQ === "object" ? r.minQ : {};
  const minQ = {};
  for (const k of SIZES) {
    const v = mq[k] == null ? SIZE_DEFAULT.minQ[k] : Number(mq[k]);
    if (!Number.isInteger(v) || v < 1 || v > MAX_MIN) throw new HttpError(`حداقلِ استعلامِ «${SIZE_FA[k]}» عددی صحیح از ۱ تا ${faN(MAX_MIN)} است.`);
    minQ[k] = v;
  }
  const w = r.waveAt == null ? SIZE_DEFAULT.waveAt : Number(r.waveAt);
  if (!Number.isInteger(w) || w < 5 || w > 95) throw new HttpError("گامِ موجِ دعوت درصدی صحیح از ۵ تا ۹۵ است.");
  return { th: th.map((x) => Math.round(x)), minQ, waveAt: w };
}

/** تنظیمِ ذخیره‌شده (یا پیش‌فرض) از شیءِ settings — خراب ← پیش‌فرض */
export function sizeRulesOf(settings) {
  try { return cleanSizeRules(settings && settings[SIZE_KEY]); } catch (_) { return JSON.parse(JSON.stringify(SIZE_DEFAULT)); }
}
export async function getSizeRules(env) {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(SIZE_KEY).first().catch(() => null);
  let v = null; try { v = r && r.value ? JSON.parse(r.value) : null; } catch (_) { v = null; }
  return sizeRulesOf({ [SIZE_KEY]: v });
}
export async function saveSizeRules(env, body, by = "support") {
  const rules = cleanSizeRules(body);
  const t = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
      .bind(SIZE_KEY, JSON.stringify(rules), t),
    env.DB.prepare("INSERT INTO events (at,actor,kind,payload_json) VALUES (?,?,?,?)").bind(t, by, "size_rules", JSON.stringify(rules)),
  ]);
  return { ...rules, updated_at: t };
}

/** ردهٔ یک مبلغِ تومانی؛ null ← null */
export function sizeCat(toman, th = SIZE_DEFAULT.th) {
  if (toman == null || !Number.isFinite(Number(toman))) return null;
  const n = Number(toman);
  return n <= th[0] ? "s" : n <= th[1] ? "m" : n <= th[2] ? "l" : "b";
}
/** ردهٔ یک مبلغِ ریالی */
export const sizeOfRial = (rial, th) => sizeCat(rialToToman(rial), th);

/** برآوردِ کلِ یک قلم (ریال) یا null — قیمت واحد × مقدار */
export function itemEstTotal(it) {
  const u = Number(it && it.est_unit_rial), q = Number(it && it.qty);
  return it && it.est_unit_rial != null && Number.isFinite(u) && u > 0 && Number.isFinite(q) && q > 0 ? u * q : null;
}

/**
 * برچسبِ درخواست از اقلامش (اقلامِ «متوقف» نه). خروجی:
 *   { cat: s|m|l|b|null, total_rial, n, est, miss, pend, partial }
 *   est: اقلامِ با برآورد · miss: برآورد شد ولی چیزی پیدا نشد (بی‌برآورد) · pend: هنوز برآورد نشده (est_at خالی)
 */
export function reqSize(items, rules) {
  const th = (rules && rules.th) || SIZE_DEFAULT.th;
  let total = 0, n = 0, est = 0, miss = 0, pend = 0;
  for (const it of items || []) {
    if (!it || it.state === "stop") continue;
    n++;
    const t = itemEstTotal(it);
    if (t != null) { est++; total += t; } else if (it.est_at == null) pend++; else miss++;
  }
  return { cat: est ? sizeOfRial(total, th) : null, total_rial: est ? total : null, n, est, miss, pend, partial: est > 0 && est < n };
}
/** همان، از جمع‌های SQL (کارتابلِ کارشناس): {est_sum, est_n, est_ok, est_pend} */
export function reqSizeAgg(a, rules) {
  const th = (rules && rules.th) || SIZE_DEFAULT.th;
  const n = Number(a && a.est_n) || 0, est = Number(a && a.est_ok) || 0, pend = Number(a && a.est_pend) || 0;
  const total = est ? Number(a.est_sum) || 0 : null;
  return { cat: est ? sizeOfRial(total, th) : null, total_rial: total, n, est, miss: Math.max(0, n - est - pend), pend, partial: est > 0 && est < n };
}

/** حداقلِ استعلامِ یک رده (فاز ۳)؛ بی رده ← جزئی */
export const minQOf = (rules, cat) => {
  const m = (rules && rules.minQ) || SIZE_DEFAULT.minQ;
  return m[cat] || m.s || SIZE_DEFAULT.minQ.s;
};
