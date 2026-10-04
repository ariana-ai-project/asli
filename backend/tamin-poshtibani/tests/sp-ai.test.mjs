/* ============================================================
   جدول تطابق پیش‌فاکتور با بستهٔ تأمین‌کننده — worker/sp-ai.js (مهر ۱۴۰۵)

   خروجیِ مدل (ابزار record_check) ← judge: برای هر لایهٔ قفل‌شده، هر لایهٔ افزوده، هر فیلد اجباری و هر شرطِ
   اعلامی ✅ (همان) · ⚠️ (مطمئن نیست) · ⚪ (مطمئن است که نیامده) · ❌ (مطمئن است که فرق دارد). resolve: تیک‌های
   کارشناس ← آیا تأیید نهایی ممکن است و چه مقدارهایی به تب استعلامات می‌روند — همه از پیش‌فاکتور، هرگز از بستهٔ
   تأمین‌کننده؛ هر ردیفِ غیرسبز تیک‌خوردنی است و اگر سند چیزی نگفته، خالی می‌ماند (gaps).
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";

import { judge, resolve, acceptable, lineKey, headKey, numOf, bundlePrompt, aiUsable, AI_VERSION } from "../../../worker/sp-ai.js";

const LINES = [
  { id: 41, no: 3, item_id: 11, title: "پیچ آلن M8", head: "پیچ", qty: 100, unit: "عدد", price: 12500,
    layers_json: JSON.stringify([{ k: "اندازه", v: "M8" }, { k: "جنس", v: "فولاد" }]), extra_json: JSON.stringify([{ k: "برند", v: "البرز" }]) },
  { id: 42, no: 4, item_id: 12, title: "مهره M8", head: "مهره", qty: 50, unit: "عدد", price: 3000, layers_json: JSON.stringify([{ k: "مشخصات فنی", v: "گرید 8.8" }]), extra_json: "[]" },
];
const TERMS = { dtime: "10 روز کاری", pay: "نقدی", invoice: "رسمی", vat: "دارد", valid_days: 7 };
const v = (value, sure = true, extra = {}) => ({ value, sure, ...extra });
const base = (over = {}) => ({
  readable: true, currency: "ریال", vat_included: false,
  delivery: v("۱۰ روز کاری", true, { same: true }), pay: { value: "نقدی", text: "نقد هنگام تحویل", same: true, sure: true }, invoice: v(null), vat: v("دارد", true, { same: true }),
  valid_days: v(7, true, { same: true }), ship: v(null), place: { value: "محل پروژه", sure: true },
  lines: [
    { key: "L1", found: true, doc_title: "پیچ آلن فولادی M8", qty: v(100), unit: { value: "عدد", same: true, sure: true }, unit_price: v(12500),
      layers: [{ name: "اندازه", status: "explicit", seen: "M8", sure: true }, { name: "جنس", status: "explicit", sure: true }, { name: "برند", status: "explicit", seen: "البرز", sure: true }] },
    { key: "L2", found: true, qty: v(50), unit: { value: "عدد", same: true, sure: true }, unit_price: v(3000),
      layers: [{ name: "مشخصات فنی", status: "explicit", seen: "گرید 8.8", sure: true }] },
  ],
  ...over,
});
const row = (ai, lineId, key) => (lineId ? ai.lines.find((l) => l.line_id === lineId).rows : ai.header).find((r) => r.key === key);

test("ورودیِ مدل: هر قلم با کلیدِ L، نوع قلم، لایه‌های قفل و افزوده و اعلامِ تأمین‌کننده — نه شناسهٔ درونی", () => {
  const p = bundlePrompt(LINES, TERMS);
  assert.match(p, /\[L1\] عنوانِ ثبت‌شده: «پیچ آلن M8»\n {2}نوع قلم: پیچ\n {2}لایه‌های ویژگیِ قفل‌شدهٔ خریدار: اندازه = M8 · جنس = فولاد\n {2}لایه‌های افزودهٔ تأمین‌کننده: برند = البرز/);
  assert.match(p, /\[L2\] عنوانِ ثبت‌شده: «مهره M8»/);
  assert.match(p, /شرایطِ اعلامیِ تأمین‌کننده برای کلِ بسته: زمان تحویل «10 روز کاری» · تسویه «نقدی» · نوع فاکتور «رسمی» · ارزش افزوده «دارد» · اعتبار «7» روز/);
  assert.doesNotMatch(p, /line_id|41|42/, "شناسهٔ درونی به مدل نمی‌رود تا با ردیفِ سند قاطی نشود");
});

test("عدد از هر شکلی: رشته با جداکننده، رقم فارسی، واحد پول، اعشار", () => {
  assert.equal(numOf(1250000), 1250000);
  assert.equal(numOf("1,250,000"), 1250000);
  assert.equal(numOf("۱٬۲۵۰٬۰۰۰ ریال"), 1250000);
  assert.equal(numOf("1.250.000"), 1250000);
  assert.equal(numOf("۱۲٫۵"), 12.5);
  assert.equal(numOf("فی: 3,200 تومان"), 3200);
  assert.equal(numOf(""), null);
  assert.equal(numOf("—"), null);
});

test("همه‌چیز همان: همهٔ ردیف‌ها ✅ و آمادهٔ تأیید نهایی؛ مقدارها از پیش‌فاکتور", () => {
  const ai = judge(LINES, base(), { cost_usd: 0.01 }, TERMS);
  assert.equal(ai.v, AI_VERSION);
  assert.equal(aiUsable(ai), true);
  assert.equal(ai.ok, true);
  for (const ln of ai.lines) for (const r of ln.rows) assert.equal(r.status, "ok", `${ln.title}: ${r.label}`);
  assert.deepEqual(ai.lines[0].rows.map((r) => r.key), ["L:اندازه", "L:جنس", "X:برند", "qty", "unit", "price"], "هر لایه و هر فیلد اجباری یک ردیف");
  assert.equal(ai.lines[0].doc_title, "پیچ آلن فولادی M8", "سطرِ سند کنارِ قلم دیده می‌شود");
  assert.equal(row(ai, 41, "X:برند").gate, false, "لایهٔ افزوده اطلاعاتی است، نه دروازه");
  assert.deepEqual(ai.header.filter((r) => r.gate).map((r) => [r.key, r.status, r.want]), [["dtime", "ok", "10 روز کاری"], ["pay", "ok", "نقدی"], ["invoice", "ok", "رسمی"], ["vat", "ok", "دارد"]], "شرایط با اعلامِ تأمین‌کننده سنجیده می‌شود");
  const r = resolve(ai, {});
  assert.equal(r.ready, true, r.problems.join(" | "));
  assert.deepEqual(r.gaps, []);
  assert.deepEqual(r.lines[0].values, { spec: [{ k: "اندازه", v: "M8" }, { k: "جنس", v: "فولاد" }, { k: "برند", v: "البرز" }], qty: 100, unit: "عدد", price: 12500 });
  assert.equal(r.terms.dtime, "10 روز کاری", "زمان تحویل با رقم لاتین");
  assert.equal(r.terms.invoice, "رسمی", "سکوتِ سند دربارهٔ نوع فاکتور یعنی رسمی (قاعدهٔ شرکت)");
  assert.equal(row(ai, null, "invoice").def, true);
  assert.equal(r.terms.valid_days, "7");
  assert.equal(r.terms.place, "محل پروژه");
});

test("قیمت به ریال و بی ارزش افزوده: تومان ×۱۰، ارزش افزودهٔ داخل قیمت کم می‌شود؛ فقط مبلغ کل ← تقسیم بر مقدار؛ رشته با جداکننده", () => {
  const t = judge(LINES, base({ currency: "تومان", lines: base().lines.map((l, i) => ({ ...l, unit_price: v(i === 0 ? 1250 : 300) })) }), {}, TERMS);
  assert.deepEqual([row(t, 41, "price").got, row(t, 41, "price").status], [12500, "ok"]);
  const vat = judge(LINES, base({ vat_included: true, vat_rate: 10, lines: base().lines.map((l, i) => ({ ...l, unit_price: v(i === 0 ? 13750 : 3300) })) }), {}, TERMS);
  assert.equal(row(vat, 41, "price").got, 12500);
  assert.equal(row(vat, 42, "price").status, "ok");
  const total = judge(LINES, base({ lines: base().lines.map((l, i) => ({ ...l, unit_price: v(null), total_price: v(i === 0 ? 1250000 : 150000) })) }), {}, TERMS);
  assert.deepEqual([row(total, 41, "price").got, row(total, 41, "price").status], [12500, "ok"]);
  assert.match(row(total, 41, "price").note, /مبلغِ کل/);
  /* درسِ مهر ۱۴۰۵: مدل قیمت را رشته با جداکننده داد و Number() آن را NaN می‌کرد */
  const str = judge(LINES, base({ lines: base().lines.map((l, i) => ({ ...l, unit_price: { value: i === 0 ? "12,500" : null, text: i === 0 ? null : "۳٬۰۰۰ ریال", sure: true } })) }), {}, TERMS);
  assert.deepEqual([row(str, 41, "price").got, row(str, 42, "price").got], [12500, 3000], "از value یا از عینِ متن");
});

