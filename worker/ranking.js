/**
 * رتبهٔ نهایی و «قاعدهٔ دعوت» — فاز ۲ طرح «خرید هوشمند، کارشناس ناظر» (مهر ۱۴۰۵)
 *
 * وزن‌ها (settings.rankWeights، پنل پشتیبانی): رتبهٔ نهایی میانگینِ وزنیِ رتبه‌های نسبیِ دفعات خرید، مقدار، گشتاور و ارزش خرید
 * به قیمت روز (دلار)، به‌اضافهٔ ردهٔ تأمین‌کننده (A ۱۰۰٪، B ۶۶٪، C ۳۳٪، بی‌رده صفر) — تصمیم ۶. k ضریب گشتاورِ همین رتبه است.
 * history.js:finalRank آن را برای هر فهرستِ سوابق حساب می‌کند؛ پیش‌فرضِ مرتب‌سازیِ پنل و ترتیبِ پیامک‌های کارشناس هوشمند همین است.
 *
 * قاعدهٔ دعوت (settings.aiDispatch؛ تصمیم ۳ کاربر، ۱۴۰۵/۰۷/۱۴): پیش‌فرض، تأمین‌کنندگانِ ردهٔ A در سوابقِ «عین قلم» — جدا از رتبهٔ
 * نهایی — تا ۵ نفر، بعد فهرستِ «نوع قلم» به ترتیبِ رتبهٔ نهایی. قابل تنظیم: ردهٔ B (و C) هم، سقفِ هر رده، و این‌که بعد از آن
 * نوع قلم اولویت داشته باشد، اول باقیِ سوابقِ عین قلم بیاید، یا فقط عین قلم.
 *
 * بی ایمپورت از history.js، تا history.js و ai-agent.js بی حلقه بپرسند.
 */
import { HttpError } from "./http.js";

export const RANK_KEY = "rankWeights";
export const DISPATCH_KEY = "aiDispatch";
export const RANK_DEFAULT = { n: 1, qty: 0, qtyM: 1, val: 1, grade: 1, k: 5 };
export const RANK_FA = { n: "دفعات خرید", qty: "مقدار خرید", qtyM: "امتیاز گشتاوری", val: "ارزش خرید به قیمت روز", grade: "رده" };
export const GRADE_SCORE = { A: 1, B: 0.66, C: 0.33 };
export const DISPATCH_DEFAULT = { tier: { A: 5, B: 0, C: 0 }, then: "type" };
export const THEN_FA = { type: "فهرستِ «نوع قلم» به ترتیبِ رتبهٔ نهایی", exact: "اول باقیِ سوابقِ «عین قلم»، بعد «نوع قلم» (هر دو به ترتیبِ رتبهٔ نهایی)", exactOnly: "فقط سوابقِ «عین قلم»" };

const T = (v) => String(v == null ? "" : v).trim();
const numIn = (v) => {
  const s = T(v).replace(/[۰-۹٠-٩]/g, (c) => String(c.charCodeAt(0) % 16)).replace(/٫/g, ".").replace(/[,٬\s]/g, "");
  return s === "" ? null : Number(s);
};

/** وزن‌ها: هر کدام ۰ تا ۱۰ (اعشار هم)، دست‌کم یکی بزرگ‌تر از صفر؛ k عدد صحیح ۱ تا ۱۰ */
export function cleanWeights(b) {
  const x = b && typeof b === "object" ? b : {};
  const out = {};
  for (const k of Object.keys(RANK_FA)) {
    const v = x[k] == null || x[k] === "" ? RANK_DEFAULT[k] : numIn(x[k]);
    if (!Number.isFinite(v) || v < 0 || v > 10) throw new HttpError(`وزنِ «${RANK_FA[k]}» باید عددی از ۰ تا ۱۰ باشد.`);
    out[k] = Math.round(v * 100) / 100;
  }
  if (!Object.keys(RANK_FA).some((k) => out[k] > 0)) throw new HttpError("دست‌کم یکی از وزن‌ها باید بیشتر از صفر باشد.");
  const k = x.k == null || x.k === "" ? RANK_DEFAULT.k : numIn(x.k);
  if (!Number.isInteger(k) || k < 1 || k > 10) throw new HttpError("ضریب گشتاور باید عدد صحیحِ ۱ تا ۱۰ باشد.");
  out.k = k;
  return out;
}

