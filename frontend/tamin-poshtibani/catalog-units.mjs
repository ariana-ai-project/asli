/* ============================================================
   تبدیلِ واحدِ خرید به واحد مرجع — «ایستا» یا «پویا» (مهر ۱۴۰۵)

   هر نوع قلم یک واحد مرجع دارد و خریدِ هر واحدِ دیگر پیش از جمع به آن برده می‌شود
   (worker/catalog.js:rateFor). فایل ۴ برای هر (نوع قلم، واحد) یک نرخ ثابت دارد، ولی نرخ ثابت فقط
   وقتی درست است که ضریب از خودِ دو واحد بیاید:

     ایستا — «۱ تن = ۱۰۰۰ کیلوگرم»، «۱ دستگاه = ۱ عدد»، «۱ جفت = ۲ عدد». برای همهٔ اقلامِ نوع قلم یکی است.
     پویا  — «۱ ورق = ? کیلوگرم»، «۱ شاخه = ? متر»، «۱ دست = ? عدد»، «۱ قوطی = ? لیتر»: ضریب به اندازهٔ
             خودِ قلم بسته است — مساحت و ضخامتِ ورق، قطر و طولِ میلگرد، شمارِ یک دست — و برای هر قلم
             فرق می‌کند. ورقِ ۸ میلِ ۲ متر مربعی ۱۲۶ کیلوگرم است و ورقِ ۸ میلِ ۹ متر مربعی ۵۶۵؛ نرخ
             ثابتِ فایل ۴ (۱۱۰ کیلوگرم برای هر «ورق»ِ ورق آهنیِ بی نرخِ ویژه) هر دو را غلط می‌شمارد.

   برای تبدیل پویا این‌جا فرمول هست: از لایه‌های همان قلم (catalog-canon.mjs: ورق ← ضخامت + مساحت،
   قوطی ← محیط، نبشی ← یال‌ها، ناودانی و تیرآهن ← ارتفاع) ضریبِ ویژهٔ همان قلم ساخته می‌شود، با متنِ
   فرمول و مقدارهای جاگذاری‌شده تا کارشناس ببیند. هر تبدیل می‌تواند چند فرمول داشته باشد (فرمول ۱،
   ۲، ۳ — مثلاً وزنِ ورق از «مساحت» یا از «طول × عرض»)؛ نخستین فرمولی که لایه‌هایش هست به کار می‌رود.
   هیچ‌کدام نشد ← rate: null، و rateFor به نرخِ فایل برمی‌گردد ولی آن را «پویا با نرخ ثابتِ تقریبی»
   علامت می‌زند و می‌گوید کدام لایه کم است. فایل ۴ همین فرمول‌ها را برای ۱٬۴۸۵ (کد، واحد) یک بار
   حساب کرده بود (item_rates، «محاسبهٔ مهندسی»)؛ این‌جا همان حساب زنده است: قلمِ تازه یا لایه‌ای که
   کارشناس اصلاح کرده هم نرخِ درست می‌گیرد.

   یک منبع برای Worker (catalog.js، normalize.js، history.js) و پنل کارشناس (نمایشِ زنده با لایه‌های
   در حال ویرایش، از راه TP.units در expert.html).
   ============================================================ */
import { nameOf, keyOf, canonMaterial, toRef, splitHead, UNITS } from "./catalog-rules.mjs";
import { HEAD_RULES } from "./catalog-head-rules.mjs";

/* ------------------------------------------------------------------ */
/* واحدهای خرید                                                         */
/* ------------------------------------------------------------------ */
/* ستون «واحد سنجش» سوابق و «واحد» اکسل راهکاران — همهٔ ۲۳ واحدِ سوابقِ مهر ۱۴۰۵ و چند املای دیگر.
     measure — واحدِ سنجش: بُعد (همان نام‌های catalog-rules.mjs) و ضریب به واحدِ پایه (کیلوگرم، متر، متر مربع، لیتر)
     piece   — یک عدد از خودِ کالا: عدد، دستگاه، ورق، شاخه… با هم ۱ به ۱ (یک ورق = یک عدد)
     holder  — ظرف یا حلقه: در برابرِ واحدِ شمارشی یک عدد است (یک پاکت شیر = یک عدد)، در برابرِ واحدِ سنجش
               محتوایش (حجم، وزن، طول) — مالِ همان قلم
     pair    — دو عدد
     pack    — چند عدد در یک واحد (دست، بسته، جعبه): شمارِ درونش مالِ همان قلم است */
