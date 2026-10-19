/**
 * «قفلِ شرایط»ِ هر قلم — طرح «خرید هوشمند، کارشناس ناظر»، فاز ۴ب گام ۳ (پاسخ‌های ۱۵ مهر؛ تصمیم‌های ۲۵ و ۲۶)
 *
 * کارشناس برای هر قلم، کنارِ نوع قلم و لایه‌ها، شرایطِ خرید را می‌گذارد و هر کدام را 🔒 یا 🔓 می‌کند:
 *   • شرایط تسویه، نوع فاکتور، ارزش افزوده: یک یا چند گزینه از فهرستِ سامانه (quote-rules.js:ENUMS)؛
 *   • زمان تحویل: یک بازه — «از» (اختیاری) و «تا»، تاریخ شمسی؛
 *   • محل تحویل (یکی از فهرست، با نشانی یا توضیح)، محل معامله (یکی از فهرست)، روش حمل (متن) و کمینهٔ اعتبار پیش‌فاکتور (روز).
 *     این چهار را تأمین‌کننده وارد نمی‌کند: «شرطِ شرکت»اند که در پنل، بات، پیام اول و پیامِ استعلام دیده می‌شوند و پیش‌فاکتورِ تولیدی
 *     و خطِ استعلام از همین‌ها پر می‌شوند (withCompany)؛ اعتبارِ کمتر از کمینهٔ 🔒 پذیرفته نیست.
 * 🔒 یعنی تأمین‌کننده بیرون از این‌ها ثبت نمی‌کند — پنل، بات و سرور (sp-core.js) همه همین را می‌سنجند؛ 🔓 فقط خواستهٔ شرکت است.
 * شرایطِ فاکتور برای همهٔ اقلامِ یک گفت‌وگو یکی است (sp-core.js:termsSave)، پس قیدِ یک بسته اشتراکِ قیدهای 🔒ِ اقلامِ همان بسته
 * است؛ اگر دو قلم با هم نخوانند، باید جدا فرستاده شوند. بسته‌ای که در چارچوبِ قیدها باشد، در کارِ کارشناس هوشمند همان لحظه
 * «تأیید نهایی» می‌شود (ai-agent.js:autoDecide) — تصمیمِ بسته دیگر با مدل نیست.
 *
 * items.terms_json: {pay: {opts, lock}, invoice: {opts, lock}, vat: {opts, lock}, dtime: {from, to, lock}, place: {opt, note, lock}, deal: {opt, lock},
 *   ship: {text, lock}, valid: {min, lock}}
 * بی ایمپورت از sp-core.js، تا sp-core.js و api.js بی حلقه بپرسند.
 */
import { HttpError } from "./http.js";
import { ENUMS } from "./quote-rules.js";
import { jValid, jNorm, jStr, endOfNthWorkingDay, DAY } from "./time.js";

const T = (v) => String(v == null ? "" : v).trim();
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const DIG = (s) => String(s == null ? "" : s).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
const faN = (s) => String(s).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[+d]);

export const ENUM_FIELDS = ["pay", "invoice", "vat"];
/* شرطِ شرکت: یکی از فهرست (place، deal)، متن (ship)، کمینهٔ روز (valid) */
export const ONE_FIELDS = ["place", "deal"];
export const LIMIT_FIELDS = [...ENUM_FIELDS, "dtime", ...ONE_FIELDS, "ship", "valid"];
export const LIMIT_FA = { pay: "شرایط تسویه", invoice: "نوع فاکتور", vat: "ارزش افزوده", dtime: "زمان تحویل", place: "محل تحویل", deal: "محل معامله",
  ship: "روش حمل", valid: "اعتبار پیش‌فاکتور" };
export const LIMIT_ENUMS = { pay: ENUMS.pay, invoice: ENUMS.invoice, vat: ENUMS.vat, place: ENUMS.place, deal: ENUMS.deal };

/** قیدهای یک قلم (یا null) */
export const limitsOf = (it) => { const v = parse(it && it.terms_json, null); return v && typeof v === "object" && Object.keys(v).length ? v : null; };

