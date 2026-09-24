/**
 * سوابق خرید — ارقام تب «بررسی سوابق» (پنل کارشناس و بات)
 *
 * داده از چهار فایل مرجع می‌آید (worker/catalog.js): ردیف‌های خرید با نوع قلمِ هر کد و
 * قیمت تعدیل‌شده به زمستان ۱۴۰۴، و فهرست اقلام با لایه‌ها و نرخ‌های تبدیل واحد.
 *
 * دو حالت جستجو (Task.txt، شهریور ۱۴۰۵):
 *   «عین قلم»  — همان نوع قلم با دقیقاً همان لایه‌های ویژگی (مثلاً فقط «پیچ آلن M8×30»)
 *   «نوع قلم»  — هر قلمی از همان نوع (هر پیچی که تا حالا خریده‌ایم)
 * رتبه‌بندی برای هر حالت جدا حساب می‌شود.
 *
 * ساختار قلم (نوع و لایه‌ها) یا از خود فهرست می‌آید — اگر کد راهکاران قلم آن‌جا باشد —
 * یا از «نرمال‌سازی اقلام» که کارشناس تأیید کرده (worker/normalize.js).
 *
 * مقدارها پیش از جمع به واحد مرجعِ نوع قلم برده می‌شوند (نرخ‌های فایل ۴، با ترتیب
 * اولویت همان فایل؛ کارشناس می‌تواند هر نرخ را عوض کند). بدون این، جمعِ «۳ تن» و
 * «۵۰۰ کیلوگرم» و «۲۰ شاخه» بی‌معنا بود.
 *
 * مبنای مقایسهٔ تأمین‌کنندگان (تصمیم مدیر) سه ستون است، نه قیمت: دفعات خرید، جمع
 * مقدار، و «گشتاور» — همان جمع مقدار وقتی خریدِ تازه‌تر سنگین‌تر شمرده شود (شیب از
 * نوار ۱..۱۰ کارشناس). در امتیاز برابر، ردهٔ بالاتر تأمین‌کننده (A، B، C) جلوتر است.
 */
import { HttpError } from "./http.js";
import { activeImport, catalogMeta, headData, keyOf, layersEqual, nameOf, rateFor } from "./catalog.js";
import { normOf, catalogStruct, canonStruct } from "./normalize.js";

export { activeImport } from "./catalog.js";

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

/* «سایر تامین کنندگان» در فایل مرجع یک سطل تجمیعی است، نه یک تأمین‌کننده. اگر
   بماند در بیشتر اقلام رتبهٔ اول می‌شود و سهم تأمین‌کنندگان واقعی را له می‌کند —
   در گازوئیل ۵۴٪ از کل خرید زیر همین یک نام است. از رتبه‌بندی کنار گذاشته
   می‌شود، ولی جمعش برمی‌گردد تا کارشناس بداند چه چیزی از سهم‌ها کم شده. */
const BUCKETS = new Set(["سایر تامین کنندگان", "سایر تأمین کنندگان", "متفرقه"].map(keyOf));
/* «کارفرمای اصلی …» هم تأمین‌کننده نیست: مصالحی است که کارفرما تحویل داده و با قیمت اسمی
   (۱ ریال) ثبت شده — در فایل مهر ۱۴۰۵، ۱٬۶۵۴ ردیف در ۶۵ نوع قلم، و در سیمان ۹۹٫۹٪ سهم.
   با پیشوند نام سنجیده می‌شود تا کارفرمای پروژه‌های بعدی هم بی تغییر کد کنار برود (تصمیم مدیر). */
const EMPLOYER = /^کارفرما(ی)? اصلی/;
/** چرا این نام در رتبه نیست: «bucket» نام تجمیعی، «employer» تحویلی کارفرما؛ null یعنی تأمین‌کننده است */
export const excludedWhy = (sn) => (BUCKETS.has(sn) ? "bucket" : EMPLOYER.test(sn) ? "employer" : null);

/* ------------------------------------------------------------------ */
/* رتبه                                                                 */
/* ------------------------------------------------------------------ */
/* ردهٔ تأمین‌کننده، معیار دوم در امتیاز برابر (تصمیم مدیر، مهر ۱۴۰۵). بی‌رده آخر است. */
export const GRADE_ORDER = { A: 0, B: 1, C: 2 };
export const gradeKey = (x) => (x && x.grade in GRADE_ORDER ? GRADE_ORDER[x.grade] : 3);

