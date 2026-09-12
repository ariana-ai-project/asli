/**
 * سوابق خرید — بارگذاری فایل مرجع و محاسبهٔ ارقام تب «بررسی سوابق»
 *
 * فایل مرجع (خروجی اقلام با ستون‌های تعدیل‌شده) در مرورگرِ مدیر خوانده و
 * دسته‌دسته این‌جا نوشته می‌شود؛ Worker خودش اکسل ۷۰ هزارسطری را باز نمی‌کند.
 *
 * تب «بررسی سوابق» با کوئری ثابت جواب می‌گیرد — بدون مدل زبانی. برای هر
 * تأمین‌کنندهٔ یک قلم دو جفت عدد برمی‌گردد:
 *   • «خام»    = جمع ستون «قیمت کل (۱۴۰۴)» — مبلغ به نرخ امروز.
 *   • «گشتاور» = همان جمع، وقتی هر خرید با فاصلهٔ ماهانه‌اش تا اسفند ۱۴۰۴
 *                خطی کم‌ارزش شود. شیبِ کاهش را «ضریب اهمیت گشتاور» (۱ تا ۱۰)
 *                در پنل کارشناس تعیین می‌کند.
 * سهم، امتیاز، رتبه و مرتب‌سازی در مرورگر حساب می‌شوند تا تغییر ضریب اهمیت
 * همان لحظه اثر کند (همان رفتار ماک‌آپ مرجع).
 */

import { HttpError } from "./http.js";

/* اسفند ۱۴۰۴ — مبنای ارزش‌گذاری. خریدِ این ماه و بعدترش ضریب ۱ می‌گیرد. */
export const BASE_YM = 1404 * 12 + 12;
/* بیشترین افتِ ممکن. با ۰٫۹۵ حتی قدیمی‌ترین خرید با ضریب ۱۰ هم ۵٪ ارزشش را
   نگه می‌دارد، پس هیچ گشتاوری صفر یا منفی نمی‌شود. */
export const MAX_DROP = 0.95;

export const clampK = (k) => Math.min(10, Math.max(1, Math.round(Number(k) || 1)));

/** افتِ ارزش به ازای هر ماه فاصله. `ageMax` = فاصلهٔ قدیمی‌ترین خریدِ موجود. */
export function decayPerMonth(k, ageMax) {
  return clampK(k) / 10 * MAX_DROP / Math.max(1, ageMax);
}

/** ضریب گشتاور یک خرید در ماهِ `ym` — همیشه در بازهٔ [۰٫۰۵، ۱]. */
export function momentWeight(ym, k, ageMax) {
  const span = Math.max(1, ageMax);
  const age = Math.min(Math.max(BASE_YM - ym, 0), span);
  return 1 - decayPerMonth(k, span) * age;
}

/* همان عبارت به زبان SQLite. min/max دوآرگومانی اسکالرند، پس داخل SUM درست‌اند. */
const W_SQL = "(1 - ? * min(max(? - ym, 0), ?))";
const wArgs = (k, ageMax) => [decayPerMonth(k, ageMax), BASE_YM, Math.max(1, ageMax)];

const nrm = (x) => String(x == null ? "" : x).replace(/[ي]/g, "ی").replace(/[ك]/g, "ک").replace(/‌/g, " ").replace(/\s+/g, " ").trim();

/* «سایر تامین کنندگان» در فایل مرجع یک سطل تجمیعی است، نه یک تأمین‌کننده. اگر
   بماند در بیشتر اقلام رتبهٔ اول می‌شود و سهم تأمین‌کنندگان واقعی را له می‌کند —
   در گازوئیل ۵۴٪ از کل خرید زیر همین یک نام است. از رتبه‌بندی کنار گذاشته
   می‌شود، ولی جمعش برمی‌گردد تا کارشناس بداند چه چیزی از سهم‌ها کم شده. */
