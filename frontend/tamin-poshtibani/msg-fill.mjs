/* ============================================================
   قالب‌های پیام به تأمین‌کننده — جای‌خالی‌ها و پرکردن (مهر ۱۴۰۵)
   یک منبع برای Worker (worker/templates.js، first-msg.js، بات) و پنل کارشناس (expert.html ← TP.msg):
   «✉️ پیام اول»، «پیام»ِ جستجوی هوشمند و بات همه با همین تابع پر می‌شوند، پس پیش‌نمایشِ پنل همان متنی است که می‌رود.

   سیزده جای‌خالی — دو فهرستِ پیشین یکی شد و هر کدام همه‌جا کار می‌کند:
     تک‌قلمی‌ها ({عنوان قلم} {مقدار} {واحد} {مشخصات فنی}) در پیامِ چندقلمی همهٔ اقلام را می‌گویند: «ورق و پیچ»، «۱۲۰۰ کیلوگرم و ۳۰ عدد»
       ({واحد} در همان {مقدار} آمده و خودش با فاصلهٔ پیشش می‌رود)، «عنوان: مشخصات»؛
     چندقلمی‌ها ({فهرست اقلام} {مشخصات ثابت} {قابل تغییر} {موارد لازم} {تاریخ تحویل} {مهلت پاسخ}) در پیامِ تک‌قلمی همان یک قلم‌اند
       یا پیش‌فرض: بندی که {مشخصات ثابت} یا {قابل تغییر}ِ خالی دارد نمی‌آید، «موارد لازم» قیمت و تحویل و تسویه است.
   خانوادهٔ «محتاط» (first-msg.js): مقدار با «بازهٔ متعارف»، نه مقدارِ کامل. نامِ جای‌خالی با «أ»، بی نیم‌فاصله یا با ی/ک عربی هم
   پذیرفته است ({تأمین‌کننده} = {تامین‌کننده})؛ جای‌خالیِ ناشناخته دست نمی‌خورد.
   ============================================================ */

/** جای‌خالی‌ها به ترتیبِ دکمه‌های ویرایشگر — عیناً همین نام‌ها داخل { } */
export const TOKENS = ["شرکت", "تامین‌کننده", "فهرست اقلام", "عنوان قلم", "مقدار", "واحد", "مشخصات فنی", "مشخصات ثابت", "قابل تغییر",
  "موارد لازم", "تاریخ تحویل", "مهلت پاسخ", "نام کارشناس"];
/** راهنمای کوتاهِ هر جای‌خالی (عنوانِ دکمه در ویرایشگر) */
export const TOKEN_HINT = {
  "شرکت": "نامِ شرکت", "تامین‌کننده": "نامِ همان گیرنده", "فهرست اقلام": "هر قلم یک سطر: عنوان — مقدار و واحد",
  "عنوان قلم": "عنوانِ قلم (چندقلمی: همه با «و»)", "مقدار": "مقدار (چندقلمی: با واحدِ هر قلم)", "واحد": "واحد (چندقلمی: در خودِ مقدار)",
  "مشخصات فنی": "مشخصات فنیِ قلم", "مشخصات ثابت": "لایه‌ها و شرایطِ 🔒 — خالی باشد، همان بند نمی‌آید",
  "قابل تغییر": "لایه‌ها و شرایطِ 🔓 — خالی باشد، همان بند نمی‌آید", "موارد لازم": "آنچه در پیشنهاد لازم است",
  "تاریخ تحویل": "تاریخِ تحویلِ لازم", "مهلت پاسخ": "تا کی پاسخ بدهند", "نام کارشناس": "نامِ شما",
};
export const MUST_DEFAULT = "قیمت واحد، زمان تحویل و شرایط تسویه";
export const REPLY_DEFAULT = "پایان روز کاری بعد";

const FA = "۰۱۲۳۴۵۶۷۸۹";
export const faN = (s) => String(s).replace(/\d/g, (d) => FA[+d]);
/** «الف»، «الف و ب»، «الف، ب و پ» */
const joinFa = (xs) => (xs.length <= 1 ? xs[0] || "" : `${xs.slice(0, -1).join("، ")} و ${xs[xs.length - 1]}`);
/** کلیدِ نامِ جای‌خالی: بی نیم‌فاصله و فاصله، «أ/إ/آ» ← «ا»، ی و ک فارسی */
const canon = (s) => String(s).replace(/[‌\s]+/g, "").replace(/[أإآ]/g, "ا").replace(/ي/g, "ی").replace(/ك/g, "ک");

/**
 * «بازهٔ متعارف» برای موج اولِ استعلامِ محتاط (تصمیم ۱۲؛ rfq_policy.disclosure.quantity و qty_shown در 04_prompts/context_blocks.md):
 * بازه‌ای گرد که مقدارِ واقعی همیشه درونش است و خودش گفته نمی‌شود — نیم تا یک‌ونیم برابر، گرد به گام‌های ۱، ۵ یا ۵×۱۰ⁿ. مقدار
 * ساختگی نه: بی مقدار، null. خروجی {lo, hi}.
 */
