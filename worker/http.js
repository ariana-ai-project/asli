/**
 * خطای HTTP مشترک.
 *
 * جدا نگه داشته شد چون هم روتر (api.js) و هم منطق بات (bot.js) به آن نیاز
 * دارند؛ اگر در api.js می‌ماند، bot.js مجبور بود از api.js ایمپورت کند و
 * api.js هم از bot.js — یک حلقهٔ ایمپورت که در زمان بارگذاری ماژول‌ها
 * می‌تواند بایندینگ‌های تعریف‌نشده بدهد.
 */
export class HttpError extends Error {
  constructor(m, status = 400, extra) { super(m); this.status = status; this.extra = extra; }
}