const BUCKETS = new Set(["سایر تامین کنندگان", "سایر تأمین کنندگان", "متفرقه"].map(nrm));
const T = (v) => { const s = String(v == null ? "" : v).trim(); return s || null; };
const N = (v) => { const s = String(v == null ? "" : v).replace(/,/g, "").trim(); if (!s) return null; const n = Number(s); return isNaN(n) ? null : n; };

/* ------------------------------------------------------------------ */
/* بارگذاری فایل مرجع                                                   */
/* ------------------------------------------------------------------ */

const COLS = ["import_id", "dkey", "order_date", "ym", "item_code", "code2", "title", "title_n", "qty", "unit",
  "unit_price", "amount", "supplier", "supplier_n", "idx_val", "amount_1404", "unit_1404", "lvl1", "lvl2", "lvl3"];

export const HISTORY_TABLE = "CREATE TABLE IF NOT EXISTS purchase_history ("
  + "id INTEGER PRIMARY KEY, import_id INTEGER NOT NULL, dkey TEXT, order_date TEXT, ym INTEGER,"
  + " item_code TEXT, code2 TEXT, title TEXT, title_n TEXT, qty REAL, unit TEXT,"
  + " unit_price REAL, amount REAL, supplier TEXT, supplier_n TEXT,"
  + " idx_val REAL, amount_1404 REAL, unit_1404 REAL, lvl1 TEXT, lvl2 TEXT, lvl3 TEXT)";

const HISTORY_INDEXES = [
  "CREATE INDEX IF NOT EXISTS ix_ph_code2 ON purchase_history(code2)",
  "CREATE INDEX IF NOT EXISTS ix_ph_item ON purchase_history(item_code)",
  "CREATE INDEX IF NOT EXISTS ix_ph_title ON purchase_history(title_n)",
  "CREATE INDEX IF NOT EXISTS ix_ph_sup ON purchase_history(supplier_n)",
  /* هویتِ ردیف. روی ردیف‌های قدیمیِ بی‌کلید مزاحمتی ندارد چون SQLite هر NULL را
     با NULL دیگر نابرابر می‌گیرد. */
  "CREATE UNIQUE INDEX IF NOT EXISTS ux_ph_dkey ON purchase_history(dkey)",
];

/**
 * شروع بارگذاری.
 *
 * سه حالت، به ترتیبِ ارزانی:
 *   skip    — اثر انگشتِ فایل با بارگذاریِ فعلی یکی است: هیچ نوشتنی لازم نیست.
 *   append  — همهٔ ردیف‌های موجود کلید دارند: فقط ردیف‌های تازه نوشته می‌شوند.
 *   replace — ردیف‌های بی‌کلیدِ بارگذاری‌های قدیمی هنوز هستند و با درجِ افزایشی
 *             دوبار شمرده می‌شوند، پس یک بار جدول از نو ساخته می‌شود.
 *
 * جدول DROP و دوباره ساخته می‌شود، نه DELETE: پاک‌کردن ۷۰ هزار ردیف در D1
 * ۷۰ هزار «سطر نوشته‌شده» حساب می‌شود و سهمیهٔ روزانه را دو برابر می‌سوزاند.
 */
export async function historyBegin(env, body) {
  const fp = T(body.fingerprint);
  const cur = await activeImport(env);
  if (fp && cur && cur.stats.fingerprint === fp) {
    return { skipped: true, mode: "skip", import_id: cur.id, rows: cur.row_count };
  }

  const legacy = await env.DB.prepare("SELECT 1 AS x FROM purchase_history WHERE dkey IS NULL LIMIT 1").first();
  const mode = legacy ? "replace" : "append";
  if (mode === "replace") {
    await env.DB.exec("DROP TABLE IF EXISTS purchase_history;");
    await env.DB.exec(HISTORY_TABLE + ";");
  }
  await env.DB.prepare("UPDATE hist_imports SET state='stale' WHERE state<>'stale'").run();
  const r = await env.DB.prepare("INSERT INTO hist_imports (filename,imported_at,row_count,state,stats_json) VALUES (?,?,?,'loading',?)")
    .bind(T(body.filename), Date.now(), Number(body.rows) || null, body.stats ? JSON.stringify(body.stats) : null).run();
  return { import_id: r.meta.last_row_id, mode };
}

