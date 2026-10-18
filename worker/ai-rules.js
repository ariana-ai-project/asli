/**
 * قواعدِ «حداقلِ استعلام» کارشناس هوشمند — فاز ۳ پنل پشتیبانی (مهر ۱۴۰۵، درخواست مالک).
 *
 * پشتیبانی برای هر قلم، بر پایهٔ بازه‌های قیمت واحد، قیمت کل و مقدار، حداقلِ پیشنهادِ تأییدنهایی‌شده از تأمین‌کنندگانِ
 * مختلف را تعیین می‌کند؛ مثلاً «قیمت واحد از ۱۰ تا ۵۰ میلیون ریال ← دست‌کم ۲ استعلام، از ۵۰ میلیون به بالا ← ۳».
 * کارشناس هوشمند تا هر قلم به حداقلش نرسیده مذاکره را نمی‌بندد (ai-agent.js:finishCheck) و استعلام را فقط از خودِ
 * تأمین‌کنندگان می‌گیرد. اگر در «مهلتِ رسیدن به حد» (waitHours) نرسید، به کارشناس آلارم می‌دهد و بررسی سوابق و جستجوی
 * هوشمندِ همان درخواست برایش باز می‌شود (ai-lock.js:aiOwned → handover).
 *
 * حدِ پایه همان «حداقل تأمین‌کننده به ازای هر قلم»ِ تنظیمات مدیر است (settings.minSuppliers). قیمتِ سنجیدنی بالاترین قیمتِ
 * رسیده برای همان قلم است (خط‌های استعلام و اعلام‌های تأمین‌کنندگان در مکاتبات) — «وقتی یک قیمتِ بالاتر از آن رقم رسید»؛
 * قیمت کل = همان قیمت واحد × مقدارِ همان پیشنهاد (یا مقدارِ درخواست)، و مقدار = مقدارِ درخواستِ همان قلم به واحدِ خودش.
 * بازه‌ها شاملِ «از» و بی «تا»اند ([از، تا))؛ «تا»ی خالی یعنی بی سقف.
 *
 * از مهر ۱۴۰۵ (گزارشِ مالک) همین حد نگهبانِ «تولید جدول کمیسیون»ِ کارشناس (پنل و بات، bundle.js:commissionGuard) و
 * ستونِ «استعلام n/حد»ِ تبِ «تأیید کمیسیون» پشتیبانی هم هست (itemNeeds) — دیگر دو عددِ جدا برای دو مسیر نیست.
 *
 * ذخیره در جدول settings با کلیدی بیرون از DEFAULTS (settingsFromRows به پنل‌های دیگر نمی‌دهدش).
 *
 * مهر ۱۴۰۵ (تصمیمِ مالک، برچسبِ اندازه — worker/size.js): حداقلِ استعلامِ هر قلم دیگر از «حدِ پایهٔ مدیر» و بازه‌های بالا نمی‌آید،
 * بلکه از ردهٔ خودِ همان قلم: needFor ← minQِ ردهٔ «بالاترین پیشنهادِ کل» (قیمت واحد × مقدار) در میانِ خط‌های استعلام و اعلام‌های
 * تأمین‌کنندگان؛ تا پیشنهادی نرسیده، ردهٔ برآوردِ کلِ قلم (est_unit_rial × مقدار)؛ بی هر دو، «جزئی». همهٔ مسیرها (نگهبانِ جدول
 * کمیسیون در پنل و بات، کارشناس هوشمند، تبِ تأیید کمیسیون و شمارنده‌ها) از همین‌جا می‌خوانند. بازه‌ها و حدِ پایهٔ قدیمی در دیتابیس
 * دست‌نخورده می‌مانند؛ از این قواعد فقط «مهلتِ رسیدن به حد» (waitHours) هنوز به کار می‌رود.
 */
import { HttpError } from "./http.js";
import { getSizeRules, minQOf, sizeOfRial, rialToToman, tomanTxt, SIZE_FA, SIZE_DEFAULT } from "./size.js";