const MEASURE = (dim, k) => ({ kind: "measure", dim, k });
export const PURCHASE_UNITS = {
  "کیلو گرم": MEASURE("جرم", 1), "گرم": MEASURE("جرم", 0.001), "تن": MEASURE("جرم", 1000),
  "متر": MEASURE("طول", 1), "سانتی متر": MEASURE("طول", 0.01), "میلی متر": MEASURE("طول", 0.001),
  "متر مربع": MEASURE("سطح", 1),
  "لیتر": MEASURE("حجم", 1), "میلی لیتر": MEASURE("حجم", 0.001), "سی سی": MEASURE("حجم", 0.001), "متر مکعب": MEASURE("حجم", 1000),
  "عدد": { kind: "piece" }, "دستگاه": { kind: "piece" }, "ورق": { kind: "piece" }, "شاخه": { kind: "piece" }, "تخته": { kind: "piece" },
  "برگ": { kind: "piece" }, "جلد": { kind: "piece" }, "رشته": { kind: "piece" }, "فروند": { kind: "piece" }, "قطعه": { kind: "piece" },
  "قوطی": { kind: "holder" }, "شیشه": { kind: "holder" }, "پاکت": { kind: "holder" }, "کیسه": { kind: "holder" }, "سطل": { kind: "holder" },
  "گالن": { kind: "holder" }, "بشکه": { kind: "holder" }, "حلقه": { kind: "holder" }, "رول": { kind: "holder" }, "قرقره": { kind: "holder" },
  "کلاف": { kind: "holder" },
  "جفت": { kind: "pair" },
  "دست": { kind: "pack" }, "بسته": { kind: "pack" }, "جعبه": { kind: "pack" }, "کارتن": { kind: "pack" },
};
/* «کیلوگرم» و «کیلو گرم» یکی‌اند؛ نیم‌فاصله و فاصله هم */
const UNIT_KEY = new Map(Object.keys(PURCHASE_UNITS).map((u) => [keyOf(u).replace(/\s/g, ""), u]));
/** واحدِ خرید به نامِ این جدول، یا null اگر ناشناخته است */
export const purchaseUnit = (u) => UNIT_KEY.get(keyOf(u).replace(/\s/g, "")) || null;
const COUNT = { piece: 1, holder: 1, pair: 2 };
const FACT_OF = { "جرم": "kg", "طول": "m", "سطح": "m2", "حجم": "L" };

/* ------------------------------------------------------------------ */
/* چگالی و جدول‌های مقاطع                                               */
/* ------------------------------------------------------------------ */
/* چگالی (گرم بر سانتی‌متر مکعب = کیلوگرم بر متر مربع به ازای هر میلی‌متر ضخامت) به نام استاندارد جنس */
export const DENSITY = {
  "آهنی": 7.85, "گالوانیزه": 7.85, "گالوالوم": 7.85, "استیل": 7.93, "آلومینیومی": 2.7, "مسی": 8.96, "برنجی": 8.5,
  "برنزی": 8.8, "چدنی": 7.2, "PVC": 1.4, "UPVC": 1.45, "پلی‌اتیلن": 0.95, "پلی‌پروپیلن": 0.91,
};
const METALS = new Set(["آهنی", "گالوانیزه", "گالوالوم", "استیل", "آلومینیومی", "مسی", "برنجی", "برنزی", "چدنی"]);
/* وزن هر متر (کیلوگرم) به ارتفاعِ مقطع (میلی‌متر) — تیرآهن IPE و ناودانی UNP؛ «نمره ۱۶» = ۱۶۰ میلی‌متر،
   «ناودانی ۶» همان UNP 65. فایل ۴ همین جدول‌ها را به کار برده بود. */
export const IPE = { 80: 6.0, 100: 8.1, 120: 10.4, 140: 12.9, 160: 15.8, 180: 18.8, 200: 22.4, 220: 26.2, 240: 30.7, 270: 36.1, 300: 42.2,
  330: 49.1, 360: 57.1, 400: 66.3, 450: 77.6, 500: 90.7, 550: 106, 600: 122 };
export const UNP = { 50: 5.59, 65: 7.09, 80: 8.64, 100: 10.6, 120: 13.4, 140: 16.0, 160: 18.8, 180: 22.0, 200: 25.3, 220: 29.4, 240: 33.2,
  260: 37.9, 280: 41.8, 300: 46.2, 320: 59.5, 350: 60.6, 380: 63.1, 400: 71.8 };