export function qtyRange(qty) {
  const q = Number(qty);
  if (!Number.isFinite(q) || q <= 0) return null;
  const step = (v) => (v < 10 ? 1 : v < 100 ? 5 : 5 * 10 ** (Math.floor(Math.log10(v)) - 1));
  let lo = Math.max(1, Math.floor((q * 0.5) / step(q * 0.5)) * step(q * 0.5));
  let hi = Math.ceil((q * 1.5) / step(q * 1.5)) * step(q * 1.5);
  if (lo >= q && q > 1) lo = Math.max(1, lo - step(lo));
  if (hi <= q) hi = q + step(q);
  return { lo, hi };
}
const rangeFa = (i) => { const r = qtyRange(i.qty); return r ? `حدود ${faN(r.lo)} تا ${faN(r.hi)} ${i.unit || ""}`.trimEnd() : ""; };

/**
 * پرکردنِ یک قالب. ctx: {company, supplier, expertName, family, items: [{title, qty, unit, spec, fixed: [«ک: م»…], open: […], due}],
 * must: [...], reply} — یا item به‌جای items برای پیامِ تک‌قلمی (جستجوی هوشمند و بات؛ need_date هم به‌جای due پذیرفته است).
 * {فهرست اقلام} و {مقدار} در خانوادهٔ محتاط با «بازهٔ متعارف» است، نه مقدارِ کامل («مقدار نهایی پس از جمع‌بندی»).
 */
export function fillMsg(body, ctx = {}) {
  const items = (Array.isArray(ctx.items) ? ctx.items : ctx.item ? [ctx.item] : []).filter(Boolean);
  const many = items.length > 1, it0 = items[0] || {};
  const noQty = ctx.family === "cautious";
  const list = items.map((i) => `• ${i.title || ""}${noQty ? (rangeFa(i) ? ` — ${rangeFa(i)}` : "") : ` — ${faN(i.qty == null ? "—" : i.qty)} ${i.unit || ""}`.trimEnd()}`).join("\n");
  const join = (k) => [...new Set(items.flatMap((i) => i[k] || []))].join("، ") || "—";
  const due = [...new Set(items.map((i) => i.due || i.need_date).filter(Boolean))].join("، ") || "—";
  /* جای‌خالیِ ثابت یا قابل تغییرِ خالی: همان بند (تا «؛» یا پایانِ سطر) نمی‌آید — نه «… در — اگه پیشنهادی دارید» */
  const empty = [["{مشخصات ثابت}", "fixed"], ["{قابل تغییر}", "open"]].filter(([, k]) => join(k) === "—").map(([tk]) => tk);
  let text = !empty.length ? String(body || "") : String(body || "").split("\n")
    .map((ln) => { const cl = ln.split("؛ "); const keep = cl.filter((c) => !empty.some((tk) => c.includes(tk))); return keep.length === cl.length ? ln : keep.length ? keep.join("؛ ").replace(/([^.!؟])$/, "$1.") : null; })
    .filter((ln) => ln !== null).join("\n");
  /* مقدار: تک‌قلمی همان عدد (واحد جدا)؛ چندقلمی هر قلم با واحدش و {واحد} با فاصلهٔ پیشش برداشته می‌شود */
  const r0 = qtyRange(it0.qty);
  const qtyOne = noQty ? (r0 ? `حدود ${faN(r0.lo)} تا ${faN(r0.hi)}` : "مقدار پس از جمع‌بندی") : it0.qty != null ? faN(it0.qty) : "";
  const qtyMany = joinFa(items.map((i) => (noQty ? rangeFa(i) : i.qty != null ? `${faN(i.qty)} ${i.unit || ""}`.trim() : "")).filter(Boolean)) || (noQty ? "مقدار پس از جمع‌بندی" : "");
  if (many) text = text.replace(/ ?\{\s*واحد\s*\}/g, "");
  const V = {
    "شرکت": ctx.company || "",
    "تامین‌کننده": ctx.supplier || "",
    "فهرست اقلام": list,
    "عنوان قلم": many ? joinFa(items.map((i) => i.title).filter(Boolean)) : it0.title || "",
    "مقدار": many ? qtyMany : qtyOne,
    "واحد": noQty && !r0 ? "" : it0.unit || "",
    "مشخصات فنی": many ? items.filter((i) => i.spec).map((i) => `${i.title}: ${i.spec}`).join("؛ ") || "—" : it0.spec || "—",
    "مشخصات ثابت": join("fixed"),
    "قابل تغییر": join("open"),
    "موارد لازم": (ctx.must || []).join("، ") || MUST_DEFAULT,
    "تاریخ تحویل": due,
    "مهلت پاسخ": ctx.reply || REPLY_DEFAULT,
    "نام کارشناس": ctx.expertName || "",
  };
  const byKey = new Map(Object.entries(V).map(([k, v]) => [canon(k), v]));
  /* یک گذر: متنی که جای یک جای‌خالی نشست دوباره پر نمی‌شود */
  return text.replace(/\{([^{}\n]{1,30})\}/g, (m, name) => (byKey.has(canon(name)) ? byKey.get(canon(name)) : m));
}