const T = (v) => String(v == null ? "" : v).trim();
const FA = "۰۱۲۳۴۵۶۷۸۹";
const faN = (s) => String(s).replace(/\d/g, (d) => FA[+d]);
const money = (n) => faN(Math.round(Number(n)).toLocaleString("en-US")).replace(/,/g, "٬");
/** عدد از ورودیِ کاربر: رقم فارسی و عربی، جداکننده‌های هزارگان و فاصله */
export function numIn(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = T(v).replace(/[۰-۹]/g, (d) => FA.indexOf(d)).replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[,٬،\s]/g, "").replace(/٫/g, ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export const RULES_KEY = "aiQuoteRules";
export const DIMS = ["unit", "total", "qty"];
export const DIM_FA = { unit: "قیمت واحد", total: "قیمت کل", qty: "مقدار" };
export const DIM_UNIT = { unit: "ریال", total: "ریال", qty: "به واحدِ خودِ قلم" };
const MAX_ROWS = 12, MAX_MIN = 20, MAX_WAIT = 720;
export const RULES_DEFAULT = { unit: [], total: [], qty: [], waitHours: 24 };

/** بدنهٔ فرمِ پشتیبانی ← قواعدِ سنجیده؛ ردیفِ نادرست خطای فارسی می‌دهد، ردیفِ کاملاً خالی کنار می‌رود */
export function cleanRules(b) {
  const out = { unit: [], total: [], qty: [], waitHours: RULES_DEFAULT.waitHours };
  for (const d of DIMS) {
    const rows = Array.isArray(b && b[d]) ? b[d] : [];
    if (rows.length > MAX_ROWS) throw new HttpError(`${DIM_FA[d]}: حداکثر ${faN(MAX_ROWS)} بازه.`);
    for (const r of rows) {
      const from = numIn(r && r.from), to = numIn(r && r.to), min = numIn(r && r.min);
      if (from == null && to == null && min == null) continue;
      if (Number.isNaN(from) || Number.isNaN(to) || (from != null && from < 0) || (to != null && to < 0)) throw new HttpError(`${DIM_FA[d]}: «از» و «تا» باید عدد مثبت باشند.`);
      if (min == null || Number.isNaN(min) || !Number.isInteger(min) || min < 1 || min > MAX_MIN) throw new HttpError(`${DIM_FA[d]}: حداقلِ استعلام عددی صحیح از ۱ تا ${faN(MAX_MIN)} است.`);
      if (to != null && to <= (from || 0)) throw new HttpError(`${DIM_FA[d]}: «تا» باید از «از» بزرگ‌تر باشد.`);
      out[d].push({ from: from || 0, to: to == null ? null : to, min });
    }
    out[d].sort((x, y) => x.from - y.from || (x.to == null ? 1 : y.to == null ? -1 : x.to - y.to));
  }
  const w = numIn(b && b.waitHours);
  if (w != null) {
    if (Number.isNaN(w) || w < 0 || w > MAX_WAIT) throw new HttpError(`مهلتِ رسیدن به حد از ۰ تا ${faN(MAX_WAIT)} ساعت است (۰ یعنی بی مهلت).`);
    out.waitHours = Math.round(w * 10) / 10;
  }
  return out;
}

/** قواعدِ ذخیره‌شده (یا پیش‌فرض: بی بازه، مهلت ۲۴ ساعت) با زمان و کننده‌اش */
export async function getRules(env) {
  const r = await env.DB.prepare("SELECT value, updated_at FROM settings WHERE key=?").bind(RULES_KEY).first().catch(() => null);
  let v = null;
  try { v = r && r.value ? JSON.parse(r.value) : null; } catch (_) { v = null; }
  let rules;
  try { rules = cleanRules(v || RULES_DEFAULT); } catch (_) { rules = { ...RULES_DEFAULT }; }
  return { ...rules, updated_at: r ? r.updated_at : null, updated_by: (v && v.by) || null };
}

/** ذخیره از پنل پشتیبانی + رخدادِ ai_rules در گزارش رخدادها */
export async function saveRules(env, body, by = "support") {
  const rules = cleanRules(body);
  const t = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
      .bind(RULES_KEY, JSON.stringify({ ...rules, by }), t),
    env.DB.prepare("INSERT INTO events (at,actor,kind,payload_json) VALUES (?,?,?,?)").bind(t, by, "ai_rules",
      JSON.stringify({ unit: rules.unit.length, total: rules.total.length, qty: rules.qty.length, wait: rules.waitHours })),
  ]);
  return { ...rules, updated_at: t, updated_by: by };
}

