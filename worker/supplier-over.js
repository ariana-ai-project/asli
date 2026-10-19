/**
 * ردهٔ تأمین‌کننده و مشخصاتش به دستِ پشتیبانی — خواستهٔ مالک (مهر ۱۴۰۵): «ردهٔ تأمین‌کنندگان، همان که از دیتابیس آمده، در پنل
 * پشتیبانی عوض شود؛ جایی با مشخصاتِ تأمین‌کننده فیلد به فیلد — تلفن، نشانی، نام ثبتی، شمارهٔ ثبت — و ردهٔ A/B/C با توضیحِ کیفیِ
 * چرایی‌اش. فقط پنل پشتیبانی، نه کارشناسان.»
 *
 * supplier_grades با هر بارگذاریِ سوابقِ خرید از نو ساخته می‌شود (worker/catalog.js: DROP و RENAME)، پس تغییرِ پشتیبانی جدا می‌ماند:
 *   supplier_over  یک ردیف برای هر تأمین‌کننده با sn = keyOf ِ نام — همان کلیدِ purchases.supplier_n، supplier_grades.sn و sreg.name_n
 *                  (هرگز nkey ِ sp-core). ستونِ NULL یعنی «همان دادهٔ سوابق یا دفتر»؛ grade: A، B، C، یا «-» (بی‌رده به تصمیمِ پشتیبانی).
 *   events         هر ذخیره یک رخداد (kind='supplier_over'، با before و after ِ فیلدهای عوض‌شده و دلیل). تاریخچه با نمایهٔ جزئیِ
 *                  ix_events_supover خوانده می‌شود، پس فقط همین رخدادها پیموده می‌شوند، نه کلِ events.
 * ردهٔ مؤثر (gradeMap) در همهٔ خواندن‌های رده می‌نشیند: رتبهٔ نهایی و ترتیبِ دعوت (history.js — با gradeOver و gradeFile برای ✎ ِ
 * جدولِ سوابقِ کارشناس)، «معتمد»ِ برنامهٔ گیرندگان (cr-engine.js)، مناقصه (tender.js) و پروفایل (sreg.js، با sn برای دکمهٔ «🏷 ویرایشِ
 * رده و مشخصات»ِ کشو در پنل پشتیبانی). نوشتن فقط با ذخیرهٔ پشتیبانی — بی پرکردنِ پیشین؛ هر ذخیره چهار ردیف‌نوشتن.
 *
 * مسیرها (worker/cr-api.js، پس از requireSupport):
 *   GET /support/suppliers?q=      GET /support/supplier?sn=|name=      PUT /support/supplier
 */
import { HttpError } from "./http.js";
import { keyOf, ascii } from "./catalog.js";

export const SUPOVER_DDL = `
CREATE TABLE IF NOT EXISTS supplier_over (sn TEXT PRIMARY KEY, name TEXT, grade TEXT, grade_reason TEXT, legal_name TEXT, reg_no TEXT, national_id TEXT, address TEXT, phones TEXT, note TEXT, by_name TEXT, at INTEGER NOT NULL) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS ix_events_supover ON events(at) WHERE kind='supplier_over';
`;
export const GRADES = ["A", "B", "C"];
export const NO_GRADE = "-";
/** فیلدهای قابلِ تغییر به ترتیبِ فرم، با نامِ فارسی (تاریخچه و پیام‌ها) */
export const FIELD_FA = { grade: "رده", grade_reason: "توضیحِ کیفیِ رده", legal_name: "نام رسمی", reg_no: "شمارهٔ ثبت", national_id: "شناسهٔ ملی",
  address: "نشانی", phones: "تلفن‌ها", note: "یادداشت" };
