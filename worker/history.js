/**
 * سوابق تأمین — بارگذاری اسنادِ خریدِ گذشته و امتیازِ زمان‌وزنیِ تأمین‌کنندگان
 *
 * (T-17 supply_history · IMP-13 · مبنا: اسناد ۱۴۰۴)
 *
 * چه چیزی وارد می‌شود: هر سطر یک خریدِ انجام‌شده است — تاریخ، تأمین‌کننده، قلم،
 * مقدار/فی/مبلغ، و پروژه. مدیر از تب «سوابق تأمین» هر وقت خواست فایل تازه
 * می‌دهد؛ رکورد تکراری (همان تأمین‌کننده، قلم، تاریخ، مقدار، فی) دوباره درج
 * نمی‌شود و هیچ رکوردی حذف نمی‌شود (INV-04).
 *
 * چه چیزی برمی‌گردد: برای یک قلم، هر تأمین‌کننده‌ای که یا همان قلم را داده یا
 * اصلاً از او خرید شده، با **سطل‌های ماهانهٔ مبلغ** — یک بار برای کل خریدها و یک
 * بار برای همین قلم. وزن‌دهی و رتبه در مرورگر حساب می‌شود تا وقتی کارشناس ضریب
 * ۱ تا ۱۰ را عوض می‌کند، جدول همان لحظه دوباره چیده شود، بی رفت‌وبرگشت.
 *
 * قاعدهٔ وزنِ زمانی (همان که این‌جا و در shared.js یکی است و تست تطابق دارد):
 *   خریدِ ۱۴۰۴ به بعد → ضریب ۱
 *   هر ماه که عقب‌تر می‌رویم، خطی کم می‌شود؛ شیب از ضریب ۱..۱۰ کارشناس می‌آید
 *   قدیمی‌ترین ماهِ موجود هیچ‌وقت صفر یا منفی نمی‌شود: با ضریب ۱۰ دقیقاً به کف
 *   (۰٫۰۵) می‌رسد و با ضریب ۱ به ۰٫۹۰۵.
 */
import { HttpError } from "./http.js";

const now = () => Date.now();
const T = (v) => String(v == null ? "" : v).trim();
const num = (v) => { const s = String(v == null ? "" : v).replace(/[,٬]/g, "").replace(/[۰-۹]/g, (c) => "۰۱۲۳۴۵۶۷۸۹".indexOf(c)).trim(); if (!s) return null; const n = Number(s); return isNaN(n) ? null : n; };
export const nrm = (x) => String(x == null ? "" : x).replace(/[ي]/g, "ی").replace(/[ك]/g, "ک").replace(/[‌\s]+/g, " ").trim().toLowerCase();

export const HISTORY_SCHEMA = `
CREATE TABLE IF NOT EXISTS history_batches (id INTEGER PRIMARY KEY, filename TEXT, imported_at INTEGER NOT NULL, rows INTEGER, inserted INTEGER, dup INTEGER, suppliers INTEGER, mapping_json TEXT);
CREATE TABLE IF NOT EXISTS supply_history (id INTEGER PRIMARY KEY, batch_id INTEGER NOT NULL, supplier_name TEXT NOT NULL, supplier_norm TEXT NOT NULL, item_title TEXT NOT NULL, item_norm TEXT NOT NULL, item_code TEXT, party TEXT, supplied_on TEXT NOT NULL, ym TEXT NOT NULL, qty REAL, unit_price REAL, amount REAL NOT NULL, doc_no TEXT, dkey TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_hist_item ON supply_history(item_norm);
CREATE INDEX IF NOT EXISTS ix_hist_code ON supply_history(item_code);
CREATE INDEX IF NOT EXISTS ix_hist_sup ON supply_history(supplier_norm);
`;

/* ------------------------------------------------------------------ */
/* وزن زمانی                                                           */
/* ------------------------------------------------------------------ */

export const BASE_YM = "1404/01";
export const FLOOR = 0.05;

/** «1404/01» → شمارهٔ ماه (برای فاصله‌گیری) */
export const monthIndex = (ym) => { const m = /^(\d{4})\/(\d{1,2})/.exec(String(ym || "")); return m ? (+m[1]) * 12 + (+m[2] - 1) : null; };

/**
 * ضریب یک ماه. k ضریب ۱..۱۰ کارشناس، oldest قدیمی‌ترین ماهِ موجود در سوابق.
 * خطی در فاصله، همیشه در (0, 1]، و در قدیمی‌ترین ماه = 1 − (k/10)(1 − کف).
 */
