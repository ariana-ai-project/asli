/* ============================================================
   پر کردنِ یک‌بارهٔ بایگانیِ درخواست‌ها (req_hist) برای گزارش سه‌ماهه، با wrangler

     node scripts/import-req-hist.mjs <خروجی کامل «اقلام درخواست» راهکاران.xlsx> <خروجی.sql>
     npx wrangler d1 execute tamin-poshtibani --remote --file=<خروجی.sql>

   برای توسعهٔ محلی به‌جای --remote بنویسید: --local -c wrangler.dev.toml

   چرا: ورود روزانه فقط درخواستِ باز را روی میز می‌گذارد، پس گزارش سه‌ماهه برای هر دورهٔ گذشته صفر بود
   (ممیزی مهر ۱۴۰۵). از این پس خودِ ورود روزانه بایگانی را به‌روز می‌کند و فقط ردیفِ تغییرکرده را می‌نویسد؛
   این اسکریپت فقط بار اول است — ۲۰ هزار درخواستِ هفت سال که از مرورگر چند ده فراخوانی می‌خواست.
   منطق یکی است: خلاصه‌ها را همان TP.requestSummaries از frontend/tamin-poshtibani/import.js می‌سازد (عیناً در vm)
   و ستون‌ها و DDL همان worker/reports.js است؛ پس اثرانگشت‌ها با ورود بعدیِ پنل یکی‌اند و چیزی دوباره نوشته نمی‌شود.
   ردیفی که از قبل در بایگانی هست جایگزین می‌شود (INSERT OR REPLACE).

   فایل‌ها هیچ‌وقت در مخزن نمی‌آیند (مخزن عمومی است) و خروجی SQL هم نباید بیاید.
   ============================================================ */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, basename } from "node:path";
import vm from "node:vm";
import { REQ_HIST_COLS, REQ_HIST_DDL, reqHistValues } from "../worker/reports.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONT = resolve(HERE, "../frontend/tamin-poshtibani");
const [file, out] = process.argv.slice(2);
if (!file || !out) { console.error("کاربرد: node scripts/import-req-hist.mjs <خروجی اقلام درخواست.xlsx> <خروجی.sql>"); process.exit(2); }

/* همان محیط شبه‌مرورگری که تست‌ها می‌سازند (tests/run.mjs) */
const sb = { console, setTimeout, clearTimeout, TextDecoder, TextEncoder, Date, Math, JSON };
sb.window = sb; sb.self = sb; sb.globalThis = sb;
vm.createContext(sb);
for (const f of ["vendor/xlsx.full.min.js", "shared.js", "import.js"]) vm.runInContext(readFileSync(resolve(FRONT, f), "utf8"), sb, { filename: f });

/* بافر باید در realm سندباکس ساخته شود، وگرنه SheetJS آن را zip نمی‌شناسد (tests/run.mjs:fileFrom) */
const buf = readFileSync(file);
const inner = vm.runInContext(`new Uint8Array(${buf.length})`, sb); inner.set(buf);
const parsed = await sb.TP.importExcel({ name: basename(file), size: buf.length, arrayBuffer: async () => inner.buffer }, (m) => console.log("  " + m));
const rows = JSON.parse(JSON.stringify(sb.TP.requestSummaries(parsed)));   /* از realm سندباکس بیرون */
const st = parsed.stats;
console.log(`${rows.length} درخواست (${st.itemRows} سطر قلم) · ${st.dateMin} تا ${st.dateMax}`);

const lit = (v) => (v == null ? "NULL" : typeof v === "number" ? (Number.isFinite(v) ? String(v) : "NULL") : `'${String(v).replace(/'/g, "''")}'`);
/* سقف هر دستور D1 صد کیلوبایت است؛ ردیف‌ها تا ۶۰KB در یک INSERT جمع می‌شوند */
const STMT_BYTES = 60000, t = Date.now();
const head = `INSERT OR REPLACE INTO req_hist (${[...REQ_HIST_COLS, "updated_at"].join(",")}) VALUES `;
const sql = [REQ_HIST_DDL + ";"];
let cur = [], size = 0;
const flush = () => { if (cur.length) sql.push(head + cur.join(",") + ";"); cur = []; size = 0; };
for (const r of rows) {
  const tuple = `(${[...reqHistValues(r), t].map(lit).join(",")})`, n = Buffer.byteLength(tuple, "utf8");
  if (cur.length && size + n > STMT_BYTES) flush();
  cur.push(tuple); size += n;
}
flush();
writeFileSync(out, sql.join("\n") + "\n", "utf8");
console.log(`${out}: ${sql.length - 1} دستور، ${rows.length} ردیف نوشتن (سقف روزانهٔ D1 رایگان ۱۰۰ هزار)`);
