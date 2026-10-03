/* ============================================================
   جدول تطابق پیش‌فاکتور با بستهٔ تأمین‌کننده — worker/sp-ai.js (مهر ۱۴۰۵)

   خروجیِ مدل (ابزار record_check) ← judge: برای هر لایهٔ قفل‌شده، هر لایهٔ افزوده و هر فیلد اجباری
   ✅ (همان) · ⚠️ (نیامده یا نامطمئن) · ❌ (فرق دارد). resolve: پذیرش‌های کارشناس ← آیا تأیید نهایی
   ممکن است و چه مقدارهایی به تب استعلامات می‌روند — همه از پیش‌فاکتور، هرگز از بستهٔ تأمین‌کننده.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";

import { judge, resolve, acceptable, lineKey, headKey, AI_VERSION } from "../../../worker/sp-ai.js";

const LINES = [
  { id: 1, no: 3, item_id: 11, title: "پیچ آلن M8", qty: 100, unit: "عدد", price: 12500,
    layers_json: JSON.stringify([{ k: "اندازه", v: "M8" }, { k: "جنس", v: "فولاد" }]), extra_json: JSON.stringify([{ k: "برند", v: "البرز" }]) },
  { id: 2, no: 4, item_id: 12, title: "مهره M8", qty: 50, unit: "عدد", price: 3000, layers_json: JSON.stringify([{ k: "مشخصات فنی", v: "گرید 8.8" }]), extra_json: "[]" },
];
const v = (value, sure = true) => ({ value, sure });
const base = (over = {}) => ({
  readable: true, currency: "ریال", vat_included: false,
  delivery: v("۱۰ روز کاری"), pay: { value: "نقدی", text: "نقد هنگام تحویل", sure: true }, invoice: v(null), vat: v("دارد"),
  valid_days: v(7), ship: v(null), place: { value: "محل پروژه", sure: true },
  lines: [
    { line_id: 1, found: true, qty: v(100), unit: { value: "عدد", same: true, sure: true }, unit_price: v(12500),
      layers: [{ name: "اندازه", status: "explicit", seen: "M8", sure: true }, { name: "جنس", status: "explicit", sure: true }, { name: "برند", status: "explicit", seen: "البرز", sure: true }] },
    { line_id: 2, found: true, qty: v(50), unit: { value: "عدد", same: true, sure: true }, unit_price: v(3000),
      layers: [{ name: "مشخصات فنی", status: "explicit", seen: "گرید 8.8", sure: true }] },
  ],
  ...over,
});
const row = (ai, lineId, key) => (lineId ? ai.lines.find((l) => l.line_id === lineId).rows : ai.header).find((r) => r.key === key);

test("همه‌چیز همان: همهٔ ردیف‌ها ✅ و آمادهٔ تأیید نهایی؛ مقدارها از پیش‌فاکتور", () => {
  const ai = judge(LINES, base(), { cost_usd: 0.01 });
  assert.equal(ai.v, AI_VERSION);
  assert.equal(ai.ok, true);
  for (const ln of ai.lines) for (const r of ln.rows) assert.equal(r.status, "ok", `${ln.title}: ${r.label}`);
  assert.deepEqual(ai.lines[0].rows.map((r) => r.key), ["L:اندازه", "L:جنس", "X:برند", "qty", "unit", "price"], "هر لایه و هر فیلد اجباری یک ردیف");
  assert.equal(row(ai, 1, "X:برند").gate, false, "لایهٔ افزوده اطلاعاتی است، نه دروازه");
  const r = resolve(ai, {});
  assert.equal(r.ready, true, r.problems.join(" | "));
  assert.deepEqual(r.lines[0].values, { spec: [{ k: "اندازه", v: "M8" }, { k: "جنس", v: "فولاد" }, { k: "برند", v: "البرز" }], qty: 100, unit: "عدد", price: 12500 });
  assert.equal(r.terms.dtime, "10 روز کاری", "زمان تحویل با رقم لاتین");
  assert.equal(r.terms.pay, "نقدی");
  assert.equal(r.terms.invoice, "رسمی", "سکوتِ سند دربارهٔ نوع فاکتور یعنی رسمی (قاعدهٔ شرکت)");
  assert.equal(row(ai, null, "invoice").def, true);
  assert.equal(r.terms.vat, "دارد");
  assert.equal(r.terms.valid_days, 7);
  assert.equal(r.terms.place, "محل پروژه");
});

test("قیمت به ریال و بی ارزش افزوده: تومان ×۱۰، ارزش افزودهٔ داخل قیمت کم می‌شود؛ فقط مبلغ کل ← تقسیم بر مقدار", () => {
  const t = judge(LINES, base({ currency: "تومان", lines: base().lines.map((l) => ({ ...l, unit_price: v(l.line_id === 1 ? 1250 : 300) })) }));
  assert.equal(row(t, 1, "price").got, 12500);
  assert.equal(row(t, 1, "price").status, "ok");
  const vat = judge(LINES, base({ vat_included: true, vat_rate: 10, lines: base().lines.map((l) => ({ ...l, unit_price: v(l.line_id === 1 ? 13750 : 3300) })) }));
  assert.equal(row(vat, 1, "price").got, 12500);
  assert.equal(row(vat, 2, "price").status, "ok");
  const total = judge(LINES, base({ lines: base().lines.map((l) => ({ ...l, unit_price: v(null), total_price: l.line_id === 1 ? 1250000 : 150000 })) }));
  assert.equal(row(total, 1, "price").got, 12500);
  assert.equal(row(total, 1, "price").status, "ok");
});

test("مغایرت ❌، نیامده ⚠️، نامطمئن ⚠️ — و مقدارِ دقیق: ۹۹ با ۱۰۰ یکی نیست", () => {
  const b = base();
  b.lines[0].qty = v(99);
  b.lines[0].unit = { value: "کیلوگرم", same: false, sure: true };
  b.lines[0].layers = [{ name: "اندازه", status: "different", seen: "M10", sure: true }, { name: "جنس", status: "missing", sure: true }];
  b.lines[1].unit_price = v(3200, false);
  b.vat = v(null, false);
  const ai = judge(LINES, b);
  assert.equal(ai.ok, false);
  assert.equal(row(ai, 1, "qty").status, "bad");
  assert.equal(row(ai, 1, "unit").status, "bad");
  assert.deepEqual([row(ai, 1, "L:اندازه").status, row(ai, 1, "L:اندازه").got], ["bad", "M10"]);
  assert.deepEqual([row(ai, 1, "L:جنس").status, row(ai, 1, "L:جنس").got], ["warn", null]);
  assert.equal(row(ai, 1, "X:برند").status, "warn", "لایهٔ افزوده‌ای که در سند نیامده");
  assert.equal(row(ai, 2, "price").status, "warn", "مدل مطمئن نبود");
  assert.equal(row(ai, null, "vat").status, "warn");
  const r = resolve(ai, {});
  assert.equal(r.ready, false);
  assert.ok(r.problems.some((p) => /«پیچ آلن M8» \(کد ۳\): «اندازه» با پیش‌فاکتور فرق دارد/.test(p)), "مانع با نام و کدِ قلم");
  assert.ok(r.problems.some((p) => /«جنس» در پیش‌فاکتور نیامده/.test(p)));
  assert.ok(r.problems.some((p) => /«ارزش افزوده» در پیش‌فاکتور نیامده/.test(p)));
  assert.ok(!r.problems.some((p) => /برند/.test(p)), "ردیفِ اطلاعاتی مانع نیست");
});

test("پذیرش: فقط آنچه سند دارد؛ پیش‌فاکتور ملاک می‌شود — برعکسش ممکن نیست", () => {
  const b = base();
  b.lines[0].layers[0] = { name: "اندازه", status: "different", seen: "M10", sure: true };
  b.lines[1].unit_price = v(3200);
  b.vat = v(null);
  b.delivery = v("تحویل فوری");
  const ai = judge(LINES, b);
  const size = row(ai, 1, "L:اندازه"), price2 = row(ai, 2, "price"), vat = row(ai, null, "vat"), dl = row(ai, null, "dtime");
  assert.equal(acceptable(size), true);
  assert.equal(acceptable(price2), true);
  assert.equal(acceptable(vat), false, "ارزش افزوده در سند نیامده: چیزی برای پذیرفتن نیست");
  assert.equal(acceptable(dl), false, "زمان تحویلِ بی‌قالب به جدول کمیسیون نمی‌رود");
  assert.equal(dl.note, "قالبِ تاریخ شمسی یا شمار روز نیست");
  assert.equal(acceptable(row(ai, 1, "qty")), false, "ردیف ✅ پذیرفتن نمی‌خواهد");
  const acc = { [lineKey(1, size)]: true, [lineKey(2, price2)]: true, [headKey(vat)]: true };
  const r = resolve(ai, acc);
  assert.equal(r.ready, false, "ارزش افزوده و زمان تحویل هنوز مانع‌اند");
  assert.deepEqual(r.problems.sort(), ["«ارزش افزوده» در پیش‌فاکتور نیامده یا مطمئن نیست", "«زمان تحویل» در پیش‌فاکتور «تحویل فوری» آمده — قالبِ تاریخ شمسی یا شمار روز نیست"].sort());
  assert.deepEqual(r.lines[0].values.spec[0], { k: "اندازه", v: "M10" }, "پذیرفته: مقدارِ سند، نه قفلِ کارشناس");
  assert.equal(r.lines[1].values.price, 3200, "قیمتِ سند");
  const ok = resolve(judge(LINES, { ...b, vat: v("دارد"), delivery: v("1405/08/01") }), acc);
  assert.equal(ok.ready, true, ok.problems.join(" | "));
  assert.equal(ok.terms.dtime, "1405/08/01");
});

test("سندِ ناخوانا، قلمِ پیدانشده، و بی بررسی", () => {
  assert.deepEqual(resolve(null, {}).problems, ["بررسی هوشمند پیش‌فاکتور هنوز انجام نشده است"]);
  const bad = judge(LINES, { readable: false, reason: "عکس تار است", lines: [] });
  assert.equal(bad.ok, false);
  assert.match(resolve(bad, {}).problems[0], /خوانا نبود \(عکس تار است\)/);
  const miss = judge(LINES, base({ lines: [base().lines[0]] }));
  assert.equal(miss.lines[1].found, false);
  assert.ok(miss.lines[1].rows.every((r) => r.status === "warn"));
  assert.ok(resolve(miss, {}).problems.includes("«مهره M8» (کد ۴) در پیش‌فاکتور پیدا نشد"));
});
