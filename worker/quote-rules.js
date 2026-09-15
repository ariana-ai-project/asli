/**
 * قواعد خط استعلام — یک‌جا برای پنل، بات و استخراج.
 *
 * چرا یک فایل جدا: «کدام فیلد اجباری است» پیش از این فقط در روتر بود و بات و
 * استخراج هر کدام برداشت خودشان را داشتند (استخراج هر خطی را ثبت‌شده می‌کرد،
 * فاکتور دستی هم). حالا سه‌تایشان از همین فهرست می‌خوانند.
 *
 * اجباری: واحد، مقدار، قیمت واحد، زمان تحویل، شرایط تسویه، نوع فاکتور، ارزش افزوده.
 * نوع فاکتور خطِ دستی پیش‌فرض «غیر رسمی» است. خطی که از خواندن پیش‌فاکتور پر می‌شود
 * «رسمی» است مگر خودِ سند صریح «غیر رسمی» گفته باشد (تصمیم مدیر: فاکتور رسمی است مگر
 * خلافش ثابت شود) — و نوعی که کارشناس خودش انتخاب کرده (quotes.invoice_src) دست نمی‌خورد.
 * اختیاری: مشخصات فنی، اعتبار، روش حمل، محل معامله، محل تحویل، کد تأمین‌کننده.
 * خالی بودنشان نه مانع ثبت موقت است نه مانع جدول کمیسیون.
 */
const T = (v) => String(v == null ? "" : v).trim();

export const REQUIRED = ["unit", "qty", "price", "dtime", "pay", "invoice", "vat"];
export const OPTIONAL = ["spec", "valid_days", "ship", "deal", "place", "supplier_code"];

/** فیلدهایی که شرایطِ فاکتورند و برای همهٔ خط‌های یک تأمین‌کننده یکی‌اند */
export const PER_SUPPLIER = ["dtime", "pay", "invoice", "vat", "valid_days", "ship", "deal", "place", "place_other", "supplier_code"];
/** فیلدهایی که مال هر قلم‌اند */
export const PER_LINE = ["price", "qty", "unit", "spec"];

export const LABELS = {
  supplier_name: "تأمین‌کننده", supplier_code: "کد تأمین‌کننده", spec: "جنس / مشخصات فنی", unit: "واحد", qty: "مقدار",
  price: "قیمت واحد (ریال)", dtime: "زمان تحویل", valid_days: "اعتبار پیش‌فاکتور (روز)", ship: "روش حمل",
  invoice: "نوع فاکتور", pay: "شرایط تسویه", vat: "ارزش افزوده", deal: "محل معامله", place: "محل تحویل", place_other: "محل تحویل (سایر)",
};

/** فیلدهای فهرستی — همان گزینه‌های پنل */
export const ENUMS = {
  invoice: ["رسمی", "غیر رسمی"],
  vat: ["دارد", "ندارد"],
  pay: ["نقدی", "اعتباری", "۵۰٪ پیش‌پرداخت", "سایر"],
  deal: ["کارگاه", "دفتر مرکزی"],
  place: ["محل پروژه", "انبار شرکت", "سایر"],
};
export const INVOICE_DEFAULT = "غیر رسمی";
/* نوع فاکتور خط‌هایی که از خواندنِ پیش‌فاکتور پر می‌شوند، مگر خودِ سند صریح «غیر رسمی» گفته باشد */
export const INVOICE_AI = "رسمی";

/**
 * نرخ ارزش افزوده — همان چیزی که فرم کمیسیون حساب می‌کند.
 *
 * قیمتِ هر ردیف همیشه **بدون** ارزش افزوده است و ارزش افزوده جداگانه ته جدول
 * می‌آید. اگر پیش‌فاکتوری آن را داخل قیمت قلم آورده باشد، هنگام ثبت از قیمت
 * بیرون کشیده می‌شود (netOf) تا جدول کمیسیون دوبار حسابش نکند.
 */
export const VAT_RATE = 0.1;

