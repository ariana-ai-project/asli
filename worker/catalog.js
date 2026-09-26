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
 *   cat_titles      عنوان قلم → کد، ۶۴ تکه (قلمِ بی‌کد یا با کدِ تازه، با عنوانِ عیناً همان)
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
 * ویرایشِ کارشناس (item_edits، بیرون از بارگذاری): نوع قلم، لایه‌ها و نرخ تبدیلی که کارشناس
 * در «نرمال‌سازی اقلام» برای یک کد ذخیره کرده. جزء دیتابیس اصلی است: هنگام خواندن روی فهرست
 * می‌نشیند (headData)، پس هم پیشنهادِ بعدیِ همان کد و هم جستجوی سوابقِ هر دو نوع قلم (قبلی و
 * تازه) آن را می‌بینند، و بارگذاریِ دوبارهٔ فایل‌ها پاکش نمی‌کند.
 *
 * بارگذاری مرحله‌ای و قابل ازسرگیری است: جدول‌هایی که باید از نو ساخته شوند اول در
 * «<نام>__new» پر می‌شوند و فقط در پایان جابه‌جا می‌شوند، پس تا آن لحظه سوابق قبلی
 * سر جایش است. اگر سهمیهٔ روزانه وسط کار تمام شود، بارگذاری دوبارهٔ همان فایل‌ها
 * (فردا) همان بارگذاری را ادامه می‌دهد و ردیف‌های نوشته‌شده دوباره نوشته نمی‌شوند.
 */
import { HttpError } from "./http.js";
import * as RULES from "../frontend/tamin-poshtibani/catalog-rules.mjs";
import * as CANON from "../frontend/tamin-poshtibani/catalog-canon.mjs";
import { HEAD_RULES } from "../frontend/tamin-poshtibani/catalog-head-rules.mjs";
import { convert } from "../frontend/tamin-poshtibani/catalog-units.mjs";

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
export const CODE_SHARDS = 64, WORD_SHARDS = 32, TITLE_SHARDS = 64;
export const shardOf = (kind, k) => kind === "code"
  ? "c" + String(fnv32(k) % CODE_SHARDS).padStart(2, "0")
  : kind === "title" ? "t" + String(fnv32(k) % TITLE_SHARDS).padStart(2, "0")
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
  cat_titles: { per: 1, cols: ["shard", "data"],
    ddl: "CREATE TABLE IF NOT EXISTS cat_titles (shard TEXT PRIMARY KEY, data TEXT NOT NULL) WITHOUT ROWID" },
  cat_words: { per: 1, cols: ["shard", "data"],
    ddl: "CREATE TABLE IF NOT EXISTS cat_words (shard TEXT PRIMARY KEY, data TEXT NOT NULL) WITHOUT ROWID" },
  /* کد قلم → کد گروه اصناف (طبقهٔ اصناف همان قلم در فهرست، تا سرِ گروهش)، با همان تکه‌بندی کدها:
     ارجاع و مهلت هوشمند گروه هر قلم را با یک ردیف می‌خوانند، نه با باز کردن کل نوع قلم */
  cat_guilds: { per: 1, cols: ["shard", "data"],
    ddl: "CREATE TABLE IF NOT EXISTS cat_guilds (shard TEXT PRIMARY KEY, data TEXT NOT NULL) WITHOUT ROWID" },
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
  catalog: ["cat_heads", "cat_codes", "cat_titles", "cat_words", "cat_guilds", "price_index", "guild_classes"],
  grades: ["supplier_grades"],
  purchases: ["purchases"],
};
const groupOf = (table) => Object.keys(GROUPS).find((g) => GROUPS[g].includes(table));
export const CATALOG_DDL = Object.values(TABLES).map((t) => t.ddl);
/* ویرایشِ کارشناس — بیرون از گروه‌های بارگذاری، پس جابه‌جاییِ جدول‌های فهرست دستش نمی‌زند.
   k: کد قلم، یا «t:» + کلیدِ عنوان برای قلمِ بی‌کد. data: {title، layers، residual، rates (نرخ‌های
   کارشناس به واحد مرجعِ نوع قلمِ head)، cl، cls، ir (نرخ ویژهٔ فایل)، src و ref (نوع قلمِ فایل و واحد
   مرجعِ جای قبلیِ قلم)، by (نام کارشناس)}. ایندکس جانبی ندارد: فهرستِ کوچکِ همهٔ ویرایش‌ها در حافظه
   است (editIndex) و ردیفِ کامل با کلید اصلی خوانده می‌شود. */