/* لولهٔ فولادی به قطر اسمی (اینچ): [قطر خارجی میلی‌متر، وزن هر متر در سری میانیِ EN 10255] */
export const PIPE_NOMINAL = { 0.25: [13.5, 0.65], 0.375: [17.2, 0.85], 0.5: [21.3, 1.22], 0.75: [26.9, 1.58], 1: [33.7, 2.44], 1.25: [42.4, 3.14],
  1.5: [48.3, 3.61], 2: [60.3, 5.1], 2.5: [76.1, 6.51], 3: [88.9, 7.58], 4: [114.3, 10.8], 5: [139.7, 16.2], 6: [165.1, 19.2] };

/* خانوادهٔ شکلیِ نوع قلم، از نامِ پایه (پایه + جنس: «ورق آهنی» ← «ورق»). بی خانواده فقط لایه‌های
   مستقیم (وزن، حجم، طول، مساحت، شمار) به کار می‌آیند. */
const FAMILY = {
  "ورق": "sheet", "پلیت": "sheet", "صفحه پلیت": "sheet",
  "میلگرد": "bar", "میل": "bar", "میله": "bar", "مفتول": "bar",
  "لوله": "pipe", "قوطی": "hollow", "پروفیل": "hollow", "نبشی": "angle",
  "تیر آهن": "beam", "تیرآهن": "beam", "ناودانی": "channel",
  "سیم بکسل": "rope", "سیم": "wire", "کابل": "wire", "تسمه": "flat",
};
/* طولِ شاخهٔ استانداردِ بازار (متر) وقتی خرید «شاخه» است و قلم لایهٔ طول ندارد — فرضی آشکار که کارشناس
   می‌بیند. میلگرد و تیرآهن ۱۲ متر، بقیه ۶ متر (فایل ۴ برای ناودانی و لوله ۶ و برای تیرآهن ۱۲ گرفته بود). */
const BRANCH_M = { bar: 12, beam: 12, pipe: 6, hollow: 6, angle: 6, flat: 6, channel: 6 };
const STEEL_SECTIONS = new Set(["sheet", "bar", "hollow", "angle", "flat", "beam", "channel", "rope"]);

