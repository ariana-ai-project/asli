/* ============================================================
   قواعد یکسان‌سازی فهرست اقلام — واحدها و جنس‌ها
   (مهر ۱۴۰۵؛ ممیزی کل فهرست اقلام)

   یک منبع برای سه جا: ورودگر مرورگر (catalog-import.js، از راه TP.rules)، Worker
   (worker/catalog.js و normalize.js — برای تطبیق «عین قلم» و تمیز کردن خروجی مدل)
   و اسکریپت ورود اول. چون همه همین فایل را می‌خوانند، مرورگر و سرور نمی‌توانند
   دو جور قضاوت کنند.

   دو مشکل عام که این فایل حل می‌کند:

   ۱. عدد و واحد در یک رشته، با املاهای ناهمگون. فهرست اقلام «۲ میلی‌متر» را یک رشته
      نگه می‌داشت و عنوان‌ها «۲ میل»، «2mm»، «2 MM»، «۲ میلیمتری» می‌نویسند؛ اینچ هم
      «اینچ»، «"» یا «اینچی» است. لایهٔ کمّی (قطر، طول، ضخامت …) حالا فقط عدد است و
      واحدش جدا و استاندارد، و مقایسه و تبدیل بر پایهٔ همین واحد انجام می‌شود:
      «۲ میلی‌متر» و «۰٫۲ سانتی‌متر» یکی‌اند. عددِ بی‌واحد، واحدِ رایجِ همان ویژگی در
      همان نوع قلم را می‌گیرد («ورق ۲» ← ضخامت ۲ میلی‌متر) و «ضمنی» علامت می‌خورد.

   ۲. ویژگی ضمنی. در زبان خرید مقدارِ رایج گفته نمی‌شود و فقط استثنا نام برده می‌شود:
      «ورق ۲ میل» یعنی ورق آهنی و «ورق گالوانیزه» استثناست. جنس‌ها این‌جا یکسان
      می‌شوند (آهن، فولاد، فلز ← «آهنی»)، و عرفِ هر نوع قلم — این‌که جنس جزء نامش است
      («ورق آهنی») یا فقط گونه، و جنسِ گفته‌نشده‌اش چیست — در catalog-head-rules.mjs،
      با روندِ کنترل کیفیتش. جنسی که عرفِ پذیرفته‌شده‌ای ندارد نامعلوم می‌ماند.
   ============================================================ */

/* ---------- ابزار متن ---------- */
const ascii = (s) => String(s == null ? "" : s)
  .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
  .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
export const nameOf = (x) => String(x == null ? "" : x).replace(/ي/g, "ی").replace(/ك/g, "ک")
  .replace(/[‌‎‏]/g, " ").replace(/\s+/g, " ").trim();
/* کلید مقایسه: همان worker/catalog.js:keyOf */
export const keyOf = (x) => ascii(nameOf(x)).toLowerCase();

/* ------------------------------------------------------------------ */
/* جنس‌ها                                                               */
/* ------------------------------------------------------------------ */
/* نام استاندارد (صفتی — همان که در نام نوع قلم می‌آید: «ورق آهنی») ← شکل‌هایی که در فایل
   اقلام و عنوان‌ها دیده شده. آهن، فولاد و فلز در زبان خرید یکی‌اند (فولاد کربنی معمولی)؛
   فولادِ آلیاژی یا سخت‌کاری‌شده «رده» است، نه جنسی جدا.

   خواندن جنس از عنوان فقط برای نوع قلمی است که جنس برایش «جنسِ خودِ کالا»ست (نقش family
   یا variant در catalog-head-rules.mjs: ورق، لوله، پیچ …). در ابزار و مصرفی، نامِ ماده در
   عنوان «مادهٔ هدف» است نه جنس — «چسب آهن»، «دیسک برش استیل»، «مته چوب» — و آن‌جا جنس از
   عنوان خوانده نمی‌شود. در همان نوع قلم‌ها هم:
     - صورت صفتی و اصطلاح («آهنی»، «گالوانیزه»، «پلی اتیلن») هر جای عنوان جنس است؛
     - اسمِ خالیِ ماده («^»: «آهن»، «مس»، «بتن») فقط وقتی درست بعد از نام نوع قلم بیاید:
       «ورق آهن» ← آهنی، «لوله مس» ← مسی، ولی در «بوش پمپ بتن» و «پیچ کاسه نمد» اسمِ ماده
       به کالای دیگری در عنوان برمی‌گردد و جنس نیست؛
     - شکلِ «~»دار هرگز از عنوان خوانده نمی‌شود، فقط در مقدارِ لایه: «سیاه» رنگ است، «pe» و
       «ss» تکه‌ای از شمارهٔ فنی‌اند. */
