/**
 * «جعبه‌های نقد» — فاز ۳ طرح «پیام اول، استراتژی‌ها، پروفایل و گراف» (سند طراحی، بخشِ «جعبه‌های نقد»؛ تصمیم ۷)
 *
 * جعبه‌ها مرحله‌های کارِ کارشناس هوشمند را دنبال می‌کنند — فهم، تصمیم، بیان، حفاظت و فرایند — و هر کدام به یک جزءِ روال
 * برمی‌گردد؛ پس شمردنشان نشان می‌دهد کدام جزء باید اصلاح شود، نه فقط اینکه پیامی بد بوده (با هفت جزءِ مذاکرهٔ هاروارد هم
 * می‌خوانند). با کد ذخیره می‌شوند (ai_rates.boxes، ai_props.boxes، ai_feedback.boxes — آرایهٔ JSON) تا در «⭐ ارزیابی ربات» شمرده
 * شوند. پشتِ کلیدِ boxes پنل پشتیبانی:
 *   • «✏️ رد»ِ پیشنهاد: علت (همان اجباریِ همکار) + دست‌کم یک جعبه + پیامِ جایگزین؛ «✅ ارسال» توضیح نمی‌خواهد.
 *   • ستارهٔ پیام: ۱ و ۲ توضیح (همکار) + دست‌کم یک جعبه؛ ۳ تا ۵ هر دو اختیاری. کلِ مکاتبه: جعبه اختیاری.
 *   • «خاتمه»: «نظرِ کلی دربارهٔ کلِ مذاکرهٔ این درخواست» (ai_rates با kind='request') — کوتاه و اجباری، مثلِ نظرهای همکار.
 * راهبرد (سند راهبردِ هر نوع قلم) جعبه‌های خودش را دارد (STRAT_BOXES).
 * بی ایمپورت از ai-agent.js، ai-rates.js و sp-core.js، تا همه بی حلقه بخوانند.
 */
import { HttpError } from "./http.js";

const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };

export const BOXES = [
  { code: "understand", stage: "فهم", fa: "درک پیام", desc: "وضعیتِ پیام را درست نشناخت؛ مثلاً پرسش را پیشنهاد گرفت یا شرطی را ندید", part: "طبقه‌بندِ وضعیت (P3)" },
  { code: "context", stage: "فهم", fa: "زمینه", desc: "پیام‌های قبلی، یادداشتِ مشترک، شرایطِ خرید یا پروفایل را ندید یا بد به کار برد", part: "سازندهٔ زمینه" },
  { code: "strategy", stage: "تصمیم", fa: "پیروی از راهبرد", desc: "از وزن‌ها، بسته‌ها یا قیدهای سندِ راهبرد دور شد", part: "سندِ راهبرد و مذاکره‌گر (P4)" },
  { code: "move", stage: "تصمیم", fa: "انتخاب حرکت", desc: "زود پذیرفت، بی‌جا امتیاز داد یا دیر به کارشناس سپرد", part: "جدولِ وضعیت و حرکت" },
  { code: "number", stage: "تصمیم", fa: "عدد پیشنهاد", desc: "عددِ پیشنهاد یا امتیاز نادرست، تند یا پس‌گرفته بود", part: "موتورِ قطعی و پارامترهای مذاکره" },
  { code: "tone", stage: "بیان", fa: "لحن و روشنی", desc: "لحنِ نامناسب، پیامِ بلند یا مبهم، یا پرسشِ تکراری", part: "نویسندهٔ متن (P4)" },
  { code: "leak", stage: "حفاظت", fa: "محرمانگی", desc: "قیمتِ مرجع، حد، فوریت، نام یا قیمتِ دیگران یا نظرها را لو داد", part: "اعتبارسنج" },
  { code: "claim", stage: "حفاظت", fa: "تعهد و ادعا", desc: "از طرفِ شرکت تعهد داد یا ادعای بی‌شاهد کرد", part: "اعتبارسنج و قاعدهٔ «هر ادعا با شاهد»" },
  { code: "pace", stage: "فرایند", fa: "پیشبرد و زمان", desc: "پیگیری نکرد، کار را کش داد یا به نتیجه نرساند", part: "زمان‌بند و وضعیت‌های سکوت" },
];
export const STRAT_BOXES = [
  { code: "s_market", fa: "خوانش بازار" }, { code: "s_breadth", fa: "پهنا و پخش استعلام" }, { code: "s_target", fa: "هدف و حد" },
  { code: "s_rounds", fa: "آهنگ و شمار دور" }, { code: "s_packages", fa: "بسته‌های معاوضه" }, { code: "s_terms", fa: "قیدها و شرط تحویل" },
  { code: "s_risks", fa: "ریسک‌ها" }, { code: "s_clarity", fa: "خوانایی" },
];
export const BOX_FA = Object.fromEntries([...BOXES, ...STRAT_BOXES].map((b) => [b.code, b.fa]));
const CODES = new Set(BOXES.map((b) => b.code));
const S_CODES = new Set(STRAT_BOXES.map((b) => b.code));

/** کلیدِ «جعبه‌های نقد» در پنل پشتیبانی (settings.crFlags.boxes؛ همان cr-api.js:crFlags، بی ایمپورت تا حلقه نسازد) */
export async function boxesOn(env) {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key='crFlags'").first().catch(() => null);
  return !!(parse(r && r.value, {}) || {}).boxes;
}

/**
 * جعبه‌های ورودی: آرایهٔ کد (یا رشتهٔ جداشده با «,»)، یکتا و به ترتیبِ فهرست؛ کدِ ناشناخته ← ۴۲۲. need: دست‌کم یکی ← ۴۲۲ با need_boxes.
 * strategy: فهرستِ جعبه‌های راهبرد.
 */
export function boxesIn(v, { need = false, strategy = false, what = "" } = {}) {
  const raw = Array.isArray(v) ? v : typeof v === "string" && v.trim() ? v.split(/[,،\s]+/) : [];
  const set = strategy ? S_CODES : CODES, list = strategy ? STRAT_BOXES : BOXES;
  const got = new Set();
  for (const x of raw) {
    const c = String(x == null ? "" : x).trim();
    if (!c) continue;
    if (!set.has(c)) throw new HttpError(`جعبهٔ نقدِ «${c.slice(0, 30)}» شناخته نیست.`, 422);
    got.add(c);
  }
  const out = list.map((b) => b.code).filter((c) => got.has(c));
  if (need && !out.length) throw new HttpError(`${what || "برای این کار"} دست‌کم یک جعبهٔ نقد بزنید — کدام جزءِ کارِ کارشناس هوشمند درست نبود؟`, 422, { need_boxes: true });
  return out;
}
/** آرایهٔ ذخیره‌شده (ستونِ boxes) ← کدها */
export const boxesOf = (s) => { const a = parse(s, []); return Array.isArray(a) ? a.filter((c) => BOX_FA[c]) : []; };
/** «لحن و روشنی، محرمانگی» */
export const boxesFa = (codes) => (codes || []).map((c) => BOX_FA[c] || c).join("، ");
