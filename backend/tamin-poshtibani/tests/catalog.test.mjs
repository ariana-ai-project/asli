/* ============================================================
   نرمال‌سازی اقلام و سوابق — چهار فایل مرجع، بارگذاری، «عین قلم / نوع قلم»
   (frontend/tamin-poshtibani/catalog-import.js · worker/catalog.js ·
    worker/history.js · worker/normalize.js)

   کاربرگ‌های این‌جا مصنوعی‌اند ولی همان سرستون‌های فایل‌های واقعی را دارند و هر
   حالت مرزی را یک بار: هر پنج سطح اولویت نرخ تبدیل، خرید ۱۴۰۵ بی‌شاخص، ردیفِ
   کاملاً تکراری، ردیف بی‌تأمین‌کننده، سطل «سایر تامین کنندگان»، و «ك» عربی در
   نام تأمین‌کننده.

   بخش پایانی کل مسیر را روی SQLite واقعی می‌آزماید (sqliteD1 در run.mjs): D1 خودش
   SQLite است، پس جدول‌های WITHOUT ROWID، GROUP BY و عبارت گشتاور همان‌طور اجرا
   می‌شوند که در تولید. اگر Node قدیمی باشد (بی node:sqlite) آن بخش skip می‌شود.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";

import { loadTP, sqliteD1 } from "./run.mjs";
import * as W from "../../../worker/catalog.js";
import { itemHistory, supplierBuys, itemSeries, resolveScope, excludedWhy, ratesWithShares } from "../../../worker/history.js";
import { normalizeItem, confirmNorm, revertEdit, scoreHeads, nearestItems, settle, conventionLines, userPrompt } from "../../../worker/normalize.js";

const TP0 = loadTP();
const XL = TP0.XLSX;
/* خروجی سازنده در سندباکس vm ساخته می‌شود و آرایه/شیءهایش پروتوتایپ همان realm را دارند؛
   deepStrictEqual آن را با شیء این‌جا نابرابر می‌داند. مقایسه روی شکل JSON است. */
const plain = (x) => JSON.parse(JSON.stringify(x));

/* ---------------- کاربرگ‌های مصنوعی ---------------- */
const book = (sheets) => {
  const wb = XL.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) XL.utils.book_append_sheet(wb, XL.utils.aoa_to_sheet(aoa), name);
  return wb;
};

const LAYERS = [["اندازه", "size"], ["جنس", "material"], ["نمره", "grade_no"]];
/* ورق: نوع قلمی که جنس بازارش را جدا می‌کند (catalog-head-rules.mjs: «ورق» ← r:"f"، d:"آهنی") —
   «ورق ۲ میل» بی‌جنس است و باید «ورق آهنی» شود، کنار «ورق آهن ۳ میل»، و جدا از گالوانیزه */
const SHEET_ITEMS = [
  ["4001", "ورق 2 میل", { "ضخامت": "2 میلیمتر" }],
  ["4002", "ورق آهن 3 میل", { "ضخامت": "3" }],
  ["4003", "ورق گالوانیزه 0.5 میل", { "ضخامت": "0.5 میلی‌متر", "پوشش": "گالوانیزه" }],
  ["4004", "ورق استیل 1 میل", { "ضخامت": "1 mm", "جنس": "استیل" }],
];
const ITEM_HEAD = ["کد قلم", "عنوان قلم", "نوع قلم", "واحد مرجع", "کد خوشه", "کد طبقهٔ اصناف", "باقیماندهٔ متن", "اندازه", "جنس", "نمره", "ویژگی‌ها (JSON)"];
const item = (code, title, head, ref, cl, cls, attrs) => [code, title, head, ref, cl, cls, "",
  attrs["اندازه"] || "", attrs["جنس"] || "", attrs["نمره"] || "", JSON.stringify(attrs)];

/* میلگرد با دو نام (یکسان‌سازیِ دوم، تصمیم مدیر): «آرماتور» و «میلگرد» یک کالایند و نمره‌شان قطر است */
const REBAR_ITEMS = [
  ["5001", "آرماتور 12 A3", "آرماتور", { "نمره": "12", "اندازه": "A3" }],
  ["5002", "میلگرد 12", "میلگرد", { "نمره": "12" }],
  ["5003", "میلگرد 16", "میلگرد", { "نمره": "16" }],
];

function booksOf({ idxA1402 = 50, extraRow = null, sheet = false, rebar = false } = {}) {
  const layers = sheet ? [...LAYERS, ["ضخامت", "thickness"], ["پوشش", "coating"]] : LAYERS;
  const items = book({
    items: [ITEM_HEAD,
      ...(sheet ? SHEET_ITEMS.map(([code, title, a]) => item(code, title, "ورق", "کیلوگرم", "C09", "300", a)) : []),
      ...(rebar ? REBAR_ITEMS.map(([code, title, head, a]) => item(code, title, head, "کیلوگرم", "C09", "300", a)) : []),
      item("1001", "پیچ آلن M8 فولادی", "پیچ", "عدد", "C04", "200", { "اندازه": "M8", "جنس": "فولاد" }),
      item("1002", "پیچ آلن M8 فولاد", "پیچ", "عدد", "C04", "200", { "اندازه": "M8", "جنس": "فولاد" }),
      item("1003", "پیچ M10", "پیچ", "عدد", "C04", "200", { "اندازه": "M10" }),
      item("2001", "مهره M8", "مهره", "عدد", "C04", "200", { "اندازه": "M8" }),
      item("3001", "تیرآهن 16", "تیر آهن", "شاخه", "C09", "300", { "نمره": "16" }),
    ],
    item_attributes: [["کد قلم", "نوع قلم", "نام لایهٔ ویژگی", "نام لایه (انگلیسی)", "مقدار لایه"],
      ...layers.map(([fa, en]) => ["x", "x", fa, en, "x"])],
    heads: [["نوع قلم", "واحد مرجع"], ["پیچ", "عدد"]],
    clusters: [["کد خوشه", "نام خوشه"], ["C04", "پیچ، مهره و اتصال‌دهنده‌ها"], ["C09", "مصالح ساختمانی"]],
  });
  const indices = book({
    class_index: [["کد سرگروه اصناف", "سرگروه اصناف", "کد طبقهٔ اصناف", "طبقهٔ اصناف", "کد شاخص"],
      ["20", "قطعات", "200", "اتصالات", "IDX_A"], ["30", "مصالح", "300", "آهن آلات", "IDX_B"]],
    indices: [["کد شاخص", "نام شاخص", "منبع"], ["IDX_A", "شاخص الف", "PPI"], ["IDX_B", "شاخص ب", "نهاده‌های ساختمانی"]],
    index_quarterly: [["کد شاخص", "دوره", "سال", "شمارهٔ فصل", "نام فصل", "شاخص (زمستان ۱۴۰۴ = ۱۰۰)"],
      ["IDX_A", "1402Q1", 1402, 1, "بهار", idxA1402], ["IDX_A", "1404Q4", 1404, 4, "زمستان", 100], ["IDX_B", "1403Q2", 1403, 2, "تابستان", 80]],
  });
  const RATE = ["نوع قلم", "واحد ثبت‌شده", "واحد مرجع", "نرخ تبدیل به واحد مرجع", "مبنای نرخ", "اطمینان"];
  const units = book({
    ref_units: [["نوع قلم", "واحد مرجع"], ["پیچ", "عدد"], ["مهره", "عدد"], ["تیر آهن", "شاخه"],
      ...(rebar ? [["آرماتور", "کیلوگرم"], ["میلگرد", "کیلوگرم"]] : [])],
    head_rates: [RATE, ["پیچ", "کیلو گرم", "عدد", 50, "برآورد قیمتی", "متوسط"], ["پیچ", "بسته", "عدد", 100, "بستهٔ استاندارد صنفی", "بالا"],
      ["تیر آهن", "تن", "شاخه", 5, "برآورد قیمتی", "پایین"],
      ...(rebar ? [["آرماتور", "تن", "کیلوگرم", 1000, "تبدیل قطعی", "قطعی"], ["میلگرد", "تن", "کیلوگرم", 1000, "تبدیل قطعی", "قطعی"]] : [])],
    cluster_rates: [["کد خوشه", "نام خوشه", ...RATE], ["C04", "پیچ", "پیچ", "کیلو گرم", "عدد", 40, "برآورد قیمتی", "پایین"],
      ["C04", "پیچ", "پیچ", "جین", "عدد", 12, "تبدیل قطعی", "قطعی"]],
    item_rates: [["کد قلم", "عنوان قلم", "نوع قلم", "واحد ثبت‌شده", "واحد مرجع", "نرخ تبدیل به واحد مرجع", "مبنای نرخ", "منشأ"],
      ["3001", "تیرآهن 16", "تیر آهن", "تن", "شاخه", 5.274262, "محاسبهٔ مهندسی", "از لایهٔ ویژگی همین قلم"]],
  });
  const H = ["شماره", "تاریخ سفارش", "وضعیت", "کارشناس خرید", "کد قلم خریدنی", "عنوان قلم خریدنی", "مقدار", "واحد سنجش", "مبلغ به ارز عملیاتی", "تامین کننده", "کد", "رده", "ماه", "فصل", "سال"];
  const rows = [
    ["1", "1402/02/10", "بسته شده", "کارشناس الف", "1001", "پیچ آلن M8 فولادی", 100, "عدد", 1000000, "شرکت الف", 501, "A", 2, "بهار", "1402"],
    ["2", "1402/03/01", "بسته شده", "کارشناس الف", "1001", "پیچ آلن M8 فولادی", 2, "کیلو گرم", 500000, "شرکت ب", 502, "C", 3, "بهار", "1402"],
    ["3", "1405/05/01", "بسته شده", "کارشناس ب", "1002", "پیچ آلن M8 فولاد", 50, "عدد", 700000, "شرکت ب", 502, "C", 5, "تابستان", "1405"],
    ["4", "1404/12/20", "بسته شده", "کارشناس ب", "1003", "پیچ M10", 10, "جین", 300000, "شركت الف", 501, "A", 12, "زمستان", "1404"],
    ["5", "1403/04/05", "بسته شده", "کارشناس ب", "3001", "تیرآهن 16", 2, "تن", 8000000, "شرکت ج", null, null, 4, "تابستان", "1403"],
    ["7", "1405/01/01", "ثبت شده", "کارشناس ب", "1001", "پیچ آلن M8 فولادی", 1, "عدد", 10, null, null, null, 1, "بهار", "1405"],
    ["1", "1402/02/10", "بسته شده", "کارشناس الف", "1001", "پیچ آلن M8 فولادی", 100, "عدد", 1000000, "شرکت الف", 501, "A", 2, "بهار", "1402"],
    ["6", "1401/01/15", "بسته شده", "کارشناس الف", "2001", "مهره M8", 5, "عدد", 50000, "سایر تامین کنندگان", null, null, 1, "بهار", "1401"],
  ];
  if (extraRow) rows.push(extraRow);
  if (rebar) rows.push(
    ["31", "1403/05/01", "بسته شده", "کارشناس الف", "5001", "آرماتور 12 A3", 1000, "کیلوگرم", 30000000, "آهن‌فروشی ج", null, null, 5, "تابستان", "1403"],
    ["32", "1403/05/02", "بسته شده", "کارشناس الف", "5002", "میلگرد 12", 500, "کیلوگرم", 15000000, "آهن‌فروشی د", null, null, 5, "تابستان", "1403"],
    ["33", "1403/05/03", "بسته شده", "کارشناس الف", "5002", "میلگرد 12", 2, "تن", 60000000, "آهن‌فروشی د", null, null, 5, "تابستان", "1403"],
    ["34", "1403/05/04", "بسته شده", "کارشناس الف", "5003", "میلگرد 16", 300, "کیلوگرم", 9000000, "آهن‌فروشی ه", null, null, 5, "تابستان", "1403"]);
  if (sheet) rows.push(
    ["21", "1403/05/01", "بسته شده", "کارشناس الف", "4001", "ورق 2 میل", 100, "کیلوگرم", 4000000, "آهن‌فروشی الف", null, null, 5, "تابستان", "1403"],
    ["22", "1403/05/02", "بسته شده", "کارشناس الف", "4002", "ورق آهن 3 میل", 50, "کیلوگرم", 2000000, "آهن‌فروشی ب", null, null, 5, "تابستان", "1403"],
    ["23", "1403/05/03", "بسته شده", "کارشناس الف", "4003", "ورق گالوانیزه 0.5 میل", 30, "کیلوگرم", 2400000, "گالوانیزه‌فروشی", null, null, 5, "تابستان", "1403"],
    ["24", "1403/05/04", "بسته شده", "کارشناس الف", "4004", "ورق استیل 1 میل", 10, "کیلوگرم", 3000000, "استیل‌فروشی", null, null, 5, "تابستان", "1403"]);
  const history = book({ "حداکثر 500000 رکورد": [H, ...rows] });
  return { items, indices, units, history };
}

