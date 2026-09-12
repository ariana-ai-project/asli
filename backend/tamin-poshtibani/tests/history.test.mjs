/* ============================================================
   تست سوابق خرید — ریاضیِ گشتاور (worker/history.js) و پارسر فایل مرجع
   (frontend/tamin-poshtibani/history-import.js)

   اجرا:  node --test backend/tamin-poshtibani/tests/

   بخش اول بی‌وابستگی است و همیشه اجرا می‌شود: ضریب گشتاور قلبِ رتبه‌بندی
   تأمین‌کنندگان است و اگر یک روز منفی یا صفر شود، رتبه‌ها بی‌صدا بی‌معنا
   می‌شوند — چیزی که در جدول دیده نمی‌شود.

   بخش دوم فقط وقتی اجرا می‌شود که فایل واقعی سوابق در دسترس باشد
   (متغیر HISTORY_FIXTURE یا همان فایل در پوشهٔ دانلود). فایل مرجع در مخزن
   نیست چون ۱۴ مگابایت است.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";

import { BASE_YM, MAX_DROP, clampK, decayPerMonth, momentWeight } from "../../../worker/history.js";
import { loadTP, fileFrom } from "./run.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

/* ---------------- ریاضیِ گشتاور ---------------- */

test("مبنا اسفند ۱۴۰۴ است", () => {
  assert.equal(BASE_YM, 1404 * 12 + 12);
});

test("ضریب اهمیت به بازهٔ ۱ تا ۱۰ چفت می‌شود", () => {
  assert.equal(clampK(0), 1);
  assert.equal(clampK(-3), 1);
  assert.equal(clampK(99), 10);
  assert.equal(clampK("7"), 7);
  assert.equal(clampK(undefined), 1);
});

test("خرید در مبنا و بعد از آن ضریب ۱ می‌گیرد", () => {
  for (const k of [1, 5, 10]) {
    assert.equal(momentWeight(BASE_YM, k, 84), 1);
    /* فایل تا شهریور ۱۴۰۵ داده دارد — جلوتر از مبنا نباید ضریبِ بیشتر از ۱ بسازد */
    assert.equal(momentWeight(BASE_YM + 6, k, 84), 1);
  }
});

test("ضریب با فاصله یکنواخت کم می‌شود و هیچ‌وقت صفر یا منفی نمی‌شود", () => {
  const ageMax = 96;
  for (const k of [1, 3, 5, 8, 10]) {
    let prev = Infinity;
    for (let age = 0; age <= ageMax + 24; age++) {
      const w = momentWeight(BASE_YM - age, k, ageMax);
      assert.ok(w > 0, `ضریب برای فاصلهٔ ${age} ماه با اهمیت ${k} مثبت نیست`);
      assert.ok(w <= 1);
      assert.ok(w <= prev, "ضریب باید نزولی باشد");
      prev = w;
    }
    /* قدیمی‌ترین خریدِ موجود دقیقاً ۱−MAX_DROP×(k/۱۰) می‌ماند */
    assert.ok(Math.abs(momentWeight(BASE_YM - ageMax, k, ageMax) - (1 - MAX_DROP * k / 10)) < 1e-12);
  }
});

test("اهمیت بیشتر یعنی شیب تندتر", () => {
  const ageMax = 84, age = 40;
  const w1 = momentWeight(BASE_YM - age, 1, ageMax);
  const w10 = momentWeight(BASE_YM - age, 10, ageMax);
  assert.ok(w10 < w1);
  assert.ok(decayPerMonth(10, ageMax) > decayPerMonth(1, ageMax));
  /* با اهمیت ۱۰ بدترین حالت ۵٪ است — همان چیزی که پانویس جدول ادعا می‌کند */
  assert.ok(Math.abs(momentWeight(BASE_YM - ageMax, 10, ageMax) - 0.05) < 1e-12);
});

