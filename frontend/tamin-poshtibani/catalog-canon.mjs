/* ============================================================
   یکسان‌سازیِ دوم فهرست اقلام — نام نوع قلم، «نمره» و مقاطع فلزی
   (مهر ۱۴۰۵؛ ممیزی دوم روی دیتابیس تولید، با تصمیم‌های مدیر)

   سه مشکل که catalog-rules.mjs حل نمی‌کرد:

   ۱. یک نوع قلم با چند نام. «آرماتور» و «میلگرد» یک کالایند (تصمیم مدیر: همه «میلگرد»)، و
      غلط‌های املایی («پیج»، «ترمیتال») سوابقِ همان کالا را زیر نام دیگری پنهان می‌کردند.
      HEAD_ALIASES نامِ پایه را به نام استاندارد می‌برد؛ جنسِ نامِ مؤثر («آرماتور آهنی» ←
      «میلگرد آهنی») از قاعدهٔ نامِ استاندارد می‌آید.

   ۲. «نمره» لایهٔ مستقل نیست. در پیچ و میلگرد قطر است (میلی‌متر)، در سیم و سرسیم سطح مقطع
      (میلی‌متر مربع)، در ناودانی و تیرآهن ارتفاعِ جان (سانتی‌متر)، در نبشی پهنای یال — پس
      «پیچ نمره ۱۶» و «پیچ M16» که یک پیچ‌اند، تا حالا در «عین قلم» دو قلم بودند. NOMRE برای هر
      نوع قلم می‌گوید نمره کدام لایه است؛ نوع قلمی که معنای نمره‌اش روشن نیست این‌جا نیامده و
      نمره‌اش می‌ماند تا مدیر تصمیم بگیرد (گزارش ممیزی).

   ۳. مقاطع فلزی با ابعادِ پشت‌سرِهم («ورق ۲۰×۱۰۰۰×۲۰۰۰»، «نبشی ۴۰×۴۰×۴»، «قوطی ۳×۵»). تصمیم مدیر:
        ورق           ← ضخامت + مساحت (متر مربع) — کوچک‌ترین بُعد ضخامت است
        قوطی، پروفیل  ← ضخامت + محیط (مقطع توخالی؛ محیطِ ۴۰×۴۰ = ۱۶۰ میلی‌متر)
        نبشی          ← ضخامت + «یال برابر»، یا «یال بزرگ» و «یال کوچک» وقتی یال‌ها برابر نیستند
      واحدِ بُعدِ بی‌واحد از بزرگیِ عدد خوانده می‌شود و «ضمنی» علامت می‌خورد (همان قاعدهٔ عام).

   این تبدیل‌ها هنگام خواندنِ فهرست (worker/catalog.js)، روی خروجی مدل و فرم کارشناس
   (worker/normalize.js:settle) و روی ساختارِ ذخیره‌شدهٔ قبلی اعمال می‌شوند؛ هم‌توان‌اند (دوباره
   زدنشان چیزی را عوض نمی‌کند)، پس دادهٔ کهنه و تازهٔ دیتابیس بی بازنویسی هم‌زبان‌اند.
   ============================================================ */
import { keyOf, nameOf, UNITS, parseQuant, num, splitHead, effectiveHead, materialOf, layerText } from "./catalog-rules.mjs";
import { HEAD_RULES } from "./catalog-head-rules.mjs";

/* ------------------------------------------------------------------ */
/* نام نوع قلم                                                          */
/* ------------------------------------------------------------------ */
/* نام پایهٔ هم‌معنا یا غلط ← نام استاندارد. فقط هم‌معنای «عیناً همان کالا» — ممیزی دوم هر جفت را با
   عنوان‌های دو طرف سنجید؛ جفتی که شک داشت در گزارش برای تصمیم مدیر آمده، نه این‌جا. */