export const EDITS_DDL = "CREATE TABLE IF NOT EXISTS item_edits (k TEXT PRIMARY KEY, code TEXT, title_n TEXT NOT NULL, head TEXT NOT NULL, data TEXT NOT NULL, expert_id INTEGER, at INTEGER NOT NULL) WITHOUT ROWID";
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
/* ویرایش‌های کارشناس زودتر کهنه می‌شوند: کارشناسِ دیگری در isolate دیگر ذخیره می‌کند */
const EDITS_TTL = 60000;
let cache = { at: 0, meta: undefined, codes: new Map(), titles: new Map(), part0: new Map(), heads: undefined, guilds: new Map(), groups: undefined };
let edits = { at: 0, ix: undefined };
export const resetCatalogCache = () => { cache = { at: now(), meta: undefined, codes: new Map(), titles: new Map(), part0: new Map(), heads: undefined, guilds: new Map(), groups: undefined }; edits = { at: 0, ix: undefined }; };
export const resetEditsCache = () => { edits = { at: 0, ix: undefined }; cache.heads = undefined; };
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

/* کد قلم با رقم فارسی هم همان کد است */
const codeKey = (code) => ascii(T(code));

/** نوع قلمِ یک کد راهکاران در فهرستِ بارگذاری‌شده (بی ویرایشِ کارشناس)، به نامِ استاندارد، یا null */
export async function headOfCode(env, code) {
  const c = codeKey(code); if (!c) return null;
  fresh();
  const s = shardOf("code", c);
  if (!cache.codes.has(s)) {
    const r = await env.DB.prepare("SELECT data FROM cat_codes WHERE shard=?").bind(s).first().catch(() => null);
    cache.codes.set(s, r ? parse(r.data) : {});
  }
  const h = cache.codes.get(s)[c];
  if (h == null) return null;
  /* نامِ هم‌معنا («آرماتور آهنی») به نام استاندارد؛ اگر جنسِ نامِ استاندارد را خودِ قلم می‌گوید
     («شلنگ» ← «شیلنگ لاستیکی»)، از ردیفِ همان قلم خوانده می‌شود */
  if (!aliasNeedsItem(h)) return CANON.canonHead(h);
  const x = (await storedItems(env, [h])).find((r) => r.item[0] === c);
  return CANON.canonHead(h, x ? { title: x.item[1], layers: x.item[4] } : null);
}

/* ------------------------------------------------------------------ */
/* گروه اصناف هر قلم (ارجاع و مهلت هوشمند)                              */
/* ------------------------------------------------------------------ */
/* «متفرقه» — گروهِ واقعیِ فهرست اصناف (۳۰۰۰۰۰)، نه برچسبِ ساختگی: قلمی که در فهرست نیست هم
   همان‌جا شمرده می‌شود و مدیر می‌تواند برایش امتیاز و ضریب بگذارد. */
export const GUILD_MISC = "300000";
/** کد گروه از کد طبقهٔ اصناف: دو رقم اول، مثل ۱۶۰۱۴۱ ← ۱۶۰۰۰۰ (قاعدهٔ خودِ فهرست) */
export const guildGroupOf = (cls) => { const c = ascii(T(cls)).replace(/\D/g, ""); return c.length >= 2 ? c.slice(0, 2) + "0000" : ""; };