/**
 * حداقلِ استعلامِ یک قلم از ردهٔ اندازه‌اش (worker/size.js). sr: settings.sizeRules؛ offers: [{price, qty}] — هر قیمتِ رسیده برای همین
 * قلم (قیمت واحد، ریال). خروجی {need, cat, src: quote|est|none, v: مبلغِ کلِ سنجیده (ریال) یا null}.
 */
export function needFor(sr, { qty, est_unit_rial, offers } = {}) {
  const R = sr && sr.th ? sr : SIZE_DEFAULT;
  const q = Number(qty) > 0 ? Number(qty) : null;
  const totals = (offers || []).filter((o) => Number(o.price) > 0).map((o) => Number(o.price) * (Number(o.qty) > 0 ? Number(o.qty) : q || 0)).filter((x) => x > 0);
  let v = null, src = "none";
  if (totals.length) { v = Math.max(...totals); src = "quote"; }
  else if (Number(est_unit_rial) > 0 && q) { v = Number(est_unit_rial) * q; src = "est"; }
  const cat = v != null ? sizeOfRial(v, R.th) : "s";
  return { need: minQOf(R, cat), cat, src, v };
}

/** چرا این حد — یک جملهٔ کوتاه: «ردهٔ «بزرگ» — بالاترین پیشنهادِ کل ≈ ۳۰۰ میلیون تومان ← ۵» */
export function whyText(n) {
  if (!n) return "";
  const c = SIZE_FA[n.cat] || SIZE_FA.s;
  if (n.src === "quote") return `ردهٔ «${c}» — بالاترین پیشنهادِ کل ≈ ${tomanTxt(rialToToman(n.v))} تومان ← ${faN(n.need)}`;
  if (n.src === "est") return `ردهٔ «${c}» — برآوردِ کل ≈ ${tomanTxt(rialToToman(n.v))} تومان ← ${faN(n.need)}`;
  return `بی برآورد و پیشنهاد — ردهٔ «${c}» ← ${faN(n.need)}`;
}
const range = (w) => `${w.dim === "qty" ? faN(w.from) : money(w.from)}${w.to == null ? " به بالا" : ` تا ${w.dim === "qty" ? faN(w.to) : money(w.to)}`}`;
/** شرحِ یک بازه برای پنل و پرامپت */
export const ruleText = (d, r) => `${DIM_FA[d]} ${range({ dim: d, from: r.from, to: r.to })}${d === "qty" ? "" : " ریال"} ← دست‌کم ${faN(r.min)} استعلام`;

const skey = (s) => T(s).replace(/\s+/g, " ").toLowerCase();

/** حالتِ پیشنهادهای سنجیدنی در مکاتبات (همان coverOf) */
const LINE_OK = "l.state IN ('submitted','approved','proforma','final')";

/**
 * حداقلِ استعلامِ هر قلم برای «تولید جدول کمیسیون» — یک قاعده برای کارشناس (پنل و بات)، کارشناس هوشمند و تبِ «تأیید
 * کمیسیون»ِ پشتیبانی: ردهٔ اندازهٔ همان قلم (needFor). items: [{id, qty, est_unit_rial}] از ارجاع‌های aids. base و rules فقط برای
 * سازگاری با فراخوان‌های قدیمی‌اند و در حد اثری ندارند.
 * خروجی Map(itemId → {need, why, cat, src, ruled}) — ruled یعنی رده از «جزئی» بالاتر است.
 */