test("کلیدِ قلم‌ها: L1… ، عددِ خالی، یا بی‌کلید به‌ترتیب — یک کلیدِ اشتباه قیمتِ پیداشده را دور نمی‌ریزد", () => {
  const bare = judge(LINES, base({ lines: base().lines.map((l, i) => ({ ...l, key: String(i + 1) })) }), {}, TERMS);
  assert.equal(bare.ok, true);
  const swapped = judge(LINES, base({ lines: [{ ...base().lines[1], key: "L2" }, { ...base().lines[0], key: "L1" }] }), {}, TERMS);
  assert.equal(row(swapped, 41, "price").got, 12500, "ترتیبِ سند مهم نیست، کلید مهم است");
  const one = judge([LINES[0]], base({ lines: [{ ...base().lines[0], key: "ردیف ۱ سند" }] }), {}, TERMS);
  assert.deepEqual([one.lines[0].found, row(one, 41, "price").got], [true, 12500], "کلیدِ نامفهوم: به قلمِ بی‌جواب می‌رسد");
});

test("✅ ⚠️ ⚪ ❌: مغایرت مطمئن، نیامدهٔ مطمئن، نامطمئن — و مقدارِ دقیق: ۹۹ با ۱۰۰ یکی نیست", () => {
  const b = base();
  b.lines[0].qty = v(99);
  b.lines[0].unit = { value: "کیلوگرم", same: false, sure: true };
  b.lines[0].layers = [{ name: "اندازه", status: "different", seen: "M10", sure: true }, { name: "جنس", status: "missing", sure: true }, { name: "برند", status: "missing", sure: false }];
  b.lines[1].unit_price = v(3200, false);
  b.vat = v(null, true);
  b.pay = { value: "اعتباری", same: false, sure: true };
  const ai = judge(LINES, b, {}, TERMS);
  assert.equal(ai.ok, false);
  assert.equal(row(ai, 41, "qty").status, "bad");
  assert.equal(row(ai, 41, "unit").status, "bad");
  assert.deepEqual([row(ai, 41, "L:اندازه").status, row(ai, 41, "L:اندازه").got], ["bad", "M10"]);
  assert.deepEqual([row(ai, 41, "L:جنس").status, row(ai, 41, "L:جنس").got], ["none", null], "⚪ مطمئن است که نیامده");
  assert.equal(row(ai, 41, "X:برند").status, "warn", "⚠️ مطمئن نیست");
  assert.equal(row(ai, 42, "price").status, "warn", "مدل مطمئن نبود");
  assert.equal(row(ai, null, "vat").status, "none");
  assert.deepEqual([row(ai, null, "pay").status, row(ai, null, "pay").want, row(ai, null, "pay").got], ["bad", "نقدی", "اعتباری"], "شرطِ سند با اعلامِ تأمین‌کننده فرق دارد");
  const r = resolve(ai, {});
  assert.equal(r.ready, false);
  assert.ok(r.problems.some((p) => /«پیچ آلن M8» \(کد ۳\): «اندازه» با پیش‌فاکتور فرق دارد/.test(p)), "مانع با نام و کدِ قلم");
  assert.ok(r.problems.some((p) => /«جنس» در پیش‌فاکتور نیامده/.test(p)));
  assert.ok(r.problems.some((p) => /«ارزش افزوده» در پیش‌فاکتور نیامده/.test(p)));
  assert.ok(r.problems.some((p) => /«قیمت واحد \(ریال، بی ارزش افزوده\)» خوانش مطمئن نیست/.test(p)));
  assert.ok(!r.problems.some((p) => /برند/.test(p)), "ردیفِ اطلاعاتی مانع نیست");
});