/** گروه‌های اصناف موجود در دیتابیس با شمار طبقه‌هایشان — محورِ ماتریس‌های ارجاع و مهلت هوشمند */
export async function guildGroups(env) {
  fresh();
  if (cache.groups === undefined) {
    const rows = (await env.DB.prepare("SELECT group_code AS code, group_name AS name, COUNT(*) AS n FROM guild_classes WHERE group_code IS NOT NULL AND group_code<>'' GROUP BY 1,2")
      .all().catch(() => ({ results: [] }))).results || [];
    const list = rows.map((r) => ({ code: T(r.code), name: nameOf(r.name) || T(r.code), n: Number(r.n) || 0 }))
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, "fa"));
    /* «متفرقه» همیشه در فهرست و همیشه ته آن — اقلامِ بیرون از فهرست آن‌جا می‌افتند */
    const i = list.findIndex((g) => g.code === GUILD_MISC);
    const misc = i >= 0 ? list.splice(i, 1)[0] : { code: GUILD_MISC, name: "متفرقه", n: 0 };
    cache.groups = list.length ? [...list, misc] : [];
  }
  return cache.groups;
}

/** گروه اصناف چند کد قلم با هم: نگاشتِ کد → کد گروه. تکه‌های خوانده‌شده در isolate می‌مانند. */
export async function guildsOfCodes(env, codes) {
  fresh();
  const out = new Map(), want = new Map();
  for (const raw of codes || []) {
    const c = codeKey(raw); if (!c || out.has(c)) continue;
    const s = shardOf("code", c);
    const have = cache.guilds.get(s);
    if (have) { if (have[c]) out.set(c, have[c]); continue; }
    if (!want.has(s)) want.set(s, true);
  }
  if (want.size) {
    const shards = [...want.keys()];
    for (let i = 0; i < shards.length; i += 60) {
      const part = shards.slice(i, i + 60);
      const rows = (await env.DB.prepare(`SELECT shard, data FROM cat_guilds WHERE shard IN (${part.map(() => "?").join(",")})`)
        .bind(...part).all().catch(() => ({ results: [] }))).results || [];
      const got = new Map(rows.map((r) => [r.shard, parse(r.data)]));
      for (const s of part) cache.guilds.set(s, got.get(s) || {});
    }
    for (const raw of codes || []) {
      const c = codeKey(raw); if (!c || out.has(c)) continue;
      const g = (cache.guilds.get(shardOf("code", c)) || {})[c];
      if (g) out.set(c, g);
    }
  }
  return out;
}

/**
 * گروه اصناف اقلامِ یک فهرست ([{code, title}]) — کد قلم، و اگر کدِ راهکاران در فهرست نبود
 * عنوانِ عیناً همان (cat_titles). آنچه پیدا نشود «متفرقه» است.
 * خروجی: آرایهٔ کدِ گروه، هم‌ترتیبِ ورودی.
 */
export async function guildsOfItems(env, items) {
  const list = items || [];
  if (!list.length) return [];
  const byCode = await guildsOfCodes(env, list.map((x) => x && x.code));
  const out = list.map((x) => byCode.get(codeKey(x && x.code)) || "");
  const missing = list.map((x, i) => (out[i] ? null : T(x && x.title))).filter(Boolean);
  if (missing.length) {
    const codes = [];
    for (const t of [...new Set(missing)]) { const c = await codeOfTitle(env, t); if (c) codes.push([t, c]); }
    if (codes.length) {
      const g2 = await guildsOfCodes(env, codes.map((x) => x[1]));
      const byTitle = new Map(codes.map(([t, c]) => [keyOf(t), g2.get(codeKey(c)) || ""]));
      list.forEach((x, i) => { if (!out[i]) out[i] = byTitle.get(keyOf(x && x.title)) || ""; });
    }
  }
  return out.map((g) => g || GUILD_MISC);
}

/* ------------------------------------------------------------------ */
/* نام‌های هم‌معنا (catalog-canon.mjs)                                   */
/* ------------------------------------------------------------------ */
/* فهرست همان‌طور که بارگذاری شده خوانده می‌شود و یکسان‌سازیِ دوم — نامِ استاندارد، «نمره» به لایهٔ
   واقعی، مقاطع فلزی — هنگام خواندن روی آن می‌نشیند؛ پس دیتابیس بازنویسی نمی‌شود (سقف نوشتنِ روزانه) و
   بارگذاریِ دوبارهٔ فایل‌ها هم همین نتیجه را می‌دهد. */