export const HEAD_ALIASES = {
  "آرماتور": "میلگرد",          /* تصمیم مدیر، مهر ۱۴۰۵ */
  "ناودونی": "ناودانی",
  "پیج": "پیچ", "یپچ": "پیچ",
  "ترمیتال": "ترمینال",
  "قلاویر": "قلاویز",
  "شلنگ": "شیلنگ",
};
const ALIAS = new Map();
const refreshAliases = () => { ALIAS.clear(); for (const [a, b] of Object.entries(HEAD_ALIASES)) ALIAS.set(keyOf(a), nameOf(b)); };
refreshAliases();
/** برای آزمون و افزودنِ جفت‌های تازه از بیرون (ممیزی) */
export function setAliases(map) { for (const k of Object.keys(HEAD_ALIASES)) delete HEAD_ALIASES[k]; Object.assign(HEAD_ALIASES, map); refreshAliases(); }

/** نام پایهٔ استاندارد */
export const canonBase = (base) => ALIAS.get(keyOf(base)) || nameOf(base);
/** نام‌های پایه‌ای که به این نام استاندارد می‌رسند (خودش نه) */
export const aliasBases = (base) => { const k = keyOf(canonBase(base)); return [...ALIAS.entries()].filter(([, b]) => keyOf(b) === k).map(([a]) => a); };
const ruleOf = (base) => HEAD_RULES[keyOf(base)] || null;

/**
 * نوع قلمِ استاندارد برای یک نوع قلمِ ذخیره‌شده. `item` (اختیاری): {title، layers} — وقتی نامِ هم‌معنا
 * نقشِ جنس ندارد ولی نامِ استاندارد دارد («شلنگ» ← «شیلنگ لاستیکی»)، جنس از خودِ قلم خوانده می‌شود.
 */
export function canonHead(head, item = null) {
  const sh = splitHead(head, HEAD_RULES);
  const cb = canonBase(sh.base);
  if (keyOf(cb) === keyOf(sh.base)) return nameOf(head);
  const r = ruleOf(cb);
  if (!r || r.r !== "f") return cb;
  let mat = sh.mat;
  if (!mat && item) mat = materialOf({ head: cb, title: item.title || "", attrs: item.layers || {} }, r, null).mat;
  return effectiveHead(cb, r, mat);
}