export function recencyWeight(ym, oldest, k = 5, base = BASE_YM, floor = FLOOR) {
  const m = monthIndex(ym), b = monthIndex(base), o = monthIndex(oldest);
  if (m == null || b == null) return 1;
  if (m >= b) return 1;
  const M = Math.max(1, b - (o == null ? m : Math.min(o, m)));
  const dist = Math.min(M, b - m);
  const kk = Math.min(10, Math.max(1, Number(k) || 5));
  return 1 - (kk / 10) * (dist / M) * (1 - floor);
}

/* ------------------------------------------------------------------ */
/* بارگذاری                                                            */
/* ------------------------------------------------------------------ */

/** «1404/1/5»، «1404-01-05»، «14040105» → «1404/01/05»؛ نامعتبر → null */
export function normDate(v) {
  const s = String(v == null ? "" : v).replace(/[۰-۹]/g, (c) => "۰۱۲۳۴۵۶۷۸۹".indexOf(c)).trim();
  let m = /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/.exec(s);
  if (!m) { const c = /^(\d{4})(\d{2})(\d{2})$/.exec(s); if (c) m = [s, c[1], c[2], c[3]]; }
  if (!m) return null;
  const jy = +m[1], jm = +m[2], jd = +m[3];
  if (jy < 1300 || jy > 1500 || jm < 1 || jm > 12 || jd < 1 || jd > 31) return null;
  return `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
}

export async function historyBegin(env, body) {
  const r = await env.DB.prepare("INSERT INTO history_batches (filename,imported_at,rows,mapping_json) VALUES (?,?,?,?)")
    .bind(T(body.filename) || null, now(), body.rows == null ? null : Number(body.rows), body.mapping ? JSON.stringify(body.mapping) : null).run();
  return { batch_id: r.meta.last_row_id };
}

/**
 * یک دسته سطر. هر سطر: {date, supplier, item, code?, qty?, price?, amount?, party?, doc?}
 * مبلغ = amount، یا فی×مقدار. سطرِ بی‌مبلغ یا بی‌تاریخ رد می‌شود و شمرده می‌شود.
 */
export async function historyChunk(env, body) {
  const batch = Number(body.batch_id); if (!batch) throw new HttpError("batch_id لازم است.");
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const t = now();
  const stmts = [];
  let bad = 0;
  for (const r of rows) {
    const date = normDate(r.date);
    const supplier = T(r.supplier), item = T(r.item);
    const qty = num(r.qty), price = num(r.price);
    let amount = num(r.amount);
    if (amount == null && price != null && qty != null) amount = price * qty;
    if (!date || !supplier || !item || amount == null || amount <= 0) { bad++; continue; }
    /* کلیدِ تکراری در خودِ سطر ساخته می‌شود: UNIQUE روی ستون‌های NULL‌پذیر در SQLite
       تکراری را نمی‌گیرد (هر NULL با NULL دیگر فرق دارد) و سطرِ بی‌مقدار/بی‌فی دوباره
       درج می‌شد. */
    const dkey = [nrm(supplier), nrm(item), date, qty == null ? "" : qty, price == null ? "" : price, amount].join("|");
    stmts.push(env.DB.prepare(
      `INSERT OR IGNORE INTO supply_history (batch_id,supplier_name,supplier_norm,item_title,item_norm,item_code,party,supplied_on,ym,qty,unit_price,amount,doc_no,dkey,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(batch, supplier, nrm(supplier), item, nrm(item), T(r.code) || null, T(r.party) || null, date, date.slice(0, 7), qty, price, amount, T(r.doc) || null, dkey, t));
  }
  let inserted = 0;
  for (let i = 0; i < stmts.length; i += 100) {
    const res = await env.DB.batch(stmts.slice(i, i + 100));
    for (const x of res) inserted += (x.meta && x.meta.changes) || 0;
  }
  const dup = stmts.length - inserted;
  await env.DB.prepare("UPDATE history_batches SET inserted=COALESCE(inserted,0)+?, dup=COALESCE(dup,0)+? WHERE id=?").bind(inserted, dup, batch).run();
  return { ok: true, inserted, dup, bad };
}

export async function historyFinish(env, body) {
  const batch = Number(body.batch_id); if (!batch) throw new HttpError("batch_id لازم است.");
  const sup = await env.DB.prepare("SELECT COUNT(DISTINCT supplier_norm) AS n FROM supply_history WHERE batch_id=?").bind(batch).first();
  await env.DB.prepare("UPDATE history_batches SET suppliers=? WHERE id=?").bind(sup ? sup.n : 0, batch).run();
  const b = await env.DB.prepare("SELECT * FROM history_batches WHERE id=?").bind(batch).first();
  const total = await env.DB.prepare("SELECT COUNT(*) AS n, MIN(supplied_on) AS oldest, MAX(supplied_on) AS newest, COUNT(DISTINCT supplier_norm) AS suppliers FROM supply_history").first();
  return { ok: true, batch: b, total };
}

