/**
 * سوابق خرید — ارقام تب «بررسی سوابق» (پنل کارشناس و بات)
 *
 * داده از چهار فایل مرجع می‌آید (worker/catalog.js): ردیف‌های خرید با نوع قلمِ هر کد و
 * قیمت تعدیل‌شده به زمستان ۱۴۰۴، و فهرست اقلام با لایه‌ها و نرخ‌های تبدیل واحد.
 *
 * سه حالت جستجو (Task.txt، شهریور ۱۴۰۵؛ «قلم انتخابی» مهر ۱۴۰۵):
 *   «عین قلم»     — همان نوع قلم با دقیقاً همان لایه‌های ویژگی (مثلاً فقط «پیچ آلن M8×30»)
 *   «نوع قلم»     — هر قلمی از همان نوع (هر پیچی که تا حالا خریده‌ایم)
 *   «قلم انتخابی» — همان نوع قلم و فقط لایه‌هایی که کارشناس تیک زده برابر (ورقِ «ضخامت ۸ میلی‌متر»
 *                   با هر مساحت و هر کدی)، و فقط خریدهایی که واحدشان در نرخ‌های تیک‌خورده است (بی
 *                   تیکِ «ورق → کیلوگرم»، خریدهای برگی‌ای در هیچ جمع و سهم و ریز خریدی نمی‌آیند).
 *                   بی تیکِ لایه همان «نوع قلم» است و با تیکِ همهٔ لایه‌ها همان «عین قلم».
 * رتبه‌بندی برای هر حالت جدا حساب می‌شود.
 *
 * ساختار قلم (نوع و لایه‌ها) یا از دیتابیس اصلی می‌آید — فهرست اقلام و ویرایش‌های کارشناس، با
 * کد راهکاران یا عنوانِ عیناً همان — یا از «نرمال‌سازی اقلام» که کارشناس تأیید کرده
 * (worker/normalize.js).
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
import { normOf, catalogStruct, dbStruct, canonStruct } from "./normalize.js";
import * as RULES from "../frontend/tamin-poshtibani/catalog-rules.mjs";
import * as CANON from "../frontend/tamin-poshtibani/catalog-canon.mjs";

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
 * `norm`: true = ساختارِ ذخیره‌شده در «نرمال‌سازی اقلام» (پنل وقتی تیکش روشن است)، وگرنه دیتابیس
 *         اصلی با کد یا عنوانِ عیناً همان — همان که پنل بی مدل نشان داده؛ پیشنهادِ مدل بی تأیید نه،
 *         false = فقط دیتابیس اصلی با کد راهکاران، undefined = ذخیره‌شده اگر هست وگرنه دیتابیس با
 *         کد یا عنوان (بات).
 * `struct`: پیشنهادِ ذخیره‌نشدهٔ «نرمال‌سازی اقلام» ({head، layers}) — پنل وقتی کارشناس بی ذخیره
 *         «بررسی سوابق» را زده؛ فقط خوانده می‌شود و جایی نوشته نمی‌شود.
 * `pick`: {layers: [نام لایه‌ها]، units: [واحدهای خرید]} برای «قلم انتخابی».
 * خروجی: {hd, struct, mode, codes, override, source, units, picked} یا {message}.
 */