const build = (opts) => TP0.TP.buildCatalog(booksOf(opts));

/* ---------------- قواعد مشترک مرورگر و Worker ---------------- */

test("تطابق با Worker: کلید، نام، تکه و واژه‌ها در مرورگر و سرور یکی‌اند", () => {
  const B = TP0.TP.cat;
  const samples = ["شركت الف", "  پيچ‌آلن  M8×30 ", "۱۲۳۴ ٥٦", "BOLT 16x2", "کیلو گرم", "پمپ (آب) - ۲ اینچ/فولادی", "", null, "1010100007"];
  for (const s of samples) {
    assert.equal(B.keyOf(s), W.keyOf(s), `keyOf: ${s}`);
    assert.equal(B.nameOf(s), W.nameOf(s), `nameOf: ${s}`);
    assert.deepEqual([...B.words(s)], W.words(s), `words: ${s}`);
    assert.equal(B.shardOf("code", String(s)), W.shardOf("code", String(s)));
    assert.equal(B.shardOf("word", String(s)), W.shardOf("word", String(s)));
    assert.equal(B.shardOf("title", String(s)), W.shardOf("title", String(s)));
  }
  assert.equal(W.keyOf("شركت الف"), W.keyOf("شرکت  الف"), "ك عربی و فاصلهٔ اضافه یک تأمین‌کننده‌اند");
  assert.deepEqual(plain(TP0.TP.catalogGroups), W.GROUPS, "گروه‌بندی جدول‌ها در پنل و سرور یکی است");
  assert.deepEqual(Object.keys(TP0.TP.catalogTableFa).sort(), Object.keys(W.TABLES).sort(), "هر جدول نام فارسی دارد");
  assert.deepEqual(W.words("پیچ آلن M8 × 30 فولادی"), ["پیچ", "آلن", "m8", "فولادی"], "عدد تنها و تک‌حرف واژه نیستند");
});

test("نوع هر فایل از کاربرگ‌هایش شناخته می‌شود، نه از نامش", () => {
  const b = booksOf();
  assert.equal(TP0.TP.catalogKind(b.items), "items");
  assert.equal(TP0.TP.catalogKind(b.indices), "indices");
  assert.equal(TP0.TP.catalogKind(b.units), "units");
  assert.equal(TP0.TP.catalogKind(b.history), "history");
  assert.equal(TP0.TP.catalogKind(book({ x: [["الف", "ب"]] })), null);
});

/* ---------------- سازنده ---------------- */

test("سوابق: نوع قلم هر کد، قیمت به زمستان ۱۴۰۴، ردیف تکراری و بی‌تأمین‌کننده", () => {
  const out = build();
  const P = out.tables.purchases, C = W.TABLES.purchases.cols;
  const col = (r, k) => r[C.indexOf(k)];
  assert.equal(P.length, 7, "۸ ردیف منهای یک ردیفِ بی‌تأمین‌کننده");
  assert.equal(out.stats.skipped, 1);
  assert.equal(out.stats.dups, 1, "ردیف کاملاً تکراری، خرید جداست و شمرده می‌شود");
  assert.equal(new Set(P.map((r) => col(r, "h"))).size, 7, "اثرانگشت ردیف‌ها یکتاست");

  const r1 = P.find((r) => col(r, "item_code") === "1001" && col(r, "unit") === "عدد");
  assert.equal(col(r1, "head"), "پیچ");
  assert.equal(col(r1, "amount_adj"), 2000000, "۱٬۰۰۰٬۰۰۰ × ۱۰۰ ÷ ۵۰ (شاخص بهار ۱۴۰۲)");
  const r1405 = P.find((r) => col(r, "item_code") === "1002");
  assert.equal(col(r1405, "amount_adj"), 700000, "۱۴۰۵ شاخص ندارد → ضریب ۱");
  const beam = P.find((r) => col(r, "item_code") === "3001");
  assert.equal(col(beam, "amount_adj"), 10000000, "شاخص طبقهٔ دیگر (IDX_B، تابستان ۱۴۰۳ = ۸۰)");
  assert.deepEqual(plain(out.stats.noIndexYears), { 1405: 1, 1401: 1 });
  assert.equal(col(P.find((r) => col(r, "item_code") === "1003"), "supplier_n"), W.keyOf("شرکت الف"), "ك عربی همان تأمین‌کننده است");
});

test("اقلام به تفکیک نوع قلم، کد → نوع، واژه → نوع، و رده‌ها", () => {
  const out = build();
  const heads = new Map(out.tables.cat_heads.map(([h, part, data]) => [`${h}#${part}`, JSON.parse(data)]));
  const bolt = heads.get("پیچ#0");
  assert.equal(bolt.ref, "عدد");
  assert.equal(bolt.items.length, 3);
  assert.deepEqual(plain(bolt.hr["کیلو گرم"]), [50, "برآورد قیمتی", "متوسط"]);
  assert.deepEqual(plain(bolt.cr.C04["جین"]), [12, "تبدیل قطعی", "قطعی"]);
  const beam = heads.get("تیر آهن#0").items[0];
  assert.deepEqual(plain(beam[6]), { "تن": [5.274262, "محاسبهٔ مهندسی"] }, "نرخ ویژهٔ قلم کنار خودِ قلم");

  const codes = Object.assign({}, ...out.tables.cat_codes.map(([, d]) => JSON.parse(d)));
  assert.equal(codes["1001"], "پیچ");
  assert.equal(out.tables.cat_codes.find(([s]) => s === W.shardOf("code", "3001"))[1].includes("3001"), true, "کد در تکهٔ خودش");
  const titles = Object.assign({}, ...out.tables.cat_titles.map(([, d]) => JSON.parse(d)));
  assert.equal(titles[W.keyOf("پیچ آلن M8 فولادی")], "1001", "عنوان → کد، با همان کلیدِ مقایسه");
  assert.equal(Object.keys(titles).length, 5);
  assert.ok(out.tables.cat_titles.every(([s, d]) => Object.keys(JSON.parse(d)).every((k) => W.shardOf("title", k) === s)), "هر عنوان در تکهٔ خودش");
  const words = Object.assign({}, ...out.tables.cat_words.map(([, d]) => JSON.parse(d)));
  assert.deepEqual(plain(words["پیچ"]), ["پیچ"]);
  assert.deepEqual(plain(words["m8"]), ["مهره", "پیچ"].sort());

  assert.deepEqual(plain(out.tables.supplier_grades.map((r) => [r[1], r[2], r[3]])).sort(), [["شرکت الف", "501", "A"], ["شرکت ب", "502", "C"]]);
  assert.deepEqual(plain(out.meta.layers.map((l) => l.fa)), ["اندازه", "جنس", "نمره"]);
  for (const [, , d] of out.tables.cat_heads) assert.ok(Buffer.byteLength(d, "utf8") <= 45000, "هر بخش زیر سقف دستور D1");
});

