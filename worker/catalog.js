/**
 * نرمال‌سازی اقلام و سوابق خرید — ذخیره و خواندن
 *
 * چهار فایل مرجع (اقلام، شاخص تعدیل، نرخ تبدیل، سوابق خرید) در مرورگرِ مدیر به هم
 * وصل می‌شوند (frontend/tamin-poshtibani/catalog-import.js) و این‌جا فقط نوشته
 * می‌شوند. طراحی جدول‌ها برای کمترین نوشتن در D1 است — سقف پلن رایگان ۱۰۰ هزار
 * ردیف در روز، و هر ایندکس برای هر ردیف یک نوشتن اضافه:
 *
 *   cat_heads       یک ردیف به ازای هر نوع قلم (بخش‌های ≤۴۰KB): واحد مرجع، نرخ‌های
 *                   تبدیل و همهٔ اقلامش با لایه‌ها — به‌جای ۲۳ هزار قلم و ۵۵ هزار لایه
 *   cat_codes       کد قلم → نوع قلم، ۶۴ تکه
 *   cat_words       واژهٔ عنوان → نوع‌های قلم، ۳۲ تکه (یافتن اقلام مشابه برای مدل)
 *   price_index     هر شاخص تعدیل یک ردیف با همهٔ فصل‌ها
 *   guild_classes   طبقهٔ اصناف → شاخص
 *   supplier_grades کد و ردهٔ A/B/C تأمین‌کننده
 *   purchases       ردیف‌های خرید؛ کلید اصلی (نوع قلم، کد قلم، اثرانگشت) هم جستجوی
 *                   «نوع قلم» و «عین قلم» را جواب می‌دهد و هم ردیف تکراری را می‌گیرد،
 *                   پس هیچ ایندکس جانبی ندارد و هر ردیف فقط یک نوشتن است.
 *
 * همه WITHOUT ROWID اند: کلید اصلی خودِ جدول است و ایندکس پنهانِ جدا نمی‌سازد.
 *
 * بارگذاری مرحله‌ای و قابل ازسرگیری است: جدول‌هایی که باید از نو ساخته شوند اول در
 * «<نام>__new» پر می‌شوند و فقط در پایان جابه‌جا می‌شوند، پس تا آن لحظه سوابق قبلی
 * سر جایش است. اگر سهمیهٔ روزانه وسط کار تمام شود، بارگذاری دوبارهٔ همان فایل‌ها
 * (فردا) همان بارگذاری را ادامه می‌دهد و ردیف‌های نوشته‌شده دوباره نوشته نمی‌شوند.
 */
import { HttpError } from "./http.js";

const now = () => Date.now();
const T = (v) => String(v == null ? "" : v).trim();

/* ------------------------------------------------------------------ */
/* قواعد مشترک با مرورگر                                                */
/* ------------------------------------------------------------------ */
/* عیناً همان‌های catalog-import.js (TP.cat). تست «تطابق با مرورگر» (catalog.test.mjs)
   هر واگرایی را می‌گیرد — کلید تأمین‌کننده یا تکهٔ یک کد اگر دو طرف فرق کند، پیدا نمی‌شود. */
export const ascii = (s) => String(s == null ? "" : s)
  .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
  .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
export const nameOf = (x) => String(x == null ? "" : x).replace(/ي/g, "ی").replace(/ك/g, "ک")
  .replace(/[‌‎‏]/g, " ").replace(/\s+/g, " ").trim();