/** یک دستهٔ ردیف، به همان شکلی که پارسر مرورگر می‌سازد. */
export async function historyChunk(env, body) {
  const importId = Number(body.import_id);
  if (!importId) throw new HttpError("import_id لازم است.");
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) return { ok: true, inserted: 0, dup: 0 };

  /* سقف D1 برای پارامترهای مقیدشده ۱۰۰ تاست؛ با ۲۰ ستون یعنی حداکثر ۵ ردیف
     در هر دستور. چندردیفی‌نوشتن پنج برابر کمتر رفت‌وبرگشت می‌خواهد.
     OR IGNORE: ردیفی که کلیدش هست دوباره نوشته نمی‌شود. */
  const PER = 5;
  const tuple = `(${COLS.map(() => "?").join(",")})`;
  const stmts = [];
  for (let i = 0; i < rows.length; i += PER) {
    const part = rows.slice(i, i + PER);
    const args = [];
    for (const r of part) {
      args.push(importId, T(r.dkey), T(r.date), Number(r.ym) || null, T(r.itemCode), T(r.code2), T(r.title), nrm(r.title),
        N(r.qty), T(r.unit), N(r.unitPrice), N(r.amount), T(r.supplier), nrm(r.supplier),
        N(r.idx), N(r.amount1404), N(r.unit1404), T(r.lvl1), T(r.lvl2), T(r.lvl3));
    }
    stmts.push(env.DB.prepare(`INSERT OR IGNORE INTO purchase_history (${COLS.join(",")}) VALUES ${part.map(() => tuple).join(",")}`).bind(...args));
  }
  let inserted = 0;
  for (let i = 0; i < stmts.length; i += 100) {
    const res = await env.DB.batch(stmts.slice(i, i + 100));
    for (const x of res) inserted += (x.meta && x.meta.changes) || 0;
  }
  return { ok: true, inserted, dup: rows.length - inserted };
}

/** پایان بارگذاری: نمایه‌ها ساخته و آمار مرجع ذخیره می‌شود. */
export async function historyFinish(env, body) {
  const importId = Number(body.import_id);
  if (!importId) throw new HttpError("import_id لازم است.");
  for (const sql of HISTORY_INDEXES) await env.DB.exec(sql + ";");
  /* آمار روی کل جدول است، نه فقط این بارگذاری: در حالت افزایشی ردیف‌های
     بارگذاری‌های قبلی هم سر جایشان‌اند و باید در بازه و شمارش بیایند. */
  const s = await env.DB.prepare(`SELECT COUNT(*) AS n, COUNT(DISTINCT supplier_n) AS suppliers,
      COUNT(DISTINCT code2) AS codes, MIN(ym) AS min_ym, MAX(ym) AS max_ym,
      SUM(CASE WHEN amount_1404 IS NULL THEN 1 ELSE 0 END) AS no_index
    FROM purchase_history`).first();
  const stats = {
    rows: s.n, suppliers: s.suppliers, codes: s.codes, minYm: s.min_ym, maxYm: s.max_ym, noIndex: s.no_index,
    fingerprint: T(body.fingerprint) || null,
    /* شیبِ کاهش بر این فاصله تنظیم می‌شود تا قدیمی‌ترین خریدِ موجود هم مثبت بماند */
    ageMax: s.min_ym ? Math.max(1, BASE_YM - s.min_ym) : 1,
  };
  await env.DB.prepare("UPDATE hist_imports SET state='ready', finished_at=?, row_count=?, stats_json=? WHERE id=?")
    .bind(Date.now(), s.n, JSON.stringify(stats), importId).run();
  return { ok: true, stats };
}