test("اثرانگشت‌ها: همان فایل همان است؛ شاخص تازه ← adj؛ ردیف تازه ← فقط rows", () => {
  const a = build(), b = build();
  assert.deepEqual(plain(a.fp), plain(b.fp), "قطعی");
  const idx = build({ idxA1402: 55 });
  assert.notEqual(idx.fp.adj, a.fp.adj, "شاخص عوض شد → قیمت تعدیل‌شدهٔ ردیف‌ها کهنه است");
  assert.notEqual(idx.fp.cat, a.fp.cat);
  const more = build({ extraRow: ["9", "1405/06/01", "بسته شده", "ک", "1003", "پیچ M10", 3, "عدد", 90000, "شرکت د", null, null, 6, "تابستان", "1405"] });
  assert.notEqual(more.fp.rows, a.fp.rows);
  assert.equal(more.fp.adj, a.fp.adj, "ردیف تازه نوع قلم و شاخص را عوض نمی‌کند → بارگذاری افزایشی");
  assert.equal(more.fp.cat, a.fp.cat);
});

test("فایل ناقص: پیام روشن، نه خطای مبهم", () => {
  const b = booksOf();
  assert.throws(() => TP0.TP.buildCatalog({ ...b, units: null }), /نرخ‌های تبدیل واحد/);
  const bad = book({ items: [["کد قلم", "عنوان"]], item_attributes: [["x"]] });
  assert.throws(() => TP0.TP.buildCatalog({ ...b, items: bad }), /نوع قلم/);
});

/* ---------------- نرخ تبدیل و لایه‌ها ---------------- */

test("نرخ تبدیل: دقیقاً ترتیب اولویت فایل ۴", () => {
  const hd = {
    ref: "عدد",
    hr: { "کیلو گرم": [50, "برآورد", "متوسط"], "بسته": [100, "بسته", "بالا"] },
    cr: { C04: { "کیلو گرم": [40, "برآورد", "پایین"], "جین": [12, "قطعی", "قطعی"], "کارتن": [200, "برآورد", "پایین"] } },
  };
  const it = ["1001", "پیچ", "C04", "200", {}, "", { "بسته": [120, "بستهٔ همین قلم"] }];
  assert.deepEqual(W.rateFor(hd, it, "عدد"), { rate: 1, basis: "واحد مرجع", conf: "قطعی", src: "ref" });
  assert.equal(W.rateFor(hd, it, "بسته").rate, 120, "۲) نرخ ویژهٔ قلم بر نوع قلم مقدم است");
  assert.equal(W.rateFor(hd, it, "جین").src, "cluster", "۳) خوشه با اطمینان قطعی");
  const kg = W.rateFor(hd, it, "کیلو گرم");
  assert.equal(kg.rate, 50, "۴) خوشه ضعیف بود → نوع قلم");
  assert.equal(kg.conf, "پایین", "…و اطمینان یک پله پایین می‌آید");
  assert.equal(W.rateFor(hd, it, "کارتن").rate, 200, "۵) خوشه حتی با اطمینان پایین");
  assert.equal(W.rateFor(hd, it, "لیتر"), null, "راهی نیست");
  assert.equal(W.rateFor(hd, it, "کیلو گرم", { "کیلو گرم": 60 }).rate, 60, "تغییر کارشناس بر همه مقدم است");
  assert.equal(W.rateFor(hd, it, "عدد", { "عدد": 7 }).rate, 1, "…جز خودِ واحد مرجع");
});

test("عین قلم: همان لایه‌ها با همان مقدار، نگارش ضرب مهم نیست", () => {
  assert.ok(W.layersEqual({ "ابعاد": "10*20", "جنس": "فولاد" }, { "جنس": "فولاد", "ابعاد": "10 × 20" }));
  assert.ok(!W.layersEqual({ "اندازه": "M8" }, { "اندازه": "M8", "جنس": "فولاد" }), "لایهٔ اضافه یعنی قلم دیگر");
  assert.ok(!W.layersEqual({ "اندازه": "M8" }, { "اندازه": "M10" }));
  assert.ok(W.layersEqual({ "اندازه": "M8", "رنگ": "" }, { "اندازه": "m8" }), "مقدار خالی لایه نیست؛ حروف کوچک و بزرگ یکی");
  assert.ok(W.layersEqual(null, {}));
});

/* ---------------- یافتن اقلام مشابه برای مدل ---------------- */

test("نوع‌های محتمل: واژهٔ کمیاب سنگین‌تر، و نام کامل نوع در عنوان برنده", () => {
  const wh = { "پیچ": ["پیچ"], "آلن": ["پیچ", "آچار"], "m8": ["پیچ", "مهره", "واشر"] };
  const r = scoreHeads("پیچ آلن M8", wh, 2000);
  assert.equal(r[0].head, "پیچ");
  assert.deepEqual(r.map((x) => x.head).slice(1).sort(), ["آچار", "مهره", "واشر"].sort());
  const hds = [{ head: "پیچ", items: [["1", "پیچ آلن M8", "", "", { "اندازه": "M8" }], ["2", "پیچ سرتخت M5", "", "", null]] },
    { head: "مهره", items: [["3", "مهره M8", "", "", { "اندازه": "M8" }]] }];
  const s = nearestItems("پیچ آلن M8", hds, 3);
  assert.equal(s[0].code, "1", "نزدیک‌ترین نمونه اول");
  assert.ok(s.some((x) => x.head === "مهره"), "هر نوعِ محتمل دست‌کم یک نمونه");
});

/* env بی‌فهرست: headData چیزی پیدا نمی‌کند (نوع قلمِ تازه) — صافی باید باز هم درست کار کند */
const noCatalog = { DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }), first: async () => null }) }) } };
const META = { layers: [...LAYERS, ["ضخامت", "thickness"], ["قطر", "diameter"], ["طول", "length"], ["پوشش", "coating"]].map(([fa, en]) => ({ fa, en })), rules: "test" };
/* فهرستی که پیش از این قواعد بارگذاری شده (meta.rules ندارد) */
const META_OLD = { layers: META.layers };

test("خروجی مدل تمیز می‌شود: لایهٔ ناشناخته و مقدار خالی کنار می‌رود، جنس با نام استاندارد", async () => {
  const c = await settle(noCatalog, META, { head: " پيچ ", layers: [{ name: "اندازه", value: "M8" }, { name: "ساختگی", value: "x" }, { name: "جنس", value: " " }, { name: "اندازه", value: "M9" }], residual: "آلن", confidence: "wat" }, "پیچ آلن M8");
  assert.equal(c.head, "پیچ");
  assert.deepEqual(plain(c.layers), { "اندازه": "M8", "جنس": { v: "آهنی", i: 1 } }, "پیچِ بی‌جنس: عرفِ پذیرفته‌شده (آهنی)، با علامت ضمنی");
  assert.equal(c.confidence, "low");
  await assert.rejects(() => settle(noCatalog, META, { head: "", layers: [] }, ""), /نوع قلم/);
});

