/* ============================================================
   تست نشاندنِ خروجی مدل در جدول استعلام‌ها — worker/proforma.js

   چرا این تست وجود دارد: تا پیش از این، خواندنِ خودکار فقط می‌توانست خطی را
   که کارشناس از قبل دستی ساخته بود پر کند. یعنی برای اینکه مدل قیمت را
   بنویسد، کارشناس باید اول همان چیزها را دستی می‌زد — که کلِ کار را بی‌معنی
   می‌کرد. حالا خودِ خروجیِ خواندن می‌تواند خط تازه بسازد، با نامِ تأمین‌کننده‌ای
   که از روی سند خوانده شده.

   چیزی که این‌جا سنجیده می‌شود، **نگاشتِ فیلدها** و **قاعدهٔ ثبت موقت** است:
   هر فیلدی که در تب استعلامات هست از خروجی مدل پر می‌شود (جز «محل معامله» که
   تصمیم داخلی شرکت است)، و خط فقط وقتی ثبت‌شده حساب می‌شود که اجباری‌هایش
   باشند — همان قاعده‌ای که پنل دارد (quote-rules.js).

   دیتابیس این‌جا بدلی است: هدف، سنجیدنِ قاعده است نه SQLite.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { applyExtraction, lineUnitPrice } from "../../../worker/proforma.js";
import { REQUIRED, missingRequired, netOf, VAT_RATE } from "../../../worker/quote-rules.js";

/* ---------- دیتابیس بدلی ---------- */
function fakeDb({ items, quotes }) {
  const batches = [];
  const stmt = (sql) => ({
    sql,
    args: [],
    bind(...a) { this.args = a; return this; },
    async all() {
      if (sql.includes("FROM items")) return { results: items };
      if (sql.includes("FROM quotes")) return { results: quotes };
      return { results: [] };
    },
    async first() { return null; },
    async run() { return { meta: {} }; },
  });
  return {
    batches,
    prepare: (sql) => stmt(sql),
    batch: async (stmts) => { batches.push(stmts); return []; },
  };
}

/* یک خروجیِ کاملِ مدل، همان شکلی که extract.js قرارداد کرده */
const READ = {
  extractable: true,
  supplier_name: "پترو صنعت آریا",
  supplier_code: "411322334455",
  currency: "ریال",
  invoice_type: "رسمی",
  vat_status: "دارد",
  vat_included: false,
  pay_terms: "۵۰٪ پیش‌پرداخت، مابقی هنگام تحویل",
  pay_class: "۵۰٪ پیش‌پرداخت",
  valid_days: 15,
  delivery_date: "۱۰ روز کاری",
  ship_method: "با باربری، هزینه با خریدار",
  place: "سایر",
  place_other: "درب انبار فروشنده — کرج",
  lines: [
    { matched_item_id: 1, title: "شیر فلکه برنجی", spec: "برنجی، ۱۶ بار", unit: "عدد", qty: 4, unit_price: 5605961, confidence: "high" },
    { matched_item_id: 2, title: "لوله گالوانیزه", spec: null, unit: null, qty: null, unit_price: 1830000, confidence: "medium" },
  ],
};

const proforma = (extra) => ({
  id: 7, assignment_id: 3, request_id: "R-1", expert_id: 9, supplier_name: "پترو صنعت آریا",
  extracted_json: JSON.stringify({ result: { ...READ, ...(extra || {}) }, meta: { prompt_version: "pf-extract/1.1" } }),
});

const ITEMS = [{ id: 1, qty: 4, unit: "عدد" }, { id: 2, qty: 10, unit: "شاخه" }];

/* ستون‌های INSERT، به همان ترتیبِ دستور — تا تست با اندیس خام کار نکند */
const COLS = ["assignment_id", "item_id", "supplier_name", "supplier_code", "spec", "unit", "qty", "price", "dtime", "valid_days", "ship",
  "invoice", "pay", "vat", "place", "place_other", "saved", "low_conf", "created_at", "updated_at"];
const rowOf = (stmt) => Object.fromEntries(COLS.map((c, i) => [c, stmt.args[i]]));
const inserts = (db) => db.batches[0].filter((x) => x.sql.includes("INSERT INTO quotes")).map(rowOf);