test("تیک: هر ردیفِ غیرسبز — پیش‌فاکتور ملاک؛ مقدارِ سند، یا خالی (gaps) — هرگز مقدارِ بستهٔ تأمین‌کننده", () => {
  const b = base();
  b.lines[0].layers[0] = { name: "اندازه", status: "different", seen: "M10", sure: true };
  b.lines[0].layers[1] = { name: "جنس", status: "missing", sure: true };
  b.lines[1].unit_price = v(3200);
  b.vat = v(null, true);
  b.delivery = v("تحویل فوری", true, { same: false });
  const ai = judge(LINES, b, {}, TERMS);
  const size = row(ai, 41, "L:اندازه"), mat = row(ai, 41, "L:جنس"), price2 = row(ai, 42, "price"), vat = row(ai, null, "vat"), dl = row(ai, null, "dtime");
  for (const x of [size, mat, price2, vat, dl]) assert.equal(acceptable(x), true, `${x.label} تیک‌خوردنی است`);
  assert.equal(acceptable(row(ai, 41, "qty")), false, "ردیف ✅ تیک نمی‌خواهد");
  assert.match(dl.note, /قالبِ سند تاریخ شمسی یا شمار روز نیست/);
  assert.equal(dl.val, null, "زمان تحویلِ بی‌قالب به جدول کمیسیون نمی‌رود");
  const all = [lineKey(41, size), lineKey(41, mat), lineKey(42, price2), headKey(vat), headKey(dl)];
  const r = resolve(ai, Object.fromEntries(all.map((k) => [k, true])));
  assert.equal(r.ready, true, r.problems.join(" | "));
  assert.deepEqual(r.lines[0].values.spec, [{ k: "اندازه", v: "M10" }, { k: "برند", v: "البرز" }], "تیک‌خورده: مقدارِ سند؛ «جنس» که سند نگفت از مشخصات حذف می‌شود، نه پر از قفلِ کارشناس");
  assert.equal(r.lines[1].values.price, 3200, "قیمتِ سند");
  assert.equal(r.terms.vat, null);
  assert.equal(r.terms.dtime, null);
  assert.deepEqual(r.gaps, ["«زمان تحویل»", "«ارزش افزوده»"], "اجباری‌هایی که خالی می‌مانند — خط استعلام «ثبت موقت» نمی‌شود");
});