test("قاعدهٔ عام ۱ و ۲ در صافیِ خروجی مدل: «ورق 2 میل» ← ورق آهنی، ضخامت ۲ میلی‌متر", async () => {
  /* مدل «میل» را در value گذاشته و unit را خالی — صافی خودش جدا می‌کند */
  const a = await settle(noCatalog, META, { head: "ورق", layers: [{ name: "ضخامت", value: "2 میل", unit: "", implicit: false }], residual: "", confidence: "high" }, "ورق 2 میل");
  assert.equal(a.head, "ورق آهنی", "جنسِ گفته‌نشده = عرفِ ورق؛ و جنس جزء نام نوع قلم است");
  assert.deepEqual(plain(a.layers), { "ضخامت": { v: "2", n: [2], u: "میلی‌متر" }, "جنس": { v: "آهنی", i: 1 } });
  /* گالوانیزه (در پوشش یا جنس) استثنای گفته‌شده است و نوع قلمِ دیگری می‌سازد */
  const g = await settle(noCatalog, META, { head: "ورق", layers: [{ name: "ضخامت", value: "0.5", unit: "میلی‌متر", implicit: false }, { name: "پوشش", value: "گالوانیزه", unit: "", implicit: false }], residual: "", confidence: "high" }, "ورق گالوانیزه 0.5");
  assert.equal(g.head, "ورق گالوانیزه");
  assert.deepEqual(plain(g.layers), { "ضخامت": { v: "0.5", n: [0.5], u: "میلی‌متر", i: 1 }, "جنس": "گالوانیزه" },
    "پوششِ گالوانیزه به جنس رفت؛ عنوان واحد نگفته، پس میلی‌متر «ضمنی» است (پیش‌فرضِ ضخامت) نه گفته‌شده");
  /* واحدی که مدل از خودش افزوده پذیرفته نیست: «انکر بولت M24*810» واحدِ طول را نگفته */
  const bolt = await settle(noCatalog, META, { head: "انکر بولت", layers: [{ name: "قطر", value: "M24", unit: "", implicit: false }, { name: "طول", value: "810", unit: "میلی‌متر", implicit: false }], residual: "", confidence: "high" }, "انکر بولت M24*810");
  assert.deepEqual(plain(bolt.layers), { "قطر": { v: "M24", n: [24], u: "میلی‌متر" }, "طول": { v: "810", n: [810], u: "" } }, "طول بی‌عرف: نامعلوم، نه حدسِ مدل");
  /* «1/2» بی‌واحد با عرفِ اینچیِ همان نوع قلم نیم اینچ است، نه ۱٫۲ */
  const inchEnv = { DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: [{ head: "مغزی", part: 0, data: JSON.stringify({ ref: "عدد", n: 1, uc: { "قطر": [{ u: "اینچ", n: 9, lo: 0.25, hi: 4 }] }, items: [] }) }] }), first: async () => null }) }) } };
  const nip = await settle(inchEnv, META, { head: "مغزی", layers: [{ name: "قطر", value: "1/2", unit: "", implicit: false }], residual: "", confidence: "high" }, "مغزی 1/2");
  assert.deepEqual(plain(nip.layers["قطر"]), { v: "1/2", n: [0.5], u: "اینچ", i: 1 });
  /* مدل خودش «ورق گالوانیزه» را برگزیده ولی عنوان جنسی نگفته: حدس است، عرف (آهنی) می‌ماند */
  const guess = await settle(noCatalog, META, { head: "ورق گالوانیزه", layers: [], residual: "", confidence: "low" }, "ورق 3");
  assert.equal(guess.head, "ورق آهنی");
  /* جنسِ ضمنیِ مدل جای قاعده را نمی‌گیرد: لوله عرفِ جنس ندارد */
  const pipe = await settle(noCatalog, META, { head: "لوله پلی اتیلن", layers: [{ name: "جنس", value: "پلی‌اتیلن", unit: "", implicit: true }, { name: "قطر", value: "110", unit: "", implicit: false }], residual: "", confidence: "low" }, "لوله 110");
  assert.equal(pipe.head, "لوله", "حدسِ مدل کنار رفت؛ نوع قلم به نامِ پایه برگشت");
  assert.equal(pipe.layers["جنس"], undefined);
  /* جنسِ گفته‌شده در عنوان، حتی اگر مدل لایه‌اش را جا انداخته باشد */
  const said = await settle(noCatalog, META, { head: "ورق", layers: [], residual: "", confidence: "high" }, "ورق استیل 1 میل");
  assert.equal(said.head, "ورق استیل");
  /* عدد نامعتبر از فرم کارشناس خطای روشن می‌دهد */
  await assert.rejects(() => settle(noCatalog, META, { head: "ورق", layers: { "ضخامت": { v: "دو", u: "میلی‌متر" } } }, "ورق", { strict: true }), /عدد نیست/);
});

test("فهرستِ پیش از یکسان‌سازی: درخواست به همان زبانِ کهنه می‌ماند تا ورود دوباره", async () => {
  const a = await settle(noCatalog, META_OLD, { head: "ورق", layers: [{ name: "ضخامت", value: "2 میل", unit: "", implicit: false }], residual: "", confidence: "high" }, "ورق 2 میل");
  assert.equal(a.head, "ورق", "«ورق آهنی» در فهرستِ کهنه نیست");
  assert.deepEqual(plain(a.layers), { "ضخامت": { v: "2", n: [2], u: "میلی‌متر" } }, "عدد و واحد جدا می‌شوند ولی جنسِ ضمنی نه");
  const b = await settle(noCatalog, META_OLD, { head: "ورق آهنی", layers: [], residual: "", confidence: "high" }, "ورق 2");
  assert.equal(b.head, "ورق", "نامِ جنس‌دارِ مدل به نامِ پایه برمی‌گردد");
  const c = await settle(noCatalog, META_OLD, { head: "تیر آهن", layers: [], residual: "", confidence: "high" }, "تیرآهن 16");
  assert.equal(c.head, "تیر آهن", "«تیر آهن» نوع قلمِ خودش است");
});

test("پرامپت: عرف‌های پذیرفته‌شده و واحد رایجِ نوع‌های محتمل، و نمونه‌ها با «ضمنی»", () => {
  const hd = { head: "ورق آهنی", uc: { "ضخامت": [{ u: "میلی‌متر", n: 40, lo: 0.5, hi: 20 }] }, items: [] };
  const lines = conventionLines([hd, { head: "پیچ", uc: {}, items: [] }, { head: "لوله", uc: {}, items: [] }]);
  assert.ok(lines.some((l) => /«ورق»: جنس جزء نام نوع قلم است.*جنسِ گفته‌نشده: آهنی/.test(l)), lines.join("\n"));
  assert.ok(lines.some((l) => /واحدِ رایج در «ورق آهنی»: ضخامت: میلی‌متر \(0\.5 تا 20\)/.test(l)));
  assert.ok(lines.some((l) => /«پیچ»: جنس لایهٔ ویژگی است/.test(l)));
  assert.ok(lines.some((l) => /«لوله».*«سبز» در عنوان ← پلی‌پروپیلن.*وگرنه نامعلوم — حدس نزن/.test(l)), "لوله: فقط عرفِ «سبز»؛ بقیه صریحاً «حدس نزن»");
  const fit = conventionLines([{ head: "سه راهی", uc: {}, items: [] }])[0];
  assert.match(fit, /«کونیک»، «اطلسی»، «پرچی»[^؛]*در عنوان ← نامعلوم؛ اندازه به اینچ ← گالوانیزه/, "نشانه‌های هم‌نتیجه یک‌جا");
  const u = userPrompt({ title: "ورق 2 میل" }, ["ورق آهنی"], [{ title: "ورق 3", head: "ورق آهنی", layers: { "ضخامت": { v: "3", n: [3], u: "میلی‌متر", i: 1 }, "جنس": { v: "آهنی", i: 1 } } }], lines);
  assert.match(u, /ضخامت=3 میلی‌متر \(ضمنی\)؛ جنس=آهنی \(ضمنی\)/);
  assert.match(u, /عرف‌های پذیرفته‌شده:/);
});

/* ---------------- نوع قلمی که جنس بازارش را جدا می‌کند (ورق) ---------------- */

test("ورق: «ورق ۲ میل» ← ورق آهنی (ضمنی)، گالوانیزه و استیل جدا؛ ردیف خرید نوع قلمِ فایل را نگه می‌دارد", () => {
  const out = build({ sheet: true });
  const heads = new Map(out.tables.cat_heads.filter((r) => r[1] === 0).map(([h, , d]) => [h, JSON.parse(d)]));
  assert.ok(!heads.has("ورق"), "نوع قلمِ «ورق» بی‌جنس نمی‌ماند");
  const iron = heads.get("ورق آهنی"), galv = heads.get("ورق گالوانیزه"), ss = heads.get("ورق استیل");
  assert.deepEqual(plain(iron.items.map((x) => x[0])), ["4001", "4002"]);
  assert.deepEqual(plain(iron.src), ["ورق"]); assert.equal(iron.sub, 1, "بخشی از «ورق» فایل است");
  const byCode = Object.fromEntries(iron.items.map((x) => [x[0], x[4]]));
  assert.deepEqual(plain(byCode["4001"]), { "ضخامت": { v: "2", n: [2], u: "میلی‌متر" }, "جنس": { v: "آهنی", i: 1 } }, "«2 میلیمتر» ← ۲ + میلی‌متر؛ جنس ضمنی");
  assert.deepEqual(plain(byCode["4002"]["جنس"]), "آهنی", "«ورق آهن» جنسِ گفته‌شده است (اسمِ ماده درست بعد از نام نوع قلم)");
  assert.deepEqual(plain(byCode["4002"]["ضخامت"]), { v: "3", n: [3], u: "میلی‌متر", i: 1 }, "عددِ بی‌واحد ← واحدِ عرفِ ضخامتِ همین نوع قلم، ضمنی");
  assert.deepEqual(plain(galv.items[0][4]), { "ضخامت": { v: "0.5", n: [0.5], u: "میلی‌متر" }, "جنس": "گالوانیزه" }, "پوششِ گالوانیزه جنس شد و لایهٔ پوشش رفت");
  assert.deepEqual(plain(ss.items[0][4]["ضخامت"]), { v: "1", n: [1], u: "میلی‌متر" }, "«1 mm» ← میلی‌متر");
  assert.ok(iron.uc["ضخامت"] && iron.uc["ضخامت"][0].u === "میلی‌متر", "عرف واحد برای خواندن خروجی مدل");

  const codes = Object.assign({}, ...out.tables.cat_codes.map(([, d]) => JSON.parse(d)));
  assert.equal(codes["4001"], "ورق آهنی"); assert.equal(codes["4003"], "ورق گالوانیزه");
  const P = out.tables.purchases, C = W.TABLES.purchases.cols;
  assert.ok(P.filter((r) => r[C.indexOf("item_code")].startsWith("400")).every((r) => r[C.indexOf("head")] === "ورق"),
    "ردیف خرید «ورق» می‌ماند، پس تغییر قاعده ۷۰ هزار ردیف را از نو نمی‌نویسد");
  assert.equal(out.fp.adj, build({ sheet: true }).fp.adj);
  assert.equal(out.stats.norm.mat.implied, 3, "۴۰۰۱، ۱۰۰۳ (پیچ) و ۲۰۰۱ (مهره)");
});

