/* ============================================================
   ورود اولِ چهار فایل مرجع (اقلام · شاخص تعدیل · نرخ تبدیل · سوابق خرید) با wrangler

   همان کاری که تب «سوابق تأمین» پنل مدیر می‌کند، ولی به‌جای ارسال دسته‌دسته از
   مرورگر، یک فایل SQL می‌سازد که یک‌جا اجرا می‌شود:

     node scripts/import-catalog.mjs <پوشهٔ چهار فایل> <خروجی.sql> [--only=catalog]
     npx wrangler d1 execute tamin-poshtibani --remote --file=<خروجی.sql>

   برای توسعهٔ محلی به‌جای --remote بنویسید: --local -c wrangler.dev.toml

   --only=catalog: فقط جدول‌های فهرست اقلام (≈۲٫۶ هزار نوشتن) — برای وقتی قواعد یکسان‌سازی
   (catalog-rules.mjs، catalog-head-rules.mjs) عوض شده و ردیف‌های خرید همان‌اند. جدول‌ها
   اول در «__new» پر و در پایان جابه‌جا می‌شوند، و اثرانگشتِ فهرست در بارگذاریِ فعال
   به‌روز می‌شود تا ورود بعدیِ همان فایل‌ها از پنل چیزی را دوباره ننویسد.

   چرا جدا از پنل: بار اول ۷۵ هزار ردیف است و از مرورگر چند دقیقه ارسال می‌خواهد.
   منطق اما یکی است: سازندهٔ ردیف‌ها همان frontend/tamin-poshtibani/catalog-import.js
   است (عیناً در vm اجرا می‌شود)، قواعد همان دو ماژول catalog-rules.mjs و
   catalog-head-rules.mjs، و ستون‌ها و DDL همان worker/catalog.js. هیچ منطقِ دومی این‌جا
   نیست که بتواند واگرا شود.

   فایل‌ها هیچ‌وقت در مخزن نمی‌آیند (مخزن عمومی است) و خروجی SQL هم نباید بیاید.
   ============================================================ */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve, join } from "node:path";
import vm from "node:vm";
import { TABLES, CATALOG_DDL, GROUPS } from "../worker/catalog.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONT = resolve(HERE, "../frontend/tamin-poshtibani");
const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith("--only=")) || "").slice(7) || null;
const [dir, out] = args.filter((a) => !a.startsWith("--"));
if (!dir || !out || (only && only !== "catalog")) { console.error("کاربرد: node scripts/import-catalog.mjs <پوشهٔ چهار فایل> <خروجی.sql> [--only=catalog]"); process.exit(2); }

/* همان محیط شبه‌مرورگری که تست‌ها می‌سازند (tests/run.mjs)، با همان قواعدی که صفحه با
   <script type="module"> روی TP.rules می‌گذارد */
const sb = { console, setTimeout, clearTimeout, TextDecoder, TextEncoder, Date, Math, JSON };
sb.window = sb; sb.self = sb; sb.globalThis = sb;
vm.createContext(sb);
for (const f of ["vendor/xlsx.full.min.js", "shared.js", "catalog-import.js"]) vm.runInContext(readFileSync(resolve(FRONT, f), "utf8"), sb, { filename: f });
const rules = await import(pathToFileURL(resolve(FRONT, "catalog-rules.mjs")).href);
const { HEAD_RULES } = await import(pathToFileURL(resolve(FRONT, "catalog-head-rules.mjs")).href);
sb.TP.rules = { ...rules, HEAD_RULES };

const books = {}, files = {};
for (const f of readdirSync(dir).filter((x) => /\.xlsx$/i.test(x))) {
  process.stdout.write(`خواندن ${f}… `);
  const wb = sb.XLSX.read(readFileSync(join(dir, f)), { type: "buffer", dense: true });
  const kind = sb.TP.catalogKind(wb);
  console.log(kind ? sb.TP.catalogKindFa[kind] : "شناخته نشد — کنار گذاشته شد");
  if (!kind) continue;
  if (books[kind]) { console.error(`دو فایل «${sb.TP.catalogKindFa[kind]}»: ${files[kind]} و ${f}`); process.exit(1); }
  books[kind] = wb; files[kind] = f;
}
const built = sb.TP.buildCatalog(books, (m) => console.log("  " + m));
const data = JSON.parse(JSON.stringify(built));   /* از realm سندباکس بیرون */

