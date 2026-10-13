/**
 * موتورِ راهبرد خرید — برگردانِ جاوااسکریپتِ موتور مرجع procstrat (بستهٔ «درخواست تغییر ۰۲»، نسخهٔ ۲٫۰)
 *
 * پهنا و پخشِ استعلام، قیمت مؤثر، رتبه‌بندی با جریمهٔ وابستگی، برنامه و حرکت‌های مذاکره، آشکارسازها، پرسش‌نامهٔ کارشناس و
 * اعتبارسنجِ پیش از ارسال. فقط استاندارد جاوااسکریپت، بی دسترسی به پایگاه داده — قراردادِ رفتاری‌اش آزمون‌های
 * backend/tamin-poshtibani/tests/strategy-*.test.mjs است (برگردانِ ۷۳ آزمونِ بسته و برابری با سیاست‌های ذخیره‌شده).
 */
export * as config from "./config.js";
export * as rfq from "./rfq.js";
export * as pricing from "./pricing.js";
export * as negotiation from "./negotiation.js";
export * as detectors from "./detectors.js";
export * as questionnaire from "./questionnaire.js";
export * as validator from "./validator.js";
export { engineProfile } from "./profile.js";
export { VERSION } from "./config.js";