const baseOf = (h) => RULES.splitHead(h, HEAD_RULES).base;
function aliasNeedsItem(h) {
  const sh = RULES.splitHead(h, HEAD_RULES), cb = CANON.canonBase(sh.base);
  if (keyOf(cb) === keyOf(sh.base) || sh.mat) return false;
  const r = HEAD_RULES[keyOf(cb)];
  return !!(r && r.r === "f");
}
/* GLOB برای نام‌های هم‌خانواده («آرماتور *»)؛ نامی که نویسهٔ ویژهٔ GLOB دارد فقط عیناً */
const globSafe = (s) => !/[*?[\]]/.test(s);
/** ردیف‌های خامِ چند نوع قلمِ ذخیره‌شده، به‌علاوهٔ نام‌های «پایه + جنس»ِ هم‌معناها: [{head، d، item}] */
async function storedItems(env, names, families = []) {
  const cond = [], args = [];
  for (const n of names) { cond.push("head=?"); args.push(n); }
  for (const b of families) if (globSafe(b)) { cond.push("head=?", "head GLOB ?"); args.push(b, `${b} *`); }
  if (!cond.length) return [];
  const rows = (await env.DB.prepare(`SELECT head, part, data FROM cat_heads WHERE ${cond.join(" OR ")} ORDER BY head, part`).bind(...args).all()
    .catch(() => ({ results: [] }))).results || [];
  const out = [];
  for (const r of rows) { const d = parse(r.data); out.push({ head: r.head, d, item: null }); for (const x of d.items || []) out.push({ head: r.head, d: null, item: x }); }
  return out;
}

/** کدِ قلمِ فهرست با همین عنوان — عیناً همان عنوان، با همان کلیدِ مقایسه (ی/ک عربی، نیم‌فاصله،
    فاصلهٔ اضافه و رقم فارسی فرقی نمی‌کنند) — یا null. عنوانِ تکراری در فهرست (۹۷ از ۲۲٬۸۶۱ در
    فایل مهر ۱۴۰۵) همه یک ساختار دارند و کوچک‌ترین کد نگه داشته شده است. */
export async function codeOfTitle(env, title) {
  const k = keyOf(title); if (!k) return null;
  fresh();
  const s = shardOf("title", k);
  if (!cache.titles.has(s)) {
    /* فهرستی که پیش از جدولِ عنوان‌ها بارگذاری شده این جدول را ندارد: یعنی پیدا نشد */
    const r = await env.DB.prepare("SELECT data FROM cat_titles WHERE shard=?").bind(s).first().catch(() => null);
    cache.titles.set(s, r ? parse(r.data) : {});
  }
  const c = cache.titles.get(s)[k];
  return c == null ? null : c;
}

/* ------------------------------------------------------------------ */
/* ویرایشِ کارشناس                                                      */
/* ------------------------------------------------------------------ */
/** فهرستِ کوچکِ همهٔ ویرایش‌ها: {byCode: کد → {k, head, at}، byTitle: کلیدِ عنوان → تازه‌ترین، n} */
export async function editIndex(env) {
  if (edits.ix && now() - edits.at < EDITS_TTL) return edits.ix;
  /* دیتابیسی که هنوز جدول را ندارد (پیش از نخستین طرح) یعنی ویرایشی نیست */
  let rs = [];
  try { rs = (await env.DB.prepare("SELECT k, code, title_n, head, at FROM item_edits").bind().all()).results || []; } catch (_) { rs = []; }
  const byCode = new Map(), byTitle = new Map();
  for (const r of rs) {
    r.head = CANON.canonHead(r.head);   /* ویرایشی که پیش از یکسان‌سازیِ نام‌ها ذخیره شده («آرماتور آهنی») */
    if (r.code) byCode.set(r.code, r);
    const t = byTitle.get(r.title_n);
    if (!t || r.at > t.at) byTitle.set(r.title_n, r);
  }
  edits = { at: now(), ix: { byCode, byTitle, n: rs.length } };
  return edits.ix;
}
/** ردیف‌های کاملِ ویرایش با کلید، با data خوانده‌شده */
export async function editRows(env, keys) {
  const out = [];
  for (let i = 0; i < keys.length; i += 90) {
    const part = keys.slice(i, i + 90);
    const rs = (await env.DB.prepare(`SELECT * FROM item_edits WHERE k IN (${part.map(() => "?").join(",")})`).bind(...part).all()).results || [];
    out.push(...rs.map((r) => {
      const data = parse(r.data), head = CANON.canonHead(r.head);
      return { ...r, head, data: { ...data, layers: CANON.canonLayers(head, data.layers || {}) } };
    }));
  }
  return out;
}
export const editKey = (it) => (codeKey(it && it.code) || `t:${keyOf(it && it.title)}`);

