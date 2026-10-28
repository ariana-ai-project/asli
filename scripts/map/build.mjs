/* ============================================================
   بازسازی نقشهٔ محصول: node scripts/map/build.mjs
   product-map/generated را از کد + product-map/taxonomy.mjs دوباره می‌نویسد (فقط ساختار؛ قطعی و بی شبکه)
   و خطاهای ساختاری (فایل یا مسیرِ بی‌صاحب، فراخوانِ بی‌مسیر، ...) را نشان می‌دهد.
   ============================================================ */
import { mkdirSync, writeFileSync, readdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { ROOT } from "./scan.mjs";
import { check, OUT } from "./model.mjs";

const { out, errors, warnings, model } = await check();
for (const sub of ["features", "workflows"]) {
  const dir = join(ROOT, OUT, sub);
  if (existsSync(dir)) for (const n of readdirSync(dir)) if (!out[`${OUT}/${sub}/${n}`]) rmSync(join(dir, n));
}
for (const [p, c] of Object.entries(out)) { mkdirSync(dirname(join(ROOT, p)), { recursive: true }); writeFileSync(join(ROOT, p), c, "utf8"); }
console.log(`نقشه بازسازی شد: ${model.feats.size} قابلیت، ${model.files.length} فایل، ${new Set(model.routes.map((r) => r.key)).size} مسیر، ${model.calls.length} فراخوان، ${model.tests.length} تست → ${OUT}`);
if (warnings.length) console.log(`هشدار (${warnings.length}):\n` + warnings.map((w) => `  - ${w}`).join("\n"));
if (errors.length) { console.log(`خطا (${errors.length}):\n` + errors.map((e) => `  ✗ ${e}`).join("\n")); process.exitCode = 1; }
