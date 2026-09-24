/* ============================================================
   قواعد یکسان‌سازی — واحد و جنس (frontend/tamin-poshtibani/catalog-rules.mjs و
   catalog-head-rules.mjs)

   دو مشکل عام: (۱) عدد و واحد در یک رشته با املاهای ناهمگون («2 میل»، «2mm»، «"»)،
   (۲) ویژگی ضمنی («ورق ۲ میل» یعنی ورق آهنی). این‌جا هر قاعده با نمونه‌های واقعیِ
   فهرست اقلام آزموده می‌شود، و خودِ جدول قاعده‌ها هم — که هر جنس و واحدش شناخته باشد.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import * as R from "../../../frontend/tamin-poshtibani/catalog-rules.mjs";
import { HEAD_RULES } from "../../../frontend/tamin-poshtibani/catalog-head-rules.mjs";

const q = (layer, raw, conv) => R.parseQuant(layer, raw, conv);

test("عدد و واحد جدا، واحد با نام استاندارد — هر املایی که در عنوان‌ها دیده شده", () => {
  for (const s of ["2 میل", "2mm", "2 MM", "۲ میلیمتر", "2 میلی متری", "2 م.م"]) {
    assert.deepEqual(q("ضخامت", s, false), { v: "2", n: [2], u: "میلی‌متر" }, s);
  }
  assert.deepEqual(q("قطر", '1/2"', false), { v: "1/2", n: [0.5], u: "اینچ" }, "کسرِ اینچی نیم است");
  assert.deepEqual(q("قطر", "1.1/2 اینچ", false), { v: "1 1/2", n: [1.5], u: "اینچ" }, "«1.1/2» یک و نیم اینچ");
  assert.deepEqual(q("قطر", "1 1/2 اینچی", false), { v: "1 1/2", n: [1.5], u: "اینچ" });
  assert.deepEqual(q("طول", "1/5 متر", false), { v: "1.5", n: [1.5], u: "متر" }, "در متریک «/» ممیز است");
  assert.deepEqual(q("طول", "30 سانت", false), { v: "30", n: [30], u: "سانتی‌متر" });
  assert.deepEqual(q("ابعاد", "650*1520 میلیمتر", false), { v: "650×1520", n: [650, 1520], u: "میلی‌متر" });
  assert.deepEqual(q("جریان", "10-16 آمپر", false), { v: "10-16", n: [10, 16], u: "آمپر", r: 1 });
  assert.deepEqual(q("توان", "5/5 کیلو وات", false), { v: "5.5", n: [5.5], u: "کیلووات" });
  assert.deepEqual(q("قطر", "M18", false), { v: "M18", n: [18], u: "میلی‌متر" }, "رزوهٔ متریک در قطر");
  assert.deepEqual(q("ولتاژ", "220 ولت / 12 ولت", false), { list: [{ v: "220", n: [220], u: "ولت" }, { v: "12", n: [12], u: "ولت" }] });
  assert.equal(q("قطر", "105 کیلوگرم", false), null, "بُعدِ واحد با لایه نمی‌خواند → متن می‌ماند");
  assert.equal(q("ظرفیت", "کلاس 800", false), null, "نام است نه مقدار");
});

test("عددِ بی‌واحد: واحدِ عرفِ همان لایه در همان نوع قلم، بر پایهٔ بازهٔ مقدارها — و «ضمنی»", () => {
  const conv = [{ u: "اینچ", n: 40, lo: 0.25, hi: 12 }, { u: "میلی‌متر", n: 30, lo: 16, hi: 1020 }];
  assert.deepEqual(q("قطر", "2", conv), { v: "2", n: [2], u: "اینچ", i: 1 }, "لوله ۲ ← ۲ اینچ");
  assert.deepEqual(q("قطر", "1020", conv), { v: "1020", n: [1020], u: "میلی‌متر", i: 1 }, "لوله ۱۰۲۰ ← میلی‌متر، نه ۱۰۲۰ اینچ");
  assert.deepEqual(q("قطر", "5000", conv), { v: "5000", n: [5000], u: "" }, "در هیچ بازه‌ای نیست → نامعلوم، حدس زده نمی‌شود");
  assert.deepEqual(q("ضخامت", "3", null), { v: "3", n: [3], u: "میلی‌متر", i: 1 }, "ضخامتِ بی‌عرف: پیش‌فرضِ یکتای لایه");
  assert.deepEqual(q("طول", "3", null), { v: "3", n: [3], u: "" }, "طول عرفِ یکتا ندارد (پیچ میلی‌متر، لوله متر)");
  assert.deepEqual(q("ضخامت", "3", false), { v: "3", n: [3], u: "" }, "false: فقط واحدِ صریح");
});

test("عرفِ واحد از مقدارهای صریح ساخته می‌شود، به ترتیب رواج", () => {
  const obs = ["1/2 اینچ", "2 اینچ", "4 اینچ", "110 میلیمتر"].map((v) => ({ head: "لوله", layer: "قطر", q: q("قطر", v, false) }));
  obs.push({ head: "لوله", layer: "قطر", q: q("قطر", "3", null) });   /* ضمنی: در عرف شمرده نمی‌شود */
  const c = R.unitConventions(obs)["لوله"]["قطر"];
  assert.deepEqual(c.map((x) => [x.u, x.n, x.lo, x.hi]), [["اینچ", 3, 0.5, 4], ["میلی‌متر", 1, 110, 110]]);
});