/* ---------------- کل مسیر روی SQLite ---------------- */

const BASE_SQL = [
  ...W.CATALOG_DDL, W.EDITS_DDL,
  "CREATE TABLE hist_imports (id INTEGER PRIMARY KEY, filename TEXT, imported_at INTEGER NOT NULL, finished_at INTEGER, row_count INTEGER, state TEXT NOT NULL DEFAULT 'loading', stats_json TEXT)",
  "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)",
  "CREATE TABLE suppliers (id INTEGER PRIMARY KEY, code TEXT UNIQUE, name TEXT NOT NULL, city TEXT, created_at INTEGER)",
  "CREATE TABLE items (id INTEGER PRIMARY KEY, title TEXT, code TEXT, spec TEXT, unit TEXT, norm_json TEXT, norm_at INTEGER)",
  "CREATE TABLE norm_cache (title_n TEXT PRIMARY KEY, result TEXT NOT NULL, model TEXT, cost_usd REAL, created_at INTEGER NOT NULL) WITHOUT ROWID",
];

async function loaded(out = build()) {
  const DB = await sqliteD1();
  if (!DB) return null;
  for (const s of BASE_SQL) DB.raw.exec(s);
  const env = { DB };
  W.resetCatalogCache();
  const beg = await W.catalogBegin(env, { fp: out.fp, meta: out.meta, stats: out.stats, filename: "test" });
  for (const [t, rows] of Object.entries(out.tables)) {
    const g = Object.keys(W.GROUPS).find((k) => W.GROUPS[k].includes(t));
    if (beg.plan[g] === "skip") continue;
    for (let i = 0; i < rows.length; i += 3) await W.catalogChunk(env, { import_id: beg.import_id, table: t, rows: rows.slice(i, i + 3) });
  }
  await W.catalogFinish(env, { import_id: beg.import_id });
  return { env, beg };
}
const HAS_SQLITE = !!(await sqliteD1());
const SKIP = HAS_SQLITE ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";

test("بارگذاری: همه چیز در __new ساخته و در پایان جابه‌جا می‌شود", { skip: SKIP }, async () => {
  const out = build();
  const { env, beg } = await loaded(out);
  assert.deepEqual(beg.plan, { catalog: "replace", grades: "replace", purchases: "replace" });
  const n = (t) => env.DB.raw.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
  for (const [t, rows] of Object.entries(out.tables)) assert.equal(n(t), rows.length, t);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE name LIKE '%__new'").get().n, 0, "جدول موقتی نماند");
  const imp = await W.activeImport(env);
  assert.equal(imp.stats.format, 2);
  assert.equal(imp.stats.rows, 7);
  assert.equal(imp.stats.suppliers, 4, "الف، ب، ج و سطل تجمیعی — «شركت الف» با ك عربی تأمین‌کنندهٔ پنجم نیست");
  assert.ok((await W.catalogMeta(env)).layers.length === 3);

  /* همان فایل‌ها دوباره: هیچ نوشتنی */
  assert.equal((await W.catalogBegin(env, { fp: out.fp })).skipped, true);
  /* فقط ردیف تازه: افزایشی، و ردیف‌های موجود دوباره نوشته نمی‌شوند */
  const more = build({ extraRow: ["9", "1405/06/01", "بسته شده", "ک", "1003", "پیچ M10", 3, "عدد", 90000, "شرکت د", null, null, 6, "تابستان", "1405"] });
  const b2 = await W.catalogBegin(env, { fp: more.fp, meta: more.meta });
  assert.deepEqual(b2.plan, { catalog: "skip", grades: "skip", purchases: "append" });
  const r = await W.catalogChunk(env, { import_id: b2.import_id, table: "purchases", rows: more.tables.purchases });
  assert.equal(r.inserted, 1, "فقط یک ردیف تازه");
  assert.equal(r.ignored, 7);
  /* نیمه‌کاره ماند (سهمیه)؛ همان فایل‌ها فردا همان بارگذاری را ادامه می‌دهند */
  const b3 = await W.catalogBegin(env, { fp: more.fp, meta: more.meta });
  assert.equal(b3.resumed, true);
  assert.equal(b3.import_id, b2.import_id);
  await W.catalogFinish(env, { import_id: b2.import_id });
  assert.equal((await W.activeImport(env)).stats.rows, 8);
  await assert.rejects(() => W.catalogChunk(env, { import_id: b2.import_id, table: "purchases", rows: [] }), /تمام شده/);
});

const it1001 = { id: 1, code: "1001", title: "پیچ آلن M8 فولادی", norm_json: null };

test("عین قلم: فقط اقلامِ هم‌لایه، مقدار به واحد مرجع، رده در امتیاز برابر", { skip: SKIP }, async () => {
  const { env } = await loaded();
  const h = await itemHistory(env, it1001, { k: 5, mode: "exact" });
  assert.equal(h.available, true);
  assert.equal(h.match.codes, 2, "۱۰۰۱ و ۱۰۰۲ لایه‌های یکسان دارند؛ ۱۰۰۳ (M10) نه");
  assert.equal(h.item.unit, "عدد");
  const by = Object.fromEntries(h.suppliers.map((s) => [s.name, s]));
  assert.equal(by["شرکت الف"].qty, 200, "دو خرید ۱۰۰ عددی (یکی تکراری)");
  assert.equal(by["شرکت ب"].qty, 150, "۲ کیلوگرم × ۵۰ + ۵۰ عدد");
  assert.equal(by["شرکت الف"].grade, "A");
  assert.equal(by["شرکت الف"].code, "501");
  assert.equal(by["شرکت الف"].n, 2); assert.equal(by["شرکت ب"].n, 2);
  assert.equal(by["شرکت الف"].rankN, 1, "دفعات برابر → ردهٔ A جلوتر");
  assert.equal(by["شرکت ب"].rankN, 2);
  assert.equal(by["شرکت الف"].avgUnit, 20000, "۲٬۰۰۰٬۰۰۰ ریالِ زمستان ۱۴۰۴ برای ۱۰۰ عدد");
  const kg = h.rates.find((r) => r.unit === "کیلو گرم");
  assert.equal(kg.rate, 50); assert.equal(kg.conf, "پایین"); assert.equal(kg.rows, 1);
  assert.equal(h.lowConf, 1);
});

test("نوع قلم: همهٔ پیچ‌ها، با نرخ خوشه برای «جین»؛ سطل تجمیعی بیرون از رتبه", { skip: SKIP }, async () => {
  const { env } = await loaded();
  const h = await itemHistory(env, it1001, { k: 5, mode: "head" });
  const by = Object.fromEntries(h.suppliers.map((s) => [s.name, s]));
  assert.equal(by["شرکت الف"].qty, 320, "۲۰۰ + ۱۰ جین × ۱۲");
  assert.equal(by["شرکت الف"].n, 3);
  assert.equal(h.titles.length, 3, "سه قلمِ این نوع خرید داشته‌اند");
  const nut = await itemHistory(env, { id: 2, code: "2001", title: "مهره M8" }, { mode: "head" });
  assert.equal(nut.suppliers.length, 0);
  assert.deepEqual(nut.excluded.map((x) => x.name), ["سایر تامین کنندگان"]);
});

test("بیرون از رتبه: نام تجمیعی و «کارفرمای اصلی …» (تحویلی کارفرما، قیمت اسمی)", () => {
  assert.equal(excludedWhy(W.keyOf("سایر تامین کنندگان")), "bucket");
  assert.equal(excludedWhy(W.keyOf("كارفرمای اصلی راغون")), "employer", "ك عربی هم");
  assert.equal(excludedWhy(W.keyOf("کارفرمای اصلی سد تازه")), "employer", "پروژهٔ بعدی بی تغییر کد");
  assert.equal(excludedWhy(W.keyOf("شرکت کارفرمایان صنعت")), null, "فقط پیشوند «کارفرمای اصلی»");
  assert.equal(excludedWhy(W.keyOf("پولاد پیچ کار")), null);
});

test("ریز خریدها و نمودار: همان محدوده، مقدار به واحد مرجع، ك عربی پیدا می‌شود", { skip: SKIP }, async () => {
  const { env } = await loaded();
  const b = await supplierBuys(env, it1001, "شركت ب", { mode: "exact" });
  assert.equal(b.buys.length, 2);
  const kg = b.buys.find((x) => x.unit === "کیلو گرم");
  assert.equal(kg.qty_ref, 100); assert.equal(kg.unit_adj, kg.amount_adj / 100);
  const s = await itemSeries(env, it1001, { mode: "head" });
  assert.equal(s.unit, "عدد");
  assert.equal(s.points.find((p) => p.date === "1404/12/20").qty, 120);
});

test("کد بیرون از فهرست: پیام روشن و راهنمای نرمال‌سازی", { skip: SKIP }, async () => {
  const { env } = await loaded();
  const sc = await resolveScope(env, { code: "9999", title: "چیز" }, {});
  assert.match(sc.message, /در فهرست اقلام نیست/);
  const h = await itemHistory(env, { id: 3, code: "9999", title: "چیز" }, {});
  assert.equal(h.suppliers.length, 0);
  assert.match(h.message, /نرمال‌سازی اقلام/);
});

