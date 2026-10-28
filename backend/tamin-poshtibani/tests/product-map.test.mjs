/* ============================================================
   نقشهٔ محصول با کد می‌خواند (product-map/، scripts/map/)
   • هر فایلِ worker و پنل‌ها یک صاحب دارد و هر مسیرِ سرور به یک قابلیت داده شده
   • هر فراخوانِ api() در پنل‌ها به مسیری در سرور می‌رسد (جز موارد KNOWN_UNMATCHED با دلیل)
   • هر قابلیتِ رابط جایی در درختِ پنل‌ها (PANELS) دارد و کلیدِ هر تب در کدِ همان صفحه هست
   • هر دکمهٔ بات (callback_data) پاسخ‌گو دارد
   • product-map/generated تازه است — اگر این تست شکست، node scripts/map/build.mjs را بزنید
     و اگر مسیر/فایل تازه است، اول در product-map/taxonomy.mjs صاحبش را بنویسید
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { check } from "../../../scripts/map/model.mjs";

const { errors, stale, model } = await check();

test("نقشه: هر فایل و هر مسیر صاحب دارد و هر فراخوانِ پنل به مسیری می‌رسد", () => {
  assert.deepEqual(errors, [], `\n${errors.join("\n")}\n`);
});

test("نقشه: product-map/generated با کد می‌خواند (node scripts/map/build.mjs)", () => {
  assert.deepEqual(stale, [], `کهنه: ${stale.join("، ")} — node scripts/map/build.mjs`);
});

test("نقشه: پوشش — قابلیت‌های رابط همان موضوع‌های راهنما و مسیرها کامل", () => {
  assert.ok(model.routes.length > 300, `فقط ${model.routes.length} مسیر پیدا شد — اسکنر خراب است؟`);
  assert.ok(model.calls.length > 300, `فقط ${model.calls.length} فراخوان پیدا شد — اسکنر خراب است؟`);
  for (const id of Object.keys(model.facts.help.topics)) assert.ok(model.feats.has(id), `موضوع راهنمای ${id} قابلیت ندارد`);
});

test("نقشه: پوشش — هشت صفحه در درختِ پنل‌ها، دکمه‌ها و دستورهای بات، Cron و کننده‌ی هر گامِ جریان کار", () => {
  const pages = model.pages.map((p) => p.file).sort(), placed = model.panels.map((p) => p.page).filter(Boolean).sort();
  assert.deepEqual(placed, pages, "هر صفحهٔ html یک پنل در PANELS دارد");
  assert.ok(model.bot.buttons.length > 100 && model.bot.commands.length >= 8, `دکمه ${model.bot.buttons.length}، دستور ${model.bot.commands.length} — اسکنرِ بات خراب است؟`);
  assert.ok(model.cron.some((c) => c.entry === "worker.js#scheduled" && c.runs.length > 5), "ورودیِ Cron (worker.js › scheduled) دیده نشد");
  for (const w of model.workflows) for (const s of w.steps) assert.ok(s.who, `${w.id}: گامِ «${s.t}» کننده (who) ندارد`);
});