/** بارگذاری آمادهٔ فعلی (اگر باشد) به‌همراه آمارش. */
export async function activeImport(env) {
  const r = await env.DB.prepare("SELECT * FROM hist_imports WHERE state='ready' ORDER BY id DESC LIMIT 1").first();
  if (!r) return null;
  let stats = {};
  try { stats = JSON.parse(r.stats_json || "{}"); } catch (_) { stats = {}; }
  return { ...r, stats };
}

export async function historyStatus(env) {
  const cur = await activeImport(env);
  const loading = await env.DB.prepare("SELECT id, filename, imported_at FROM hist_imports WHERE state='loading' ORDER BY id DESC LIMIT 1").first();
  return {
    ready: !!cur, loading: loading || null,
    current: cur ? { id: cur.id, filename: cur.filename, imported_at: cur.imported_at, finished_at: cur.finished_at, ...cur.stats } : null,
    base: { ym: BASE_YM, label: "اسفند ۱۴۰۴" },
  };
}

/* ------------------------------------------------------------------ */
/* تطبیق قلم با سوابق                                                   */
/* ------------------------------------------------------------------ */
/**
 * قلمِ درخواست را به ردیف‌های سوابق وصل می‌کند.
 *
 * ترتیب تلاش:
 *   ۱. `hist_code` — کد استانداردی که «نرمال‌سازی اقلام» (مرحلهٔ بعد) روی قلم می‌نویسد.
 *   ۲. «کد قلم خریدنی» راهکاران، که در فایل درخواست و فایل سوابق یکی است.
 *   ۳. عنوان نرمال‌شده.
 * در دو حالت آخر، اگر ردیف‌های پیداشده «کد قلم جدید» داشته باشند فیلتر به آن
 * کد پهن می‌شود تا نگارش‌های مختلف یک کالا زیر یک سابقه جمع شوند — همان کاری
 * که نرمال‌سازی قرار است دقیق‌تر انجام دهد.
 */
export async function resolveItem(env, it) {
  const mk = (by, code2, where, args) => ({ by, code2, where, args });
  if (T(it.hist_code)) return mk("normalized", T(it.hist_code), "code2=?", [T(it.hist_code)]);

  const tries = [];
  if (T(it.code)) tries.push(["code", "item_code=?", [T(it.code)]]);
  if (nrm(it.title)) tries.push(["title", "title_n=?", [nrm(it.title)]]);

  for (const [by, where, args] of tries) {
    const g = await env.DB.prepare(`SELECT code2, COUNT(*) AS n FROM purchase_history
      WHERE ${where} AND code2 IS NOT NULL GROUP BY code2 ORDER BY n DESC LIMIT 1`).bind(...args).first();
    if (g && g.code2) return mk(by, g.code2, "code2=?", [g.code2]);
    const c = await env.DB.prepare(`SELECT COUNT(*) AS n FROM purchase_history WHERE ${where}`).bind(...args).first();
    if (c && c.n) return mk(by, null, where, args);
  }
  return mk("none", null, null, null);
}

/* ------------------------------------------------------------------ */
/* ارقام تب سوابق                                                       */
/* ------------------------------------------------------------------ */
const rankBy = (rows, field, rankField) => {
  [...rows].sort((a, b) => (b[field] || 0) - (a[field] || 0)).forEach((x, i) => { x[rankField] = i + 1; });
};

