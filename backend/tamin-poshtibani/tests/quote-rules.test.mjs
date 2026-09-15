/* ============================================================
   قالب فیلدهای خط استعلام — worker/quote-rules.js
   تصمیم مدیر: قیمت و مقدار عدد (اعشار مجاز)، زمان تحویل تاریخ شمسی یا عدد روز، اعتبار عدد.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { validateQuote, validDtime, normalizeDtime, toNumber } from "../../../worker/quote-rules.js";

test("عدد با هر دستگاه رقم و ممیز", () => {
  assert.equal(toNumber("۱۲۵۰٬۰۰۰٫۵"), 1250000.5);
  assert.equal(toNumber("2,500,000"), 2500000);
  assert.equal(toNumber("12.75"), 12.75);
  assert.equal(toNumber("دو میلیون"), null);
  assert.equal(toNumber("12a"), null);
});

test("زمان تحویل: تاریخ شمسی یا مدت عددی، وگرنه خطا", () => {
  for (const v of ["1405/07/10", "۱۴۰۵/۷/۱", "10", "۱۰ روز", "7 روز کاری", "2 هفته"]) assert.ok(validDtime(v), v);
  for (const v of ["هفتهٔ آینده", "ده روز", "1405-07-10", "1405/13/01", "زود"]) assert.ok(!validDtime(v), v);
  assert.equal(normalizeDtime("۱۰  روز کاری"), "10 روز کاری");
  assert.equal(normalizeDtime("۱۴۰۵/۰۷/۱۰"), "1405/07/10");
});

test("validateQuote فقط فیلدهای داده‌شده را می‌سنجد و نام فیلد را برمی‌گرداند", () => {
  assert.deepEqual(validateQuote({ price: "1200", dtime: "5", valid_days: "15", pay: "نقدی" }), []);
  const bad = validateQuote({ price: "abc", qty: "x", valid_days: "1.5", dtime: "بعداً", invoice: "چیز دیگر" });
  assert.deepEqual(bad.map((b) => b.field), ["price", "qty", "valid_days", "dtime", "invoice"]);
  assert.deepEqual(validateQuote({ price: "" }), [], "خالی سنجیده نمی‌شود — اجباری بودن کار missingRequired است");
});