export const MATERIALS = {
  "آهنی": ["^آهن", "آهنی", "^فولاد", "فولادی", "فولاد کربنی", "^فلز", "فلزی", "~سیاه", "~st37", "~st52"],
  "گالوانیزه": ["گالوانیزه", "گالوانیزه گرم", "گالوانیزه سرد", "گالوانیز", "گالولانیزه"],
  "گالوالوم": ["گالوالوم"],
  "استیل": ["استیل", "ضدزنگ", "ضد زنگ", "استنلس", "استنلس استیل", "استیل ضد زنگ", "~ss"],
  "آلومینیومی": ["^آلومینیوم", "آلومینیومی", "^آلمینیوم", "آلمینیومی", "^الومینیوم", "~آلو"],
  "مسی": ["^مس", "مسی"],
  "برنجی": ["^برنج", "برنجی"],
  "برنزی": ["^برنز", "برنزی", "فسفربرنز", "فسفر برنز"],
  "چدنی": ["^چدن", "چدنی"],
  "پلی‌اتیلن": ["پلی اتیلن", "پلی اتیلنی", "~pe", "~hdpe"],
  /* «پلیکا» نام تجاریِ لولهٔ PVC است که نام عام شده (تصمیم مدیر، مهر ۱۴۰۵) */
  "PVC": ["pvc", "پی وی سی", "پلیکا", "پولیکا", "پلی کا"],
  "UPVC": ["upvc"],
  "پلی‌پروپیلن": ["پلی پروپیلن", "~pp"],
  "پلاستیکی": ["^پلاستیک", "پلاستیکی"],
  "لاستیکی": ["لاستیکی", "~لاستیک", "^کائوچو", "کائوچویی", "کائوچوئی"],
  "ویتون": ["ویتون"],
  "EPDM": ["epdm"],
  "نئوپرن": ["نئوپرن"],
  "سیلیکونی": ["^سیلیکون", "سیلیکونی"],
  "تفلونی": ["^تفلون", "تفلونی", "~ptfe"],
  "گرافیتی": ["^گرافیت", "گرافیتی"],
  "نسوز": ["نسوز"],
  "کاغذی": ["^کاغذ", "کاغذی"],
  "نمدی": ["^نمد", "نمدی"],
  "پارچه‌ای": ["^پارچه", "پارچه ای"],
  "برزنتی": ["^برزنت", "برزنتی"],
  "کنفی": ["^کنف", "کنفی"],
  "پشمی": ["^پشم", "پشمی"],
  "پلی‌استر": ["پلی استر"],
  "پلی‌اورتان": ["پلی اورتان", "پلی یورتان"],
  "اپوکسی": ["اپوکسی"],
  "فایبرگلاس": ["فایبرگلاس", "فایبر گلاس"],
  "کامپوزیت": ["کامپوزیت", "شیشه / کامپوزیت"],
  "فیبری": ["^فیبر", "فیبری"],
  "چوبی": ["^چوب", "چوبی"],
  "MDF": ["mdf", "ام دی اف"],
  "پلی‌وود": ["پلی وود"],
  "چوب‌پنبه‌ای": ["^چوب پنبه", "چوب پنبه ای"],
  "شیشه‌ای": ["~شیشه", "شیشه ای"],
  "سرامیکی": ["^سرامیک", "سرامیکی"],
  "بتنی": ["^بتن", "بتنی"],
  "سیمانی": ["~سیمان", "سیمانی"],
  "گچی": ["~گچ", "گچی"],
  "سنگی": ["~سنگ", "سنگی"],
  "گرانیتی": ["^گرانیت", "گرانیتی"],
  "یونولیت": ["یونولیت"],
  "فومی": ["^فوم", "فومی"],
  "اسفنجی": ["^اسفنج", "اسفنجی"],
  "الماسه": ["^الماس", "الماسه"],
  "کاربیدی": ["~tc", "^کاربید", "کاربیدی", "تنگستن کاربید"],
  "HSS": ["hss"],
  "کرومی": ["^کروم", "کرومی", "آبکاری کروم"],
  "بنتونیت": ["^بنتونیت"],
};
const MAT_VALUE = new Map(), MAT_TITLE = [], MAT_NOUN = [];
for (const [canon, forms] of Object.entries(MATERIALS)) {
  MAT_VALUE.set(keyOf(canon), canon);
  for (const f of forms) {
    const mark = /^[~^]/.test(f) ? f[0] : "", k = keyOf(mark ? f.slice(1) : f);
    MAT_VALUE.set(k, canon);
    if (!mark) MAT_TITLE.push([k, canon]);
    else if (mark === "^") MAT_NOUN.push([k, canon]);
  }
}
/* بلندترین شکل اول: «فولاد کربنی» پیش از «فولاد»، «چوب پنبه» پیش از «چوب» */
MAT_TITLE.sort((a, b) => b[0].length - a[0].length);
MAT_NOUN.sort((a, b) => b[0].length - a[0].length);
export const MATERIAL_NAMES = Object.keys(MATERIALS);

/** مقدار لایهٔ جنس/پوشش → نام استاندارد؛ ترکیبی («برنج / پلاستیک») هر جزء جدا؛ ناشناخته → null */
export function canonMaterial(raw) {
  const s = keyOf(raw); if (!s) return null;
  if (MAT_VALUE.has(s)) return MAT_VALUE.get(s);
  const parts = s.split(/\s*[/،,+]\s*|\s+و\s+/).filter(Boolean);
  if (parts.length > 1) { const c = parts.map((p) => MAT_VALUE.get(p)); if (c.every(Boolean)) return [...new Set(c)].join(" / "); }
  return null;
}

/* روکش همهٔ مجموعه را می‌پوشاند: «رابط سینی کابل گالوانیزه» رابطِ گالوانیزه است. «روکش‌دار» خالی
   جنس نیست (کابل روکش‌دار همان کابل مسی است) و در جدول جنس‌ها نیامده. */
const COATINGS = new Set(["گالوانیزه", "گالوالوم"]);

/**
 * جنسی که در عنوانِ یک قلم گفته شده، یا null — فقط برای نوع قلمی که جنس برایش جنسِ خودِ کالاست
 * (بالا را ببینید). `head`: نام نوع قلم؛ واژه‌های خودِ آن جنس حساب نمی‌شوند («فسفر برنز»).
 * `objects` (اختیاری): نام همهٔ نوع قلم‌ها. صفتِ جنس وقتی درست بعد از نامِ کالای دیگری بیاید
 * جنسِ همان کالاست نه این قلم: «بلبرینگ شافت محرک دنده برنجی» (دندهٔ برنجی)، «پین راهنما صفحه
 * لاستیکی»، «بوش … بیل لاستیکی» (بیلِ چرخ‌لاستیکی). روکش از این قاعده بیرون است.
 */
