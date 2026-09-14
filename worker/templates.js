/**
 * قالب‌های پیام به تأمین‌کننده — مشترکِ پنل و بات.
 *
 * یک جدول (templates)، یک فهرست جای‌خالی و یک تابع پرکردن، تا پیامی که کارشناس از
 * پنل کپی می‌کند و پیامی که در تلگرام می‌گیرد کلمه‌به‌کلمه یکی باشد. قالب‌های
 * پیش‌فرض همان سه‌تایی است که پنل هنگام اولین باز کردنِ «قالب‌های پیام» می‌سازد؛
 * این‌جا هستند تا بات هم بی نیاز به پنل بتواند شروع کند.
 */

/** جای‌خالی‌های مجاز — عیناً همین نام‌ها داخل { } در متن قالب می‌نشینند */
export const TEMPLATE_TOKENS = ["عنوان قلم", "مقدار", "واحد", "مشخصات فنی", "تامین‌کننده", "نام کارشناس"];

export const defaultTemplates = (company) => [
  { title: "زمان تحویل", body: `سلام، از شرکت ${company} تماس می‌گیرم.\nبرای {عنوان قلم} به مقدار {مقدار} {واحد} استعلام قیمت نیاز داریم.\nلطفاً زودترین زمان تحویل ممکن را اعلام بفرمایید.\n{نام کارشناس}` },
  { title: "مکان تحویل", body: `سلام، از شرکت ${company} تماس می‌گیرم.\nدرباره {عنوان قلم} ({مقدار} {واحد}) — امکان تحویل در محل پروژه را دارید یا تحویل درب انبار شماست؟\nهزینه حمل چقدر است؟\n{نام کارشناس}` },
  { title: "رسمی", body: `با سلام و احترام\nشرکت ${company} در نظر دارد نسبت به تامین {عنوان قلم} به مقدار {مقدار} {واحد} با مشخصات {مشخصات فنی} اقدام نماید.\nخواهشمند است قیمت، شرایط پرداخت و زمان تحویل را اعلام فرمایید.\nبا تشکر — {نام کارشناس}` },
];

/** قالب‌های در دسترس یک کارشناس: مشترک‌ها (expert_id NULL) و مال خودش */
export async function listTemplates(env, expertId) {
  return (await env.DB.prepare("SELECT id, expert_id, title, body, created_at FROM templates WHERE expert_id IS NULL OR expert_id=? ORDER BY id")
    .bind(expertId == null ? -1 : expertId).all()).results || [];
}

/** اگر کارشناس هنوز هیچ قالبی ندارد، پیش‌فرض‌ها برایش ساخته می‌شوند (همان کاری که پنل می‌کند) */
export async function ensureTemplates(env, expertId, company) {
  const have = await listTemplates(env, expertId);
  if (have.length) return have;
  const t = Date.now();
  await env.DB.batch(defaultTemplates(company || "تونل سد آریانا").map((x) =>
    env.DB.prepare("INSERT INTO templates (expert_id,title,body,created_at) VALUES (?,?,?,?)").bind(expertId, x.title, x.body, t)));
  return listTemplates(env, expertId);
}

/** یک قالب، فقط اگر مشترک یا مال همین کارشناس باشد */
export const ownTemplate = (env, expertId, id) =>
  env.DB.prepare("SELECT * FROM templates WHERE id=? AND (expert_id IS NULL OR expert_id=?)").bind(id, expertId == null ? -1 : expertId).first();

/** پرکردن قالب با فیلدهای یک تأمین‌کننده و قلم — همان جای‌خالی‌های پنل */
export function fillTemplate(body, { supplier, item, expertName }) {
  return String(body || "")
    .replace(/\{تامین‌کننده\}/g, supplier || "")
    .replace(/\{عنوان قلم\}/g, (item && item.title) || "")
    .replace(/\{مقدار\}/g, item && item.qty != null ? String(item.qty) : "")
    .replace(/\{واحد\}/g, (item && item.unit) || "")
    .replace(/\{مشخصات فنی\}/g, (item && item.spec) || "—")
    .replace(/\{نام کارشناس\}/g, expertName || "");
}