/**
 * تأمین‌کنندگان یک قلم. مبنای مقایسه (تصمیم مدیر) سه چیز است، نه قیمت:
 *   n    — دفعات خرید همین قلم از این تأمین‌کننده
 *   qty  — جمع مقدار خریداری‌شده
 *   qtyM — گشتاور: همان جمع مقدار، وقتی هر خرید با فاصلهٔ ماهانه‌اش تا اسفند
 *          ۱۴۰۴ کم‌وزن شود (شیب از ضریب ۱..۱۰ کارشناس). خریدِ تازه سنگین‌تر است.
 * سهم = qty/Σ و امتیاز گشتاوری = qtyM/Σ (درصد). رتبه‌ها همین‌جا حساب می‌شوند تا
 * پنل و بات تلگرام یک عدد را نشان بدهند. ترتیب پیش‌فرض: رتبهٔ گشتاوری.
 * قیمت‌ها (روز و ۱۴۰۴) فقط برای نمایشِ ریز خریدها و کارت تأمین‌کننده می‌مانند.
 *
 * «خرید قلم در پروژه» ستون پروژه می‌خواهد که فایل مرجع هنوز ندارد؛ جایش در
 * پاسخ (groups) رزرو است تا UI خاموش نشانش بدهد.
 */
export async function itemHistory(env, it, opts = {}) {
  const cur = await activeImport(env);
  if (!cur) return { available: false, message: "فایل سوابق خرید هنوز بارگذاری نشده است؛ مدیر آن را از تب «سوابق تأمین» بارگذاری می‌کند." };

  const ageMax = Math.max(1, Number(cur.stats.ageMax) || 1);
  const k = clampK(opts.k);
  const w = wArgs(k, ageMax);

  const m = await resolveItem(env, it);
  const head = {
    available: true,
    match: { by: m.by, code2: m.code2 },
    base: { ym: BASE_YM, label: "اسفند ۱۴۰۴", ageMax, k, decay: decayPerMonth(k, ageMax) },
    source: { filename: cur.filename, imported_at: cur.finished_at || cur.imported_at, rows: cur.row_count },
    groups: { item: true, itemParty: false },   /* خرید قلم فعال؛ خرید قلم در پروژه در انتظار داده */
  };
  if (m.by === "none") {
    return { ...head, suppliers: [], titles: [], excluded: [], totals: { n: 0, qty: 0, qtyM: 0, suppliers: 0 },
      message: "برای این قلم سابقه‌ای در فایل مرجع پیدا نشد. «نرمال‌سازی اقلام» (مرحلهٔ بعد) عنوان‌های نزدیک را به هم وصل می‌کند." };
  }

  /* ۱) گروه‌بندی خریدهای همین قلم به تفکیک تأمین‌کننده */
  const perAll = (await env.DB.prepare(`SELECT supplier_n AS sn, MAX(supplier) AS name,
      COUNT(*) AS n, SUM(COALESCE(qty,0)) AS qty,
      SUM(COALESCE(qty,0) * ${W_SQL}) AS qtym,
      SUM(amount_1404) AS amt, MIN(order_date) AS first_date, MAX(order_date) AS last_date,
      MIN(unit_1404) AS min_unit, MAX(unit_1404) AS max_unit
    FROM purchase_history WHERE ${m.where} GROUP BY supplier_n`).bind(...w, ...m.args).all()).results || [];
  const per = perAll.filter((r) => !BUCKETS.has(r.sn));
  const excluded = perAll.filter((r) => BUCKETS.has(r.sn)).map((r) => ({ name: r.name, n: r.n, qty: r.qty || 0 }));

  /* ۲) واحد سنجش — اگر یک کد چند واحد دارد، جمعِ «مقدار» بی‌معنا می‌شود و باید هشدار داد */
  const um = await env.DB.prepare(`SELECT GROUP_CONCAT(DISTINCT unit) AS units, COUNT(DISTINCT COALESCE(unit,'')) AS nu
    FROM purchase_history WHERE ${m.where}`).bind(...m.args).first();

  /* ۳) راه‌های تماس — جدول تأمین‌کنندگان هنوز پر نشده و خالی‌بودنش خطا نیست */
  const contacts = new Map();
  for (let i = 0; i < per.length; i += 80) {
    const part = per.slice(i, i + 80).map((r) => r.name);
    const rs = (await env.DB.prepare(`SELECT * FROM suppliers WHERE name IN (${part.map(() => "?").join(",")})`).bind(...part).all()).results || [];
    rs.forEach((r) => contacts.set(nrm(r.name), r));
  }

  const sumQty = per.reduce((s, r) => s + (r.qty || 0), 0);
  const sumM = per.reduce((s, r) => s + (r.qtym || 0), 0);
  const suppliers = per.map((r) => ({
    key: r.sn, name: r.name,
    code: (contacts.get(r.sn) || {}).code || null,
    n: r.n, qty: r.qty || 0, qtyM: r.qtym || 0,
    share: sumQty ? (r.qty || 0) / sumQty * 100 : 0,
    mshare: sumM ? (r.qtym || 0) / sumM * 100 : 0,
    firstDate: r.first_date, lastDate: r.last_date,
    minUnit: r.min_unit, maxUnit: r.max_unit,
    avgUnit: r.qty ? (r.amt || 0) / r.qty : null,
    contact: contacts.get(r.sn) || null,
  }));
  rankBy(suppliers, "n", "rankN");
  rankBy(suppliers, "qty", "rankQty");
  rankBy(suppliers, "qtyM", "rankM");
  suppliers.sort((a, b) => a.rankM - b.rankM);

  const titles = (await env.DB.prepare(`SELECT MAX(title) AS title, COUNT(*) AS n FROM purchase_history
    WHERE ${m.where} GROUP BY title_n ORDER BY n DESC LIMIT 8`).bind(...m.args).all()).results || [];
  const lv = await env.DB.prepare(`SELECT lvl1, lvl2, lvl3, item_code, unit FROM purchase_history WHERE ${m.where} LIMIT 1`).bind(...m.args).first();

  return {
    ...head,
    item: lv ? { unit: lv.unit, units: um && um.units, mixedUnits: !!(um && um.nu > 1),
      sourceCode: lv.item_code, lvl1: lv.lvl1, lvl2: lv.lvl2, lvl3: lv.lvl3 } : null,
    titles, excluded,
    totals: { n: per.reduce((s, r) => s + r.n, 0), qty: sumQty, qtyM: sumM, suppliers: suppliers.length },
    suppliers,
  };
}