/** قیمتِ بدون ارزش افزوده، از قیمتی که ارزش افزوده در آن هست */
export const netOf = (price, rate = VAT_RATE) =>
  price == null ? null : Math.round(Number(price) / (1 + rate));

/** فیلدهای اجباریِ خالی، به ترتیبِ فهرست. «سایر» بدون متن هم خالی حساب می‌شود. */
export function missingRequired(q) {
  const miss = REQUIRED.filter((f) => !T(q[f]));
  if (T(q.place) === "سایر" && !T(q.place_other)) miss.push("place_other");
  return miss;
}

export function emptyOptional(q) {
  return OPTIONAL.filter((f) => !T(q[f]));
}

/** آیا این خط می‌تواند «ثبت موقت» شود؟ */
export const canSave = (q) => missingRequired(q).length === 0;

/* ------------------------------------------------------------------ */
/* قالب فیلدها (تصمیم مدیر): اشتباه = خطا، نه ثبتِ بی‌صدا                */
/* ------------------------------------------------------------------ */
const DIG = (s) => String(s == null ? "" : s).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
/* ممیز فارسی «٫» هم ممیز است؛ جداکنندهٔ هزارگان (ویرگول لاتین و «٬») دور ریخته می‌شود */
const NUMBER = (s) => DIG(s).replace(/[,٬]/g, "").replace(/٫/g, ".").trim();
const isNumber = (s) => /^\d+(\.\d+)?$/.test(NUMBER(s));
/** عددِ فیلد (قیمت/مقدار) با هر دستگاه رقم و ممیز؛ نامعتبر → null */
export const toNumber = (s) => { const x = NUMBER(s); return x && /^\d+(\.\d+)?$/.test(x) ? Number(x) : null; };
const isInt = (s) => /^\d+$/.test(NUMBER(s));
const jalali = (s) => { const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(DIG(s).trim()); return !!m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31; };
/* «۱۰»، «10 روز»، «۷ روز کاری»، «2 هفته» — عددِ مدت با یک واحدِ اختیاری */
const DAYS_RE = /^(\d+)\s*(روز کاری|روز|هفته|ماه)?$/;
const isDuration = (s) => DAYS_RE.test(NUMBER(s).replace(/\s+/g, " "));

/** زمان تحویل: تاریخ شمسی (سال/ماه/روز) یا مدت به عدد (با واحد اختیاری) */
export const validDtime = (s) => { const x = T(s); return !x || jalali(x) || isDuration(x); };
/** همان مقدار، با رقم لاتین و فاصلهٔ یکدست — تا جدول کمیسیون و مرتب‌سازی یکجور ببینند */
export const normalizeDtime = (s) => { const x = T(s); if (!x) return null; return jalali(x) ? DIG(x).trim() : NUMBER(x).replace(/\s+/g, " "); };

/**
 * فیلدهای داده‌شده را می‌سنجد؛ فقط فیلدهایی که در `q` هستند و خالی نیستند.
 * خروجی: [{field, message}] — خالی یعنی همه درست.
 */
export function validateQuote(q) {
  const out = [];
  const has = (f) => f in q && T(q[f]) !== "";
  if (has("price") && !isNumber(q.price)) out.push({ field: "price", message: "قیمت واحد باید عدد باشد (اعشار مجاز است)." });
  if (has("qty") && !isNumber(q.qty)) out.push({ field: "qty", message: "مقدار باید عدد باشد." });
  if (has("valid_days") && !isInt(q.valid_days)) out.push({ field: "valid_days", message: "اعتبار پیش‌فاکتور باید عدد (روز) باشد." });
  if (has("dtime") && !validDtime(q.dtime)) out.push({ field: "dtime", message: "زمان تحویل باید تاریخ شمسی (۱۴۰۵/۰۷/۱۰) یا عدد روز (مثلاً ۱۰ یا ۱۰ روز کاری) باشد." });
  for (const f of ["invoice", "vat", "pay", "deal", "place"]) if (has(f) && !ENUMS[f].includes(T(q[f]))) out.push({ field: f, message: `${LABELS[f]} باید یکی از گزینه‌های فهرست باشد.` });
  return out;
}
