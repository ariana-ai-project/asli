/**
 * تنظیمات مدیر — پیش‌فرض‌ها و خواندن از دیتابیس.
 *
 * جدا از روتر است چون هم مسیرهای HTTP و هم بات به آن نیاز دارند و اگر در
 * api.js می‌ماند، bot.js مجبور بود روتر را ایمپورت کند و برعکس.
 */
export const DEFAULTS = {
  thresholds: [10, 30, 50, 70, 90, 100], dispatchDays: 2, minSuppliers: 1, approvalRequired: false,
  /* ارجاع هوشمند: درصدهای فرمول، و دو سقفِ سختِ بار باز هر کارشناس (assign-rules.mjs) */
  assign: { a: 40, b: 30, c: 30, op1: "+", op2: "−", maxReq: 12, maxItems: 60 },
  deadline: { base: 3, we: 1, wp: 1, wi: 1, op1: "×", op2: "×", op3: "×" },
  capacity: 8, window: "3d",
  /* تیکِ هر مرحله در تب «تنظیم اعلانات»: اعلانِ تغییر وضعیت آن مرحله در تلگرام مدیر می‌رود
     (پیش‌فرض همان سه‌تایی که مدیر می‌خواست: مشاهده، پیش‌فاکتور، جدول کمیسیون) */
  mgrStages: [true, false, false, false, true, true],
  /* گزارش‌ها (reports.js): فهرست پروژه‌ها با شهر، مدیر پروژه و کلیدواژه‌های «طرف مقابل»، و ترتیب
     مدیران پروژه در برگهٔ «نمودار درصد مدیر پروژه ها». null یعنی پیش‌فرضِ ساخته‌شده از فایل نمونهٔ واحد. */
  reportProjects: null,
  reportManagers: null,
};


export async function getSettings(env) {
  return settingsFromRows((await env.DB.prepare("SELECT key,value FROM settings").all()).results || []);
}

/** ردیف‌های جدول settings → شیء تنظیمات با پیش‌فرض‌ها. جدا از getSettings تا میز ارجاع همین
    کوئری را در batch بقیهٔ خواندن‌هایش بفرستد. فقط کلیدهای DEFAULTS به پنل می‌رسند — شناسهٔ
    کانال مدیر و نشانی وبهوک‌ها که در همین جدول‌اند، تنظیمِ نمایشی نیستند. */
export function settingsFromRows(rows) {
  const s = JSON.parse(JSON.stringify(DEFAULTS));
  for (const r of rows || []) {
    if (!(r.key in DEFAULTS)) continue;
    try { s[r.key] = JSON.parse(r.value); } catch (_) { /* مقدار خراب — پیش‌فرض می‌ماند */ }
  }
  return s;
}

/* کد ورود مدیر (مهر ۱۴۰۵): در دیتابیس (کلید managerCode) و فقط از پنل پشتیبانی عوض می‌شود؛ تا وقتی در دیتابیس
   نیست، همان env.MANAGER_CODE. این کلید در DEFAULTS نیست، پس هیچ‌وقت به پنل مدیر نمی‌رسد. */
const KEY_MGR = "managerCode";
export async function managerCode(env) {
  let v = null;
  try { const r = await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(KEY_MGR).first(); v = r ? JSON.parse(r.value) : null; }
  catch (_) { v = null; }
  return String(v || env.MANAGER_CODE || "");
}
export const managerCodeStmt = (env, code) => env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
  .bind(KEY_MGR, JSON.stringify(String(code)), Date.now());