/** ورودیِ کارشناس → شکلِ استاندارد، یا null (بی قید). گزینهٔ بیرون از فهرست یا تاریخِ نادرست ← ۴۲۲ */
export function cleanLimits(raw) {
  const x = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const f of ENUM_FIELDS) {
    const v = x[f];
    if (!v || typeof v !== "object") continue;
    const opts = [...new Set((Array.isArray(v.opts) ? v.opts : []).map((o) => T(o)).filter(Boolean))];
    const bad = opts.filter((o) => !ENUMS[f].includes(o));
    if (bad.length) throw new HttpError(`«${LIMIT_FA[f]}» یکی از این‌ها باشد: ${ENUMS[f].join("، ")}`, 422, { field: f });
    if (!opts.length) continue;
    out[f] = { opts: ENUMS[f].filter((o) => opts.includes(o)), lock: v.lock === true };
    /* «اعتباری»: مدت‌هایی که قیمتشان خواسته می‌شود (۱ و ۲ ماهه؛ پیش‌فرض هر دو) — تأمین‌کننده برای هر کدام قیمت یا درصدِ تعدیل می‌دهد (payModes) */
    if (f === "pay" && out.pay.opts.includes("اعتباری")) {
      const cm = [...new Set((Array.isArray(v.credit) ? v.credit : CREDIT_MONTHS).map((n) => Number(DIG(n))).filter((n) => CREDIT_MONTHS.includes(n)))].sort((a, b) => a - b);
      out.pay.credit = cm.length ? cm : [...CREDIT_MONTHS];
    }
  }
  const d = x.dtime;
  if (d && typeof d === "object") {
    const from = T(DIG(d.from)), to = T(DIG(d.to));
    for (const [k, s] of [["از", from], ["تا", to]]) {
      if (s && !jValid(s)) throw new HttpError(`تاریخِ «${k}»ِ زمان تحویل در تقویم نیست (مثل ۱۴۰۵/۰۸/۲۰).`, 422, { field: "dtime" });
    }
    const f2 = from ? jNorm(from) : null, t2 = to ? jNorm(to) : null;
    if (f2 && t2 && f2 > t2) throw new HttpError("در زمان تحویل، «از» بعد از «تا» است.", 422, { field: "dtime" });
    if (f2 || t2) out.dtime = { ...(f2 ? { from: f2 } : {}), ...(t2 ? { to: t2 } : {}), lock: d.lock === true };
  }
  for (const f of ONE_FIELDS) {
    const v = x[f];
    if (!v || typeof v !== "object") continue;
    const opt = T(v.opt), note = T(v.note).slice(0, 200);
    if (opt && !ENUMS[f].includes(opt)) throw new HttpError(`«${LIMIT_FA[f]}» یکی از این‌ها باشد: ${ENUMS[f].join("، ")}`, 422, { field: f });
    if (f === "place" && opt === "سایر" && !note) throw new HttpError("برای «محل تحویل: سایر» نشانی یا توضیح را بنویسید.", 422, { field: f });
    if (opt) out[f] = { opt, ...(f === "place" && note ? { note } : {}), lock: v.lock === true };
  }
  if (x.ship && typeof x.ship === "object" && T(x.ship.text)) out.ship = { text: T(x.ship.text).slice(0, 120), lock: x.ship.lock === true };
  if (x.valid && typeof x.valid === "object" && T(DIG(x.valid.min))) {
    const n = Number(T(DIG(x.valid.min)));
    if (!Number.isInteger(n) || n < 1 || n > 365) throw new HttpError("کمینهٔ اعتبار پیش‌فاکتور باید شمارِ روز از ۱ تا ۳۶۵ باشد.", 422, { field: "valid" });
    out.valid = { min: n, lock: x.valid.lock === true };
  }
  return Object.keys(out).length ? out : null;
}

/* مدت‌های قیمتِ اعتباری (ماه) */
export const CREDIT_MONTHS = [1, 2];
const MONTHS_FA = (cm) => cm.map((m) => `${faN(m)} ماهه`).join(" و ");
/**
 * «قیمتِ نقدی و اعتباری» (درخواست مالک، مهر ۱۴۰۵): وقتی کارشناس «اعتباری» را در شرایط تسویه زده، تأمین‌کننده برای هر قلم قیمتِ نقد
 * (اگر «نقدی» هم خواسته شده) و قیمتِ هر مدتِ اعتباری را می‌دهد — قیمت یا درصدِ تعدیل نسبت به نقد. 🔒 یعنی همه الزامی‌اند، 🔓 یعنی
 * هر کدام اختیاری (دست‌کم یکی). null یعنی همان یک قیمتِ همیشگی.
 */