/* ------------------------------------------------------------------ */
/* «نمره» ← لایهٔ واقعی                                                 */
/* ------------------------------------------------------------------ */
/* [لایه، واحدِ ضمنی]. واحدِ صریحِ خودِ مقدار («۸ اینچ»، «۵۰ میلی‌متر») بر واحد ضمنی مقدم است. */
const D = ["قطر", "میلی‌متر"], S = ["سطح مقطع", "میلی‌متر مربع"], HCM = ["ارتفاع", "سانتی‌متر"];
export const NOMRE = {
  /* قطرِ اسمی رزوه (M): پیچ نمره ۱۶ = M16 */
  "پیچ": D, "مهره": D, "پیچ و مهره": D, "پیچ و مهره و واشر": D, "واشر": D, "بولت": D, "انکر بولت": D, "رول بولت": D,
  "رولپلاک": D, "راد": D, "فنر رزوه": D, "فنر رزوه و قلاویز": D, "قلاویز": D, "حدیده": D, "مقره": D,
  "گریس خور": D, "سری گریس خور": D,
  /* قطرِ خودِ کالا به میلی‌متر. «سیم آهنی» (مفتول) جدا از «سیم»ِ برق است: کلیدِ «پایه + جنس» بر کلیدِ پایه مقدم است */
  "میلگرد": D, "میل": D, "سیم بکسل": D, "سیم آهنی": D, "کرپی": D, "الکترود": D, "مته": D, "سر مته": D,
  "گردبر": D, "سنگ انگشتی": D, "خار": D, "پکینگ": D, "گردگیر": D, "وارنیش": D,
  /* لوله و اتصالات: قطرِ اسمی (میلی‌متر؛ کسرِ اینچی مثل ۱/۲ اینچ خوانده می‌شود) */
  "لوله": D, "زانو": D, "سه راهی": D, "تبدیل": D, "رابط": D, "واسطه": D, "موف": D, "فلنج": D, "شیر": D, "شیر فلکه": D,
  "بست": D, "سر شیلنگی": D, "نری": D, "مادگی": D,
  /* بیرون ماندند تا تصمیم مدیر (گزارش ممیزی): پین («دنده ۱» نمره خوانده شده)، توری (قطرِ مفتول یا چشمه؟)،
     پولک، کوپلینگ (شمارهٔ مدل؟)، شیلنگ (میلی‌متر یا شمارهٔ داش؟)، زنجیر (قطرِ مفتول یا گام؟)،
     گلند (PG13.5 استانداردِ رزوه است نه میلی‌متر)، بکس و جعبه بکس (درایوِ اینچی یا دهانه؟)، آچار (دهانه)،
     آرگ، تسمه، اورینگ، قلاب، پالت، کانکتور، سنبه، بهلر، جنت، قرقری، متقاب. */
  /* سیم و ترمینالِ برق: سطح مقطعِ سیم */
  "سیم": S, "سر سیم": S, "ترمینال": S, "وایرشو": S, "کابلشو": S, "درپوش": S,
  /* مقاطعِ نوردشده: ارتفاعِ جان به سانتی‌متر (ناودانی نمره ۱۶ = ۱۶۰ میلی‌متر) */
  "ناودانی": HCM, "تیر آهن": HCM, "سپری": HCM,
  /* آچار فرانسه: طولِ ابزار به اینچ */
  "آچار فرانسه": ["طول", "اینچ"],
  /* روغن: نمرهٔ گرانروی (SAE) — نام است نه مقدار */
  "روغن": ["گرانروی", ""],
};
/* نبشی: نمرهٔ تا ۲۰ به سانتی‌متر است (نبشی ۵ = یال ۵۰ میلی‌متر)، بزرگ‌تر به میلی‌متر (نبشی ۳۰ = یال ۳۰) */
const ANGLE_CM_MAX = 20;
/* کلاس‌های استحکامِ پیچ و مهره (ISO 898) — در «نمره»ِ پیچ رده‌اند، نه قطر */
const GRADE = /^(4\.6|4\.8|5\.6|5\.8|6\.8|8\.8|9\.8|10\.9|12\.9)$/;

/* کسرِ اینچیِ سره (۱/۲، ۳/۴، ۵/۸ …) در قطرِ لوله و اتصال؛ «۲/۵» در نوشتار فارسی ممیز است */
const INCH_FRACTION = /^(\d+\s+)?([1-9]|1[0-5])\/(2|4|8|16|32)$/;
const fmt = (x) => String(Number(x.toPrecision(6)));

/* سطح مقطعِ استانداردِ سیم (میلی‌متر مربع) — «سیم مسی ارت ۵۰ mm» یعنی ۵۰ میلی‌متر مربع، ولی «سیم ۰٫۷
   میلی‌متر» قطرِ سیم‌جوش است و دست نمی‌خورد */