/* رتبهٔ رقابتی: عددهای برابر رتبهٔ برابر می‌گیرند و رتبهٔ بعدی به اندازهٔ تعدادشان
   جلو می‌رود (۴، ۲، ۲، ۱ ← ۱، ۲، ۲، ۴). مقایسه روی مقدارِ گردشده است تا زبالهٔ اعشار
   شناور (۰٫۱+۰٫۲) دو عدد برابر را نابرابر نکند. `tie` اگر داده شود، معیار دوم است:
   دو عددِ برابر فقط وقتی رتبهٔ برابر می‌گیرند که معیار دومشان هم برابر باشد. */
export const rankBy = (rows, field, rankField, tie) => {
  const key = (x) => Math.round((Number(x[field]) || 0) * 1e6);
  const tk = tie || (() => 0);
  const sorted = [...rows].sort((a, b) => key(b) - key(a) || tk(a) - tk(b));
  sorted.forEach((x, i) => {
    const p = sorted[i - 1];
    x[rankField] = i > 0 && key(p) === key(x) && tk(p) === tk(x) ? p[rankField] : i + 1;
  });
};

/* ------------------------------------------------------------------ */
/* قلم → ردیف‌های خرید                                                  */
/* ------------------------------------------------------------------ */
const T = (v) => String(v == null ? "" : v).trim();
/* سقف D1 صد پارامتر است؛ فهرست کدهای «عین قلم» اگر بلندتر شد تکه می‌شود */
const IN_MAX = 90;

/**
 * ساختار قلم و محدودهٔ جستجو.
 * `norm`: true = ساختارِ تأییدشده در «نرمال‌سازی اقلام» (پنل وقتی تیکش روشن است)،
 *         false = فقط فهرست با کد راهکاران، undefined = تأییدشده اگر هست وگرنه فهرست (بات).
 * خروجی: {hd, struct, mode, codes, override, source} یا {message}.
 */
export async function resolveScope(env, it, { norm, mode } = {}) {
  let n = normOf(it);
  let hd, struct, override = {}, source;
  if (norm === true || (norm == null && n)) {
    if (!n) return { message: "ساختار نرمال‌شدهٔ این قلم هنوز تأیید نشده است؛ نتیجهٔ «نرمال‌سازی اقلام» را بررسی و تأیید کنید." };
    /* تأییدِ پیش از یکسان‌سازی («ورق» با ضخامتِ «2 میل») به زبان امروزِ فهرست برده می‌شود */
    if (n.v !== 2) { const meta = await catalogMeta(env); if (meta) n = await canonStruct(env, meta, n, it); }
    hd = await headData(env, n.head);
    struct = n; override = n.rates || {}; source = "norm";
  } else {
    const c = await catalogStruct(env, it.code);
    if (!c) {
      return { message: T(it.code)
        ? `کد این قلم (${T(it.code)}) در فهرست اقلام نیست. «نرمال‌سازی اقلام» را روشن کنید تا عنوانش به نوع قلم و لایه‌ها تفکیک و تأیید شود.`
        : "این قلم کد راهکاران ندارد. «نرمال‌سازی اقلام» را روشن کنید تا عنوانش به نوع قلم و لایه‌ها تفکیک و تأیید شود." };
    }
    hd = c.hd; struct = c.struct; source = "catalog";
  }
  if (!hd) return { message: `نوع قلم «${struct.head}» در فهرست اقلام نیست، پس سابقهٔ خریدی هم ندارد.`, struct };

  const m = mode === "head" ? "head" : "exact";
  let codes = null;
  if (m === "exact") {
    codes = hd.items.filter((x) => layersEqual(x[4], struct.layers)).map((x) => x[0]);
    if (struct.code && !codes.includes(struct.code)) codes.push(struct.code);
  }
  return { hd, struct, mode: m, codes, override, source };
}

