/**
 * «منبعِ هر خانه»ِ خط استعلام (درخواست مالک، مهر ۱۴۰۵): هر مقدارِ تب استعلامات می‌داند از کجا آمده — دستی، بستهٔ پنلِ تأمین‌کننده
 * (گفت‌وگوی کارشناس یا مذاکرهٔ کارشناس هوشمند)، خوانشِ هوشمندِ پیش‌فاکتور، پیش‌فاکتورِ رسمی، مناقصه، شرطِ شرکت، یا پیش‌فرض.
 *
 * quotes.src_json: {فیلد: {s, at, by?, ref?, prev?: {v, s}}} — فقط فیلدهایی که نوشته شده‌اند. خطِ قدیمیِ بی src_json منبعش را از ستون‌های
 * امروزِ source و origin می‌گیرد (legacyOf) — بی بازنویسیِ داده. جایگزینیِ دستیِ مقدارِ یک منبعِ بیرونی (EXTERNAL) علت می‌خواهد و مقدارِ
 * قبلی در prev و جدولِ quote_edits می‌ماند (api.js:quoteUpdate).
 */
export const SRC_FA = {
  manual: "دستی", manual_tg: "دستی (تلگرام)", bundle: "بستهٔ پنلِ تأمین‌کننده", bundle_ai: "بستهٔ مذاکرهٔ هوشمند", pf: "خوانشِ هوشمندِ پیش‌فاکتور",
  pf_off: "پیش‌فاکتورِ رسمی", tender: "مناقصه", company: "شرطِ شرکت", req: "خواستهٔ درخواست", def: "پیش‌فرضِ سامانه",
};
/* مقدارِ این منبع‌ها را کسی بیرون از کارشناس داده؛ جایگزینیِ دستی‌اش علت می‌خواهد */
export const EXTERNAL = new Set(["bundle", "bundle_ai", "pf", "pf_off", "tender"]);
/* خانه‌هایی که منبع می‌گیرند */
export const SRC_FIELDS = ["supplier_code", "spec", "unit", "qty", "price", "dtime", "valid_days", "ship", "invoice", "pay", "vat", "deal", "place", "place_other", "prices_json"];

const T = (v) => String(v == null ? "" : v).trim();
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };

/** منبعِ کلِ خط از ستون‌های پیشین (خطِ بی src_json) */
export function legacyOf(q) {
  if (!q) return "manual";
  if (q.origin === "tender" || q.source === "tender") return "tender";
  if (q.origin === "supplier" || q.source === "supplier") return "bundle";
  if (q.source === "extract" || q.origin === "proforma") return "pf";
  if (q.source === "ai") return "bundle_ai";
  return q.source === "telegram" ? "manual_tg" : "manual";
}

/** نقشهٔ منبعِ همهٔ خانه‌های پرِ یک خط — نوشته‌شده یا از ستون‌های پیشین */
export function srcMap(q) {
  const m = parse(q && q.src_json, {}) || {};
  const base = legacyOf(q);
  const out = {};
  for (const f of SRC_FIELDS) {
    if (m[f]) out[f] = m[f];
    else if (q && T(q[f])) out[f] = { s: f === "invoice" && q.invoice_src === "manual" ? "manual" : base, legacy: true };
  }
  return out;
}

/** منبعِ یک‌جا برای چند خانه: {f: {s, at, by?, ref?}} */
export function stamp(fields, s, meta = {}) {
  const at = meta.at || Date.now(), o = {};
  for (const f of fields) o[f] = { s, at, ...(meta.by ? { by: meta.by } : {}), ...(meta.ref ? { ref: meta.ref } : {}) };
  return o;
}

/** src_jsonِ تازه: نقشهٔ پیشین + خانه‌های تازه */
export const mergeSrc = (srcJson, patch) => JSON.stringify({ ...(parse(srcJson, {}) || {}), ...patch });

/**
 * خانه‌هایی از تغییرِ دستی که جای مقدارِ یک منبعِ بیرونی می‌نشینند (علت می‌خواهند): مقدارِ پیشین پر بوده، منبعش بیرونی بوده و مقدارِ تازه فرق دارد.
 * vals: {f: مقدارِ ذخیره‌شدنیِ تازه}
 */
export function overrides(q, vals) {
  const sm = srcMap(q), out = [];
  for (const [f, v] of Object.entries(vals)) {
    if (!SRC_FIELDS.includes(f)) continue;
    const old = q[f], s = sm[f] && sm[f].s;
    if (T(old) && EXTERNAL.has(s) && T(old) !== T(v)) out.push(f);
  }
  return out;
}

/** منبعِ دستی برای خانه‌های تغییرکرده، با مقدار و منبعِ پیشین (prev) */
export function manualStamp(q, vals, { by, channel = "panel", at = Date.now() } = {}) {
  const sm = srcMap(q), o = {};
  for (const f of Object.keys(vals)) {
    if (!SRC_FIELDS.includes(f)) continue;
    const prev = T(q[f]) ? { v: q[f], s: (sm[f] && sm[f].s) || legacyOf(q) } : null;
    o[f] = { s: channel === "telegram" ? "manual_tg" : "manual", at, ...(by ? { by } : {}), ...(prev ? { prev } : {}) };
  }
  return o;
}

/** نمای کوتاهِ منبع برای پنل: {f: {s, fa, at, by, prev}} */
export function srcView(q) {
  const m = srcMap(q), out = {};
  for (const [f, x] of Object.entries(m)) out[f] = { s: x.s, fa: SRC_FA[x.s] || x.s, ...(x.at ? { at: x.at } : {}), ...(x.by ? { by: x.by } : {}), ...(x.prev ? { prev: { v: x.prev.v, s: x.prev.s, fa: SRC_FA[x.prev.s] || x.prev.s } } : {}) };
  return out;
}

/** خطِ تازهٔ بی قیمت (افزودن از سوابق، جستجو، دعوت): واحد و مقدار همان خواستهٔ قلم، نوع فاکتور پیش‌فرض */
export const PLACEHOLDER_SRC = JSON.stringify({ unit: { s: "req" }, qty: { s: "req" }, invoice: { s: "def" } });

export const QUOTE_EDITS_DDL = "CREATE TABLE IF NOT EXISTS quote_edits (id INTEGER PRIMARY KEY, quote_id INTEGER NOT NULL, assignment_id INTEGER, at INTEGER NOT NULL, by TEXT, channel TEXT, fields_json TEXT NOT NULL, reason TEXT)";
