/* ============================================================
   تست بخش‌های قطعیِ استخراج پیش‌فاکتور — worker/extract.js

   چرا تبدیل واحد پول در کد است و نه در مدل: ضرب در ۱۰ یک کار قطعی است و
   سپردنش به تشخیص مدل یعنی ریسک خطای ده‌برابری در جدول کمیسیون.

   خودِ خواندنِ سند تست خودکار ندارد و نمی‌تواند داشته باشد؛ سنجشش با
   مجموعهٔ ارزیابی روی سندهای واقعی است (AI-07).
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { toRial, REFUSAL_FA, MODEL, PROMPT_VERSION, SCHEMA } from "../../../worker/extract.js";

test("تومان به ریال ضرب در ۱۰ می‌شود", () => {
  assert.equal(toRial(450000, "تومان"), 4500000);
  assert.equal(toRial(5605961, "تومان"), 56059610);
});

test("ریال دست‌نخورده می‌ماند", () => {
  assert.equal(toRial(5605961, "ریال"), 5605961);
});

test("واحد پول نامعلوم یعنی هیچ تبدیلی — کارشناس باید صریح انتخاب کند", () => {
  assert.equal(toRial(1000, null), 1000);
  assert.equal(toRial(1000, undefined), 1000);
});

test("مقدار خالی تبدیل نمی‌شود", () => {
  assert.equal(toRial(null, "تومان"), null);
  assert.equal(toRial(undefined, "ریال"), null);
});

test("هر دلیل خودداری یک متن فارسی برای نمایش دارد", () => {
  for (const k of ["handwritten", "low_quality_scan", "unclear_structure", "not_a_proforma", "password_protected", "empty"]) {
    assert.ok(REFUSAL_FA[k] && REFUSAL_FA[k].length > 3, `دلیل «${k}» متن فارسی ندارد`);
  }
});

test("مدل و نسخهٔ دستور ثبت می‌شوند (INV-15)", () => {
  assert.match(MODEL, /sonnet-5/);
  assert.match(PROMPT_VERSION, /^pf-extract\//);
});

test("قرارداد خروجی: خودداری و واحد پول و تطبیق قلم اجباری‌اند", () => {
  const p = SCHEMA.properties;
  assert.deepEqual(SCHEMA.required, ["extractable", "lines"], "بدون این دو، خروجی بی‌معنی است");
  assert.deepEqual(p.currency.enum, ["ریال", "تومان", null], "واحد پول باید محدود باشد تا مدل چیز تازه نسازد");
  assert.ok(p.reason.enum.includes("handwritten") && p.reason.enum.includes("low_quality_scan"));
  const line = p.lines.items.properties;
  assert.ok(line.matched_item_id.type.includes("null"), "تطبیق‌نکردن باید مجاز باشد");
  assert.ok(line.unit_price.type.includes("null"), "قیمت ناخوانا باید null بماند نه صفر");
  assert.deepEqual(line.confidence.enum, ["high", "medium", "low"]);
  assert.equal(SCHEMA.additionalProperties, false, "مدل نباید فیلد از خودش اضافه کند");
});