/**
 * سری زمانی خریدهای یک قلم برای نمودار: هر خرید یک نقطه (تاریخ، مقدار) به
 * تفکیک تأمین‌کننده. سطل‌های تجمیعی مثل «سایر تامین کنندگان» این‌جا هم نیستند.
 */
export async function itemSeries(env, it) {
  if (!(await activeImport(env))) throw new HttpError("فایل سوابق بارگذاری نشده است.", 409);
  const m = await resolveItem(env, it);
  if (m.by === "none") return { points: [] };
  const rows = (await env.DB.prepare(`SELECT supplier_n AS key, MAX(supplier) AS name, order_date AS date, ym,
      SUM(COALESCE(qty,0)) AS qty, COUNT(*) AS n
    FROM purchase_history WHERE ${m.where}
    GROUP BY supplier_n, order_date ORDER BY order_date LIMIT 3000`).bind(...m.args).all()).results || [];
  return { points: rows.filter((r) => !BUCKETS.has(r.key)) };
}

/** ریز خریدهای یک تأمین‌کننده از همین قلم — پشتِ دکمهٔ «خریدها». */
export async function supplierBuys(env, it, supplier) {
  const name = nrm(supplier);
  if (!name) throw new HttpError("نام تأمین‌کننده لازم است.");
  if (!(await activeImport(env))) throw new HttpError("فایل سوابق بارگذاری نشده است.", 409);
  const m = await resolveItem(env, it);
  if (m.by === "none") return { buys: [] };
  const rows = (await env.DB.prepare(`SELECT order_date, title, qty, unit, unit_price, amount, idx_val, amount_1404, unit_1404
    FROM purchase_history WHERE ${m.where} AND supplier_n=? ORDER BY order_date DESC LIMIT 300`)
    .bind(...m.args, name).all()).results || [];
  return { buys: rows };
}