/** سرِ نوع قلم (بخش ۰) — واحد مرجع و نوع قلمِ فایل، برای قلمی که کارشناس از آن‌جا به نوع قلمِ دیگری برده */
async function headTop(env, h) {
  if (!cache.part0.has(h)) {
    const r = await env.DB.prepare("SELECT data FROM cat_heads WHERE head=? AND part=0").bind(h).first().catch(() => null);
    const d = r ? parse(r.data) : null;
    cache.part0.set(h, d ? { ref: d.ref || "عدد", src: d.src || [h] } : null);
  }
  return cache.part0.get(h);
}

/**
 * یک نوع قلم در فهرستِ بارگذاری‌شده، بی ویرایشِ کارشناس — بخش‌ها سر هم.
 * items: [کد، عنوان، خوشه، طبقهٔ اصناف، لایه‌ها، باقیماندهٔ متن، نرخ ویژهٔ قلم]
 * src: نوع قلمِ فایل (ستون head ردیف‌های خرید) — «ورق آهنی» ← [«ورق»]؛ sub: فقط بخشی از آن است
 * و جستجوی سوابق باید با کدهای خودش محدود شود؛ uc: عرفِ واحدِ هر لایه (خواندن عددِ بی‌واحد).
 * فهرستی که پیش از یکسان‌سازی بارگذاری شده این سه را ندارد: src همان نام، بی sub.
 */
export async function catalogHead(env, head) {
  const h = CANON.canonHead(nameOf(head)); if (!h) return null;
  /* خودِ نوع قلم، و نوع قلم‌های ذخیره‌شده با نامِ هم‌معنا («آرماتور آهنی» برای «میلگرد آهنی») */
  const fams = CANON.aliasBases(baseOf(h));
  const rows = await storedItems(env, [h], fams);
  if (!rows.length) return null;
  const heads = new Map();   /* نامِ ذخیره‌شده ← {d (سرِ بخش ۰ و بقیه)، items، total} */
  for (const r of rows) {
    let e = heads.get(r.head); if (!e) heads.set(r.head, e = { parts: [], items: [], total: 0 });
    if (r.d) e.parts.push(r.d);
    else { e.total++; if (r.head === h || CANON.canonHead(r.head, { title: r.item[1], layers: r.item[4] }) === h) e.items.push(r.item); }
  }
  const own = heads.get(h);
  const out = { head: h, ref: "عدد", n: 0, hr: {}, cr: {}, src: [h], sub: false, uc: {}, items: [] };
  /* سرِ نوع قلم از خودش؛ اگر فقط با نامِ هم‌معنا ذخیره شده، از همان */
  const top = own || [...heads.values()].find((e) => e.items.length);
  if (!top) return null;
  for (const d of top.parts) {
    for (const k of ["ref", "n", "hr", "cr", "src", "uc"]) if (d[k] !== undefined) out[k] = d[k];
    if (d.sub) out.sub = true;
  }
  const src = new Set(out.src || []);
  for (const [name, e] of heads) {
    if (e === top || !e.items.length) continue;
    const p0 = e.parts.find((d) => d.ref !== undefined) || {};
    /* هم‌معنایی با واحد مرجعِ دیگر، مقدارِ خریدش را با نرخ‌های این نوع قلم نمی‌شود جمع زد */
    if ((p0.ref || "عدد") !== out.ref) { console.warn("canon: واحد مرجع ناهمخوان", name, p0.ref, "≠", out.ref); continue; }
    for (const s of p0.src || [name]) src.add(s);
    if (p0.sub || e.items.length < e.total) out.sub = true;
    for (const d of e.parts) for (const [k, v] of Object.entries(d.uc || {})) if (!out.uc[k]) out.uc = { ...out.uc, [k]: v };
  }
  /* بخشی از یک نوع قلمِ ذخیره‌شده که به نام دیگری رفت: ردیف‌های خریدش باید با کدها محدود شوند */
  if (own && own.items.length < own.total) out.sub = true;
  out.src = [...src];
  for (const e of heads.values()) for (const x of e.items) out.items.push(canonItem(h, x));
  out.n = out.items.length;
  return out;
}
/* قلم با لایه‌های استاندارد (نمره به لایهٔ واقعی، مقاطع فلزی) — تاپلِ تازه، دادهٔ خوانده‌شده دست نمی‌خورد */
const canonItem = (h, x) => { const L = CANON.canonLayers(h, x[4] || {}); return L === x[4] ? x : [x[0], x[1], x[2], x[3], L, ...x.slice(5)]; };

