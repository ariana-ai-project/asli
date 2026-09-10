/**
 * صف پیام و نام مرحله‌ها — دو چیزی که همه لازمشان دارند
 *
 * چرا فایل جدا: `queueStmt` را هم روتر می‌خواهد، هم بات، هم اعلان‌های مدیر؛ و
 * `STAGE_NAMES` را هر سه به‌علاوهٔ برگه‌ها. تا وقتی این دو در bot.js بودند،
 * manager.js و bot.js همدیگر را ایمپورت می‌کردند و حلقه درست می‌شد — همان
 * چیزی که یک بار سرِ api.js و bot.js اتفاق افتاد و به http.js ختم شد.
 */

/** شش مرحلهٔ کار کارشناس، به همان ترتیبی که در میز کار و بات دیده می‌شوند */
export const STAGE_NAMES = ["مشاهده", "بررسی سوابق", "جستجوی هوشمند", "استعلامات", "پیش‌فاکتور", "جدول کمیسیون"];

/**
 * پیام را برای ارسال در صف می‌گذارد و statement آن را برمی‌گرداند تا در همان
 * batchِ صدازننده اجرا شود (هر کوئری D1 یک subrequest است و پلن رایگان ۵۰ تا دارد).
 *
 * `idem` کلید یکتای رویداد است: اگر همان رویداد دوبار به صف برود — مثلاً چون
 * تلگرام آپدیت را دوباره فرستاد یا Cron همزمان دوبار اجرا شد — فقط یکی می‌ماند.
 */
export function queueStmt(env, idem, chat, text, keyboard) {
  const t = Date.now();
  return env.DB.prepare(
    `INSERT INTO outbox (idem,channel,target,payload_json,status,next_at,created_at)
     VALUES (?,'telegram',?,?,'pending',?,?) ON CONFLICT(idem) DO NOTHING`,
  ).bind(idem, String(chat), JSON.stringify({ text, keyboard: keyboard || null }), t, t);
}
