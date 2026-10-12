/* ============================================================
   گزارشِ خواندنِ کاملِ جدول‌ها در کلِ تست‌ها (بودجهٔ خواندن D1، مهر ۱۴۰۵)
   هر دستوری که در اجرای تست‌ها جدولی را کامل می‌خواند (SCAN)، یک بار، با فایلِ کد و جدول — برای بازبینیِ دستی پیش از
   تغییرِ بزرگ. نگهبانِ خودکارِ مسیرهای پرتکرار در tests/d1-budget.test.mjs است؛ این همهٔ مسیرها را نشان می‌دهد.

     D1_PLANS_OUT=plans.jsonl node --test backend/tamin-poshtibani/tests/*.test.mjs
     node backend/tamin-poshtibani/tools/d1-plan-report.mjs plans.jsonl

   SCAN روی جدولِ بزرگ در مسیری که مدام اجرا می‌شود (نظرسنجی، Cron، پیام) = نمایه یا شرط با کلید. در مسیرِ دستی و کم‌تکرار
   (گزارش‌های مدیر، بارگذاری روزانه، حذف درخواست) پذیرفتنی است.
   ============================================================ */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const IN = process.argv[2] || "plans.jsonl";
const WORKER = join(dirname(fileURLToPath(import.meta.url)), "../../../worker");
const lines = readFileSync(IN, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
/* جدول‌های کوچک (افراد، تنظیمات، روزهای نرخ دلار) — همان فهرستِ d1-budget.test.mjs */
const SMALL = new Set(["settings", "counters", "experts", "push_subs", "tg_nav", "guild_classes", "price_index", "tender_settings", "vb_chats",
  "sp_phones", "templates", "expert_scores", "axes", "alert_contacts", "ai_rules", "ai_modes", "ai_agents", "weights", "imports", "sqlite_master",
  "projects", "project_weights", "usd_rates"]);
const src = readdirSync(WORKER).filter((f) => f.endsWith(".js")).map((f) => [f, readFileSync(join(WORKER, f), "utf8")]);
const where = (sql) => {
  const head = sql.slice(0, 40);
  for (const [f, t] of src) { const i = t.indexOf(head); if (i >= 0) return `${f}:${t.slice(0, i).split("\n").length}`; }
  return "?";
};
const agg = new Map();
for (const { who, sql, rows } of lines) {
  const alias = new Map(); const re = /\b(?:FROM|JOIN)\s+(\w+)(?:\s+(?:AS\s+)?(\w+))?/gi; let x;
  while ((x = re.exec(sql))) { alias.set(x[1], x[1]); if (x[2] && !/^(WHERE|ON|JOIN|LEFT|INNER|GROUP|ORDER|LIMIT|USING|SET|VALUES|AND|OR)$/i.test(x[2])) alias.set(x[2], x[1]); }
  const ctes = new Set(); const cre = /(?:\bWITH|,)\s+(\w+)\s+AS\s*\(/gi; let y; while ((y = cre.exec(sql))) ctes.add(y[1]);
  for (const d of rows) {
    const m = /^SCAN (\w+)/.exec(d); if (!m || m[1] === "CONSTANT") continue;
    const table = alias.get(m[1]) || m[1]; if (SMALL.has(table) || ctes.has(table) || /^\d+$/.test(table)) continue;
    const k = table + "|" + sql.replace(/\s+/g, " ").trim();
    if (!agg.has(k)) agg.set(k, { table, d, sql: sql.replace(/\s+/g, " ").trim(), who: new Set(), at: where(sql) });
    agg.get(k).who.add(who);
  }
}
const byTable = {};
for (const v of agg.values()) (byTable[v.table] = byTable[v.table] || []).push(v);
for (const [t, vs] of Object.entries(byTable).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n## ${t} (${vs.length})`);
  for (const v of vs) console.log(`  - ${v.at}  [${v.d}]  ${v.sql.slice(0, 150)}`);
}
console.log("\nTOTAL", agg.size);
