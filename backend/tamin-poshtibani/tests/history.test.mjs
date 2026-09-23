/* ============================================================
   تست سوابق خرید — ریاضیِ گشتاور و رتبه (worker/history.js)

   اجرا:  node --test "backend/tamin-poshtibani/tests/*.test.mjs"

   بی‌وابستگی است و همیشه اجرا می‌شود: ضریب گشتاور قلبِ رتبه‌بندی تأمین‌کنندگان
   است و اگر یک روز منفی یا صفر شود، رتبه‌ها بی‌صدا بی‌معنا می‌شوند — چیزی که در
   جدول دیده نمی‌شود. خواندن چهار فایل مرجع و جستجوی «عین قلم / نوع قلم» در
   catalog.test.mjs است.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";

import { BASE_YM, MAX_DROP, clampK, decayPerMonth, momentWeight, rankBy, gradeKey } from "../../../worker/history.js";

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

/* ---------------- رتبهٔ رقابتی ---------------- */

test("عددهای برابر رتبهٔ برابر می‌گیرند — ۴، ۲، ۲، ۱ ← ۱، ۲، ۲، ۴", () => {
  const rows = [{ v: 2 }, { v: 4 }, { v: 1 }, { v: 2 }];
  rankBy(rows, "v", "r");
  assert.deepEqual(rows.map((x) => x.r), [2, 1, 4, 2]);
  const f = [{ v: 0.1 + 0.2 }, { v: 0.3 }, { v: 5 }];
  rankBy(f, "v", "r");
  assert.deepEqual(f.map((x) => x.r), [2, 2, 1], "زبالهٔ اعشار شناور دو عدد برابر را نابرابر نمی‌کند");
});

test("رده معیار دوم است: امتیاز برابر ← A جلوتر از B و C، و بی‌رده آخر", () => {
  const rows = [{ v: 5, grade: "C" }, { v: 5, grade: null }, { v: 5, grade: "A" }, { v: 9, grade: "C" }, { v: 5, grade: "A" }];
  rankBy(rows, "v", "r", gradeKey);
  /* ۹ اول است با هر رده‌ای؛ از چهار «۵»، دو تا A رتبهٔ برابر ۲ دارند، بعد C و بعد بی‌رده */
  assert.deepEqual(rows.map((x) => x.r), [4, 5, 2, 1, 2]);
  /* بی معیار دوم، همان رفتار قبلی: همهٔ «۵»ها رتبهٔ برابر */
  const plain = rows.map(({ v, grade }) => ({ v, grade }));
  rankBy(plain, "v", "r");
  assert.deepEqual(plain.map((x) => x.r), [2, 2, 2, 1, 2]);
  /* ردهٔ ناشناخته مثل بی‌رده است، نه خطا */
  assert.equal(gradeKey({ grade: "D" }), gradeKey({}));
});