/* ---------- SQL ---------- */
const lit = (v) => (v == null ? "NULL" : typeof v === "number" ? (Number.isFinite(v) ? String(v) : "NULL") : `'${String(v).replace(/'/g, "''")}'`);
/* سقف هر دستور D1 صد کیلوبایت است؛ ردیف‌ها تا ۶۰KB در یک INSERT جمع می‌شوند */
const STMT_BYTES = 60000;
const sql = [];
const tables = only ? GROUPS[only] : Object.keys(data.tables);
const target = (t) => (only ? `${t}__new` : t);
if (only) for (const t of tables) sql.push(`DROP TABLE IF EXISTS ${t}__new;`, TABLES[t].ddl.replace(`EXISTS ${t} (`, `EXISTS ${t}__new (`) + ";");
else {
  for (const ddl of CATALOG_DDL) sql.push(ddl + ";");
  sql.push("CREATE TABLE IF NOT EXISTS norm_cache (title_n TEXT PRIMARY KEY, result TEXT NOT NULL, model TEXT, cost_usd REAL, created_at INTEGER NOT NULL) WITHOUT ROWID;");
}
let writes = 0;
for (const t of tables) {
  const rows = data.tables[t], cols = TABLES[t].cols;
  const head = `INSERT OR IGNORE INTO ${target(t)} (${cols.join(",")}) VALUES `;
  let cur = [], size = 0;
  const flush = () => { if (cur.length) sql.push(head + cur.join(",") + ";"); cur = []; size = 0; };
  for (const r of rows) {
    const tuple = `(${r.map(lit).join(",")})`, n = Buffer.byteLength(tuple, "utf8");
    if (n + head.length > 99000) { console.error(`ردیف ${t} از سقف دستور D1 بزرگ‌تر است (${n} بایت)`); process.exit(1); }
    if (cur.length && size + n > STMT_BYTES) flush();
    cur.push(tuple); size += n;
  }
  flush();
  writes += rows.length;
}

/* فهرست اقلام (نام لایه‌ها، خوشه‌ها) و آمار بارگذاری — همان چیزی که catalogFinish می‌نویسد */
const t = Date.now();
const catalogSetting = `INSERT INTO settings (key,value,updated_at) VALUES ('catalog',${lit(JSON.stringify({ ...data.meta, fp: data.fp }))},${t}) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at;`;
if (only) {
  for (const x of tables) sql.push(`DROP TABLE IF EXISTS ${x};`, `ALTER TABLE ${x}__new RENAME TO ${x};`);
  sql.push(catalogSetting);
  sql.push(`UPDATE hist_imports SET stats_json=json_set(stats_json, '$.fp.cat', ${lit(data.fp.cat)}, '$.meta', json(${lit(JSON.stringify(data.meta))}), '$.file', json(${lit(JSON.stringify(data.stats))})) WHERE state='ready';`);
} else {
  const P = data.tables.purchases, C = TABLES.purchases.cols;
  const col = (k) => C.indexOf(k);
  const yms = P.map((r) => r[col("ym")]).filter(Boolean);
  const minYm = Math.min(...yms), maxYm = Math.max(...yms);
  const stats = {
    format: 2, fp: data.fp, plan: { catalog: "replace", grades: "replace", purchases: "replace" },
    files, file: data.stats, meta: data.meta, via: "scripts/import-catalog.mjs",
    rows: P.length, suppliers: new Set(P.map((r) => r[col("supplier_n")])).size, codes: new Set(P.map((r) => r[col("item_code")])).size,
    minYm, maxYm, ageMax: Math.max(1, 1404 * 12 + 12 - minYm), finishedWrites: writes,
  };
  sql.push(catalogSetting);
  sql.push("UPDATE hist_imports SET state='stale' WHERE state IN ('ready','loading');");
  sql.push(`INSERT INTO hist_imports (filename,imported_at,finished_at,row_count,state,stats_json) VALUES (${lit(files.history)},${t},${t},${P.length},'ready',${lit(JSON.stringify(stats))});`);
}

writeFileSync(out, sql.join("\n") + "\n", "utf8");
console.log(`\n${out}: ${sql.length} دستور، ${(Buffer.byteLength(sql.join("\n"), "utf8") / 1048576).toFixed(1)} مگابایت`);
console.log(`نوشتن در D1: ≈ ${writes.toLocaleString("en-US")} ردیف (+ ردیف‌های settings و hist_imports)`);
for (const x of tables) console.log(`  ${x.padEnd(16)} ${String(data.tables[x].length).padStart(6)}`);
console.log("اثرانگشت:", JSON.stringify(data.fp));
console.log("یکسان‌سازی:", JSON.stringify(data.stats.norm));
