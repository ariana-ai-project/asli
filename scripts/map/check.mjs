/* ============================================================
   بررسی نقشهٔ محصول: node scripts/map/check.mjs
   خطا اگر: فایل یا مسیرِ بی‌صاحب، فراخوانِ پنل که به هیچ مسیری نمی‌رسد، کلید راهنمای ناشناخته،
   یا product-map/generated با کد نخواند (یعنی بعد از تغییرِ ساختاری build.mjs اجرا نشده).
   همین را تستِ backend/tamin-poshtibani/tests/product-map.test.mjs هم می‌سنجد.
   ============================================================ */
import { check } from "./model.mjs";

const { errors, warnings, stale } = await check();
if (process.argv.includes("--warnings") && warnings.length) console.log(`هشدار (${warnings.length}):\n` + warnings.map((w) => `  - ${w}`).join("\n"));
if (stale.length) errors.push(`خروجی‌های نقشه کهنه‌اند — node scripts/map/build.mjs را بزنید: ${stale.join("، ")}`);
if (errors.length) { console.log(`نقشه با کد نمی‌خواند (${errors.length}):\n` + errors.map((e) => `  ✗ ${e}`).join("\n")); process.exit(1); }
console.log(`نقشه سالم است${warnings.length ? ` (${warnings.length} هشدار؛ با --warnings ببینید)` : ""}.`);