test("کلید مقایسه: تبدیل بر پایهٔ واحد — ۲ میلی‌متر = ۰٫۲ سانتی‌متر = 2mm، ۱/۲ اینچ = ۱۲٫۷ میلی‌متر", () => {
  const k = (v) => R.layerKey("ضخامت", v);
  assert.equal(k("2 میل"), k({ v: "0.2", n: [0.2], u: "سانتی‌متر" }));
  assert.equal(k("2mm"), k({ v: "2", n: [2], u: "میلی‌متر", i: 1 }), "ضمنی بودن در کلید نیست");
  assert.notEqual(k("2 میل"), k("2 اینچ"));
  assert.equal(R.layerKey("قطر", '1/2"'), R.layerKey("قطر", "12.7 میلیمتر"));
  assert.equal(R.layerKey("جنس", "فولاد"), R.layerKey("جنس", { v: "آهنی", i: 1 }), "فولاد، آهن و فلز یک جنس‌اند");
  assert.notEqual(R.layerKey("جنس", "آهنی"), R.layerKey("جنس", "گالوانیزه"));
  assert.ok(R.layersEqual({ "ضخامت": "2 میل", "جنس": "آهن" }, { "جنس": { v: "آهنی", i: 1 }, "ضخامت": { v: "2", n: [2], u: "میلی‌متر" } }));
  assert.ok(!R.layersEqual({ "ضخامت": "2 میل" }, { "ضخامت": "2 میل", "جنس": "آهنی" }), "لایهٔ اضافه یعنی قلم دیگر");
  assert.equal(R.layerKey("اندازه", '1/2"'), R.layerKey("اندازه", "1/2 اینچی"), "لایهٔ غیرکمّی هم: املای واحد درون متن");
  assert.equal(R.layerKey("مجموعه مرتبط", "ترمز / کفشک / پین"), R.layerKey("مجموعه مرتبط", "ترمز، کفشک، پین"), "جداکنندهٔ فهرست");
  assert.notEqual(R.layerKey("مجموعه مرتبط", "ترمز / کفشک"), R.layerKey("مجموعه مرتبط", "کفشک / ترمز"), "ترتیب مهم است");
  assert.equal(R.layerKey("نمره", "10W40"), R.layerKey("نمره", "10w40"));
  assert.equal(R.showLayer({ v: "2", n: [2], u: "میلی‌متر", i: 1 }), "2 میلی‌متر (ضمنی)");
  assert.equal(R.layerText([{ v: "220", u: "ولت" }, { v: "12", u: "ولت" }]), "220 ولت / 12 ولت");
});

test("عدد و واحدِ جدا از فرم یا مدل", () => {
  assert.deepEqual(R.quantWith("ضخامت", "2", "میل"), { v: "2", n: [2], u: "میلی‌متر" }, "املای واحد هم استاندارد می‌شود");
  assert.deepEqual(R.quantWith("ضخامت", "2", "میلی‌متر", true), { v: "2", n: [2], u: "میلی‌متر", i: 1 });
  assert.deepEqual(R.quantWith("ضخامت", "2 سانت", "میلی‌متر"), { v: "2", n: [2], u: "سانتی‌متر" }, "واحدِ داخل خودِ متن مقدم است");
  assert.deepEqual(R.quantWith("قطر", "1 1/2", "اینچ"), { v: "1 1/2", n: [1.5], u: "اینچ" });
  assert.deepEqual(R.quantWith("قطر", "M18", "میلی‌متر"), { v: "M18", n: [18], u: "میلی‌متر" });
  assert.equal(R.quantWith("ضخامت", "دو", "میلی‌متر"), null);
  assert.equal(R.quantWith("ضخامت", "2", "واحد ساختگی"), null);
});