test("نرمال‌سازی: کد در فهرست ← بی‌مدل؛ عنوان تازه ← یک بار مدل، بعد کش؛ تأیید و نرخ کارشناس", { skip: SKIP }, async () => {
  const { env } = await loaded();
  env.ANTHROPIC_API_KEY = "test";
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push(JSON.parse(init.body));
    return { ok: true, status: 200, json: async () => ({ model: "claude-haiku-4-5-20251001", stop_reason: "tool_use",
      content: [{ type: "tool_use", name: "record_split", input: { head: "پیچ", layers: [{ name: "اندازه", value: "M8" }, { name: "جنس", value: "فولاد" }, { name: "بی‌ربط", value: "x" }], residual: "آلن", confidence: "high" } }],
      usage: { input_tokens: 900, output_tokens: 60 } }) };
  };
  try {
    const cat = await normalizeItem(env, it1001);
    assert.equal(cat.source, "catalog");
    assert.deepEqual(plain(cat.layers), { "اندازه": "M8", "جنس": "آهنی" }, "فولاد ← نام استاندارد «آهنی»");
    assert.equal(calls.length, 0, "کد در فهرست بود → مدل صدا زده نشد");
    assert.ok(cat.rates.units.some((u) => u.unit === "کیلو گرم" && u.rate === 50));

    const fresh = { id: 9, code: null, title: "پیچ آلن M8 فولادی گالوانیزه", spec: "" };
    /* مدل هزینه دارد: بی تأییدِ کارشناس (model) صدا زده نمی‌شود و پاسخ فقط می‌گوید «مدل لازم است» */
    const ask = await normalizeItem(env, fresh);
    assert.equal(ask.source, "none"); assert.equal(ask.needsModel, true);
    assert.ok(ask.costEst > 0, "هزینهٔ تقریبی برای کادرِ تأیید");
    assert.equal(calls.length, 0, "بی تأیید، مدل صدا زده نشد");
    const m = await normalizeItem(env, fresh, { model: true });
    assert.equal(m.source, "model");
    assert.deepEqual(plain(m.layers), { "اندازه": "M8", "جنس": "آهنی" }, "لایهٔ ناشناخته کنار رفت؛ جنس با نام استاندارد");
    assert.equal(calls.length, 1);
    const sent = calls[0];
    assert.equal(sent.tool_choice.name, "record_split");
    assert.match(sent.messages[0].content, /پیچ آلن M8 فولادی گالوانیزه/);
    assert.match(sent.messages[0].content, /نوع‌های محتمل[^\n]*پیچ/, "نوع محتمل از واژه‌ها");
    assert.match(sent.system, /اندازه \(size\)/, "لایه‌های استاندارد در پرامپت");
    assert.ok(m.cost > 0 && m.cost < 0.01, `هزینهٔ یک فراخوانی: ${m.cost}`);

    const again = await normalizeItem(env, fresh);
    assert.equal(again.source, "cache");
    assert.equal(calls.length, 1, "همان عنوان دوباره → بی‌هزینه");

    env.DB.raw.prepare("INSERT INTO items (id,title,code) VALUES (9,?,NULL)").run(fresh.title);
    await confirmNorm(env, fresh, { head: "پیچ", layers: m.layers, rates: { "کیلو گرم": 60 }, source: "model" });
    const row = env.DB.raw.prepare("SELECT norm_json FROM items WHERE id=9").get();
    const h = await itemHistory(env, { ...fresh, norm_json: row.norm_json }, { norm: true, mode: "exact" });
    const b = h.suppliers.find((s) => s.name === "شرکت ب");
    assert.equal(b.qty, 170, "۲ کیلوگرم × ۶۰ (نرخ کارشناس) + ۵۰");
    assert.equal(h.rates.find((r) => r.unit === "کیلو گرم").src, "user");
    await assert.rejects(() => confirmNorm(env, fresh, { head: "پیچ", layers: { "ساختگی": "x" } }), /لایهٔ استاندارد نیست/);
    await assert.rejects(() => confirmNorm(env, fresh, { head: "پیچ", layers: {}, rates: { "کیلو گرم": -1 } }), /عدد مثبت/);
  } finally { globalThis.fetch = realFetch; }
});

test("ورق در سوابق: «نوع قلم» یعنی فقط ورق آهنی، نه گالوانیزه و استیلِ همان «ورق» فایل", { skip: SKIP }, async () => {
  const { env } = await loaded(build({ sheet: true }));
  const it = { id: 40, code: "4001", title: "ورق 2 میل", norm_json: null };
  const head = await itemHistory(env, it, { mode: "head" });
  assert.equal(head.struct.head, "ورق آهنی");
  assert.deepEqual(head.suppliers.map((s) => s.name).sort(), ["آهن‌فروشی الف", "آهن‌فروشی ب"].sort(), "گالوانیزه‌فروشی و استیل‌فروشی بیرون");
  assert.equal(head.match.codes, 2);
  const exact = await itemHistory(env, it, { mode: "exact" });
  assert.deepEqual(exact.suppliers.map((s) => s.name), ["آهن‌فروشی الف"], "عین قلم: فقط ضخامت ۲ میلی‌متر");
  /* درخواستی با «0.2 سانتی‌متر» همان ورقِ ۲ میلی‌متری است */
  const norm = { v: 2, head: "ورق آهنی", layers: { "ضخامت": { v: "0.2", n: [0.2], u: "سانتی‌متر" }, "جنس": "آهنی" } };
  const cm = await itemHistory(env, { id: 41, code: null, title: "ورق دو دهم سانت", norm_json: JSON.stringify(norm) }, { norm: true, mode: "exact" });
  assert.deepEqual(cm.suppliers.map((s) => s.name), ["آهن‌فروشی الف"], "تبدیل بر پایهٔ واحد: ۰٫۲ سانتی‌متر = ۲ میلی‌متر");
  /* تأییدِ قدیمی (پیش از یکسان‌سازی) هم به زبان امروز خوانده می‌شود */
  const old = { head: "ورق", layers: { "ضخامت": "2 میل" }, rates: {} };
  const o = await itemHistory(env, { id: 42, code: null, title: "ورق 2 میل", norm_json: JSON.stringify(old) }, { norm: true, mode: "exact" });
  assert.equal(o.struct.head, "ورق آهنی");
  assert.deepEqual(o.suppliers.map((s) => s.name), ["آهن‌فروشی الف"]);
});

/* ---------------- یکسان‌سازیِ دوم و «قلم انتخابی» (تصمیم مدیر، مهر ۱۴۰۵) ---------------- */

test("آرماتور همان میلگرد است: یک نوع قلم، نمره ← قطر، سوابقِ هر دو نام با هم — بی بازنویسی دیتابیس", { skip: SKIP }, async () => {
  const { env } = await loaded(build({ rebar: true }));
  /* دیتابیس همان‌طور که بارگذاری شده می‌ماند: «آرماتور آهنی» و «میلگرد آهنی» دو ردیف‌اند */
  const stored = env.DB.raw.prepare("SELECT head FROM cat_heads WHERE part=0 AND (head LIKE 'آرماتور%' OR head LIKE 'میلگرد%') ORDER BY head").all().map((r) => r.head);
  assert.deepEqual(stored, ["آرماتور آهنی", "میلگرد آهنی"]);
  assert.equal(await W.headOfCode(env, "5001"), "میلگرد آهنی", "کدِ آرماتور به نامِ استاندارد");
  const heads = await W.allHeads(env);
  assert.ok(heads.includes("میلگرد آهنی") && !heads.includes("آرماتور آهنی"), "نامِ هم‌معنا در فهرستِ انتخاب نیست");
  const it = { id: 50, code: "5001", title: "آرماتور 12 A3", norm_json: null };
  const head = await itemHistory(env, it, { mode: "head" });
  assert.equal(head.struct.head, "میلگرد آهنی");
  assert.deepEqual(plain(head.struct.layers["قطر"]), { v: "12", n: [12], u: "میلی‌متر", i: 1 }, "نمره ۱۲ ← قطر ۱۲ میلی‌متر");
  assert.equal(head.struct.layers["نمره"], undefined);
  assert.deepEqual(head.suppliers.map((s) => s.name).sort(), ["آهن‌فروشی ج", "آهن‌فروشی د", "آهن‌فروشی ه"].sort(), "سوابقِ هر دو نام");
  assert.equal(head.totals.qty, 1000 + 500 + 2000 + 300, "تن به کیلوگرم");
  /* «عین قلم»: قطرِ ۱۲ ولی «اندازهٔ A3»ِ آرماتور لایهٔ اضافه است */
  const exact = await itemHistory(env, { id: 51, code: "5002", title: "میلگرد 12", norm_json: null }, { mode: "exact" });
  assert.deepEqual(exact.suppliers.map((s) => s.name), ["آهن‌فروشی د"]);
});