test("بازهٔ کوتاه هم شیب را نمی‌شکند", () => {
  /* اگر فایلی فقط یک ماه داده داشته باشد، ageMax=۱ می‌شود و تقسیم بر صفر نباید رخ دهد */
  assert.ok(Number.isFinite(decayPerMonth(10, 0)));
  assert.ok(momentWeight(BASE_YM - 1, 10, 1) > 0);
});

/* ---------------- پارسر فایل مرجع ---------------- */

const CANDIDATES = [
  process.env.HISTORY_FIXTURE,
  resolve(HERE, "../fixtures/history-sample.xlsx"),
  "D:/Poshtibani/6 Historical Data/New folder/Savabegh.xlsx",
  resolve(homedir(), "Downloads/Aghlam Results_1.xlsx"),
].filter(Boolean);
const FIXTURE = CANDIDATES.find((p) => existsSync(p));

test("پارسر سوابق: فایل مرجع", { skip: FIXTURE ? false : "فایل سوابق در دسترس نیست (HISTORY_FIXTURE را ست کنید)" }, async () => {
  const sandbox = loadTP();
  const parsed = await sandbox.TP.importHistory(fileFrom(sandbox, FIXTURE));
  const st = parsed.stats;

  assert.ok(st.rows > 1000, `فقط ${st.rows} ردیف خوانده شد`);
  assert.ok(st.suppliers > 1 && st.codes > 1);
  assert.equal(parsed.rows.length, st.rows);

  /* کاربرگ درست انتخاب شده باشد، نه درخت طبقه‌بندی یا جدول شاخص‌ها */
  assert.ok(parsed.rows.every((r) => r.date && r.title && r.supplier));

  /* ym باید با تاریخ سطر بخواند — بدون این، فاصلهٔ ماهانه و کل رتبه‌بندی غلط می‌شود */
  for (const r of parsed.rows.slice(0, 500)) {
    const [, y, m] = /^(\d{4})\/(\d{1,2})/.exec(r.date);
    assert.equal(Math.floor((r.ym - 1) / 12), +y);
    assert.equal(r.ym - +y * 12, +m);
  }
  assert.ok(st.ymMin < st.ymMax);
  assert.ok(st.ymMin >= 1300 * 12 && st.ymMax <= 1450 * 12);

  /* ستون‌های فرمولیِ فایل مقدارِ ذخیره‌شده ندارند و باید بازساخته شوند */
  const withIdx = parsed.rows.filter((r) => r.idx != null && r.amount != null);
  assert.ok(withIdx.length > st.rows * 0.5, "بیشتر ردیف‌ها باید شاخص تعدیل داشته باشند");
  for (const r of withIdx.slice(0, 500)) {
    assert.ok(Math.abs(r.amount1404 - r.idx * r.amount / 100) < 1e-6, "قیمت کل ۱۴۰۴ با فرمول فایل نمی‌خواند");
    if (r.qty) assert.ok(Math.abs(r.unit1404 - r.amount1404 / r.qty) < 1e-6);
  }

  /* «قیمت واحد» و «فی» یک ستون‌اند با دو نام در دو نسخهٔ فایل مرجع؛ هرکدام که
     باشد باید خوانده شود، وگرنه ستون قیمت در ریز خریدها خالی می‌ماند. */
  assert.ok(parsed.rows.filter((r) => r.unitPrice != null).length > st.rows * 0.5, "قیمت واحد خوانده نشد");

  /* دسته‌بندی برای ارسال، هیچ ردیفی را جا نیندازد یا دوبار نفرستد */
  const chunks = sandbox.TP.chunkHistory(parsed.rows);
  assert.equal(chunks.reduce((n, c) => n + c.length, 0), st.rows);
  assert.ok(chunks.every((c) => c.length <= 800));
});

test("پارسر سوابق: فایل بی‌ربط رد می‌شود", { skip: FIXTURE ? false : "فایل سوابق در دسترس نیست" }, async () => {
  const sandbox = loadTP();
  const fake = { name: "x.xlsx", size: 10, async arrayBuffer() { return new ArrayBuffer(10); } };
  await assert.rejects(() => sandbox.TP.importHistory(fake));
});