export async function resolveScope(env, it, { norm, mode, struct: given, pick } = {}) {
  let n = normOf(it);
  let hd, struct, override = {}, source;
  if (given && given.head && norm !== false) {
    struct = CANON.canonStructure({ head: nameOf(given.head), layers: given.layers && typeof given.layers === "object" ? given.layers : {}, residual: "", code: null },
      { title: T(it.title), layers: given.layers || {} });
    hd = await headData(env, struct.head); source = "proposal";
  } else if (n && norm !== false) {
    /* تأییدِ پیش از یکسان‌سازی («ورق» با ضخامتِ «2 میل») یا پیش از یکسان‌سازیِ دوم (نمره، مقاطع) به
       زبان امروزِ فهرست برده می‌شود */
    const meta = await catalogMeta(env); if (meta) n = await canonStruct(env, meta, n, it);
    hd = await headData(env, n.head);
    struct = n; override = n.rates || {}; source = "norm";
  } else if (norm !== false) {
    const db = await dbStruct(env, it);
    if (!db) {
      return { message: norm === true
        ? "کد و عنوانِ این قلم در دیتابیس نیست؛ ساختاری که «نرمال‌سازی اقلام» پیشنهاد داده را بررسی و «ذخیره» کنید."
        : T(it.code) ? `کد این قلم (${T(it.code)}) و عنوانش در فهرست اقلام نیست. «نرمال‌سازی اقلام» را روشن کنید تا عنوانش به نوع قلم و لایه‌ها تفکیک و تأیید شود.`
          : "این قلم کد راهکاران ندارد و عنوانش در فهرست اقلام نیست. «نرمال‌سازی اقلام» را روشن کنید تا عنوانش به نوع قلم و لایه‌ها تفکیک و تأیید شود." };
    }
    hd = db.hd; struct = db.struct; override = db.rates || {}; source = db.by === "title" ? "title" : "catalog";
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

  const m = mode === "head" ? "head" : mode === "pick" ? "pick" : "exact";
  let codes = null, picked = [];
  if (m === "exact") {
    codes = hd.items.filter((x) => layersEqual(x[4], struct.layers)).map((x) => x[0]);
    if (struct.code && !codes.includes(struct.code)) codes.push(struct.code);
  }
  if (m === "pick") {
    /* فقط لایه‌هایی که خودِ این قلم دارد؛ برابری با همان کلیدِ «عین قلم» (واحد به مرجع برده می‌شود) */
    const L = struct.layers || {};
    picked = [...new Set(((pick && pick.layers) || []).map(nameOf))].filter((k) => L[k] != null && L[k] !== "");
    if (picked.length) {
      const want = picked.map((k) => [k, RULES.layerKey(k, L[k])]);
      codes = hd.items.filter((x) => want.every(([k, v]) => x[4] && x[4][k] != null && RULES.layerKey(k, x[4][k]) === v)).map((x) => x[0]);
      if (struct.code && !codes.includes(struct.code)) codes.push(struct.code);
    }
  }
  const units = m === "pick" && pick && Array.isArray(pick.units) && pick.units.length ? new Set(pick.units.map(nameOf)) : null;
  return { hd, struct, mode: m, codes, override, source, units, picked };
}
/* «قلم انتخابی»: واحدِ خریدی که تیک نخورده در هیچ جمع و سهمی نمی‌آید */
const unitOk = (sc, u) => !sc.units || sc.units.has(nameOf(u));

/**
 * کوئری روی ردیف‌های همین محدوده؛ «عین قلم» با فهرست کدها، تکه‌تکه اگر بلند باشد.
 * ردیف خرید نوع قلمِ فایل را دارد (hd.src)، نه نوع قلمِ مؤثر: «ورق آهنی» ردیف‌هایش را زیر
 * «ورق» دارد، کنار ورق گالوانیزه. پس «نوع قلم» هم وقتی نوع قلمِ مؤثر فقط بخشی از نوع قلمِ
 * فایل است (hd.sub) با کدهای خودش محدود می‌شود. تکه‌ها بر کد جدا می‌شوند، پس گروه‌بندیِ
 * هر تکه با تکهٔ دیگر هم‌پوشانی ندارد؛ فقط ترتیب و سقفِ نتیجه را فراخوان دوباره می‌سازد.
 * ویرایشِ کارشناس (worker/catalog.js:headData): قلمی که به نوع قلمِ دیگری رفته (hd.out) از ردیف‌های
 * نوع قلمِ فایل کنار می‌رود و قلمی که از جای دیگر آمده (hd.inc) با کد و نوع قلمِ فایلِ جای قبلی‌اش
 * می‌آید.
 * ترتیب پارامترها: `args` (بخش SELECT)، شرط محدوده، `tailArgs` (بخش بعد از WHERE).
 */
async function scoped(env, sc, select, tail, args = [], tailArgs = []) {
  const run = (where, wargs) => env.DB.prepare(`${select} FROM purchases WHERE ${where} ${tail}`).bind(...args, ...wargs, ...tailArgs).all().then((r) => r.results || []);
  const q = (xs) => xs.map(() => "?").join(",");
  const hd = sc.hd, inc = hd.inc || [], out = hd.out || [];
  const src = hd.src && hd.src.length ? hd.src : hd.made ? [] : [hd.head];
  /* با فهرست کدها: هر کد زیر نوع قلمِ فایلِ خودش */
  const byCodes = async (codes, heads) => {
    const res = [], per = Math.max(1, IN_MAX - heads.length);
    for (let i = 0; i < codes.length; i += per) {
      const part = codes.slice(i, i + per);
      res.push(...await run(`head IN (${q(heads)}) AND item_code IN (${q(part)})`, [...heads, ...part]));
    }
    return res;
  };
  const allSrc = [...new Set([...src, ...inc.flatMap((x) => x.src)])];
  /* فهرستِ کد («عین قلم»، «قلم انتخابی» با لایهٔ تیک‌خورده)، وگرنه همهٔ نوع قلم */
  let codes = sc.codes != null ? sc.codes : hd.sub ? hd.items.map((x) => x[0]) : null;
  if (!codes && src.length + out.length > IN_MAX) codes = hd.items.map((x) => x[0]);
  if (!codes) {
    const rows = await run(`head IN (${q(src)})${out.length ? ` AND item_code NOT IN (${q(out)})` : ""}`, [...src, ...out]);
    if (inc.length) rows.push(...await byCodes(inc.map((x) => x.code), [...new Set(inc.flatMap((x) => x.src))]));
    return rows;
  }
  if (!codes.length || !allSrc.length) return [];
  return byCodes(codes, allSrc);
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
  const match = { mode: sc.mode, source: sc.source, codes: sc.codes ? sc.codes.length : hd.items.length, headItems: hd.items.length,
    picked: sc.picked || [], units: sc.units ? [...sc.units] : null };
  if (sc.codes && !sc.codes.length) {
    return { ...head, ...empty, struct, match, message: sc.mode === "pick"
      ? "هیچ قلمی از این نوع، لایه‌های تیک‌خورده را با همین مقدار ندارد. تیکِ یکی از لایه‌ها را بردارید."
      : "هیچ قلمی در فهرست دقیقاً همین لایه‌ها را ندارد. حالت «نوع قلم» همهٔ اقلام همین نوع را نشان می‌دهد." };
  }

  /* ۱) خریدها به تفکیک تأمین‌کننده × کد × واحد — تبدیل واحد به ازای (کد، واحد) است */
  const groups = await scoped(env, sc, `SELECT supplier_n AS sn, MAX(supplier) AS name, item_code, unit,
      COUNT(*) AS n, SUM(COALESCE(qty,0)) AS qty, SUM(COALESCE(qty,0) * ${W_SQL}) AS qtym,
      SUM(amount_adj) AS adj, MIN(order_date) AS first_date, MAX(order_date) AS last_date,
      MIN(CASE WHEN qty>0 THEN amount_adj/qty END) AS min_u, MAX(CASE WHEN qty>0 THEN amount_adj/qty END) AS max_u`,
  "GROUP BY supplier_n, item_code, unit", w);

  const per = new Map(), excluded = new Map(), units = new Map();
  let lowConf = 0, unitDropped = 0;
  for (const g of groups) {
    const u = nameOf(g.unit);
    if (!unitOk(sc, u)) { unitDropped += g.n; continue; }
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
  let titles = [];
  if (!opts.brief) {
    const tc = new Map();
    for (const r of await scoped(env, sc, "SELECT item_code, unit, MAX(title) AS title, COUNT(*) AS n", "GROUP BY item_code, unit ORDER BY n DESC LIMIT 200")) {
      if (!unitOk(sc, r.unit)) continue;
      const e = tc.get(r.item_code) || { code: r.item_code, title: r.title, n: 0 }; e.n += r.n; tc.set(r.item_code, e);
    }
    titles = [...tc.values()].sort((a, b) => b.n - a.n).slice(0, 12)
      .map((r) => ({ code: r.code, title: (byCode.get(r.code) || [])[1] || r.title, n: r.n, layers: (byCode.get(r.code) || [])[4] || null }));
  }

  return {
    ...head, struct, match, rates, titles,
    excluded: [...excluded.values()],
    unconverted, lowConf, unitDropped,
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
  if (!sc.hd || (sc.codes && !sc.codes.length)) return { points: [], unit: sc.hd ? sc.hd.ref : null };
  const byCode = new Map(sc.hd.items.map((x) => [x[0], x]));
  const rows = await scoped(env, sc, `SELECT supplier_n AS key, MAX(supplier) AS name, order_date AS date, item_code, unit,
      SUM(COALESCE(qty,0)) AS qty, COUNT(*) AS n`, "GROUP BY supplier_n, order_date, item_code, unit ORDER BY order_date LIMIT 5000");
  const pts = new Map();
  for (const r of rows) {
    if (excludedWhy(r.key) || !unitOk(sc, r.unit)) continue;
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
  if (!sc.hd || (sc.codes && !sc.codes.length)) return { buys: [], unit: sc.hd ? sc.hd.ref : null };
  const byCode = new Map(sc.hd.items.map((x) => [x[0], x]));
  const rows = (await scoped(env, sc, "SELECT order_date, title, item_code, qty, unit, amount, amount_adj",
    "AND supplier_n=? ORDER BY order_date DESC LIMIT 300", [], [sn])).filter((r) => unitOk(sc, r.unit));
  /* هر ردیف با قیمت روزِ خودش و قیمتِ به مبلغِ زمستان ۱۴۰۴ (تصمیم مدیر، مهر ۱۴۰۵): قیمت واحد و مبلغ کل
     هر دو در همان ضریب تعدیلِ ردیف ضرب می‌شوند — ضریبی که هنگام بارگذاری از شاخصِ طبقهٔ اصنافِ قلم
     و فصلِ خرید ساخته شده (amount_adj ÷ amount)، پس قیمت واحدِ تعدیل‌شده به همان واحدِ ثبت‌شده است. */
  const buys = rows.sort((a, b) => (a.order_date < b.order_date ? 1 : -1)).slice(0, 300).map((r) => {
    const rt = rateFor(sc.hd, byCode.get(r.item_code) || null, r.unit, sc.override);
    const qref = rt && r.qty != null ? r.qty * rt.rate : null;
    return {
      order_date: r.order_date, title: r.title, item_code: r.item_code, qty: r.qty, unit: r.unit,
      amount: r.amount, amount_adj: r.amount_adj,
      unit_price: r.qty ? r.amount / r.qty : null,
      unit_price_adj: r.qty && r.amount_adj != null ? r.amount_adj / r.qty : null,
      adj_factor: r.amount && r.amount_adj != null ? r.amount_adj / r.amount : null,
      rate: rt ? rt.rate : null, qty_ref: qref,
      unit_adj: qref ? r.amount_adj / qref : null,
    };
  });
  return { buys, unit: sc.hd.ref };
}

/**
 * سهمِ هر واحدِ خرید از کلِ مقدارِ خریدِ این نوع قلم (به واحد مرجع) — کنار هر نرخ در کادرِ «نرمال‌سازی
 * اقلام»: از ۱۰۰۰ کیلوگرم، چند درصد واقعاً کیلوگرم خریده شده و چند درصد از «ورق» یا «متر مربع» تبدیل
 * شده، تا کارشناس بداند کنار گذاشتنِ یک نرخ در «قلم انتخابی» چه سهمی را کنار می‌گذارد. همان
 * جمعیتِ جدول تأمین‌کنندگان (بی نام‌های تجمیعی و تحویلیِ کارفرما) و همان نرخ‌ها (rateFor).
 */
export async function unitShares(env, hd, override = {}) {
  if (!hd) return null;
  const sc = { hd, mode: "head", codes: null, override };
  const byCode = new Map(hd.items.map((x) => [x[0], x]));
  const rows = await scoped(env, sc, "SELECT supplier_n AS sn, item_code, unit, COUNT(*) AS n, SUM(COALESCE(qty,0)) AS qty", "GROUP BY supplier_n, item_code, unit");
  const per = new Map(); let total = 0;
  for (const g of rows) {
    if (excludedWhy(g.sn)) continue;
    const u = nameOf(g.unit);
    const rt = rateFor(hd, byCode.get(g.item_code) || null, u, override);
    const e = per.get(u) || { unit: u, rows: 0, qty: 0, qtyRef: 0, unconverted: 0 };
    e.rows += g.n; e.qty += g.qty || 0;
    if (rt) { const q = (g.qty || 0) * rt.rate; e.qtyRef += q; total += q; } else e.unconverted += g.n;
    per.set(u, e);
  }
  const units = [...per.values()].map((e) => ({ ...e, share: total ? e.qtyRef / total * 100 : 0 })).sort((a, b) => b.qtyRef - a.qtyRef || b.rows - a.rows);
  return { ref: hd.ref, total, units };
}

/**
 * نرخ‌های کادرِ «نرمال‌سازی اقلام» (normalize.js:ratesView) به‌همراهِ سهمِ هر واحد، ردیفِ خودِ واحد مرجع،
 * و واحدهایی که در سوابق هست ولی نرخِ نوع قلم ندارند (با نرخِ خوشه یا بی‌نرخ).
 */
export async function ratesWithShares(env, rv, head, code) {
  if (!rv || !rv.ref || !head) return rv;
  const hd = await headData(env, head); if (!hd) return rv;
  const override = {};
  for (const u of rv.units || []) if (u.src === "user" && u.rate > 0) override[u.unit] = u.rate;
  const sh = await unitShares(env, hd, override);
  const pickS = (s) => (s ? { rows: s.rows, qty: s.qty, qtyRef: s.qtyRef, share: s.share, unconverted: s.unconverted } : { rows: 0, qty: 0, qtyRef: 0, share: 0, unconverted: 0 });
  const byU = new Map(sh.units.map((s) => [s.unit, s]));
  const units = (rv.units || []).map((u) => ({ ...u, ...pickS(byU.get(u.unit)) }));
  const item = code ? hd.items.find((x) => x[0] === code) || null : null;
  for (const [u, s] of byU) {
    if (u === rv.ref || units.some((x) => x.unit === u)) continue;
    const rt = rateFor(hd, item, u, override);
    units.push({ unit: u, ...(rt || { rate: null, basis: "نرخی نیست", conf: "—", src: "none" }), ...pickS(s) });
  }
  units.sort((a, b) => (b.qtyRef || 0) - (a.qtyRef || 0) || (b.rows || 0) - (a.rows || 0) || String(a.unit).localeCompare(String(b.unit), "fa"));
  return { ...rv, units, refRow: { unit: rv.ref, rate: 1, basis: "واحد مرجع", conf: "قطعی", src: "ref", ...pickS(byU.get(rv.ref)) }, total: sh.total };
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