const FIELDS = Object.keys(FIELD_FA);
const CAP = { grade_reason: 600, legal_name: 200, reg_no: 40, address: 400, note: 600 };
const IN_MAX = 90;
const now = () => Date.now();
const T = (v) => String(v == null ? "" : v).trim();
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
/* کلیدِ sp_suppliers.name_n — عیناً worker/sp-core.js:nkey (تکرار تا حلقهٔ ایمپورت نسازد)؛ فقط برای یافتنِ ردیفِ پنل با نمایه */
const nk = (x) => T(x).replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/\s+/g, " ").replace(/‌/g, " ").replace(/\s+/g, " ").toLowerCase();
/* پایگاهی که هنوز ensureSchema نخورده (یا آزمونی که فقط جدول‌های فهرست را دارد) supplier_over ندارد: همان سوابق */
const noTable = (e) => /no such table/i.test(String((e && e.message) || e));
const rowsOf = (st) => st.all().then((r) => r.results || [], (e) => { if (noTable(e)) return []; throw e; });

/* ------------------------------------------------------------------ */
/* ردهٔ مؤثر                                                            */
/* ------------------------------------------------------------------ */
/** ردهٔ مؤثر از ردیفِ سوابق (g) و تغییرِ پشتیبانی (o): A/B/C یا «-» (بی‌رده) بر سوابق می‌نشیند. imported = ردهٔ خودِ سوابق */
export function mergeGrade(g, o) {
  const og = o && o.grade;
  if (og) return { grade: og === NO_GRADE ? null : og, code: (g && g.code) || null, over: true, imported: (g && g.grade) || null };
  return g ? { grade: g.grade || null, code: g.code || null, over: false, imported: g.grade || null } : null;
}
/** ردیف‌های supplier_grades و supplier_over ِ چند کلید، تکه‌های ≤۹۰ تایی (سقفِ صد پارامترِ D1)، هر تکه یک batch */
async function readBoth(env, sns, overCols) {
  const keys = [...new Set((sns || []).map(T).filter(Boolean))];
  const g = new Map(), o = new Map();
  for (let i = 0; i < keys.length; i += IN_MAX) {
    const part = keys.slice(i, i + IN_MAX), q = part.map(() => "?").join(",");
    const sts = [env.DB.prepare(`SELECT sn, name, code, grade FROM supplier_grades WHERE sn IN (${q})`).bind(...part),
      env.DB.prepare(`SELECT ${overCols} FROM supplier_over WHERE sn IN (${q})`).bind(...part)];
    let res;
    try { res = (await env.DB.batch(sts)).map((r) => r.results || []); } catch (e) { if (!noTable(e)) throw e; res = await Promise.all(sts.map(rowsOf)); }
    for (const r of res[0]) g.set(r.sn, r);
    for (const r of res[1]) o.set(r.sn, r);
  }
  return { keys, g, o };
}
/** کلید ← {grade, code, over, imported}: ردهٔ مؤثرِ هر تأمین‌کننده — فقط کلیدهایی که سوابق یا تغییرِ رده دارند */
export async function gradeMap(env, sns) {
  const { keys, g, o } = await readBoth(env, sns, "sn, grade");
  const out = new Map();
  for (const k of keys) { const m = mergeGrade(g.get(k), o.get(k)); if (m) out.set(k, m); }
  return out;
}

/* ------------------------------------------------------------------ */
/* تلفن                                                                 */
/* ------------------------------------------------------------------ */
const TEL_SPLIT = /[\n\r,،;؛|\/\\]+/;
/** یک شماره: رقمِ فارسی لاتین؛ فاصله، خط تیره، نقطه، پرانتز و جهت‌نماها می‌روند؛ +98 و 0098 (و 98 ِ پیش از همراه) ← 0؛ نامعتبر ← null */
export function normTel(raw) {
  let p = ascii(T(raw)).replace(/[\s\-–—.()‌-‏‪-‮]/g, "");
  p = p.replace(/^(?:\+|00)98(?=\d{10}$)/, "0").replace(/^98(?=9\d{9}$)/, "0").replace(/^(?=9\d{9}$)/, "0").replace(/^00(?=\d)/, "+");
  return /^\+?\d{4,15}$/.test(p) ? p : null;
}
/** فهرستِ تلفنِ فرم: هر خط یا جداشده با ویرگول؛ تکراری یک بار ← «a, b» یا null. شمارهٔ نامعتبر ۴۲۲ (چیزی بی‌صدا نمی‌افتد) */
export function phoneList(s) {
  const out = [];
  for (const raw of String(s == null ? "" : s).split(TEL_SPLIT)) {
    if (!T(raw)) continue;
    const p = normTel(raw);
    if (!p) throw new HttpError(`شمارهٔ «${T(raw).slice(0, 30)}» نامعتبر است؛ هر شماره ۴ تا ۱۵ رقم (با پیش‌شماره یا +).`, 422);
    if (!out.includes(p)) out.push(p);
  }
  if (out.length > 10) throw new HttpError("حداکثر ده شماره.", 422);
  return out.length ? out.join(", ") : null;
}
/** شماره‌های متنِ دفتر یا دفترچه، بی خطا: تکه‌ای که شماره نشد با فاصله هم شکسته می‌شود و نامعتبرها کنار می‌روند */
const telsOf = (s) => String(s == null ? "" : s).split(TEL_SPLIT).flatMap((x) => { const p = normTel(x); return p ? [p] : T(x).split(/\s+/).map(normTel).filter(Boolean); });