const WIRE_MM2 = new Set([0.5, 0.75, 1, 1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300]);
/** مقدارِ نمره → [لایه، مقدار] در لایهٔ مقصد، یا null اگر خوانا نیست */
function nomreValue(target, unit, raw) {
  const t = nameOf(layerText(raw) || "").replace(/[٫]/g, ".").trim();
  if (!t || !unit) return t ? [target, t] : null;
  if (UNITS[unit] && UNITS[unit].dim === "سطح") {
    /* «۵۰ mm» در سیم ارت: کوتاه‌نوشتِ رایجِ میلی‌متر مربع */
    const mm = /^(\d+(?:\.\d+)?)\s*(?:mm|میلی ?متر|میل)$/i.exec(t);
    if (mm && WIRE_MM2.has(+mm[1])) return [target, { v: mm[1], n: [+mm[1]], u: unit, i: 1 }];
    /* اندازهٔ طولیِ صریح در سیم قطرِ مفتول است («سیم لاکی ۰٫۷ میلی‌متر»)، نه سطح مقطع */
    const d = parseQuant("قطر", t, false);
    if (d && !d.list && d.u) return ["قطر", d];
  }
  /* واحدِ صریح در خودِ مقدار */
  const own = parseQuant(target, t, false);
  if (own && !own.list && own.u) return [target, own];
  if (unit === "میلی‌متر" && INCH_FRACTION.test(t.replace(/\s+/g, " "))) {
    const n = num(t, true); if (n != null) return [target, { v: t.replace(/\s+/g, " "), n: [n], u: "اینچ", i: 1 }];
  }
  const q = parseQuant(target, t, [{ u: unit, n: 1, lo: -Infinity, hi: Infinity }]);
  if (!q || q.list) return null;
  return [target, q];
}

/* ------------------------------------------------------------------ */
/* مقاطع فلزی                                                          */
/* ------------------------------------------------------------------ */
export const SHAPES = { "ورق": "sheet", "قوطی": "hollow", "پروفیل": "hollow", "نبشی": "angle" };

const qv = (layer, v) => (v && typeof v === "object" && !Array.isArray(v) && Array.isArray(v.n) ? v
  : typeof v === "string" ? (() => { const q = parseQuant(layer, v, false); return q && !q.list ? q : null; })() : null);
const lenK = (u) => (u && UNITS[u] && UNITS[u].dim === "طول" ? UNITS[u].k : null);
const quant = (n, u, implicit) => ({ v: fmt(n), n: [Number(n.toPrecision(8))], u, ...(implicit ? { i: 1 } : {}) });

/* واحدِ ابعادِ بی‌واحد از بزرگ‌ترین ضلع خوانده می‌شود — یک واحد برای همهٔ ضلع‌ها («۲۴۰×۸۰» نیمی
   میلی‌متر و نیمی سانتی‌متر نیست). واحدِ «ضمنی»ِ ذخیره‌شده هم دوباره سنجیده می‌شود: آن را عرفِ کلِ
   نوع قلم داده بود و در مقطع گاهی بی‌معناست («نبشی ۱/۵×۱/۵ میلی‌متر»).
     ورق: بزرگ‌ترین ضلع ≤ ۱۲ ← متر («ورق ۲×۱»)، زیر ۱۰۰ ← سانتی‌متر («۵۰×۵۰»)، وگرنه میلی‌متر («۱۵۲۰×۶۵۰»)
     مقطع (قوطی، پروفیل، نبشی): زیر ۲۰ ← سانتی‌متر («قوطی ۳×۵» = ۳۰×۵۰)، وگرنه میلی‌متر */
const sheetUnit = (mx) => (mx <= 12 ? "متر" : mx < 100 ? "سانتی‌متر" : "میلی‌متر");
const sectionUnit = (mx) => (mx < 20 ? "سانتی‌متر" : "میلی‌متر");
/** ضلع‌ها به میلی‌متر: {mm، implicit} — واحدِ صریح اگر هست، وگرنه حدسِ `pick` */
function sidesMm(q, ns, pick) {
  const own = q.u && !q.i && lenK(q.u) ? q.u : null;
  const u = own || pick(Math.max(...ns));
  return { mm: ns.map((x) => x * lenK(u)), implicit: !own };
}
/* ضخامت همیشه به میلی‌متر گفته می‌شود — مگر واحدِ صریحِ دیگری داشته باشد */
const thMm = (q, x) => (q.u && !q.i && lenK(q.u) ? x * lenK(q.u) : x);