/**
 * نوع قلم در دیتابیس اصلی: فهرست + ویرایش‌های کارشناس. قلمی که کارشناس به نوع قلمِ دیگری برده
 * از این‌جا می‌رود (out: کدهایش، تا ردیف‌های خریدش هم نیاید) و قلمی که به این‌جا آورده می‌آید
 * (inc: [{code، src}] — ردیف خریدش زیر نوع قلمِ فایلِ جای قبلی است). لایه‌ها و نرخ‌های کارشناس
 * جای مقدارِ فهرست می‌نشینند؛ نرخ کارشناس در خانهٔ ۸ قلم (rateFor). نوع قلمی که فقط کارشناس
 * ساخته (در فهرست نیست) با همان اقلامِ آورده ساخته می‌شود.
 */
export async function headData(env, head) {
  const h = nameOf(head); if (!h) return null;
  const [base, ix] = await Promise.all([catalogHead(env, h), editIndex(env)]);
  if (!ix.n) return base;
  const into = [...ix.byCode.values()].filter((e) => e.head === h);
  const touched = base ? base.items.some((x) => ix.byCode.has(x[0])) : false;
  if (!into.length && !touched) return base;
  const rows = new Map((into.length ? await editRows(env, into.map((e) => e.k)) : []).map((r) => [r.code, r]));
  const out = base ? { ...base, items: [] } : { head: h, ref: null, n: 0, hr: {}, cr: {}, src: [], sub: true, uc: {}, items: [], made: true };
  const moved = [], inc = [];
  const tuple = (x, r, ir) => [r.code, r.data.title || (x && x[1]) || "", x ? x[2] : r.data.cl || "", x ? x[3] : r.data.cls || "",
    r.data.layers || {}, r.data.residual || "", ir, r.data.rates && Object.keys(r.data.rates).length ? r.data.rates : null];
  for (const x of base ? base.items : []) {
    const e = ix.byCode.get(x[0]);
    if (!e) { out.items.push(x); continue; }
    if (e.head !== h) { moved.push(x[0]); continue; }
    const r = rows.get(x[0]);
    out.items.push(r ? tuple(x, r, x[6]) : x);
    rows.delete(x[0]);
  }
  for (const r of rows.values()) {
    /* جای قبلیِ قلم در فهرستِ امروز (اگر کد در فهرست هست)، وگرنه همان که هنگام ذخیره بود */
    const oh = await headOfCode(env, r.code), top = oh ? await headTop(env, oh) : null;
    const ref = top ? top.ref : r.data.ref || null, src = top ? top.src : r.data.src || [""];
    if (out.ref == null) out.ref = ref || "عدد";
    out.items.push(tuple(null, r, ref === out.ref ? r.data.ir || null : null));
    inc.push({ code: r.code, src });
  }
  if (out.ref == null) out.ref = "عدد";
  out.n = out.items.length;
  if (moved.length) out.out = moved;
  if (inc.length) out.inc = inc;
  return out;
}
export const itemOf = (hd, code) => (hd && hd.items.find((x) => x[0] === codeKey(code))) || null;