export function payModes(L) {
  const p = L && L.pay;
  if (!p || !Array.isArray(p.opts) || !p.opts.includes("اعتباری")) return null;
  return { cash: p.opts.includes("نقدی"), credit: Array.isArray(p.credit) && p.credit.length ? p.credit : [...CREDIT_MONTHS], lock: !!p.lock };
}
/** ردیف‌های قیمتِ یک حالت: ["cash", "c1", "c2"] */
export const priceRows = (m) => (m ? [...(m.cash ? ["cash"] : []), ...m.credit.map((n) => `c${n}`)] : []);
export const PRICE_FA = { cash: "قیمت نقدی", c1: "قیمت اعتباری ۱ ماهه", c2: "قیمت اعتباری ۲ ماهه" };
/** ردیف‌هایی که هنوز قیمت ندارند و لازم‌اند: 🔒 همه؛ 🔓 فقط وقتی هیچ‌کدام پر نیست (دست‌کم یکی) */
export function pricesMissing(m, prices) {
  if (!m) return [];
  const P = prices || {}, rows = priceRows(m), has = (k) => Number(P[k]) > 0;
  if (m.lock) return rows.filter((k) => !has(k));
  return rows.some(has) ? [] : [rows[0]];
}

/**
 * شرطِ شرکت روی شرایطِ تأمین‌کننده: محل تحویل، محل معامله و روش حمل را او وارد نمی‌کند — پیش‌فاکتورِ تولیدی، پیش‌نمایش و خطِ استعلام
 * از همین‌ها پر می‌شوند (فقط جایی که خالی است).
 */
export function withCompany(terms, L) {
  const t = { ...(terms || {}) };
  if (!L) return t;
  if (L.place && !T(t.place)) { t.place = L.place.opt; if (L.place.note && !T(t.place_other)) t.place_other = L.place.note; }
  if (L.deal && !T(t.deal)) t.deal = L.deal.opt;
  if (L.ship && !T(t.ship)) t.ship = L.ship.text;
  return t;
}

/**
 * قیدِ مشترکِ 🔒ِ چند قلم: گزینه‌ها اشتراک، بازهٔ تحویل هم‌پوشانی. conflict: فیلدهایی که با هم نمی‌خوانند (اشتراکِ خالی).
 * خروجی: {lock: {pay?: [..], invoice?: [..], vat?: [..], dtime?: {from, to}}, conflict: [..]}
 */
export function combineLocks(list) {
  const lock = {}, conflict = [];
  for (const L of list || []) {
    if (!L) continue;
    for (const f of ENUM_FIELDS) {
      if (!L[f] || !L[f].lock) continue;
      lock[f] = lock[f] ? lock[f].filter((o) => L[f].opts.includes(o)) : [...L[f].opts];
    }
    if (L.valid && L.valid.lock) lock.valid = Math.max(lock.valid || 0, L.valid.min);
    if (L.dtime && L.dtime.lock) {
      const c = lock.dtime || {};
      const from = [c.from, L.dtime.from].filter(Boolean).sort().pop() || null;
      const to = [c.to, L.dtime.to].filter(Boolean).sort()[0] || null;
      lock.dtime = { ...(from ? { from } : {}), ...(to ? { to } : {}) };
    }
  }
  for (const f of ENUM_FIELDS) if (lock[f] && !lock[f].length) conflict.push(f);
  if (lock.dtime && lock.dtime.from && lock.dtime.to && lock.dtime.from > lock.dtime.to) conflict.push("dtime");
  return { lock, conflict };
}

/**
 * زمان تحویلِ اعلامی ← روزِ شمسی: تاریخ همان؛ «۱۰»، «۱۰ روز»، «۱۰ روز کاری» (بی جمعه)، «۲ هفته»، «۱ ماه» از همین لحظه.
 * نامعتبر ← null
 */
export function dtimeDate(v, at = Date.now()) {
  const s = DIG(T(v)).replace(/\s+/g, " ");
  if (!s) return null;
  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(s)) return jValid(s) ? jNorm(s) : null;
  const m = /^(\d+)\s*(روز کاری|روز|هفته|ماه)?$/.exec(s);
  if (!m) return null;
  const n = Math.max(0, +m[1]), u = m[2] || "روز";
  if (u === "روز کاری") return jStr(n ? endOfNthWorkingDay(at, n) : at);
  return jStr(at + n * (u === "هفته" ? 7 : u === "ماه" ? 30 : 1) * DAY);
}

export const rangeTxt = (d) => (d.from && d.to ? `بین ${faN(d.from)} و ${faN(d.to)}` : d.to ? `حداکثر تا ${faN(d.to)}` : `از ${faN(d.from)} به بعد`);

