/**
 * قالب‌های پیام به تأمین‌کننده — مشترکِ پنل و بات.
 *
 * یک جدول (templates)، یک فهرست جای‌خالی و یک تابع پرکردن، تا پیامی که کارشناس از
 * پنل کپی می‌کند و پیامی که در تلگرام می‌گیرد کلمه‌به‌کلمه یکی باشد. قالب‌های
 * پیش‌فرض همان سه‌تایی است که پنل هنگام اولین باز کردنِ «قالب‌های پیام» می‌سازد؛
 * این‌جا هستند تا بات هم بی نیاز به پنل بتواند شروع کند.
 *
 * کتابخانهٔ یکی (مهر ۱۴۰۵، درخواست مالک): همین قالب‌ها در «✉️ پیام اول» هم هستند، کنارِ «قالب‌های آماده»ی first-msg.js.
 * جای‌خالی‌ها و پرکردن در frontend/tamin-poshtibani/msg-fill.mjs است — همان پرونده‌ای که پنل برای پیش‌نمایش می‌خواند.
 * «فعال» (گزینه‌های «✉️ پیام اول»): قالبِ خودِ کارشناس ستونِ templates.active (پیش‌فرض ۱)، قالبِ مشترک و آماده‌ها جدولِ
 * tpl_prefs برای هر کارشناس (first-msg.js:tplLib).
 */
import { TOKENS, fillMsg } from "../frontend/tamin-poshtibani/msg-fill.mjs";

/** جای‌خالی‌های مجاز — عیناً همین نام‌ها داخل { } در متن قالب می‌نشینند (پیام اول و جستجوی هوشمند یکی) */
export const TEMPLATE_TOKENS = TOKENS;

/** «فعال»ِ قالب‌های مشترک و آماده برای هر کارشناس — key: «std:…» یا شناسهٔ قالبِ مشترک */
export const TPL_DDL = "CREATE TABLE IF NOT EXISTS tpl_prefs (expert_id INTEGER NOT NULL, key TEXT NOT NULL, active INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (expert_id, key)) WITHOUT ROWID";
/** قالب‌های امروز همه فعال‌اند */
export const TPL_COLUMNS = [["templates", "active", "INTEGER NOT NULL DEFAULT 1"]];

export const defaultTemplates = (company) => [
  { title: "زمان تحویل", body: `سلام، از شرکت ${company} تماس می‌گیرم.\nبرای {عنوان قلم} به مقدار {مقدار} {واحد} استعلام قیمت نیاز داریم.\nلطفاً زودترین زمان تحویل ممکن را اعلام بفرمایید.\n{نام کارشناس}` },
  { title: "مکان تحویل", body: `سلام، از شرکت ${company} تماس می‌گیرم.\nدرباره {عنوان قلم} ({مقدار} {واحد}) — امکان تحویل در محل پروژه را دارید یا تحویل درب انبار شماست؟\nهزینه حمل چقدر است؟\n{نام کارشناس}` },
  { title: "رسمی", body: `با سلام و احترام\nشرکت ${company} در نظر دارد نسبت به تامین {عنوان قلم} به مقدار {مقدار} {واحد} با مشخصات {مشخصات فنی} اقدام نماید.\nخواهشمند است قیمت، شرایط پرداخت و زمان تحویل را اعلام فرمایید.\nبا تشکر — {نام کارشناس}` },
];

/** قالب‌های در دسترس یک کارشناس: مشترک‌ها (expert_id NULL) و مال خودش */
export async function listTemplates(env, expertId) {
  return (await env.DB.prepare("SELECT id, expert_id, title, body, active, created_at FROM templates WHERE expert_id IS NULL OR expert_id=? ORDER BY id")
    .bind(expertId == null ? -1 : expertId).all()).results || [];
}

/** «فعال»هایی که کارشناس برای قالب‌های مشترک و آماده گذاشته: Map(key ← true|false) */
export async function tplPrefs(env, expertId) {
  const rows = (await env.DB.prepare("SELECT key, active FROM tpl_prefs WHERE expert_id=?").bind(expertId == null ? -1 : expertId).all()).results || [];
  return new Map(rows.map((r) => [r.key, !!r.active]));
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

/**
 * پرکردن قالب برای یک تأمین‌کننده و یک قلم (جستجوی هوشمند و بات) — همان msg-fill.mjsِ «✉️ پیام اول». ctx (اختیاری، از
 * ai-agent.js:tplCtx): زمینهٔ کاملِ قلم با 🔒/🔓ِ لایه‌ها و شرایط و مهلت؛ بی آن فقط خودِ قلم و بندهای ثابت و قابل تغییر نمی‌آیند.
 */
export function fillTemplate(body, { supplier, item, expertName, company, ctx } = {}) {
  if (ctx) return fillMsg(body, { ...ctx, supplier, ...(expertName ? { expertName } : {}), ...(company ? { company } : {}) });
  return fillMsg(body, { company: company || "", supplier, expertName, item: item || null });
}