test("قلمِ پیدانشده ⚪، خروجیِ گم‌شده ⚠️، سندِ ناخوانا و بی خوانش", () => {
  assert.deepEqual(resolve(null, {}).problems, ["خوانش هوشمند پیش‌فاکتور هنوز انجام نشده است"]);
  const bad = judge(LINES, { readable: false, reason: "عکس تار است", lines: [] }, {}, TERMS);
  assert.equal(bad.ok, false);
  assert.match(resolve(bad, {}).problems[0], /خوانا نبود \(عکس تار است\)/);
  const gone = judge(LINES, base({ lines: [base().lines[0], { key: "L2", found: false, qty: v(null), unit: v(null), unit_price: v(null), layers: [] }] }), {}, TERMS);
  assert.equal(gone.lines[1].found, false);
  assert.ok(gone.lines[1].rows.every((r) => r.status === "none"), "مدل مطمئن است که این قلم در سند نیست");
  const lost = judge(LINES, base({ lines: [base().lines[0]] }), {}, TERMS);
  assert.ok(lost.lines[1].rows.every((r) => r.status === "warn"), "مدل چیزی دربارهٔ این قلم نگفت: مطمئن نیست");
  assert.ok(resolve(gone, {}).problems.some((p) => /«مهره M8» \(کد ۴\): «قیمت واحد \(ریال، بی ارزش افزوده\)» در پیش‌فاکتور نیامده/.test(p)));
});

test("جدولِ نسخهٔ ۲ هنوز خوانده می‌شود (بسته‌ای که پیش از این نسخه خوانده شد)", () => {
  const old = { v: "sp-check/2.0", readable: true, lines: [{ line_id: 41, no: 3, title: "پیچ", found: true, rows: [{ key: "price", kind: "field", label: "قیمت", want: 1, got: 2, status: "bad", gate: true }] }],
    header: [{ key: "dtime", kind: "terms", label: "زمان تحویل", want: null, got: "10", status: "ok", gate: true }] };
  assert.equal(aiUsable(old), true);
  const r = resolve(old, { "41|price": true });
  assert.equal(r.ready, true);
  assert.equal(r.lines[0].values.price, 2);
  assert.equal(r.terms.dtime, "10");
});