export function materialInTitle(title, head = "", objects = null) {
  const words = keyOf(title).replace(/[()\-_/\\*×,.،:"]+/g, " ").split(" ").filter(Boolean);
  const hw = keyOf(head).split(" ").filter(Boolean), hs = ` ${hw.join(" ")} `;
  let at = -1;
  for (let i = 0; hw.length && i + hw.length <= words.length; i++) if (hw.every((w, j) => words[i + j] === w)) { at = i; break; }
  const inHead = (i, n) => at >= 0 && i >= at && i + n <= at + hw.length;
  const ownerBefore = (i) => {
    if (!objects || i === 0 || inHead(i - 1, 1)) return false;
    return objects.has(words[i - 1]) || (i > 1 && !inHead(i - 2, 1) && objects.has(`${words[i - 2]} ${words[i - 1]}`));
  };
  for (let i = 0; i < words.length; i++) {
    for (const [k, canon] of MAT_TITLE) {
      const kw = k.split(" ");
      if (!kw.every((w, j) => words[i + j] === w) || hs.includes(` ${k} `) || inHead(i, kw.length)) continue;
      if (!COATINGS.has(canon) && ownerBefore(i)) break;
      return canon;
    }
  }
  /* اسمِ خالی: درست بعد از نام نوع قلم (با «ی» میانجیِ جداشده: «لوله‌ی مس») */
  if (at < 0) return null;
  let k0 = at + hw.length;
  if (words[k0] === "ی") k0++;
  const rest = ` ${words.slice(k0).join(" ")} `;
  for (const [k, canon] of MAT_NOUN) if (!hs.includes(` ${k} `) && rest.startsWith(` ${k} `)) return canon;
  return null;
}

/* ------------------------------------------------------------------ */
/* واحدها                                                               */
/* ------------------------------------------------------------------ */
/* نام استاندارد ← بُعد، ضریب به واحد پایهٔ همان بُعد، و شکل‌های نوشتاری (همه از
   ممیزی عنوان‌ها و لایه‌های فایل اقلام). «~» یعنی فقط وقتی مقدارِ یک لایهٔ کمّی
   است پذیرفته می‌شود: «m»، «a»، «v» در عنوان‌ها تقریباً همیشه بخشی از شمارهٔ فنی‌اند
   («6V-3823»، «4m-5943»، «-11A»). */
export const UNITS = {
  "میلی‌متر": { dim: "طول", k: 1, forms: ["میلی متر", "میلیمتر", "میلیمتری", "میلی متری", "میل", "میلی", "mm", "م.م", "م م"] },
  "سانتی‌متر": { dim: "طول", k: 10, forms: ["سانتی متر", "سانتیمتر", "سانتیمتری", "سانتی متری", "سانتی", "سانت", "cm"] },
  "متر": { dim: "طول", k: 1000, forms: ["متر", "متری", "~m"] },
  "اینچ": { dim: "طول", k: 25.4, forms: ["اینچ", "اینچی", "inch", "~in", "\"", "″", "”", "''"] },
  "فوت": { dim: "طول", k: 304.8, forms: ["فوت", "ft"] },
  "میکرون": { dim: "طول", k: 0.001, forms: ["میکرون", "میکرومتر", "µm"] },
  "میلی‌متر مربع": { dim: "سطح", k: 1, forms: ["میلی متر مربع", "میلیمتر مربع", "mm2", "mm²"] },
  "سانتی‌متر مربع": { dim: "سطح", k: 100, forms: ["سانتی متر مربع", "سانتیمتر مربع", "cm2", "cm²"] },
  "متر مربع": { dim: "سطح", k: 1e6, forms: ["متر مربع", "مترمربع", "m2", "m²"] },
  "میلی‌لیتر": { dim: "حجم", k: 0.001, forms: ["میلی لیتر", "میلیلیتر", "ml", "سی سی", "cc"] },
  "لیتر": { dim: "حجم", k: 1, forms: ["لیتر", "لیتری", "lit", "lt", "~l"] },
  "متر مکعب": { dim: "حجم", k: 1000, forms: ["متر مکعب", "مترمکعب", "m3", "m³", "کوبیک"] },
  "گالن": { dim: "حجم", k: 3.785, forms: ["گالن", "گالنی", "gal"] },
  "گرم": { dim: "جرم", k: 1, forms: ["گرم", "گرمی", "gr", "~g"] },
  "کیلوگرم": { dim: "جرم", k: 1000, forms: ["کیلوگرم", "کیلو گرم", "کیلوگرمی", "کیلو", "کیلویی", "کیلوئی", "kg"] },
  "تن": { dim: "جرم", k: 1e6, forms: ["تن", "تنی", "ton"] },
  "وات": { dim: "توان", k: 1, forms: ["وات", "واتی", "~w"] },
  "کیلووات": { dim: "توان", k: 1000, forms: ["کیلووات", "کیلو وات", "kw"] },
  "اسب بخار": { dim: "توان", k: 745.7, forms: ["اسب بخار", "اسب", "hp"] },
  "کیلوولت‌آمپر": { dim: "توان ظاهری", k: 1000, forms: ["کیلوولت آمپر", "کیلو ولت آمپر", "kva"] },
  "ولت": { dim: "ولتاژ", k: 1, forms: ["ولت", "ولتی", "~v"] },
  "کیلوولت": { dim: "ولتاژ", k: 1000, forms: ["کیلوولت", "کیلو ولت", "kv"] },
  "آمپر": { dim: "جریان", k: 1, forms: ["آمپر", "آمپری", "~a"] },
  "آمپرساعت": { dim: "بار الکتریکی", k: 1, forms: ["آمپرساعت", "آمپر ساعت", "ah"] },
  "بار": { dim: "فشار", k: 1, forms: ["بار", "bar"] },
  "psi": { dim: "فشار", k: 0.0689476, forms: ["psi"] },
  "اتمسفر": { dim: "فشار", k: 1.01325, forms: ["اتمسفر", "atm"] },
  "دور بر دقیقه": { dim: "دور", k: 1, forms: ["دور بر دقیقه", "دور", "rpm"] },
  "درجه": { dim: "زاویه", k: 1, forms: ["درجه", "°"] },
  /* توانِ گرمایی همان توان است (وات): بخاری «۱۰ هزار کیلوکالری» و «۱۱٫۶ کیلووات» یک اندازه‌اند —
     تا مهر ۱۴۰۵ بُعدِ جدایی بود و با کیلووات هم‌سنج نمی‌شد (ممیزی دوم) */
  "کیلوکالری بر ساعت": { dim: "توان", k: 1.163, forms: ["کیلوکالری", "کیلو کالری"] },
  "BTU/h": { dim: "توان", k: 0.29307107, forms: ["btu/h", "btu"] },
  "نفر": { dim: "نفر", k: 1, forms: ["نفر", "نفره"] },
  "گیگابایت": { dim: "داده", k: 1, forms: ["گیگابایت", "گیگ", "gb"] },
  "ترابایت": { dim: "داده", k: 1024, forms: ["ترابایت", "tb"] },
  "میکروفاراد": { dim: "ظرفیت خازنی", k: 1, forms: ["میکروفاراد"] },
  "کیلواهم": { dim: "مقاومت", k: 1, forms: ["کیلواهم", "کیلو اهم"] },
  /* شمارش‌ها — هرکدام بُعد خودش، تا «۳۲ رشته» با «۳۲ کانال» برابر نشود */
  "رشته": { dim: "رشته", k: 1, forms: ["رشته"] },
  "کانال": { dim: "کانال", k: 1, forms: ["کانال"] },
  "کلید": { dim: "کلید", k: 1, forms: ["کلید"] },
};
const UNIT_FORM = new Map(), UNIT_TITLE = [];
for (const [canon, u] of Object.entries(UNITS)) {
  UNIT_FORM.set(keyOf(canon), canon);
  for (const f of u.forms) {
    const risky = f.startsWith("~"), k = keyOf(risky ? f.slice(1) : f);
    UNIT_FORM.set(k, canon);
    if (!risky) UNIT_TITLE.push([k, canon]);
  }
}
export const UNIT_NAMES = Object.keys(UNITS);
/** یک شکلِ نوشتاری → نام استاندارد واحد، یا null */
export const canonUnit = (form) => UNIT_FORM.get(keyOf(form)) || null;

/* لایه‌های کمّی و بُعدِ مجازشان. «ظرفیت» هر بُعدی می‌تواند باشد (تن، لیتر، نفر، BTU…).
   «نمره»، «اندازه»، «گرانروی»، «مدل» و «شماره فنی» کمّی نیستند: M8، ۱/۲ اینچِ رزوه،
   10W40 و ۸۰۰ کلاس، نام‌اند نه مقدار — فقط رقم‌هایشان لاتین می‌شود. */
export const QUANT = {
  "قطر": ["طول"], "قطر داخلی": ["طول"], "قطر خارجی": ["طول"], "طول": ["طول"], "عرض": ["طول"],
  "ارتفاع": ["طول"], "ضخامت": ["طول"], "ابعاد": ["طول"], "سطح مقطع": ["سطح"],
  "حجم": ["حجم"], "وزن": ["جرم"], "توان": ["توان", "توان ظاهری"], "ولتاژ": ["ولتاژ"],
  "جریان": ["جریان"], "فشار کاری": ["فشار"], "دور": ["دور"], "زاویه": ["زاویه"], "ظرفیت": ["*"],
  /* مقاطع فلزی (تصمیم مدیر، مهر ۱۴۰۵ — catalog-canon.mjs): ورق ← ضخامت + مساحت، مقطعِ توخالی
     (قوطی، پروفیل) ← ضخامت + محیط، نبشی ← یالِ برابر یا یالِ بزرگ و کوچک */
  "مساحت": ["سطح"], "محیط": ["طول"], "یال برابر": ["طول"], "یال بزرگ": ["طول"], "یال کوچک": ["طول"],
};
/* لایه‌هایی که فایل اقلام ندارد ولی یکسان‌سازی می‌سازد، با نام انگلیسی برای پرامپت مدل */
export const EXTRA_LAYERS = [
  { fa: "مساحت", en: "area" }, { fa: "محیط", en: "perimeter" },
  { fa: "یال برابر", en: "equal_leg" }, { fa: "یال بزرگ", en: "long_leg" }, { fa: "یال کوچک", en: "short_leg" },
];
/* «نمره» لایهٔ مستقل نیست (تصمیم مدیر، مهر ۱۴۰۵): در هر نوع قلم همان قطر، سطح مقطع، ارتفاع یا یال
   است و catalog-canon.mjs به همان لایه می‌بردش. در فهرستِ «افزودن لایه» نمی‌آید؛ نمرهٔ نوع قلمی که
   هنوز معنایش تصمیم نشده، تا آن تصمیم همان‌طور خوانده و ذخیره می‌شود. */
export const HIDDEN_LAYERS = new Set(["نمره"]);
/** فهرستِ لایه‌های استاندارد برای ویرایش و مدل: فایل اقلام، بی لایه‌های پنهان، به‌علاوهٔ لایه‌های یکسان‌سازی */
export const layerList = (fileLayers) => {
  const seen = new Set(), out = [];
  for (const l of [...(fileLayers || []), ...EXTRA_LAYERS]) {
    const fa = nameOf(l && l.fa);
    if (!fa || seen.has(fa) || HIDDEN_LAYERS.has(fa)) continue;
    seen.add(fa); out.push({ fa, en: l.en || "" });
  }
  return out;
};
/* واحد پیش‌فرضِ یک لایه وقتی نه عنوان و نه عرفِ همان نوع قلم چیزی نمی‌گوید. فقط جایی که
   عرف یکتاست: ضخامتِ بی‌واحد میلی‌متر است، ولی «طول»ِ بی‌واحد برای پیچ میلی‌متر و برای لوله
   متر است — پس طول این‌جا نیست و از عرفِ همان نوع قلم می‌آید. */
export const LAYER_DEFAULT_UNIT = {
  "ضخامت": "میلی‌متر", "ولتاژ": "ولت", "جریان": "آمپر", "فشار کاری": "بار", "دور": "دور بر دقیقه",
  "زاویه": "درجه", "حجم": "لیتر", "سطح مقطع": "میلی‌متر مربع",
  "مساحت": "متر مربع", "محیط": "میلی‌متر", "یال برابر": "میلی‌متر", "یال بزرگ": "میلی‌متر", "یال کوچک": "میلی‌متر",
};

/* ------------------------------------------------------------------ */
/* واحد مرجعِ هر لایه (ممیزی دوم، مهر ۱۴۰۵)                              */
/* ------------------------------------------------------------------ */
/* هر لایهٔ کمّی یک واحد مرجع دارد و مقدارهای دیگر با ضریبِ همین جدولِ UNITS به آن برده می‌شوند:
   ضخامتِ «۰٫۲ سانتی‌متر» و «2mm» هر دو «۲ میلی‌متر»اند. تطبیق «عین قلم» و «قلم انتخابی» بر همین
   است (layerKey به واحد پایهٔ بُعد می‌برد، که با واحد مرجع یک ضریب ثابت فاصله دارد) و پنل مقدارِ
   هر لایه را به واحد مرجعش هم نشان می‌دهد. واحد مرجعِ طول‌ها میلی‌متر است (عرف نقشه‌های صنعتی)
   و مساحت متر مربع (تصمیم مدیر). «ظرفیت» هر بُعدی می‌تواند باشد، پس مرجعش به بُعدِ مقدار است. */
export const LAYER_REF = {
  "قطر": "میلی‌متر", "قطر داخلی": "میلی‌متر", "قطر خارجی": "میلی‌متر", "طول": "میلی‌متر", "عرض": "میلی‌متر",
  "ارتفاع": "میلی‌متر", "ضخامت": "میلی‌متر", "ابعاد": "میلی‌متر", "محیط": "میلی‌متر",
  "یال برابر": "میلی‌متر", "یال بزرگ": "میلی‌متر", "یال کوچک": "میلی‌متر",
  "سطح مقطع": "میلی‌متر مربع", "مساحت": "متر مربع", "حجم": "لیتر", "وزن": "کیلوگرم", "توان": "کیلووات",
  "ولتاژ": "ولت", "جریان": "آمپر", "فشار کاری": "بار", "دور": "دور بر دقیقه", "زاویه": "درجه",
};
export const DIM_REF = {
  "طول": "میلی‌متر", "سطح": "متر مربع", "حجم": "لیتر", "جرم": "تن", "توان": "کیلووات", "توان ظاهری": "کیلوولت‌آمپر",
  "ولتاژ": "ولت", "جریان": "آمپر", "فشار": "بار", "دور": "دور بر دقیقه", "زاویه": "درجه", "داده": "گیگابایت",
};
/** واحد مرجعِ یک مقدارِ لایه — بُعدِ خودِ مقدار باید با مرجع بخواند (توانِ ظاهری به کیلووات نمی‌رود) */
export function refUnitOf(layer, q) {
  if (!q || !q.u || !UNITS[q.u]) return null;
  const dim = UNITS[q.u].dim;
  const r = LAYER_REF[layer];
  if (r && UNITS[r].dim === dim) return r;
  return DIM_REF[dim] || Object.keys(UNITS).find((u) => UNITS[u].dim === dim && UNITS[u].k === 1) || q.u;
}
/** مقدارِ کمّی به واحد مرجعِ لایه: {n: [عددها], u} — یا null اگر واحد ناشناخته است */
export function toRef(layer, q) {
  const u = refUnitOf(layer, q); if (!u) return null;
  const f = UNITS[q.u].k / UNITS[u].k;
  return { n: q.n.map((x) => Number((x * f).toPrecision(8))), u, same: u === q.u };
}

/* ------------------------------------------------------------------ */
/* مقدار کمّی                                                           */
/* ------------------------------------------------------------------ */
/**
 * عدد با املاهای فارسی: «۱/۵» در واحد متریک ممیز است (۱٫۵) ولی در اینچ کسر (نیم)؛
 * «1.1/2» و «1 1/2» یعنی یک و نیم اینچ.
 */
export function num(tok, inch) {
  const t = ascii(tok).replace(/٫/g, ".").trim();
  let m;
  if ((m = /^(\d+)[.\s]+(\d+)\/(\d+)$/.exec(t))) return +m[1] + +m[2] / +m[3];          /* 1.1/2 · 1 1/2 */
  if ((m = /^(\d+)\/(\d+)$/.exec(t))) return inch ? +m[1] / +m[2] : +`${m[1]}.${m[2]}`; /* 1/2 اینچ · 1/5 متر */
  if (/^\d+(\.\d+)?$/.test(t)) return +t;
  return null;
}
const NUM = "\\d+(?:[.\\s]+\\d+\\/\\d+|[./]\\d+)?";
const SEP = /\s*[×x*]\s*/i;

/* عدد برای نمایش: کسرِ اینچی همان‌طور («۱ ۱/۲»)، متریک با ممیز («۱٫۵» نه «۱/۵» که دوپهلوست) */
const showNum = (tok, n, inch) => (inch && /\//.test(tok) ? ascii(tok).replace(/\./, " ").replace(/\s+/g, " ").trim() : String(Math.round(n * 1e6) / 1e6));

/**
 * یک مقدارِ تک (بی «/») → {v, n, u, i?, r?} یا null. `conv`: فهرست واحدهای عرفیِ همین لایه در
 * همین نوع قلم، به ترتیب رواج، با بازهٔ مقدارهای صریحِ هرکدام: [{u, lo, hi}] (unitConventions).
 */
function parseOne(layer, raw, conv) {
  let s = ascii(nameOf(raw)).replace(/٫/g, ".").replace(/^(ضخامت|قطر داخلی|قطر خارجی|قطر|طول|عرض|ارتفاع)\s*/, "").trim();
  if (!s) return null;
  /* «M18» در قطر: قطر اسمی رزوهٔ متریک، یعنی ۱۸ میلی‌متر — نمایش همان «M18» می‌ماند */
  const mm = /^m\s*(\d+(?:\.\d+)?)$/i.exec(s);
  if (mm && /^قطر/.test(layer)) return { v: `M${mm[1]}`, n: [+mm[1]], u: "میلی‌متر" };
  /* واحد در انتها (بلندترین شکل اول)؛ شکلِ «~»دار این‌جا مجاز است چون مقدار از قبل مال یک لایهٔ کمّی است */
  let unit = "";
  const low = keyOf(s);
  const hit = [...UNIT_FORM.keys()].filter((f) => low.endsWith(f)).sort((a, b) => b.length - a.length)
    .find((f) => { const before = low.slice(0, low.length - f.length); return /[\d\s)"]$/.test(before); });
  if (hit) { unit = UNIT_FORM.get(hit); s = s.slice(0, s.length - hit.length).trim(); }
  if (!unit && /["”″]\s*$/.test(s)) { unit = "اینچ"; s = s.replace(/["”″]\s*$/, "").trim(); }
  if (!unit && /^["”″]/.test(s)) { unit = "اینچ"; s = s.replace(/^["”″]\s*/, "").trim(); }
  /* بُعدِ واحد باید با لایه بخواند؛ «قطر ۱۰۵ کیلوگرم» عدد لایه نیست، متن می‌ماند */
  const dims = QUANT[layer] || ["*"];
  if (unit && !dims.includes("*") && !dims.includes(UNITS[unit].dim)) return null;
  let parts, range = false;
  if (new RegExp(`^${NUM}(\\s*[×x*]\\s*${NUM})+$`, "i").test(s)) parts = s.split(SEP);
  else if (new RegExp(`^${NUM}\\s*-\\s*${NUM}$`).test(s)) { parts = s.split(/\s*-\s*/); range = true; }
  else if (new RegExp(`^${NUM}$`).test(s)) parts = [s];
  else return null;
  let i = 0;
  if (!unit) { unit = pickUnit(layer, parts, conv); if (unit) i = 1; }
  const inch = unit === "اینچ";
  const n = parts.map((p) => num(p, inch));
  if (n.some((x) => x == null)) return null;
  const out = { v: parts.map((p, k) => showNum(p, n[k], inch)).join(range ? "-" : "×"), n, u: unit };
  if (i) out.i = 1;
  if (range) out.r = 1;
  return out;
}

/**
 * واحدِ عددِ بی‌واحد: واحدی که عدد را در بازهٔ مقدارهای صریحِ همان لایه در همان نوع قلم می‌نشاند
 * («لوله ۲» ← ۲ اینچ؛ «لوله ۱۰۲۰» ← ۱۰۲۰ میلی‌متر، نه ۱۰۲۰ اینچ). اگر چند واحد جا شوند، رایج‌تر؛
 * اگر هیچ‌کدام، پیش‌فرضِ لایه (فقط جایی که عرف یکتاست) — وگرنه نامعلوم، و حدس زده نمی‌شود.
 */
function pickUnit(layer, parts, conv) {
  if (conv === false) return "";   /* فقط واحدِ صریح */
  const cands = (conv || []).filter((c) => {
    const inch = c.u === "اینچ";
    const xs = parts.map((p) => num(p, inch));
    if (xs.some((x) => x == null)) return false;
    return xs.every((x) => x >= c.lo / 1.5 && x <= c.hi * 1.5);
  });
  if (cands.length) return cands[0].u;
  return (conv && conv.length) ? "" : (LAYER_DEFAULT_UNIT[layer] || "");
}

/**
 * مقدار یک لایهٔ کمّی → {v: متنِ عددی (× میان ابعاد، - در بازه)، n: [عددها]، u: واحد استاندارد
 * یا ""، i: ۱ اگر واحد ضمنی است، r: ۱ اگر بازه است}؛ چندمقداری («۲۲۰ ولت / ۱۲ ولت» در ترانس)
 * → {list: [...]}. اگر شکلش عددی نیست («کلاس ۸۰۰»، «M18» در لایه‌ای جز قطر) null برمی‌گردد
 * تا متن دست نخورد. `conv`: عرفِ همین لایه در همین نوع قلم (بالا)، یا false برای «فقط صریح».
 */
export function parseQuant(layer, raw, conv) {
  const parts = String(raw == null ? "" : raw).split(/\s+\/\s+/);
  if (parts.length > 1) {
    const list = parts.map((p) => parseOne(layer, p, conv));
    return list.every(Boolean) ? { list } : null;
  }
  return parseOne(layer, raw, conv);
}

/**
 * عرفِ واحدِ هر لایه در هر نوع قلم، از مقدارهای صریح: {نوع قلم: {لایه: [{u, n, lo, hi}]}} — به
 * ترتیب رواج، با بازهٔ مقدارهای دیده‌شده به همان واحد (برای pickUnit).
 */
export function unitConventions(items) {
  const acc = new Map();
  for (const { head, layer, q } of items) {
    for (const x of q && q.list ? q.list : [q]) {
      if (!x || !x.u || x.i) continue;
      const k = `${head}\u0001${layer}`;
      if (!acc.has(k)) acc.set(k, {});
      const c = acc.get(k)[x.u] = acc.get(k)[x.u] || { u: x.u, n: 0, lo: Infinity, hi: -Infinity };
      c.n++; for (const v of x.n) { c.lo = Math.min(c.lo, v); c.hi = Math.max(c.hi, v); }
    }
  }
  const out = {};
  for (const [k, c] of acc) {
    const [head, layer] = k.split("\u0001");
    (out[head] = out[head] || {})[layer] = Object.values(c).sort((a, b) => b.n - a.n);
  }
  return out;
}

/** مقدارِ پایهٔ یک لایهٔ کمّی (به واحد پایهٔ بُعدش) — برای مقایسه؛ null اگر واحد ناشناخته است */
export function baseOf(q) {
  if (!q || !q.u || !UNITS[q.u]) return null;
  return { dim: UNITS[q.u].dim, n: q.n.map((x) => x * UNITS[q.u].k) };
}

/** دو مقدار کمّی یکی‌اند؟ «۲ میلی‌متر» = «۰٫۲ سانتی‌متر». با واحد ناشناخته، فقط اگر متن و واحد عیناً یکی باشد. */
export function sameQuant(a, b) {
  if ((a && a.list) || (b && b.list)) {
    const x = (a && a.list) || [a], y = (b && b.list) || [b];
    return x.length === y.length && x.every((q, k) => sameQuant(q, y[k]));
  }
  const x = baseOf(a), y = baseOf(b);
  if (!x || !y) return !!(a && b && a.v === b.v && (a.u || "") === (b.u || ""));
  if (x.dim !== y.dim || x.n.length !== y.n.length || !!a.r !== !!b.r) return false;
  return x.n.every((v, k) => Math.abs(v - y.n[k]) <= 1e-6 * Math.max(1, Math.abs(v), Math.abs(y.n[k])));
}

/* ------------------------------------------------------------------ */
/* مقدار استانداردِ لایه                                                */
/* ------------------------------------------------------------------ */
/* لایهٔ کمّی: {v, n, u, i?, r?} (بالا) یا آرایه‌ای از همین برای چندمقداری — عدد و واحد جدا،
   واحد با نام استاندارد. جنسِ ضمنی: {v: جنس، i: ۱}. بقیه، و مقدارِ کمّیِ ناخوانا: متن. */

/**
 * متنِ یک مقدار → {num: بخشِ عددی همان‌طور که نوشته شده، unit: واحدِ استانداردِ انتهایش یا ""}.
 * بخش عددی دست نمی‌خورد، چون معنای «1/2» به واحد بستگی دارد (نیم اینچ، یا ۱٫۲ متریک).
 */
export function splitUnit(raw) {
  const s = ascii(nameOf(raw)).replace(/٫/g, ".").trim(), low = keyOf(s);
  const hit = [...UNIT_FORM.keys()].filter((f) => low.endsWith(f)).sort((a, b) => b.length - a.length)
    .find((f) => /[\d\s)"]$/.test(low.slice(0, low.length - f.length)));
  if (hit) return { num: s.slice(0, s.length - hit.length).trim(), unit: UNIT_FORM.get(hit) };
  if (/["”″]\s*$/.test(s)) return { num: s.replace(/["”″]\s*$/, "").trim(), unit: "اینچ" };
  if (/^["”″]/.test(s)) return { num: s.replace(/^["”″]\s*/, "").trim(), unit: "اینچ" };
  return { num: s, unit: "" };
}

/** متنِ خام یا مقدارِ استاندارد → مقدارِ استاندارد (اگر عددی نیست، همان متن) */
export function quantLayer(layer, raw, conv) {
  if (raw && typeof raw === "object") return raw;
  const q = parseQuant(layer, raw, conv);
  return !q ? String(raw == null ? "" : raw).trim() : q.list ? q.list : q;
}

/**
 * عدد و واحدِ جدا (فرم کارشناس، خروجی مدل) → مقدارِ استاندارد، یا null اگر عدد نیست.
 * `unit` هر املایی می‌تواند باشد («میل»، «mm»، «"»)؛ واحدِ داخل خودِ متن بر آن مقدم است.
 * `implicit`: واحد گفته نشده و از عرف آمده.
 */
export function quantWith(layer, text, unit, implicit) {
  const u = unit ? canonUnit(unit) || (UNITS[unit] ? unit : null) : null;
  if (unit && !u) return null;
  /* بُعدِ واحد باید با لایه بخواند — همان قاعدهٔ واحدِ درون متن («یال ۵ کیلوگرم» عدد لایه نیست) */
  const dims = QUANT[layer];
  if (u && dims && !dims.includes("*") && !dims.includes(UNITS[u].dim)) return null;
  const q = parseQuant(layer, text, u ? [{ u, n: 1, lo: -Infinity, hi: Infinity }] : false);
  if (!q) return null;
  const fix = (x) => { const y = { ...x }; delete y.i; if (implicit && y.u) y.i = 1; return y; };
  return q.list ? q.list.map(fix) : fix(q);
}

/** نمایش یک مقدار لایه: «۲ میلی‌متر»، «آهنی (ضمنی)» */
export const showLayer = (x) => (x == null ? "" : typeof x === "string" ? x
  : Array.isArray(x) ? x.map(showLayer).join(" / ") : x.list ? x.list.map(showLayer).join(" / ")
  : `${x.v}${x.u ? " " + x.u : ""}${x.i ? " (ضمنی)" : ""}`);
/** متنِ مقدار بی‌علامتِ «ضمنی» — برای پرامپت و جستجو */
export const layerText = (x) => (x == null ? "" : typeof x === "string" ? x
  : Array.isArray(x) ? x.map(layerText).join(" / ") : `${x.v}${x.u ? " " + x.u : ""}`);

/* کلیدِ متن (لایهٔ غیرکمّی): «10*20»، «10×20» و «10 x 20» یکی‌اند؛ جداکنندهٔ فهرست هم («ترمز / کفشک» =
   «ترمز، کفشک»)؛ و املای واحد درون متن استاندارد می‌شود («1/2"» = «1/2 اینچ» = «1/2 اینچی») — همان
   مشکلِ عامِ املای واحد، این بار در لایه‌ای که عدد و واحدش نام است نه مقدار (اندازهٔ رزوه، نمره). */
const UNIT_SAFE = new Map(UNIT_TITLE);
const textKey = (v) => keyOf(v).replace(/(\d)(?=[^\d\s./×*x-])/g, "$1 ").split(" ").map((w) => UNIT_SAFE.get(w) || w).join(" ")
  .replace(/\s*[،,]\s*/g, "/").replace(/\s/g, "").replace(/[×*]/g, "x");
const round6 = (x) => Number(x.toPrecision(6));
function quantKey(q) {
  if (!q.u || !UNITS[q.u]) return `?${textKey(q.v)}`;
  const U = UNITS[q.u];
  return `${U.dim}:${q.n.map((x) => round6(x * U.k)).join(q.r ? "-" : "x")}`;
}

/**
 * کلیدِ مقایسهٔ یک لایه — «عین قلم» با برابریِ همین کلید است. مقدار کمّی به واحد پایهٔ
 * بُعدش برده می‌شود: «۲ میلی‌متر» = «۰٫۲ سانتی‌متر» = «2mm»، و «۱/۲ اینچ» = «۱۲٫۷ میلی‌متر».
 * جنس با نام استانداردش؛ «ضمنی» بودن در کلید نیست (ورق آهنیِ گفته‌شده و ضمنی یکی‌اند).
 * متنِ کهنه (پیش از یکسان‌سازی) هم همین‌جا خوانده می‌شود، پس دادهٔ قدیم و تازه هم‌سنج‌اند.
 */
export function layerKey(name, x) {
  if (x == null || x === "") return "";
  if (Array.isArray(x)) return x.map((q) => layerKey(name, q)).join("/");
  if (typeof x === "object") return QUANT[name] && x.n ? quantKey(x) : layerKey(name, x.v);
  if (QUANT[name]) { const q = parseQuant(name, x, false); if (q) return layerKey(name, q.list ? q.list : q); }
  if (name === "جنس" || name === "پوشش") { const m = canonMaterial(x); if (m) return keyOf(m); }
  return textKey(x);
}

/** «عین قلم»: همان لایه‌ها با همان مقدارها — نه بیشتر، نه کمتر */
export function layersEqual(a, b) {
  const ea = Object.entries(a || {}).map(([k, v]) => [nameOf(k), layerKey(nameOf(k), v)]).filter(([, v]) => v);
  const eb = Object.entries(b || {}).map(([k, v]) => [nameOf(k), layerKey(nameOf(k), v)]).filter(([, v]) => v);
  if (ea.length !== eb.length) return false;
  const mb = new Map(eb);
  return ea.every(([k, v]) => mb.get(k) === v);
}

/* ------------------------------------------------------------------ */
/* قاعدهٔ جنسِ هر نوع قلم (catalog-head-rules.mjs)                      */
/* ------------------------------------------------------------------ */
/**
 * جنسِ ضمنیِ یک قلمِ بی‌جنس طبق قاعدهٔ نوع قلمش. `rule`: {r, d?, c?: [[«u»|«w»، مقدار، جنس]], f?}
 *   d — پیش‌فرض ثابت؛ c — نشانهٔ واحد یا واژه در عنوان، به ترتیب (نخستین نشانه‌ای که بخورد)؛
 *   f — وقتی هیچ نشانه‌ای نخورد. نشانه با جنسِ خالی («») یعنی «این‌جا عرفی نیست»: قلمِ هیدرولیکیِ
 *   «مغزی 1/2 پرچی» جنسِ ضمنیِ اتصالاتِ لوله‌کشی (گالوانیزه) را نمی‌گیرد و نامعلوم می‌ماند.
 * `units`: واحدهای صریحی که در عنوان یا لایه‌های کمّیِ همان قلم آمده.
 */
export function impliedMaterial(rule, title, units) {
  if (!rule) return null;
  if (rule.d) return rule.d;
  /* واژهٔ چسبیده به عدد یا علامت هم واژه است: «1/4اطلسی»، «"5/8» */
  const t = ` ${keyOf(title).replace(/(\d)(?=[^\d\s./×*x-])/g, "$1 ").replace(/([^\d\s./×*x-])(?=\d)/g, "$1 ").replace(/["”″()]/g, " ")} `;
  for (const [cue, v, m] of rule.c || []) {
    if ((cue === "u" && units.has(v)) || (cue === "w" && t.includes(` ${keyOf(v)} `))) return m || null;
  }
  return rule.f || null;
}

/** واحدهای صریحِ یک قلم: از عنوان و از لایه‌های کمّیِ استاندارد (نه ضمنی‌ها) */
export function unitsOf(title, attrs) {
  const out = unitsInTitle(title);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (!QUANT[k] || !v) continue;
    const q = typeof v === "object" ? v : parseQuant(k, v, false);
    for (const x of Array.isArray(q) ? q : q && q.list ? q.list : [q]) if (x && x.u && !x.i) out.add(x.u);
  }
  return out;
}

/**
 * پوششِ گالوانیزه/گالوالوم جنسِ کالاست، نه روکشی روی همان کالا: ورق گالوانیزه بازار و قیمتِ
 * خودش را دارد. پس به لایهٔ جنس می‌رود (بر «آهنی»ِ صریح هم مقدم) و لایهٔ پوشش برداشته می‌شود —
 * وگرنه «ورق گالوانیزه» یک‌بار با جنس و یک‌بار با پوشش ثبت می‌شد و «عین قلم» یکی‌شان نمی‌دانست.
 */
export function foldCoating(attrs) {
  const a = { ...(attrs || {}) };
  const coat = canonMaterial(layerText(a["پوشش"]));
  if (coat === "گالوانیزه" || coat === "گالوالوم") { a["جنس"] = coat; delete a["پوشش"]; }
  return a;
}

/**
 * جنسِ یک قلم و منبعش: «layer» (لایهٔ جنس، یا پوششِ گالوانیزه — foldCoating)، «title»
 * (از عنوان — فقط نوع قلمِ قاعده‌دار)، «implied» (عرفِ نوع قلم)، یا null. مقدارِ لایه‌ای که نام
 * استاندارد ندارد («تیتانیوم») همان‌طور صریح می‌ماند و جایش را به عرف نمی‌دهد.
 */
export function materialOf({ head, title, attrs }, rule, objects) {
  const a = foldCoating(attrs);
  const lay = a["جنس"];
  if (lay && !(typeof lay === "object" && lay.i)) {
    const raw = layerText(lay);
    if (raw) return { mat: canonMaterial(raw) || nameOf(raw), how: "layer" };
  }
  if (!rule) return { mat: null, how: null };
  const t = materialInTitle(title, head, objects);
  if (t) return { mat: t, how: "title" };
  const im = impliedMaterial(rule, title, unitsOf(title, a));
  return im ? { mat: im, how: "implied" } : { mat: null, how: null };
}

/**
 * نوع قلمِ مؤثر: در نوع قلمی که جنس بازارش را جدا می‌کند (r = "f") جنس جزء نام است —
 * «ورق» + آهنی ← «ورق آهنی». جنسِ ترکیبی («برنجی / پلاستیکی») یا نامی که جنس را از قبل دارد
 * همان می‌ماند.
 */
export function effectiveHead(head, rule, mat) {
  if (!rule || rule.r !== "f" || !mat || /\//.test(mat)) return nameOf(head);
  if (` ${keyOf(head)} `.includes(` ${keyOf(mat)} `)) return nameOf(head);
  return nameOf(`${head} ${mat}`);
}

/**
 * عکسِ effectiveHead: «ورق آهنی» ← {base: «ورق»، mat: «آهنی»، rule}. فقط نامِ استاندارد جنس
 * (همان که effectiveHead می‌افزاید) جدا می‌شود، نه هر املایش: «تیر آهن» نوع قلمِ خودش است، نه
 * «تیر» + آهنی.
 */
const MAT_BY_NAME = new Map(MATERIAL_NAMES.map((m) => [keyOf(m), m]));
export function splitHead(name, rules) {
  const h = nameOf(name);
  if (rules[keyOf(h)]) return { base: h, mat: null, rule: rules[keyOf(h)] };
  const w = h.split(" ");
  for (let i = w.length - 1; i >= 1; i--) {
    const base = w.slice(0, i).join(" "), r = rules[keyOf(base)];
    if (!r || r.r !== "f") continue;
    const m = MAT_BY_NAME.get(keyOf(w.slice(i).join(" ")));
    if (m) return { base, mat: m, rule: r };
  }
  return { base: h, mat: null, rule: null };
}

/** واحدهای استانداردی که در یک عنوان آمده‌اند (فقط شکل‌های امن) — نشانهٔ قاعدهٔ زمینه‌ای */
export function unitsInTitle(title) {
  const t = ` ${keyOf(title).replace(/(\d)([^\d\s])/g, "$1 $2")} `;
  const out = new Set();
  for (const [f, canon] of UNIT_TITLE) {
    if (f.length === 1 && !/["”″]/.test(f)) continue;
    if (t.includes(` ${f} `) || (/["”″]/.test(f) && t.includes(f))) out.add(canon);
  }
  return out;
}