test("بدون هیچ خط قبلی، دو خط استعلام تازه ساخته می‌شود", async () => {
  const DB = fakeDb({ items: ITEMS, quotes: [] });
  const res = await applyExtraction({ DB }, proforma(), {});
  assert.equal(res.applied, 2);
  assert.equal(res.created, 2);
  assert.equal(res.supplier, "پترو صنعت آریا");
  assert.equal(inserts(DB).length, 2);
});

test("همهٔ فیلدهای تب استعلامات از خروجی مدل پر می‌شوند", async () => {
  const DB = fakeDb({ items: ITEMS, quotes: [] });
  await applyExtraction({ DB }, proforma(), {});
  const a = inserts(DB)[0];
  assert.equal(a.supplier_name, "پترو صنعت آریا");
  assert.equal(a.supplier_code, "411322334455", "کد تأمین‌کننده");
  assert.equal(a.spec, "برنجی، ۱۶ بار", "مشخصات فنی");
  assert.equal(a.unit, "عدد", "واحد");
  assert.equal(a.qty, 4, "مقدار");
  assert.equal(a.price, 5605961, "قیمت واحد");
  assert.equal(a.dtime, "۱۰ روز کاری", "زمان تحویل");
  assert.equal(a.valid_days, "15", "اعتبار");
  assert.equal(a.ship, "با باربری، هزینه با خریدار", "روش حمل");
  assert.equal(a.invoice, "رسمی", "نوع فاکتور");
  assert.equal(a.pay, "۵۰٪ پیش‌پرداخت", "شرایط تسویه، از فهرست ثابت");
  assert.equal(a.vat, "دارد", "ارزش افزوده");
  assert.equal(a.place, "سایر", "محل تحویل");
  assert.equal(a.place_other, "درب انبار فروشنده — کرج", "متن محل تحویل");
});

test("خطی که همهٔ اجباری‌هایش را دارد، ثبت‌شده می‌نشیند", async () => {
  const DB = fakeDb({ items: ITEMS, quotes: [] });
  const res = await applyExtraction({ DB }, proforma(), {});
  assert.deepEqual(inserts(DB).map((r) => r.saved), [1, 1]);
  assert.equal(res.saved, 2);
  assert.equal(res.unsaved, 0);
  assert.deepEqual(res.missing, []);
});

test("اگر اجباری‌ای خوانده نشده، خط ساخته می‌شود ولی ثبت‌شده نیست و می‌گوید چه کم است", async () => {
  const DB = fakeDb({ items: ITEMS, quotes: [] });
  const res = await applyExtraction({ DB }, proforma({ delivery_date: null, pay_class: null, pay_terms: null }), {});
  assert.equal(res.created, 2, "خط‌ها ساخته می‌شوند");
  assert.deepEqual(inserts(DB).map((r) => r.saved), [0, 0]);
  assert.deepEqual(res.missing.sort(), ["dtime", "pay"]);
  assert.equal(inserts(DB)[0].vat, "دارد", "بقیهٔ فیلدها همچنان پر می‌شوند");
});

test("فیلدهای اختیاریِ خالی مانع ثبت نیستند", async () => {
  const DB = fakeDb({ items: ITEMS, quotes: [] });
  const res = await applyExtraction({ DB }, proforma({ ship_method: null, place: null, place_other: null, valid_days: null, supplier_code: null }), {});
  assert.equal(res.saved, 2);
});

/* ---------- ارزش افزوده ---------- */
test("ارزش افزوده اجباری است: اگر سند چیزی نگفته، خط ثبت‌شده نمی‌شود", async () => {
  const DB = fakeDb({ items: ITEMS, quotes: [] });
  const res = await applyExtraction({ DB }, proforma({ vat_status: null }), {});
  assert.equal(res.created, 2, "خط ساخته می‌شود");
  assert.deepEqual(inserts(DB).map((r) => r.vat), [null, null]);
  assert.deepEqual(res.missing, ["vat"]);
  assert.equal(res.saved, 0);
});

test("مقدار خارج از فهرست پذیرفته نمی‌شود", async () => {
  const DB = fakeDb({ items: ITEMS, quotes: [] });
  await applyExtraction({ DB }, proforma({ vat_status: "شاید" }), {});
  assert.equal(inserts(DB)[0].vat, null);
});