export async function itemNeeds(env, aids, items, base, rules, sr) {
  const S = sr || await getSizeRules(env);
  const out = new Map();
  if (!items.length) return out;
  const ids = JSON.stringify([...new Set(aids.map(Number).filter(Boolean))]);
  const [qr, lr] = await env.DB.batch([
    env.DB.prepare("SELECT item_id, qty, price FROM quotes WHERE assignment_id IN (SELECT value FROM json_each(?)) AND price>0").bind(ids),
    env.DB.prepare(`SELECT l.item_id, l.qty, l.price FROM sp_threads t JOIN sp_lines l ON l.thread_id=t.id
      WHERE t.assignment_id IN (SELECT value FROM json_each(?)) AND l.price>0 AND ${LINE_OK}`).bind(ids),
  ]);
  const offers = new Map();
  for (const o of [...(qr.results || []), ...(lr.results || [])]) {
    if (!offers.has(o.item_id)) offers.set(o.item_id, []);
    offers.get(o.item_id).push({ price: Number(o.price), qty: o.qty });
  }
  for (const i of items) {
    const n = needFor(S, { qty: i.qty, est_unit_rial: i.est_unit_rial, offers: offers.get(i.id) || [] });
    out.set(i.id, { need: n.need, why: whyText(n), cat: n.cat, src: n.src, v: n.src === "quote" ? n.v : null, ruled: n.cat !== "s" });
  }
  return out;
}
/** شمارِ بازه‌های قواعد — برای نوارِ «حداقل استعلام» پنل‌ها */
export function ruleCount(R) { return DIMS.reduce((s, d) => s + ((R && R[d]) || []).length, 0); }

/**
 * پوششِ اقلامِ بازِ یک ارجاع: برای هر قلم حداقلِ لازم (needFor) و شمارِ تأمین‌کنندگانِ مختلف با خطِ «ثبت موقت + تأیید نهایی»
 * (have). پیشنهادهای سنجیدنی: خط‌های استعلامِ قیمت‌دار و اعلام‌های تأمین‌کنندگان در مکاتبات (بی ردشده‌ها و پیش‌نویس‌ها).
 */
export async function coverOf(env, assignmentId, rules, base) {
  const sr = await getSizeRules(env);
  const [ir, qr, lr] = await env.DB.batch([
    env.DB.prepare("SELECT id, title, qty, unit, est_unit_rial FROM items WHERE assignment_id=? AND state='open' ORDER BY line_no, id").bind(assignmentId),
    env.DB.prepare("SELECT item_id, supplier_name, qty, price, saved, final FROM quotes WHERE assignment_id=?").bind(assignmentId),
    env.DB.prepare(`SELECT l.item_id, l.qty, l.price FROM sp_lines l JOIN sp_threads t ON t.id=l.thread_id
      WHERE t.assignment_id=? AND l.price>0 AND ${LINE_OK}`).bind(assignmentId),
  ]);
  const quotes = qr.results || [], lines = lr.results || [];
  return (ir.results || []).map((i) => {
    const offers = [...quotes.filter((q) => q.item_id === i.id && Number(q.price) > 0), ...lines.filter((l) => l.item_id === i.id)].map((o) => ({ price: Number(o.price), qty: o.qty }));
    const n = needFor(sr, { qty: i.qty, est_unit_rial: i.est_unit_rial, offers });
    const have = new Set(quotes.filter((q) => q.item_id === i.id && q.saved && q.final).map((q) => skey(q.supplier_name)).filter(Boolean)).size;
    return { id: i.id, title: i.title, qty: i.qty, unit: i.unit, need: n.need, cat: n.cat, have, why: whyText(n) };
  });
}