test("جنس از عنوان: صفت هر جا، اسمِ ماده فقط درست بعد از نام نوع قلم، و نه وقتی مال کالای دیگری است", () => {
  const objects = new Set(["دنده", "بیل", "چرخ", "صفحه", "لوله", "پمپ", "بوش", "بلبرینگ", "سینی", "کابل"].map(R.keyOf));
  const m = (t, h) => R.materialInTitle(t, h, objects);
  assert.equal(m("ورق آهن 2 میل", "ورق"), "آهنی");
  assert.equal(m("ورق فولاد کربنی", "ورق"), "آهنی");
  assert.equal(m("لوله‌ی مس 1/4", "لوله"), "مسی", "با «ی» میانجی");
  assert.equal(m("سه راهی 1/2 گالوانیزه", "سه راهی"), "گالوانیزه", "صفت در انتهای عنوان");
  assert.equal(m("بوش پمپ بتن", "بوش"), null, "بتن مالِ پمپ است");
  assert.equal(m("پیچ کاسه نمد", "پیچ"), null, "کاسه نمد اسم مرکب است");
  assert.equal(m("بلبرینگ شافت محرک دنده برنجی گریدر", "بلبرینگ"), null, "برنجیِ دنده، نه بلبرینگ");
  assert.equal(m("بوش سر استیک بیل چرخ لاستیکی", "بوش"), null, "بیلِ چرخ‌لاستیکی");
  assert.equal(m("رابط سینی کابل گالوانیزه عرض 20", "رابط"), "گالوانیزه", "روکش همهٔ مجموعه را می‌پوشاند");
  assert.equal(m("ورق سیاه 3 میل", "ورق"), null, "«سیاه» فقط در مقدارِ لایه جنس است، نه در عنوان");
  assert.equal(m("نوار فسفر برنز", "فسفر برنز"), null, "واژه‌های خودِ نام نوع قلم");
});

test("پوششِ گالوانیزه جنس است؛ روکشِ دیگر نه", () => {
  assert.deepEqual(R.foldCoating({ "جنس": "آهنی", "پوشش": "گالوانیزه گرم", "ضخامت": "2" }), { "جنس": "گالوانیزه", "ضخامت": "2" });
  assert.deepEqual(R.foldCoating({ "پوشش": "رنگ کوره‌ای" }), { "پوشش": "رنگ کوره‌ای" });
  assert.deepEqual(R.materialOf({ head: "کابل", title: "کابل ارت 70*1 روکش دار", attrs: { "پوشش": "روکش دار" } }, HEAD_RULES["کابل"], null), { mat: "مسی", how: "implied" }, "روکش‌دار جنس نیست؛ کابل بی‌جنس = مسی");
});

test("ویژگی ضمنی: عرفِ هر نوع قلم — پیش‌فرض، نشانه، و «نامعلوم» وقتی عرفی نیست", () => {
  const im = (head, title, attrs = {}) => R.materialOf({ head, title, attrs }, HEAD_RULES[R.keyOf(head)] || null, null);
  assert.deepEqual(im("ورق", "ورق 2 میل"), { mat: "آهنی", how: "implied" }, "همان مثالِ عام");
  assert.deepEqual(im("ورق", "ورق گالوانیزه 0.5"), { mat: "گالوانیزه", how: "title" }, "استثنای گفته‌شده بر عرف مقدم است");
  assert.deepEqual(im("ورق", "ورق 2 میل", { "جنس": "استنلس استیل" }), { mat: "استیل", how: "layer" });
  assert.deepEqual(im("تسمه", "تسمه پروانه A50"), { mat: "لاستیکی", how: "implied" }, "نشانهٔ واژه: تسمهٔ V لاستیکی است");
  assert.deepEqual(im("تسمه", "تسمه 5*40"), { mat: null, how: null }, "تسمهٔ بی‌نشانه: نامعلوم (ممکن است تسمهٔ فولادی باشد)");
  assert.deepEqual(im("فلنج", "فلنج 4 اینچ"), { mat: "آهنی", how: "implied" }, "نشانهٔ واحد: فلنج اینچی");
  assert.deepEqual(im("فلنج", "فلنج 110"), { mat: null, how: null });
  assert.deepEqual(im("لوله", "لوله 2 اینچ"), { mat: null, how: null }, "لوله عرفِ پذیرفته‌شده ندارد — حدس زده نمی‌شود");
  assert.deepEqual(im("واشر", "واشر سرسیلندر"), { mat: null, how: null }, "واشر: مسی و آهنی و لاستیکی — عرفِ یکتا نیست");
  assert.deepEqual(im("چسب", "چسب آهن"), { mat: null, how: null }, "چسب قاعده ندارد: «آهن» مادهٔ هدف است");
  assert.deepEqual(im("بلبرینگ", "بلبرینگ 6205"), { mat: null, how: null }, "جنس برای بلبرینگ تعیین‌کننده نیست");
});