test("«ندارد» هم یک پاسخ کامل است", async () => {
  const DB = fakeDb({ items: ITEMS, quotes: [] });
  const res = await applyExtraction({ DB }, proforma({ vat_status: "ندارد" }), {});
  assert.equal(inserts(DB)[0].vat, "ندارد");
  assert.equal(res.saved, 2, "ثبت را نمی‌بندد");
});

test("قیمتی که ارزش افزوده در خود دارد، خالص می‌شود تا کمیسیون دوبار حسابش نکند", async () => {
  const DB = fakeDb({ items: ITEMS, quotes: [] });
  const res = await applyExtraction({ DB }, proforma({ vat_status: "دارد", vat_included: true }), {});
  const a = inserts(DB)[0];
  assert.equal(a.price, netOf(5605961), "قیمت خالص");
  assert.equal(a.price, Math.round(5605961 / 1.1));
  assert.ok(a.price < 5605961);
  assert.equal(a.vat, "دارد", "ارزش افزوده همچنان «دارد» است");
  assert.equal(a.low_conf, 1, "عددی که سامانه تقسیمش کرده باید بازبینی شود");
  assert.equal(res.vatStripped, true);
});

test("نرخِ نوشته‌شده در سند بر نرخ پیش‌فرض مقدم است", async () => {
  const DB = fakeDb({ items: ITEMS, quotes: [] });
  await applyExtraction({ DB }, proforma({ vat_included: true, vat_rate: 9 }), {});
  assert.equal(inserts(DB)[0].price, Math.round(5605961 / 1.09));
  assert.equal(VAT_RATE, 0.1, "پیش‌فرض همان ۱۰٪ فرم کمیسیون است");
});

test("وقتی ارزش افزوده ته فاکتور آمده، قیمت ردیف دست نمی‌خورد", async () => {
  const DB = fakeDb({ items: ITEMS, quotes: [] });
  const res = await applyExtraction({ DB }, proforma({ vat_status: "دارد", vat_included: false }), {});
  assert.equal(inserts(DB)[0].price, 5605961);
  assert.equal(res.vatStripped, false);
});

test("نوع فاکتور اگر در سند نبود «رسمی» است", async () => {
  const DB = fakeDb({ items: ITEMS, quotes: [] });
  await applyExtraction({ DB }, proforma({ invoice_type: null }), {});
  assert.equal(inserts(DB)[0].invoice, "رسمی");
});

test("وقتی مدل شرایط تسویه را در فهرست نریخته، متن خامش می‌نشیند", async () => {
  const DB = fakeDb({ items: ITEMS, quotes: [] });
  await applyExtraction({ DB }, proforma({ pay_class: null }), {});
  assert.equal(inserts(DB)[0].pay, "۵۰٪ پیش‌پرداخت، مابقی هنگام تحویل");
});

test("place_other فقط وقتی «سایر» است نوشته می‌شود", async () => {
  const DB = fakeDb({ items: ITEMS, quotes: [] });
  await applyExtraction({ DB }, proforma({ place: "انبار شرکت" }), {});
  assert.equal(inserts(DB)[0].place, "انبار شرکت");
  assert.equal(inserts(DB)[0].place_other, null);
});

test("سطری که مدل مطمئن نبوده، کم‌اطمینان علامت می‌خورد", async () => {
  const DB = fakeDb({ items: ITEMS, quotes: [] });
  await applyExtraction({ DB }, proforma(), {});
  assert.deepEqual(inserts(DB).map((r) => r.low_conf), [0, 1]);
});

test("قیمت واحد از مبلغ کل و مقدارِ همان سطر درمی‌آید", () => {
  assert.equal(lineUnitPrice({ unit_price: 100 }), 100);
  assert.equal(lineUnitPrice({ unit_price: null, total_price: 22423844, qty: 4 }), 5605961);
  assert.equal(lineUnitPrice({ unit_price: null, total_price: 1000, qty: 0 }), null, "بدون مقدار، تقسیمی نیست");
  assert.equal(lineUnitPrice({ unit_price: null, total_price: 1000 }), null);
});