/** نام همهٔ نوع‌های قلم — فهرست و آنچه کارشناس ساخته — برای انتخابِ نوع قلم در پنل */
export async function allHeads(env) {
  fresh();
  if (cache.heads === undefined) {
    const rs = (await env.DB.prepare("SELECT head FROM cat_heads WHERE part=0").all().catch(() => ({ results: [] }))).results || [];
    const ix = await editIndex(env);
    const stored = new Set(rs.map((r) => r.head));
    /* نامِ هم‌معنا در فهرستِ انتخاب نمی‌آید — نامِ استانداردش هست */
    const names = rs.map((r) => { const c = CANON.canonHead(r.head); return c === r.head || stored.has(c) || !aliasNeedsItem(r.head) ? c : null; }).filter(Boolean);
    cache.heads = [...new Set([...names, ...[...ix.byCode.values(), ...ix.byTitle.values()].map((e) => e.head)])].sort((a, b) => a.localeCompare(b, "fa"));
  }
  return cache.heads;
}

/** واژه → نوع‌های قلم (به نامِ استاندارد)، فقط برای تکه‌های لازم */
export async function wordHeads(env, ws) {
  const shards = [...new Set(ws.map((w) => shardOf("word", w)))];
  if (!shards.length) return {};
  const rows = (await env.DB.prepare(`SELECT data FROM cat_words WHERE shard IN (${shards.map(() => "?").join(",")})`).bind(...shards).all().catch(() => ({ results: [] }))).results || [];
  const all = {};
  for (const r of rows) Object.assign(all, parse(r.data));
  const out = {};
  for (const w of ws) if (all[w]) out[w] = [...new Set(all[w].map((h) => CANON.canonHead(h)))];
  return out;
}

/* ------------------------------------------------------------------ */
/* نرخ تبدیل واحد                                                       */
/* ------------------------------------------------------------------ */
const GOOD = new Set(["قطعی", "بالا", "متوسط"]);
const DOWN = { "قطعی": "بالا", "بالا": "متوسط", "متوسط": "پایین", "پایین": "پایین" };

/**
 * تبدیلِ ایستا یا پویای یک (قلم، واحد) به واحد مرجعِ نوع قلم (catalog-units.mjs) — یک بار برای هر تاپلِ قلم؛
 * قلمِ بی‌تاپل (کدِ بیرون از فهرست) بی لایه سنجیده می‌شود. خروجی همان convert: {type، rate، basis، formulas، used، missing}.
 */
const convMemo = new WeakMap();
export function conversionFor(hd, item, unit) {
  const key = item || hd;
  let m = convMemo.get(key);
  if (!m) convMemo.set(key, (m = new Map()));
  const k = `${hd.head}\u0001${hd.ref}\u0001${unit}`;
  let r = m.get(k);
  if (!r) { r = convert({ head: hd.head, layers: (item && item[4]) || {} }, unit, hd.ref); m.set(k, r); }
  return r;
}

/* نرخ‌های فایل ۴ به ترتیبِ برگهٔ schema همان فایل: نرخ ویژهٔ کد قلم، نرخ خوشه با اطمینان قطعی/بالا/متوسط،
   نرخ نوع قلم (اگر شاهد خوشه بود ولی ضعیف، اطمینان یک پله پایین)، و نرخ خوشه حتی با اطمینان پایین */