function sheet(L) {
  const out = { ...L };
  const ab = qv("ابعاد", out["ابعاد"]);
  const t0 = qv("ضخامت", out["ضخامت"]);
  let area = null;
  if (ab && !ab.r && (ab.n.length === 2 || ab.n.length === 3)) {
    const ns = [...ab.n].sort((a, b) => a - b);
    if (ns.length === 3) {
      const th = ns.shift();
      if (!t0) out["ضخامت"] = quant(thMm(ab, th), "میلی‌متر", !(ab.u && !ab.i));
    }
    area = sidesMm(ab, ns, sheetUnit);
    delete out["ابعاد"];
  } else {
    const a = qv("طول", out["طول"]), b = qv("عرض", out["عرض"]);
    if (a && b && a.n.length === 1 && b.n.length === 1) {
      const sa = sidesMm(a, a.n, sheetUnit), sb = sidesMm(b, b.n, sheetUnit);
      area = { mm: [sa.mm[0], sb.mm[0]], implicit: sa.implicit || sb.implicit };
      delete out["طول"]; delete out["عرض"];
    }
  }
  if (area) out["مساحت"] = quant(area.mm[0] * area.mm[1] / 1e6, "متر مربع", area.implicit);
  return out;
}

function hollow(L) {
  const out = { ...L };
  const ab = qv("ابعاد", out["ابعاد"]);
  if (!ab || ab.r || ab.n.length < 2 || ab.n.length > 3) return out;
  const ns = [...ab.n].sort((a, b) => a - b);
  let th = null, len = null;
  if (ns.length === 3) {
    /* عددِ خیلی بزرگ‌تر طولِ شاخه است («پروفیل ۴۰×۴۰×۶۰۰»)، وگرنه کوچک‌ترین ضخامت */
    if (ns[2] >= 8 * ns[1]) len = ns.pop(); else th = ns.shift();
  }
  const s = sidesMm(ab, ns, sectionUnit);
  out["محیط"] = quant(2 * (s.mm[0] + s.mm[1]), "میلی‌متر", s.implicit);
  if (th != null && !qv("ضخامت", out["ضخامت"])) out["ضخامت"] = quant(thMm(ab, th), "میلی‌متر", !(ab.u && !ab.i));
  if (len != null && !out["طول"]) out["طول"] = quant(thMm(ab, len), "میلی‌متر", !(ab.u && !ab.i));
  delete out["ابعاد"];
  return out;
}

function legs(out, mm, implicit) {
  if (Math.abs(mm[0] - mm[1]) < 1e-9) out["یال برابر"] = quant(mm[0], "میلی‌متر", implicit);
  else { out["یال بزرگ"] = quant(Math.max(...mm), "میلی‌متر", implicit); out["یال کوچک"] = quant(Math.min(...mm), "میلی‌متر", implicit); }
}

