/* ============================================================
   تست تلفیق دو خوانش — worker/extract.js

   اعداد این تست ساختگی نیستند: خروجی دو خوانش واقعی مدل از یک پیش‌فاکتور
   اسکن‌شدهٔ واقعی (شرکت صنعتی آما، ۶ قلم) است، در کنار مقادیر درستی که
   با بزرگ‌نمایی روی خود تصویر خوانده شد.

   یافتهٔ کلیدی که این محافظ از آن آمده:
   مدل ۲ از ۶ قیمت را اشتباه خواند و در هر دو مورد «اطمینان بالا» اعلام کرد —
   یعنی confidence خودِ مدل برای عدد قابل اتکا نیست. ولی هر قیمتی که دو خوانش
   مستقل روی آن توافق داشتند درست بود، و همهٔ خطاها در جاهایی افتاد که دو
   خوانش اختلاف داشتند.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { reconcile, toRial } from "../../../worker/extract.js";

/* قیمت‌های واقعی روی سند، که با بزرگ‌نمایی خوانده شدند */
const TRUTH = [7950583, 2755655, 8757847, 5605961, 5605961, 5927568];
/* خوانش اول: تصویر کامل */
const PASS_A = [7950583, 2755655, 8757847, 6605961, 6605961, 5927568];
/* خوانش دوم: همان صفحه، برش‌خورده */
const PASS_B = [7150583, 2755655, 8757847, 5605961, 5605961, 5127568];

const mk = (prices) => ({
  extractable: true,
  currency: "ریال",
  supplier_name: "شرکت صنعتی آما",
  lines: prices.map((p, i) => ({ matched_item_id: 200 + i, title: `قلم ${i + 1}`, unit_price: p, qty: 10, confidence: "high" })),
});

test("قیمتی که دو خوانش روی آن توافق دارند دست‌نخورده می‌ماند", () => {
  const r = reconcile(mk(PASS_A), mk(PASS_B));
  const agreedIdx = [1, 2]; /* همان دو سطری که هر دو خوانش یکی گفتند */
  for (const i of agreedIdx) {
    const line = r.lines.find((l) => l.matched_item_id === 200 + i);
    assert.equal(line.confidence, "high", `سطر ${i} باید high بماند`);
    assert.equal(line.unit_price, TRUTH[i]);
    assert.equal(line.unit_price_alt, undefined);
  }
});

test("اختلاف دو خوانش، اطمینان را به low می‌برد و هر دو عدد را نگه می‌دارد", () => {
  const r = reconcile(mk(PASS_A), mk(PASS_B));
  for (const i of [0, 3, 4, 5]) {
    const line = r.lines.find((l) => l.matched_item_id === 200 + i);
    assert.equal(line.confidence, "low", `سطر ${i} باید low شود`);
    assert.equal(line.unit_price_alt, PASS_B[i]);
    assert.match(line.note, /دو بار متفاوت خوانده شد/);
  }
  assert.deepEqual(r.agreement, { agreed: 2, disputed: 4 });
});

test("هیچ خطایی از فیلتر توافق رد نمی‌شود", () => {
  /* ادعای مرکزی: هر سطری که «توافق» علامت خورده، واقعاً درست است */
  const r = reconcile(mk(PASS_A), mk(PASS_B));
  for (const line of r.lines) {
    const i = line.matched_item_id - 200;
    if (line.confidence === "high") {
      assert.equal(line.unit_price, TRUTH[i], `سطر «توافق‌شدهٔ» ${i} باید با مقدار واقعی سند یکی باشد`);
    }
  }
});

test("سطری که فقط در یک خوانش دیده شد علامت می‌خورد", () => {
  const a = mk([100, 200]);
  const b = mk([100]);
  const r = reconcile(a, b);
  const only = r.lines.find((l) => l.matched_item_id === 201);
  assert.equal(only.confidence, "low");
  assert.match(only.note, /فقط در یکی از دو خوانش/);
});

test("سطر تازه در خوانش دوم گم نمی‌شود", () => {
  const a = { extractable: true, lines: [{ matched_item_id: 1, title: "الف", unit_price: 10, confidence: "high" }] };
  const b = { extractable: true, lines: [
    { matched_item_id: 1, title: "الف", unit_price: 10, confidence: "high" },
    { matched_item_id: 2, title: "ب", unit_price: 20, confidence: "high" },
  ] };
  const r = reconcile(a, b);
  assert.equal(r.lines.length, 2);
  assert.equal(r.lines.find((l) => l.matched_item_id === 2).confidence, "low");
});

test("اختلاف در واحد پول یعنی کارشناس باید خودش انتخاب کند", () => {
  const a = { extractable: true, currency: "ریال", lines: [] };
  const b = { extractable: true, currency: "تومان", lines: [] };
  const r = reconcile(a, b);
  assert.equal(r.currency, null, "واحد پول مشکوک نباید حدس زده شود");
  assert.match(r.notes, /currency/);
});

test("تبدیل تومان به ریال قطعی است، نه کار مدل", () => {
  assert.equal(toRial(450000, "تومان"), 4500000);
  assert.equal(toRial(450000, "ریال"), 450000);
  assert.equal(toRial(null, "تومان"), null);
});