/* ------------------------------------------------------------------ */
/* مقدارِ لایه                                                          */
/* ------------------------------------------------------------------ */
export const fmt = (x) => (x == null || !Number.isFinite(x) ? "?" : Number(x.toPrecision(x >= 1000 ? 6 : 4)).toLocaleString("en-US", { maximumFractionDigits: 6 }));
/** یک لایهٔ کمّیِ تک‌عددی به واحد مرجعِ لایه (طول‌ها میلی‌متر، مساحت متر مربع، حجم لیتر، وزن کیلوگرم) */
function one(L, name) {
  const v = L && L[name];
  if (!v || typeof v !== "object" || Array.isArray(v) || !Array.isArray(v.n) || v.n.length !== 1 || v.r || !v.u) return null;
  const r = toRef(name, v);
  return r && r.n[0] > 0 ? { x: r.n[0], u: r.u, raw: v } : null;
}
/** سطح مقطعِ کلِ رسانا (میلی‌متر مربع) و چندرشته‌ای بودن: «۴×۵۰» (چهار رشتهٔ ۵۰) = ۲۰۰، «۱۶×۱» = ۱۶ تک‌رشته */
function crossSection(L) {
  const v = L && L["سطح مقطع"];
  if (!v || typeof v !== "object" || Array.isArray(v) || !Array.isArray(v.n) || v.r || !v.u || !UNITS[v.u] || UNITS[v.u].dim !== "سطح") return null;
  const x = v.n.reduce((a, n) => a * n, 1) * UNITS[v.u].k;   /* پایهٔ بُعد سطح میلی‌متر مربع است */
  return x > 0 ? { s: x, multi: v.n.length > 1 && Math.min(...v.n) > 1 } : null;
}
/** شمارِ اقلامِ یک بسته یا دست از لایهٔ «بسته بندی»: «۱۲ عددی»، «۲۶ پارچه»، «۲۴ تیکه» */
function packCount(L) {
  const v = L && L["بسته بندی"];
  const t = nameOf(typeof v === "string" ? v : v && v.v != null ? v.v : "").replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
  const m = /(\d+)\s*(عددی|عدد|تایی|پارچه|تیکه|قطعه)/.exec(t);
  return m && +m[1] > 0 ? +m[1] : null;
}
/** جنسِ گفته‌شدهٔ قلم: لایهٔ جنس، وگرنه جنسِ نامِ نوع قلم («ورق آهنی»، «کابل آلومینیومی»)؛ null اگر گفته نشده */
function statedMaterial(head, L) {
  const lv = L && L["جنس"];
  const m = canonMaterial(typeof lv === "string" ? lv : lv && lv.v);
  if (m && !/\//.test(m)) return { mat: m, implied: typeof lv === "object" && !!lv.i };
  const sh = splitHead(head, HEAD_RULES);
  if (sh.mat) return { mat: sh.mat, implied: false };
  const w = nameOf(head).split(" ");
  for (let i = w.length - 1; i >= 1; i--) { const c = canonMaterial(w.slice(i).join(" ")); if (c && !/\//.test(c)) return { mat: c, implied: false }; }
  return null;
}
/** جنس برای چگالی: گفته‌شده، وگرنه عرفِ خانواده (مقطعِ نوردشده آهنی، رسانای برق مسی) با علامتِ ضمنی */
function materialOf(head, L, family) {
  const s = statedMaterial(head, L);
  if (s) return s;
  if (STEEL_SECTIONS.has(family)) return { mat: "آهنی", implied: true };
  if (family === "wire") return { mat: "مسی", implied: true };
  return { mat: null, implied: false };
}
/** خانوادهٔ شکلیِ یک نوع قلم (sheet، bar، pipe، hollow، angle، flat، beam، channel، wire، rope) یا null */
export function familyOf(head, L) {
  const base = nameOf(splitHead(head, HEAD_RULES).base), w = base.split(" ");
  let f = null;
  for (let i = w.length; i >= 1 && !f; i--) f = FAMILY[w.slice(0, i).join(" ")] || null;
  if (!f) return null;
  const s = statedMaterial(head, L), mat = s && s.mat;
  /* «تسمه»ِ بی‌جنسِ فلزی تسمهٔ نقاله و دینام است نه تسمهٔ فولادی؛ «سیم آهنی» مفتولِ توپر است نه رسانای برق؛
     قوطی و پروفیلِ پلاستیکی مقطعِ فولادی نیست */
  if (f === "flat" && !METALS.has(mat)) return null;
  if (f === "wire" && mat === "آهنی") return "bar";
  if (f === "hollow" && mat && !METALS.has(mat)) return null;
  return f;
}

/* ------------------------------------------------------------------ */
/* واقعیت‌های هر قلم: مقدارِ یک واحد و نسبت‌های پیوسته                  */
/* ------------------------------------------------------------------ */
/* هر واقعیت فهرستِ راه‌هاست (فرمول ۱، ۲، …): {label: «وزن هر ورق = …»، src: سمتِ راستِ همان، value|null،
   expr: جاگذاری برای همین قلم، missing: لایه‌هایی که اگر بودند راه کار می‌کرد، direct: لایهٔ مستقیمِ محتوا}.
     kg، m، m2، L — وزن، طول، مساحت و حجمِ «یک واحد» (یک ورق، یک شاخه، یک قوطی)
     n            — شمارِ عدد در یک بسته یا دست
     kgm، kgm2، m2m — وزن هر متر، وزن هر متر مربع، مساحتِ هر متر (پهنا) */
function way(what, src, missing, value, expr, direct = false) {
  const ok = !missing.length && value > 0 && Number.isFinite(value);
  return { label: `${what} = ${src}`, src, missing, value: ok ? value : null, expr: ok ? expr : "", direct };
}

function facts(ctx, pieceUnit) {
  const L = ctx.layers || {}, head = nameOf(ctx.head), fam = familyOf(head, L);
  const { mat, implied } = materialOf(head, L, fam);
  const rho = mat ? DENSITY[mat] || null : null;
  const rhoTxt = rho ? `چگالیِ ${mat}${implied ? " (ضمنی)" : ""} ${fmt(rho)}` : "چگالیِ جنس";
  const rMiss = rho ? [] : ["جنس"];
  const miss = (...names) => names.filter((n) => !one(L, n));
  const pu = pieceUnit || "واحد";
  const F = { kg: [], m: [], m2: [], L: [], n: [], kgm: [], kgm2: [], m2m: [], family: fam, mat, rho };

  /* ---------- لایه‌های مستقیم ---------- */
  const w = one(L, "وزن"), len = one(L, "طول"), ar = one(L, "مساحت"), vol = one(L, "حجم"), t = one(L, "ضخامت"), wd = one(L, "عرض");
  F.kg.push(way(`وزن هر ${pu}`, "لایهٔ «وزن»", miss("وزن"), w && w.x, w && `${fmt(w.x)} کیلوگرم`, true));
  /* طولِ ۱۵ سانتیِ یک «شاخه» پهنای خرپاست نه طولِ شاخه (میلگرد بستر خرپایی ۱۵ سانتی) */
  const lenOk = len && (!BRANCH_M[fam] || len.x >= 500);
  if (fam !== "sheet") F.m.push(way(`طول هر ${pu}`, "لایهٔ «طول»", len ? (lenOk ? [] : ["طول (دست‌کم نیم متر)"]) : ["طول"], lenOk && len.x / 1000, lenOk && `${fmt(len.x / 1000)} متر`, true));
  if (BRANCH_M[fam] && pu === "شاخه") F.m.push(way(`طول هر شاخه`, `شاخهٔ استاندارد ${BRANCH_M[fam]} متر (قلم لایهٔ طول ندارد)`, [], BRANCH_M[fam], `${BRANCH_M[fam]} متر`));
  F.L.push(way(`حجم هر ${pu}`, "لایهٔ «حجم»", miss("حجم"), vol && vol.x, vol && `${fmt(vol.x)} لیتر`, true));
  const pc = packCount(L);
  F.n.push(way(`شمار در هر ${pu}`, "لایهٔ «بسته بندی» (… عددی، … پارچه، … تیکه)", pc ? [] : ["بسته بندی (با شمار)"], pc, `${fmt(pc)} عدد`, true));

  /* ---------- ورق: مساحت × ضخامت × چگالی ---------- */
  if (fam === "sheet") {
    const lw = one(L, "طول"), area = ar ? ar.x : lw && wd ? lw.x * wd.x / 1e6 : null;
    F.m2.push(way(`مساحت هر ${pu}`, "لایهٔ «مساحت»", miss("مساحت"), ar && ar.x, ar && `${fmt(ar.x)} متر مربع`, true));
    F.m2.push(way(`مساحت هر ${pu}`, "طول × عرض", miss("طول", "عرض"), lw && wd && lw.x * wd.x / 1e6, lw && wd && `${fmt(lw.x / 1000)} × ${fmt(wd.x / 1000)} = ${fmt(lw.x * wd.x / 1e6)} متر مربع`));
    F.kgm2.push(way("وزن هر متر مربع", `ضخامت (میلی‌متر) × ${rhoTxt}`, [...miss("ضخامت"), ...rMiss], t && rho && t.x * rho, t && rho && `${fmt(t.x)} × ${fmt(rho)} = ${fmt(t.x * rho)} کیلوگرم`));
    F.kg.push(way(`وزن هر ${pu}`, `مساحت (متر مربع) × ضخامت (میلی‌متر) × ${rhoTxt}`, [...(area ? [] : ["مساحت"]), ...miss("ضخامت"), ...rMiss],
      area && t && rho && area * t.x * rho, area && t && rho && `${fmt(area)} × ${fmt(t.x)} × ${fmt(rho)} = ${fmt(area * t.x * rho)} کیلوگرم`));
    /* ورقِ نواری (فلاشینگ، «۳۰ سانتی») که به متر خریده می‌شود — بی لایهٔ عرض هم نشان داده می‌شود تا کارشناس بداند چه کم است */
    F.kgm.push(way("وزن هر متر", `عرض (متر) × ضخامت (میلی‌متر) × ${rhoTxt}`, [...miss("عرض", "ضخامت"), ...rMiss], wd && t && rho && wd.x / 1000 * t.x * rho,
      wd && t && rho && `${fmt(wd.x / 1000)} × ${fmt(t.x)} × ${fmt(rho)} = ${fmt(wd.x / 1000 * t.x * rho)} کیلوگرم`));
  } else {
    F.m2.push(way(`مساحت هر ${pu}`, "لایهٔ «مساحت»", miss("مساحت"), ar && ar.x, ar && `${fmt(ar.x)} متر مربع`, true));
    if (len && wd) F.m2.push(way(`مساحت هر ${pu}`, "طول × عرض", [], len.x * wd.x / 1e6, `${fmt(len.x / 1000)} × ${fmt(wd.x / 1000)} = ${fmt(len.x * wd.x / 1e6)} متر مربع`, true));
  }
  /* پهنا: متر ↔ متر مربع برای نوار، توری، عایق و تسمهٔ نقاله */
  if (wd && fam !== "flat") F.m2m.push(way("مساحت هر متر", "عرض (متر)", [], wd.x / 1000, `${fmt(wd.x / 1000)} متر مربع`));

  /* ---------- وزن هر متر در مقاطعِ طولی ---------- */
  const d = one(L, "قطر"), dOut = one(L, "قطر خارجی");
  if (fam === "bar") {
    const v = d && rho ? Math.PI / 4 * d.x * d.x * rho / 1000 : null;
    F.kgm.push(way("وزن هر متر", `۰٫۷۸۵ × قطر² (میلی‌متر) × ${rhoTxt} ÷ ۱۰۰۰ (فولاد: قطر² ÷ ۱۶۲)`, [...miss("قطر"), ...rMiss], v,
      v && `0.785 × ${fmt(d.x)}² × ${fmt(rho)} ÷ 1000 = ${fmt(v)} کیلوگرم`));
  }
  if (fam === "pipe") {
    /* قطرِ اینچی قطرِ اسمی است نه خارجی: ۲ اینچ = ۶۰٫۳ میلی‌متر */
    const nomIn = d && d.raw.u === "اینچ" ? d.raw.n[0] : null, nom = nomIn != null ? PIPE_NOMINAL[nomIn] : null;
    const D = dOut ? dOut.x : nom ? nom[0] : d ? d.x : null;
    const v = D && t && rho && D > t.x ? Math.PI * (D - t.x) * t.x * rho / 1000 : null;
    F.kgm.push(way("وزن هر متر", `π × (قطر خارجی − ضخامت) × ضخامت × ${rhoTxt} ÷ ۱۰۰۰`, [...(D ? [] : ["قطر"]), ...miss("ضخامت"), ...rMiss], v,
      v && `3.1416 × (${fmt(D)} − ${fmt(t.x)}) × ${fmt(t.x)} × ${fmt(rho)} ÷ 1000 = ${fmt(v)} کیلوگرم`));
    const steel = ["آهنی", "گالوانیزه"].includes(mat);
    F.kgm.push(way("وزن هر متر", "جدولِ لولهٔ فولادیِ استاندارد (EN 10255، سری میانی) از روی قطر اسمیِ اینچی", nom ? (steel ? [] : ["جنس فولادی"]) : ["قطر اسمی (اینچ)"],
      nom && steel && nom[1], nom && `${fmt(nomIn)} اینچ ← ${fmt(nom[1])} کیلوگرم`));
  }
  if (fam === "hollow") {
    const p = one(L, "محیط"), v = p && t && rho ? p.x * t.x * rho / 1000 : null;
    F.kgm.push(way("وزن هر متر", `≈ محیط (میلی‌متر) × ضخامت (میلی‌متر) × ${rhoTxt} ÷ ۱۰۰۰`, [...miss("محیط", "ضخامت"), ...rMiss], v,
      v && `${fmt(p.x)} × ${fmt(t.x)} × ${fmt(rho)} ÷ 1000 = ${fmt(v)} کیلوگرم`));
  }
  if (fam === "angle") {
    const eq = one(L, "یال برابر"), a = eq || one(L, "یال بزرگ"), b = eq || one(L, "یال کوچک");
    const v = a && b && t && rho && t.x < Math.min(a.x, b.x) ? (a.x + b.x - t.x) * t.x * rho / 1000 : null;
    F.kgm.push(way("وزن هر متر", `(یال بزرگ + یال کوچک − ضخامت) × ضخامت × ${rhoTxt} ÷ ۱۰۰۰`, [...(a && b ? [] : ["یال"]), ...miss("ضخامت"), ...rMiss], v,
      v && `(${fmt(a.x)} + ${fmt(b.x)} − ${fmt(t.x)}) × ${fmt(t.x)} × ${fmt(rho)} ÷ 1000 = ${fmt(v)} کیلوگرم`));
  }
  if (fam === "flat") {
    const v = wd && t && rho ? wd.x * t.x * rho / 1000 : null;
    F.kgm.push(way("وزن هر متر", `عرض (میلی‌متر) × ضخامت (میلی‌متر) × ${rhoTxt} ÷ ۱۰۰۰`, [...miss("عرض", "ضخامت"), ...rMiss], v,
      v && `${fmt(wd.x)} × ${fmt(t.x)} × ${fmt(rho)} ÷ 1000 = ${fmt(v)} کیلوگرم`));
  }
  if (fam === "beam" || fam === "channel") {
    const h = one(L, "ارتفاع"), T = fam === "beam" ? IPE : UNP, name = fam === "beam" ? "IPE" : "UNP";
    const k = h ? Object.keys(T).map(Number).reduce((best, x) => (Math.abs(x - h.x) < Math.abs(best - h.x) ? x : best), Infinity) : null;
    const hit = k != null && Math.abs(k - h.x) <= 0.12 * k ? k : null;
    F.kgm.push(way("وزن هر متر", `جدولِ ${fam === "beam" ? "تیرآهن" : "ناودانی"} ${name} از روی ارتفاع (نمره)`, hit ? [] : ["ارتفاع"], hit && T[hit],
      hit && `ارتفاع ${fmt(h.x)} میلی‌متر ← ${name} ${hit}: ${fmt(T[hit])} کیلوگرم`));
  }
  if (fam === "wire") {
    /* روکشِ سیمِ تک‌رشته حدود ۲۵٪ وزنِ مس است (فایل ۴ هم «۰٫۰۱۱۲ × سطح مقطع» گرفته بود)؛ کابلِ چندرشته با
       عایقِ هر رشته و روکشِ بیرونی حدود ۵۰٪ */
    const cs = crossSection(L), r = rho || DENSITY["مسی"], kf = cs && cs.multi ? 1.5 : 1.25, v = cs ? cs.s * r * kf / 1000 : null;
    F.kgm.push(way("وزن هر متر", `≈ سطح مقطع رسانا (میلی‌متر مربع) × ${rhoTxt} × ضریبِ روکش (تک‌رشته ۱٫۲۵، چندرشته ۱٫۵) ÷ ۱۰۰۰`, cs ? [] : ["سطح مقطع"], v,
      v && `${fmt(cs.s)} × ${fmt(r)} × ${kf} ÷ 1000 = ${fmt(v)} کیلوگرم`));
  }
  if (fam === "rope") {
    /* استرندِ هفت‌رشته‌ای (پیش‌تنیدگی، ASTM A416: ۰٫۶ اینچ = ۱٫۱۰ کیلوگرم در متر) از طنابِ شش‌رشته‌ایِ با مغزی پرتر است؛
       فایل ۴ هر دو را میلگردِ توپر گرفته بود (۱٫۴۳ کیلوگرم) */
    const nv = L["نوع"], strand = /استرند|strand/i.test(typeof nv === "string" ? nv : nv && nv.v ? String(nv.v) : "");
    const k = strand ? 0.00475 : 0.004, v = d ? k * d.x * d.x : null;
    F.kgm.push(way("وزن هر متر", strand ? "≈ ۰٫۰۰۴۷۵ × قطر² (میلی‌متر) — استرندِ هفت‌رشته‌ای" : "≈ ۰٫۰۰۴ × قطر² (میلی‌متر) — سیم بکسلِ شش‌رشته‌ای، تقریبی", miss("قطر"), v,
      v && `${k} × ${fmt(d.x)}² = ${fmt(v)} کیلوگرم`));
  }
  /* وزن یک واحد = طولِ یک واحد × وزن هر متر — با نخستین طولی که هست (لایه، وگرنه شاخهٔ استاندارد) */
  const lm = F.m.find((x) => x.value != null);
  if (F.kgm.length && (lm || F.m.length)) {
    const L0 = lm || F.m[0];
    for (const km of F.kgm) {
      F.kg.push(way(`وزن هر ${pu}`, `طول (${L0.src}) × وزن هر متر (${km.src})`, [...(lm ? [] : L0.missing), ...km.missing],
        lm && km.value != null && lm.value * km.value, lm && km.value != null && `${fmt(lm.value)} × ${fmt(km.value)} = ${fmt(lm.value * km.value)} کیلوگرم`));
    }
  }
  return F;
}

/* ------------------------------------------------------------------ */
/* تبدیل                                                                 */
/* ------------------------------------------------------------------ */
/**
 * تبدیلِ «۱ واحدِ خرید → ؟ واحد مرجع» برای یک قلم. `ctx`: {head: نوع قلم، layers: لایه‌های استاندارد}.
 * خروجی: {type: «static»|«dynamic»|«unknown»، rate: ضریب یا null، basis: متن کوتاه، formulas: راه‌های
 * پویا به ترتیب (هر کدام {label، value، expr، missing})، used: شمارهٔ راهِ به‌کاررفته، missing: لایه‌هایی که
 * اگر بودند فرمول کار می‌کرد}. «unknown» یعنی یکی از دو واحد در جدول نیست و rateFor همان نرخ فایل را می‌گیرد.
 */
export function convert(ctx, from, to) {
  const fu = purchaseUnit(from), tu = purchaseUnit(to);
  const f = fu && PURCHASE_UNITS[fu], t = tu && PURCHASE_UNITS[tu];
  const res = (type, rate, basis, formulas = [], used = -1) => ({ type, rate, basis, formulas, used,
    missing: rate == null ? [...new Set(formulas.flatMap((x) => x.missing))] : [] });
  if (!f || !t) return res("unknown", null, "");
  if (fu === tu) return res("static", 1, "همان واحد");
  /* ---------- ایستا: ضریب از خودِ دو واحد ---------- */
  if (f.kind === "measure" && t.kind === "measure" && f.dim === t.dim) return res("static", f.k / t.k, `۱ ${fu} = ${fmt(f.k / t.k)} ${tu}`);
  if (COUNT[f.kind] && COUNT[t.kind]) return res("static", COUNT[f.kind] / COUNT[t.kind], `۱ ${fu} = ${fmt(COUNT[f.kind] / COUNT[t.kind])} ${tu}`);
  /* ---------- پویا: ضریب از لایه‌های همین قلم ---------- */
  const F = facts(ctx, f.kind === "measure" ? tu : fu);
  /* rate = scale × مقدارِ راه، یا scale ÷ مقدار (inv) */
  const pick = (ways, scale, inv) => {
    const formulas = ways.map((w) => {
      const value = w.value == null ? null : inv ? scale / w.value : w.value * scale;
      const tail = value != null && (scale !== 1 || inv) ? ` ← ۱ ${fu} = ${fmt(value)} ${tu}` : "";
      return { label: w.label, missing: w.missing, value, expr: w.expr + tail };
    });
    const used = formulas.findIndex((x) => x.value != null && x.value > 0 && Number.isFinite(x.value));
    return res("dynamic", used >= 0 ? formulas[used].value : null, used >= 0 ? formulas[used].label : "", formulas, used);
  };
  /* بسته و دست فقط با لایهٔ وزن یا حجمِ محتوای خودش به سنجش می‌رود («الکترود بستهٔ ۵ کیلویی»)، نه با هندسهٔ یک
     عددِ درونش: طولِ ۲۰ سانتیِ بستِ کمربندی طولِ بسته نیست */
  const perUnit = (kind, dim) => (kind !== "pack" ? F[FACT_OF[dim]] : dim === "جرم" || dim === "حجم" ? F[FACT_OF[dim]].filter((w) => w.direct) : []);
  /* شمارشی، ظرف یا بسته ← سنجش: مقدارِ یک واحد */
  if (t.kind === "measure" && f.kind !== "measure") return pick(perUnit(f.kind, t.dim), (COUNT[f.kind] || 1) / t.k, false);
  if (f.kind === "measure" && t.kind !== "measure") return pick(perUnit(t.kind, f.dim), f.k / (COUNT[t.kind] || 1), true);
  /* سنجش ← سنجشِ بُعدی دیگر: وزن هر متر، وزن هر متر مربع، پهنا؛ وگرنه نسبتِ دو مقدارِ یک واحد (وزن و حجمِ یک قوطی) */
  if (f.kind === "measure" && t.kind === "measure") {
    const key = { "طول>جرم": ["kgm", false], "جرم>طول": ["kgm", true], "سطح>جرم": ["kgm2", false], "جرم>سطح": ["kgm2", true],
      "طول>سطح": ["m2m", false], "سطح>طول": ["m2m", true] }[`${f.dim}>${t.dim}`];
    if (key && F[key[0]].length) return pick(F[key[0]], f.k / t.k, key[1]);
    const a = F[FACT_OF[f.dim]].find((w) => w.value != null), b = F[FACT_OF[t.dim]].find((w) => w.value != null);
    const ratio = a && b ? [way(`${b.label.split(" = ")[0]} ÷ ${a.label.split(" = ")[0]}`, `${b.src} ÷ ${a.src}`, [], b.value / a.value, `${fmt(b.value)} ÷ ${fmt(a.value)}`)] : [];
    return pick(ratio, f.k / t.k, false);
  }
  /* بسته یا دست ↔ شمارشی: شمارِ درونِ یک واحد */
  if (f.kind === "pack" && COUNT[t.kind]) return pick(F.n, 1 / COUNT[t.kind], false);
  if (COUNT[f.kind] && t.kind === "pack") return pick(F.n, COUNT[f.kind], true);
  return res("dynamic", null, "", []);
}

/** نامِ نوعِ تبدیل برای نمایش */
export const TYPE_FA = { static: "ایستا", dynamic: "پویا", unknown: "—" };