function angle(L) {
  const out = { ...L };
  const ab = qv("ابعاد", out["ابعاد"]);
  if (ab && !ab.r && (ab.n.length === 2 || ab.n.length === 3)) {
    const ns = [...ab.n].sort((a, b) => a - b);
    const th = ns.length === 3 ? ns.shift() : null;
    /* ضخامت باید کمتر از نصفِ یال باشد؛ «نبشی نمره ۸ ×۱۰×۱۰» خوانا نیست و دست نمی‌خورد */
    if (th != null && th >= ns[0] / 2) return out;
    const s = sidesMm(ab, ns, sectionUnit);
    legs(out, s.mm, s.implicit);
    if (th != null && !qv("ضخامت", out["ضخامت"])) out["ضخامت"] = quant(thMm(ab, th), "میلی‌متر", !(ab.u && !ab.i));
    delete out["ابعاد"];
    return out;
  }
  /* «نبشی گالوانیزه ۴۰ میل» در فهرست ضخامتِ ۴۰ شده بود: ضخامتِ تنهای ≥ ۲۰ میلی‌متر پهنای یال است */
  const t = qv("ضخامت", out["ضخامت"]);
  const hasLeg = out["یال برابر"] || out["یال بزرگ"];
  const tm = t && t.n.length === 1 ? t.n[0] * (lenK(t.u) || 1) : null;
  if (tm != null && !hasLeg && tm >= 20) {
    legs(out, [tm, tm], !!t.i);
    delete out["ضخامت"];
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* ورودی                                                                */
/* ------------------------------------------------------------------ */
/**
 * لایه‌های یک قلم به زبانِ استاندارد. `head`: نوع قلم (مؤثر یا پایه؛ هم‌معنا هم می‌پذیرد).
 * هم‌توان است: canonLayers(h, canonLayers(h, L)) = canonLayers(h, L).
 */
export function canonLayers(head, layers) {
  const L = { ...(layers || {}) };
  if (!Object.keys(L).length) return L;
  const sh = splitHead(canonHead(head), HEAD_RULES);
  const base = canonBase(sh.base), eff = nameOf(canonHead(head));
  const bk = keyOf(base);
  /* قاعدهٔ «پایه + جنس» («سیم آهنی») بر قاعدهٔ پایه («سیم») مقدم است */
  const pickRule = (T) => T[eff] || T[base] || Object.entries(T).find(([k]) => keyOf(k) === keyOf(eff))?.[1] || Object.entries(T).find(([k]) => keyOf(k) === bk)?.[1];

  /* ۱) نمره */
  if (L["نمره"] != null && L["نمره"] !== "") {
    const nt = nameOf(layerText(L["نمره"])).replace(/[٫]/g, ".").trim();
    if (GRADE.test(nt) && (pickRule(NOMRE) || []).includes("قطر") && !L["رده"]) {
      /* «پیچ نمره ۸٫۸» کلاسِ استحکام است، نه قطر (پیچ M8 نمره ۸٫۸ رایج است) */
      L["رده"] = nt; delete L["نمره"];
    } else if (bk === keyOf("نبشی")) {
      if (!L["یال برابر"] && !L["یال بزرگ"]) {
        const ns = String(layerText(L["نمره"])).split(/\s*\/\s*|\s+/).map((x) => num(x, false)).filter((x) => x != null && x > 0);
        const v = ns.find((x) => x > ANGLE_CM_MAX) || ns[0];
        if (v != null) { L["یال برابر"] = v <= ANGLE_CM_MAX ? quant(v, "سانتی‌متر", true) : quant(v, "میلی‌متر", true); delete L["نمره"]; }
      }
    } else {
      const map = pickRule(NOMRE);
      if (map) {
        const hit = nomreValue(map[0], map[1], L["نمره"]);
        /* لایهٔ مقصد اگر از قبل مقدار دارد، نمره چیزِ دیگری است (مهرهٔ دنباله‌دار: رزوه ۱/۲ اینچ و
           شیلنگِ ۱۲) — می‌ماند و در گزارش ممیزی آمده */
        if (hit && (L[hit[0]] == null || L[hit[0]] === "")) { L[hit[0]] = hit[1]; delete L["نمره"]; }
      }
    }
  }
  /* ۲) مقطع */
  const shape = pickRule(SHAPES);
  const out = shape === "sheet" ? sheet(L) : shape === "hollow" ? hollow(L) : shape === "angle" ? angle(L) : L;
  /* ۳) ضخامتِ بی‌واحد میلی‌متر است (پیش‌فرضِ یکتای لایه) — «ورق استیل ۰/۱» */
  const t = out["ضخامت"];
  if (t && typeof t === "object" && !Array.isArray(t) && Array.isArray(t.n) && !t.u) out["ضخامت"] = { ...t, u: "میلی‌متر", i: 1 };
  return out;
}

/** ساختارِ یک قلم ({head، layers، …}) به زبانِ استاندارد — نام و لایه‌ها */
export function canonStructure(s, item = null) {
  if (!s || !s.head) return s;
  const head = canonHead(s.head, item || { title: s.title || "", layers: s.layers || {} });
  return { ...s, head, layers: canonLayers(head, s.layers || {}) };
}