test("قلم انتخابی: فقط لایه‌های تیک‌خورده برابر (از هر کد)، و فقط واحدهای تیک‌خورده در همهٔ جمع‌ها", { skip: SKIP }, async () => {
  const { env } = await loaded(build({ rebar: true }));
  const it = { id: 52, code: "5002", title: "میلگرد 12", norm_json: null };
  /* بی تیکِ لایه: همان «نوع قلم» */
  const none = await itemHistory(env, it, { mode: "pick", pick: { layers: [], units: [] } });
  assert.equal(none.match.codes, 3); assert.equal(none.suppliers.length, 3);
  /* قطرِ ۱۲: آرماتورِ ۵۰۰۱ (با لایهٔ اضافهٔ A3) و میلگردِ ۵۰۰۲ — دو کدِ متفاوت، همان قطر */
  const d12 = await itemHistory(env, it, { mode: "pick", pick: { layers: ["قطر"], units: [] } });
  assert.equal(d12.match.codes, 2);
  assert.deepEqual(d12.match.picked, ["قطر"]);
  assert.deepEqual(d12.suppliers.map((s) => s.name).sort(), ["آهن‌فروشی ج", "آهن‌فروشی د"].sort());
  /* فقط کیلوگرم: خریدِ «تن»ِ آهن‌فروشی د در هیچ جمعی نیست */
  const kg = await itemHistory(env, it, { mode: "pick", pick: { layers: ["قطر"], units: ["کیلوگرم"] } });
  const dd = kg.suppliers.find((s) => s.name === "آهن‌فروشی د");
  assert.equal(dd.qty, 500); assert.equal(dd.n, 1);
  assert.equal(kg.unitDropped, 1);
  assert.equal(kg.totals.qty, 1500);
  const buys = await supplierBuys(env, it, "آهن‌فروشی د", { mode: "pick", pick: { layers: ["قطر"], units: ["کیلوگرم"] } });
  assert.deepEqual(buys.buys.map((b) => b.unit), ["کیلوگرم"], "ریز خریدها هم");
  const pts = await itemSeries(env, it, { mode: "pick", pick: { layers: ["قطر"], units: ["کیلوگرم"] } });
  assert.equal(pts.points.reduce((a, p) => a + p.qty, 0), 1500, "نمودار هم");
  /* لایه‌ای که این قلم ندارد نادیده است */
  assert.equal((await itemHistory(env, it, { mode: "pick", pick: { layers: ["ضخامت"], units: [] } })).match.codes, 3);
});

test("سهمِ هر واحد از کلِ خریدِ نوع قلم (به واحد مرجع) کنار نرخ‌ها — همان جمعیتِ جدول تأمین‌کنندگان", { skip: SKIP }, async () => {
  const { env } = await loaded(build({ rebar: true }));
  const p = await normalizeItem(env, { id: 53, code: "5002", title: "میلگرد 12" });
  const rv = await ratesWithShares(env, p.rates, p.head, p.code);
  assert.equal(rv.ref, "کیلوگرم");
  assert.equal(rv.total, 3800);
  assert.equal(rv.refRow.unit, "کیلوگرم");
  assert.equal(Math.round(rv.refRow.share * 10) / 10, 47.4, "۱۸۰۰ از ۳۸۰۰ کیلوگرم");
  const ton = rv.units.find((u) => u.unit === "تن");
  assert.equal(ton.rate, 1000); assert.equal(ton.rows, 1); assert.equal(Math.round(ton.share * 10) / 10, 52.6);
  const head = await itemHistory(env, { id: 53, code: "5002", title: "میلگرد 12", norm_json: null }, { mode: "head" });
  assert.equal(rv.total, head.totals.qty, "همان جمعِ جدول تأمین‌کنندگان");
});

test("ریز خریدها: قیمت واحد و مبلغ کل، و هر دو به مبلغِ زمستان ۱۴۰۴ با ضریبِ تعدیلِ همان ردیف", { skip: SKIP }, async () => {
  const { env } = await loaded();
  const r = await supplierBuys(env, it1001, "شرکت الف", { mode: "exact" });
  const b = r.buys.find((x) => x.order_date === "1402/02/10");
  assert.equal(b.unit_price, 10000);
  assert.equal(b.adj_factor, 2, "شاخص بهار ۱۴۰۲ = ۵۰ ← ضریب ۲");
  assert.equal(b.unit_price_adj, 20000, "قیمت واحد × ضریب");
  assert.equal(b.amount_adj, 2000000, "مبلغ کل × ضریب");
  assert.equal(b.unit_price_adj, b.unit_price * b.adj_factor);
});

/* ---------------- دیتابیس پیش از مدل، و ذخیرهٔ کارشناس در دیتابیس اصلی (تصمیم مدیر، مهر ۱۴۰۵) ---------------- */

/* مدلِ ساختگی که فقط می‌شمارد چند بار صدا زده شد — این بخش نباید هرگز به آن برسد مگر قلمِ تازه */
async function withModel(env, fn) {
  env.ANTHROPIC_API_KEY = "test";
  const calls = [], realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push(JSON.parse(init.body));
    return { ok: true, status: 200, json: async () => ({ model: "claude-haiku-4-5-20251001",
      content: [{ type: "tool_use", name: "record_split", input: { head: "پیچ", layers: [{ name: "اندازه", value: "M12", unit: "", implicit: false }], residual: "", confidence: "high" } }],
      usage: { input_tokens: 900, output_tokens: 60 } }) };
  };
  try { return await fn(calls); } finally { globalThis.fetch = realFetch; }
}
const rowOf = (env, id, it) => { env.DB.raw.prepare("INSERT OR REPLACE INTO items (id,title,code) VALUES (?,?,?)").run(id, it.title, it.code || null); };
const layersOf = (d) => plain(d.layers);

test("نرمال‌سازی: کد، بعد عنوانِ عیناً همان — هر دو بی مدل، حتی با «تفکیک دوباره»", { skip: SKIP }, async () => {
  const { env } = await loaded();
  await withModel(env, async (calls) => {
    /* قلمِ بی‌کد با عنوانِ یک قلمِ فهرست — با «ي» و «ك» عربی، نیم‌فاصله و فاصلهٔ اضافه هم همان عنوان است */
    const t = await normalizeItem(env, { id: 60, code: null, title: "  پيچ‌آلن   M8 فولادی " });
    assert.equal(t.source, "title");
    assert.equal(t.code, "1001", "ساختار و نرخ‌های همان قلمِ فهرست");
    assert.deepEqual(layersOf(t), { "اندازه": "M8", "جنس": "آهنی" });
    /* کدِ بیرون از فهرست ولی عنوانِ فهرست */
    const u = await normalizeItem(env, { id: 61, code: "7777", title: "پیچ M10" });
    assert.equal(u.source, "title"); assert.equal(u.code, "1003");
    /* «تفکیک دوباره با مدل» برای قلمی که در دیتابیس هست به مدل نمی‌رود */
    const f = await normalizeItem(env, { id: 62, code: "1001", title: "هرچه" }, { force: true });
    assert.equal(f.source, "catalog");
    assert.equal(calls.length, 0, "کد یا عنوان در دیتابیس بود → مدل صدا زده نشد");
    /* فقط قلمی که نه کدش و نه عنوانش در دیتابیس است — و فقط با تأییدِ هزینه */
    assert.equal((await normalizeItem(env, { id: 63, code: "7778", title: "پیچ آلن M12 تازه" })).needsModel, true);
    assert.equal(calls.length, 0);
    const m = await normalizeItem(env, { id: 63, code: "7778", title: "پیچ آلن M12 تازه" }, { model: true });
    assert.equal(m.source, "model"); assert.equal(calls.length, 1);
    /* جستجوی سوابق با تیکِ نرمال‌سازی، بی تأیید: ساختارِ دیتابیس (با عنوان) */
    const h = await itemHistory(env, { id: 60, code: null, title: "پيچ آلن M8 فولادی" }, { norm: true, mode: "exact" });
    assert.equal(h.match.source, "title"); assert.equal(h.match.codes, 2);
    const g = await itemHistory(env, { id: 63, code: "7778", title: "پیچ آلن M12 تازه" }, { norm: true, mode: "head" });
    assert.match(g.message, /ذخیره/, "پیشنهادِ مدل تا ذخیره نشود، بی خودِ پیشنهاد مبنای جستجو نیست");
    /* پنل پیشنهادِ ذخیره‌نشده را همراهِ درخواست می‌فرستد: فقط خوانده می‌شود */
    const p = await itemHistory(env, { id: 63, code: "7778", title: "پیچ آلن M12 تازه" }, { norm: true, mode: "head", struct: { head: m.head, layers: m.layers } });
    assert.equal(p.match.source, "proposal"); assert.equal(p.struct.head, "پیچ");
    assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM item_edits").get().n, 0, "چیزی در دیتابیس ننشست");
  });
});