export async function historyStatus(env) {
  const total = await env.DB.prepare("SELECT COUNT(*) AS n, MIN(supplied_on) AS oldest, MAX(supplied_on) AS newest, COUNT(DISTINCT supplier_norm) AS suppliers, COUNT(DISTINCT item_norm) AS items FROM supply_history").first();
  const batches = (await env.DB.prepare("SELECT * FROM history_batches ORDER BY id DESC LIMIT 20").all()).results || [];
  return { total, batches };
}

/* ------------------------------------------------------------------ */
/* سوابق یک قلم                                                        */
/* ------------------------------------------------------------------ */

/**
 * برای یک قلم: تأمین‌کنندگانی که آن را داده‌اند، با سطل ماهانهٔ مبلغ برای همین
 * قلم و برای کل خریدهایشان، فهرست خریدهای همین قلم، و راه‌های تماس اگر ثبت باشد.
 * تطبیق قلم: کد اگر باشد، وگرنه عنوانِ نرمال‌شده؛ اگر هیچ، تطبیقِ تقریبی روی
 * دو کلمهٔ اول و پرچمِ fuzzy.
 */
export async function historyFor(env, { item, code }) {
  const key = nrm(item);
  if (!key && !T(code)) throw new HttpError("عنوان یا کد قلم لازم است.");
  const where = [], args = [];
  if (T(code)) { where.push("item_code=?"); args.push(T(code)); }
  if (key) { where.push("item_norm=?"); args.push(key); }
  let rows = (await env.DB.prepare(`SELECT * FROM supply_history WHERE ${where.join(" OR ")} ORDER BY supplied_on DESC LIMIT 2000`).bind(...args).all()).results || [];
  let fuzzy = false;
  if (!rows.length && key) {
    const words = key.split(" ").filter((w) => w.length > 1).slice(0, 2).join(" ");
    if (words.length >= 4) {
      rows = (await env.DB.prepare("SELECT * FROM supply_history WHERE item_norm LIKE ? ORDER BY supplied_on DESC LIMIT 2000").bind(`%${words}%`).all()).results || [];
      fuzzy = rows.length > 0;
    }
  }
  const range = await env.DB.prepare("SELECT MIN(ym) AS oldest, MAX(ym) AS newest, COUNT(*) AS n FROM supply_history").first();
  if (!rows.length) return { available: !!(range && range.n), item, code, fuzzy: false, oldest: range && range.oldest, base: BASE_YM, suppliers: [], total_rows: range ? range.n : 0 };

  const sups = [...new Set(rows.map((r) => r.supplier_norm))];
  /* کل خریدها از همین تأمین‌کننده‌ها، به ماه — یک کوئریِ گروهی */
  const all = (await env.DB.prepare(
    `SELECT supplier_norm, ym, SUM(amount) AS amt, COUNT(*) AS n FROM supply_history WHERE supplier_norm IN (${sups.map(() => "?").join(",")}) GROUP BY supplier_norm, ym`,
  ).bind(...sups).all()).results || [];
  const contacts = (await env.DB.prepare("SELECT code, name, city, site, phone, tel2, email FROM suppliers LIMIT 3000").all()).results || [];

  const bySup = new Map();
  for (const s of sups) bySup.set(s, { name: "", total: {}, item: {}, buys: [], totalCount: 0 });
  for (const r of rows) {
    const g = bySup.get(r.supplier_norm);
    g.name = g.name || r.supplier_name;
    g.item[r.ym] = (g.item[r.ym] || 0) + r.amount;
    g.buys.push({ date: r.supplied_on, qty: r.qty, price: r.unit_price, amount: r.amount, party: r.party, title: r.item_title, doc: r.doc_no });
  }
  for (const a of all) { const g = bySup.get(a.supplier_norm); if (g) { g.total[a.ym] = a.amt; g.totalCount += a.n; } }

  const suppliers = [...bySup.values()].map((g) => {
    const c = contacts.find((x) => nrm(x.name) === nrm(g.name));
    return { ...g, contact: c || null };
  });
  return { available: true, item, code, fuzzy, oldest: range.oldest, newest: range.newest, base: BASE_YM, floor: FLOOR, suppliers, total_rows: range.n };
}