/** قاعدهٔ دعوت: tier {A,B,C} سقفِ هر رده در سوابقِ عین قلم (۰ یعنی آن رده جدا نمی‌آید)، then یکی از THEN_FA */
export function cleanDispatch(b) {
  const x = b && typeof b === "object" ? b : {};
  const tier = {};
  for (const g of ["A", "B", "C"]) {
    const v = x.tier && x.tier[g] != null && x.tier[g] !== "" ? numIn(x.tier[g]) : DISPATCH_DEFAULT.tier[g];
    if (!Number.isInteger(v) || v < 0 || v > 30) throw new HttpError(`سقفِ ردهٔ ${g} باید عدد صحیحِ ۰ تا ۳۰ باشد.`);
    tier[g] = v;
  }
  const then = THEN_FA[x.then] ? x.then : DISPATCH_DEFAULT.then;
  return { tier, then };
}

let cache = null;
/** {weights, dispatch, updated_at, by} — ۶۰ ثانیه در حافظهٔ isolate */
export async function getRanking(env, now = Date.now()) {
  if (cache && now - cache.at < 60000) return cache.v;
  const rows = ((await env.DB.prepare("SELECT key, value, updated_at FROM settings WHERE key IN (?,?)").bind(RANK_KEY, DISPATCH_KEY).all().catch(() => null)) || {}).results || [];
  const get = (k) => { const r = rows.find((x) => x.key === k); try { return r ? { v: JSON.parse(r.value), at: r.updated_at } : null; } catch (_) { return null; } };
  const w = get(RANK_KEY), d = get(DISPATCH_KEY);
  let weights, dispatch;
  try { weights = cleanWeights(w && w.v); } catch (_) { weights = { ...RANK_DEFAULT }; }
  try { dispatch = cleanDispatch(d && d.v); } catch (_) { dispatch = { tier: { ...DISPATCH_DEFAULT.tier }, then: DISPATCH_DEFAULT.then }; }
  const v = { weights, dispatch, updated_at: Math.max((w && w.at) || 0, (d && d.at) || 0) || null, by: (w && w.v && w.v.by) || (d && d.v && d.v.by) || null };
  cache = { at: now, v };
  return v;
}
export const resetRankingCache = () => { cache = null; };

/** ذخیره از پنل پشتیبانی — هر دو کلید و یک رخداد (گزارش رخدادها) */
export async function saveRanking(env, body, by = "support") {
  const weights = cleanWeights(body && body.weights);
  const dispatch = cleanDispatch(body && body.dispatch);
  const t = Date.now();
  const up = (k, v) => env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").bind(k, JSON.stringify({ ...v, by }), t);
  await env.DB.batch([up(RANK_KEY, weights), up(DISPATCH_KEY, dispatch),
    env.DB.prepare("INSERT INTO events (at,actor,kind,payload_json) VALUES (?,?,?,?)").bind(t, by, "ai_ranking", JSON.stringify({ weights, dispatch }))]);
  cache = null;
  return { weights, dispatch, updated_at: t, by };
}

/**
 * ترتیبِ دعوتِ یک قلم از سوابق، با قاعدهٔ دعوت. exact و type فهرستِ تأمین‌کنندگانِ «عین قلم» و «نوع قلم» با rankF و grade.
 * خروجی: [{...تأمین‌کننده، tier: "grade" | "exact" | "type"}] بی تکرار (با key).
 */
export function dispatchOrder({ exact = [], type = [] }, policy = DISPATCH_DEFAULT) {
  const p = policy || DISPATCH_DEFAULT;
  const byF = (a, b) => (a.rankF || 1e9) - (b.rankF || 1e9);
  const seen = new Set(), out = [];
  const take = (s, tier) => { const k = s.key || s.name; if (!k || seen.has(k)) return; seen.add(k); out.push({ ...s, tier }); };
  const ex = [...exact].sort(byF), ty = [...type].sort(byF);
  /* ۱) رده‌های برگزیده در عین قلم، هر کدام تا سقفش — به ترتیبِ رده (A، B، C) و درونِ هر رده به ترتیبِ رتبهٔ نهایی */
  for (const g of ["A", "B", "C"]) {
    const cap = (p.tier && p.tier[g]) || 0;
    if (cap > 0) ex.filter((s) => s.grade === g).slice(0, cap).forEach((s) => take(s, "grade"));
  }
  /* ۲) بعد از آن */
  if (p.then === "exact" || p.then === "exactOnly") ex.forEach((s) => take(s, "exact"));
  if (p.then !== "exactOnly") ty.forEach((s) => take(s, "type"));
  return out;
}
