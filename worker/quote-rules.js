/**
 * قواعد خط استعلام — یک‌جا برای پنل، بات و استخراج.
 *
 * چرا یک فایل جدا: «کدام فیلد اجباری است» پیش از این فقط در روتر بود و بات و
 * استخراج هر کدام برداشت خودشان را داشتند (استخراج هر خطی را ثبت‌شده می‌کرد،
 * فاکتور دستی هم). حالا سه‌تایشان از همین فهرست می‌خوانند.
 *
 * اجباری: واحد، مقدار، قیمت واحد، زمان تحویل، شرایط تسویه، نوع فاکتور، ارزش افزوده.
 * نوع فاکتور پیش‌فرض «رسمی» است — هر پیش‌فاکتوری رسمی فرض می‌شود مگر خودش
 * چیز دیگری بگوید — پس عملاً هیچ‌وقت مانع ثبت نمی‌شود.
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
export const INVOICE_DEFAULT = "رسمی";

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