test("ذخیرهٔ کارشناس در دیتابیس اصلی: درخواستِ بعدیِ همان کد همان را می‌بیند؛ برابرِ فهرست یعنی برداشتن", { skip: SKIP }, async () => {
  const { env } = await loaded();
  await withModel(env, async (calls) => {
    const a = { id: 70, code: "1003", title: "پیچ M10" };
    rowOf(env, 70, a);
    const who = { role: "expert", expert: { id: 5, name: "ابوذر بهمنی", label: "آقای بهمنی" } };
    /* «نمره ۸٫۸»ِ پیچ کلاسِ استحکام است — یکسان‌سازیِ دوم آن را به «رده» می‌برد */
    const r = await confirmNorm(env, a, { head: "پیچ", layers: { "اندازه": "M10", "نمره": "8.8" }, source: "catalog", code: "1003" }, who);
    assert.equal(r.saved, "created"); assert.equal(r.norm.source, "edit");
    assert.equal(r.edit.by, "آقای بهمنی");
    /* درخواستِ دیگر با همان کد — بی تأیید، بی مدل */
    const b = await normalizeItem(env, { id: 71, code: "1003", title: "پیچ ده" });
    assert.equal(b.source, "edit");
    assert.deepEqual(layersOf(b), { "اندازه": "M10", "رده": "8.8", "جنس": { v: "آهنی", i: 1 } });
    assert.equal(b.edit.by, "آقای بهمنی");
    /* همان عنوان بی‌کد هم (عنوان → کد ۱۰۰۳ → ویرایش) */
    assert.equal((await normalizeItem(env, { id: 72, code: null, title: "پیچ M10" })).source, "edit");
    assert.equal(calls.length, 0);
    /* جستجوی «عین قلم» با کدِ ۱۰۰۳ بی تیکِ نرمال‌سازی هم بر لایه‌های تازه است */
    const sc = await resolveScope(env, { id: 73, code: "1003", title: "x" }, { norm: false, mode: "exact" });
    assert.equal(sc.struct.layers["رده"], "8.8", "ساختار از دیتابیس اصلی، نه فهرستِ خام");
    /* دوباره ذخیره، این بار عیناً همان فهرست: ویرایش برداشته می‌شود */
    const back = await confirmNorm(env, a, { head: "پیچ", layers: { "اندازه": "M10" }, source: "edit", code: "1003" }, who);
    assert.equal(back.saved, "reverted");
    assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM item_edits").get().n, 0);
    assert.equal((await normalizeItem(env, { id: 74, code: "1003", title: "پیچ ده" })).source, "catalog");
    /* ذخیرهٔ بی تغییر و بی ویرایشِ قبلی: چیزی نوشته نمی‌شود */
    assert.equal((await confirmNorm(env, a, { head: "پیچ", layers: { "اندازه": "M10" }, source: "catalog", code: "1003" }, who)).saved, "same");
  });
});

test("ذخیرهٔ کارشناس: نوع قلمِ تازه و نرخ تبدیل برای همان کد در جستجوی سوابق", { skip: SKIP }, async () => {
  const { env } = await loaded();
  const who = { role: "expert", expert: { id: 5, name: "ک", label: "ک" } };
  /* ۱۰۰۳ به «مهره» رفت: از «نوع قلم»ِ پیچ بیرون، در «نوع قلم»ِ مهره */
  const a = { id: 80, code: "1003", title: "پیچ M10" };
  rowOf(env, 80, a);
  await confirmNorm(env, a, { head: "مهره", layers: { "اندازه": "M10" }, source: "catalog", code: "1003" }, who);
  const bolt = await itemHistory(env, it1001, { mode: "head" });
  const alef = bolt.suppliers.find((s) => s.name === "شرکت الف");
  assert.equal(alef.qty, 200, "خریدِ «جین»ِ ۱۰۰۳ دیگر زیر پیچ نیست");
  assert.equal(alef.n, 2); assert.equal(bolt.match.headItems, 2);
  const nut = await itemHistory(env, { id: 81, code: "2001", title: "مهره M8" }, { mode: "head" });
  assert.deepEqual(nut.suppliers.map((s) => s.key), [W.keyOf("شرکت الف")], "خریدِ ۱۰۰۳ حالا زیر مهره است (ردیف خریدش هنوز «پیچ» فایل)");
  assert.equal(nut.match.headItems, 2);

  /* نوع قلمی که فقط کارشناس ساخته: همان قلم با خریدهایش */
  await confirmNorm(env, a, { head: "پیچ خاص", layers: { "اندازه": "M10" }, source: "edit", code: "1003" }, who);
  const made = await itemHistory(env, { id: 82, code: "1003", title: "پیچ M10" }, { mode: "head" });
  assert.equal(made.struct.head, "پیچ خاص");
  assert.equal(made.totals.n, 1); assert.equal(made.struct.refUnit, "عدد", "واحد مرجعِ جای قبلی");
  assert.deepEqual((await W.allHeads(env)).includes("پیچ خاص"), true, "در فهرستِ انتخابِ نوع قلم");

  /* نرخ تبدیلِ کارشناس برای ۱۰۰۱ در دیتابیس می‌ماند و درخواستِ بعدی (بی تأیید) با همان جمع می‌زند */
  const c = { id: 83, code: "1001", title: "پیچ آلن M8 فولادی" };
  rowOf(env, 83, c);
  const r = await confirmNorm(env, c, { head: "پیچ", layers: { "اندازه": "M8", "جنس": "آهنی" }, rates: { "کیلو گرم": 60 }, source: "catalog", code: "1001" }, who);
  assert.equal(r.saved, "created", "لایه‌ها همان فهرست ولی نرخ تازه");
  const next = await itemHistory(env, { id: 84, code: "1001", title: "پیچ" }, { mode: "exact" });
  assert.equal(next.suppliers.find((s) => s.name === "شرکت ب").qty, 170, "۲ کیلوگرم × ۶۰ (نرخ کارشناس برای همین کد) + ۵۰");
  const p = await normalizeItem(env, { id: 85, code: "1001", title: "پیچ" });
  const kg = p.rates.units.find((u) => u.unit === "کیلو گرم");
  assert.deepEqual([kg.rate, kg.src], [60, "user"], "در پنل هم نرخِ کارشناس، تا ذخیرهٔ بعدی نگهش دارد");

  /* حذف ویرایش از دیتابیس: ساختارِ فهرست برمی‌گردد */
  assert.equal((await revertEdit(env, { id: 86, code: "1001", title: "پیچ" })).removed, true);
  assert.equal((await normalizeItem(env, { id: 86, code: "1001", title: "پیچ" })).source, "catalog");
  assert.equal((await revertEdit(env, { id: 86, code: "1001", title: "پیچ" })).removed, false);
});

test("قلمِ بی‌کد: ذخیره با عنوان، و ورقِ گالوانیزه‌ای که کارشناس آهنی دانست در «نوع قلم»ِ ورق آهنی", { skip: SKIP }, async () => {
  const { env } = await loaded(build({ sheet: true }));
  const who = { role: "manager" };
  await withModel(env, async (calls) => {
    const a = { id: 90, code: null, title: "ورق سیاه نیم میل" };
    rowOf(env, 90, a);
    const r = await confirmNorm(env, a, { head: "ورق", layers: { "ضخامت": { v: "0.5", u: "میلی‌متر" } }, source: "manual" }, who);
    assert.equal(r.saved, "created"); assert.equal(r.norm.head, "ورق آهنی");
    const b = await normalizeItem(env, { id: 91, code: null, title: "ورق سیاه  نیم میل" });
    assert.equal(b.source, "edit"); assert.equal(b.head, "ورق آهنی"); assert.equal(b.edit.by, "مدیر");
    assert.equal(calls.length, 0);
  });
  const g = { id: 92, code: "4003", title: "ورق گالوانیزه 0.5 میل" };
  rowOf(env, 92, g);
  await confirmNorm(env, g, { head: "ورق آهنی", layers: { "ضخامت": { v: "0.5", u: "میلی‌متر" }, "جنس": "آهنی" }, source: "catalog", code: "4003" }, who);
  const iron = await itemHistory(env, { id: 93, code: "4001", title: "ورق 2 میل" }, { mode: "head" });
  assert.deepEqual(iron.suppliers.map((s) => s.name).sort(), ["آهن‌فروشی الف", "آهن‌فروشی ب", "گالوانیزه‌فروشی"].sort());
  const galv = await W.headData(env, "ورق گالوانیزه");
  assert.equal(galv.items.length, 0, "از «ورق گالوانیزه» رفت");
});

/* ---------------- فایل‌های واقعی (اگر در دسترس باشند) ---------------- */
/* فایل‌ها در مخزن نیستند (۱۸ مگابایت و مال شرکت، و مخزن عمومی است)؛ CATALOG_FIXTURE_DIR پوشه‌شان را می‌گوید */
const REAL = [process.env.CATALOG_FIXTURE_DIR].filter(Boolean).find((d) => existsSync(d));

test("فایل‌های واقعی: هر چهار فایل شناخته و ساخته می‌شوند", { skip: REAL ? false : "پوشهٔ فایل‌های واقعی در دسترس نیست (CATALOG_FIXTURE_DIR)" }, () => {
  const books = {};
  for (const f of readdirSync(REAL).filter((x) => /\.xlsx$/i.test(x))) {
    const wb = XL.read(readFileSync(`${REAL}/${f}`), { type: "buffer", dense: true });
    const k = TP0.TP.catalogKind(wb); if (k) books[k] = wb;
  }
  assert.deepEqual(Object.keys(books).sort(), ["history", "indices", "items", "units"]);
  const out = TP0.TP.buildCatalog(books);
  assert.ok(out.stats.rows > 70000);
  assert.equal(out.stats.noHead, 0, "همهٔ کدهای سوابق در فهرست اقلام‌اند");
  assert.equal(new Set(out.tables.purchases.map((r) => r[2])).size, out.tables.purchases.length, "اثرانگشت یکتا");
  assert.ok(Object.keys(out.stats.noIndexYears).every((y) => y === "1405"), "فقط ۱۴۰۵ بی‌شاخص است");
  const total = Object.values(out.tables).reduce((a, r) => a + r.length, 0);
  assert.ok(total < 90000, `کل نوشتن ${total} — باید در یک روزِ پلن رایگان جا شود`);
  for (const [, , d] of out.tables.cat_heads) assert.ok(Buffer.byteLength(d, "utf8") <= 45000);
});
