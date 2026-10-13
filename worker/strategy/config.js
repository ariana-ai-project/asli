/**
 * پیش‌فرض‌های موتورِ راهبرد خرید — برگردانِ procstrat/config.py (بستهٔ «درخواست تغییر ۰۲»، نسخهٔ ۲٫۰، ۲۰ مهر ۱۴۰۵)
 *
 * هر عدد این‌جا «پیشنهادِ پیش‌فرض» است که پنل پشتیبانی یا پاسخِ کارشناس در پرسش‌نامه برای هر نوع قلم عوض می‌کند. مبنای هر
 * بخش در سند الگوریتم‌های بسته آمده (A1 تا A7). هیچ عددی را این‌جا بی‌آنکه آزمون‌های برابری (strategy-*.test.mjs) با
 * موتور مرجع بخوانند عوض نکنید؛ تغییرِ تصمیم‌گرفته‌شده جایش تنظیمات است، نه این فایل.
 */
export const VERSION = "2.0";
export const DATE_JALALI = "1405-07-20";

/* کلاس‌های ساختار بازار (A1) */
export const MS_NAMES = {
  "MS-0": "دادهٔ ناکافی",
  "MS-1": "رقابتی استاندارد",
  "MS-2": "رقابتی متمایز (کیفیت/برند)",
  "MS-3": "کالای پایهٔ قیمت‌مرجع",
  "MS-4": "متمرکز (چندتأمین‌کننده‌ای محدود)",
  "MS-5": "قطعهٔ اصلی/برند وابسته به واردات",
  "MS-6": "خدمات و کار سفارشی",
};

/* پهنای استعلام (A2). ردهٔ هزینه: A = درون ۹۰٪ هزینه، B = هزینهٔ واقعی ≥ ۵ میلیارد ریال یا یک درخواست ≥ ۵ میلیارد، C = بقیه */
export const TIER_B_SPEND_BN = 5.0;
export const RFQ_MODES = ["BROAD", "STANDARD", "SIMULTANEOUS_INDEX", "MULTICHANNEL", "LIMITED_STAGED", "CONSULT_THEN_COMPETE",
  "DIRECT_PLUS_MARKET_TEST", "FRAMEWORK_CALLOFF", "STAGED_BROADENING"];
/* [گیرندهٔ موج اول، سقف کل] برای هر رده */
export const RFQ_N = {
  BROAD: { A: [6, 8], B: [5, 6], C: [3, 4] },
  STANDARD: { A: [5, 6], B: [4, 5], C: [3, 4] },
  SIMULTANEOUS_INDEX: { A: [5, 6], B: [4, 5], C: [3, 4] },
  MULTICHANNEL: { A: [5, 6], B: [4, 5], C: [3, 4] },
  LIMITED_STAGED: { A: [3, 5], B: [3, 4], C: [2, 4] },
  CONSULT_THEN_COMPETE: { A: [5, 6], B: [4, 5], C: [3, 4] },
  DIRECT_PLUS_MARKET_TEST: { A: [3, 4], B: [3, 4], C: [2, 3] },
  FRAMEWORK_CALLOFF: { A: [5, 6], B: [4, 5], C: [3, 4] },
  STAGED_BROADENING: { A: [3, 6], B: [3, 5], C: [3, 4] },
};
export const CONSULT_N = [2, 3];

/* قاعده‌های پخش بر حسب حالت */
export const MAX_PER_HUB = { LIMITED_STAGED: 1, STAGED_BROADENING: 1, DIRECT_PLUS_MARKET_TEST: 1,
  STANDARD: 2, SIMULTANEOUS_INDEX: 2, MULTICHANNEL: 2, CONSULT_THEN_COMPETE: 2, FRAMEWORK_CALLOFF: 2, BROAD: null };
export const MIN_MARKETS = { LIMITED_STAGED: 2, STAGED_BROADENING: 2, DIRECT_PLUS_MARKET_TEST: 2, STANDARD: 2,
  SIMULTANEOUS_INDEX: 2, MULTICHANNEL: 2, CONSULT_THEN_COMPETE: 2, FRAMEWORK_CALLOFF: 2, BROAD: 2 };
/* یال‌هایی که دو سرشان در یک موج نمی‌آیند */
export const BLOCKING_EDGES_STRICT = ["هم‌پاساژ", "تلفن مشترک", "نشانی یکسان", "مدیر هم‌نام"];
export const BLOCKING_EDGES_SAME_BUSINESS = ["تلفن مشترک", "نشانی یکسان", "مدیر هم‌نام"];
export const MAX_INCUMBENTS = { LIMITED_STAGED: 1, STAGED_BROADENING: 1, DIRECT_PLUS_MARKET_TEST: 2, BROAD: 2,
  STANDARD: 2, SIMULTANEOUS_INDEX: 2, MULTICHANNEL: 2, CONSULT_THEN_COMPETE: 2, FRAMEWORK_CALLOFF: 3 };
export const MAX_SENDS_PER_DAY_LIMITED = 2;
export const WAVE2_AFTER_DAYS = { LIMITED_STAGED: 2, STAGED_BROADENING: 2, DIRECT_PLUS_MARKET_TEST: 2 };
export const BROADEN_IF = { min_valid_quotes: 3, min_cv: 0.05, no_identical: true };

/* قیمت مؤثر (A4). تنظیم‌ها از پنل می‌آیند؛ این‌ها فقط جایگزین‌اند */
export const VAT_RATE = 0.10;
export const VAT_CREDITABLE = null;
export const NO_INVOICE_RISK_PREMIUM = 0.02;
export const MONTHLY_RATE_DEFAULT = null;
export const FX_MONTHLY_GROWTH_DEFAULT = null;
export const DISCOUNT_BASIS = "max";

/* وابستگی (A3؛ R08) */
export const DEP_CAP = { structural: 0.70, self_made: 0.60 };
export const DEP_MIN_ACTIVE = 2;
export const DEP_WINDOW_MONTHS = 12;
export const PI_BASE = { structural: 0.05, self_made: 0.02 };
export const PI_ADD = { critical: 0.02, scarce: 0.02, high_impact: 0.01 };
export const PI_MAX = 0.10;

/* برنامهٔ مذاکره (A5) */
export const TARGET_VS_REF = { "MS-0": -0.03, "MS-1": -0.05, "MS-2": -0.03, "MS-3": -0.01, "MS-4": 0.00, "MS-5": -0.03, "MS-6": -0.05 };
export const RV_TOL = { "MS-0": 0.10, "MS-1": 0.03, "MS-2": 0.05, "MS-3": 0.02, "MS-4": 0.10, "MS-5": 0.07, "MS-6": 0.10 };
export const CONCESSION_C = { "MS-0": 0.5, "MS-1": 0.5, "MS-2": 0.6, "MS-3": 0.5, "MS-4": 0.3, "MS-5": 0.5, "MS-6": 0.6 };
export const CONCESSION_C_SCARCE = 0.3;
export const ROUNDS = { "MS-0": 3, "MS-1": 3, "MS-2": 3, "MS-3": 2, "MS-4": 4, "MS-5": 3, "MS-6": 3 };
export const URGENT_RV_EXTRA = 0.05;

/* آشکارسازها (A6) */
export const IDENTICAL_QUOTES_REL = 0.005;
export const ABNORMALLY_LOW_VS_MEDIAN = 0.80;
export const ABNORMALLY_LOW_VS_REF = 0.75;
export const SHORT_VALIDITY_HOURS = 24;
export const PRICE_ABOVE_REF_ALERT = null;