test("سطرِ فقط-مبلغ-کل با تقسیم ثبت می‌شود؛ تقسیمِ نارُند کم‌اطمینان می‌شود", async () => {
  const DB = fakeDb({ items: ITEMS, quotes: [] });
  await applyExtraction({ DB }, proforma({ lines: [
    { matched_item_id: 1, title: "الف", unit: "عدد", qty: 4, unit_price: null, total_price: 22423844, confidence: "high" },
    { matched_item_id: 2, title: "ب", unit: "شاخه", qty: 3, unit_price: null, total_price: 1000, confidence: "high" },
  ] }), {});
  const [a, b] = inserts(DB);
  assert.equal(a.price, 5605961); assert.equal(a.low_conf, 0);
  assert.equal(b.price, 333); assert.equal(b.low_conf, 1, "۱۰۰۰ بر ۳ رُند نیست");
});

test("خطی که از قبل هست به‌روز می‌شود و تازه ساخته نمی‌شود", async () => {
  const DB = fakeDb({ items: ITEMS, quotes: [{ id: 55, item_id: 1, supplier_name: "پترو صنعت آریا", unit: "عدد", qty: 4, deal: "کارگاه" }] });
  const res = await applyExtraction({ DB }, proforma(), {});
  assert.equal(res.applied, 2);
  assert.equal(res.created, 1, "فقط قلم دوم تازه است");
  const upd = DB.batches[0].filter((x) => x.sql.includes("UPDATE quotes"));
  assert.equal(upd.length, 1);
  assert.ok(!/\bdeal=/.test(upd[0].sql), "محل معامله‌ای که کارشناس زده دست نمی‌خورد");
});

test("تومان به ریال تبدیل می‌شود، آن هم فقط وقتی واحد پول معلوم است", async () => {
  const DB = fakeDb({ items: ITEMS, quotes: [] });
  await applyExtraction({ DB }, proforma({ currency: "تومان" }), {});
  assert.equal(inserts(DB)[0].price, 56059610);

  await assert.rejects(
    () => applyExtraction({ DB: fakeDb({ items: ITEMS, quotes: [] }) }, proforma({ currency: null }), {}),
    /واحد پول/,
  );
});

test("در درخواست تک‌قلمی، تنها سطرِ قیمت‌دار به همان قلم وصل می‌شود", async () => {
  const one = [{ id: 1, qty: 1, unit: "عدد" }];
  const DB = fakeDb({ items: one, quotes: [] });
  const res = await applyExtraction({ DB }, proforma({
    lines: [{ matched_item_id: null, title: "کنتور آب", unit_price: 480000, confidence: "high" }],
  }), {});
  assert.equal(res.created, 1);
  assert.equal(inserts(DB)[0].item_id, 1);
});

test("در درخواست چندقلمی، سطرِ بی‌تطبیق حدس زده نمی‌شود", async () => {
  await assert.rejects(
    () => applyExtraction({ DB: fakeDb({ items: ITEMS, quotes: [] }) }, proforma({
      lines: [{ matched_item_id: null, title: "چیز مبهم", unit_price: 999, confidence: "low" }],
    }), {}),
    /وصل نشده/,
  );
});

test("سند ناخوانا چیزی نمی‌نویسد", async () => {
  await assert.rejects(
    () => applyExtraction({ DB: fakeDb({ items: ITEMS, quotes: [] }) },
      proforma({ extractable: false, reason: "handwritten" }), {}),
    /خوانا نبود/,
  );
});

test("«محل معامله» از سند درنمی‌آید و در دستور نوشتن هم نیست", async () => {
  const DB = fakeDb({ items: ITEMS, quotes: [] });
  await applyExtraction({ DB }, proforma(), {});
  assert.ok(!/\bdeal\b/.test(DB.batches[0][0].sql), "ستون deal نباید در INSERT باشد");
});

/* ---------- قاعدهٔ مشترک ---------- */
test("قاعدهٔ اجباری‌ها همان است که کاربر خواسته", () => {
  assert.deepEqual(REQUIRED, ["unit", "qty", "price", "dtime", "pay", "invoice", "vat"]);
  const full = { unit: "عدد", qty: 1, price: 5, dtime: "فوری", pay: "نقدی", invoice: "رسمی", vat: "دارد" };
  assert.deepEqual(missingRequired(full), []);
  assert.deepEqual(missingRequired({ ...full, vat: "" }), ["vat"], "ارزش افزوده اجباری است");
  assert.deepEqual(missingRequired({ ...full, place: "سایر" }), ["place_other"], "«سایر» بدون متن خالی است");
  assert.deepEqual(missingRequired({ ...full, ship: null, deal: null, place: null }), [], "اختیاری‌ها به حساب نمی‌آیند");
});