/**
 * شرایطِ اعلامی با قیدِ 🔒 (خروجیِ combineLocks().lock) می‌خواند؟ — فقط فیلدهای پرشده سنجیده می‌شوند (خالی را termsMissing
 * می‌گوید). خروجی: [{field, msg}]؛ خالی یعنی درست.
 */
export function violations(terms, lock, at = Date.now()) {
  const t = terms || {}, L = lock || {}, out = [];
  for (const f of ENUM_FIELDS) {
    if (!L[f] || !L[f].length || !T(t[f])) continue;
    if (!L[f].includes(T(t[f]))) out.push({ field: f, msg: `${LIMIT_FA[f]} فقط ${L[f].map((o) => `«${o}»`).join(" یا ")} (اعلامِ شما: «${T(t[f])}»)` });
  }
  const d = L.dtime;
  if (d && (d.from || d.to) && T(t.dtime)) {
    const day = dtimeDate(t.dtime, at);
    if (!day) out.push({ field: "dtime", msg: "زمان تحویل باید تاریخ شمسی یا شمار روز باشد" });
    else if ((d.to && day > d.to) || (d.from && day < d.from)) out.push({ field: "dtime", msg: `زمان تحویل ${rangeTxt(d)} (اعلامِ شما: ${faN(day)})` });
  }
  const vd = Number(T(DIG(t.valid_days)));
  if (L.valid && T(t.valid_days) && Number.isFinite(vd) && vd < L.valid) out.push({ field: "valid_days", msg: `اعتبار پیش‌فاکتور دست‌کم ${faN(L.valid)} روز (اعلامِ شما: ${faN(vd)} روز)` });
  return out;
}

/** خطای ۴۲۲ِ تخلف — یک پیام برای پنل و بات */
export function violationError(v, what = "شرایط فاکتور") {
  return new HttpError(`${what} با قفلِ شرکت نمی‌خواند: ${v.map((x) => x.msg).join("؛ ")}.`, 422, { field: v[0].field, locked: v.map((x) => x.field) });
}

/** مقدارِ یک قید، بی برچسب و 🔒/🔓 (پیام اول: «مشخصات ثابت» و «قابل تغییر») */
export function fieldTxt(f, v) {
  if (!v || typeof v !== "object") return "";
  if (ENUM_FIELDS.includes(f)) return (v.opts || []).map((o) => (o === "اعتباری" && Array.isArray(v.credit) ? `اعتباری (${MONTHS_FA(v.credit)})` : o)).join(" یا ");
  if (f === "dtime") return [v.from, v.to].filter(Boolean).join(" تا ");
  if (ONE_FIELDS.includes(f)) return v.opt ? `${v.opt}${v.note ? ` (${v.note})` : ""}` : "";
  if (f === "ship") return T(v.text);
  if (f === "valid") return v.min ? `دست‌کم ${faN(v.min)} روز` : "";
  return "";
}

/** متنِ کوتاهِ قیدهای یک قلم برای پیام، پرونده و پنل: «شرایط تسویه 🔒 «نقدی» یا «اعتباری» · زمان تحویل 🔒 حداکثر تا …» */
export function limitsTxt(L) {
  if (!L) return "";
  const parts = [];
  for (const f of ENUM_FIELDS) if (L[f]) parts.push(`${LIMIT_FA[f]} ${L[f].lock ? "🔒" : "🔓"} ${L[f].opts.map((o) => `«${o}»${o === "اعتباری" && Array.isArray(L[f].credit) ? ` (${MONTHS_FA(L[f].credit)})` : ""}`).join(" یا ")}`);
  if (L.dtime && (L.dtime.from || L.dtime.to)) parts.push(`${LIMIT_FA.dtime} ${L.dtime.lock ? "🔒" : "🔓"} ${rangeTxt(L.dtime)}`);
  if (L.place) parts.push(`${LIMIT_FA.place} ${L.place.lock ? "🔒" : "🔓"} «${L.place.opt}»${L.place.note ? ` (${L.place.note})` : ""}`);
  if (L.deal) parts.push(`${LIMIT_FA.deal} ${L.deal.lock ? "🔒" : "🔓"} «${L.deal.opt}»`);
  if (L.ship) parts.push(`${LIMIT_FA.ship} ${L.ship.lock ? "🔒" : "🔓"} «${L.ship.text}»`);
  if (L.valid) parts.push(`${LIMIT_FA.valid} ${L.valid.lock ? "🔒" : "🔓"} دست‌کم ${faN(L.valid.min)} روز`);
  return parts.join(" · ");
}
