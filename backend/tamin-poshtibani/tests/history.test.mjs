/* ============================================================
   سوابق تأمین — worker/history.js

   قاعدهٔ وزن زمانی از حرفِ مدیر آمده: خریدِ ۱۴۰۴ ضریب یک، هر ماه عقب‌تر خطی
   کمتر، شیب از ضریب ۱..۱۰ کارشناس، و قدیمی‌ترین خرید هیچ‌وقت صفر یا منفی
   نمی‌شود. همان تابع در مرورگر هم هست (TP.recencyWeight) و این‌جا با هم
   مقایسه می‌شوند تا جدول کارشناس با سرور یکی بماند.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { recencyWeight, monthIndex, normDate, nrm, FLOOR, BASE_YM } from "../../../worker/history.js";
import { loadTP } from "./run.mjs";

test("خریدهای ۱۴۰۴ و بعد ضریب یک دارند", () => {
  for (const ym of ["1404/01", "1404/06", "1404/12", "1405/03"]) assert.equal(recencyWeight(ym, "1398/01", 7), 1, ym);
});

test("عقب‌تر یعنی کمتر — خطی و یکنوا", () => {
  const w = (ym) => recencyWeight(ym, "1398/01", 5);
  assert.ok(w("1403/12") < 1);
  assert.ok(w("1403/12") > w("1402/12"));
  assert.ok(w("1402/12") > w("1400/06"));
  assert.ok(w("1400/06") > w("1398/01"));
  /* خطی: تفاوت هر ۱۲ ماه ثابت */
  const d1 = w("1403/12") - w("1402/12"), d2 = w("1402/12") - w("1401/12");
  assert.ok(Math.abs(d1 - d2) < 1e-9, "شیب ثابت");
});

test("قدیمی‌ترین ماه هیچ‌وقت صفر یا منفی نیست؛ با ضریب ۱۰ دقیقاً کف", () => {
  assert.ok(Math.abs(recencyWeight("1398/01", "1398/01", 10) - FLOOR) < 1e-9);
  assert.ok(recencyWeight("1398/01", "1398/01", 10) > 0);
  assert.ok(Math.abs(recencyWeight("1398/01", "1398/01", 1) - (1 - 0.1 * (1 - FLOOR))) < 1e-9, "ضریب ۱: شیب کم");
  /* ضریب بیرون از بازه به بازه برمی‌گردد */
  assert.equal(recencyWeight("1398/01", "1398/01", 99), recencyWeight("1398/01", "1398/01", 10));
  assert.equal(recencyWeight("1398/01", "1398/01", 0), recencyWeight("1398/01", "1398/01", 5), "صفر یعنی پیش‌فرض ۵");
  /* ماهِ قدیمی‌تر از oldestِ اعلام‌شده هم منفی نمی‌شود */
  assert.ok(recencyWeight("1395/01", "1398/01", 10) > 0);
});

test("ضریب بزرگ‌تر = شیب تندتر", () => {
  const ym = "1401/01";
  assert.ok(recencyWeight(ym, "1398/01", 10) < recencyWeight(ym, "1398/01", 5));
  assert.ok(recencyWeight(ym, "1398/01", 5) < recencyWeight(ym, "1398/01", 1));
});

test("شمارهٔ ماه و مبنا", () => {
  assert.equal(monthIndex("1404/01") - monthIndex("1403/12"), 1);
  assert.equal(monthIndex("1404/01") - monthIndex("1398/01"), 72);
  assert.equal(BASE_YM, "1404/01");
  assert.equal(monthIndex("خراب"), null);
});

test("تطابق با پیاده‌سازی مرورگر", () => {
  const s = loadTP();
  assert.equal(typeof s.TP.recencyWeight, "function", "TP.recencyWeight باید در shared.js باشد");
  for (const [ym, oldest, k] of [["1403/06", "1398/01", 3], ["1400/02", "1399/07", 10], ["1398/01", "1398/01", 1], ["1404/05", "1398/01", 7], ["1402/11", "1401/01", 6]]) {
    assert.ok(Math.abs(recencyWeight(ym, oldest, k) - s.TP.recencyWeight(ym, oldest, k)) < 1e-12, `${ym} از ${oldest} با ${k}`);
  }
});

test("تاریخ‌های فایل به یک شکل درمی‌آیند", () => {
  assert.equal(normDate("1404/1/5"), "1404/01/05");
  assert.equal(normDate("۱۴۰۳-۱۲-۲۹"), "1403/12/29");
  assert.equal(normDate("14020815"), "1402/08/15");
  assert.equal(normDate("1404/01/05 10:30"), "1404/01/05");
  assert.equal(normDate("2025-03-25"), null, "میلادی رد می‌شود");
  assert.equal(normDate(""), null);
});

test("نرمال‌سازیِ نام برای کلید تکراری", () => {
  assert.equal(nrm("شرکت  فنی و مهندسي  آريا‌صنعت"), "شرکت فنی و مهندسی آریا صنعت");
});