/* ------------------------------------------------------------------ */
/* جست‌وجو و خواندن                                                     */
/* ------------------------------------------------------------------ */
/* تاریخچهٔ یک تأمین‌کننده: kind با همان متنِ نمایهٔ جزئی (نه پارامتر) تا SQLite فقط ix_events_supover را بپیماید */
export const HIST_SQL = "SELECT at, actor, payload_json FROM events WHERE kind='supplier_over' AND json_extract(payload_json, '$.sn')=? ORDER BY at DESC, id DESC LIMIT 30";
/**
 * GET /support/suppliers?q= — نام در سوابق (supplier_grades، با همان کلیدِ نرمال)، پنلِ تأمین‌کننده (sp_suppliers) و تغییرهای
 * پشتیبانی — هر سه کوچک‌اند — و پیشوندِ نام در دفترِ تحقیق (sreg با نمایهٔ name_n؛ نه LIKE روی ده هزار ردیف). purchases خوانده
 * نمی‌شود. بی q (کمتر از دو حرف): آخرین تغییرهای پشتیبانی. هر ردیف با ردهٔ مؤثر، ردهٔ سوابق و نشانِ تغییرِ پشتیبانی.
 */
export async function supplierSearch(env, q, limit = 30) {
  const k = keyOf(q), lim = Math.min(60, Math.max(1, parseInt(limit, 10) || 30)), recent = k.length < 2;
  const hits = new Map();
  const add = (sn, name, src) => {
    if (!sn) return;
    const h = hits.get(sn) || { sn, name: null, src: [] };
    if (!h.name && name) h.name = name;
    if (src && !h.src.includes(src)) h.src.push(src);
    hits.set(sn, h);
  };
  if (recent) {
    for (const r of (await env.DB.prepare("SELECT sn, name FROM supplier_over ORDER BY at DESC LIMIT ?").bind(lim).all()).results || []) add(r.sn, r.name);
  } else {
    /* «%» و «_»ِ نوشتهٔ کاربر حرف‌اند، نه نویسهٔ عام (وگرنه «%» همهٔ تأمین‌کنندگان را می‌آورد) */
    const like = (s) => `%${String(s).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const [g, o, sp, rg] = await env.DB.batch([
      env.DB.prepare("SELECT sn, name FROM supplier_grades WHERE sn LIKE ? ESCAPE '\\' LIMIT ?").bind(like(k), lim),
      env.DB.prepare("SELECT sn, name FROM supplier_over WHERE sn LIKE ? ESCAPE '\\' LIMIT ?").bind(like(k), lim),
      env.DB.prepare("SELECT name FROM sp_suppliers WHERE demo=0 AND name_n LIKE ? ESCAPE '\\' LIMIT ?").bind(like(nk(q)), lim),
      env.DB.prepare("SELECT name, name_n FROM sreg WHERE name_n >= ? AND name_n < ? ORDER BY name_n LIMIT ?").bind(k, k + "￿", lim)]);
    for (const r of g.results || []) add(r.sn, r.name, "hist");
    for (const r of o.results || []) add(r.sn, r.name);
    for (const r of sp.results || []) add(keyOf(r.name), r.name, "panel");
    for (const r of rg.results || []) add(r.name_n, r.name, "reg");
  }
  const list = [...hits.values()];
  const { g, o } = await readBoth(env, list.map((h) => h.sn),
    "sn, name, grade, at, COALESCE(grade, grade_reason, legal_name, reg_no, national_id, address, phones, note) IS NOT NULL AS edited");
  const out = list.map((h) => {
    const gr = g.get(h.sn) || null, ov = o.get(h.sn) || null, m = mergeGrade(gr, ov) || {};
    return { sn: h.sn, name: (gr && gr.name) || h.name || (ov && ov.name) || h.sn, code: m.code || null, grade: m.grade || null, imported: m.imported || null,
      grade_over: !!m.over, edited: !!(ov && ov.edited), at: ov ? ov.at : null, src: gr && !h.src.includes("hist") ? ["hist", ...h.src] : h.src };
  });
  /* سوابق اول، بعد نامی که با همین حروف شروع می‌شود، بعد الفبا؛ آخرین تغییرها به ترتیبِ زمان */
  const rk = (x) => (x.src.includes("hist") ? 0 : 2) + (x.sn.startsWith(k) ? 0 : 1);
  if (!recent) out.sort((a, b) => rk(a) - rk(b) || String(a.name).localeCompare(String(b.name), "fa"));
  return { q: recent ? "" : T(q), recent, list: out.slice(0, lim) };
}

/**
 * GET /support/supplier?sn=|name= — همه چیزِ یک تأمین‌کننده برای فرمِ پشتیبانی: دادهٔ واردشده (سوابق: نام، کد و رده؛ دفترِ تحقیق و
 * کشف‌شده‌هایی که در آن ادغام شده‌اند: نام رسمی، شمارهٔ ثبت، شناسهٔ ملی، نشانی و تلفن؛ شماره‌های پنل و دفترچه)، تغییرِ پشتیبانی،
 * مقدارِ مؤثر و تاریخچه (۳۰ تای آخر). دو رفت‌وبرگشت، همه با کلید یا نمایه. نامی که هیچ‌جا نیست ← ۴۰۴.
 */
export async function supplierInfo(env, q) {
  const sn = keyOf(T(q && q.sn) || T(q && q.name));
  if (!sn) throw new HttpError("نام تأمین‌کننده لازم است.", 422);
  const [g, o, rg, mg, ev] = await env.DB.batch([
    env.DB.prepare("SELECT name, code, grade FROM supplier_grades WHERE sn=?").bind(sn),
    env.DB.prepare("SELECT * FROM supplier_over WHERE sn=?").bind(sn),
    env.DB.prepare("SELECT sid, kind, name, phones, mobiles, data FROM sreg WHERE name_n=? ORDER BY CASE kind WHEN 'old' THEN 0 WHEN 'new' THEN 1 ELSE 2 END LIMIT 5").bind(sn),
    /* کشف‌شده‌هایی که «نام نزدیک» (G4) در همین تأمین‌کننده ادغام کرده — نشانی و تلفنشان مالِ همین است. CROSS: ترتیبِ اجبار —
       اول نام با نمایه، بعد ادغام‌ها با ix_salias_sid (نه همهٔ ادغام‌ها با کلیدِ kind) */
    env.DB.prepare(`SELECT s.sid, s.kind, s.name, s.phones, s.mobiles, s.data FROM sreg r CROSS JOIN sreg_alias a ON a.sid=r.sid CROSS JOIN sreg s ON s.sid=a.alias
      WHERE r.name_n=? AND a.kind='merge' AND a.status='تأییدشده' LIMIT 5`).bind(sn),
    env.DB.prepare(HIST_SQL).bind(sn)]);
  const gr = (g.results || [])[0] || null, ov = (o.results || [])[0] || null;
  const seen = new Set(), reg = [];
  for (const r of [...(rg.results || []), ...(mg.results || [])]) if (!seen.has(r.sid)) { seen.add(r.sid); reg.push({ ...r, d: parse(r.data, {}) }); }
  /* شماره‌های پنل (sp_suppliers با نمایهٔ name_n) و دفترچهٔ قدیم (suppliers با نمایهٔ name)؛ هم‌نامی با keyOf سنجیده می‌شود.
     خودِ کلید هم نامزد است: تأمین‌کننده‌ای که فقط در پنل است با sn هم پیدا شود */
  const names = [...new Set([gr && gr.name, ov && ov.name, ...reg.map((r) => r.name), T(q && q.name)].filter(Boolean))].slice(0, 8);
  const spKeys = [...new Set([...names, sn].map(nk))];
  const [sp, bk] = await env.DB.batch([
    env.DB.prepare(`SELECT s.name, p.phone, p.label FROM sp_suppliers s LEFT JOIN sp_phones p ON p.supplier_id=s.id WHERE s.demo=0 AND s.name_n IN (${spKeys.map(() => "?").join(",")}) ORDER BY p.panel DESC, p.id LIMIT 20`).bind(...spKeys),
    env.DB.prepare(`SELECT name, code, phone, tel2, city FROM suppliers WHERE name IN (${[...names, sn].map(() => "?").join(",")}) LIMIT 5`).bind(...names, sn)]);
  const spRows = (sp.results || []).filter((r) => keyOf(r.name) === sn), book = (bk.results || []).find((r) => keyOf(r.name) === sn) || null;
  if (!gr && !ov && !reg.length && !spRows.length && !book) throw new HttpError("این تأمین‌کننده در سوابق خرید، پنل تأمین‌کننده یا دفترِ تحقیق نیست.", 404);

  const first = (f) => { for (const r of reg) { const v = r.d && r.d[f]; if (v != null && T(v)) return T(v); } return null; };
  const tels = [];
  const addTel = (phone, src, label) => { if (phone && !tels.some((x) => x.phone === phone)) tels.push({ phone, src, label: label || null }); };
  for (const r of spRows) if (r.phone) addTel(normTel(r.phone) || r.phone, "پنل", r.label);
  for (const r of reg) for (const p of [...telsOf(r.phones), ...telsOf(r.mobiles)]) addTel(p, "دفتر");
  if (book) for (const p of telsOf([book.phone, book.tel2].filter(Boolean).join("\n"))) addTel(p, "دفترچه");
  const imported = {
    name: (gr && gr.name) || (reg[0] && reg[0].name) || (spRows[0] && spRows[0].name) || (book && book.name) || null,
    code: (gr && gr.code) || (book && book.code) || null, grade: (gr && gr.grade) || null, research_rank: first("rank"),
    legal_name: first("legal_name"), reg_no: first("registration_no"), national_id: first("national_id"), address: first("address"), phones: tels,
    city: (book && book.city) || null,
  };
  const over = ov ? { ...Object.fromEntries(FIELDS.map((f) => [f, ov[f] == null ? null : ov[f]])), by: ov.by_name || null, at: ov.at } : null;
  const m = mergeGrade(gr, ov);
  const pickO = (f) => (ov && ov[f]) || imported[f] || null;
  const effective = { grade: m ? m.grade : null, grade_over: !!(m && m.over), code: imported.code, grade_reason: (ov && ov.grade_reason) || null,
    legal_name: pickO("legal_name"), reg_no: pickO("reg_no"), national_id: pickO("national_id"), address: pickO("address"),
    phones: ov && ov.phones ? ov.phones.split(", ") : tels.map((x) => x.phone) };
  const history = (ev.results || []).map((r) => {
    const p = parse(r.payload_json, {}), a = p.after || {}, b = p.before || {};
    return { at: r.at, by: r.actor === "support" ? "پشتیبانی" : r.actor, reason: p.reason || "",
      changes: Object.keys(a).map((f) => ({ field: f, fa: FIELD_FA[f] || f, before: b[f] == null ? null : b[f], after: a[f] == null ? null : a[f] })) };
  });
  return { sn, name: imported.name || (ov && ov.name) || T(q && q.name) || sn, sid: reg.length ? reg[0].sid : null, imported, over, effective, history, fields: FIELD_FA };
}

/* ------------------------------------------------------------------ */
/* ذخیره                                                                */
/* ------------------------------------------------------------------ */
/** مقدارِ تمیزِ یک فیلد؛ خالی ← null (یعنی «همان سوابق یا دفتر»)؛ نامعتبر ← ۴۲۲ */
function clean(f, v) {
  const s = T(v);
  if (f === "grade") {
    const gd = s.toUpperCase();
    if (!gd) return null;
    if (gd !== NO_GRADE && !GRADES.includes(gd)) throw new HttpError("رده یکی از A، B، C یا «-» (بی‌رده) است؛ خالی یعنی همان ردهٔ سوابق.", 422);
    return gd;
  }
  if (!s) return null;
  if (f === "phones") return phoneList(s);
  if (f === "national_id") {
    const d = ascii(s).replace(/[\s\-–.]/g, "");
    if (!/^\d{10,11}$/.test(d)) throw new HttpError("شناسهٔ ملی ۱۰ یا ۱۱ رقم است.", 422);
    return d;
  }
  if (f === "reg_no") return ascii(s).replace(/\s+/g, " ").slice(0, CAP.reg_no);
  if (f === "legal_name") return s.replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/\s+/g, " ").slice(0, CAP.legal_name);
  /* متنِ چندخطی: فاصله‌های پشتِ هم یکی، خطِ خالیِ پشتِ هم یکی */
  return s.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").slice(0, CAP[f]);
}

/**
 * PUT /support/supplier — {sn|name, grade?, grade_reason?, legal_name?, reg_no?, national_id?, address?, phones?, note?, reason}. فیلدِ
 * نیامده دست نمی‌خورد و خالی یعنی «برگشت به سوابق یا دفتر». دلیل لازم است و دست‌کم یک فیلد باید عوض شود. یک ردیف در supplier_over
 * (upsert) و یک رخداد در events، در یک batch. خروجی: supplierInfo ِ تازه.
 * ردیفِ موجود فقط در فیلدهای عوض‌شده نوشته می‌شود: دو پشتیبانِ هم‌زمان که هر کدام فیلدِ دیگری را عوض می‌کنند، کارِ هم را پاک نمی‌کنند.
 */
export async function supplierSave(env, w, b) {
  const body = b && typeof b === "object" ? b : {};
  const reason = T(body.reason).slice(0, 300);
  if (reason.length < 3) throw new HttpError("دلیلِ این تغییر را بنویسید.", 422);
  const next = {};
  for (const f of FIELDS) if (body[f] !== undefined) next[f] = clean(f, body[f]);
  const info = await supplierInfo(env, body);
  const cur = info.over || {}, before = {}, after = {};
  for (const [f, v] of Object.entries(next)) { const was = cur[f] == null ? null : cur[f]; if (v !== was) { before[f] = was; after[f] = v; } }
  const changed = Object.keys(after);
  if (!changed.length) throw new HttpError("تغییری نیامده است.", 422);
  const row = FIELDS.map((f) => (f in after ? after[f] : cur[f] == null ? null : cur[f]));
  const t = now();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO supplier_over (sn,name,${FIELDS.join(",")},by_name,at) VALUES (?,?,${FIELDS.map(() => "?").join(",")},?,?)
      ON CONFLICT(sn) DO UPDATE SET name=excluded.name, ${changed.map((f) => `${f}=excluded.${f}`).join(", ")}, by_name=excluded.by_name, at=excluded.at`)
      .bind(info.sn, info.name, ...row, (w && w.name) || "پشتیبانی", t),
    env.DB.prepare("INSERT INTO events (at,actor,kind,payload_json) VALUES (?,?,?,?)").bind(t, "support", "supplier_over",
      JSON.stringify({ sn: info.sn, name: info.name, before, after, reason }))]);
  return supplierInfo(env, { sn: info.sn, name: info.name });
}
