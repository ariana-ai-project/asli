/**
 * تنظیمات مدیر — پیش‌فرض‌ها و خواندن از دیتابیس.
 *
 * جدا از روتر است چون هم مسیرهای HTTP و هم بات به آن نیاز دارند و اگر در
 * api.js می‌ماند، bot.js مجبور بود روتر را ایمپورت کند و برعکس.
 */
export const DEFAULTS = {
  thresholds: [10, 30, 50, 70, 90, 100], dispatchDays: 2, minSuppliers: 1, approvalRequired: false,
  assign: { a: 40, b: 30, c: 30, op1: "+", op2: "−" },
  deadline: { base: 3, we: 1, wp: 1, wi: 1, op1: "×", op2: "×", op3: "×" },
  capacity: 8, window: "3d",
};


export async function getSettings(env) {
  const rows = (await env.DB.prepare("SELECT key,value FROM settings").all()).results || [];
  const s = JSON.parse(JSON.stringify(DEFAULTS));
  for (const r of rows) { try { s[r.key] = JSON.parse(r.value); } catch (_) { /* مقدار خراب — پیش‌فرض می‌ماند */ } }
  return s;
}