function fileRate(hd, item, u) {
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

/**
 * نرخِ «مقدار ثبت‌شده → واحد مرجع» یک ردیف (تصمیم مدیر، مهر ۱۴۰۵: تبدیل ایستا یا پویا):
 *   ۱) واحد = واحد مرجع → ۱
 *   ۲) `override`: {واحد: نرخ} که کارشناس در تب سوابق عوض کرده؛ بعد نرخی که کارشناس برای همین کد در
 *      دیتابیس اصلی ذخیره کرده (خانهٔ ۸ قلم، headData) — دستِ کارشناس بر همه مقدم است
 *   ۳) ایستا — ضریب از خودِ دو واحد (۱ تن = ۱۰۰۰ کیلوگرم، ۱ دستگاه = ۱ عدد)، برای همهٔ اقلام یکی
 *   ۴) پویا — فرمول از لایه‌های همین قلم (۱ ورق = مساحت × ضخامت × چگالی کیلوگرم)
 *   ۵) نرخ‌های فایل ۴ (fileRate). برای تبدیلِ پویا یعنی لایهٔ لازم نبود: نرخِ ویژهٔ قلم می‌ماند، ولی نرخِ
 *      خوشه یا نوع قلم — یک عدد برای اقلامِ به اندازه‌های مختلف — «پایین» و `fixed` علامت می‌خورد، با
 *      لایه‌هایی که کم است (`missing`).
 * `kind`: «ref»، «static»، «dynamic» یا «unknown» (واحدِ ناشناخته، همان نرخ فایل).
 * null یعنی راهی برای تبدیل نیست؛ آن ردیف در جمع مقدار نمی‌آید و هشدار می‌گیرد.
 */
export function rateFor(hd, item, unit, override) {
  const u = nameOf(unit);
  if (!u || u === hd.ref) return { rate: 1, basis: "واحد مرجع", conf: "قطعی", src: "ref", kind: "ref" };
  const cv = conversionFor(hd, item, u), kind = cv.type;
  const o = override && Number(override[u]);
  if (o > 0) return { rate: o, basis: "تعیین کارشناس", conf: "کارشناس", src: "user", kind };
  const er = item && item[7] && Number(item[7][u]);
  if (er > 0) return { rate: er, basis: "تعیین کارشناس (قلم)", conf: "کارشناس", src: "user", kind };
  if (cv.rate > 0) {
    return kind === "static" ? { rate: cv.rate, basis: `ایستا: ${cv.basis}`, conf: "قطعی", src: "static", kind }
      : { rate: cv.rate, basis: `فرمول ${cv.used + 1}: ${cv.basis}`, conf: "فرمول", src: "formula", kind, expr: cv.formulas[cv.used].expr };
  }
  const f = fileRate(hd, item, u);
  if (!f) return null;
  if (kind !== "dynamic" || f.src === "item") return { ...f, kind };
  return { ...f, conf: "پایین", kind, fixed: true, missing: cv.missing,
    basis: `${f.basis} — یک نرخ برای همهٔ اقلام؛ ${cv.missing.length ? `لایهٔ ${cv.missing.map((x) => `«${x}»`).join(" یا ")} ندارد` : "فرمولی ندارد"}` };
}

/** نرخ به‌علاوهٔ فرمول‌ها برای نمایش در کادرِ «نرمال‌سازی اقلام» */
export function rateView(hd, item, unit, override) {
  const rt = rateFor(hd, item, unit, override), cv = conversionFor(hd, item, nameOf(unit));
  return { ...(rt || { rate: null, basis: "نرخی نیست", conf: "—", src: "none", kind: cv.type }),
    kind: cv.type, formulas: cv.formulas, used: cv.used, missing: cv.missing, ...(cv.type === "static" ? { staticRate: cv.rate, staticBasis: cv.basis } : {}) };
}

/* ------------------------------------------------------------------ */
/* لایه‌های ویژگی                                                       */
/* ------------------------------------------------------------------ */
/* مقدار لایه برای مقایسه: «10*20»، «10×20» و «10 x 20» یکی‌اند */
export const valueKey = (v) => keyOf(v).replace(/\s/g, "").replace(/[×*]/g, "x");

/**
 * «عین قلم»: همان لایه‌ها با همان مقدارها — نه بیشتر، نه کمتر. مقدار کمّی با عدد و واحد
 * سنجیده می‌شود («۲ میلی‌متر» = «0.2 سانتی‌متر» = «2mm»)، جنس با نام استاندارد؛ قاعده در
 * catalog-rules.mjs:layerKey است و متنِ کهنه و مقدارِ استاندارد را یکسان می‌خواند.
 */
export const layersEqual = RULES.layersEqual;