export const keyOf = (x) => ascii(nameOf(x)).toLowerCase();
export const fnv32 = (s, h = 0x811c9dc5) => { s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
export const CODE_SHARDS = 64, WORD_SHARDS = 32;
export const shardOf = (kind, k) => kind === "code"
  ? "c" + String(fnv32(k) % CODE_SHARDS).padStart(2, "0")
  : "w" + String(fnv32(k) % WORD_SHARDS).padStart(2, "0");
export const words = (title) => keyOf(title).split(/[\s\-_/\\()[\]{}*×,.،؛:;"'«»+|=!?؟#]+/)
  .filter((w) => w.length >= 2 && !/^\d+([.,/]\d+)*$/.test(w));

/* ------------------------------------------------------------------ */
/* جدول‌ها                                                              */
/* ------------------------------------------------------------------ */
/* `per`: چند ردیف در هر دستور INSERT. سقف D1 صد پارامتر مقیدشده است؛ ردیف‌های فهرست
   اقلام تا ۴۰KB اند و تک‌تک نوشته می‌شوند. */
export const TABLES = {
  cat_heads: { per: 1, cols: ["head", "part", "data"],
    ddl: "CREATE TABLE IF NOT EXISTS cat_heads (head TEXT NOT NULL, part INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (head, part)) WITHOUT ROWID" },
  cat_codes: { per: 1, cols: ["shard", "data"],
    ddl: "CREATE TABLE IF NOT EXISTS cat_codes (shard TEXT PRIMARY KEY, data TEXT NOT NULL) WITHOUT ROWID" },
  cat_words: { per: 1, cols: ["shard", "data"],
    ddl: "CREATE TABLE IF NOT EXISTS cat_words (shard TEXT PRIMARY KEY, data TEXT NOT NULL) WITHOUT ROWID" },
  price_index: { per: 10, cols: ["code", "name", "source", "series"],
    ddl: "CREATE TABLE IF NOT EXISTS price_index (code TEXT PRIMARY KEY, name TEXT, source TEXT, series TEXT NOT NULL) WITHOUT ROWID" },
  guild_classes: { per: 20, cols: ["code", "name", "group_code", "group_name", "index_code"],
    ddl: "CREATE TABLE IF NOT EXISTS guild_classes (code TEXT PRIMARY KEY, name TEXT, group_code TEXT, group_name TEXT, index_code TEXT) WITHOUT ROWID" },
  supplier_grades: { per: 25, cols: ["sn", "name", "code", "grade"],
    ddl: "CREATE TABLE IF NOT EXISTS supplier_grades (sn TEXT PRIMARY KEY, name TEXT, code TEXT, grade TEXT) WITHOUT ROWID" },
  purchases: { per: 7, cols: ["head", "item_code", "h", "order_date", "ym", "qty", "unit", "amount", "amount_adj", "supplier", "supplier_n", "expert", "title"],
    ddl: "CREATE TABLE IF NOT EXISTS purchases (head TEXT NOT NULL, item_code TEXT NOT NULL, h TEXT NOT NULL, order_date TEXT, ym INTEGER, qty REAL, unit TEXT,"
      + " amount REAL, amount_adj REAL, supplier TEXT, supplier_n TEXT, expert TEXT, title TEXT, PRIMARY KEY (head, item_code, h)) WITHOUT ROWID" },
};
/* هر گروه با یک اثرانگشت تصمیم می‌گیرد از نو ساخته شود یا نه */
export const GROUPS = {
  catalog: ["cat_heads", "cat_codes", "cat_words", "price_index", "guild_classes"],
  grades: ["supplier_grades"],
  purchases: ["purchases"],
};
const groupOf = (table) => Object.keys(GROUPS).find((g) => GROUPS[g].includes(table));
export const CATALOG_DDL = Object.values(TABLES).map((t) => t.ddl);
const ddlFor = (table, name) => TABLES[table].ddl.replace(`EXISTS ${table} (`, `EXISTS ${name} (`);

/** دستورهای INSERT یک دسته — مشترک میان مسیر بارگذاری و اسکریپت ورود اول */
export function insertStatements(db, table, rows, target = table) {
  const t = TABLES[table];
  const tuple = `(${t.cols.map(() => "?").join(",")})`;
  const out = [];
  for (let i = 0; i < rows.length; i += t.per) {
    const part = rows.slice(i, i + t.per), args = [];
    for (const r of part) {
      if (!Array.isArray(r) || r.length !== t.cols.length) throw new HttpError(`ردیف ${table} باید ${t.cols.length} مقدار داشته باشد.`);
      for (const v of r) args.push(v == null || v === "" ? (typeof v === "string" ? v : null) : typeof v === "number" ? (Number.isFinite(v) ? v : null) : String(v));
    }
    out.push(db.prepare(`INSERT OR IGNORE INTO ${target} (${t.cols.join(",")}) VALUES ${part.map(() => tuple).join(",")}`).bind(...args));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* بارگذاری                                                             */
/* ------------------------------------------------------------------ */
const parse = (s) => { try { return JSON.parse(s || "{}"); } catch (_) { return {}; } };

/** آخرین بارگذاری آمادهٔ سوابق (هر قالبی) با آمارش */
export async function activeImport(env) {
  const r = await env.DB.prepare("SELECT * FROM hist_imports WHERE state='ready' ORDER BY id DESC LIMIT 1").first();
  return r ? { ...r, stats: parse(r.stats_json) } : null;
}
const isV2 = (imp) => !!(imp && imp.stats && imp.stats.format === 2);
const sameFp = (a, b) => !!(a && b && ["cat", "adj", "rows", "grades"].every((k) => a[k] === b[k]));

/**
 * شروع بارگذاری. برای هر گروه یکی از سه حالت، به ترتیب ارزانی:
 *   skip     — اثرانگشتش همان است: هیچ نوشتنی
 *   append   — فقط ردیف‌های خرید، وقتی نوع قلم و شاخص‌ها عوض نشده‌اند: ردیف تازه نوشته می‌شود،
 *              ردیفِ موجود با کلید اصلی کنار گذاشته می‌شود
 *   replace  — در جدول «__new» ساخته و در پایان جابه‌جا می‌شود
 * اگر بارگذاری نیمه‌تمامی با همین اثرانگشت‌ها باشد (سهمیه تمام شده بود)، همان ادامه می‌یابد.
 */
export async function catalogBegin(env, body) {
  const fp = body && body.fp;
  if (!fp || !fp.cat || !fp.adj || !fp.rows || !fp.grades) throw new HttpError("اثرانگشت فایل‌ها (fp) لازم است.");
  const cur = await activeImport(env);
  const prev = isV2(cur) ? cur.stats.fp : null;

  const open = await env.DB.prepare("SELECT id, stats_json FROM hist_imports WHERE state='loading' ORDER BY id DESC LIMIT 1").first();
  const openStats = open ? parse(open.stats_json) : null;
  if (open && openStats.format === 2 && sameFp(openStats.fp, fp)) {
    return { import_id: open.id, plan: openStats.plan, resumed: true };
  }

  const plan = {
    catalog: prev && prev.cat === fp.cat ? "skip" : "replace",
    grades: prev && prev.grades === fp.grades ? "skip" : "replace",
    purchases: prev && prev.rows === fp.rows && prev.adj === fp.adj ? "skip" : prev && prev.adj === fp.adj ? "append" : "replace",
  };
  if (Object.values(plan).every((m) => m === "skip")) return { skipped: true, plan, import_id: cur.id };

  const stmts = [env.DB.prepare("UPDATE hist_imports SET state='stale' WHERE state='loading'")];
  for (const [g, mode] of Object.entries(plan)) {
    if (mode !== "replace") continue;
    for (const t of GROUPS[g]) { stmts.push(env.DB.prepare(`DROP TABLE IF EXISTS ${t}__new`)); stmts.push(env.DB.prepare(ddlFor(t, `${t}__new`))); }
  }
  const stats = { format: 2, fp, plan, files: body.files || null, file: body.stats || null, meta: body.meta || null };
  stmts.push(env.DB.prepare("INSERT INTO hist_imports (filename,imported_at,row_count,state,stats_json) VALUES (?,?,?,'loading',?)")
    .bind(T(body.filename) || null, now(), Number(body.stats && body.stats.rows) || null, JSON.stringify(stats)));
  const res = await env.DB.batch(stmts);
  return { import_id: res[res.length - 1].meta.last_row_id, plan, resumed: false };
}

async function openImport(env, id) {
  const imp = await env.DB.prepare("SELECT id, state, stats_json FROM hist_imports WHERE id=?").bind(Number(id) || 0).first();
  if (!imp) throw new HttpError("بارگذاری پیدا نشد.", 404);
  if (imp.state !== "loading") throw new HttpError("این بارگذاری تمام شده یا کنار گذاشته شده است؛ از نو شروع کنید.", 409);
  const stats = parse(imp.stats_json);
  if (stats.format !== 2) throw new HttpError("این بارگذاری مال قالب قدیمی است.", 409);
  return { ...imp, stats };
}

/** یک دسته ردیف برای یک جدول. ردیفِ موجود (کلید اصلی) دوباره نوشته نمی‌شود. */
export async function catalogChunk(env, body) {
  const imp = await openImport(env, body.import_id);
  const table = T(body.table), g = groupOf(table);
  if (!g) throw new HttpError("جدول ناشناخته.");
  const mode = imp.stats.plan[g];
  if (mode === "skip") throw new HttpError(`گروه «${g}» در این بارگذاری نوشته نمی‌شود.`, 409);
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) return { ok: true, inserted: 0, ignored: 0 };
  const stmts = insertStatements(env.DB, table, rows, mode === "replace" ? `${table}__new` : table);
  let inserted = 0;
  for (let i = 0; i < stmts.length; i += 100) {
    for (const x of await env.DB.batch(stmts.slice(i, i + 100))) inserted += (x.meta && x.meta.changes) || 0;
  }
  return { ok: true, inserted, ignored: rows.length - inserted };
}

/** پایان: جابه‌جایی جدول‌های تازه، آمار مرجع، و کنار گذاشتن بارگذاری قبلی */
export async function catalogFinish(env, body) {
  const imp = await openImport(env, body.import_id);
  const plan = imp.stats.plan;
  const swap = [];
  for (const [g, mode] of Object.entries(plan)) {
    if (mode !== "replace") continue;
    for (const t of GROUPS[g]) swap.push(env.DB.prepare(`DROP TABLE IF EXISTS ${t}`), env.DB.prepare(`ALTER TABLE ${t}__new RENAME TO ${t}`));
  }
  if (plan.catalog === "replace" && imp.stats.meta) {
    swap.push(env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('catalog',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
      .bind(JSON.stringify({ ...imp.stats.meta, fp: imp.stats.fp }), now()));
  }
  if (swap.length) await env.DB.batch(swap);
  resetCatalogCache();

  /* آمار روی کل جدول است، نه فقط این فایل: در حالت افزایشی ردیف‌های قبلی هم هستند.
     یک پیمایش کامل (≈۷۱ هزار ردیف خوانده‌شده) — یک بار در هر بارگذاری. */
  const s = await env.DB.prepare(`SELECT COUNT(*) AS n, COUNT(DISTINCT supplier_n) AS suppliers, COUNT(DISTINCT item_code) AS codes,
      MIN(ym) AS min_ym, MAX(ym) AS max_ym FROM purchases`).first();
  const stats = { ...imp.stats, rows: s.n, suppliers: s.suppliers, codes: s.codes, minYm: s.min_ym, maxYm: s.max_ym,
    ageMax: s.min_ym ? Math.max(1, BASE_YM - s.min_ym) : 1, finishedWrites: body.writes || null };
  await env.DB.batch([
    env.DB.prepare("UPDATE hist_imports SET state='stale' WHERE state='ready' AND id<>?").bind(imp.id),
    env.DB.prepare("UPDATE hist_imports SET state='ready', finished_at=?, row_count=?, stats_json=? WHERE id=?").bind(now(), s.n, JSON.stringify(stats), imp.id),
  ]);
  return { ok: true, stats };
}

/* اسفند ۱۴۰۴ — مبنای گشتاور (همان worker/history.js:BASE_YM؛ این‌جا تکرار شده تا حلقهٔ ایمپورت نسازد) */
const BASE_YM = 1404 * 12 + 12;

/* ------------------------------------------------------------------ */
/* خواندن فهرست اقلام                                                   */
/* ------------------------------------------------------------------ */
/* در هر isolate پنج دقیقه نگه داشته می‌شود؛ فهرست فقط با بارگذاری عوض می‌شود.
   هر کوئری D1 یک زیردرخواست است و فراخوانی رایگان پنجاه‌تا بیشتر ندارد. */
const TTL = 5 * 60000;
let cache = { at: 0, meta: undefined, codes: new Map() };
export const resetCatalogCache = () => { cache = { at: now(), meta: undefined, codes: new Map() }; };
const fresh = () => { if (now() - cache.at > TTL) resetCatalogCache(); };

/** نام لایه‌ها، خوشه‌ها و اثرانگشت فهرست — یا null اگر هنوز بارگذاری نشده */
export async function catalogMeta(env) {
  fresh();
  if (cache.meta === undefined) {
    const r = await env.DB.prepare("SELECT value FROM settings WHERE key='catalog'").first();
    cache.meta = r ? parse(r.value) : null;
  }
  return cache.meta;
}

/** نوع قلمِ یک کد راهکاران، یا null */
export async function headOfCode(env, code) {
  const c = T(code); if (!c) return null;
  fresh();
  const s = shardOf("code", c);
  if (!cache.codes.has(s)) {
    const r = await env.DB.prepare("SELECT data FROM cat_codes WHERE shard=?").bind(s).first().catch(() => null);
    cache.codes.set(s, r ? parse(r.data) : {});
  }
  const h = cache.codes.get(s)[c];
  return h == null ? null : h;
}

/**
 * یک نوع قلم با همهٔ اقلامش — بخش‌ها سر هم.
 * items: [کد، عنوان، خوشه، طبقهٔ اصناف، لایه‌ها، باقیماندهٔ متن، نرخ ویژهٔ قلم]
 */
export async function headData(env, head) {
  const h = nameOf(head); if (!h) return null;
  const rows = (await env.DB.prepare("SELECT data FROM cat_heads WHERE head=? ORDER BY part").bind(h).all().catch(() => ({ results: [] }))).results || [];
  if (!rows.length) return null;
  const out = { head: h, ref: "عدد", n: 0, hr: {}, cr: {}, items: [] };
  for (const r of rows) { const d = parse(r.data); for (const k of ["ref", "n", "hr", "cr"]) if (d[k] !== undefined) out[k] = d[k]; out.items.push(...(d.items || [])); }
  return out;
}
export const itemOf = (hd, code) => (hd && hd.items.find((x) => x[0] === T(code))) || null;

/** واژه → نوع‌های قلم، فقط برای تکه‌های لازم */
export async function wordHeads(env, ws) {
  const shards = [...new Set(ws.map((w) => shardOf("word", w)))];
  if (!shards.length) return {};
  const rows = (await env.DB.prepare(`SELECT data FROM cat_words WHERE shard IN (${shards.map(() => "?").join(",")})`).bind(...shards).all().catch(() => ({ results: [] }))).results || [];
  const all = {};
  for (const r of rows) Object.assign(all, parse(r.data));
  const out = {};
  for (const w of ws) if (all[w]) out[w] = all[w];
  return out;
}

/* ------------------------------------------------------------------ */
/* نرخ تبدیل واحد                                                       */
/* ------------------------------------------------------------------ */
const GOOD = new Set(["قطعی", "بالا", "متوسط"]);
const DOWN = { "قطعی": "بالا", "بالا": "متوسط", "متوسط": "پایین", "پایین": "پایین" };

/**
 * نرخِ «مقدار ثبت‌شده → واحد مرجع» یک ردیف. ترتیب دقیقاً همان برگهٔ schema فایل ۴:
 *   ۱) واحد = واحد مرجع → ۱
 *   ۲) نرخ ویژهٔ همین کد قلم
 *   ۳) نرخ خوشهٔ همین قلم با اطمینان قطعی/بالا/متوسط
 *   ۴) نرخ نوع قلم (اگر شاهد خوشه بود ولی ضعیف، اطمینان یک پله پایین)
 *   ۵) نرخ خوشه حتی با اطمینان پایین
 * `override`: {واحد: نرخ} که کارشناس در تب سوابق عوض کرده — بر همه مقدم (جز خودِ واحد مرجع).
 * null یعنی راهی برای تبدیل نیست؛ آن ردیف در جمع مقدار نمی‌آید و هشدار می‌گیرد.
 */
export function rateFor(hd, item, unit, override) {
  const u = nameOf(unit);
  if (!u || u === hd.ref) return { rate: 1, basis: "واحد مرجع", conf: "قطعی", src: "ref" };
  const o = override && Number(override[u]);
  if (o > 0) return { rate: o, basis: "تعیین کارشناس", conf: "کارشناس", src: "user" };
  const ir = item && item[6] && item[6][u];
  if (ir) return { rate: ir[0], basis: `${ir[1] || "نرخ ویژه"} (قلم)`, conf: "بالا", src: "item" };
  const cl = item && item[2];
  const c = cl && hd.cr[cl] && hd.cr[cl][u];
  if (c && GOOD.has(c[2])) return { rate: c[0], basis: `${c[1]} (خوشه)`, conf: c[2], src: "cluster" };
  const h = hd.hr[u];
  if (h) return { rate: h[0], basis: `${h[1]} (نوع قلم)`, conf: c ? DOWN[h[2]] || h[2] : h[2], src: "head" };
  if (c) return { rate: c[0], basis: `${c[1]} (خوشه)`, conf: c[2], src: "cluster" };
  return null;
}

/* ------------------------------------------------------------------ */
/* لایه‌های ویژگی                                                       */
/* ------------------------------------------------------------------ */
/* مقدار لایه برای مقایسه: «10*20»، «10×20» و «10 x 20» یکی‌اند */
export const valueKey = (v) => keyOf(v).replace(/\s/g, "").replace(/[×*]/g, "x");

/** «عین قلم»: همان لایه‌ها با همان مقدارها — نه بیشتر، نه کمتر */
export function layersEqual(a, b) {
  const ea = Object.entries(a || {}).filter(([, v]) => T(v)), eb = Object.entries(b || {}).filter(([, v]) => T(v));
  if (ea.length !== eb.length) return false;
  const mb = new Map(eb.map(([k, v]) => [nameOf(k), valueKey(v)]));
  return ea.every(([k, v]) => mb.get(nameOf(k)) === valueKey(v));
}