/**
 * کوئری روی ردیف‌های همین محدوده؛ «عین قلم» با فهرست کدها، تکه‌تکه اگر بلند باشد.
 * ردیف خرید نوع قلمِ فایل را دارد (hd.src)، نه نوع قلمِ مؤثر: «ورق آهنی» ردیف‌هایش را زیر
 * «ورق» دارد، کنار ورق گالوانیزه. پس «نوع قلم» هم وقتی نوع قلمِ مؤثر فقط بخشی از نوع قلمِ
 * فایل است (hd.sub) با کدهای خودش محدود می‌شود. تکه‌ها بر کد جدا می‌شوند، پس گروه‌بندیِ
 * هر تکه با تکهٔ دیگر هم‌پوشانی ندارد؛ فقط ترتیب و سقفِ نتیجه را فراخوان دوباره می‌سازد.
 * ترتیب پارامترها: `args` (بخش SELECT)، شرط محدوده، `tailArgs` (بخش بعد از WHERE).
 */
async function scoped(env, sc, select, tail, args = [], tailArgs = []) {
  const run = (where, wargs) => env.DB.prepare(`${select} FROM purchases WHERE ${where} ${tail}`).bind(...args, ...wargs, ...tailArgs).all().then((r) => r.results || []);
  const src = sc.hd.src && sc.hd.src.length ? sc.hd.src : [sc.hd.head];
  const inSrc = src.length === 1 ? "head=?" : `head IN (${src.map(() => "?").join(",")})`;
  const codes = sc.mode === "head" ? (sc.hd.sub ? sc.hd.items.map((x) => x[0]) : null) : sc.codes;
  if (!codes) return run(inSrc, src);
  if (!codes.length) return [];
  const out = [], per = Math.max(1, IN_MAX - src.length);
  for (let i = 0; i < codes.length; i += per) {
    const part = codes.slice(i, i + per);
    out.push(...await run(`${inSrc} AND item_code IN (${part.map(() => "?").join(",")})`, [...src, ...part]));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* ارقام تب سوابق                                                       */
/* ------------------------------------------------------------------ */
const unavailable = (message) => ({ available: false, message });

async function readyImport(env, cur) {
  const imp = cur || await activeImport(env);
  if (!imp) return { err: unavailable("فایل سوابق خرید هنوز بارگذاری نشده است؛ مدیر آن را از تب «سوابق تأمین» بارگذاری می‌کند.") };
  if (!imp.stats || imp.stats.format !== 2) {
    return { err: unavailable("سوابق با قالب قدیمی بارگذاری شده است؛ مدیر باید چهار فایل تازه (اقلام، شاخص تعدیل، نرخ تبدیل، سوابق) را از تب «سوابق تأمین» بارگذاری کند.") };
  }
  return { imp };
}

/**
 * تأمین‌کنندگان یک قلم، در حالت «عین قلم» یا «نوع قلم». برای هر تأمین‌کننده:
 *   n    — دفعات خرید
 *   qty  — جمع مقدار به واحد مرجع
 *   qtyM — گشتاور: همان جمع، وقتی هر خرید با فاصلهٔ ماهانه‌اش تا اسفند ۱۴۰۴ کم‌وزن شود
 * سهم = qty/Σ؛ رتبه‌ها رقابتی‌اند و ردهٔ تأمین‌کننده معیار دوم است. همین‌جا حساب می‌شوند تا
 * پنل و بات تلگرام یک عدد بگویند. قیمت‌ها (به زمستان ۱۴۰۴ و به ازای واحد مرجع) فقط برای
 * نمایش‌اند و در رتبه اثری ندارند.
 */
export async function itemHistory(env, it, opts = {}) {
  const { imp, err } = await readyImport(env, opts.cur);
  if (err) return err;
  const cur = imp;
  const ageMax = Math.max(1, Number(cur.stats.ageMax) || 1);
  const k = clampK(opts.k);
  const w = wArgs(k, ageMax);

  const sc = await resolveScope(env, it, opts);
  const head = {
    available: true, format: 2,
    base: { ym: BASE_YM, label: "اسفند ۱۴۰۴", priceLabel: "زمستان ۱۴۰۴", ageMax, k, decay: decayPerMonth(k, ageMax) },
    source: { filename: cur.filename, imported_at: cur.finished_at || cur.imported_at, rows: cur.row_count },
    groups: { item: true, itemParty: false },   /* خرید قلم فعال؛ خرید قلم در پروژه در انتظار داده */
  };
  const empty = { suppliers: [], titles: [], excluded: [], rates: [], totals: { n: 0, qty: 0, qtyM: 0, suppliers: 0 } };
  if (!sc.hd) return { ...head, ...empty, struct: sc.struct || null, message: sc.message };

  const hd = sc.hd;
  const byCode = new Map(hd.items.map((x) => [x[0], x]));
  const struct = { head: hd.head, layers: sc.struct.layers || {}, residual: sc.struct.residual || "", code: sc.struct.code || null, refUnit: hd.ref };
  const match = { mode: sc.mode, source: sc.source, codes: sc.mode === "head" ? hd.items.length : sc.codes.length, headItems: hd.items.length };
  if (sc.mode === "exact" && !sc.codes.length) {
    return { ...head, ...empty, struct, match, message: "هیچ قلمی در فهرست دقیقاً همین لایه‌ها را ندارد. حالت «نوع قلم» همهٔ اقلام همین نوع را نشان می‌دهد." };
  }

  /* ۱) خریدها به تفکیک تأمین‌کننده × کد × واحد — تبدیل واحد به ازای (کد، واحد) است */
  const groups = await scoped(env, sc, `SELECT supplier_n AS sn, MAX(supplier) AS name, item_code, unit,
      COUNT(*) AS n, SUM(COALESCE(qty,0)) AS qty, SUM(COALESCE(qty,0) * ${W_SQL}) AS qtym,
      SUM(amount_adj) AS adj, MIN(order_date) AS first_date, MAX(order_date) AS last_date,
      MIN(CASE WHEN qty>0 THEN amount_adj/qty END) AS min_u, MAX(CASE WHEN qty>0 THEN amount_adj/qty END) AS max_u`,
  "GROUP BY supplier_n, item_code, unit", w);

  const per = new Map(), excluded = new Map(), units = new Map();
  let lowConf = 0;
  for (const g of groups) {
    const u = nameOf(g.unit);
    const rt = rateFor(hd, byCode.get(g.item_code) || null, u, sc.override);
    if (!units.has(u)) units.set(u, { unit: u, rows: 0, rates: new Map() });
    const us = units.get(u); us.rows += g.n;
    if (rt) { const kk = `${rt.rate}|${rt.src}`; if (!us.rates.has(kk)) us.rates.set(kk, { ...rt, rows: 0 }); us.rates.get(kk).rows += g.n; if (rt.conf === "پایین") lowConf += g.n; }

    const why = excludedWhy(g.sn);
    if (why) {
      const x = excluded.get(g.sn) || { name: g.name, why, n: 0, qty: 0 };
      x.n += g.n; if (rt) x.qty += (g.qty || 0) * rt.rate;
      excluded.set(g.sn, x); continue;
    }
    const s = per.get(g.sn) || { key: g.sn, name: g.name, n: 0, qty: 0, qtyM: 0, adj: 0, qtyForAvg: 0, unconv: 0, firstDate: null, lastDate: null, minUnit: null, maxUnit: null };
    s.n += g.n;
    if (rt) {
      s.qty += (g.qty || 0) * rt.rate; s.qtyM += (g.qtym || 0) * rt.rate;
      if (g.adj != null && g.qty > 0) { s.adj += g.adj; s.qtyForAvg += g.qty * rt.rate; }
      /* قیمت واحدِ ثبت‌شده ÷ نرخ = قیمت به ازای واحد مرجع */
      if (g.min_u != null) { const v = g.min_u / rt.rate; if (s.minUnit == null || v < s.minUnit) s.minUnit = v; }
      if (g.max_u != null) { const v = g.max_u / rt.rate; if (s.maxUnit == null || v > s.maxUnit) s.maxUnit = v; }
    } else s.unconv += g.n;
    if (!s.firstDate || g.first_date < s.firstDate) s.firstDate = g.first_date;
    if (!s.lastDate || g.last_date > s.lastDate) s.lastDate = g.last_date;
    per.set(g.sn, s);
  }

  /* ۲) کد و رده، و راه‌های تماس (دفترچهٔ تأمین‌کنندگان هنوز پر نشده و خالی‌بودنش خطا نیست) */
  const list = [...per.values()];
  const grades = new Map(), contacts = new Map();
  for (let i = 0; i < list.length; i += IN_MAX) {
    const part = list.slice(i, i + IN_MAX);
    const q = part.map(() => "?").join(",");
    ((await env.DB.prepare(`SELECT sn, code, grade FROM supplier_grades WHERE sn IN (${q})`).bind(...part.map((s) => s.key)).all()).results || [])
      .forEach((r) => grades.set(r.sn, r));
    if (!opts.brief) {
      ((await env.DB.prepare(`SELECT * FROM suppliers WHERE name IN (${q})`).bind(...part.map((s) => s.name)).all()).results || [])
        .forEach((r) => contacts.set(keyOf(r.name), r));
    }
  }

  const sumQty = list.reduce((a, s) => a + s.qty, 0), sumM = list.reduce((a, s) => a + s.qtyM, 0);
  const suppliers = list.map((s) => {
    const g = grades.get(s.key) || {}, c = contacts.get(s.key) || null;
    return {
      key: s.key, name: s.name, code: g.code || (c && c.code) || null, grade: g.grade || null,
      n: s.n, qty: s.qty, qtyM: s.qtyM,
      share: sumQty ? s.qty / sumQty * 100 : 0, mshare: sumM ? s.qtyM / sumM * 100 : 0,
      firstDate: s.firstDate, lastDate: s.lastDate,
      avgUnit: s.qtyForAvg ? s.adj / s.qtyForAvg : null, minUnit: s.minUnit, maxUnit: s.maxUnit,
      unconverted: s.unconv, contact: c,
    };
  });
  rankBy(suppliers, "n", "rankN", gradeKey);
  rankBy(suppliers, "qty", "rankQty", gradeKey);
  rankBy(suppliers, "qtyM", "rankM", gradeKey);
  suppliers.sort((a, b) => a.rankM - b.rankM || b.qtyM - a.qtyM || String(a.name).localeCompare(String(b.name), "fa"));

  /* نرخ‌های به‌کاررفته، به تفکیک واحد — «متغیر» یعنی اقلامِ مختلفِ همین نوع نرخ ویژهٔ خودشان را داشتند */
  const rates = [...units.values()].filter((x) => x.unit !== hd.ref).map((x) => {
    const rs = [...x.rates.values()].sort((a, b) => b.rows - a.rows);
    const top = rs[0] || null;
    return { unit: x.unit, rows: x.rows, rate: top ? top.rate : null, basis: top ? top.basis : "نرخی نیست", conf: top ? top.conf : "—", src: top ? top.src : "none",
      varied: rs.length > 1, min: rs.length ? Math.min(...rs.map((r) => r.rate)) : null, max: rs.length ? Math.max(...rs.map((r) => r.rate)) : null,
      unconverted: x.rows - rs.reduce((a, r) => a + r.rows, 0) };
  }).sort((a, b) => b.rows - a.rows);
  const unconverted = list.reduce((a, s) => a + s.unconv, 0);

  /* ۳) کدام اقلامِ فهرست در این نتیجه‌اند — تا کارشناس ببیند «عین قلم» و «نوع قلم» چه چیزهایی را شمرده */
  const titles = opts.brief ? [] : (await scoped(env, sc, "SELECT item_code, MAX(title) AS title, COUNT(*) AS n", "GROUP BY item_code ORDER BY n DESC LIMIT 12"))
    .sort((a, b) => b.n - a.n).slice(0, 12)
    .map((r) => ({ code: r.item_code, title: (byCode.get(r.item_code) || [])[1] || r.title, n: r.n, layers: (byCode.get(r.item_code) || [])[4] || null }));

  return {
    ...head, struct, match, rates, titles,
    excluded: [...excluded.values()],
    unconverted, lowConf,
    item: { unit: hd.ref, units: [...units.keys()].join("، "), mixedUnits: false, refUnit: hd.ref },
    totals: { n: list.reduce((a, s) => a + s.n, 0), qty: sumQty, qtyM: sumM, suppliers: suppliers.length },
    suppliers,
  };
}

/**
 * سری زمانی خریدهای یک قلم برای نمودار: هر خرید یک نقطه (تاریخ، مقدار به واحد مرجع)
 * به تفکیک تأمین‌کننده. سطل‌های تجمیعی مثل «سایر تامین کنندگان» این‌جا هم نیستند.
 */
export async function itemSeries(env, it, opts = {}) {
  const { err } = await readyImport(env);
  if (err) throw new HttpError(err.message, 409);
  const sc = await resolveScope(env, it, opts);
  if (!sc.hd || (sc.mode === "exact" && !sc.codes.length)) return { points: [], unit: sc.hd ? sc.hd.ref : null };
  const byCode = new Map(sc.hd.items.map((x) => [x[0], x]));
  const rows = await scoped(env, sc, `SELECT supplier_n AS key, MAX(supplier) AS name, order_date AS date, item_code, unit,
      SUM(COALESCE(qty,0)) AS qty, COUNT(*) AS n`, "GROUP BY supplier_n, order_date, item_code, unit ORDER BY order_date LIMIT 5000");
  const pts = new Map();
  for (const r of rows) {
    if (excludedWhy(r.key)) continue;
    const rt = rateFor(sc.hd, byCode.get(r.item_code) || null, r.unit, sc.override);
    if (!rt) continue;
    const kk = `${r.key}|${r.date}`;
    const p = pts.get(kk) || { key: r.key, name: r.name, date: r.date, qty: 0, n: 0 };
    p.qty += (r.qty || 0) * rt.rate; p.n += r.n;
    pts.set(kk, p);
  }
  return { points: [...pts.values()].sort((a, b) => (a.date < b.date ? -1 : 1)), unit: sc.hd.ref };
}

/** ریز خریدهای یک تأمین‌کننده در همین محدوده — پشتِ دکمهٔ «خریدها». */
export async function supplierBuys(env, it, supplier, opts = {}) {
  const sn = keyOf(supplier);
  if (!sn) throw new HttpError("نام تأمین‌کننده لازم است.");
  const { err } = await readyImport(env);
  if (err) throw new HttpError(err.message, 409);
  const sc = await resolveScope(env, it, opts);
  if (!sc.hd || (sc.mode === "exact" && !sc.codes.length)) return { buys: [], unit: sc.hd ? sc.hd.ref : null };
  const byCode = new Map(sc.hd.items.map((x) => [x[0], x]));
  const rows = await scoped(env, sc, "SELECT order_date, title, item_code, qty, unit, amount, amount_adj",
    "AND supplier_n=? ORDER BY order_date DESC LIMIT 300", [], [sn]);
  /* هر ردیف با مقدارش به واحد مرجع و قیمت واحدش به زمستان ۱۴۰۴ (به ازای همان واحد مرجع) */
  const buys = rows.sort((a, b) => (a.order_date < b.order_date ? 1 : -1)).slice(0, 300).map((r) => {
    const rt = rateFor(sc.hd, byCode.get(r.item_code) || null, r.unit, sc.override);
    const qref = rt && r.qty != null ? r.qty * rt.rate : null;
    return {
      order_date: r.order_date, title: r.title, item_code: r.item_code, qty: r.qty, unit: r.unit,
      amount: r.amount, amount_adj: r.amount_adj,
      unit_price: r.qty ? r.amount / r.qty : null,
      rate: rt ? rt.rate : null, qty_ref: qref,
      unit_adj: qref ? r.amount_adj / qref : null,
    };
  });
  return { buys, unit: sc.hd.ref };
}

/** وضعیت بارگذاری برای تب «سوابق تأمین» مدیر */
export async function historyStatus(env) {
  const cur = await activeImport(env);
  const loading = await env.DB.prepare("SELECT id, filename, imported_at, stats_json FROM hist_imports WHERE state='loading' ORDER BY id DESC LIMIT 1").first();
  let ls = null;
  if (loading) { try { ls = JSON.parse(loading.stats_json || "{}"); } catch (_) { ls = {}; } }
  return {
    ready: !!cur, format: cur && cur.stats && cur.stats.format === 2 ? 2 : cur ? 1 : null,
    loading: loading ? { id: loading.id, filename: loading.filename, imported_at: loading.imported_at, plan: ls && ls.plan, fp: ls && ls.fp } : null,
    current: cur ? { id: cur.id, filename: cur.filename, imported_at: cur.imported_at, finished_at: cur.finished_at, ...cur.stats } : null,
    base: { ym: BASE_YM, label: "اسفند ۱۴۰۴", priceLabel: "زمستان ۱۴۰۴" },
  };
}