test("نوع قلمِ مؤثر: جنس جزء نام فقط وقتی بازار را جدا می‌کند", () => {
  assert.equal(R.effectiveHead("ورق", HEAD_RULES["ورق"], "آهنی"), "ورق آهنی");
  assert.equal(R.effectiveHead("لوله", HEAD_RULES["لوله"], "پلی‌اتیلن"), "لوله پلی اتیلن", "نام با همان نرمال‌سازیِ کلیدِ جدول‌ها");
  assert.equal(R.effectiveHead("لوله", HEAD_RULES["لوله"], null), "لوله", "جنسِ نامعلوم: نامِ پایه");
  assert.equal(R.effectiveHead("پیچ", HEAD_RULES["پیچ"], "استیل"), "پیچ", "پیچ استیل همان صنفِ پیچ است — جنس لایه می‌ماند");
  assert.equal(R.effectiveHead("شیر", HEAD_RULES["شیر"], "برنجی / پلاستیکی"), "شیر", "جنسِ ترکیبی نام نمی‌سازد");
  assert.deepEqual(R.splitHead("ورق گالوانیزه", HEAD_RULES), { base: "ورق", mat: "گالوانیزه", rule: HEAD_RULES["ورق"] });
  assert.deepEqual(R.splitHead("لوله پلی اتیلن", HEAD_RULES).mat, "پلی‌اتیلن");
  assert.equal(R.splitHead("ورق آهنی", HEAD_RULES).base, "ورق");
  assert.equal(R.splitHead("پیچ", HEAD_RULES).mat, null);
  assert.equal(R.splitHead("فیلتر روغن", HEAD_RULES).rule, null);
});

test("جدول قاعده‌ها سالم است: هر نقش، جنس و واحدش شناخته", () => {
  const mats = new Set(R.MATERIAL_NAMES), units = new Set(R.UNIT_NAMES);
  let n = 0;
  for (const [k, r] of Object.entries(HEAD_RULES)) {
    n++;
    assert.equal(k, R.keyOf(k), `کلید «${k}» با keyOf ساخته شده`);
    assert.ok(r.r === "f" || r.r === "v", `${k}: نقش`);
    for (const m of [r.d, r.f, ...(r.c || []).map((c) => c[2])].filter(Boolean)) assert.ok(mats.has(m), `${k}: جنسِ ناشناختهٔ «${m}»`);
    for (const [cue, v] of r.c || []) {
      assert.ok(cue === "u" || cue === "w", `${k}: نوع نشانه`);
      if (cue === "u") assert.ok(units.has(v), `${k}: واحدِ ناشناختهٔ «${v}»`);
      else assert.equal(R.canonMaterial(v), null, `${k}: نشانهٔ «${v}» خودش جنس است (زائد)`);
    }
    if (r.d) assert.ok(!r.c && !r.f, `${k}: پیش‌فرضِ ثابت با نشانه جمع نمی‌شود`);
  }
  assert.ok(n > 150, `${n} نوع قلم`);
  assert.equal(HEAD_RULES["ورق"].d, "آهنی");
  /* هر شکلِ جنس به یک نام می‌رسد و هیچ شکلی دو جنس ندارد */
  const seen = new Map();
  for (const [canon, forms] of Object.entries(R.MATERIALS)) for (const f of forms) {
    const key = R.keyOf(f.replace(/^[~^]/, ""));
    assert.ok(!seen.has(key) || seen.get(key) === canon, `«${key}» هم ${seen.get(key)} است هم ${canon}`);
    seen.set(key, canon);
  }
  for (const [canon, u] of Object.entries(R.UNITS)) for (const f of u.forms) assert.equal(R.canonUnit(f.replace(/^~/, "")), canon, f);
});
